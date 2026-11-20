package admin

import (
	"encoding/json"
	"log"
	"net/http"
	"slices"

	"manara/backend/internal/domain"
)

// BetaRoutes: the beta page's sign-ups ("Familles pionnières"), for booking the setup calls.
// They are the parents' own contact details, given to be called, so an admin sees them in full;
// each list and each change is logged first, like every admin request.
func BetaRoutes(mux *http.ServeMux, h *Handlers) {
	mux.HandleFunc("GET /api/v1/admin/beta-signups", h.BetaSignups)
	mux.HandleFunc("POST /api/v1/admin/beta-signups/{id}/status", h.SetBetaStatus)
}

func (h *Handlers) BetaSignups(w http.ResponseWriter, r *http.Request) {
	if h.Beta == nil {
		writeError(w, http.StatusNotFound, "not_found", "")
		return
	}
	if _, ok := h.admin(w, r, "listed_beta_signups", ""); !ok {
		return
	}
	list, err := h.Beta.ListBetaSignups(r.Context(), 500)
	if err != nil {
		log.Printf("admin: %v", err)
		writeError(w, http.StatusInternalServerError, "internal", "")
		return
	}
	writeJSON(w, list)
}

func (h *Handlers) SetBetaStatus(w http.ResponseWriter, r *http.Request) {
	if h.Beta == nil {
		writeError(w, http.StatusNotFound, "not_found", "")
		return
	}
	var body struct {
		Status string `json:"status"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || !slices.Contains(domain.BetaStatuses, body.Status) {
		writeError(w, http.StatusBadRequest, "bad_request", "status must be new, contacted, set_up or declined")
		return
	}
	id := r.PathValue("id")
	if _, ok := h.admin(w, r, "beta_status_"+body.Status, id); !ok {
		return
	}
	found, err := h.Beta.SetBetaSignupStatus(r.Context(), id, body.Status, h.now())
	if err != nil {
		log.Printf("admin: %v", err)
		writeError(w, http.StatusInternalServerError, "internal", "")
		return
	}
	if !found {
		writeError(w, http.StatusNotFound, "not_found", "")
		return
	}
	writeJSON(w, map[string]bool{"done": true})
}
