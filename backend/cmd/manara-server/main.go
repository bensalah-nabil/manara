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
	"slices"
	"strconv"
	"strings"
	"time"

	"manara/backend/internal/domain"
	"manara/backend/internal/notify"
	"manara/backend/internal/notify/fcm"
	"manara/backend/internal/persistence/postgres"
	"manara/backend/internal/sealed"
	"manara/backend/internal/transport/admin"
	"manara/backend/internal/transport/agent"
	"manara/backend/internal/transport/console"
	"manara/backend/internal/transport/guard"
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
	openSealedData(ctx, db)

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
	audit := postgres.NewAuditRepository(db)
	setups := postgres.NewSetupRepository(db)
	releases := postgres.NewReleaseRepository(db)
	notifier := newNotifier(ctx)
	pending := postgres.NewPendingRepository(db)
	_, pushOff := notifier.(notify.Noop)
	parents := postgres.NewParentRepository(db)
	accounts := postgres.NewAccountRepository(db)
	mailer := newMailer()
	var emailAlerts *notify.ParentEmailAlerts
	if mailer != nil {
		emailAlerts = &notify.ParentEmailAlerts{
			Parents: parents, Mailer: mailer, Emails: postgres.NewAlertEmailRepository(db), Now: time.Now,
		}
		go retryAlertEmails(ctx, emailAlerts)
		if url := consoleURL(); url != "" {
			go sendWeeklyEmails(ctx, &notify.WeeklyEmails{
				Parents: parents, Mailer: mailer, Emails: postgres.NewWeeklyEmailRepository(db), ConsoleURL: url, Now: time.Now,
			})
		} else {
			log.Printf("weekly emails: off (no CONSOLE_URL or CORS_ALLOWED_ORIGIN to link to)")
		}
	}
	alertSenders := newAlertSenders(emailAlerts)

	// Rate limits are counted in Postgres, shared by every instance and kept across restarts.
	rates := postgres.NewRateStore(db)
	agentHandlers := &agent.Handlers{
		Devices: devices, Tokens: tokens, Policies: policies,
		Commands: commands, Events: events, Enrollments: enrollments, Setup: setups, Readiness: setups, Releases: releases,
		Alerts: newAlertService(db, devices, alertSenders), AgentUpdate: agentUpdate(),
	}
	consoleHandlers := &console.Handlers{
		Devices: devices, Policies: policies, Commands: commands,
		Events: events, Sessions: sessions, Auth: auth, Enrollments: enrollments, Setup: setups, Readiness: setups, Releases: releases,
		Notifier: notifier, PushEnabled: !pushOff, Profiles: devices,
		Parents: parents, Accounts: accounts, Resets: accounts, ConsoleURL: consoleURL(),
		LoginLimiter: guard.NewLimiter(10, 15*time.Minute).Persist("login-email", rates),
		TwoFactor:    postgres.NewTwoFactorRepository(db),
		// 5 code tries per pending sign-in: 5 in a million against a 6-digit code.
		ChallengeLimiter: guard.NewLimiter(5, domain.ChallengeLifetime).Persist("two-step-challenge", rates),
		Audit:            audit,
		Pending:          pending,
	}
	if mailer != nil {
		consoleHandlers.Mailer = mailer
	}
	if len(alertSenders) > 0 {
		go watchSilentPhones(ctx, &domain.SilenceWatcher{
			Repo: postgres.NewSilenceRepository(db), Notifier: alertSenders,
			After: silentAfter(), Now: time.Now,
		})
	}

	mux := http.NewServeMux()
	// For an outside pinger: a free Render service sleeps after 15 minutes
	// without requests, and the silent-phone watcher sleeps with it.
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/plain")
		_, _ = w.Write([]byte("ok\n"))
	})
	// Endpoints that can be used to guess a secret (a password, a reset link,
	// an enrollment code) are limited per client. TRUSTED_IP_HEADER names the
	// header the hosting proxy sets to the real client address.
	ipHeader := os.Getenv("TRUSTED_IP_HEADER")
	guessable := guard.NewLimiter(20, 10*time.Minute).Persist("per-client", rates)
	limited := func(h http.HandlerFunc) http.HandlerFunc { return guard.PerClient(guessable, ipHeader, h) }

	mux.HandleFunc("POST /api/v1/enroll", limited(agentHandlers.Enroll))
	mux.HandleFunc("POST /api/v1/agent/sync", agentHandlers.Sync)
	mux.HandleFunc("POST /api/v1/agent/setup", agentHandlers.ReportSetup)
	mux.HandleFunc("GET /api/v1/agent/setup/input", agentHandlers.GetSetupInput)
	mux.HandleFunc("POST /api/v1/agent/setup/readiness", agentHandlers.ReportReadiness)
	mux.HandleFunc("POST /api/v1/console/auth/signup", limited(consoleHandlers.SignUp))
	mux.HandleFunc("POST /api/v1/console/auth/login", limited(consoleHandlers.Login))
	mux.HandleFunc("POST /api/v1/console/auth/logout", consoleHandlers.Logout)
	mux.HandleFunc("POST /api/v1/console/auth/login/verify", limited(consoleHandlers.VerifyLogin))
	mux.HandleFunc("POST /api/v1/console/account/two-factor/setup", consoleHandlers.SetupTwoFactor)
	mux.HandleFunc("POST /api/v1/console/account/two-factor/enable", limited(consoleHandlers.EnableTwoFactor))
	mux.HandleFunc("POST /api/v1/console/account/two-factor/disable", limited(consoleHandlers.DisableTwoFactor))
	mux.HandleFunc("POST /api/v1/console/auth/password-reset", limited(consoleHandlers.RequestPasswordReset))
	mux.HandleFunc("POST /api/v1/console/auth/password-reset/confirm", limited(consoleHandlers.ConfirmPasswordReset))
	mux.HandleFunc("GET /api/v1/console/account", consoleHandlers.GetAccount)
	mux.HandleFunc("PATCH /api/v1/console/account", consoleHandlers.Audited(domain.AuditAccountChanged, console.ChangedFields, consoleHandlers.UpdateAccount))
	mux.HandleFunc("GET /api/v1/console/account/activity", consoleHandlers.ListActivity)
	mux.HandleFunc("DELETE /api/v1/console/account", consoleHandlers.DeleteAccount)
	mux.HandleFunc("POST /api/v1/console/enrollment-tokens", consoleHandlers.Audited(domain.AuditPhoneCodeCreated, nil, consoleHandlers.CreateEnrollmentToken))
	mux.HandleFunc("GET /api/v1/console/devices", consoleHandlers.ListDevices)
	mux.HandleFunc("GET /api/v1/console/devices/{deviceId}/policy", consoleHandlers.GetPolicy)
	mux.HandleFunc("PUT /api/v1/console/devices/{deviceId}/policy", consoleHandlers.Audited(domain.AuditRulesChanged, nil, consoleHandlers.SetPolicy))
	mux.HandleFunc("POST /api/v1/console/devices/{deviceId}/commands", consoleHandlers.Audited(domain.AuditCommandSent, console.CommandType, consoleHandlers.CreateCommand))
	mux.HandleFunc("GET /api/v1/console/devices/{deviceId}/events", consoleHandlers.ListEvents)
	mux.HandleFunc("GET /api/v1/console/devices/{deviceId}/setup", consoleHandlers.GetSetup)
	mux.HandleFunc("GET /api/v1/console/devices/{deviceId}/setup/readiness", consoleHandlers.GetReadiness)
	mux.HandleFunc("DELETE /api/v1/console/devices/{deviceId}/setup/accounts", consoleHandlers.Audited(domain.AuditSetupAccountsClear, nil, consoleHandlers.ClearSetupAccounts))
	mux.HandleFunc("POST /api/v1/console/devices/{deviceId}/setup/pairing-code", consoleHandlers.Audited(domain.AuditPairingCodeSent, nil, consoleHandlers.SendPairingCode))
	mux.HandleFunc("POST /api/v1/console/devices/{deviceId}/setup/finish", consoleHandlers.Audited(domain.AuditSetupFinished, nil, consoleHandlers.FinishSetup))
	mux.HandleFunc("GET /api/v1/console/devices/{deviceId}/release-code", consoleHandlers.GetReleaseCode)
	mux.HandleFunc("GET /api/v1/console/devices/{deviceId}/pending", consoleHandlers.ListPending)
	mux.HandleFunc("DELETE /api/v1/console/devices/{deviceId}/pending/{kind}", consoleHandlers.Audited(domain.AuditChangeCancelled, nil, consoleHandlers.CancelPending))
	mux.HandleFunc("DELETE /api/v1/console/devices/{deviceId}", consoleHandlers.Audited(domain.AuditPhoneRemoved, nil, consoleHandlers.DeleteDevice))
	mux.HandleFunc("PATCH /api/v1/console/devices/{deviceId}", consoleHandlers.Audited(domain.AuditPhoneEdited, console.ChangedFields, consoleHandlers.UpdateDevice))

	// The admin console's API (docs/admin-console.md): only when Entra ID is configured.
	if v := adminVerifier(); v != nil {
		admin.Routes(mux, &admin.Handlers{Verifier: v, Store: postgres.NewAdminRepository(db), SilentAfter: silentAfter()})
		log.Printf("admin console: on, %d admin(s)", len(v.Allowed))
	}

	go runHeartbeatSweep(ctx, commands)
	go runPendingSweep(ctx, &domain.PendingApplier{Pending: pending, Policies: policies, Commands: commands, Devices: devices, Notifier: notifier})
	go runRetentionSweep(ctx, db, events, setups, audit)
	go func() {
		for {
			if n, err := sessions.PurgeExpired(ctx); err != nil {
				log.Printf("session sweep: %v", err)
			} else if n > 0 {
				log.Printf("session sweep: deleted %d expired session(s)", n)
			}
			select {
			case <-ctx.Done():
				return
			case <-time.After(time.Hour):
			}
		}
	}()

	addr := os.Getenv("ADDR")
	if addr == "" && os.Getenv("PORT") != "" {
		// Hosts such as Render tell the server which port to use through PORT.
		addr = ":" + os.Getenv("PORT")
	}
	if addr == "" {
		addr = ":8080"
	}
	log.Printf("manara-server listening on %s", addr)
	// Timeouts so a slow or stalled client can't hold connections open, and a
	// body limit so one huge request can't exhaust memory.
	server := &http.Server{
		Addr:              addr,
		Handler:           withCORS(guard.BodyLimit(mux)),
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      60 * time.Second,
		IdleTimeout:       120 * time.Second,
		MaxHeaderBytes:    64 << 10,
	}
	log.Fatal(server.ListenAndServe())
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

