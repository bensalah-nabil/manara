package domain

import (
	"context"
	"reflect"
	"testing"
	"time"
)

func strictPolicy() Policy {
	return Policy{
		SiteFilter: SiteFilter{Enabled: true, DNSHost: "family.adguard-dns.com"},
		Browser:    &Browser{SafeSearch: true, YouTube: "strict", SecureDNSOff: true, BlockOtherBrowsers: true, BlockedSites: []string{"bet365.com", "tinder.com"}},
		TimeLimits: TimeLimits{Enabled: true, Rules: []TimeLimitRule{
			{Category: "Social media", Packages: []string{"com.zhiliaoapp.musically", "com.instagram.android"}, DailyMinutes: 30},
			{Category: "Games", AllGames: true, DailyMinutes: 60},
		}},
		LockSchedule: &LockSchedule{Enabled: true, Windows: []LockWindow{{Days: []int{1, 2, 3, 4, 5, 6, 7}, FromHour: 21, ToHour: 7}}, AllowedApps: []string{"com.athan"}},
		Restrictions: &Restrictions{BlockFactoryReset: true, BlockSafeBoot: true, BlockAddUser: true, BlockDebugging: true, BlockDateTime: true, BlockPrivateDNSConfig: true, BlockVPNConfig: true},
		ChangeDelay:  &ChangeDelay{Hours: 24},
	}
}

func TestEachKindOfLooseningIsNamed(t *testing.T) {
	cases := map[string]func(p *Policy){
		LoosensSiteFilter:   func(p *Policy) { p.SiteFilter.Enabled = false },
		LoosensChrome:       func(p *Policy) { p.Browser.YouTube = "moderate" },
		LoosensSites:        func(p *Policy) { p.Browser.BlockedSites = []string{"tinder.com"} },
		LoosensTimeLimits:   func(p *Policy) { p.TimeLimits.Rules[1].DailyMinutes = 90 },
		LoosensBedtime:      func(p *Policy) { p.LockSchedule.Windows[0].FromHour = 22 },
		LoosensBedtimeApps:  func(p *Policy) { p.LockSchedule.AllowedApps = append(p.LockSchedule.AllowedApps, "com.whatsapp") },
		LoosensRestrictions: func(p *Policy) { p.Restrictions.BlockSafeBoot = false },
		LoosensDelay:        func(p *Policy) { p.ChangeDelay = &ChangeDelay{Hours: 1} },
	}
	for want, change := range cases {
		after := strictPolicy()
		change(&after)
		if got := Loosens(strictPolicy(), after); !reflect.DeepEqual(got, []string{want}) {
			t.Errorf("%s: got %v", want, got)
		}
	}
}

func TestMoreLooseningsThatMustBeCaught(t *testing.T) {
	cases := map[string]func(p *Policy){
		"filter to ads only":        func(p *Policy) { p.SiteFilter.DNSHost = "dns.adguard-dns.com" },
		"filter to another host":    func(p *Policy) { p.SiteFilter.DNSHost = "dns.example.org" },
		"SafeSearch off":            func(p *Policy) { p.Browser.SafeSearch = false },
		"Chrome's own DNS back on":  func(p *Policy) { p.Browser.SecureDNSOff = false },
		"other browsers open":       func(p *Policy) { p.Browser.BlockOtherBrowsers = false },
		"browser section dropped":   func(p *Policy) { p.Browser = nil },
		"limits turned off":         func(p *Policy) { p.TimeLimits.Enabled = false },
		"a limit removed":           func(p *Policy) { p.TimeLimits.Rules = p.TimeLimits.Rules[:1] },
		"an app taken out of limit": func(p *Policy) { p.TimeLimits.Rules[0].Packages = p.TimeLimits.Rules[0].Packages[:1] },
		"games no longer all":       func(p *Policy) { p.TimeLimits.Rules[1].AllGames = false },
		"bedtime off":               func(p *Policy) { p.LockSchedule.Enabled = false },
		"bedtime ends earlier":      func(p *Policy) { p.LockSchedule.Windows[0].ToHour = 6 },
		"a night dropped":           func(p *Policy) { p.LockSchedule.Windows[0].Days = []int{1, 2, 3, 4, 5, 6} },
		"restrictions dropped":      func(p *Policy) { p.Restrictions = nil },
		"wait turned off":           func(p *Policy) { p.ChangeDelay = nil },
	}
	for name, change := range cases {
		after := strictPolicy()
		change(&after)
		if got := Loosens(strictPolicy(), after); len(got) == 0 {
			t.Errorf("%s: not seen as loosening", name)
		}
	}
}

