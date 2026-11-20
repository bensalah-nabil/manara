package admin

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"

	"manara/backend/internal/domain"
)

// The admin console's actions (docs/admin-console.md, part 1). Each one, in this order:
//  1. a valid Entra token for an allowed admin (as every admin request);
//  2. a rate limit per admin;
//  3. a reason, kept in the admin log;
//  4. a typed confirmation naming the target (the account's email, a phone's code, a version);
//  5. an admin-log entry written before the action runs, and another if it fails;
//  6. for an account, an entry in that parent's own Recent activity ("Manara support ...").
// None of them reads or changes what a phone does: no location, calls, usage, rules or commands.

// Actions holds what the actions need besides Handlers' own store.
type Actions struct {
	TwoFactor interface {
		Disable(ctx context.Context, parentID string) error
	}
	Accounts interface {
		Delete(ctx context.Context, parentID string) error
	}
	Resets     domain.PasswordResetRepository
	Mailer     domain.Mailer
	ConsoleURL string
	Releases   interface {
		Delete(ctx context.Context, deviceID string) error
	}
	Audit    domain.AuditLog
	Settings domain.SettingsStore
	Updates  *domain.AgentUpdateSource
	// VerifyAPK downloads url and checks its SHA-256; nil uses the real download.
	VerifyAPK func(ctx context.Context, url, sha256 string) error
	// Limiter bounds writes per admin; nil means no limit (tests).
	Limiter interface {
		Allow(ctx context.Context, key string, now time.Time) (bool, time.Duration)
	}
}

// ActionRoutes registers the write endpoints, and the parents' public notice.
func ActionRoutes(mux *http.ServeMux, h *Handlers) {
	mux.HandleFunc("POST /api/v1/admin/accounts/{id}/two-step-off", h.TwoStepOff)
	mux.HandleFunc("POST /api/v1/admin/accounts/{id}/password-reset", h.SendPasswordReset)
	mux.HandleFunc("POST /api/v1/admin/accounts/{id}/suspend", h.Suspend)
	mux.HandleFunc("POST /api/v1/admin/accounts/{id}/reactivate", h.Reactivate)
	mux.HandleFunc("POST /api/v1/admin/accounts/{id}/delete", h.DeleteAccount)
	mux.HandleFunc("POST /api/v1/admin/phones/{id}/setup-reset", h.ResetSetup)
	mux.HandleFunc("POST /api/v1/admin/phones/{id}/remove", h.RemovePhone)
	mux.HandleFunc("GET /api/v1/admin/agent-update", h.GetAgentUpdate)
	mux.HandleFunc("PUT /api/v1/admin/agent-update", h.SetAgentUpdate)
	mux.HandleFunc("POST /api/v1/admin/agent-update/pause", h.PauseAgentUpdate)
	mux.HandleFunc("DELETE /api/v1/admin/agent-update", h.ResetAgentUpdate)
	mux.HandleFunc("GET /api/v1/admin/notice", h.GetNotice)
	mux.HandleFunc("PUT /api/v1/admin/notice", h.SetNotice)
	mux.HandleFunc("DELETE /api/v1/admin/notice", h.ClearNotice)
}

type actionRequest struct {
	Reason  string `json:"reason"`
	Confirm string `json:"confirm"`
	// Version and Notice are for the release and notice actions only.
	VersionCode int            `json:"versionCode,omitempty"`
	VersionName string         `json:"versionName,omitempty"`
	SHA256      string         `json:"sha256,omitempty"`
	Notice      *domain.Notice `json:"notice,omitempty"`
}

const maxReason = 300

// PhoneCode is what an admin types to confirm an action on a phone: the first 8 characters of its id.
func PhoneCode(deviceID string) string {
	if len(deviceID) > 8 {
		return deviceID[:8]
	}
	return deviceID
}

