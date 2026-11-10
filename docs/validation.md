# Validation: is Manara solving a real problem, for whom, and why us?

Written 2026-11-10. Manara has 125 commits of engineering and, as far as
this repository records, **zero conversations with parents who aren't the
developer**. This document is the homework that should come before more
features: who the customer is, what problem they have, why they'd pick
Manara, who else solves it, and how we reach the first 10 families.

Each claim below is marked:

- **Known**: backed by this repo, a real device test, or a cited source.
- **Hypothesis**: what we believe but haven't checked with a single real
  parent. Most of this document is hypotheses. Interviews (§7) turn them
  into one or the other.

## 1. Customer

| | |
|---|---|
| **Who pays / decides** | A parent in Tunisia. **Hypothesis:** limited technical comfort, Arabic or French speaker. |
| **Who is affected** | Their minor child, who sees that the phone is managed (ADR-0001). Not a customer, but their reaction decides whether the parent keeps using it. |
| **The phone** | **Known (from the developer, 2026-11-09):** ~80% of target phones are already in use and can't be reset. Android, often Samsung. |
| **Segments to test** | (a) parents of children 8–12 getting a first phone, (b) parents of teens 13–17, already in conflict over phone use, (c) schools or associations acting for many families. **Hypothesis:** each has a different problem. Don't merge them until interviews say so. |

Choose **one** segment first. Right now the product is built for "any parent",
and so for nobody in particular.

## 2. Problem

**Hypothesis:** parents want to limit and see their child's phone use, and
the tools they already have don't do it for them.

That hides several different problems. Each one leads to a different product:

1. "I don't know these tools exist." The fix is awareness, not software.
2. "I tried Family Link and couldn't set it up." The fix is simpler setup,
   or a person who sets it up for you.
3. "My child gets around it." The fix is stronger enforcement (Device Owner),
   which is where Manara's engineering went.
4. "It's not in my language / no one to call when it breaks." The fix is
   local support.
5. "I don't want my child's data with Google." The fix is self-hosting. This
   is **Hypothesis**, and probably rare among the target parents.

Today Manara is a bet on #3 and #5. Interviews should show which ones parents
actually report **from their own past experience**, not from imagining it.

## 3. Why Manara, and not something free?

The hardest question. **Google Family Link costs nothing, and the
developer confirmed it is available in Tunisia (2026-11-10).** It covers most
of what Manara does.

Family Link column: Google's own help pages [1][4][5][6][7], fetched
2026-11-10. Manara column: this repo's code and README.

### Where they're even

| | Family Link | Manara |
|---|---|---|
| Daily screen time limit | ✅ per day of the week, bonus time [5] | ✅ |
| Per-app time limits | ✅ (not on system apps) [5] | ✅ |
| Scheduled lock (bedtime) | ✅ "Downtime", "School time" [4] | ✅ bedtime windows |
| Remote lock | ✅ plus an offline parent access code [5] | ✅ plus an offline 8-digit release code |
| Location | ✅ plus alerts on arriving at or leaving a place, ring, battery [4] | ✅ at the parent's interval, no place alerts |
| Usage report | ? (not on the official pages fetched) | ✅ opt-in, with insights |
| Several children, two parents | ✅ | ✅ |

### Where Family Link is ahead

| | Family Link | Manara |
|---|---|---|
| **Language** | Arabic, French, and everything else Google supports | ❌ **English only** (no `values-ar`/`values-fr` in the agent, none in the console) |
| Approve each new app | ✅ [4] | ❌ |
| YouTube and Google Search settings | ✅ [4] | ◐ SafeSearch and YouTube Restricted Mode, through Chrome rules |
| Contacts / who can call | ✅ "Manage communication settings" [4] | ❌ (call *history* only, see below) |
| Trust and install | Comes with Android, by Google. In Tunisia the parent app isn't on Play, so the parent uses the website | Unknown name. Call history needs an APK from outside Play |
| Price | Free [2] | Not decided |

### Where Manara is ahead

