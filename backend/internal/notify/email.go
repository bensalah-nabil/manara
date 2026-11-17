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
	"time"

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
//
// Since every alert email reads the same, a parent is owed at most one
// (domain.AlertEmail): alerts that come together share it, and a send that
// fails stays owed until DeliverDue gets it through.
type ParentEmailAlerts struct {
	Parents domain.ParentRepository
	Mailer  domain.Mailer
	Emails  domain.AlertEmailRepository
	Now     func() time.Time
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

// errNoAddress: nobody to tell, so not a failure worth trying again.
var errNoAddress = errors.New("parent has no email address")

// Send owes the parent an email for this alert and tries it at once.
func (p ParentEmailAlerts) Send(ctx context.Context, a domain.Alert) error {
	now := p.now()
	reported := a.OccurredAt
	if reported.IsZero() {
		reported = now // a zero time would read as "nothing owed"
	}
	if err := p.Emails.Update(ctx, a.ParentID, func(e *domain.AlertEmail) { e.Owe(reported, now) }); err != nil {
		return err
	}
	_, err := p.Deliver(ctx, a.ParentID)
	return err
}

// DeliverDue tries every owed email that is due, and reports how many went
// out. Run it on a timer: it is what tries a failed send again.
func (p ParentEmailAlerts) DeliverDue(ctx context.Context) (sent int, err error) {
	ids, err := p.Emails.Due(ctx, p.now())
	if err != nil {
		return 0, err
	}
	var errs []error
	for _, id := range ids {
		ok, err := p.Deliver(ctx, id)
		if err != nil {
			errs = append(errs, err)
		}
		if ok {
			sent++
		}
	}
	return sent, errors.Join(errs...)
}

// Deliver tries the email owed to parentID if a try is due, and reports
// whether it went out. A failed send stays owed, with its next try set.
func (p ParentEmailAlerts) Deliver(ctx context.Context, parentID string) (bool, error) {
	var claimed bool
	var reportedAt time.Time
	if err := p.Emails.Update(ctx, parentID, func(e *domain.AlertEmail) {
		claimed, reportedAt = e.Claim(p.now()), e.ReportedAt
	}); err != nil {
		return false, err
	}
	if !claimed {
		return false, nil
	}

	sendErr := p.send(ctx, parentID, reportedAt)
	var kept bool
	var tries int
	var next time.Time
	if err := p.Emails.Update(ctx, parentID, func(e *domain.AlertEmail) {
		switch {
		case sendErr == nil:
			e.Sent(p.now())
		case errors.Is(sendErr, errNoAddress):
			e.Drop()
		default:
			kept = e.Failed(p.now())
			tries, next = e.Tries, e.NextTry
		}
	}); err != nil {
		return sendErr == nil, errors.Join(sendErr, err)
	}
	switch {
	case sendErr == nil:
		return true, nil
	case errors.Is(sendErr, errNoAddress):
		return false, nil
	case kept:
		return false, fmt.Errorf("alert email to parent %s not sent (try %d, next at %s): %w",
			parentID, tries, next.UTC().Format("15:04 UTC"), sendErr)
	default:
		return false, fmt.Errorf("alert email to parent %s dropped after %d tries: %w", parentID, tries, sendErr)
	}
}

func (p ParentEmailAlerts) send(ctx context.Context, parentID string, reportedAt time.Time) error {
	parent, err := p.Parents.FindByID(ctx, parentID)
	if err != nil {
		return err
	}
	if parent == nil || parent.Email == "" {
		return errNoAddress
	}
	text := alertEmails[domain.NormalizeLanguage(parent.Language)]
	when := reportedAt.UTC().Format("2006-01-02 15:04") + " UTC"
	return p.Mailer.Send(ctx, parent.Email, text.subject, fmt.Sprintf(text.body, when))
}

func (p ParentEmailAlerts) now() time.Time {
	if p.Now != nil {
		return p.Now()
	}
	return time.Now()
}
