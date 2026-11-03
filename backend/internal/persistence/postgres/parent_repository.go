package postgres

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"manara/backend/internal/domain"
)

type ParentRepository struct{ db *DB }

func NewParentRepository(db *DB) *ParentRepository { return &ParentRepository{db: db} }

func (r *ParentRepository) Create(ctx context.Context, p *domain.Parent) error {
	_, err := r.db.Pool.Exec(ctx,
		`INSERT INTO parents (id, created_at) VALUES ($1, $2)`, p.ID, p.CreatedAt)
	if err != nil {
		return fmt.Errorf("insert parent: %w", err)
	}
	return nil
}

type ParentSessionRepository struct{ db *DB }

func NewParentSessionRepository(db *DB) *ParentSessionRepository {
	return &ParentSessionRepository{db: db}
}

func (r *ParentSessionRepository) Issue(ctx context.Context, parentID string) (string, error) {
	token, hash, err := randomTokenAndHash()
	if err != nil {
		return "", err
	}
	_, err = r.db.Pool.Exec(ctx,
		`INSERT INTO parent_sessions (parent_id, token_hash) VALUES ($1, $2)`, parentID, hash)
	if err != nil {
		return "", fmt.Errorf("store parent session: %w", err)
	}
	return token, nil
}

func (r *ParentSessionRepository) Resolve(ctx context.Context, token string) (string, bool, error) {
	var parentID string
	err := r.db.Pool.QueryRow(ctx,
		`SELECT parent_id FROM parent_sessions WHERE token_hash = $1`, hashToken(token),
	).Scan(&parentID)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", false, nil
	}
	if err != nil {
		return "", false, fmt.Errorf("resolve parent session: %w", err)
	}
	return parentID, true, nil
}

type EnrollmentTokenRepository struct{ db *DB }

func NewEnrollmentTokenRepository(db *DB) *EnrollmentTokenRepository {
	return &EnrollmentTokenRepository{db: db}
}

func (r *EnrollmentTokenRepository) Create(ctx context.Context, parentID string) (string, error) {
	token, hash, err := randomTokenAndHash()
	if err != nil {
		return "", err
	}
	_, err = r.db.Pool.Exec(ctx,
		`INSERT INTO enrollment_tokens (token_hash, parent_id) VALUES ($1, $2)`, hash, parentID)
	if err != nil {
		return "", fmt.Errorf("store enrollment token: %w", err)
	}
	return token, nil
}

// Consume checks and invalidates the token in one statement, so a
// concurrent double-redeem can't both succeed (api-spec/openapi.yaml's
// "one-time" guarantee enforced at the database level, not just assumed).
func (r *EnrollmentTokenRepository) Consume(ctx context.Context, token string) (string, bool, error) {
	var parentID string
	err := r.db.Pool.QueryRow(ctx, `
		UPDATE enrollment_tokens SET consumed_at = now()
		WHERE token_hash = $1 AND consumed_at IS NULL
		RETURNING parent_id
	`, hashToken(token)).Scan(&parentID)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", false, nil
	}
	if err != nil {
		return "", false, fmt.Errorf("consume enrollment token: %w", err)
	}
	return parentID, true, nil
}

func randomTokenAndHash() (token string, hash string, err error) {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", "", fmt.Errorf("generate token: %w", err)
	}
	token = hex.EncodeToString(raw)
	return token, hashToken(token), nil
}
