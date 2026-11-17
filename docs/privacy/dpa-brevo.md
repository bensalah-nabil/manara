RESEARCH NOTES — NOT LEGAL ADVICE — REVIEW WITH A LICENSED ATTORNEY BEFORE ACTING

> **⚠️ Reviewer note**
> - **Sources:** Brevo's Terms of Service, Appendix 3 (DPA), Annex 2 and Appendix 4, read in full on 2026-11-17. No legal research connector: GDPR points carry confidence tags; Tunisian points come from the text of law 2004-63 [law text].
> - **Read:** the whole of the terms page (154k characters), including §6 AI Features.
> - **Flagged for your judgment:** 3 items marked `[review]`.
> - **Prior work:** `pia-call-history.md` (2026-11-17). Its rule that alert emails never carry calls, location or app use is honoured. No earlier triage or DPA review of Brevo.
> - **Before relying:** decide what goes in alert emails (redline R0). Brevo won't negotiate with a free account.

# DPA review: Brevo (email)

**Direction:** we are the controller; Brevo is our processor.
**Reviewed:** 2026-11-17.
**Attached to:** Brevo Terms of Service, Appendix 3. Accepted when the account was created; no separate signature.
**Data Brevo handles for Manara:** the parent's email address, and the text of password-reset and alert emails (the phone's name, which protection needs attention, when). Logs of each sent email.

## Bottom line

Brevo's DPA is sound on security, EU hosting and deletion. But **§6.7 lets Brevo train its AI on email content**, which is the playbook's one outright refusal. A free account can't negotiate it. So the fix is on Manara's side: **send emails that say nothing about the child** (R0), or move to a provider without that clause.

**Issues:** 5🟢 4🟡 1🟠 2🔴

## Term by term

**🔴 Own-purpose use: AI training (§6.7).**

- **It says:** "Brevo may use Content and Usage Data to enrich and train its AI Features for the sole purpose of improving the performance of the Services provided to You, in particular to prevent fraud, phishing and unsolicited electronic communications". The anti-spam and anti-fraud AI "cannot be disabled".
- **The playbook says:** never accept a vendor using the data for its own purposes, including training.
- **Why it matters:** the sentence before it ("do not process Your data unless You actually and actively use the AI Features") doesn't limit the training sentence.
- **The risk:** if a parent names the phone after the child ("Sami's phone"), a child's name goes into training data.
- **Open question** `[review]`: is training "for the Services provided to You" processing on Manara's behalf, or Brevo's own purpose? Treated as Brevo's own, because the profile is conservative.

**🟠 Own-purpose use: development (§5.6).** Brevo may "collect and use Personal Data contained in Customer Data to … provide, and develop such services". "Develop" goes beyond providing the service to Manara.

**🟡 AI subprocessors (§6.2, Annex 2).** OpenAI, Google Gemini, Anthropic and Langfuse receive input and output "to enable your use of AI Features, for content moderation, and other business purposes consistent with this Agreement". Manara doesn't use Brevo's AI features. Whether "content moderation" reaches every email is unclear `[review]`.

**🟢 Subprocessors (§7, Annex 2).** A published list, and notice before any new subprocessor. Infrastructure: OVH (France), Google Cloud (Belgium), Cloudflare (US; covered by the EU-US Data Privacy Framework and the standard contractual clauses). Support: Zendesk (US), plus Brevo entities in the US and India. The only remedy for an objection is ending the contract within 30 days, and only for a breach of EU law (🟡 inside an overall 🟢).

**🟢 Security (§5.4, Appendix 4).** A list of measures, and ISO 27001:2022 certification.

**🟡 Breach notice (§5.7).** "Without undue delay … after becoming aware", including the details GDPR art. 33(3) requires [settled]. The playbook requires a fixed time limit and accepts "without undue delay".

**🟢 Audit (§6.2).** Brevo will "accede to all reasonable requests" to verify compliance.

**🔴 Transfers.** For GDPR purposes, Brevo has a mechanism: EU hosting, and the Data Privacy Framework or standard contractual clauses for the US and India [verify]. **For Tunisian law it does not:** every transfer abroad needs INPDP authorization, and the family judge's for a child's data (law 2004-63 art. 52) [law text]. No contract term can supply that. The gap is on Manara's side, it is the same for every vendor, and it belongs to P19.

**🟢 Deletion.** On termination, "immediately and permanently deleted", with a 24-hour recovery option. 🟡 Event logs can stay up to 24 months.

**🟡 Liability.** Capped at the fees paid in the six months before the claim: €0 on the free plan.

**Not a DPA term, but operational:** an account with no login for six months is deleted (§3.4), which would silently stop password-reset and alert emails. Log in at least every few months.

## Privacy policy consistency

🟡 Flags:

- **"never shared with anyone else":** Brevo's AI training (§6.7) and its AI subprocessors aren't mentioned.
- **"The server and database are in Germany":** true for Manara's server, but Brevo's support staff can reach email data from the US and India.
- 🟢 **"Never the child's location, calls or app use":** holds. Keep it that way in R0.

## Recommended redlines

These are the asks if Brevo ever negotiates (a paid plan). For now, the fix is R0.

- **R0, Manara's side, not Brevo's: ✅ done 2026-11-17.** Alert emails name no phone and no child: "Manara: a phone needs your attention", plus the time, in the parent's language (en/fr/ar). `notify.ParentEmailAlerts` never reads the alert's title or message. `TestParentEmailAlertsNeverCarryThePhoneOrTheProblem` fails the build if anything from them reaches an email. ntfy and the webhook, the operator's own destinations, keep the detail. The password-reset email is unchanged. The privacy page says so (updated 17 November 2026). The fr and ar wording await a native reader (`TODO-REVIEW`).
- **§6.7:** strike "Brevo may use Content and Usage Data to enrich and train its AI Features …" or add ", excluding Customer Content, and only where Customer has enabled AI Features".
- **§5.6:** strike ", and develop".
- **§5.7:** after "without undue delay", insert "and in any event within 72 hours".

## If they won't move

| Issue | Fallback |
|---|---|
| §6.7 and §5.6 | R0 brings what Brevo sees down to the parent's address and generic text. If that's still too much, move to a provider whose DPA has no training clause, and run this review on it first |
| Transfers under Tunisian law | Escalate to the avocat (P19). The authorization request names Brevo, France, Belgium, the US and India |
| Liability €0 | Accept. A cap only matters on a paid plan |

**One question I'd ask that isn't in my checklist:** what do parents call their phones in the console? If the answer is the child's first name, the email already carries a child's name to a vendor that may train on it, and R0 matters more than any redline.

**What next? Pick one and I'll help you build it out:**

1. **Draft R0:** the generic alert email, in the three languages, plus a test that no phone name reaches Brevo.
2. **Escalate:** add Brevo's countries to the avocat brief for the art. 52 authorization.
3. **Get more facts:** ask Brevo support whether §6.7 covers transactional emails from an account with AI features off.
4. **Watch and wait:** keep Brevo with R0, and review again when its terms change.
5. **Something else.**
