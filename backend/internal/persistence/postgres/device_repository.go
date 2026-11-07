package postgres

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"manara/backend/internal/domain"
)

type DeviceRepository struct {
	db *DB
}

func NewDeviceRepository(db *DB) *DeviceRepository {
	return &DeviceRepository{db: db}
}

func (r *DeviceRepository) Create(ctx context.Context, d *domain.Device) error {
	_, err := r.db.Pool.Exec(ctx, `
		INSERT INTO devices (id, parent_id, label, model, manufacturer, android_version, agent_version, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
	`, d.ID, d.ParentID, d.Label, d.Info.Model, d.Info.Manufacturer, d.Info.AndroidVersion, d.Info.AgentVersion, d.CreatedAt)
	if err != nil {
		return fmt.Errorf("insert device: %w", err)
	}
	return nil
}

func (r *DeviceRepository) FindByID(ctx context.Context, id string) (*domain.Device, error) {
	row := r.db.Pool.QueryRow(ctx, `
		SELECT id, parent_id, label, color, model, manufacturer, android_version, agent_version, last_seen, created_at, push_token
		FROM devices WHERE id = $1
	`, id)
	return scanDevice(row)
}

func (r *DeviceRepository) ListByParent(ctx context.Context, parentID string) ([]*domain.Device, error) {
	rows, err := r.db.Pool.Query(ctx, `
		SELECT id, parent_id, label, color, model, manufacturer, android_version, agent_version, last_seen, created_at, push_token
		FROM devices WHERE parent_id = $1 ORDER BY created_at
	`, parentID)
	if err != nil {
		return nil, fmt.Errorf("list devices: %w", err)
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

func (r *DeviceRepository) UpdateLastSeen(ctx context.Context, id string, at time.Time) error {
	_, err := r.db.Pool.Exec(ctx, `UPDATE devices SET last_seen = $1 WHERE id = $2`, at, id)
	if err != nil {
		return fmt.Errorf("update last_seen: %w", err)
	}
	return nil
}

func (r *DeviceRepository) UpdatePushToken(ctx context.Context, id string, token string) error {
	_, err := r.db.Pool.Exec(ctx, `UPDATE devices SET push_token = $1 WHERE id = $2`, token, id)
	if err != nil {
		return fmt.Errorf("update push_token: %w", err)
	}
	return nil
}

type rowScanner interface {
	Scan(dest ...any) error
}

func (r *DeviceRepository) UpdateProfile(ctx context.Context, id, label, color string) error {
	_, err := r.db.Pool.Exec(ctx, `UPDATE devices SET label = $2, color = $3 WHERE id = $1`, id, label, color)
	if err != nil {
		return fmt.Errorf("update device profile: %w", err)
	}
	return nil
}

func scanDevice(row rowScanner) (*domain.Device, error) {
	var d domain.Device
	var lastSeen *time.Time
	var pushToken *string
	err := row.Scan(
		&d.ID, &d.ParentID, &d.Label, &d.Color,
		&d.Info.Model, &d.Info.Manufacturer, &d.Info.AndroidVersion, &d.Info.AgentVersion,
		&lastSeen, &d.CreatedAt, &pushToken,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("scan device: %w", err)
	}
	if lastSeen != nil {
		d.LastSeen = *lastSeen
	}
	if pushToken != nil {
		d.PushToken = *pushToken
	}
	return &d, nil
}
