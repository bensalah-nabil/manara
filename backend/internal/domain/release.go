package domain

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/binary"
	"errors"
	"fmt"
	"time"
)

// A phone leaves a parent's account only when that parent releases it: a
// release command from the console, or, when the phone can't be reached, a
// release code the parent reads from the console and types on the phone.
// The phone checks the code itself, from a secret it received at enrollment,
// so the code also works with no connection at all.

// ReleaseMode is what the phone does once released.
type ReleaseMode string

const (
	// ReleaseRemove lifts every rule, stops Manara managing the phone and clears its data.
	ReleaseRemove ReleaseMode = "remove"
	// ReleaseTransfer keeps the phone set up and its current rules, and lets it
	// join another parent account for TransferWindow.
	ReleaseTransfer ReleaseMode = "transfer"
)

const TransferWindow = 30 * time.Minute

var ErrUnknownReleaseMode = errors.New("release mode must be remove or transfer")

func (m ReleaseMode) Validate() error {
	if m != ReleaseRemove && m != ReleaseTransfer {
		return ErrUnknownReleaseMode
	}
	return nil
}

const (
	ReleaseSecretBytes = 32
	ReleaseCodeDigits  = 8
	// ReleaseCodeStep is how long one code lasts. The phone also accepts the
	// previous and next step, for clock drift between the phone and the server.
	ReleaseCodeStep = 10 * time.Minute
)

func NewReleaseSecret() ([]byte, error) {
	secret := make([]byte, ReleaseSecretBytes)
	if _, err := rand.Read(secret); err != nil {
		return nil, fmt.Errorf("generate release secret: %w", err)
	}
	return secret, nil
}

// ReleaseRepository keeps each phone's release secret and removes a released phone.
type ReleaseRepository interface {
	// Secret returns the phone's secret, creating one for a phone enrolled before
	// release codes existed, and whether the phone has confirmed it holds it.
	Secret(ctx context.Context, deviceID string) (secret []byte, confirmed bool, err error)
	Confirm(ctx context.Context, deviceID string) error
	// Delete removes the phone and everything stored about it.
	Delete(ctx context.Context, deviceID string) error
}

// HOTP is RFC 4226 with HMAC-SHA256, as RFC 6238 allows.
func HOTP(secret []byte, counter uint64, digits int) string {
	var msg [8]byte
	binary.BigEndian.PutUint64(msg[:], counter)
	mac := hmac.New(sha256.New, secret)
	mac.Write(msg[:])
	sum := mac.Sum(nil)
	offset := sum[len(sum)-1] & 0x0f
	value := binary.BigEndian.Uint32(sum[offset:offset+4]) & 0x7fffffff
	mod := uint32(1)
	for range digits {
		mod *= 10
	}
	return fmt.Sprintf("%0*d", digits, value%mod)
}

// ReleaseCode is the code valid at t, and the time it stops being shown.
func ReleaseCode(secret []byte, t time.Time) (code string, validUntil time.Time) {
	step := int64(ReleaseCodeStep / time.Second)
	counter := t.Unix() / step
	return HOTP(secret, uint64(counter), ReleaseCodeDigits), time.Unix((counter+1)*step, 0).UTC()
}
