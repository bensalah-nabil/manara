package domain

import "testing"

func TestOnlyAShortPlainVersionIsShownToTheParent(t *testing.T) {
	for _, ok := range []string{"1.0.11", "1.0.11-debug", "2.0.0+build.7", "1"} {
		if !ValidAgentVersion(ok) {
			t.Errorf("%q refused", ok)
		}
	}
	for _, bad := range []string{"", "-1.0", "1.0 beta", "<b>1</b>", "1.0.11\n", "123456789012345678901234567890123"} {
		if ValidAgentVersion(bad) {
			t.Errorf("%q accepted", bad)
		}
	}
}
