# Phase 0 test report — device-owner proof

One copy of this section per phone tested. See [`../agent/README.md`](../agent/README.md)
for the build/ADB steps this report is checking off.

## Phone 1

- **Model:**
- **Android version:**
- **Manufacturer skin/build number:**
- **Date tested:**

| Check | Result | Notes |
|---|---|---|
| `adb install` succeeded | ☐ Yes ☐ No | |
| `dpm set-device-owner` succeeded | ☐ Yes ☐ No | |
| App shows "Device owner: YES" | ☐ Yes ☐ No | |
| Notice survives reboot | ☐ Yes ☐ No | |
| Notice still present after 24h idle | ☐ Yes ☐ No | |
| Play Protect warning at install | ☐ Yes ☐ No | screenshot if yes |
| Play Protect warning later (scan, Play Store nag, etc.) | ☐ Yes ☐ No | screenshot if yes |

**Verdict:** ☐ Pass ☐ Fail
**Notes / anything unexpected:**

---

## Phone 2

- **Model:**
- **Android version:**
- **Manufacturer skin/build number:**
- **Date tested:**

| Check | Result | Notes |
|---|---|---|
| `adb install` succeeded | ☐ Yes ☐ No | |
| `dpm set-device-owner` succeeded | ☐ Yes ☐ No | |
| App shows "Device owner: YES" | ☐ Yes ☐ No | |
| Notice survives reboot | ☐ Yes ☐ No | |
| Notice still present after 24h idle | ☐ Yes ☐ No | |
| Play Protect warning at install | ☐ Yes ☐ No | screenshot if yes |
| Play Protect warning later (scan, Play Store nag, etc.) | ☐ Yes ☐ No | screenshot if yes |

**Verdict:** ☐ Pass ☐ Fail
**Notes / anything unexpected:**

---

## Overall Phase 0 go/no-go

Pass requires both phones to pass every row above.

- [ ] Both phones pass → proceed to Phase 1
- [ ] At least one phone fails → stop and reassess before building further
