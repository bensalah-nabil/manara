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
	CreatedAt    time.Time
}

type ParentRepository interface {
	Create(ctx context.Context, p *Parent) error
	FindByID(ctx context.Context, id string) (*Parent, error)
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
	Resolve(ctx context.Context, token string) (parentID string, ok bool, err error)
}

// EnrollmentTokenRepository: single-use, per api-spec/openapi.yaml's own
// description ("one-time enrollment token"). Consume both validates and
// invalidates it in the same call, so a token can't be replayed if a
// response is somehow intercepted or retried.
type EnrollmentTokenRepository interface {
	Create(ctx context.Context, parentID string) (token string, err error)
	// Consume returns the parent id the token belonged to and marks it
	// used; ok is false for an unknown or already-used token.
	Consume(ctx context.Context, token string) (parentID string, ok bool, err error)
}
