package notify

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"manara/backend/internal/domain"
)

// WeeklyEmails sends the Monday email saying last week's report is ready
// (roadmap P8, domain.WeeklyEmail). Like the alert email it names no phone
// and carries no figure: Brevo's terms let it train its AI on email content
// (docs/privacy/dpa-brevo.md, §6.7), so the report itself is the console's
// Insights panel. Only the week's dates and the console's address go out.
type WeeklyEmails struct {
	Parents domain.ParentRepository
	Mailer  domain.Mailer
	Emails  domain.WeeklyEmailRepository
	// ConsoleURL is where the email sends the parent; required.
	ConsoleURL string
	Now        func() time.Time
}

type weeklyEmailText struct{ subject, body string }

// weeklyEmails holds the email in each console language: %[1]s and %[2]s are
// the week's first and last day, %[3]s the console's address. The names in
// quotes are the console's own (messages/*.ts: account.weeklyEmail,
// nav.account, insights.title). TODO-REVIEW: a native reader for fr and ar.
var weeklyEmails = map[string]weeklyEmailText{
	"en": {
		subject: "Manara: last week's report is ready",
		body: "The report for the week of %[1]s to %[2]s is ready in the Manara console, under Insights for each phone that reports its daily app usage.\n\n" +
			"Open the console: %[3]s\n\n" +
			"To stop this email, turn off \"Weekly email\" under Account in the console.\n",
	},
	"fr": {
		subject: "Manara : le bilan de la semaine dernière est prêt",
		body: "Le bilan de la semaine du %[1]s au %[2]s est prêt dans la console Manara, dans « Aperçu » pour chaque téléphone qui envoie son usage quotidien des applications.\n\n" +
			"Ouvrir la console : %[3]s\n\n" +
			"Pour ne plus recevoir cet e-mail, désactivez « E-mail hebdomadaire » dans « Compte », dans la console.\n",
	},
	"ar": {
		subject: "منارة: تقرير الأسبوع الماضي جاهز",
		body: "تقرير الأسبوع من %[1]s إلى %[2]s جاهز في لوحة تحكم منارة، ضمن «لمحة عامة» لكل هاتف يرسل استخدامه اليومي للتطبيقات.\n\n" +
			"افتح لوحة التحكم: %[3]s\n\n" +
			"لإيقاف هذا البريد، عطّل «البريد الأسبوعي» في «الحساب» داخل لوحة التحكم.\n",
	},
}

// errWeeklyOff: the parent turned the email off after it was listed as due.
var errWeeklyOff = errors.New("weekly email turned off")

// DeliverDue sends last week's email to every parent owed it, and reports how
// many went out. Run it on a timer: it is what sends on Monday morning, and
// what tries a failed send again.
func (w WeeklyEmails) DeliverDue(ctx context.Context) (sent int, err error) {
	now := w.now()
	week, end, ok := domain.ReportWeek(now)
	if !ok {
		return 0, nil
	}
	ids, err := w.Emails.Due(ctx, week, end, now)
	if err != nil {
		return 0, err
	}
	var errs []error
	for _, id := range ids {
		ok, err := w.deliver(ctx, id, week, end)
		if err != nil {
			errs = append(errs, err)
		}
		if ok {
			sent++
		}
	}
	return sent, errors.Join(errs...)
}

// deliver tries parentID's email for week if a try is due, and reports whether
// it went out. A failed send stays owed, with its next try set.
func (w WeeklyEmails) deliver(ctx context.Context, parentID string, week, end time.Time) (bool, error) {
	var claimed bool
	if err := w.Emails.Update(ctx, parentID, func(e *domain.WeeklyEmail) {
		claimed = e.Claim(week, w.now())
	}); err != nil {
		return false, err
	}
	if !claimed {
		return false, nil
	}

	sendErr := w.send(ctx, parentID, week, end)
	settle := sendErr == nil || errors.Is(sendErr, errNoAddress) || errors.Is(sendErr, errWeeklyOff)
	var tries int
	var next time.Time
	if err := w.Emails.Update(ctx, parentID, func(e *domain.WeeklyEmail) {
		if settle {
			e.Settle(week)
			return
		}
		e.Failed(w.now())
		tries, next = e.Tries, e.NextTry
	}); err != nil {
		return sendErr == nil, errors.Join(sendErr, err)
	}
	if settle {
		return sendErr == nil, nil
	}
	return false, fmt.Errorf("weekly email to parent %s not sent (try %d, next at %s): %w",
		parentID, tries, next.UTC().Format("15:04 UTC"), sendErr)
}

func (w WeeklyEmails) send(ctx context.Context, parentID string, week, end time.Time) error {
	parent, err := w.Parents.FindByID(ctx, parentID)
	if err != nil {
		return err
	}
	if parent == nil || parent.Email == "" {
		return errNoAddress
	}
	if !parent.WeeklyEmail {
		return errWeeklyOff
	}
	text := weeklyEmails[domain.NormalizeLanguage(parent.Language)]
	first := week.In(domain.WeeklyEmailZone).Format("2006-01-02")
	last := end.In(domain.WeeklyEmailZone).AddDate(0, 0, -1).Format("2006-01-02")
	link := strings.TrimRight(w.ConsoleURL, "/") + "/"
	return w.Mailer.Send(ctx, parent.Email, text.subject, fmt.Sprintf(text.body, first, last, link))
}

func (w WeeklyEmails) now() time.Time {
	if w.Now != nil {
		return w.Now()
	}
	return time.Now()
}
