package postgres

import (
	"context"
	"testing"
	"time"

	"manara/backend/internal/domain"
)

func TestAssistantUsageAddsUpPerDayAndGoesWithTheAccount(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	repo := NewAssistantUsageRepository(db)
	p := newParent(t, db, uniqueEmail("assistant"), "correct horse battery")
	now := time.Now()
	one := domain.AssistantUsage{Model: "claude-haiku-5-5", Questions: 1, Input: 100, Output: 50, CacheRead: 4000, CacheWrite: 0}

	for i := 0; i < 2; i++ {
		if err := repo.RecordAssistantUsage(ctx, p.ID, now, one); err != nil {
			t.Fatal(err)
		}
	}
	// 500 days ago: outside the window, and purged.
	if err := repo.RecordAssistantUsage(ctx, p.ID, now.Add(-500*24*time.Hour), one); err != nil {
		t.Fatal(err)
	}

	accounts, err := repo.AssistantUsageByAccount(ctx, now, 30)
	if err != nil {
		t.Fatal(err)
	}
	var mine *domain.AccountAssistantUsage
	for i := range accounts {
		if accounts[i].AccountID == p.ID {
			mine = &accounts[i]
		}
	}
	if mine == nil || mine.Questions != 2 || mine.Input != 200 || mine.Output != 100 || mine.CacheRead != 8000 || mine.Email == "" {
		t.Fatalf("by account: %+v", mine)
	}

	days, err := repo.AssistantUsageByDay(ctx, now, 7)
	if err != nil {
		t.Fatal(err)
	}
	seen := map[string]bool{}
	for _, d := range days {
		seen[d.Day.Format("2006-01-02")] = true
	}
	if len(seen) != 7 || days[len(days)-1].Questions < 2 {
		t.Fatalf("by day: %d distinct days, last %+v", len(seen), days[len(days)-1])
	}

	if n, err := repo.PurgeAssistantUsage(ctx, now.Add(-domain.AssistantUsageRetention)); err != nil || n < 1 {
		t.Fatalf("purge: %d %v", n, err)
	}

	if _, err := db.Pool.Exec(ctx, `DELETE FROM parents WHERE id = $1`, p.ID); err != nil {
		t.Fatal(err)
	}
	var left int
	if err := db.Pool.QueryRow(ctx, `SELECT count(*) FROM assistant_usage WHERE parent_id = $1`, p.ID).Scan(&left); err != nil || left != 0 {
		t.Fatalf("rows left after the account was deleted: %d %v", left, err)
	}
}
