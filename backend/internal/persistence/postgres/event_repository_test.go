package postgres

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"

	"manara/backend/internal/domain"
)

// A payload Postgres refuses (jsonb can't hold "\u0000") is dropped and accepted, and the rest of
// the batch is stored: one such event once made every later sync of a phone fail.
func TestInsertSkipsAnEventTheDatabaseRefusesAndKeepsTheRest(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	p := newParent(t, db, uniqueEmail("events"), "correct horse battery")
	deviceID := uuid.NewString()
	if err := NewDeviceRepository(db).Create(ctx, &domain.Device{ID: deviceID, ParentID: p.ID, CreatedAt: time.Now()}); err != nil {
		t.Fatal(err)
	}
	bad := &domain.Event{ID: uuid.NewString(), DeviceID: deviceID, Kind: domain.EventKind("app_change"), OccurredAt: time.Now(),
		Payload: map[string]any{"label": "Bad\x00App"}}
	good := &domain.Event{ID: uuid.NewString(), DeviceID: deviceID, Kind: domain.EventKind("app_change"), OccurredAt: time.Now(),
		Payload: map[string]any{"label": "Good App"}}

	result, err := NewEventStore(db).Insert(ctx, []*domain.Event{bad, good})
	if err != nil {
		t.Fatalf("one bad event must not fail the batch: %v", err)
	}
	if len(result.Accepted) != 2 || len(result.Stored) != 1 || result.Stored[0].ID != good.ID {
		t.Fatalf("accepted %v, stored %d", result.Accepted, len(result.Stored))
	}
}
