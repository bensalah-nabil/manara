package domain

import (
	"context"
	"time"
)

// AuditAction is one kind of thing done from a parent account (security.md, item 1: the threat
// model's repudiation risk). The parent reads their own log on the Account page.
type AuditAction string

const (
	AuditSignedIn           AuditAction = "signed_in"
	AuditPasswordReset      AuditAction = "password_reset"
	AuditTwoStepOn          AuditAction = "two_step_on" // also moving to a new authenticator app
	AuditTwoStepOff         AuditAction = "two_step_off"
	AuditAccountChanged     AuditAction = "account_changed"
	AuditPhoneCodeCreated   AuditAction = "phone_code_created"
	AuditRulesChanged       AuditAction = "rules_changed"
	AuditCommandSent        AuditAction = "command_sent"
	AuditPhoneEdited        AuditAction = "phone_edited"
	AuditPhoneRemoved       AuditAction = "phone_removed"
	AuditSetupAccountsClear AuditAction = "setup_accounts_cleared"
	AuditPairingCodeSent    AuditAction = "pairing_code_sent"
	AuditSetupFinished      AuditAction = "setup_finished"
	AuditChangeCancelled    AuditAction = "change_cancelled" // a change waiting out the cooling-off delay
)

// AuditRetention is how long the log is kept, like the phones' own activity (EventRetention).
const AuditRetention = 90 * 24 * time.Hour

// MaxAuditDetail caps the short detail (a command type, which settings changed).
const MaxAuditDetail = 64

// AuditEntry holds what, which phone and when. Never content, location or an IP address.
type AuditEntry struct {
	ParentID string
	// DeviceID is empty for account-wide actions. It is kept after the phone is removed.
	DeviceID string
	Action   AuditAction
	Detail   string
	At       time.Time
}

type AuditLog interface {
	Record(ctx context.Context, entry AuditEntry) error
	// ListForParent returns the newest entries first, at most limit.
	ListForParent(ctx context.Context, parentID string, limit int) ([]AuditEntry, error)
	PurgeOlderThan(ctx context.Context, cutoff time.Time) (int, error)
}

// TrimAuditDetail keeps the detail short and on one line.
func TrimAuditDetail(detail string) string {
	out := make([]rune, 0, len(detail))
	for _, c := range detail {
		if len(out) == MaxAuditDetail {
			break
		}
		if c < ' ' || c == 0x7f {
			c = ' '
		}
		out = append(out, c)
	}
	return string(out)
}
