package domain

import (
	"context"
	"strings"
	"sync"
	"testing"
	"time"
)

var t0 = time.Date(2026, 11, 5, 14, 30, 0, 0, time.UTC)

func enforcement(deviceID, enforcer, status, detail string, at time.Time) *Event {
	p := map[string]any{"enforcer": enforcer, "status": status}
	if detail != "" {
		p["detail"] = detail
	}
	return &Event{ID: enforcer + status + detail + at.String(), DeviceID: deviceID, Kind: EventKindEnforcement, OccurredAt: at, Payload: p}
}

func TestAlertForOnlyProblemReports(t *testing.T) {
	d := &Device{ID: "dev-1", ParentID: "parent-1", Label: "Sam"}
	for _, status := range []string{"restored", "", "unknown"} {
		if _, ok := AlertFor(d, enforcement("dev-1", "restrictions", status, "", t0)); ok {
			t.Errorf("status %q must not alert", status)
		}
	}
	heartbeat := &Event{DeviceID: "dev-1", Kind: EventKindHeartbeat, Payload: map[string]any{"status": "missing"}}
	if _, ok := AlertFor(d, heartbeat); ok {
		t.Error("a non-enforcement event must not alert")
	}
	for _, status := range []string{"missing", "failed"} {
		if _, ok := AlertFor(d, enforcement("dev-1", "restrictions", status, "", t0)); !ok {
			t.Errorf("status %q must alert", status)
		}
	}
}

func TestAlertForWording(t *testing.T) {
	d := &Device{ID: "dev-1", ParentID: "parent-1", Info: DeviceInfo{Manufacturer: "samsung", Model: "SM-A045F"}}
	a, _ := AlertFor(d, enforcement("dev-1", "restrictions", "missing", "disallow_config_private_dns", t0))
	if a.Title != "samsung SM-A045F: Settings restrictions needs attention" {
		t.Errorf("title = %q", a.Title)
	}
	if a.Message != "Private DNS settings are no longer locked. Reported 2026-11-05 14:30 UTC." {
		t.Errorf("message = %q", a.Message)
	}
	if a.ParentID != "parent-1" || a.DeviceID != "dev-1" {
		t.Errorf("ids = %q %q", a.ParentID, a.DeviceID)
	}
}

func TestAlertForUsageReportingWithoutUsageAccess(t *testing.T) {
	a, ok := AlertFor(&Device{ID: "d", Label: "Sam"}, enforcement("d", "usage-report", "missing", "usage_access", t0))
	if !ok || a.Title != "Sam: Usage reporting needs attention" || !strings.HasPrefix(a.Message, "Usage Access is turned off, so app usage cannot be measured.") {
		t.Errorf("got %v: %q / %q", ok, a.Title, a.Message)
	}
}

func TestAlertForFallbacks(t *testing.T) {
	a, _ := AlertFor(&Device{ID: "d"}, enforcement("d", "mystery", "failed", "suspend: SecurityException", t0))
	if a.Title != "A device: mystery needs attention" || !strings.HasPrefix(a.Message, "suspend: SecurityException ") {
		t.Errorf("unknown enforcer/detail must be shown as reported: %q / %q", a.Title, a.Message)
	}
	b, _ := AlertFor(&Device{ID: "d", Label: "Sam"}, &Event{DeviceID: "d", Kind: EventKindEnforcement, OccurredAt: t0, Payload: map[string]any{"status": "failed"}})
	if b.Title != "Sam: A protection needs attention" || !strings.HasPrefix(b.Message, "A problem was reported.") {
		t.Errorf("empty payload: %q / %q", b.Title, b.Message)
	}
}

func TestThrottleBlocksRepeatsUntilTheWindowPasses(t *testing.T) {
	th := NewAlertThrottle(time.Hour)
	if !th.Allow("k", t0) {
		t.Fatal("first must be allowed")
	}
	if th.Allow("k", t0.Add(59*time.Minute)) {
		t.Fatal("repeat inside the window must be blocked")
	}
	if !th.Allow("other", t0.Add(time.Minute)) {
		t.Fatal("a different key is independent")
	}
	if !th.Allow("k", t0.Add(time.Hour)) {
		t.Fatal("must be allowed again once the window has passed")
	}
}

func TestThrottleForgetAllowsAnImmediateRepeat(t *testing.T) {
	th := NewAlertThrottle(time.Hour)
	th.Allow("k", t0)
	th.Forget("k")
	if !th.Allow("k", t0.Add(time.Minute)) {
		t.Fatal("Forget must clear the key")
	}
}

type recordingNotifier struct {
	mu   sync.Mutex
	sent []Alert
	err  error
}

func (r *recordingNotifier) Send(_ context.Context, a Alert) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.sent = append(r.sent, a)
	return r.err
}

type oneDevice struct {
	d     *Device
	err   error
	calls int
}

