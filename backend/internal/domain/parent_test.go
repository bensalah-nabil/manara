package domain

import (
	"errors"
	"testing"
)

func complete() GuardianAttestation {
	return GuardianAttestation{ParentOrGuardian: true, MinorChild: true, ChildInformed: true, Version: AttestationVersion, PhoneBrand: "samsung"}
}

func TestAttestationNeedsAllThreeStatements(t *testing.T) {
	if err := complete().Validate(); err != nil {
		t.Fatalf("complete attestation rejected: %v", err)
	}
	for name, change := range map[string]func(*GuardianAttestation){
		"parent":   func(a *GuardianAttestation) { a.ParentOrGuardian = false },
		"minor":    func(a *GuardianAttestation) { a.MinorChild = false },
		"informed": func(a *GuardianAttestation) { a.ChildInformed = false },
	} {
		a := complete()
		change(&a)
		if err := a.Validate(); !errors.Is(err, ErrAttestationIncomplete) {
			t.Errorf("%s unchecked: got %v", name, err)
		}
	}
}

func TestAttestationRejectsOldWordingAndUnknownBrands(t *testing.T) {
	a := complete()
	a.Version = "2020-01-01"
	if err := a.Validate(); !errors.Is(err, ErrAttestationOutdated) {
		t.Errorf("old version: got %v", err)
	}
	for _, brand := range []string{"Samsung", "nokia", "samsung "} {
		a := complete()
		a.PhoneBrand = brand
		if err := a.Validate(); !errors.Is(err, ErrUnknownPhoneBrand) {
			t.Errorf("brand %q: got %v", brand, err)
		}
	}
	for brand := range PhoneBrands {
		a := complete()
		a.PhoneBrand = brand
		if err := a.Validate(); err != nil {
			t.Errorf("brand %q rejected: %v", brand, err)
		}
	}
}

// The console no longer asks for the brand: the phone reports its maker once connected.
func TestAttestationAcceptsNoBrand(t *testing.T) {
	a := complete()
	a.PhoneBrand = ""
	if err := a.Validate(); err != nil {
		t.Errorf("no brand: got %v", err)
	}
}
