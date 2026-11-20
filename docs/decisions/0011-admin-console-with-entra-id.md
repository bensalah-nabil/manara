# ADR-0011: An admin console, signed in with Microsoft Entra ID

Date: 2026-11-19. Status: accepted (the owner chose Entra ID).

## Context

Running Manara meant opening Neon's SQL editor and Render's logs to answer "how many phones
are there, which stopped reporting, why did that setup fail". That is slow, easy to get wrong,
and leaves no record of who looked at what.

## Decision

- A **separate app** (`admin/`, its own Vercel project) and a separate API prefix
  (`/api/v1/admin/*`). Nothing is shared with the parents' sign-in or sessions, so a parent
  account can never reach it, and a bug in one can't open the other.
- **Sign-in with Microsoft Entra ID**, in a tenant of the owner's own, with MFA from Microsoft.
  Manara stores no admin password. Three locks: Entra's user assignment, the token's
  `Admin.Access` scope, and the server's list of allowed object IDs.
- The server checks the token itself with the standard library (RS256, keys from the tenant's
  discovery endpoint), the same choice as calling FCM without the Firebase SDK (CLAUDE.md).
- **Support actions, never the families' phones** (part 1, 2026-11-20, the owner's request): turn
  off two-step sign-in, send a reset link, suspend or reactivate, delete an account with no phone,
  clear a stuck setup, remove a phone record, choose the version phones are offered, show a
  notice. Each needs a reason and a typed confirmation, is logged first, and shows in the parent's
  Recent activity. Originally read-only; the list is in [`admin-console.md`](../admin-console.md).
- Only accounts, phones and setup states are shown. Never what a phone reports about
  a child (ADR-0001): no location, calls, app usage or rules.
- **Every request is logged before any read**, and fails if the log can't be written.

## Rejected

- *Admin flag on a parent account:* one stolen parent password away from every account.
- *Own login with a required second step:* it works, but adds a password store and a second-step
  flow to keep secure, where Entra gives both, with sign-in logs and conditional access, for free.
- *The employer's tenant:* their admins could read or switch it off, and it is lost on leaving.

## Consequences

- The privacy policy must say that the people who run Manara can see account emails and phone
  details to fix problems, before it is switched on (docs/admin-console.md).
- Adding actions later (resend an email, remove a stuck phone) means a write endpoint, which
  needs its own confirmation and stays in the same log.
