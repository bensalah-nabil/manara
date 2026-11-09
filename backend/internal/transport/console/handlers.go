// Package console implements api-spec/openapi.yaml's "console" tag -- the
// endpoints the parent-facing controller (Phase 3) calls, including the
// real signup/login this package's earlier doc comment deferred -- that
// deferral ended the moment Phase 3 actually started (roadmap.md).
package console

import (
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"manara/backend/internal/domain"
	"manara/backend/internal/transport/guard"
)

type Handlers struct {
	Devices     domain.DeviceRepository
	Policies    domain.PolicyRepository
	Commands    domain.CommandQueue
	Events      domain.EventStore
	Sessions    domain.ParentSessionRepository
	Auth        domain.AuthRepository
	Enrollments domain.EnrollmentTokenRepository
	Setup       domain.SetupRepository
	Releases    domain.ReleaseRepository
	// Notifier wakes a device immediately for CommandType.IsUrgent()
	// commands (e.g. lock_now), instead of relying solely on the next
	// /agent/sync poll. notify.Noop{} when Firebase isn't configured --
	// see cmd/manara-server/main.go.
	Profiles domain.DeviceProfileRepository
	Notifier domain.PushNotifier
	// PushEnabled is false when Notifier is notify.Noop: an urgent command then
	// waits for the phone's next check-in, and the console says so.
	PushEnabled bool

	Parents  domain.ParentRepository
	Accounts domain.AccountRepository
	Resets   domain.PasswordResetRepository
	// Mailer is nil when no email provider is configured; password reset is then off.
	Mailer domain.Mailer
	// ConsoleURL is where a reset link points, e.g. https://manara-rosy.vercel.app
	ConsoleURL string
	// LoginLimiter caps attempts per email, wherever they come from, so a
	// password can't be guessed by spreading tries over many addresses. Nil: off.
	LoginLimiter *guard.Limiter
	// TwoFactor is two-step sign-in; nil turns it off entirely.
	TwoFactor domain.TwoFactorRepository
	// ChallengeLimiter caps code tries per pending sign-in.
	ChallengeLimiter *guard.Limiter
}

type deviceSummaryDTO struct {
	DeviceID      string    `json:"deviceId"`
	Label         string    `json:"label"`
	Color         string    `json:"color,omitempty"`
	Model         string    `json:"model,omitempty"`
	Manufacturer  string    `json:"manufacturer,omitempty"`
	Status        string    `json:"status"`
	LastSeen      time.Time `json:"lastSeen"`
	PolicyVersion int       `json:"policyVersion"`
	AgentVersion  string    `json:"agentVersion,omitempty"`
}

type commandDTO struct {
	CommandID string         `json:"commandId"`
	Type      string         `json:"type"`
	Params    map[string]any `json:"params,omitempty"`
	Status    string         `json:"status"`
	CreatedAt time.Time      `json:"createdAt"`
	// Woken: a push reached the phone, so an urgent command runs now, not at its next check-in.
	Woken bool `json:"woken"`
}

type eventDTO struct {
	ID         string         `json:"id"`
	Kind       string         `json:"kind"`
	OccurredAt time.Time      `json:"occurredAt"`
	Payload    map[string]any `json:"payload,omitempty"`
}

type createCommandRequest struct {
	Type   string         `json:"type"`
	Params map[string]any `json:"params,omitempty"`
}

type signUpRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type loginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type authResponse struct {
	ParentID      string `json:"parentId"`
	ParentSession string `json:"parentSession"`
}

type enrollmentTokenRequest struct {
	Attestation struct {
		ParentOrGuardian bool   `json:"parentOrGuardian"`
		MinorChild       bool   `json:"minorChild"`
		ChildInformed    bool   `json:"childInformed"`
		Version          string `json:"version"`
	} `json:"attestation"`
	PhoneBrand string `json:"phoneBrand"`
}

type enrollmentTokenResponse struct {
	EnrollmentToken string `json:"enrollmentToken"`
}

type errorBody struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

// requireParent resolves the parentSession bearer token, writing 401 and
// returning ok=false if it doesn't resolve -- every handler below starts
// with this, not duplicated auth-checking logic per route.
func (h *Handlers) requireParent(w http.ResponseWriter, r *http.Request) (parentID string, ok bool) {
	token := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
	parentID, found, err := h.Sessions.Resolve(r.Context(), token)
	if err != nil {
		log.Printf("console: resolve parent session: %v", err)
		writeError(w, http.StatusInternalServerError, "internal", "")
		return "", false
	}
	if !found {
		writeError(w, http.StatusUnauthorized, "invalid_token", "")
		return "", false
	}
	return parentID, true
}

