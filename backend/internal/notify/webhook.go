package notify

import (
	"bytes"
	"context"
	"encoding/json"
	"time"

	"manara/backend/internal/domain"
)

// Webhook POSTs each alert as JSON to one URL, for anything that is not
// ntfy (Home Assistant, a chat bridge, a script).
type Webhook struct {
	url string
}

func NewWebhook(rawURL string) (*Webhook, error) {
	u, err := parseAlertURL(rawURL)
	if err != nil {
		return nil, err
	}
	return &Webhook{url: u}, nil
}

type webhookBody struct {
	Title      string    `json:"title"`
	Message    string    `json:"message"`
	DeviceID   string    `json:"deviceId"`
	ParentID   string    `json:"parentId"`
	OccurredAt time.Time `json:"occurredAt"`
}

func (w *Webhook) Send(ctx context.Context, a domain.Alert) error {
	body, err := json.Marshal(webhookBody{
		Title: a.Title, Message: a.Message, DeviceID: a.DeviceID,
		ParentID: a.ParentID, OccurredAt: a.OccurredAt.UTC(),
	})
	if err != nil {
		return err
	}
	req, err := newAlertRequest(ctx, w.url, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	return sendRequest(req)
}
