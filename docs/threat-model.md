# Threat model

What could go wrong with Manara, who would do it, and what stops them.
Grounded in the code as of 2026-11-08; [`security.md`](security.md) tracks the
certification work, this file the threats. Re-read it when a capability or an
endpoint is added.

## What is worth protecting

| Asset | Where | Why it matters |
| --- | --- | --- |
| Control of a child's phone | Parent session, device owner rights | Lock, rules, release: in the wrong hands, a phone turned against the child or the parent |
| The child's data | Server: location (30 days), app minutes (30), limit hits and protection reports (90) | Location is the most sensitive; nothing else is collected (ADR-0001) |
| Parent credentials | bcrypt password hashes, TOTP secrets, recovery code hashes | Account takeover |
| Device credentials | Device token (Keystore on the phone, hashed on the server), release secret | Impersonating a phone, or releasing it |
| One-time codes | Enrollment codes (24 h), reset links (1 h), release codes (time-based, 8 digits), setup pairing QR/code | Each opens a door once |
| Operator secrets | Firebase service account, Brevo key, database URL, upload key | Push to every phone, email as Manara, all data, a signed update |

## Who

1. **The child** using the managed phone: wants rules off, has the phone in
   hand, time, and sometimes help from the internet. The most active attacker.
2. **Someone after a parent's account**: password guessing, phishing, a reused
   password.
3. **An abusive "parent"**: installs Manara on a partner's or an adult's phone
   (stalkerware use).
4. **A malicious app on the child's phone.**
5. **Someone on the same Wi-Fi** during guided setup.
6. **An attacker against the server**: internet-facing API.
7. **A compromised dependency or build tool.**

## Threats, mitigations, gaps (STRIDE)

### 1. The child (tampering, denial of service)

| Threat | Mitigation | Status |
| --- | --- | --- |
| Uninstall Manara, or turn off its admin | Device owner apps can't be uninstalled or deactivated by the user | in place |
| Factory reset from Settings | `DISALLOW_FACTORY_RESET` (default on) | in place; recovery-mode reset not covered (Android doesn't), FRP research open (capability-plan A5) |
| Safe mode, new user, developer options / adb | `DISALLOW_SAFE_BOOT`, `DISALLOW_ADD_USER`, `DISALLOW_DEBUGGING_FEATURES` (default on) | in place |
| Change the clock to escape a lock window or reset a daily limit | `DISALLOW_CONFIG_DATE_TIME` + automatic time (default on for new phones, 2026-11-08) | in place; existing phones need it ticked |
| Change Private DNS or start a VPN to escape the filter | `DISALLOW_CONFIG_PRIVATE_DNS`, `DISALLOW_CONFIG_VPN` (parent's choice) | in place |
| Chrome's own encrypted DNS around the filter | Chrome policy `DnsOverHttpsMode=off` | in place for Chrome; another browser: block it with a 0-minute limit, or the planned on-phone filter (B1) |
| Take the phone offline so nothing is reported | The parent is told after 12 h of silence; rules keep working offline | in place |
| Turn off Usage access or Location | Reported to the parent as a broken protection | in place |
| Brute-force the offline release code | 8 digits, time-based, attempts locked out (`ReleaseAttempts`) | in place |

### 2. Parent account (spoofing, elevation)

| Threat | Mitigation | Status |
| --- | --- | --- |
| Password guessing | 20/10 min per client, 10 logins/15 min per email; 8+ character passwords | in place |
| Stolen or phished password | Two-step sign-in (TOTP, recovery codes) | in place, opt-in; consider making it required |
| Learning which emails have accounts | Same answer and the same bcrypt time for unknown emails; reset requests answer the same | in place (sign-up still says "email taken": accepted) |
| Stolen session token | 30-day expiry, sign-out revokes, CSP against script injection, `sessionStorage` (not shared across tabs) | in place |
| Password reset used to take over | Link to the account's email only, 1 h, single use, ends every session, two-step still applies | in place |
| One parent reading another's phone (IDOR) | Every per-phone route checks the phone belongs to the signed-in parent (`ownsDevice`) | in place, tested |

### 3. Abusive "parent" (the stalkerware case)

| Threat | Mitigation | Status |
| --- | --- | --- |
| Monitoring an adult or partner in secret | No hidden mode, ever (ADR-0001): a permanent notice, a separate location notice, the phone's own screen lists every rule and what the parent sees; attestations recorded at enrollment; nothing read from messages, calls, photos or browsing | in place by design |
| Collecting more than needed | Every collection is opt-in, shown to the child, and expires (retention sweep) | in place |

### 4. Malicious app on the phone

| Threat | Mitigation | Status |
| --- | --- | --- |
| Calling Manara's components | Only the launcher activity and the device-admin receiver (system-only permission) are exported; the boot receiver is not | in place, verified on a phone |
| Hijacking a PendingIntent | Immutable, except the location one, which names its receiver | explained (security.md 1.5.1.4) |
| Reading Manara's data | App-private storage; tokens encrypted with a Keystore key | in place |

### 5. Same Wi-Fi during guided setup

| Threat | Mitigation | Status |
| --- | --- | --- |
| Pairing a foreign computer to the child's adb while the pairing screen is open | The QR name/password is shown only to the signed-in parent and cleared when pairing succeeds; pairing needs the phone's own screen open; Android shows paired devices | partly: anyone on the Wi-Fi who sees the code could pair in that window. Wireless debugging is turned off at the end and debugging blocked; **check** that setup also removes every paired key, not only Manara's |
| Reading setup traffic | adb over TLS, keys from the pairing | in place |

### 6. The server (all of STRIDE)

| Threat | Mitigation | Status |
| --- | --- | --- |
| Forged device | Device token, hashed at rest; enrollment codes single use, 24 h | in place |
| Tampering with another phone's commands | Commands are bound to the device token's phone | in place |
| Repudiation (who changed a rule?) | Policy versions; no audit log of who changed what | **gap**: an audit log of parent actions |
| Data leak from the database | Hashed tokens and passwords; Neon encrypts at rest; retention limits | location rows are not encrypted by the app (**open**, roadmap Phase 4); TOTP secrets stored as is (accepted, security.md) |
| Denial of service | Rate limits, timeouts, size limits | in place for one instance; limits are in memory (security.md, item 5) |
| Request forgery from another site | Bearer tokens in a header (no cookies), CORS to the console origin | in place |
| Injection | Parameterized SQL everywhere (pgx); JSON only | in place |

### 7. Supply chain and operator secrets

| Threat | Mitigation | Status |
| --- | --- | --- |
| A vulnerable library | CI: govulncheck, npm audit, OSV.dev for the app | in place |
| A tampered Gradle download | `distributionSha256Sum` pinned (checked against gradle.org) | in place |
| A tampered npm or Go module | `package-lock.json`, `go.sum` | in place |
| Leaked Firebase or Brevo key | Render secret files and env vars; never in git (.gitignore) | in place; rotate on any suspicion |
| A leaked upload key | Play App Signing holds the real signing key; the upload key can be reset through Play | in place |

## Next

1. Audit log of parent actions (who locked, released, changed a rule, when).
2. Guided setup: confirm every adb key is removed at the end, not only Manara's.
3. Consider making two-step sign-in required for new accounts.
4. External penetration test of the server, with this file as its scope.
