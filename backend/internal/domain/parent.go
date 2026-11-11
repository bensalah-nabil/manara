package domain

import (
	"context"
	"errors"
	"time"
)

// roadmap.md puts "Parent auth / account model" under Phase 3 on
// purpose — this is where that actually gets built, not invented ad hoc
// earlier to unblock Phase 2 testing (see `cmd/manara-server`'s `-seed`
// flag, kept around as a dev shortcut, not something real signup
// replaces behind the scenes).

var ErrEmailTaken = errors.New("email already registered")
var ErrInvalidCredentials = errors.New("invalid email or password")

type Parent struct {
	ID           string
	Email        string
	PasswordHash string // bcrypt -- see AuthRepository.SignUp; never compared directly
	// Language is what the console and emails are written in for this parent.
	Language  string
	CreatedAt time.Time
}

type ParentRepository interface {
	Create(ctx context.Context, p *Parent) error
	FindByID(ctx context.Context, id string) (*Parent, error)
	// SetLanguage stores one of Languages for the parent.
	SetLanguage(ctx context.Context, id, language string) error
}

// DefaultLanguage is what an account has until the parent chooses.
const DefaultLanguage = "en"

// Languages the console and the emails are written in.
var Languages = map[string]bool{"en": true, "fr": true, "ar": true}

var ErrUnknownLanguage = errors.New("language must be en, fr or ar")

// NormalizeLanguage returns a supported language, or DefaultLanguage.
func NormalizeLanguage(language string) string {
	if Languages[language] {
		return language
	}
	return DefaultLanguage
}

// AuthRepository owns password hashing/verification -- kept separate from
// ParentRepository so nothing that just reads a parent's profile needs to
// touch credential logic. bcrypt here, deliberately NOT the fast SHA-256
// TokenRepository/ParentSessionRepository use: those hash high-entropy
// random tokens (brute force is already infeasible regardless of hash
// speed), this hashes a user-chosen password (where slow, deliberately
// expensive hashing is the actual defense) -- different threat model,
// different algorithm, not just a style choice.
type AuthRepository interface {
	// SignUp creates the parent and stores the hash in one call; returns
	// ErrEmailTaken if the email is already registered.
	SignUp(ctx context.Context, email, password string) (*Parent, error)
	// Login verifies the password against the stored hash; returns
	// ErrInvalidCredentials for either an unknown email or a wrong
	// password -- never reveal which, to anyone timing responses.
	Login(ctx context.Context, email, password string) (*Parent, error)
}

// ParentSessionRepository authenticates `parentSession` bearer tokens
// (api-spec/openapi.yaml) -- same hash-at-rest shape as TokenRepository
// for devices, kept as a separate type since a parent session and a
// device's own bearer token are different credentials with different
// lifetimes, not interchangeable just because the storage pattern matches.
type ParentSessionRepository interface {
	Issue(ctx context.Context, parentID string) (token string, err error)
	// Resolve is false for an unknown, revoked or expired (SessionLifetime) token.
	Resolve(ctx context.Context, token string) (parentID string, ok bool, err error)
	// Revoke ends a session on the server: signing out must not leave a token
	// that still works if it was copied.
	Revoke(ctx context.Context, token string) error
}

// SessionLifetime is how long a sign-in lasts. The console holds the keys to a
// child's phone, so a forgotten browser tab must not stay signed in for ever.
const SessionLifetime = 30 * 24 * time.Hour

// EnrollmentTokenRepository: single-use, per api-spec/openapi.yaml's own
// description ("one-time enrollment token"). Consume both validates and
// invalidates it in the same call, so a token can't be replayed if a
// response is somehow intercepted or retried.
// EnrollmentTokenLifetime: a connection code not used within a day stops
// working, so one shown on a screen or in a photo isn't valid for ever.
const EnrollmentTokenLifetime = 24 * time.Hour

type EnrollmentTokenRepository interface {
	// Create stores the attestation with the token; nil is only for the -seed dev shortcut.
	Create(ctx context.Context, parentID string, attestation *GuardianAttestation) (token string, err error)
	// Consume returns the parent id the token belonged to and marks it
	// used; ok is false for an unknown or already-used token.
	Consume(ctx context.Context, token string) (parentID string, ok bool, err error)
}

// AttestationVersion names the wording the parent confirmed. The console sends
// the version it showed; a mismatch means the text changed and must be re-read.
const AttestationVersion = "2026-11-06"

// GuardianAttestation is what a parent confirms before getting an enrollment
// code (legal-and-ethics.md: own minor child's device, visible to the child).
// Recorded as stated, not verified; verification is future work.
type GuardianAttestation struct {
	ParentOrGuardian bool
	MinorChild       bool
	ChildInformed    bool
	Version          string
	PhoneBrand       string
}

var ErrAttestationIncomplete = errors.New("all three statements must be confirmed")
var ErrAttestationOutdated = errors.New("the statement text has changed; reload and confirm again")
var ErrUnknownPhoneBrand = errors.New("unknown phone brand")

// PhoneBrands are the how-to guides the console offers; "other" covers the rest.
// An empty brand is accepted: the console no longer asks, and the phone reports
// its maker when it connects (DeviceInfo.Manufacturer).
var PhoneBrands = map[string]bool{
	"samsung": true, "google": true, "xiaomi": true, "oppo-realme": true,
	"oneplus": true, "motorola": true, "other": true,
}

func (a GuardianAttestation) Validate() error {
	if !a.ParentOrGuardian || !a.MinorChild || !a.ChildInformed {
		return ErrAttestationIncomplete
	}
	if a.Version != AttestationVersion {
		return ErrAttestationOutdated
	}
	if a.PhoneBrand != "" && !PhoneBrands[a.PhoneBrand] {
		return ErrUnknownPhoneBrand
	}
	return nil
}
