package console

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"time"

	"manara/backend/internal/domain"
	"manara/backend/internal/setuphelp"
	"manara/backend/internal/transport/guard"
)

// setupHelpTimeout bounds one answer, retries included.
const setupHelpTimeout = 60 * time.Second

// GetSetupHelp says whether the setup assistant is on (GET /api/v1/console/setup-help), so the
// console shows its panel only when it can answer.
func (h *Handlers) GetSetupHelp(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireParent(w, r); !ok {
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"available": h.SetupHelp != nil})
}

// AskSetupHelp answers a parent's setup question (POST /api/v1/console/setup-help). Signed-in
// parents only, limited per parent. Only what setuphelp.Request.Normalize keeps is sent to Claude;
// the question is never logged or stored.
func (h *Handlers) AskSetupHelp(w http.ResponseWriter, r *http.Request) {
	parentID, ok := h.requireParent(w, r)
	if !ok {
		return
	}
	if h.SetupHelp == nil {
		writeError(w, http.StatusServiceUnavailable, "assistant_unavailable", "")
		return
	}
	var req setuphelp.Request
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "")
		return
	}
	req, err := req.Normalize()
	var invalid *setuphelp.ErrInvalid
	if errors.As(err, &invalid) {
		writeError(w, http.StatusBadRequest, "invalid_field", invalid.Field)
		return
	} else if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "")
		return
	}
	if h.SetupHelpLimiter != nil {
		if ok, wait := h.SetupHelpLimiter.Allow(r.Context(), parentID, time.Now()); !ok {
			guard.Refuse(w, wait)
			return
		}
	}

	ctx, cancel := context.WithTimeout(r.Context(), setupHelpTimeout)
	defer cancel()
	reply, err := h.SetupHelp.Answer(ctx, req)
	h.recordAssistantUsage(r.Context(), parentID, reply.Usage)
	switch {
	case errors.Is(err, setuphelp.ErrDeclined):
		writeError(w, http.StatusUnprocessableEntity, "assistant_declined", "")
		return
	case errors.Is(err, setuphelp.ErrBusy):
		w.Header().Set("Retry-After", "60")
		writeError(w, http.StatusServiceUnavailable, "assistant_busy", "")
		return
	case err != nil:
		// The error only, never the question.
		log.Printf("setup help: %v", err)
		writeError(w, http.StatusBadGateway, "assistant_failed", "")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"answer": reply.Text})
}

// recordAssistantUsage counts what an answer used, for the admin console's cost view. A failure is
// logged and never fails the answer.
func (h *Handlers) recordAssistantUsage(ctx context.Context, parentID string, u domain.AssistantUsage) {
	if h.AssistantUsage == nil || u.Questions == 0 {
		return
	}
	if err := h.AssistantUsage.RecordAssistantUsage(ctx, parentID, time.Now(), u); err != nil {
		log.Printf("setup help: record usage: %v", err)
	}
}
