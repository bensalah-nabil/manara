package postgres

import (
	"context"
	"fmt"
	"time"

	"manara/backend/internal/domain"

	"github.com/jackc/pgx/v5"
)

// WeeklyEmailRepository implements domain.WeeklyEmailRepository.
type WeeklyEmailRepository struct{ db *DB }

func NewWeeklyEmailRepository(db *DB) *WeeklyEmailRepository { return &WeeklyEmailRepository{db: db} }

// Update reads parentID's row under FOR UPDATE, so two senders never both
// claim the same email, and saves what change leaves.
func (r *WeeklyEmailRepository) Update(ctx context.Context, parentID string, change func(*domain.WeeklyEmail)) error {
	tx, err := r.db.Pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin weekly email: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck // a no-op after Commit

	if _, err := tx.Exec(ctx, `INSERT INTO weekly_emails (parent_id) VALUES ($1) ON CONFLICT (parent_id) DO NOTHING`, parentID); err != nil {
		return fmt.Errorf("add weekly email: %w", err)
	}
	var e domain.WeeklyEmail
	var settled, trying, next *time.Time
	err = tx.QueryRow(ctx, `
		SELECT settled_week, trying_week, next_try_at, tries FROM weekly_emails
		WHERE parent_id = $1 FOR UPDATE`, parentID).Scan(&settled, &trying, &next, &e.Tries)
	if err != nil {
		return fmt.Errorf("read weekly email: %w", err)
	}
	e.Settled, e.Trying, e.NextTry = timeOrZero(settled), timeOrZero(trying), timeOrZero(next)

	change(&e)

	_, err = tx.Exec(ctx, `
		UPDATE weekly_emails SET settled_week = $2, trying_week = $3, next_try_at = $4, tries = $5
		WHERE parent_id = $1`,
		parentID, zeroAsNull(e.Settled), zeroAsNull(e.Trying), zeroAsNull(e.NextTry), e.Tries)
	if err != nil {
		return fmt.Errorf("save weekly email: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit weekly email: %w", err)
	}
	return nil
}

func (r *WeeklyEmailRepository) Due(ctx context.Context, week, end, now time.Time) ([]string, error) {
	rows, err := r.db.Pool.Query(ctx, `
		SELECT p.id::text FROM parents p
		LEFT JOIN weekly_emails w ON w.parent_id = p.id
		WHERE p.weekly_email AND p.email IS NOT NULL AND p.email <> ''
		  AND (w.settled_week IS NULL OR w.settled_week < $1)
		  AND (w.trying_week IS DISTINCT FROM $1 OR w.next_try_at IS NULL OR w.next_try_at <= $3)
		  AND EXISTS (
		      SELECT 1 FROM devices d JOIN events e ON e.device_id = d.id
		      WHERE d.parent_id = p.id AND e.kind = $4 AND e.occurred_at >= $1 AND e.occurred_at < $2)
		ORDER BY p.id`, week, end, now, string(domain.EventKindUsageReport))
	if err != nil {
		return nil, fmt.Errorf("list due weekly emails: %w", err)
	}
	ids, err := pgx.CollectRows(rows, pgx.RowTo[string])
	if err != nil {
		return nil, fmt.Errorf("list due weekly emails: %w", err)
	}
	return ids, nil
}
