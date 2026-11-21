# The setup assistant

"Stuck? Ask the setup assistant": a help panel in the console, under the setup timeline on a
phone's page and in the add-phone wizard. The parent asks in their own words (French, Arabic,
Derja, English) and Claude answers from Manara's setup knowledge. Added 2026-11-21 so a founding
family stuck at 11 pm isn't left alone; it doesn't replace the setup call.

## Where it lives

| Part | File |
|---|---|
| What it knows (keep in step with the guide) | `backend/internal/setuphelp/knowledge.md` |
| Instructions, redaction, the call to Claude | `backend/internal/setuphelp/setuphelp.go` |
| Routes `GET`/`POST /api/v1/console/setup-help` | `backend/internal/transport/console/setup_help.go` |
| Panel, suggestions, warnings | `controller/src/SetupHelp.tsx`, `controller/src/setupHelp.ts` |

## Turning it on and off

- **On:** set `ANTHROPIC_API_KEY` in Render (Environment) and save; the server log says
  `setup assistant: on (claude-haiku-5-5)`. Use a key from a workspace with a monthly spend limit.
- **Off:** remove the variable. The console then hides the panel (it asks `GET /setup-help` first).
- Model `claude-haiku-5-5` at low effort (chosen 2026-11-21 over Opus for cost, and over free
  tiers because those may use the questions to train their models). A declined question shows
  "write to us"; Haiku has no server-side fallback. 30 questions a day per parent. To change the
  model, `setuphelp.Model`.

## What is sent, and what never is

Sent: the question, the last six turns of that conversation, the setup step and status, the phone's
maker, the console's language. Before sending, the server removes email addresses and every run of
six or more digits (pairing and connection codes, phone numbers, IP addresses); the console also
warns and won't send while it sees one. Never sent: the parent's or child's name, the account, the
phone's id, rules, activity, location, calls. Questions are neither stored nor logged by Manara.
The privacy policy (three languages) lists Anthropic since 2026-11-21.

**Data leaving Tunisia (law 2004-63):** the redaction keeps identifying data out, but a parent can
still type something personal in words. Include the assistant in the INPDP questions for the lawyer
(see `docs/standby.md`, privacy and legal).

## Cost

About 4,000 tokens of instructions and knowledge plus a short answer: about 0.04 US cents per
question at Haiku's price ($0.10 / $0.50 per million tokens). Twenty families asking ten questions
each: about $0.10 a month. Set a $5 monthly spend limit on the Anthropic workspace anyway.

## Watching usage and cost

The admin console's **AI assistant** tab (`GET /api/v1/admin/assistant-usage?days=`, logged as
`viewed_assistant_usage`): questions, tokens in and out, and estimated cost over 7, 30, 90 or 365
days; questions per day; each account, most expensive first. Kept in `assistant_usage` (migration
0023): per account, day (Tunisia) and model, counts only. A declined question counts (it used
tokens); a failed call doesn't. Rows go with the account, and are deleted after 400 days.

The cost is an estimate: `domain.AssistantPrices` (list prices) with the standard cache rates
(writing 1.25 times the input price, reading 0.1 times). A model missing from that list is shown
with a `*` and no cost, never a guessed one. Compare with the bill in Anthropic's console now and
then, and add a model's price there before switching to it.

## Before relying on it

- Ask it the ten most common setup questions in each language and read the answers; fix
  `knowledge.md` where it is wrong or vague.
- The Arabic panel wording is marked `TODO-REVIEW` for a native reader.