// begin authenticates, limits and reads an action. False means the answer is written.
func (h *Handlers) begin(w http.ResponseWriter, r *http.Request) (domain.Admin, actionRequest, bool) {
	a, ok := h.authenticate(w, r)
	if !ok {
		return a, actionRequest{}, false
	}
	if h.Actions == nil {
		writeError(w, http.StatusNotFound, "not_found", "")
		return a, actionRequest{}, false
	}
	if l := h.Actions.Limiter; l != nil {
		if allowed, _ := l.Allow(r.Context(), "admin-write:"+a.ID, h.now()); !allowed {
			writeError(w, http.StatusTooManyRequests, "rate_limited", "too many admin actions; wait a few minutes")
			return a, actionRequest{}, false
		}
	}
	var req actionRequest
	if err := json.NewDecoder(io.LimitReader(r.Body, 8<<10)).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "a JSON body is required")
		return a, actionRequest{}, false
	}
	req.Reason = strings.TrimSpace(req.Reason)
	if req.Reason == "" || len([]rune(req.Reason)) > maxReason {
		writeError(w, http.StatusBadRequest, "reason_required", "say why, in at most 300 characters")
		return a, actionRequest{}, false
	}
	return a, req, true
}

// confirmed checks the typed confirmation, case and spaces aside.
func confirmed(w http.ResponseWriter, typed, want string) bool {
	if want == "" || !strings.EqualFold(strings.TrimSpace(typed), strings.TrimSpace(want)) {
		writeError(w, http.StatusBadRequest, "confirm_mismatch", "type the target exactly to confirm")
		return false
	}
	return true
}

// logged writes the admin-log entry before acting. False means the answer is written.
func (h *Handlers) logged(w http.ResponseWriter, r *http.Request, a domain.Admin, action, target, reason string) bool {
	if err := h.Store.RecordAdmin(r.Context(), domain.AdminLogEntry{
		AdminID: a.ID, AdminName: a.Name, Action: action, Target: target + " | reason: " + reason, At: h.now(),
	}); err != nil {
		log.Printf("admin: record %s: %v", action, err)
		writeError(w, http.StatusInternalServerError, "internal", "")
		return false
	}
	return true
}

func (h *Handlers) failed(r *http.Request, a domain.Admin, action, target string, err error) {
	log.Printf("admin: %s %s: %v", action, target, err)
	_ = h.Store.RecordAdmin(r.Context(), domain.AdminLogEntry{AdminID: a.ID, AdminName: a.Name, Action: "failed_" + action, Target: target, At: h.now()})
}

// tellParent puts the action in the parent's own Recent activity: support never acts unseen.
func (h *Handlers) tellParent(ctx context.Context, accountID, deviceID string, action domain.AuditAction) {
	if h.Actions.Audit == nil {
		return
	}
	if err := h.Actions.Audit.Record(ctx, domain.AuditEntry{ParentID: accountID, DeviceID: deviceID, Action: action, At: h.now()}); err != nil {
		log.Printf("admin: parent's activity log: %v", err)
	}
}

// account loads the target account and checks the typed email. False means the answer is written.
func (h *Handlers) account(w http.ResponseWriter, r *http.Request, req actionRequest) (*domain.AdminAccount, bool) {
	acc, err := h.Store.Account(r.Context(), r.PathValue("id"))
	if err != nil {
		log.Printf("admin: %v", err)
		writeError(w, http.StatusInternalServerError, "internal", "")
		return nil, false
	}
	if acc == nil {
		writeError(w, http.StatusNotFound, "not_found", "no such account")
		return nil, false
	}
	return acc, confirmed(w, req.Confirm, acc.Email)
}

