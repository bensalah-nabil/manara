package console

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"time"

	"manara/backend/internal/domain"
)

// BetaSignups takes the public beta page's form (POST /api/v1/beta-signups). No session: the
// page is public. Limited per client in main.go; a filled-in hidden "website" field (a honeypot
// people never see) is answered as if it worked and stored nowhere.
type BetaSignups struct {
	Store domain.BetaSignupStore
	Now   func() time.Time
}

type betaSignupRequest struct {
	domain.BetaSignup
	Website string `json:"website"`
}

func (b *BetaSignups) Create(w http.ResponseWriter, r *http.Request) {
	var req betaSignupRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "")
		return
	}
	if req.Website != "" {
		writeJSON(w, http.StatusOK, map[string]bool{"ok": true, "waitlist": false})
		return
	}
	s, err := req.BetaSignup.Normalize()
	var invalid *domain.ValidationError
	switch {
	case errors.Is(err, domain.ErrBetaNotOwnChild):
		writeError(w, http.StatusBadRequest, "own_child_required", "")
		return
	case errors.As(err, &invalid):
		writeError(w, http.StatusBadRequest, "invalid_field", invalid.Field)
		return
	case err != nil:
		writeError(w, http.StatusBadRequest, "bad_request", "")
		return
	}
	now := time.Now
	if b.Now != nil {
		now = b.Now
	}
	s.ID, s.CreatedAt = "", now()
	if _, err := b.Store.AddBetaSignup(r.Context(), s); err != nil {
		log.Printf("beta signup: %v", err)
		writeError(w, http.StatusInternalServerError, "internal", "")
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true, "waitlist": s.Waitlist()})
}
