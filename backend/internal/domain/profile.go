package domain

import (
	"context"
	"errors"
	"strings"
	"unicode"
	"unicode/utf8"
)

// DeviceColors are the colors a parent can pick for a child's phone. The
// console draws them; the server only checks the name.
var DeviceColors = []string{"teal", "blue", "purple", "pink", "red", "orange", "amber", "green"}

// MaxLabelRunes keeps a child's name short enough for the phone list.
const MaxLabelRunes = 40

var ErrInvalidProfile = errors.New("invalid name or color")

// NormalizeProfile trims the child's name and checks both fields. An empty
// name or color is allowed: the console then falls back to the phone's model.
func NormalizeProfile(label, color string) (string, string, error) {
	label = strings.TrimSpace(label)
	if utf8.RuneCountInString(label) > MaxLabelRunes || !utf8.ValidString(label) {
		return "", "", ErrInvalidProfile
	}
	for _, r := range label {
		if unicode.IsControl(r) {
			return "", "", ErrInvalidProfile
		}
	}
	if color != "" && !knownColor(color) {
		return "", "", ErrInvalidProfile
	}
	return label, color, nil
}

func knownColor(color string) bool {
	for _, c := range DeviceColors {
		if c == color {
			return true
		}
	}
	return false
}

// DeviceProfileRepository saves what the parent calls a phone. Kept apart
// from DeviceRepository, which sync and enrollment use.
type DeviceProfileRepository interface {
	UpdateProfile(ctx context.Context, deviceID, label, color string) error
}
