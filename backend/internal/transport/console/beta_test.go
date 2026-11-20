package console

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"manara/backend/internal/domain"
)

type memBeta struct {
	mu   sync.Mutex
	rows []domain.BetaSignup
}

func (m *memBeta) AddBetaSignup(_ context.Context, s domain.BetaSignup) (domain.BetaSignup, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.rows = append(m.rows, s)
	return s, nil
}
func (m *memBeta) ListBetaSignups(context.Context, int) ([]domain.BetaSignup, error) {
	return m.rows, nil
}
func (m *memBeta) SetBetaSignupStatus(context.Context, string, string, time.Time) (bool, error) {
	return true, nil
}
func (m *memBeta) PurgeBetaSignups(context.Context, time.Time) (int64, error) { return 0, nil }

func postBeta(t *testing.T, h *BetaSignups, body string) (int, map[string]any) {
	t.Helper()
	rec := httptest.NewRecorder()
	h.Create(rec, httptest.NewRequest(http.MethodPost, "/api/v1/beta-signups", strings.NewReader(body)))
	var out map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &out)
	return rec.Code, out
}

const goodBeta = `{"firstName":"Sara","whatsapp":"+216 22 123 456","place":"Sfax","callLanguage":"fr","brand":"samsung",
	"childAge":"10to13","worries":["night"],"slots":["weekday-evening"],"pageLanguage":"fr","ownChild":true}`

func TestTheBetaFormStoresAValidSignUp(t *testing.T) {
	store := &memBeta{}
	h := &BetaSignups{Store: store}
	code, out := postBeta(t, h, goodBeta)
	if code != 200 || out["ok"] != true || out["waitlist"] != false || len(store.rows) != 1 {
		t.Fatalf("%d %v rows=%d", code, out, len(store.rows))
	}
	if store.rows[0].Status != "new" || store.rows[0].CreatedAt.IsZero() {
		t.Fatalf("%+v", store.rows[0])
	}
}

func TestTheBetaFormNamesTheBadFieldAndNeedsTheOwnChildPromise(t *testing.T) {
	store := &memBeta{}
	h := &BetaSignups{Store: store}
	code, out := postBeta(t, h, strings.Replace(goodBeta, `"brand":"samsung"`, `"brand":"nokia"`, 1))
	if code != 400 || out["code"] != "invalid_field" || out["message"] != "brand" {
		t.Fatalf("%d %v", code, out)
	}
	code, out = postBeta(t, h, strings.Replace(goodBeta, `"ownChild":true`, `"ownChild":false`, 1))
	if code != 400 || out["code"] != "own_child_required" {
		t.Fatalf("%d %v", code, out)
	}
	if len(store.rows) != 0 {
		t.Fatal("a refused sign-up was stored")
	}
}

func TestABotFillingTheHoneypotIsNotStored(t *testing.T) {
	store := &memBeta{}
	h := &BetaSignups{Store: store}
	code, out := postBeta(t, h, strings.Replace(goodBeta, `"ownChild":true`, `"ownChild":true,"website":"http://spam"`, 1))
	if code != 200 || out["ok"] != true || len(store.rows) != 0 {
		t.Fatalf("%d %v rows=%d", code, out, len(store.rows))
	}
}

func TestAnIPhoneSignUpIsToldItIsOnTheWaitingList(t *testing.T) {
	h := &BetaSignups{Store: &memBeta{}}
	_, out := postBeta(t, h, strings.Replace(goodBeta, `"brand":"samsung"`, `"brand":"iphone"`, 1))
	if out["waitlist"] != true {
		t.Fatalf("%v", out)
	}
}
