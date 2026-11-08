package domain

import (
	"strings"
	"testing"
	"time"
)

// RFC 6238 appendix B, SHA-1, secret "12345678901234567890": the last 6 of the 8-digit codes.
func TestTOTPMatchesTheRFCVectors(t *testing.T) {
	secret := []byte("12345678901234567890")
	vectors := map[int64]string{
		59:          "287082",
		1111111109:  "081804",
		1111111111:  "050471",
		1234567890:  "005924",
		2000000000:  "279037",
		20000000000: "353130",
	}
	for unix, want := range vectors {
		if got := TOTPCode(secret, TOTPStep(time.Unix(unix, 0))); got != want {
			t.Errorf("T=%d: %s, want %s", unix, got, want)
		}
	}
}

func TestVerifyAcceptsNeighbouringStepsOnceEach(t *testing.T) {
	secretB32 := b32.EncodeToString([]byte("12345678901234567890"))
	now := time.Unix(1111111111, 0)
	code := TOTPCode([]byte("12345678901234567890"), TOTPStep(now))
	step, ok := VerifyTOTP(secretB32, code, now, 0)
	if !ok || step != TOTPStep(now) {
		t.Fatalf("current code refused: %d %v", step, ok)
	}
	if _, ok := VerifyTOTP(secretB32, code, now, step); ok {
		t.Fatal("the same code was accepted twice")
	}
	if _, ok := VerifyTOTP(secretB32, code, now.Add(30*time.Second), 0); !ok {
		t.Fatal("a code from 30 s ago (a slow typist) refused")
	}
	if _, ok := VerifyTOTP(secretB32, code, now.Add(90*time.Second), 0); ok {
		t.Fatal("a code from 90 s ago accepted")
	}
	if _, ok := VerifyTOTP(secretB32, " "+code[:3]+" "+code[3:], now, 0); !ok {
		t.Fatal("spaces in the typed code should not matter")
	}
	if _, ok := VerifyTOTP(secretB32, "12345", now, 0); ok {
		t.Fatal("5 digits accepted")
	}
	if _, ok := VerifyTOTP("not base32!", code, now, 0); ok {
		t.Fatal("a broken secret verified something")
	}
}

func TestSecretsAndRecoveryCodes(t *testing.T) {
	a, _ := NewTOTPSecret()
	b, _ := NewTOTPSecret()
	if a == b || len(a) != 32 {
		t.Fatalf("secrets %q %q", a, b)
	}
	codes, err := NewRecoveryCodes()
	if err != nil || len(codes) != RecoveryCodeCount {
		t.Fatal(codes, err)
	}
	seen := map[string]bool{}
	for _, c := range codes {
		if len(c) != 11 || c[5] != '-' || seen[c] {
			t.Fatalf("bad or repeated code %q", c)
		}
		seen[c] = true
		if !LooksLikeRecoveryCode(c) || LooksLikeRecoveryCode("123456") {
			t.Fatal("recovery codes and app codes are told apart")
		}
	}
	if HashRecoveryCode(codes[0]) != HashRecoveryCode(" "+strings.ToLower(strings.ReplaceAll(codes[0], "-", ""))+" ") {
		t.Fatal("case, spaces and the dash must not matter")
	}
}

func TestOTPAuthURI(t *testing.T) {
	uri := OTPAuthURI("sara.mum@example.com", "JBSWY3DPEHPK3PXP")
	for _, part := range []string{"otpauth://totp/Manara:sara.mum@example.com?", "secret=JBSWY3DPEHPK3PXP", "issuer=Manara", "digits=6", "period=30"} {
		if !strings.Contains(uri, part) {
			t.Errorf("%s missing %s", uri, part)
		}
	}
}
