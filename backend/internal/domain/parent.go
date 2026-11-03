package domain

import (
	"context"
	"time"
)

// Parent, ParentSession, and EnrollmentToken exist here so the real
// domain model is right from the start -- but there is deliberately no
// signup/login flow built on top of them yet. roadmap.md puts "Parent
// auth / account model" under Phase 3, not Phase 2; a real auth system
// belongs there, not invented ad hoc here to unblock testing. For now,
// `cmd/manara-server`'s `-seed` flag creates one parent and prints a
// session token + an enrollment token directly -- the same spirit as
// stub-backend's hardcoded "test-token", not a stand-in to build on.

type Parent struct {
	ID        string
	CreatedAt time.Time
}

type ParentRepository interface {
	Create(ctx context.Context, p *Parent) error
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
