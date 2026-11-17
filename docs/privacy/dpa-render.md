RESEARCH NOTES — NOT LEGAL ADVICE — REVIEW WITH A LICENSED ATTORNEY BEFORE ACTING

> **⚠️ Reviewer note**
> - **Sources:** Render's Data Processing Addendum, read in full from <https://render.com/dpa> on 2026-11-17. The page shows no date. The subprocessor list is from a web search of render.com/security [web search, verify]. No legal research connector.
> - **Read:** the whole DPA, including Exhibit A, the security annex and the UK addendum.
> - **Flagged for your judgment:** 3 items marked `[review]`.
> - **Prior work:** `pia-call-history.md` risk 3, "the operator and the hosting providers can read every number in plain text" (Gap). This review keeps that severity: nothing in the DPA changes it.
> - **Before relying:** check what Render stores as "Usage Data" for Manara (request logs, IP addresses), and its current subprocessor list.

# DPA review: Render (API server)

**Direction:** we are the controller; Render is our processor.
**Reviewed:** 2026-11-17.
**Attached to:** Render Terms of Service. The DPA is incorporated into them, and the standard contractual clauses are "deemed signed" from the date the terms were accepted. A countersigned copy can be requested at trust.render.com.
**Data Render handles for Manara:** every API request from parents' browsers and children's phones, passing through: location, usage, call events, tokens. Plus Render's request logs and Manara's own server logs.

## Bottom line

Render acts on instructions, publishes its subprocessors and holds SOC 2 and ISO 27001. But it is an **independent controller of "Usage Data"** (logs, the source and destination of each request), and Exhibit A keeps data "for Company's legitimate business needs". Neither is negotiable on the free plan. The fix is to **keep personal data out of what Render logs**, and to state the US access on the privacy page.

**Issues:** 5🟢 5🟡 2🟠 1🔴

## Term by term

**🟢 Roles and instructions (§2.1–2.2).** Render is a processor and won't process "for purposes other than those set forth in the Agreement and/or Exhibit A". 🟡 Within §2.1: Manara indemnifies Render for personal data "inappropriate for the nature of the Services" `[review]`. Children's call records are sensitive; check that the terms of service don't exclude them.

**🟠 Own-purpose use (§9, §1.4).**

- **It says:** Render is an "independent controller" of Company Usage Data: "activity logs", "data used to identify the source and destination of a communication". It "may also process Company Usage Data as a controller to provide, optimize, and maintain the Services".
- **For Manara, that means:** the IP address and timing of every check-in from a child's phone.
- **The playbook says:** never accept the vendor using the data for its own purposes (ads, training, analytics). "Optimize and maintain" is closer to operations than to analytics `[review]`.

**🟠 Retention (Exhibit A, "Duration of Processing").** "As long as required … (ii) for Company's legitimate business needs". This contradicts §2.2's purpose limit and the deletion clause.

**🟡 Disclosure (§3).** Render "may disclose Personal Data to its advisers, auditors or other third parties as reasonably required". "Other third parties" is open-ended.

**🟢 Subprocessors (§4.2).** A list at render.com/trust; 10 days' notice of new ones; objection within 10 days on data-protection grounds. 🟡 The list includes AI providers (Anthropic, TypeSafe AI) [web search, verify]. What they receive is not stated `[review]`.

**🟢 Security (security annex).** Annual SOC 2 and ISO 27001 audits, least privilege, MFA, daily backups.

**🟡 Breach notice (§8.6).** "Without undue delay", with remediation "in its sole discretion". The playbook requires a fixed time limit and accepts "without undue delay".

**🟢 Audit (§8.3–8.4).** Certifications and reports on request; an audit by an independent third party, once a year at the customer's cost, if reports aren't enough.

**🔴 Transfers (§6).**

- **It says:** "Company's primary processing operations take place in the United States". Transfers rely on the EU-US Data Privacy Framework, with the 2021 standard contractual clauses (Commission Decision 2021/914) as fallback [settled]. Render says it is certified under the Framework [verify on the official list].
- **GDPR:** a mechanism exists. 🟢
- **Tunisian law:** sending data to Germany and the US needs INPDP authorization, and the family judge's for a child's data (law 2004-63 art. 52) [law text]. None has been obtained. No contract term can fix this; it belongs to P19.

**🟡 Deletion (§2.4).** Return or delete "following completion of the Services", with certification on request. No time limit.

**🟢 Impact-assessment help (§8.1).** Provided, at the customer's cost.

**Not reviewed:** the liability cap is in the terms of service.

## Privacy policy consistency

🟡 Flags:

- **"The server and database are in Germany":** true for the hosting region, but the DPA says Render's primary processing is in the US. The page should say data may be accessed from the US, and on what basis.
- **"never shared with anyone else":** Render's §3 disclosure to advisers and others, and its own use of Usage Data, aren't mentioned.

## Recommended redlines

These are the asks if Render ever negotiates (a paid or enterprise plan).

- **R0, Manara's side, not Render's: ✅ audited 2026-11-17, nothing to fix.**
  - All 100 `log.Printf`/`log.Fatalf` calls in `backend/` (outside tests) print only opaque IDs (UUIDs), phone make and model, counts, and error text.
  - No error wraps an email, coordinate, number or token.
  - Client IPs are used in memory for rate limits (`transport/guard`) and never logged.
  - API query parameters carry no personal data (`kind`, `since`).
  - Brevo's error body is logged on a failed send. It names the problem. A real one (401, 2026-11-17) carried Render's outbound IP address and no recipient; other error bodies are assumed the same [review].
  - **Rule:** run `manara-server -seed` only locally, never as a Render job. It prints the parent's email, password and tokens to stdout, which Render would keep.
  - What remains is Render's *own* edge logs (path, status, client IP). Code can't change those; the privacy page has to state them.
- **Exhibit A:** strike "(ii) for Company's legitimate business needs;".
- **§3:** replace "advisers, auditors or other third parties as reasonably required" with "advisers and auditors bound by confidentiality, where required by law".
- **§8.6:** after "without undue delay", insert "and in any event within 72 hours".
- **§2.4:** after "return or delete Customer's Personal Data", insert "within 30 days".

## If they won't move

| Issue | Fallback |
|---|---|
| §9 Usage Data and Exhibit A | R0, plus stating it on the privacy page. Moving off Render only makes sense together with the Tunisian hosting question |
| Transfers under Tunisian law | Escalate to the avocat (P19). Hosting in Tunisia would remove the transfer altogether |
| Breach timing, deletion window | Accept. Both are within the playbook's "acceptable" column |

**One question I'd ask that isn't in my checklist:** does Manara's server log the `CF-Connecting-IP` header (`TRUSTED_IP_HEADER`) for rate limits? If so, Render holds a child's IP address next to every check-in, as its own controller data.

**What next? Pick one and I'll help you build it out:**

1. **Draft R0:** an audit of the `backend/` log lines for personal data, with a fix.
2. **Escalate:** add Germany and the US to the avocat brief for the art. 52 authorization.
3. **Get more facts:** ask Render what the AI subprocessors receive, and request the countersigned DPA from trust.render.com.
4. **Watch and wait:** subscribe to subprocessor notices at render.com/trust.
5. **Something else.**
