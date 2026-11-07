package agent

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"manara/backend/internal/domain"
)

type fakeTokens struct{}

func (fakeTokens) Issue(context.Context, string) (string, error) { return "", nil }
func (fakeTokens) Resolve(_ context.Context, token string) (string, bool, error) {
	return "dev-1", token == "good", nil
}

type fakeDevices struct{}

func (fakeDevices) Create(context.Context, *domain.Device) error { return nil }
func (fakeDevices) FindByID(context.Context, string) (*domain.Device, error) {
	return &domain.Device{ID: "dev-1", ParentID: "parent-1", Label: "Sam"}, nil
}
func (fakeDevices) ListByParent(context.Context, string) ([]*domain.Device, error) { return nil, nil }
func (fakeDevices) UpdateLastSeen(context.Context, string, time.Time) error        { return nil }
func (fakeDevices) UpdatePushToken(context.Context, string, string) error          { return nil }

type fakePolicies struct{}

func (fakePolicies) Get(context.Context, string) (*domain.Policy, error) { return nil, nil }
func (fakePolicies) Set(context.Context, string, domain.Policy) (domain.Policy, error) {
	return domain.Policy{}, nil
}

type fakeCommands struct{}

func (fakeCommands) Enqueue(context.Context, string, domain.CommandType, map[string]any) (*domain.Command, error) {
	return nil, nil
}
func (fakeCommands) PendingForDevice(context.Context, string) ([]*domain.Command, error) {
	return nil, nil
}

// fakeCommands knows one command per id; Ack only matches the acking device's own.
type commandOf struct {
	device string
	kind   domain.CommandType
}

var knownCommands = map[string]commandOf{
	"cmd-release": {"dev-1", domain.CommandTypeRelease},
	"cmd-lock":    {"dev-1", domain.CommandTypeLockNow},
	"cmd-other":   {"dev-2", domain.CommandTypeRelease},
}

func (fakeCommands) Ack(_ context.Context, deviceID, commandID string, _ domain.CommandStatus, _ string) (domain.CommandType, error) {
	c, ok := knownCommands[commandID]
	if !ok || c.device != deviceID {
		return "", nil
	}
	return c.kind, nil
}
func (fakeCommands) ExpirePending(context.Context, time.Duration) (int, error) { return 0, nil }

type fakeReleases struct {
	mu        sync.Mutex
	confirmed bool
	deleted   []string
}

func (f *fakeReleases) Secret(context.Context, string) ([]byte, bool, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	return []byte("0123456789abcdef0123456789abcdef"), f.confirmed, nil
}
func (f *fakeReleases) Confirm(context.Context, string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.confirmed = true
	return nil
}
func (f *fakeReleases) Delete(_ context.Context, id string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.deleted = append(f.deleted, id)
	return nil
}

// fakeEvents is idempotent on id like the real store.
type fakeEvents struct {
	mu   sync.Mutex
	seen map[string]bool
}

func (f *fakeEvents) Insert(_ context.Context, events []*domain.Event) (domain.InsertResult, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	var res domain.InsertResult
	for _, e := range events {
		res.Accepted = append(res.Accepted, e.ID)
		if !f.seen[e.ID] {
			f.seen[e.ID] = true
			res.Stored = append(res.Stored, e)
		}
	}
	return res, nil
}
func (f *fakeEvents) ListByDevice(context.Context, string, *domain.EventKind, *time.Time) ([]*domain.Event, error) {
	return nil, nil
}
func (f *fakeEvents) PurgeOlderThan(context.Context, domain.EventKind, time.Time) (int, error) {
	return 0, nil
}

type channelNotifier struct{ ch chan domain.Alert }

func (c channelNotifier) Send(_ context.Context, a domain.Alert) error { c.ch <- a; return nil }

func newHandlers(alerts *domain.AlertService) *Handlers {
	return &Handlers{
		Devices: fakeDevices{}, Tokens: fakeTokens{}, Policies: fakePolicies{}, Commands: fakeCommands{},
		Events: &fakeEvents{seen: map[string]bool{}}, Alerts: alerts, Releases: &fakeReleases{},
	}
}

func postSync(t *testing.T, h *Handlers, body map[string]any) syncResponse {
	t.Helper()
	raw, _ := json.Marshal(body)
	r := httptest.NewRequest(http.MethodPost, "/api/v1/agent/sync", bytes.NewReader(raw))
	r.Header.Set("Authorization", "Bearer good")
	w := httptest.NewRecorder()
	h.Sync(w, r)
	if w.Code != http.StatusOK {
		t.Fatalf("sync status = %d: %s", w.Code, w.Body.String())
	}
	var resp syncResponse
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatal(err)
	}
	return resp
}

func ack(id, status string) map[string]any {
	return map[string]any{"policyVersion": 0, "events": []any{}, "hasReleaseSecret": true,
		"commandAcks": []any{map[string]any{"commandId": id, "status": status}}}
}

