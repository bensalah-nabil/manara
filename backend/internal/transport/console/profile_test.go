package console

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"manara/backend/internal/domain"
)

type fakeProfiles struct{ saved []string }

func (f *fakeProfiles) UpdateProfile(_ context.Context, id, label, color string) error {
	f.saved = append(f.saved, id+"|"+label+"|"+color)
	return nil
}

func patchDevice(h *Handlers, token, body string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(http.MethodPatch, "/api/v1/console/devices/dev-1", strings.NewReader(body))
	r.SetPathValue("deviceId", "dev-1")
	if token != "" {
		r.Header.Set("Authorization", "Bearer "+token)
	}
	w := httptest.NewRecorder()
	h.UpdateDevice(w, r)
	return w
}

func TestOnlyTheOwnerNamesAPhone(t *testing.T) {
	cases := map[string]struct {
		token, body, saved string
		want               int
	}{
		"name and color": {"mine", `{"label":"  Sara ","color":"pink"}`, "dev-1|Sara|pink", http.StatusOK},
		"color only":     {"mine", `{"color":"teal"}`, "dev-1|Old name|teal", http.StatusOK},
		"clear both":     {"mine", `{"label":"","color":""}`, "dev-1||", http.StatusOK},
		"other parent":   {"theirs", `{"label":"Sara"}`, "", http.StatusNotFound},
		"no session":     {"", `{"label":"Sara"}`, "", http.StatusUnauthorized},
		"unknown color":  {"mine", `{"color":"#ff0000"}`, "", http.StatusBadRequest},
		"name too long":  {"mine", `{"label":"` + strings.Repeat("a", 41) + `"}`, "", http.StatusBadRequest},
		"not json":       {"mine", `nope`, "", http.StatusBadRequest},
	}
	for name, c := range cases {
		profiles := &fakeProfiles{}
		h := testHandlers(nil)
		h.Devices = fakeDevices{byID: map[string]*domain.Device{"dev-1": {ID: "dev-1", ParentID: "parent-1", Label: "Old name", Color: "blue"}}}
		h.Profiles = profiles
		w := patchDevice(h, c.token, c.body)
		if w.Code != c.want {
			t.Errorf("%s: status %d, want %d (%s)", name, w.Code, c.want, w.Body.String())
		}
		got := strings.Join(profiles.saved, ",")
		if got != c.saved {
			t.Errorf("%s: saved %q, want %q", name, got, c.saved)
		}
	}
}
