package postgres

import (
	"context"
	"strings"
	"testing"
	"time"

	"manara/backend/internal/domain"
)

func TestTheAdminViewsReadAccountsPhonesAndTheirOwnLog(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	email := uniqueEmail("admin-view")
	p := newParent(t, db, email, "a password")
	d := &domain.Device{ID: "00000000-0000-4000-8000-" + time.Now().Format("150405000000")[:12], ParentID: p.ID, Info: domain.DeviceInfo{Model: "Galaxy A04e", Manufacturer: "samsung"}, CreatedAt: time.Now()}
	if err := NewDeviceRepository(db).Create(ctx, d); err != nil {
		t.Fatal(err)
	}
	if err := NewAuditRepository(db).Record(ctx, domain.AuditEntry{ParentID: p.ID, Action: domain.AuditSignedIn}); err != nil {
		t.Fatal(err)
	}
	admin := NewAdminRepository(db)

	o, err := admin.Overview(ctx, time.Now(), 24*time.Hour)
	if err != nil || o.Accounts < 1 || o.Phones < 1 || o.SilentPhones < 1 {
		t.Fatalf("overview %+v, %v", o, err)
	}

	// The search is by part of the email, case-insensitive, and a % typed is literal.
	local := strings.ToUpper(strings.SplitN(email, "@", 2)[0])
	accounts, err := admin.Accounts(ctx, local, 10)
	if err != nil || len(accounts) != 1 || accounts[0].ID != p.ID || accounts[0].Phones != 1 || accounts[0].LastSignIn == nil {
		t.Fatalf("accounts %+v, %v", accounts, err)
	}
	if none, err := admin.Accounts(ctx, "%", 10); err != nil || len(none) != 0 {
		t.Fatalf("a literal %% matched %d accounts, %v", len(none), err)
	}

	phones, err := admin.Phones(ctx, p.ID, 10)
	if err != nil || len(phones) != 1 || phones[0].ID != d.ID || phones[0].AccountEmail == "" || phones[0].Model != "Galaxy A04e" {
		t.Fatalf("phones %+v, %v", phones, err)
	}

	entry := domain.AdminLogEntry{AdminID: "oid-1", AdminName: "Test Admin", Action: "listed_accounts", Target: local, At: time.Now()}
	if err := admin.RecordAdmin(ctx, entry); err != nil {
		t.Fatal(err)
	}
	entries, err := admin.AdminLog(ctx, 5)
	if err != nil || len(entries) == 0 || entries[0].Target != local {
		t.Fatalf("log %+v, %v", entries, err)
	}
	if n, err := admin.PurgeAdminLogOlderThan(ctx, time.Now().Add(time.Hour)); err != nil || n < 1 {
		t.Fatalf("purge %d, %v", n, err)
	}
}
