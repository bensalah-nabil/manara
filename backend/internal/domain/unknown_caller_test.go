package domain

import (
	"context"
	"strings"
	"testing"
	"time"
)

func call(id, number, direction string, at time.Time) *Event {
	p := map[string]any{"direction": direction, "durationSeconds": float64(30)}
	if number != "" {
		p["number"] = number
	}
	return &Event{ID: id, DeviceID: "dev-1", Kind: EventKindCall, OccurredAt: at, Payload: p}
}

func TestNumbersMatchWhateverTheirPrefix(t *testing.T) {
	for _, n := range []string{"+216 22 123 456", "0021622123456", "22123456", "22-123-456", "(+216) 22.123.456"} {
		if got := NumberKey(n); got != "22123456" {
			t.Errorf("%q -> %q", n, got)
		}
	}
	for _, n := range []string{"", "private", "85", "*123#"} {
		if got := NumberKey(n); got != "" {
			t.Errorf("%q -> %q, want nothing comparable", n, got)
		}
	}
}

func TestOnlyCallsToTheChildFromOtherNumbersAreUnknown(t *testing.T) {
	known := []string{"+216 22 123 456"}
	cases := []struct {
		name    string
		event   *Event
		unknown bool
	}{
		{"a known number", call("a", "22123456", "incoming", t0), false},
		{"a known number, other prefix", call("b", "0021622123456", "missed", t0), false},
		{"a stranger calling", call("c", "+216 98 765 432", "incoming", t0), true},
		{"a stranger's missed call", call("d", "98765432", "missed", t0), true},
		{"a stranger rejected", call("e", "98765432", "rejected", t0), true},
		{"a hidden number", call("f", "private", "incoming", t0), true},
		{"the child calling out", call("g", "98765432", "outgoing", t0), false},
		{"a call in WhatsApp (no number)", &Event{Kind: EventKindCall, Payload: map[string]any{"app": "WhatsApp", "direction": "incoming"}}, false},
		{"not a call", enforcement("dev-1", "lock", "missing", "", t0), false},
	}
	for _, c := range cases {
		if _, got := UnknownCaller(c.event, known); got != c.unknown {
			t.Errorf("%s: unknown = %v, want %v", c.name, got, c.unknown)
		}
	}
}

func TestTheKnownNumbersStayOffThePhone(t *testing.T) {
	p := Policy{Version: 3, CallAlerts: &CallAlerts{Enabled: true, KnownNumbers: []string{"22123456"}}}
	if p.ForPhone().CallAlerts != nil {
		t.Fatal("the phone would receive the parent's numbers")
	}
	if p.CallAlerts == nil {
		t.Fatal("ForPhone must not change the stored policy")
	}
}

func TestKnownNumbersAreChecked(t *testing.T) {
	good := &CallAlerts{Enabled: true, KnownNumbers: []string{"+216 22 123 456", "(71) 123-456"}}
	if err := good.Validate(); err != nil {
		t.Fatal(err)
	}
	for _, bad := range []string{"call mum", "12", "+216 22 123 456 ext 5", strings.Repeat("1", 31)} {
		if err := (&CallAlerts{KnownNumbers: []string{bad}}).Validate(); err == nil {
			t.Errorf("%q accepted", bad)
		}
	}
	many := make([]string, MaxKnownNumbers+1)
	for i := range many {
		many[i] = "22123456"
	}
	if err := (&CallAlerts{KnownNumbers: many}).Validate(); err == nil {
		t.Error("too many numbers accepted")
	}
}

type policyOf struct{ p *Policy }

func (s policyOf) Get(context.Context, string) (*Policy, error) { return s.p, nil }
func (s policyOf) Set(_ context.Context, _ string, p Policy) (Policy, error) {
	return p, nil
}

func TestAStrangerAlertsOncePerNumberAndNeverSaysTheNumber(t *testing.T) {
	rec := &recordingNotifier{}
	svc, _ := newService(rec)
	svc.Policies = policyOf{&Policy{CallAlerts: &CallAlerts{Enabled: true, KnownNumbers: []string{"22123456"}}}}
	svc.HandleNewEvents(context.Background(), "dev-1", []*Event{
		call("1", "22123456", "incoming", t0),
		call("2", "98765432", "missed", t0),
		call("3", "98765432", "incoming", t0.Add(time.Minute)),
		call("4", "50111222", "incoming", t0.Add(2*time.Minute)),
	})
	if len(rec.sent) != 2 {
		t.Fatalf("sent %d alerts, want one per unknown number: %+v", len(rec.sent), rec.sent)
	}
	for _, a := range rec.sent {
		if strings.Contains(a.Title+a.Message, "98765432") || strings.Contains(a.Title+a.Message, "50111222") {
			t.Errorf("the alert carries the number: %+v", a)
		}
		if !strings.Contains(a.Title, "a number you don't know") {
			t.Errorf("title = %q", a.Title)
		}
	}
	// The same stranger calling again inside the throttle window adds nothing.
	svc.HandleNewEvents(context.Background(), "dev-1", []*Event{call("5", "98765432", "incoming", t0.Add(time.Hour))})
	if len(rec.sent) != 2 {
		t.Fatalf("a repeat alerted: %d", len(rec.sent))
	}
}

func TestNoAlertWhenCallAlertsAreOff(t *testing.T) {
	for name, p := range map[string]*Policy{
		"no policy":  nil,
		"not set":    {},
		"turned off": {CallAlerts: &CallAlerts{Enabled: false}},
	} {
		rec := &recordingNotifier{}
		svc, _ := newService(rec)
		svc.Policies = policyOf{p}
		svc.HandleNewEvents(context.Background(), "dev-1", []*Event{call("1", "98765432", "incoming", t0)})
		if len(rec.sent) != 0 {
			t.Errorf("%s: alerted", name)
		}
	}
}
