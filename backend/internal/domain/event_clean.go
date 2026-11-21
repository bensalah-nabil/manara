package domain

import (
	"strings"
	"time"
)

// maxEventFuture is how far ahead of the server's clock an event's time may be. A phone's clock
// can be off; an event dated years ahead would never be reached by the retention sweep.
const maxEventFuture = 24 * time.Hour

// Clean makes an event from a phone safe to store (audit 2026-11-21): NUL characters are removed
// from every string in the payload (Postgres jsonb refuses "\u0000", and one such app label made
// every later sync of that phone fail), and a time too far in the future is set to now.
func (e *Event) Clean(now time.Time) {
	if e.OccurredAt.After(now.Add(maxEventFuture)) {
		e.OccurredAt = now
	}
	e.Payload = cleanMap(e.Payload)
}

func cleanMap(m map[string]any) map[string]any {
	if m == nil {
		return nil
	}
	out := make(map[string]any, len(m))
	for k, v := range m {
		out[stripNUL(k)] = cleanValue(v)
	}
	return out
}

func cleanValue(v any) any {
	switch x := v.(type) {
	case string:
		return stripNUL(x)
	case map[string]any:
		return cleanMap(x)
	case []any:
		out := make([]any, len(x))
		for i, item := range x {
			out[i] = cleanValue(item)
		}
		return out
	default:
		return v
	}
}

func stripNUL(s string) string {
	if !strings.ContainsRune(s, 0) {
		return s
	}
	return strings.ReplaceAll(s, "\x00", "")
}
