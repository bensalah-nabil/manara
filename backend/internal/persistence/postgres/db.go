// Package postgres implements domain's repository ports against Postgres.
// Nothing outside this package constructs a SQL query -- that's the
// Dependency Inversion architecture.md §3 calls for: the domain layer
// depends on an interface, this package is the only thing that knows it's
// backed by Postgres.
package postgres

import (
	"context"
	"embed"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

//go:embed migrations/*.sql
var migrationsFS embed.FS

// DB wraps the connection pool every repository in this package shares.
type DB struct {
	Pool *pgxpool.Pool
}

func Connect(ctx context.Context, connString string) (*DB, error) {
	pool, err := pgxpool.New(ctx, connString)
	if err != nil {
		return nil, fmt.Errorf("connect: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		return nil, fmt.Errorf("ping: %w", err)
	}
	return &DB{Pool: pool}, nil
}

func (db *DB) Close() {
	db.Pool.Close()
}

// Migrate applies every embedded migration file in filename order. Each
// statement uses CREATE TABLE/INDEX IF NOT EXISTS, so running this more
// than once (every server start, deliberately) is a safe no-op rather than
// needing a separate migration-tracking table -- the simplest thing that
// works for Phase 2's single-schema-version reality; revisit with a real
// migration tool (golang-migrate etc.) once there's more than one version
// of this schema to step between.
func (db *DB) Migrate(ctx context.Context) error {
	entries, err := migrationsFS.ReadDir("migrations")
	if err != nil {
		return fmt.Errorf("read migrations dir: %w", err)
	}
	for _, entry := range entries {
		sqlBytes, err := migrationsFS.ReadFile("migrations/" + entry.Name())
		if err != nil {
			return fmt.Errorf("read migration %s: %w", entry.Name(), err)
		}
		if _, err := db.Pool.Exec(ctx, string(sqlBytes)); err != nil {
			return fmt.Errorf("apply migration %s: %w", entry.Name(), err)
		}
	}
	return nil
}
