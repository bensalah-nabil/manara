package domain

import (
	"errors"
	"strings"
	"testing"
)

func validReport() SetupReport {
	return SetupReport{Step: SetupCheckingAccounts, Status: SetupInProgress, Message: "Checking accounts",
		Accounts: []SetupAccount{{Type: "com.google", Name: "child@example.com"}}}
}

func TestSetupReportAcceptsKnownStepsAndStatuses(t *testing.T) {
	if err := validReport().Validate(); err != nil {
		t.Fatal(err)
	}
	for _, step := range SetupSteps {
		r := SetupReport{Step: step, Status: SetupInProgress}
		if step == SetupDone {
			r.Status = SetupFinished
		}
		if err := r.Validate(); err != nil {
			t.Errorf("%s: %v", step, err)
		}
	}
}

func TestSetupReportRejectsAnythingOutsideTheFixedList(t *testing.T) {
	long := strings.Repeat("x", 301)
	bad := map[string]SetupReport{
		"unknown step":         {Step: "rm -rf", Status: SetupInProgress},
		"unknown status":       {Step: SetupLinked, Status: "maybe"},
		"done without done":    {Step: SetupDone, Status: SetupInProgress},
		"finished early":       {Step: SetupPairing, Status: SetupFinished},
		"long message":         {Step: SetupLinked, Status: SetupInProgress, Message: long},
		"account without type": {Step: SetupLinked, Status: SetupInProgress, Accounts: []SetupAccount{{Name: "x"}}},
		"long account name": {Step: SetupLinked, Status: SetupInProgress,
			Accounts: []SetupAccount{{Type: "t", Name: strings.Repeat("n", 201)}}},
		"too many accounts": {Step: SetupLinked, Status: SetupInProgress, Accounts: make([]SetupAccount, 101)},
	}
	for name, r := range bad {
		for i := range r.Accounts {
			if r.Accounts[i].Type == "" && name == "too many accounts" {
				r.Accounts[i].Type = "t"
			}
		}
		if err := r.Validate(); !errors.Is(err, ErrInvalidSetupReport) {
			t.Errorf("%s: got %v", name, err)
		}
	}
}
