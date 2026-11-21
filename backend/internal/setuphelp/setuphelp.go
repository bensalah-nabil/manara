// Package setuphelp answers a parent's question about setting up Manara on their child's phone,
// with Claude and the setup knowledge in knowledge.md.
//
// What is sent to Claude, and only that: the parent's question and the last few turns of the
// same conversation, with digit runs (pairing codes, phone numbers) and email addresses removed
// first; the setup step the console shows; the phone's maker; the language. No name, account,
// phone id, rule or activity. Nothing is stored here, and no question text is logged.
package setuphelp

import (
	"context"
	_ "embed"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"unicode/utf8"

	"github.com/anthropics/anthropic-sdk-go/v2"
	"github.com/anthropics/anthropic-sdk-go/v2/option"

	"manara/backend/internal/domain"
)

//go:embed knowledge.md
var knowledge string

// Limits on what a request may carry.
const (
	MaxQuestion = 1000 // characters
	MaxTurns    = 6    // earlier turns kept, questions and answers together
	MaxTurnText = 2000 // characters per earlier turn
)

// Steps the console may name: domain.SetupSteps, plus "before" (no setup yet) and "add_phone".
var steps = map[string]bool{
	"": true, "before": true, "add_phone": true, "linked": true, "pairing": true, "checking_accounts": true,
	"waiting_for_accounts": true, "removing_app_accounts": true, "device_owner": true,
	"restoring_apps": true, "reconnecting": true, "done": true,
}

var statuses = map[string]bool{"": true, "in_progress": true, "waiting_for_parent": true, "failed": true, "done": true}

var languages = map[string]string{"fr": "French", "ar": "Arabic", "en": "English"}

// Turn is an earlier question or answer in the same conversation.
type Turn struct {
	Role string `json:"role"` // "parent" or "assistant"
	Text string `json:"text"`
}

// Request is what the console sends.
type Request struct {
	Question string `json:"question"`
	Step     string `json:"step"`
	Status   string `json:"status"`
	Maker    string `json:"maker"`
	Language string `json:"language"`
	History  []Turn `json:"history"`
}

// ErrInvalid means the request is malformed; Field names what.
type ErrInvalid struct{ Field string }

func (e *ErrInvalid) Error() string { return "setuphelp: invalid " + e.Field }

// ErrDeclined means the model declined to answer (a refusal); the console shows a fallback.
var ErrDeclined = errors.New("setuphelp: declined")

// ErrBusy means the provider's rate limit was reached (Groq's free plan allows about one question a
// minute); the console says to try again in a minute.
var ErrBusy = errors.New("setuphelp: busy")

// Normalize checks the request and removes what must not leave the server.
func (r Request) Normalize() (Request, error) {
	r.Question = Redact(strings.TrimSpace(r.Question))
	if r.Question == "" || utf8.RuneCountInString(r.Question) > MaxQuestion {
		return r, &ErrInvalid{"question"}
	}
	if !steps[r.Step] {
		return r, &ErrInvalid{"step"}
	}
	if !statuses[r.Status] {
		return r, &ErrInvalid{"status"}
	}
	r.Maker = makerName(r.Maker)
	if _, ok := languages[r.Language]; !ok {
		r.Language = "fr"
	}
	if len(r.History) > MaxTurns {
		r.History = r.History[len(r.History)-MaxTurns:]
	}
	history := make([]Turn, 0, len(r.History))
	for _, t := range r.History {
		if t.Role != "parent" && t.Role != "assistant" {
			return r, &ErrInvalid{"history"}
		}
		text := strings.TrimSpace(t.Text)
		if text == "" {
			continue
		}
		if utf8.RuneCountInString(text) > MaxTurnText {
			text = string([]rune(text)[:MaxTurnText])
		}
		history = append(history, Turn{Role: t.Role, Text: Redact(text)})
	}
	r.History = history
	return r, nil
}

var (
	emailPattern  = regexp.MustCompile(`[^\s@]+@[^\s@]+\.[^\s@]+`)
	digitsPattern = regexp.MustCompile(`\+?\d[\d\s.:\-]{4,}\d`) // 6+ digits; spaces, dots, colons or dashes between
)

// Redact removes email addresses and runs of six or more digits (pairing and connection codes,
// phone numbers, IMEIs) before anything leaves the server.
func Redact(s string) string {
	s = emailPattern.ReplaceAllString(s, "[email removed]")
	return digitsPattern.ReplaceAllStringFunc(s, func(m string) string {
		n := 0
		for _, c := range m {
			if c >= '0' && c <= '9' {
				n++
			}
		}
		if n < 6 {
			return m
		}
		return "[number removed]"
	})
}

func makerName(m string) string {
	switch strings.ToLower(strings.TrimSpace(m)) {
	case "samsung":
		return "Samsung"
	case "xiaomi", "redmi", "poco":
		return "Xiaomi"
	case "oppo":
		return "Oppo"
	case "realme":
		return "Realme"
	case "huawei", "honor":
		return "Huawei/Honor"
	case "google", "pixel":
		return "Google Pixel"
	case "":
		return ""
	default:
		return "another brand"
	}
}

// Reply is an answer and what it used. Usage is filled in whenever the model was called, even
// when the error is ErrDeclined, so declined questions are counted too.
type Reply struct {
	Text  string
	Usage domain.AssistantUsage
}

