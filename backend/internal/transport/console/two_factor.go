package console

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"time"

	"manara/backend/internal/domain"
	"manara/backend/internal/transport/guard"
)

type challengeResponse struct {
	TwoFactorRequired bool   `json:"twoFactorRequired"`
	Challenge         string `json:"challenge"`
}

type verifyLoginRequest struct {
	Challenge string `json:"challenge"`
	Code      string `json:"code"`
}

type passwordRequest struct {
	Password string `json:"password"`
}

type codeRequest struct {
	Code string `json:"code"`
}

type disableTwoFactorRequest struct {
	Password string `json:"password"`
	Code     string `json:"code"`
}

// signIn ends a successful first step. Without two-step sign-in it issues the
// session; with it, only a challenge to send the code with. Every way in
// (login, a password reset) goes through here, so none skips the second step.
func (h *Handlers) signIn(w http.ResponseWriter, r *http.Request, parentID string) {
	if h.TwoFactor != nil {
		on, err := h.TwoFactor.Enabled(r.Context(), parentID)
		if err != nil {
			log.Printf("console: two-step status: %v", err)
			writeError(w, http.StatusInternalServerError, "internal", "")
			return
		}
		if on {
			token, err := h.TwoFactor.NewChallenge(r.Context(), parentID, time.Now())
			if err != nil {
				log.Printf("console: new challenge: %v", err)
				writeError(w, http.StatusInternalServerError, "internal", "")
				return
			}
			writeJSON(w, http.StatusOK, challengeResponse{TwoFactorRequired: true, Challenge: token})
			return
		}
	}
	session, err := h.Sessions.Issue(r.Context(), parentID)
	if err != nil {
		log.Printf("console: issue session: %v", err)
		writeError(w, http.StatusInternalServerError, "internal", "")
		return
	}
	writeJSON(w, http.StatusOK, authResponse{ParentID: parentID, ParentSession: session})
}

// VerifyLogin is the second step: the code from the authenticator app, or a recovery code.
func (h *Handlers) VerifyLogin(w http.ResponseWriter, r *http.Request) {
	var req verifyLoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	if h.TwoFactor == nil {
		writeError(w, http.StatusBadRequest, "invalid_challenge", "")
		return
	}
	if h.ChallengeLimiter != nil {
		if ok, wait := h.ChallengeLimiter.Allow(req.Challenge, time.Now()); !ok {
			guard.Refuse(w, wait)
			return
		}
	}
	now := time.Now()
	parentID, err := h.TwoFactor.ChallengeParent(r.Context(), req.Challenge, now)
	if errors.Is(err, domain.ErrChallengeInvalid) {
		writeError(w, http.StatusUnauthorized, "invalid_challenge", err.Error())
		return
	}
	if err != nil {
		log.Printf("console: read challenge: %v", err)
		writeError(w, http.StatusInternalServerError, "internal", "")
		return
	}
	if err := h.TwoFactor.Check(r.Context(), parentID, req.Code, now); err != nil {
		if errors.Is(err, domain.ErrBadSecondFactor) {
			writeError(w, http.StatusUnauthorized, "bad_code", err.Error())
			return
		}
		log.Printf("console: check code: %v", err)
		writeError(w, http.StatusInternalServerError, "internal", "")
		return
	}
	if err := h.TwoFactor.EndChallenge(r.Context(), req.Challenge); err != nil {
		log.Printf("console: end challenge: %v", err)
	}
	session, err := h.Sessions.Issue(r.Context(), parentID)
	if err != nil {
		log.Printf("console: issue session after two-step: %v", err)
		writeError(w, http.StatusInternalServerError, "internal", "")
		return
	}
	writeJSON(w, http.StatusOK, authResponse{ParentID: parentID, ParentSession: session})
}

func (h *Handlers) checkPassword(w http.ResponseWriter, r *http.Request, parentID, password string) bool {
	match, err := h.Accounts.CheckPassword(r.Context(), parentID, password)
	if err != nil {
		log.Printf("console: check password: %v", err)
		writeError(w, http.StatusInternalServerError, "internal", "")
		return false
	}
	if !match {
		writeError(w, http.StatusForbidden, "wrong_password", "")
		return false
	}
	return true
}

// SetupTwoFactor needs the password, then returns a new secret for the app.
// It is not in use until EnableTwoFactor sees a code from it.
func (h *Handlers) SetupTwoFactor(w http.ResponseWriter, r *http.Request) {
	parentID, ok := h.requireParent(w, r)
	if !ok {
		return
	}
	var req passwordRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	if !h.checkPassword(w, r, parentID, req.Password) {
		return
	}
	parent, err := h.Parents.FindByID(r.Context(), parentID)
	if err != nil || parent == nil {
		writeError(w, http.StatusInternalServerError, "internal", "")
		return
	}
	secret, err := h.TwoFactor.BeginSetup(r.Context(), parentID)
	if err != nil {
		log.Printf("console: begin two-step setup: %v", err)
		writeError(w, http.StatusInternalServerError, "internal", "")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"secret": secret, "uri": domain.OTPAuthURI(parent.Email, secret)})
}

// EnableTwoFactor turns it on with a first code, and returns the recovery codes, shown once.
func (h *Handlers) EnableTwoFactor(w http.ResponseWriter, r *http.Request) {
	parentID, ok := h.requireParent(w, r)
	if !ok {
		return
	}
	var req codeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	codes, err := h.TwoFactor.Enable(r.Context(), parentID, req.Code, time.Now())
	switch {
	case errors.Is(err, domain.ErrTwoFactorPending):
		writeError(w, http.StatusConflict, "setup_first", err.Error())
	case errors.Is(err, domain.ErrBadSecondFactor):
		writeError(w, http.StatusBadRequest, "bad_code", err.Error())
	case err != nil:
		log.Printf("console: enable two-step: %v", err)
		writeError(w, http.StatusInternalServerError, "internal", "")
	default:
		writeJSON(w, http.StatusOK, map[string][]string{"recoveryCodes": codes})
	}
}

// DisableTwoFactor needs both the password and a current code (or a recovery code).
func (h *Handlers) DisableTwoFactor(w http.ResponseWriter, r *http.Request) {
	parentID, ok := h.requireParent(w, r)
	if !ok {
		return
	}
	var req disableTwoFactorRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	if !h.checkPassword(w, r, parentID, req.Password) {
		return
	}
	if err := h.TwoFactor.Check(r.Context(), parentID, req.Code, time.Now()); err != nil {
		if errors.Is(err, domain.ErrBadSecondFactor) {
			writeError(w, http.StatusBadRequest, "bad_code", err.Error())
			return
		}
		log.Printf("console: check code to disable: %v", err)
		writeError(w, http.StatusInternalServerError, "internal", "")
		return
	}
	if err := h.TwoFactor.Disable(r.Context(), parentID); err != nil {
		log.Printf("console: disable two-step: %v", err)
		writeError(w, http.StatusInternalServerError, "internal", "")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