// newMailer is additive like newNotifier: no BREVO_API_KEY means nil, and
// the server has no email (no password reset, no emailed alerts). HTTPS API,
// not SMTP: Render's free plan blocks outbound ports 25, 465 and 587.
func newMailer() *notify.Brevo {
	key := os.Getenv("BREVO_API_KEY")
	if key == "" {
		log.Printf("BREVO_API_KEY not set -- no email: password reset and emailed alerts disabled")
		return nil
	}
	m, err := notify.NewBrevo(key, os.Getenv("MAIL_FROM"), os.Getenv("MAIL_FROM_NAME"))
	if err != nil {
		log.Printf("email: %v -- password reset and emailed alerts disabled", err)
		return nil
	}
	log.Printf("email enabled via Brevo")
	return m
}

// consoleURL is where emailed links point: CONSOLE_URL, or else the one
// console origin CORS already allows.
func consoleURL() string {
	if u := os.Getenv("CONSOLE_URL"); u != "" {
		return u
	}
	if origins := corsOrigins(); origins[0] != "*" {
		return origins[0]
	}
	return ""
}

// corsOrigins is CORS_ALLOWED_ORIGIN, a comma-separated list so the console can
// move host without a gap. The first is the one emailed links point to.
func corsOrigins() []string {
	var origins []string
	for _, origin := range strings.Split(os.Getenv("CORS_ALLOWED_ORIGIN"), ",") {
		if origin = strings.TrimRight(strings.TrimSpace(origin), "/"); origin != "" {
			origins = append(origins, origin)
		}
	}
	if len(origins) == 0 {
		return []string{"*"}
	}
	return origins
}

