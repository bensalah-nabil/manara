package domain

import (
	"context"
	"time"
)

// AssistantUsage is what one or more setup-assistant answers used (docs/setup-assistant.md):
// token counts only, never the question or the answer.
type AssistantUsage struct {
	Model      string `json:"model"`
	Questions  int64  `json:"questions"`
	Input      int64  `json:"inputTokens"`
	Output     int64  `json:"outputTokens"`
	CacheRead  int64  `json:"cacheReadTokens"`
	CacheWrite int64  `json:"cacheWriteTokens"`
}

// Add sums two usages of the same model.
func (u AssistantUsage) Add(o AssistantUsage) AssistantUsage {
	u.Questions += o.Questions
	u.Input += o.Input
	u.Output += o.Output
	u.CacheRead += o.CacheRead
	u.CacheWrite += o.CacheWrite
	return u
}

// ModelPrice is a model's list price in US dollars per million tokens.
type ModelPrice struct {
	Input  float64
	Output float64
}

// AssistantPrices: Anthropic's list prices (prompts up to 100K tokens), read 2026-11-21. A model
// missing here is shown with no cost and marked, rather than guessed.
var AssistantPrices = map[string]ModelPrice{
	"claude-haiku-5-5": {Input: 0.10, Output: 0.50},
	// Groq's free plan (docs/setup-assistant.md): no charge within its limits.
	"openai/gpt-oss-120b": {Input: 0, Output: 0},
	"claude-sonnet-5-5":   {Input: 2.00, Output: 10.00},
	"claude-opus-5-5":     {Input: 4.00, Output: 20.00},
}

// Prompt-cache multipliers on the input price: writing a 5-minute cache entry costs 1.25 times,
// reading one 0.1 times. Anthropic's standard rates; an estimate until checked against the bill.
const (
	cacheWriteMultiplier = 1.25
	cacheReadMultiplier  = 0.10
)

// CostUSD estimates what u cost. ok is false when the model's price isn't known.
func (u AssistantUsage) CostUSD() (cost float64, ok bool) {
	p, ok := AssistantPrices[u.Model]
	if !ok {
		return 0, false
	}
	in := float64(u.Input) + cacheWriteMultiplier*float64(u.CacheWrite) + cacheReadMultiplier*float64(u.CacheRead)
	return (in*p.Input + float64(u.Output)*p.Output) / 1e6, true
}

// AssistantUsageRetention: usage rows older than this are deleted by the retention sweep.
const AssistantUsageRetention = 400 * 24 * time.Hour

// AccountAssistantUsage is one account's use of the assistant over a period, per model.
type AccountAssistantUsage struct {
	AccountID string    `json:"accountId"`
	Email     string    `json:"email"`
	LastDay   time.Time `json:"lastDay"`
	AssistantUsage
}

// DayAssistantUsage is every account's use on one day (in StatsTimeZone), per model.
type DayAssistantUsage struct {
	Day time.Time `json:"day"`
	AssistantUsage
}

// AssistantUsageStore keeps the counts per account, day and model. Rows go with the account.
type AssistantUsageStore interface {
	// RecordAssistantUsage adds u to the parent's row for at's day in StatsTimeZone (computed by
	// the database: the server image has no time-zone files).
	RecordAssistantUsage(ctx context.Context, parentID string, at time.Time, u AssistantUsage) error
	// AssistantUsageByAccount: the last days days up to now's day, per account and model.
	AssistantUsageByAccount(ctx context.Context, now time.Time, days int) ([]AccountAssistantUsage, error)
	// AssistantUsageByDay: every one of the last days days, per model; a day with no use comes
	// back once with an empty Model.
	AssistantUsageByDay(ctx context.Context, now time.Time, days int) ([]DayAssistantUsage, error)
	PurgeAssistantUsage(ctx context.Context, before time.Time) (int64, error)
}
