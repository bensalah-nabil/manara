// Package notify holds domain.PushNotifier implementations. Kept out of
// internal/domain (a third-party push SDK is outbound I/O, same category
// as persistence or HTTP transport, not business logic) and out of
// internal/persistence (sending a push isn't storage).
package notify

import "context"

// Noop is domain.PushNotifier's zero-config implementation -- wired in
// whenever Firebase isn't configured (no FIREBASE_SERVICE_ACCOUNT env var),
// so the backend behaves exactly as it did before FCM existed: a command
// is still enqueued and picked up on the device's next /agent/sync poll,
// push is just never attempted. This is what keeps FCM additive rather
// than a hard dependency -- nothing else in the codebase needs to know or
// care whether push is actually configured.
type Noop struct{}

func (Noop) Notify(ctx context.Context, pushToken string) error { return nil }
