package postgres

import (
	"context"
	"testing"
	"time"

	"manara/backend/internal/domain"
)

func TestAWaitingChangeIsReplacedCancelledAndClaimedOnce(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	p := newParent(t, db, uniqueEmail("pending"), "a password")
	d := &domain.Device{ID: "00000000-0000-4000-9000-" + time.Now().Format("150405000000")[:12], ParentID: p.ID, CreatedAt: time.Now()}
	if err := NewDeviceRepository(db).Create(ctx, d); err != nil {
		t.Fatal(err)
	}
	repo := NewPendingRepository(db)
	now := time.Now().UTC().Truncate(time.Second)

	first := domain.PendingChange{DeviceID: d.ID, Kind: domain.PendingPolicy, Policy: &domain.Policy{SiteFilter: domain.SiteFilter{Enabled: false}},
		Loosens: []string{domain.LoosensSiteFilter}, RequestedAt: now, ApplyAt: now.Add(time.Hour)}
	if err := repo.Put(ctx, first); err != nil {
		t.Fatal(err)
	}
	second := first
	second.Loosens = []string{domain.LoosensSites}
	second.ApplyAt = now.Add(2 * time.Hour)
	if err := repo.Put(ctx, second); err != nil {
		t.Fatal(err)
	}
	waiting, err := repo.Waiting(ctx, d.ID)
	if err != nil || len(waiting) != 1 || waiting[0].Loosens[0] != domain.LoosensSites || !waiting[0].ApplyAt.Equal(second.ApplyAt) || waiting[0].Policy == nil {
		t.Fatalf("waiting %+v, %v", waiting, err)
	}

	if due, err := repo.ClaimDue(ctx, now.Add(time.Hour)); err != nil || len(due) != 0 {
		t.Fatalf("claimed early: %+v, %v", due, err)
	}
	release := domain.PendingChange{DeviceID: d.ID, Kind: domain.PendingRelease, ReleaseParams: map[string]any{"mode": "remove"},
		Loosens: []string{domain.LoosensRelease}, RequestedAt: now, ApplyAt: now.Add(time.Hour)}
	if err := repo.Put(ctx, release); err != nil {
		t.Fatal(err)
	}
	if ok, _ := repo.ReleaseApplied(ctx, d.ID, now.Add(-time.Hour)); ok {
		t.Fatal("release counted as applied before its time")
	}
	due, err := repo.ClaimDue(ctx, now.Add(3*time.Hour))
	if err != nil || len(due) != 2 {
		t.Fatalf("due %+v, %v", due, err)
	}
	if again, _ := repo.ClaimDue(ctx, now.Add(3*time.Hour)); len(again) != 0 {
		t.Fatalf("claimed twice: %+v", again)
	}
	if ok, _ := repo.ReleaseApplied(ctx, d.ID, now.Add(-time.Hour)); !ok {
		t.Fatal("applied release not found")
	}
	if ok, _ := repo.Cancel(ctx, d.ID, domain.PendingPolicy); ok {
		t.Fatal("cancelled a change already applied")
	}
	if n, err := repo.PurgeAppliedBefore(ctx, now.Add(4*time.Hour)); err != nil || n != 2 {
		t.Fatalf("purged %d, %v", n, err)
	}
}
