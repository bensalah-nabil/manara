# Market study: parental control on Android and iPhone

Checked 2026-11-10. Built-in and commercial products are covered here. For
open-source projects, see [`landscape-comparison.md`](landscape-comparison.md);
the main ones are summarised in §1.

**How this was checked.** Official pages where they could be fetched
(Google, Apple, Microsoft, Qustodio, Bark, Mobicip). Several vendors blocked
automated fetching (Norton, FamiSafe, Net Nanny, Kaspersky, Life360). Their rows rely
on recent independent reviews and are marked *(rev.)*. Prices are in USD
and change often; reviews disagree on several of them, so the range is
given. Nothing here was tested on a phone except Family Link's availability
in Tunisia and Manara itself.

**Legend**: ✅ yes · ◐ partial or limited (the cell says how) · ❌ no · ? not
found in any source checked (not the same as "no").

## 1. Overview

| Product | Type | Child on Android | Child on iPhone | Price per year | Sold / usable in Tunisia | Arabic / French |
|---|---|---|---|---|---|---|
| **Google Family Link** | Built into Android | ✅ full | ◐ only YouTube and Search settings [G1] | Free | ◐ parent app **not on Play** in Tunisia; website works (checked 2026-11-10) | ✅ |
| **Apple Screen Time** | Built into iOS | ❌ | ✅ full [A1] | Free (built in) | ✅ | ✅ |
| **Samsung Kids + Galaxy for Families** | Built into Samsung | ◐ Samsung only; remote control goes through Family Link [S1] | ❌ | Free | ✅ | ✅ |
| **Microsoft Family Safety** | Free app | ◐ limits; filter in Edge only [M1] | ◐ | Free | ? | ✅ |
| **Qustodio** | Commercial | ✅ | ◐ | $59.95 (5 devices) / $104.95 (unlimited) [Q1] | ? | ? |
| **Norton Family** | Commercial | ✅ | ◐ weak | $49.99, or included with Norton 360 *(rev.)* [N1] | ? | ? |
| **Kaspersky Safe Kids** | Commercial | ✅ | ◐ weak | Free tier; Premium ~$15–28 *(rev.)* [K1] | Likely: kaspersky.com redirects to its African site. Banned in the US since 2024 | ◐ French site |
| **Bark** | Commercial | ✅ | ◐ needs Bark Sync or a computer | $99, or $14/month [B1] | ❌ **App sold only in the US, South Africa and Australia** [B1] | ❌ |
| **Net Nanny** | Commercial | ? newer reviews list only Windows, macOS, iOS | ✅ | $39.99–89.99 *(rev.)* [NN1] | ? | ? |
| **Mobicip** | Commercial | ✅ | ✅ | Free (2 devices); $2.99–7.99/month, billed yearly [MO1] | ◐ no debit or prepaid cards accepted [MO1] | ? |
| **FamiSafe** | Commercial | ✅ | ◐ | $59.99 (up to 30 devices) *(rev.)* [F1] | ? | ? |
| **OurPact** | Commercial | ✅ | ✅ strongest of the commercial apps on iPhone | Free (1 device); $69.99 / $99.99 *(rev.)* [O1] | ? | ? |
| **Find My Kids** | Location | ✅ | ◐ | ~$17–28, varies by region *(rev.)* [FK1] | ? | ? |
| **TimeLimit** (open source) | Free, self-host | ✅ optional Device Owner | ❌ | Free | ✅ (outside Play) | ? |
| **kid-phone-server** (open source) | Free, self-host | ✅ Device Owner | ❌ | Free | ✅ (outside Play) | ? |
| **Manara** | Open source + hosted | ✅ Device Owner | ❌ | Not decided | ✅ | ❌ **English only** |

## 2. Child on Android: what each one does

