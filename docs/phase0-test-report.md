# Phase 0 test report — device-owner proof

One copy of this section per phone tested. See [`../agent/README.md`](../agent/README.md)
for the build/ADB steps this report is checking off, and
[ADR-0003](decisions/0003-enrollment-without-factory-reset.md) for why the
primary method is account removal, not factory reset.

## Phone 1

- **Model:**
- **Android version:**
- **Manufacturer skin/build number:**
- **Date tested:**
- **Enrollment method used:** ☐ B — account removal, no reset (primary) ☐ F — factory reset (fallback)

| Check | Result | Notes |
|---|---|---|
| All accounts removed via Settings | ☐ Yes ☐ No | |
| `adb shell dumpsys account` confirms zero accounts | ☐ Yes ☐ No | if No, note whether `pm disable-user` on gms/gsf fixed it |
| Needed the gms/gsf `pm disable-user` workaround | ☐ Yes ☐ No | |
| Extra Android user profile had to be removed first | ☐ Yes ☐ No | |
| `adb install` succeeded | ☐ Yes ☐ No | |
| `dpm set-device-owner` succeeded **without factory reset** | ☐ Yes ☐ No | if No, fell back to F — note why |
| App shows "Device owner: YES" | ☐ Yes ☐ No | |
| Accounts re-added successfully afterward, device owner still YES | ☐ Yes ☐ No | |
| Notice survives reboot | ☐ Yes ☐ No | |
| Notice still present after 24h idle | ☐ Yes ☐ No | |
| Play Protect warning at install | ☐ Yes ☐ No | screenshot if yes |
| Play Protect warning later (scan, Play Store nag, etc.) | ☐ Yes ☐ No | screenshot if yes |
| Data actually intact after (spot-check: SMS, call log, Wi-Fi, photos, an app's data) | ☐ Yes ☐ No | should be trivially Yes under method B — flag if not |

**Verdict:** ☐ Pass ☐ Fail
**Notes / anything unexpected:**

---

## Phone 2

- **Model:**
- **Android version:**
- **Manufacturer skin/build number:**
- **Date tested:**
- **Enrollment method used:** ☐ B — account removal, no reset (primary) ☐ F — factory reset (fallback)

| Check | Result | Notes |
|---|---|---|
| All accounts removed via Settings | ☐ Yes ☐ No | |
| `adb shell dumpsys account` confirms zero accounts | ☐ Yes ☐ No | if No, note whether `pm disable-user` on gms/gsf fixed it |
| Needed the gms/gsf `pm disable-user` workaround | ☐ Yes ☐ No | |
| Extra Android user profile had to be removed first | ☐ Yes ☐ No | |
| `adb install` succeeded | ☐ Yes ☐ No | |
| `dpm set-device-owner` succeeded **without factory reset** | ☐ Yes ☐ No | if No, fell back to F — note why |
| App shows "Device owner: YES" | ☐ Yes ☐ No | |
| Accounts re-added successfully afterward, device owner still YES | ☐ Yes ☐ No | |
| Notice survives reboot | ☐ Yes ☐ No | |
| Notice still present after 24h idle | ☐ Yes ☐ No | |
| Play Protect warning at install | ☐ Yes ☐ No | screenshot if yes |
| Play Protect warning later (scan, Play Store nag, etc.) | ☐ Yes ☐ No | screenshot if yes |
| Data actually intact after (spot-check: SMS, call log, Wi-Fi, photos, an app's data) | ☐ Yes ☐ No | should be trivially Yes under method B — flag if not |

**Verdict:** ☐ Pass ☐ Fail
**Notes / anything unexpected:**

---

## Overall Phase 0 go/no-go

Pass requires both phones to pass every row above.

- [ ] Both phones pass → proceed to Phase 1
- [ ] At least one phone fails → stop and reassess before building further
