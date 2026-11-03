package domain

import "context"

// PushNotifier wakes a device immediately via a push provider (FCM),
// instead of waiting for its next /agent/sync poll. Deliberately a thin
// port, not a persistence-layer concern: sending a push is outbound I/O to
// a third-party service, same category as HTTP transport, not storage.
//
// Best-effort by contract: whatever enqueues a command must always persist
// it first regardless of what Notify returns -- a push failure (no token,
// device offline, provider outage) must never lose a command, only fall
// back to the existing polling loop picking it up on the next /agent/sync.
type PushNotifier interface {
	Notify(ctx context.Context, pushToken string) error
}
