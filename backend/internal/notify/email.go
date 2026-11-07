package notify

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"html"
	"io"
	"net/http"
	"net/url"
	"strings"

	"manara/backend/internal/domain"
)

// brevoURL is Brevo's transactional email API (developers.brevo.com,
// "Send a transactional email"). HTTPS on 443, because Render's free plan
// blocks outbound SMTP ports 25, 465 and 587.
const brevoURL = "https://api.brevo.com/v3/smtp/email"

// Brevo sends email through Brevo's HTTP API. The sender address must be
// verified in Brevo (Senders, domains and dedicated IPs); no domain needed.
type Brevo struct {
	apiKey   string
	from     string
	fromName string
	endpoint string // brevoURL; a test server in tests
	client   *http.Client
}

func NewBrevo(apiKey, from, fromName string) (*Brevo, error) {
	if apiKey == "" || !strings.Contains(from, "@") {
		return nil, errors.New("BREVO_API_KEY and a MAIL_FROM address are both required")
	}
	if fromName == "" {
		fromName = "Manara"
	}
	return &Brevo{apiKey: apiKey, from: from, fromName: fromName, endpoint: brevoURL, client: alertClient}, nil
}

type brevoAddress struct {
	Email string `json:"email"`
	Name  string `json:"name,omitempty"`
}

type brevoMessage struct {
	Sender      brevoAddress   `json:"sender"`
	To          []brevoAddress `json:"to"`
	Subject     string         `json:"subject"`
	TextContent string         `json:"textContent"`
	// Brevo's reference marks htmlContent required without a template, so the
	// same text goes as escaped HTML too.
	HTMLContent string `json:"htmlContent"`
}

func (b *Brevo) Send(ctx context.Context, to, subject, text string) error {
	body, err := json.Marshal(brevoMessage{
		Sender:      brevoAddress{Email: b.from, Name: b.fromName},
		To:          []brevoAddress{{Email: to}},
		Subject:     subject,
		TextContent: text,
		HTMLContent: textToHTML(text),
	})
	if err != nil {
		return fmt.Errorf("encode email: %w", err)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, b.endpoint, bytes.NewReader(body))
	if err != nil {
		return errors.New("build email request")
	}
	req.Header.Set("api-key", b.apiKey)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	resp, err := b.client.Do(req)
	if err != nil {
		var ue *url.Error
		if errors.As(err, &ue) {
			err = ue.Err // the URL is fixed, but keep errors the same shape as sendRequest's
		}
		return fmt.Errorf("send email: %w", err)
	}
	defer resp.Body.Close()
	detail, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		// Brevo's error body names the problem (unverified sender, bad key) and
		// never echoes the key, so it is safe to log.
		return fmt.Errorf("send email: Brevo answered %d: %s", resp.StatusCode, strings.TrimSpace(string(detail)))
	}
	return nil
}

// textToHTML keeps the plain text's line breaks and escapes everything else;
// a link stays plain text, which mail clients make clickable themselves.
func textToHTML(text string) string {
	return "<p>" + strings.ReplaceAll(html.EscapeString(text), "\n", "<br>") + "</p>"
}

// ParentEmailAlerts sends each alert to the parent it is about, at the
// address they signed up with. Unlike ntfy and the webhook, which go to one
// operator destination, this is how a parent on a shared server hears.
type ParentEmailAlerts struct {
	Parents domain.ParentRepository
	Mailer  domain.Mailer
}

func (p ParentEmailAlerts) Send(ctx context.Context, a domain.Alert) error {
	parent, err := p.Parents.FindByID(ctx, a.ParentID)
	if err != nil {
		return err
	}
	if parent == nil || parent.Email == "" {
		return nil // nobody to tell; not a delivery failure worth retrying
	}
	return p.Mailer.Send(ctx, parent.Email, "Manara: "+a.Title,
		a.Message+"\n\nOpen the console to see the phone.\n")
}
