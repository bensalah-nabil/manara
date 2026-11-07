package console

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"manara/backend/internal/domain"
)

type fakeSetup struct {
	byDevice map[string]*domain.DeviceSetup
	cleared  []string
	codes    []string
	finished []string
	inputErr error
}

func (f *fakeSetup) Report(context.Context, string, domain.SetupReport) (*domain.DeviceSetup, error) {
	return nil, nil
}
func (f *fakeSetup) Get(_ context.Context, id string) (*domain.DeviceSetup, error) {
	return f.byDevice[id], nil
}
func (f *fakeSetup) ClearAccounts(_ context.Context, id string) error {
	f.cleared = append(f.cleared, id)
	return nil
}
func (f *fakeSetup) ClearAccountsOlderThan(context.Context, time.Time) (int, error) { return 0, nil }
func (f *fakeSetup) Input(context.Context, string) (domain.SetupInput, error) {
	return domain.SetupInput{}, nil
}
func (f *fakeSetup) SendPairingCode(_ context.Context, id, code string) error {
	if f.inputErr != nil {
		return f.inputErr
	}
	f.codes = append(f.codes, id+":"+code)
	return nil
}
func (f *fakeSetup) RequestFinish(_ context.Context, id string) error {
	if f.inputErr != nil {
		return f.inputErr
	}
	f.finished = append(f.finished, id)
	return nil
}

func setupRequest(method, deviceID, token string) *http.Request {
	path := "/api/v1/console/devices/" + deviceID + "/setup"
	if method == http.MethodDelete {
		path += "/accounts"
	}
	r := httptest.NewRequest(method, path, nil)
	r.SetPathValue("deviceId", deviceID)
	if token != "" {
		r.Header.Set("Authorization", "Bearer "+token)
	}
	return r
}

func TestGetSetupShowsProgressOnlyToTheOwner(t *testing.T) {
	setup := &fakeSetup{byDevice: map[string]*domain.DeviceSetup{
		"dev-1": {DeviceID: "dev-1", Step: domain.SetupWaitingForAccounts, Status: domain.SetupWaitingForParent,
			CurrentAccounts: []domain.SetupAccount{{Type: "com.google", Name: "child@example.com"}}},
	}}
	h := testHandlers(nil)
	h.Setup = setup

	w := httptest.NewRecorder()
	h.GetSetup(w, setupRequest(http.MethodGet, "dev-1", "mine"))
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), "waiting_for_accounts") {
		t.Fatalf("owner: %d %s", w.Code, w.Body.String())
	}

	w = httptest.NewRecorder()
	h.GetSetup(w, setupRequest(http.MethodGet, "dev-1", "theirs"))
	if w.Code != http.StatusNotFound || strings.Contains(w.Body.String(), "child@example.com") {
		t.Fatalf("other parent: %d %s", w.Code, w.Body.String())
	}

	w = httptest.NewRecorder()
	h.GetSetup(w, setupRequest(http.MethodGet, "dev-1", ""))
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("no session: %d", w.Code)
	}
}

func TestGetSetupIsNullBeforeAnyReport(t *testing.T) {
	h := testHandlers(nil)
	h.Setup = &fakeSetup{byDevice: map[string]*domain.DeviceSetup{}}
	w := httptest.NewRecorder()
	h.GetSetup(w, setupRequest(http.MethodGet, "dev-1", "mine"))
	if w.Code != http.StatusOK || strings.TrimSpace(w.Body.String()) != "null" {
		t.Fatalf("%d %q", w.Code, w.Body.String())
	}
}

