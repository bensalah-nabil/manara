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

type fakeResets struct {
	known    map[string]string // email -> parent id
	tokens   map[string]string // token -> parent id
	consumed []string
}

func (f *fakeResets) Create(_ context.Context, email string, _, _ time.Duration) (string, bool, error) {
	if _, ok := f.known[email]; !ok {
		return "", false, nil
	}
	return "tok-" + email, true, nil
}

func (f *fakeResets) Consume(_ context.Context, token, _ string) (string, error) {
	id, ok := f.tokens[token]
	if !ok {
		return "", domain.ErrResetTokenInvalid
	}
	f.consumed = append(f.consumed, token)
	return id, nil
}

type fakeMailer struct{ to, text []string }

func (m *fakeMailer) Send(_ context.Context, to, _, text string) error {
	m.to, m.text = append(m.to, to), append(m.text, text)
	return nil
}

type fakeAccounts struct {
	password string
	devices  int
	deleted  []string
}

func (f *fakeAccounts) CheckPassword(_ context.Context, _, password string) (bool, error) {
	return password == f.password, nil
}

func (f *fakeAccounts) Delete(_ context.Context, id string) error {
	if f.devices > 0 {
		return domain.ErrDevicesRemain
	}
	f.deleted = append(f.deleted, id)
	return nil
}

type fakeParentRepo struct{}

func (fakeParentRepo) Create(context.Context, *domain.Parent) error { return nil }
func (fakeParentRepo) FindByID(_ context.Context, id string) (*domain.Parent, error) {
	return &domain.Parent{ID: id, Email: "sara.mum@example.com"}, nil
}

type issuingSessions struct{ fakeSessions }

func (issuingSessions) Issue(context.Context, string) (string, error) { return "new-session", nil }

func accountHandlers() (*Handlers, *fakeResets, *fakeMailer, *fakeAccounts) {
	h := testHandlers(nil)
	resets := &fakeResets{known: map[string]string{"sara.mum@example.com": "parent-1"}, tokens: map[string]string{"good": "parent-1"}}
	mailer := &fakeMailer{}
	accounts := &fakeAccounts{password: "correct horse"}
	h.Sessions = issuingSessions{h.Sessions.(fakeSessions)}
	h.Resets, h.Mailer, h.Accounts, h.Parents = resets, mailer, accounts, fakeParentRepo{}
	h.ConsoleURL = "https://console.example/"
	return h, resets, mailer, accounts
}

func call(handler http.HandlerFunc, method, body, session string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(method, "/x", strings.NewReader(body))
	if session != "" {
		r.Header.Set("Authorization", "Bearer "+session)
	}
	w := httptest.NewRecorder()
	handler(w, r)
	return w
}

func TestAResetRequestAnswersTheSameForAnyAddress(t *testing.T) {
	h, _, _, _ := accountHandlers()
	known := call(h.RequestPasswordReset, http.MethodPost, `{"email":" Sara.Mum@Example.com "}`, "")
	unknown := call(h.RequestPasswordReset, http.MethodPost, `{"email":"nobody@example.com"}`, "")
	if known.Code != http.StatusAccepted || unknown.Code != known.Code || unknown.Body.String() != known.Body.String() {
		t.Fatalf("known %d %s, unknown %d %s", known.Code, known.Body, unknown.Code, unknown.Body)
	}
}

func TestAResetEmailGoesOnlyToAnAccountAndLinksToTheConsole(t *testing.T) {
	h, _, mailer, _ := accountHandlers()
	h.sendReset(context.Background(), "nobody@example.com")
	h.sendReset(context.Background(), "sara.mum@example.com")
	if len(mailer.to) != 1 || mailer.to[0] != "sara.mum@example.com" {
		t.Fatalf("mailed %v", mailer.to)
	}
	if !strings.Contains(mailer.text[0], "https://console.example/#reset=tok-sara.mum@example.com") {
		t.Errorf("link missing: %q", mailer.text[0])
	}
}

func TestNoResetWithoutEmail(t *testing.T) {
	h, _, _, _ := accountHandlers()
	h.Mailer = nil
	if w := call(h.RequestPasswordReset, http.MethodPost, `{"email":"sara.mum@example.com"}`, ""); w.Code != http.StatusServiceUnavailable {
		t.Fatalf("status %d", w.Code)
	}
}

func TestConfirmingAReset(t *testing.T) {
	h, resets, _, _ := accountHandlers()
	if w := call(h.ConfirmPasswordReset, http.MethodPost, `{"token":"good","password":"short"}`, ""); w.Code != http.StatusBadRequest || !strings.Contains(w.Body.String(), "weak_password") {
		t.Errorf("weak password: %d %s", w.Code, w.Body)
	}
	if len(resets.consumed) != 0 {
		t.Fatal("a refused password must not use up the link")
	}
	if w := call(h.ConfirmPasswordReset, http.MethodPost, `{"token":"bad","password":"long enough"}`, ""); w.Code != http.StatusBadRequest || !strings.Contains(w.Body.String(), "invalid_reset_token") {
		t.Errorf("bad token: %d %s", w.Code, w.Body)
	}
	w := call(h.ConfirmPasswordReset, http.MethodPost, `{"token":" good ","password":"long enough"}`, "")
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), `"parentSession":"new-session"`) {
		t.Errorf("good token: %d %s", w.Code, w.Body)
	}
}

func TestDeletingTheAccount(t *testing.T) {
	h, _, _, accounts := accountHandlers()
	if w := call(h.DeleteAccount, http.MethodDelete, `{"password":"x"}`, ""); w.Code != http.StatusUnauthorized {
		t.Errorf("no session: %d", w.Code)
	}
	if w := call(h.DeleteAccount, http.MethodDelete, `{"password":"wrong"}`, "mine"); w.Code != http.StatusForbidden {
		t.Errorf("wrong password: %d", w.Code)
	}
	accounts.devices = 1
	if w := call(h.DeleteAccount, http.MethodDelete, `{"password":"correct horse"}`, "mine"); w.Code != http.StatusConflict || !strings.Contains(w.Body.String(), "devices_remain") {
		t.Errorf("phones remain: %d %s", w.Code, w.Body)
	}
	accounts.devices = 0
	if w := call(h.DeleteAccount, http.MethodDelete, `{"password":"correct horse"}`, "mine"); w.Code != http.StatusOK {
		t.Errorf("delete: %d %s", w.Code, w.Body)
	}
	if len(accounts.deleted) != 1 || accounts.deleted[0] != "parent-1" {
		t.Fatalf("deleted %v", accounts.deleted)
	}
}

func TestTheAccountSaysWhatDeletionWaitsFor(t *testing.T) {
	h, _, _, _ := accountHandlers()
	w := call(h.GetAccount, http.MethodGet, "", "mine")
	body := w.Body.String()
	if w.Code != http.StatusOK || !strings.Contains(body, `"email":"sara.mum@example.com"`) || !strings.Contains(body, `"phones":1`) || !strings.Contains(body, `"passwordReset":true`) {
		t.Fatalf("%d %s", w.Code, body)
	}
}

func TestSignUpRefusesAWeakPassword(t *testing.T) {
	h, _, _, _ := accountHandlers()
	w := call(h.SignUp, http.MethodPost, `{"email":"a@b.c","password":"short"}`, "")
	if w.Code != http.StatusBadRequest || !strings.Contains(w.Body.String(), "weak_password") {
		t.Fatalf("%d %s", w.Code, w.Body)
	}
}
