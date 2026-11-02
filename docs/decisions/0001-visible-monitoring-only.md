# ADR-0001: Monitoring is always visible; no hidden mode

- Status: Accepted
- Date: 2026-11-02

## Context

The product monitors a child's device (location, calls, usage). A natural
feature request is a switch to hide the monitoring from the device user. We
considered offering it as an optional, off-by-default flag.

## Decision

Manara will **not** have a hidden, stealth, or notice-disabling mode. A managed
device always shows a permanent, non-removable "this device is managed" notice.
*What* is collected is configurable per policy; *whether the device reveals it
is managed* is not.

## Consequences

- **Legal/safety:** keeps the tool on the right side of anti-stalkerware law and
  removes the capability most likely to be abused against non-consenting adults.
- **Distribution:** hidden-monitoring behavior is flagged as malware by Play
  Protect and AV engines regardless of intent; avoiding it keeps the agent
  shippable.
- **Product:** the target use (a parent managing a minor child) needs the parent
  to configure things, not the device to hide — so nothing of value is lost.
- **Governance:** PRs adding a hidden mode are out of scope and will be declined.
