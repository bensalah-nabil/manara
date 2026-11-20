package postgres

import (
	"context"
	"testing"
	"time"

	"manara/backend/internal/domain"
)

func TestTheDashboardCountsWhatHappened(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	now := time.Now()
	p := newParent(t, db, uniqueEmail("stats"), "a password")
	d := &domain.Device{ID: "00000000-0000-4000-a000-" + now.Format("150405000000")[:12], ParentID: p.ID,
		Info: domain.DeviceInfo{Manufacturer: "Samsung", Model: "SM-A045F", AndroidVersion: "14", AgentVersion: "1.0.36"}, CreatedAt: now}
	if err := NewDeviceRepository(db).Create(ctx, d); err != nil {
		t.Fatal(err)
	}
	logs := NewAlertLogRepository(db)
	if err := logs.RecordAlert(ctx, domain.AlertKindUnknownCall, d.ID, now, false); err != nil {
		t.Fatal(err)
	}

	s, err := NewAdminRepository(db).Stats(ctx, now, 7)
	if err != nil {
		t.Fatal(err)
	}
	if len(s.Days) != 7 {
		t.Fatalf("%d days", len(s.Days))
	}
	today := s.Days[6]
	if today.NewAccounts < 1 || today.NewPhones < 1 {
		t.Fatalf("today %+v", today)
	}
	found := func(list []domain.Count, label string) bool {
		for _, c := range list {
			if c.Label == label && c.Count >= 1 {
				return true
			}
		}
		return false
	}
	if !found(s.Brands, "samsung") || !found(s.Versions, "1.0.36") || !found(s.Android, "14") {
		t.Fatalf("fleet %+v %+v %+v", s.Brands, s.Versions, s.Android)
	}
	if s.Funnel.Phones < 1 {
		t.Fatalf("funnel %+v", s.Funnel)
	}
	var unknownCalls, undelivered int
	for _, a := range s.Alerts {
		if a.Kind == domain.AlertKindUnknownCall {
			unknownCalls += a.Sent
			undelivered += a.Undelivered
		}
	}
	if unknownCalls < 1 || undelivered < 1 {
		t.Fatalf("alerts %+v", s.Alerts)
	}
	if n, err := logs.PurgeOlderThan(ctx, now.Add(time.Hour)); err != nil || n < 1 {
		t.Fatalf("purge %d %v", n, err)
	}
}
