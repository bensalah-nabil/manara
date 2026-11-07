package domain

import (
	"context"
	"time"
)

type DeviceStatus string

const (
	DeviceStatusReporting      DeviceStatus = "reporting"
	DeviceStatusNotReporting   DeviceStatus = "not_reporting"
	DeviceStatusNeverConnected DeviceStatus = "never_connected"
)

// NotReportingAfter is how long without a heartbeat before a device counts
// as not_reporting (architecture.md §3.3) -- how a deliberately-offline
// phone becomes visible as a fact to the parent, even though its live data
// can't be seen.
const NotReportingAfter = 2 * time.Hour

type DeviceInfo struct {
	Model          string
	Manufacturer   string
	AndroidVersion string
	AgentVersion   string
}

type Device struct {
	ID       string
	ParentID string
	// Label is the child's name, as the parent typed it; Color one of DeviceColors, or "".
	Label         string
	Color         string
	Info          DeviceInfo
	PolicyVersion int
	LastSeen      time.Time // zero value means never
	CreatedAt     time.Time
	// PushToken is the device's current FCM registration token, sent on
	// /agent/sync and refreshed whenever the agent gets a new one from
	// Firebase. Empty means push isn't available for this device yet
	// (agent not updated, Firebase not configured, or just hasn't synced
	// since this field was added) -- callers must treat empty as "fall
	// back to polling," not as an error.
	PushToken string
}

// Status is a pure function of LastSeen and now, not a stored field --
// "not reporting" is a fact derived at query time, not state anyone writes.
func (d Device) Status(now time.Time) DeviceStatus {
	if d.LastSeen.IsZero() {
		return DeviceStatusNeverConnected
	}
	if now.Sub(d.LastSeen) > NotReportingAfter {
		return DeviceStatusNotReporting
	}
	return DeviceStatusReporting
}

// DeviceRepository is the port persistence implements (architecture.md §3:
// "the rules depend on an interface, not on Postgres"). The device token
// itself is not part of this struct -- TokenRepository owns it, kept
// separate so a device's public fields can be read/listed without ever
// handling the bearer credential.
type DeviceRepository interface {
	Create(ctx context.Context, d *Device) error
	FindByID(ctx context.Context, id string) (*Device, error)
	ListByParent(ctx context.Context, parentID string) ([]*Device, error)
	UpdateLastSeen(ctx context.Context, id string, at time.Time) error
	// UpdatePushToken stores the device's latest FCM token. Called on every
	// /agent/sync that includes one -- tokens rotate under Firebase's own
	// control, not just once at enrollment.
	UpdatePushToken(ctx context.Context, id string, token string) error
}

// TokenRepository resolves a bearer token to the device it authenticates --
// kept separate from DeviceRepository so nothing that just wants to read a
// device's info needs to touch credential storage. Hashed at rest by the
// implementation (architecture.md §6 treats device identity as sensitive).
type TokenRepository interface {
	// Issue mints a new token for a device and persists it, replacing any
	// previous one for that device.
	Issue(ctx context.Context, deviceID string) (token string, err error)
	// Resolve returns the device id the token belongs to, or "", false if
	// the token is unknown.
	Resolve(ctx context.Context, token string) (deviceID string, ok bool, err error)
}