// ownsDevice confirms the device belongs to the authenticated parent --
// every per-device handler needs this; without it any parent could read or
// command any other parent's device just by guessing a device id.
func (h *Handlers) ownsDevice(w http.ResponseWriter, r *http.Request, parentID, deviceID string) (*domain.Device, bool) {
	device, err := h.Devices.FindByID(r.Context(), deviceID)
	if err != nil {
		log.Printf("console: find device: %v", err)
		writeError(w, http.StatusInternalServerError, "internal", "")
		return nil, false
	}
	if device == nil || device.ParentID != parentID {
		writeError(w, http.StatusNotFound, "not_found", "")
		return nil, false
	}
	return device, true
}

func (h *Handlers) SignUp(w http.ResponseWriter, r *http.Request) {
	var req signUpRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	if req.Email == "" || req.Password == "" {
		writeError(w, http.StatusBadRequest, "bad_request", "email and password are required")
		return
	}
	if err := domain.ValidatePassword(req.Password); err != nil {
		writeError(w, http.StatusBadRequest, "weak_password", err.Error())
		return
	}

	parent, err := h.Auth.SignUp(r.Context(), req.Email, req.Password)
	if errors.Is(err, domain.ErrEmailTaken) {
		writeError(w, http.StatusConflict, "email_taken", "")
		return
	}
	if err != nil {
		log.Printf("console: sign up: %v", err)
		writeError(w, http.StatusInternalServerError, "internal", "")
		return
	}

	session, err := h.Sessions.Issue(r.Context(), parent.ID)
	if err != nil {
		log.Printf("console: issue session after signup: %v", err)
		writeError(w, http.StatusInternalServerError, "internal", "")
		return
	}
	writeJSON(w, http.StatusOK, authResponse{ParentID: parent.ID, ParentSession: session})
}

func (h *Handlers) Login(w http.ResponseWriter, r *http.Request) {
	var req loginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	if h.LoginLimiter != nil {
		if ok, wait := h.LoginLimiter.Allow(domain.NormalizeEmail(req.Email), time.Now()); !ok {
			guard.Refuse(w, wait)
			return
		}
	}

	parent, err := h.Auth.Login(r.Context(), req.Email, req.Password)
	if errors.Is(err, domain.ErrInvalidCredentials) {
		writeError(w, http.StatusUnauthorized, "invalid_credentials", "")
		return
	}
	if err != nil {
		log.Printf("console: login: %v", err)
		writeError(w, http.StatusInternalServerError, "internal", "")
		return
	}

	h.signIn(w, r, parent.ID)
}

// CreateEnrollmentToken lets a signed-in parent generate their own
// enrollment token from the console -- the real path a parent actually
// uses; cmd/manara-server's -seed flag remains a dev-only shortcut, not
// something this replaces for everyone.
func (h *Handlers) CreateEnrollmentToken(w http.ResponseWriter, r *http.Request) {
	parentID, ok := h.requireParent(w, r)
	if !ok {
		return
	}
	var req enrollmentTokenRequest
	if err := json.NewDecoder(io.LimitReader(r.Body, 4096)).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "attestation_required", "confirm the statements about your child's phone first")
		return
	}
	attestation := domain.GuardianAttestation{
		ParentOrGuardian: req.Attestation.ParentOrGuardian,
		MinorChild:       req.Attestation.MinorChild,
		ChildInformed:    req.Attestation.ChildInformed,
		Version:          req.Attestation.Version,
		PhoneBrand:       req.PhoneBrand,
	}
	if err := attestation.Validate(); err != nil {
		code := "attestation_required"
		switch {
		case errors.Is(err, domain.ErrAttestationOutdated):
			code = "attestation_outdated"
		case errors.Is(err, domain.ErrUnknownPhoneBrand):
			code = "unknown_phone_brand"
		}
		writeError(w, http.StatusBadRequest, code, err.Error())
		return
	}
	token, err := h.Enrollments.Create(r.Context(), parentID, &attestation)
	if err != nil {
		log.Printf("console: create enrollment token: %v", err)
		writeError(w, http.StatusInternalServerError, "internal", "")
		return
	}
	writeJSON(w, http.StatusOK, enrollmentTokenResponse{EnrollmentToken: token})
}

