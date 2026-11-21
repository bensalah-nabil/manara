package console

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"manara/backend/internal/domain"
	"manara/backend/internal/setuphelp"
	"manara/backend/internal/transport/guard"
)

type fakeAnswerer struct {
	got    *setuphelp.Request
	answer string
	err    error
}

var oneQuestion = domain.AssistantUsage{Model: "claude-haiku-5-5", Questions: 1, Input: 120, Output: 80, CacheRead: 4000}

func (f *fakeAnswerer) Model() string { return "test-model" }

func (f *fakeAnswerer) Answer(_ context.Context, r setuphelp.Request) (setuphelp.Reply, error) {
	f.got = &r
	if f.err != nil && !errors.Is(f.err, setuphelp.ErrDeclined) {
		return setuphelp.Reply{}, f.err
	}
	return setuphelp.Reply{Text: f.answer, Usage: oneQuestion}, f.err
}

type fakeUsage struct {
	parents []string
	total   domain.AssistantUsage
}

func (f *fakeUsage) RecordAssistantUsage(_ context.Context, parentID string, _ time.Time, u domain.AssistantUsage) error {
	f.parents = append(f.parents, parentID)
	f.total = f.total.Add(u)
	return nil
}
func (f *fakeUsage) AssistantUsageByAccount(context.Context, time.Time, int) ([]domain.AccountAssistantUsage, error) {
	return nil, nil
}
func (f *fakeUsage) AssistantUsageByDay(context.Context, time.Time, int) ([]domain.DayAssistantUsage, error) {
	return nil, nil
}
func (f *fakeUsage) PurgeAssistantUsage(context.Context, time.Time) (int64, error) { return 0, nil }

func TestSetupHelpCountsUsageForAnswersAndDeclinesButNotFailures(t *testing.T) {
	usage := &fakeUsage{}
	h := testHandlers(nil)
	h.AssistantUsage = usage

	h.SetupHelp = &fakeAnswerer{answer: "ok"}
	h.AskSetupHelp(httptest.NewRecorder(), setupHelpRequest("mine", `{"question":"q"}`))
	h.SetupHelp = &fakeAnswerer{err: setuphelp.ErrDeclined}
	h.AskSetupHelp(httptest.NewRecorder(), setupHelpRequest("mine", `{"question":"q"}`))
	h.SetupHelp = &fakeAnswerer{err: errors.New("upstream down")}
	h.AskSetupHelp(httptest.NewRecorder(), setupHelpRequest("mine", `{"question":"q"}`))

	if usage.total.Questions != 2 || usage.total.Input != 240 || len(usage.parents) != 2 || usage.parents[0] == "" {
		t.Fatalf("recorded %+v for %v", usage.total, usage.parents)
	}
}

func setupHelpRequest(token, body string) *http.Request {
	r := httptest.NewRequest(http.MethodPost, "/api/v1/console/setup-help", strings.NewReader(body))
	if token != "" {
		r.Header.Set("Authorization", "Bearer "+token)
	}
	return r
}

func TestSetupHelpAnswersASignedInParentWithRedactedQuestion(t *testing.T) {
	fake := &fakeAnswerer{answer: "1. Open Wireless debugging again."}
	h := testHandlers(nil)
	h.SetupHelp = fake

	w := httptest.NewRecorder()
	h.AskSetupHelp(w, setupHelpRequest("mine", `{"question":"stuck, code 482913","step":"pairing","maker":"samsung","language":"en"}`))
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), "Wireless debugging") {
		t.Fatalf("%d %s", w.Code, w.Body.String())
	}
	if fake.got == nil || strings.Contains(fake.got.Question, "482913") || fake.got.Maker != "Samsung" {
		t.Fatalf("sent to the assistant: %+v", fake.got)
	}
}

func TestSetupHelpRefusesWithoutSessionAndChecksInput(t *testing.T) {
	h := testHandlers(nil)
	h.SetupHelp = &fakeAnswerer{answer: "ok"}

	w := httptest.NewRecorder()
	h.AskSetupHelp(w, setupHelpRequest("", `{"question":"q"}`))
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("no session: %d", w.Code)
	}

	w = httptest.NewRecorder()
	h.AskSetupHelp(w, setupHelpRequest("mine", `{"question":"q","step":"nonsense"}`))
	if w.Code != http.StatusBadRequest || !strings.Contains(w.Body.String(), "step") {
		t.Fatalf("bad step: %d %s", w.Code, w.Body.String())
	}
}

func TestSetupHelpOffWithoutKeyDeclinedAndFailed(t *testing.T) {
	h := testHandlers(nil)

	w := httptest.NewRecorder()
	h.GetSetupHelp(w, setupHelpRequest("mine", ""))
	if !strings.Contains(w.Body.String(), `"available":false`) {
		t.Fatalf("availability: %s", w.Body.String())
	}
	w = httptest.NewRecorder()
	h.AskSetupHelp(w, setupHelpRequest("mine", `{"question":"q"}`))
	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("off: %d", w.Code)
	}

	h.SetupHelp = &fakeAnswerer{err: setuphelp.ErrDeclined}
	w = httptest.NewRecorder()
	h.AskSetupHelp(w, setupHelpRequest("mine", `{"question":"q"}`))
	if w.Code != http.StatusUnprocessableEntity {
		t.Fatalf("declined: %d", w.Code)
	}

	h.SetupHelp = &fakeAnswerer{err: setuphelp.ErrBusy}
	w = httptest.NewRecorder()
	h.AskSetupHelp(w, setupHelpRequest("mine", `{"question":"q"}`))
	if w.Code != http.StatusServiceUnavailable || !strings.Contains(w.Body.String(), "assistant_busy") || w.Header().Get("Retry-After") != "60" {
		t.Fatalf("busy: %d %s", w.Code, w.Body.String())
	}

	h.SetupHelp = &fakeAnswerer{err: &setuphelp.BusyError{RetryAfter: 5 * time.Hour}}
	w = httptest.NewRecorder()
	h.AskSetupHelp(w, setupHelpRequest("mine", `{"question":"q"}`))
	if w.Code != http.StatusServiceUnavailable || !strings.Contains(w.Body.String(), "assistant_quota") || w.Header().Get("Retry-After") != "18000" {
		t.Fatalf("daily quota: %d %s %q", w.Code, w.Body.String(), w.Header().Get("Retry-After"))
	}

	h.SetupHelp = &fakeAnswerer{err: errors.New("upstream down")}
	w = httptest.NewRecorder()
	h.AskSetupHelp(w, setupHelpRequest("mine", `{"question":"q"}`))
	if w.Code != http.StatusBadGateway {
		t.Fatalf("failed: %d", w.Code)
	}
}

func TestSetupHelpIsLimitedPerParent(t *testing.T) {
	h := testHandlers(nil)
	h.SetupHelp = &fakeAnswerer{answer: "ok"}
	h.SetupHelpLimiter = guard.NewLimiter(2, time.Hour)
	for i := 0; i < 2; i++ {
		w := httptest.NewRecorder()
		h.AskSetupHelp(w, setupHelpRequest("mine", `{"question":"q"}`))
		if w.Code != http.StatusOK {
			t.Fatalf("try %d: %d", i, w.Code)
		}
	}
	w := httptest.NewRecorder()
	h.AskSetupHelp(w, setupHelpRequest("mine", `{"question":"q"}`))
	if w.Code != http.StatusTooManyRequests {
		t.Fatalf("third: %d", w.Code)
	}
}
