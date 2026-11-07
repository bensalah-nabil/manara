// Package agent implements the endpoints api-spec/openapi.yaml tags
// "agent-sync" and "enrollment" -- /enroll and /agent/sync. No business
// rules live here (architecture.md §3): this translates HTTP <-> domain
// calls and nothing more.
package agent

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"strings"
	"time"

	"manara/backend/internal/domain"

	"github.com/google/uuid"
)

type Handlers struct {
	Devices     domain.DeviceRepository
	Tokens      domain.TokenRepository
	Policies    domain.PolicyRepository
	Commands    domain.CommandQueue
	Events      domain.EventStore
	Enrollments domain.EnrollmentTokenRepository
	Setup       domain.SetupRepository
	Releases    domain.ReleaseRepository
	// Alerts is optional: nil means no parent alerts are configured.
	Alerts *domain.AlertService
}

// --- wire types, matching api-spec/openapi.yaml field-for-field ------------

type deviceInfoDTO struct {
	Model          string `json:"model"`
	Manufacturer   string `json:"manufacturer,omitempty"`
	AndroidVersion string `json:"androidVersion"`
	AgentVersion   string `json:"agentVersion,omitempty"`
}

type enrollRequest struct {
	EnrollmentToken string        `json:"enrollmentToken"`
	DeviceInfo      deviceInfoDTO `json:"deviceInfo"`
}

type enrollResponse struct {
	DeviceID    string        `json:"deviceId"`
	DeviceToken string        `json:"deviceToken"`
	Policy      domain.Policy `json:"policy"`
	// ReleaseSecret (base64) lets the phone check a parent's offline release code.
	ReleaseSecret string `json:"releaseSecret"`
}

type commandAckDTO struct {
	CommandID string `json:"commandId"`
	Status    string `json:"status"`
	Detail    string `json:"detail,omitempty"`
}

type syncRequest struct {
	PolicyVersion int             `json:"policyVersion"`
	Events        []eventDTO      `json:"events"`
	CommandAcks   []commandAckDTO `json:"commandAcks"`
	// PushToken is optional and omitted by an agent build that doesn't
	// have Firebase configured -- an empty/missing value just means push
	// isn't available for this device, not an error.
	PushToken string `json:"pushToken,omitempty"`
	// HasReleaseSecret false (an older or just-upgraded agent) asks for the secret.
	HasReleaseSecret bool `json:"hasReleaseSecret,omitempty"`
}

type eventDTO struct {
	ID         string         `json:"id"`
	Kind       string         `json:"kind"`
	OccurredAt time.Time      `json:"occurredAt"`
	Payload    map[string]any `json:"payload,omitempty"`
}

type commandDTO struct {
	CommandID string         `json:"commandId"`
	Type      string         `json:"type"`
	Params    map[string]any `json:"params,omitempty"`
	Status    string         `json:"status"`
	CreatedAt time.Time      `json:"createdAt"`
}

type syncResponse struct {
	PolicyChanged    bool           `json:"policyChanged"`
	Policy           *domain.Policy `json:"policy,omitempty"`
	PendingCommands  []commandDTO   `json:"pendingCommands"`
	AcceptedEventIDs []string       `json:"acceptedEventIds"`
	ReleaseSecret    string         `json:"releaseSecret,omitempty"`
	// Released confirms the phone's release ack: this device no longer exists here.
	Released bool `json:"released,omitempty"`
}

type errorBody struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

// --- handlers ----------------------------------------------------------------

