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
func (fakeCommands) Ack(context.Context, string, domain.CommandStatus, string) error { return nil }
func (fakeCommands) ExpirePending(context.Context, time.Duration) (int, error)       { return 0, nil }

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

type channelNotifier struct{ ch chan domain.Alert }

func (c channelNotifier) Send(_ context.Context, a domain.Alert) error { c.ch <- a; return nil }

func newHandlers(alerts *domain.AlertService) *Handlers {
	return &Handlers{
		Devices: fakeDevices{}, Tokens: fakeTokens{}, Policies: fakePolicies{}, Commands: fakeCommands{},
		Events: &fakeEvents{seen: map[string]bool{}}, Alerts: alerts,
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
