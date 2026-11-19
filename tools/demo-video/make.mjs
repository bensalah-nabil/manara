// Builds Manara's demo video for the "phone in use" path, one MP4 per language.
// Pictures: HTML scenes screenshotted by headless Edge. Voice: edge-tts. Assembly: ffmpeg.
// Usage: node make.mjs [en|fr|ar ...]
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import { SCENES, VOICES, UI } from './scenes.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const require = createRequire(join(here, 'tools', 'package.json'))
const FFMPEG = require('ffmpeg-static')
const TTS = join(here, 'tools', 'venv', 'Scripts', 'edge-tts.exe')
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'

const CSS = `
* { box-sizing: border-box; margin: 0; }
html, body { width: 1280px; height: 720px; overflow: hidden; }
body { font: 20px/1.4 'Segoe UI', Tahoma, Arial, sans-serif; color: #1f2a37;
  background: linear-gradient(135deg, #eef4fb 0%, #f8fafc 60%, #fff7ed 100%); }
.top { position: absolute; top: 28px; inset-inline: 48px; display: flex; align-items: center; gap: 14px; }
.logo { width: 40px; height: 40px; border-radius: 11px; background: #0f5fa8; color: #fff; display: grid; place-items: center; font-weight: 700; font-size: 22px; }
.brand { font-weight: 700; font-size: 22px; color: #0f5fa8; }
.count { margin-inline-start: auto; color: #64748b; font-size: 18px; }
h1 { position: absolute; top: 92px; inset-inline: 48px; font-size: 34px; line-height: 1.2; }
.stage { position: absolute; top: 160px; bottom: 140px; inset-inline: 48px; display: flex; gap: 40px; align-items: center; justify-content: center; }
.phone { width: 250px; height: 410px; border-radius: 34px; background: #111827; padding: 12px; box-shadow: 0 18px 40px rgba(15,23,42,.25); flex: none; }
.screen { width: 100%; height: 100%; border-radius: 24px; background: #fff; overflow: hidden; display: flex; flex-direction: column; font-size: 14px; }
.bar { height: 22px; background: #f1f5f9; font-size: 11px; color: #64748b; padding: 4px 14px; display: flex; justify-content: space-between; }
.ptitle { padding: 12px 14px 8px; font-size: 18px; font-weight: 600; }
.row { padding: 10px 14px; border-bottom: 1px solid #eef2f7; }
.row small { display: block; color: #64748b; font-size: 12px; }
.hl { outline: 3px solid #f97316; outline-offset: -3px; border-radius: 10px; background: #fff7ed; position: relative; }
.tap { position: absolute; inset-inline-end: 14px; top: 50%; transform: translateY(-50%); background: #f97316; color: #fff; border-radius: 999px; padding: 2px 9px; font-size: 13px; font-weight: 700; }
.toggle { float: inline-end; width: 34px; height: 18px; border-radius: 9px; background: #0f5fa8; position: relative; margin-top: 2px; }
.toggle::after { content: ''; position: absolute; top: 2px; inset-inline-end: 2px; width: 14px; height: 14px; border-radius: 50%; background: #fff; }
.toggle.off { background: #cbd5e1; } .toggle.off::after { inset-inline-end: auto; inset-inline-start: 2px; }
.btn { margin: 10px 14px; padding: 9px; border-radius: 999px; background: #0f5fa8; color: #fff; text-align: center; font-weight: 600; }
.btn.red { background: #dc2626; } .btn.ghost { background: #e2e8f0; color: #1f2a37; }
.dialog { margin: auto 12px; padding: 14px; border-radius: 16px; background: #fff; box-shadow: 0 8px 30px rgba(0,0,0,.25); }
.dim { background: rgba(15,23,42,.45); flex: 1; display: flex; }
.notif { margin: 8px; padding: 10px; border-radius: 12px; background: #eef4fb; border: 1px solid #c7dcf2; }
.console { width: 520px; border-radius: 14px; background: #fff; border: 1px solid #dbe3ec; box-shadow: 0 12px 30px rgba(15,23,42,.12); overflow: hidden; flex: none; }
.chead { background: #0f5fa8; color: #fff; padding: 8px 14px; font-size: 14px; display: flex; gap: 6px; align-items: center; }
.chead i { width: 9px; height: 9px; border-radius: 50%; background: rgba(255,255,255,.5); display: inline-block; }
.cbody { padding: 16px 18px; display: grid; gap: 10px; font-size: 17px; }
.card { border: 1px solid #dbe3ec; border-radius: 10px; padding: 10px 12px; }
.card.sel { border-color: #0f5fa8; box-shadow: 0 0 0 1px #0f5fa8; }
.tag { display: inline-block; padding: 0 8px; border-radius: 999px; font-size: 13px; font-weight: 600; background: #f1f5f9; color: #64748b; }
.tag.ok { background: #dcfce7; color: #15803d; }
.box { background: #eef4fb; border-radius: 10px; padding: 10px 14px; }
.warn { background: #fff7ed; border-radius: 10px; padding: 10px 14px; color: #9a3412; }
ul { padding-inline-start: 22px; display: grid; gap: 4px; }
.check { color: #15803d; font-weight: 700; } .wait { color: #94a3b8; }
.digits { font: 600 30px ui-monospace, Consolas, monospace; letter-spacing: .25em; text-align: center; padding: 6px; border: 2px solid #0f5fa8; border-radius: 10px; }
.qr { width: 150px; height: 150px; margin: 4px auto; display: grid; grid-template-columns: repeat(15, 1fr); gap: 0; border: 8px solid #fff; outline: 1px solid #dbe3ec; }
.qr span { background: #111827; } .qr span.w { background: #fff; }
.caption { position: absolute; bottom: 26px; inset-inline: 48px; min-height: 92px; padding: 14px 22px; border-radius: 16px; background: rgba(15,23,42,.88); color: #fff; font-size: 23px; line-height: 1.4; display: flex; align-items: center; }
.big { font-size: 26px; max-width: 760px; display: grid; gap: 14px; }
`

