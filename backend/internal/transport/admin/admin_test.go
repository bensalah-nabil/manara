package admin

import (
	"context"
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"math/big"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"manara/backend/internal/domain"
)

const (
	tenant   = "11111111-1111-1111-1111-111111111111"
	client   = "22222222-2222-2222-2222-222222222222"
	adminOID = "33333333-3333-3333-3333-333333333333"
)

var now = time.Date(2026, 11, 19, 12, 0, 0, 0, time.UTC)

func newKey(t *testing.T) *rsa.PrivateKey {
	t.Helper()
	k, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	return k
}

func keyServer(t *testing.T, kid string, key *rsa.PrivateKey) (*httptest.Server, *int) {
	t.Helper()
	fetches := 0
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		fetches++
		e := big.NewInt(int64(key.E)).Bytes()
		_ = json.NewEncoder(w).Encode(map[string]any{"keys": []map[string]string{{
			"kty": "RSA", "kid": kid, "use": "sig",
			"n": base64.RawURLEncoding.EncodeToString(key.N.Bytes()),
			"e": base64.RawURLEncoding.EncodeToString(e),
		}}})
	}))
	t.Cleanup(s.Close)
	return s, &fetches
}

func sign(t *testing.T, key *rsa.PrivateKey, header, claims map[string]any) string {
	t.Helper()
	enc := func(v any) string {
		raw, err := json.Marshal(v)
		if err != nil {
			t.Fatal(err)
		}
		return base64.RawURLEncoding.EncodeToString(raw)
	}
	unsigned := enc(header) + "." + enc(claims)
	digest := sha256.Sum256([]byte(unsigned))
	sig, err := rsa.SignPKCS1v15(rand.Reader, key, crypto.SHA256, digest[:])
	if err != nil {
		t.Fatal(err)
	}
	return unsigned + "." + base64.RawURLEncoding.EncodeToString(sig)
}

func goodClaims() map[string]any {
	return map[string]any{
		"iss": "https://login.microsoftonline.com/" + tenant + "/v2.0",
		"aud": client, "tid": tenant, "oid": adminOID,
		"exp": now.Add(time.Hour).Unix(), "nbf": now.Add(-time.Minute).Unix(),
		"scp": "Admin.Access", "name": "Test Admin", "ver": "2.0",
	}
}

func verifier(url string) *Verifier {
	return &Verifier{TenantID: tenant, ClientID: client, Allowed: []string{adminOID}, KeysURL: url, Now: func() time.Time { return now }}
}

func TestVerifyAcceptsAGoodToken(t *testing.T) {
	key := newKey(t)
	s, _ := keyServer(t, "k1", key)
	a, err := verifier(s.URL).Verify(context.Background(), sign(t, key, map[string]any{"alg": "RS256", "kid": "k1"}, goodClaims()))
	if err != nil || a.ID != adminOID || a.Name != "Test Admin" {
		t.Fatalf("got %+v, %v", a, err)
	}
}

func TestVerifyRefusesEveryBadToken(t *testing.T) {
	key, other := newKey(t), newKey(t)
	s, _ := keyServer(t, "k1", key)
	header := map[string]any{"alg": "RS256", "kid": "k1"}
	with := func(change func(map[string]any)) map[string]any {
		c := goodClaims()
		change(c)
		return c
	}
	cases := map[string]string{
		"signed by another key": sign(t, other, header, goodClaims()),
		"unknown key id":        sign(t, key, map[string]any{"alg": "RS256", "kid": "k2"}, goodClaims()),
		"alg none":              strings.Join(strings.Split(sign(t, key, map[string]any{"alg": "none", "kid": "k1"}, goodClaims()), ".")[:2], ".") + ".",
		"HS256":                 sign(t, key, map[string]any{"alg": "HS256", "kid": "k1"}, goodClaims()),
		"another tenant":        sign(t, key, header, with(func(c map[string]any) { c["tid"] = "99999999-9999-9999-9999-999999999999" })),
		"wrong issuer":          sign(t, key, header, with(func(c map[string]any) { c["iss"] = "https://evil.example/" + tenant + "/v2.0" })),
		"another app":           sign(t, key, header, with(func(c map[string]any) { c["aud"] = "44444444-4444-4444-4444-444444444444" })),
		"expired":               sign(t, key, header, with(func(c map[string]any) { c["exp"] = now.Add(-time.Hour).Unix() })),
		"not valid yet":         sign(t, key, header, with(func(c map[string]any) { c["nbf"] = now.Add(time.Hour).Unix() })),
		"no admin scope":        sign(t, key, header, with(func(c map[string]any) { c["scp"] = "User.Read" })),
		"not an allowed admin":  sign(t, key, header, with(func(c map[string]any) { c["oid"] = "55555555-5555-5555-5555-555555555555" })),
		"not a JWT":             "abc",
	}
	for name, token := range cases {
		if _, err := verifier(s.URL).Verify(context.Background(), token); !errors.Is(err, ErrNotAdmin) {
			t.Errorf("%s: err %v, want ErrNotAdmin", name, err)
		}
	}
}

