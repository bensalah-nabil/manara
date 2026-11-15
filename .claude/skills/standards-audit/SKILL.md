---
name: standards-audit
description: Audit Manara against the standards a parental-control app must meet — its own visibility rule (ADR-0001), mobile security (OWASP MASVS / MASA, docs/security.md), Google Play policy for the play flavor, data protection (Tunisia's law 2004-63 and the INPDP, GDPR for EU users), what the privacy page promises, and accessibility of the console (WCAG 2.2 AA, Arabic right to left). Use before a release, before a Play submission, when a feature collects new data, or when asked whether the app "meets standards".
---

# Standards audit

An audit reports findings with evidence (file and line, a screenshot, a command's output) and a
status per item: **meets**, **gap** (what is missing, how to know it's fixed), or **not checked**.
It never claims compliance with a law or a certification: it says what the code and pages do and
where they fall short, and points to who must decide (a lawyer, the INPDP, an authorized MASA lab).
Facts about Play policy or a law are taken from the official text, fetched and cited, not recalled.

## 1. Visibility first (ADR-0001, the one rule with no exceptions)

`docs/legal-and-ethics.md` ("What contributors must not add", "Data handling commitments") and
`docs/decisions/0001-visible-monitoring-only.md`, `0008-visible-call-history.md`.

- List every kind of data the phone collects (search `EventKind`, the sync payload in
  `sync/ManaraApi.kt`, `backend/internal/domain/event.go`): for each, where the **child's phone** says so
  (`policy/NoticeSummary.kt`, `ui/HomeModel.kt`) in all three languages.
- Nothing hidden: no feature that turns off or hides the managed notice while Manara manages the phone;
  no message content, no microphone, no screenshots of the child's screen, no keystrokes.
- The `play` flavor has no call-log permission (ADR-0008): check the merged manifest of a `play` build.

## 2. Security (`docs/security.md`)

- Walk "What's left, in order" and report the state of each item; that list is the plan to MASA AL2.
- For the changes under review, run the `security-review` skill and include its findings.
- Spot checks: no secret in the repo (`git grep -n -I -E "BEGIN (RSA|EC|PRIVATE)|AIza|sk_live|password *="`),
  `backend/service-account.json` is git-ignored and not committed, HTTPS only in release builds,
  `govulncheck` and `npm audit --omit=dev` clean.

## 3. Google Play (play flavor)

Fetch and read the current policy pages before judging: the Families policy (apps for or used on
children's devices), the Device and Network Abuse policy, the Permissions policy, the User Data policy
and the Data safety form. Check:

- the Data safety answers match section 1's list exactly;
- the prominent disclosure and consent before any sensitive collection (location in background);
- device-owner use is explained in the listing, and nothing is hidden from the user of the phone.

## 4. Data protection

- Tunisia: Organic Law 2004-63 on personal data protection, supervised by the INPDP. Data about a child
  and location data are sensitive. Fetch the text and the INPDP's guidance before stating obligations;
  list the questions for a lawyer (declaration or authorization, consent of the parent, data abroad:
  Render and Neon host outside Tunisia).
- GDPR if parents in the EU use it: lawful basis, a child's data, rights of access and deletion.
- Check against the code: retention (the console says 30 days; find the job that deletes and its test,
  e.g. `backend/internal/domain/retention_test.go`), account deletion (`delete-account.html` and
  `DELETE /console/account` really delete events, locations and devices), export of a parent's data.
- `controller/public/privacy.html` promises only what the code does. Any mismatch is a gap.

## 5. Accessibility (console)

WCAG 2.2 AA on the main screens, in English and Arabic:

- contrast of text and controls in light and dark mode; focus visible; every control reachable by keyboard;
- `lang` and `dir` set (Arabic is right to left), labels on inputs, alt text on images;
- usable at phone width (375 px) and with the text enlarged to 200%.

Render the screens and look (the screenshot method used before: build, `vite preview`, headless Chrome).

## 6. Report

A table per section: item, status, evidence, what would close a gap. Then the three gaps to fix first,
judged by harm to a family. Say clearly which items need a human authority to decide.
