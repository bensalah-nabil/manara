package notify

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"mime"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"manara/backend/internal/domain"
)

var sample = domain.Alert{
	ParentID: "parent-1", DeviceID: "dev-1",
	Title:      "Sam's phone: Settings restrictions needs attention",
	Message:    "Private DNS settings are no longer locked. Reported 2026-11-05 14:30 UTC.",
	OccurredAt: time.Date(2026, 11, 5, 14, 30, 0, 0, time.UTC),
}

func TestNtfyPublishesTheDocumentedWay(t *testing.T) {
	var got *http.Request
	var body string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got = r
		b, _ := io.ReadAll(r.Body)
		body = string(b)
	}))
	defer srv.Close()

	n, err := NewNtfy(srv.URL+"/secret-topic", "tk_abc")
	if err != nil {
		t.Fatal(err)
	}
	if err := n.Send(context.Background(), sample); err != nil {
		t.Fatal(err)
	}
	if got.Method != http.MethodPost || got.URL.Path != "/secret-topic" {
		t.Errorf("request = %s %s", got.Method, got.URL.Path)
	}
	if body != sample.Message {
		t.Errorf("body = %q", body)
	}
	if got.Header.Get("Priority") != "high" || got.Header.Get("Tags") != "warning" {
		t.Errorf("priority/tags = %q/%q", got.Header.Get("Priority"), got.Header.Get("Tags"))
	}
	if got.Header.Get("Authorization") != "Bearer tk_abc" {
		t.Errorf("authorization = %q", got.Header.Get("Authorization"))
	}
	decoded, err := new(mime.WordDecoder).DecodeHeader(got.Header.Get("Title"))
	if err != nil || decoded != sample.Title {
		t.Errorf("title = %q (%v)", decoded, err)
	}
}

func TestNtfyKeepsANonASCIITitleIntact(t *testing.T) {
	var title string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { title = r.Header.Get("Title") }))
	defer srv.Close()
	n, _ := NewNtfy(srv.URL+"/t", "")
	a := sample
	a.Title = "Téléphone d'Amélie: Location sharing needs attention"
	if err := n.Send(context.Background(), a); err != nil {
		t.Fatal(err)
	}
	for i := 0; i < len(title); i++ {
		if title[i] > 126 || title[i] < 32 {
			t.Fatalf("header must be 7-bit ASCII, got %q", title)
		}
	}
	decoded, _ := new(mime.WordDecoder).DecodeHeader(title)
	if decoded != a.Title {
		t.Fatalf("decoded = %q", decoded)
	}
}

func TestNtfyWithoutATokenSendsNoAuthorization(t *testing.T) {
	var auth string
	var seen bool
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		auth, seen = r.Header.Get("Authorization"), true
	}))
	defer srv.Close()
	n, _ := NewNtfy(srv.URL+"/t", "")
	if err := n.Send(context.Background(), sample); err != nil || !seen || auth != "" {
		t.Fatalf("err=%v seen=%v auth=%q", err, seen, auth)
	}
}

func TestWebhookPostsJSON(t *testing.T) {
	var ct string
	var got map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ct = r.Header.Get("Content-Type")
		_ = json.NewDecoder(r.Body).Decode(&got)
	}))
	defer srv.Close()
	w, err := NewWebhook(srv.URL + "/hook")
	if err != nil {
		t.Fatal(err)
	}
	if err := w.Send(context.Background(), sample); err != nil {
		t.Fatal(err)
	}
	if ct != "application/json" {
		t.Errorf("content-type = %q", ct)
	}
	want := map[string]any{
		"title": sample.Title, "message": sample.Message, "deviceId": "dev-1",
		"parentId": "parent-1", "occurredAt": "2026-11-05T14:30:00Z",
	}
	for k, v := range want {
		if got[k] != v {
			t.Errorf("%s = %v, want %v", k, got[k], v)
		}
	}
}

func TestRejectsBadURLsWithoutEchoingThem(t *testing.T) {
	for _, raw := range []string{"", "ntfy.sh/topic", "ftp://x/y", "https://", "javascript:alert(1)", "http://%zz"} {
		_, err := NewNtfy(raw, "")
		if err == nil {
			t.Errorf("%q must be rejected", raw)
		} else if raw != "" && strings.Contains(err.Error(), raw) {
			t.Errorf("error echoes the URL: %v", err)
		}
		if _, err := NewWebhook(raw); err == nil {
			t.Errorf("webhook %q must be rejected", raw)
		}
	}
}

func TestANon2xxAnswerIsAnErrorWithoutTheTopic(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { http.Error(w, "no", http.StatusForbidden) }))
	defer srv.Close()
	n, _ := NewNtfy(srv.URL+"/very-secret-topic", "")
	err := n.Send(context.Background(), sample)
	if err == nil || !strings.Contains(err.Error(), "403") || strings.Contains(err.Error(), "very-secret-topic") {
		t.Fatalf("err = %v", err)
	}
}

func TestATransportErrorDoesNotLeakTheTopic(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {}))
	url := srv.URL + "/very-secret-topic"
	srv.Close() // nothing listens any more
	n, _ := NewNtfy(url, "")
	err := n.Send(context.Background(), sample)
	if err == nil {
		t.Fatal("want an error")
	}
	if strings.Contains(err.Error(), "very-secret-topic") {
		t.Fatalf("error leaks the topic: %v", err)
	}
}

type failing struct{ calls int }

func (f *failing) Send(context.Context, domain.Alert) error { f.calls++; return errors.New("boom") }

type counting struct{ calls int }

func (c *counting) Send(context.Context, domain.Alert) error { c.calls++; return nil }

func TestFanoutKeepsGoingAfterAFailure(t *testing.T) {
	bad, good := &failing{}, &counting{}
	err := Fanout{bad, good}.Send(context.Background(), sample)
	if err == nil || bad.calls != 1 || good.calls != 1 {
		t.Fatalf("err=%v bad=%d good=%d", err, bad.calls, good.calls)
	}
}