func TestTighteningOrKeepingNeverWaits(t *testing.T) {
	loose := Policy{TimeLimits: TimeLimits{Enabled: true, Rules: []TimeLimitRule{{Category: "Games", AllGames: true, DailyMinutes: 120}}}}
	cases := map[string]func(p *Policy){
		"nothing changed":  func(*Policy) {},
		"filter turned on": func(p *Policy) { p.SiteFilter = SiteFilter{Enabled: true, DNSHost: "family.adguard-dns.com"} },
		"limit lowered":    func(p *Policy) { p.TimeLimits.Rules[0].DailyMinutes = 30 },
		"limit added": func(p *Policy) {
			p.TimeLimits.Rules = append(p.TimeLimits.Rules, TimeLimitRule{Category: "Social media", DailyMinutes: 0})
		},
		"site blocked": func(p *Policy) { p.Browser = &Browser{BlockedSites: []string{"example.com"}} },
		"bedtime added": func(p *Policy) {
			p.LockSchedule = &LockSchedule{Enabled: true, Windows: []LockWindow{{Days: []int{1}, FromHour: 22, ToHour: 6}}}
		},
		"location turned off":     func(p *Policy) { p.Location = LocationPolicy{} },
		"usage report turned off": func(p *Policy) { p.UsageReport = &UsageReport{} },
		"wait made longer":        func(p *Policy) { p.ChangeDelay = &ChangeDelay{Hours: 48} },
		"lock everything":         func(p *Policy) { p.Restrictions = &Restrictions{BlockFactoryReset: true, BlockSafeBoot: true} },
	}
	for name, change := range cases {
		after := loose
		after.TimeLimits.Rules = append([]TimeLimitRule(nil), loose.TimeLimits.Rules...)
		change(&after)
		if got := Loosens(loose, after); len(got) != 0 {
			t.Errorf("%s: seen as loosening %v", name, got)
		}
	}
	// A filter blocking adult sites moved to one blocking adult sites and ads blocks more, not less.
	adult := Policy{SiteFilter: SiteFilter{Enabled: true, DNSHost: "family.cloudflare-dns.com"}}
	both := Policy{SiteFilter: SiteFilter{Enabled: true, DNSHost: "family.adguard-dns.com"}}
	if got := Loosens(adult, both); len(got) != 0 {
		t.Errorf("adult to family filter: %v", got)
	}
}

func TestOnlyTheChoicesOfferedAreAccepted(t *testing.T) {
	for _, hours := range ChangeDelayChoices {
		if err := (&ChangeDelay{Hours: hours}).Validate(); err != nil {
			t.Errorf("%d: %v", hours, err)
		}
	}
	if err := (&ChangeDelay{Hours: 5}).Validate(); err == nil {
		t.Error("5 hours accepted")
	}
}

type duePending struct {
	PendingRepository
	due []PendingChange
}

func (d *duePending) ClaimDue(context.Context, time.Time) ([]PendingChange, error) {
	out := d.due
	d.due = nil
	return out, nil
}

type setPolicies struct {
	PolicyRepository
	set map[string]Policy
}

func (s *setPolicies) Set(_ context.Context, id string, p Policy) (Policy, error) {
	s.set[id] = p
	return p, nil
}

type queued struct {
	CommandQueue
	types map[string]CommandType
}

func (q *queued) Enqueue(_ context.Context, id string, t CommandType, _ map[string]any) (*Command, error) {
	q.types[id] = t
	return &Command{}, nil
}

func TestDueChangesReachThePhoneOnce(t *testing.T) {
	off := Policy{SiteFilter: SiteFilter{Enabled: false}}
	pending := &duePending{due: []PendingChange{
		{DeviceID: "a", Kind: PendingPolicy, Policy: &off},
		{DeviceID: "b", Kind: PendingRelease, ReleaseParams: map[string]any{"mode": "remove"}},
	}}
	policies := &setPolicies{set: map[string]Policy{}}
	commands := &queued{types: map[string]CommandType{}}
	applier := &PendingApplier{Pending: pending, Policies: policies, Commands: commands}
	if err := applier.ApplyDue(context.Background(), time.Now()); err != nil {
		t.Fatal(err)
	}
	if p, ok := policies.set["a"]; !ok || p.SiteFilter.Enabled {
		t.Fatalf("policy not applied: %+v", policies.set)
	}
	if commands.types["b"] != CommandTypeRelease {
		t.Fatalf("release not queued: %+v", commands.types)
	}
	if err := applier.ApplyDue(context.Background(), time.Now()); err != nil || len(policies.set) != 1 || len(commands.types) != 1 {
		t.Fatalf("applied twice: %+v %+v", policies.set, commands.types)
	}
}
