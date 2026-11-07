package domain

import (
	"testing"
	"time"
)

// RFC 6238 appendix B, SHA-256 column (30-second steps, 8 digits).
func TestHOTPMatchesRFC6238SHA256Vectors(t *testing.T) {
	secret := []byte("12345678901234567890123456789012")
	cases := []struct {
		unix int64
		want string
	}{
		{59, "46119246"},
		{1111111109, "68084774"},
		{1111111111, "67062674"},
		{1234567890, "91819424"},
		{2000000000, "90698825"},
		{20000000000, "77737706"},
	}
	for _, c := range cases {
		if got := HOTP(secret, uint64(c.unix/30), 8); got != c.want {
			t.Errorf("HOTP at %d = %s, want %s", c.unix, got, c.want)
		}
	}
}

func TestReleaseCodeChangesPerStepAndReportsItsEnd(t *testing.T) {
	secret := []byte("12345678901234567890123456789012")
	start := time.Unix(1_800_000_000-1_800_000_000%600, 0)
	a, until := ReleaseCode(secret, start.Add(time.Minute))
	b, _ := ReleaseCode(secret, start.Add(9*time.Minute))
	c, _ := ReleaseCode(secret, start.Add(10*time.Minute))
	if a != b {
		t.Errorf("same step gave %s and %s", a, b)
	}
	if a == c {
		t.Errorf("next step repeated %s", a)
	}
	if len(a) != ReleaseCodeDigits {
		t.Errorf("code %q has %d digits", a, len(a))
	}
	if !until.Equal(start.Add(10 * time.Minute)) {
		t.Errorf("validUntil %v, want %v", until, start.Add(10*time.Minute))
	}
}

func TestReleaseModeValidate(t *testing.T) {
	for _, ok := range []ReleaseMode{ReleaseRemove, ReleaseTransfer} {
		if err := ok.Validate(); err != nil {
			t.Errorf("%s: %v", ok, err)
		}
	}
	for _, bad := range []ReleaseMode{"", "wipe", "REMOVE"} {
		if bad.Validate() == nil {
			t.Errorf("%q accepted", bad)
		}
	}
}

func TestNewReleaseSecretIsRandom(t *testing.T) {
	a, err := NewReleaseSecret()
	if err != nil {
		t.Fatal(err)
	}
	b, _ := NewReleaseSecret()
	if len(a) != ReleaseSecretBytes || string(a) == string(b) {
		t.Errorf("secrets not %d random bytes", ReleaseSecretBytes)
	}
}
