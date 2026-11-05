package domain

import (
	"context"
	"time"
)

type EventKind string

const (
	EventKindUsage     EventKind = "usage"
	EventKindLocation  EventKind = "location"
	EventKindCall      EventKind = "call"
	EventKindLock      EventKind = "lock"
	EventKindBoot      EventKind = "boot"
	EventKindHeartbeat EventKind = "heartbeat"
	// EventKindEnforcement: a protection on the device is not in effect
	// (payload: enforcer, status failed|missing, optional detail).
	EventKindEnforcement EventKind = "enforcement"
)

// Event mirrors api-spec/openapi.yaml's Event schema. ID is generated ON
// THE DEVICE (architecture.md §2.1/§3.2) -- never assigned here, since
// that's exactly what makes re-sync after a dropped connection safe: the
// store below is idempotent on this id, not on anything the server hands
// out.
type Event struct {
	ID         string
	DeviceID   string
	Kind       EventKind
	OccurredAt time.Time
	Payload    map[string]any
}

// InsertResult separates what the agent may drop locally from what is new.
type InsertResult struct {
	// Accepted is every id from the batch that is now durably stored,
	// including ones that already existed -- just as safe for the agent to
	// drop locally.
	Accepted []string
	// Stored is only the events this call actually added, so a re-sent
	// backlog is never treated as news (alerts must not repeat).
	Stored []*Event
}

// EventStore is the port. Insert must be idempotent on Event.ID
// (architecture.md §3.2) -- a phone re-sending its backlog after a dropped
// connection produces no double-counting.
type EventStore interface {
	// Insert ignores (does not error on) any id already stored.
	Insert(ctx context.Context, events []*Event) (InsertResult, error)
	ListByDevice(ctx context.Context, deviceID string, kind *EventKind, since *time.Time) ([]*Event, error)
}
