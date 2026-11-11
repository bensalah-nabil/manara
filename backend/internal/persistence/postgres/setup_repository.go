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
	var name, password *string
	if rep.Pairing != nil {
		name, password = &rep.Pairing.Name, &rep.Pairing.Password
	}
	// A NULL $5 keeps the stored lists; initial_accounts is filled only while it is still empty.
	// A non-NULL $6 (the phone's new QR name) starts a new setup: fresh inputs, but the list of
	// what the phone had is kept unless the last run finished. A run that failed after removing
	// accounts must not erase what the parent needs to sign back in to (seen on the SM-A528B).
	// Leaving the pairing step clears everything pairing needed.
	_, err := r.db.Pool.Exec(ctx, `
		INSERT INTO device_setup (device_id, step, status, message, initial_accounts, current_accounts, pairing_name, pairing_password)
		VALUES ($1, $2, $3, $4, COALESCE($5::jsonb, '[]'), COALESCE($5::jsonb, '[]'), $6, $7)
		ON CONFLICT (device_id) DO UPDATE SET
			step = EXCLUDED.step,
			status = EXCLUDED.status,
			message = EXCLUDED.message,
			current_accounts = CASE
				WHEN $6::text IS NOT NULL THEN COALESCE($5::jsonb, '[]')
				ELSE COALESCE($5::jsonb, device_setup.current_accounts) END,
			initial_accounts = CASE
				WHEN $6::text IS NOT NULL AND device_setup.step = 'done' THEN COALESCE($5::jsonb, '[]')
				WHEN device_setup.initial_accounts = '[]'::jsonb AND $5::jsonb IS NOT NULL THEN $5::jsonb
				ELSE device_setup.initial_accounts END,
			pairing_name = CASE
				WHEN EXCLUDED.step <> 'pairing' THEN NULL
				ELSE COALESCE($6::text, device_setup.pairing_name) END,
			pairing_password = CASE
				WHEN EXCLUDED.step <> 'pairing' THEN NULL
				ELSE COALESCE($7::text, device_setup.pairing_password) END,
			pairing_code = CASE
				WHEN EXCLUDED.step <> 'pairing' OR $6::text IS NOT NULL THEN NULL
				ELSE device_setup.pairing_code END,
			finish_requested = CASE
				WHEN $6::text IS NOT NULL THEN false
				ELSE device_setup.finish_requested END,
			started_at = CASE WHEN $6::text IS NOT NULL THEN now() ELSE device_setup.started_at END,
			updated_at = now()
		-- A finished run stays finished: a late report from the same run (the phone still
		-- watching accounts after the parent chose Finish) can't reopen it. Only a new run can.
		WHERE device_setup.step <> 'done' OR $6::text IS NOT NULL OR EXCLUDED.step = 'done'
	`, deviceID, string(rep.Step), string(rep.Status), rep.Message, current, name, password)
	if err != nil {
		return nil, fmt.Errorf("store setup report: %w", err)
	}
	return r.Get(ctx, deviceID)
}

func (r *SetupRepository) Get(ctx context.Context, deviceID string) (*domain.DeviceSetup, error) {
	var s domain.DeviceSetup
	var step, status string
	var initial, current []byte
	var name, password *string
	err := r.db.Pool.QueryRow(ctx, `
		SELECT device_id, step, status, message, initial_accounts, current_accounts, started_at, updated_at,
			pairing_name, pairing_password, finish_requested
		FROM device_setup WHERE device_id = $1
	`, deviceID).Scan(&s.DeviceID, &step, &status, &s.Message, &initial, &current, &s.StartedAt, &s.UpdatedAt,
		&name, &password, &s.FinishRequested)
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
	if s.Step == domain.SetupPairing && s.Status != domain.SetupFailed && name != nil && password != nil {
		s.PairingQR = domain.QRPairing{Name: *name, Password: *password}.QRText()
	}
	return &s, nil
}

func (r *SetupRepository) Input(ctx context.Context, deviceID string) (domain.SetupInput, error) {
	var in domain.SetupInput
	var code *string
	var earlier []byte
	err := r.db.Pool.QueryRow(ctx, `
		SELECT pairing_code, pairing_code_seq, finish_requested,
			CASE WHEN step = 'done' THEN '[]'::jsonb ELSE initial_accounts END
		FROM device_setup WHERE device_id = $1`, deviceID,
	).Scan(&code, &in.PairingCodeSeq, &in.Finish, &earlier)
	if errors.Is(err, pgx.ErrNoRows) {
		return in, nil
	}
	if err != nil {
		return in, fmt.Errorf("get setup input: %w", err)
	}
	if code != nil {
		in.PairingCode = *code
	}
	if err := json.Unmarshal(earlier, &in.EarlierAccounts); err != nil {
		return in, fmt.Errorf("decode earlier accounts: %w", err)
	}
	return in, nil
}

func (r *SetupRepository) SendPairingCode(ctx context.Context, deviceID, code string) error {
	tag, err := r.db.Pool.Exec(ctx, `
		UPDATE device_setup SET pairing_code = $2, pairing_code_seq = pairing_code_seq + 1, updated_at = now()
		WHERE device_id = $1 AND step = 'pairing' AND status <> 'failed'
	`, deviceID, code)
	if err != nil {
		return fmt.Errorf("store pairing code: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return domain.ErrSetupNotWaiting
	}
	return nil
}

func (r *SetupRepository) RequestFinish(ctx context.Context, deviceID string) error {
	tag, err := r.db.Pool.Exec(ctx, `
		UPDATE device_setup SET step = 'done', status = 'done',
			message = 'Setup finished. Manara now manages this phone.',
			finish_requested = true, updated_at = now()
		WHERE device_id = $1 AND step = 'reconnecting' AND status <> 'failed'
	`, deviceID)
	if err != nil {
		return fmt.Errorf("request setup finish: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return domain.ErrSetupNotWaiting
	}
	return nil
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

// SaveReadiness implements domain.ReadinessRepository: the latest checklist replaces the last.
func (r *SetupRepository) SaveReadiness(ctx context.Context, deviceID string, readiness domain.SetupReadiness) error {
	readiness.UpdatedAt = time.Time{}
	raw, err := json.Marshal(readiness)
	if err != nil {
		return fmt.Errorf("encode readiness: %w", err)
	}
	if _, err := r.db.Pool.Exec(ctx, `
		INSERT INTO setup_readiness (device_id, readiness, updated_at) VALUES ($1, $2, now())
		ON CONFLICT (device_id) DO UPDATE SET readiness = EXCLUDED.readiness, updated_at = now()`, deviceID, raw); err != nil {
		return fmt.Errorf("store readiness: %w", err)
	}
	return nil
}

func (r *SetupRepository) Readiness(ctx context.Context, deviceID string) (*domain.SetupReadiness, error) {
	var raw []byte
	var at time.Time
	err := r.db.Pool.QueryRow(ctx, `SELECT readiness, updated_at FROM setup_readiness WHERE device_id = $1`, deviceID).Scan(&raw, &at)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("read readiness: %w", err)
	}
	var readiness domain.SetupReadiness
	if err := json.Unmarshal(raw, &readiness); err != nil {
		return nil, fmt.Errorf("decode readiness: %w", err)
	}
	readiness.UpdatedAt = at
	return &readiness, nil
}
