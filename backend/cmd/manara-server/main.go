// Command manara-server wires domain, persistence, and transport together
// (architecture.md §3: "cmd/manara-server/ -- main(): wiring only"). No
// business logic belongs in this file.
package main

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"

	"manara/backend/internal/domain"
	"manara/backend/internal/notify"
	"manara/backend/internal/notify/fcm"
	"manara/backend/internal/persistence/postgres"
	"manara/backend/internal/transport/agent"
	"manara/backend/internal/transport/console"
)

func main() {
	seed := flag.Bool("seed", false, "dev only: create a parent that can sign in, print its password, a parentSession and an enrollment token, then exit")
	seedEmail := flag.String("seed-email", "", "the seeded parent's email (required with -seed)")
	flag.Parse()

	connString := os.Getenv("DATABASE_URL")
	if connString == "" {
		connString = "postgres://manara:manara@localhost:5432/manara"
	}

	ctx := context.Background()
	db, err := postgres.Connect(ctx, connString)
	if err != nil {
		log.Fatalf("connect to postgres: %v", err)
	}
	defer db.Close()

	if err := db.Migrate(ctx); err != nil {
		log.Fatalf("migrate: %v", err)
	}

	auth := postgres.NewAuthRepository(db)
	sessions := postgres.NewParentSessionRepository(db)
	enrollments := postgres.NewEnrollmentTokenRepository(db)

	if *seed {
		runSeed(ctx, *seedEmail, auth, sessions, enrollments)
		return
	}

	devices := postgres.NewDeviceRepository(db)
	tokens := postgres.NewTokenRepository(db)
	policies := postgres.NewPolicyRepository(db)
	commands := postgres.NewCommandQueue(db)
	events := postgres.NewEventStore(db)
	setups := postgres.NewSetupRepository(db)
	releases := postgres.NewReleaseRepository(db)
	notifier := newNotifier(ctx)
	_, pushOff := notifier.(notify.Noop)

	agentHandlers := &agent.Handlers{
		Devices: devices, Tokens: tokens, Policies: policies,
		Commands: commands, Events: events, Enrollments: enrollments, Setup: setups, Releases: releases,
		Alerts: newAlertService(devices),
	}
	consoleHandlers := &console.Handlers{
		Devices: devices, Policies: policies, Commands: commands,
		Events: events, Sessions: sessions, Auth: auth, Enrollments: enrollments, Setup: setups, Releases: releases,
		Notifier: notifier, PushEnabled: !pushOff, Profiles: devices,
	}

	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/v1/enroll", agentHandlers.Enroll)
	mux.HandleFunc("POST /api/v1/agent/sync", agentHandlers.Sync)
	mux.HandleFunc("POST /api/v1/agent/setup", agentHandlers.ReportSetup)
	mux.HandleFunc("GET /api/v1/agent/setup/input", agentHandlers.GetSetupInput)
	mux.HandleFunc("POST /api/v1/console/auth/signup", consoleHandlers.SignUp)
	mux.HandleFunc("POST /api/v1/console/auth/login", consoleHandlers.Login)
	mux.HandleFunc("POST /api/v1/console/enrollment-tokens", consoleHandlers.CreateEnrollmentToken)
	mux.HandleFunc("GET /api/v1/console/devices", consoleHandlers.ListDevices)
	mux.HandleFunc("GET /api/v1/console/devices/{deviceId}/policy", consoleHandlers.GetPolicy)
	mux.HandleFunc("PUT /api/v1/console/devices/{deviceId}/policy", consoleHandlers.SetPolicy)
	mux.HandleFunc("POST /api/v1/console/devices/{deviceId}/commands", consoleHandlers.CreateCommand)
	mux.HandleFunc("GET /api/v1/console/devices/{deviceId}/events", consoleHandlers.ListEvents)
	mux.HandleFunc("GET /api/v1/console/devices/{deviceId}/setup", consoleHandlers.GetSetup)
	mux.HandleFunc("DELETE /api/v1/console/devices/{deviceId}/setup/accounts", consoleHandlers.ClearSetupAccounts)
	mux.HandleFunc("POST /api/v1/console/devices/{deviceId}/setup/pairing-code", consoleHandlers.SendPairingCode)
	mux.HandleFunc("POST /api/v1/console/devices/{deviceId}/setup/finish", consoleHandlers.FinishSetup)
	mux.HandleFunc("GET /api/v1/console/devices/{deviceId}/release-code", consoleHandlers.GetReleaseCode)
	mux.HandleFunc("DELETE /api/v1/console/devices/{deviceId}", consoleHandlers.DeleteDevice)
	mux.HandleFunc("PATCH /api/v1/console/devices/{deviceId}", consoleHandlers.UpdateDevice)

	go runHeartbeatSweep(ctx, commands)
	go runRetentionSweep(ctx, events, setups)

	addr := os.Getenv("ADDR")
	if addr == "" && os.Getenv("PORT") != "" {
		// Hosts such as Render tell the server which port to use through PORT.
		addr = ":" + os.Getenv("PORT")
	}
	if addr == "" {
		addr = ":8080"
	}
	log.Printf("manara-server listening on %s", addr)
	log.Fatal(http.ListenAndServe(addr, withCORS(mux)))
}

// newNotifier is additive, not a hard dependency: FIREBASE_SERVICE_ACCOUNT
// unset (the default -- no Firebase project configured yet) gives
// notify.Noop{}, and the server runs exactly as it did before FCM existed.
// A bad/unreadable key file logs a warning and falls back the same way,
// rather than refusing to start the whole server over a push-only feature.
func newNotifier(ctx context.Context) domain.PushNotifier {
	path := os.Getenv("FIREBASE_SERVICE_ACCOUNT")
	if path == "" {
		log.Printf("FIREBASE_SERVICE_ACCOUNT not set -- push notifications disabled, polling only")
		return notify.Noop{}
	}
	n, err := fcm.New(ctx, path)
	if err != nil {
		log.Printf("fcm: %v -- push notifications disabled, polling only", err)
		return notify.Noop{}
	}
	log.Printf("push notifications enabled via FCM")
	return n
}

