// Renders the carousel ad cards (1080 x 1080 PNG, French and Arabic) into docs/marketing/ads/.
// Usage, from this folder: npm install puppeteer-core (once), then node make.mjs
// Text and claims: docs/marketing/familles-pionnieres.md, section 11. Change them there first.
import puppeteer from 'puppeteer-core'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const out = join(here, '..', '..', 'docs', 'marketing', 'ads')
mkdirSync(out, { recursive: true })

const EDGE = process.env.CHROME ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'

// One line of pictogram per card, drawn in SVG so nothing depends on fonts.
const ICONS = {
  moon: '<path d="M70 18a46 46 0 1 0 38 72A40 40 0 0 1 70 18z" fill="none" stroke="currentColor" stroke-width="7" stroke-linejoin="round"/><path d="M96 26l4 9 9 4-9 4-4 9-4-9-9-4 9-4z" fill="currentColor"/>',
  shield: '<path d="M64 12l42 15v30c0 28-18 48-42 58C40 105 22 85 22 57V27z" fill="none" stroke="currentColor" stroke-width="7" stroke-linejoin="round"/><path d="M45 62l13 13 26-28" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>',
  phone: '<path d="M34 16h20l8 24-12 8c6 13 16 23 29 29l8-12 24 8v20c0 6-5 10-11 10C55 101 20 66 22 27c0-6 5-11 12-11z" fill="none" stroke="currentColor" stroke-width="7" stroke-linejoin="round"/><path d="M84 18v22M84 50v2" stroke="currentColor" stroke-width="8" stroke-linecap="round"/>',
  eye: '<path d="M10 64c14-24 32-36 54-36s40 12 54 36c-14 24-32 36-54 36S24 88 10 64z" fill="none" stroke="currentColor" stroke-width="7" stroke-linejoin="round"/><circle cx="64" cy="64" r="15" fill="currentColor"/>',
}

const CARDS = {
  fr: [
    ['moon', 'La nuit, les applis dorment.', 'Le Coran reste ouvert.'],
    ['shield', 'Sites pour adultes bloqués.', 'Recherche Google sécurisée.'],
    ['phone', 'Un inconnu appelle votre enfant ?', 'Vous êtes prévenu.'],
    ['eye', 'Rien de caché.', 'Gratuit pendant le test, installé avec vous.'],
  ],
  ar: [
    ['moon', 'في الليل تنام التطبيقات،', 'ويبقى القرآن مفتوحًا.'],
    ['shield', 'المواقع المخصّصة للبالغين محجوبة،', 'والبحث الآمن مفعّل.'],
    ['phone', 'رقم مجهول يتصل بطفلك؟', 'يصلك تنبيه.'],
    ['eye', 'لا شيء مخفي.', 'مجانية خلال التجربة، ونثبّتها معك.'],
  ],
}
const FOOT = { fr: 'Familles pionnières · manara-rosy.vercel.app/beta', ar: 'العائلات الرائدة · manara-rosy.vercel.app/beta-ar' }

const PATTERN = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='84' height='84' viewBox='0 0 56 56'%3E%3Cg fill='none' stroke='%23d8b24a' stroke-opacity='.14' stroke-width='1'%3E%3Crect x='16' y='16' width='24' height='24'/%3E%3Crect x='16' y='16' width='24' height='24' transform='rotate(45 28 28)'/%3E%3Ccircle cx='28' cy='28' r='4'/%3E%3C/g%3E%3C/svg%3E"

function card(lang, [icon, line1, line2], index) {
  const rtl = lang === 'ar'
  return `<!doctype html><html lang="${lang}" dir="${rtl ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><style>
    html, body { margin: 0; width: 1080px; height: 1080px; }
    body { background: #0e5a43 url("${PATTERN}") repeat; color: #fffdf8; font-family: ${rtl ? "'Segoe UI', 'Noto Kufi Arabic', Tahoma" : "'Segoe UI', system-ui"}, sans-serif;
      display: flex; flex-direction: column; justify-content: space-between; padding: 96px; box-sizing: border-box; }
    .icon { width: 150px; height: 150px; color: #d8b24a; }
    h1 { font-size: ${rtl ? 84 : 88}px; line-height: ${rtl ? 1.45 : 1.12}; margin: 40px 0 24px; font-weight: 800; }
    p { font-size: ${rtl ? 58 : 60}px; line-height: ${rtl ? 1.5 : 1.2}; margin: 0; color: #f3e3b0; font-weight: 600; }
    footer { display: flex; align-items: center; justify-content: space-between; font-size: 30px; color: #cfe3d9; }
    .brand { display: flex; align-items: center; gap: 18px; font-size: 40px; font-weight: 800; color: #fffdf8; }
    .brand span { color: #d8b24a; }
    .dots { display: flex; gap: 12px; } .dots i { width: 16px; height: 16px; border-radius: 50%; background: rgba(255,253,248,.3); } .dots i.on { background: #d8b24a; }
  </style></head><body>
    <div>
      <svg class="icon" viewBox="0 0 128 128" aria-hidden="true">${ICONS[icon]}</svg>
      <h1>${line1}</h1>
      <p>${line2}</p>
    </div>
    <footer>
      <div class="brand"><svg width="64" height="64" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#fffdf8"/><path d="M13 13h6l1.6 14h-9.2z" fill="#0e5a43"/><path d="M12.5 9.5h7v3.5h-7z" fill="#d8b24a"/><path d="M16 5l4 4.5h-8z" fill="#0e5a43"/></svg>Manara <span lang="ar">منارة</span></div>
      <div class="dots">${[0, 1, 2, 3].map((i) => `<i class="${i === index ? 'on' : ''}"></i>`).join('')}</div>
    </footer>
    <div style="position:absolute; bottom:40px; ${rtl ? 'right' : 'left'}:96px; font-size:26px; color:#cfe3d9" dir="ltr">${FOOT[lang]}</div>
  </body></html>`
}

const browser = await puppeteer.launch({ executablePath: EDGE, headless: true })
const page = await browser.newPage()
await page.setViewport({ width: 1080, height: 1080 })
for (const [lang, cards] of Object.entries(CARDS)) {
  for (const [i, c] of cards.entries()) {
    await page.setContent(card(lang, c, i), { waitUntil: 'load' })
    const file = join(out, `carousel-${lang}-${i + 1}.png`)
    await page.screenshot({ path: file })
    console.log(file)
  }
}
await browser.close()
