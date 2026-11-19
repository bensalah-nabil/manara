package postgres

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"manara/backend/internal/domain"
)

// PendingRepository implements domain.PendingRepository.
type PendingRepository struct{ db *DB }

func NewPendingRepository(db *DB) *PendingRepository { return &PendingRepository{db: db} }

func (r *PendingRepository) Put(ctx context.Context, c domain.PendingChange) error {
	var policyJSON, paramsJSON []byte
	var err error
	if c.Policy != nil {
		if policyJSON, err = json.Marshal(c.Policy); err != nil {
			return fmt.Errorf("encode pending policy: %w", err)
		}
	}
	if c.ReleaseParams != nil {
		if paramsJSON, err = json.Marshal(c.ReleaseParams); err != nil {
			return fmt.Errorf("encode pending release: %w", err)
		}
	}
	loosens := c.Loosens
	if loosens == nil {
		loosens = []string{}
	}
	_, err = r.db.Pool.Exec(ctx, `
		INSERT INTO pending_changes (device_id, kind, policy_json, release_params, loosens, requested_at, apply_at, applied_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, NULL)
		ON CONFLICT (device_id, kind) DO UPDATE SET policy_json = EXCLUDED.policy_json,
			release_params = EXCLUDED.release_params, loosens = EXCLUDED.loosens,
			requested_at = EXCLUDED.requested_at, apply_at = EXCLUDED.apply_at, applied_at = NULL`,
		c.DeviceID, c.Kind, policyJSON, paramsJSON, loosens, c.RequestedAt, c.ApplyAt)
	if err != nil {
		return fmt.Errorf("put pending change: %w", err)
	}
	return nil
}

const pendingColumns = `device_id::text, kind, policy_json, release_params, loosens, requested_at, apply_at, applied_at`

type pendingScanner interface {
	Scan(dest ...any) error
}

func scanPending(row pendingScanner) (domain.PendingChange, error) {
	var c domain.PendingChange
	var policyJSON, paramsJSON []byte
	if err := row.Scan(&c.DeviceID, &c.Kind, &policyJSON, &paramsJSON, &c.Loosens, &c.RequestedAt, &c.ApplyAt, &c.AppliedAt); err != nil {
		return c, fmt.Errorf("read pending change: %w", err)
	}
	if len(policyJSON) > 0 {
		var p domain.Policy
		if err := json.Unmarshal(policyJSON, &p); err != nil {
			return c, fmt.Errorf("decode pending policy: %w", err)
		}
		c.Policy = &p
	}
	if len(paramsJSON) > 0 {
		if err := json.Unmarshal(paramsJSON, &c.ReleaseParams); err != nil {
			return c, fmt.Errorf("decode pending release: %w", err)
		}
	}
	return c, nil
}

func (r *PendingRepository) Waiting(ctx context.Context, deviceID string) ([]domain.PendingChange, error) {
	rows, err := r.db.Pool.Query(ctx, `SELECT `+pendingColumns+` FROM pending_changes
		WHERE device_id = $1 AND applied_at IS NULL ORDER BY apply_at`, deviceID)
	if err != nil {
		return nil, fmt.Errorf("list pending changes: %w", err)
	}
	defer rows.Close()
	out := []domain.PendingChange{}
	for rows.Next() {
		c, err := scanPending(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func (r *PendingRepository) Cancel(ctx context.Context, deviceID, kind string) (bool, error) {
	tag, err := r.db.Pool.Exec(ctx, `DELETE FROM pending_changes WHERE device_id = $1 AND kind = $2 AND applied_at IS NULL`, deviceID, kind)
	if err != nil {
		return false, fmt.Errorf("cancel pending change: %w", err)
	}
	return tag.RowsAffected() > 0, nil
}

// ClaimDue marks and returns in one statement, so two servers never apply the same change twice.
func (r *PendingRepository) ClaimDue(ctx context.Context, now time.Time) ([]domain.PendingChange, error) {
	rows, err := r.db.Pool.Query(ctx, `UPDATE pending_changes SET applied_at = $1
		WHERE applied_at IS NULL AND apply_at <= $1 RETURNING `+pendingColumns, now)
	if err != nil {
		return nil, fmt.Errorf("claim due changes: %w", err)
	}
	defer rows.Close()
	out := []domain.PendingChange{}
	for rows.Next() {
		c, err := scanPending(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func (r *PendingRepository) ReleaseApplied(ctx context.Context, deviceID string, since time.Time) (bool, error) {
	var found bool
	err := r.db.Pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM pending_changes
		WHERE device_id = $1 AND kind = $2 AND applied_at IS NOT NULL AND applied_at >= $3)`,
		deviceID, domain.PendingRelease, since).Scan(&found)
	if err != nil {
		return false, fmt.Errorf("check applied release: %w", err)
	}
	return found, nil
}

func (r *PendingRepository) PurgeAppliedBefore(ctx context.Context, cutoff time.Time) (int, error) {
	tag, err := r.db.Pool.Exec(ctx, `DELETE FROM pending_changes WHERE applied_at IS NOT NULL AND applied_at < $1`, cutoff)
	if err != nil {
		return 0, fmt.Errorf("purge applied changes: %w", err)
	}
	return int(tag.RowsAffected()), nil
}
