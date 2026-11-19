---
name: new-enforcer
description: Steps to add a new rule or capability to Manara end to end — the policy field on the server, the API spec and the console, a pure decision class, a thin PolicyEnforcer, its registration, what the child's phone says about it, and how it is released. Use when adding a feature such as prayer-time pause, a block screen, bonus time, or any new thing the parent can turn on.
---

# Add a capability

architecture.md §2.2: one enforcer per capability. A new capability is new classes plus one line in
the registry list. If the change needs edits in `SyncManager` or the policy cache, stop and reconsider.

Settle the design first when the rule overlaps another one. Today `TimeLimitEnforcer`,
`BrowserBlockEnforcer` and any new pause all suspend apps, and each remembers only its own: lifting
one can resume an app another still blocks (docs/roadmap.md, "Where the build run stopped").

## 1. The policy field (contract first)

1. `api-spec/openapi.yaml`, schema `Policy`: add the section, off by default. Additive only (v1).
2. Server: the struct in `backend/internal/domain/policy.go`, a `Validate()` if values are bounded,
   called from `SetPolicy` in `backend/internal/transport/console/handlers.go` (as `policy.Browser.Validate()`
   is), and tests in `backend/internal/domain/policy_test.go`. Local testing needs
   `docker compose up -d --build server`: a stale image drops the new field silently.
3. Agent: the section in `agent/app/src/main/java/com/manara/agent/policy/Policy.kt` with defaults that
   mean "off", so an older server or a missing field changes nothing.
4. The cooling-off delay (ADR-0012): if turning the rule off or making it weaker lets the phone do
   more, add that case to `domain.Loosens` in `backend/internal/domain/cooling_off.go`, with a test in
   `cooling_off_test.go`, a `LoosensX` code, and its wording in `controller/src/pending.ts`. A rule
   left out of `Loosens` can be switched off at once, skipping the wait a parent chose.

## 2. The decision (pure, tested)

`enforcers/<Name>Decision.kt`: an `object` with functions from inputs (policy slice, time, usage,
what is installed) to what should happen. No Android imports. Unit tests in
`agent/app/src/test/java/com/manara/agent/enforcers/<Name>DecisionTest.kt`, including the edges:
rule turned off, rule removed, midnight, the phone's clock wrong, an app uninstalled.

## 3. The enforcer (thin Android wrapper)

`enforcers/<Name>Enforcer.kt` implements `PolicyEnforcer`:

- `id`: stable kebab-case (`"prayer-pause"`); the console and server key health problems by it.
- `apply(policy)`: read only this rule's section, ask the decision, make the phone match.
  Idempotent: it runs on every sync and from `LiveRules`. Keep what it changed in SharedPreferences,
  not memory: a second instance or a process restart must know what to undo (the `TimeLimitEnforcer`
  "resume never ran" bug).
- Report broken prerequisites with `HealthTracker.observe(check, healthy)`; forget them when off.
- `collectEvents()`: if it reports events, trace them all the way to the console. A parsed field is not
  a used one (CLAUDE.md, "A sync response field being parsed doesn't mean it's acted on").
- `release()`: the default applies an empty policy. Override when that is wrong. Never revoke Manara's
  own permission during release, because Android kills the app (CLAUDE.md, "Revoking Manara's own
  permission kills Manara"). Do forget anything a later enrollment must not inherit (cursors, caches).
- No bare `runCatching {}`: `.onFailure { Log.w(TAG, ...) }` at least.

Register it in `enforcers/DefaultEnforcers.kt`: `defaultEnforcerRegistry` always;
`liveEnforcerRegistry` too if it must be re-checked every minute while the screen is on.

## 4. The child sees it (ADR-0001)

Nothing is collected or enforced without the phone saying so:

- the managed notice: a line in `policy/NoticeSummary.kt`;
- the home screen: `ui/HomeModel.kt` if the child should see its state;
- strings in `res/values`, `values-fr` and `values-ar`; `StringCataloguesTest` checks the three have
  the same keys and placeholders. Mark new Arabic `TODO-REVIEW`.

## 5. The console

- An editor module like `controller/src/restrictions.ts` (`toDraft`, `apply...`) with its test, and a card
  in `RuleCards.tsx`. Keep the rest of the policy untouched when saving (whole-document replace).
- `controller/src/protection.ts`: add the enforcer `id` to `ENFORCERS` and each health check code to
  `DETAILS`, or parents see raw codes (this happened with call history).
- Wording in `controller/src/messages/en.ts`, `fr.ts`, `ar.ts`.

## 6. Verify

- Unit tests: `./gradlew.bat testDirectDebugUnitTest`, `go test ./...`, `npm test`.
- On a device (`device-verify` skill): turn it on and off from the console, release the phone with it on,
  restart the phone with it on. Platform behaviour it relies on is read from source first (`aosp-check`).
