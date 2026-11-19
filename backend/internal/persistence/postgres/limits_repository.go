package postgres

import (
	"context"
	"crypto/sha256"
	"errors"
	"fmt"
	"log"
	"time"

	"github.com/jackc/pgx/v5"
)

// RateStore implements guard.Store: each limiter's events in rate_hits, shared by
// every server instance.
type RateStore struct{ db *DB }

func NewRateStore(db *DB) *RateStore { return &RateStore{db: db} }

// Hit counts and records in one transaction, holding a lock on that one key, so two
// instances answering at once can't both let the last allowed try through.
func (s *RateStore) Hit(ctx context.Context, scope, key string, max int, window time.Duration, now time.Time) (bool, time.Duration, error) {
	sum := sha256.Sum256([]byte(key))
	hash := sum[:]
	tx, err := s.db.Pool.Begin(ctx)
	if err != nil {
		return false, 0, fmt.Errorf("begin rate hit: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtextextended($1 || '|' || encode($2, 'hex'), 0))`, scope, hash); err != nil {
		return false, 0, fmt.Errorf("lock rate key: %w", err)
	}
	if _, err := tx.Exec(ctx, `DELETE FROM rate_hits WHERE scope = $1 AND key_hash = $2 AND at <= $3`, scope, hash, now.Add(-window)); err != nil {
		return false, 0, fmt.Errorf("drop old rate hits: %w", err)
	}
	var n int
	var oldest *time.Time
	if err := tx.QueryRow(ctx, `SELECT count(*), min(at) FROM rate_hits WHERE scope = $1 AND key_hash = $2`, scope, hash).Scan(&n, &oldest); err != nil {
		return false, 0, fmt.Errorf("count rate hits: %w", err)
	}
	if n >= max && oldest != nil {
		if err := tx.Commit(ctx); err != nil {
			return false, 0, fmt.Errorf("commit rate hit: %w", err)
		}
		return false, oldest.Add(window).Sub(now), nil
	}
	if _, err := tx.Exec(ctx, `INSERT INTO rate_hits (scope, key_hash, at) VALUES ($1, $2, $3)`, scope, hash, now); err != nil {
		return false, 0, fmt.Errorf("record rate hit: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return false, 0, fmt.Errorf("commit rate hit: %w", err)
	}
	return true, 0, nil
}

// AlertThrottleRepository implements domain.AlertGate in alert_throttle.
type AlertThrottleRepository struct {
	db     *DB
	window time.Duration
}

func NewAlertThrottleRepository(db *DB, window time.Duration) *AlertThrottleRepository {
	return &AlertThrottleRepository{db: db, window: window}
}

// Allow claims key in one statement: a new key, or one whose last alert is a full window
// old, is written and returned; a recent one is left alone and returns nothing.
func (r *AlertThrottleRepository) Allow(ctx context.Context, key string, now time.Time) bool {
	var claimed string
	err := r.db.Pool.QueryRow(ctx, `
		INSERT INTO alert_throttle (key, at) VALUES ($1, $2)
		ON CONFLICT (key) DO UPDATE SET at = EXCLUDED.at WHERE alert_throttle.at <= $3
		RETURNING key`, key, now, now.Add(-r.window)).Scan(&claimed)
	if err == nil {
		return true
	}
	if errors.Is(err, pgx.ErrNoRows) {
		return false
	}
	log.Printf("alert throttle: %v; alerting anyway", err)
	return true
}

func (r *AlertThrottleRepository) Forget(ctx context.Context, key string) {
	if _, err := r.db.Pool.Exec(ctx, `DELETE FROM alert_throttle WHERE key = $1`, key); err != nil {
		log.Printf("alert throttle forget: %v", err)
	}
}

// PurgeLimitsOlderThan deletes rate hits and throttle rows from before cutoff; every window
// is shorter than a day, so nothing still counting is removed.
func (db *DB) PurgeLimitsOlderThan(ctx context.Context, cutoff time.Time) (int64, error) {
	a, err := db.Pool.Exec(ctx, `DELETE FROM rate_hits WHERE at < $1`, cutoff)
	if err != nil {
		return 0, fmt.Errorf("purge rate hits: %w", err)
	}
	b, err := db.Pool.Exec(ctx, `DELETE FROM alert_throttle WHERE at < $1`, cutoff)
	if err != nil {
		return a.RowsAffected(), fmt.Errorf("purge alert throttle: %w", err)
	}
	return a.RowsAffected() + b.RowsAffected(), nil
}
