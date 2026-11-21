package domain

import (
	"encoding/json"
	"errors"
	"reflect"
	"testing"
)

// The console edits a policy by reading it and writing it back through this
// struct, so any field the struct lacks is silently dropped on the next save.
// This pins every field the agent's Policy.kt defines; adding a field there
// without adding it here must fail this test.
func TestPolicyRoundTripKeepsEveryFieldTheAgentDefines(t *testing.T) {
	const full = `{
		"version": 7,
		"timeLimits": {"enabled": true, "rules": [{"category": "social", "packages": ["a.b"], "dailyMinutes": 30, "allGames": true}]},
		"siteFilter": {"enabled": true, "dnsHost": "dns.example"},
		"location": {"enabled": true, "intervalMinutes": 10},
		"callLog": {"enabled": true},
		"lockSchedule": {"enabled": true, "windows": [{"days": [6, 7], "fromHour": 22, "toHour": 7}], "allowedApps": ["com.kanout.mawaqit"]},
		"restrictions": {"blockVpnConfig": true, "blockPrivateDnsConfig": true, "blockFactoryReset": true, "blockSafeBoot": true, "blockAddUser": true, "blockDebugging": true, "blockDateTime": true},
		"usageReport": {"enabled": true},
		"browser": {"safeSearch": true, "youtube": "strict", "secureDnsOff": true, "blockedSites": ["example.com"], "blockOtherBrowsers": true}
	}`

	var policy Policy
	if err := json.Unmarshal([]byte(full), &policy); err != nil {
		t.Fatal(err)
	}
	encoded, err := json.Marshal(policy)
	if err != nil {
		t.Fatal(err)
	}

	var want, got any
	if err := json.Unmarshal([]byte(full), &want); err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(encoded, &got); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(want, got) {
		t.Fatalf("a policy field was lost in a round trip:\n got %s\nwant %s", encoded, full)
	}
}

func TestPolicyRoundTripDropsFieldsTheServerDoesNotDefine(t *testing.T) {
	var policy Policy
	if err := json.Unmarshal([]byte(`{"version": 1, "futureSection": {"x": 1}, "siteFilter": {"enabled": true, "futureField": 2}}`), &policy); err != nil {
		t.Fatal(err)
	}
	encoded, _ := json.Marshal(policy)
	var got map[string]any
	_ = json.Unmarshal(encoded, &got)
	if _, ok := got["futureSection"]; ok {
		t.Fatal("expected an undefined section to be dropped; if the server now preserves unknown fields, update the controller README and this test")
	}
	if filter, _ := got["siteFilter"].(map[string]any); filter["futureField"] != nil {
		t.Fatal("expected an undefined field to be dropped; if the server now preserves unknown fields, update the controller README and this test")
	}
}

func TestBrowserRulesValidate(t *testing.T) {
	var none *Browser
	ok := []*Browser{none, {}, {SafeSearch: true, YouTube: "strict", SecureDNSOff: true, BlockedSites: []string{"example.com", "*.bad.example"}}}
	for _, b := range ok {
		if err := b.Validate(); err != nil {
			t.Errorf("%+v: %v", b, err)
		}
	}
	many := make([]string, MaxBlockedSites+1)
	for i := range many {
		many[i] = "a.example"
	}
	bad := []*Browser{{YouTube: "lenient"}, {BlockedSites: []string{""}}, {BlockedSites: []string{"has space.com"}}, {BlockedSites: many}}
	for _, b := range bad {
		if err := b.Validate(); !errors.Is(err, ErrInvalidBrowserPolicy) {
			t.Errorf("%+v accepted: %v", b, err)
		}
	}
}

func TestBedtimeAllowedAppsValidate(t *testing.T) {
	var none *LockSchedule
	ok := []*LockSchedule{none, {}, {Enabled: true, AllowedApps: []string{"com.kanout.mawaqit", "com.github.meypod.al_azan", "com.AppRocks.now.prayer"}}}
	for _, s := range ok {
		if err := s.Validate(); err != nil {
			t.Errorf("%+v: %v", s, err)
		}
	}
	many := make([]string, MaxBedtimeAllowedApps+1)
	for i := range many {
		many[i] = "com.example.app"
	}
	bad := []*LockSchedule{
		{AllowedApps: []string{""}},
		{AllowedApps: []string{"mawaqit"}},         // no dot: not a package name
		{AllowedApps: []string{"com.example app"}}, // space
		{AllowedApps: []string{"1com.example"}},    // starts with a digit
		{AllowedApps: []string{"com..example"}},    // empty segment
		{AllowedApps: many},
	}
	for _, s := range bad {
		if err := s.Validate(); !errors.Is(err, ErrInvalidLockSchedule) {
			t.Errorf("%+v accepted: %v", s, err)
		}
	}
}

func TestPolicyValuesThePhoneCantUseAreRefused(t *testing.T) {
	good := &LockSchedule{Enabled: true, Windows: []LockWindow{{Days: []int{1, 7}, FromHour: 22, ToHour: 7}}}
	if err := good.Validate(); err != nil {
		t.Fatalf("a normal bedtime: %v", err)
	}
	for name, s := range map[string]*LockSchedule{
		"no days":  {Windows: []LockWindow{{FromHour: 22, ToHour: 7}}},
		"day 0":    {Windows: []LockWindow{{Days: []int{0}, FromHour: 22, ToHour: 7}}},
		"day 8":    {Windows: []LockWindow{{Days: []int{8}, FromHour: 22, ToHour: 7}}},
		"hour 24":  {Windows: []LockWindow{{Days: []int{1}, FromHour: 24, ToHour: 7}}},
		"hour -1":  {Windows: []LockWindow{{Days: []int{1}, FromHour: 22, ToHour: -1}}},
		"too many": {Windows: make([]LockWindow, MaxBedtimeWindows+1)},
	} {
		if err := s.Validate(); !errors.Is(err, ErrInvalidLockSchedule) {
			t.Errorf("%s: %v", name, err)
		}
	}

	for _, ok := range []LocationPolicy{{}, {Enabled: true, IntervalMinutes: 15}, {IntervalMinutes: 1440}} {
		if err := ok.Validate(); err != nil {
			t.Errorf("location %+v: %v", ok, err)
		}
	}
	for _, bad := range []LocationPolicy{{IntervalMinutes: -5}, {IntervalMinutes: 1441}} {
		if err := bad.Validate(); !errors.Is(err, ErrInvalidRules) {
			t.Errorf("location %+v: %v", bad, err)
		}
	}

	if err := (TimeLimits{Rules: []TimeLimitRule{{Category: "Games", DailyMinutes: 60}, {Category: "Social", DailyMinutes: 0}}}).Validate(); err != nil {
		t.Fatalf("normal limits: %v", err)
	}
	for _, bad := range []TimeLimits{{Rules: []TimeLimitRule{{Category: "", DailyMinutes: 60}}}, {Rules: []TimeLimitRule{{Category: "Games", DailyMinutes: -1}}}, {Rules: []TimeLimitRule{{Category: "Games", DailyMinutes: 1441}}}} {
		if err := bad.Validate(); !errors.Is(err, ErrInvalidRules) {
			t.Errorf("limits %+v: %v", bad, err)
		}
	}
}
