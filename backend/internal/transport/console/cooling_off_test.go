package console

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"manara/backend/internal/domain"
)

type memPending struct {
	byKind   map[string]domain.PendingChange
	released bool
}

func (m *memPending) Put(_ context.Context, c domain.PendingChange) error {
	m.byKind[c.Kind] = c
	return nil
}
func (m *memPending) Waiting(context.Context, string) ([]domain.PendingChange, error) {
	out := []domain.PendingChange{}
	for _, c := range m.byKind {
		out = append(out, c)
	}
	return out, nil
}
func (m *memPending) Cancel(_ context.Context, _ string, kind string) (bool, error) {
	_, ok := m.byKind[kind]
	delete(m.byKind, kind)
	return ok, nil
}
func (m *memPending) ClaimDue(context.Context, time.Time) ([]domain.PendingChange, error) {
	return nil, nil
}
func (m *memPending) ReleaseApplied(context.Context, string, time.Time) (bool, error) {
	return m.released, nil
}
func (m *memPending) PurgeAppliedBefore(context.Context, time.Time) (int, error) { return 0, nil }

// storingPolicies keeps what was set, so a test can tell a stored change from a queued one.
type storingPolicies struct{ current *domain.Policy }

func (s *storingPolicies) Get(context.Context, string) (*domain.Policy, error) { return s.current, nil }
func (s *storingPolicies) Set(_ context.Context, _ string, p domain.Policy) (domain.Policy, error) {
	p.Version = s.current.Version + 1
	s.current = &p
	return p, nil
}

func delayedHandlers(hours int) (*Handlers, *storingPolicies, *memPending) {
	h := testHandlers(nil)
	policies := &storingPolicies{current: &domain.Policy{
		Version:     3,
		SiteFilter:  domain.SiteFilter{Enabled: true, DNSHost: "family.adguard-dns.com"},
		ChangeDelay: &domain.ChangeDelay{Hours: hours},
	}}
	pending := &memPending{byKind: map[string]domain.PendingChange{}}
	h.Policies, h.Pending, h.Commands = policies, pending, fakeQueue{}
	return h, policies, pending
}

func putPolicy(h *Handlers, body string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(http.MethodPut, "/x", strings.NewReader(body))
	r.SetPathValue("deviceId", "dev-1")
	r.Header.Set("Authorization", "Bearer mine")
	w := httptest.NewRecorder()
	h.SetPolicy(w, r)
	return w
}

func onDevice(handler http.HandlerFunc, method, path, body string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(method, "/x", strings.NewReader(body))
	r.SetPathValue("deviceId", "dev-1")
	if path != "" {
		r.SetPathValue("kind", path)
	}
	r.Header.Set("Authorization", "Bearer mine")
	w := httptest.NewRecorder()
	handler(w, r)
	return w
}

