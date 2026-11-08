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
