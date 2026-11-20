package postgres

import (
	"context"
	"testing"
	"time"

	"manara/backend/internal/domain"
)

func TestBetaSignupsAreStoredListedFollowedUpAndPurged(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	repo := NewBetaSignupRepository(db)
	old := time.Now().Add(-200 * 24 * time.Hour)

	s, err := domain.BetaSignup{FirstName: "Sara", WhatsApp: "+216 22 123 456", Place: "Sfax", CallLanguage: "ar",
		Brand: "xiaomi", ChildAge: "10to13", Worries: []string{"night"}, Slots: []string{"weekday-evening"},
		PageLanguage: "ar", OwnChild: true}.Normalize()
	if err != nil {
		t.Fatal(err)
	}
	added, err := repo.AddBetaSignup(ctx, s)
	if err != nil {
		t.Fatal(err)
	}
	stale := s
	stale.CreatedAt = old
	staleAdded, err := repo.AddBetaSignup(ctx, stale)
	if err != nil {
		t.Fatal(err)
	}

	list, err := repo.ListBetaSignups(ctx, 500)
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, x := range list {
		if x.ID == added.ID {
			found = true
			if x.Status != "new" || len(x.Worries) != 1 || x.Worries[0] != "night" || x.WhatsApp != "+216 22 123 456" {
				t.Fatalf("read back %+v", x)
			}
		}
	}
	if !found {
		t.Fatal("the new sign-up isn't listed")
	}

	if ok, err := repo.SetBetaSignupStatus(ctx, added.ID, "contacted", time.Now()); err != nil || !ok {
		t.Fatalf("status: %v %v", ok, err)
	}
	if ok, _ := repo.SetBetaSignupStatus(ctx, "not-a-uuid", "contacted", time.Now()); ok {
		t.Fatal("a malformed id was accepted")
	}

	if _, err := repo.PurgeBetaSignups(ctx, time.Now().Add(-domain.BetaSignupRetention)); err != nil {
		t.Fatal(err)
	}
	list, _ = repo.ListBetaSignups(ctx, 500)
	for _, x := range list {
		if x.ID == staleAdded.ID {
			t.Fatal("a sign-up older than the retention was kept")
		}
	}
}
