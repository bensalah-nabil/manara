# Demo video: setting up the phone in use

Builds the "phone your child already uses" setup video in English, French and
Arabic (`docs/demo-video-script.md`). Everything shown is drawn in HTML with
invented names; no real phone is recorded.

Free tools only:

- pictures: each scene is an HTML page screenshotted by headless Microsoft Edge;
- voice: `edge-tts` (Microsoft's neural voices, `ar-TN-ReemNeural` for Arabic).
  It sends the script's text to Microsoft's speech service;
- assembly: `ffmpeg`, from the `ffmpeg-static` npm package.

Set up once, in this folder:

```
python -m venv tools/venv && tools/venv/Scripts/python -m pip install edge-tts
cd tools && npm init -y && npm i ffmpeg-static && cd ..
```

Then `node make.mjs` (or `node make.mjs fr` for one language). The videos are
written here as `manara-setup-<lang>.mp4`. Edit `scenes.mjs` when a setup
step's wording changes, so the video and the screens say the same thing.
