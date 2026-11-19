package domain

import (
	"context"
	"errors"
	"fmt"
	"log"
	"slices"
	"time"
)

// A cooling-off delay (2026-11-20): with it on, a change that loosens a phone's rules waits before
// it reaches the phone, and can be cancelled meanwhile. A moment's urge passes; the rule stays.
// Tightening always applies at once. The server enforces it, so a modified console can't skip it.

// ChangeDelay is part of the policy, so lowering it is itself a loosening that waits. The phone
// ignores it (its JSON reader skips unknown fields).
type ChangeDelay struct {
	Hours int `json:"hours"`
}

// ChangeDelayChoices are the waits the console offers; anything else is refused.
var ChangeDelayChoices = []int{0, 1, 24, 48, 168}

var ErrInvalidChangeDelay = errors.New("invalid change delay")

func (d *ChangeDelay) Validate() error {
	if d == nil || slices.Contains(ChangeDelayChoices, d.Hours) {
		return nil
	}
	return fmt.Errorf("%w: hours must be one of %v", ErrInvalidChangeDelay, ChangeDelayChoices)
}

// Delay is how long a loosening of this policy waits; zero means it applies at once.
func (p Policy) Delay() time.Duration {
	if p.ChangeDelay == nil {
		return 0
	}
	return time.Duration(p.ChangeDelay.Hours) * time.Hour
}

// What a change loosens, as the console names it. The phone's data sharing (location, calls,
// usage report) is not a rule about the phone's use, so turning it off never waits.
const (
	LoosensSiteFilter   = "site_filter"  // the website filter off, or one that blocks less
	LoosensChrome       = "chrome"       // SafeSearch, YouTube, Chrome's own DNS, other browsers
	LoosensSites        = "sites"        // a blocked website unblocked
	LoosensTimeLimits   = "time_limits"  // a limit removed or raised, an app or games left out
	LoosensBedtime      = "bedtime"      // fewer paused hours
	LoosensBedtimeApps  = "bedtime_apps" // more apps open at bedtime
	LoosensRestrictions = "restrictions" // a phone setting unlocked
	LoosensDelay        = "change_delay" // the wait itself shortened
	LoosensRelease      = "release"      // Manara taken off the phone
)

// Loosens lists what after allows that before didn't, in a stable order. Empty means the change
// only tightens or keeps the rules, and applies at once.
func Loosens(before, after Policy) []string {
	var out []string
	add := func(what string, loosened bool) {
		if loosened {
			out = append(out, what)
		}
	}
	add(LoosensSiteFilter, !isSubset(filterCoverage(before.SiteFilter), filterCoverage(after.SiteFilter)))

	b, a := orZero(before.Browser), orZero(after.Browser)
	add(LoosensChrome, (b.SafeSearch && !a.SafeSearch) || youtubeRank(a.YouTube) < youtubeRank(b.YouTube) ||
		(b.SecureDNSOff && !a.SecureDNSOff) || (b.BlockOtherBrowsers && !a.BlockOtherBrowsers))
	add(LoosensSites, !isSubset(b.BlockedSites, a.BlockedSites))

	add(LoosensTimeLimits, limitsLoosened(before.TimeLimits, after.TimeLimits))

	bs, as := orZero(before.LockSchedule), orZero(after.LockSchedule)
	add(LoosensBedtime, !isSubset(pausedHours(bs), pausedHours(as)))
	add(LoosensBedtimeApps, bs.Enabled && !isSubset(as.AllowedApps, bs.AllowedApps))

	br, ar := orZero(before.Restrictions), orZero(after.Restrictions)
	add(LoosensRestrictions, (br.BlockVPNConfig && !ar.BlockVPNConfig) || (br.BlockPrivateDNSConfig && !ar.BlockPrivateDNSConfig) ||
		(br.BlockFactoryReset && !ar.BlockFactoryReset) || (br.BlockSafeBoot && !ar.BlockSafeBoot) ||
		(br.BlockAddUser && !ar.BlockAddUser) || (br.BlockDebugging && !ar.BlockDebugging) ||
		(br.BlockDateTime && !ar.BlockDateTime))

	add(LoosensDelay, after.Delay() < before.Delay())
	return out
}

func orZero[T any](p *T) T {
	if p == nil {
		var zero T
		return zero
	}
	return *p
}

// isSubset: every item of small is in big.
func isSubset[T comparable](small, big []T) bool {
	for _, item := range small {
		if !slices.Contains(big, item) {
			return false
		}
	}
	return true
}

// filterCoverage names what a site filter blocks. The hosts are the console's own
// (controller/src/ruleCards.ts); any other host only covers itself, so changing it loosens.
func filterCoverage(f SiteFilter) []string {
	if !f.Enabled || f.DNSHost == "" {
		return nil
	}
	switch f.DNSHost {
	case "family.adguard-dns.com":
		return []string{"adult", "ads"}
	case "family.cloudflare-dns.com":
		return []string{"adult"}
	case "dns.adguard-dns.com":
		return []string{"ads"}
	}
	return []string{"host:" + f.DNSHost}
}