func (h *Handlers) TwoStepOff(w http.ResponseWriter, r *http.Request) {
	a, req, ok := h.begin(w, r)
	if !ok {
		return
	}
	acc, ok := h.account(w, r, req)
	if !ok || !h.logged(w, r, a, "two_step_off", "account "+acc.Email, req.Reason) {
		return
	}
	if h.Actions.TwoFactor == nil {
		writeError(w, http.StatusNotImplemented, "unavailable", "")
		return
	}
	if err := h.Actions.TwoFactor.Disable(r.Context(), acc.ID); err != nil {
		h.failed(r, a, "two_step_off", acc.Email, err)
		writeError(w, http.StatusInternalServerError, "internal", "")
		return
	}
	h.tellParent(r.Context(), acc.ID, "", domain.AuditSupportTwoStepOff)
	writeJSON(w, map[string]bool{"done": true})
}

func (h *Handlers) SendPasswordReset(w http.ResponseWriter, r *http.Request) {
	a, req, ok := h.begin(w, r)
	if !ok {
		return
	}
	acc, ok := h.account(w, r, req)
	if !ok {
		return
	}
	if h.Actions.Resets == nil || h.Actions.Mailer == nil || h.Actions.ConsoleURL == "" {
		writeError(w, http.StatusServiceUnavailable, "email_unavailable", "this server cannot send email")
		return
	}
	if !h.logged(w, r, a, "password_reset_sent", "account "+acc.Email, req.Reason) {
		return
	}
	// A short cooldown, so the parent isn't sent two links seconds apart.
	token, created, err := h.Actions.Resets.Create(r.Context(), acc.Email, domain.PasswordResetTTL, time.Minute)
	if err != nil {
		h.failed(r, a, "password_reset_sent", acc.Email, err)
		writeError(w, http.StatusInternalServerError, "internal", "")
		return
	}
	if !created {
		writeError(w, http.StatusConflict, "recently_sent", "a link was sent less than a minute ago")
		return
	}
	subject, text := domain.ResetEmail(strings.TrimRight(h.Actions.ConsoleURL, "/") + "/#reset=" + token)
	if err := h.Actions.Mailer.Send(r.Context(), acc.Email, subject, text); err != nil {
		h.failed(r, a, "password_reset_sent", acc.Email, err)
		writeError(w, http.StatusBadGateway, "email_failed", "the email could not be sent; see the server log")
		return
	}
	h.tellParent(r.Context(), acc.ID, "", domain.AuditSupportResetSent)
	writeJSON(w, map[string]bool{"done": true})
}

func (h *Handlers) setSuspended(w http.ResponseWriter, r *http.Request, suspend bool) {
	a, req, ok := h.begin(w, r)
	if !ok {
		return
	}
	acc, ok := h.account(w, r, req)
	if !ok {
		return
	}
	action, audit := "reactivated_account", domain.AuditSupportReactivated
	if suspend {
		action, audit = "suspended_account", domain.AuditSupportSuspended
	}
	if !h.logged(w, r, a, action, "account "+acc.Email, req.Reason) {
		return
	}
	if _, err := h.Store.SetSuspended(r.Context(), acc.ID, suspend, h.now()); err != nil {
		h.failed(r, a, action, acc.Email, err)
		writeError(w, http.StatusInternalServerError, "internal", "")
		return
	}
	h.tellParent(r.Context(), acc.ID, "", audit)
	writeJSON(w, map[string]bool{"done": true})
}

func (h *Handlers) Suspend(w http.ResponseWriter, r *http.Request)    { h.setSuspended(w, r, true) }
func (h *Handlers) Reactivate(w http.ResponseWriter, r *http.Request) { h.setSuspended(w, r, false) }