func TestSyncGivesTheReleaseSecretUntilThePhoneHasIt(t *testing.T) {
	h := newHandlers(nil)
	releases := h.Releases.(*fakeReleases)
	resp := postSync(t, h, map[string]any{"policyVersion": 0, "events": []any{}})
	if resp.ReleaseSecret == "" {
		t.Fatal("phone without the secret did not receive it")
	}
	resp = postSync(t, h, map[string]any{"policyVersion": 0, "events": []any{}, "hasReleaseSecret": true})
	if resp.ReleaseSecret != "" || !releases.confirmed {
		t.Fatalf("secret resent (%q) or not confirmed (%v)", resp.ReleaseSecret, releases.confirmed)
	}
}

func TestAckedReleaseDeletesTheDevice(t *testing.T) {
	h := newHandlers(nil)
	resp := postSync(t, h, ack("cmd-release", "acked"))
	if !resp.Released {
		t.Fatal("release ack not confirmed to the phone")
	}
	if got := h.Releases.(*fakeReleases).deleted; len(got) != 1 || got[0] != "dev-1" {
		t.Fatalf("deleted = %v", got)
	}
}

func TestOnlyAnAckedReleaseOfThisPhoneDeletesIt(t *testing.T) {
	for _, c := range []struct{ id, status string }{
		{"cmd-release", "failed"}, // the phone could not let go
		{"cmd-lock", "acked"},     // another command type
		{"cmd-other", "acked"},    // another phone's release
		{"cmd-unknown", "acked"},
	} {
		h := newHandlers(nil)
		resp := postSync(t, h, ack(c.id, c.status))
		if resp.Released || len(h.Releases.(*fakeReleases).deleted) != 0 {
			t.Errorf("%s %s released the phone", c.id, c.status)
		}
	}
}

func syncWith(t *testing.T, h *Handlers, events ...map[string]any) syncResponse {
	t.Helper()
	body, _ := json.Marshal(map[string]any{"policyVersion": 0, "events": events})
	r := httptest.NewRequest(http.MethodPost, "/api/v1/agent/sync", bytes.NewReader(body))
	r.Header.Set("Authorization", "Bearer good")
	w := httptest.NewRecorder()
	h.Sync(w, r)
	if w.Code != http.StatusOK {
		t.Fatalf("sync status = %d: %s", w.Code, w.Body.String())
	}
	var resp syncResponse
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatal(err)
	}
	return resp
}

func problem(id, detail string) map[string]any {
	return map[string]any{
		"id": id, "kind": "enforcement", "occurredAt": "2026-11-05T14:30:00Z",
		"payload": map[string]any{"enforcer": "restrictions", "status": "missing", "detail": detail},
	}
}

func TestSyncAlertsOnNewProblemsButNotOnAResentBacklog(t *testing.T) {
	ch := make(chan domain.Alert, 8)
	clock := time.Date(2026, 11, 5, 15, 0, 0, 0, time.UTC)
	var mu sync.Mutex
	svc := &domain.AlertService{
		Devices: fakeDevices{}, Notifier: channelNotifier{ch},
		// A window shorter than the clock step, so only the stored-vs-resent
		// distinction (not the throttle) can stop a repeat.
		Throttle: domain.NewAlertThrottle(time.Minute),
		Now: func() time.Time {
			mu.Lock()
			defer mu.Unlock()
			clock = clock.Add(time.Hour)
			return clock
		},
	}
	h := newHandlers(svc)

	resp := syncWith(t, h, problem("e1", "disallow_safe_boot"))
	if len(resp.AcceptedEventIDs) != 1 {
		t.Fatalf("accepted = %v", resp.AcceptedEventIDs)
	}
	select {
	case a := <-ch:
		if a.ParentID != "parent-1" || a.Title != "Sam: Settings restrictions needs attention" {
			t.Fatalf("alert = %+v", a)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("no alert for a new problem report")
	}

	// The response was lost, so the phone re-sends the same event.
	resp = syncWith(t, h, problem("e1", "disallow_safe_boot"))
	if len(resp.AcceptedEventIDs) != 1 {
		t.Fatalf("a re-sent event must still be accepted so the phone can drop it, got %v", resp.AcceptedEventIDs)
	}
	// A different new problem proves the pipeline is alive; then count.
	syncWith(t, h, problem("e2", "disallow_add_user"))
	select {
	case <-ch:
	case <-time.After(2 * time.Second):
		t.Fatal("no alert for a second, different problem")
	}
	time.Sleep(100 * time.Millisecond)
	if n := len(ch); n != 0 {
		t.Fatalf("%d extra alert(s): the re-sent backlog alerted again", n)
	}
}

func TestSyncWithoutAnAlertServiceStillWorks(t *testing.T) {
	resp := syncWith(t, newHandlers(nil), problem("e1", "disallow_safe_boot"))
	if len(resp.AcceptedEventIDs) != 1 {
		t.Fatalf("accepted = %v", resp.AcceptedEventIDs)
	}
}
