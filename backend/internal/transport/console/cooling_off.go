package console

import (
	"context"
	"log"
	"net/http"
	"time"

	"manara/backend/internal/domain"
)

// The cooling-off delay's side of the console API (domain/cooling_off.go): a loosening is stored
// as a waiting change instead of the policy, a release is queued the same way, and the offline
// release code stays hidden until a release has waited its time.

type pendingDTO struct {
	Kind        string    `json:"kind"`
	Loosens     []string  `json:"loosens"`
	RequestedAt time.Time `json:"requestedAt"`
	ApplyAt     time.Time `json:"applyAt"`
}

func toPendingDTO(c domain.PendingChange) pendingDTO {
	loosens := c.Loosens
	if loosens == nil {
		loosens = []string{}
	}
	return pendingDTO{Kind: c.Kind, Loosens: loosens, RequestedAt: c.RequestedAt, ApplyAt: c.ApplyAt}
}

// releaseCodeWindow is how long after a waited-for release the offline code may be shown.
const releaseCodeWindow = 7 * 24 * time.Hour

// currentPolicy is what the phone has now, or the default for a phone that never got one.
func (h *Handlers) currentPolicy(ctx context.Context, deviceID string) (domain.Policy, error) {
	p, err := h.Policies.Get(ctx, deviceID)
	if err != nil || p == nil {
		return domain.DefaultPolicy(), err
	}
	return *p, nil
}

// queueIfDelayed stores the change as waiting when this phone has a delay and the change loosens
// its rules. True means it was queued and the answer is written.
func (h *Handlers) queueIfDelayed(w http.ResponseWriter, r *http.Request, deviceID string, current domain.Policy, c domain.PendingChange) bool {
	delay := current.Delay()
	if h.Pending == nil || delay <= 0 || len(c.Loosens) == 0 {
		return false
	}
	now := time.Now().UTC()
	c.DeviceID, c.RequestedAt, c.ApplyAt = deviceID, now, now.Add(delay)
	if err := h.Pending.Put(r.Context(), c); err != nil {
		log.Printf("console: queue %s change: %v", c.Kind, err)
		writeError(w, http.StatusInternalServerError, "internal", "")
		return true
	}
	dto := toPendingDTO(c)
	if c.Kind == domain.PendingPolicy {
		writeJSON(w, http.StatusAccepted, savedPolicyDTO{Policy: current, Pending: &dto})
	} else {
		writeJSON(w, http.StatusAccepted, map[string]any{"pending": dto})
	}
	return true
}

// ListPending returns the phone's waiting changes, soonest first.
func (h *Handlers) ListPending(w http.ResponseWriter, r *http.Request) {
	parentID, ok := h.requireParent(w, r)
	if !ok {
		return
	}
	deviceID := r.PathValue("deviceId")
	if _, ok := h.ownsDevice(w, r, parentID, deviceID); !ok {
		return
	}
	out := []pendingDTO{}
	if h.Pending != nil {
		waiting, err := h.Pending.Waiting(r.Context(), deviceID)
		if err != nil {
			log.Printf("console: list pending: %v", err)
			writeError(w, http.StatusInternalServerError, "internal", "")
			return
		}
		for _, c := range waiting {
			out = append(out, toPendingDTO(c))
		}
	}
	writeJSON(w, http.StatusOK, out)
}

// CancelPending drops a waiting change: keeping the rules as they are never has to wait.
func (h *Handlers) CancelPending(w http.ResponseWriter, r *http.Request) {
	parentID, ok := h.requireParent(w, r)
	if !ok {
		return
	}
	deviceID := r.PathValue("deviceId")
	if _, ok := h.ownsDevice(w, r, parentID, deviceID); !ok {
		return
	}
	kind := r.PathValue("kind")
	if kind != domain.PendingPolicy && kind != domain.PendingRelease {
		writeError(w, http.StatusBadRequest, "bad_request", "kind must be policy or release")
		return
	}
	if h.Pending == nil {
		writeError(w, http.StatusNotFound, "not_found", "nothing is waiting")
		return
	}
	found, err := h.Pending.Cancel(r.Context(), deviceID, kind)
	if err != nil {
		log.Printf("console: cancel pending: %v", err)
		writeError(w, http.StatusInternalServerError, "internal", "")
		return
	}
	if !found {
		writeError(w, http.StatusNotFound, "not_found", "nothing is waiting")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
