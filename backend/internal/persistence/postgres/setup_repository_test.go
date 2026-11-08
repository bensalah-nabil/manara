package postgres

import (
	"context"
	"reflect"
	"testing"
	"time"

	"manara/backend/internal/domain"
)

// Seen on the SM-A528B: a run removed the accounts and failed, the parent
// started again, and the new run erased the list of what to sign back in to.
func TestANewSetupRunKeepsWhatThePhoneHadUntilARunFinishes(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	p := newParent(t, db, uniqueEmail("setup"), "password one")
	id := "00000000-0000-4000-a000-" + time.Now().Format("150405000000")[:12]
	if err := NewDeviceRepository(db).Create(ctx, &domain.Device{ID: id, ParentID: p.ID, CreatedAt: time.Now()}); err != nil {
		t.Fatal(err)
	}
	setups := NewSetupRepository(db)
	had := []domain.SetupAccount{{Type: "com.google", Name: "kid@gmail.com"}, {Type: "com.whatsapp", Name: "WhatsApp"}}
	report := func(rep domain.SetupReport) *domain.DeviceSetup {
		t.Helper()
		s, err := setups.Report(ctx, id, rep)
		if err != nil {
			t.Fatal(err)
		}
		return s
	}
	newRun := func(name string) domain.SetupReport {
		return domain.SetupReport{Step: domain.SetupPairing, Status: domain.SetupWaitingForParent, Pairing: &domain.QRPairing{Name: name, Password: "abcdefgh12345678"}}
	}

	// Run 1: the accounts are listed, removed, and the run fails.
	report(newRun("manara-aaaa01"))
	report(domain.SetupReport{Step: domain.SetupCheckingAccounts, Status: domain.SetupInProgress, Accounts: had})
	report(domain.SetupReport{Step: domain.SetupDeviceOwner, Status: domain.SetupFailed, Message: "refused", Accounts: []domain.SetupAccount{}})

	// Run 2 starts, and the phone now has nothing on it.
	s := report(newRun("manara-bbbb02"))
	if !reflect.DeepEqual(s.InitialAccounts, had) {
		t.Fatalf("run 2 lost what the phone had: %+v", s.InitialAccounts)
	}
	in, err := setups.Input(ctx, id)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(in.EarlierAccounts, had) {
		t.Fatalf("the phone isn't told what it had: %+v", in.EarlierAccounts)
	}
	s = report(domain.SetupReport{Step: domain.SetupCheckingAccounts, Status: domain.SetupInProgress, Accounts: []domain.SetupAccount{}})
	if !reflect.DeepEqual(s.InitialAccounts, had) {
		t.Fatalf("an empty list replaced it: %+v", s.InitialAccounts)
	}

	// Run 2 finishes; a later run starts from scratch.
	report(domain.SetupReport{Step: domain.SetupDone, Status: domain.SetupFinished})
	if in, _ := setups.Input(ctx, id); len(in.EarlierAccounts) != 0 {
		t.Fatalf("a finished run still offered as earlier: %+v", in.EarlierAccounts)
	}
	if s := report(newRun("manara-cccc03")); len(s.InitialAccounts) != 0 {
		t.Fatalf("a run after a finished one kept the old list: %+v", s.InitialAccounts)
	}
}

// Seen on the SM-A045F: the parent chose Finish while the phone was off, and
// the console showed "Finishing..." with no end, waiting for the phone.
func TestFinishEndsTheRunWithoutThePhoneAndALateReportCannotReopenIt(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	p := newParent(t, db, uniqueEmail("finish"), "password one")
	id := "00000000-0000-4000-b000-" + time.Now().Format("150405000000")[:12]
	if err := NewDeviceRepository(db).Create(ctx, &domain.Device{ID: id, ParentID: p.ID, CreatedAt: time.Now()}); err != nil {
		t.Fatal(err)
	}
	setups := NewSetupRepository(db)
	report := func(rep domain.SetupReport) *domain.DeviceSetup {
		t.Helper()
		s, err := setups.Report(ctx, id, rep)
		if err != nil {
			t.Fatal(err)
		}
		return s
	}
	report(domain.SetupReport{Step: domain.SetupPairing, Status: domain.SetupWaitingForParent, Pairing: &domain.QRPairing{Name: "manara-ffff01", Password: "abcdefgh12345678"}})
	report(domain.SetupReport{Step: domain.SetupReconnecting, Status: domain.SetupWaitingForParent})

	if err := setups.RequestFinish(ctx, id); err != nil {
		t.Fatal(err)
	}
	s, err := setups.Get(ctx, id)
	if err != nil {
		t.Fatal(err)
	}
	if s.Step != domain.SetupDone || s.Status != domain.SetupFinished {
		t.Fatalf("finish waited for the phone: %s %s", s.Step, s.Status)
	}
	if err := setups.RequestFinish(ctx, id); err != domain.ErrSetupNotWaiting {
		t.Fatalf("a second finish: %v", err)
	}

	// The phone, still watching, reports once more before it reads the finish.
	if s := report(domain.SetupReport{Step: domain.SetupReconnecting, Status: domain.SetupWaitingForParent}); s.Step != domain.SetupDone {
		t.Fatalf("a late report reopened a finished run: %s %s", s.Step, s.Status)
	}
	if in, _ := setups.Input(ctx, id); !in.Finish {
		t.Fatal("the phone isn't told to finish")
	}
	// Its own done report is still taken; a new run starts over.
	if s := report(domain.SetupReport{Step: domain.SetupDone, Status: domain.SetupFinished}); s.Step != domain.SetupDone {
		t.Fatalf("the phone's done: %s", s.Step)
	}
	s = report(domain.SetupReport{Step: domain.SetupPairing, Status: domain.SetupWaitingForParent, Pairing: &domain.QRPairing{Name: "manara-ffff02", Password: "abcdefgh12345678"}})
	if s.Step != domain.SetupPairing || s.FinishRequested {
		t.Fatalf("a new run didn't start over: %s finish=%v", s.Step, s.FinishRequested)
	}
}
