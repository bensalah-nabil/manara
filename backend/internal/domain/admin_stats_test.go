package domain

import (
	"context"
	"errors"
	"testing"
	"time"
)

type logged struct{ kinds, delivered []string }

func (l *logged) RecordAlert(_ context.Context, kind, _ string, _ time.Time, ok bool) error {
	l.kinds = append(l.kinds, kind)
	if ok {
		l.delivered = append(l.delivered, kind)
	}
	return errors.New("the log is down")
}

type failing struct{ err error }

func (f failing) Send(context.Context, Alert) error { return f.err }

func TestEveryAlertIsLoggedWithItsKindAndADownLogStopsNothing(t *testing.T) {
	d := &Device{ID: "dev-1", ParentID: "p", Label: "Sam"}
	tamper, _ := AlertFor(d, enforcement("dev-1", "restrictions", "missing", "", t0))
	alerts := []Alert{tamper, SilenceAlert(d), UnknownCallerAlert(d, call("1", "98765432", "incoming", t0))}
	want := []string{AlertKindTamper, AlertKindSilentPhone, AlertKindUnknownCall}

	log := &logged{}
	sent := &RecordingNotifier{Next: failing{nil}, Log: log}
	for _, a := range alerts {
		if err := sent.Send(context.Background(), a); err != nil {
			t.Fatalf("a failing log stopped the alert: %v", err)
		}
	}
	for i := range want {
		if log.kinds[i] != want[i] {
			t.Fatalf("kinds %v, want %v", log.kinds, want)
		}
	}
	if len(log.delivered) != 3 {
		t.Fatalf("delivered %v", log.delivered)
	}

	refused := &RecordingNotifier{Next: failing{errors.New("Brevo refused")}, Log: log}
	if err := refused.Send(context.Background(), tamper); err == nil {
		t.Fatal("the delivery error was swallowed")
	}
	if len(log.kinds) != 4 || len(log.delivered) != 3 {
		t.Fatalf("an undelivered alert was counted as delivered: %v / %v", log.kinds, log.delivered)
	}
}
