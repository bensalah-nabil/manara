package domain

import (
	"errors"
	"testing"
)

func goodSignup() BetaSignup {
	return BetaSignup{
		FirstName: "  Sara ", WhatsApp: "+216 22 123 456", Place: "Sfax,  Tunisie", CallLanguage: "ar",
		Brand: "xiaomi", ChildAge: "10to13", Worries: []string{"night", "strangers", "night"},
		Slots: []string{"weekday-evening"}, PageLanguage: "ar", OwnChild: true,
	}
}

func TestABetaSignUpIsCleanedAndStartsNew(t *testing.T) {
	s, err := goodSignup().Normalize()
	if err != nil {
		t.Fatal(err)
	}
	if s.FirstName != "Sara" || s.Place != "Sfax, Tunisie" || s.Status != "new" {
		t.Fatalf("%+v", s)
	}
	if len(s.Worries) != 2 {
		t.Fatalf("a repeated choice was kept twice: %v", s.Worries)
	}
	if s.Waitlist() {
		t.Fatal("a Xiaomi is not on the waiting list")
	}
}

func TestABetaSignUpWithoutTheOwnChildPromiseIsRefused(t *testing.T) {
	s := goodSignup()
	s.OwnChild = false
	if _, err := s.Normalize(); !errors.Is(err, ErrBetaNotOwnChild) {
		t.Fatalf("got %v", err)
	}
}

func TestBadBetaFieldsAreNamed(t *testing.T) {
	cases := map[string]func(*BetaSignup){
		"firstName":    func(s *BetaSignup) { s.FirstName = " " },
		"whatsapp":     func(s *BetaSignup) { s.WhatsApp = "12345" },
		"place":        func(s *BetaSignup) { s.Place = "" },
		"callLanguage": func(s *BetaSignup) { s.CallLanguage = "de" },
		"brand":        func(s *BetaSignup) { s.Brand = "nokia" },
		"childAge":     func(s *BetaSignup) { s.ChildAge = "adult" },
		"worries":      func(s *BetaSignup) { s.Worries = []string{"spouse"} },
		"slots":        func(s *BetaSignup) { s.Slots = []string{"3am"} },
		"model":        func(s *BetaSignup) { s.Model = "a\x00b" },
	}
	for field, spoil := range cases {
		s := goodSignup()
		spoil(&s)
		_, err := s.Normalize()
		var v *ValidationError
		if !errors.As(err, &v) || v.Field != field {
			t.Errorf("%s: got %v", field, err)
		}
	}
	s := goodSignup()
	s.WhatsApp = "+216 22 123 456; DROP"
	if _, err := s.Normalize(); err == nil {
		t.Fatal("letters in a phone number were accepted")
	}
}

func TestAnIPhoneFamilyJoinsTheWaitingList(t *testing.T) {
	s := goodSignup()
	s.Brand = "iphone"
	got, err := s.Normalize()
	if err != nil || !got.Waitlist() {
		t.Fatalf("%v %v", got.Waitlist(), err)
	}
}
