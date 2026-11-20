package admin

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"manara/backend/internal/domain"
)

// The fake store's methods for the actions; its data lives in actionData, shared by pointer.
type actionData struct {
	account     *domain.AdminAccount
	phoneOwner  string
	suspended   *bool
	setupGone   bool
	settings    map[string]json.RawMessage
	disabled    []string
	deleted     []string
	removed     []string
	parentAudit []domain.AuditEntry
	mails       []string
	resetTokens int
}

var (
	data   = &actionData{}
	dataMu sync.Mutex // the tests share data, so they take turns
)

func (f *fakeStore) Account(_ context.Context, id string) (*domain.AdminAccount, error) {
	if data.account == nil || data.account.ID != id {
		return nil, nil
	}
	a := *data.account
	return &a, nil
}
func (f *fakeStore) PhoneOwner(_ context.Context, deviceID string) (string, string, bool, error) {
	if deviceID != "abcdef12-3456-7890" {
		return "", "", false, nil
	}
	return data.phoneOwner, "parent@example.com", true, nil
}
func (f *fakeStore) SetSuspended(_ context.Context, _ string, suspended bool, _ time.Time) (bool, error) {
	data.suspended = &suspended
	return true, nil
}
func (f *fakeStore) DeleteSetup(context.Context, string) (bool, error) {
	data.setupGone = true
	return true, nil
}

type fakeTwoFactor struct{}

func (fakeTwoFactor) Disable(_ context.Context, id string) error {
	data.disabled = append(data.disabled, id)
	return nil
}

type fakeAccounts struct{}

func (fakeAccounts) Delete(_ context.Context, id string) error {
	data.deleted = append(data.deleted, id)
	return nil
}

type fakeReleases struct{}

func (fakeReleases) Delete(_ context.Context, id string) error {
	data.removed = append(data.removed, id)
	return nil
}

type fakeAudit struct{}

func (fakeAudit) Record(_ context.Context, e domain.AuditEntry) error {
	data.parentAudit = append(data.parentAudit, e)
	return nil
}
func (fakeAudit) ListForParent(context.Context, string, int) ([]domain.AuditEntry, error) {
	return nil, nil
}
func (fakeAudit) PurgeOlderThan(context.Context, time.Time) (int, error) { return 0, nil }

type fakeResets struct{}

func (fakeResets) Create(context.Context, string, time.Duration, time.Duration) (string, bool, error) {
	data.resetTokens++
	return "tok", true, nil
}
func (fakeResets) Consume(context.Context, string, string) (string, error) { return "", nil }

type fakeMailer struct{}

func (fakeMailer) Send(_ context.Context, to, _, text string) error {
	data.mails = append(data.mails, to+"|"+text)
	return nil
}

type fakeSettings struct{}

func (fakeSettings) Setting(_ context.Context, key string, into any) (bool, error) {
	raw, ok := data.settings[key]
	if !ok {
		return false, nil
	}
	return true, json.Unmarshal(raw, into)
}
func (fakeSettings) PutSetting(_ context.Context, key string, value any, _ string) error {
	raw, _ := json.Marshal(value)
	data.settings[key] = raw
	return nil
}
func (fakeSettings) DeleteSetting(_ context.Context, key string) error {
	delete(data.settings, key)
	return nil
}

func actionHandlers(t *testing.T) (*Handlers, *fakeStore) {
	t.Helper()
	dataMu.Lock()
	t.Cleanup(dataMu.Unlock)
	*data = actionData{
		account:    &domain.AdminAccount{ID: "acc-1", Email: "parent@example.com", Phones: 0},
		phoneOwner: "acc-1",
		settings:   map[string]json.RawMessage{},
	}
	store := &fakeStore{}
	fallback := &domain.AgentUpdate{VersionCode: 35, VersionName: "1.0.35"}
	h := &Handlers{Verifier: fixedVerifier{}, Store: store, Now: func() time.Time { return now }, Actions: &Actions{
		TwoFactor: fakeTwoFactor{}, Accounts: fakeAccounts{}, Releases: fakeReleases{}, Audit: fakeAudit{},
		Resets: fakeResets{}, Mailer: fakeMailer{}, ConsoleURL: "https://console.example",
		Settings: fakeSettings{}, Updates: &domain.AgentUpdateSource{Settings: fakeSettings{}, Fallback: fallback},
		VerifyAPK: func(context.Context, string, string) error { return nil },
	}}
	return h, store
}

func act(h *Handlers, method, path, body string) *httptest.ResponseRecorder {
	mux := http.NewServeMux()
	Routes(mux, h)
	ActionRoutes(mux, h)
	r := httptest.NewRequest(method, path, strings.NewReader(body))
	r.Header.Set("Authorization", "Bearer good")
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, r)
	return w
}

