package postgres

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"manara/backend/internal/domain"
)

type CommandQueue struct {
	db *DB
}

func NewCommandQueue(db *DB) *CommandQueue {
	return &CommandQueue{db: db}
}

func (q *CommandQueue) Enqueue(ctx context.Context, deviceID string, t domain.CommandType, params map[string]any) (*domain.Command, error) {
	c := &domain.Command{
		ID:        uuid.NewString(),
		DeviceID:  deviceID,
		Type:      t,
		Params:    params,
		Status:    domain.CommandStatusPending,
		CreatedAt: time.Now().UTC(),
	}
	raw, err := json.Marshal(params)
	if err != nil {
		return nil, fmt.Errorf("encode params: %w", err)
	}
	_, err = q.db.Pool.Exec(ctx, `
		INSERT INTO commands (id, device_id, type, params_json, status, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $6)
	`, c.ID, c.DeviceID, string(c.Type), raw, string(c.Status), c.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("enqueue command: %w", err)
	}
	return c, nil
}

// PendingForDevice returns every pending command for the device and marks
// them delivered in the same call -- they're about to go out in the
// /agent/sync response this backs (architecture.md §3.1's lifecycle:
// pending -> delivered -> acked|expired).
func (q *CommandQueue) PendingForDevice(ctx context.Context, deviceID string) ([]*domain.Command, error) {
	rows, err := q.db.Pool.Query(ctx, `
		UPDATE commands SET status = 'delivered', updated_at = now()
		WHERE device_id = $1 AND status = 'pending'
		RETURNING id, device_id, type, params_json, status, detail, created_at
	`, deviceID)
	if err != nil {
		return nil, fmt.Errorf("fetch pending commands: %w", err)
	}
	defer rows.Close()

	var commands []*domain.Command
	for rows.Next() {
		var c domain.Command
		var typeStr, statusStr string
		var raw []byte
		if err := rows.Scan(&c.ID, &c.DeviceID, &typeStr, &raw, &statusStr, &c.Detail, &c.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan command: %w", err)
		}
		c.Type = domain.CommandType(typeStr)
		c.Status = domain.CommandStatus(statusStr)
		if len(raw) > 0 {
			if err := json.Unmarshal(raw, &c.Params); err != nil {
				return nil, fmt.Errorf("decode command params: %w", err)
			}
		}
		commands = append(commands, &c)
	}
	return commands, rows.Err()
}

// Ack only touches a command of the acking device: an id from another phone matches nothing.
func (q *CommandQueue) Ack(ctx context.Context, deviceID, commandID string, status domain.CommandStatus, detail string) (domain.CommandType, error) {
	var commandType string
	err := q.db.Pool.QueryRow(ctx, `
		UPDATE commands SET status = $1, detail = $2, updated_at = now()
		WHERE id::text = $3 AND device_id = $4
		RETURNING type
	`, string(status), detail, commandID, deviceID).Scan(&commandType)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", nil
	}
	if err != nil {
		return "", fmt.Errorf("ack command: %w", err)
	}
	return domain.CommandType(commandType), nil
}

func (q *CommandQueue) ExpirePending(ctx context.Context, olderThan time.Duration) (int, error) {
	tag, err := q.db.Pool.Exec(ctx, `
		UPDATE commands SET status = 'expired', updated_at = now()
		WHERE status IN ('pending', 'delivered') AND created_at < now() - $1::interval
	`, fmt.Sprintf("%d seconds", int(olderThan.Seconds())))
	if err != nil {
		return 0, fmt.Errorf("expire commands: %w", err)
	}
	return int(tag.RowsAffected()), nil
}
