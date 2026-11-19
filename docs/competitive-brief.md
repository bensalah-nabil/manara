# Competitive brief: Manara in Tunisia

Refreshed 2026-11-17, second pass the same day, using the Product Management
plugin's `competitive-brief` method
([anthropics/knowledge-work-plugins](https://github.com/anthropics/knowledge-work-plugins/tree/main/product-management)).

- **Builds on:** [`market-study.md`](market-study.md) (2026-11-10) and
  [`validation.md`](validation.md). It doesn't repeat their tables.
- **Scope:** full product comparison; Android, Tunisia, parents.
- **Decision this informs:** **product priorities**, meaning what to build,
  what to match and what to skip next.

**What the second pass changed:**

- The INT decision, read in its own Arabic text instead of a press report.
- Kidcare's downloads, payment options and app languages.
- Kaspersky's price in Tunisian shops.
- Which phone brands Tunisians use.
- Google's 2026 moves.
- What Manara itself has shipped since 2026-11-10.

**Labels.** *Known* and *Hypothesis* mean the same as in `validation.md`.
Ratings: **Strong**, **Adequate**, **Weak**, **Absent**, or **?** when no
source checked says either way. Nothing below was tested on a phone except
Manara.

## 1. What changed since the market study

| Finding | Why it matters for priorities | Source |
|---|---|---|
| **The INT obliges every internet provider to offer parental controls.** Décision n° 11 du 10 juin 2026, in force one month after providers are notified. Basic tools must be **free and built into the home box**: a blacklist, a list of connected devices, per-device hours, a protected admin page. Providers must also **provide or propose "advanced" solutions: apps or platforms** with user profiles, **filtering by content category**, monitoring of time spent, **alerts** and **activity reports**. If paid, the price goes on the internet bill, and the subscriber can cancel at any time. | Free network filtering becomes the baseline every family has at home. The "advanced" chapter is a written buyer's list, and Manara meets most of it but not category filtering (§4). | [INT1] (text, read 2026-11-17) |
| **Kidcare is bigger than it looked:** **50k+ downloads** (parent app), 10k+ (child app). Pays by card, **Konnect**, or **cash on delivery**. | It's the incumbent local paid app, not a fringe one. | [K1][K2][K3] |
| **Kaspersky Safe Kids is sold in Tunisian shops:** 59 TND a year for one device, or included in Kaspersky Premium (3 devices, ~93 TND), which also brings an antivirus. | A second competitor priced in dinars, with a known brand and retail shelves. | [KA1][KA2] |
| **Phones in Tunisia, August 2026** (share of mobile web traffic): Samsung 24%, Apple 17%, Xiaomi 15%, Oppo 12%, Infinix 9%. Android 82.5%. | Manara is verified on Samsung only, which is about 29% of Android traffic. Xiaomi, Oppo and Infinix together are more. | [SC1] |
| **Google:** Android 17 brings built-in parental controls in Settings, behind a PIN (limits, app blocking, Play content), "expanding across Android devices". Family Link shares a child's age range with apps (Oct 2026). "Family Hub" is spotted in Play services, not launched. | The free default moves into the phone itself, without the parent app that Tunisia's Play store lacks. Watch whether it reaches Android 14–16 phones. | [G1][G2][G3] *(press, verify)* |
| Law 2004-63 attaches criminal penalties to children's data, transfers abroad and undeclared processing. | Same for every competitor. Done properly, it's a trust signal: Kidcare claims "reconnue par l'INPDP" (not verified). See [`pia-call-history.md`](privacy/pia-call-history.md). | [L1] |

**Manara since 2026-11-10** [repo, `git log`]:

- **Built, not yet seen on a phone:** Arabic and French (P1); a presentation
  page for parents with an advert video; a prayer-times chart (part of P14);
  a shorter enrollment (E-1 to E-3).
- **Shipped:** two-step sign-in (optional since 2026-11-19); a release interrupted
  halfway now finishes by itself.
- **Not built yet:** the block screen (D2), calling the parent from a locked
  phone (P2), weekly report (P8), place alerts (P5), app approval (P6).

## 2. The competitive set

| Level | Who | Note |
|---|---|---|
| **Direct** | Kidcare; Kaspersky Safe Kids; Google Family Link | Two of the three are now sold in dinars |
| **Indirect** | The free controls in every home box (INT decision n° 11) | Home Wi-Fi only; mobile data goes around them |
| **Adjacent** | Operators' "advanced" offers under chapter 3 of the decision; Android 17's built-in controls; Samsung (Galaxy for Families: available in Tunisia? not found) | The likely new entrant is an operator plus a partner app |
| **Substitute** | Doing nothing; taking the phone away | Still probably the biggest (validation §4) |

## 3. Competitor profiles

### Kidcare: the local incumbent

- **Who:** App Store seller "Alenatea", "© NNA ressources"; the website footer
  says "Childsafe". Tunisian. [K1][K2]
- **Says:** "La toute première application de contrôle parental en Tunisie";
  "L'application leader de contrôle parentale en Tunisie"; "approuvée par
  Google Sécurité"; "reconnue par l'INPDP". [K1][K2]
- **How it controls the phone:** the Kidcare Jr child app uses the
  **Accessibility Service** and **device administrator**, according to its
  own Play listing. It doesn't use device owner. [K3]
- **Features:**
  - time limits that lock the phone; scheduled block; app blocker;
  - live location, place alerts, location history;
  - category web filter; activity reports;
  - **YouTube, TikTok and Instagram history** (posts, followed accounts,
    searches) and browsing history. [K3]
- **Price:** 19 TND/month, 39 TND/quarter, 99 TND/year, any number of devices,
  7-day trial. [K2]
- **Languages:** French listing and site; the site has an Arabic option. That
  the **app** itself is in Arabic was not confirmed. [K1][K2]
- **Traction (Play, Tunisia, 2026-11-17):** parent app **50k+ downloads,
  4.2★ from 119 reviews**; Kidcare Jr **10k+, 3.4★ from 93**. [K3] The iPhone
  parent app was last updated in 2025. [K1]
- **What reviewers say:**
  - "Trop de bugs! la localisation n'est pas fiable… j'ai payé une année mais
    je vais désinstaller"
  - "l'application déconnecte à chaque fois seule… le payement en ligne n'est
    plus fonctionnel"
  - "L'accessibilité ne fonctionne pas pour un smartphone infinix S50… le
    verrouillage des applications ne se fait pas instantanément sur Redmi"
  - Praise: support, and "**les enfants peuvent toujours appeler, ce qui
    rassure**".
- **Not verified:** an "invisible mode", which appears only in a third-party
  APK site's summary, not in Kidcare's own listing.

**Strengths:**

- local, and accepts cash and Konnect;
- installed from Play;
- broad feature list;
- support that reviewers praise;
- 50k+ downloads, which shows Tunisian parents pay.

**Weaknesses:**

- reliability, from its own reviews: location, disconnections, Infinix and Redmi;
- Accessibility-based enforcement, the kind phone makers' battery savers
  interfere with and children learn to get around (*Hypothesis* for Kidcare
  specifically);
- reads the child's social media history;
- a 3.4★ child app.

### Kaspersky Safe Kids: the known brand on the shelf

- **Price in Tunisia:** 59 TND a year, one device, at Scoop's shops. About 93
  TND for Kaspersky Premium (3 devices, antivirus plus Safe Kids) at
  Tunisianet. [KA1][KA2]
- **On Android, per market-study §2 (reviews, not tested):** daily limit that
  can lock the phone, per-app limits, app blocking, web filter, location with
  place alerts (Premium). Resistance to getting around it: unknown.
- **Strengths:** a security brand parents have heard of; sold in electronics
  shops next to the phone; bundled with an antivirus.
- **Weaknesses:** priced per device; foreign; banned in the US since 2024,
  which matters little in Tunisia.

### Google Family Link and Android's built-in controls

Covered in validation §3. New: Android 17 puts limits and app blocking in
Settings behind a PIN, with no parent app needed. That removes the main
Tunisian obstacle, the parent app missing from Play. Which phones get it,
and when, is unknown. [G1][G2]

### Home-box controls (every provider)

Mandatory and free under decision n° 11, chapter 1: a blacklist, connected
devices, per-device hours. Ooredoo and Orange already had versions of it.
[INT1][ISP1][ISP2]

## 4. Comparison on what Tunisian parents weigh

Rows follow validation §2's problems and the INT's "advanced" list. Manara's
ratings come from its code and phone tests, **with no real family yet**.

| Capability | Why it matters | Manara | Family Link | Kidcare | Kaspersky | Home box |
|---|---|---|---|---|---|---|
| **Child can't get around it** (reset, safe mode, new user, VPN, DNS) | Problem #3, Manara's core bet | **Strong**: device owner, phone-verified; no child has tried | Weak: new profiles escape | Weak: Accessibility + admin; failures reported | ? | Weak: mobile data |
| **Works on the brands Tunisians have** | Samsung is only ~29% of Android | Weak: Samsung only | Strong | Adequate: complaints on Infinix, Redmi | ? | Strong |
| **Phone already in use** | ~80% of target phones | Strong on Samsung (ADR-0006) | Weak: remove other accounts | Strong | Strong | Strong |
| Daily and per-app limits, bedtime | Core need | Adequate | Strong | Adequate | Adequate | Weak: hours only |
| **Filter by category** | Named in INT chapter 3 | Weak: one chosen family DNS host, no categories | Weak: Chrome only | Adequate | Adequate | Weak: blacklist only |
| **Alerts and activity reports** | Named in INT chapter 3 | Adequate: problem alerts; weekly report not built (P8) | Adequate | Adequate | Adequate | Absent |
| **Locked child can still call** | Praised in Kidcare's reviews | Absent: `lockNow()` allows emergency calls only (P2) | Adequate | Strong (a reviewer's words) | ? | n/a |
| Block screen that says why | Teen acceptance | Absent (D2) | Adequate | ? | ? | n/a |
| Location with place alerts | Common ask | Weak (P5) | Strong | Strong on paper, unreliable in reviews | Adequate (Premium) | Absent |
| Approve or block apps | Common ask | Weak: pause only (P6) | Strong | Adequate | Adequate | Absent |
| Arabic | Problem #4 | Adequate: built, not seen on a phone | Strong | ? (site only) | ? | ? |
| Parent sets it up alone | Problem #2 | Weak: Wireless debugging step; shorter flow built, unmeasured | Adequate | Strong: two apps and a code | Strong | Weak: router page |
| Price and payment | Barrier | Free (P0) | Free | 99 TND/yr; card, Konnect, cash | 59 TND/yr per device; in shops | Free with the box |
| Someone to call | Problem #4 | Weak: one developer | Weak | Adequate | Adequate: retailer | Adequate: operator shops |
| Child sees what's collected | Teen acceptance | **Strong** (ADR-0001) | Adequate | ? | ? | n/a |
| Trust and install | Problems #2, #4 | Weak: unknown; call history sideloaded; Play test not started | Strong | Adequate: Play, 50k+ | Strong: brand | Strong: the operator |

**Honest reading.** Manara clearly wins one row, "can't get around it", and
only on Samsung. Kidcare and Kaspersky beat it on setup, payment, support and
trust today. The two new rows that cost Manara most are **brand coverage**
and **calling the parent from a locked phone**: one is a test gap, the other
a known missing feature that parents demonstrably value.

## 5. Positioning

| | Positioning (template: *for [who] who [need], X is a [category] that [benefit]*) |
|---|---|
| Family Link | For any Android family, the free control from Google, moving into the phone's own Settings. |
| Kidcare | For Tunisian parents who want total control, the local app that watches location and social media, in dinars, cash accepted. |
| Kaspersky | For families who already trust a security brand, parental control in the antivirus box on the shop shelf. |
| Home box | For every subscriber, free network controls, now required by law. |
| **Manara (proposed)** | For Tunisian parents whose child gets around limits, on the phone the child already uses, Manara is the control **the child can't switch off and can always see**. Unlike Kidcare, it never reads the child's social media. Unlike the box, it works on mobile data. In Arabic, free. |

- **Unclaimed:** "your child sees what you see"; "can't be switched off, even
  on mobile data"; a parental app confirmed in Arabic.
- **Crowded:** "sécurité en ligne", "tranquillité d'esprit", "contrôle total".
- **Vulnerable claims, Kidcare's:** "leader" against a 3.4★ child app;
  "approuvée par Google Sécurité" and "reconnue par l'INPDP" if they can't be
  shown.

## 6. Opportunities

1. **INT chapter 3 is a written buyer's list.** Operators must provide or
   propose an app with profiles, category filtering, time monitoring, alerts
   and reports, and may bill it on the subscription. Manara already has
   profiles (several children), time monitoring and problem alerts. **Category
   filtering and reports** are the gap.
2. **The home box can't reach mobile data; Manara can.** That is the one
   sentence to say to an operator.
3. **Reliability on non-Samsung phones is Kidcare's visible weak spot.**
   Device owner doesn't depend on Accessibility. But the edge only exists once
   Manara is verified on Xiaomi, Oppo and Infinix.
4. **Arabic** stays unclaimed by the paid local apps, as far as found.
5. **Teens in conflict (segment b):** transparency against Kidcare's social
   media history. *Hypothesis:* ask in interviews.

## 7. Threats

- **Nightmare:** an operator meets chapter 3 by bundling Kidcare or Kaspersky,
  billed on the invoice and set up in its shops. Manara is then shut out of
  the channel while the decision is new. *Hypothesis:* security vendors
  commonly sell such white-label deals to operators. [model knowledge, verify]
- **Android 17's built-in controls** make the free default easier, and remove
  the "parent app not on Play in Tunisia" barrier.
- **Legal:** the gaps in [`pia-call-history.md`](privacy/pia-call-history.md) carry
  criminal penalties and cover all of Manara's data, not only calls.
- **Price anchors:** 59–99 TND a year show that parents pay. Free (P0) needs
  grants, and grants need an organisation and usage numbers (validation §9).
- **Most exposed:** setup and trust. An unknown name, a Wireless debugging
  step and a sideloaded build stand against "install from Play, type a code" or
  "buy it at the shop".

## 8. Product priorities

Today's order (roadmap decision 4) is P3 → P1 → P14 → D2 → P2 → P8 → C5 + D3 →
P4 → P5 → P6. This brief changed it as follows. **Applied 2026-11-17** as
roadmap decisions 6–8, with one difference: D2 goes before P2 there, because
it is smaller.

**Before any family outside the developer's own (not code)**

1. **Legal gate:** the lawyer and the INPDP steps in the PIA. Hosting in
   Tunisia is an option if transfer authorization is impractical.

**Build or verify next, in this order**

2. **P3, then see P1 on a phone.** Unchanged. Arabic is the clearest
   unclaimed position, and it isn't real until seen.
3. **Verify on Xiaomi, Oppo and Infinix** (pending #4). This moves up from
   "a borrowed phone, someday". Those three brands outweigh Samsung, and they
   are exactly where Kidcare's reviewers complain. Without it, "can't get
   around it" holds for under a third of Android phones.
4. **P2, a locked child can call the parent: move it ahead of P14.** Kidcare's
   reviewers name it as reassuring, and today Manara's lock allows emergency
   calls only. It's both a safety gap and a selling point.
5. **D2, the block screen.** Unchanged, small, needed by every pause.
6. **P8, weekly report, plus category filtering.** Both are on the INT's
   "advanced" list, and Kidcare and Kaspersky have both. Category filtering
   needs a design first: today the parent picks one family DNS host. *Not
   decided:* how to offer categories without sending the child's lookups to a
   new third party.
7. **P14, prayer-time pause:** keep it for the regional advert. No competitor
   has it, but it is still a *Hypothesis*; it shouldn't delay 3–6.

**Match, don't try to win:** P5 place alerts and P6 app approval. Every
direct competitor has them, and parents compare lists.

**Don't build:**

- **Social media or browsing history.** It breaks ADR-0001's spirit and Play
  policy, and transparency is the better position.
- **An iPhone app** (17% of phones). P13's Screen Time guide is the right size.

**Go-to-market, alongside the code:**

- One page for Ooredoo, Orange and Tunisie Telecom: chapter 3's list, what
  Manara covers today, mobile data, Arabic.
- Ask the operators whether chapter 3 covers their mobile plans. The decision
  ties the free tools to the home box; the advanced chapter doesn't say.

**Add to the interviews (validation §7):**

- "Have you used Kidcare, Kaspersky, or your box's parental control?"
- "Which brand is your child's phone?"
- "Has your child needed to call you while the phone was locked?"

**Watch, monthly:** Kidcare's reviews, version and prices; operators' chapter 3
offers; Android 17's controls reaching phones sold in Tunisia; bill 095/2025.

## 9. Statements in other docs this makes stale

- **market-study §6, "Sold in Tunisia, paid locally: possibly Manara":**
  Kidcare (99 TND) and Kaspersky (59 TND) already are.
- **market-study §1, Kaspersky "Sold in Tunisia: Likely":** *Known*, sold in
  shops.
- **market-study §1 and validation §3, "English only":** P1 was built on
  2026-11-10, not yet seen on a phone.
- **validation §4, "Still to check: … mobile operators' offers":** answered by
  decision n° 11 and §3 above. Tunisie Telecom's own offer was not found.
- **validation §9(a), "Samsung only (pending #4)":** now weighted. Samsung is
  about 29% of Android traffic in Tunisia.
- **This brief's first version, earlier today:**
  - "Kidcare: French only": the site has Arabic; the app is not confirmed.
  - "INT decision known from a press report": now read in its text.

## Sources

Read 2026-11-17 unless stated.

- [INT1] INT, Décision n° 11 du 10 juin 2026 (Arabic, scanned; chapters 1, 3 and 5 read): <https://www.intt.tn/upload/txts/fr/dec_11.pdf>, listed at <https://www.intt.tn/fr/txt_decisions.php>. Press: <https://www.lapresse.tn/2026/10/05/protection-des-enfants-sur-la-toile-vers-ladoption-de-nouvelles-mesures-de-controle-parental/>, <https://www.webdo.tn/fr/actualite/national/controle-parental-de-nouvelles-regles-pour-les-fournisseurs-internet/405039/>, <https://managers.tn/2026/10/07/le-ministere-serre-la-vis-sur-certains-usages-dinternet-pour-les-tunisiens/>
- [K1] Kidcare, App Store (Tunisia): <https://apps.apple.com/tn/app/kidcare-contr%C3%B4le-parental/id6468487227>
- [K2] Kidcare website and plans: <https://kidcare-app.com/>, <https://kidcare-app.com/plans-tarifs/>
- [K3] Kidcare and Kidcare Jr on Google Play (gl=TN): <https://play.google.com/store/apps/details?id=com.kidcare>, <https://play.google.com/store/apps/details?id=com.kiddcarejr.app>
- [KA1] Kaspersky Safe Kids, 1 device, 1 year, 59 TND: <https://www.scoop.com.tn/14652-antivirus-kaspersky-safe-kids-1poste-abonnement-1-an.html>
- [KA2] Kaspersky in Tunisia, Premium 3 devices 93 TND: <https://www.tunisianet.com.tn/388_kaspersky>, <https://primini.tn/prix/192467/anti-virus-kaspersky-premium-3-poste-1-an>
- [SC1] Statcounter, mobile vendor share, Tunisia, August 2026 (web traffic, not sales): <https://gs.statcounter.com/vendor-market-share/mobile/tunisia>; OS share: <https://gs.statcounter.com/os-market-share/mobile/tunisia>
- [G1] *(press, verify)* Android 17 parental controls: <https://www.deccanherald.com/technology/fathers-day-2026-key-things-you-should-know-about-googles-parental-controls-on-android-phones-4046443>, <https://www.storyboard18.com/brand-makers/-101735.htm>
- [G2] Google Play, October 2026 (age-range sharing via Family Link): <https://blog.google/products-and-platforms/platforms/google-play/google-play-updates-october-2026/>
- [G3] *(press, verify)* Family Hub: <https://www.techrepublic.com/article/news-google-android-family-hub-settings/>
- [ISP1] Ooredoo, parental control guide: <https://www.ooredoo.tn/Personal/fr/content/827-guide-dactivation-du-controle-parental>
- [ISP2] Orange Tunisie, parental control: <https://www.orange.tn/controle-parental>
- [L1] Loi organique 2004-63, French text: <https://www.ins.tn/sites/default/files/2020-04/Loi%2063-2004%20Fr.pdf>
- [L2] *(web search, verify)* Bill 095/2025: <https://www.webmanagercenter.com/2026/02/23/562193/tunisie-vers-un-nouveau-cadre-legal-pour-renforcer-la-protection-des-donnees-personnelles/>, <https://businessnews.com.tn/2026/02/27/donnees-personnelles-le-parlement-se-penche-sur-la-modernisation-de-la-legislation-tunisienne/1390118/>
- Everything else: [`market-study.md`](market-study.md), [`validation.md`](validation.md), this repository's `git log` and `roadmap.md`

## Limits

- **The INT decision** was read from a scan. Page 1 (the preamble) wasn't
  read, and the reading of pages 2–5 is a working translation, not a
  certified one.
- **Not verified:** Kidcare's INPDP status, its "invisible mode", and whether
  its app is in Arabic; Galaxy for Families in Tunisia; Kaspersky's resistance
  to being got around.
- **Statcounter** measures web traffic by device, not phones sold or
  children's phones.
- **Kidcare's reviews:** three per app were read; the ratings are Play's
  averages.
- **Shelf life:** chapter 3 offers will appear over the coming months.
  Re-check §1 and §7 monthly.
