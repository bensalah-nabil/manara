package console

import (
	"context"
	"net/http"
	"strings"
	"testing"
	"time"

	"manara/backend/internal/domain"
	"manara/backend/internal/transport/guard"
)

type fakeTwoFactor struct {
	on         map[string]bool
	challenges map[string]string
}

func (f *fakeTwoFactor) Enabled(_ context.Context, id string) (bool, error) { return f.on[id], nil }
func (f *fakeTwoFactor) BeginSetup(context.Context, string) (string, error) {
	return "JBSWY3DPEHPK3PXP", nil
}
func (f *fakeTwoFactor) Enable(_ context.Context, id, code string, _ time.Time) ([]string, error) {
	if code != "111111" {
		return nil, domain.ErrBadSecondFactor
	}
	f.on[id] = true
	return []string{"AAAAA-BBBBB"}, nil
}
func (f *fakeTwoFactor) Check(_ context.Context, _ string, code string, _ time.Time) error {
	if code == "111111" || code == "AAAAA-BBBBB" {
		return nil
	}
	return domain.ErrBadSecondFactor
}
func (f *fakeTwoFactor) Disable(_ context.Context, id string) error { f.on[id] = false; return nil }
func (f *fakeTwoFactor) NewChallenge(_ context.Context, id string, _ time.Time) (string, error) {
	f.challenges["ch-"+id] = id
	return "ch-" + id, nil
}
func (f *fakeTwoFactor) ChallengeParent(_ context.Context, token string, _ time.Time) (string, error) {
	if id, ok := f.challenges[token]; ok {
		return id, nil
	}
	return "", domain.ErrChallengeInvalid
}
func (f *fakeTwoFactor) EndChallenge(_ context.Context, token string) error {
	delete(f.challenges, token)
	return nil
}

func twoFactorHandlers(on bool) (*Handlers, *fakeTwoFactor) {
	h, _, _, _ := accountHandlers()
	h.Auth = fakeAuth{}
	tf := &fakeTwoFactor{on: map[string]bool{"parent-1": on}, challenges: map[string]string{}}
	h.TwoFactor = tf
	h.ChallengeLimiter = guard.NewLimiter(5, time.Minute)
	return h, tf
}

func TestPasswordAloneDoesNotSignInWhenTwoStepIsOn(t *testing.T) {
	h, _ := twoFactorHandlers(true)
	w := call(h.Login, http.MethodPost, `{"email":"sara.mum@example.com","password":"right one"}`, "")
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), `"twoFactorRequired":true`) || strings.Contains(w.Body.String(), "parentSession") {
		t.Fatalf("%d %s", w.Code, w.Body)
	}
	if w := call(h.VerifyLogin, http.MethodPost, `{"challenge":"ch-parent-1","code":"999999"}`, ""); w.Code != http.StatusUnauthorized {
		t.Fatalf("wrong code: %d", w.Code)
	}
	w = call(h.VerifyLogin, http.MethodPost, `{"challenge":"ch-parent-1","code":"111111"}`, "")
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), `"parentSession":"new-session"`) {
		t.Fatalf("right code: %d %s", w.Code, w.Body)
	}
	if w := call(h.VerifyLogin, http.MethodPost, `{"challenge":"ch-parent-1","code":"111111"}`, ""); w.Code != http.StatusUnauthorized {
		t.Fatalf("a used challenge signed in again: %d", w.Code)
	}
}

func TestWithoutTwoStepTheLoginStillSignsIn(t *testing.T) {
	h, _ := twoFactorHandlers(false)
	w := call(h.Login, http.MethodPost, `{"email":"sara.mum@example.com","password":"right one"}`, "")
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), `"parentSession":"new-session"`) {
		t.Fatalf("%d %s", w.Code, w.Body)
	}
}

func TestAPasswordResetDoesNotSkipTheSecondStep(t *testing.T) {
	h, _ := twoFactorHandlers(true)
	w := call(h.ConfirmPasswordReset, http.MethodPost, `{"token":"good","password":"long enough"}`, "")
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), `"twoFactorRequired":true`) || strings.Contains(w.Body.String(), "parentSession") {
		t.Fatalf("%d %s", w.Code, w.Body)
	}
}

func TestCodeTriesPerSignInAreLimited(t *testing.T) {
	h, _ := twoFactorHandlers(true)
	call(h.Login, http.MethodPost, `{"email":"sara.mum@example.com","password":"right one"}`, "")
	for i := 0; i < 5; i++ {
		call(h.VerifyLogin, http.MethodPost, `{"challenge":"ch-parent-1","code":"000000"}`, "")
	}
	if w := call(h.VerifyLogin, http.MethodPost, `{"challenge":"ch-parent-1","code":"111111"}`, ""); w.Code != http.StatusTooManyRequests {
		t.Fatalf("6th try: %d", w.Code)
	}
}

func TestTurningTwoStepOnAndOff(t *testing.T) {
	h, tf := twoFactorHandlers(false)
	if w := call(h.SetupTwoFactor, http.MethodPost, `{"password":"wrong"}`, "mine"); w.Code != http.StatusForbidden {
		t.Fatalf("setup with a wrong password: %d", w.Code)
	}
	w := call(h.SetupTwoFactor, http.MethodPost, `{"password":"correct horse"}`, "mine")
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), "otpauth://totp/") {
		t.Fatalf("setup: %d %s", w.Code, w.Body)
	}
	if w := call(h.EnableTwoFactor, http.MethodPost, `{"code":"000000"}`, "mine"); w.Code != http.StatusBadRequest {
		t.Fatalf("enable with a wrong code: %d", w.Code)
	}
	w = call(h.EnableTwoFactor, http.MethodPost, `{"code":"111111"}`, "mine")
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), "AAAAA-BBBBB") || !tf.on["parent-1"] {
		t.Fatalf("enable: %d %s", w.Code, w.Body)
	}
	if w := call(h.GetAccount, http.MethodGet, "", "mine"); !strings.Contains(w.Body.String(), `"twoFactor":true`) {
		t.Fatalf("account: %s", w.Body)
	}
	if w := call(h.DisableTwoFactor, http.MethodPost, `{"password":"correct horse","code":"000000"}`, "mine"); w.Code != http.StatusBadRequest || !tf.on["parent-1"] {
		t.Fatalf("disable with a wrong code: %d", w.Code)
	}
	if w := call(h.DisableTwoFactor, http.MethodPost, `{"password":"correct horse","code":"111111"}`, "mine"); w.Code != http.StatusNoContent || tf.on["parent-1"] {
		t.Fatalf("disable: %d", w.Code)
	}
}
