package domain

import (
	"testing"
	"time"
)

func TestDeviceStatus(t *testing.T) {
	now := time.Date(2026, 11, 3, 12, 0, 0, 0, time.UTC)

	tests := []struct {
		name     string
		lastSeen time.Time
		want     DeviceStatus
	}{
		{"never connected", time.Time{}, DeviceStatusNeverConnected},
		{"just checked in", now.Add(-1 * time.Minute), DeviceStatusReporting},
		{"right at the edge, still reporting", now.Add(-NotReportingAfter + time.Second), DeviceStatusReporting},
		{"just past the edge, not reporting", now.Add(-NotReportingAfter - time.Second), DeviceStatusNotReporting},
		{"long offline", now.Add(-7 * 24 * time.Hour), DeviceStatusNotReporting},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			d := Device{LastSeen: tt.lastSeen}
			if got := d.Status(now); got != tt.want {
				t.Errorf("Status() = %v, want %v", got, tt.want)
			}
		})
	}
}
