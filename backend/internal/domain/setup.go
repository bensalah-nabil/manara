package domain

import (
	"context"
	"errors"
	"time"
)

// SetupStep is where a phone is in the guided setup. The phone runs a fixed
// list of actions and reports each step; the server never sends commands.
type SetupStep string

const (
	SetupLinked             SetupStep = "linked"
	SetupPairing            SetupStep = "pairing"
	SetupCheckingAccounts   SetupStep = "checking_accounts"
	SetupRemovingAppAccts   SetupStep = "removing_app_accounts"
	SetupWaitingForAccounts SetupStep = "waiting_for_accounts"
	SetupDeviceOwner        SetupStep = "device_owner"
	SetupRestoringApps      SetupStep = "restoring_apps"
	SetupReconnecting       SetupStep = "reconnecting"
	SetupDone               SetupStep = "done"
)

// SetupSteps is the order the console shows them in.
var SetupSteps = []SetupStep{
	SetupLinked, SetupPairing, SetupCheckingAccounts, SetupRemovingAppAccts, SetupWaitingForAccounts,
	SetupDeviceOwner, SetupRestoringApps, SetupReconnecting, SetupDone,
}

type SetupStatus string

const (
	SetupInProgress       SetupStatus = "in_progress"
	SetupWaitingForParent SetupStatus = "waiting_for_parent"
	SetupFailed           SetupStatus = "failed"
	SetupFinished         SetupStatus = "done"
)

// SetupAccount is one account seen on the phone. Names and types only: never
// a password or token (none is readable anyway).
type SetupAccount struct {
	Type string `json:"type"`
	Name string `json:"name"`
}

// SetupReport is what the phone sends after each action.
type SetupReport struct {
	Step    SetupStep
	Status  SetupStatus
	Message string
	// Accounts is nil when this report does not include a fresh account list.
	Accounts []SetupAccount
}

type DeviceSetup struct {
	DeviceID string      `json:"deviceId"`
	Step     SetupStep   `json:"step"`
	Status   SetupStatus `json:"status"`
	Message  string      `json:"message"`
	// InitialAccounts is the first list the phone reported, kept as the
	// parent's reconnect checklist; CurrentAccounts is the latest one.
	InitialAccounts []SetupAccount `json:"initialAccounts"`
	CurrentAccounts []SetupAccount `json:"currentAccounts"`
	StartedAt       time.Time      `json:"startedAt"`
	UpdatedAt       time.Time      `json:"updatedAt"`
}

// SetupAccountRetention: the account lists are personal data needed only to
// guide the parent, so they are cleared this long after the last update.
const SetupAccountRetention = 7 * 24 * time.Hour

const (
	maxSetupMessage  = 300
	maxSetupAccounts = 100
	maxAccountField  = 200
)

var ErrInvalidSetupReport = errors.New("invalid setup report")

func knownStep(s SetupStep) bool {
	for _, step := range SetupSteps {
		if step == s {
			return true
		}
	}
	return false
}

func (r SetupReport) Validate() error {
	if !knownStep(r.Step) {
		return ErrInvalidSetupReport
	}
	switch r.Status {
	case SetupInProgress, SetupWaitingForParent, SetupFailed, SetupFinished:
	default:
		return ErrInvalidSetupReport
	}
	if (r.Step == SetupDone) != (r.Status == SetupFinished) {
		return ErrInvalidSetupReport
	}
	if len(r.Message) > maxSetupMessage || len(r.Accounts) > maxSetupAccounts {
		return ErrInvalidSetupReport
	}
	for _, a := range r.Accounts {
		if a.Type == "" || len(a.Type) > maxAccountField || len(a.Name) > maxAccountField {
			return ErrInvalidSetupReport
		}
	}
	return nil
}

type SetupRepository interface {
	// Report stores the latest step. The first non-nil account list becomes
	// InitialAccounts and is never overwritten by later reports.
	Report(ctx context.Context, deviceID string, report SetupReport) (*DeviceSetup, error)
	// Get returns nil when the device has never reported a setup step.
	Get(ctx context.Context, deviceID string) (*DeviceSetup, error)
	ClearAccounts(ctx context.Context, deviceID string) error
	// ClearAccountsOlderThan empties the account lists of setups last updated before cutoff.
	ClearAccountsOlderThan(ctx context.Context, cutoff time.Time) (int, error)
}
