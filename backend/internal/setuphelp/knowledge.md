# What the setup assistant knows

Sources: the parent guide (tools/guidepages.py, controller/public/guide*.html), the console's setup
steps (controller/src/setup.ts, messages/*.ts), docs/enrollment-options.md and
docs/enrollment-xiaomi.md. Keep this file in step with them: when the guide or a setup step
changes, change it here too.

## What Manara is

Manara is a visible parental-control app for Android. It is for a parent's own minor child only.
The child's phone always shows a notice that it is managed, and Manara on it shows which rules
are on. There is no hidden mode. Manara never reads messages, never sees photos and never listens
to calls. Two apps: Manara on the child's phone, and the console (a web page, also installable as
the Manara Parents app) on the parent's own phone or computer.

## Before setup

- Android 11 or newer, on Wi-Fi, charged above 50% or on its charger. No computer or cable.
- About 15 minutes, longer on a Samsung. No app is uninstalled and no app data is lost.
- Samsung: every account is removed for a moment. Xiaomi: the Google account (and Google Meet).
  Other brands are not tested yet. They are signed back in at the end.
- Before starting, the parent checks they can get back in to the phone's Google account without
  its password: a passkey on their own phone, a code by SMS to the recovery phone, or a Family Link
  password reset if they created the account. Manara never sees or stores passwords.
- Back up chats first (WhatsApp: Settings, Chats, Chat backup).
- Samsung: a Secure Folder must be removed first (move anything needed out of it).
- Xiaomi: turn off cloned apps first (Settings, Apps, Cloned apps / "Applications clonées"); the
  clone and its data are deleted, the main app stays. An empty cloned-apps space can still block
  setup.
- Xiaomi: after installing Manara, turn on Autostart ("Démarrage automatique") for Manara and set
  its battery saver to "No restrictions" (Settings, Apps, Manage apps, Manara), or it stops after
  every restart. Also keep the screen awake while charging if the phone offers it (Developer
  options, "Stay awake" / "Rester activé").
- A brand-new phone can use the QR-code way instead, but it ERASES the phone. Never on a phone the
  child already uses.
- Tell the child the phone will be managed, and why.

## The steps

1. Create the parent account in the console (email + password of 8 characters or more).
2. Install Manara on the child's phone from the download page (the console's "+ Add a phone" also
   shows a QR code for it).
3. In the console: "+ Add a phone", confirm the three statements (parent or guardian, child is a
   minor, child will be told), choose "The phone your child already uses".
4. Turn on Wireless debugging: Settings, About phone, tap "Build number" seven times (Xiaomi: "OS
   version"; some Samsungs: Software information, Build number) to unlock Developer options, then
   Developer options, Wireless debugging, ON. If a menu name differs, search for it in Settings.
5. The console shows a connection code (QR and text). On the phone, open Manara, tap "Scan the
   code" or type it.
6. On the phone, tap "Start guided setup" in Manara, then open Wireless debugging. Stay on that
   screen, unlocked and charging: Android stops pairing the moment you leave it.
7. Pair: "Pair device with QR code" on the phone, scanning the code the console shows, or "Pair
   device with pairing code" and type the 6 digits into the console.
8. Setup then runs by itself; the console shows each step:
   - "Wireless debugging paired"
   - "Accounts on the phone checked"
   - "Accounts removed in Settings, if this phone needs it": the console lists them, says how to
     get back in to each, asks the parent to confirm. Then on the phone tap "Open accounts" in
     Manara's notice and remove them. Don't uninstall any app.
   - "Apps that hold an account paused for a few seconds"
   - "Manara made the phone manager"
   - "Paused apps turned back on"
   - "Every account back": sign back in, Google first, from Manara's notice (Google's saved
     passwords bring others back). Apps like Facebook usually come back by themselves. Only the
     accounts the parent wants are needed.
9. Choose "Finish setup" in the console.

## Common problems

- Play Protect blocks the installation: don't change security settings alone; write to us or join
  the founding families and we install it together on a call.
- Stuck on pairing: the phone must stay on the Wireless debugging screen until pairing is done.
  Open it again, choose the QR code or the pairing code again, try once more. Phone and console
  both online. Codes expire quickly: use a fresh one.
- Wireless debugging turns itself off: it needs Wi-Fi; it turns off when Wi-Fi changes or the
  phone sleeps. Charger plugged in, screen on.
- "Build number" not found: search Settings for "Build number" or "OS version".
- The phone restarted during setup, before "Manara made the phone manager": setup stops (the
  console says so). Paused apps stay paused until setup runs again. Open Manara and start guided
  setup again; accounts already removed stay removed. After "manager", a restart is fine: setup
  resumes.
- Android refuses because accounts remain (Samsung counts every account, even from paused apps):
  remove every account the console still lists under "Still on the phone", then the list updates
  by itself. On Samsung, also Samsung account and work or school accounts.
- "Every account back" stays "Not yet" on some phones (Xiaomi HyperOS) even after signing in: the
  parent can still choose "Finish setup".
- Console says "Finishing..." for a long time: the phone may be off; the server finishes by itself.
- The phone shows "Not reporting": it hasn't checked in for 2 hours. Check it is on and online;
  open Manara, tap "Check now". Allow Manara to run without battery restrictions (Xiaomi: also
  Autostart).
- Can't get back in to the Google account: use Google's account recovery (passkey, SMS code to the
  recovery phone, or Family Link reset). Manara cannot recover it. This is why the check before
  setup matters.
- Forgot the console password: "Forgot your password?" on the sign-in page; the link works one
  hour.
- Anything else: write to nabil.bsalah0@gmail.com, or ask to join the founding families for a
  setup call.

## Console labels in French and Arabic

Quote the console's own words in the parent's language:
- "Not reporting": French "Silencieux", Arabic "لا يرسل تقاريره".
- "Not yet": French "Pas encore", Arabic "ليس بعد".
- "Finish setup": French "Terminer l'installation"; "+ Add a phone": French "+ Ajouter un téléphone".
- Android's own menus, French: "À propos du téléphone", "Numéro de version", "Options pour les
  développeurs", "Débogage sans fil", "Associer l'appareil avec un code QR", "Associer l'appareil
  avec un code d'association". Arabic: "حول الهاتف"، "رقم الإصدار"، "خيارات المطوّر"، "تصحيح
  الأخطاء اللاسلكي". Menus can be worded a little differently by brand: say to search Settings.

## After setup (short)

Every rule is off until the parent turns it on, in the phone's page: Rules (adult sites, ads,
family values, social media and games budgets, bedtime, keep the rules on, more options), What you
see (location, app usage, calls, apps installed), This phone (name, color, remove Manara). Bedtime
keeps calls, texts, WhatsApp, Quran apps, the clock and Settings working. Removing Manara is done
from the console only ("Remove Manara from this phone", or "Show release code" if the phone can't be
reached).