func TestAnActionNeedsAReasonAndTheTypedTarget(t *testing.T) {
	h, store := actionHandlers(t)
	cases := map[string]struct {
		body string
		code string
	}{
		"no reason":       {`{"confirm":"parent@example.com"}`, "reason_required"},
		"wrong target":    {`{"reason":"lost phone","confirm":"other@example.com"}`, "confirm_mismatch"},
		"no target":       {`{"reason":"lost phone"}`, "confirm_mismatch"},
		"not even JSON":   {`hello`, "bad_request"},
		"reason too long": {`{"reason":"` + strings.Repeat("x", 301) + `","confirm":"parent@example.com"}`, "reason_required"},
	}
	for name, c := range cases {
		w := act(h, http.MethodPost, "/api/v1/admin/accounts/acc-1/two-step-off", c.body)
		if w.Code != http.StatusBadRequest || !strings.Contains(w.Body.String(), c.code) {
			t.Errorf("%s: %d %s", name, w.Code, w.Body)
		}
	}
	if len(data.disabled) != 0 || len(store.log) != 0 {
		t.Fatalf("a refused action acted or was logged as done: %v %v", data.disabled, store.log)
	}
}

func TestTurningTwoStepOffIsLoggedFirstAndToldToTheParent(t *testing.T) {
	h, store := actionHandlers(t)
	w := act(h, http.MethodPost, "/api/v1/admin/accounts/acc-1/two-step-off", `{"reason":"lost authenticator, called us","confirm":" Parent@Example.com "}`)
	if w.Code != http.StatusOK || len(data.disabled) != 1 {
		t.Fatalf("%d %s, disabled %v", w.Code, w.Body, data.disabled)
	}
	if len(store.log) != 1 || store.log[0].Action != "two_step_off" || !strings.Contains(store.log[0].Target, "reason: lost authenticator") {
		t.Fatalf("admin log %+v", store.log)
	}
	if len(data.parentAudit) != 1 || data.parentAudit[0].Action != domain.AuditSupportTwoStepOff || data.parentAudit[0].ParentID != "acc-1" {
		t.Fatalf("the parent wasn't told: %+v", data.parentAudit)
	}
}

func TestEveryAccountActionWorksOnce(t *testing.T) {
	h, _ := actionHandlers(t)
	body := `{"reason":"support ticket 12","confirm":"parent@example.com"}`
	if w := act(h, http.MethodPost, "/api/v1/admin/accounts/acc-1/password-reset", body); w.Code != http.StatusOK || len(data.mails) != 1 || !strings.Contains(data.mails[0], "https://console.example/#reset=tok") {
		t.Fatalf("reset: %d %s %v", w.Code, w.Body, data.mails)
	}
	if w := act(h, http.MethodPost, "/api/v1/admin/accounts/acc-1/suspend", body); w.Code != http.StatusOK || data.suspended == nil || !*data.suspended {
		t.Fatalf("suspend: %d %s", w.Code, w.Body)
	}
	if w := act(h, http.MethodPost, "/api/v1/admin/accounts/acc-1/reactivate", body); w.Code != http.StatusOK || *data.suspended {
		t.Fatalf("reactivate: %d %s", w.Code, w.Body)
	}
	if w := act(h, http.MethodPost, "/api/v1/admin/accounts/acc-1/delete", body); w.Code != http.StatusOK || len(data.deleted) != 1 {
		t.Fatalf("delete: %d %s", w.Code, w.Body)
	}
	if w := act(h, http.MethodPost, "/api/v1/admin/accounts/nobody/suspend", body); w.Code != http.StatusNotFound {
		t.Fatalf("unknown account: %d", w.Code)
	}
}

func TestAnAccountWithPhonesCantBeDeleted(t *testing.T) {
	h, _ := actionHandlers(t)
	data.account.Phones = 1
	w := act(h, http.MethodPost, "/api/v1/admin/accounts/acc-1/delete", `{"reason":"asked by parent","confirm":"parent@example.com"}`)
	if w.Code != http.StatusConflict || !strings.Contains(w.Body.String(), "phones_remain") || len(data.deleted) != 0 {
		t.Fatalf("%d %s", w.Code, w.Body)
	}
}

func TestPhoneActionsNeedThePhonesCode(t *testing.T) {
	h, _ := actionHandlers(t)
	if w := act(h, http.MethodPost, "/api/v1/admin/phones/abcdef12-3456-7890/remove", `{"reason":"phone was reset","confirm":"abcdef13"}`); w.Code != http.StatusBadRequest || len(data.removed) != 0 {
		t.Fatalf("wrong code: %d", w.Code)
	}
	if w := act(h, http.MethodPost, "/api/v1/admin/phones/abcdef12-3456-7890/setup-reset", `{"reason":"stuck at pairing","confirm":"abcdef12"}`); w.Code != http.StatusOK || !data.setupGone {
		t.Fatalf("setup reset: %d %s", w.Code, w.Body)
	}
	if w := act(h, http.MethodPost, "/api/v1/admin/phones/abcdef12-3456-7890/remove", `{"reason":"phone was reset","confirm":"ABCDEF12"}`); w.Code != http.StatusOK || len(data.removed) != 1 {
		t.Fatalf("remove: %d %s", w.Code, w.Body)
	}
	actions := []domain.AuditAction{}
	for _, e := range data.parentAudit {
		actions = append(actions, e.Action)
	}
	if len(actions) != 2 || actions[0] != domain.AuditSupportSetupReset || actions[1] != domain.AuditSupportPhoneRemoved {
		t.Fatalf("parent told %v", actions)
	}
}

