package postgres

import (
	"context"
	"fmt"
	"strings"
	"time"

	"manara/backend/internal/domain"
)

// AdminRepository implements domain.AdminStore. It reads accounts, phones and setup states
// only: no events, policies or anything else a phone reports about a child.
type AdminRepository struct{ db *DB }

func NewAdminRepository(db *DB) *AdminRepository { return &AdminRepository{db: db} }

func (r *AdminRepository) Overview(ctx context.Context, now time.Time, silentAfter time.Duration) (domain.AdminOverview, error) {
	var o domain.AdminOverview
	err := r.db.Pool.QueryRow(ctx, `
		SELECT
			(SELECT count(*) FROM parents),
			(SELECT count(*) FROM parents WHERE totp_secret IS NOT NULL AND totp_secret <> ''),
			(SELECT count(*) FROM parents WHERE created_at > $1::timestamptz - interval '7 days'),
			(SELECT count(*) FROM devices),
			(SELECT count(*) FROM devices WHERE last_seen > $1::timestamptz - interval '24 hours'),
			(SELECT count(*) FROM devices WHERE last_seen IS NULL OR last_seen < $2),
			(SELECT count(*) FROM device_setup WHERE status NOT IN ('done', 'failed')),
			(SELECT count(*) FROM device_setup WHERE status = 'failed')`,
		now, now.Add(-silentAfter)).Scan(
		&o.Accounts, &o.AccountsTwoFA, &o.NewAccounts7d, &o.Phones, &o.PhonesSeen24h,
		&o.SilentPhones, &o.SetupsUnfinished, &o.SetupsFailed)
	if err != nil {
		return o, fmt.Errorf("admin overview: %w", err)
	}
	return o, nil
}

func (r *AdminRepository) Accounts(ctx context.Context, query string, limit int) ([]domain.AdminAccount, error) {
	pattern := "%" + likeEscape(strings.ToLower(strings.TrimSpace(query))) + "%"
	rows, err := r.db.Pool.Query(ctx, `
		SELECT p.id::text, COALESCE(p.email, ''), p.created_at, p.language,
			(p.totp_secret IS NOT NULL AND p.totp_secret <> ''),
			(SELECT count(*) FROM devices d WHERE d.parent_id = p.id),
			(SELECT max(a.at) FROM audit_log a WHERE a.parent_id = p.id AND a.action = $1),
			p.suspended_at
		FROM parents p
		WHERE lower(COALESCE(p.email, '')) LIKE $2 ESCAPE '\'
		ORDER BY p.created_at DESC LIMIT $3`, string(domain.AuditSignedIn), pattern, limit)
	if err != nil {
		return nil, fmt.Errorf("admin accounts: %w", err)
	}
	defer rows.Close()
	out := []domain.AdminAccount{}
	for rows.Next() {
		var a domain.AdminAccount
		if err := rows.Scan(&a.ID, &a.Email, &a.CreatedAt, &a.Language, &a.TwoStep, &a.Phones, &a.LastSignIn, &a.SuspendedAt); err != nil {
			return nil, fmt.Errorf("read admin account: %w", err)
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

func (r *AdminRepository) Phones(ctx context.Context, accountID string, limit int) ([]domain.AdminPhone, error) {
	rows, err := r.db.Pool.Query(ctx, `
		SELECT d.id::text, d.parent_id::text, COALESCE(p.email, ''), d.manufacturer, d.model,
			d.android_version, d.agent_version, d.created_at, d.last_seen,
			COALESCE(s.step, ''), COALESCE(s.status, ''), COALESCE(s.message, ''), s.updated_at
		FROM devices d
		JOIN parents p ON p.id = d.parent_id
		LEFT JOIN device_setup s ON s.device_id = d.id
		WHERE $1 = '' OR d.parent_id::text = $1
		ORDER BY d.last_seen ASC NULLS FIRST LIMIT $2`, accountID, limit)
	if err != nil {
		return nil, fmt.Errorf("admin phones: %w", err)
	}
	defer rows.Close()
	out := []domain.AdminPhone{}
	for rows.Next() {
		var p domain.AdminPhone
		if err := rows.Scan(&p.ID, &p.AccountID, &p.AccountEmail, &p.Manufacturer, &p.Model,
			&p.AndroidVersion, &p.AgentVersion, &p.CreatedAt, &p.LastSeen,
			&p.SetupStep, &p.SetupStatus, &p.SetupMessage, &p.SetupUpdatedAt); err != nil {
			return nil, fmt.Errorf("read admin phone: %w", err)
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

func (r *AdminRepository) RecordAdmin(ctx context.Context, e domain.AdminLogEntry) error {
	at := e.At
	if at.IsZero() {
		at = time.Now()
	}
	_, err := r.db.Pool.Exec(ctx,
		`INSERT INTO admin_log (admin_id, admin_name, action, target, at) VALUES ($1, $2, $3, $4, $5)`,
		e.AdminID, e.AdminName, e.Action, domain.TrimAuditDetail(e.Target), at)
	if err != nil {
		return fmt.Errorf("record admin entry: %w", err)
	}
	return nil
}

func (r *AdminRepository) AdminLog(ctx context.Context, limit int) ([]domain.AdminLogEntry, error) {
	rows, err := r.db.Pool.Query(ctx, `
		SELECT admin_id, admin_name, action, target, at FROM admin_log ORDER BY at DESC, id DESC LIMIT $1`, limit)
	if err != nil {
		return nil, fmt.Errorf("admin log: %w", err)
	}
	defer rows.Close()
	out := []domain.AdminLogEntry{}
	for rows.Next() {
		var e domain.AdminLogEntry
		if err := rows.Scan(&e.AdminID, &e.AdminName, &e.Action, &e.Target, &e.At); err != nil {
			return nil, fmt.Errorf("read admin entry: %w", err)
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

func (r *AdminRepository) PurgeAdminLogOlderThan(ctx context.Context, cutoff time.Time) (int, error) {
	tag, err := r.db.Pool.Exec(ctx, `DELETE FROM admin_log WHERE at < $1`, cutoff)
	if err != nil {
		return 0, fmt.Errorf("purge admin log: %w", err)
	}
	return int(tag.RowsAffected()), nil
}

// likeEscape makes a search typed by an admin match literally, not as a LIKE pattern.
func likeEscape(s string) string {
	return strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(s)
}