func (h *Handlers) ListDevices(w http.ResponseWriter, r *http.Request) {
	parentID, ok := h.requireParent(w, r)
	if !ok {
		return
	}
	devices, err := h.Devices.ListByParent(r.Context(), parentID)
	if err != nil {
		log.Printf("console: list devices: %v", err)
		writeError(w, http.StatusInternalServerError, "internal", "")
		return
	}

	now := time.Now().UTC()
	summaries := make([]deviceSummaryDTO, 0, len(devices))
	for _, d := range devices {
		policy, err := h.Policies.Get(r.Context(), d.ID)
		version := 0
		if err == nil && policy != nil {
			version = policy.Version
		}
		summaries = append(summaries, deviceSummaryDTO{
			DeviceID: d.ID, Label: d.Label, Color: d.Color, Model: d.Info.Model, Manufacturer: d.Info.Manufacturer,
			Status: string(d.Status(now)), LastSeen: d.LastSeen, PolicyVersion: version,
			AgentVersion: d.Info.AgentVersion,
		})
	}
	writeJSON(w, http.StatusOK, summaries)
}

type profileRequest struct {
	Label *string `json:"label"`
	Color *string `json:"color"`
}

// UpdateDevice saves the child's name and color for a phone. A field left out
// keeps its current value.
func (h *Handlers) UpdateDevice(w http.ResponseWriter, r *http.Request) {
	parentID, ok := h.requireParent(w, r)
	if !ok {
		return
	}
	deviceID := r.PathValue("deviceId")
	device, ok := h.ownsDevice(w, r, parentID, deviceID)
	if !ok {
		return
	}
	var req profileRequest
	if err := json.NewDecoder(io.LimitReader(r.Body, 4<<10)).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "")
		return
	}
	label, color := device.Label, device.Color
	if req.Label != nil {
		label = *req.Label
	}
	if req.Color != nil {
		color = *req.Color
	}
	label, color, err := domain.NormalizeProfile(label, color)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_profile", "The name can be up to 40 letters, and the color must be one of the console's.")
		return
	}
	if err := h.Profiles.UpdateProfile(r.Context(), deviceID, label, color); err != nil {
		log.Printf("console: update device profile: %v", err)
		writeError(w, http.StatusInternalServerError, "internal", "")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"label": label, "color": color})
}

// GetPolicy exists so the controller can edit one part of a policy without
// overwriting the rest: SetPolicy replaces the whole document.
func (h *Handlers) GetPolicy(w http.ResponseWriter, r *http.Request) {
	parentID, ok := h.requireParent(w, r)
	if !ok {
		return
	}
	deviceID := r.PathValue("deviceId")
	if _, ok := h.ownsDevice(w, r, parentID, deviceID); !ok {
		return
	}
	policy, err := h.Policies.Get(r.Context(), deviceID)
	if err != nil {
		log.Printf("console: get policy: %v", err)
		writeError(w, http.StatusInternalServerError, "internal", "")
		return
	}
	if policy == nil {
		inert := domain.DefaultPolicy()
		inert.Version = 0
		policy = &inert
	}
	writeJSON(w, http.StatusOK, policy)
}

// GetSetup returns the phone's guided-setup progress, or null if it never reported any.
func (h *Handlers) GetSetup(w http.ResponseWriter, r *http.Request) {
	parentID, ok := h.requireParent(w, r)
	if !ok {
		return
	}
	deviceID := r.PathValue("deviceId")
	if _, ok := h.ownsDevice(w, r, parentID, deviceID); !ok {
		return
	}
	setup, err := h.Setup.Get(r.Context(), deviceID)
	if err != nil {
		log.Printf("console: get setup: %v", err)
		writeError(w, http.StatusInternalServerError, "internal", "")
		return
	}
	writeJSON(w, http.StatusOK, setup)
}

type pairingCodeRequest struct {
	Code string `json:"code"`
}

