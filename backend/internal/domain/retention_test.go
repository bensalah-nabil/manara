package domain

import (
	"testing"
	"time"
)

func TestEveryEventKindHasALimitedRetention(t *testing.T) {
	want := map[EventKind]time.Duration{
		EventKindUsageReport: 30 * 24 * time.Hour,
		EventKindLocation:    30 * 24 * time.Hour,
		EventKindEnforcement: 90 * 24 * time.Hour,
		EventKindUsage:       90 * 24 * time.Hour,
	}
	for kind, d := range want {
		if got := RetentionFor(kind); got != d {
			t.Errorf("%s kept %v, want %v", kind, got, d)
		}
	}
	if len(AllEventKinds) != 8 {
		t.Errorf("AllEventKinds has %d kinds; a new kind needs adding there", len(AllEventKinds))
	}
	for _, kind := range AllEventKinds {
		if d := RetentionFor(kind); d <= 0 || d > 90*24*time.Hour {
			t.Errorf("%s kept %v", kind, d)
		}
	}
}
