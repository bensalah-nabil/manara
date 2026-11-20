// The "Familles pionnières" A5 flyer, French and Arabic: a print-ready PDF and a PNG for WhatsApp,
// with a real QR code to the beta page (encoded by qrcode-generator, the console's own encoder).
// Claims: the beta and features pages (tools/betapages.py, tools/featurepages.py); change them together.
// Usage, from this folder: node make.mjs   (needs puppeteer-core reachable, and controller/node_modules)
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const out = join(here, '..', '..', 'docs', 'marketing', 'print')
mkdirSync(out, { recursive: true })
const qrcode = createRequire(join(here, '..', '..', 'controller', 'package.json'))('qrcode-generator')
const puppeteer = (await import(process.env.PUPPETEER ?? 'puppeteer-core')).default
const EDGE = process.env.CHROME ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'

function qrSvg(text) {
  const code = qrcode(0, 'M')
  code.addData(text, 'Byte')
  code.make()
  const n = code.getModuleCount(), q = 4
  let d = ''
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (code.isDark(y, x)) d += `M${x + q} ${y + q}h1v1h-1z`
  return `<svg viewBox="0 0 ${n + 2 * q} ${n + 2 * q}" shape-rendering="crispEdges" role="img" aria-label="QR code"><rect width="100%" height="100%" fill="#fff"/><path d="${d}" fill="#0b1512"/></svg>`
}

const LOGO = '<svg class="logo" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#fffdf8"/><path d="M13 13h6l1.6 14h-9.2z" fill="#0e5a43"/><path d="M12.5 9.5h7v3.5h-7z" fill="#d8b24a"/><path d="M16 5l4 4.5h-8z" fill="#0e5a43"/></svg>'
const PATTERN = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='56' height='56' viewBox='0 0 56 56'%3E%3Cg fill='none' stroke='%23d8b24a' stroke-opacity='.14' stroke-width='1'%3E%3Crect x='16' y='16' width='24' height='24'/%3E%3Crect x='16' y='16' width='24' height='24' transform='rotate(45 28 28)'/%3E%3Ccircle cx='28' cy='28' r='4'/%3E%3C/g%3E%3C/svg%3E"

const FLYERS = {
  fr: {
    url: 'https://manara-rosy.vercel.app/beta', short: 'manara-rosy.vercel.app/beta',
    kicker: 'Contrôle parental pour Android',
    title: 'Protégez votre enfant sur Internet, en toute transparence.',
    points: [
      ['🌙', 'La nuit, les applis dorment', 'Le Coran, WhatsApp et les appels restent ouverts.'],
      ['🛡️', 'Les sites pour adultes bloqués', 'Et la recherche Google reste sécurisée.'],
      ['📞', 'Les inconnus qui appellent', 'Vous êtes prévenu quand un numéro inconnu appelle.'],
    ],
    honest: 'Rien de caché : votre enfant voit toujours ce qui est en place.',
    offer: 'Devenez une famille pionnière',
    offerLine: 'Gratuit pendant le test · installé avec vous par appel, en français, en arabe ou en anglais · 20 familles',
    scan: 'Scannez pour vous inscrire',
    foot: 'Android 11 ou plus récent · Fait en Tunisie',
  },
  ar: {
    url: 'https://manara-rosy.vercel.app/beta-ar', short: 'manara-rosy.vercel.app/beta-ar',
    kicker: 'رقابة أبوية لأندرويد',
    title: 'احمِ طفلك على الإنترنت، بوضوح ووفق قيمنا.',
    points: [
      ['🌙', 'في الليل تنام التطبيقات', 'تبقى تطبيقات القرآن وواتساب والمكالمات متاحة.'],
      ['🛡️', 'مواقع البالغين محجوبة', 'ويبقى بحث Google آمنًا.'],
      ['📞', 'الغرباء الذين يتصلون', 'يصلك تنبيه عندما يتصل رقم مجهول.'],
    ],
    honest: 'لا شيء مخفي: يرى طفلك دائمًا ما هو مفعّل.',
    offer: 'كن من العائلات الرائدة',
    offerLine: 'مجانية خلال التجربة · نثبّتها معك في مكالمة، بالعربية أو الفرنسية أو الإنجليزية · 20 عائلة',
    scan: 'امسح الرمز للتسجيل',
    foot: 'أندرويد 11 أو أحدث · صُنعت في تونس',
  },
}

