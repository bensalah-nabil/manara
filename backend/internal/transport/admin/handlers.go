package admin

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strings"
	"time"

	"manara/backend/internal/domain"
)

// Handlers serve /api/v1/admin/*. Every request is checked against Entra ID and recorded in the
// admin log before anything is read, so the log also shows what each admin looked at.
type Handlers struct {
	Verifier interface {
		Verify(ctx context.Context, token string) (domain.Admin, error)
	}
	Store       domain.AdminStore
	Now         func() time.Time
	SilentAfter time.Duration
	// Actions enables the write endpoints (actions.go); nil leaves the console read-only.
	Actions *Actions
}

// Routes registers the admin endpoints on mux.
func Routes(mux *http.ServeMux, h *Handlers) {
	mux.HandleFunc("GET /api/v1/admin/me", h.Me)
	mux.HandleFunc("GET /api/v1/admin/overview", h.Overview)
	mux.HandleFunc("GET /api/v1/admin/accounts", h.Accounts)
	mux.HandleFunc("GET /api/v1/admin/phones", h.Phones)
	mux.HandleFunc("GET /api/v1/admin/log", h.Log)
}

const listLimit = 200

func (h *Handlers) now() time.Time {
	if h.Now != nil {
		return h.Now()
	}
	return time.Now()
}

// admin checks the bearer token and records the request. False means the answer is written.
func (h *Handlers) admin(w http.ResponseWriter, r *http.Request, action, target string) (domain.Admin, bool) {
	a, ok := h.authenticate(w, r)
	if !ok {
		return a, false
	}
	if err := h.Store.RecordAdmin(r.Context(), domain.AdminLogEntry{AdminID: a.ID, AdminName: a.Name, Action: action, Target: target, At: h.now()}); err != nil {
		// No log, no answer: an admin's reads must always be on record.
		log.Printf("admin: record %s: %v", action, err)
		writeError(w, http.StatusInternalServerError, "internal", "")
		return domain.Admin{}, false
	}
	return a, true
}

// authenticate checks the bearer token only. False means the answer is written.
func (h *Handlers) authenticate(w http.ResponseWriter, r *http.Request) (domain.Admin, bool) {
	token, found := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
	if !found || token == "" {
		writeError(w, http.StatusUnauthorized, "not_admin", "sign in with an admin account")
		return domain.Admin{}, false
	}
	a, err := h.Verifier.Verify(r.Context(), token)
	if err != nil {
		// The reason (wrong object id, audience, issuer...) goes to the server log only, never
		// to the caller. It holds no part of the token.
		if errors.Is(err, ErrNotAdmin) {
			log.Printf("admin: refused: %v", err)
		} else {
			log.Printf("admin: verify token: %v", err)
		}
		writeError(w, http.StatusUnauthorized, "not_admin", "sign in with an admin account")
		return domain.Admin{}, false
	}
	return a, true
}

func (h *Handlers) Me(w http.ResponseWriter, r *http.Request) {
	a, ok := h.admin(w, r, "opened_console", "")
	if !ok {
		return
	}
	writeJSON(w, map[string]string{"id": a.ID, "name": a.Name})
}

func (h *Handlers) Overview(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.admin(w, r, "viewed_overview", ""); !ok {
		return
	}
	o, err := h.Store.Overview(r.Context(), h.now(), h.SilentAfter)
	if err != nil {
		log.Printf("admin: %v", err)
		writeError(w, http.StatusInternalServerError, "internal", "")
		return
	}
	writeJSON(w, o)
}

func (h *Handlers) Accounts(w http.ResponseWriter, r *http.Request) {
	query := strings.TrimSpace(r.URL.Query().Get("q"))
	if len(query) > 200 {
		writeError(w, http.StatusBadRequest, "bad_request", "search too long")
		return
	}
	if _, ok := h.admin(w, r, "listed_accounts", query); !ok {
		return
	}
	list, err := h.Store.Accounts(r.Context(), query, listLimit)
	if err != nil {
		log.Printf("admin: %v", err)
		writeError(w, http.StatusInternalServerError, "internal", "")
		return
	}
	writeJSON(w, list)
}

func (h *Handlers) Phones(w http.ResponseWriter, r *http.Request) {
	account := strings.TrimSpace(r.URL.Query().Get("account"))
	if len(account) > 64 {
		writeError(w, http.StatusBadRequest, "bad_request", "bad account id")
		return
	}
	if _, ok := h.admin(w, r, "listed_phones", account); !ok {
		return
	}
	list, err := h.Store.Phones(r.Context(), account, listLimit)
	if err != nil {
		log.Printf("admin: %v", err)
		writeError(w, http.StatusInternalServerError, "internal", "")
		return
	}
	writeJSON(w, list)
}

func (h *Handlers) Log(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.admin(w, r, "viewed_admin_log", ""); !ok {
		return
	}
	list, err := h.Store.AdminLog(r.Context(), listLimit)
	if err != nil {
		log.Printf("admin: %v", err)
		writeError(w, http.StatusInternalServerError, "internal", "")
		return
	}
	writeJSON(w, list)
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, code, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"code": code, "message": message})
}
