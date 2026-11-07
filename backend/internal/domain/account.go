package domain

import (
	"context"
	"errors"
	"strings"
	"time"
	"unicode/utf8"
)

// MinPasswordRunes is the shortest password a parent may choose. NIST SP 800-63B
// asks for at least 8 characters and no composition rules; the console's own
// account controls a child's phone, so this is a floor, not a target.
const MinPasswordRunes = 8

// MaxPasswordBytes is bcrypt's limit: golang.org/x/crypto/bcrypt refuses longer
// input (ErrPasswordTooLong) rather than silently ignoring the rest.
const MaxPasswordBytes = 72

var ErrPasswordTooShort = errors.New("password must be at least 8 characters")
var ErrPasswordTooLong = errors.New("password must be at most 72 bytes")

// ValidatePassword checks a new password (sign-up or reset). Existing
// passwords are never re-checked, so an older account still logs in.
func ValidatePassword(p string) error {
	if utf8.RuneCountInString(p) < MinPasswordRunes {
		return ErrPasswordTooShort
	}
	if len(p) > MaxPasswordBytes {
		return ErrPasswordTooLong
	}
	return nil
}

// NormalizeEmail is how an address is compared and stored: trimmed and
// lowercased, so "Sara@X.com " and "sara@x.com" are one account.
func NormalizeEmail(email string) string {
	return strings.ToLower(strings.TrimSpace(email))
}

// Mailer sends one plain-text email. Best-effort for alerts; a reset request
// that fails to send is logged, never reported to the requester (that would
// tell them whether the address has an account).
type Mailer interface {
	Send(ctx context.Context, to, subject, text string) error
}

// PasswordResetTTL is how long a reset link works. One hour, single use.
const PasswordResetTTL = time.Hour

// PasswordResetCooldown stops one address from being mailed in a loop.
const PasswordResetCooldown = time.Minute

var ErrResetTokenInvalid = errors.New("this reset link is invalid, used, or expired")

// PasswordResetRepository stores reset tokens hashed, like sessions: only the
// emailed link carries the token itself.
type PasswordResetRepository interface {
	// Create makes a token for the parent with this (normalized) email. ok is
	// false when there is no such parent, or one was made within the cooldown.
	Create(ctx context.Context, email string, ttl, cooldown time.Duration) (token string, ok bool, err error)
	// Consume sets the new password, marks the token used, and ends every
	// session of that parent, all in one transaction. ErrResetTokenInvalid
	// for an unknown, used or expired token.
	Consume(ctx context.Context, token, newPassword string) (parentID string, err error)
}

var ErrDevicesRemain = errors.New("release or remove every phone before deleting the account")

// AccountRepository is the parent's own account: checking their password
// again before something irreversible, and deleting everything.
type AccountRepository interface {
	CheckPassword(ctx context.Context, parentID, password string) (bool, error)
	// Delete removes the parent and, by ON DELETE CASCADE, every device,
	// policy, event, command, session and token. ErrDevicesRemain while any
	// device is still on the account: deleting would leave a child's phone
	// managed with no parent able to release it.
	Delete(ctx context.Context, parentID string) error
}

// ResetEmail is the text of a password-reset email. It names no child and no
// phone, since anyone can ask for one to be sent to an address.
func ResetEmail(link string) (subject, text string) {
	return "Reset your Manara password",
		"Someone asked to reset the password of the Manara account for this email address.\n\n" +
			"To choose a new password, open this link within one hour:\n" + link + "\n\n" +
			"If it wasn't you, ignore this email: your password stays the same.\n"
}

// SilentAfterDefault is when a phone that stopped checking in is worth an
// alert. Longer than a night with the phone switched off, shorter than a day.
const SilentAfterDefault = 12 * time.Hour

// SilenceRepository finds silent phones and remembers which were alerted, so
// one silence is one alert, however many times the watcher runs.
type SilenceRepository interface {
	// Silent lists devices last seen before cutoff, not yet alerted since then.
	// Never-connected devices are not listed: nothing has gone quiet.
	Silent(ctx context.Context, cutoff time.Time) ([]*Device, error)
	MarkAlerted(ctx context.Context, deviceID string, at time.Time) error
}

// SilenceAlert is the alert for a phone that stopped checking in.
func SilenceAlert(d *Device) Alert {
	return Alert{
		ParentID: d.ParentID,
		DeviceID: d.ID,
		Title:    deviceName(d) + " has stopped checking in",
		Message: "Manara on " + deviceName(d) + " last checked in " + d.LastSeen.UTC().Format("2006-01-02 15:04") + " UTC. " +
			"The phone may be off, out of battery or offline. If it is on and online, Manara may have been stopped: " +
			"check the phone. If you released it with a release code, remove it from your list in the console. " +
			"You get this once per silence.",
		OccurredAt: d.LastSeen,
	}
}

// SilenceWatcher sends one alert per silent phone. Run it on a timer.
type SilenceWatcher struct {
	Repo     SilenceRepository
	Notifier AlertNotifier
	After    time.Duration
	Now      func() time.Time
}

// Check alerts every phone silent for longer than After. A delivery failure
// leaves the phone unmarked, so the next run tries again.
func (w *SilenceWatcher) Check(ctx context.Context) (alerted int, err error) {
	now := w.Now()
	devices, err := w.Repo.Silent(ctx, now.Add(-w.After))
	if err != nil {
		return 0, err
	}
	var errs []error
	for _, d := range devices {
		if err := w.Notifier.Send(ctx, SilenceAlert(d)); err != nil {
			errs = append(errs, err)
			continue
		}
		if err := w.Repo.MarkAlerted(ctx, d.ID, now); err != nil {
			errs = append(errs, err)
			continue
		}
		alerted++
	}
	return alerted, errors.Join(errs...)
}
