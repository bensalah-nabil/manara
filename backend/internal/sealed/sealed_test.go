package sealed

import (
	"bytes"
	"errors"
	"strings"
	"testing"
)

func box(t *testing.T, fill byte) *Box {
	t.Helper()
	b, err := New(bytes.Repeat([]byte{fill}, 32))
	if err != nil {
		t.Fatal(err)
	}
	return b
}

func TestASealedValueOpensOnlyOnItsOwnRowWithItsOwnKey(t *testing.T) {
	b := box(t, 1)
	stored, err := b.Seal([]byte(`{"lat":36.8}`), "event:e1")
	if err != nil {
		t.Fatal(err)
	}
	if !IsSealed(stored) || strings.Contains(stored, "36.8") {
		t.Fatalf("stored = %q", stored)
	}
	plain, err := b.Open(stored, "event:e1")
	if err != nil || string(plain) != `{"lat":36.8}` {
		t.Fatalf("open = %q, %v", plain, err)
	}
	if _, err := b.Open(stored, "event:e2"); err == nil {
		t.Fatal("opened on another row")
	}
	if _, err := box(t, 2).Open(stored, "event:e1"); err == nil {
		t.Fatal("opened with another key")
	}
	if _, err := (*Box)(nil).Open(stored, "event:e1"); !errors.Is(err, ErrNoKey) {
		t.Fatalf("no key: %v", err)
	}
}

func TestSealingTwiceGivesDifferentValues(t *testing.T) {
	b := box(t, 1)
	one, _ := b.Seal([]byte("JBSWY3DPEHPK3PXP"), "totp:p1")
	two, _ := b.Seal([]byte("JBSWY3DPEHPK3PXP"), "totp:p1")
	if one == two {
		t.Fatal("same nonce twice")
	}
}

func TestPlainValuesFromBeforeTheKeyStillRead(t *testing.T) {
	for _, b := range []*Box{nil, box(t, 1)} {
		plain, err := b.Open("JBSWY3DPEHPK3PXP", "totp:p1")
		if err != nil || string(plain) != "JBSWY3DPEHPK3PXP" {
			t.Fatalf("plain = %q, %v", plain, err)
		}
	}
	if stored, _ := (*Box)(nil).Seal([]byte("x"), "r"); stored != "x" {
		t.Fatalf("no key sealed: %q", stored)
	}
}

func TestAKeyMustBe32BytesOfBase64(t *testing.T) {
	if _, err := FromBase64("not base64!"); err == nil {
		t.Fatal("bad base64 accepted")
	}
	if _, err := FromBase64("AAAA"); err == nil {
		t.Fatal("short key accepted")
	}
	if _, err := FromBase64(" AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE= \n"); err != nil {
		t.Fatalf("32-byte key refused: %v", err)
	}
}
