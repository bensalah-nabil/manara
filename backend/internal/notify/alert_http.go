package notify

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"time"
)

// alertClient is shared by the alert senders: a slow notification server
// must not hold a goroutine open for long.
var alertClient = &http.Client{Timeout: 10 * time.Second}

func parseAlertURL(raw string) (string, error) {
	u, err := url.Parse(raw)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
		// Never echo raw: it may hold a secret topic or token.
		return "", errors.New("alert URL must be an absolute http or https URL")
	}
	return u.String(), nil
}

// sendRequest runs req and fails on any non-2xx answer. Errors never
// include the URL (an ntfy topic is effectively a password).
func sendRequest(req *http.Request) error {
	resp, err := alertClient.Do(req)
	if err != nil {
		var ue *url.Error
		if errors.As(err, &ue) {
			err = ue.Err
		}
		return fmt.Errorf("send alert: %w", err)
	}
	defer resp.Body.Close()
	_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 4096))
	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		return fmt.Errorf("send alert: server answered %d", resp.StatusCode)
	}
	return nil
}

func newAlertRequest(ctx context.Context, target string, body io.Reader) (*http.Request, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, target, body)
	if err != nil {
		return nil, errors.New("build alert request")
	}
	return req, nil
}
