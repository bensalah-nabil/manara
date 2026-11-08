package postgres

import (
	"context"
	"encoding/base32"
	"errors"
	"testing"
	"time"

	"manara/backend/internal/domain"
)

func codeAt(t *testing.T, secretB32 string, at time.Time) string {
	t.Helper()
	raw, err := base32.StdEncoding.WithPadding(base32.NoPadding).DecodeString(secretB32)
	if err != nil {
		t.Fatal(err)
	}
	return domain.TOTPCode(raw, domain.TOTPStep(at))
}

func TestTwoStepSignInLifecycle(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	p := newParent(t, db, uniqueEmail("totp"), "password one")
	tf := NewTwoFactorRepository(db)
	t0 := time.Now()

	if on, _ := tf.Enabled(ctx, p.ID); on {
		t.Fatal("on before setup")
	}
	if _, err := tf.Enable(ctx, p.ID, "123456", t0); !errors.Is(err, domain.ErrTwoFactorPending) {
		t.Fatalf("enable without setup: %v", err)
	}
	secret, err := tf.BeginSetup(ctx, p.ID)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := tf.Enable(ctx, p.ID, "000000", t0); !errors.Is(err, domain.ErrBadSecondFactor) {
		t.Fatalf("wrong code enabled it: %v", err)
	}
	recovery, err := tf.Enable(ctx, p.ID, codeAt(t, secret, t0), t0)
	if err != nil || len(recovery) != domain.RecoveryCodeCount {
		t.Fatalf("enable: %v %v", recovery, err)
	}
	if on, _ := tf.Enabled(ctx, p.ID); !on {
		t.Fatal("not on after enable")
	}

	// The step used to enable can't sign in; the next one can, once.
	if err := tf.Check(ctx, p.ID, codeAt(t, secret, t0), t0); !errors.Is(err, domain.ErrBadSecondFactor) {
		t.Fatal("the enabling code was accepted again")
	}
	t1 := t0.Add(30 * time.Second)
	if err := tf.Check(ctx, p.ID, codeAt(t, secret, t1), t1); err != nil {
		t.Fatalf("next code: %v", err)
	}
	if err := tf.Check(ctx, p.ID, codeAt(t, secret, t1), t1); !errors.Is(err, domain.ErrBadSecondFactor) {
		t.Fatal("a code was accepted twice")
	}

	// Recovery codes: once each, whatever the case or dash.
	if err := tf.Check(ctx, p.ID, recovery[0], t1); err != nil {
		t.Fatalf("recovery code: %v", err)
	}
	if err := tf.Check(ctx, p.ID, recovery[0], t1); !errors.Is(err, domain.ErrBadSecondFactor) {
		t.Fatal("a recovery code was accepted twice")
	}

	// A challenge lives 5 minutes and ends when used.
	token, err := tf.NewChallenge(ctx, p.ID, t1)
	if err != nil {
		t.Fatal(err)
	}
	if id, err := tf.ChallengeParent(ctx, token, t1.Add(time.Minute)); err != nil || id != p.ID {
		t.Fatalf("live challenge: %q %v", id, err)
	}
	if _, err := tf.ChallengeParent(ctx, token, t1.Add(6*time.Minute)); !errors.Is(err, domain.ErrChallengeInvalid) {
		t.Fatal("an expired challenge was accepted")
	}
	_ = tf.EndChallenge(ctx, token)
	if _, err := tf.ChallengeParent(ctx, token, t1); !errors.Is(err, domain.ErrChallengeInvalid) {
		t.Fatal("an ended challenge was accepted")
	}

	if err := tf.Disable(ctx, p.ID); err != nil {
		t.Fatal(err)
	}
	if on, _ := tf.Enabled(ctx, p.ID); on {
		t.Fatal("still on after disable")
	}
	if err := tf.Check(ctx, p.ID, recovery[1], t1); !errors.Is(err, domain.ErrBadSecondFactor) {
		t.Fatal("recovery codes survived disabling")
	}
}
