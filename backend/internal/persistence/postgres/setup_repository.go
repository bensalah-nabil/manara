package postgres

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"manara/backend/internal/domain"

	"github.com/jackc/pgx/v5"
)

type SetupRepository struct{ db *DB }

func NewSetupRepository(db *DB) *SetupRepository {
	return &SetupRepository{db: db}
}

func (r *SetupRepository) Report(ctx context.Context, deviceID string, rep domain.SetupReport) (*domain.DeviceSetup, error) {
	var current []byte
	if rep.Accounts != nil {
		raw, err := json.Marshal(rep.Accounts)
		if err != nil {
			return nil, fmt.Errorf("encode accounts: %w", err)
		}
		current = raw
	}
	// A NULL $5 keeps the stored lists; initial_accounts is filled only while it is still empty.
	_, err := r.db.Pool.Exec(ctx, `
		INSERT INTO device_setup (device_id, step, status, message, initial_accounts, current_accounts)
		VALUES ($1, $2, $3, $4, COALESCE($5::jsonb, '[]'), COALESCE($5::jsonb, '[]'))
		ON CONFLICT (device_id) DO UPDATE SET
			step = EXCLUDED.step,
			status = EXCLUDED.status,
			message = EXCLUDED.message,
			current_accounts = COALESCE($5::jsonb, device_setup.current_accounts),
			initial_accounts = CASE
				WHEN device_setup.initial_accounts = '[]'::jsonb AND $5::jsonb IS NOT NULL THEN $5::jsonb
				ELSE device_setup.initial_accounts END,
			updated_at = now()
	`, deviceID, string(rep.Step), string(rep.Status), rep.Message, current)
	if err != nil {
		return nil, fmt.Errorf("store setup report: %w", err)
	}
	return r.Get(ctx, deviceID)
}

func (r *SetupRepository) Get(ctx context.Context, deviceID string) (*domain.DeviceSetup, error) {
	var s domain.DeviceSetup
	var step, status string
	var initial, current []byte
	err := r.db.Pool.QueryRow(ctx, `
		SELECT device_id, step, status, message, initial_accounts, current_accounts, started_at, updated_at
		FROM device_setup WHERE device_id = $1
	`, deviceID).Scan(&s.DeviceID, &step, &status, &s.Message, &initial, &current, &s.StartedAt, &s.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get setup: %w", err)
	}
	s.Step, s.Status = domain.SetupStep(step), domain.SetupStatus(status)
	if err := json.Unmarshal(initial, &s.InitialAccounts); err != nil {
		return nil, fmt.Errorf("decode initial accounts: %w", err)
	}
	if err := json.Unmarshal(current, &s.CurrentAccounts); err != nil {
		return nil, fmt.Errorf("decode current accounts: %w", err)
	}
	return &s, nil
}

func (r *SetupRepository) ClearAccounts(ctx context.Context, deviceID string) error {
	_, err := r.db.Pool.Exec(ctx,
		`UPDATE device_setup SET initial_accounts = '[]', current_accounts = '[]' WHERE device_id = $1`, deviceID)
	if err != nil {
		return fmt.Errorf("clear setup accounts: %w", err)
	}
	return nil
}

func (r *SetupRepository) ClearAccountsOlderThan(ctx context.Context, cutoff time.Time) (int, error) {
	tag, err := r.db.Pool.Exec(ctx, `
		UPDATE device_setup SET initial_accounts = '[]', current_accounts = '[]'
		WHERE updated_at < $1 AND (initial_accounts <> '[]'::jsonb OR current_accounts <> '[]'::jsonb)
	`, cutoff)
	if err != nil {
		return 0, fmt.Errorf("clear old setup accounts: %w", err)
	}
	return int(tag.RowsAffected()), nil
}
