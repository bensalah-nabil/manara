// Package fcm is the real domain.PushNotifier implementation, talking
// directly to FCM's HTTP v1 API (golang.org/x/oauth2/google for the
// service-account token, encoding/json + net/http for the request).
// Deliberately not the Firebase Admin Go SDK: that package pulls in
// Firestore, Cloud Monitoring, OpenTelemetry, and gRPC transitively --
// dozens of dependencies for one "send a message" call this project
// doesn't need. Isolated in its own subpackage so swapping providers, or
// testing against notify.Noop, never touches anything outside this file.
package fcm

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"

	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"
)

const (
	sendURLFormat = "https://fcm.googleapis.com/v1/projects/%s/messages:send"
	authScope     = "https://www.googleapis.com/auth/firebase.messaging"
)

type Notifier struct {
	projectID  string
	httpClient *http.Client
}

// New reads a Firebase/GCP service account key from serviceAccountPath
// (see backend/README.md for how to obtain one) and returns a
// ready-to-use Notifier. Call once at startup, not per-request --
// google.DefaultClient's token source refreshes and caches its own
// access token internally, so the returned *http.Client is safe and
// efficient to reuse across many Notify calls.
func New(ctx context.Context, serviceAccountPath string) (*Notifier, error) {
	keyJSON, err := os.ReadFile(serviceAccountPath)
	if err != nil {
		return nil, fmt.Errorf("read service account key: %w", err)
	}

	var key struct {
		ProjectID string `json:"project_id"`
	}
	if err := json.Unmarshal(keyJSON, &key); err != nil {
		return nil, fmt.Errorf("parse service account key: %w", err)
	}
	if key.ProjectID == "" {
		return nil, fmt.Errorf("service account key has no project_id")
	}

	creds, err := google.CredentialsFromJSON(ctx, keyJSON, authScope)
	if err != nil {
		return nil, fmt.Errorf("load service account credentials: %w", err)
	}

	return &Notifier{
		projectID:  key.ProjectID,
		httpClient: oauth2.NewClient(ctx, creds.TokenSource),
	}, nil
}

// Notify sends a silent, data-only wake-up message -- the agent's own
// SyncWorker decides what to do (see ManaraFirebaseMessagingService on the
// agent side), this never carries a user-visible notification itself.
// ADR-0001 still applies to what the agent does on receipt, not to this
// message's own content.
func (n *Notifier) Notify(ctx context.Context, pushToken string) error {
	if pushToken == "" {
		return nil
	}

	body, err := json.Marshal(map[string]any{
		"message": map[string]any{
			"token": pushToken,
			"data":  map[string]string{"type": "sync_now"},
			"android": map[string]any{
				"priority": "HIGH",
			},
		},
	})
	if err != nil {
		return fmt.Errorf("marshal fcm message: %w", err)
	}

	url := fmt.Sprintf(sendURLFormat, n.projectID)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("build fcm request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := n.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("send fcm message: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		return fmt.Errorf("fcm send: unexpected status %s", resp.Status)
	}
	return nil
}
