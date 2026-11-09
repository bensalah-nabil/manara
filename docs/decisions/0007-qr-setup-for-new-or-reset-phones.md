# ADR-0007: QR setup for a new or reset phone

- Status: Accepted, not yet run on a phone
- Date: 2026-11-09
- Adds a second way to set up a phone; guided setup ([ADR-0003](0003-enrollment-without-factory-reset.md),
  [ADR-0006](0006-pause-apps-instead-of-removing-accounts.md)) stays for phones that keep their data.

## Context

Guided setup keeps everything on the phone, but asks a lot of the parent:
Developer options (tap Build number seven times), wireless debugging, and on
Samsung, removing every account for a moment and signing back in. Many
parents in Tunisia have little technical background; those steps are where
they are expected to give up ([usability-test-plan.md](../usability-test-plan.md)).

Asked for "fully automated, but never like a virus": every step must be one
Android itself offers and shows, with the parent's consent, and nothing
hidden. That rules out an accessibility service tapping through Settings
(the takeover pattern of banking trojans) and anything that reads account
secrets.

## Decision

Offer Android's own QR setup for managed phones, which exists for exactly
this, alongside guided setup:

1. The parent resets the phone (or it's new), taps the welcome screen six
   times in the same spot, and scans one QR code from the console.
   ([Android Management API, "Provision a device"](https://developers.google.com/android/management/provision-device):
   "On a new or factory-reset device, the user ... taps the screen six times
   in the same spot", Android 7.0+.)
2. Android itself shows that the phone will be managed, downloads Manara,
   checks its signature, and makes it device owner. A phone fresh from a
   reset has no account, so nothing is removed.
3. Manara answers Android's two setup activities, required since Android 12
   (DevicePolicyManager reference, `ACTION_PROVISION_MANAGED_DEVICE`
   deprecation: "admin apps must implement activities with intent filters
   for `ACTION_GET_PROVISIONING_MODE` and `ACTION_ADMIN_POLICY_COMPLIANCE`"),
   declared as Google's TestDPC sample does, behind `BIND_DEVICE_ADMIN`.
4. The connection code travels in the QR code's extras bundle
   (`EXTRA_PROVISIONING_ADMIN_EXTRAS_BUNDLE`), which reaches
   `ADMIN_POLICY_COMPLIANCE`. Manara saves it and joins the parent's account
   in the background, retrying while the network comes up. The parent
   signs in to Google afterwards, if they want.

The QR code asks Android to leave every preinstalled app on
(`PROVISIONING_LEAVE_ALL_SYSTEM_APPS_ENABLED`): a family phone keeps its
camera, gallery and the rest. It does not opt out of sensor permissions
(`EXTRA_PROVISIONING_SENSORS_PERMISSION_GRANT_OPT_OUT`, default false: "by
default, the admin of a fully-managed device has the ability to grant
sensors-related permissions"), so location sharing works as after guided
setup.

The console offers it only once a public HTTPS copy of the release exists
(`provisioning.ts`, `MANARA_APK_URL`): Android downloads Manara from there,
and refuses it unless it's signed with the certificate whose SHA-256 the QR
code carries (`MANARA_SIGNATURE`, the "Manara upload key"; it doesn't
change between versions).

## Consequences

- New or reset phone: the parent scans one QR code. No Developer options, no
  wireless debugging, no account to remove, any brand.
- Resetting erases the phone. The console says so before the code is shown,
  and guided setup stays the choice for a phone whose data matters.
- The connection code sits in Manara's private storage only until the phone
  joins (single use, a day at most).
- Releases must be published at `MANARA_APK_URL`. If Manara is later
  distributed through Play with Play App Signing, the Play-signed copy has a
  different certificate; the QR download must stay the upload-key build.

## Not yet verified

- A whole QR setup on a real phone, above all a Samsung: Android's setup
  screens, the download, the compliance step, joining the account.
- Location sharing after QR setup on a real phone. A search snippet of the
  Android 17 CDD lists location among permissions an admin "MUST NOT"
  silently grant, with the condition cut off; read that section in full
  before relying on it.
- Whether a phone's setup scanner reads the console's QR code from a laptop
  screen at the size shown.