// agentUpdate is the directly downloaded Manara phones should update to: AGENT_UPDATE_VERSION_CODE,
// AGENT_UPDATE_VERSION_NAME and AGENT_UPDATE_SHA256, matching a published GitHub release
// (docs/play-store.md). Leaving AGENT_UPDATE_VERSION_CODE empty holds every update back.
func agentUpdate() *domain.AgentUpdate {
	raw := os.Getenv("AGENT_UPDATE_VERSION_CODE")
	if raw == "" {
		log.Printf("agent updates: held back (AGENT_UPDATE_VERSION_CODE not set)")
		return nil
	}
	code, err := strconv.Atoi(raw)
	if err != nil {
		log.Printf("agent updates: held back: AGENT_UPDATE_VERSION_CODE=%q is not a whole number", raw)
		return nil
	}
	u, err := domain.NewAgentUpdate(code, os.Getenv("AGENT_UPDATE_VERSION_NAME"), os.Getenv("AGENT_UPDATE_SHA256"))
	if err != nil {
		log.Printf("agent updates: held back: %v", err)
		return nil
	}
	log.Printf("agent updates: phones update to %s (%d)", u.VersionName, u.VersionCode)
	return &u
}

// openSealedData sets the key that seals authenticator secrets and location and call events
// (security.md, item 4): DATA_KEY, 32 random bytes in base64. The server refuses to start with a
// key that can't open what is already sealed, or none when something is. Rows stored plain before
// the key existed are sealed in the background.
func openSealedData(ctx context.Context, db *postgres.DB) {
	if raw := os.Getenv("DATA_KEY"); raw != "" {
		box, err := sealed.FromBase64(raw)
		if err != nil {
			log.Fatalf("DATA_KEY: %v", err)
		}
		db.Box = box
	} else {
		log.Printf("data at rest: authenticator secrets, location and calls are not sealed (DATA_KEY not set)")
	}
	if err := db.CheckKey(ctx); err != nil {
		log.Fatalf("data at rest: %v", err)
	}
	if db.Box == nil {
		return
	}
	go func() {
		secrets, events, err := db.SealExisting(ctx)
		if err != nil {
			log.Printf("data at rest: sealing older rows stopped: %v", err)
		}
		log.Printf("data at rest: sealed; %d older secret(s) and %d older event(s) sealed now", secrets, events)
	}()
}