func (h *Handlers) DeleteAccount(w http.ResponseWriter, r *http.Request) {
	a, req, ok := h.begin(w, r)
	if !ok {
		return
	}
	acc, ok := h.account(w, r, req)
	if !ok {
		return
	}
	// A phone still managed by a deleted account could never be released (CLAUDE.md, the account page).
	if acc.Phones > 0 {
		writeError(w, http.StatusConflict, "phones_remain", "release or remove its phones first")
		return
	}
	if h.Actions.Accounts == nil {
		writeError(w, http.StatusNotImplemented, "unavailable", "")
		return
	}
	if !h.logged(w, r, a, "deleted_account", "account "+acc.Email, req.Reason) {
		return
	}
	if err := h.Actions.Accounts.Delete(r.Context(), acc.ID); err != nil {
		h.failed(r, a, "deleted_account", acc.Email, err)
		if errors.Is(err, domain.ErrDevicesRemain) {
			writeError(w, http.StatusConflict, "phones_remain", "release or remove its phones first")
			return
		}
		writeError(w, http.StatusInternalServerError, "internal", "")
		return
	}
	writeJSON(w, map[string]bool{"done": true})
}

// phone loads the target phone and checks its typed code. False means the answer is written.
func (h *Handlers) phone(w http.ResponseWriter, r *http.Request, req actionRequest) (string, string, bool) {
	deviceID := r.PathValue("id")
	accountID, email, found, err := h.Store.PhoneOwner(r.Context(), deviceID)
	if err != nil {
		log.Printf("admin: %v", err)
		writeError(w, http.StatusInternalServerError, "internal", "")
		return "", "", false
	}
	if !found {
		writeError(w, http.StatusNotFound, "not_found", "no such phone")
		return "", "", false
	}
	return accountID, email, confirmed(w, req.Confirm, PhoneCode(deviceID))
}

func (h *Handlers) ResetSetup(w http.ResponseWriter, r *http.Request) {
	a, req, ok := h.begin(w, r)
	if !ok {
		return
	}
	accountID, email, ok := h.phone(w, r, req)
	deviceID := r.PathValue("id")
	if !ok || !h.logged(w, r, a, "reset_setup", "phone "+PhoneCode(deviceID)+" of "+email, req.Reason) {
		return
	}
	if _, err := h.Store.DeleteSetup(r.Context(), deviceID); err != nil {
		h.failed(r, a, "reset_setup", deviceID, err)
		writeError(w, http.StatusInternalServerError, "internal", "")
		return
	}
	h.tellParent(r.Context(), accountID, deviceID, domain.AuditSupportSetupReset)
	writeJSON(w, map[string]bool{"done": true})
}

func (h *Handlers) RemovePhone(w http.ResponseWriter, r *http.Request) {
	a, req, ok := h.begin(w, r)
	if !ok {
		return
	}
	accountID, email, ok := h.phone(w, r, req)
	deviceID := r.PathValue("id")
	if !ok {
		return
	}
	if h.Actions.Releases == nil {
		writeError(w, http.StatusNotImplemented, "unavailable", "")
		return
	}
	if !h.logged(w, r, a, "removed_phone", "phone "+PhoneCode(deviceID)+" of "+email, req.Reason) {
		return
	}
	// Recorded for the parent first: the phone's own entries go with it.
	h.tellParent(r.Context(), accountID, deviceID, domain.AuditSupportPhoneRemoved)
	if err := h.Actions.Releases.Delete(r.Context(), deviceID); err != nil {
		h.failed(r, a, "removed_phone", deviceID, err)
		writeError(w, http.StatusInternalServerError, "internal", "")
		return
	}
	writeJSON(w, map[string]bool{"done": true})
}

type agentUpdateDTO struct {
	// Offered is what phones are told now, or null while updates are held.
	Offered *domain.AgentUpdate `json:"offered"`
	// Setting is the admin console's choice, or null when Render's settings apply.
	Setting *domain.AgentUpdateSetting `json:"setting"`
	// Fallback is Render's AGENT_UPDATE_* settings.
	Fallback *domain.AgentUpdate `json:"fallback"`
}

