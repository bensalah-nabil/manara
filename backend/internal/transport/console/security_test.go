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

type fakeAuth struct{}

func (fakeAuth) SignUp(context.Context, string, string) (*domain.Parent, error) { return nil, nil }
func (fakeAuth) Login(_ context.Context, email, password string) (*domain.Parent, error) {
	if password == "right one" {
		return &domain.Parent{ID: "parent-1", Email: email}, nil
	}
	return nil, domain.ErrInvalidCredentials
}

func TestLoginIsLimitedPerEmailWhateverTheClient(t *testing.T) {
	h, _, _, _ := accountHandlers()
	h.Auth = fakeAuth{}
	h.LoginLimiter = guard.NewLimiter(3, 15*time.Minute)
	for i := 0; i < 3; i++ {
		if w := call(h.Login, http.MethodPost, `{"email":"Sara.Mum@example.com","password":"wrong"}`, ""); w.Code != http.StatusUnauthorized {
			t.Fatalf("attempt %d: %d", i+1, w.Code)
		}
	}
	w := call(h.Login, http.MethodPost, `{"email":"sara.mum@example.com ","password":"right one"}`, "")
	if w.Code != http.StatusTooManyRequests || !strings.Contains(w.Body.String(), "rate_limited") {
		t.Fatalf("4th attempt, same address written differently: %d %s", w.Code, w.Body)
	}
	if w := call(h.Login, http.MethodPost, `{"email":"other@example.com","password":"wrong"}`, ""); w.Code != http.StatusUnauthorized {
		t.Fatalf("another address is counted separately: %d", w.Code)
	}
}

func TestLogoutEndsTheSessionOnTheServer(t *testing.T) {
	h, _, _, _ := accountHandlers()
	if w := call(h.Logout, http.MethodPost, "", "mine"); w.Code != http.StatusNoContent {
		t.Fatalf("logout: %d", w.Code)
	}
	if w := call(h.GetAccount, http.MethodGet, "", "mine"); w.Code != http.StatusUnauthorized {
		t.Fatalf("the token still works after logout: %d", w.Code)
	}
	if w := call(h.Logout, http.MethodPost, "", ""); w.Code != http.StatusUnauthorized {
		t.Fatalf("logout without a token: %d", w.Code)
	}
}
