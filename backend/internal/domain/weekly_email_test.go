package domain

import (
	"testing"
	"time"
)

func tunis(year int, month time.Month, day, hour, minute int) time.Time {
	return time.Date(year, month, day, hour, minute, 0, 0, WeeklyEmailZone)
}

func TestReportWeekIsLastMondayToSundayFromMondayAt8InTunis(t *testing.T) {
	week, end := tunis(2026, 11, 9, 0, 0), tunis(2026, 11, 16, 0, 0)
	cases := []struct {
		name string
		now  time.Time
		ok   bool
	}{
		{"Monday 08:00 Tunis, given in UTC", time.Date(2026, 11, 16, 7, 0, 0, 0, time.UTC), true},
		{"Monday afternoon", tunis(2026, 11, 16, 15, 30), true},
		{"Wednesday 07:59, the last minute", tunis(2026, 11, 18, 7, 59), true},
	}
	for _, c := range cases {
		start, stop, ok := ReportWeek(c.now)
		if !ok || !start.Equal(week) || !stop.Equal(end) {
			t.Errorf("%s: got %s to %s (%v), want %s to %s", c.name, start, stop, ok, week, end)
		}
	}
	for _, now := range []time.Time{
		tunis(2026, 11, 16, 7, 59),                      // before the send time
		time.Date(2026, 11, 15, 23, 30, 0, 0, time.UTC), // already Monday in Tunis, but 00:30
		tunis(2026, 11, 18, 8, 0),                       // two days late
		tunis(2026, 11, 21, 12, 0),                      // Saturday
	} {
		if _, _, ok := ReportWeek(now); ok {
			t.Errorf("at %s an email is due, want none", now)
		}
	}
}

func TestReportWeekCrossesTheYear(t *testing.T) {
	start, end, ok := ReportWeek(tunis(2027, 1, 4, 9, 0))
	if !ok || !start.Equal(tunis(2026, 12, 28, 0, 0)) || !end.Equal(tunis(2027, 1, 4, 0, 0)) {
		t.Fatalf("got %s to %s (%v)", start, end, ok)
	}
}

func TestAWeeklyEmailIsTriedUntilItIsSettled(t *testing.T) {
	week := tunis(2026, 11, 9, 0, 0)
	now := tunis(2026, 11, 16, 8, 0)
	var e WeeklyEmail
	if !e.Claim(week, now) {
		t.Fatal("a new week's email is not due")
	}
	if e.Claim(week, now) {
		t.Fatal("a claimed email can be claimed again at once")
	}
	e.Failed(now)
	if e.Claim(week, now.Add(59*time.Second)) || !e.Claim(week, now.Add(time.Minute)) {
		t.Fatal("a failed email is not tried again one minute later")
	}
	e.Failed(now.Add(time.Minute))
	if e.Tries != 2 || !e.NextTry.Equal(now.Add(3*time.Minute)) {
		t.Fatalf("after two failures: %+v, want the next try 2 minutes after the second", e)
	}
	e.Settle(week)
	if e.Claim(week, now.Add(time.Hour)) {
		t.Fatal("a settled week's email is due again")
	}
	if e.Claim(tunis(2026, 11, 2, 0, 0), now.Add(time.Hour)) {
		t.Fatal("an earlier week's email is due after a later one was settled")
	}
	next := week.AddDate(0, 0, 7)
	if !e.Claim(next, now.AddDate(0, 0, 7)) {
		t.Fatal("the next week's email is not due")
	}
}

func TestFailuresOfOneWeekDoNotDelayTheNext(t *testing.T) {
	week := tunis(2026, 11, 9, 0, 0)
	now := tunis(2026, 11, 16, 8, 0)
	var e WeeklyEmail
	for i := 0; i < 10; i++ {
		e.Claim(week, now)
		e.Failed(now)
	}
	later := now.AddDate(0, 0, 7)
	if !e.Claim(week.AddDate(0, 0, 7), later) || e.Tries != 0 {
		t.Fatalf("the next week starts at %+v, want a fresh try", e)
	}
}
