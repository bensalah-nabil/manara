package console

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"manara/backend/internal/domain"
)

type fakeQueue struct{}

func (fakeQueue) Enqueue(_ context.Context, _ string, t domain.CommandType, params map[string]any) (*domain.Command, error) {
	return &domain.Command{ID: "c1", Type: t, Params: params, Status: domain.CommandStatusPending, CreatedAt: time.Now()}, nil
}
func (fakeQueue) PendingForDevice(context.Context, string) ([]*domain.Command, error) {
	return nil, nil
}
func (fakeQueue) Ack(context.Context, string, string, domain.CommandStatus, string) (domain.CommandType, error) {
	return "", nil
}
func (fakeQueue) ExpirePending(context.Context, time.Duration) (int, error) { return 0, nil }

type fakeNotifier struct{ err error }

func (f fakeNotifier) Notify(context.Context, string) error { return f.err }

func lockNow(h *Handlers) *httptest.ResponseRecorder {
	r := httptest.NewRequest(http.MethodPost, "/api/v1/console/devices/dev-1/commands", strings.NewReader(`{"type":"lock_now"}`))
	r.SetPathValue("deviceId", "dev-1")
	r.Header.Set("Authorization", "Bearer mine")
	w := httptest.NewRecorder()
	h.CreateCommand(w, r)
	return w
}

func TestLockNowSaysWhetherThePhoneWasWoken(t *testing.T) {
	cases := map[string]struct {
		pushEnabled bool
		token       string
		err         error
		woken       bool
	}{
		"push on and the phone has a token": {true, "tok", nil, true},
		"no push on this server":            {false, "tok", nil, false},
		"phone has no push token yet":       {true, "", nil, false},
		"push failed":                       {true, "tok", errors.New("fcm down"), false},
	}
	for name, c := range cases {
		h := testHandlers(nil)
		h.Devices = fakeDevices{byID: map[string]*domain.Device{"dev-1": {ID: "dev-1", ParentID: "parent-1", PushToken: c.token}}}
		h.Commands = fakeQueue{}
		h.Notifier = fakeNotifier{err: c.err}
		h.PushEnabled = c.pushEnabled
		w := lockNow(h)
		if w.Code != http.StatusAccepted {
			t.Fatalf("%s: status %d %s", name, w.Code, w.Body.String())
		}
		want := `"woken":false`
		if c.woken {
			want = `"woken":true`
		}
		if !strings.Contains(w.Body.String(), want) {
			t.Errorf("%s: %s, want %s", name, w.Body.String(), want)
		}
	}
}
