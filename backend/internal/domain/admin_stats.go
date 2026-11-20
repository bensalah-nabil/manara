package domain

import (
	"context"
	"log"
	"time"
)

// The admin dashboard's figures (docs/admin-console.md, part 2). Totals and counts only: nothing
// about one family, and nothing a phone reports about a child.

// The kinds of alert a parent can get; each alert carries one, so the dashboard can count them.
const (
	AlertKindTamper      = "tamper"
	AlertKindSilentPhone = "silent_phone"
	AlertKindUnknownCall = "unknown_call"
)

// StatsTimeZone is where a day starts for the dashboard: Manara's families are in Tunisia.
const StatsTimeZone = "Africa/Tunis"

type DayStat struct {
	Date         string `json:"date"`
	NewAccounts  int    `json:"newAccounts"`
	NewPhones    int    `json:"newPhones"`
	ActivePhones int    `json:"activePhones"`
}

type Count struct {
	Label string `json:"label"`
	Count int    `json:"count"`
}

// Funnel counts phones by how far guided setup went.
type Funnel struct {
	Phones           int `json:"phones"`
	SetupStarted     int `json:"setupStarted"`
	InProgress       int `json:"inProgress"`
	WaitingForParent int `json:"waitingForParent"`
	Finished         int `json:"finished"`
	Failed           int `json:"failed"`
}

type AlertDay struct {
	Date        string `json:"date"`
	Kind        string `json:"kind"`
	Sent        int    `json:"sent"`
	Undelivered int    `json:"undelivered"`
}

type AdminStats struct {
	Days     []DayStat  `json:"days"`
	Versions []Count    `json:"versions"`
	Android  []Count    `json:"android"`
	Brands   []Count    `json:"brands"`
	Funnel   Funnel     `json:"funnel"`
	Failures []Count    `json:"failures"`
	Alerts   []AlertDay `json:"alerts"`
	// EmailsFailing counts parents owed an alert email whose sends keep failing (Brevo refusing).
	EmailsFailing int `json:"emailsFailing"`
}

// AlertLog keeps one row per alert sent: its kind and whether it was delivered, nothing else.
type AlertLog interface {
	RecordAlert(ctx context.Context, kind, deviceID string, at time.Time, delivered bool) error
}

// RecordingNotifier sends through Next and logs the alert, so the dashboard can count alerts.
// A logging failure never stops an alert.
type RecordingNotifier struct {
	Next AlertNotifier
	Log  AlertLog
	Now  func() time.Time
}

func (r *RecordingNotifier) Send(ctx context.Context, a Alert) error {
	err := r.Next.Send(ctx, a)
	if r.Log != nil {
		at := time.Now()
		if r.Now != nil {
			at = r.Now()
		}
		kind := a.Kind
		if kind == "" {
			kind = "other"
		}
		if logErr := r.Log.RecordAlert(ctx, kind, a.DeviceID, at, err == nil); logErr != nil {
			log.Printf("alerts: log: %v", logErr)
		}
	}
	return err
}
