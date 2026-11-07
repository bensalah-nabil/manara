package domain

import (
	"context"
	"log"
	"sort"
	"strings"
	"sync"
	"time"
)

// Alert is a message for a parent about one of their children's devices.
// It never carries user content: only which protection broke and when.
type Alert struct {
	ParentID   string
	DeviceID   string
	Title      string
	Message    string
	OccurredAt time.Time
}

// AlertNotifier delivers an Alert outside the console (ntfy, a webhook).
// Best-effort like PushNotifier: the event is already stored, so a delivery
// failure must never fail the sync that reported it.
type AlertNotifier interface {
	Send(ctx context.Context, a Alert) error
}

const (
	enforcementMissing  = "missing"
	enforcementFailed   = "failed"
	enforcementRestored = "restored"
)

// Same wording as the console's protection list (controller/src/protection.ts).
var enforcerNames = map[string]string{
	"location":     "Location sharing",
	"site-filter":  "Site filtering",
	"time-limit":   "App time limits",
	"restrictions": "Settings restrictions",
	"lock":         "Scheduled lock",
	"usage-report": "Usage reporting",
	"browser":      "Chrome rules",
}

var detailSentences = map[string]string{
	"usage_access":                "Usage Access is turned off, so app usage cannot be measured.",
	"device_location_on":          "The phone's Location setting is off.",
	"private_dns_host":            "Private DNS is not set to the filtering server.",
	"host_not_serving":            "The phone could not use the filtering host (it did not answer as a Private DNS server). Check the host name.",
	"failure_setting":             "The phone could not apply the filtering host.",
	"disallow_config_vpn":         "VPN settings are no longer locked.",
	"disallow_config_private_dns": "Private DNS settings are no longer locked.",
	"disallow_factory_reset":      "Factory reset is no longer blocked.",
	"disallow_safe_boot":          "Safe boot is no longer blocked.",
	"disallow_add_user":           "Adding users is no longer blocked.",
}

func payloadText(e *Event, key string) string {
	s, _ := e.Payload[key].(string)
	return s
}

// ProblemKey identifies one protection problem on one device. Failed and
// missing reports of the same problem share a key, and a restored report
// of it clears the throttle for that key.
func ProblemKey(e *Event) string {
	return e.DeviceID + "|" + payloadText(e, "enforcer") + "|" + payloadText(e, "detail")
}

// IsProblemReport reports whether e says a protection is not in effect.
func IsProblemReport(e *Event) bool {
	if e.Kind != EventKindEnforcement {
		return false
	}
	s := payloadText(e, "status")
	return s == enforcementMissing || s == enforcementFailed
}

func isRestoredReport(e *Event) bool {
	return e.Kind == EventKindEnforcement && payloadText(e, "status") == enforcementRestored
}

func deviceName(d *Device) string {
	if d.Label != "" {
		return d.Label
	}
	if name := strings.TrimSpace(d.Info.Manufacturer + " " + d.Info.Model); name != "" {
		return name
	}
	return "A device"
}

// AlertFor builds the alert for a problem report; ok is false for any
// other event.
func AlertFor(d *Device, e *Event) (Alert, bool) {
	if !IsProblemReport(e) {
		return Alert{}, false
	}
	enforcer := payloadText(e, "enforcer")
	title := enforcerNames[enforcer]
	if title == "" {
		title = enforcer
	}
	if title == "" {
		title = "A protection"
	}
	detail := payloadText(e, "detail")
	sentence := detailSentences[detail]
	if sentence == "" {
		sentence = detail
	}
	if sentence == "" {
		sentence = "A problem was reported."
	}
	return Alert{
		ParentID:   d.ParentID,
		DeviceID:   d.ID,
		Title:      deviceName(d) + ": " + title + " needs attention",
		Message:    sentence + " Reported " + e.OccurredAt.UTC().Format("2006-01-02 15:04") + " UTC.",
		OccurredAt: e.OccurredAt,
	}, true
}

// AlertThrottle stops a problem that is reported on every sync from
// producing an alert every 15 minutes. In memory: a server restart can
// repeat one alert, which is the safer way to be wrong.
type AlertThrottle struct {
	mu     sync.Mutex
	window time.Duration
	last   map[string]time.Time
}

func NewAlertThrottle(window time.Duration) *AlertThrottle {
	return &AlertThrottle{window: window, last: map[string]time.Time{}}
}

// Allow reports whether key may alert now, and records it if so.
func (t *AlertThrottle) Allow(key string, now time.Time) bool {
	t.mu.Lock()
	defer t.mu.Unlock()
	for k, at := range t.last {
		if now.Sub(at) >= t.window {
			delete(t.last, k)
		}
	}
	if _, recent := t.last[key]; recent {
		return false
	}
	t.last[key] = now
	return true
}

// Forget makes key alert again on its next report.
func (t *AlertThrottle) Forget(key string) {
	t.mu.Lock()
	defer t.mu.Unlock()
	delete(t.last, key)
}

// AlertService turns newly stored events into alerts.
type AlertService struct {
	Devices  DeviceRepository
	Notifier AlertNotifier
	Throttle *AlertThrottle
	Now      func() time.Time
	// SendTimeout bounds one delivery; zero means 10 seconds.
	SendTimeout time.Duration
}

// HandleNewEvents must only be given events that were newly stored, never a
// re-sent backlog, or a dropped response would alert twice.
func (s *AlertService) HandleNewEvents(ctx context.Context, deviceID string, events []*Event) {
	// Only a problem's newest report in the batch counts: one that was
	// already restored by a later report is not worth waking a parent for.
	ordered := append([]*Event(nil), events...)
	sort.SliceStable(ordered, func(i, j int) bool { return ordered[i].OccurredAt.Before(ordered[j].OccurredAt) })
	newest := map[string]*Event{}
	var keys []string
	for _, e := range ordered {
		if !IsProblemReport(e) && !isRestoredReport(e) {
			continue
		}
		key := ProblemKey(e)
		if _, seen := newest[key]; !seen {
			keys = append(keys, key)
		}
		newest[key] = e
	}
	var problems []*Event
	for _, key := range keys {
		if e := newest[key]; isRestoredReport(e) {
			s.Throttle.Forget(key)
		} else {
			problems = append(problems, e)
		}
	}
	if len(problems) == 0 {
		return
	}

	device, err := s.Devices.FindByID(ctx, deviceID)
	if err != nil || device == nil {
		log.Printf("alerts: look up device %s: %v", deviceID, err)
		return
	}
	timeout := s.SendTimeout
	if timeout == 0 {
		timeout = 10 * time.Second
	}
	for _, e := range problems {
		if !s.Throttle.Allow(ProblemKey(e), s.Now()) {
			continue
		}
		alert, _ := AlertFor(device, e)
		sendCtx, cancel := context.WithTimeout(ctx, timeout)
		if err := s.Notifier.Send(sendCtx, alert); err != nil {
			log.Printf("alerts: send for device %s: %v", deviceID, err)
		}
		cancel()
	}
}
