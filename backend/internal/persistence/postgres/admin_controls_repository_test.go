package postgres

import (
	"context"
	"errors"
	"testing"
	"time"

	"manara/backend/internal/domain"
)

func TestASuspendedAccountHasNoWayIn(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	email := uniqueEmail("suspend")
	p := newParent(t, db, email, "a password")
	sessions := &ParentSessionRepository{db: db}
	auth := NewAuthRepository(db)
	admin := NewAdminRepository(db)

	token, err := sessions.Issue(ctx, p.ID)
	if err != nil {
		t.Fatal(err)
	}
	if found, err := admin.SetSuspended(ctx, p.ID, true, time.Now()); err != nil || !found {
		t.Fatalf("suspend: %v %v", found, err)
	}
	if _, ok, _ := sessions.Resolve(ctx, token); ok {
		t.Fatal("a session opened before the suspension still works")
	}
	if _, err := sessions.Issue(ctx, p.ID); !errors.Is(err, domain.ErrAccountSuspended) {
		t.Fatalf("a new session was issued: %v", err)
	}
	if _, err := auth.Login(ctx, domain.NormalizeEmail(email), "a password"); !errors.Is(err, domain.ErrAccountSuspended) {
		t.Fatalf("login: %v", err)
	}
	if _, err := auth.Login(ctx, domain.NormalizeEmail(email), "wrong"); !errors.Is(err, domain.ErrInvalidCredentials) {
		t.Fatalf("a wrong password must not reveal the suspension: %v", err)
	}
	acc, err := admin.Account(ctx, p.ID)
	if err != nil || acc == nil || acc.SuspendedAt == nil {
		t.Fatalf("account %+v, %v", acc, err)
	}

	if _, err := admin.SetSuspended(ctx, p.ID, false, time.Now()); err != nil {
		t.Fatal(err)
	}
	if _, err := auth.Login(ctx, domain.NormalizeEmail(email), "a password"); err != nil {
		t.Fatalf("login after reactivation: %v", err)
	}
	if _, err := sessions.Issue(ctx, p.ID); err != nil {
		t.Fatalf("session after reactivation: %v", err)
	}
	if found, _ := admin.SetSuspended(ctx, "00000000-0000-4000-8000-000000000000", true, time.Now()); found {
		t.Fatal("suspended an account that doesn't exist")
	}
}

func TestSettingsAreStoredReplacedAndDeleted(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	settings := NewSettingsRepository(db)
	key := "test_" + time.Now().Format("150405.000000000")
	var got domain.AgentUpdateSetting
	if found, err := settings.Setting(ctx, key, &got); err != nil || found {
		t.Fatalf("before: %v %v", found, err)
	}
	if err := settings.PutSetting(ctx, key, domain.AgentUpdateSetting{VersionCode: 36, VersionName: "1.0.36"}, "Test Admin"); err != nil {
		t.Fatal(err)
	}
	if err := settings.PutSetting(ctx, key, domain.AgentUpdateSetting{Paused: true}, "Test Admin"); err != nil {
		t.Fatal(err)
	}
	if found, err := settings.Setting(ctx, key, &got); err != nil || !found || !got.Paused || got.VersionCode != 0 {
		t.Fatalf("after: %+v %v %v", got, found, err)
	}
	if err := settings.DeleteSetting(ctx, key); err != nil {
		t.Fatal(err)
	}
	if found, _ := settings.Setting(ctx, key, &got); found {
		t.Fatal("still there after delete")
	}
}