| Product | Daily limit | Per-app limit | Block / approve apps | Website filter: where it applies | Location | Calls / SMS | Hard to get around | Phone already in use |
|---|---|---|---|---|---|---|---|---|
| **Family Link** | ✅ per day, bonus time | ✅ (not system apps) | ✅ approve each install | ◐ Chrome and "some Android apps"; other browsers aren't covered [G2] | ✅ + place alerts | ❌ | ◐ tied to the child's Google account; new user profiles escape [G3] | ◐ child's phone must remove other accounts [G4] |
| **Samsung Kids** | ✅ schedules, bedtime | ? | ✅ inside kids mode | ? | Via Samsung Find [S1] | ❌ | ◐ a separate "kids mode", not the whole phone | ✅ |
| **Microsoft Family Safety** | ✅ | ✅ | ✅ by age | ◐ Edge only; other browsers are blocked [M1] | ❌ **removed November 2024** [M2] | ❌ | ? | ✅ |
| **Qustodio** | ✅ | ✅ | ✅ | ✅ | ✅ | ◐ call log and SMS on Complete, needs an app from outside Play *(rev.)* [Q2] | ? | ✅ |
| **Norton Family** | ✅ | ❌ no per-app limit *(rev.)* | ✅ app supervision | ✅ | ✅ no place alerts | ❌ | ? | ✅ |
| **Kaspersky Safe Kids** | ✅ can lock the phone | ✅ | ✅ | ✅ | ✅ + place alerts (Premium) | ❌ | ? | ✅ |
| **Bark** | ✅ schedules | ? | ✅ | ◐ blocks listed sites | ✅ | ✅ **reads texts and social media**, alerts on risks | ? | ✅ |
| **Mobicip** | ✅ | ✅ | ✅ + uninstall protection | ✅ | ✅ | ❌ | ◐ uninstall protection | ✅ |
| **FamiSafe** | ✅ | ✅ | ✅ | ✅ | ✅ + place alerts | ? | ? | ✅ |
| **OurPact** | ✅ schedules | ? | ✅ | ✅ | ✅ | ❌ | ? | ✅ |
| **Find My Kids** | ❌ | ❌ | ❌ | ❌ | ✅ + place alerts | ❌ (but **can listen to the phone's microphone**, see §5) | ? | ✅ |
| **TimeLimit** | ✅ | ✅ | ✅ | ❌ | ? | ❌ | ✅ with Device Owner | ◐ |
| **Manara** | ✅ | ✅ | ◐ pause apps, no install approval | ✅ **Private DNS for the whole phone**, locked | ✅ no place alerts | ✅ call history incl. WhatsApp/Messenger (outside-Play build) | ✅ **Device Owner: blocks factory reset, safe boot, new profiles, VPN, DNS change, clock** | ✅ no account lost (ADR-0006) |

## 3. Child on iPhone: what each one does

Apple lets third-party apps control an iPhone only through its Screen Time
interface (FamilyControls, a special permission granted by Apple) or a device
management profile. Full control ("supervised" device) needs the phone
**erased** with Apple Configurator on a Mac [A2]. That's why every
third-party app is weaker on iPhone than on Android.

| Product | Daily limit | Block apps | Website filter | Location | Messages | Weak point on iPhone |
|---|---|---|---|---|---|---|
| **Apple Screen Time** | ✅ by category + daily total | ✅ age limits, schedules | ✅ adult filter or "Ask to Browse" | Via Find My (separate) | ◐ choose who the child talks to; blurs nudity | Built in, the reference on iPhone |
| **Family Link** | ❌ | ❌ | ❌ | ? | ❌ | Google says app management, Chrome filter and time limits **don't apply** to iPhone [G1] |
| **Qustodio** | ✅ | ◐ only cuts the app's internet *(rev.)* | ◐ VPN, can be got around | ✅ | ◐ needs a Mac/PC linked | Weaker than Android |
| **Norton Family** | ◐ **only a notification** that time is up *(rev.)* | ❌ | ◐ a separate browser | ✅ | ❌ | Weak |
| **Kaspersky Safe Kids** | ◐ warning only, can't lock *(rev.)* | ◐ by age rating only | ◐ limited | ✅ | ❌ | Weak |
| **Bark** | ✅ | ✅ | ✅ | ✅ | ◐ needs Bark Sync ($49/yr extra) or a computer [B1] | Sold only in US/ZA/AU |
| **OurPact** | ✅ | ✅ **hides apps** (management profile) | ✅ VPN | ✅ | ◐ Premium+ | On iOS 26 the child can remove it (the parent is alerted) *(rev.)* [O1] |
| **Mobicip** | ✅ | ✅ | ✅ | ✅ | ◐ social media monitor | ? |
| **Manara** | ❌ | ❌ | ❌ | ❌ | ❌ | No iPhone version. The no-reset Device Owner approach doesn't exist on iOS |

## 4. What matters for Tunisia

| Factor | Finding | Status |
|---|---|---|
| Family Link | Parent app not available on Play in Tunisia; the website works | Known (checked on a phone) |
| Bark | Not sold in Tunisia | Known [B1] |
| Kaspersky | Has an African (French) site; most likely the most available commercial app | Likely |
| Paying in dollars | Paying a foreign subscription needs an international card. Mobicip refuses debit and prepaid cards. Tunisian bank cards are often local only. **To confirm with parents** | Hypothesis |
| Language | Family Link, Screen Time, Samsung and Microsoft are in Arabic and French. Manara is English only | Known |
| Phones | Mostly Android, often Samsung (developer's estimate). Count in interviews | Hypothesis |

## 5. Ethics: products Manara should never copy

- **Find My Kids** lets the parent listen through the child's microphone for up to 5 minutes ("Sound Around") *(rev.)* [FK1]. That's audio surveillance. Manara's rule (ADR-0001): visible monitoring only, never audio.
- **Bark** reads the content of texts and social media. Manara's call history records only number, time and length, shows it on the phone, and never captures content (ADR-0008).

## 6. Where Manara stands

| | Who's stronger | Why |
|---|---|---|
| **Price** | Family Link, Screen Time, Microsoft, Samsung (free) | Manara must justify a price against free |
| **Language and trust** | Built-in tools | Arabic/French, a known brand, already on the phone |
| **Hard to get around on Android** | **Manara** | Only Manara and TimeLimit/kid-phone-server use Device Owner; Manara also blocks reset, safe boot, profiles, VPN and DNS |
| **Website filter on the whole phone** | **Manara**, Qustodio, Kaspersky | Family Link: Chrome only. Microsoft: Edge only |
| **Phone already in use** | **Manara** | Family Link removes other accounts. Other Device Owner tools need a reset |
| **Content monitoring** (messages, AI alerts) | Bark, Qustodio | A choice Manara rejects (ADR-0001/0008) |
| **iPhone** | Apple Screen Time, OurPact | Manara has nothing. Apple's own tool is free and good |
| **Sold in Tunisia, paid locally** | Possibly **Manara** | If dollar payment really is a barrier, a local price in dinars is an advantage. To confirm |

**In short:** on Android, Manara's real edge is "hard to get around, on a phone already in use, without losing accounts". The commercial apps don't offer it, and Family Link is weak there. On iPhone, Manara has no edge: point parents to Apple Screen Time. The biggest gaps aren't features, they're **Arabic/French** and **trust**.

## Sources

Fetched 2026-11-10. *(rev.)* = independent review, not the vendor.

- [G1] Family Link FAQ: <https://families.google/familylink/faq/>
- [G2] Family Link website filters: <https://support.google.com/families/answer/7087030?hl=en>
- [G3] Family Link, signing a child in (user profiles): <https://support.google.com/families/answer/7158477?hl=en>
- [G4] Family Link consent and requirements: <https://support.google.com/families/answer/9499456?hl=en>
- [A1] Apple, parental controls with Screen Time: <https://support.apple.com/en-us/105121>
- [A2] Apple, device supervision: <https://support.apple.com/guide/deployment/about-device-supervision-dep1d89f0bff/web>
- [S1] Samsung, family groups and parental controls: <https://www.samsung.com/us/support/answer/ANS10002400/>, Samsung Kids: <https://www.samsung.com/us/support/answer/ANS10003300/>
- [M1] Microsoft Family Safety: <https://www.microsoft.com/en-us/microsoft-365/family-safety>
- [M2] Microsoft Q&A, location removed: <https://learn.microsoft.com/en-us/answers/questions/5539126/family-safety-location-not-available-on-android>
- [Q1] Qustodio pricing: <https://www.qustodio.com/en/premium/>
- [Q2] *(rev.)* Qustodio, iOS vs Android: <https://www.security.org/parental-controls/qustodio/>, <https://hostadvice.com/parental-control/qustodio-review/>
- [N1] *(rev.)* Norton Family: <https://cybernews.com/best-parental-control-apps/norton-family-review/>, <https://thehightechsociety.com/norton-family-review/>
- [K1] *(rev.)* Kaspersky Safe Kids: <https://www.tomsguide.com/reviews/kaspersky-safe-kids>, <https://www.safetydetectives.com/best-parental-control/kaspersky-safe-kids/>
- [B1] Bark pricing: <https://www.bark.us/pricing/>
- [NN1] *(rev.)* Net Nanny: <https://www.cloudwards.net/net-nanny-review/>, <https://digitalsafetysquad.com/reviews/net-nanny-review/>
- [MO1] Mobicip pricing: <https://www.mobicip.com/pricing>
- [F1] FamiSafe pricing: <https://famisafe.wondershare.com/pricing-plan-new.html>, *(rev.)* <https://cybernews.com/best-parental-control-apps/famisafe-review/>
- [O1] *(rev.)* OurPact: <https://www.bewebsmart.com/parental-controls/our-pact-parental-control-review/>, <https://www.tomsguide.com/reviews/ourpact>
- [FK1] *(rev.)* Find My Kids: <https://timily.app/guides/findmykids-review/>, <https://www.eyezy.com/blog/find-my-kids-review/>
- Open-source rows: [`landscape-comparison.md`](landscape-comparison.md)

## Limits

- Not tested on phones, except Family Link's availability and Manara.
- Prices are US prices; regional prices differ.
- Availability in Tunisia is unknown for most products: check each on Play and the App Store from a Tunisian account.
- Life360 wasn't included: its pages blocked fetching.
