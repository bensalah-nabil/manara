# Demo video: setting up the phone a child already uses

The harder of the two ways to add a phone (the console's "The phone your child
already uses"). A parent watches it once before starting, so nothing on the
phone surprises them. The other way (a new or reset phone, one QR code) needs
no video.

## Rules for recording

- **A lab phone with test accounts only.** No real child's phone, name, email,
  photo or notification may appear. Use a Samsung (the hardest case), signed in
  to a test Google account, a test Samsung account and one chat app.
- Turn on Do not disturb, so no notification appears during recording.
- Record the phone with `adb shell screenrecord --bit-rate 6000000
  /sdcard/clip1.mp4`. Each clip stops after 3 minutes, so record one clip per
  scene, and `export MSYS_NO_PATHCONV=1` first. Record the console with the
  Windows Game Bar (Win+Alt+R).
- Setup turns wireless debugging off at its end, which stops a recording over
  wireless adb: record the last scene over USB, or on the phone's own screen
  recorder.
- Keep it under 4 minutes. Voice in Tunisian Arabic, subtitles in French and
  Arabic (and English). One video per language is better than one with three
  subtitle tracks, if time allows.

## Scenes

| # | What is on screen | What the voice says |
|---|---|---|
| 1 | The console, "Which phone are you setting up?", the second choice selected | "Your child's phone stays as it is: nothing is erased. Plan for some time [put the time measured in the usability test here]. Have this ready: the Google password, or your phone that receives its codes, and the Samsung password." |
| 2 | The child's phone: the download page, then Install | "On your child's phone, open the address shown in the console and install Manara. Android warns because it's outside the Play Store: that's expected." |
| 3 | Manara opens, scans the console's code | "Open Manara and scan the code in the console. The console now shows the steps for this exact phone." |
| 4 | Settings, About phone, Software information, tapping Build number seven times, PIN | "This unlocks a hidden menu, Developer options. It's normal, and Manara turns its setting off again at the end." |
| 5 | Developer options, Wireless debugging on, Allow | "Turn on Wireless debugging, then tap Allow." |
| 6 | Pair device with pairing code; the 6 digits typed in the console | "Tap Pair device with pairing code, and type the six digits in the console. Stay on this screen until the console says it's paired." |
| 7 | The console's "how you'll get back in" box; signing in to the test Google account on the parent's phone first | "Before removing anything, check you can get back into Google: sign in on your own phone now. If you can't, stop here and use the new-phone way instead." |
| 8 | The notice's Open accounts; removing the Google, Samsung and chat accounts one by one; the console's list emptying | "Remove each account in the list. No app is uninstalled and nothing is deleted: the apps keep their data. The console's list empties as you go." |
| 9 | The console: "Manara made the phone manager" ticks | "Manara is now set up. Now sign back in." |
| 10 | Add Google account from the notice; sign-in with the code; the others coming back | "Sign in to Google first: its saved passwords bring the others back. Facebook and WhatsApp usually come back by themselves." |
| 11 | The console, Finish setup; the phone's "This device is managed" notice | "Press Finish. Your child's phone always shows this notice: Manara never hides." |

## Where it goes

- In the console, on the "have this ready" box of the second choice: a "Watch
  how it works (4 min)" link.
- Host the file on the console's own site (`controller/public/`, the CSP's
  `default-src 'self'` allows it), not on YouTube: the console allows no
  frames, and a link out loses the parent.
- Also on `decouvrir.html` and the download page.

## Before publishing

Check every frame for a real name, email, phone number or notification.
Re-record after any change to the steps' wording, so the video and the screens
say the same thing.
