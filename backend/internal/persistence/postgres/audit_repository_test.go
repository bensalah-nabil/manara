package postgres

import (
	"context"
	"strings"
	"testing"
	"time"

	"manara/backend/internal/domain"
)

func TestTheAuditLogListsNewestFirstAndIsPurged(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	p := newParent(t, db, uniqueEmail("audit"), "a password")
	other := newParent(t, db, uniqueEmail("audit-other"), "a password")
	log := NewAuditRepository(db)
	now := time.Now().UTC().Truncate(time.Second)

	for _, e := range []domain.AuditEntry{
		{ParentID: p.ID, Action: domain.AuditSignedIn, At: now.Add(-2 * time.Hour)},
		{ParentID: p.ID, DeviceID: "dev-a", Action: domain.AuditCommandSent, Detail: "lock_now\n" + strings.Repeat("x", 100), At: now.Add(-time.Hour)},
		{ParentID: p.ID, Action: domain.AuditSignedIn, At: now.Add(-100 * 24 * time.Hour)},
		{ParentID: other.ID, Action: domain.AuditSignedIn, At: now},
	} {
		if err := log.Record(ctx, e); err != nil {
			t.Fatal(err)
		}
	}
	got, err := log.ListForParent(ctx, p.ID, 10)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 3 || got[0].Action != domain.AuditCommandSent || got[0].DeviceID != "dev-a" {
		t.Fatalf("list = %+v", got)
	}
	if d := got[0].Detail; len(d) != domain.MaxAuditDetail || strings.Contains(d, "\n") {
		t.Fatalf("detail not trimmed to one short line: %q", d)
	}
	if limited, _ := log.ListForParent(ctx, p.ID, 1); len(limited) != 1 {
		t.Fatalf("limit ignored: %d", len(limited))
	}

	if _, err := log.PurgeOlderThan(ctx, now.Add(-domain.AuditRetention)); err != nil {
		t.Fatal(err)
	}
	if got, _ := log.ListForParent(ctx, p.ID, 10); len(got) != 2 {
		t.Fatalf("after purge: %d entries, want 2", len(got))
	}
	if got, _ := log.ListForParent(ctx, other.ID, 10); len(got) != 1 {
		t.Fatalf("another parent's entry: %d", len(got))
	}
}
