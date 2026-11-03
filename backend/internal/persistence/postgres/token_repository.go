package postgres

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
)

type TokenRepository struct {
	db *DB
}

func NewTokenRepository(db *DB) *TokenRepository {
	return &TokenRepository{db: db}
}

// Issue mints a new 32-byte random token, stores only its SHA-256 hash
// (architecture.md §6: device identity is sensitive; a high-entropy random
// token doesn't need slow password-style hashing to resist brute force,
// unlike a user-chosen password), and returns the plaintext once -- this
// is the only place it ever exists outside the device itself.
func (r *TokenRepository) Issue(ctx context.Context, deviceID string) (string, error) {
	token, hash, err := randomTokenAndHash()
	if err != nil {
		return "", err
	}

	_, err = r.db.Pool.Exec(ctx, `
		INSERT INTO device_tokens (device_id, token_hash)
		VALUES ($1, $2)
		ON CONFLICT (device_id) DO UPDATE SET token_hash = EXCLUDED.token_hash
	`, deviceID, hash)
	if err != nil {
		return "", fmt.Errorf("store token: %w", err)
	}
	return token, nil
}

func (r *TokenRepository) Resolve(ctx context.Context, token string) (string, bool, error) {
	hash := hashToken(token)
	var deviceID string
	err := r.db.Pool.QueryRow(ctx,
		`SELECT device_id FROM device_tokens WHERE token_hash = $1`, hash,
	).Scan(&deviceID)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", false, nil
	}
	if err != nil {
		return "", false, fmt.Errorf("resolve token: %w", err)
	}
	return deviceID, true, nil
}

func hashToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}
