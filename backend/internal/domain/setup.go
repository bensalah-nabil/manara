package domain

import (
	"context"
	"errors"
	"regexp"
	"time"
)

// SetupStep is where a phone is in the guided setup. The phone runs a fixed
// list of actions and reports each step; the server never sends commands.
// The only thing the phone reads back is the input it is waiting for, typed
// by the parent in the console (SetupInput, ADR-0005).
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

// SetupSteps is the order the console shows them in. The parent removes the
// Google, Samsung and other accounts before any app is uninstalled: an app's
// data is lost with it, so that is done last, only once nothing else blocks.
var SetupSteps = []SetupStep{
	SetupLinked, SetupPairing, SetupCheckingAccounts, SetupWaitingForAccounts, SetupRemovingAppAccts,
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

// QRPairing is the one-time name and password the phone puts in the
// console's QR code. Android's "Pair device with QR code" reads
// WIFI:T:ADB;S:<name>;P:<password>;; and pairs with that password
// (AOSP Settings AdbQrcodeScannerFragment, AdbDebuggingManager).
type QRPairing struct {
	Name     string `json:"name"`
	Password string `json:"password"`
}

// QRText is what the console's QR code holds.
func (p QRPairing) QRText() string {
	return "WIFI:T:ADB;S:" + p.Name + ";P:" + p.Password + ";;"
}

// Letters and digits only: ';', ':' and ',' have meanings in the QR format.
var (
	pairingName     = regexp.MustCompile(`^manara-[a-z0-9]{4,16}$`)
	pairingPassword = regexp.MustCompile(`^[A-Za-z0-9]{8,32}$`)
	pairingCode     = regexp.MustCompile(`^[0-9]{6}$`)
)

func (p QRPairing) valid() bool {
	return pairingName.MatchString(p.Name) && pairingPassword.MatchString(p.Password)
}

// ValidPairingCode: the six digits Android's "Pair device with pairing code" shows.
func ValidPairingCode(code string) bool { return pairingCode.MatchString(code) }

// SetupReport is what the phone sends after each action.
type SetupReport struct {
	Step    SetupStep
	Status  SetupStatus
	Message string
	// Accounts is nil when this report does not include a fresh account list.
	Accounts []SetupAccount
	// Pairing is set only on a pairing-step report, when the phone starts waiting.
	Pairing *QRPairing
}

// SetupInput is what the parent typed in the console for the phone to read.
type SetupInput struct {
	// PairingCode is the latest code the parent sent; PairingCodeSeq grows with
	// every one, so the phone tries each exactly once.
	PairingCode    string `json:"pairingCode,omitempty"`
	PairingCodeSeq int    `json:"pairingCodeSeq"`
	// Finish: the parent is done signing back in to accounts.
	Finish bool `json:"finish"`
	// EarlierAccounts is what the phone had before an earlier run that did not
	// finish, so a new run still asks to sign back in to all of it.
	EarlierAccounts []SetupAccount `json:"earlierAccounts,omitempty"`
}

// ErrSetupNotWaiting: the phone isn't at the step this input is for.
var ErrSetupNotWaiting = errors.New("setup is not waiting for this input")

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
	// PairingQR is set only while the phone waits to pair.
	PairingQR string `json:"pairingQr,omitempty"`
	// FinishRequested: the parent chose Finish setup (the run is already done); tells the phone to stop watching accounts.
	FinishRequested bool `json:"finishRequested"`
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
	if r.Pairing != nil && (r.Step != SetupPairing || !r.Pairing.valid()) {
		return ErrInvalidSetupReport
	}
	return nil
}

type SetupRepository interface {
	// Report stores the latest step. The first non-nil account list becomes
	// InitialAccounts and is never overwritten by later reports. A report
	// outside the pairing step clears the pairing name, password and code; a
	// report carrying Pairing starts a new setup's inputs.
	Report(ctx context.Context, deviceID string, report SetupReport) (*DeviceSetup, error)
	// Input returns the parent's input for the phone's current step.
	Input(ctx context.Context, deviceID string) (SetupInput, error)
	// SendPairingCode stores a code for a phone in the pairing step, else ErrSetupNotWaiting.
	SendPairingCode(ctx context.Context, deviceID, code string) error
	// RequestFinish ends the reconnect step, else ErrSetupNotWaiting. The run is
	// done at once: by then the phone has nothing left to undo, and it may be off
	// (seen on the SM-A045F: "Finishing..." forever). A finished run is not
	// reopened by a late report of the same run, only by a new run's Pairing.
	RequestFinish(ctx context.Context, deviceID string) error
	// Get returns nil when the device has never reported a setup step.
	Get(ctx context.Context, deviceID string) (*DeviceSetup, error)
	ClearAccounts(ctx context.Context, deviceID string) error
	// ClearAccountsOlderThan empties the account lists of setups last updated before cutoff.
	ClearAccountsOlderThan(ctx context.Context, cutoff time.Time) (int, error)
}
