package postgres

import (
	"context"
	"errors"
	"fmt"
	"time"

	"manara/backend/internal/domain"

	"github.com/jackc/pgx/v5"
)

// TwoFactorRepository implements domain.TwoFactorRepository.
type TwoFactorRepository struct{ db *DB }

func NewTwoFactorRepository(db *DB) *TwoFactorRepository { return &TwoFactorRepository{db: db} }

func (r *TwoFactorRepository) Enabled(ctx context.Context, parentID string) (bool, error) {
	var on bool
	err := r.db.Pool.QueryRow(ctx, `SELECT totp_secret IS NOT NULL FROM parents WHERE id = $1`, parentID).Scan(&on)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("read two-step status: %w", err)
	}
	return on, nil
}

func (r *TwoFactorRepository) BeginSetup(ctx context.Context, parentID string) (string, error) {
	secret, err := domain.NewTOTPSecret()
	if err != nil {
		return "", err
	}
	if _, err := r.db.Pool.Exec(ctx, `UPDATE parents SET totp_pending = $2 WHERE id = $1`, parentID, secret); err != nil {
		return "", fmt.Errorf("store pending secret: %w", err)
	}
	return secret, nil
}

func (r *TwoFactorRepository) Enable(ctx context.Context, parentID, code string, now time.Time) ([]string, error) {
	var pending *string
	if err := r.db.Pool.QueryRow(ctx, `SELECT totp_pending FROM parents WHERE id = $1`, parentID).Scan(&pending); err != nil {
		return nil, fmt.Errorf("read pending secret: %w", err)
	}
	if pending == nil {
		return nil, domain.ErrTwoFactorPending
	}
	step, ok := domain.VerifyTOTP(*pending, code, now, 0)
	if !ok {
		return nil, domain.ErrBadSecondFactor
	}
	codes, err := domain.NewRecoveryCodes()
	if err != nil {
		return nil, err
	}
	tx, err := r.db.Pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin enable: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck // a no-op after Commit
	tag, err := tx.Exec(ctx, `
		UPDATE parents SET totp_secret = totp_pending, totp_pending = NULL, totp_last_step = $2
		WHERE id = $1 AND totp_pending = $3`, parentID, step, *pending)
	if err != nil {
		return nil, fmt.Errorf("enable two-step: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return nil, domain.ErrTwoFactorPending // setup was restarted meanwhile
	}
	if _, err := tx.Exec(ctx, `DELETE FROM recovery_codes WHERE parent_id = $1`, parentID); err != nil {
		return nil, fmt.Errorf("clear old recovery codes: %w", err)
	}
	for _, c := range codes {
		if _, err := tx.Exec(ctx, `INSERT INTO recovery_codes (code_hash, parent_id) VALUES ($1, $2)`, domain.HashRecoveryCode(c), parentID); err != nil {
			return nil, fmt.Errorf("store recovery code: %w", err)
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit enable: %w", err)
	}
	return codes, nil
}

func (r *TwoFactorRepository) Check(ctx context.Context, parentID, code string, now time.Time) error {
	if domain.LooksLikeRecoveryCode(code) {
		// One statement: a code used at the same moment twice is accepted once.
		tag, err := r.db.Pool.Exec(ctx, `
			UPDATE recovery_codes SET used_at = now()
			WHERE code_hash = $1 AND parent_id = $2 AND used_at IS NULL`, domain.HashRecoveryCode(code), parentID)
		if err != nil {
			return fmt.Errorf("use recovery code: %w", err)
		}
		if tag.RowsAffected() == 0 {
			return domain.ErrBadSecondFactor
		}
		return nil
	}
	var secret *string
	var last int64
	if err := r.db.Pool.QueryRow(ctx, `SELECT totp_secret, totp_last_step FROM parents WHERE id = $1`, parentID).Scan(&secret, &last); err != nil {
		return fmt.Errorf("read secret: %w", err)
	}
	if secret == nil {
		return domain.ErrBadSecondFactor
	}
	step, ok := domain.VerifyTOTP(*secret, code, now, last)
	if !ok {
		return domain.ErrBadSecondFactor
	}
	// Only move forward: two sign-ins racing with the same code, one wins.
	tag, err := r.db.Pool.Exec(ctx, `UPDATE parents SET totp_last_step = $2 WHERE id = $1 AND totp_last_step < $2`, parentID, step)
	if err != nil {
		return fmt.Errorf("record step: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return domain.ErrBadSecondFactor
	}
	return nil
}

func (r *TwoFactorRepository) Disable(ctx context.Context, parentID string) error {
	tx, err := r.db.Pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin disable: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck // a no-op after Commit
	if _, err := tx.Exec(ctx, `UPDATE parents SET totp_secret = NULL, totp_pending = NULL, totp_last_step = 0 WHERE id = $1`, parentID); err != nil {
		return fmt.Errorf("disable two-step: %w", err)
	}
	if _, err := tx.Exec(ctx, `DELETE FROM recovery_codes WHERE parent_id = $1`, parentID); err != nil {
		return fmt.Errorf("delete recovery codes: %w", err)
	}
	return tx.Commit(ctx)
}

func (r *TwoFactorRepository) NewChallenge(ctx context.Context, parentID string, now time.Time) (string, error) {
	token, hash, err := randomTokenAndHash()
	if err != nil {
		return "", err
	}
	if _, err := r.db.Pool.Exec(ctx, `DELETE FROM login_challenges WHERE expires_at < $1`, now); err != nil {
		return "", fmt.Errorf("purge challenges: %w", err)
	}
	if _, err := r.db.Pool.Exec(ctx,
		`INSERT INTO login_challenges (token_hash, parent_id, expires_at) VALUES ($1, $2, $3)`,
		hash, parentID, now.Add(domain.ChallengeLifetime)); err != nil {
		return "", fmt.Errorf("store challenge: %w", err)
	}
	return token, nil
}

func (r *TwoFactorRepository) ChallengeParent(ctx context.Context, token string, now time.Time) (string, error) {
	var parentID string
	err := r.db.Pool.QueryRow(ctx,
		`SELECT parent_id FROM login_challenges WHERE token_hash = $1 AND expires_at > $2`, hashToken(token), now,
	).Scan(&parentID)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", domain.ErrChallengeInvalid
	}
	if err != nil {
		return "", fmt.Errorf("read challenge: %w", err)
	}
	return parentID, nil
}

func (r *TwoFactorRepository) EndChallenge(ctx context.Context, token string) error {
	if _, err := r.db.Pool.Exec(ctx, `DELETE FROM login_challenges WHERE token_hash = $1`, hashToken(token)); err != nil {
		return fmt.Errorf("end challenge: %w", err)
	}
	return nil
}