func (h *Handlers) GetAgentUpdate(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.admin(w, r, "viewed_agent_update", ""); !ok {
		return
	}
	if h.Actions == nil || h.Actions.Settings == nil || h.Actions.Updates == nil {
		writeError(w, http.StatusNotFound, "not_found", "")
		return
	}
	dto := agentUpdateDTO{Offered: h.Actions.Updates.Current(r.Context()), Fallback: h.Actions.Updates.Fallback}
	var s domain.AgentUpdateSetting
	found, err := h.Actions.Settings.Setting(r.Context(), domain.SettingAgentUpdate, &s)
	if err != nil {
		log.Printf("admin: %v", err)
		writeError(w, http.StatusInternalServerError, "internal", "")
		return
	}
	if found {
		dto.Setting = &s
	}
	writeJSON(w, dto)
}

func (h *Handlers) SetAgentUpdate(w http.ResponseWriter, r *http.Request) {
	a, req, ok := h.begin(w, r)
	if !ok {
		return
	}
	offer, err := domain.NewAgentUpdate(req.VersionCode, req.VersionName, strings.ToLower(strings.TrimSpace(req.SHA256)))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_version", err.Error())
		return
	}
	if !confirmed(w, req.Confirm, offer.VersionName) {
		return
	}
	if h.Actions.Settings == nil || h.Actions.Updates == nil {
		writeError(w, http.StatusNotImplemented, "unavailable", "")
		return
	}
	// The file phones would download must exist and match, or every phone would fail its update.
	verify := h.Actions.VerifyAPK
	if verify == nil {
		verify = downloadAndCheck
	}
	if err := verify(r.Context(), offer.URL, offer.SHA256); err != nil {
		writeError(w, http.StatusUnprocessableEntity, "apk_mismatch", err.Error())
		return
	}
	if !h.logged(w, r, a, "offered_version", offer.VersionName+" ("+fmt.Sprint(offer.VersionCode)+")", req.Reason) {
		return
	}
	setting := domain.AgentUpdateSetting{VersionCode: offer.VersionCode, VersionName: offer.VersionName, SHA256: offer.SHA256}
	if err := h.Actions.Settings.PutSetting(r.Context(), domain.SettingAgentUpdate, setting, a.Name); err != nil {
		h.failed(r, a, "offered_version", offer.VersionName, err)
		writeError(w, http.StatusInternalServerError, "internal", "")
		return
	}
	h.Actions.Updates.Forget()
	writeJSON(w, map[string]bool{"done": true})
}

func (h *Handlers) PauseAgentUpdate(w http.ResponseWriter, r *http.Request) {
	a, req, ok := h.begin(w, r)
	if !ok || !h.logged(w, r, a, "paused_updates", "every phone", req.Reason) {
		return
	}
	if h.Actions.Settings == nil || h.Actions.Updates == nil {
		writeError(w, http.StatusNotImplemented, "unavailable", "")
		return
	}
	if err := h.Actions.Settings.PutSetting(r.Context(), domain.SettingAgentUpdate, domain.AgentUpdateSetting{Paused: true}, a.Name); err != nil {
		h.failed(r, a, "paused_updates", "", err)
		writeError(w, http.StatusInternalServerError, "internal", "")
		return
	}
	h.Actions.Updates.Forget()
	writeJSON(w, map[string]bool{"done": true})
}

// ResetAgentUpdate drops the console's choice, so Render's settings apply again.
func (h *Handlers) ResetAgentUpdate(w http.ResponseWriter, r *http.Request) {
	a, req, ok := h.begin(w, r)
	if !ok || !h.logged(w, r, a, "updates_back_to_server_settings", "every phone", req.Reason) {
		return
	}
	if h.Actions.Settings == nil || h.Actions.Updates == nil {
		writeError(w, http.StatusNotImplemented, "unavailable", "")
		return
	}
	if err := h.Actions.Settings.DeleteSetting(r.Context(), domain.SettingAgentUpdate); err != nil {
		h.failed(r, a, "updates_back_to_server_settings", "", err)
		writeError(w, http.StatusInternalServerError, "internal", "")
		return
	}
	h.Actions.Updates.Forget()
	writeJSON(w, map[string]bool{"done": true})
}

