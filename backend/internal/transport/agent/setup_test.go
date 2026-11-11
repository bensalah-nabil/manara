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
	input   domain.SetupInput
}

func (f *fakeSetup) Report(_ context.Context, deviceID string, r domain.SetupReport) (*domain.DeviceSetup, error) {
	f.reports = append(f.reports, r)
	return &domain.DeviceSetup{DeviceID: deviceID, Step: r.Step, Status: r.Status}, nil
}
func (f *fakeSetup) Get(context.Context, string) (*domain.DeviceSetup, error) { return nil, nil }
func (f *fakeSetup) ClearAccounts(context.Context, string) error              { return nil }
func (f *fakeSetup) Input(context.Context, string) (domain.SetupInput, error) { return f.input, nil }
func (f *fakeSetup) SendPairingCode(context.Context, string, string) error    { return nil }
func (f *fakeSetup) RequestFinish(context.Context, string) error              { return nil }
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

func TestReportSetupKeepsAValidQRPairing(t *testing.T) {
	setup := &fakeSetup{}
	h := newHandlers(nil)
	h.Setup = setup
	w := postSetup(h, "good", `{"step":"pairing","status":"waiting_for_parent","pairing":{"name":"manara-ab12","password":"Xy7kQ2mP9z"}}`)
	if w.Code != http.StatusOK || len(setup.reports) != 1 || setup.reports[0].Pairing == nil {
		t.Fatalf("status %d: %s", w.Code, w.Body.String())
	}
	if got := setup.reports[0].Pairing.QRText(); got != "WIFI:T:ADB;S:manara-ab12;P:Xy7kQ2mP9z;;" {
		t.Fatalf("QR text %q", got)
	}
}

func TestReportSetupRejectsAPairingThatWouldBreakTheQRCode(t *testing.T) {
	for _, pairing := range []string{
		`{"name":"manara-ab12","password":"has;semicolon"}`,
		`{"name":"other-ab12","password":"Xy7kQ2mP9z"}`,
		`{"name":"manara-ab12","password":"short"}`,
	} {
		setup := &fakeSetup{}
		h := newHandlers(nil)
		h.Setup = setup
		if w := postSetup(h, "good", `{"step":"pairing","status":"waiting_for_parent","pairing":`+pairing+`}`); w.Code != http.StatusBadRequest {
			t.Errorf("%s: status %d", pairing, w.Code)
		}
	}
	// Only the pairing step may carry one.
	setup := &fakeSetup{}
	h := newHandlers(nil)
	h.Setup = setup
	if w := postSetup(h, "good", `{"step":"checking_accounts","status":"in_progress","pairing":{"name":"manara-ab12","password":"Xy7kQ2mP9z"}}`); w.Code != http.StatusBadRequest {
		t.Errorf("pairing outside the pairing step: status %d", w.Code)
	}
}

func TestSetupInputGoesOnlyToThePhone(t *testing.T) {
	setup := &fakeSetup{input: domain.SetupInput{PairingCode: "123456", PairingCodeSeq: 2}}
	h := newHandlers(nil)
	h.Setup = setup
	get := func(token string) *httptest.ResponseRecorder {
		r := httptest.NewRequest(http.MethodGet, "/api/v1/agent/setup/input", nil)
		if token != "" {
			r.Header.Set("Authorization", "Bearer "+token)
		}
		w := httptest.NewRecorder()
		h.GetSetupInput(w, r)
		return w
	}
	if w := get("good"); w.Code != http.StatusOK || !strings.Contains(w.Body.String(), `"pairingCode":"123456"`) || !strings.Contains(w.Body.String(), `"pairingCodeSeq":2`) {
		t.Fatalf("phone: %d %s", w.Code, w.Body.String())
	}
	if w := get("bad"); w.Code != http.StatusUnauthorized || strings.Contains(w.Body.String(), "123456") {
		t.Fatalf("unknown token: %d %s", w.Code, w.Body.String())
	}
}

type fakeReadiness struct{ saved map[string]domain.SetupReadiness }

func (f *fakeReadiness) SaveReadiness(_ context.Context, deviceID string, r domain.SetupReadiness) error {
	f.saved[deviceID] = r
	return nil
}
func (f *fakeReadiness) Readiness(_ context.Context, deviceID string) (*domain.SetupReadiness, error) {
	r, ok := f.saved[deviceID]
	if !ok {
		return nil, nil
	}
	return &r, nil
}

func postReadiness(h *Handlers, token, body string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(http.MethodPost, "/api/v1/agent/setup/readiness", bytes.NewBufferString(body))
	if token != "" {
		r.Header.Set("Authorization", "Bearer "+token)
	}
	w := httptest.NewRecorder()
	h.ReportReadiness(w, r)
	return w
}

func TestThePhoneReportsItsChecklist(t *testing.T) {
	store := &fakeReadiness{saved: map[string]domain.SetupReadiness{}}
	h := newHandlers(nil)
	h.Readiness = store
	if w := postReadiness(h, "", `{"android":true}`); w.Code != http.StatusUnauthorized {
		t.Errorf("no token: %d", w.Code)
	}
	if w := postReadiness(h, "good", `{"android":true,"batteryPercent":150}`); w.Code != http.StatusBadRequest {
		t.Errorf("battery out of range: %d", w.Code)
	}
	w := postReadiness(h, "good", `{"android":true,"wifi":true,"batteryPercent":40,"charging":false,"developerOptions":true,"wirelessDebugging":null,"ready":true}`)
	if w.Code != http.StatusNoContent {
		t.Fatalf("store: %d %s", w.Code, w.Body)
	}
	if len(store.saved) != 1 {
		t.Fatalf("saved %v", store.saved)
	}
	for _, r := range store.saved {
		if r.WirelessDebugging != nil || r.Wifi == nil || !*r.Wifi || *r.BatteryPercent != 40 || !r.Ready {
			t.Errorf("stored %+v", r)
		}
	}
}
