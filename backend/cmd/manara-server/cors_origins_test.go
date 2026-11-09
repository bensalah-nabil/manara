package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func corsHeader(t *testing.T, origin string) (string, []string) {
	t.Helper()
	h := withCORS(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {}))
	r := httptest.NewRequest(http.MethodGet, "/", nil)
	r.Header.Set("Origin", origin)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	return w.Header().Get("Access-Control-Allow-Origin"), w.Header().Values("Vary")
}

func TestCORSWithSeveralOriginsNamesOnlyTheOneAsking(t *testing.T) {
	t.Setenv("CORS_ALLOWED_ORIGIN", "https://new.example, https://old.example/")

	for _, origin := range []string{"https://new.example", "https://old.example"} {
		got, vary := corsHeader(t, origin)
		if got != origin {
			t.Errorf("origin %s: allowed %q", origin, got)
		}
		if len(vary) != 1 || vary[0] != "Origin" {
			t.Errorf("origin %s: Vary %v", origin, vary)
		}
	}
	if got, _ := corsHeader(t, "https://evil.example"); got != "" {
		t.Errorf("an unlisted origin was allowed: %q", got)
	}
	if got, _ := corsHeader(t, "https://new.example, https://old.example"); got != "" {
		t.Errorf("the whole list was accepted as an origin: %q", got)
	}
}

func TestCORSWithOneOriginOrNoneIsUnchanged(t *testing.T) {
	t.Setenv("CORS_ALLOWED_ORIGIN", "https://only.example")
	if got, _ := corsHeader(t, "https://other.example"); got != "https://only.example" {
		t.Errorf("one origin: %q", got)
	}
	t.Setenv("CORS_ALLOWED_ORIGIN", "")
	if got, _ := corsHeader(t, "https://other.example"); got != "*" {
		t.Errorf("no origin configured: %q", got)
	}
}

func TestEmailedLinksPointAtTheFirstOrigin(t *testing.T) {
	t.Setenv("CONSOLE_URL", "")
	t.Setenv("CORS_ALLOWED_ORIGIN", "https://new.example,https://old.example")
	if got := consoleURL(); got != "https://new.example" {
		t.Errorf("got %q", got)
	}
	t.Setenv("CORS_ALLOWED_ORIGIN", "*")
	if got := consoleURL(); got != "" {
		t.Errorf("wildcard: got %q", got)
	}
	t.Setenv("CONSOLE_URL", "https://set.example")
	if got := consoleURL(); got != "https://set.example" {
		t.Errorf("CONSOLE_URL: got %q", got)
	}
}
