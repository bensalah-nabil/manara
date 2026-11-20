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

Every request is checked and **written to `admin_log` before anything is read or done**. If the
log can't be written, the server answers with an error and shows nothing. Entries are kept for a
year.

## What an admin can do (part 1, 2026-11-20)

| Action | Effect | Confirm by typing |
|---|---|---|
| Turn off two-step sign-in | For a parent who lost their authenticator | the account's email |
| Send a password-reset link | A one-hour link to the account's own email, nobody else | the account's email |
| Suspend / reactivate | Signed out everywhere; no sign-in, two-step code or reset link works until reactivated. Phones keep their rules | the account's email |
| Delete an account | Only one with no phone (a phone left behind could never be released) | the account's email |
| Clear a guided setup | The console forgets a stuck setup so the parent can start again; nothing changes on the phone | the phone's code (first 8 characters of its id) |
| Remove a phone | Only for a phone reset or lost: a managed phone keeps its rules and can't be released any more | the phone's code |
| Offer a version / pause updates / use Render's setting | The version phones download; the server downloads the GitHub file and checks its SHA-256 before offering it | the version name |
| Show / remove a notice | A message at the top of every parent's console, in en, fr, ar | — |

What an admin **cannot** do, by design: see a child's location, calls, app usage or rules; lock,
change or release a phone; send a command. The privacy page says so (en, fr, ar).

### How it meets the standards

| Requirement | How |
|---|---|
| Strong authentication (OWASP ASVS V2, MFA) | Microsoft Entra ID with multifactor authentication from the tenant; Manara stores no admin password |
| Deny by default, least privilege (ASVS V4) | Three locks: Entra user assignment, the `Admin.Access` scope, `ADMIN_ALLOWED_OIDS`. Without the settings the API does not exist |
| Deliberate, attributable actions (ASVS V4.3, V7) | Each action needs a reason (≤300 characters) and the target typed out; logged with who, what, target and reason **before** it runs, and again if it fails |
| Accountability to the person affected (GDPR art. 5, transparency) | Actions on an account appear in that parent's own Recent activity ("Manara support …") |
| Abuse limits (ASVS V11) | 30 actions per 10 minutes per admin, counted in Postgres across instances |
| Data minimisation (GDPR art. 5, law 2004-63) | No child data is readable or changeable; the parent's known phone numbers never reach the child's phone |
| Integrity of what phones install | A version is offered only after the server has downloaded the release and matched its SHA-256 |
| Re-authentication for sensitive steps | Not built: Entra access tokens carry no reliable sign-in time. The typed confirmation and the reason are the compensating control |

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
