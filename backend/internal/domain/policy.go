package domain

import "context"

// Policy mirrors api-spec/openapi.yaml's Policy schema exactly, same shape
// as the agent's own Policy.kt -- kept in lockstep with the API contract
// (architecture.md §5), not something this layer invents independently.
// Deliberately no "hide notice"/"stealth" field, matching the spec's own
// comment to that effect (ADR-0001).
type Policy struct {
	Version      int            `json:"version"`
	TimeLimits   TimeLimits     `json:"timeLimits"`
	SiteFilter   SiteFilter     `json:"siteFilter"`
	Location     LocationPolicy `json:"location"`
	CallLog      CallLog        `json:"callLog"`
	LockSchedule *LockSchedule  `json:"lockSchedule,omitempty"`
	Restrictions *Restrictions  `json:"restrictions,omitempty"`
}

// Restrictions maps to device-owner UserManager.DISALLOW_* keys on the agent;
// all false (or absent) means none applied.
type Restrictions struct {
	BlockVPNConfig        bool `json:"blockVpnConfig,omitempty"`
	BlockPrivateDNSConfig bool `json:"blockPrivateDnsConfig,omitempty"`
	BlockFactoryReset     bool `json:"blockFactoryReset,omitempty"`
	BlockSafeBoot         bool `json:"blockSafeBoot,omitempty"`
	BlockAddUser          bool `json:"blockAddUser,omitempty"`
}

type TimeLimits struct {
	Enabled bool            `json:"enabled"`
	Rules   []TimeLimitRule `json:"rules,omitempty"`
}

type TimeLimitRule struct {
	Category     string   `json:"category"`
	Packages     []string `json:"packages,omitempty"`
	DailyMinutes int      `json:"dailyMinutes"`
}

type SiteFilter struct {
	Enabled bool   `json:"enabled"`
	DNSHost string `json:"dnsHost,omitempty"`
}

type LocationPolicy struct {
	Enabled         bool `json:"enabled"`
	IntervalMinutes int  `json:"intervalMinutes,omitempty"`
}

type CallLog struct {
	Enabled bool `json:"enabled"`
}

type LockSchedule struct {
	Enabled bool         `json:"enabled"`
	Windows []LockWindow `json:"windows,omitempty"`
}

type LockWindow struct {
	Days     []int `json:"days"`
	FromHour int   `json:"fromHour"`
	ToHour   int   `json:"toHour"`
}

// DefaultPolicy is what a newly-enrolled device gets -- nothing enabled,
// version 1. A real default (console-configurable) is Phase 3's job; this
// is the safe, inert starting point until then.
func DefaultPolicy() Policy {
	return Policy{Version: 1}
}

// PolicyRepository is the port -- one current policy per device
// (architecture.md §2.1: "a policy update is just a cache replacement").
// Set is responsible for incrementing Version; callers pass the fields to
// change, not a version number, so there's exactly one place a version
// could be gotten wrong.
type PolicyRepository interface {
	Get(ctx context.Context, deviceID string) (*Policy, error)
	// Set stores p as the device's new current policy and returns it with
	// Version incremented from whatever was previously stored (1 if none).
	Set(ctx context.Context, deviceID string, p Policy) (Policy, error)
}
