package domain

import (
	"context"
	"time"
)

type CommandType string

const (
	CommandTypeLockNow         CommandType = "lock_now"
	CommandTypeApplyPolicy     CommandType = "apply_policy"
	CommandTypeRequestLocation CommandType = "request_location"
	CommandTypePing            CommandType = "ping"
)

type CommandStatus string

const (
	CommandStatusPending   CommandStatus = "pending"
	CommandStatusDelivered CommandStatus = "delivered"
	CommandStatusAcked     CommandStatus = "acked"
	CommandStatusFailed    CommandStatus = "failed"
	CommandStatusExpired   CommandStatus = "expired"
)

// CommandExpiry: a command still pending after this long is swept to
// "expired" rather than left pending forever for an offline device
// (architecture.md §3.1's lifecycle: pending -> delivered -> acked|expired).
const CommandExpiry = 24 * time.Hour

type Command struct {
	ID        string
	DeviceID  string
	Type      CommandType
	Params    map[string]any
	Status    CommandStatus
	Detail    string
	CreatedAt time.Time
}

// CommandQueue is the port -- persisted, not in-memory (architecture.md
// §3.1): an offline phone simply hasn't moved its commands past pending.
type CommandQueue interface {
	Enqueue(ctx context.Context, deviceID string, t CommandType, params map[string]any) (*Command, error)
	// PendingForDevice also marks what it returns as delivered -- the
	// agent is about to receive them in the same /agent/sync response.
	PendingForDevice(ctx context.Context, deviceID string) ([]*Command, error)
	Ack(ctx context.Context, commandID string, status CommandStatus, detail string) error
	// ExpirePending moves any command stuck at pending/delivered past
	// CommandExpiry to expired; returns how many it swept.
	ExpirePending(ctx context.Context, olderThan time.Duration) (int, error)
}
