package domain

import (
	"errors"
	"fmt"
	"strings"
	"unicode"
)

// Calls from numbers the parent doesn't know (roadmap W2, 2026-11-20). The parent types the
// numbers they know in the console; Manara never reads the child's contacts. A call the phone
// already reports (call history, ADR-0008) from any other number alerts the parent. Nothing new
// is collected: the comparison runs on the server, on call events it already receives.

// CallAlerts lives in the policy for the console's sake, but the phone never gets it: the agent's
// sync strips it (ForPhone), so the parent's list of numbers stays off the child's phone.
type CallAlerts struct {
	Enabled      bool     `json:"enabled"`
	KnownNumbers []string `json:"knownNumbers,omitempty"`
}

// MaxKnownNumbers keeps the list a family's numbers, not an address book.
const MaxKnownNumbers = 100

var ErrInvalidCallAlerts = errors.New("invalid call alerts")

func (c *CallAlerts) Validate() error {
	if c == nil {
		return nil
	}
	if len(c.KnownNumbers) > MaxKnownNumbers {
		return fmt.Errorf("%w: at most %d known numbers", ErrInvalidCallAlerts, MaxKnownNumbers)
	}
	for _, n := range c.KnownNumbers {
		if len(n) > 30 || NumberKey(n) == "" || strings.IndexFunc(n, func(r rune) bool {
			return !unicode.IsDigit(r) && !strings.ContainsRune("+ -().", r)
		}) >= 0 {
			return fmt.Errorf("%w: %q is not a phone number", ErrInvalidCallAlerts, n)
		}
	}
	return nil
}

// ForPhone is the policy as the phone receives it: without the parent's known numbers, which only
// the server uses.
func (p Policy) ForPhone() Policy {
	p.CallAlerts = nil
	return p
}

// numberKeyDigits: the last 8 digits identify a number whatever its prefix, so "+216 22 123 456",
// "0021622123456" and "22123456" match. Tunisian numbers have 8 digits; elsewhere two numbers
// sharing their last 8 digits would wrongly match, which only means a missed alert.
const numberKeyDigits = 8

// NumberKey is the comparable part of a phone number, or "" for one too short to compare (a
// short service code, a hidden number).
func NumberKey(number string) string {
	var digits []rune
	for _, r := range number {
		if r >= '0' && r <= '9' {
			digits = append(digits, r)
		}
	}
	if len(digits) < 6 {
		return ""
	}
	if len(digits) > numberKeyDigits {
		digits = digits[len(digits)-numberKeyDigits:]
	}
	return string(digits)
}

// UnknownCaller reports whether e is a call to the child from a number the parent doesn't know, and
// the key to throttle its alert by. Outgoing calls, and calls in messaging apps (which give no
// number), never count. A hidden number counts: a stranger is exactly who hides it.
func UnknownCaller(e *Event, known []string) (key string, unknown bool) {
	if e == nil || e.Kind != EventKindCall || payloadText(e, "app") != "" {
		return "", false
	}
	switch payloadText(e, "direction") {
	case "incoming", "missed", "rejected":
	default:
		return "", false
	}
	number := payloadText(e, "number")
	k := NumberKey(number)
	if k == "" {
		return "hidden", true
	}
	for _, n := range known {
		if NumberKey(n) == k {
			return "", false
		}
	}
	return k, true
}

// UnknownCallerAlert is the alert for such a call. Like every alert it carries no content: not the
// number, which the console shows.
func UnknownCallerAlert(d *Device, e *Event) Alert {
	return Alert{
		Kind:       AlertKindUnknownCall,
		ParentID:   d.ParentID,
		DeviceID:   d.ID,
		Title:      deviceName(d) + ": a call from a number you don't know",
		Message:    "Reported " + e.OccurredAt.UTC().Format("2006-01-02 15:04") + " UTC. The number is in the console, under Call history.",
		OccurredAt: e.OccurredAt,
	}
}