// Answerer answers a normalized request.
type Answerer interface {
	Answer(ctx context.Context, r Request) (Reply, error)
	// Model names the model that answers, for the log and the admin console.
	Model() string
}

// ClaudeModel is the Claude model used when ANTHROPIC_API_KEY is the key set: Haiku, about 0.04 US
// cents a question (docs/setup-assistant.md).
const ClaudeModel = "claude-haiku-5-5"

// Claude answers with the Claude API.
type Claude struct {
	client anthropic.Client
}

// NewClaude makes an assistant with the given API key.
func NewClaude(apiKey string) *Claude {
	return &Claude{client: anthropic.NewClient(option.WithAPIKey(apiKey), option.WithMaxRetries(2))}
}

// instructions come first in the system prompt, the knowledge after them; shared by every provider.
const instructions = `You are Manara's setup assistant. You help a parent set up Manara, a visible parental-control
app, on their own minor child's Android phone, and fix problems during setup. Answer only from the
knowledge below; when it doesn't cover the question, say so plainly and point to the support email
or a founding-families setup call. Don't invent menu names: say how to search Settings instead.

How to answer:
- Answer in the language named in the request, simply, for a parent with no technical knowledge.
  Arabic: Modern Standard Arabic; if the parent writes in Tunisian Derja, answer in simple Derja.
- Short: the next one to four things to do, as numbered steps, then stop. No preamble.
- Use the setup step and status from the request to say where they are.
- Never ask for, and never repeat, a password, a pairing or connection code, a phone number, an
  email address or a name. If the parent shares one, tell them not to share it here.
- Manara is visible and only for the parent's own minor child. If asked to hide it, use it on an
  adult, a partner or someone else's phone, or to read messages, refuse briefly and say why.
- Never suggest factory-resetting a phone the child already uses, rooting, or turning off Play
  Protect alone.
- Accounts: before removing one, the parent must know how they'll get back in. If they can't get
  back in to a Google account, only Google's recovery can help, not Manara.

KNOWLEDGE
`

// Model is the Claude model this assistant uses.
func (c *Claude) Model() string { return ClaudeModel }

// Answer asks Claude.
func (c *Claude) Answer(ctx context.Context, r Request) (Reply, error) {
	resp, err := c.client.Beta.Messages.New(ctx, anthropic.BetaMessageNewParams{
		Model:     ClaudeModel,
		MaxTokens: 4000,
		System: []anthropic.BetaTextBlockParam{{
			Text:         instructions + knowledge,
			CacheControl: anthropic.NewBetaCacheControlEphemeralParam(),
		}},
		OutputConfig: anthropic.BetaOutputConfigParam{Effort: anthropic.BetaOutputConfigEffortLow},
		Messages:     Conversation(r),
	})
	if err != nil {
		return Reply{}, err
	}
	reply := Reply{Usage: domain.AssistantUsage{
		Model:      ClaudeModel,
		Questions:  1,
		Input:      resp.Usage.InputTokens,
		Output:     resp.Usage.OutputTokens,
		CacheRead:  resp.Usage.CacheReadInputTokens,
		CacheWrite: resp.Usage.CacheCreationInputTokens,
	}}
	if resp.StopReason == anthropic.BetaStopReasonRefusal {
		return reply, ErrDeclined
	}
	var b strings.Builder
	for _, block := range resp.Content {
		if text, ok := block.AsAny().(anthropic.BetaTextBlock); ok {
			b.WriteString(text.Text)
		}
	}
	reply.Text = strings.TrimSpace(b.String())
	if reply.Text == "" {
		return reply, ErrDeclined
	}
	return reply, nil
}

type turn struct {
	parent bool
	texts  []string
}

// turnsOf is the conversation as Claude receives it: it starts with the parent, alternates, and ends
// with the new question, which carries the language, maker, step and status.
func turnsOf(r Request) []turn {
	var turns []turn
	add := func(parent bool, text string) {
		if n := len(turns); n > 0 && turns[n-1].parent == parent {
			turns[n-1].texts = append(turns[n-1].texts, text)
			return
		}
		turns = append(turns, turn{parent: parent, texts: []string{text}})
	}
	for _, t := range r.History {
		if len(turns) == 0 && t.Role != "parent" {
			continue
		}
		add(t.Role == "parent", t.Text)
	}
	add(true, fmt.Sprintf("Language: %s. Phone maker: %s. Setup step: %s. Status: %s.\n\nQuestion: %s",
		languages[r.Language], orUnknown(r.Maker), orUnknown(r.Step), orUnknown(r.Status), r.Question))
	return turns
}

// Conversation converts turnsOf to the API's messages.
func Conversation(r Request) []anthropic.BetaMessageParam {
	var messages []anthropic.BetaMessageParam
	for _, t := range turnsOf(r) {
		blocks := make([]anthropic.BetaContentBlockParamUnion, 0, len(t.texts))
		for _, text := range t.texts {
			blocks = append(blocks, anthropic.NewBetaTextBlock(text))
		}
		if t.parent {
			messages = append(messages, anthropic.NewBetaUserMessage(blocks...))
		} else {
			messages = append(messages, anthropic.BetaMessageParam{OfAssistant: &anthropic.BetaAssistantMessageParam{Content: blocks}})
		}
	}
	return messages
}

func orUnknown(s string) string {
	if s == "" {
		return "unknown"
	}
	return s
}
