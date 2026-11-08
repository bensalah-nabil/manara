package guard

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestLimiterAllowsMaxPerWindowThenRecovers(t *testing.T) {
	l := NewLimiter(3, time.Minute)
	t0 := time.Date(2026, 11, 8, 12, 0, 0, 0, time.UTC)
	for i := 0; i < 3; i++ {
		if ok, _ := l.Allow("a", t0.Add(time.Duration(i)*time.Second)); !ok {
			t.Fatalf("attempt %d refused", i+1)
		}
	}
	ok, wait := l.Allow("a", t0.Add(3*time.Second))
	if ok || wait <= 0 || wait > time.Minute {
		t.Fatalf("4th: ok=%v wait=%v", ok, wait)
	}
	if ok, _ := l.Allow("b", t0.Add(3*time.Second)); !ok {
		t.Fatal("another key is counted separately")
	}
	if ok, _ := l.Allow("a", t0.Add(61*time.Second)); !ok {
		t.Fatal("still refused after the window")
	}
}

func TestClientIPTrustsOnlyTheConfiguredHeader(t *testing.T) {
	r := httptest.NewRequest(http.MethodPost, "/x", nil)
	r.RemoteAddr = "10.0.0.5:4321"
	r.Header.Set("X-Forwarded-For", "6.6.6.6")
	r.Header.Set("CF-Connecting-IP", "203.0.113.9")
	if got := ClientIP(r, ""); got != "10.0.0.5" {
		t.Errorf("no header configured: %q", got)
	}
	if got := ClientIP(r, "CF-Connecting-IP"); got != "203.0.113.9" {
		t.Errorf("configured header: %q", got)
	}
	r.Header.Set("CF-Connecting-IP", "203.0.113.9, 6.6.6.6")
	if got := ClientIP(r, "CF-Connecting-IP"); got != "10.0.0.5" {
		t.Errorf("a list in the header is not trusted: %q", got)
	}
	r.Header.Set("CF-Connecting-IP", "not-an-ip")
	if got := ClientIP(r, "CF-Connecting-IP"); got != "10.0.0.5" {
		t.Errorf("a non-address is not trusted: %q", got)
	}
}

func TestPerClientRefusesWith429AndRetryAfter(t *testing.T) {
	h := PerClient(NewLimiter(1, time.Minute), "", func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) })
	call := func() *httptest.ResponseRecorder {
		r := httptest.NewRequest(http.MethodPost, "/api/v1/console/auth/login", nil)
		r.RemoteAddr = "198.51.100.7:1"
		w := httptest.NewRecorder()
		h(w, r)
		return w
	}
	if w := call(); w.Code != http.StatusOK {
		t.Fatalf("first: %d", w.Code)
	}
	w := call()
	if w.Code != http.StatusTooManyRequests || w.Header().Get("Retry-After") == "" || !strings.Contains(w.Body.String(), "rate_limited") {
		t.Fatalf("second: %d %v %s", w.Code, w.Header(), w.Body)
	}
}

func TestBodyLimitRejectsOversizedBodies(t *testing.T) {
	var readErr error
	h := BodyLimit(http.HandlerFunc(func(_ http.ResponseWriter, r *http.Request) {
		buf := make([]byte, 1024)
		for readErr == nil {
			_, readErr = r.Body.Read(buf)
		}
	}))
	r := httptest.NewRequest(http.MethodPost, "/x", strings.NewReader(strings.Repeat("a", MaxBody+10)))
	h.ServeHTTP(httptest.NewRecorder(), r)
	if readErr == nil || !strings.Contains(readErr.Error(), "too large") {
		t.Fatalf("read error %v, want request body too large", readErr)
	}
}
