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