| | Family Link | Manara |
|---|---|---|
| **Websites in every browser and app** | Chrome and "some Android apps". Google warns kids "may also have access to other browsers where Family Link settings for Chrome won't apply" [6] | ✅ Private DNS for the whole phone, locked (`DISALLOW_CONFIG_PRIVATE_DNS`) |
| VPN to get around the filter | ? | ✅ blocked (`DISALLOW_CONFIG_VPN`) |
| New user profile on the phone | Family Link settings "won't apply to the new user profiles" [7] | ✅ blocked (`DISALLOW_ADD_USER`) |
| Factory reset, safe boot | ? (only an unofficial video says reset asks for a parent) | ✅ blocked |
| Changing the clock to get around limits | ✅ blocked while limits are on [5] | ✅ blocked |
| Call history | ❌ | ✅ including WhatsApp/Messenger calls, direct build only (ADR-0008) |
| Child needs a Google account | Yes, and must agree to supervision, living in the same country [8] | No |
| Phone already in use | The child's phone "must remove other accounts" first [8] | Apps holding an account are paused for a few seconds. On Samsung, accounts are removed for a moment and restored (ADR-0006) |
| Parent told when protection stops | ? | ✅ email/ntfy: a protection stopped, a phone silent 12 h |

### What this means

- **Manara's real edge is "harder to get around" and "works on a phone
  already in use without losing accounts".** Both are about the child who
  bypasses and the busy phone, and both are hypotheses until parents say it
  happened to them (interview questions 3–5).
- **Manara's biggest gap isn't a feature, it's the language.** A Tunisian
  parent with little technical background can't use an English-only console.
  Arabic and French come before any new capability.
- **Trust is the second gap.** Family Link is Google's. Manara is unknown,
  and the call-history build needs installing an APK from outside Play,
  which Android itself warns parents against. A local person who sets it up
  (§5, revenue option 1) answers both.
- Don't compete on the list where Family Link is ahead (app approval,
  YouTube, contacts). Parents who need those already have them for free.

The edges in [`landscape-comparison.md`](landscape-comparison.md) §8 (Apache-2.0,
self-hosted, written no-covert rule) are real, but they matter to
**developers**. A parent won't pay for a license. Don't put them on the
parent-facing pitch.

## 4. Competitors

Full study, Android and iPhone: [`market-study.md`](market-study.md).

| | Price | Note |
|---|---|---|
| Google Family Link | Free [2] | The default. Every parent should be asked whether they tried it. |
| Qustodio | $59.95/yr (5 devices), $104.95/yr (unlimited) [3] | The paid benchmark: what a parent who *does* pay gets |
| Open-source peers | Free | See [`landscape-comparison.md`](landscape-comparison.md). They compete for contributors, not for parents |
| Doing nothing, or taking the phone away | Free | **Probably the biggest competitor.** Ask what parents do today |

Family Link in Tunisia, checked by the developer on 2026-11-10: **the parent
app isn't on Play** ("Cet article n'est pas disponible dans votre pays"), but
the **website works** (familylink.google.com) and the phone's own
Settings → Google → Parental controls is there. Google's FAQ says parents can
manage "pretty much all" settings from a browser [9]. Which features the
website lacks, and whether parents get alerts (app requests, arriving at a
place) without the app, isn't documented. **Test it end to end from Tunisia
on a lab phone**: this is the competitor most parents would try first. No Google page lists its countries. Google's age page
doesn't list Tunisia, so the default applies: a child manages their own
account from 13.

Still to check: Samsung's own parental controls, and mobile operators' offers
in Tunisia (Ooredoo, Orange, Tunisie Telecom).

## 5. Business model vs. revenue model

- **Business model**: how Manara creates and delivers value. Open-source
  agent and server, plus a hosted console for parents who won't self-host.
- **Revenue model**: who pays, for what.
  - **Decided 2026-11-10, the model to test first: free for parents, funded
    by grants or donations** (roadmap P0). It removes the payment barrier.
    Grants typically ask for usage numbers and an organisation behind the
    project, so the first 10 families (§7) also serve as evidence for them.
  - Fallbacks, still asked about in interviews:
    1. **Paid setup service** (P12). Someone sets up the child's phone in
       person. Guided setup on a phone in use is the hardest part (Samsung
       accounts, ADR-0006), and the target parents aren't technical.
    2. **Hosted console subscription in dinars** (P11), priced between
       Family Link (free) and Qustodio ($60/yr).
    3. **Schools / associations** (B2B2C), one buyer for many families.