// silentAfter is SILENT_PHONE_HOURS, or 12 hours.
func silentAfter() time.Duration {
	if raw := os.Getenv("SILENT_PHONE_HOURS"); raw != "" {
		if h, err := strconv.Atoi(raw); err == nil && h > 0 {
			return time.Duration(h) * time.Hour
		}
		log.Printf("SILENT_PHONE_HOURS=%q is not a whole number of hours -- using 12", raw)
	}
	return domain.SilentAfterDefault
}

// watchSilentPhones checks every 15 minutes, the phones' own check-in rhythm.
// A free Render service sleeps after 15 minutes without requests, and then
// nothing runs: when every phone has gone quiet, an outside pinger (see
// backend/README.md) keeps the watcher awake.
func watchSilentPhones(ctx context.Context, w *domain.SilenceWatcher) {
	log.Printf("silent-phone alerts after %s", w.After)
	tick := time.NewTicker(15 * time.Minute)
	defer tick.Stop()
	for {
		if n, err := w.Check(ctx); err != nil {
			log.Printf("silent phones: %v", err)
		} else if n > 0 {
			log.Printf("silent phones: %d alert(s) sent", n)
		}
		select {
		case <-ctx.Done():
			return
		case <-tick.C:
		}
	}
}

// retryAlertEmails tries, every minute, each alert email that is owed and due:
// one whose send failed, or whose sender died mid-send (domain.AlertEmail).
// It sleeps with a free Render service like the silent-phone watcher; the
// owed emails wait in the database.
func retryAlertEmails(ctx context.Context, a *notify.ParentEmailAlerts) {
	tick := time.NewTicker(time.Minute)
	defer tick.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-tick.C:
		}
		tryCtx, cancel := context.WithTimeout(ctx, 50*time.Second)
		n, err := a.DeliverDue(tryCtx)
		cancel()
		if err != nil {
			log.Printf("alerts: %v", err)
		}
		if n > 0 {
			log.Printf("alerts: %d owed email(s) sent", n)
		}
	}
}

// sendWeeklyEmails sends, at start and every five minutes, each weekly email
// that is due (domain.ReportWeek: from Monday 08:00 Tunis time) and tries a
// failed one again. A free Render service asleep on Monday morning sends when
// a phone's sync wakes it; after two days that week's email is skipped.
func sendWeeklyEmails(ctx context.Context, w *notify.WeeklyEmails) {
	tick := time.NewTicker(5 * time.Minute)
	defer tick.Stop()
	for {
		tryCtx, cancel := context.WithTimeout(ctx, 4*time.Minute)
		n, err := w.DeliverDue(tryCtx)
		cancel()
		if err != nil {
			log.Printf("weekly emails: %v", err)
		}
		if n > 0 {
			log.Printf("weekly emails: %d sent", n)
		}
		select {
		case <-ctx.Done():
			return
		case <-tick.C:
		}
	}
}

