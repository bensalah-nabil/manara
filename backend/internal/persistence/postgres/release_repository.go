package postgres

import (
	"context"
	"encoding/base64"
	"fmt"

	"manara/backend/internal/domain"
)

type ReleaseRepository struct{ db *DB }

func NewReleaseRepository(db *DB) *ReleaseRepository { return &ReleaseRepository{db: db} }

func (r *ReleaseRepository) Secret(ctx context.Context, deviceID string) ([]byte, bool, error) {
	fresh, err := domain.NewReleaseSecret()
	if err != nil {
		return nil, false, err
	}
	// Creates the secret only when the phone has none, so concurrent calls agree on one.
	var stored string
	var confirmed bool
	err = r.db.Pool.QueryRow(ctx, `
		UPDATE devices SET release_secret = COALESCE(release_secret, $2)
		WHERE id = $1
		RETURNING release_secret, release_secret_confirmed
	`, deviceID, base64.StdEncoding.EncodeToString(fresh)).Scan(&stored, &confirmed)
	if err != nil {
		return nil, false, fmt.Errorf("release secret: %w", err)
	}
	secret, err := base64.StdEncoding.DecodeString(stored)
	if err != nil {
		return nil, false, fmt.Errorf("decode release secret: %w", err)
	}
	return secret, confirmed, nil
}

func (r *ReleaseRepository) Confirm(ctx context.Context, deviceID string) error {
	_, err := r.db.Pool.Exec(ctx, `UPDATE devices SET release_secret_confirmed = true WHERE id = $1`, deviceID)
	if err != nil {
		return fmt.Errorf("confirm release secret: %w", err)
	}
	return nil
}

func (r *ReleaseRepository) Delete(ctx context.Context, deviceID string) error {
	_, err := r.db.Pool.Exec(ctx, `DELETE FROM devices WHERE id = $1`, deviceID)
	if err != nil {
		return fmt.Errorf("delete device: %w", err)
	}
	return nil
}