Interviews still ask "what did you last pay for something like this, if
anything?", so the fallbacks can be judged on real answers.

## 6. Unit economics (to fill, not guess)

| | Value | Source |
|---|---|---|
| Server cost per family per month | ? | Measure on the VPS once deployed (roadmap Phase 2) |
| Push (FCM) | Free | Google's FCM pricing |
| Setup time per phone, guided | ? | Measure in [`usability-test-plan.md`](usability-test-plan.md) |
| Support time per family per month | ? | Measure with the first 10 families |
| Price a parent will pay | ? | Interviews |
| Families lost per month | ? | First 10 families, after 3 months |

Setup time is likely the number that decides everything. Measure it before
building more.

## 7. Validation before more features

### Interview 10 parents, before writing code for new capabilities

Ask about what they did, not what they would do. Opinions about a
hypothetical app are worthless. Past behaviour is not.

1. How old are your children, and which have a phone? Which phone?
2. Tell me about the last time the phone caused a problem at home. What
   happened? What did you do?
3. Have you tried anything to control it: an app, a setting, a rule? What
   happened? Do you still use it?
4. (If Family Link comes up, or ask:) Have you heard of Family Link? Tried it?
   Why did you stop, or why not?
5. Has your child ever got around a limit? How?
6. Have you paid for anything to help with this, such as an app, a person, or
   a repair shop setting it up? How much?
7. Who do you ask when something on the phone goes wrong?

Don't pitch Manara until the end. Write each interview down the same day,
in `docs/interviews/` (no names, no identifying details).

### What would change the plan (decide now, before the answers come in)

- **Most parents never tried anything** → the problem is awareness or
  motivation, not enforcement. Consider a simple setup service on top of
  Family Link before investing more in Device Owner.
- **They tried Family Link and the child got around it** → Manara's core
  bet holds. Keep going, lead with "harder to get around".
- **They tried Family Link and couldn't set it up** → the product is setup
  help. Guided setup and in-person service come first.
- **Nobody would pay, and nobody has paid** → the revenue model is
  grants, schools, or donations, not subscriptions.

### First 10 families

1. Developer's own network: family, neighbours, colleagues with children.
   That's the 10 interviews.
2. Of those, the ones with a fitting problem run
   [`usability-test-plan.md`](usability-test-plan.md) round 1 (lab phone).
3. Those who finish and want it: round 2 on their child's phone, watched
   for 4 weeks. Do they keep the rules on? Do they open the console?
4. Only then: one school or association, if segment (c) looked real.

## 8. What this means for the roadmap

Until §7's 10 interviews are written down:

- **Pause new capabilities** (more messengers, more rule types). Each one is
  a bet on a problem nobody has confirmed yet. **Exception decided
  2026-11-10:** roadmap Phase 5.0 and four parity features (ask for more
  time, approve new apps, place alerts, weekly email) go ahead alongside the
  interviews. If interviews contradict one of them, stop it.
- **Keep** security fixes and work that makes guided setup shorter. Those
  hold whatever the interviews say.
- Revisit this document after the interviews and turn each **Hypothesis**
  into Known, or remove it.

## 9. State and gaps (2026-11-10)

Written from the files only. **No phone was touched and no test was run for
this section.** "Known" means a file or a recorded phone test says so.

### (a) By area