// maxAPK is far above Manara's 4-5 MB; a bigger file is not a Manara release.
const maxAPK = 60 << 20

func downloadAndCheck(ctx context.Context, url, want string) error {
	if !strings.HasPrefix(url, domain.AgentReleasesURL) {
		return fmt.Errorf("not a Manara release address")
	}
	ctx, cancel := context.WithTimeout(ctx, 90*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return fmt.Errorf("download %s: %w", url, err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("download %s: status %d (is the GitHub release published with manara.apk?)", url, resp.StatusCode)
	}
	hash := sha256.New()
	n, err := io.Copy(hash, io.LimitReader(resp.Body, maxAPK+1))
	if err != nil {
		return fmt.Errorf("download %s: %w", url, err)
	}
	if n > maxAPK {
		return fmt.Errorf("the file is larger than %d MB", maxAPK>>20)
	}
	if got := hex.EncodeToString(hash.Sum(nil)); got != want {
		return fmt.Errorf("the file's SHA-256 is %s, not %s", got, want)
	}
	return nil
}

func (h *Handlers) GetNotice(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.admin(w, r, "viewed_notice", ""); !ok {
		return
	}
	notice, err := h.currentNotice(r.Context(), false)
	if err != nil {
		log.Printf("admin: %v", err)
		writeError(w, http.StatusInternalServerError, "internal", "")
		return
	}
	writeJSON(w, map[string]*domain.Notice{"notice": notice})
}

func (h *Handlers) SetNotice(w http.ResponseWriter, r *http.Request) {
	a, req, ok := h.begin(w, r)
	if !ok {
		return
	}
	if req.Notice == nil {
		writeError(w, http.StatusBadRequest, "invalid_notice", "a notice is required")
		return
	}
	if err := req.Notice.Validate(h.now()); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_notice", err.Error())
		return
	}
	if h.Actions.Settings == nil || !h.logged(w, r, a, "set_notice", req.Notice.Level+": "+req.Notice.Text["en"], req.Reason) {
		return
	}
	if err := h.Actions.Settings.PutSetting(r.Context(), domain.SettingNotice, req.Notice, a.Name); err != nil {
		h.failed(r, a, "set_notice", "", err)
		writeError(w, http.StatusInternalServerError, "internal", "")
		return
	}
	writeJSON(w, map[string]bool{"done": true})
}

func (h *Handlers) ClearNotice(w http.ResponseWriter, r *http.Request) {
	a, req, ok := h.begin(w, r)
	if !ok || h.Actions.Settings == nil || !h.logged(w, r, a, "cleared_notice", "", req.Reason) {
		return
	}
	if err := h.Actions.Settings.DeleteSetting(r.Context(), domain.SettingNotice); err != nil {
		h.failed(r, a, "cleared_notice", "", err)
		writeError(w, http.StatusInternalServerError, "internal", "")
		return
	}
	writeJSON(w, map[string]bool{"done": true})
}

func (h *Handlers) currentNotice(ctx context.Context, activeOnly bool) (*domain.Notice, error) {
	if h.Actions == nil || h.Actions.Settings == nil {
		return nil, nil
	}
	var n domain.Notice
	found, err := h.Actions.Settings.Setting(ctx, domain.SettingNotice, &n)
	if err != nil || !found {
		return nil, err
	}
	if activeOnly && !n.ActiveAt(h.now()) {
		return nil, nil
	}
	return &n, nil
}

// PublicNotice serves the parents' console: the active notice, or null. No sign-in needed: it
// says nothing about any account, and the sign-in page shows it too.
func (h *Handlers) PublicNotice(w http.ResponseWriter, r *http.Request) {
	notice, err := h.currentNotice(r.Context(), true)
	if err != nil {
		log.Printf("admin: public notice: %v", err)
		notice = nil
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "public, max-age=60")
	_ = json.NewEncoder(w).Encode(map[string]*domain.Notice{"notice": notice})
}
