// Command manara-server wires domain, persistence, and transport together
// (architecture.md §3: "cmd/manara-server/ -- main(): wiring only"). No
// business logic belongs in this file.
package main

import (
	"context"
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

	"github.com/google/uuid"
)

func main() {
	seed := flag.Bool("seed", false, "create one parent + print a parentSession token and an enrollment token, then exit")
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

	parents := postgres.NewParentRepository(db)
	sessions := postgres.NewParentSessionRepository(db)
	enrollments := postgres.NewEnrollmentTokenRepository(db)

	if *seed {
		runSeed(ctx, parents, sessions, enrollments)
		return
	}

	devices := postgres.NewDeviceRepository(db)
	tokens := postgres.NewTokenRepository(db)
	policies := postgres.NewPolicyRepository(db)
	commands := postgres.NewCommandQueue(db)
	events := postgres.NewEventStore(db)
	auth := postgres.NewAuthRepository(db)
	notifier := newNotifier(ctx)

	agentHandlers := &agent.Handlers{
		Devices: devices, Tokens: tokens, Policies: policies,
		Commands: commands, Events: events, Enrollments: enrollments,
	}
	consoleHandlers := &console.Handlers{
		Devices: devices, Policies: policies, Commands: commands,
		Events: events, Sessions: sessions, Auth: auth, Enrollments: enrollments,
		Notifier: notifier,
	}

	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/v1/enroll", agentHandlers.Enroll)
	mux.HandleFunc("POST /api/v1/agent/sync", agentHandlers.Sync)
	mux.HandleFunc("POST /api/v1/console/auth/signup", consoleHandlers.SignUp)
	mux.HandleFunc("POST /api/v1/console/auth/login", consoleHandlers.Login)
	mux.HandleFunc("POST /api/v1/console/enrollment-tokens", consoleHandlers.CreateEnrollmentToken)
	mux.HandleFunc("GET /api/v1/console/devices", consoleHandlers.ListDevices)
	mux.HandleFunc("GET /api/v1/console/devices/{deviceId}/policy", consoleHandlers.GetPolicy)
	mux.HandleFunc("PUT /api/v1/console/devices/{deviceId}/policy", consoleHandlers.SetPolicy)
	mux.HandleFunc("POST /api/v1/console/devices/{deviceId}/commands", consoleHandlers.CreateCommand)
	mux.HandleFunc("GET /api/v1/console/devices/{deviceId}/events", consoleHandlers.ListEvents)

	go runHeartbeatSweep(ctx, commands)

	addr := os.Getenv("ADDR")
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

func runSeed(ctx context.Context, parents domain.ParentRepository, sessions domain.ParentSessionRepository, enrollments domain.EnrollmentTokenRepository) {
	parent := &domain.Parent{ID: uuid.NewString(), CreatedAt: time.Now().UTC()}
	if err := parents.Create(ctx, parent); err != nil {
		log.Fatalf("seed: create parent: %v", err)
	}
	sessionToken, err := sessions.Issue(ctx, parent.ID)
	if err != nil {
		log.Fatalf("seed: issue session: %v", err)
	}
	enrollmentToken, err := enrollments.Create(ctx, parent.ID)
	if err != nil {
		log.Fatalf("seed: issue enrollment token: %v", err)
	}

	fmt.Printf("parentId:         %s\n", parent.ID)
	fmt.Printf("parentSession:    %s\n", sessionToken)
	fmt.Printf("enrollmentToken:  %s\n", enrollmentToken)
}