function qr(seed) {
    // A decorative pattern, deliberately not a scannable code.
    let x = seed, cells = ''
    for (let i = 0; i < 225; i++) {
        x = (x * 1103515245 + 12345) & 0x7fffffff
        const r = Math.floor(i / 15), c = i % 15
        const fr = r < 4 ? r : r > 10 ? r - 11 : -1
        const fc = c < 4 ? c : c > 10 ? c - 11 : -1
        const finder = fr >= 0 && fc >= 0 && !(r > 10 && c > 10)
        const dark = finder ? (fr === 0 || fr === 3 || fc === 0 || fc === 3) : (x >> 8) % 2 === 0
        cells += `<span${dark ? '' : ' class="w"'}></span>`
    }
    return `<div class="qr">${cells}</div>`
}

function page(lang, n, total, scene, u) {
    const dir = lang === 'ar' ? 'rtl' : 'ltr'
    return `<!doctype html><html lang="${lang}" dir="${dir}"><head><meta charset="utf-8"><style>${CSS}</style></head><body>
<div class="top"><div class="logo">${u.logoLetter}</div><div class="brand">${u.brand}</div><div class="count" dir="ltr">${n} / ${total}</div></div>
<h1>${scene.title}</h1>
<div class="stage">${scene.stage(u, { qr })}</div>
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

const langs = process.argv.slice(2).length ? process.argv.slice(2) : ['fr', 'ar', 'en']
for (const lang of langs) {
    const out = join(here, 'build', lang)
    if (existsSync(out)) rmSync(out, { recursive: true })
    mkdirSync(out, { recursive: true })
    const scenes = SCENES[lang]
    const u = UI[lang]
    const list = []
    scenes.forEach((scene, i) => {
        const n = String(i + 1).padStart(2, '0')
        const html = join(out, `s${n}.html`)
        const png = join(out, `s${n}.png`)
        const mp3 = join(out, `s${n}.mp3`)
        const seg = join(out, `s${n}.mp4`)
        writeFileSync(html, page(lang, i + 1, scenes.length, scene, u))
        run(EDGE, ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--user-data-dir=${join(here, 'edge-profile')}`,
            '--window-size=1280,720', `--screenshot=${png}`, pathToFileURL(html).href])
        const spoken = scene.say.replace(/<[^>]+>/g, '')
        run(TTS, ['--voice', VOICES[lang], `--rate=${lang === 'ar' ? '-5%' : '+0%'}`, '--text', spoken, '--write-media', mp3])
        const secs = duration(mp3) + 0.9
        run(FFMPEG, ['-y', '-loop', '1', '-framerate', '25', '-i', png, '-i', mp3,
            '-filter_complex', '[1:a]apad=pad_dur=0.9[a]', '-map', '0:v', '-map', '[a]', '-t', secs.toFixed(2),
            '-c:v', 'libx264', '-tune', 'stillimage', '-preset', 'medium', '-crf', '22', '-pix_fmt', 'yuv420p',
            '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', seg])
        list.push(`file '${seg.replace(/\\/g, '/')}'`)
        console.log(lang, n, secs.toFixed(1) + 's')
    })
    writeFileSync(join(out, 'list.txt'), list.join('\n'))
    const final = join(here, `manara-setup-${lang}.mp4`)
    run(FFMPEG, ['-y', '-f', 'concat', '-safe', '0', '-i', join(out, 'list.txt'), '-c', 'copy', '-movflags', '+faststart', final])
    console.log(lang, 'done', final, duration(final).toFixed(0) + 's')
}
