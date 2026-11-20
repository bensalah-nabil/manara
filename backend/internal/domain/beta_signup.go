package domain

import (
	"context"
	"errors"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"
)

// A parent asking to join the "Familles pionnières" beta from the public beta page
// (docs/marketing/familles-pionnieres.md). Only what booking the setup call needs: no child's
// name, no email, no address. Kept BetaSignupRetention, then deleted; listed on the privacy page.
type BetaSignup struct {
	ID        string    `json:"id"`
	CreatedAt time.Time `json:"createdAt"`
	FirstName string    `json:"firstName"`
	WhatsApp  string    `json:"whatsapp"`
	Place     string    `json:"place"`
	// CallLanguage is the language the parent wants the call in: fr, ar or en.
	CallLanguage string `json:"callLanguage"`
	// Brand is one of BetaBrands; an iPhone joins the waiting list (Manara is Android only).
	Brand    string   `json:"brand"`
	Model    string   `json:"model,omitempty"`
	ChildAge string   `json:"childAge"`
	Worries  []string `json:"worries"`
	Slots    []string `json:"slots"`
	// PageLanguage is the beta page the form was sent from.
	PageLanguage string `json:"pageLanguage"`
	// OwnChild: the parent confirmed it is their own minor child, who will know (ADR-0001).
	OwnChild bool `json:"ownChild"`
	// Status is the admin's follow-up: new, contacted, set_up or declined.
	Status    string    `json:"status"`
	UpdatedAt time.Time `json:"updatedAt"`
}

const BetaSignupRetention = 180 * 24 * time.Hour

var (
	BetaBrands         = []string{"samsung", "xiaomi", "oppo-realme", "other", "iphone"}
	betaLanguages      = []string{"fr", "ar", "en"}
	betaAges           = []string{"under10", "10to13", "14to17"}
	betaWorries        = []string{"screen-time", "night", "adult-content", "strangers", "games", "other"}
	betaSlots          = []string{"weekday-evening", "saturday-morning", "other"}
	BetaStatuses       = []string{"new", "contacted", "set_up", "declined"}
	ErrBetaNotOwnChild = errors.New("the parent must confirm it is their own minor child")
)

// ValidationError names the field that is wrong, for the form to show next to it.
type ValidationError struct{ Field, Message string }

func (e *ValidationError) Error() string { return e.Field + ": " + e.Message }

func oneOf(v string, allowed []string) bool {
	for _, a := range allowed {
		if v == a {
			return true
		}
	}
	return false
}

func cleanList(values, allowed []string) ([]string, bool) {
	seen := map[string]bool{}
	out := []string{}
	for _, v := range values {
		if !oneOf(v, allowed) {
			return nil, false
		}
		if !seen[v] {
			seen[v] = true
			out = append(out, v)
		}
	}
	return out, true
}

func cleanText(s string, max int) (string, bool) {
	s = strings.Join(strings.Fields(s), " ")
	if utf8.RuneCountInString(s) > max {
		return "", false
	}
	for _, r := range s {
		if unicode.IsControl(r) {
			return "", false
		}
	}
	return s, true
}

// Normalize trims and checks a sign-up as the beta page sends it. It returns the cleaned copy.
func (s BetaSignup) Normalize() (BetaSignup, error) {
	var ok bool
	if s.FirstName, ok = cleanText(s.FirstName, 60); !ok || s.FirstName == "" {
		return s, &ValidationError{"firstName", "1 to 60 characters"}
	}
	if s.Place, ok = cleanText(s.Place, 80); !ok || s.Place == "" {
		return s, &ValidationError{"place", "1 to 80 characters"}
	}
	if s.Model, ok = cleanText(s.Model, 80); !ok {
		return s, &ValidationError{"model", "at most 80 characters"}
	}
	phone := strings.Join(strings.Fields(s.WhatsApp), " ")
	digits := 0
	for _, r := range phone {
		switch {
		case r >= '0' && r <= '9':
			digits++
		case r == '+' || r == ' ' || r == '-' || r == '(' || r == ')' || r == '.':
		default:
			return s, &ValidationError{"whatsapp", "digits only, with an optional +"}
		}
	}
	if digits < 8 || digits > 15 {
		return s, &ValidationError{"whatsapp", "8 to 15 digits"}
	}
	s.WhatsApp = phone
	if !oneOf(s.CallLanguage, betaLanguages) {
		return s, &ValidationError{"callLanguage", "fr, ar or en"}
	}
	if !oneOf(s.PageLanguage, betaLanguages) {
		s.PageLanguage = "fr"
	}
	if !oneOf(s.Brand, BetaBrands) {
		return s, &ValidationError{"brand", "one of the listed brands"}
	}
	if !oneOf(s.ChildAge, betaAges) {
		return s, &ValidationError{"childAge", "one of the listed ages"}
	}
	if s.Worries, ok = cleanList(s.Worries, betaWorries); !ok {
		return s, &ValidationError{"worries", "only the listed choices"}
	}
	if s.Slots, ok = cleanList(s.Slots, betaSlots); !ok {
		return s, &ValidationError{"slots", "only the listed choices"}
	}
	if !s.OwnChild {
		return s, ErrBetaNotOwnChild
	}
	s.Status = "new"
	return s, nil
}

// Waitlist: an iPhone family can't be set up yet; they are told so and kept to be told later.
func (s BetaSignup) Waitlist() bool { return s.Brand == "iphone" }

type BetaSignupStore interface {
	AddBetaSignup(ctx context.Context, s BetaSignup) (BetaSignup, error)
	ListBetaSignups(ctx context.Context, limit int) ([]BetaSignup, error)
	// SetBetaSignupStatus returns false when no sign-up has that id.
	SetBetaSignupStatus(ctx context.Context, id, status string, at time.Time) (bool, error)
	PurgeBetaSignups(ctx context.Context, before time.Time) (int64, error)
}
