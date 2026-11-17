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
//
// The email says only that something needs attention, and when. It never
// carries the alert's title or message: those name the phone, and a phone's
// name is often the child's ("Sara has stopped checking in"). Brevo's terms
// let it train its AI on email content (docs/privacy/dpa-brevo.md, §6.7), so
// the console, not the email, says which phone and what happened.
type ParentEmailAlerts struct {
	Parents domain.ParentRepository
	Mailer  domain.Mailer
}

type alertEmailText struct{ subject, body string }

// alertEmails holds one generic alert email per console language. Nothing in
// it may come from the alert. TODO-REVIEW: a native reader for fr and ar.
var alertEmails = map[string]alertEmailText{
	"en": {
		subject: "Manara: a phone needs your attention",
		body:    "Something on one of the phones in your Manara account needs your attention (reported %s).\n\nOpen the console to see which phone and what to do.\n",
	},
	"fr": {
		subject: "Manara : un téléphone demande votre attention",
		body:    "Un des téléphones de votre compte Manara demande votre attention (signalé le %s).\n\nOuvrez la console pour voir lequel et quoi faire.\n",
	},
	"ar": {
		subject: "منارة: هاتف يحتاج إلى انتباهك",
		body:    "أحد الهواتف في حسابك على منارة يحتاج إلى انتباهك (أُبلغ عنه في %s).\n\nافتح لوحة التحكم لترى أي هاتف وما الذي عليك فعله.\n",
	},
}

func (p ParentEmailAlerts) Send(ctx context.Context, a domain.Alert) error {
	parent, err := p.Parents.FindByID(ctx, a.ParentID)
	if err != nil {
		return err
	}
	if parent == nil || parent.Email == "" {
		return nil // nobody to tell; not a delivery failure worth retrying
	}
	text := alertEmails[domain.NormalizeLanguage(parent.Language)]
	when := a.OccurredAt.UTC().Format("2006-01-02 15:04") + " UTC"
	return p.Mailer.Send(ctx, parent.Email, text.subject, fmt.Sprintf(text.body, when))
}