function page(lang, f) {
  const rtl = lang === 'ar'
  return `<!doctype html><html lang="${lang}" dir="${rtl ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><style>
  @page { size: 148mm 210mm; margin: 0; }
  * { box-sizing: border-box; margin: 0; }
  html, body { width: 148mm; height: 210mm; }
  body { background: #0e5a43 url("${PATTERN}") repeat; color: #fffdf8; font-family: ${rtl ? "'Segoe UI', 'Noto Kufi Arabic', Tahoma" : "'Segoe UI', system-ui"}, sans-serif;
    padding: 11mm 11mm 9mm; display: flex; flex-direction: column; gap: 5mm; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .brand { display: flex; align-items: center; gap: 3mm; font-weight: 800; font-size: 6.5mm; } .brand span { color: #d8b24a; } .logo { width: 11mm; height: 11mm; }
  .kicker { color: #d8b24a; font-weight: 700; font-size: 3.6mm; letter-spacing: ${rtl ? 0 : '.02em'}; }
  h1 { font-size: ${rtl ? 8.2 : 8.6}mm; line-height: ${rtl ? 1.45 : 1.15}; font-weight: 800; }
  .points { display: grid; gap: 3mm; }
  .point { display: grid; grid-template-columns: 11mm 1fr; gap: 3mm; align-items: center; background: rgba(255,253,248,.08); border: .3mm solid rgba(216,178,74,.35); border-radius: 3.5mm; padding: 2.6mm 3.2mm; }
  .point b { font-size: 7mm; text-align: center; } .point strong { display: block; font-size: 4.2mm; } .point small { font-size: 3.3mm; color: #cfe3d9; ${rtl ? 'line-height: 1.6;' : ''} }
  .honest { font-size: 3.5mm; color: #f3e3b0; font-weight: 600; }
  .offer { margin-top: auto; background: #fffdf8; color: #0e3b2c; border-radius: 4mm; padding: 4mm; display: grid; grid-template-columns: 1fr 34mm; gap: 4mm; align-items: center; }
  .offer h2 { font-size: 5.6mm; color: #0e5a43; margin-bottom: 1.5mm; } .offer p { font-size: 3.3mm; ${rtl ? 'line-height: 1.7;' : 'line-height: 1.35;'} }
  .qr { display: grid; justify-items: center; gap: 1mm; } .qr svg { width: 32mm; height: 32mm; } .qr span { font-size: 2.8mm; font-weight: 700; text-align: center; }
  .url { font-size: 3.2mm; font-weight: 800; color: #0e5a43; margin-top: 2mm; }
  .foot { font-size: 3mm; color: #cfe3d9; text-align: center; }
  </style></head><body>
  <div class="brand">${LOGO}Manara <span lang="ar">منارة</span></div>
  <div><p class="kicker">${f.kicker}</p><h1>${f.title}</h1></div>
  <div class="points">${f.points.map(([e, t, s]) => `<div class="point"><b>${e}</b><div><strong>${t}</strong><small>${s}</small></div></div>`).join('')}</div>
  <p class="honest">${f.honest}</p>
  <div class="offer"><div><h2>${f.offer}</h2><p>${f.offerLine}</p><p class="url" dir="ltr">${f.short}</p></div><div class="qr">${qrSvg(f.url)}<span>${f.scan}</span></div></div>
  <p class="foot">${f.foot}</p>
  </body></html>`
}

const browser = await puppeteer.launch({ executablePath: EDGE, headless: true })
const tab = await browser.newPage()
for (const [lang, f] of Object.entries(FLYERS)) {
  await tab.setContent(page(lang, f), { waitUntil: 'load' })
  await tab.pdf({ path: join(out, `flyer-${lang}.pdf`), width: '148mm', height: '210mm', printBackground: true })
  // The PNG for WhatsApp: the same page at about 1240 x 1748 px.
  await tab.setViewport({ width: 559, height: 794, deviceScaleFactor: 2.22 })
  await tab.screenshot({ path: join(out, `flyer-${lang}.png`), fullPage: false })
  console.log(lang, 'flyer done')
}
await browser.close()
