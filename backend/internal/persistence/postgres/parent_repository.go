package postgres

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"time"

	"manara/backend/internal/domain"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"golang.org/x/crypto/bcrypt"
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

func (r *ParentRepository) FindByID(ctx context.Context, id string) (*domain.Parent, error) {
	var p domain.Parent
	var email, hash *string
	err := r.db.Pool.QueryRow(ctx,
		`SELECT id, email, password_hash, created_at FROM parents WHERE id = $1`, id,
	).Scan(&p.ID, &email, &hash, &p.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("find parent: %w", err)
	}
	if email != nil {
		p.Email = *email
	}
	if hash != nil {
		p.PasswordHash = *hash
	}
	return &p, nil
}

type AuthRepository struct{ db *DB }

func NewAuthRepository(db *DB) *AuthRepository { return &AuthRepository{db: db} }

func (r *AuthRepository) SignUp(ctx context.Context, email, password string) (*domain.Parent, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return nil, fmt.Errorf("hash password: %w", err)
	}

	p := &domain.Parent{
		ID:           uuid.NewString(),
		Email:        email,
		PasswordHash: string(hash),
		CreatedAt:    time.Now().UTC(),
	}
	_, err = r.db.Pool.Exec(ctx,
		`INSERT INTO parents (id, email, password_hash, created_at) VALUES ($1, $2, $3, $4)`,
		p.ID, p.Email, p.PasswordHash, p.CreatedAt,
	)
	if err != nil {
		if isUniqueViolation(err) {
			return nil, domain.ErrEmailTaken
		}
		return nil, fmt.Errorf("insert parent: %w", err)
	}
	return p, nil
}

func (r *AuthRepository) Login(ctx context.Context, email, password string) (*domain.Parent, error) {
	var p domain.Parent
	err := r.db.Pool.QueryRow(ctx,
		`SELECT id, email, password_hash, created_at FROM parents WHERE email = $1`, email,
	).Scan(&p.ID, &p.Email, &p.PasswordHash, &p.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		// Same bcrypt work as a real account, so the answer's timing doesn't
		// tell whether the address is registered.
		_ = bcrypt.CompareHashAndPassword(dummyHash, []byte(password))
		return nil, domain.ErrInvalidCredentials
	}
	if err != nil {
		return nil, fmt.Errorf("find parent by email: %w", err)
	}

	if err := bcrypt.CompareHashAndPassword([]byte(p.PasswordHash), []byte(password)); err != nil {
		return nil, domain.ErrInvalidCredentials
	}
	return &p, nil
}

// 23505 is Postgres's SQLSTATE for unique_violation. Importing
// jackc/pgx/v5/pgconn specifically, not the standalone jackc/pgconn --
// they're different types to errors.As even though they print identically,
// a real mistake documented widely enough to check for deliberately.
func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
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
		`SELECT parent_id FROM parent_sessions WHERE token_hash = $1 AND created_at > now() - make_interval(secs => $2)`,
		hashToken(token), domain.SessionLifetime.Seconds(),
	).Scan(&parentID)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", false, nil
	}
	if err != nil {
		return "", false, fmt.Errorf("resolve parent session: %w", err)
	}
	return parentID, true, nil
}

func (r *ParentSessionRepository) Revoke(ctx context.Context, token string) error {
	if _, err := r.db.Pool.Exec(ctx, `DELETE FROM parent_sessions WHERE token_hash = $1`, hashToken(token)); err != nil {
		return fmt.Errorf("revoke parent session: %w", err)
	}
	return nil
}

// PurgeExpired deletes sessions past SessionLifetime; Resolve already refuses them.
func (r *ParentSessionRepository) PurgeExpired(ctx context.Context) (int64, error) {
	tag, err := r.db.Pool.Exec(ctx,
		`DELETE FROM parent_sessions WHERE created_at <= now() - make_interval(secs => $1)`, domain.SessionLifetime.Seconds())
	if err != nil {
		return 0, fmt.Errorf("purge expired sessions: %w", err)
	}
	return tag.RowsAffected(), nil
}

// dummyHash is compared against when an email is unknown (Login).
var dummyHash, _ = bcrypt.GenerateFromPassword([]byte("manara-timing-equalizer"), bcrypt.DefaultCost)

type EnrollmentTokenRepository struct{ db *DB }

func NewEnrollmentTokenRepository(db *DB) *EnrollmentTokenRepository {
	return &EnrollmentTokenRepository{db: db}
}

func (r *EnrollmentTokenRepository) Create(ctx context.Context, parentID string, a *domain.GuardianAttestation) (string, error) {
	token, hash, err := randomTokenAndHash()
	if err != nil {
		return "", err
	}
	if a == nil {
		_, err = r.db.Pool.Exec(ctx,
			`INSERT INTO enrollment_tokens (token_hash, parent_id) VALUES ($1, $2)`, hash, parentID)
	} else {
		_, err = r.db.Pool.Exec(ctx, `
			INSERT INTO enrollment_tokens (token_hash, parent_id, attested_at, attestation_version, phone_brand)
			VALUES ($1, $2, now(), $3, $4)`, hash, parentID, a.Version, a.PhoneBrand)
	}
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
		  AND created_at > now() - make_interval(secs => $2)
		RETURNING parent_id
	`, hashToken(token), domain.EnrollmentTokenLifetime.Seconds()).Scan(&parentID)
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
