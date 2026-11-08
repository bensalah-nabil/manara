# Security and certification

Manara holds the keys to a child's phone. This file is the plan for proving it
handles them well, and the record of where it stands.

## Target

**App Defense Alliance MASA, assurance level 2** for the Android app: an
authorized lab tests the public Play version against the MASA specification
(built on OWASP MASVS), black-box, with no code review. Passing earns the
"Independent security review" badge in the app's Play Data safety section.
The lab is chosen and paid by the developer (NowSecure, Leviathan, NCC Group,
TAC Security and others); it takes about 2 to 3 weeks and is renewed every
year. AL1 is a self-attestation (an APK scan and a questionnaire) with no
badge: a useful rehearsal before paying for AL2.

Sources (2026-11-08): [ADA MASA](https://appdefensealliance.dev/masa),
[AL2](https://appdefensealliance.dev/masa/masa-al2),
[FAQ](https://appdefensealliance.dev/masa/faq), the
[MASA specification](https://github.com/appdefensealliance/ASA-WG/blob/develop/MASA/MASA%20Specification.md)
(branch `develop`), and a public lab report
([Mullvad](https://mullvad.net/en/blog/successful-security-assessment-of-our-android-app)).

The lab tests the app, and the app's traffic reaches the server, so the server
and the console are held to OWASP ASVS level 2 as our own standard (no badge).

## MASA requirements, Android

Status: **meets** (with the evidence), **gap** (with the action), **explain**
(meets, but a scanner will flag it; the lab needs the reason).

| # | Requirement | Status | Evidence or action |
| --- | --- | --- | --- |
| 1.1.1.1 | Sensitive data not in external storage | meets | Setup's saved apps and adb key are in `noBackupFilesDir`; nothing uses external storage |
| 1.1.2.1 | Keyboard cache off for sensitive inputs | meets | Release code: `NumberPassword`; connection code: `Password`, no autocorrect (2026-11-08) |
| 1.1.2.2 | No sensitive data in logs | meets | No token, code, password or key is logged (grep, 2026-11-08). Logs name packages and the DNS host. Optional: strip `Log.i` in release with R8 |
| 1.2.1.1 | No insecure random for security | meets | `SecureRandom` for the QR pairing; server tokens from `crypto/rand` |
| 1.2.1.2-3 | Strong symmetric crypto | meets | Device token and release key: AES/GCM/NoPadding in the Android Keystore (`SecureTokenCipher`). Release codes: HOTP over HMAC-SHA256, compared in constant time |
| 1.2.2.1-2 | Key management | meets | Keystore key, non-exportable, encryption only; release secret per device from the server |
| 1.3.1.1 | PKCE for OAuth | n/a | No OAuth |
| 1.4.1.1-3 | Encrypted traffic, good TLS, verified endpoint | meets / explain | Release builds allow HTTPS only (cleartext only for a plain-http dev URL); OkHttp's default TLS and CA checks; no custom trust in Manara's code. Explain: during setup, Kadb opens TLS to the phone's own adb, authenticated by the pairing (SPAKE2), not a CA |
| 1.5.1.1 | Content providers | meets | None exported (Firebase and androidx providers are not exported) |
| 1.5.1.2 | Verified links | n/a | No deep links |
| 1.5.1.3 | IPC exposed only as intended | meets | Exported: `MainActivity` (the launcher) and `OwnerReceiver` (guarded by `BIND_DEVICE_ADMIN`). `BootReceiver` is not exported (2026-11-08): AOSP's `ActivityManager.canAccessUnexportedComponents` lets the system UID, which sends `BOOT_COMPLETED` and `MY_PACKAGE_REPLACED`, reach unexported receivers. Verified on the SM-A045F: installing version 1.0.4 without opening Manara, the system (uid 1000) delivered `MY_PACKAGE_REPLACED` to it and the notice came back |
| 1.5.1.4 | PendingIntents immutable or justified | explain | Setup notice: immutable. Location: `FLAG_MUTABLE`, because the fused location provider writes the fix into the delivered Intent (`LocationResult.extractResult`). It names its receiver class explicitly, the mitigation Android's PendingIntent guidance gives, so a filler can't redirect it. Not given an action or package on purpose: that would change its identity and strand the registration made by older versions |
| 1.5.2.1-2 | WebView | n/a | No WebView |
| 1.5.3.1 | Mask sensitive data in the UI | meets | Code fields are password-type; the release code is never displayed on the phone |
| 1.6.1.1 | Up-to-date targetSdk | meets | 36 |
| 1.6.2.1 | No components with known vulnerabilities | meets | 2026-11-08: the app's 169 release libraries clean on OSV.dev (`tools/security/osv_check.py`, shown to flag BouncyCastle 1.60), the server clean with `govulncheck`, the console with `npm audit`. All three run in CI (`.github/workflows/ci.yml`) on every push |
| 1.6.3.1 | Compiler security features | meets | Only native library: Google's `libandroidx.graphics.path.so` |
| 1.6.3.2 | Injection in content providers | n/a | No providers |
| 1.6.3.3 | No arbitrary redirects in WebViews | n/a | No WebView |
| 1.6.3.4 | Implicit intents appropriate | meets | Only to open Settings screens and the privacy page |
| 1.7.1.1 | Properly signed | meets | Upload key with APK Signature Scheme v2; Play App Signing re-signs the published app |
| 1.7.2.1 | No debug symbols in production | meets | R8 minification and resource shrinking in release |
| 1.7.3.1 | Not debuggable | meets | Release is not debuggable (`aapt2 dump badging`) |
| 1.8.1.1 | Minimal access to sensitive data | explain | Every permission maps to a parent-visible feature: usage stats (time limits, usage report), location incl. background (location sharing, only when on, with its own notice), notifications (the managed notice), boot (restart). No contacts, SMS, call log, camera or microphone (ADR-0001). Prepare the one-line reason for each |

## Server and console (ASVS level 2, our standard)

Found and fixed 2026-11-08:

- **No rate limits.** Now: 20 requests per 10 minutes per client on login,
  sign-up, password reset and enrollment, and 10 login attempts per email per
  15 minutes from anywhere (`internal/transport/guard`). The client address is
  read from `CF-Connecting-IP` on Render (`TRUSTED_IP_HEADER`), never from
  `X-Forwarded-For`, which a client can write.
- **Sessions never expired, and signing out only forgot the token in the
  browser.** Now: 30-day sessions, `POST /console/auth/logout` revokes on the
  server, expired sessions are purged hourly; a password reset ends every
  session.
- **Login timing told whether an email was registered** (no bcrypt for unknown
  addresses). Now: the same bcrypt work either way.
- **No server timeouts or body limit** (slow or huge requests could tie it
  up). Now: header, read, write and idle timeouts, 64 KB headers, 4 MB bodies.
- **The console had no Content-Security-Policy or HSTS.** Now: a strict CSP
  (scripts only from the site, one API origin, no frames), HSTS and a
  Permissions-Policy, checked with no violations on every page.

Already in place: bcrypt passwords (8+ characters), hashed session, device,
enrollment and reset tokens; single-use enrollment codes with the guardian's
statements recorded; reset links single-use, one hour, same answer for any
address; account deletion behind the password; every per-phone route checks
the phone belongs to the signed-in parent; CORS limited to the console origin;
retention limits on collected data.

## Open, in order

1. ~~Android dependency scan and CI~~ (done 2026-11-08; watch the first CI run).
2. ~~The two "verify" items~~ (done; the unexported `BootReceiver` verified on
   a phone).
3. ~~Two-step sign-in for parents~~ (done 2026-11-08, capability-plan E2):
   RFC 6238 codes (tested against the RFC's vectors and, end to end, an
   independent implementation), each 30-second code accepted once, 10 hashed
   single-use recovery codes, a 5-minute challenge with 5 tries, and a
   password reset that does not skip it. Accepted for now: the authenticator
   secret is stored as is in the database (it is only useful together with the
   password); encrypting it with a server key is a later step.
4. ~~Threat model~~ ([threat-model.md](threat-model.md), 2026-11-08). It found
   and fixed: enrollment codes that never expired (now 24 h), an unpinned
   Gradle download (checksum pinned), and a child changing the clock to
   escape a lock window (the date and time are now locked, with automatic
   time, by default on new phones; checked on the Android 14 emulator). Its
   remaining items: an audit log of parent actions, removing every adb key at
   the end of setup, then an external penetration test with it as scope.
5. **Rate limits and the alert throttle in Postgres** before running a second
   server instance (they are in memory today).
6. **MASA AL1 self-attestation** as a rehearsal, then **AL2** with a lab, on
   the published Play version.

Process for each release: unit and chaos tests, the emulator matrix, the three
dependency scans, then the release build on a real phone (`testing.md`).
