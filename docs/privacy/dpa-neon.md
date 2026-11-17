RESEARCH NOTES — NOT LEGAL ADVICE — REVIEW WITH A LICENSED ATTORNEY BEFORE ACTING

> **⚠️ Reviewer note**
> - **Sources:** the Neon Product Specific Schedule (<https://neon.com/dpa>, "Last Updated: October 14, 2026") and the Databricks Master Cloud Services Agreement (<https://www.databricks.com/legal/mcsa>), both read 2026-11-17. **The Databricks DPA itself was not read**: it sits behind an e-signature flow. No legal research connector.
> - **Read:** the full Schedule, and the master agreement's data protection, usage data and liability clauses.
> - **Flagged for your judgment:** 2 items marked `[review]`, and 4 terms **[OPEN]** until the DPA is read.
> - **Prior work:** `pia-call-history.md` §3. Neon's point-in-time restore may keep deleted rows beyond 30 days [review]. Risk 3: data readable in plain text (Gap). Severity kept.
> - **Before relying:** get the Databricks DPA text. This review is **incomplete** without it.

# DPA review: Neon (Postgres database)

**Direction:** we are the controller; Neon is our processor.
**Reviewed:** 2026-11-17.
**Attached to:** the Neon Product Specific Schedule. **The contracting party is now Databricks, Inc.** (Neon, LLC bills on its behalf), under the Databricks master agreement. That agreement says "The terms of the DPA are incorporated by reference". Accepted by using the service.
**Data Neon holds for Manara:** everything the server stores: parent accounts, phones, events (location, usage, calls, limits, status), policies, setup records, sessions. It is the most sensitive store Manara has.

## Bottom line

A DPA applies (it is incorporated into the master agreement), but **its text hasn't been read**. Own-purpose use, breach timing, transfers and deletion can't be confirmed. What was read is reassuring: your data stays yours, encryption in transit and at rest, a SOC 2 report on request. **Get the DPA text before anything else**, and update the privacy page to name Databricks.

**Issues:** 4🟢 3🟡 1🟠 1🔴, plus 4 [OPEN]

## Term by term

**🟢 Ownership (master agreement).** "Customer retains all right, title and interest in and to the Customer Content". "Customer Content" means the data submitted, that is, Manara's database rows.

**🟡 Own-purpose use (master agreement, "Usage Data").** "Databricks may collect and use Usage Data to develop, improve, operate, and support its products and services". It is shared only if anonymized and aggregated. Usage Data appears to mean telemetry, not Customer Content `[review: read the definition in the DPA]`. **[OPEN]**: whether the DPA itself allows any use of Customer Content beyond providing the service.

**🟡 Subprocessors (Schedule §3.2).** The Databricks list, plus "Grafana Labs located in the United States". Data sent to **TypeSafe AI** is "governed by TypeSafe's terms … and not the Agreement" (§4). That applies if Neon's AI features are used, which Manara doesn't `[review]`. Notice and objection rights: **[OPEN]**, in the DPA.

**🟢 Security (Schedule Exhibit A).** "Reasonable administrative, physical, and technical safeguards", HTTPS in transit, encryption at rest, logging and incident tracking. A SOC 2 report and penetration-test summaries on request.

**🟢 Audit (Schedule §3.4, replacing DPA §7).** Audits "where required by applicable law", including by the customer's auditor; the SOC 2 report on request.

**🟠 Breach notice.** "In accordance with the terms of the Agreement" (Exhibit A §3.2). Trigger and time limit: **[OPEN]**, in the DPA.

**🔴 Transfers.**

- **GDPR:** the mechanism is **[OPEN]**, since it is in the DPA. Databricks publishes an "International Data Transfers FAQ". Manara's project runs in Frankfurt; the parent company is in the US.
- **Tunisian law:** INPDP authorization for the transfer, and the family judge's for a child's data (law 2004-63 art. 52) [law text]. Not obtained. It belongs to P19.

**🟢 Backups (Exhibit A §4.1).** "At least industry standard methods". **[OPEN]**: deletion at termination, and how long point-in-time history keeps deleted rows. This decides whether the privacy page's "deleted after 30 days" is literally true.

**Liability:** the master agreement's cap applies; not reviewed.

## Privacy policy consistency

🟡 Flags:

- **"Neon (database, Frankfurt, Germany)":** the contracting party is now **Databricks, Inc.** (US). Name it.
- **"deleted after 30 days" / "Removing a phone … deletes everything":** true in the live database. Backups may keep rows for the history window [review].
- **"The server and database are in Germany":** true for the region. Access by a US parent company isn't mentioned.

## Recommended redlines

None yet: the DPA hasn't been read. Once it has, check it against the playbook's controller column. Any DPA term that permits use of Customer Content beyond the service is a 🔴.

## If they won't move

| Issue | Fallback |
|---|---|
| DPA text unavailable without e-signing | Ask Neon support for the PDF, or use the e-sign flow. **E-signing a DPA is a legal act.** The DPA already applies through the master agreement, so signing mainly gets you a copy, but the profile's rule is to brief the avocat first `[review]` |
| Point-in-time history keeps deleted rows | Set the shortest history window the plan allows, and say so on the privacy page |
| Transfers under Tunisian law | Escalate to the avocat (P19) |

**One question I'd ask that isn't in my checklist:** Neon's history window can be set per project. Is it set to the shortest your plan allows? Every day of history is a day the "deleted after 30 days" promise is false for anything restored.

**What next? Pick one and I'll help you build it out:**

1. **Get more facts:** a message to Neon support asking for the Databricks DPA PDF and the project's history window.
2. **Draft the privacy-page fix:** name Databricks, Inc., and the backup window.
3. **Escalate:** add Neon/Databricks to the avocat brief for the art. 52 authorization.
4. **Watch and wait:** re-review when the DPA text is in hand.
5. **Something else.**
