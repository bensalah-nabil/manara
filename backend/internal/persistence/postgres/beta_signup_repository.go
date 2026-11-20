package postgres

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"

	"manara/backend/internal/domain"
)

// BetaSignupRepository stores the beta page's sign-ups (domain.BetaSignupStore).
type BetaSignupRepository struct{ db *DB }

func NewBetaSignupRepository(db *DB) *BetaSignupRepository { return &BetaSignupRepository{db: db} }

func (r *BetaSignupRepository) AddBetaSignup(ctx context.Context, s domain.BetaSignup) (domain.BetaSignup, error) {
	s.ID = uuid.NewString()
	if s.CreatedAt.IsZero() {
		s.CreatedAt = time.Now()
	}
	s.UpdatedAt = s.CreatedAt
	if s.Worries == nil {
		s.Worries = []string{}
	}
	if s.Slots == nil {
		s.Slots = []string{}
	}
	_, err := r.db.Pool.Exec(ctx, `
		INSERT INTO beta_signups (id, created_at, first_name, whatsapp, place, call_language, brand, model,
			child_age, worries, slots, page_language, own_child, status, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
		s.ID, s.CreatedAt, s.FirstName, s.WhatsApp, s.Place, s.CallLanguage, s.Brand, s.Model,
		s.ChildAge, s.Worries, s.Slots, s.PageLanguage, s.OwnChild, s.Status, s.UpdatedAt)
	if err != nil {
		return s, fmt.Errorf("add beta signup: %w", err)
	}
	return s, nil
}

func (r *BetaSignupRepository) ListBetaSignups(ctx context.Context, limit int) ([]domain.BetaSignup, error) {
	rows, err := r.db.Pool.Query(ctx, `
		SELECT id, created_at, first_name, whatsapp, place, call_language, brand, model, child_age,
			worries, slots, page_language, own_child, status, updated_at
		FROM beta_signups ORDER BY created_at DESC LIMIT $1`, limit)
	if err != nil {
		return nil, fmt.Errorf("list beta signups: %w", err)
	}
	defer rows.Close()
	out := []domain.BetaSignup{}
	for rows.Next() {
		var s domain.BetaSignup
		if err := rows.Scan(&s.ID, &s.CreatedAt, &s.FirstName, &s.WhatsApp, &s.Place, &s.CallLanguage, &s.Brand,
			&s.Model, &s.ChildAge, &s.Worries, &s.Slots, &s.PageLanguage, &s.OwnChild, &s.Status, &s.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan beta signup: %w", err)
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

func (r *BetaSignupRepository) SetBetaSignupStatus(ctx context.Context, id, status string, at time.Time) (bool, error) {
	if _, err := uuid.Parse(id); err != nil {
		return false, nil
	}
	tag, err := r.db.Pool.Exec(ctx, `UPDATE beta_signups SET status = $2, updated_at = $3 WHERE id = $1`, id, status, at)
	if err != nil {
		return false, fmt.Errorf("set beta signup status: %w", err)
	}
	return tag.RowsAffected() == 1, nil
}

func (r *BetaSignupRepository) PurgeBetaSignups(ctx context.Context, before time.Time) (int64, error) {
	tag, err := r.db.Pool.Exec(ctx, `DELETE FROM beta_signups WHERE created_at < $1`, before)
	if err != nil {
		return 0, fmt.Errorf("purge beta signups: %w", err)
	}
	return tag.RowsAffected(), nil
}