// newAlertSenders gathers every alert destination: each parent by email when
// the server has email, and the operator's ntfy topic or webhook. Those two
// come from the operator's environment, never from a parent's request, so the
// server cannot be pointed at an arbitrary address.
func newAlertSenders(email *notify.ParentEmailAlerts) notify.Fanout {
	var senders notify.Fanout
	if email != nil {
		senders = append(senders, email)
	}
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
	return senders
}

// newAlertService is nil without a destination, and nothing alerts.
func newAlertService(db *postgres.DB, devices domain.DeviceRepository, senders notify.Fanout) *domain.AlertService {
	if len(senders) == 0 {
		return nil
	}
	return &domain.AlertService{
		Devices:  devices,
		Notifier: senders,
		Throttle: postgres.NewAlertThrottleRepository(db, 6*time.Hour),
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
// corsMethods must list every method the console sends. PATCH was missing, so a
// browser refused to save a child's name and color (found on the live console).
const corsMethods = "GET, POST, PUT, PATCH, DELETE, OPTIONS"

func withCORS(next http.Handler) http.Handler {
	origins := corsOrigins()
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if len(origins) == 1 {
			w.Header().Set("Access-Control-Allow-Origin", origins[0])
		} else {
			// The header names one origin, so it depends on who is asking, and a cache must know that.
			w.Header().Add("Vary", "Origin")
			if slices.Contains(origins, r.Header.Get("Origin")) {
				w.Header().Set("Access-Control-Allow-Origin", r.Header.Get("Origin"))
			}
		}
		w.Header().Set("Access-Control-Allow-Methods", corsMethods)
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
// adminVerifier reads the Entra ID settings of the admin console. All three or none: a half-set
// configuration stops the server rather than leaving the console open or silently off.
func adminVerifier() *admin.Verifier {
	tenant := strings.TrimSpace(os.Getenv("ADMIN_ENTRA_TENANT_ID"))
	client := strings.TrimSpace(os.Getenv("ADMIN_ENTRA_CLIENT_ID"))
	var allowed []string
	for _, id := range strings.Split(os.Getenv("ADMIN_ALLOWED_OIDS"), ",") {
		if id = strings.TrimSpace(id); id != "" {
			allowed = append(allowed, id)
		}
	}
	switch {
	case tenant == "" && client == "" && len(allowed) == 0:
		return nil
	case tenant == "" || client == "" || len(allowed) == 0:
		log.Fatalf("admin console: set ADMIN_ENTRA_TENANT_ID, ADMIN_ENTRA_CLIENT_ID and ADMIN_ALLOWED_OIDS together, or none of them")
	}
	return &admin.Verifier{TenantID: tenant, ClientID: client, Allowed: allowed}
}

// runPendingSweep delivers changes that have waited out a cooling-off delay, at start (a free
// Render server sleeps, and wakes on the next request) and then every minute.
func runPendingSweep(ctx context.Context, applier *domain.PendingApplier) {
	for {
		if err := applier.ApplyDue(ctx, time.Now()); err != nil {
			log.Printf("cooling-off sweep: %v", err)
		}
		select {
		case <-ctx.Done():
			return
		case <-time.After(time.Minute):
		}
	}
}

func runRetentionSweep(ctx context.Context, db *postgres.DB, events domain.EventStore, setups domain.SetupRepository, audit domain.AuditLog) {
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
		if a, err := audit.PurgeOlderThan(ctx, time.Now().Add(-domain.AuditRetention)); err != nil {
			log.Printf("retention sweep audit log: %v", err)
		} else if a > 0 {
			log.Printf("retention sweep: deleted %d old audit entries", a)
		}
		if a, err := postgres.NewAdminRepository(db).PurgeAdminLogOlderThan(ctx, time.Now().Add(-365*24*time.Hour)); err != nil {
			log.Printf("retention sweep admin log: %v", err)
		} else if a > 0 {
			log.Printf("retention sweep: deleted %d old admin log entries", a)
		}
		if _, err := postgres.NewPendingRepository(db).PurgeAppliedBefore(ctx, time.Now().Add(-8*24*time.Hour)); err != nil {
			log.Printf("retention sweep waiting changes: %v", err)
		}
		if _, err := db.PurgeLimitsOlderThan(ctx, time.Now().Add(-24*time.Hour)); err != nil {
			log.Printf("retention sweep rate limits: %v", err)
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
