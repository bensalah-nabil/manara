package notify

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
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
func (f fakeParents) SetLanguage(context.Context, string, string) error { return nil }

type recordingMailer struct{ to, subject, text []string }

func (m *recordingMailer) Send(_ context.Context, to, subject, text string) error {
	m.to, m.subject, m.text = append(m.to, to), append(m.subject, subject), append(m.text, text)
	return nil
}

func TestParentEmailAlertsGoToThatParentOnly(t *testing.T) {
	m := &recordingMailer{}
	alerts := ParentEmailAlerts{
		Parents: fakeParents{byID: map[string]*domain.Parent{"p1": {ID: "p1", Email: "sara.mum@example.com"}}},
		Mailer:  m,
	}
	if err := alerts.Send(context.Background(), domain.Alert{ParentID: "p1", Title: "Sara has stopped checking in", Message: "m"}); err != nil {
		t.Fatal(err)
	}
	if err := alerts.Send(context.Background(), domain.Alert{ParentID: "gone", Title: "t"}); err != nil {
		t.Fatal(err)
	}
	if len(m.to) != 1 || m.to[0] != "sara.mum@example.com" || m.subject[0] != "Manara: a phone needs your attention" {
		t.Fatalf("sent to %v, subjects %v", m.to, m.subject)
	}
}

// The phone's name is often the child's, and Brevo may train on email content
// (docs/privacy/dpa-brevo.md): nothing of the alert's title or message may
// reach the email, in any language.
func TestParentEmailAlertsNeverCarryThePhoneOrTheProblem(t *testing.T) {
	when := time.Date(2026, 11, 17, 14, 3, 0, 0, time.UTC)
	alert := domain.Alert{
		ParentID:   "p1",
		Title:      "Sara: Call history needs attention",
		Message:    "Notification access is off, so calls in apps such as WhatsApp are not seen.",
		OccurredAt: when,
	}
	for _, lang := range []string{"en", "fr", "ar", "", "de"} {
		m := &recordingMailer{}
		alerts := ParentEmailAlerts{
			Parents: fakeParents{byID: map[string]*domain.Parent{"p1": {ID: "p1", Email: "sara.mum@example.com", Language: lang}}},
			Mailer:  m,
		}
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
		m := &recordingMailer{}
		alerts := ParentEmailAlerts{
			Parents: fakeParents{byID: map[string]*domain.Parent{"p1": {ID: "p1", Email: "a@example.com", Language: lang}}},
			Mailer:  m,
		}
		if err := alerts.Send(context.Background(), domain.Alert{ParentID: "p1"}); err != nil {
			t.Fatal(err)
		}
		if m.subject[0] != subject {
			t.Errorf("language %q: subject %q, want %q", lang, m.subject[0], subject)
		}
	}
}
