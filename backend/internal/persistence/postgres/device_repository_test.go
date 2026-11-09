package postgres

import (
	"context"
	"testing"
	"time"

	"manara/backend/internal/domain"
)

// Enrollment alone kept showing the version the phone first had (1.0.10 on the
// SM-A045F after updating it to 1.0.11).
func TestTheLatestReportedAgentVersionReplacesTheEnrolledOne(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	p := newParent(t, db, uniqueEmail("version"), "password one")
	id := "00000000-0000-4000-c000-" + time.Now().Format("150405000000")[:12]
	devices := NewDeviceRepository(db)
	if err := devices.Create(ctx, &domain.Device{ID: id, ParentID: p.ID, Info: domain.DeviceInfo{AgentVersion: "1.0.10"}, CreatedAt: time.Now()}); err != nil {
		t.Fatal(err)
	}
	if err := devices.UpdateAgentVersion(ctx, id, "1.0.11"); err != nil {
		t.Fatal(err)
	}
	d, err := devices.FindByID(ctx, id)
	if err != nil {
		t.Fatal(err)
	}
	if d.Info.AgentVersion != "1.0.11" {
		t.Fatalf("version: %q", d.Info.AgentVersion)
	}
}
