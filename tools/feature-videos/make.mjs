// Builds Manara's feature videos: short, vertical (1080 x 1920), one MP4 per feature and language,
// for Reels, Stories and WhatsApp status. Same free tools as ../demo-video: HTML scenes screenshotted
// by headless Edge, edge-tts for the voice, ffmpeg to assemble.
// Usage: node make.mjs [bedtime|safe-internet|strangers ...] [fr|ar|en ...]
// TOOLS (optional) is the folder holding venv/ (edge-tts) and node_modules/ (ffmpeg-static); see the README.
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import { VIDEOS, VOICES } from './scenes.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const tools = process.env.TOOLS ?? join(here, 'tools')
const require = createRequire(join(tools, 'package.json'))
const FFMPEG = require('ffmpeg-static')
const TTS = join(tools, 'venv', 'Scripts', 'edge-tts.exe')
const EDGE = process.env.CHROME ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'

const PATTERN = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='84' height='84' viewBox='0 0 56 56'%3E%3Cg fill='none' stroke='%23d8b24a' stroke-opacity='.13' stroke-width='1'%3E%3Crect x='16' y='16' width='24' height='24'/%3E%3Crect x='16' y='16' width='24' height='24' transform='rotate(45 28 28)'/%3E%3Ccircle cx='28' cy='28' r='4'/%3E%3C/g%3E%3C/svg%3E"

