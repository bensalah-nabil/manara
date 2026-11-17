package domain

import (
	"context"
	"time"
)

// An alert email says the same thing for every alert ("a phone needs your
// attention"), so each parent is owed at most one at a time. Alerts that
// arrive together share it, and a send that fails stays owed and is tried
// again. Brevo once refused every send for hours, and nothing but the
// server's log showed it (CLAUDE.md, "Brevo refuses mail from an IP...").
const (
	// AlertEmailQuiet: after an alert email, none for this long. An alert
	// that comes sooner adds nothing the console doesn't already show.
	AlertEmailQuiet = 10 * time.Minute
	// alertEmailHold keeps a claimed email from being tried twice at once.
	// If the server dies mid-send, the email is tried again after it.
	alertEmailHold = 2 * time.Minute
	// alertEmailMaxTries: with the schedule in Failed, about a day.
	alertEmailMaxTries = 30
)

// AlertEmail is what is stored about one parent's alert email: times only,
// never content. A zero time means none.
type AlertEmail struct {
	// ReportedAt is the earliest report not yet emailed; zero when nothing
	// is owed. The email shows it.
	ReportedAt time.Time
	// NextTry is when the owed email may next be tried.
	NextTry time.Time
	// Tries counts the failed sends of the owed email.
	Tries    int
	LastSent time.Time
}

// Owed reports whether an email is owed.
func (e AlertEmail) Owed() bool { return !e.ReportedAt.IsZero() }

// Owe records a report made at reportedAt, seen at now. An email already
// owed keeps its schedule and the earlier report; one sent less than
// AlertEmailQuiet ago already covers the report.
func (e *AlertEmail) Owe(reportedAt, now time.Time) {
	if e.Owed() {
		if reportedAt.Before(e.ReportedAt) {
			e.ReportedAt = reportedAt
		}
		return
	}
	if !e.LastSent.IsZero() && now.Sub(e.LastSent) < AlertEmailQuiet {
		return
	}
	e.ReportedAt, e.NextTry, e.Tries = reportedAt, now, 0
}

// Claim takes the owed email for one try if it is due at now, and holds it
// so that no other sender tries it meanwhile.
func (e *AlertEmail) Claim(now time.Time) bool {
	if !e.Owed() || now.Before(e.NextTry) {
		return false
	}
	e.NextTry = now.Add(alertEmailHold)
	return true
}

// Sent settles the owed email.
func (e *AlertEmail) Sent(now time.Time) {
	*e = AlertEmail{LastSent: now}
}

// Failed schedules the next try, 1, 2, 4 ... 32 minutes and then hourly
// after each failure, and reports true. After alertEmailMaxTries it drops
// the email instead and reports false.
func (e *AlertEmail) Failed(now time.Time) bool {
	e.Tries++
	if e.Tries >= alertEmailMaxTries {
		e.Drop()
		return false
	}
	wait := time.Hour
	if e.Tries <= 6 {
		wait = time.Minute << (e.Tries - 1)
	}
	e.NextTry = now.Add(wait)
	return true
}

// Drop gives up the owed email: no address to send it to, or too many tries.
func (e *AlertEmail) Drop() {
	*e = AlertEmail{LastSent: e.LastSent}
}

// AlertEmailRepository stores each parent's AlertEmail.
type AlertEmailRepository interface {
	// Update runs change on parentID's AlertEmail (zero if there is none
	// yet) under a lock, and saves what change leaves.
	Update(ctx context.Context, parentID string, change func(*AlertEmail)) error
	// Due lists the parents whose owed email may be tried at now.
	Due(ctx context.Context, now time.Time) ([]string, error)
}
