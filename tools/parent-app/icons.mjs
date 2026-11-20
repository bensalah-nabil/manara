// The parent console's app icons (installable console and the Play Store "Manara Parents" app),
// drawn from Manara's logo: controller/public/icons/. Usage, from this folder: node icons.mjs
// (needs puppeteer-core reachable; PUPPETEER may point at it).
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const out = join(here, '..', '..', 'controller', 'public', 'icons')
mkdirSync(out, { recursive: true })
const puppeteer = (await import(process.env.PUPPETEER ?? 'puppeteer-core')).default
const EDGE = process.env.CHROME ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'

// The lighthouse, white with a gold lamp, on emerald. [scale] leaves room for a mask's safe zone.
function svg(size, { rounded, scale }) {
  const r = rounded ? size * 0.22 : 0
  const s = size * scale, o = (size - s) / 2, k = s / 32
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <rect width="${size}" height="${size}" rx="${r}" fill="#0e5a43"/>
    <g transform="translate(${o} ${o}) scale(${k})">
      <path d="M13 13h6l1.6 14h-9.2z" fill="#fffdf8"/><path d="M12.5 9.5h7v3.5h-7z" fill="#d8b24a"/><path d="M16 5l4 4.5h-8z" fill="#fffdf8"/>
    </g></svg>`
}

const ICONS = [
  ['icon-192.png', 192, { rounded: true, scale: 0.92 }],
  ['icon-512.png', 512, { rounded: true, scale: 0.92 }],
  // Maskable: full bleed, the lighthouse inside the central 80% safe zone.
  ['icon-maskable-512.png', 512, { rounded: false, scale: 0.7 }],
  ['apple-touch-icon.png', 180, { rounded: false, scale: 0.8 }],
]

const browser = await puppeteer.launch({ executablePath: EDGE, headless: true })
const page = await browser.newPage()
for (const [file, size, opts] of ICONS) {
  await page.setViewport({ width: size, height: size })
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg(size, opts)}</body></html>`)
  await page.screenshot({ path: join(out, file), omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } })
  console.log(file)
}
await browser.close()
