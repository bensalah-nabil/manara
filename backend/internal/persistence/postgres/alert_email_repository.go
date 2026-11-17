package postgres

import (
	"context"
	"fmt"
	"time"

	"manara/backend/internal/domain"

	"github.com/jackc/pgx/v5"
)

// AlertEmailRepository implements domain.AlertEmailRepository.
type AlertEmailRepository struct{ db *DB }

func NewAlertEmailRepository(db *DB) *AlertEmailRepository { return &AlertEmailRepository{db: db} }

// Update reads parentID's row under FOR UPDATE, so a sync and the retry loop
// never both claim the same email, and saves what change leaves.
func (r *AlertEmailRepository) Update(ctx context.Context, parentID string, change func(*domain.AlertEmail)) error {
	tx, err := r.db.Pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin alert email: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck // a no-op after Commit

	if _, err := tx.Exec(ctx, `INSERT INTO alert_emails (parent_id) VALUES ($1) ON CONFLICT (parent_id) DO NOTHING`, parentID); err != nil {
		return fmt.Errorf("add alert email: %w", err)
	}
	var e domain.AlertEmail
	var reported, next, last *time.Time
	err = tx.QueryRow(ctx, `
		SELECT reported_at, next_try_at, tries, last_sent_at FROM alert_emails
		WHERE parent_id = $1 FOR UPDATE`, parentID).Scan(&reported, &next, &e.Tries, &last)
	if err != nil {
		return fmt.Errorf("read alert email: %w", err)
	}
	e.ReportedAt, e.NextTry, e.LastSent = timeOrZero(reported), timeOrZero(next), timeOrZero(last)

	change(&e)

	_, err = tx.Exec(ctx, `
		UPDATE alert_emails SET reported_at = $2, next_try_at = $3, tries = $4, last_sent_at = $5
		WHERE parent_id = $1`,
		parentID, zeroAsNull(e.ReportedAt), zeroAsNull(e.NextTry), e.Tries, zeroAsNull(e.LastSent))
	if err != nil {
		return fmt.Errorf("save alert email: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit alert email: %w", err)
	}
	return nil
}

func (r *AlertEmailRepository) Due(ctx context.Context, now time.Time) ([]string, error) {
	rows, err := r.db.Pool.Query(ctx, `
		SELECT parent_id::text FROM alert_emails
		WHERE reported_at IS NOT NULL AND next_try_at <= $1
		ORDER BY next_try_at`, now)
	if err != nil {
		return nil, fmt.Errorf("list due alert emails: %w", err)
	}
	ids, err := pgx.CollectRows(rows, pgx.RowTo[string])
	if err != nil {
		return nil, fmt.Errorf("list due alert emails: %w", err)
	}
	return ids, nil
}

func timeOrZero(t *time.Time) time.Time {
	if t == nil {
		return time.Time{}
	}
	return *t
}

func zeroAsNull(t time.Time) *time.Time {
	if t.IsZero() {
		return nil
	}
	return &t
}
