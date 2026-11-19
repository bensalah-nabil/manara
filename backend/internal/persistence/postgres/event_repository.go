package postgres

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"time"

	"manara/backend/internal/domain"
)

type EventStore struct {
	db *DB
}

func NewEventStore(db *DB) *EventStore {
	return &EventStore{db: db}
}

// Insert is idempotent on Event.ID (architecture.md §3.2) via ON CONFLICT
// DO NOTHING -- a re-sent backlog after a dropped connection produces no
// double-counting. Every id in the input is accepted, whether it was
// actually inserted or already existed: either way it's durably stored
// now, so the agent can safely drop it locally (that's the whole point).
// Only the rows this call really added come back as Stored.
func (s *EventStore) Insert(ctx context.Context, events []*domain.Event) (domain.InsertResult, error) {
	var result domain.InsertResult
	result.Accepted = make([]string, 0, len(events))
	for _, e := range events {
		raw, err := json.Marshal(e.Payload)
		if err != nil {
			return domain.InsertResult{}, fmt.Errorf("encode event payload: %w", err)
		}
		if raw, err = s.sealPayload(e.ID, e.Kind, raw); err != nil {
			return domain.InsertResult{}, err
		}
		tag, err := s.db.Pool.Exec(ctx, `
			INSERT INTO events (id, device_id, kind, occurred_at, payload_json, received_at)
			VALUES ($1, $2, $3, $4, $5, now())
			ON CONFLICT (id) DO NOTHING
		`, e.ID, e.DeviceID, string(e.Kind), e.OccurredAt, raw)
		if err != nil {
			return domain.InsertResult{}, fmt.Errorf("insert event %s: %w", e.ID, err)
		}
		result.Accepted = append(result.Accepted, e.ID)
		if tag.RowsAffected() == 1 {
			result.Stored = append(result.Stored, e)
		}
	}
	return result, nil
}

func (s *EventStore) PurgeOlderThan(ctx context.Context, kind domain.EventKind, cutoff time.Time) (int, error) {
	tag, err := s.db.Pool.Exec(ctx, `DELETE FROM events WHERE kind = $1 AND occurred_at < $2`, string(kind), cutoff)
	if err != nil {
		return 0, fmt.Errorf("purge events: %w", err)
	}
	return int(tag.RowsAffected()), nil
}

func (s *EventStore) ListByDevice(ctx context.Context, deviceID string, kind *domain.EventKind, since *time.Time) ([]*domain.Event, error) {
	query := `SELECT id, device_id, kind, occurred_at, payload_json FROM events WHERE device_id = $1`
	args := []any{deviceID}

	if kind != nil {
		args = append(args, string(*kind))
		query += fmt.Sprintf(" AND kind = $%d", len(args))
	}
	if since != nil {
		args = append(args, *since)
		query += fmt.Sprintf(" AND occurred_at >= $%d", len(args))
	}
	query += " ORDER BY occurred_at DESC"

	rows, err := s.db.Pool.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("list events: %w", err)
	}
	defer rows.Close()

	var events []*domain.Event
	for rows.Next() {
		var e domain.Event
		var kindStr string
		var raw []byte
		if err := rows.Scan(&e.ID, &e.DeviceID, &kindStr, &e.OccurredAt, &raw); err != nil {
			return nil, fmt.Errorf("scan event: %w", err)
		}
		e.Kind = domain.EventKind(kindStr)
		if raw, err = s.openPayload(e.ID, raw); err != nil {
			// One unreadable row (no key, or the wrong one) must not hide the rest.
			log.Printf("events: %s payload not opened: %v", e.ID, err)
			raw = nil
		}
		if len(raw) > 0 {
			if err := json.Unmarshal(raw, &e.Payload); err != nil {
				return nil, fmt.Errorf("decode event payload: %w", err)
			}
		}
		events = append(events, &e)
	}
	return events, rows.Err()
}

// sealedKinds are the events sealed at rest: where the child was, and whom they called.
var sealedKinds = map[domain.EventKind]bool{domain.EventKindLocation: true, domain.EventKindCall: true}

// sealedPayload is how a sealed payload sits in the JSONB column.
type sealedPayload struct {
	Sealed string `json:"sealed"`
}

func eventRow(id string) string { return "event:" + id }

func (s *EventStore) sealPayload(id string, kind domain.EventKind, raw []byte) ([]byte, error) {
	if s.db.Box == nil || !sealedKinds[kind] {
		return raw, nil
	}
	stored, err := s.db.Box.Seal(raw, eventRow(id))
	if err != nil {
		return nil, fmt.Errorf("seal event %s: %w", id, err)
	}
	return json.Marshal(sealedPayload{Sealed: stored})
}

func (s *EventStore) openPayload(id string, raw []byte) ([]byte, error) {
	var wrapped sealedPayload
	if len(raw) == 0 || json.Unmarshal(raw, &wrapped) != nil || wrapped.Sealed == "" {
		return raw, nil // a plain payload
	}
	return s.db.Box.Open(wrapped.Sealed, eventRow(id))
}