func youtubeRank(mode string) int {
	switch mode {
	case "strict":
		return 2
	case "moderate":
		return 1
	}
	return 0
}

func limitsLoosened(before, after TimeLimits) bool {
	if !before.Enabled {
		return false
	}
	for _, old := range before.Rules {
		i := slices.IndexFunc(after.Rules, func(r TimeLimitRule) bool { return r.Category == old.Category })
		if !after.Enabled || i < 0 {
			return true
		}
		now := after.Rules[i]
		if now.DailyMinutes > old.DailyMinutes || (old.AllGames && !now.AllGames) || !isSubset(old.Packages, now.Packages) {
			return true
		}
	}
	return false
}

// pausedHours lists each (day, hour) bedtime pauses, as the phone reads a window
// (agent LockDecision.isWithinWindow): a window past midnight runs into the next morning.
func pausedHours(s LockSchedule) []int {
	if !s.Enabled {
		return nil
	}
	var out []int
	for _, w := range s.Windows {
		for _, day := range w.Days {
			if w.FromHour <= w.ToHour {
				for h := w.FromHour; h < w.ToHour; h++ {
					out = append(out, day*100+h)
				}
				continue
			}
			for h := w.FromHour; h < 24; h++ {
				out = append(out, day*100+h)
			}
			next := day%7 + 1 // Calendar days 1 (Sunday) to 7 (Saturday)
			for h := 0; h < w.ToHour; h++ {
				out = append(out, next*100+h)
			}
		}
	}
	return out
}

// Kinds of waiting change: one of each per phone at most.
const (
	PendingPolicy  = "policy"
	PendingRelease = "release"
)

type PendingChange struct {
	DeviceID string
	Kind     string
	// Policy is the whole document to store, for PendingPolicy.
	Policy *Policy
	// ReleaseParams are the release command's, for PendingRelease.
	ReleaseParams map[string]any
	Loosens       []string
	RequestedAt   time.Time
	ApplyAt       time.Time
	// AppliedAt is set once it has reached the phone; a release that has is what lets the
	// console show the offline release code.
	AppliedAt *time.Time
}

type PendingRepository interface {
	// Put stores c as the device's waiting change of its kind, replacing one already there.
	Put(ctx context.Context, c PendingChange) error
	// Waiting lists the device's changes not applied yet.
	Waiting(ctx context.Context, deviceID string) ([]PendingChange, error)
	// Cancel drops a waiting change; false when there was none.
	Cancel(ctx context.Context, deviceID, kind string) (bool, error)
	// ClaimDue marks the changes due at now as applied and returns them, each one once.
	ClaimDue(ctx context.Context, now time.Time) ([]PendingChange, error)
	// ReleaseApplied tells whether a waited-for release reached its time since since.
	ReleaseApplied(ctx context.Context, deviceID string, since time.Time) (bool, error)
	PurgeAppliedBefore(ctx context.Context, cutoff time.Time) (int, error)
}

// PendingApplier delivers waiting changes once their time comes.
type PendingApplier struct {
	Pending  PendingRepository
	Policies PolicyRepository
	Commands CommandQueue
	Devices  DeviceRepository
	Notifier PushNotifier
}

// ApplyDue stores each due policy and queues each due release, then wakes the phone.
func (a *PendingApplier) ApplyDue(ctx context.Context, now time.Time) error {
	due, err := a.Pending.ClaimDue(ctx, now)
	if err != nil {
		return err
	}
	for _, c := range due {
		switch c.Kind {
		case PendingPolicy:
			if c.Policy == nil {
				continue
			}
			if _, err := a.Policies.Set(ctx, c.DeviceID, *c.Policy); err != nil {
				log.Printf("cooling-off: apply policy for %s: %v", c.DeviceID, err)
				continue
			}
		case PendingRelease:
			if _, err := a.Commands.Enqueue(ctx, c.DeviceID, CommandTypeRelease, c.ReleaseParams); err != nil {
				log.Printf("cooling-off: queue release for %s: %v", c.DeviceID, err)
				continue
			}
		}
		log.Printf("cooling-off: applied a waiting %s change for %s", c.Kind, c.DeviceID)
		if a.Notifier != nil && a.Devices != nil {
			if d, err := a.Devices.FindByID(ctx, c.DeviceID); err == nil && d != nil && d.PushToken != "" {
				if err := a.Notifier.Notify(ctx, d.PushToken); err != nil {
					log.Printf("cooling-off: wake %s: %v", c.DeviceID, err)
				}
			}
		}
	}
	return nil
}
