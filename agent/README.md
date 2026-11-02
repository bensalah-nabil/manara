# Manara Agent (Android)

The Kotlin app that runs on the child's device as **device owner**. It enforces
policy locally (offline-first), queues observations, and syncs with the backend.

Status: **not started.** First task is Phase 0 in [`../docs/roadmap.md`](../docs/roadmap.md)
— prove device-owner enrollment on real phones before writing the rest.

## Design (see ../docs/architecture.md §2)

- Policy cache (Room) — enforce from local cache, not from the network.
- Event queue — device-generated UUIDs, written before any upload attempt.
- One `PolicyEnforcer` per capability; adding a policy = adding a class.
- A permanent, non-removable "managed device" notice — always on, not an enforcer.

## Setup

Will be filled in once the skeleton lands. You'll need Android Studio, a
physical test phone you can factory-reset, and ADB.
