package domain

import (
	"context"
	"errors"
	"fmt"
	"log"
	"strings"
	"sync"
	"time"
)

// What the admin console controls at run time (docs/admin-console.md, part 1): which Manara version
// phones are offered, and a notice at the top of every parent's console. Stored in app_settings.

const (
	SettingAgentUpdate = "agent_update"
	SettingNotice      = "notice"
)

// SettingsStore keeps one JSON value per key.
type SettingsStore interface {
	// Setting decodes the key's value into into; false when the key has none.
	Setting(ctx context.Context, key string, into any) (bool, error)
	PutSetting(ctx context.Context, key string, value any, by string) error
	DeleteSetting(ctx context.Context, key string) error
}

// AgentUpdateSetting is the admin console's choice of version. Paused holds every update back;
// otherwise the three fields name the release. No setting at all means Render's AGENT_UPDATE_*.
type AgentUpdateSetting struct {
	Paused      bool   `json:"paused"`
	VersionCode int    `json:"versionCode,omitempty"`
	VersionName string `json:"versionName,omitempty"`
	SHA256      string `json:"sha256,omitempty"`
}

// AgentUpdateSource answers which version phones are offered now: the admin console's setting
// when there is one, else the server's own settings. Read at most every 30 seconds, so a change in
// the console reaches phones within a minute without a database read on every sync.
type AgentUpdateSource struct {
	Settings SettingsStore
	Fallback *AgentUpdate
	Now      func() time.Time

	mu       sync.Mutex
	cached   *AgentUpdate
	cachedAt time.Time
	loaded   bool
}

const agentUpdateCache = 30 * time.Second

func (s *AgentUpdateSource) now() time.Time {
	if s.Now != nil {
		return s.Now()
	}
	return time.Now()
}

// Current is the offer to put in a sync response, or nil to hold updates back.
func (s *AgentUpdateSource) Current(ctx context.Context) *AgentUpdate {
	if s == nil {
		return nil
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.loaded && s.now().Sub(s.cachedAt) < agentUpdateCache {
		return s.cached
	}
	offer, err := s.read(ctx)
	if err != nil {
		// Keep what was offered before; a database hiccup must not change what phones are told.
		log.Printf("agent updates: read setting: %v", err)
		if s.loaded {
			return s.cached
		}
		return s.Fallback
	}
	s.cached, s.cachedAt, s.loaded = offer, s.now(), true
	return offer
}

// Forget makes the next Current read the setting again (after the admin changes it).
func (s *AgentUpdateSource) Forget() {
	if s == nil {
		return
	}
	s.mu.Lock()
	s.loaded = false
	s.mu.Unlock()
}

func (s *AgentUpdateSource) read(ctx context.Context) (*AgentUpdate, error) {
	if s.Settings == nil {
		return s.Fallback, nil
	}
	var setting AgentUpdateSetting
	found, err := s.Settings.Setting(ctx, SettingAgentUpdate, &setting)
	if err != nil {
		return nil, err
	}
	if !found {
		return s.Fallback, nil
	}
	if setting.Paused {
		return nil, nil
	}
	u, err := NewAgentUpdate(setting.VersionCode, setting.VersionName, setting.SHA256)
	if err != nil {
		// A stored setting that no longer validates holds updates back rather than offer a bad file.
		log.Printf("agent updates: stored setting invalid, holding updates: %v", err)
		return nil, nil
	}
	return &u, nil
}

// Notice is a message shown at the top of every parent's console, in their language.
type Notice struct {
	// Level is "info" or "warning".
	Level string `json:"level"`
	// Text holds "en", and optionally "fr" and "ar"; a missing language falls back to English.
	Text  map[string]string `json:"text"`
	Until *time.Time        `json:"until,omitempty"`
}

const MaxNoticeLength = 300

var ErrInvalidNotice = errors.New("invalid notice")

func (n Notice) Validate(now time.Time) error {
	if n.Level != "info" && n.Level != "warning" {
		return fmt.Errorf("%w: level must be info or warning", ErrInvalidNotice)
	}
	if strings.TrimSpace(n.Text["en"]) == "" {
		return fmt.Errorf("%w: the English text is required", ErrInvalidNotice)
	}
	for lang, text := range n.Text {
		if lang != "en" && lang != "fr" && lang != "ar" {
			return fmt.Errorf("%w: unknown language %q", ErrInvalidNotice, lang)
		}
		if len([]rune(text)) > MaxNoticeLength {
			return fmt.Errorf("%w: at most %d characters", ErrInvalidNotice, MaxNoticeLength)
		}
	}
	if n.Until != nil && !n.Until.After(now) {
		return fmt.Errorf("%w: the end is already past", ErrInvalidNotice)
	}
	return nil
}

// ActiveAt reports whether the notice should still show.
func (n Notice) ActiveAt(now time.Time) bool {
	return n.Until == nil || n.Until.After(now)
}
