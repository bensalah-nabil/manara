package domain

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"
)

func TestValidatePassword(t *testing.T) {
	cases := map[string]error{
		"":                      ErrPasswordTooShort,
		"seven77":               ErrPasswordTooShort,
		"eight888":              nil,
		"ééééééé":               ErrPasswordTooShort, // 7 letters, 14 bytes: counted in letters
		"éééééééé":              nil,
		strings.Repeat("a", 72): nil,
		strings.Repeat("a", 73): ErrPasswordTooLong,
		strings.Repeat("é", 37): ErrPasswordTooLong, // 74 bytes
	}
	for p, want := range cases {
		if got := ValidatePassword(p); !errors.Is(got, want) {
			t.Errorf("ValidatePassword(%q) = %v, want %v", p, got, want)
		}
	}
}

func TestNormalizeEmail(t *testing.T) {
	if got := NormalizeEmail("  Sara@Example.COM "); got != "sara@example.com" {
		t.Fatalf("got %q", got)
	}
}

func TestResetEmailCarriesTheLinkAndNoChildDetails(t *testing.T) {
	subject, text := ResetEmail("https://console.example/#reset=abc")
	if subject == "" || !strings.Contains(text, "https://console.example/#reset=abc") {
		t.Fatalf("subject %q, text %q", subject, text)
	}
	if !strings.Contains(text, "ignore this email") {
		t.Errorf("tells no one what to do if it wasn't them: %q", text)
	}
}

type fakeSilence struct {
	silent []*Device
	marked map[string]time.Time
	cutoff time.Time
}

func (f *fakeSilence) Silent(_ context.Context, cutoff time.Time) ([]*Device, error) {
	f.cutoff = cutoff
	var out []*Device
	for _, d := range f.silent {
		if _, done := f.marked[d.ID]; !done {
			out = append(out, d)
		}
	}
	return out, nil
}

func (f *fakeSilence) MarkAlerted(_ context.Context, id string, at time.Time) error {
	f.marked[id] = at
	return nil
}

type recordingAlerts struct {
	sent []Alert
	fail map[string]bool
}

func (r *recordingAlerts) Send(_ context.Context, a Alert) error {
	if r.fail[a.DeviceID] {
		return errors.New("delivery failed")
	}
	r.sent = append(r.sent, a)
	return nil
}

func TestSilenceWatcherAlertsOncePerSilence(t *testing.T) {
	now := time.Date(2026, 11, 7, 20, 0, 0, 0, time.UTC)
	repo := &fakeSilence{
		silent: []*Device{{ID: "d1", ParentID: "p1", Label: "Sara", LastSeen: now.Add(-13 * time.Hour)}},
		marked: map[string]time.Time{},
	}
	alerts := &recordingAlerts{}
	w := &SilenceWatcher{Repo: repo, Notifier: alerts, After: 12 * time.Hour, Now: func() time.Time { return now }}

	for range 3 {
		if _, err := w.Check(context.Background()); err != nil {
			t.Fatal(err)
		}
	}
	if len(alerts.sent) != 1 {
		t.Fatalf("%d alerts, want 1", len(alerts.sent))
	}
	if !repo.cutoff.Equal(now.Add(-12 * time.Hour)) {
		t.Errorf("cutoff %v", repo.cutoff)
	}
	a := alerts.sent[0]
	if a.ParentID != "p1" || !strings.Contains(a.Title, "Sara") || !strings.Contains(a.Message, "2026-11-07 07:00 UTC") {
		t.Errorf("alert %+v", a)
	}
}

func TestSilenceWatcherRetriesAFailedDelivery(t *testing.T) {
	now := time.Now()
	repo := &fakeSilence{silent: []*Device{{ID: "d1", LastSeen: now.Add(-24 * time.Hour)}}, marked: map[string]time.Time{}}
	alerts := &recordingAlerts{fail: map[string]bool{"d1": true}}
	w := &SilenceWatcher{Repo: repo, Notifier: alerts, After: 12 * time.Hour, Now: time.Now}

	if _, err := w.Check(context.Background()); err == nil {
		t.Fatal("a failed delivery must be reported")
	}
	if len(repo.marked) != 0 {
		t.Fatal("a failed delivery must not count as alerted")
	}
	alerts.fail = nil
	if n, err := w.Check(context.Background()); err != nil || n != 1 {
		t.Fatalf("retry: %d, %v", n, err)
	}
}
