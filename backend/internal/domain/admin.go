package domain

import (
	"context"
	"time"
)

// The admin console (docs/admin-console.md) is for the people who run Manara, not for parents.
// It shows accounts, phones and problems, never what a phone reports about a child: no
// location, no calls, no app usage, no rules. Each request is recorded in the admin log.

// Admin is the signed-in operator, as Microsoft Entra ID names them.
type Admin struct {
	// ID is the Entra object id (oid): stable, unlike a name or an email.
	ID   string
	Name string
}

type AdminOverview struct {
	Accounts         int `json:"accounts"`
	AccountsTwoFA    int `json:"accountsWithTwoStep"`
	NewAccounts7d    int `json:"newAccounts7d"`
	Phones           int `json:"phones"`
	PhonesSeen24h    int `json:"phonesSeen24h"`
	SilentPhones     int `json:"silentPhones"`
	SetupsUnfinished int `json:"setupsUnfinished"`
	SetupsFailed     int `json:"setupsFailed"`
}

type AdminAccount struct {
	ID         string     `json:"id"`
	Email      string     `json:"email"`
	CreatedAt  time.Time  `json:"createdAt"`
	Language   string     `json:"language"`
	TwoStep    bool       `json:"twoStep"`
	Phones     int        `json:"phones"`
	LastSignIn *time.Time `json:"lastSignIn,omitempty"`
	// SuspendedAt is set while an admin has suspended the account.
	SuspendedAt *time.Time `json:"suspendedAt,omitempty"`
}

type AdminPhone struct {
	ID             string     `json:"id"`
	AccountID      string     `json:"accountId"`
	AccountEmail   string     `json:"accountEmail"`
	Manufacturer   string     `json:"manufacturer"`
	Model          string     `json:"model"`
	AndroidVersion string     `json:"androidVersion"`
	AgentVersion   string     `json:"agentVersion"`
	CreatedAt      time.Time  `json:"createdAt"`
	LastSeen       *time.Time `json:"lastSeen,omitempty"`
	SetupStep      string     `json:"setupStep,omitempty"`
	SetupStatus    string     `json:"setupStatus,omitempty"`
	SetupMessage   string     `json:"setupMessage,omitempty"`
	SetupUpdatedAt *time.Time `json:"setupUpdatedAt,omitempty"`
}

type AdminLogEntry struct {
	AdminID   string    `json:"adminId"`
	AdminName string    `json:"adminName"`
	Action    string    `json:"action"`
	Target    string    `json:"target"`
	At        time.Time `json:"at"`
}

// AdminStore reads what the admin console shows, and keeps its own log.
type AdminStore interface {
	Overview(ctx context.Context, now time.Time, silentAfter time.Duration) (AdminOverview, error)
	// Accounts lists the newest first; query, when set, matches part of the email.
	Accounts(ctx context.Context, query string, limit int) ([]AdminAccount, error)
	// Phones lists them by last check-in, oldest first, so the silent ones come first.
	Phones(ctx context.Context, accountID string, limit int) ([]AdminPhone, error)
	RecordAdmin(ctx context.Context, e AdminLogEntry) error
	AdminLog(ctx context.Context, limit int) ([]AdminLogEntry, error)

	// Account is one account, or nil when there is none.
	Account(ctx context.Context, id string) (*AdminAccount, error)
	// PhoneOwner is the account a phone belongs to; found is false for an unknown phone.
	PhoneOwner(ctx context.Context, deviceID string) (accountID, email string, found bool, err error)
	// SetSuspended suspends (ending every session) or reactivates an account.
	SetSuspended(ctx context.Context, accountID string, suspended bool, now time.Time) (found bool, err error)
	// DeleteSetup forgets a phone's guided-setup record, so the parent can start setup again.
	DeleteSetup(ctx context.Context, deviceID string) (found bool, err error)

	// Stats are the dashboard's totals over the last days days.
	Stats(ctx context.Context, now time.Time, days int) (AdminStats, error)
}
