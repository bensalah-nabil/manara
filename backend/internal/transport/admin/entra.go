// Package admin is the admin console's API: who runs Manara signs in with Microsoft Entra ID and
// sees accounts, phones and problems (docs/admin-console.md). Parents never reach it.
package admin

import (
	"context"
	"crypto"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"math/big"
	"net/http"
	"slices"
	"strings"
	"sync"
	"time"

	"manara/backend/internal/domain"
)

// Scope is the delegated permission the admin app's access token must carry. It is defined
// under "Expose an API" in the Entra app registration (docs/admin-console.md).
const Scope = "Admin.Access"

var ErrNotAdmin = errors.New("not an admin")

// Verifier checks an Entra ID access token: signed by the tenant's current keys (RS256),
// issued by that tenant for this app, not expired, with the admin scope, and for one of the
// allowed object ids. Microsoft's documented checks for a web API
// (learn.microsoft.com/entra/identity-platform/access-tokens, "Validate tokens").
type Verifier struct {
	TenantID string
	ClientID string
	// Allowed holds the Entra object ids (oid) of the admins. Anyone else in the tenant is refused.
	Allowed []string
	// KeysURL defaults to the tenant's v2.0 discovery keys.
	KeysURL string
	HTTP    *http.Client
	Now     func() time.Time

	mu        sync.Mutex
	keys      map[string]*rsa.PublicKey
	fetchedAt time.Time
}

type tokenHeader struct {
	Alg string `json:"alg"`
	Kid string `json:"kid"`
}

type tokenClaims struct {
	Iss               string          `json:"iss"`
	Aud               string          `json:"aud"`
	Tid               string          `json:"tid"`
	Oid               string          `json:"oid"`
	Exp               int64           `json:"exp"`
	Nbf               int64           `json:"nbf"`
	Scp               string          `json:"scp"`
	Name              string          `json:"name"`
	PreferredUsername string          `json:"preferred_username"`
	Ver               json.RawMessage `json:"ver"`
}

const clockSkew = 2 * time.Minute

func (v *Verifier) Verify(ctx context.Context, token string) (domain.Admin, error) {
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return domain.Admin{}, fmt.Errorf("%w: not a JWT", ErrNotAdmin)
	}
	var header tokenHeader
	if err := decodePart(parts[0], &header); err != nil {
		return domain.Admin{}, fmt.Errorf("%w: header: %v", ErrNotAdmin, err)
	}
	// Only RS256: refuses "none" and any algorithm swap.
	if header.Alg != "RS256" || header.Kid == "" {
		return domain.Admin{}, fmt.Errorf("%w: algorithm %q", ErrNotAdmin, header.Alg)
	}
	key, err := v.key(ctx, header.Kid)
	if err != nil {
		return domain.Admin{}, err
	}
	signature, err := base64.RawURLEncoding.DecodeString(parts[2])
	if err != nil {
		return domain.Admin{}, fmt.Errorf("%w: signature encoding", ErrNotAdmin)
	}
	digest := sha256.Sum256([]byte(parts[0] + "." + parts[1]))
	if err := rsa.VerifyPKCS1v15(key, crypto.SHA256, digest[:], signature); err != nil {
		return domain.Admin{}, fmt.Errorf("%w: bad signature", ErrNotAdmin)
	}

	var c tokenClaims
	if err := decodePart(parts[1], &c); err != nil {
		return domain.Admin{}, fmt.Errorf("%w: claims: %v", ErrNotAdmin, err)
	}
	now := v.now()
	switch {
	case c.Tid != v.TenantID:
		return domain.Admin{}, fmt.Errorf("%w: another tenant", ErrNotAdmin)
	case c.Iss != "https://login.microsoftonline.com/"+v.TenantID+"/v2.0" && c.Iss != "https://sts.windows.net/"+v.TenantID+"/":
		return domain.Admin{}, fmt.Errorf("%w: issuer %q", ErrNotAdmin, c.Iss)
	case c.Aud != v.ClientID && c.Aud != "api://"+v.ClientID:
		return domain.Admin{}, fmt.Errorf("%w: audience %q", ErrNotAdmin, c.Aud)
	case c.Exp == 0 || now.After(time.Unix(c.Exp, 0).Add(clockSkew)):
		return domain.Admin{}, fmt.Errorf("%w: expired", ErrNotAdmin)
	case c.Nbf != 0 && now.Add(clockSkew).Before(time.Unix(c.Nbf, 0)):
		return domain.Admin{}, fmt.Errorf("%w: not valid yet", ErrNotAdmin)
	case !slices.Contains(strings.Fields(c.Scp), Scope):
		return domain.Admin{}, fmt.Errorf("%w: no %s scope", ErrNotAdmin, Scope)
	case c.Oid == "" || !slices.Contains(v.Allowed, c.Oid):
		// The object id isn't secret, and naming it is what lets the owner fix ADMIN_ALLOWED_OIDS.
		return domain.Admin{}, fmt.Errorf("%w: object id %q not in ADMIN_ALLOWED_OIDS", ErrNotAdmin, c.Oid)
	}
	name := c.Name
	if name == "" {
		name = c.PreferredUsername
	}
	return domain.Admin{ID: c.Oid, Name: name}, nil
}

