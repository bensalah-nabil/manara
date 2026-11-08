package domain

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha1" //nolint:gosec // RFC 6238 TOTP is defined over HMAC-SHA1; authenticator apps expect it.
	"crypto/sha256"
	"encoding/base32"
	"encoding/binary"
	"encoding/hex"
	"errors"
	"fmt"
	"net/url"
	"strings"
	"time"
)

// Two-step sign-in with an authenticator app (capability-plan E2): RFC 6238
// time-based codes, 6 digits every 30 seconds, HMAC-SHA1 (what every
// authenticator app implements). The console controls a child's phone, so a
// leaked password alone must not be enough.

const (
	totpPeriod = 30
	totpDigits = 6
	// RecoveryCodeCount codes, each usable once, for a parent who lost the phone with the app.
	RecoveryCodeCount = 10
	// ChallengeLifetime: time to type the code after the password was accepted.
	ChallengeLifetime = 5 * time.Minute
)

var (
	ErrBadSecondFactor  = errors.New("that code is not right, or was already used")
	ErrTwoFactorPending = errors.New("start two-step sign-in setup first")
	ErrChallengeInvalid = errors.New("this sign-in has expired; enter your password again")
)

var b32 = base32.StdEncoding.WithPadding(base32.NoPadding)

// NewTOTPSecret is 160 random bits, base32 as authenticator apps expect.
func NewTOTPSecret() (string, error) {
	raw := make([]byte, 20)
	if _, err := rand.Read(raw); err != nil {
		return "", fmt.Errorf("generate secret: %w", err)
	}
	return b32.EncodeToString(raw), nil
}

// TOTPCode is the code for one 30-second step (RFC 6238 over RFC 4226).
func TOTPCode(secret []byte, step int64) string {
	var msg [8]byte
	binary.BigEndian.PutUint64(msg[:], uint64(step))
	mac := hmac.New(sha1.New, secret)
	mac.Write(msg[:])
	sum := mac.Sum(nil)
	offset := sum[len(sum)-1] & 0x0f
	value := binary.BigEndian.Uint32(sum[offset:offset+4]) & 0x7fffffff
	return fmt.Sprintf("%0*d", totpDigits, value%1_000_000)
}

// TOTPStep is the 30-second step a moment falls in.
func TOTPStep(now time.Time) int64 { return now.Unix() / totpPeriod }

// VerifyTOTP accepts the code of the current step or one either side (a clock
// a little off), but only a step later than lastStep, so a code that was used
// once, or seen over someone's shoulder, can't be used again.
func VerifyTOTP(secretB32, code string, now time.Time, lastStep int64) (int64, bool) {
	secret, err := b32.DecodeString(strings.ToUpper(strings.TrimSpace(secretB32)))
	if err != nil || len(secret) == 0 {
		return 0, false
	}
	code = strings.ReplaceAll(strings.TrimSpace(code), " ", "")
	if len(code) != totpDigits {
		return 0, false
	}
	current := TOTPStep(now)
	for _, step := range []int64{current - 1, current, current + 1} {
		if step <= lastStep {
			continue
		}
		if hmac.Equal([]byte(TOTPCode(secret, step)), []byte(code)) {
			return step, true
		}
	}
	return 0, false
}

// OTPAuthURI is what the console shows as a QR code for the authenticator app.
func OTPAuthURI(email, secretB32 string) string {
	label := url.PathEscape("Manara:" + email)
	q := url.Values{}
	q.Set("secret", secretB32)
	q.Set("issuer", "Manara")
	q.Set("algorithm", "SHA1")
	q.Set("digits", "6")
	q.Set("period", "30")
	return "otpauth://totp/" + label + "?" + q.Encode()
}

// NewRecoveryCodes are RecoveryCodeCount codes like "K7Q2M-9XWTA", 50 random bits each.
func NewRecoveryCodes() ([]string, error) {
	codes := make([]string, RecoveryCodeCount)
	for i := range codes {
		raw := make([]byte, 7)
		if _, err := rand.Read(raw); err != nil {
			return nil, fmt.Errorf("generate recovery code: %w", err)
		}
		s := b32.EncodeToString(raw)[:10]
		codes[i] = s[:5] + "-" + s[5:]
	}
	return codes, nil
}

// HashRecoveryCode stores a code the way it is compared: case, spaces and the dash ignored.
func HashRecoveryCode(code string) string {
	normal := strings.ToUpper(strings.NewReplacer("-", "", " ", "").Replace(strings.TrimSpace(code)))
	sum := sha256.Sum256([]byte(normal))
	return hex.EncodeToString(sum[:])
}

// LooksLikeRecoveryCode tells a recovery code from a 6-digit app code.
func LooksLikeRecoveryCode(code string) bool {
	return len(strings.NewReplacer("-", "", " ", "").Replace(strings.TrimSpace(code))) == 10
}

// TwoFactorRepository keeps each parent's authenticator secret, recovery codes
// and pending sign-ins.
type TwoFactorRepository interface {
	Enabled(ctx context.Context, parentID string) (bool, error)
	// BeginSetup stores a new secret, not yet in use, and returns it.
	BeginSetup(ctx context.Context, parentID string) (secret string, err error)
	// Enable checks a code against the pending secret, turns two-step sign-in
	// on, and returns fresh recovery codes (the old ones stop working).
	Enable(ctx context.Context, parentID, code string, now time.Time) (recovery []string, err error)
	// Check accepts an app code (each step once) or an unused recovery code (once).
	Check(ctx context.Context, parentID, code string, now time.Time) error
	Disable(ctx context.Context, parentID string) error
	// NewChallenge is the half-done sign-in after the password: a token to send the code with.
	NewChallenge(ctx context.Context, parentID string, now time.Time) (token string, err error)
	// ChallengeParent is the parent of a live challenge; ErrChallengeInvalid otherwise.
	ChallengeParent(ctx context.Context, token string, now time.Time) (parentID string, err error)
	EndChallenge(ctx context.Context, token string) error
}
