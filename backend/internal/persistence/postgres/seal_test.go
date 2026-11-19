package postgres

import (
	"bytes"
	"context"
	"strings"
	"testing"
	"time"

	"manara/backend/internal/domain"
	"manara/backend/internal/sealed"

	"github.com/google/uuid"
)

func testBox(t *testing.T, fill byte) *sealed.Box {
	t.Helper()
	b, err := sealed.New(bytes.Repeat([]byte{fill}, 32))
	if err != nil {
		t.Fatal(err)
	}
	return b
}

func TestSecretsLocationAndCallsAreSealedAtRestAndStillWork(t *testing.T) {
	plain := testDB(t)
	ctx := context.Background()
	keyed := &DB{Pool: plain.Pool, Box: testBox(t, 7)}

	// Stored plain, before the key existed.
	p := newParent(t, plain, uniqueEmail("sealed"), "a password")
	tf := NewTwoFactorRepository(plain)
	secret, err := tf.BeginSetup(ctx, p.ID)
	if err != nil {
		t.Fatal(err)
	}
	t0 := time.Now()
	if _, err := tf.Enable(ctx, p.ID, codeAt(t, secret, t0), t0); err != nil {
		t.Fatal(err)
	}
	phone := addPhone(t, plain, p.ID)
	oldFix := uuid.NewString()
	if _, err := NewEventStore(plain).Insert(ctx, []*domain.Event{{
		ID: oldFix, DeviceID: phone, Kind: domain.EventKindLocation, OccurredAt: t0,
		Payload: map[string]any{"lat": 36.8065, "lng": 10.1815},
	}}); err != nil {
		t.Fatal(err)
	}

	// The key arrives: older rows are sealed.
	if _, _, err := keyed.SealExisting(ctx); err != nil {
		t.Fatal(err)
	}
	var storedSecret string
	if err := plain.Pool.QueryRow(ctx, `SELECT totp_secret FROM parents WHERE id = $1`, p.ID).Scan(&storedSecret); err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(storedSecret, "v1:") || strings.Contains(storedSecret, secret) {
		t.Fatalf("secret not sealed: %q", storedSecret)
	}
	rawPayload := func(id string) string {
		var raw string
		if err := plain.Pool.QueryRow(ctx, `SELECT payload_json::text FROM events WHERE id = $1`, id).Scan(&raw); err != nil {
			t.Fatal(err)
		}
		return raw
	}
	if raw := rawPayload(oldFix); !strings.Contains(raw, `"sealed"`) || strings.Contains(raw, "36.8") {
		t.Fatalf("old fix not sealed: %s", raw)
	}

	// New rows are sealed as they arrive; usage reports stay plain.
	call, report := uuid.NewString(), uuid.NewString()
	if _, err := NewEventStore(keyed).Insert(ctx, []*domain.Event{
		{ID: call, DeviceID: phone, Kind: domain.EventKindCall, OccurredAt: t0, Payload: map[string]any{"number": "+21698000000"}},
		{ID: report, DeviceID: phone, Kind: domain.EventKindUsageReport, OccurredAt: t0, Payload: map[string]any{"totalMinutes": 5}},
	}); err != nil {
		t.Fatal(err)
	}
	if raw := rawPayload(call); strings.Contains(raw, "98000000") {
		t.Fatalf("call stored plain: %s", raw)
	}
	if raw := rawPayload(report); !strings.Contains(raw, "totalMinutes") {
		t.Fatalf("usage report sealed: %s", raw)
	}

	// Everything still reads with the key, and two-step sign-in still works.
	events, err := NewEventStore(keyed).ListByDevice(ctx, phone, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	byID := map[string]*domain.Event{}
	for _, e := range events {
		byID[e.ID] = e
	}
	if lat, _ := byID[oldFix].Payload["lat"].(float64); lat != 36.8065 {
		t.Fatalf("old fix = %v", byID[oldFix].Payload)
	}
	if n, _ := byID[call].Payload["number"].(string); n != "+21698000000" {
		t.Fatalf("call = %v", byID[call].Payload)
	}
	t1 := t0.Add(30 * time.Second)
	if err := NewTwoFactorRepository(keyed).Check(ctx, p.ID, codeAt(t, secret, t1), t1); err != nil {
		t.Fatalf("sign-in with a sealed secret: %v", err)
	}

	// Without the key, the rest of the list still loads; the sealed rows just stay closed.
	events, err = NewEventStore(plain).ListByDevice(ctx, phone, nil, nil)
	if err != nil || len(events) != 3 {
		t.Fatalf("list without key: %d, %v", len(events), err)
	}

	// The server refuses to start with no key, or the wrong one, once anything is sealed.
	if err := keyed.CheckKey(ctx); err != nil {
		t.Fatalf("right key refused: %v", err)
	}
	if err := (&DB{Pool: plain.Pool, Box: testBox(t, 9)}).CheckKey(ctx); err == nil {
		t.Fatal("wrong key accepted")
	}
	if err := plain.CheckKey(ctx); err == nil {
		t.Fatal("missing key accepted")
	}

	// Running again changes nothing already sealed.
	if _, _, err := keyed.SealExisting(ctx); err != nil {
		t.Fatal(err)
	}
	var again string
	_ = plain.Pool.QueryRow(ctx, `SELECT totp_secret FROM parents WHERE id = $1`, p.ID).Scan(&again)
	if again != storedSecret {
		t.Fatal("an already sealed secret was sealed again")
	}
}