func (v *Verifier) now() time.Time {
	if v.Now != nil {
		return v.Now()
	}
	return time.Now()
}

// key returns the signing key for kid, fetching the tenant's keys when it is unknown. Entra
// rotates keys, so an unknown kid triggers a refetch, at most once a minute.
func (v *Verifier) key(ctx context.Context, kid string) (*rsa.PublicKey, error) {
	v.mu.Lock()
	defer v.mu.Unlock()
	if k, ok := v.keys[kid]; ok && v.now().Sub(v.fetchedAt) < 24*time.Hour {
		return k, nil
	}
	if !v.fetchedAt.IsZero() && v.now().Sub(v.fetchedAt) < time.Minute {
		if k, ok := v.keys[kid]; ok {
			return k, nil
		}
		return nil, fmt.Errorf("%w: unknown key", ErrNotAdmin)
	}
	keys, err := v.fetchKeys(ctx)
	if err != nil {
		return nil, err
	}
	v.keys, v.fetchedAt = keys, v.now()
	if k, ok := keys[kid]; ok {
		return k, nil
	}
	return nil, fmt.Errorf("%w: unknown key", ErrNotAdmin)
}

func (v *Verifier) fetchKeys(ctx context.Context) (map[string]*rsa.PublicKey, error) {
	url := v.KeysURL
	if url == "" {
		url = "https://login.microsoftonline.com/" + v.TenantID + "/discovery/v2.0/keys"
	}
	client := v.HTTP
	if client == nil {
		client = &http.Client{Timeout: 10 * time.Second}
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("fetch entra keys: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("fetch entra keys: status %d", resp.StatusCode)
	}
	var set struct {
		Keys []struct {
			Kty string `json:"kty"`
			Kid string `json:"kid"`
			N   string `json:"n"`
			E   string `json:"e"`
		} `json:"keys"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(nil, resp.Body, 1<<20)).Decode(&set); err != nil {
		return nil, fmt.Errorf("read entra keys: %w", err)
	}
	keys := map[string]*rsa.PublicKey{}
	for _, k := range set.Keys {
		if k.Kty != "RSA" || k.Kid == "" {
			continue
		}
		n, errN := base64.RawURLEncoding.DecodeString(k.N)
		e, errE := base64.RawURLEncoding.DecodeString(k.E)
		if errN != nil || errE != nil || len(e) > 4 {
			continue
		}
		exp := 0
		for _, b := range e {
			exp = exp<<8 | int(b)
		}
		keys[k.Kid] = &rsa.PublicKey{N: new(big.Int).SetBytes(n), E: exp}
	}
	return keys, nil
}

func decodePart(part string, into any) error {
	raw, err := base64.RawURLEncoding.DecodeString(part)
	if err != nil {
		return err
	}
	return json.Unmarshal(raw, into)
}
