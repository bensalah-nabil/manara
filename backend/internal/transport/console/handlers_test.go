package console

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"manara/backend/internal/domain"
)

type fakeSessions struct{ tokens map[string]string }

func (f fakeSessions) Issue(context.Context, string) (string, error) { return "", nil }
func (f fakeSessions) Resolve(_ context.Context, token string) (string, bool, error) {
	id, ok := f.tokens[token]
	return id, ok, nil
}

type fakeDevices struct{ byID map[string]*domain.Device }

func (f fakeDevices) Create(context.Context, *domain.Device) error { return nil }
func (f fakeDevices) FindByID(_ context.Context, id string) (*domain.Device, error) {
	return f.byID[id], nil
}
func (f fakeDevices) ListByParent(context.Context, string) ([]*domain.Device, error) { return nil, nil }
func (f fakeDevices) UpdateLastSeen(context.Context, string, time.Time) error        { return nil }
func (f fakeDevices) UpdatePushToken(context.Context, string, string) error          { return nil }

type fakePolicies struct{ byDevice map[string]*domain.Policy }

func (f fakePolicies) Get(_ context.Context, id string) (*domain.Policy, error) {
	return f.byDevice[id], nil
}
func (f fakePolicies) Set(context.Context, string, domain.Policy) (domain.Policy, error) {
	return domain.Policy{}, nil
}

func newGetPolicyRequest(deviceID, token string) *http.Request {
	r := httptest.NewRequest(http.MethodGet, "/api/v1/console/devices/"+deviceID+"/policy", nil)
	r.SetPathValue("deviceId", deviceID)
	if token != "" {
		r.Header.Set("Authorization", "Bearer "+token)
	}
	return r
}

func testHandlers(policies map[string]*domain.Policy) *Handlers {
	return &Handlers{
		Sessions: fakeSessions{tokens: map[string]string{"mine": "parent-1", "theirs": "parent-2"}},
		Devices:  fakeDevices{byID: map[string]*domain.Device{"dev-1": {ID: "dev-1", ParentID: "parent-1"}}},
		Policies: fakePolicies{byDevice: policies},
	}
}

func TestGetPolicyRequiresASession(t *testing.T) {
	w := httptest.NewRecorder()
	testHandlers(nil).GetPolicy(w, newGetPolicyRequest("dev-1", ""))
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", w.Code)
	}
}

func TestGetPolicyDoesNotLeakAnotherParentsDevice(t *testing.T) {
	stored := &domain.Policy{Version: 7, Location: domain.LocationPolicy{Enabled: true, IntervalMinutes: 5}}
	w := httptest.NewRecorder()
	testHandlers(map[string]*domain.Policy{"dev-1": stored}).GetPolicy(w, newGetPolicyRequest("dev-1", "theirs"))
	if w.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", w.Code)
	}
	if containsKey(w.Body.String(), "location") {
		t.Fatalf("response must not contain the policy: %s", w.Body.String())
	}
}

func TestGetPolicyReturnsEveryStoredSection(t *testing.T) {
	stored := &domain.Policy{
		Version:      7,
		TimeLimits:   domain.TimeLimits{Enabled: true, Rules: []domain.TimeLimitRule{{Category: "social", Packages: []string{"a.b"}, DailyMinutes: 30}}},
		SiteFilter:   domain.SiteFilter{Enabled: true, DNSHost: "dns.example"},
		Location:     domain.LocationPolicy{Enabled: true, IntervalMinutes: 5},
		LockSchedule: &domain.LockSchedule{Enabled: true, Windows: []domain.LockWindow{{Days: []int{1, 7}, FromHour: 22, ToHour: 7}}},
		Restrictions: &domain.Restrictions{BlockSafeBoot: true},
	}
	w := httptest.NewRecorder()
	testHandlers(map[string]*domain.Policy{"dev-1": stored}).GetPolicy(w, newGetPolicyRequest("dev-1", "mine"))
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", w.Code)
	}
	var got domain.Policy
	if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	want, _ := json.Marshal(stored)
	have, _ := json.Marshal(got)
	if string(want) != string(have) {
		t.Fatalf("round trip lost data:\n got %s\nwant %s", have, want)
	}
}

func TestGetPolicyFallsBackToAnInertPolicy(t *testing.T) {
	w := httptest.NewRecorder()
	testHandlers(nil).GetPolicy(w, newGetPolicyRequest("dev-1", "mine"))
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", w.Code)
	}
	var got domain.Policy
	if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if got.Version != 0 || got.TimeLimits.Enabled || got.Location.Enabled || got.SiteFilter.Enabled {
		t.Fatalf("fallback must be inert at version 0, got %+v", got)
	}
}

func containsKey(body, key string) bool {
	var m map[string]any
	if json.Unmarshal([]byte(body), &m) != nil {
		return false
	}
	_, ok := m[key]
	return ok
}
