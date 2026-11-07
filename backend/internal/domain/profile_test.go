package domain

import (
	"strings"
	"testing"
)

func TestNormalizeProfileTrimsTheNameAndChecksTheColor(t *testing.T) {
	label, color, err := NormalizeProfile("  Sara  ", "pink")
	if err != nil || label != "Sara" || color != "pink" {
		t.Fatalf("got %q %q %v", label, color, err)
	}
	if label, color, err := NormalizeProfile("", ""); err != nil || label != "" || color != "" {
		t.Fatalf("empty: %q %q %v", label, color, err)
	}
	if label, _, err := NormalizeProfile("عائشة", "teal"); err != nil || label != "عائشة" {
		t.Fatalf("arabic name: %q %v", label, err)
	}
	for name, c := range map[string][2]string{
		"unknown color": {"Sara", "#ff0000"},
		"too long":      {strings.Repeat("a", MaxLabelRunes+1), ""},
		"control char":  {"Sa\nra", ""},
	} {
		if _, _, err := NormalizeProfile(c[0], c[1]); err != ErrInvalidProfile {
			t.Errorf("%s: err %v", name, err)
		}
	}
	if _, _, err := NormalizeProfile(strings.Repeat("é", MaxLabelRunes), ""); err != nil {
		t.Errorf("40 accented letters are 40, not 80: %v", err)
	}
}
