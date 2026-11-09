# ADR-0008: Visible call history, in the direct build only

- Status: Accepted
- Date: 2026-11-09
- Implements capability-plan H3, calls only. SMS and call recording are not part
  of it.

## Context

A parent asked to see who their child's phone calls and is called by. Calls were
in the original design (architecture §2.2) and ADR-0001 leaves what is collected
configurable, as long as it is never hidden. The app's own promises say the
opposite today: "Never your messages, photos, calls or passwords" on the phone,
and "calls and call logs" under "not collected" in the privacy policy.

Google Play's [SMS and Call Log policy](https://support.google.com/googleplay/android-developer/answer/10208820),
read 2026-11-09, allows `READ_CALL_LOG` for the default Phone, SMS or Assistant
app and a list of exceptions. Parental control isn't on the list, and "Family or
device locator" is listed as invalid.

## Decision

**What is collected, only while the parent turns it on:** the number, the
direction (incoming, outgoing, missed, rejected, blocked), the time and the
length. No contact names, no audio, no recording, no SMS.

**Visible.** While it is on, the managed notice and the phone's status screen say
so, and the sentence that promises calls are never shared changes to promise only
that what is said is never shared.

**No history before it was turned on.** The phone sends only calls made after the
parent turned it on, so nothing from before the child could see the notice leaves
the phone.

**Two builds.** `play` declares no call-log permission and can't read calls.
`direct`, installed outside Play, declares `READ_CALL_LOG`. The code is the same;
only the manifest differs. On a `play` phone the switch reports a missing
permission to the parent instead of doing nothing silently.

**The parent decides with the facts in front of them.** Turning it on asks for
confirmation that says the child will see it, that the other person in each call
is not told, and that the law differs by country.

**30 days.** Call events are deleted from the server after 30 days, like location.

**Off means off.** Turning it off withdraws the permission (`PERMISSION_GRANT_STATE_DENIED`)
and forgets the phone's place in the call log.

## Calls inside apps (2026-11-09; sources 1 and 2 built, 3 not built)

Android has no general way to read calls made in WhatsApp, Messenger, Telegram or
Viber. On the SM-A528B the system call log held 1,997 normal calls, 2 from WhatsApp
and none from the others. So three sources feed one list, and one call seen by two
of them is one entry:

1. **The call log**, as above.
2. **Call notifications** from the apps the parent's list names, for the app, time,
   direction where it can be told, and rough length. **Caller names are not kept**,
   at least to start. Everything that isn't a call notification is discarded unread.
3. **"In a call" detection**, as a backstop. It ships only if a test on a phone shows
   it is accurate without false alarms.

Source 2 needs notification access, which a device owner can't be seen to grant
(no public `DevicePolicyManager` API found), so the parent turns it on by hand,
after "Allow restricted settings" for a sideloaded app. That access covers every
notification, including message previews, so "never your messages" rests on Manara's
code and not on Android, and the child's screen and the privacy policy must say the
access exists. Losing it is reported to the parent.

The console says "calls Manara could detect": an empty list is not proof of no calls.
No phone numbers are available for these calls. Each source is tested with real calls
before this section moves to Decision.

**Status, 2026-11-09:** source 2 ships in the `direct` build from 1.0.19
(`CallNotificationListener`, decision in `CallNotificationDecision`). On the SM-A528B,
one outgoing WhatsApp call posted its call notification at 21:40:43 and removed it at
21:40:48, and Manara ran a successful sync at 21:40:49. It had not yet been confirmed
that this call reached the console as an event, and Messenger, Telegram, incoming
and missed calls were still untested. Source 3 is not built.

## Consequences

- The people the child talks to have their numbers stored without being asked.
  That is the main weight of this feature. Only the number is kept, and for a
  limited time.
- **Not yet met:** capability-plan G2 asks for encryption at rest for what leaves
  the phone. Call events have only the database host's disk encryption today, as
  location does (security.md, "What's left"), so whoever runs the server can read
  the numbers. This has to close before Manara is offered to families beyond the
  operator's own.
- Anyone deploying this for other families should get local legal advice first
  (legal-and-ethics.md).
- The build now has two flavors, so release tasks and output paths changed
  (`assembleDirectRelease`, `bundlePlayRelease`).

## Not verified

- `READ_CALL_LOG` is a hard-restricted permission: an app can hold it only if its
  installer allowlisted it (`Manifest.permission`). Sessions allowlist by default
  (`PackageInstaller.SessionParams`). Installing over adb was run on a phone;
  installing the APK file from a browser or file manager was not, and Android 13's
  restricted settings could differ there.
- Which `DevicePolicyManager` rule applies to granting it: the AOSP check for
  sensor permissions was not read to the end, so the device run is the evidence.
- Makers other than Samsung, and dual-SIM phones.
