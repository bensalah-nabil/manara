// Package guard holds the HTTP protections every route shares: a request size
// limit and rate limits on the endpoints that can be used to guess a secret
// (passwords, reset links, enrollment codes).
package guard

import (
	"encoding/json"
	"net"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"
)

// MaxBody bounds a request body. A phone's sync carries at most 200 events
// (EventQueue.drainBatch), a few hundred KB at most.
const MaxBody = 4 << 20

// BodyLimit stops one oversized request from tying up the server's memory.
func BodyLimit(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Body != nil {
			r.Body = http.MaxBytesReader(w, r.Body, MaxBody)
		}
		next.ServeHTTP(w, r)
	})
}

// Limiter allows at most Max events per key within Window (a sliding log).
// In memory: one server instance, and a restart forgets the counts, which
// errs on the side of letting a parent in.
type Limiter struct {
	Max    int
	Window time.Duration
	mu     sync.Mutex
	seen   map[string][]time.Time
	sweep  time.Time
}

func NewLimiter(max int, window time.Duration) *Limiter {
	return &Limiter{Max: max, Window: window, seen: map[string][]time.Time{}}
}

// Allow records one event for key and reports whether it is within the limit,
// and if not, how long until the oldest event leaves the window.
func (l *Limiter) Allow(key string, now time.Time) (bool, time.Duration) {
	l.mu.Lock()
	defer l.mu.Unlock()
	cutoff := now.Add(-l.Window)
	if now.Sub(l.sweep) > l.Window {
		for k, times := range l.seen {
			if len(times) == 0 || times[len(times)-1].Before(cutoff) {
				delete(l.seen, k)
			}
		}
		l.sweep = now
	}
	times := l.seen[key]
	kept := times[:0]
	for _, t := range times {
		if t.After(cutoff) {
			kept = append(kept, t)
		}
	}
	if len(kept) >= l.Max {
		l.seen[key] = kept
		return false, kept[0].Add(l.Window).Sub(now)
	}
	l.seen[key] = append(kept, now)
	return true, 0
}

// ClientIP is the address limits are counted against. Behind a proxy, set
// header to the one the proxy overwrites with the real client address (a
// client can put anything in X-Forwarded-For); with no header configured, the
// connection's own address is used.
func ClientIP(r *http.Request, header string) string {
	if header != "" {
		// Only a header holding exactly one valid address counts; anything else
		// falls back to the connection address rather than a value a client wrote.
		if v := strings.TrimSpace(r.Header.Get(header)); v != "" && !strings.Contains(v, ",") && net.ParseIP(v) != nil {
			return v
		}
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

// Refuse writes the 429 the console shows as "too many attempts".
func Refuse(w http.ResponseWriter, retryAfter time.Duration) {
	seconds := int(retryAfter.Seconds()) + 1
	w.Header().Set("Retry-After", strconv.Itoa(seconds))
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusTooManyRequests)
	_ = json.NewEncoder(w).Encode(map[string]string{"code": "rate_limited", "message": "too many attempts, try again in " + strconv.Itoa(seconds) + " s"})
}

// PerClient limits a handler per client address.
func PerClient(l *Limiter, ipHeader string, next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if ok, wait := l.Allow(r.URL.Path+"|"+ClientIP(r, ipHeader), time.Now()); !ok {
			Refuse(w, wait)
			return
		}
		next(w, r)
	}
}
