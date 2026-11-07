# Play Console checklist

The steps to get Manara from a new developer account to a closed test, in
order. Tick them off as you go. The answers for each form (Data safety,
permissions, listing text) are in [`play-store.md`](play-store.md); this page
only says what to do and where.

## Account

- [x] **Trader status:** declared **non-trader** (confirmed 2026-11-07). Manara
  is free, with no ads or payments. Change it in Play Console if that ever
  changes, for example charging for the app or publishing it through a business.
- [ ] **Verification:** if the dashboard asks, verify your identity and sign in
  once from the Play Console app on an Android phone. Do this first; it can
  take a few days.

## 1. Create the app

- [ ] **Home → Create app**
  - App name: `Manara: Parental controls`
  - Default language: English
  - App or game: **App**
  - Free or paid: **Free**
  - Accept the declarations.

## 2. Closed test track

- [ ] **Testing → Closed testing → Create track.**
- [ ] **Upload the bundle:** `agent/app/build/outputs/bundle/release/app-release.aab`
  (version 1, 1.0.0; build it with the command in [`play-store.md`](play-store.md#build-a-release)).
- [ ] **App signing:** keep **Play App Signing** on (the default).

## 3. Testers

- [ ] Add **at least 12 testers**, by email list or Google Group.
- [ ] Send them the opt-in link Play gives you. The **14 days** only start
  counting once 12 testers have opted in, so send it out early.

## 4. App content

Fill each section with the answers in [`play-store.md`](play-store.md#play-console-by-hand):

- [ ] **Privacy policy:** `https://manara-front.netlify.app/privacy.html`
- [ ] **Data safety**. For "Data deletion", answer that users can request
  deletion, with the in-app path (console, Account, Delete your account) and
  the web link `https://manara-front.netlify.app/delete-account.html`. Add
  Brevo (email) to the data shared with service providers: the parent's email
  address, for password reset and alerts.
- [ ] **Target audience:** 18 and over
- [ ] **Sensitive permissions and APIs:**
  - background location, which needs a short video of the disclosure;
  - special-use foreground service;
  - device admin.
- [ ] **Content rating questionnaire**

## 5. Store listing

- [ ] **App icon:** [`play-assets/icon-512.png`](play-assets/icon-512.png)
- [ ] **Feature graphic:** [`play-assets/feature-graphic-1024x500.png`](play-assets/feature-graphic-1024x500.png)
- [ ] **Phone screenshots:** at least 2: Connect, Setup, Managed, and the console.
  Not taken yet.
- [ ] **Title, short and full description:** from [`play-store.md`](play-store.md#play-console-by-hand), step 6.

## Still needed from the phone

The screenshots and the background-location video both come from a run of the
store build on a real phone. The SM-A045F runs it, enrolled with the Render
account (guided setup finished 2026-11-07), so its Home, managed notice and
Chrome rules can be captured from it. The Connect and Setup screens need a
phone that isn't enrolled yet (the A52).

- [ ] **Upload the AAB as version 2 or later**: any build made before
  2026-11-07 can't be woken by a push (R8 removed WorkManager's input merger).

## After 14 days

- [ ] **Apply for production** from the Dashboard, once 12 testers have stayed
  opted in for 14 days in a row.
