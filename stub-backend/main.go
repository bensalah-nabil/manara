// Command manara-stub-backend is a throwaway implementation of exactly two
// endpoints from api-spec/openapi.yaml -- /enroll and /agent/sync -- so the
// agent's SyncManager (docs/phase1-plan.md step 5) has something real to
// talk to before Phase 2's actual Go backend exists. In-memory, no
// Postgres, no /console/* endpoints, minimal auth. Delete this directory
// once Phase 2 starts; don't grow it into the real thing.
package main

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"sync"
)

// --- Wire types, mirroring api-spec/openapi.yaml field-for-field -----------

type DeviceInfo struct {
	Model          string `json:"model"`
	Manufacturer   string `json:"manufacturer,omitempty"`
	AndroidVersion string `json:"androidVersion"`
	AgentVersion   string `json:"agentVersion,omitempty"`
}

type TimeLimitRule struct {
	Category     string   `json:"category"`
	Packages     []string `json:"packages,omitempty"`
	DailyMinutes int      `json:"dailyMinutes"`
}

type TimeLimits struct {
	Enabled bool            `json:"enabled"`
	Rules   []TimeLimitRule `json:"rules,omitempty"`
}

type SiteFilter struct {
	Enabled bool   `json:"enabled"`
	DNSHost string `json:"dnsHost,omitempty"`
}

type Location struct {
	Enabled         bool `json:"enabled"`
	IntervalMinutes int  `json:"intervalMinutes,omitempty"`
}

type CallLog struct {
	Enabled bool `json:"enabled"`
}

type LockWindow struct {
	Days     []int `json:"days"`
	FromHour int   `json:"fromHour"`
	ToHour   int   `json:"toHour"`
}

type LockSchedule struct {
	Enabled bool         `json:"enabled"`
	Windows []LockWindow `json:"windows,omitempty"`
}

type Policy struct {
	Version      int           `json:"version"`
	TimeLimits   TimeLimits    `json:"timeLimits"`
	SiteFilter   SiteFilter    `json:"siteFilter"`
	Location     Location      `json:"location"`
	CallLog      CallLog       `json:"callLog"`
	LockSchedule *LockSchedule `json:"lockSchedule,omitempty"`
}

type Event struct {
	ID         string                 `json:"id"`
	Kind       string                 `json:"kind"`
	OccurredAt string                 `json:"occurredAt"`
	Payload    map[string]interface{} `json:"payload,omitempty"`
}

type Command struct {
	CommandID string                 `json:"commandId"`
	Type      string                 `json:"type"`
	Params    map[string]interface{} `json:"params,omitempty"`
	Status    string                 `json:"status"`
	CreatedAt string                 `json:"createdAt"`
}

type CommandAck struct {
	CommandID string `json:"commandId"`
	Status    string `json:"status"`
	Detail    string `json:"detail,omitempty"`
}

// --- Request/response bodies ------------------------------------------------

type enrollRequest struct {
	EnrollmentToken string     `json:"enrollmentToken"`
	DeviceInfo      DeviceInfo `json:"deviceInfo"`
}

type enrollResponse struct {
	DeviceID    string `json:"deviceId"`
	DeviceToken string `json:"deviceToken"`
	Policy      Policy `json:"policy"`
}

type syncRequest struct {
	PolicyVersion int          `json:"policyVersion"`
	Events        []Event      `json:"events"`
	CommandAcks   []CommandAck `json:"commandAcks"`
}

type syncResponse struct {
	PolicyChanged    bool      `json:"policyChanged"`
	Policy           *Policy   `json:"policy,omitempty"`
	PendingCommands  []Command `json:"pendingCommands"`
	AcceptedEventIDs []string  `json:"acceptedEventIds"`
}

type errorBody struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

// --- In-memory store ---------------------------------------------------------

type device struct {
	id     string
	token  string
	policy Policy
}

type store struct {
	mu      sync.Mutex
	devices map[string]*device // keyed by deviceToken
}

