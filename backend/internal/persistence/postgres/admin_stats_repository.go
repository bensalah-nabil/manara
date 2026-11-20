package postgres

import (
	"context"
	"fmt"
	"time"

	"manara/backend/internal/domain"
)

// AlertLogRepository implements domain.AlertLog.
type AlertLogRepository struct{ db *DB }

func NewAlertLogRepository(db *DB) *AlertLogRepository { return &AlertLogRepository{db: db} }

func (r *AlertLogRepository) RecordAlert(ctx context.Context, kind, deviceID string, at time.Time, delivered bool) error {
	_, err := r.db.Pool.Exec(ctx, `INSERT INTO alert_log (kind, device_id, delivered, at) VALUES ($1, $2, $3, $4)`, kind, deviceID, delivered, at)
	if err != nil {
		return fmt.Errorf("record alert: %w", err)
	}
	return nil
}

func (r *AlertLogRepository) PurgeOlderThan(ctx context.Context, cutoff time.Time) (int, error) {
	tag, err := r.db.Pool.Exec(ctx, `DELETE FROM alert_log WHERE at < $1`, cutoff)
	if err != nil {
		return 0, fmt.Errorf("purge alert log: %w", err)
	}
	return int(tag.RowsAffected()), nil
}

// Stats reads the dashboard's totals: per day in Tunisia's time zone, the last days days.
func (r *AdminRepository) Stats(ctx context.Context, now time.Time, days int) (domain.AdminStats, error) {
	var s domain.AdminStats
	tz := domain.StatsTimeZone

	rows, err := r.db.Pool.Query(ctx, `
		WITH d AS (
			SELECT generate_series(($1::timestamptz AT TIME ZONE $3)::date - ($2::int - 1), ($1::timestamptz AT TIME ZONE $3)::date, interval '1 day')::date AS day
		)
		SELECT d.day::text,
			(SELECT count(*) FROM parents p WHERE (p.created_at AT TIME ZONE $3)::date = d.day),
			(SELECT count(*) FROM devices v WHERE (v.created_at AT TIME ZONE $3)::date = d.day),
			(SELECT count(DISTINCT e.device_id) FROM events e WHERE (e.received_at AT TIME ZONE $3)::date = d.day)
		FROM d ORDER BY d.day`, now, days, tz)
	if err != nil {
		return s, fmt.Errorf("stats days: %w", err)
	}
	for rows.Next() {
		var day domain.DayStat
		if err := rows.Scan(&day.Date, &day.NewAccounts, &day.NewPhones, &day.ActivePhones); err != nil {
			rows.Close()
			return s, fmt.Errorf("read stats day: %w", err)
		}
		s.Days = append(s.Days, day)
	}
	rows.Close()

	counts := func(query string, args ...any) ([]domain.Count, error) {
		rows, err := r.db.Pool.Query(ctx, query, args...)
		if err != nil {
			return nil, err
		}
		defer rows.Close()
		out := []domain.Count{}
		for rows.Next() {
			var c domain.Count
			if err := rows.Scan(&c.Label, &c.Count); err != nil {
				return nil, err
			}
			out = append(out, c)
		}
		return out, rows.Err()
	}
	if s.Versions, err = counts(`SELECT COALESCE(NULLIF(agent_version, ''), 'unknown'), count(*) FROM devices GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT 12`); err != nil {
		return s, fmt.Errorf("stats versions: %w", err)
	}
	if s.Android, err = counts(`SELECT COALESCE(NULLIF(android_version, ''), 'unknown'), count(*) FROM devices GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT 12`); err != nil {
		return s, fmt.Errorf("stats android: %w", err)
	}
	if s.Brands, err = counts(`SELECT COALESCE(NULLIF(lower(manufacturer), ''), 'unknown'), count(*) FROM devices GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT 12`); err != nil {
		return s, fmt.Errorf("stats brands: %w", err)
	}
	if s.Failures, err = counts(`SELECT COALESCE(NULLIF(message, ''), '(no message)'), count(*) FROM device_setup WHERE status = 'failed' GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT 8`); err != nil {
		return s, fmt.Errorf("stats failures: %w", err)
	}

	err = r.db.Pool.QueryRow(ctx, `
		SELECT (SELECT count(*) FROM devices),
			count(*),
			count(*) FILTER (WHERE status = 'in_progress'),
			count(*) FILTER (WHERE status = 'waiting_for_parent'),
			count(*) FILTER (WHERE status = 'done'),
			count(*) FILTER (WHERE status = 'failed')
		FROM device_setup`).Scan(&s.Funnel.Phones, &s.Funnel.SetupStarted, &s.Funnel.InProgress,
		&s.Funnel.WaitingForParent, &s.Funnel.Finished, &s.Funnel.Failed)
	if err != nil {
		return s, fmt.Errorf("stats funnel: %w", err)
	}

	alerts, err := r.db.Pool.Query(ctx, `
		SELECT (at AT TIME ZONE $3)::date::text, kind, count(*), count(*) FILTER (WHERE NOT delivered)
		FROM alert_log WHERE at > $1::timestamptz - make_interval(days => $2) GROUP BY 1, 2 ORDER BY 1, 2`, now, days, tz)
	if err != nil {
		return s, fmt.Errorf("stats alerts: %w", err)
	}
	s.Alerts = []domain.AlertDay{}
	for alerts.Next() {
		var a domain.AlertDay
		if err := alerts.Scan(&a.Date, &a.Kind, &a.Sent, &a.Undelivered); err != nil {
			alerts.Close()
			return s, fmt.Errorf("read stats alert: %w", err)
		}
		s.Alerts = append(s.Alerts, a)
	}
	alerts.Close()

	if err := r.db.Pool.QueryRow(ctx, `SELECT count(*) FROM alert_emails WHERE reported_at IS NOT NULL AND tries > 0`).Scan(&s.EmailsFailing); err != nil {
		return s, fmt.Errorf("stats emails: %w", err)
	}
	return s, nil
}
