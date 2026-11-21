package setuphelp

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"manara/backend/internal/domain"
)

func groqServer(t *testing.T, status int, body string, seen *chatRequest) *Groq {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer test-key" {
			t.Errorf("auth header = %q", r.Header.Get("Authorization"))
		}
		if seen != nil {
			_ = json.NewDecoder(r.Body).Decode(seen)
		}
		w.WriteHeader(status)
		_, _ = w.Write([]byte(body))
	}))
	t.Cleanup(srv.Close)
	return &Groq{Key: "test-key", URL: srv.URL, HTTP: srv.Client()}
}

func TestGroqSendsTheConversationAndCountsTokens(t *testing.T) {
	var seen chatRequest
	g := groqServer(t, http.StatusOK, `{"choices":[{"message":{"content":" 1. Open Wireless debugging. "},"finish_reason":"stop"}],
		"usage":{"prompt_tokens":4600,"completion_tokens":180,"prompt_tokens_details":{"cached_tokens":4000}}}`, &seen)
	r, _ := Request{Question: "stuck on pairing", Step: "pairing", Language: "en", History: []Turn{{Role: "parent", Text: "hi"}, {Role: "assistant", Text: "hello"}}}.Normalize()

	reply, err := g.Answer(context.Background(), r)
	if err != nil || reply.Text != "1. Open Wireless debugging." {
		t.Fatalf("reply %+v, %v", reply, err)
	}
	if reply.Usage != (domain.AssistantUsage{Model: GroqModel, Questions: 1, Input: 600, Output: 180, CacheRead: 4000}) {
		t.Fatalf("usage %+v", reply.Usage)
	}
	if seen.Model != GroqModel || seen.ReasoningEffort != "low" || len(seen.Messages) != 4 ||
		seen.Messages[0].Role != "system" || !strings.Contains(seen.Messages[0].Content, "Wireless debugging") ||
		seen.Messages[3].Role != "user" || !strings.Contains(seen.Messages[3].Content, "Question: stuck on pairing") {
		t.Fatalf("request %+v", seen)
	}
}

func TestGroqRateLimitIsBusyAndOtherErrorsFail(t *testing.T) {
	r, _ := Request{Question: "q"}.Normalize()
	if _, err := groqServer(t, http.StatusTooManyRequests, `{"error":{"message":"rate limit"}}`, nil).Answer(context.Background(), r); !errors.Is(err, ErrBusy) {
		t.Fatalf("429: %v", err)
	}
	_, err := groqServer(t, http.StatusUnauthorized, `{"error":{"message":"Invalid API Key"}}`, nil).Answer(context.Background(), r)
	if err == nil || errors.Is(err, ErrBusy) || !strings.Contains(err.Error(), "401") {
		t.Fatalf("401: %v", err)
	}
	if _, err := groqServer(t, http.StatusOK, `{"choices":[{"message":{"content":""},"finish_reason":"content_filter"}]}`, nil).Answer(context.Background(), r); !errors.Is(err, ErrDeclined) {
		t.Fatalf("filtered: %v", err)
	}
}