func TestAVersionIsOfferedOnlyWhenTheFileMatches(t *testing.T) {
	h, _ := actionHandlers(t)
	sha := strings.Repeat("a", 64)
	body := `{"reason":"release","confirm":"1.0.36","versionCode":36,"versionName":"1.0.36","sha256":"` + sha + `"}`
	h.Actions.VerifyAPK = func(_ context.Context, url, got string) error {
		if !strings.HasSuffix(url, "/v1.0.36/manara.apk") || got != sha {
			t.Errorf("checked %s %s", url, got)
		}
		return errors.New("the file's SHA-256 is something else")
	}
	if w := act(h, http.MethodPut, "/api/v1/admin/agent-update", body); w.Code != http.StatusUnprocessableEntity {
		t.Fatalf("mismatch accepted: %d %s", w.Code, w.Body)
	}
	if offered := h.Actions.Updates.Current(context.Background()); offered == nil || offered.VersionCode != 35 {
		t.Fatalf("a refused version changed the offer: %+v", offered)
	}
	h.Actions.VerifyAPK = func(context.Context, string, string) error { return nil }
	if w := act(h, http.MethodPut, "/api/v1/admin/agent-update", body); w.Code != http.StatusOK {
		t.Fatalf("%d %s", w.Code, w.Body)
	}
	if offered := h.Actions.Updates.Current(context.Background()); offered == nil || offered.VersionCode != 36 {
		t.Fatalf("offer %+v", offered)
	}
	if w := act(h, http.MethodPost, "/api/v1/admin/agent-update/pause", `{"reason":"bad release"}`); w.Code != http.StatusOK {
		t.Fatalf("pause: %d", w.Code)
	}
	if offered := h.Actions.Updates.Current(context.Background()); offered != nil {
		t.Fatalf("paused but still offering %+v", offered)
	}
	if w := act(h, http.MethodDelete, "/api/v1/admin/agent-update", `{"reason":"back to Render"}`); w.Code != http.StatusOK {
		t.Fatalf("reset: %d", w.Code)
	}
	if offered := h.Actions.Updates.Current(context.Background()); offered == nil || offered.VersionCode != 35 {
		t.Fatalf("not back to the server's settings: %+v", offered)
	}
}

func TestTheNoticeShowsToParentsUntilItEnds(t *testing.T) {
	h, _ := actionHandlers(t)
	public := func() string {
		mux := http.NewServeMux()
		mux.HandleFunc("GET /notice", h.PublicNotice)
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/notice", nil))
		return w.Body.String()
	}
	if got := public(); !strings.Contains(got, `"notice":null`) {
		t.Fatalf("before: %s", got)
	}
	until := now.Add(time.Hour).Format(time.RFC3339)
	body := `{"reason":"maintenance","notice":{"level":"warning","text":{"en":"Maintenance at 22:00","ar":"صيانة"},"until":"` + until + `"}}`
	if w := act(h, http.MethodPut, "/api/v1/admin/notice", body); w.Code != http.StatusOK {
		t.Fatalf("%d %s", w.Code, w.Body)
	}
	if got := public(); !strings.Contains(got, "Maintenance at 22:00") {
		t.Fatalf("after: %s", got)
	}
	h.Now = func() time.Time { return now.Add(2 * time.Hour) }
	if got := public(); !strings.Contains(got, `"notice":null`) {
		t.Fatalf("an ended notice still shows: %s", got)
	}
	bad := `{"reason":"x","notice":{"level":"loud","text":{"en":"hi"}}}`
	if w := act(h, http.MethodPut, "/api/v1/admin/notice", bad); w.Code != http.StatusBadRequest {
		t.Fatalf("bad notice accepted: %d", w.Code)
	}
}

type countingLimiter struct{ left int }

func (c *countingLimiter) Allow(context.Context, string, time.Time) (bool, time.Duration) {
	c.left--
	return c.left >= 0, time.Minute
}

func TestAdminWritesAreRateLimited(t *testing.T) {
	h, _ := actionHandlers(t)
	h.Actions.Limiter = &countingLimiter{left: 1}
	body := `{"reason":"x","confirm":"parent@example.com"}`
	if w := act(h, http.MethodPost, "/api/v1/admin/accounts/acc-1/two-step-off", body); w.Code != http.StatusOK {
		t.Fatalf("first: %d", w.Code)
	}
	if w := act(h, http.MethodPost, "/api/v1/admin/accounts/acc-1/two-step-off", body); w.Code != http.StatusTooManyRequests {
		t.Fatalf("second: %d", w.Code)
	}
}

func TestWithoutActionsTheConsoleIsReadOnly(t *testing.T) {
	h, _ := actionHandlers(t)
	h.Actions = nil
	if w := act(h, http.MethodPost, "/api/v1/admin/accounts/acc-1/suspend", `{"reason":"x","confirm":"parent@example.com"}`); w.Code != http.StatusNotFound {
		t.Fatalf("%d", w.Code)
	}
}