func (s *store) byToken(token string) (*device, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	d, ok := s.devices[token]
	return d, ok
}

// Hardcoded on purpose -- this is a throwaway stub, not the real /enroll flow.
const enrollmentToken = "test-token"

func defaultPolicy() Policy {
	return Policy{
		Version: 1,
		TimeLimits: TimeLimits{
			Enabled: true,
			Rules: []TimeLimitRule{
				{Category: "social", Packages: []string{"com.instagram.android"}, DailyMinutes: 60},
			},
		},
	}
}

func randomToken() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// --- Handlers ------------------------------------------------------------------

func main() {
	s := &store{devices: make(map[string]*device)}
	mux := http.NewServeMux()

	mux.HandleFunc("/api/v1/enroll", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		var req enrollRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "bad_request", err.Error())
			return
		}
		if req.EnrollmentToken != enrollmentToken {
			writeError(w, http.StatusUnauthorized, "invalid_token", "unknown enrollment token")
			return
		}

		d := &device{id: randomToken(), token: randomToken(), policy: defaultPolicy()}
		s.mu.Lock()
		s.devices[d.token] = d
		s.mu.Unlock()

		log.Printf("enrolled device %s (%s %s)", d.id, req.DeviceInfo.Manufacturer, req.DeviceInfo.Model)
		writeJSON(w, http.StatusOK, enrollResponse{DeviceID: d.id, DeviceToken: d.token, Policy: d.policy})
	})

	mux.HandleFunc("/api/v1/agent/sync", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		d, ok := s.byToken(bearerToken(r))
		if !ok {
			writeError(w, http.StatusUnauthorized, "invalid_token", "unknown device token")
			return
		}

		var req syncRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "bad_request", err.Error())
			return
		}

		// Idempotent on the device-generated id (architecture.md §3.2) --
		// this stub just logs and accepts everything unconditionally,
		// since there's nowhere durable to dedupe against anyway.
		acceptedIDs := make([]string, 0, len(req.Events))
		for _, e := range req.Events {
			log.Printf("device %s event: kind=%s occurredAt=%s payload=%v", d.id, e.Kind, e.OccurredAt, e.Payload)
			acceptedIDs = append(acceptedIDs, e.ID)
		}
		for _, ack := range req.CommandAcks {
			log.Printf("device %s acked command %s: %s", d.id, ack.CommandID, ack.Status)
		}

		s.mu.Lock()
		current := d.policy
		s.mu.Unlock()

		resp := syncResponse{PendingCommands: []Command{}, AcceptedEventIDs: acceptedIDs}
		if req.PolicyVersion != current.Version {
			resp.PolicyChanged = true
			resp.Policy = &current
		}
		writeJSON(w, http.StatusOK, resp)
	})

	// NOT part of api-spec/openapi.yaml -- a debug-only way to simulate a
	// parent changing policy from the console, since /console/* isn't
	// implemented here. Goes away with the rest of this file in Phase 2.
	mux.HandleFunc("/debug/devices/", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPut {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		id := strings.TrimSuffix(strings.TrimPrefix(r.URL.Path, "/debug/devices/"), "/policy")
		var p Policy
		if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
			writeError(w, http.StatusBadRequest, "bad_request", err.Error())
			return
		}
		s.mu.Lock()
		found := false
		for _, d := range s.devices {
			if d.id == id {
				d.policy = p
				found = true
				break
			}
		}
		s.mu.Unlock()
		if !found {
			writeError(w, http.StatusNotFound, "not_found", "no such device")
			return
		}
		writeJSON(w, http.StatusOK, p)
	})

	const addr = "localhost:8080"
	log.Printf("manara stub backend listening on %s (enrollment token: %q)", addr, enrollmentToken)
	log.Fatal(http.ListenAndServe(addr, mux))
}

func bearerToken(r *http.Request) string {
	return strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
}

func writeJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, errorBody{Code: code, Message: message})
}