func TestVerifyAcceptsTheV1IssuerAndApiAudience(t *testing.T) {
	key := newKey(t)
	s, _ := keyServer(t, "k1", key)
	c := goodClaims()
	c["iss"], c["aud"] = "https://sts.windows.net/"+tenant+"/", "api://"+client
	if _, err := verifier(s.URL).Verify(context.Background(), sign(t, key, map[string]any{"alg": "RS256", "kid": "k1"}, c)); err != nil {
		t.Fatal(err)
	}
}

func TestAnUnknownKeyIdRefetchesAtMostOnceAMinute(t *testing.T) {
	key := newKey(t)
	s, fetches := keyServer(t, "k1", key)
	v := verifier(s.URL)
	bad := sign(t, key, map[string]any{"alg": "RS256", "kid": "rotated"}, goodClaims())
	for range 5 {
		_, _ = v.Verify(context.Background(), bad)
	}
	if *fetches != 1 {
		t.Fatalf("fetched the keys %d times, want 1", *fetches)
	}
}

type fakeStore struct {
	log      []domain.AdminLogEntry
	failLog  bool
	accounts []domain.AdminAccount
	query    string
}

func (f *fakeStore) Overview(context.Context, time.Time, time.Duration) (domain.AdminOverview, error) {
	return domain.AdminOverview{Accounts: 3}, nil
}
func (f *fakeStore) Accounts(_ context.Context, q string, _ int) ([]domain.AdminAccount, error) {
	f.query = q
	return f.accounts, nil
}
func (f *fakeStore) Phones(context.Context, string, int) ([]domain.AdminPhone, error) {
	return []domain.AdminPhone{}, nil
}
func (f *fakeStore) RecordAdmin(_ context.Context, e domain.AdminLogEntry) error {
	if f.failLog {
		return errors.New("db down")
	}
	f.log = append(f.log, e)
	return nil
}
func (f *fakeStore) AdminLog(context.Context, int) ([]domain.AdminLogEntry, error) { return f.log, nil }
func (f *fakeStore) Stats(_ context.Context, _ time.Time, days int) (domain.AdminStats, error) {
	return domain.AdminStats{Days: make([]domain.DayStat, days)}, nil
}

type fixedVerifier struct{}

func (fixedVerifier) Verify(_ context.Context, token string) (domain.Admin, error) {
	if token != "good" {
		return domain.Admin{}, ErrNotAdmin
	}
	return domain.Admin{ID: adminOID, Name: "Test Admin"}, nil
}

func serve(h *Handlers, path, token string) *httptest.ResponseRecorder {
	mux := http.NewServeMux()
	Routes(mux, h)
	req := httptest.NewRequest(http.MethodGet, path, nil)
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, req)
	return w
}

func TestEveryAdminReadIsLoggedFirst(t *testing.T) {
	store := &fakeStore{accounts: []domain.AdminAccount{{ID: "p1", Email: "parent@example.com"}}}
	h := &Handlers{Verifier: fixedVerifier{}, Store: store, Now: func() time.Time { return now }}
	w := serve(h, "/api/v1/admin/accounts?q=parent", "good")
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), "parent@example.com") {
		t.Fatalf("status %d body %s", w.Code, w.Body)
	}
	if len(store.log) != 1 || store.log[0].Action != "listed_accounts" || store.log[0].Target != "search" || // what was searched (often an email) is not kept
		store.log[0].AdminID != adminOID {
		t.Fatalf("log %+v", store.log)
	}
	if w.Header().Get("Cache-Control") != "no-store" {
		t.Fatal("admin answers must not be cached")
	}
}

func TestNoTokenOrABadOneReadsNothing(t *testing.T) {
	for _, token := range []string{"", "bad"} {
		store := &fakeStore{}
		w := serve(&Handlers{Verifier: fixedVerifier{}, Store: store}, "/api/v1/admin/overview", token)
		if w.Code != http.StatusUnauthorized || len(store.log) != 0 || strings.Contains(w.Body.String(), "accounts") {
			t.Errorf("token %q: status %d body %s log %d", token, w.Code, w.Body, len(store.log))
		}
	}
}

func TestNothingIsReadWhenTheLogCantBeWritten(t *testing.T) {
	store := &fakeStore{failLog: true, accounts: []domain.AdminAccount{{Email: "parent@example.com"}}}
	w := serve(&Handlers{Verifier: fixedVerifier{}, Store: store}, "/api/v1/admin/accounts", "good")
	if w.Code != http.StatusInternalServerError || strings.Contains(w.Body.String(), "parent@example.com") {
		t.Fatalf("status %d body %s", w.Code, w.Body)
	}
}
