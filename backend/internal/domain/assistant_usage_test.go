package domain

import (
	"math"
	"testing"
)

func TestAssistantCostCountsCacheAtItsRate(t *testing.T) {
	u := AssistantUsage{Model: "claude-haiku-5-5", Questions: 1, Input: 1_000_000, Output: 1_000_000, CacheRead: 1_000_000, CacheWrite: 1_000_000}
	cost, ok := u.CostUSD()
	// 0.10 input + 0.50 output + 0.01 cache read + 0.125 cache write
	if !ok || math.Abs(cost-0.735) > 1e-9 {
		t.Fatalf("cost = %v, %v", cost, ok)
	}
	if _, ok := (AssistantUsage{Model: "some-new-model", Input: 10}).CostUSD(); ok {
		t.Fatal("an unknown model must not get a guessed price")
	}
}

func TestAssistantUsageAdds(t *testing.T) {
	a := AssistantUsage{Model: "m", Questions: 1, Input: 2, Output: 3, CacheRead: 4, CacheWrite: 5}
	if got := a.Add(a); got != (AssistantUsage{Model: "m", Questions: 2, Input: 4, Output: 6, CacheRead: 8, CacheWrite: 10}) {
		t.Fatalf("%+v", got)
	}
}
