package postgres

import (
	"context"
	"errors"
	"fmt"
	"time"

	"manara/backend/internal/domain"

	"github.com/jackc/pgx/v5"
	"golang.org/x/crypto/bcrypt"
)

// AccountRepository implements domain.AccountRepository and
// domain.PasswordResetRepository: both act on the parent's own credentials.
type AccountRepository struct{ db *DB }

func NewAccountRepository(db *DB) *AccountRepository { return &AccountRepository{db: db} }

func (r *AccountRepository) CheckPassword(ctx context.Context, parentID, password string) (bool, error) {
	var hash *string
	err := r.db.Pool.QueryRow(ctx, `SELECT password_hash FROM parents WHERE id = $1`, parentID).Scan(&hash)
	if errors.Is(err, pgx.ErrNoRows) || (err == nil && hash == nil) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("read password hash: %w", err)
	}
	return bcrypt.CompareHashAndPassword([]byte(*hash), []byte(password)) == nil, nil
}

// Delete is one statement, so a phone enrolled at the same moment either
// blocks the deletion or is deleted with it: never left behind, orphaned.
func (r *AccountRepository) Delete(ctx context.Context, parentID string) error {
	tag, err := r.db.Pool.Exec(ctx, `
		DELETE FROM parents
		WHERE id = $1 AND NOT EXISTS (SELECT 1 FROM devices WHERE parent_id = $1)`, parentID)
	if err != nil {
		return fmt.Errorf("delete parent: %w", err)
	}
	if tag.RowsAffected() == 1 {
		return nil
	}
	var devices int
	if err := r.db.Pool.QueryRow(ctx, `SELECT count(*) FROM devices WHERE parent_id = $1`, parentID).Scan(&devices); err != nil {
		return fmt.Errorf("count devices: %w", err)
	}
	if devices > 0 {
		return domain.ErrDevicesRemain
	}
	return nil // already gone
}

// Create looks the address up case-insensitively: accounts made before
// addresses were normalized may be stored with capitals.
func (r *AccountRepository) Create(ctx context.Context, email string, ttl, cooldown time.Duration) (string, bool, error) {
	var parentID string
	err := r.db.Pool.QueryRow(ctx, `
		SELECT id FROM parents WHERE lower(email) = $1 ORDER BY created_at LIMIT 1`,
		domain.NormalizeEmail(email)).Scan(&parentID)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", false, nil
	}
	if err != nil {
		return "", false, fmt.Errorf("find parent for reset: %w", err)
	}

	token, hash, err := randomTokenAndHash()
	if err != nil {
		return "", false, err
	}
	// The cooldown check and the insert are one statement, so two requests
	// at once can't both mail the parent.
	tag, err := r.db.Pool.Exec(ctx, `
		INSERT INTO password_resets (token_hash, parent_id, expires_at)
		SELECT $1, $2, now() + make_interval(secs => $3)
		WHERE NOT EXISTS (
			SELECT 1 FROM password_resets
			WHERE parent_id = $2 AND created_at > now() - make_interval(secs => $4))`,
		hash, parentID, ttl.Seconds(), cooldown.Seconds())
	if err != nil {
		return "", false, fmt.Errorf("store reset token: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return "", false, nil
	}
	return token, true, nil
}

func (r *AccountRepository) Consume(ctx context.Context, token, newPassword string) (string, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
	if err != nil {
		return "", fmt.Errorf("hash password: %w", err)
	}
	tx, err := r.db.Pool.Begin(ctx)
	if err != nil {
		return "", fmt.Errorf("begin reset: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck // a no-op after Commit

	var parentID string
	err = tx.QueryRow(ctx, `
		UPDATE password_resets SET used_at = now()
		WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
		RETURNING parent_id`, hashToken(token)).Scan(&parentID)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", domain.ErrResetTokenInvalid
	}
	if err != nil {
		return "", fmt.Errorf("consume reset token: %w", err)
	}
	if _, err := tx.Exec(ctx, `UPDATE parents SET password_hash = $2 WHERE id = $1`, parentID, string(hash)); err != nil {
		return "", fmt.Errorf("set password: %w", err)
	}
	// Whoever had the old password is signed out everywhere, and any other
	// reset link already sent stops working.
	if _, err := tx.Exec(ctx, `DELETE FROM parent_sessions WHERE parent_id = $1`, parentID); err != nil {
		return "", fmt.Errorf("end sessions: %w", err)
	}
	if _, err := tx.Exec(ctx, `UPDATE password_resets SET used_at = now() WHERE parent_id = $1 AND used_at IS NULL`, parentID); err != nil {
		return "", fmt.Errorf("void other resets: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return "", fmt.Errorf("commit reset: %w", err)
	}
	return parentID, nil
}

// SilenceRepository implements domain.SilenceRepository.
type SilenceRepository struct{ db *DB }

func NewSilenceRepository(db *DB) *SilenceRepository { return &SilenceRepository{db: db} }

func (r *SilenceRepository) Silent(ctx context.Context, cutoff time.Time) ([]*domain.Device, error) {
	rows, err := r.db.Pool.Query(ctx, `
		SELECT id, parent_id, label, color, model, manufacturer, android_version, agent_version, last_seen, created_at, push_token
		FROM devices
		WHERE last_seen IS NOT NULL AND last_seen < $1
		  AND (silence_alerted_at IS NULL OR silence_alerted_at < last_seen)
		ORDER BY last_seen`, cutoff)
	if err != nil {
		return nil, fmt.Errorf("list silent devices: %w", err)
	}
	defer rows.Close()
	var devices []*domain.Device
	for rows.Next() {
		d, err := scanDevice(rows)
		if err != nil {
			return nil, err
		}
		devices = append(devices, d)
	}
	return devices, rows.Err()
}

func (r *SilenceRepository) MarkAlerted(ctx context.Context, deviceID string, at time.Time) error {
	if _, err := r.db.Pool.Exec(ctx, `UPDATE devices SET silence_alerted_at = $2 WHERE id = $1`, deviceID, at); err != nil {
		return fmt.Errorf("mark silence alerted: %w", err)
	}
	return nil
}
