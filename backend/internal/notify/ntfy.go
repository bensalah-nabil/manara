package notify

import (
	"context"
	"mime"
	"strings"

	"manara/backend/internal/domain"
)

// Ntfy publishes alerts to an ntfy topic (https://docs.ntfy.sh/publish/):
// the body is the message, Title/Priority/Tags are headers. Works with
// the public ntfy.sh or a self-hosted server.
type Ntfy struct {
	url   string
	token string
}

// NewNtfy takes the full topic URL. The topic acts as a password on a
// public server, so use a long random one, or a token on a private one.
func NewNtfy(topicURL, token string) (*Ntfy, error) {
	u, err := parseAlertURL(topicURL)
	if err != nil {
		return nil, err
	}
	return &Ntfy{url: u, token: token}, nil
}

func (n *Ntfy) Send(ctx context.Context, a domain.Alert) error {
	req, err := newAlertRequest(ctx, n.url, strings.NewReader(a.Message))
	if err != nil {
		return err
	}
	// RFC 2047 keeps a non-ASCII device name intact; ASCII passes through.
	req.Header.Set("Title", mime.QEncoding.Encode("utf-8", a.Title))
	req.Header.Set("Priority", "high")
	req.Header.Set("Tags", "warning")
	if n.token != "" {
		req.Header.Set("Authorization", "Bearer "+n.token)
	}
	return sendRequest(req)
}
