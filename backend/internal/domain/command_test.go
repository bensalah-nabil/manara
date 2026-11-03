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
