# ADR-0005: Every guided-setup input is typed in the console

- Status: Accepted
- Date: 2026-11-07

## Context

Guided setup pairs Manara with the phone's own wireless debugging. Until now
the pairing code was typed into a reply field on Manara's notification, while
Settings showed the code on its "Pair device with pairing code" screen.

On the SM-A045F (Android 14) that never worked. The logs showed the pairing
service closing 3 to 5 seconds after it opened, every time, before the code
could be typed. AOSP Settings explains why: `WirelessDebuggingFragment.onPause()`
calls `removeDialog(MODE_PAIRING)`, and dismissing that dialog calls
`AdbManager.disablePairing()`. Whenever the Wireless debugging screen stops
being in front, its code stops working. On this Samsung, opening the
notification shade to type the code is enough to cause that. No change to
the notification can fix this.

Two smaller problems pointed the same way. Android 14 lets the user swipe an
ongoing notice away unless the app is a device policy controller, which
Manara only becomes at the end of setup. And the last step waited until
every removed account was signed back in to, unless "Finish setup" was found
on the phone's notice.

## Decision

The phone never asks for input during setup. The parent types everything in
the console, so the phone stays on its Wireless debugging screen.

- **QR code pairing.** At the start of setup the phone makes a one-time name
  (`manara-` plus 6 letters and digits) and a 16-character password, and sends
  them with its first pairing report. The console shows
  `WIFI:T:ADB;S:<name>;P:<password>;;` as a QR code. On the phone,
  **Pair device with QR code** scans it. AOSP's `AdbQrcodeScannerFragment`
  then calls `enablePairingByQrCode(name, password)` and waits on a
  verifying screen with no timeout. `AdbDebuggingManager`'s `PairingThread`
  pairs with that password and advertises `_adb-tls-pairing._tcp` under that
  name. When the phone sees its own name on its own address, it pairs with
  its password through Kadb, which takes any password bytes (SPAKE2), not
  only 6 digits.
- **Pairing code.** On the phone, **Pair device with pairing code**. The
  parent types the 6 digits into the console, and the phone reads them from
  `GET /agent/setup/input`. It finds the screen's port from the pairing
  service under any name other than its QR name. Each code carries a number
  (`pairingCodeSeq`), so the phone tries every code once, even when the same
  digits are sent again.
- **Finish setup** is a console button during the reconnect step. The parent
  signs back in only to the accounts they want.
- **Retries.** A failed pairing is reported and waits for a new scan or code,
  up to 5 tries, instead of ending setup.
- **The phone's notice shows progress only**, and is posted again if swiped
  away, so setup stays visible on the phone (ADR-0001).

The server still sends no commands. The phone runs its fixed list of steps
and reads back only the input for the step it is waiting at.

## Consequences

- **Secrets on the server.** The QR password and the pairing code pass
  through the server. Each works only on the phone's own Wi-Fi, while its
  pairing screen is open, and only once. Both are erased as soon as a report
  leaves the pairing step, and a new setup starts with neither.
- **Polling.** The phone polls the server every few seconds during pairing
  and while reconnecting, which works without push (Render has none set up).
- **A second screen is needed** to scan the QR code. With only the child's
  phone, the pairing code still works, as long as the console is open on
  another device.
- **Still to verify on a phone:**
  - the QR scan end to end;
  - finding the pairing service while Manara is in the background. Shizuku
    notes that some makers cut background apps off the local network.
- **Android 16's local network permission**, once enforced, will apply to
  both ways of pairing (see `docs/play-store.md`).
