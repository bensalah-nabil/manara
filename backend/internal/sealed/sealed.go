// Package sealed encrypts the most sensitive values before they reach the database (security.md,
// item 4): authenticator secrets, and the location and call events. Neon's disk encryption covers a
// stolen disk; this covers a leaked database or backup, as long as the key (DATA_KEY on the server)
// is not leaked with it.
//
// AES-256-GCM with a random nonce. Each value is bound to its row (the additional data: an event id,
// a parent id), so a sealed value copied to another row does not open.
package sealed

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"
)

// prefix marks a sealed value and its format version.
const prefix = "v1:"

// ErrNoKey is returned when a sealed value is read but the server has no key.
var ErrNoKey = errors.New("sealed value but no DATA_KEY on this server")

// Box seals and opens values. A nil *Box seals nothing and opens only plain values: the server
// then runs as before, and says so in its log.
type Box struct{ aead cipher.AEAD }

// New takes a 32-byte key.
func New(key []byte) (*Box, error) {
	if len(key) != 32 {
		return nil, fmt.Errorf("key must be 32 bytes, got %d", len(key))
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	return &Box{aead: aead}, nil
}

// FromBase64 reads DATA_KEY: 32 random bytes in standard base64 (`openssl rand -base64 32`).
func FromBase64(s string) (*Box, error) {
	key, err := base64.StdEncoding.DecodeString(strings.TrimSpace(s))
	if err != nil {
		return nil, fmt.Errorf("key is not base64: %w", err)
	}
	return New(key)
}

// IsSealed says whether a stored value is sealed rather than plain.
func IsSealed(stored string) bool { return strings.HasPrefix(stored, prefix) }

// Seal returns the value to store. With no key, the plain value.
func (b *Box) Seal(plain []byte, row string) (string, error) {
	if b == nil {
		return string(plain), nil
	}
	nonce := make([]byte, b.aead.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return "", fmt.Errorf("nonce: %w", err)
	}
	out := b.aead.Seal(nonce, nonce, plain, []byte(row))
	return prefix + base64.RawStdEncoding.EncodeToString(out), nil
}

// Open returns the plain value from what was stored: a sealed value is opened, a plain one (stored
// before the key existed) is returned as it is.
func (b *Box) Open(stored, row string) ([]byte, error) {
	if !IsSealed(stored) {
		return []byte(stored), nil
	}
	if b == nil {
		return nil, ErrNoKey
	}
	raw, err := base64.RawStdEncoding.DecodeString(strings.TrimPrefix(stored, prefix))
	if err != nil {
		return nil, fmt.Errorf("sealed value is not base64: %w", err)
	}
	n := b.aead.NonceSize()
	if len(raw) < n {
		return nil, errors.New("sealed value too short")
	}
	plain, err := b.aead.Open(nil, raw[:n], raw[n:], []byte(row))
	if err != nil {
		return nil, fmt.Errorf("open sealed value: %w", err)
	}
	return plain, nil
}
