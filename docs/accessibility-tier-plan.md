# Accessibility-tier plan — option E from `enrollment-options.md`

Status: **planning only**, not scheduled against a phase yet. This is the
lower-friction enrollment mode for a parent who won't touch ADB: Play-Store
installable, zero reset, zero accounts-removal dance — at the cost of
weaker tamper-resistance than the Device Owner tier (`agent/`, Phase 0/1).
See [`enrollment-options.md`](enrollment-options.md) option E for the
comparison and sourcing; this doc is the implementation plan.

## 1. Why this exists alongside the Device Owner tier, not instead of it

Device Owner (ADR-0003) needs ADB + removing every account on the phone —
real friction most parents won't do. This tier needs none of that: install,
tap through a few permission screens, done. The trade is real too: a
technically motivated teen can turn this off from Settings in a way they
can't with Device Owner. Both tiers stay — this is the on-ramp for parents
who want "good enough, right now," Device Owner is "as strong as Android
allows, with a bit of setup."

## 2. What it's built from — all in the official Play policy carve-out

Per `enrollment-options.md`, [Google's Accessibility API policy](https://support.google.com/googleplay/android-developer/answer/16585319?hl=en)
explicitly permits blocking app uninstall/disable "authorized by a parent or
guardian through a parental control app." Three permissions, no DPC:

| Mechanism | Grants | How it's requested |
|---|---|---|
| `UsageStatsManager` (Usage Access) | Real per-app/per-category time totals | `ACTION_USAGE_ACCESS_SETTINGS` intent, one toggle |
| `AccessibilityService` | Real-time foreground-app detection, overlay/force-home enforcement | `ACTION_ACCESSIBILITY_SETTINGS` intent, one toggle, Play-listing disclosure required |
| Plain `DeviceAdminReceiver` (not Owner) | `lockNow()`, uninstall requires deactivating admin first (visible, loggable) | `ACTION_ADD_DEVICE_ADMIN` intent, one confirmation screen |

No ADB. No account removal. No reset.

## 3. Enforcer mapping — same interface, different implementation

`architecture.md` §2.2's `PolicyEnforcer` interface doesn't change. This
tier swaps *implementations*, selected by which enrollment mode the device
went through (recorded at enroll time, same `Policy`/device record either
way per the v1 API — the backend doesn't need to know or care which tier a
given device uses, only the agent does):

| Enforcer | Device Owner tier | Accessibility tier |
|---|---|---|
| `TimeLimitEnforcer` | `setPackagesSuspended` | `UsageStatsManager` totals + `AccessibilityService` blocking overlay/force-home when exceeded |
| `SiteFilterEnforcer` | `setGlobalPrivateDnsModeSpecifiedHost` | **Not available** — no device-owner-only DNS API exists outside Device Owner. Document as a tier limitation, don't fake it. |
| `LockEnforcer` | `DevicePolicyManager.lockNow` (device owner) | `DevicePolicyManager.lockNow` (plain device admin — same call, available without Owner) |
| `LocationEnforcer` | Fused location, visible foreground service | Unchanged — doesn't need Owner/Admin at all, just location permission + the visible service (ADR-0001 applies identically) |
| `CallLogEnforcer` | `CallLog` read (sideload only) | Unchanged — plain runtime permission, Owner not required either way |

`SiteFilterEnforcer` is the one real functionality gap, not just a weaker
version — worth stating plainly to parents choosing this tier, not
glossing over.

## 4. The tamper-resistance gap — detect, don't pretend to prevent

Can't be engineered away (that's the whole trade of this tier), so the
design goal is: **the parent finds out**, not **the child can't do it**.

- Poll (periodic `WorkManager` job, same cadence as the sync loop):
  `AccessibilityManager.getEnabledAccessibilityServiceList()` still includes
  this service, and the device admin is still active
  (`DevicePolicyManager.isAdminActive`).
- The moment either drops, queue a high-priority event (new `EventKind` —
  e.g. `protection_disabled`) on the next sync, *and* — this is the part
  that needs backend support not yet built (Phase 2) — push an immediate
  parent notification rather than waiting for the next scheduled check-in.
  Until Phase 2 exists, this is a logged event only, visible next sync; the
  "immediate" part is a real Phase 2 dependency, not solved by the agent
  alone.
- The managed notice (ADR-0001) stays identical across both tiers — a
  disabled Accessibility Service doesn't remove the foreground-service
  notification, since that's a separate component with no dependency on
  Accessibility at all.

## 5. Module layout (additive to `phase1-plan.md`'s, not a rewrite)

```
agent/app/src/main/java/com/manara/agent/
├── enforcers/
│   ├── PolicyEnforcer.kt                 (existing, unchanged interface)
│   ├── EnforcerRegistry.kt               (existing)
│   ├── TimeLimitEnforcer.kt              (existing — Device Owner tier)
│   └── accessibility/
│       ├── TimeLimitEnforcerLite.kt      # same PolicyEnforcer, Usage Access + overlay
│       ├── ManaraAccessibilityService.kt # foreground-app detection, triggers blocking
│       └── BlockingOverlay.kt            # the "time's up" overlay view
├── protection/
│   └── ProtectionStatusChecker.kt        # the WorkManager job from §4
└── enroll/
    ├── EnrollmentMode.kt                 # DEVICE_OWNER | ACCESSIBILITY, persisted at enroll
    └── AccessibilityEnrollmentActivity.kt # walks through the 3 permission screens in order
```

`EnforcerRegistry` picks which `TimeLimitEnforcer` implementation to
register based on the persisted `EnrollmentMode` — the only place that
branches on tier; everything downstream (`SyncManager`, `PolicyCache`,
`EventQueue`) stays tier-agnostic, per the Open/Closed goal in
`architecture.md`.

## 6. Build order

1. `AccessibilityEnrollmentActivity` walking through Usage Access →
   Accessibility → Device Admin, each with a plain-language explanation
   screen before the system permission prompt (Play policy's disclosure
   requirement, and just good practice for a parent who isn't technical).
2. `ManaraAccessibilityService` detecting foreground-app changes — log only
   at first, no enforcement, to validate detection is reliable before
   building enforcement on top of it.
3. `TimeLimitEnforcerLite`: `UsageStatsManager` totals + the blocking
   overlay, reusing the same `Policy.timeLimits` schema already in
   `api-spec/openapi.yaml` — no API changes needed.
4. `ProtectionStatusChecker` — the detection job from §4.
5. Wire `EnrollmentMode` selection into `EnforcerRegistry`.
6. Manual test: disable the Accessibility Service mid-use, confirm it's
   detected and logged; confirm the managed notice is unaffected.

## 7. Open questions

- **Overlay permission on newer Android**: `TYPE_APPLICATION_OVERLAY`
  requires `SYSTEM_ALERT_WINDOW`, a special permission with its own
  Settings toggle (separate ask from the three above) — confirm current
  grant flow at implementation time rather than assuming today's screens.
- **Does forcing the child to home screen (vs. a dismissible overlay)
  count as "autonomously initiating actions" under Play's tightened
  Accessibility policy** (`enrollment-options.md` cites an October 2025
  policy update banning autonomous action-taking via the API) — needs a
  policy re-read against the actual implementation before shipping, not
  just at planning time, since this is exactly the kind of thing Google
  tightens without much notice.
- **Per-OEM Accessibility reliability**: some OEMs (notably aggressive
  battery managers) kill Accessibility Services in the background too,
  same risk class as Phase 0's device-owner survival testing — needs its
  own empirical check, not an assumption that "Accessibility Service" is
  uniformly reliable just because it's an Android API.
