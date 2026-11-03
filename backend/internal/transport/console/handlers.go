// Package console implements api-spec/openapi.yaml's "console" tag -- the
// endpoints the parent-facing controller (Phase 3) calls, including the
// real signup/login this package's earlier doc comment deferred -- that
// deferral ended the moment Phase 3 actually started (roadmap.md).
package console

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strings"
	"time"

	"manara/backend/internal/domain"
)

type Handlers struct {
	Devices     domain.DeviceRepository
	Policies    domain.PolicyRepository
	Commands    domain.CommandQueue
	Events      domain.EventStore
	Sessions    domain.ParentSessionRepository
	Auth        domain.AuthRepository
	Enrollments domain.EnrollmentTokenRepository
}

type deviceSummaryDTO struct {
	DeviceID      string    `json:"deviceId"`
	Label         string    `json:"label"`
	Status        string    `json:"status"`
	LastSeen      time.Time `json:"lastSeen"`
	PolicyVersion int       `json:"policyVersion"`
}

type commandDTO struct {
	CommandID string         `json:"commandId"`
	Type      string         `json:"type"`
	Params    map[string]any `json:"params,omitempty"`
	Status    string         `json:"status"`
	CreatedAt time.Time      `json:"createdAt"`
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

	session, err := h.Sessions.Issue(r.Context(), parent.ID)
	if err != nil {
		log.Printf("console: issue session after login: %v", err)
		writeError(w, http.StatusInternalServerError, "internal", "")
		return
	}
	writeJSON(w, http.StatusOK, authResponse{ParentID: parent.ID, ParentSession: session})
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
	token, err := h.Enrollments.Create(r.Context(), parentID)
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
			DeviceID: d.ID, Label: d.Label, Status: string(d.Status(now)),
			LastSeen: d.LastSeen, PolicyVersion: version,
		})
	}
	writeJSON(w, http.StatusOK, summaries)
}

func (h *Handlers) SetPolicy(w http.ResponseWriter, r *http.Request) {
	parentID, ok := h.requireParent(w, r)
	if !ok {
		return
	}
	deviceID := r.PathValue("deviceId")
	if _, ok := h.ownsDevice(w, r, parentID, deviceID); !ok {
		return
	}

	var policy domain.Policy
	if err := json.NewDecoder(r.Body).Decode(&policy); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	stored, err := h.Policies.Set(r.Context(), deviceID, policy)
	if err != nil {
		log.Printf("console: set policy: %v", err)
		writeError(w, http.StatusInternalServerError, "internal", "")
		return
	}
	writeJSON(w, http.StatusOK, stored)
}

func (h *Handlers) CreateCommand(w http.ResponseWriter, r *http.Request) {
	parentID, ok := h.requireParent(w, r)
	if !ok {
		return
	}
	deviceID := r.PathValue("deviceId")
	if _, ok := h.ownsDevice(w, r, parentID, deviceID); !ok {
		return
	}

	var req createCommandRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	command, err := h.Commands.Enqueue(r.Context(), deviceID, domain.CommandType(req.Type), req.Params)
	if err != nil {
		log.Printf("console: enqueue command: %v", err)
		writeError(w, http.StatusInternalServerError, "internal", "")
		return
	}
	writeJSON(w, http.StatusAccepted, commandDTO{
		CommandID: command.ID, Type: string(command.Type), Params: command.Params,
		Status: string(command.Status), CreatedAt: command.CreatedAt,
	})
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
