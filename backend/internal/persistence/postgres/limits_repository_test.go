package postgres

import (
	"context"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"manara/backend/internal/transport/guard"

	"github.com/google/uuid"
)

func TestRateLimitsAreSharedByInstancesAndSurviveARestart(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	store := NewRateStore(db)
	scope := "test-" + uuid.NewString()
	email := uniqueEmail("limited")
	t0 := time.Now()

	// Two server instances, each with its own limiter, counting through the same store.
	one := guard.NewLimiter(3, time.Minute).Persist(scope, store)
	two := guard.NewLimiter(3, time.Minute).Persist(scope, store)
	for i, l := range []*guard.Limiter{one, two, one} {
		if ok, _ := l.Allow(ctx, email, t0.Add(time.Duration(i)*time.Second)); !ok {
			t.Fatalf("try %d refused", i+1)
		}
	}
	ok, wait := two.Allow(ctx, email, t0.Add(3*time.Second))
	if ok || wait < 56*time.Second || wait > time.Minute {
		t.Fatalf("4th try across instances: ok=%v wait=%v", ok, wait)
	}

	// A restarted instance starts with an empty memory and still sees the count.
	restarted := guard.NewLimiter(3, time.Minute).Persist(scope, store)
	if ok, _ := restarted.Allow(ctx, email, t0.Add(4*time.Second)); ok {
		t.Fatal("a restart reset the count")
	}
	if ok, _ := restarted.Allow(ctx, "someone-else@example.com", t0.Add(4*time.Second)); !ok {
		t.Fatal("another key refused")
	}
	if ok, _ := restarted.Allow(ctx, email, t0.Add(61*time.Second)); !ok {
		t.Fatal("still refused after the window")
	}

	// The email itself is never stored.
	var plain int
	if err := db.Pool.QueryRow(ctx, `SELECT count(*) FROM rate_hits WHERE scope = $1 AND position($2::bytea in key_hash) > 0`, scope, []byte(email)).Scan(&plain); err != nil {
		t.Fatal(err)
	}
	if plain != 0 {
		t.Fatal("email stored as is")
	}
}

func TestTriesArrivingTogetherCantPassTheLimit(t *testing.T) {
	db := testDB(t)
	store := NewRateStore(db)
	scope := "test-" + uuid.NewString()
	now := time.Now()
	var allowed atomic.Int32
	var wg sync.WaitGroup
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			ok, _, err := store.Hit(context.Background(), scope, "same-key", 3, time.Minute, now)
			if err != nil {
				t.Error(err)
			}
			if ok {
				allowed.Add(1)
			}
		}()
	}
	wg.Wait()
	if n := allowed.Load(); n != 3 {
		t.Fatalf("%d of 10 simultaneous tries allowed, want 3", n)
	}
}

func TestTheAlertThrottleIsSharedAndForgets(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	key := "device-" + uuid.NewString() + "|usage-access|usage_access"
	t0 := time.Now()
	gate := NewAlertThrottleRepository(db, time.Hour)

	if !gate.Allow(ctx, key, t0) {
		t.Fatal("first alert held back")
	}
	// Another instance, or this one after a restart, holds the repeat back.
	if NewAlertThrottleRepository(db, time.Hour).Allow(ctx, key, t0.Add(59*time.Minute)) {
		t.Fatal("repeat within the window allowed")
	}
	if !gate.Allow(ctx, key, t0.Add(time.Hour)) {
		t.Fatal("held back after the window")
	}
	gate.Forget(ctx, key)
	if !gate.Allow(ctx, key, t0.Add(time.Hour+time.Minute)) {
		t.Fatal("a restored problem didn't alert again")
	}

	if _, err := db.PurgeLimitsOlderThan(ctx, t0.Add(2*time.Hour)); err != nil {
		t.Fatal(err)
	}
	var left int
	_ = db.Pool.QueryRow(ctx, `SELECT count(*) FROM alert_throttle WHERE key = $1`, key).Scan(&left)
	if left != 0 {
		t.Fatal("old throttle row not purged")
	}
}
