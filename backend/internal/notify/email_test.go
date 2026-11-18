package notify

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"sort"
	"strings"
	"testing"
	"time"

	"manara/backend/internal/domain"
)

func testBrevo(t *testing.T, status int, seen *map[string]any, header *http.Header) *Brevo {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		*header = r.Header.Clone()
		_ = json.NewDecoder(r.Body).Decode(seen)
		w.WriteHeader(status)
		_, _ = w.Write([]byte(`{"code":"unauthorized","message":"Key not found"}`))
	}))
	t.Cleanup(srv.Close)
	b, err := NewBrevo("key-1", "parent-alerts@example.com", "")
	if err != nil {
		t.Fatal(err)
	}
	b.endpoint = srv.URL
	return b
}

func TestBrevoSendsTheDocumentedRequest(t *testing.T) {
	var seen map[string]any
	var header http.Header
	b := testBrevo(t, http.StatusCreated, &seen, &header)
	if err := b.Send(context.Background(), "sara@example.com", "Subject", "Line one\n<b>two</b>"); err != nil {
		t.Fatal(err)
	}
	if header.Get("api-key") != "key-1" || header.Get("Content-Type") != "application/json" {
		t.Errorf("headers %v", header)
	}
	sender := seen["sender"].(map[string]any)
	to := seen["to"].([]any)[0].(map[string]any)
	if sender["email"] != "parent-alerts@example.com" || sender["name"] != "Manara" || to["email"] != "sara@example.com" {
		t.Errorf("addresses %v", seen)
	}
	if seen["textContent"] != "Line one\n<b>two</b>" || seen["htmlContent"] != "<p>Line one<br>&lt;b&gt;two&lt;/b&gt;</p>" {
		t.Errorf("content %v", seen)
	}
}

func TestBrevoReportsARefusal(t *testing.T) {
	var seen map[string]any
	var header http.Header
	b := testBrevo(t, http.StatusUnauthorized, &seen, &header)
	err := b.Send(context.Background(), "sara@example.com", "s", "t")
	if err == nil || !strings.Contains(err.Error(), "401") || strings.Contains(err.Error(), "key-1") {
		t.Fatalf("err = %v; want the status, never the key", err)
	}
}

func TestNewBrevoNeedsAKeyAndASender(t *testing.T) {
	if _, err := NewBrevo("", "a@b.c", ""); err == nil {
		t.Error("no key accepted")
	}
	if _, err := NewBrevo("k", "not-an-address", ""); err == nil {
		t.Error("bad sender accepted")
	}
}

type fakeParents struct{ byID map[string]*domain.Parent }

func (f fakeParents) Create(context.Context, *domain.Parent) error { return nil }
func (f fakeParents) FindByID(_ context.Context, id string) (*domain.Parent, error) {
	return f.byID[id], nil
}
func (f fakeParents) SetLanguage(context.Context, string, string) error  { return nil }
func (f fakeParents) SetWeeklyEmail(context.Context, string, bool) error { return nil }

// recordingMailer records each email sent. With err set, every send fails
// the way Brevo did for an unknown IP address.
type recordingMailer struct {
	to, subject, text []string
	tries             int
	err               error
}

func (m *recordingMailer) Send(_ context.Context, to, subject, text string) error {
	m.tries++
	if m.err != nil {
		return m.err
	}
	m.to, m.subject, m.text = append(m.to, to), append(m.subject, subject), append(m.text, text)
	return nil
}

// memEmails stores each parent's AlertEmail in memory. The rules are
// domain.AlertEmail's; this is only storage.
type memEmails struct{ byParent map[string]domain.AlertEmail }

func (m *memEmails) Update(_ context.Context, id string, change func(*domain.AlertEmail)) error {
	e := m.byParent[id]
	change(&e)
	m.byParent[id] = e
	return nil
}

func (m *memEmails) Due(_ context.Context, now time.Time) ([]string, error) {
	var ids []string
	for id, e := range m.byParent {
		if e.Owed() && !now.Before(e.NextTry) {
			ids = append(ids, id)
		}
	}
	sort.Strings(ids)
	return ids, nil
}

var reportedAt = time.Date(2026, 11, 17, 14, 3, 0, 0, time.UTC)

// testEmailAlerts sends to parent p1 (sara.mum@example.com, reading lang),
// on a clock the test moves.
func testEmailAlerts(lang string) (ParentEmailAlerts, *recordingMailer, *time.Time) {
	m := &recordingMailer{}
	clock := reportedAt.Add(time.Minute)
	return ParentEmailAlerts{
		Parents: fakeParents{byID: map[string]*domain.Parent{"p1": {ID: "p1", Email: "sara.mum@example.com", Language: lang}}},
		Mailer:  m,
		Emails:  &memEmails{byParent: map[string]domain.AlertEmail{}},
		Now:     func() time.Time { return clock },
	}, m, &clock
}

