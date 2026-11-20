package admin

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"manara/backend/internal/domain"
)

type betaStore struct {
	rows    []domain.BetaSignup
	updated map[string]string
}

func (b *betaStore) AddBetaSignup(_ context.Context, s domain.BetaSignup) (domain.BetaSignup, error) {
	return s, nil
}
func (b *betaStore) ListBetaSignups(context.Context, int) ([]domain.BetaSignup, error) {
	return b.rows, nil
}
func (b *betaStore) SetBetaSignupStatus(_ context.Context, id, status string, _ time.Time) (bool, error) {
	if id != "known" {
		return false, nil
	}
	b.updated[id] = status
	return true, nil
}
func (b *betaStore) PurgeBetaSignups(context.Context, time.Time) (int64, error) { return 0, nil }

func serveBeta(h *Handlers, method, path, body, token string) *httptest.ResponseRecorder {
	mux := http.NewServeMux()
	BetaRoutes(mux, h)
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, req)
	return w
}

func TestBetaSignUpsAreListedAndFollowedUpOnlyByALoggedAdmin(t *testing.T) {
	store := &fakeStore{}
	beta := &betaStore{rows: []domain.BetaSignup{{ID: "known", FirstName: "Sara", WhatsApp: "+216 22 123 456"}}, updated: map[string]string{}}
	h := &Handlers{Verifier: fixedVerifier{}, Store: store, Beta: beta, Now: func() time.Time { return now }}

	if w := serveBeta(h, http.MethodGet, "/api/v1/admin/beta-signups", "", ""); w.Code != http.StatusUnauthorized {
		t.Fatalf("no token: %d", w.Code)
	}
	w := serveBeta(h, http.MethodGet, "/api/v1/admin/beta-signups", "", "good")
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), "Sara") {
		t.Fatalf("%d %s", w.Code, w.Body)
	}
	if len(store.log) != 1 || store.log[0].Action != "listed_beta_signups" {
		t.Fatalf("log %+v", store.log)
	}

	if w := serveBeta(h, http.MethodPost, "/api/v1/admin/beta-signups/known/status", `{"status":"spam"}`, "good"); w.Code != http.StatusBadRequest {
		t.Fatalf("unknown status: %d", w.Code)
	}
	if w := serveBeta(h, http.MethodPost, "/api/v1/admin/beta-signups/known/status", `{"status":"contacted"}`, "good"); w.Code != http.StatusOK {
		t.Fatalf("contacted: %d %s", w.Code, w.Body)
	}
	if beta.updated["known"] != "contacted" || store.log[len(store.log)-1].Action != "beta_status_contacted" || store.log[len(store.log)-1].Target != "known" {
		t.Fatalf("updated %v log %+v", beta.updated, store.log)
	}
	if w := serveBeta(h, http.MethodPost, "/api/v1/admin/beta-signups/other/status", `{"status":"set_up"}`, "good"); w.Code != http.StatusNotFound {
		t.Fatalf("unknown id: %d", w.Code)
	}
}
