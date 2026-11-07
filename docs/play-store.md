# Publishing the Android app on Google Play

What the app already does for Play, what has to be filled in by hand in Play
Console, and the risks still open. Checked against Google's pages on
2026-11-07; recheck the policy links before each submission.

## Done in the app

| Requirement | Where |
|---|---|
| Target API 36 (required for new apps since 2026-08-31) | `agent/app/build.gradle.kts` |
| `isMonitoringTool` = `child_monitoring` in every version | `AndroidManifest.xml` (`<meta-data>` under `<manifest>`, as [Play Help](https://support.google.com/googleplay/android-developer/answer/12955211) shows) |
| Persistent notice while managed; a separate one while location is shared | `ManagedNoticeService`, `location/LocationSharing.kt` |
| A unique icon that identifies the app | `res/mipmap-anydpi-v26/ic_launcher.xml`, status-bar `ic_stat_manara` |
| In-app disclosure of what is collected | Managed screen, "What your parent can see" |
| Privacy policy, linked in the app and the console | `controller/public/privacy.html` → `https://manara-front.netlify.app/privacy.html` |
| No cleartext traffic in a release build; R8 shrinking; signed with an upload key | `build.gradle.kts` |
| Limited retention for everything collected | `backend/internal/domain/event.go` (`RetentionFor`) |
| `minSdk` 30, so Play only offers the app where guided setup works | `build.gradle.kts` |

The platform attribute `android:isMonitoringTool="parental_control"` from the
[manifest reference](https://developer.android.com/guide/topics/manifest/application-element)
isn't in the API 37 SDK's `android.jar`, so it can't be compiled yet; the Play
`<meta-data>` is what Play review checks.

## Build a release

```
cd agent
./gradlew.bat bundleRelease -PMANARA_API_URL=https://manara-api-pvu4.onrender.com/api/v1 -PMANARA_VERSION_CODE=1 -PMANARA_VERSION_NAME=1.0.0
```

Output: `app/build/outputs/bundle/release/app-release.aab` (upload this) and,
with `assembleRelease`, a signed APK for direct download.

- **Every upload needs a higher `MANARA_VERSION_CODE`.**
- **Upload key:** `%USERPROFILE%\.manara\manara-upload.jks`, alias
  `manara-upload`; passwords are in `agent/local.properties` (git-ignored).
  Back both up somewhere safe. With Play App Signing (the default), Google
  holds the app-signing key and a lost upload key can be reset through Play
  support, but it takes days.
- Without the keystore settings, the release build is left **unsigned**,
  never signed with a debug key.

## Play Console: by hand

1. **Developer account.** A personal account created after 2023-11-13 must
   run a **closed test with at least 12 testers opted in for 14 days in a row**
   before applying for production
   ([source](https://support.google.com/googleplay/android-developer/answer/14151465)).
   Start the closed test as early as possible.
2. **App content → Privacy policy:** `https://manara-front.netlify.app/privacy.html`.
   Operator: Nabil Ben Salah (Tunisia), contact nabil.bsalah0@gmail.com; use the
   same contact in the store listing.
3. **App content → Data safety** (matches the privacy policy):
   - Collected: email address (account), precise location (optional, parent
     turns it on), app interactions / app usage (installed-app usage minutes),
     device or other IDs (push token).
   - Not collected: messages, photos, contacts, calls, web history, audio, files.
   - Shared with third parties: no. Sold: no. Encrypted in transit: yes.
   - Users can request deletion: yes (contact email; see "Still open").
4. **App content → Target audience:** 18 and over. The app is for parents;
   the child's phone runs it under the parent's control. Not in the Designed
   for Families programme.
5. **App content → Sensitive permissions and APIs:**
   - *Foreground service, special use* (`ManagedNoticeService`): the
     persistent "this phone is managed" notice the Stalkerware policy requires.
     (`SetupService`): guided setup, started by the user, stops when done.
   - *Background location* (`ACCESS_BACKGROUND_LOCATION`): location sharing the
     parent turns on, for their child's safety, with its own notice the whole time
     it is on and a line on the managed notice. Fixes go to a receiver at the
     parent's interval (15 minutes or more); no location foreground service.
     Play's location declaration needs a short video of the disclosure.
   - *Usage access* (`PACKAGE_USAGE_STATS`): app time limits and the optional
     usage report; the user grants it in Settings.
   - *Device admin / device owner*: enforcing the parent's rules; the app says
     so on its own screen.
6. **Store listing.** Say plainly that it monitors (Stalkerware policy):
   - Title: `Manara: Parental controls`
   - Short description: `Visible parental controls: screen time, bedtime, location, safe browsing.`
   - Full description (start):
     > Manara lets a parent manage their own child's Android phone, openly.
     > The phone always shows that it is managed and exactly what the parent
     > can see. Set daily app limits, a bedtime lock, family-safe browsing and,
     > if you choose, location sharing and a daily app-usage report.
     > Manara never collects messages, photos, contacts, calls or browsing
     > history. For a parent's own minor child only: never for monitoring
     > another adult.
   - Screenshots: the Connect, Setup and Managed screens, and the console.
7. **Content rating questionnaire:** answer "Yes" to sharing the user's
   location with others; no user-generated content.

## Still open

- **Guided setup and Device and Network Abuse.** Setup opens an ADB
  connection to the phone's own wireless debugging, removes and restores
  apps, and makes Manara device owner. Nothing official allows or forbids
  this. The closed test's review is the first real answer: keep the signed
  APK on the site as the fallback until then.
- **Local network permission.** Android 16 makes local-network access opt-in
  and says it will be enforced in a later release. Guided setup connects to
  the phone's own Wi-Fi address, so it will need the Nearby devices permission
  then ([source](https://developer.android.com/about/versions/16/behavior-changes-16)).
- **Account deletion.** There is no self-service deletion of a parent
  account yet; requests go to the contact email.
- **Release build on a real phone.** The release build hasn't run on a
  phone yet. It can't be installed over a debug build (different signature),
  and a device-owner app can't be uninstalled, so it needs a phone that isn't
  already enrolled, or an emulator.
