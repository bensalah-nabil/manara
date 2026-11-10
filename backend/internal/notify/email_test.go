package notify

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

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
	if len(m.to) != 1 || m.to[0] != "sara.mum@example.com" || m.subject[0] != "Manara: Sara has stopped checking in" {
		t.Fatalf("sent to %v, subjects %v", m.to, m.subject)
	}
}
