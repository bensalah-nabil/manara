package postgres

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"manara/backend/internal/domain"
)

// CheckKey refuses to go on when sealed data exists that this server can't open: DATA_KEY missing,
// or not the key it was sealed with. Better to stop at start than to fail every sign-in and hide
// every location later.
func (db *DB) CheckKey(ctx context.Context) error {
	var parentID, secret string
	err := db.Pool.QueryRow(ctx, `
		SELECT id::text, totp_secret FROM parents WHERE totp_secret LIKE 'v1:%' LIMIT 1`).Scan(&parentID, &secret)
	if err == nil {
		if _, err := db.Box.Open(secret, totpRow(parentID)); err != nil {
			return fmt.Errorf("DATA_KEY does not open the stored authenticator secrets: %w", err)
		}
		return nil
	}
	var id string
	var raw []byte
	err = db.Pool.QueryRow(ctx, `
		SELECT id::text, payload_json FROM events WHERE payload_json ? 'sealed' LIMIT 1`).Scan(&id, &raw)
	if err == nil {
		var wrapped sealedPayload
		if err := json.Unmarshal(raw, &wrapped); err != nil {
			return fmt.Errorf("read sealed event: %w", err)
		}
		if _, err := db.Box.Open(wrapped.Sealed, eventRow(id)); err != nil {
			return fmt.Errorf("DATA_KEY does not open the stored events: %w", err)
		}
	}
	return nil // nothing sealed yet
}

// SealExisting seals what was stored plain before DATA_KEY was set. Safe at every start: a sealed
// value is left alone, and each update checks the row is still the one read.
func (db *DB) SealExisting(ctx context.Context) (secrets, events int, err error) {
	if db.Box == nil {
		return 0, 0, errors.New("no DATA_KEY")
	}
	rows, err := db.Pool.Query(ctx, `
		SELECT id::text, totp_secret, totp_pending FROM parents
		WHERE (totp_secret IS NOT NULL AND totp_secret NOT LIKE 'v1:%')
		   OR (totp_pending IS NOT NULL AND totp_pending NOT LIKE 'v1:%')`)
	if err != nil {
		return 0, 0, fmt.Errorf("find plain secrets: %w", err)
	}
	type plainSecret struct {
		id              string
		secret, pending *string
	}
	var found []plainSecret
	for rows.Next() {
		var p plainSecret
		if err := rows.Scan(&p.id, &p.secret, &p.pending); err != nil {
			rows.Close()
			return 0, 0, fmt.Errorf("read plain secret: %w", err)
		}
		found = append(found, p)
	}
	rows.Close()
	seal := func(id string, v *string) (*string, error) {
		if v == nil || isSealedText(*v) {
			return v, nil
		}
		s, err := db.Box.Seal([]byte(*v), totpRow(id))
		return &s, err
	}
	for _, p := range found {
		secret, err := seal(p.id, p.secret)
		if err != nil {
			return secrets, 0, err
		}
		pending, err := seal(p.id, p.pending)
		if err != nil {
			return secrets, 0, err
		}
		tag, err := db.Pool.Exec(ctx, `
			UPDATE parents SET totp_secret = $2, totp_pending = $3
			WHERE id = $1 AND totp_secret IS NOT DISTINCT FROM $4 AND totp_pending IS NOT DISTINCT FROM $5`,
			p.id, secret, pending, p.secret, p.pending)
		if err != nil {
			return secrets, 0, fmt.Errorf("seal secret: %w", err)
		}
		secrets += int(tag.RowsAffected())
	}

	kinds := make([]string, 0, len(sealedKinds))
	for k := range sealedKinds {
		kinds = append(kinds, string(k))
	}
	store := &EventStore{db: db}
	for {
		rows, err := db.Pool.Query(ctx, `
			SELECT id::text, kind, payload_json FROM events
			WHERE kind = ANY($1) AND payload_json IS NOT NULL AND NOT (payload_json ? 'sealed')
			LIMIT 500`, kinds)
		if err != nil {
			return secrets, events, fmt.Errorf("find plain events: %w", err)
		}
		type plainEvent struct {
			id, kind string
			raw      []byte
		}
		var batch []plainEvent
		for rows.Next() {
			var e plainEvent
			if err := rows.Scan(&e.id, &e.kind, &e.raw); err != nil {
				rows.Close()
				return secrets, events, fmt.Errorf("read plain event: %w", err)
			}
			batch = append(batch, e)
		}
		rows.Close()
		if len(batch) == 0 {
			return secrets, events, nil
		}
		for _, e := range batch {
			sealedRaw, err := store.sealPayload(e.id, domain.EventKind(e.kind), e.raw)
			if err != nil {
				return secrets, events, err
			}
			tag, err := db.Pool.Exec(ctx,
				`UPDATE events SET payload_json = $2 WHERE id = $1 AND NOT (payload_json ? 'sealed')`, e.id, sealedRaw)
			if err != nil {
				return secrets, events, fmt.Errorf("seal event: %w", err)
			}
			events += int(tag.RowsAffected())
		}
	}
}

func isSealedText(s string) bool { return len(s) > 3 && s[:3] == "v1:" }
