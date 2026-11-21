# On standby

Work the owner paused on purpose. Nothing here restarts unless the owner asks; when they
do, start from the item's own document. Device checks that only wait for time or a phone
are in [`pending-verifications.md`](pending-verifications.md); the product order is in
[`roadmap.md`](roadmap.md).

Last updated 2026-11-20.

## New features (paused 2026-11-20)

The owner paused new features to bring Manara to parents and find families to test it. Fixes to
what exists, and what testers report, still go ahead. Paused with it: the prayer-time pause (P14),
phone pick-ups (W3), requests from the child (D3), the self-control track (S1 to S5), and the
Xiaomi changes not built yet (X2, X11, X13, resuming setup mid-way).

## Google Play (paused 2026-11-19 and 2026-11-20)

| Item | Where it stopped | Next step | Document |
|---|---|---|---|
| Developer identity verification | **Resubmitted 2026-11-21, in review.** The linked payments profile now has the Latin name and the address as on the identity card | Wait for Google's answer (a few days). If refused, send only the refusal message. After approval: verify the contact phone by SMS | [`play-console-checklist.md`](play-console-checklist.md) |
| Closed test, 12 testers for 14 days | Not started (needs verification first) | Create the app, upload the `play` bundle, invite testers | [`play-store.md`](play-store.md) |
| Permissions Declaration Form for `READ_CALL_LOG` | Not drafted | Draft the explanation (visible parental control, only while the parent turns it on, the child told, numbers only, 30 days). Parental control is not on Google's allowed list, so submit it as a **separate update after** a first release without calls | [ADR-0008](decisions/0008-visible-call-history.md) |
| Play Protect blocks the direct APK | Cause found: the notification listener for calls inside WhatsApp, Messenger, Telegram and Viber | **Decision taken: keep the call features for now.** Don't remove them, and don't tell parents to turn Play Protect off, without asking the owner | [`enrollment-xiaomi.md`](enrollment-xiaomi.md), X1 |
| **Manara Parents** (the console as a Play Store app) | Console installable; Android project generated (`tools/parent-app/android`), unsigned bundle builds | Waits on Play verification. Then: upload key (yours), sign, create the app, upload, assetlinks.json from the Play fingerprint, closed test | [README](../tools/parent-app/README.md) |
| Android developer verification (apps outside Play) | Not started | After the Play account is verified | [`play-console-checklist.md`](play-console-checklist.md) |

## Privacy and legal (paused 2026-11-17)

| Item | Next step |
|---|---|
| The lawyer's brief | The owner sends it (kept outside the repo) |
| The INPDP opinion request | The owner checks the draft, completes it and sends it; then record the date in [`privacy/pia-call-history.md`](privacy/pia-call-history.md) |
| Neon (database) DPA | The owner asks Neon support for it; the review stays incomplete until then |
| Vercel, Netlify, Google FCM DPAs | Not reviewed yet |
| French and Arabic alert emails | A native reader (`TODO-REVIEW` in `backend/internal/notify/email.go`) |

## The owner's own to-dos

| Item | Why |
|---|---|
| Reset the production database password and update `DATABASE_URL` on Render | It was exposed on 2026-11-19 |
| Unlock GitHub billing, then check CI ran for the latest commits | CI stopped running on 2026-11-15; the database tests found a real bug on 2026-11-20 that CI would have caught |
| Remove this PC from the SM-A045F's paired devices | Left from the 2026-11-19 test |
| Offer 1.0.36 to the phones | After testing it on the owner's phone (admin console, Releases) |

## To change when the beta is full

The beta ("Familles pionnières") is capped at 20 families. When they are reached, switch every
"Devenir famille pionnière" link to a waiting list, or take it out: the sign-in page
(`auth.beta`, `auth.betaHref` in `controller/src/messages`), `decouvrir.html` (top, bottom, footer),
`/features*` (`tools/featurepages.py`), and the beta page itself (`tools/betapages.py`). The price is
not decided (owner, 2026-11-20): every page says "free during the test"; change them together when it is.

## Waiting on an answer from the owner

| Item | Question |
|---|---|
| Xiaomi, empty cloned-apps space (X2) | How was the empty XSpace removed on the Redmi Pad 2? The guide will say exactly that |
| Prayer-time pause (P14) | How long the pause lasts, which prayers, and whether Jumu'ah is different |
| Release 1.0.37 | The second-space screen (X5) and the setup message naming Xiaomi: test on a phone, then release |

## Elsewhere

- Security work toward MASA level 2: the ordered list is in [`security.md`](security.md), "What's left".
- Device tests that wait for a phone or time: [`pending-verifications.md`](pending-verifications.md).
