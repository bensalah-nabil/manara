// Package console implements api-spec/openapi.yaml's "console" tag -- the
// endpoints the parent-facing controller calls. Parent auth here is
// deliberately minimal (see domain/parent.go's comment) -- Phase 3 owns
// the real account model, this just authenticates whatever parentSession
// token Phase 2's `-seed` flag printed.
package console

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"time"

	"manara/backend/internal/domain"
)

type Handlers struct {
	Devices  domain.DeviceRepository
	Policies domain.PolicyRepository
	Commands domain.CommandQueue
	Events   domain.EventStore
	Sessions domain.ParentSessionRepository
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
