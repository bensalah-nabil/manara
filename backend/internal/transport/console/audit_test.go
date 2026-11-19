package console

import (
	"context"
	"net/http"
	"strings"
	"testing"
	"time"

	"manara/backend/internal/domain"
)

type memAudit struct{ entries []domain.AuditEntry }

func (m *memAudit) Record(_ context.Context, e domain.AuditEntry) error {
	m.entries = append(m.entries, e)
	return nil
}
func (m *memAudit) ListForParent(_ context.Context, parentID string, limit int) ([]domain.AuditEntry, error) {
	var out []domain.AuditEntry
	for i := len(m.entries) - 1; i >= 0 && len(out) < limit; i-- {
		if m.entries[i].ParentID == parentID {
			out = append(out, m.entries[i])
		}
	}
	return out, nil
}
func (m *memAudit) PurgeOlderThan(context.Context, time.Time) (int, error) { return 0, nil }

func TestOnlyASuccessfulWriteIsRecorded(t *testing.T) {
	h := testHandlers(nil)
	log := &memAudit{}
	h.Audit = log
	ok := func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusAccepted) }
	refused := func(w http.ResponseWriter, _ *http.Request) { writeError(w, http.StatusBadRequest, "bad_request", "") }

	r := call(h.Audited(domain.AuditCommandSent, CommandType, ok), http.MethodPost, `{"type":"lock_now"}`, "mine")
	if r.Code != http.StatusAccepted {
		t.Fatalf("status = %d", r.Code)
	}
	call(h.Audited(domain.AuditCommandSent, CommandType, refused), http.MethodPost, `{"type":"lock_now"}`, "mine")
	call(h.Audited(domain.AuditCommandSent, CommandType, ok), http.MethodPost, `{"type":"lock_now"}`, "nobody")

	if len(log.entries) != 1 {
		t.Fatalf("entries = %+v", log.entries)
	}
	if e := log.entries[0]; e.ParentID != "parent-1" || e.Action != domain.AuditCommandSent || e.Detail != "lock_now" {
		t.Fatalf("entry = %+v", e)
	}
}

func TestAnEditRecordsWhichFieldsNotTheirValues(t *testing.T) {
	if got := ChangedFields([]byte(`{"label":"Sara","color":"teal"}`)); got != "color,label" {
		t.Fatalf("fields = %q", got)
	}
	if got := ChangedFields([]byte(`not json`)); got != "" {
		t.Fatalf("bad body = %q", got)
	}
}

func TestSignInsAreRecordedAndEachParentSeesOnlyTheirOwn(t *testing.T) {
	h, _ := twoFactorHandlers(false)
	log := &memAudit{}
	h.Audit = log
	if w := call(h.Login, http.MethodPost, `{"email":"sara.mum@example.com","password":"right one"}`, ""); w.Code != http.StatusOK {
		t.Fatalf("login = %d %s", w.Code, w.Body)
	}
	log.entries = append(log.entries, domain.AuditEntry{ParentID: "parent-2", Action: domain.AuditSignedIn, At: time.Now()})

	w := call(h.ListActivity, http.MethodGet, "", "mine")
	body := w.Body.String()
	if w.Code != http.StatusOK || strings.Count(body, `"action":"signed_in"`) != 1 || !strings.Contains(body, `"detail":"password"`) {
		t.Fatalf("activity = %d %s", w.Code, body)
	}
}
