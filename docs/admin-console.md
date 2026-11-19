# Admin console

A separate web app (`admin/`) for the people who run Manara: how many accounts and phones
there are, which phones stopped reporting, which setups failed and why, and a log of every
page an admin opened. Parents never see it. Decision: ADR-0011.

## What it shows, and what it never shows

| Shown | Never shown |
|---|---|
| Each account's email, creation date, language, two-step on or off, number of phones, last sign-in | Passwords, authenticator secrets, recovery codes |
| Each phone's brand, model, Android and Manara versions, last check-in | The child's name the parent typed (the phone's label) |
| The guided-setup step, status and error message | Location, calls, app usage, rules, events, anything else the phone reports |
| The admin log | |

It only reads. Changing or deleting an account still goes through the parent's own console,
or the delete-account page. Every request is checked and **written to `admin_log` before
anything is read**. If the log can't be written, the server answers with an error and shows
nothing. Entries are kept for a year.

## Sign-in: Microsoft Entra ID

Use **your own Entra tenant**, not an employer's. A personal project in a work tenant can be
read and switched off by that employer's admins, and you lose it when you leave.

### 1. A tenant of your own (once, free)

1. Go to `portal.azure.com` and sign in with a personal Microsoft account (Outlook or Hotmail),
   not a work one.
2. Open **Microsoft Entra ID**, then **Manage tenants**, then **Create**. Choose a **Workforce**
   tenant. Its name can be "Manara".
3. In the new tenant, under **Users**, create your admin user (for example
   `you@manara.onmicrosoft.com`). Turn on **multifactor authentication** for it, with the
   Microsoft Authenticator app or a passkey. The default "security defaults" setting does
   this for every user.

### 2. The app registration

In the tenant, go to **App registrations** and choose **New registration**:

- Name: `Manara admin`.
- Supported account types: **this organizational directory only** (single tenant).
- Redirect URI: platform **Single-page application (SPA)**, `https://<admin site>`. Add
  `http://localhost:5174` too, for testing on this PC.

Then, in the registration:

1. **Expose an API**. Set the Application ID URI (the default `api://<client id>` is fine).
   Add a scope named exactly `Admin.Access`, consented by admins only.
2. **API permissions**. Add a permission, choose My APIs, then Manara admin, then
   `Admin.Access`. Then choose **Grant admin consent**.
3. **Manifest**. Set `"requestedAccessTokenVersion": 2`. The server accepts v1 tokens too, but
   v2 is what Microsoft recommends.
4. **Enterprise applications**, then Manara admin, then Properties. Set **Assignment required**
   to **Yes**, then add your user under Users and groups. Only assigned users can then get a
   token at all, which is a second lock besides the server's own list.

Write down the **Directory (tenant) ID** and the **Application (client) ID** from Overview, and
your user's **Object ID** (Users, then your user).

### 3. The server (Render)

| Setting | Value |
|---|---|
| `ADMIN_ENTRA_TENANT_ID` | the Directory (tenant) ID |
| `ADMIN_ENTRA_CLIENT_ID` | the Application (client) ID |
| `ADMIN_ALLOWED_OIDS` | the admins' object IDs, separated by commas |
| `CORS_ALLOWED_ORIGIN` | add the admin site, after a comma (`https://<console>,https://<admin site>`) |

You set all three `ADMIN_` settings or none. With none, the admin API doesn't exist (404).
With only some of them, the server refuses to start. The log at start says
`admin console: on, N admin(s)`.

The server checks each request's token on its own, without Microsoft's SDK:
- signed with RS256 by one of the tenant's current keys (fetched from
  `login.microsoftonline.com/<tenant>/discovery/v2.0/keys`, and fetched again when a key is
  unknown, at most once a minute);
- this tenant as `tid` and as issuer;
- this app as audience;
- not expired;
- the `Admin.Access` scope;
- an object ID in `ADMIN_ALLOWED_OIDS`.

Microsoft's list of checks is at `learn.microsoft.com/entra/identity-platform/access-tokens`
("Validate tokens").

### 4. The admin site (Vercel)

Create a **second Vercel project** from the same repository, with root directory `admin`.
Give it these settings:

| Setting | Value |
|---|---|
| `VITE_API_URL` | `https://manara-api-pvu4.onrender.com/api/v1` |
| `VITE_ENTRA_TENANT_ID` | the tenant ID |
| `VITE_ENTRA_CLIENT_ID` | the client ID |

The build fails without them. `admin/vercel.json` sets a strict CSP (Microsoft's sign-in page
is the only outside address), `noindex`, and no framing. The site's address is not secret, but
don't link it from the public pages.

### Testing on this PC

```
cd admin
VITE_ENTRA_TENANT_ID=... VITE_ENTRA_CLIENT_ID=... npm run dev      # http://localhost:5174
```

The local server then needs the same three `ADMIN_` settings, and `CORS_ALLOWED_ORIGIN` must
include `http://localhost:5174`.

## Before turning it on

- **Privacy policy.** The policy says who processes parents' data, but not that the people
  who run Manara can see each account's email and phones to fix problems. Add that sentence,
  in English, French and Arabic, before setting the `ADMIN_` settings on Render. It is part of
  the lawyer's brief (legal work on standby).
- **Who is an admin.** Only you, for now. A second admin is one more object ID in
  `ADMIN_ALLOWED_OIDS`, plus an assignment in Enterprise applications.

## Verified

- **A real sign-in (2026-11-19):** the TUR tenant (`talantest.onmicrosoft.com`), app
  `Manara admin`, on this PC (`localhost:5174`). Microsoft's access token passed every server
  check (key, tenant, issuer, audience, expiry, scope, object ID), and each page opened was
  logged (`opened_console`, `viewed_overview`, `listed_phones`). The overview and its "Needs
  attention" list rendered. The data behind it was invented, from a temporary server with the
  real token check in front of a fake store.

## Not verified yet

- The SQL behind the pages runs only in CI's Postgres (`admin_repository_test.go`). This PC has
  no database.
- The deployed site: its own Vercel project, its HTTPS redirect URI in the app registration,
  and the settings on Render.
- A refused sign-in from a real account that isn't on the list (unit-tested only).