| Area | Known (where) | Hypothesis | Biggest gap |
|---|---|---|---|
| **Child protection** | Limits, bedtime, whole-phone DNS filter, location, tamper blocks: done, phone-verified (README l.41-58). Call history: outgoing calls only verified (pending-verifications l.19-32) | "Hard to get around": no child has ever tried | No app approval (P6), no place alerts (P5). Filter is a public DoT host, so apps with their own DoH or proxy pass (B1 open). Samsung only (pending #4) |
| **Positive impact** | Status screen and notice verified (pending-verifications, D1 sections). Screen-time trend exists (README l.58) | Less conflict; teens accept it | No block screen that says why (D2) and no ask-for-more (D3): no `SuspendDialogInfo` in `agent/`. No impact number is defined or collected. Zero families |
| **Safety** | Offline 8-digit code: logic unit-tested (`ReleaseRulesTest`). Silent phone alert at 12 h (roadmap l.98-100). Rules run from the cached policy (G5) | The code works after a reboot, 30 days offline, an update | P3's four phone tests not run. A locked child can make emergency calls only (P2; no lock-task code in `agent/`). Alert email from Render never confirmed received (pending #9) |
| **Security, privacy** | Retention 30/90 days, rate limits, two-step sign-in, CSP, scans (roadmap l.406-410) | Compliant with Tunisian law (organic law 2004-63, INPDP) and GDPR: **never read** | `legal-and-ethics.md` l.44 only says "laws differ". No privacy notice a parent can read. Location not encrypted at rest (security.md item 4); audit log, pen test, MASA open |
| **Usability** | Guided setup works on 2 Samsungs, run by the developer only | A parent finishes alone | English only (no `values-ar`/`values-fr`), and P1 is last in the build order. Usability plan not run; setup time unmeasured (§6) |
| **Competition** | §3; market-study §6 | Parents feel Family Link's gaps | Family Link's web flow from Tunisia never tested end to end (§4). landscape-comparison §8 "behind" table is stale (says VPN and reset aren't blocked; README says done) |
| **Business** | P0 decided. Render free plan, Neon, Vercel, Brevo in use (backend/README l.121-155) | A grant will fund one developer | No organisation, no usage numbers, cost per family unmeasured. Sources: see below |
| **Go-to-market** | First-10 plan (§7) | Schools, imams, paediatricians will relay it | No one-sentence message, no landing page, no answer to "why install an unknown APK" |
| **Operations** | Play: non-trader declared; closed test not created (play-console-checklist l.28-37) | Play accepts a Device Owner parental app | The 12 testers x 14 days clock hasn't started. One developer: Render's free service sleeps (backend/README l.155), no runbook; a month away leaves families with the offline code only |

**Funding sources, checked on the web 2026-11-10** (first pass, each to confirm):

- Tunisia adopted a national charter for children online in November 2025, with ministries, operators and ISPs [10]. The minister cited 8 hours a day online for ages 12-16 [10]: usable in the pitch, as his figure.
- UNICEF Tunisia published 2026 consultations for the national action plan on protecting children online [11]. These are tenders, not grants, but it's the office to write to.
- NLnet's NGI0 Commons Fund took individuals without a legal entity; its last call closed 2026-06-01, and NLnet points to its other programmes [12].
- Risk: Tunisian authorities have been investigating associations over foreign funding [13]. Get local advice before an association takes foreign money; a local sponsor (operator foundations) avoids it. **Hypothesis:** Fondation Orange, Ooredoo, Tunisie Telecom fund this kind of project.

### (b) Gaps, ranked by impact for the child x effort

| # | Gap | Impact | Effort | Roadmap |
|---|---|---|---|---|
| 1 | Offline code never fails: 4 phone tests | High (a child locked out) | Small | P3 |
| 2 | Block screen that says why | High | Small | D2 |
| 3 | 10 interviews, then usability round 1 | High | Yours | §7 |
| 4 | Locked child can call the parent | High (safety) | Medium, research first | P2 (last in the decided order: flagged, not reopened) |
| 5 | Ask for more time | High | Medium | C5 + D3 |
| 6 | Arabic and French | High | Large | P1 |
| 7 | Impact numbers: screen-time trend, rules still on at 4 weeks, console visits per week | High (also what grants ask) | Small, existing data | **New** |
| 8 | Tunisian law reading + parent privacy notice | Medium | Small, needs a lawyer's check | **New** |
| 9 | Weekly email | Medium | Small | P8 |
| 10 | Fastest filter host | Medium | Small code, 3 networks | P4 |
| 11 | Approve new apps | Medium | Medium, verify first | P6 |
| 12 | Place alerts | Medium | Medium | P5 |
| 13 | Encrypt location at rest | Medium | Medium | security.md 4 |
| 14 | Call history: off, incoming, missed, browser install | Low | Small, phone | pending l.30-32 |
| 15 | A non-Samsung phone | Medium | A borrowed phone | pending #4 |

### (c) Five things that can be done now, small budget

1. **P3**: write the four test cases with exact adb steps. Caution: entering a valid code releases the phone, so each case needs the lab phone and your go-ahead.
2. **P8**: weekly email from the existing usage aggregates. Server only; done when you receive one.
3. **D2**: block screen text, after reading `SuspendDialogInfo` on developer.android.com.
4. **Impact numbers (#7)**: define the three in §6 and compute them from data already stored. No new collection.
5. **P1 groundwork**: count the hard-coded strings in the agent and console so P1 can be sized, and draft the one-sentence message. Draft to correct: FR "Manara aide votre enfant à passer moins de temps sur son téléphone, avec des règles qu'il voit et comprend. Gratuit." / TN "منارة تعاون صغيرك ينقّص من التليفون، بقواعد يشوفها ويفهمها. بلاش."

### (d) Only you can do

- [ ] **Interviews**: the 7 questions of §7, plus "Which language is your phone set to?" and "Has your child needed to reach you while the phone was locked or taken away?". Write each in `docs/interviews/` (folder doesn't exist yet).
- [ ] **Play closed test**: create the track and send the opt-in link to 12 testers today; the 14 days only count from then.
- [ ] **Family Link from Tunisia**, lab phone: supervise it from familylink.google.com, set a limit, request an app from the child side, note what the website can't do and whether you get any alert.
- [ ] **P3** on the lab phone: airplane mode; after a reboot; after an app update; clock 30 days ahead is blocked, so say how you want that case run.
- [ ] **P4**: run the measurement on Topnet, Ooredoo and Orange.
- [ ] **Alerts**: stop a protection on the lab phone and confirm the email arrives from Render (pending #9).
- [ ] **Call history**: turn it off and check the permission is withdrawn; one incoming, one missed call; install the APK from a browser.
- [ ] **Funding**: write to UNICEF Tunisia (child protection) [11]; check NLnet's current call [12]; ask one parents' or child-protection association whether it would carry the project; ask a lawyer whether children's location data needs an INPDP declaration.
- [ ] Borrow one non-Samsung phone (pending #4).

## Sources

1. Google Family Link FAQ, fetched 2026-11-10:
   <https://families.google/familylink/faq/>. "Teens aged 13 to under 18
   need parental approval to stop supervision."
2. Family Link's price: Google's own pages fetched on 2026-11-10 don't state
   it. Every third-party review found says it is free, for example
   <https://www.safetydetectives.com/best-parental-control/google-family-link/>.
   Treat it as Known in practice, but confirm on a phone in Tunisia.
3. Qustodio pricing, fetched 2026-11-10: <https://www.qustodio.com/en/premium/>.
   The page itself is inconsistent about the Basic plan's device count.
4. Family Link overview: <https://families.google/familylink/>.
5. Screen time and lock: <https://support.google.com/families/answer/7103340?hl=en>.
6. Website filters: <https://support.google.com/families/answer/7087030?hl=en>.
7. Removing a child's account, user profiles:
   <https://support.google.com/families/answer/9182020?hl=en>.
8. Consent and requirements, "must remove other accounts":
   <https://support.google.com/families/answer/9499456?hl=en>.
9. Family Link FAQ, managing from a browser:
   <https://families.google/familylink/faq/>. Some Google pages found are
   several years old.
10. Tunisia's national charter for children online, and the minister's
    8 hours figure, 2025-11-24:
    <https://www.wearetech.africa/en/fils-uk/news/public-management/tunisia-launches-charter-to-help-families-protect-children-online>.
11. UNICEF Tunisia, consultation for the national action plan on protecting
    children online, 2026: <https://www.ungm.org/Public/Notice/311088>.
12. NLnet, NGI Zero Commons Fund (last call closed 2026-06-01):
    <https://www.nlnet.nl/commonsfund>. Individuals eligible: third-party
    summaries only, confirm on NLnet's own eligibility page.
13. Investigation of associations over foreign funding, 2025-10-27:
    <https://news.fundsforngos.org/2025/10/27/tunisian-government-investigates-ngos-for-alleged-western-financial-links/>.
