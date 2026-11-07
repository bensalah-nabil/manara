package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// Every method the console's api.ts sends must pass a browser's preflight.
func TestCORSAllowsEveryConsoleMethod(t *testing.T) {
	h := withCORS(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {}))
	r := httptest.NewRequest(http.MethodOptions, "/api/v1/console/devices/x", nil)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	allowed := w.Header().Get("Access-Control-Allow-Methods")
	for _, m := range []string{"GET", "POST", "PUT", "PATCH", "DELETE"} {
		if !strings.Contains(allowed, m) {
			t.Errorf("preflight allows %q, missing %s", allowed, m)
		}
	}
}
