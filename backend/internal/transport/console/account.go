package console

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strings"
	"time"

	"manara/backend/internal/domain"
)

type passwordResetRequest struct {
	Email string `json:"email"`
}

type passwordResetConfirm struct {
	Token    string `json:"token"`
	Password string `json:"password"`
}

type deleteAccountRequest struct {
	Password string `json:"password"`
}

type accountDTO struct {
	Email string `json:"email"`
	// Phones still on the account; deletion waits until it is zero.
	Phones int `json:"phones"`
	// PasswordReset is false when this server cannot send email, so the
	// console doesn't offer a link that can never arrive.
	PasswordReset bool `json:"passwordReset"`
	TwoFactor     bool `json:"twoFactor"`
	// Language the console and emails use for this parent: en, fr or ar.
	Language string `json:"language"`
}

type updateAccountRequest struct {
	Language string `json:"language"`
}

// resetsAvailable: a reset needs a way to send mail and a console to link to.
func (h *Handlers) resetsAvailable() bool {
	return h.Mailer != nil && h.Resets != nil && h.ConsoleURL != ""
}

// RequestPasswordReset always answers the same way for any address, and
// sends in the background, so neither the answer nor its timing tells the
// caller whether an account exists.
func (h *Handlers) RequestPasswordReset(w http.ResponseWriter, r *http.Request) {
	var req passwordResetRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	email := domain.NormalizeEmail(req.Email)
	if !strings.Contains(email, "@") {
		writeError(w, http.StatusBadRequest, "bad_request", "an email address is required")
		return
	}
	if !h.resetsAvailable() {
		writeError(w, http.StatusServiceUnavailable, "email_unavailable", "this server cannot send email")
		return
	}
	go h.sendReset(context.WithoutCancel(r.Context()), email)
	writeJSON(w, http.StatusAccepted, map[string]bool{"sent": true})
}

func (h *Handlers) sendReset(ctx context.Context, email string) {
	ctx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	token, ok, err := h.Resets.Create(ctx, email, domain.PasswordResetTTL, domain.PasswordResetCooldown)
	if err != nil {
		log.Printf("console: create password reset: %v", err)
		return
	}
	if !ok {
		return // no such account, or one was just sent
	}
	subject, text := domain.ResetEmail(strings.TrimRight(h.ConsoleURL, "/") + "/#reset=" + token)
	if err := h.Mailer.Send(ctx, email, subject, text); err != nil {
		log.Printf("console: send password reset: %v", err)
	}
}

func (h *Handlers) ConfirmPasswordReset(w http.ResponseWriter, r *http.Request) {
	var req passwordResetConfirm
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	if h.Resets == nil {
		writeError(w, http.StatusServiceUnavailable, "email_unavailable", "this server cannot send email")
		return
	}
	if err := domain.ValidatePassword(req.Password); err != nil {
		writeError(w, http.StatusBadRequest, "weak_password", err.Error())
		return
	}
	parentID, err := h.Resets.Consume(r.Context(), strings.TrimSpace(req.Token), req.Password)
	if errors.Is(err, domain.ErrResetTokenInvalid) {
		writeError(w, http.StatusBadRequest, "invalid_reset_token", err.Error())
		return
	}
	if err != nil {
		log.Printf("console: confirm password reset: %v", err)
		writeError(w, http.StatusInternalServerError, "internal", "")
		return
	}
	// A reset proves the email, not the authenticator: two-step sign-in still applies.
	h.signIn(w, r, parentID)
}

// Logout ends this session on the server; the console also forgets it.
func (h *Handlers) Logout(w http.ResponseWriter, r *http.Request) {
	token := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
	if token == "" {
		writeError(w, http.StatusUnauthorized, "invalid_token", "")
		return
	}
	if err := h.Sessions.Revoke(r.Context(), token); err != nil {
		log.Printf("console: logout: %v", err)
		writeError(w, http.StatusInternalServerError, "internal", "")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handlers) GetAccount(w http.ResponseWriter, r *http.Request) {
	parentID, ok := h.requireParent(w, r)
	if !ok {
		return
	}
	parent, err := h.Parents.FindByID(r.Context(), parentID)
	if err != nil || parent == nil {
		if err != nil {
			log.Printf("console: find parent: %v", err)
		}
		writeError(w, http.StatusInternalServerError, "internal", "")
		return
	}
	devices, err := h.Devices.ListByParent(r.Context(), parentID)
	if err != nil {
		log.Printf("console: list devices for account: %v", err)
		writeError(w, http.StatusInternalServerError, "internal", "")
		return
	}
	twoFactor := false
	if h.TwoFactor != nil {
		if twoFactor, err = h.TwoFactor.Enabled(r.Context(), parentID); err != nil {
			log.Printf("console: two-step status: %v", err)
			writeError(w, http.StatusInternalServerError, "internal", "")
			return
		}
	}
	writeJSON(w, http.StatusOK, accountDTO{Email: parent.Email, Phones: len(devices), PasswordReset: h.resetsAvailable(), TwoFactor: twoFactor, Language: domain.NormalizeLanguage(parent.Language)})
}

// UpdateAccount stores the language the parent chose in the console, so
// emails (alerts, the weekly summary) are written in it too.
func (h *Handlers) UpdateAccount(w http.ResponseWriter, r *http.Request) {
	parentID, ok := h.requireParent(w, r)
	if !ok {
		return
	}
	var req updateAccountRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	if !domain.Languages[req.Language] {
		writeError(w, http.StatusBadRequest, "unknown_language", domain.ErrUnknownLanguage.Error())
		return
	}
	if err := h.Parents.SetLanguage(r.Context(), parentID, req.Language); err != nil {
		log.Printf("console: set language: %v", err)
		writeError(w, http.StatusInternalServerError, "internal", "")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"language": req.Language})
}

// DeleteAccount needs the password again: a session left open on a shared
// computer must not be enough to erase a family's account.
func (h *Handlers) DeleteAccount(w http.ResponseWriter, r *http.Request) {
	parentID, ok := h.requireParent(w, r)
	if !ok {
		return
	}
	var req deleteAccountRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	match, err := h.Accounts.CheckPassword(r.Context(), parentID, req.Password)
	if err != nil {
		log.Printf("console: check password: %v", err)
		writeError(w, http.StatusInternalServerError, "internal", "")
		return
	}
	if !match {
		// 403, not 401: the console treats 401 as "your session ended".
		writeError(w, http.StatusForbidden, "wrong_password", "")
		return
	}
	err = h.Accounts.Delete(r.Context(), parentID)
	if errors.Is(err, domain.ErrDevicesRemain) {
		writeError(w, http.StatusConflict, "devices_remain", err.Error())
		return
	}
	if err != nil {
		log.Printf("console: delete account: %v", err)
		writeError(w, http.StatusInternalServerError, "internal", "")
		return
	}
	log.Printf("console: account %s deleted", parentID)
	writeJSON(w, http.StatusOK, map[string]bool{"deleted": true})
}