func (h *Handlers) Enroll(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method_not_allowed", "")
		return
	}
	var req enrollRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}

	parentID, ok, err := h.Enrollments.Consume(r.Context(), req.EnrollmentToken)
	if err != nil {
		log.Printf("enroll: consume token: %v", err)
		writeError(w, http.StatusInternalServerError, "internal", "")
		return
	}
	if !ok {
		writeError(w, http.StatusUnauthorized, "invalid_token", "unknown or already-used enrollment token")
		return
	}

	device := &domain.Device{
		ID:       uuid.NewString(),
		ParentID: parentID,
		Info: domain.DeviceInfo{
			Model:          req.DeviceInfo.Model,
			Manufacturer:   req.DeviceInfo.Manufacturer,
			AndroidVersion: req.DeviceInfo.AndroidVersion,
			AgentVersion:   req.DeviceInfo.AgentVersion,
		},
		CreatedAt: time.Now().UTC(),
	}
	if err := h.Devices.Create(r.Context(), device); err != nil {
		log.Printf("enroll: create device: %v", err)
		writeError(w, http.StatusInternalServerError, "internal", "")
		return
	}

	token, err := h.Tokens.Issue(r.Context(), device.ID)
	if err != nil {
		log.Printf("enroll: issue token: %v", err)
		writeError(w, http.StatusInternalServerError, "internal", "")
		return
	}

	policy, err := h.Policies.Set(r.Context(), device.ID, domain.DefaultPolicy())
	if err != nil {
		log.Printf("enroll: set default policy: %v", err)
		writeError(w, http.StatusInternalServerError, "internal", "")
		return
	}

	secret, _, err := h.Releases.Secret(r.Context(), device.ID)
	if err != nil {
		log.Printf("enroll: release secret: %v", err)
		writeError(w, http.StatusInternalServerError, "internal", "")
		return
	}

	log.Printf("enrolled device %s (%s %s)", device.ID, device.Info.Manufacturer, device.Info.Model)
	writeJSON(w, http.StatusOK, enrollResponse{
		DeviceID: device.ID, DeviceToken: token, Policy: policy,
		ReleaseSecret: base64.StdEncoding.EncodeToString(secret),
	})
}

