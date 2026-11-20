package postgres

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"

	"manara/backend/internal/domain"
)

// The admin console's actions and run-time settings (domain/admin_controls.go).

func (r *AdminRepository) Account(ctx context.Context, id string) (*domain.AdminAccount, error) {
	var a domain.AdminAccount
	err := r.db.Pool.QueryRow(ctx, `
		SELECT p.id::text, COALESCE(p.email, ''), p.created_at, p.language,
			(p.totp_secret IS NOT NULL AND p.totp_secret <> ''),
			(SELECT count(*) FROM devices d WHERE d.parent_id = p.id),
			(SELECT max(a.at) FROM audit_log a WHERE a.parent_id = p.id AND a.action = $2),
			p.suspended_at
		FROM parents p WHERE p.id::text = $1`, id, string(domain.AuditSignedIn)).
		Scan(&a.ID, &a.Email, &a.CreatedAt, &a.Language, &a.TwoStep, &a.Phones, &a.LastSignIn, &a.SuspendedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("admin account: %w", err)
	}
	return &a, nil
}

func (r *AdminRepository) PhoneOwner(ctx context.Context, deviceID string) (string, string, bool, error) {
	var accountID, email string
	err := r.db.Pool.QueryRow(ctx, `
		SELECT d.parent_id::text, COALESCE(p.email, '') FROM devices d JOIN parents p ON p.id = d.parent_id
		WHERE d.id::text = $1`, deviceID).Scan(&accountID, &email)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", "", false, nil
	}
	if err != nil {
		return "", "", false, fmt.Errorf("phone owner: %w", err)
	}
	return accountID, email, true, nil
}

func (r *AdminRepository) SetSuspended(ctx context.Context, accountID string, suspended bool, now time.Time) (bool, error) {
	tx, err := r.db.Pool.Begin(ctx)
	if err != nil {
		return false, fmt.Errorf("begin suspend: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck // a no-op after Commit
	var at *time.Time
	if suspended {
		at = &now
	}
	tag, err := tx.Exec(ctx, `UPDATE parents SET suspended_at = $2 WHERE id::text = $1`, accountID, at)
	if err != nil {
		return false, fmt.Errorf("set suspended: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return false, nil
	}
	if suspended {
		// Signed out everywhere at once, not at the next session check.
		if _, err := tx.Exec(ctx, `DELETE FROM parent_sessions WHERE parent_id::text = $1`, accountID); err != nil {
			return false, fmt.Errorf("end sessions: %w", err)
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return false, fmt.Errorf("commit suspend: %w", err)
	}
	return true, nil
}

func (r *AdminRepository) DeleteSetup(ctx context.Context, deviceID string) (bool, error) {
	tag, err := r.db.Pool.Exec(ctx, `DELETE FROM device_setup WHERE device_id::text = $1`, deviceID)
	if err != nil {
		return false, fmt.Errorf("delete setup: %w", err)
	}
	return tag.RowsAffected() > 0, nil
}

// SettingsRepository implements domain.SettingsStore.
type SettingsRepository struct{ db *DB }

func NewSettingsRepository(db *DB) *SettingsRepository { return &SettingsRepository{db: db} }

func (r *SettingsRepository) Setting(ctx context.Context, key string, into any) (bool, error) {
	var raw []byte
	err := r.db.Pool.QueryRow(ctx, `SELECT value FROM app_settings WHERE key = $1`, key).Scan(&raw)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("read setting %s: %w", key, err)
	}
	if err := json.Unmarshal(raw, into); err != nil {
		return false, fmt.Errorf("decode setting %s: %w", key, err)
	}
	return true, nil
}

func (r *SettingsRepository) PutSetting(ctx context.Context, key string, value any, by string) error {
	raw, err := json.Marshal(value)
	if err != nil {
		return fmt.Errorf("encode setting %s: %w", key, err)
	}
	_, err = r.db.Pool.Exec(ctx, `
		INSERT INTO app_settings (key, value, updated_at, updated_by) VALUES ($1, $2, now(), $3)
		ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by`,
		key, raw, by)
	if err != nil {
		return fmt.Errorf("store setting %s: %w", key, err)
	}
	return nil
}

func (r *SettingsRepository) DeleteSetting(ctx context.Context, key string) error {
	if _, err := r.db.Pool.Exec(ctx, `DELETE FROM app_settings WHERE key = $1`, key); err != nil {
		return fmt.Errorf("delete setting %s: %w", key, err)
	}
	return nil
}
