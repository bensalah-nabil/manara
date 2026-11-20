# Feature videos: what Manara does

Short vertical videos (1080 × 1920, about 50 seconds) for Facebook and Instagram Reels, Stories
and WhatsApp status, one per feature and language (French, Arabic, English):

| Video | What it shows |
|---|---|
| `bedtime` | At night the apps pause; calls, texts, WhatsApp and the Quran stay open; the child sees why; everything comes back in the morning |
| `safe-internet` | Adult sites blocked in Chrome and in apps, Google SafeSearch locked on, the family-values filter, other browsers closed |
| `strangers` | The parent's list of known numbers; an alert when another or a hidden number calls; the call marked in Call history (direct APK only, said in the video) |

Everything shown is drawn in HTML with invented names and numbers; no real phone is recorded. The
child's screens use the app's own wording (`agent/app/src/main/res/values*/strings.xml`) and the
console's rule texts. When a feature or its wording changes, change `scenes.mjs` with it.

Same free tools as [`../demo-video`](../demo-video/README.md): headless Edge for the pictures,
`edge-tts` for the voice (Tunisian Arabic: `ar-TN-ReemNeural`; it sends the text to Microsoft's
speech service), `ffmpeg-static` to assemble. Set them up once as that README says, then point
`TOOLS` at the folder holding `venv/` and `node_modules/`:

```
TOOLS=path/to/tools node make.mjs                  # all nine
TOOLS=path/to/tools node make.mjs bedtime ar       # one
```

The videos and a poster each are written to `out/` (not in git: share them from there, or copy
the ones the site needs into `controller/public`).
