package domain

import (
	"testing"
	"time"
)

func TestCleanRemovesNULEverywhereAndClampsFutureTimes(t *testing.T) {
	now := time.Date(2026, 11, 21, 12, 0, 0, 0, time.UTC)
	e := &Event{
		OccurredAt: now.AddDate(3, 0, 0),
		Payload: map[string]any{
			"label\x00": "Bad\x00App",
			"nested":    map[string]any{"list": []any{"a\x00b", 3.0, true}},
		},
	}
	e.Clean(now)
	if !e.OccurredAt.Equal(now) {
		t.Fatalf("a date years ahead must become now: %v", e.OccurredAt)
	}
	if e.Payload["label"] != "BadApp" {
		t.Fatalf("payload %v", e.Payload)
	}
	list := e.Payload["nested"].(map[string]any)["list"].([]any)
	if list[0] != "ab" || list[1] != 3.0 || list[2] != true {
		t.Fatalf("nested %v", list)
	}

	ok := &Event{OccurredAt: now.Add(time.Hour), Payload: map[string]any{"package": "com.example"}}
	ok.Clean(now)
	if !ok.OccurredAt.Equal(now.Add(time.Hour)) || ok.Payload["package"] != "com.example" {
		t.Fatalf("a normal event must stay as it is: %+v", ok)
	}
}
