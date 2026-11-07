package console

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"manara/backend/internal/domain"
)

type countingNotifier struct {
	calls *int
	err   error
}

func (n countingNotifier) Notify(context.Context, string) error {
	*n.calls++
	return n.err
}

func savePolicy(h *Handlers) *httptest.ResponseRecorder {
	r := httptest.NewRequest(http.MethodPut, "/api/v1/console/devices/dev-1/policy", strings.NewReader(`{"version":0}`))
	r.SetPathValue("deviceId", "dev-1")
	r.Header.Set("Authorization", "Bearer mine")
	w := httptest.NewRecorder()
	h.SetPolicy(w, r)
	return w
}

func TestSavingRulesWakesThePhone(t *testing.T) {
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
		calls := 0
		h := testHandlers(nil)
		h.Devices = fakeDevices{byID: map[string]*domain.Device{"dev-1": {ID: "dev-1", ParentID: "parent-1", PushToken: c.token}}}
		h.Notifier = countingNotifier{calls: &calls, err: c.err}
		h.PushEnabled = c.pushEnabled
		w := savePolicy(h)
		if w.Code != http.StatusOK {
			t.Fatalf("%s: status %d %s", name, w.Code, w.Body.String())
		}
		if calls != 1 {
			t.Errorf("%s: %d pushes, want 1", name, calls)
		}
		want := `"woken":false`
		if c.woken {
			want = `"woken":true`
		}
		if body := w.Body.String(); !strings.Contains(body, want) || !strings.Contains(body, `"version"`) {
			t.Errorf("%s: %s, want the policy and %s", name, body, want)
		}
	}
}

func TestSavingAnotherParentsRulesSendsNoPush(t *testing.T) {
	calls := 0
	h := testHandlers(nil)
	h.Notifier = countingNotifier{calls: &calls}
	r := httptest.NewRequest(http.MethodPut, "/api/v1/console/devices/dev-1/policy", strings.NewReader(`{}`))
	r.SetPathValue("deviceId", "dev-1")
	r.Header.Set("Authorization", "Bearer theirs")
	w := httptest.NewRecorder()
	h.SetPolicy(w, r)
	if w.Code != http.StatusNotFound || calls != 0 {
		t.Fatalf("status %d, %d pushes; want 404 and none", w.Code, calls)
	}
}