// newAlertService is additive like newNotifier: no ALERT_NTFY_URL and no
// ALERT_WEBHOOK_URL (the default) means nil, and nothing alerts. The
// destinations come from the operator's environment, never from a parent's
// request, so the server cannot be pointed at an arbitrary address.
func newAlertService(devices domain.DeviceRepository) *domain.AlertService {
	var senders notify.Fanout
	if raw := os.Getenv("ALERT_NTFY_URL"); raw != "" {
		n, err := notify.NewNtfy(raw, os.Getenv("ALERT_NTFY_TOKEN"))
		if err != nil {
			log.Printf("alerts: ALERT_NTFY_URL: %v -- ntfy alerts disabled", err)
		} else {
			senders = append(senders, n)
		}
	}
	if raw := os.Getenv("ALERT_WEBHOOK_URL"); raw != "" {
		w, err := notify.NewWebhook(raw)
		if err != nil {
			log.Printf("alerts: ALERT_WEBHOOK_URL: %v -- webhook alerts disabled", err)
		} else {
			senders = append(senders, w)
		}
	}
	if len(senders) == 0 {
		log.Printf("no alert destination configured -- parent alerts disabled")
		return nil
	}
	log.Printf("parent alerts enabled (%d destination(s))", len(senders))
	return &domain.AlertService{
		Devices:  devices,
		Notifier: senders,
		Throttle: domain.NewAlertThrottle(6 * time.Hour),
		Now:      time.Now,
	}
}

// withCORS exists for the controller (Phase 3): a React dev server on its
// own origin (Vite's default :5173) making fetch calls to this API is a
// cross-origin request by definition, and browsers block those outright
// without these headers -- not an edge case to handle later, the
// controller simply wouldn't work at all without this from day one.
// CORS_ALLOWED_ORIGIN lets a real deployment restrict this once there's a
// real controller origin to allow instead of every origin.
func withCORS(next http.Handler) http.Handler {
	allowedOrigin := os.Getenv("CORS_ALLOWED_ORIGIN")
	if allowedOrigin == "" {
		allowedOrigin = "*"
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", allowedOrigin)
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// runHeartbeatSweep is architecture.md §3.1/§3.3's expiry side: a command
// still pending/delivered past domain.CommandExpiry is swept to expired
// rather than left pending forever for an offline device.
func runHeartbeatSweep(ctx context.Context, commands domain.CommandQueue) {
	ticker := time.NewTicker(10 * time.Minute)
	defer ticker.Stop()
	for range ticker.C {
		n, err := commands.ExpirePending(ctx, domain.CommandExpiry)
		if err != nil {
			log.Printf("heartbeat sweep: %v", err)
			continue
		}
		if n > 0 {
			log.Printf("heartbeat sweep: expired %d stale command(s)", n)
		}
	}
}

// runRetentionSweep deletes each kind of event after domain.RetentionFor(kind)
// and empties setup account lists after domain.SetupAccountRetention
// (capability-plan G2: collected data has limited retention). It also runs
// once at start so a restart does not delay a purge by an hour.
func runRetentionSweep(ctx context.Context, events domain.EventStore, setups domain.SetupRepository) {
	purge := func() {
		for _, kind := range domain.AllEventKinds {
			n, err := events.PurgeOlderThan(ctx, kind, time.Now().Add(-domain.RetentionFor(kind)))
			if err != nil {
				log.Printf("retention sweep %s: %v", kind, err)
			} else if n > 0 {
				log.Printf("retention sweep: deleted %d old %s event(s)", n, kind)
			}
		}
		m, err := setups.ClearAccountsOlderThan(ctx, time.Now().Add(-domain.SetupAccountRetention))
		if err != nil {
			log.Printf("retention sweep: %v", err)
		} else if m > 0 {
			log.Printf("retention sweep: cleared %d old setup account list(s)", m)
		}
	}
	purge()
	ticker := time.NewTicker(time.Hour)
	defer ticker.Stop()
	for range ticker.C {
		purge()
	}
}

// runSeed creates a parent that can sign in like any other, never an
// account with no email or password: a phone enrolled to one of those could
// only be released from a database nobody can sign in to.
func runSeed(ctx context.Context, email string, auth domain.AuthRepository, sessions domain.ParentSessionRepository, enrollments domain.EnrollmentTokenRepository) {
	if email == "" {
		log.Fatalf("seed: -seed-email is required, so the seeded parent can sign in to the console")
	}
	raw := make([]byte, 12)
	if _, err := rand.Read(raw); err != nil {
		log.Fatalf("seed: generate password: %v", err)
	}
	password := base64.RawURLEncoding.EncodeToString(raw)
	parent, err := auth.SignUp(ctx, email, password)
	if err != nil {
		log.Fatalf("seed: create parent: %v", err)
	}
	sessionToken, err := sessions.Issue(ctx, parent.ID)
	if err != nil {
		log.Fatalf("seed: issue session: %v", err)
	}
	enrollmentToken, err := enrollments.Create(ctx, parent.ID, nil)
	if err != nil {
		log.Fatalf("seed: issue enrollment token: %v", err)
	}

	fmt.Printf("parentId:         %s\n", parent.ID)
	fmt.Printf("email:            %s\n", parent.Email)
	fmt.Printf("password:         %s\n", password)
	fmt.Printf("parentSession:    %s\n", sessionToken)
	fmt.Printf("enrollmentToken:  %s\n", enrollmentToken)
}
