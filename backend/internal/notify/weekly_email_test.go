package notify

import (
	"context"
	"errors"
	"regexp"
	"sort"
	"strings"
	"testing"
	"time"

	"manara/backend/internal/domain"
)

// memWeekly stores each parent's WeeklyEmail in memory. Due follows the
// repository's rule for the parents listed in eligible (the email on, an
// address, usage that week); the rest is domain.WeeklyEmail's.
type memWeekly struct {
	byParent map[string]domain.WeeklyEmail
	eligible []string
	dueCalls int
}

func (m *memWeekly) Update(_ context.Context, id string, change func(*domain.WeeklyEmail)) error {
	e := m.byParent[id]
	change(&e)
	m.byParent[id] = e
	return nil
}

func (m *memWeekly) Due(_ context.Context, week, _, now time.Time) ([]string, error) {
	m.dueCalls++
	var ids []string
	for _, id := range m.eligible {
		e := m.byParent[id]
		if !e.Settled.IsZero() && !e.Settled.Before(week) {
			continue
		}
		if e.Trying.Equal(week) && now.Before(e.NextTry) {
			continue
		}
		ids = append(ids, id)
	}
	sort.Strings(ids)
	return ids, nil
}

// mondayMorning: five past eight in Tunis, on the Monday after the week of
// 2026-11-09.
var mondayMorning = time.Date(2026, 11, 16, 8, 5, 0, 0, domain.WeeklyEmailZone)

func testWeekly(parents ...*domain.Parent) (WeeklyEmails, *recordingMailer, *memWeekly, *time.Time) {
	m := &recordingMailer{}
	byID := map[string]*domain.Parent{}
	repo := &memWeekly{byParent: map[string]domain.WeeklyEmail{}}
	for _, p := range parents {
		byID[p.ID] = p
		repo.eligible = append(repo.eligible, p.ID)
	}
	clock := mondayMorning
	return WeeklyEmails{
		Parents: fakeParents{byID: byID}, Mailer: m, Emails: repo,
		ConsoleURL: "https://console.example/", Now: func() time.Time { return clock },
	}, m, repo, &clock
}

func TestTheWeeklyEmailGoesOnceOnMondayMorning(t *testing.T) {
	w, m, _, clock := testWeekly(&domain.Parent{ID: "p1", Email: "sara.mum@example.com", Language: "en", WeeklyEmail: true})
	sent, err := w.DeliverDue(context.Background())
	if err != nil || sent != 1 {
		t.Fatalf("sent %d, err %v; want 1", sent, err)
	}
	if m.to[0] != "sara.mum@example.com" || m.subject[0] != "Manara: last week's report is ready" {
		t.Fatalf("sent %q to %q", m.subject[0], m.to[0])
	}
	if !strings.Contains(m.text[0], "the week of 2026-11-09 to 2026-11-15") || !strings.Contains(m.text[0], "Open the console: https://console.example/\n") {
		t.Fatalf("text = %q", m.text[0])
	}
	*clock = clock.Add(time.Hour)
	if sent, _ := w.DeliverDue(context.Background()); sent != 0 || m.tries != 1 {
		t.Fatalf("an hour later %d more sent, want none", sent)
	}
}

func TestNoWeeklyEmailBeforeMonday8OrTwoDaysAfter(t *testing.T) {
	w, m, repo, clock := testWeekly(&domain.Parent{ID: "p1", Email: "a@example.com", WeeklyEmail: true})
	for _, at := range []time.Time{mondayMorning.Add(-6 * time.Minute), mondayMorning.Add(domain.WeeklyEmailLate)} {
		*clock = at
		if sent, err := w.DeliverDue(context.Background()); sent != 0 || err != nil {
			t.Fatalf("at %s: sent %d, err %v", at, sent, err)
		}
	}
	if m.tries != 0 || repo.dueCalls != 0 {
		t.Fatalf("outside the window: %d sends, %d lookups", m.tries, repo.dueCalls)
	}
}

// Brevo may train on email content: the email carries the week's dates and
// the console's address, never a figure or a phone.
func TestTheWeeklyEmailCarriesNoFigureInAnyLanguage(t *testing.T) {
	for _, lang := range []string{"en", "fr", "ar"} {
		w, m, _, _ := testWeekly(&domain.Parent{ID: "p1", Email: "a@example.com", Language: lang, WeeklyEmail: true})
		if _, err := w.DeliverDue(context.Background()); err != nil || len(m.text) != 1 {
			t.Fatalf("%s: %v", lang, err)
		}
		if m.subject[0] != weeklyEmails[lang].subject {
			t.Errorf("%s: subject %q", lang, m.subject[0])
		}
		rest := strings.NewReplacer("2026-11-09", "", "2026-11-15", "", "https://console.example/", "").Replace(m.text[0])
		if regexp.MustCompile(`\p{Nd}`).MatchString(m.subject[0] + rest) {
			t.Errorf("%s: a digit outside the dates and the link: %q", lang, m.text[0])
		}
	}
}

func TestAFailedWeeklyEmailIsSentLater(t *testing.T) {
	w, m, _, clock := testWeekly(&domain.Parent{ID: "p1", Email: "a@example.com", WeeklyEmail: true})
	m.err = errors.New("Brevo answered 401: unrecognised IP address")
	if sent, err := w.DeliverDue(context.Background()); sent != 0 || err == nil {
		t.Fatalf("a refused send: sent %d, err %v", sent, err)
	}
	m.err = nil
	*clock = clock.Add(59 * time.Second)
	if sent, _ := w.DeliverDue(context.Background()); sent != 0 {
		t.Fatal("tried again before its time")
	}
	*clock = clock.Add(time.Second)
	if sent, err := w.DeliverDue(context.Background()); sent != 1 || err != nil {
		t.Fatalf("a minute later: sent %d, err %v", sent, err)
	}
}

func TestATurnedOffWeeklyEmailIsNotSent(t *testing.T) {
	w, m, repo, _ := testWeekly(&domain.Parent{ID: "p1", Email: "a@example.com", WeeklyEmail: false})
	if sent, err := w.DeliverDue(context.Background()); sent != 0 || err != nil || m.tries != 0 {
		t.Fatalf("sent %d, err %v, tries %d", sent, err, m.tries)
	}
	if !repo.byParent["p1"].Settled.Equal(time.Date(2026, 11, 9, 0, 0, 0, 0, domain.WeeklyEmailZone)) {
		t.Fatalf("the week is not settled: %+v", repo.byParent["p1"])
	}
}
