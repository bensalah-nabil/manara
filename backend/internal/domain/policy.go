package domain

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"unicode"
)

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
	UsageReport  *UsageReport   `json:"usageReport,omitempty"`
	Browser      *Browser       `json:"browser,omitempty"`
}

// Browser is Chrome's managed configuration, which the phone sets as a device
// owner (setApplicationRestrictions). The names it maps to, and their types,
// are Chrome's own policy definitions (Chromium source,
// components/policy/resources/templates/policy_definitions): ForceGoogleSafeSearch
// (bool, Android 41+), ForceYouTubeRestrict (0/1/2, Android 55+),
// DnsOverHttpsMode ("off", Android 85+) and URLBlocklist (list, Android 86+).
// Other browsers are not covered. Absent or all off means Chrome is left alone.
type Browser struct {
	SafeSearch bool `json:"safeSearch,omitempty"`
	// YouTube is "", "off", "moderate" or "strict".
	YouTube string `json:"youtube,omitempty"`
	// SecureDNSOff stops Chrome's own encrypted DNS, which would go around
	// the site filter's Private DNS host.
	SecureDNSOff bool     `json:"secureDnsOff,omitempty"`
	BlockedSites []string `json:"blockedSites,omitempty"`
}

// MaxBlockedSites keeps the list a parent's list, not an imported blocklist;
// category lists are capability-plan.md B5's job.
const MaxBlockedSites = 200

var ErrInvalidBrowserPolicy = errors.New("invalid browser rules")

// Validate refuses what Chrome would ignore or misread: an unknown YouTube
// mode, an empty or oversized site, whitespace inside one, too many sites.
func (b *Browser) Validate() error {
	if b == nil {
		return nil
	}
	switch b.YouTube {
	case "", "off", "moderate", "strict":
	default:
		return fmt.Errorf("%w: youtube must be off, moderate or strict", ErrInvalidBrowserPolicy)
	}
	if len(b.BlockedSites) > MaxBlockedSites {
		return fmt.Errorf("%w: at most %d blocked sites", ErrInvalidBrowserPolicy, MaxBlockedSites)
	}
	for _, site := range b.BlockedSites {
		if site == "" || len(site) > 253 || strings.IndexFunc(site, func(r rune) bool { return unicode.IsSpace(r) || unicode.IsControl(r) }) >= 0 {
			return fmt.Errorf("%w: %q is not a site", ErrInvalidBrowserPolicy, site)
		}
	}
	return nil
}

// UsageReport opts in to the daily per-app minutes report. Absent means off.
type UsageReport struct {
	Enabled bool `json:"enabled"`
}

// Restrictions maps to device-owner UserManager.DISALLOW_* keys on the agent;
// all false (or absent) means none applied.
type Restrictions struct {
	BlockVPNConfig        bool `json:"blockVpnConfig,omitempty"`
	BlockPrivateDNSConfig bool `json:"blockPrivateDnsConfig,omitempty"`
	BlockFactoryReset     bool `json:"blockFactoryReset,omitempty"`
	BlockSafeBoot         bool `json:"blockSafeBoot,omitempty"`
	BlockAddUser          bool `json:"blockAddUser,omitempty"`
	// BlockDebugging is DISALLOW_DEBUGGING_FEATURES: no developer options or adb,
	// so a computer can't undo the rest. The phone holds it back during guided setup.
	BlockDebugging bool `json:"blockDebugging,omitempty"`
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
// DefaultPolicy is a new phone's: no rules yet, but tamper protection on, so the
// child can't reset the phone, boot it in safe mode, add a user, or use adb to get
// Manara off it. The parent can turn each of these off.
func DefaultPolicy() Policy {
	return Policy{Version: 1, Restrictions: &Restrictions{
		BlockFactoryReset: true, BlockSafeBoot: true, BlockAddUser: true, BlockDebugging: true,
	}}
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
