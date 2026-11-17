package postgres

import (
	"context"
	"sync"
	"testing"
	"time"

	"manara/backend/internal/domain"
)

func TestAlertEmailRepositoryKeepsTheStateAndListsWhatIsDue(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	repo := NewAlertEmailRepository(db)
	p := newParent(t, db, uniqueEmail("alert-email"), "password one")
	now := time.Now().UTC().Truncate(time.Microsecond) // Postgres keeps microseconds
	reported := now.Add(-time.Minute)

	if err := repo.Update(ctx, p.ID, func(e *domain.AlertEmail) {
		if e.Owed() || !e.LastSent.IsZero() || e.Tries != 0 {
			t.Errorf("a parent with no row starts at %+v, want zero", *e)
		}
		e.Owe(reported, now)
	}); err != nil {
		t.Fatal(err)
	}
	if !isDue(t, repo, now, p.ID) || isDue(t, repo, now.Add(-time.Second), p.ID) {
		t.Fatal("an owed email is not due exactly from its next try")
	}

	var claimed bool
	if err := repo.Update(ctx, p.ID, func(e *domain.AlertEmail) {
		if !e.ReportedAt.Equal(reported) || !e.NextTry.Equal(now) {
			t.Errorf("read back %+v, want reported %s, next try %s", *e, reported, now)
		}
		claimed = e.Claim(now)
		e.Failed(now)
	}); err != nil {
		t.Fatal(err)
	}
	if !claimed || isDue(t, repo, now, p.ID) || !isDue(t, repo, now.Add(time.Minute), p.ID) {
		t.Fatal("a failed email is not due again one minute later")
	}

	if err := repo.Update(ctx, p.ID, func(e *domain.AlertEmail) {
		if e.Tries != 1 {
			t.Errorf("tries = %d, want 1", e.Tries)
		}
		e.Sent(now.Add(time.Minute))
	}); err != nil {
		t.Fatal(err)
	}
	if isDue(t, repo, now.Add(time.Hour), p.ID) {
		t.Fatal("a sent email is still due")
	}
	if err := repo.Update(ctx, p.ID, func(e *domain.AlertEmail) {
		if e.Owed() || !e.LastSent.Equal(now.Add(time.Minute)) || !e.NextTry.IsZero() {
			t.Errorf("after Sent: %+v", *e)
		}
	}); err != nil {
		t.Fatal(err)
	}

	if _, err := db.Pool.Exec(ctx, `DELETE FROM parents WHERE id = $1`, p.ID); err != nil {
		t.Fatal(err)
	}
	var left int
	if err := db.Pool.QueryRow(ctx, `SELECT count(*) FROM alert_emails WHERE parent_id = $1`, p.ID).Scan(&left); err != nil || left != 0 {
		t.Fatalf("%d alert email rows left after the account was deleted (%v)", left, err)
	}
}

// A sync and the retry loop can reach the same parent at once: only one may
// send.
func TestAlertEmailRepositoryLetsOneSenderClaim(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	repo := NewAlertEmailRepository(db)
	p := newParent(t, db, uniqueEmail("alert-claim"), "password one")
	now := time.Now()
	if err := repo.Update(ctx, p.ID, func(e *domain.AlertEmail) { e.Owe(now, now) }); err != nil {
		t.Fatal(err)
	}

	var mu sync.Mutex
	claims := 0
	var wg sync.WaitGroup
	for range 8 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			err := repo.Update(ctx, p.ID, func(e *domain.AlertEmail) {
				if e.Claim(now) {
					mu.Lock()
					claims++
					mu.Unlock()
				}
			})
			if err != nil {
				t.Error(err)
			}
		}()
	}
	wg.Wait()
	if claims != 1 {
		t.Fatalf("%d senders claimed the same email, want 1", claims)
	}
}

func isDue(t *testing.T, repo *AlertEmailRepository, at time.Time, parentID string) bool {
	t.Helper()
	ids, err := repo.Due(context.Background(), at)
	if err != nil {
		t.Fatal(err)
	}
	for _, id := range ids {
		if id == parentID {
			return true
		}
	}
	return false
}
