package domain

import (
	"context"
	"time"
)

// The weekly email (roadmap P8) tells a parent that last week's report is
// ready in the console. Like the alert email it carries no figure and no
// phone's name: Brevo's terms let it train its AI on email content
// (docs/privacy/dpa-brevo.md, §6.7), so the figures stay in the console. It
// goes on Monday morning to each parent who has it on and a phone that
// reported daily usage during the week.

// WeeklyEmailZone is Tunisia's time, UTC+1 all year (no daylight saving since
// 2009). Parents have no stored time zone, and the families are in Tunisia.
var WeeklyEmailZone = time.FixedZone("UTC+1", 60*60)

const (
	// weeklyEmailHour: Monday at 08:00, for the week Monday to Sunday just ended.
	weeklyEmailHour = 8
	// WeeklyEmailLate: this long after Monday 08:00, last week's email is no
	// longer sent. A server asleep for days, or an email turned back on
	// midweek, must not send a stale one.
	WeeklyEmailLate = 48 * time.Hour
	// weeklyEmailHold keeps a claimed email from being tried twice at once.
	weeklyEmailHold = 2 * time.Minute
)

// ReportWeek returns the week [start, end), Monday to Monday in
// WeeklyEmailZone, whose email may go out at now, and false when it is too
// late for any (WeeklyEmailLate).
func ReportWeek(now time.Time) (start, end time.Time, ok bool) {
	t := now.In(WeeklyEmailZone)
	sinceMonday := (int(t.Weekday()) + 6) % 7
	end = time.Date(t.Year(), t.Month(), t.Day()-sinceMonday, 0, 0, 0, 0, WeeklyEmailZone)
	send := end.Add(weeklyEmailHour * time.Hour)
	if t.Before(send) {
		end = end.AddDate(0, 0, -7)
		send = end.Add(weeklyEmailHour * time.Hour)
	}
	return end.AddDate(0, 0, -7), end, now.Sub(send) < WeeklyEmailLate
}

// WeeklyEmail is what is stored about one parent's weekly email: times only,
// never content. A zero time means none.
type WeeklyEmail struct {
	// Settled is the start of the last week whose email is done with: sent,
	// or nothing to send (no address, or the parent turned it off).
	Settled time.Time
	// Trying is the week that Tries and NextTry count for.
	Trying  time.Time
	NextTry time.Time
	Tries   int
}

// Claim takes week's email for one try if it isn't settled and a try is due
// at now, and holds it so that no other sender tries it meanwhile.
func (e *WeeklyEmail) Claim(week, now time.Time) bool {
	if !e.Settled.IsZero() && !e.Settled.Before(week) {
		return false
	}
	if !e.Trying.Equal(week) {
		e.Trying, e.Tries, e.NextTry = week, 0, time.Time{}
	}
	if now.Before(e.NextTry) {
		return false
	}
	e.NextTry = now.Add(weeklyEmailHold)
	return true
}

// Settle records week's email as done with.
func (e *WeeklyEmail) Settle(week time.Time) {
	*e = WeeklyEmail{Settled: week}
}

// Failed schedules the next try on the alert email's schedule. The tries end
// when ReportWeek says the week is too late.
func (e *WeeklyEmail) Failed(now time.Time) {
	e.Tries++
	e.NextTry = now.Add(retryWait(e.Tries))
}

// WeeklyEmailRepository stores each parent's WeeklyEmail.
type WeeklyEmailRepository interface {
	// Update runs change on parentID's WeeklyEmail (zero if there is none
	// yet) under a lock, and saves what change leaves.
	Update(ctx context.Context, parentID string, change func(*WeeklyEmail)) error
	// Due lists the parents owed the email for the week [week, end) at now:
	// the email on, an address, a phone that sent a usage report in the
	// week, the week not settled, and no try waiting or held.
	Due(ctx context.Context, week, end, now time.Time) ([]string, error)
}