func TestClearSetupAccountsOnlyForTheOwner(t *testing.T) {
	setup := &fakeSetup{byDevice: map[string]*domain.DeviceSetup{}}
	h := testHandlers(nil)
	h.Setup = setup

	w := httptest.NewRecorder()
	h.ClearSetupAccounts(w, setupRequest(http.MethodDelete, "dev-1", "theirs"))
	if w.Code != http.StatusNotFound || len(setup.cleared) != 0 {
		t.Fatalf("other parent: %d, cleared %v", w.Code, setup.cleared)
	}
	w = httptest.NewRecorder()
	h.ClearSetupAccounts(w, setupRequest(http.MethodDelete, "dev-1", "mine"))
	if w.Code != http.StatusOK || len(setup.cleared) != 1 {
		t.Fatalf("owner: %d, cleared %v", w.Code, setup.cleared)
	}
}

func inputRequest(path, deviceID, token, body string) *http.Request {
	r := httptest.NewRequest(http.MethodPost, "/api/v1/console/devices/"+deviceID+"/setup/"+path, strings.NewReader(body))
	r.SetPathValue("deviceId", deviceID)
	if token != "" {
		r.Header.Set("Authorization", "Bearer "+token)
	}
	return r
}

func TestPairingCodeReachesOnlyTheOwnersPhone(t *testing.T) {
	cases := map[string]struct {
		token, body string
		want        int
	}{
		"owner":        {"mine", `{"code":" 123456 "}`, http.StatusAccepted},
		"other parent": {"theirs", `{"code":"123456"}`, http.StatusNotFound},
		"no session":   {"", `{"code":"123456"}`, http.StatusUnauthorized},
		"five digits":  {"mine", `{"code":"12345"}`, http.StatusBadRequest},
		"letters":      {"mine", `{"code":"12a456"}`, http.StatusBadRequest},
		"not json":     {"mine", `nope`, http.StatusBadRequest},
	}
	for name, c := range cases {
		setup := &fakeSetup{}
		h := testHandlers(nil)
		h.Setup = setup
		w := httptest.NewRecorder()
		h.SendPairingCode(w, inputRequest("pairing-code", "dev-1", c.token, c.body))
		if w.Code != c.want {
			t.Errorf("%s: status %d, want %d (%s)", name, w.Code, c.want, w.Body.String())
		}
		if stored := len(setup.codes) == 1; stored != (c.want == http.StatusAccepted) {
			t.Errorf("%s: stored %v", name, setup.codes)
		}
		if c.want == http.StatusAccepted && setup.codes[0] != "dev-1:123456" {
			t.Errorf("%s: stored %v, want the trimmed code", name, setup.codes)
		}
	}
}

func TestSetupInputOutsideItsStepIsAConflict(t *testing.T) {
	setup := &fakeSetup{inputErr: domain.ErrSetupNotWaiting}
	h := testHandlers(nil)
	h.Setup = setup
	w := httptest.NewRecorder()
	h.SendPairingCode(w, inputRequest("pairing-code", "dev-1", "mine", `{"code":"123456"}`))
	if w.Code != http.StatusConflict || !strings.Contains(w.Body.String(), "setup_not_waiting") {
		t.Fatalf("pairing code: %d %s", w.Code, w.Body.String())
	}
	w = httptest.NewRecorder()
	h.FinishSetup(w, inputRequest("finish", "dev-1", "mine", ``))
	if w.Code != http.StatusConflict {
		t.Fatalf("finish: %d %s", w.Code, w.Body.String())
	}
}

func TestOnlyTheOwnerFinishesSetup(t *testing.T) {
	setup := &fakeSetup{}
	h := testHandlers(nil)
	h.Setup = setup
	w := httptest.NewRecorder()
	h.FinishSetup(w, inputRequest("finish", "dev-1", "theirs", ``))
	if w.Code != http.StatusNotFound || len(setup.finished) != 0 {
		t.Fatalf("other parent: %d %v", w.Code, setup.finished)
	}
	w = httptest.NewRecorder()
	h.FinishSetup(w, inputRequest("finish", "dev-1", "mine", ``))
	if w.Code != http.StatusAccepted || len(setup.finished) != 1 {
		t.Fatalf("owner: %d %v", w.Code, setup.finished)
	}
}
