package console

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"sort"
	"strings"
	"time"

	"manara/backend/internal/domain"
)

// auditLimit is how many entries the Account page shows.
const auditLimit = 100

// audit records what a parent did. A failure to record is logged and never fails the action.
func (h *Handlers) audit(ctx context.Context, parentID, deviceID string, action domain.AuditAction, detail string) {
	if h.Audit == nil {
		return
	}
	entry := domain.AuditEntry{ParentID: parentID, DeviceID: deviceID, Action: action, Detail: detail, At: time.Now()}
	if err := h.Audit.Record(ctx, entry); err != nil {
		log.Printf("console: audit %s: %v", action, err)
	}
}

type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (s *statusRecorder) WriteHeader(code int) {
	s.status = code
	s.ResponseWriter.WriteHeader(code)
}

// Audited wraps a signed-in write. When it succeeds (2xx), it records action for the session's
// parent, with the phone from the path and an optional short detail taken from the request body.
func (h *Handlers) Audited(action domain.AuditAction, detail func(body []byte) string, next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(r.Body)
		if err != nil {
			writeError(w, http.StatusBadRequest, "bad_request", err.Error())
			return
		}
		r.Body = io.NopCloser(bytes.NewReader(body))
		rec := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
		next(rec, r)
		if rec.status < 200 || rec.status > 299 || h.Audit == nil {
			return
		}
		token := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
		parentID, found, err := h.Sessions.Resolve(r.Context(), token)
		if err != nil || !found {
			return
		}
		d := ""
		if detail != nil {
			d = detail(body)
		}
		h.audit(r.Context(), parentID, r.PathValue("deviceId"), action, d)
	}
}

// CommandType is the detail of a sent command: its type, such as lock_now.
func CommandType(body []byte) string {
	var req struct {
		Type string `json:"type"`
	}
	_ = json.Unmarshal(body, &req)
	return req.Type
}

// ChangedFields is the detail of an edit: which fields were sent, never their values.
func ChangedFields(body []byte) string {
	var fields map[string]json.RawMessage
	if json.Unmarshal(body, &fields) != nil {
		return ""
	}
	names := make([]string, 0, len(fields))
	for name := range fields {
		names = append(names, name)
	}
	sort.Strings(names)
	return strings.Join(names, ",")
}

type auditEntryDTO struct {
	Action   string    `json:"action"`
	DeviceID string    `json:"deviceId,omitempty"`
	Detail   string    `json:"detail,omitempty"`
	At       time.Time `json:"at"`
}

// ListActivity is the parent's own log, newest first.
func (h *Handlers) ListActivity(w http.ResponseWriter, r *http.Request) {
	parentID, ok := h.requireParent(w, r)
	if !ok {
		return
	}
	out := []auditEntryDTO{}
	if h.Audit != nil {
		entries, err := h.Audit.ListForParent(r.Context(), parentID, auditLimit)
		if err != nil {
			log.Printf("console: list activity: %v", err)
			writeError(w, http.StatusInternalServerError, "internal", "")
			return
		}
		for _, e := range entries {
			out = append(out, auditEntryDTO{Action: string(e.Action), DeviceID: e.DeviceID, Detail: e.Detail, At: e.At})
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"entries": out})
}
