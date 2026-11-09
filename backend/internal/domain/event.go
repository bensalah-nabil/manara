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
	// EventKindUsageReport: a snapshot of today's minutes per app, sent only
	// while the policy's usageReport is on (payload: date, totalMinutes, apps).
	EventKindUsageReport EventKind = "usage_report"
)

// UsageReportRetention is how long usage_report events are kept (capability-plan G2).
const UsageReportRetention = 30 * 24 * time.Hour

// LocationRetention is how long location fixes are kept.
const LocationRetention = 30 * 24 * time.Hour

// CallRetention is how long call events are kept (ADR-0008).
const CallRetention = 30 * 24 * time.Hour

// EventRetention is how long every other kind of event is kept: limit hits,
// protection reports, locks.
const EventRetention = 90 * 24 * time.Hour

// AllEventKinds lists every kind, so retention can't miss one.
var AllEventKinds = []EventKind{
	EventKindUsage, EventKindLocation, EventKindCall, EventKindLock, EventKindBoot,
	EventKindHeartbeat, EventKindEnforcement, EventKindUsageReport,
}

// RetentionFor is how long events of a kind are kept before the sweep deletes them.
// Nothing collected is kept indefinitely (capability-plan G2; the privacy policy states these).
func RetentionFor(kind EventKind) time.Duration {
	switch kind {
	case EventKindUsageReport:
		return UsageReportRetention
	case EventKindLocation:
		return LocationRetention
	case EventKindCall:
		return CallRetention
	default:
		return EventRetention
	}
}

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
	// PurgeOlderThan deletes events of one kind that occurred before the
	// cutoff and returns how many it removed.
	PurgeOlderThan(ctx context.Context, kind EventKind, cutoff time.Time) (int, error)
}
