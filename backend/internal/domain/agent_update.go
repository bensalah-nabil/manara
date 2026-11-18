package domain

import (
	"errors"
	"regexp"
)

// AgentReleasesURL is where every published Manara APK lives: the GitHub release whose tag is
// "v" + its version name, with one asset named manara.apk (docs/play-store.md, "Publish the
// direct APK"). Phones download updates only from under it.
const AgentReleasesURL = "https://github.com/bensalah-nabil/manara/releases/download/"

var sha256Pattern = regexp.MustCompile(`^[0-9a-f]{64}$`)

// AgentUpdate is the version of the directly downloaded Manara that phones should run. The
// server sends it with every sync; a phone that runs an older version code downloads the file,
// checks it against SHA256, and installs it as its device owner (no prompt). Nothing is sent
// while the operator holds updates back (the setting left empty).
type AgentUpdate struct {
	VersionCode int    `json:"versionCode"`
	VersionName string `json:"versionName"`
	URL         string `json:"url"`
	SHA256      string `json:"sha256"`
}

// NewAgentUpdate builds the update for a published release, or explains what is wrong with it.
func NewAgentUpdate(versionCode int, versionName, sha256 string) (AgentUpdate, error) {
	if versionCode <= 0 {
		return AgentUpdate{}, errors.New("version code must be a positive whole number")
	}
	if !ValidAgentVersion(versionName) {
		return AgentUpdate{}, errors.New("version name is not a plain version such as 1.0.31")
	}
	if !sha256Pattern.MatchString(sha256) {
		return AgentUpdate{}, errors.New("sha256 must be 64 lowercase hex digits")
	}
	return AgentUpdate{
		VersionCode: versionCode,
		VersionName: versionName,
		URL:         AgentReleasesURL + "v" + versionName + "/manara.apk",
		SHA256:      sha256,
	}, nil
}