func TestALooseningWaitsAndThePhoneKeepsItsRules(t *testing.T) {
	h, policies, pending := delayedHandlers(24)
	w := putPolicy(h, `{"siteFilter":{"enabled":false},"changeDelay":{"hours":24}}`)
	if w.Code != http.StatusAccepted {
		t.Fatalf("status %d body %s", w.Code, w.Body)
	}
	if !policies.current.SiteFilter.Enabled || policies.current.Version != 3 {
		t.Fatalf("the phone's policy changed: %+v", policies.current)
	}
	var got struct {
		SiteFilter domain.SiteFilter `json:"siteFilter"`
		Pending    pendingDTO        `json:"pending"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if !got.SiteFilter.Enabled || got.Pending.Kind != "policy" || got.Pending.Loosens[0] != domain.LoosensSiteFilter {
		t.Fatalf("answer %+v", got)
	}
	if wait := got.Pending.ApplyAt.Sub(got.Pending.RequestedAt); wait != 24*time.Hour {
		t.Fatalf("waits %v", wait)
	}
	if c, ok := pending.byKind[domain.PendingPolicy]; !ok || c.Policy == nil || c.Policy.SiteFilter.Enabled {
		t.Fatalf("waiting change %+v", pending.byKind)
	}
}

func TestTighteningAppliesAtOnceAndDropsTheWaitingChange(t *testing.T) {
	h, policies, pending := delayedHandlers(24)
	putPolicy(h, `{"siteFilter":{"enabled":false},"changeDelay":{"hours":24}}`)
	w := putPolicy(h, `{"siteFilter":{"enabled":true,"dnsHost":"family.adguard-dns.com"},"changeDelay":{"hours":48}}`)
	if w.Code != http.StatusOK || policies.current.Delay() != 48*time.Hour || !strings.Contains(w.Body.String(), `"cancelledPending":true`) {
		t.Fatalf("status %d body %s", w.Code, w.Body)
	}
	if len(pending.byKind) != 0 {
		t.Fatalf("the old waiting change would undo this one: %+v", pending.byKind)
	}
}

func TestShorteningTheWaitWaitsTheCurrentWait(t *testing.T) {
	h, policies, pending := delayedHandlers(48)
	w := putPolicy(h, `{"siteFilter":{"enabled":true,"dnsHost":"family.adguard-dns.com"}}`)
	if w.Code != http.StatusAccepted || policies.current.Delay() != 48*time.Hour {
		t.Fatalf("status %d, delay now %v", w.Code, policies.current.Delay())
	}
	c := pending.byKind[domain.PendingPolicy]
	if c.ApplyAt.Sub(c.RequestedAt) != 48*time.Hour || c.Loosens[0] != domain.LoosensDelay {
		t.Fatalf("waiting change %+v", c)
	}
}

func TestWithoutADelayEverythingAppliesAtOnce(t *testing.T) {
	h, policies, _ := delayedHandlers(0)
	w := putPolicy(h, `{"siteFilter":{"enabled":false}}`)
	if w.Code != http.StatusOK || policies.current.SiteFilter.Enabled {
		t.Fatalf("status %d body %s", w.Code, w.Body)
	}
}

func TestAnUnofferedDelayIsRefused(t *testing.T) {
	h, _, _ := delayedHandlers(0)
	if w := putPolicy(h, `{"changeDelay":{"hours":5}}`); w.Code != http.StatusBadRequest || !strings.Contains(w.Body.String(), "invalid_change_delay") {
		t.Fatalf("status %d body %s", w.Code, w.Body)
	}
}

func TestAReleaseWaitsAndItsCodeStaysHidden(t *testing.T) {
	h, _, pending := delayedHandlers(24)
	w := onDevice(h.CreateCommand, http.MethodPost, "", `{"type":"release","params":{"mode":"remove"}}`)
	if w.Code != http.StatusAccepted || !strings.Contains(w.Body.String(), `"pending"`) || strings.Contains(w.Body.String(), "commandId") {
		t.Fatalf("status %d body %s", w.Code, w.Body)
	}
	if c := pending.byKind[domain.PendingRelease]; c.ReleaseParams["mode"] != "remove" {
		t.Fatalf("waiting release %+v", c)
	}
	if w := onDevice(h.GetReleaseCode, http.MethodGet, "", ""); w.Code != http.StatusConflict || !strings.Contains(w.Body.String(), "release_waits") {
		t.Fatalf("code before the wait: %d %s", w.Code, w.Body)
	}
	// Once the release has waited its time, the offline code is there for a phone that is off.
	pending.released = true
	h.Releases = fakeReleaseSecrets{}
	if w := onDevice(h.GetReleaseCode, http.MethodGet, "", ""); w.Code != http.StatusOK {
		t.Fatalf("code after the wait: %d %s", w.Code, w.Body)
	}
}

func TestLockNowNeverWaits(t *testing.T) {
	h, _, pending := delayedHandlers(24)
	w := onDevice(h.CreateCommand, http.MethodPost, "", `{"type":"lock_now"}`)
	if w.Code != http.StatusAccepted || !strings.Contains(w.Body.String(), "commandId") || len(pending.byKind) != 0 {
		t.Fatalf("status %d body %s", w.Code, w.Body)
	}
}

func TestAWaitingChangeIsListedAndCancelled(t *testing.T) {
	h, _, _ := delayedHandlers(24)
	putPolicy(h, `{"siteFilter":{"enabled":false},"changeDelay":{"hours":24}}`)
	if w := onDevice(h.ListPending, http.MethodGet, "", ""); w.Code != http.StatusOK || !strings.Contains(w.Body.String(), domain.LoosensSiteFilter) {
		t.Fatalf("list: %d %s", w.Code, w.Body)
	}
	if w := onDevice(h.CancelPending, http.MethodDelete, "policy", ""); w.Code != http.StatusNoContent {
		t.Fatalf("cancel: %d %s", w.Code, w.Body)
	}
	if w := onDevice(h.CancelPending, http.MethodDelete, "policy", ""); w.Code != http.StatusNotFound {
		t.Fatalf("cancel again: %d", w.Code)
	}
	if w := onDevice(h.CancelPending, http.MethodDelete, "other", ""); w.Code != http.StatusBadRequest {
		t.Fatalf("unknown kind: %d", w.Code)
	}
}

type fakeReleaseSecrets struct{}

func (fakeReleaseSecrets) Secret(context.Context, string) ([]byte, bool, error) {
	return []byte("0123456789abcdef0123456789abcdef"), true, nil
}
func (fakeReleaseSecrets) Confirm(context.Context, string) error { return nil }
func (fakeReleaseSecrets) Delete(context.Context, string) error  { return nil }
