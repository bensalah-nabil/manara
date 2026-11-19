package postgres

import (
	"context"
	"fmt"
	"time"

	"manara/backend/internal/domain"
)

// AuditRepository implements domain.AuditLog.
type AuditRepository struct{ db *DB }

func NewAuditRepository(db *DB) *AuditRepository { return &AuditRepository{db: db} }

func (r *AuditRepository) Record(ctx context.Context, e domain.AuditEntry) error {
	at := e.At
	if at.IsZero() {
		at = time.Now()
	}
	_, err := r.db.Pool.Exec(ctx,
		`INSERT INTO audit_log (parent_id, device_id, action, detail, at) VALUES ($1, $2, $3, $4, $5)`,
		e.ParentID, e.DeviceID, string(e.Action), domain.TrimAuditDetail(e.Detail), at)
	if err != nil {
		return fmt.Errorf("record audit entry: %w", err)
	}
	return nil
}

func (r *AuditRepository) ListForParent(ctx context.Context, parentID string, limit int) ([]domain.AuditEntry, error) {
	rows, err := r.db.Pool.Query(ctx, `
		SELECT device_id, action, detail, at FROM audit_log
		WHERE parent_id = $1 ORDER BY at DESC, id DESC LIMIT $2`, parentID, limit)
	if err != nil {
		return nil, fmt.Errorf("list audit log: %w", err)
	}
	defer rows.Close()
	out := []domain.AuditEntry{}
	for rows.Next() {
		e := domain.AuditEntry{ParentID: parentID}
		var action string
		if err := rows.Scan(&e.DeviceID, &action, &e.Detail, &e.At); err != nil {
			return nil, fmt.Errorf("read audit entry: %w", err)
		}
		e.Action = domain.AuditAction(action)
		out = append(out, e)
	}
	return out, rows.Err()
}

func (r *AuditRepository) PurgeOlderThan(ctx context.Context, cutoff time.Time) (int, error) {
	tag, err := r.db.Pool.Exec(ctx, `DELETE FROM audit_log WHERE at < $1`, cutoff)
	if err != nil {
		return 0, fmt.Errorf("purge audit log: %w", err)
	}
	return int(tag.RowsAffected()), nil
}
