# Privacy impact assessment: call history

> **DRAFT for a lawyer's review. Not legal advice.** Prepared with an AI
> assistant following the privacy-legal plugin's `pia-generation` method
> ([anthropics/claude-for-legal](https://github.com/anthropics/claude-for-legal/tree/main/privacy-legal)).
> No one with legal training has read it yet.
>
> Every legal citation carries a source tag:
> **[law text]** = loi organique 2004-63, French text published by the INS, read in full on 2026-11-17;
> **[web search, verify]**; **[model knowledge, verify]** (recalled, not fetched: check these first);
> **[repo]** = this repository.

**Prepared by:** Claude (AI), for Nabil Ben Salah | **Date:** 2026-11-17 | **Status:** DRAFT
**Product owner:** Nabil Ben Salah | **Privacy reviewer:** not yet named (a Tunisian lawyer)

**Prior work.** No earlier PIA or triage exists. This builds on
[ADR-0008](../decisions/0008-visible-call-history.md) (the design),
[`legal-and-ethics.md`](../legal-and-ethics.md) and [`validation.md`](../validation.md)
§9 gap #8 ("Compliant with Tunisian law … **never read**"). This is a cold
start.

## Executive summary

Call history sends the number, direction, time and length of a child's
calls, plus calls noticed in four messaging apps, to a server in Frankfurt
for the parent to read. The design is careful: off by default, visible on
the phone, no content, 30 days. But law 2004-63 attaches **prison terms** to
three formalities that this repo shows no sign of: declaring the processing
to the INPDP, a **family judge's** authorization for a child's data, and
authorization to send data abroad. Whether they apply turns on one question
for a lawyer: is this the parent's family use, or Manara's own processing?

**Overall risk:** 🟠 High (reviewer to confirm).
**Recommendation:** CHANGES REQUIRED before call history is offered to any
family other than the operator's own.

**This goes beyond calls.** The legal questions below apply equally to
location, usage reports and the rest of Manara. Call history is just where
the stakes are highest, because it also holds data about people outside the
family.

## 0. Is a PIA needed?

- **House trigger:** none written down. The nearest are capability-plan
  guardrails G1–G7 and ADR-0008. [repo]
- **Tunisia:** law 2004-63 has no impact-assessment duty as such. It uses
  prior formalities instead: a declaration (art. 7), authorizations in
  listed cases (art. 8), the child rule (art. 28), and transfers abroad
  (art. 52). [law text]
- **GDPR, only if Manara serves families in the EU:** article 35 requires a
  DPIA for likely high-risk processing. The WP248 rev.01 criteria endorsed
  by the EDPB treat two or more of these as usually requiring one:
  systematic monitoring, vulnerable data subjects (children), and data of a
  highly personal nature. Call history meets all three. [model knowledge, verify]
- **Strong signs regardless:** it concerns children's data, and the other
  person in each call wouldn't expect it.

**Yes, a PIA is needed.**

## The question that decides everything

**Art. 3** [law text]: *"La présente loi ne s'applique pas au traitement des
données à caractère personnel ayant des finalités ne dépassant pas l'usage
personnel ou familial à condition de ne pas les transmettre aux tiers."*

**Art. 6** [law text] defines a *tiers* as anyone other than *"la personne
concernée, le bénéficiaire, le responsable du traitement, le sous-traitant"*
and their staff.

| | Reading A: the parent's family use | Reading B: Manara is the controller |
|---|---|---|
| The argument | The parent processes their own child's data for family purposes. Manara is the parent's *sous-traitant*, which the privacy page already says: "Manara processes the child's data on that parent's behalf". A *sous-traitant* is not a *tiers*, so art. 3's condition may hold. | Manara decides the **means** (what can be collected, where it is stored, for how long) and offers the same processing to many families. That makes it the *responsable du traitement* (art. 6). |
| Open points | Art. 20 still binds a *sous-traitant* to *"respecter les dispositions de la présente loi"*. The other person in each call is outside the family: does their number fit "usage familial"? | — |
| What follows | Most of the law may not apply to the parent. Manara's own duties as *sous-traitant* are unclear. | All of the formalities below apply. |

**Under Reading B** [law text]:

| Article | Requires | Status in this repo | Penalty if not met |
|---|---|---|---|
| 7 | Prior declaration to the INPDP; accepted if no objection within a month | Not found | **Art. 90:** 1 year and 5,000 TND |
| 27 §1 | The data subject's express, written consent | The parent confirms three things in writing at enrollment, plus a confirmation when turning calls on [repo] | **Art. 87:** 2 years and 10,000 TND |
| 28 §1 | For a child: **the guardian's consent and the family judge's authorization** | Guardian consent: yes. Family judge: none | **Art. 87:** 2 years and 10,000 TND |
| 31 | Written notice to data subjects, at least a month before processing (nature, purpose, controller, rights, retention, destination country) | The privacy page covers the content, in English only. Nothing for the other people in calls | **Art. 87:** 2 years and 10,000 TND |
| 52 | **INPDP authorization for any transfer abroad.** For a child's data, the request goes to the **family judge** | Server and database are in Frankfurt [repo: `render.yaml` `region: frankfurt`; privacy page]. No authorization found | **Art. 90:** 1 year and 5,000 TND |

The privacy page names **Nabil Ben Salah** as the person responsible. Until
a lawyer says otherwise, treat Reading B as the one that applies to anything
beyond the operator's own household.

**Also for the lawyer:**

- **GDPR.** Manara is established in Tunisia. The GDPR would reach it if it
  offers the service to people in the EU (art. 3(2)). Using Render and Neon
  in Frankfurt does not by itself bring a non-EU controller under the GDPR
  (EDPB Guidelines 3/2018). The household exemption (art. 2(2)(c)) covers
  the parent, but not whoever provides the means (recital 18).
  [model knowledge, verify]
- **Convention 108.** Tunisia acceded to the Council of Europe's Convention
  108, and Germany is a party. Whether that eases art. 52 is for the lawyer.
  [model knowledge, verify]
- **The pending bill (095/2025)** would replace 2004-63, with fines up to
  200,000 TND and new rules on transfers abroad. It was still in committee in
  October 2026. [web search, verify]

## 1. Description of processing

**What:** while the parent has it on, the child's phone reports each call so
the parent can see who the child calls and when. Only the `direct` build,
installed outside Play, can do it; the `play` build has no call-log
permission. [repo, ADR-0008]

| Source | Fields | Code |
|---|---|---|
| Phone's call log | Number, direction (incoming, outgoing, missed, rejected, blocked), time, length | `CallLogEnforcer`, `CallLogDecision` |
| Call notifications from WhatsApp, Messenger, Telegram, Viber (only if the parent also turns on notification access by hand) | App, time, direction where it can be told, rough length. **No number, no name** | `CallNotificationListener`, `CallNotificationDecision`: reads Android's category and flags, not the notification's text |

- **Data subjects:**
  - the child, a minor;
  - **the other person in every call**, of any age (often another child), who is not told;
  - the parent, as account holder.
- **Purpose:** let the parent see who the child talks to by phone.
- **New collection?** Yes. It is off by default, and only calls made after it
  is turned on are sent.

## 2. Lawful basis

| Purpose | Tunisia (Reading B) | GDPR, if it applies | Notes |
|---|---|---|---|
| The child's call records | Art. 27 + 28: guardian's written consent **and family judge authorization** [law text] | Probably legitimate interest (art. 6(1)(f)) for the provider, with a balancing test weighted towards the child's interests [model knowledge, verify] | Guardian consent exists. The family judge step does not, and how it would work per child is the main question for the lawyer. |
| The other person's number | No consent is possible. **Art. 29** waives consent where getting it *"implique des efforts disproportionnés"*. Whether that can be relied on here is unclear [law text] | Legitimate interest; art. 14(5)(b) disproportionate-effort exemption from notice [model knowledge, verify] | This is ADR-0008's own "main weight of this feature". |

## 3. Data flow

| Step | What happens | Source |
|---|---|---|
| Collection | On the phone, from the call log and call notifications; sent as `call` events | [repo] |
| Transfer | HTTPS to the API on Render, Frankfurt | [repo] `render.yaml` |
| Storage | Neon Postgres, Frankfurt. Encrypted only by the provider's disk encryption; **no application-level encryption** | [repo] ADR-0008 Consequences; `security.md` item 4 covers location and authenticator secrets, **not calls** |
| Access | (a) The parent account(s) of that phone, in the console. (b) **The operator**, through database credentials. (c) Render and Neon, as providers. No log of who read what: `security.md` item 1 covers console writes only | [repo] |
| Sharing | None. FCM messages carry no data; Brevo emails never include calls | [repo] privacy page |
| Retention | **30 days**, deleted by an hourly sweep (`domain.CallRetention`, `runRetentionSweep`). Turning call history off **does not** delete what was already sent; it ages out within 30 days. Removing the phone deletes everything. Neon's point-in-time restore may keep deleted rows for the plan's history window | [repo]; Neon backups: [model knowledge, verify on the Neon project] |

## 4. Privacy policy consistency

Checked against `controller/public/privacy.html` (updated 2026-11-15).

| Policy commitment | Consistent? | Notes |
|---|---|---|
| "the number, direction, time and length of each call from that moment on" | 🟢 | Matches ADR-0008 and the code |
| "shown on the child's phone while it is on" | 🟡 | The phone shows *that* calls are sent and what each entry holds ("Your calls: the number, direction, time and length…"). No screen on the phone lists the calls themselves. Reword to "the phone shows that it is on", or add that list |
| "deleted after 30 days" | 🟢 | Matches the code. Add Neon's backup window if it is longer than a day |
| "The other person in a call is not told" | 🟢 | Honest. It is the gap in risk 2 |
| App calls: "never who called"; "Manara looks at notifications only to spot those calls and keeps nothing else" | 🟢 | `CallNotificationDecision` reads category and flags only; `CallNotificationDecisionTest` exists. See risk 4 |
| "Manara processes the child's data on that parent's behalf" | 🟡 | True only under Reading A |
| "The server and database are in Germany, so data is sent … to the European Union" | 🟢 / 🟡 | Disclosed. Under Reading B, art. 52 authorization is also needed |
| The page itself | 🟡 | English only. P1 left `privacy.html` untranslated. Art. 31's notice has to reach a Tunisian parent in a language they read |

## 5. Risks and mitigations

| # | Risk | Likelihood | Impact | Mitigation | Status | Owner |
|---|---|---|---|---|---|---|
| 1 | **The formalities of arts. 7, 28 and 52 are not done** (if Reading B holds). The named operator carries criminal liability: arts. 87 and 90 | H: nothing in the repo shows a filing | H | A lawyer's written opinion on art. 3. Then, if needed: INPDP declaration; transfer authorization or **hosting in Tunisia**; the practical route for the family judge's authorization. Until then, call history only in the operator's own family | Gap | Nabil + lawyer |
| 2 | **People who never agreed have their number stored and shown.** Often other children. Under art. 42 their objection *"suspend immédiatement le traitement"*, and continuing is an offence under art. 91 [law text]. Manara has no way to honour an objection for one number | M | M | A server-side **excluded numbers** list applied before storing and showing. A line on the privacy page telling anyone whose number may appear how to object. Consider 7 days instead of 30 for call events | Gap | Nabil (dev) |
| 3 | **The operator and the hosting providers can read every number in plain text.** One database credential leak exposes every family's call partners | M | H | Encrypt call events at rest, by extending `security.md` item 4 to the `call` kind. Better: encrypt to a key only the parent's console holds. ADR-0008 already says this must close before other families | Gap | Nabil (dev) |
| 4 | **Notification access sees every notification, including message previews.** "Never your messages" rests on Manara's code, not on Android. A future change could keep text by accident | L | H | Today: the decision reads category and flags only, with a unit test. Add a test that feeds a notification full of message text and asserts no string from it reaches any event. Add a review rule in `CLAUDE.md` | Partial | Nabil (dev) |
| 5 | **Proportionality for older teens.** Reading the call records of a 16–17-year-old weighs more than for a 9-year-old. UN Committee on the Rights of the Child, General Comment No. 25 (2021): monitoring should respect the child's evolving capacities and privacy [model knowledge, verify] | M | M | The turn-on confirmation asks the child's age and, for 15+, suggests telling them first. Ask the parent every 6 months whether to keep it on | Gap | Nabil (dev) |

**Residual risk after mitigations:** Medium if 1 and 3 close. Risk 2 is
built into the feature: it shrinks with the excluded-numbers list and
shorter retention, but doesn't disappear.

## 6. Data subject rights

| Right | Can it be exercised? | How |
|---|---|---|
| Access (art. 32) | Parent: yes, in the console. Child: sees that it is on, not the entries. The other person: only by email, and Manara can search by number | Add the list on the child's phone (see §4) |
| Deletion | Parent: remove the phone, or wait 30 days. **Turning it off doesn't delete what was sent** | Delete the phone's call events when the parent turns it off |
| Correction | n/a: machine records | — |
| Portability | No export | Needed only if the GDPR applies |
| Objection (arts. 42–43) | Child: can't turn it off, by design. A dispute about a child's objection goes to the **family judge** (art. 43) [law text]. The other person: email only, with no mechanism to apply it | The excluded-numbers list (risk 2) |

**Destruction formalities, for the lawyer:** art. 45 requires a bailiff's
record (*procès-verbal par huissier de justice*) with an INPDP-appointed
expert when data is destroyed at the end of its retention period [law text].
How that applies to an automatic 30-day purge is unclear.

## 7. Recommendation

**CHANGES REQUIRED.** Call history stays limited to the operator's own
family until the first three conditions are met.

**Conditions:**

- [ ] A Tunisian lawyer's written opinion on Reading A or B, art. 28's family judge authorization, art. 52, and art. 45. Owner: Nabil (finding the lawyer).
- [ ] If the lawyer says so: the INPDP declaration (art. 7). Owner: Nabil.
- [ ] Transfer abroad: authorization (INPDP, or the family judge for children's data), **or** move the server and database to Tunisia. Owner: Nabil.
- [ ] Encrypt `call` events at rest (risk 3). Owner: dev.
- [ ] An excluded-numbers list, and a privacy-page line on how to object (risk 2). Owner: dev.
- [ ] Turning call history off deletes the call events already sent (§6). Owner: dev.
- [ ] A test that notification text never reaches an event (risk 4). Owner: dev.
- [ ] Privacy page: fix "shown on the child's phone", add the objection route, publish in Arabic and French (§4). Owner: dev.

**Sign-off:** not signed.

## Next steps

1. **Find a lawyer** who has dealt with the INPDP. Give them this document,
   the privacy page and [`legal-and-ethics.md`](../legal-and-ethics.md). Ask:
   1. Does art. 3 exempt a parent who supervises their minor child's phone
      through a hosted service? If so, is Manara then a *sous-traitant* with
      no declaration of its own?
   2. If not, does art. 28 mean one family judge authorization **per child**?
      Is there any INPDP practice for parental-control apps? Kidcare, a
      Tunisian app, says it is "reconnue par l'INPDP"
      ([`competitive-brief.md`](../competitive-brief.md)).
   3. Does hosting in Germany need art. 52 authorization, and does Convention
      108 change that? How does art. 45 apply to automatic deletion?
2. **Meanwhile, do the engineering conditions.** None of them depends on the
   lawyer's answer.
3. **If the answer is Reading A:** write down why in `legal-and-ethics.md`,
   with the lawyer's name and date.
4. **If the answer is Reading B:** the same formalities cover location and
   everything else. Extend this PIA to all of Manara before the first family
   outside the operator's own.

## Sources

- Loi organique n° 2004-63 du 27 juillet 2004, French text, INS:
  <https://www.ins.tn/sites/default/files/2020-04/Loi%2063-2004%20Fr.pdf>.
  Arts. 3, 6, 7, 20, 27–29, 31, 42–43, 45, 47, 50–52, 87, 90, 91 quoted or
  summarised from that text. The INPDP's own copy: <https://www.inpdp.tn/textes.xhtml>
- *(web search, verify)* The replacement bill: see [`competitive-brief.md`](../competitive-brief.md) [L2]
- This repository: ADR-0008, `privacy.html`, `render.yaml`,
  `backend/internal/domain/event.go`, `backend/cmd/manara-server/main.go`,
  `agent/.../enforcers/CallNotificationDecision.kt`, `agent/app/src/main/res/values/strings.xml`,
  `security.md`
