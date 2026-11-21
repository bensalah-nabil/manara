# The setup assistant

A round bot button at the bottom right of the console while a phone is being set up (the
add-phone wizard, or a phone whose setup isn't finished). It opens a chat: the parent asks in their
own words (French, Arabic, Derja, English) and an AI model answers from Manara's setup knowledge.
Added 2026-11-21 so a founding family stuck at 11 pm isn't left alone; it doesn't replace the
setup call.

## Where it lives

| Part | File |
|---|---|
| What it knows (keep in step with the guide) | `backend/internal/setuphelp/knowledge.md` |
| Instructions, redaction, Claude client | `backend/internal/setuphelp/setuphelp.go` |
| Groq client (the free one in use) | `backend/internal/setuphelp/groq.go` |
| Routes `GET`/`POST /api/v1/console/setup-help` | `backend/internal/transport/console/setup_help.go` |
| Bot button, panel, suggestions, warnings | `controller/src/SetupHelp.tsx`, `controller/src/setupHelp.ts` |

## Which model, and turning it on and off

The server picks, in order (`cmd/manara-server/main.go`):

1. **`GROQ_API_KEY` set: Groq's free plan**, model `openai/gpt-oss-120b` (another Groq model with
   `SETUP_HELP_MODEL`). This is what runs (chosen 2026-11-21: free, and Groq's terms keep nothing
   by default and don't list training).
2. **Claude Haiku 5.5 only on purpose:** `SETUP_HELP_PROVIDER=anthropic` with `ANTHROPIC_API_KEY`
   (prepaid; about 0.04 US cents a question). The privacy policy names Groq, so a key left in
   the environment alone no longer sends questions to Anthropic: **update the privacy pages (en,
   fr, ar) before switching**.
3. **Else off:** the console hides the bot (it asks `GET /setup-help` first).

The log says which: `setup assistant: on (openai/gpt-oss-120b)`. 30 questions a day per parent.

**Why not other free models** (terms read 2026-11-21): Gemini's free tier lets Google use the
questions to improve its products with human reviewers, says not to send personal information,
and can't be used for users in the EU/UK or in a service likely used by under-18s. Manara has
French and Belgian parents, and the questions are about children's phones.

**Groq's free-plan limits** for `openai/gpt-oss-120b`, for the whole account: 30 requests and 8K
tokens a minute, 1K requests and 200K tokens a day. A question uses about 5K tokens, so roughly
**one question a minute and 40 a day across all parents**. Past that, Groq answers 429 and the bot
says "busy, try again in a minute" (`assistant_busy`, `Retry-After: 60`). Enough for the beta; if
the bot is busy often, move to Groq's paid plan or Claude.

**Turn off Groq's troubleshooting logs:** Groq keeps none by default, except logs of up to 30 days
for reliability and abuse; turn them off in Groq's console (Settings, Data Controls) so nothing is
kept at all.

## What is sent, and what never is

Sent: the question, the last six turns of that conversation, the setup step and status, the phone's
maker, the console's language. Before sending, the server removes email addresses and every run of
six or more digits (pairing and connection codes, phone numbers, IP addresses); the console also
warns and won't send while it sees one. Never sent: the parent's or child's name, the account, the
phone's id, rules, activity, location, calls. Questions are neither stored nor logged by Manara.
The privacy policy (three languages) names Groq since 2026-11-21.

**Data leaving Tunisia (law 2004-63):** the redaction keeps identifying data out, but a parent can
still type something personal in words. Include the assistant in the INPDP questions for the lawyer
(see `docs/standby.md`, privacy and legal).

## Watching usage and cost

The admin console's **AI assistant** tab (`GET /api/v1/admin/assistant-usage?days=`, logged as
`viewed_assistant_usage`): questions, tokens in and out, and estimated cost over 7, 30, 90 or 365
days; questions per day; each account, most expensive first. Kept in `assistant_usage` (migration
0023): per account, day (Tunisia) and model, counts only. A declined question counts (it used
tokens); a failed or busy call doesn't. Rows go with the account, and are deleted after 400 days.

On Groq's free plan the cost is $0; the tokens still show how close the account is to the daily
limit (200K). The price list is `domain.AssistantPrices`; a model missing from it is shown with a
`*` and no cost, never a guessed one. Add a model's price there before switching to it.

## Before relying on it

- Ask it the ten most common setup questions in each language and read the answers; fix
  `knowledge.md` where it is wrong or vague. Check Derja and the refusal ("how do I hide Manara").
- The Arabic panel wording is marked `TODO-REVIEW` for a native reader.
