package postgres

import (
	"context"
	"testing"
	"time"

	"manara/backend/internal/domain"

	"github.com/google/uuid"
)

func TestTheWeeklyEmailIsDueOnlyToAParentWithUsageThatWeek(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	repo := NewWeeklyEmailRepository(db)
	parents := NewParentRepository(db)
	week := time.Date(2026, 11, 9, 0, 0, 0, 0, domain.WeeklyEmailZone)
	end := week.AddDate(0, 0, 7)
	now := end.Add(8 * time.Hour)

	withUsage := newParent(t, db, uniqueEmail("weekly-usage"), "password one")
	quiet := newParent(t, db, uniqueEmail("weekly-quiet"), "password one")
	off := newParent(t, db, uniqueEmail("weekly-off"), "password one")
	phone := addPhone(t, db, withUsage.ID)
	addUsageReport(t, db, phone, week.Add(50*time.Hour))
	addUsageReport(t, db, addPhone(t, db, quiet.ID), week.Add(-time.Minute)) // the week before
	addUsageReport(t, db, addPhone(t, db, off.ID), week.Add(time.Hour))
	if err := parents.SetWeeklyEmail(ctx, off.ID, false); err != nil {
		t.Fatal(err)
	}

	due := weeklyDue(t, repo, week, now)
	if !due[withUsage.ID] || due[quiet.ID] || due[off.ID] {
		t.Fatalf("due = %v; want only the parent whose phone reported usage that week, with the email on", due)
	}
	if p, _ := parents.FindByID(ctx, off.ID); p == nil || p.WeeklyEmail {
		t.Fatalf("turned off, read back %+v", p)
	}
	if p, _ := parents.FindByID(ctx, withUsage.ID); p == nil || !p.WeeklyEmail {
		t.Fatalf("a new parent has the email off: %+v", p)
	}

	var claimed bool
	if err := repo.Update(ctx, withUsage.ID, func(e *domain.WeeklyEmail) {
		claimed = e.Claim(week, now)
		e.Failed(now)
	}); err != nil {
		t.Fatal(err)
	}
	if !claimed || weeklyDue(t, repo, week, now)[withUsage.ID] || !weeklyDue(t, repo, week, now.Add(time.Minute))[withUsage.ID] {
		t.Fatal("a failed weekly email is not due again exactly one minute later")
	}
	if err := repo.Update(ctx, withUsage.ID, func(e *domain.WeeklyEmail) {
		if !e.Trying.Equal(week) || e.Tries != 1 || !e.NextTry.Equal(now.Add(time.Minute)) {
			t.Errorf("read back %+v", *e)
		}
		e.Settle(week)
	}); err != nil {
		t.Fatal(err)
	}
	if weeklyDue(t, repo, week, now.Add(time.Hour))[withUsage.ID] {
		t.Fatal("a settled week is still due")
	}

	addUsageReport(t, db, phone, end.Add(time.Hour))
	if !weeklyDue(t, repo, end, now.AddDate(0, 0, 7))[withUsage.ID] {
		t.Fatal("the next week, with usage, is not due")
	}
}

func addPhone(t *testing.T, db *DB, parentID string) string {
	t.Helper()
	id := uuid.NewString()
	if err := NewDeviceRepository(db).Create(context.Background(), &domain.Device{ID: id, ParentID: parentID, CreatedAt: time.Now()}); err != nil {
		t.Fatal(err)
	}
	return id
}

func addUsageReport(t *testing.T, db *DB, deviceID string, at time.Time) {
	t.Helper()
	_, err := NewEventStore(db).Insert(context.Background(), []*domain.Event{{
		ID: uuid.NewString(), DeviceID: deviceID, Kind: domain.EventKindUsageReport, OccurredAt: at,
		Payload: map[string]any{"date": at.Format("2006-01-02"), "totalMinutes": 12, "apps": []any{}},
	}})
	if err != nil {
		t.Fatal(err)
	}
}

func weeklyDue(t *testing.T, repo *WeeklyEmailRepository, week, now time.Time) map[string]bool {
	t.Helper()
	ids, err := repo.Due(context.Background(), week, week.AddDate(0, 0, 7), now)
	if err != nil {
		t.Fatal(err)
	}
	due := map[string]bool{}
	for _, id := range ids {
		due[id] = true
	}
	return due
}