const CSS = `
* { box-sizing: border-box; margin: 0; }
html, body { width: 1080px; height: 1920px; overflow: hidden; }
body { font: 34px/1.4 'Segoe UI', 'Noto Kufi Arabic', Tahoma, Arial, sans-serif; color: #fffdf8; background: #0e5a43 url("${PATTERN}") repeat; }
.top { position: absolute; top: 70px; inset-inline: 72px; display: flex; align-items: center; gap: 20px; }
.logo { width: 76px; height: 76px; }
.brand { font-weight: 800; font-size: 44px; } .brand span { color: #d8b24a; margin-inline-start: 12px; }
.count { margin-inline-start: auto; color: #cfe3d9; font-size: 32px; }
h1 { position: absolute; top: 200px; inset-inline: 72px; font-size: 76px; line-height: 1.15; font-weight: 800; }
[lang=ar] h1 { line-height: 1.45; font-size: 72px; }
.stage { position: absolute; top: 430px; bottom: 420px; inset-inline: 72px; display: flex; align-items: center; justify-content: center; }
.caption { position: absolute; bottom: 90px; inset-inline: 60px; min-height: 260px; padding: 30px 38px; border-radius: 30px; background: rgba(6, 34, 26, .82); border: 2px solid rgba(216, 178, 74, .45); color: #fffdf8; font-size: 42px; line-height: 1.4; display: flex; align-items: center; }
[lang=ar] .caption { line-height: 1.65; }
.phone { width: 560px; height: 1060px; border-radius: 70px; background: #0b1512; padding: 22px; box-shadow: 0 40px 80px rgba(0,0,0,.45); }
.screen { width: 100%; height: 100%; border-radius: 52px; background: #f7f3ea; color: #1b2a24; overflow: hidden; display: flex; flex-direction: column; position: relative; }
.screen.night { background: linear-gradient(180deg, #0d1b2a, #1b2a3a); color: #e8eef4; }
.bar { height: 60px; padding: 14px 34px; font-size: 26px; display: flex; justify-content: space-between; opacity: .8; }
.grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 34px 10px; padding: 40px 26px; }
.app { display: grid; justify-items: center; gap: 10px; font-size: 22px; text-align: center; }
.ico { width: 96px; height: 96px; border-radius: 26px; display: grid; place-items: center; font-size: 48px; color: #fff; position: relative; box-shadow: 0 6px 14px rgba(0,0,0,.25); }
.app.paused .ico { filter: grayscale(1) brightness(.55); }
.app.paused span { opacity: .5; }
.badge { position: absolute; bottom: -8px; inset-inline-end: -8px; width: 44px; height: 44px; border-radius: 50%; background: #d8b24a; color: #1a1406; font-size: 24px; display: grid; place-items: center; filter: none; }
.app.hl .ico { outline: 6px solid #d8b24a; outline-offset: 4px; }
.dim { flex: 1; display: flex; align-items: center; padding: 30px; background: rgba(0,0,0,.35); }
.dialog { background: #fffdf8; color: #1b2a24; border-radius: 34px; padding: 40px 34px; display: grid; gap: 18px; font-size: 30px; box-shadow: 0 20px 50px rgba(0,0,0,.4); }
.dialog strong { font-size: 36px; }
.notif { margin: 20px 22px 0; padding: 22px 26px; border-radius: 28px; background: #e2efe8; color: #0e3b2c; font-size: 26px; display: grid; gap: 6px; }
.notif strong { font-size: 28px; }
.console { width: 100%; border-radius: 36px; background: #fffdf8; color: #1b2a24; overflow: hidden; box-shadow: 0 30px 70px rgba(0,0,0,.4); }
.chead { background: #0a4634; color: #fffdf8; padding: 20px 30px; display: flex; gap: 12px; align-items: center; font-size: 28px; }
.chead i { width: 16px; height: 16px; border-radius: 50%; background: rgba(255,255,255,.4); }
.chead span { margin-inline-start: 12px; }
.cbody { padding: 34px; display: grid; gap: 24px; font-size: 34px; }
.rule { display: flex; align-items: center; justify-content: space-between; gap: 24px; padding: 26px 28px; border: 2px solid #e5dac3; border-radius: 26px; }
.rule.on { border-color: #0e5a43; background: #e2efe8; }
.rule small { display: block; color: #5b675f; font-size: 26px; margin-top: 6px; }
.switch { width: 96px; height: 54px; border-radius: 27px; background: #c9c2b2; position: relative; flex: none; }
.switch::after { content: ''; position: absolute; top: 6px; inset-inline-start: 6px; width: 42px; height: 42px; border-radius: 50%; background: #fff; }
.switch.on { background: #0e5a43; } .switch.on::after { inset-inline-start: auto; inset-inline-end: 6px; }
.numbers { background: #f6f1e6; border-radius: 22px; padding: 22px 26px; font-size: 30px; line-height: 1.7; }
.chrome { flex: 1; display: flex; flex-direction: column; }
.url { margin: 10px 22px; padding: 16px 24px; border-radius: 40px; background: #e9e4d8; font-size: 26px; color: #5b675f; }
.blockpage { flex: 1; display: grid; place-content: center; justify-items: center; gap: 22px; padding: 40px; text-align: center; }
.blockpage .stop { font-size: 120px; } .blockpage strong { font-size: 40px; } .blockpage p { font-size: 28px; color: #5b675f; }
.gsearch { padding: 20px 26px; display: grid; gap: 22px; }
.gsearch .q { padding: 20px 26px; border-radius: 40px; border: 2px solid #ddd5c4; font-size: 30px; }
.gsearch .safe { justify-self: start; padding: 10px 22px; border-radius: 30px; background: #e2efe8; color: #0e5a43; font-weight: 700; font-size: 26px; }
.result { display: grid; gap: 10px; padding: 14px 0; } .result b { height: 22px; width: 60%; background: #0e5a43; opacity: .35; border-radius: 6px; } .result i { height: 14px; background: #ddd5c4; border-radius: 6px; }
.call { flex: 1; display: grid; justify-items: center; align-content: center; gap: 22px; background: linear-gradient(180deg, #1d3557, #0d1b2a); color: #fff; }
.avatar { width: 200px; height: 200px; border-radius: 50%; background: #64748b; display: grid; place-items: center; font-size: 110px; }
.call strong { font-size: 44px; } .num { font-size: 36px; opacity: .85; }
.callbtns { display: flex; gap: 140px; margin-top: 120px; } .callbtns span { width: 130px; height: 130px; border-radius: 50%; display: grid; place-items: center; font-size: 64px; }
.callbtns .no { background: #dc2626; } .callbtns .yes { background: #16a34a; }
.lock { flex: 1; background: linear-gradient(180deg, #23413a, #0d1b16); color: #fff; padding-top: 80px; }
.clockbig { text-align: center; font-size: 140px; font-weight: 300; margin-bottom: 60px; }
.notif.alert { background: rgba(255,253,248,.95); }
.notif.alert small { color: #0e5a43; font-weight: 700; }
.hist { display: grid; grid-template-columns: auto 1fr auto; gap: 18px; align-items: center; padding: 20px 6px; border-bottom: 2px solid #eee6d4; font-size: 30px; }
.hist em { font-style: normal; font-size: 24px; font-weight: 700; color: #9a5a00; background: #fdf1dc; padding: 6px 16px; border-radius: 20px; }
.cta { text-align: center; display: grid; justify-items: center; gap: 30px; }
.cta .mark { width: 170px; height: 170px; border-radius: 50%; background: #d8b24a; color: #1a1406; display: grid; place-items: center; font-size: 100px; font-weight: 800; }
.cta h2 { font-size: 80px; } .cta p { font-size: 40px; color: #f3e3b0; }
.cta .link { font-size: 40px; padding: 22px 40px; border-radius: 60px; background: #fffdf8; color: #0e5a43; font-weight: 800; }
.cta small { font-size: 28px; color: #cfe3d9; }
`

