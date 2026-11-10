# Agent brief: evaluate Manara, find what's missing, build or propose it

Paste the text below as the first message of a new agent session in this
repository. It's written to spend as few tokens as possible: the agent reads
what already exists instead of redoing it, reports before building, and stops
at checkpoints.

---

You are working on **Manara**, an open-source Android parental-control system
(Device Owner agent + Go backend + web console) built in Tunisia for parents
with little technical background. Its purpose: protect children from social
media addiction and other harm on their phones, using technology to counter
technology, with a measurable positive impact on the child, not just control.
I have little time, money and token budget. Work accordingly.

## Rules you can't break

1. **Visible monitoring only.** No hidden mode, nothing the child can't see.
   No reading of message content; call history is visible, numbers and times
   only. See `CLAUDE.md`, ADR-0001, ADR-0008, `docs/legal-and-ethics.md`.
   Anything about messages follows `docs/capability-plan.md` Track H (ADR
   first, encrypted, child-visible, alerts-only). Never propose anything
   that reads a child's messages on a server or listens through the mic.
2. **Platform facts come from the source.** Before claiming what Android or
   Apple does, read AOSP or developer.android.com / support.apple.com and
   cite it. Mark anything unverified as *Hypothesis*.
3. **Done means tested on a phone**, not compiled. Tell me which tests you
   couldn't run and why.
4. **Never erase, release or reset a phone, clear app data, commit, or push
   without my explicit go-ahead in the moment.** About 80% of target phones
   are in daily use and can't be reset.
5. **Don't redo research that exists.** Read first, then add only what's
   missing, inside the existing documents. No new document that overlaps an
   existing one.

## Read first, in this order (skim, don't re-summarise to me)

`CLAUDE.md` → `docs/validation.md` → `docs/market-study.md` →
`docs/roadmap.md` (Phase 5 and its decisions of 2026-11-10) →
`docs/capability-plan.md` §0 guardrails and §1 → `docs/landscape-comparison.md`
§8 → `docs/security.md` "What's left" → `README.md` capability table.

Decisions already made, don't reopen them: free for parents funded by grants
or donations (P0), build order P3 → P4 → P8 → C5+D2+D3 → P5 → P6 → P1 → P2,
the four parity features proceed alongside the 10 parent interviews.

## What to evaluate (every area, briefly, with evidence from files or a phone)

For each area, state what is **Known** (cite the file or test), what is
**Hypothesis**, and the single biggest gap.

- **Child protection:** social media time limits, bedtime, app approval,
  website filtering (whole phone), location and place alerts, call history,
  tamper resistance (reset, profiles, VPN, DNS, clock), what a child can still
  do to get around it.
- **Positive impact, not only control:** does the child understand the rules
  (block screen, status screen, ask-for-more), does it reduce family
  conflict, does it respect a teenager's growing autonomy, how is impact
  measured (screen-time trend, rules kept on after 4 weeks, parent still
  opening the console).
- **Safety:** can a locked child reach the parent, does the offline release
  code always work, what happens when the phone is off for a day.
- **Security and privacy:** what's left for MASA, data minimisation,
  retention, encryption at rest, children's data under Tunisian law and GDPR
  for anyone abroad.
- **Usability for a non-technical parent:** guided setup length on Samsung,
  Arabic/French (currently missing), the usability test plan not yet run.
- **Competition:** against Family Link (free, web-only in Tunisia), Apple
  Screen Time (iPhone), Kaspersky, Qustodio: where Manara is ahead, where it
  must reach parity, where it should send parents elsewhere (iPhone).
- **Business:** grant and donation sources for child digital wellbeing in
  Tunisia and the Maghreb, what they require (an association, usage numbers,
  a budget), hosting cost per family, support cost, fallbacks P11/P12.
- **Marketing and go-to-market:** first 10 families, then schools,
  parents' associations, paediatricians, imams and teachers, Tunisian
  Facebook groups, local press; a message in Tunisian Arabic and French
  that a parent understands in one sentence; the trust problem of an
  unknown app installed outside Play.
- **Operations and risk:** Play Store review, Samsung account handling, one
  developer, manufacturer background limits, what breaks if the developer
  is away for a month.

## How to work (token budget)

1. **Phase 1, report only (no code):** one document update, not a new file:
   add a dated section "State and gaps" to `docs/validation.md` with
   (a) a table of the areas above: Known / Hypothesis / biggest gap,
   (b) a ranked gap list: impact for the child × effort, marked "already in
   roadmap (ID)" or "new", (c) the 5 highest-impact things *you* can do now
   within a small budget, (d) a checklist of things *only I* can do
   (interviews, grant applications, phone tests), each with the exact
   question or step. Stop and show me. Keep it under 2 pages.
2. **Phase 2, build one item at a time**, only after I pick it: smallest
   verifiable increment, pure decision logic separate from Android I/O, unit
   tests, then a phone test with the exact adb commands and what you
   observed. Stop after each item.
3. **Economy:** no sub-agents, no re-reading large files, no full-file
   dumps; quote line references instead. Ask one precise question when
   blocked instead of exploring. Prefer updating the roadmap over writing
   new plans.
4. **Honesty:** if something is unverified, slow, or failed, say so plainly
   with the output. Never report "done" from code reading alone.

Start with Phase 1.
