package domain

import (
	"encoding/json"
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
		"timeLimits": {"enabled": true, "rules": [{"category": "social", "packages": ["a.b"], "dailyMinutes": 30}]},
		"siteFilter": {"enabled": true, "dnsHost": "dns.example"},
		"location": {"enabled": true, "intervalMinutes": 10},
		"callLog": {"enabled": true},
		"lockSchedule": {"enabled": true, "windows": [{"days": [6, 7], "fromHour": 22, "toHour": 7}]},
		"restrictions": {"blockVpnConfig": true, "blockPrivateDnsConfig": true, "blockFactoryReset": true, "blockSafeBoot": true, "blockAddUser": true},
		"usageReport": {"enabled": true}
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
