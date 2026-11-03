package postgres

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"manara/backend/internal/domain"
)

type PolicyRepository struct {
	db *DB
}

func NewPolicyRepository(db *DB) *PolicyRepository {
	return &PolicyRepository{db: db}
}

// The `version` column is the single source of truth, not whatever's
// embedded in policy_json -- Get always overwrites the decoded struct's
// Version from the column, and Set always derives the stored version from
// the column via an atomic SQL increment, never from a caller-supplied
// value. This sidesteps a read-then-write race a naive
// "read current, add one, write it back" approach would have under
// concurrent updates to the same device.

func (r *PolicyRepository) Get(ctx context.Context, deviceID string) (*domain.Policy, error) {
	var version int
	var raw []byte
	err := r.db.Pool.QueryRow(ctx,
		`SELECT version, policy_json FROM policies WHERE device_id = $1`, deviceID,
	).Scan(&version, &raw)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get policy: %w", err)
	}
	var p domain.Policy
	if err := json.Unmarshal(raw, &p); err != nil {
		return nil, fmt.Errorf("decode policy: %w", err)
	}
	p.Version = version
	return &p, nil
}

func (r *PolicyRepository) Set(ctx context.Context, deviceID string, p domain.Policy) (domain.Policy, error) {
	raw, err := json.Marshal(p)
	if err != nil {
		return domain.Policy{}, fmt.Errorf("encode policy: %w", err)
	}

	var version int
	err = r.db.Pool.QueryRow(ctx, `
		INSERT INTO policies (device_id, version, policy_json, updated_at)
		VALUES ($1, 1, $2, now())
		ON CONFLICT (device_id) DO UPDATE
			SET version = policies.version + 1, policy_json = EXCLUDED.policy_json, updated_at = now()
		RETURNING version
	`, deviceID, raw).Scan(&version)
	if err != nil {
		return domain.Policy{}, fmt.Errorf("store policy: %w", err)
	}
	p.Version = version
	return p, nil
}