// SendPairingCode passes the code the phone's "Pair device with pairing code"
// screen shows to the phone, which reads it while it waits to pair.
func (h *Handlers) SendPairingCode(w http.ResponseWriter, r *http.Request) {
	parentID, ok := h.requireParent(w, r)
	if !ok {
		return
	}
	deviceID := r.PathValue("deviceId")
	if _, ok := h.ownsDevice(w, r, parentID, deviceID); !ok {
		return
	}
	var req pairingCodeRequest
	if err := json.NewDecoder(io.LimitReader(r.Body, 1<<10)).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "")
		return
	}
	code := strings.TrimSpace(req.Code)
	if !domain.ValidPairingCode(code) {
		writeError(w, http.StatusBadRequest, "invalid_pairing_code", "The pairing code is 6 digits.")
		return
	}
	h.setupInput(w, h.Setup.SendPairingCode(r.Context(), deviceID, code), "pairing code")
}

// FinishSetup ends guided setup's last step: the parent signs back in only to
// the accounts they want, then finishes here.
func (h *Handlers) FinishSetup(w http.ResponseWriter, r *http.Request) {
	parentID, ok := h.requireParent(w, r)
	if !ok {
		return
	}
	deviceID := r.PathValue("deviceId")
	if _, ok := h.ownsDevice(w, r, parentID, deviceID); !ok {
		return
	}
	h.setupInput(w, h.Setup.RequestFinish(r.Context(), deviceID), "finish")
}

func (h *Handlers) setupInput(w http.ResponseWriter, err error, what string) {
	switch {
	case errors.Is(err, domain.ErrSetupNotWaiting):
		writeError(w, http.StatusConflict, "setup_not_waiting", "The phone isn't waiting for this right now.")
	case err != nil:
		log.Printf("console: setup %s: %v", what, err)
		writeError(w, http.StatusInternalServerError, "internal", "")
	default:
		writeJSON(w, http.StatusAccepted, map[string]bool{"sent": true})
	}
}

// ClearSetupAccounts lets the parent delete the saved account lists early.
func (h *Handlers) ClearSetupAccounts(w http.ResponseWriter, r *http.Request) {
	parentID, ok := h.requireParent(w, r)
	if !ok {
		return
	}
	deviceID := r.PathValue("deviceId")
	if _, ok := h.ownsDevice(w, r, parentID, deviceID); !ok {
		return
	}
	if err := h.Setup.ClearAccounts(r.Context(), deviceID); err != nil {
		log.Printf("console: clear setup accounts: %v", err)
		writeError(w, http.StatusInternalServerError, "internal", "")
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"cleared": true})
}

func (h *Handlers) SetPolicy(w http.ResponseWriter, r *http.Request) {
	parentID, ok := h.requireParent(w, r)
	if !ok {
		return
	}
	deviceID := r.PathValue("deviceId")
	device, ok := h.ownsDevice(w, r, parentID, deviceID)
	if !ok {
		return
	}

	var policy domain.Policy
	if err := json.NewDecoder(r.Body).Decode(&policy); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	if err := policy.Browser.Validate(); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_browser_rules", err.Error())
		return
	}
	stored, err := h.Policies.Set(r.Context(), deviceID, policy)
	if err != nil {
		log.Printf("console: set policy: %v", err)
		writeError(w, http.StatusInternalServerError, "internal", "")
		return
	}
	// A new bedtime or limit used to wait for the phone's next check-in, up to
	// 15 minutes or longer on an idle phone. The policy is stored first, so a
	// failed push only means the phone gets it at that check-in instead.
	writeJSON(w, http.StatusOK, savedPolicyDTO{Policy: stored, Woken: h.wake(r, device, "policy v"+strconv.Itoa(stored.Version))})
}

// savedPolicyDTO is the stored policy plus whether a push woke the phone to fetch it.
type savedPolicyDTO struct {
	domain.Policy
	Woken bool `json:"woken"`
}

// wake asks the phone to check in now. Best-effort, by domain.PushNotifier's
// contract: whatever it is told to fetch is already stored. True only when a
// push really went out: this server has push, the phone gave a token, and
// Firebase accepted the message.
func (h *Handlers) wake(r *http.Request, device *domain.Device, what string) bool {
	if h.Notifier == nil {
		return false
	}
	if err := h.Notifier.Notify(r.Context(), device.PushToken); err != nil {
		log.Printf("console: push notify for %s: %v", what, err)
		return false
	}
	return h.PushEnabled && device.PushToken != ""
}

