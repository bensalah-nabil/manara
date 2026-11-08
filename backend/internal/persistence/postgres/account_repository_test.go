package postgres

import (
	"context"
	"errors"
	"os"
	"testing"
	"time"

	"manara/backend/internal/domain"
)

// These run only against a throwaway database, never a real one:
//
//	MANARA_TEST_DATABASE_URL=postgres://.../manara_test go test ./internal/persistence/postgres/
func testDB(t *testing.T) *DB {
	t.Helper()
	url := os.Getenv("MANARA_TEST_DATABASE_URL")
	if url == "" {
		t.Skip("MANARA_TEST_DATABASE_URL not set")
	}
	ctx := context.Background()
	db, err := Connect(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(db.Close)
	if err := db.Migrate(ctx); err != nil {
		t.Fatal(err)
	}
	return db
}

func newParent(t *testing.T, db *DB, email, password string) *domain.Parent {
	t.Helper()
	p, err := NewAuthRepository(db).SignUp(context.Background(), email, password)
	if err != nil {
		t.Fatal(err)
	}
	return p
}

func uniqueEmail(prefix string) string {
	return prefix + "-" + time.Now().Format("150405.000000000") + "@Example.com"
}

func TestPasswordResetIsSingleUseAndEndsSessions(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	email := uniqueEmail("reset")
	p := newParent(t, db, email, "old password")
	sessions := NewParentSessionRepository(db)
	oldSession, _ := sessions.Issue(ctx, p.ID)
	accounts := NewAccountRepository(db)

	if _, ok, err := accounts.Create(ctx, "nobody@example.com", time.Hour, time.Minute); ok || err != nil {
		t.Fatalf("unknown address: ok=%v err=%v", ok, err)
	}
	// Stored with capitals, asked for in lower case.
	token, ok, err := accounts.Create(ctx, domain.NormalizeEmail(email), time.Hour, time.Minute)
	if !ok || err != nil {
		t.Fatalf("create: ok=%v err=%v", ok, err)
	}
	if _, again, _ := accounts.Create(ctx, email, time.Hour, time.Minute); again {
		t.Fatal("a second link within the cooldown")
	}

	if _, err := accounts.Consume(ctx, token, "new password"); err != nil {
		t.Fatal(err)
	}
	if _, err := accounts.Consume(ctx, token, "another one"); !errors.Is(err, domain.ErrResetTokenInvalid) {
		t.Fatalf("second use: %v", err)
	}
	if _, found, _ := sessions.Resolve(ctx, oldSession); found {
		t.Fatal("the old session survived a reset")
	}
	auth := NewAuthRepository(db)
	if _, err := auth.Login(ctx, email, "old password"); !errors.Is(err, domain.ErrInvalidCredentials) {
		t.Fatal("old password still works")
	}
	if _, err := auth.Login(ctx, email, "new password"); err != nil {
		t.Fatalf("new password: %v", err)
	}
}

func TestAnExpiredResetLinkFails(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	email := uniqueEmail("expired")
	newParent(t, db, email, "password one")
	accounts := NewAccountRepository(db)
	token, ok, err := accounts.Create(ctx, email, -time.Second, 0)
	if !ok || err != nil {
		t.Fatalf("create: %v %v", ok, err)
	}
	if _, err := accounts.Consume(ctx, token, "password two"); !errors.Is(err, domain.ErrResetTokenInvalid) {
		t.Fatalf("expired link: %v", err)
	}
}

func TestDeletingAnAccountWaitsForEveryPhone(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	p := newParent(t, db, uniqueEmail("delete"), "password one")
	accounts := NewAccountRepository(db)
	if ok, _ := accounts.CheckPassword(ctx, p.ID, "password one"); !ok {
		t.Fatal("right password refused")
	}
	if ok, _ := accounts.CheckPassword(ctx, p.ID, "wrong"); ok {
		t.Fatal("wrong password accepted")
	}

	devices := NewDeviceRepository(db)
	d := &domain.Device{ID: "00000000-0000-4000-8000-" + time.Now().Format("150405000000")[:12], ParentID: p.ID, CreatedAt: time.Now()}
	if err := devices.Create(ctx, d); err != nil {
		t.Fatal(err)
	}
	if err := accounts.Delete(ctx, p.ID); !errors.Is(err, domain.ErrDevicesRemain) {
		t.Fatalf("with a phone: %v", err)
	}
	if err := NewReleaseRepository(db).Delete(ctx, d.ID); err != nil {
		t.Fatal(err)
	}
	if err := accounts.Delete(ctx, p.ID); err != nil {
		t.Fatal(err)
	}
	if found, _ := NewParentRepository(db).FindByID(ctx, p.ID); found != nil {
		t.Fatal("parent still there")
	}
}

func TestSilentPhonesAreListedOncePerSilence(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	p := newParent(t, db, uniqueEmail("silence"), "password one")
	devices := NewDeviceRepository(db)
	id := "00000000-0000-4000-9000-" + time.Now().Format("150405000000")[:12]
	if err := devices.Create(ctx, &domain.Device{ID: id, ParentID: p.ID, CreatedAt: time.Now()}); err != nil {
		t.Fatal(err)
	}
	silence := NewSilenceRepository(db)
	listed := func() bool {
		ds, err := silence.Silent(ctx, time.Now().Add(-12*time.Hour))
		if err != nil {
			t.Fatal(err)
		}
		for _, d := range ds {
			if d.ID == id {
				return true
			}
		}
		return false
	}

	if listed() {
		t.Fatal("a phone that never connected is not silent")
	}
	if err := devices.UpdateLastSeen(ctx, id, time.Now().Add(-13*time.Hour)); err != nil {
		t.Fatal(err)
	}
	if !listed() {
		t.Fatal("13 hours quiet, not listed")
	}
	if err := silence.MarkAlerted(ctx, id, time.Now()); err != nil {
		t.Fatal(err)
	}
	if listed() {
		t.Fatal("listed again after its alert")
	}
	// It checks in, then goes quiet again: a new silence.
	if err := devices.UpdateLastSeen(ctx, id, time.Now().Add(time.Minute)); err != nil {
		t.Fatal(err)
	}
	if listed() {
		t.Fatal("a phone that just checked in is not silent")
	}
	if _, err := db.Pool.Exec(ctx, `UPDATE devices SET last_seen = now() - interval '13 hours', silence_alerted_at = now() - interval '14 hours' WHERE id = $1`, id); err != nil {
		t.Fatal(err)
	}
	if !listed() {
		t.Fatal("a new silence after a check-in was not listed")
	}
}

func TestSessionsExpireAndCanBeRevoked(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	p := newParent(t, db, uniqueEmail("session"), "password one")
	sessions := NewParentSessionRepository(db)

	live, _ := sessions.Issue(ctx, p.ID)
	if _, ok, _ := sessions.Resolve(ctx, live); !ok {
		t.Fatal("a new session doesn't resolve")
	}
	if err := sessions.Revoke(ctx, live); err != nil {
		t.Fatal(err)
	}
	if _, ok, _ := sessions.Resolve(ctx, live); ok {
		t.Fatal("a revoked session still resolves")
	}

	old, _ := sessions.Issue(ctx, p.ID)
	if _, err := db.Pool.Exec(ctx, `UPDATE parent_sessions SET created_at = now() - interval '31 days' WHERE token_hash = $1`, hashToken(old)); err != nil {
		t.Fatal(err)
	}
	if _, ok, _ := sessions.Resolve(ctx, old); ok {
		t.Fatal("a 31-day-old session still resolves")
	}
	if n, err := sessions.PurgeExpired(ctx); err != nil || n < 1 {
		t.Fatalf("purge: %d, %v", n, err)
	}
}

func TestLoginTakesBcryptTimeForAnUnknownEmailToo(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	auth := NewAuthRepository(db)
	start := time.Now()
	if _, err := auth.Login(ctx, uniqueEmail("nobody"), "whatever"); !errors.Is(err, domain.ErrInvalidCredentials) {
		t.Fatal(err)
	}
	if d := time.Since(start); d < 20*time.Millisecond {
		t.Fatalf("unknown email answered in %v: faster than a bcrypt compare, so timing tells", d)
	}
}
