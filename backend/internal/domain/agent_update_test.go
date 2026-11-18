package domain

import (
	"strings"
	"testing"
)

const sum = "f886171e62f38f747435fab6b6cbc9813af85780348b54c5e05208ed69a1a025"

func TestAnUpdatePointsAtItsGitHubRelease(t *testing.T) {
	u, err := NewAgentUpdate(31, "1.0.31", sum)
	if err != nil {
		t.Fatal(err)
	}
	if u.URL != "https://github.com/bensalah-nabil/manara/releases/download/v1.0.31/manara.apk" {
		t.Errorf("url = %s", u.URL)
	}
	if u.VersionCode != 31 || u.SHA256 != sum {
		t.Errorf("update = %+v", u)
	}
}

func TestAMistypedUpdateIsRefused(t *testing.T) {
	for name, try := range map[string]func() error{
		"zero code":     func() error { _, err := NewAgentUpdate(0, "1.0.31", sum); return err },
		"bad name":      func() error { _, err := NewAgentUpdate(31, "1.0 beta", sum); return err },
		"path in name":  func() error { _, err := NewAgentUpdate(31, "../x", sum); return err },
		"short sum":     func() error { _, err := NewAgentUpdate(31, "1.0.31", sum[:63]); return err },
		"uppercase sum": func() error { _, err := NewAgentUpdate(31, "1.0.31", strings.ToUpper(sum)); return err },
	} {
		if try() == nil {
			t.Errorf("%s accepted", name)
		}
	}
}
