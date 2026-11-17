package domain

import (
	"testing"
	"time"
)

var e0 = time.Date(2026, 11, 17, 19, 40, 0, 0, time.UTC)

func TestAlertsThatComeTogetherShareOneEmail(t *testing.T) {
	var e AlertEmail
	e.Owe(e0, e0)
	if !e.Claim(e0) {
		t.Fatal("a new owed email is not due at once")
	}
	e.Sent(e0)

	e.Owe(e0, e0.Add(time.Second)) // the second problem from the same sync
	e.Owe(e0.Add(5*time.Minute), e0.Add(5*time.Minute))
	if e.Owed() {
		t.Fatalf("an email sent %s ago did not cover the report: %+v", 5*time.Minute, e)
	}

	later := e0.Add(AlertEmailQuiet)
	e.Owe(later, later)
	if !e.Owed() || !e.Claim(later) {
		t.Fatalf("a report %s after the last email is not owed: %+v", AlertEmailQuiet, e)
	}
}

func TestAnOwedEmailShowsTheEarliestReport(t *testing.T) {
	var e AlertEmail
	e.Owe(e0, e0.Add(time.Minute))
	e.Owe(e0.Add(-time.Hour), e0.Add(2*time.Minute)) // a phone that was offline
	e.Owe(e0.Add(time.Hour), e0.Add(3*time.Minute))
	if !e.ReportedAt.Equal(e0.Add(-time.Hour)) {
		t.Fatalf("ReportedAt = %s, want the earliest report", e.ReportedAt)
	}
	if !e.NextTry.Equal(e0.Add(time.Minute)) {
		t.Fatalf("a later report moved the schedule: NextTry = %s", e.NextTry)
	}
}

func TestAClaimedEmailIsNotTriedTwiceAtOnce(t *testing.T) {
	var e AlertEmail
	e.Owe(e0, e0)
	if !e.Claim(e0) {
		t.Fatal("not due")
	}
	if e.Claim(e0.Add(time.Second)) {
		t.Fatal("claimed twice")
	}
	// The first sender died without settling: the email is tried again.
	if !e.Claim(e0.Add(alertEmailHold)) {
		t.Fatal("an unsettled claim held the email forever")
	}
}

func TestAFailedEmailIsTriedAgainForAboutADay(t *testing.T) {
	var e AlertEmail
	e.Owe(e0, e0)
	now := e0
	var waits []time.Duration
	for e.Claim(now) {
		if !e.Failed(now) {
			break
		}
		waits = append(waits, e.NextTry.Sub(now))
		if e.Claim(e.NextTry.Add(-time.Second)) {
			t.Fatalf("tried before its time (try %d)", e.Tries)
		}
		now = e.NextTry
	}
	want := []time.Duration{1, 2, 4, 8, 16, 32, 60}
	for i, w := range want {
		if waits[i] != w*time.Minute {
			t.Fatalf("wait %d = %s, want %s (all: %v)", i+1, waits[i], w*time.Minute, waits)
		}
	}
	if e.Owed() {
		t.Fatalf("still owed after %d failures", alertEmailMaxTries)
	}
	if span := now.Sub(e0); span < 23*time.Hour || span > 25*time.Hour {
		t.Fatalf("gave up after %s, want about a day", span)
	}
}

func TestADroppedEmailKeepsTheQuietTime(t *testing.T) {
	var e AlertEmail
	e.Sent(e0)
	e.Owe(e0.Add(AlertEmailQuiet), e0.Add(AlertEmailQuiet))
	e.Drop()
	if e.Owed() || !e.LastSent.Equal(e0) {
		t.Fatalf("after Drop: %+v", e)
	}
}