func (o *oneDevice) Create(context.Context, *Device) error { return nil }
func (o *oneDevice) FindByID(context.Context, string) (*Device, error) {
	o.calls++
	return o.d, o.err
}
func (o *oneDevice) ListByParent(context.Context, string) ([]*Device, error)  { return nil, nil }
func (o *oneDevice) UpdateAgentVersion(context.Context, string, string) error { return nil }
func (o *oneDevice) UpdateLastSeen(context.Context, string, time.Time) error  { return nil }
func (o *oneDevice) UpdatePushToken(context.Context, string, string) error    { return nil }

func newService(n AlertNotifier) (*AlertService, *oneDevice) {
	dev := &oneDevice{d: &Device{ID: "dev-1", ParentID: "parent-1", Label: "Sam"}}
	return &AlertService{Devices: dev, Notifier: n, Throttle: NewAlertThrottle(6 * time.Hour), Now: func() time.Time { return t0 }}, dev
}

func TestServiceAlertsOnceForARepeatedProblem(t *testing.T) {
	rec := &recordingNotifier{}
	svc, _ := newService(rec)
	e := enforcement("dev-1", "time-limit", "failed", "suspend refused: com.x", t0)
	svc.HandleNewEvents(context.Background(), "dev-1", []*Event{e})
	svc.HandleNewEvents(context.Background(), "dev-1", []*Event{e})
	if len(rec.sent) != 1 {
		t.Fatalf("sent %d alerts, want 1", len(rec.sent))
	}
}

func TestServiceAlertsAgainAfterTheProblemWasRestored(t *testing.T) {
	rec := &recordingNotifier{}
	svc, _ := newService(rec)
	ctx := context.Background()
	svc.HandleNewEvents(ctx, "dev-1", []*Event{enforcement("dev-1", "location", "missing", "device_location_on", t0)})
	svc.HandleNewEvents(ctx, "dev-1", []*Event{enforcement("dev-1", "location", "restored", "device_location_on", t0.Add(time.Minute))})
	svc.HandleNewEvents(ctx, "dev-1", []*Event{enforcement("dev-1", "location", "missing", "device_location_on", t0.Add(2*time.Minute))})
	if len(rec.sent) != 2 {
		t.Fatalf("sent %d alerts, want 2 (break, fix, break again)", len(rec.sent))
	}
}

func TestServiceSkipsAProblemAlreadyRestoredInTheSameBatch(t *testing.T) {
	rec := &recordingNotifier{}
	svc, _ := newService(rec)
	svc.HandleNewEvents(context.Background(), "dev-1", []*Event{
		enforcement("dev-1", "location", "restored", "device_location_on", t0.Add(time.Minute)),
		enforcement("dev-1", "location", "missing", "device_location_on", t0),
	})
	if len(rec.sent) != 0 {
		t.Fatalf("sent %d alerts, want 0: the later report restored it", len(rec.sent))
	}
}

func TestServiceOneAlertPerProblemInABatch(t *testing.T) {
	rec := &recordingNotifier{}
	svc, dev := newService(rec)
	svc.HandleNewEvents(context.Background(), "dev-1", []*Event{
		enforcement("dev-1", "restrictions", "failed", "add disallow_safe_boot: X", t0),
		enforcement("dev-1", "restrictions", "failed", "add disallow_safe_boot: X", t0.Add(time.Minute)),
		enforcement("dev-1", "site-filter", "failed", "failure_setting", t0),
	})
	if len(rec.sent) != 2 {
		t.Fatalf("sent %d alerts, want 2 (one per distinct problem)", len(rec.sent))
	}
	if dev.calls != 1 {
		t.Fatalf("device looked up %d times, want 1", dev.calls)
	}
}

func TestServiceIgnoresUninterestingEventsWithoutALookup(t *testing.T) {
	rec := &recordingNotifier{}
	svc, dev := newService(rec)
	svc.HandleNewEvents(context.Background(), "dev-1", []*Event{
		{ID: "h", DeviceID: "dev-1", Kind: EventKindHeartbeat, OccurredAt: t0},
		{ID: "u", DeviceID: "dev-1", Kind: EventKindUsage, OccurredAt: t0},
	})
	if len(rec.sent) != 0 || dev.calls != 0 {
		t.Fatalf("sent %d, lookups %d; want 0 and 0", len(rec.sent), dev.calls)
	}
}

func TestServiceSurvivesAFailingNotifierAndADeviceLookupError(t *testing.T) {
	rec := &recordingNotifier{err: context.DeadlineExceeded}
	svc, dev := newService(rec)
	e := enforcement("dev-1", "lock", "failed", "", t0)
	svc.HandleNewEvents(context.Background(), "dev-1", []*Event{e}) // must not panic
	dev.err = context.Canceled
	svc.HandleNewEvents(context.Background(), "dev-1", []*Event{enforcement("dev-1", "lock", "failed", "x", t0)})
	dev.err, dev.d = nil, nil
	svc.HandleNewEvents(context.Background(), "dev-1", []*Event{enforcement("dev-1", "lock", "failed", "y", t0)})
	if len(rec.sent) != 1 {
		t.Fatalf("sent %d, want 1 (the lookup failures send nothing)", len(rec.sent))
	}
}
