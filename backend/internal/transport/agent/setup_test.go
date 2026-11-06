package agent

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"manara/backend/internal/domain"
)

type fakeSetup struct {
	reports []domain.SetupReport
}

func (f *fakeSetup) Report(_ context.Context, deviceID string, r domain.SetupReport) (*domain.DeviceSetup, error) {
	f.reports = append(f.reports, r)
	return &domain.DeviceSetup{DeviceID: deviceID, Step: r.Step, Status: r.Status}, nil
}
func (f *fakeSetup) Get(context.Context, string) (*domain.DeviceSetup, error) { return nil, nil }
func (f *fakeSetup) ClearAccounts(context.Context, string) error              { return nil }
func (f *fakeSetup) ClearAccountsOlderThan(context.Context, time.Time) (int, error) {
	return 0, nil
}

func postSetup(h *Handlers, token, body string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(http.MethodPost, "/api/v1/agent/setup", bytes.NewBufferString(body))
	if token != "" {
		r.Header.Set("Authorization", "Bearer "+token)
	}
	w := httptest.NewRecorder()
	h.ReportSetup(w, r)
	return w
}

func TestReportSetupStoresAValidStep(t *testing.T) {
	setup := &fakeSetup{}
	h := newHandlers(nil)
	h.Setup = setup
	w := postSetup(h, "good", `{"step":"checking_accounts","status":"in_progress","message":"3 accounts","accounts":[{"type":"com.google","name":"a@b.c"}]}`)
	if w.Code != http.StatusOK || len(setup.reports) != 1 {
		t.Fatalf("status %d, stored %d: %s", w.Code, len(setup.reports), w.Body.String())
	}
	if got := setup.reports[0]; got.Step != domain.SetupCheckingAccounts || len(got.Accounts) != 1 {
		t.Fatalf("stored %+v", got)
	}
}

func TestReportSetupRejectsBadInputAndUnknownPhones(t *testing.T) {
	cases := map[string]struct {
		token, body string
		code        int
	}{
		"no token":     {"", `{"step":"linked","status":"in_progress"}`, http.StatusUnauthorized},
		"wrong token":  {"bad", `{"step":"linked","status":"in_progress"}`, http.StatusUnauthorized},
		"not json":     {"good", `nope`, http.StatusBadRequest},
		"unknown step": {"good", `{"step":"run_shell","status":"in_progress"}`, http.StatusBadRequest},
		"oversized":    {"good", `{"step":"linked","status":"in_progress","message":"` + strings.Repeat("x", 70<<10) + `"}`, http.StatusBadRequest},
	}
	for name, c := range cases {
		setup := &fakeSetup{}
		h := newHandlers(nil)
		h.Setup = setup
		if w := postSetup(h, c.token, c.body); w.Code != c.code {
			t.Errorf("%s: status %d, want %d", name, w.Code, c.code)
		}
		if len(setup.reports) != 0 {
			t.Errorf("%s: a report was stored", name)
		}
	}
}
