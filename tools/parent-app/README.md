# Manara Parents: the console as a Play Store app

The parent console (`controller/`) packaged as an Android app, a Trusted Web Activity (TWA): the
same site, full screen, with its own icon and a Play Store page. Separate from Manara on the
child's phone (`agent/`). Nothing in the console changes: the app opens
`https://manara-rosy.vercel.app/` and stays on that site.

## Done (2026-11-20)

- The console is installable: `controller/public/manifest.webmanifest`, the icons in
  `controller/public/icons/` (made by `icons.mjs` here), and `controller/public/sw.js`, which
  caches no console data, only an offline page. Chrome reports no installability error.
- Parents can already install it from the browser ("Install app" on Android, "Add to Home
  Screen" on iPhone), with no store. Worth showing at the end of each setup call.

## Waiting: the Play Console account

Publishing needs the developer account verified (on standby, `docs/standby.md`). Then, in order:

### 1. Create the app project (once)

Google's Bubblewrap builds the Android project from the live manifest. It needs a JDK 17 and the
Android SDK, both on this PC; it offers to download its own if not found.

```
cd tools/parent-app
npx @bubblewrap/cli init --manifest https://manara-rosy.vercel.app/manifest.webmanifest
```

Answer with these values:

| Question | Answer |
|---|---|
| Domain | `manara-rosy.vercel.app` |
| Start URL | `/?source=app` |
| Application name | `Manara · Parents` |
| Short name | `Manara` |
| Application ID (package) | `com.manara.parents` (never changes once published) |
| Display mode | standalone |
| Status bar colour | `#0e5a43` |
| Splash background | `#0a1511` |
| Icons | `https://manara-rosy.vercel.app/icons/icon-512.png`, maskable `.../icon-maskable-512.png` |
| Notifications | no (none yet; web push is planned after the beta) |
| Signing key | create a new one; keep the `.keystore` file and its passwords **outside the repo** (a password manager), never in git |

### 2. Build and upload

```
npx @bubblewrap/cli build          # writes app-release-bundle.aab
```

Play Console → Create app "Manara Parents" → upload the `.aab` to a closed testing track. Keep
**Play App Signing** on: Google then holds the key that signs what parents install.

### 3. Link the app and the site (Digital Asset Links)

Without this, the app shows a browser address bar. Play Console → the app → Test and release →
App integrity → App signing → copy the **SHA-256 certificate fingerprint** of the app signing key.
Then create `controller/public/.well-known/assetlinks.json`:

```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": { "namespace": "android_app", "package_name": "com.manara.parents",
              "sha256_cert_fingerprints": ["<the fingerprint from Play Console>"] }
}]
```

Deploy, then check `https://manara-rosy.vercel.app/.well-known/assetlinks.json` answers it.

### 4. Closed test, then production

A recent personal account must run a closed test with **12 testers for 14 days** before production
(check whether it applies per app in your Play Console). The founding families are the testers.

## Store listing

| | English | Français | العربية |
|---|---|---|---|
| Title (30) | Manara Parents | Manara Parents | منارة للوالدين |
| Short description (80) | Set your child's phone rules, openly. The parent console for Manara. | Réglez le téléphone de votre enfant, en toute transparence. | اضبط هاتف طفلك بوضوح: لوحة تحكم الوالدين في منارة. |

**Full description (French, the others alike):**

> Manara Parents est la console des parents de Manara, le contrôle parental transparent pour
> Android. Depuis votre propre téléphone, réglez les règles du téléphone de votre enfant : heure du
> coucher (le Coran, WhatsApp et les appels restent ouverts), sites pour adultes bloqués, temps pour
> les réseaux sociaux et les jeux. Recevez les alertes, voyez l'activité, verrouillez le téléphone en
> un geste.
>
> Rien de caché : le téléphone de votre enfant affiche toujours qu'il est géré et ce que vous pouvez
> voir. Manara ne lit jamais les messages, ne voit jamais les photos et n'écoute jamais les appels.
> Pour votre propre enfant mineur uniquement.
>
> Le téléphone de l'enfant utilise l'application Manara, à installer depuis manara-rosy.vercel.app.

**Data safety for this app:** the same as the console: the parent's email address (account) and
what the parent types; no data from this phone itself. Privacy policy:
`https://manara-rosy.vercel.app/privacy.html`.

**Screenshots:** the console at phone width, in French: sign-in, the phone's Rules tab, the
Activity tab, and a setup step (with invented data, as for the videos).
