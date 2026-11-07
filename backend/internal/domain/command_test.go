package domain

import "testing"

func TestCommandTypeIsUrgent(t *testing.T) {
	tests := []struct {
		name string
		t    CommandType
		want bool
	}{
		{"lock_now is urgent", CommandTypeLockNow, true},
		{"apply_policy is not urgent", CommandTypeApplyPolicy, false},
		{"request_location is not urgent", CommandTypeRequestLocation, false},
		{"ping is not urgent", CommandTypePing, false},
		{"unknown type is not urgent", CommandType("something_else"), false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := tt.t.IsUrgent(); got != tt.want {
				t.Errorf("IsUrgent() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestValidateCommand(t *testing.T) {
	ok := []struct {
		t      CommandType
		params map[string]any
	}{
		{CommandTypeLockNow, nil},
		{CommandTypeRelease, map[string]any{"mode": "remove"}},
		{CommandTypeRelease, map[string]any{"mode": "transfer"}},
	}
	for _, c := range ok {
		if err := ValidateCommand(c.t, c.params); err != nil {
			t.Errorf("%s %v: %v", c.t, c.params, err)
		}
	}
	bad := []struct {
		t      CommandType
		params map[string]any
	}{
		{"wipe_device", nil},
		{CommandTypeRelease, nil},
		{CommandTypeRelease, map[string]any{"mode": 1}},
		{CommandTypeRelease, map[string]any{"mode": "everything"}},
	}
	for _, c := range bad {
		if ValidateCommand(c.t, c.params) == nil {
			t.Errorf("%s %v accepted", c.t, c.params)
		}
	}
	if !CommandTypeRelease.IsUrgent() {
		t.Error("release is not pushed to the phone")
	}
}