const LOGO = '<svg class="logo" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#fffdf8"/><path d="M13 13h6l1.6 14h-9.2z" fill="#0e5a43"/><path d="M12.5 9.5h7v3.5h-7z" fill="#d8b24a"/><path d="M16 5l4 4.5h-8z" fill="#0e5a43"/></svg>'

function page(lang, n, total, scene) {
    return `<!doctype html><html lang="${lang}" dir="${lang === 'ar' ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><style>${CSS}</style></head><body>
<div class="top">${LOGO}<div class="brand">Manara<span lang="ar">منارة</span></div><div class="count" dir="ltr">${n} / ${total}</div></div>
<h1>${scene.title}</h1>
<div class="stage">${scene.stage()}</div>
<div class="caption">${scene.say}</div>
</body></html>`
}

function run(cmd, args) {
    return execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] }).toString()
}

function duration(file) {
    try { run(FFMPEG, ['-i', file]) } catch (e) {
        const m = /Duration: (\d+):(\d+):([\d.]+)/.exec(e.stderr.toString())
        if (m) return (+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3])
    }
    throw new Error('no duration for ' + file)
}

const args = process.argv.slice(2)
const videos = args.filter((a) => a in VIDEOS)
const langs = args.filter((a) => a in VOICES)
const outDir = join(here, 'out')
mkdirSync(outDir, { recursive: true })
for (const video of videos.length ? videos : Object.keys(VIDEOS)) {
    for (const lang of langs.length ? langs : ['fr', 'ar', 'en']) {
        const work = join(here, 'build', video, lang)
        if (existsSync(work)) rmSync(work, { recursive: true })
        mkdirSync(work, { recursive: true })
        const scenes = VIDEOS[video](lang)
        const list = []
        scenes.forEach((scene, i) => {
            const n = String(i + 1).padStart(2, '0')
            const html = join(work, `s${n}.html`), png = join(work, `s${n}.png`), mp3 = join(work, `s${n}.mp3`), seg = join(work, `s${n}.mp4`)
            writeFileSync(html, page(lang, i + 1, scenes.length, scene))
            run(EDGE, ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--user-data-dir=${join(here, 'edge-profile')}`,
                '--window-size=1080,1920', `--screenshot=${png}`, pathToFileURL(html).href])
            run(TTS, ['--voice', VOICES[lang], `--rate=${lang === 'ar' ? '-5%' : '+0%'}`, '--text', scene.say, '--write-media', mp3])
            const secs = duration(mp3) + 0.8
            run(FFMPEG, ['-y', '-loop', '1', '-framerate', '25', '-i', png, '-i', mp3,
                '-filter_complex', '[1:a]apad=pad_dur=0.8[a]', '-map', '0:v', '-map', '[a]', '-t', secs.toFixed(2),
                '-c:v', 'libx264', '-tune', 'stillimage', '-preset', 'medium', '-crf', '22', '-pix_fmt', 'yuv420p',
                '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', seg])
            list.push(`file '${seg.replace(/\\/g, '/')}'`)
        })
        writeFileSync(join(work, 'list.txt'), list.join('\n'))
        const final = join(outDir, `manara-${video}-${lang}.mp4`)
        run(FFMPEG, ['-y', '-f', 'concat', '-safe', '0', '-i', join(work, 'list.txt'), '-c', 'copy', '-movflags', '+faststart', final])
        // A poster for the page: the first scene.
        run(FFMPEG, ['-y', '-i', join(work, 's01.png'), '-vf', 'scale=540:960', '-q:v', '4', join(outDir, `manara-${video}-${lang}.jpg`)])
        console.log(video, lang, duration(final).toFixed(0) + 's', final)
    }
}
