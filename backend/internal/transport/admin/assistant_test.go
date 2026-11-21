package admin

import (
	"math"
	"testing"
	"time"

	"manara/backend/internal/domain"
)

func TestAssistantUsageSummaryAddsModelsAndRanksAccountsByCost(t *testing.T) {
	d1 := time.Date(2026, 11, 20, 0, 0, 0, 0, time.UTC)
	d2 := d1.AddDate(0, 0, 1)
	haiku := func(q, in, out int64) domain.AssistantUsage {
		return domain.AssistantUsage{Model: "claude-haiku-5-5", Questions: q, Input: in, Output: out}
	}
	byDay := []domain.DayAssistantUsage{
		{Day: d1, AssistantUsage: domain.AssistantUsage{}}, // a quiet day
		{Day: d2, AssistantUsage: haiku(3, 3_000_000, 0)},
		{Day: d2, AssistantUsage: domain.AssistantUsage{Model: "mystery", Questions: 1, Input: 10}},
	}
	byAccount := []domain.AccountAssistantUsage{
		{AccountID: "a", Email: "a@example.com", LastDay: d1, AssistantUsage: haiku(1, 1_000_000, 0)},
		{AccountID: "b", Email: "b@example.com", LastDay: d2, AssistantUsage: haiku(2, 2_000_000, 0)},
		{AccountID: "a", Email: "a@example.com", LastDay: d2, AssistantUsage: domain.AssistantUsage{Model: "mystery", Questions: 1, Input: 10}},
	}
	v := summarizeAssistantUsage(7, byDay, byAccount)

	if len(v.PerDay) != 2 || v.PerDay[0].Questions != 0 || v.PerDay[1].Questions != 4 {
		t.Fatalf("per day: %+v", v.PerDay)
	}
	if math.Abs(v.Total.CostUSD-0.30) > 1e-9 || v.Total.PriceKnown {
		t.Fatalf("total: %+v (an unpriced model must be flagged)", v.Total)
	}
	if !v.PerDay[0].PriceKnown {
		t.Fatal("a quiet day isn't missing a price")
	}
	if len(v.Accounts) != 2 || v.Accounts[0].AccountID != "b" {
		t.Fatalf("accounts not ranked by cost: %+v", v.Accounts)
	}
	a := v.Accounts[1]
	if a.Questions != 2 || len(a.Models) != 2 || !a.LastDay.Equal(d2) || a.PriceKnown {
		t.Fatalf("account a: %+v", a)
	}
}