func (h *Handlers) CreateCommand(w http.ResponseWriter, r *http.Request) {
	parentID, ok := h.requireParent(w, r)
	if !ok {
		return
	}
	deviceID := r.PathValue("deviceId")
	device, ok := h.ownsDevice(w, r, parentID, deviceID)
	if !ok {
		return
	}

	var req createCommandRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	commandType := domain.CommandType(req.Type)
	if err := domain.ValidateCommand(commandType, req.Params); err != nil {
		code := "unknown_command"
		if errors.Is(err, domain.ErrUnknownReleaseMode) {
			code = "invalid_release_mode"
		}
		writeError(w, http.StatusBadRequest, code, err.Error())
		return
	}
	command, err := h.Commands.Enqueue(r.Context(), deviceID, commandType, req.Params)
	if err != nil {
		log.Printf("console: enqueue command: %v", err)
		writeError(w, http.StatusInternalServerError, "internal", "")
		return
	}

	// Best-effort, by domain.PushNotifier's contract: the command above is
	// already durably queued, so a push failure here never loses it --
	// worst case it's picked up on the device's next poll instead.
	woken := false
	if commandType.IsUrgent() {
		woken = h.wake(r, device, "command "+command.ID)
	}

	writeJSON(w, http.StatusAccepted, commandDTO{
		CommandID: command.ID, Type: string(command.Type), Params: command.Params,
		Status: string(command.Status), CreatedAt: command.CreatedAt, Woken: woken,
	})
}

type releaseCodeDTO struct {
	Code       string    `json:"code"`
	ValidUntil time.Time `json:"validUntil"`
	// PhoneReady is false until the phone has confirmed it holds the secret;
	// until then a code typed on the phone cannot work.
	PhoneReady bool `json:"phoneReady"`
}

// GetReleaseCode gives the parent the code that frees the phone when it can't be reached.
func (h *Handlers) GetReleaseCode(w http.ResponseWriter, r *http.Request) {
	parentID, ok := h.requireParent(w, r)
	if !ok {
		return
	}
	deviceID := r.PathValue("deviceId")
	if _, ok := h.ownsDevice(w, r, parentID, deviceID); !ok {
		return
	}
	secret, confirmed, err := h.Releases.Secret(r.Context(), deviceID)
	if err != nil {
		log.Printf("console: release code: %v", err)
		writeError(w, http.StatusInternalServerError, "internal", "")
		return
	}
	code, until := domain.ReleaseCode(secret, time.Now())
	writeJSON(w, http.StatusOK, releaseCodeDTO{Code: code, ValidUntil: until, PhoneReady: confirmed})
}

// DeleteDevice removes a phone from the account, with everything stored about it.
// It doesn't free the phone itself: that takes a release command or code first.
func (h *Handlers) DeleteDevice(w http.ResponseWriter, r *http.Request) {
	parentID, ok := h.requireParent(w, r)
	if !ok {
		return
	}
	deviceID := r.PathValue("deviceId")
	if _, ok := h.ownsDevice(w, r, parentID, deviceID); !ok {
		return
	}
	if err := h.Releases.Delete(r.Context(), deviceID); err != nil {
		log.Printf("console: delete device: %v", err)
		writeError(w, http.StatusInternalServerError, "internal", "")
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"deleted": true})
}

func (h *Handlers) ListEvents(w http.ResponseWriter, r *http.Request) {
	parentID, ok := h.requireParent(w, r)
	if !ok {
		return
	}
	deviceID := r.PathValue("deviceId")
	if _, ok := h.ownsDevice(w, r, parentID, deviceID); !ok {
		return
	}

	var kind *domain.EventKind
	if k := r.URL.Query().Get("kind"); k != "" {
		ek := domain.EventKind(k)
		kind = &ek
	}
	var since *time.Time
	if s := r.URL.Query().Get("since"); s != "" {
		t, err := time.Parse(time.RFC3339, s)
		if err != nil {
			writeError(w, http.StatusBadRequest, "bad_request", "since must be RFC3339")
			return
		}
		since = &t
	}

	events, err := h.Events.ListByDevice(r.Context(), deviceID, kind, since)
	if err != nil {
		log.Printf("console: list events: %v", err)
		writeError(w, http.StatusInternalServerError, "internal", "")
		return
	}
	dtos := make([]eventDTO, 0, len(events))
	for _, e := range events {
		dtos = append(dtos, eventDTO{ID: e.ID, Kind: string(e.Kind), OccurredAt: e.OccurredAt, Payload: e.Payload})
	}
	writeJSON(w, http.StatusOK, dtos)
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, errorBody{Code: code, Message: message})
}
