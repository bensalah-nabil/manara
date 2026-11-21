package postgres

import (
	"context"
	"fmt"
	"time"

	"manara/backend/internal/domain"
)

// AssistantUsageRepository keeps the setup assistant's counts (domain.AssistantUsageStore).
type AssistantUsageRepository struct{ db *DB }

func NewAssistantUsageRepository(db *DB) *AssistantUsageRepository {
	return &AssistantUsageRepository{db: db}
}

func (r *AssistantUsageRepository) RecordAssistantUsage(ctx context.Context, parentID string, at time.Time, u domain.AssistantUsage) error {
	_, err := r.db.Pool.Exec(ctx, `
		INSERT INTO assistant_usage (parent_id, day, model, questions, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens)
		VALUES ($1, ($2::timestamptz AT TIME ZONE $3)::date, $4, $5, $6, $7, $8, $9)
		ON CONFLICT (parent_id, day, model) DO UPDATE SET
			questions = assistant_usage.questions + EXCLUDED.questions,
			input_tokens = assistant_usage.input_tokens + EXCLUDED.input_tokens,
			output_tokens = assistant_usage.output_tokens + EXCLUDED.output_tokens,
			cache_read_tokens = assistant_usage.cache_read_tokens + EXCLUDED.cache_read_tokens,
			cache_write_tokens = assistant_usage.cache_write_tokens + EXCLUDED.cache_write_tokens`,
		parentID, at, domain.StatsTimeZone, u.Model, u.Questions, u.Input, u.Output, u.CacheRead, u.CacheWrite)
	if err != nil {
		return fmt.Errorf("record assistant usage: %w", err)
	}
	return nil
}

// AssistantUsageByAccount sums each account's use per model over the last days days (Tunisia),
// heaviest first.
func (r *AssistantUsageRepository) AssistantUsageByAccount(ctx context.Context, now time.Time, days int) ([]domain.AccountAssistantUsage, error) {
	rows, err := r.db.Pool.Query(ctx, `
		SELECT u.parent_id::text, COALESCE(p.email, ''), max(u.day), u.model, sum(u.questions),
			sum(u.input_tokens), sum(u.output_tokens), sum(u.cache_read_tokens), sum(u.cache_write_tokens)
		FROM assistant_usage u JOIN parents p ON p.id = u.parent_id
		WHERE u.day > ($1::timestamptz AT TIME ZONE $2)::date - $3::int
		GROUP BY u.parent_id, p.email, u.model
		ORDER BY sum(u.output_tokens) DESC, sum(u.input_tokens) DESC
		LIMIT 500`, now, domain.StatsTimeZone, days)
	if err != nil {
		return nil, fmt.Errorf("assistant usage by account: %w", err)
	}
	defer rows.Close()
	out := []domain.AccountAssistantUsage{}
	for rows.Next() {
		var a domain.AccountAssistantUsage
		if err := rows.Scan(&a.AccountID, &a.Email, &a.LastDay, &a.Model, &a.Questions, &a.Input, &a.Output, &a.CacheRead, &a.CacheWrite); err != nil {
			return nil, fmt.Errorf("scan assistant usage: %w", err)
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

// AssistantUsageByDay lists every one of the last days days (Tunisia), per model; a day with no use
// comes back once with an empty model.
func (r *AssistantUsageRepository) AssistantUsageByDay(ctx context.Context, now time.Time, days int) ([]domain.DayAssistantUsage, error) {
	rows, err := r.db.Pool.Query(ctx, `
		WITH d AS (
			SELECT generate_series(($1::timestamptz AT TIME ZONE $2)::date - ($3::int - 1), ($1::timestamptz AT TIME ZONE $2)::date, interval '1 day')::date AS day
		)
		SELECT d.day, COALESCE(u.model, ''), COALESCE(sum(u.questions), 0), COALESCE(sum(u.input_tokens), 0),
			COALESCE(sum(u.output_tokens), 0), COALESCE(sum(u.cache_read_tokens), 0), COALESCE(sum(u.cache_write_tokens), 0)
		FROM d LEFT JOIN assistant_usage u ON u.day = d.day
		GROUP BY d.day, u.model ORDER BY d.day, u.model`, now, domain.StatsTimeZone, days)
	if err != nil {
		return nil, fmt.Errorf("assistant usage by day: %w", err)
	}
	defer rows.Close()
	out := []domain.DayAssistantUsage{}
	for rows.Next() {
		var d domain.DayAssistantUsage
		if err := rows.Scan(&d.Day, &d.Model, &d.Questions, &d.Input, &d.Output, &d.CacheRead, &d.CacheWrite); err != nil {
			return nil, fmt.Errorf("scan assistant usage day: %w", err)
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

func (r *AssistantUsageRepository) PurgeAssistantUsage(ctx context.Context, before time.Time) (int64, error) {
	tag, err := r.db.Pool.Exec(ctx, `DELETE FROM assistant_usage WHERE day < ($1::timestamptz AT TIME ZONE $2)::date`, before, domain.StatsTimeZone)
	if err != nil {
		return 0, fmt.Errorf("purge assistant usage: %w", err)
	}
	return tag.RowsAffected(), nil
}