func (h *Handlers) Sync(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method_not_allowed", "")
		return
	}
	token := bearerToken(r)
	deviceID, ok, err := h.Tokens.Resolve(r.Context(), token)
	if err != nil {
		log.Printf("sync: resolve token: %v", err)
		writeError(w, http.StatusInternalServerError, "internal", "")
		return
	}
	if !ok {
		writeError(w, http.StatusUnauthorized, "invalid_token", "")
		return
	}

	var req syncRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}

	if err := h.Devices.UpdateLastSeen(r.Context(), deviceID, time.Now().UTC()); err != nil {
		log.Printf("sync: update last_seen: %v", err)
		writeError(w, http.StatusInternalServerError, "internal", "")
		return
	}
	if req.PushToken != "" {
		if err := h.Devices.UpdatePushToken(r.Context(), deviceID, req.PushToken); err != nil {
			// Not fatal to the sync itself -- push is additive, polling
			// already works regardless of whether this write succeeds.
			log.Printf("sync: update push_token: %v", err)
		}
	}

	events := make([]*domain.Event, 0, len(req.Events))
	for _, e := range req.Events {
		events = append(events, &domain.Event{
			ID:         e.ID,
			DeviceID:   deviceID,
			Kind:       domain.EventKind(e.Kind),
			OccurredAt: e.OccurredAt,
			Payload:    e.Payload,
		})
	}
	stored, err := h.Events.Insert(r.Context(), events)
	if err != nil {
		log.Printf("sync: insert events: %v", err)
		writeError(w, http.StatusInternalServerError, "internal", "")
		return
	}
	acceptedIDs := stored.Accepted
	if h.Alerts != nil && len(stored.Stored) > 0 {
		// Detached: the phone's sync must not wait on, or be cancelled by, a notification server.
		go h.Alerts.HandleNewEvents(context.WithoutCancel(r.Context()), deviceID, stored.Stored)
	}

	released := false
	for _, ack := range req.CommandAcks {
		status := domain.CommandStatus(ack.Status)
		commandType, err := h.Commands.Ack(r.Context(), deviceID, ack.CommandID, status, ack.Detail)
		if err != nil {
			log.Printf("sync: ack command %s: %v", ack.CommandID, err)
		}
		if commandType == domain.CommandTypeRelease && status == domain.CommandStatusAcked {
			released = true
		}
	}
	if released {
		// The phone has already let go; it sends this ack as its last request.
		if err := h.Releases.Delete(r.Context(), deviceID); err != nil {
			log.Printf("sync: delete released device: %v", err)
			writeError(w, http.StatusInternalServerError, "internal", "")
			return
		}
		log.Printf("released device %s", deviceID)
		writeJSON(w, http.StatusOK, syncResponse{PendingCommands: []commandDTO{}, AcceptedEventIDs: acceptedIDs, Released: true})
		return
	}

	var releaseSecret string
	if req.HasReleaseSecret {
		if err := h.Releases.Confirm(r.Context(), deviceID); err != nil {
			log.Printf("sync: confirm release secret: %v", err)
		}
	} else if secret, _, err := h.Releases.Secret(r.Context(), deviceID); err != nil {
		log.Printf("sync: release secret: %v", err)
	} else {
		releaseSecret = base64.StdEncoding.EncodeToString(secret)
	}

	pending, err := h.Commands.PendingForDevice(r.Context(), deviceID)
	if err != nil {
		log.Printf("sync: fetch pending commands: %v", err)
		writeError(w, http.StatusInternalServerError, "internal", "")
		return
	}
	pendingDTOs := make([]commandDTO, 0, len(pending))
	for _, c := range pending {
		pendingDTOs = append(pendingDTOs, commandDTO{
			CommandID: c.ID, Type: string(c.Type), Params: c.Params,
			Status: string(c.Status), CreatedAt: c.CreatedAt,
		})
	}

	resp := syncResponse{PendingCommands: pendingDTOs, AcceptedEventIDs: acceptedIDs, ReleaseSecret: releaseSecret}
	policy, err := h.Policies.Get(r.Context(), deviceID)
	if err != nil {
		log.Printf("sync: get policy: %v", err)
		writeError(w, http.StatusInternalServerError, "internal", "")
		return
	}
	if policy != nil && policy.Version != req.PolicyVersion {
		resp.PolicyChanged = true
		resp.Policy = policy
	}

	writeJSON(w, http.StatusOK, resp)
}

func bearerToken(r *http.Request) string {
	return strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
}

type setupReportDTO struct {
	Step     string                `json:"step"`
	Status   string                `json:"status"`
	Message  string                `json:"message"`
	Accounts []domain.SetupAccount `json:"accounts"`
}

// ReportSetup records the phone's progress through guided setup. The phone
// only reports what it did; nothing here tells it what to run.
func (h *Handlers) ReportSetup(w http.ResponseWriter, r *http.Request) {
	deviceID, ok, err := h.Tokens.Resolve(r.Context(), bearerToken(r))
	if err != nil {
		log.Printf("setup: resolve token: %v", err)
		writeError(w, http.StatusInternalServerError, "internal", "")
		return
	}
	if !ok {
		writeError(w, http.StatusUnauthorized, "invalid_token", "")
		return
	}
	var req setupReportDTO
	if err := json.NewDecoder(io.LimitReader(r.Body, 64<<10)).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "")
		return
	}
	report := domain.SetupReport{
		Step: domain.SetupStep(req.Step), Status: domain.SetupStatus(req.Status),
		Message: req.Message, Accounts: req.Accounts,
	}
	if err := report.Validate(); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_setup_report", "")
		return
	}
	setup, err := h.Setup.Report(r.Context(), deviceID, report)
	if err != nil {
		log.Printf("setup: store report: %v", err)
		writeError(w, http.StatusInternalServerError, "internal", "")
		return
	}
	writeJSON(w, http.StatusOK, setup)
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, errorBody{Code: code, Message: message})
}
