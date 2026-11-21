package setuphelp

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"manara/backend/internal/domain"
)

// GroqModel is the free model the assistant uses on Groq (chosen 2026-11-21, docs/setup-assistant.md):
// an open-weight model, production on Groq, multilingual. Free-plan limits read that day: 30
// requests and 8K tokens a minute, 1K requests and 200K tokens a day, for the whole account.
const GroqModel = "openai/gpt-oss-120b"

// GroqURL is Groq's chat completions endpoint (the common OpenAI-style format).
const GroqURL = "https://api.groq.com/openai/v1/chat/completions"

// Groq answers with a model hosted by Groq, over plain HTTP. By Groq's terms (read 2026-11-21) it
// keeps no inference data by default, apart from troubleshooting logs of up to 30 days that can
// be turned off in its Data Controls, and processes data only to provide the service.
type Groq struct {
	Key  string
	Name string // the model id; GroqModel when empty
	URL  string // GroqURL when empty; a test server in tests
	HTTP *http.Client
}

// NewGroq makes an assistant with the given Groq API key and model (GroqModel when empty).
func NewGroq(key, model string) *Groq {
	return &Groq{Key: key, Name: model, HTTP: &http.Client{Timeout: 50 * time.Second}}
}

func (g *Groq) Model() string {
	if g.Name == "" {
		return GroqModel
	}
	return g.Name
}

type chatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type chatRequest struct {
	Model               string        `json:"model"`
	Messages            []chatMessage `json:"messages"`
	MaxCompletionTokens int           `json:"max_completion_tokens"`
	Temperature         float64       `json:"temperature"`
	ReasoningEffort     string        `json:"reasoning_effort,omitempty"`
}

type chatResponse struct {
	Choices []struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
		FinishReason string `json:"finish_reason"`
	} `json:"choices"`
	Usage struct {
		PromptTokens        int64 `json:"prompt_tokens"`
		CompletionTokens    int64 `json:"completion_tokens"`
		PromptTokensDetails struct {
			CachedTokens int64 `json:"cached_tokens"`
		} `json:"prompt_tokens_details"`
	} `json:"usage"`
}

// chatMessages: the instructions and knowledge as the system message, then the conversation.
func chatMessages(r Request) []chatMessage {
	messages := []chatMessage{{Role: "system", Content: instructions + knowledge}}
	for _, t := range turnsOf(r) {
		role := "assistant"
		if t.parent {
			role = "user"
		}
		messages = append(messages, chatMessage{Role: role, Content: strings.Join(t.texts, "\n\n")})
	}
	return messages
}

// Answer asks the model on Groq.
func (g *Groq) Answer(ctx context.Context, r Request) (Reply, error) {
	body := chatRequest{Model: g.Model(), Messages: chatMessages(r), MaxCompletionTokens: 2000, Temperature: 0.3}
	if strings.HasPrefix(body.Model, "openai/gpt-oss") {
		// These models think before answering; a little is enough for a setup question, and
		// thinking counts against the per-minute token limit.
		body.ReasoningEffort = "low"
	}
	payload, err := json.Marshal(body)
	if err != nil {
		return Reply{}, err
	}
	url := g.URL
	if url == "" {
		url = GroqURL
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(payload))
	if err != nil {
		return Reply{}, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+g.Key)
	client := g.HTTP
	if client == nil {
		client = http.DefaultClient
	}
	resp, err := client.Do(req)
	if err != nil {
		return Reply{}, fmt.Errorf("groq: %w", err)
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return Reply{}, fmt.Errorf("groq: read: %w", err)
	}
	if resp.StatusCode == http.StatusTooManyRequests {
		return Reply{}, ErrBusy
	}
	if resp.StatusCode != http.StatusOK {
		// Groq's own error text, never the question: it doesn't echo the request.
		return Reply{}, fmt.Errorf("groq: %d %s", resp.StatusCode, strings.TrimSpace(string(raw[:min(len(raw), 400)])))
	}
	var out chatResponse
	if err := json.Unmarshal(raw, &out); err != nil {
		return Reply{}, fmt.Errorf("groq: decode: %w", err)
	}
	cached := out.Usage.PromptTokensDetails.CachedTokens
	reply := Reply{Usage: domain.AssistantUsage{
		Model:     g.Model(),
		Questions: 1,
		Input:     out.Usage.PromptTokens - cached,
		Output:    out.Usage.CompletionTokens,
		CacheRead: cached,
	}}
	if len(out.Choices) == 0 {
		return reply, ErrDeclined
	}
	choice := out.Choices[0]
	if choice.FinishReason == "content_filter" {
		return reply, ErrDeclined
	}
	reply.Text = strings.TrimSpace(choice.Message.Content)
	if reply.Text == "" {
		return reply, ErrDeclined
	}
	return reply, nil
}