func TestParentEmailAlertsGoToThatParentOnly(t *testing.T) {
	alerts, m, clock := testEmailAlerts("en")
	if err := alerts.Send(context.Background(), domain.Alert{ParentID: "p1", Title: "Sara has stopped checking in", Message: "m", OccurredAt: reportedAt}); err != nil {
		t.Fatal(err)
	}
	if err := alerts.Send(context.Background(), domain.Alert{ParentID: "gone", Title: "t", OccurredAt: reportedAt}); err != nil {
		t.Fatal(err)
	}
	if len(m.to) != 1 || m.to[0] != "sara.mum@example.com" || m.subject[0] != "Manara: a phone needs your attention" {
		t.Fatalf("sent to %v, subjects %v", m.to, m.subject)
	}
	// A parent with no address is not a failure: nothing is left to retry.
	*clock = clock.Add(time.Hour)
	if n, err := alerts.DeliverDue(context.Background()); n != 0 || err != nil || m.tries != 1 {
		t.Fatalf("DeliverDue = %d, %v after %d tries; want nothing left", n, err, m.tries)
	}
}

// The phone's name is often the child's, and Brevo may train on email content
// (docs/privacy/dpa-brevo.md): nothing of the alert's title or message may
// reach the email, in any language.
func TestParentEmailAlertsNeverCarryThePhoneOrTheProblem(t *testing.T) {
	alert := domain.Alert{
		ParentID:   "p1",
		Title:      "Sara: Call history needs attention",
		Message:    "Notification access is off, so calls in apps such as WhatsApp are not seen.",
		OccurredAt: reportedAt,
	}
	for _, lang := range []string{"en", "fr", "ar", "", "de"} {
		alerts, m, _ := testEmailAlerts(lang)
		if err := alerts.Send(context.Background(), alert); err != nil {
			t.Fatal(err)
		}
		sent := m.subject[0] + "\n" + m.text[0]
		for _, leak := range []string{"Sara", "Call history", "call", "WhatsApp", "Notification", "needs attention:"} {
			if strings.Contains(sent, leak) {
				t.Errorf("language %q: email carries %q:\n%s", lang, leak, sent)
			}
		}
		if !strings.Contains(m.text[0], "2026-11-17 14:03 UTC") {
			t.Errorf("language %q: email lost the time:\n%s", lang, m.text[0])
		}
	}
}

func TestParentEmailAlertsUseTheParentsLanguage(t *testing.T) {
	want := map[string]string{
		"en": "Manara: a phone needs your attention",
		"fr": "Manara : un téléphone demande votre attention",
		"ar": "منارة: هاتف يحتاج إلى انتباهك",
		"":   "Manara: a phone needs your attention", // no choice yet: the default language
	}
	for lang, subject := range want {
		alerts, m, _ := testEmailAlerts(lang)
		if err := alerts.Send(context.Background(), domain.Alert{ParentID: "p1"}); err != nil {
			t.Fatal(err)
		}
		if len(m.subject) != 1 || m.subject[0] != subject {
			t.Errorf("language %q: subjects %q, want %q", lang, m.subject, subject)
		}
	}
}

// Usage Access off broke two protections in one sync on the A52 (2026-11-17),
// and the parent got two identical emails.
func TestAlertsThatComeTogetherSendOneEmail(t *testing.T) {
	alerts, m, clock := testEmailAlerts("en")
	send := func(device string) {
		t.Helper()
		if err := alerts.Send(context.Background(), domain.Alert{ParentID: "p1", DeviceID: device, OccurredAt: *clock}); err != nil {
			t.Fatal(err)
		}
	}
	send("a52") // time limits
	send("a52") // daily usage report
	*clock = clock.Add(5 * time.Minute)
	send("a045f")
	if len(m.text) != 1 {
		t.Fatalf("%d emails within %s, want 1", len(m.text), domain.AlertEmailQuiet)
	}
	*clock = clock.Add(domain.AlertEmailQuiet)
	send("a52")
	if len(m.text) != 2 {
		t.Fatalf("%d emails, want a second one after %s", len(m.text), domain.AlertEmailQuiet)
	}
}

// Brevo refused every send from an unknown IP address on 2026-11-17, and the
// alert was simply lost.
func TestAFailedAlertEmailIsSentLater(t *testing.T) {
	alerts, m, clock := testEmailAlerts("en")
	m.err = errors.New(`brevo answered 401: {"code":"unauthorized"}`)
	err := alerts.Send(context.Background(), domain.Alert{ParentID: "p1", OccurredAt: reportedAt})
	if err == nil || !strings.Contains(err.Error(), "401") || !strings.Contains(err.Error(), "next at") {
		t.Fatalf("Send = %v; want the refusal and when it is tried again", err)
	}

	*clock = clock.Add(30 * time.Second)
	if n, err := alerts.DeliverDue(context.Background()); n != 0 || err != nil || m.tries != 1 {
		t.Fatalf("DeliverDue too early = %d, %v after %d tries", n, err, m.tries)
	}

	m.err = nil // the IP address was authorised
	*clock = clock.Add(30 * time.Second)
	if n, err := alerts.DeliverDue(context.Background()); n != 1 || err != nil {
		t.Fatalf("DeliverDue = %d, %v; want the owed email sent", n, err)
	}
	if !strings.Contains(m.text[0], "2026-11-17 14:03 UTC") {
		t.Fatalf("the late email lost the original time:\n%s", m.text[0])
	}
	*clock = clock.Add(time.Hour)
	if n, _ := alerts.DeliverDue(context.Background()); n != 0 || len(m.text) != 1 {
		t.Fatalf("sent again: %d more, %d in all", n, len(m.text))
	}
}
