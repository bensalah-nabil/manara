"""Generates controller/public/features.html (fr), features-ar.html and features-en.html: what Manara
does, with the feature videos (tools/feature-videos, copied to controller/public/videos/).

Every sentence matches what Manara does on 2026-11-20 (the console's rule texts, ADR-0012 for the
cooling-off delay); change it with the feature. Usage: python tools/featurepages.py controller/public
"""
import io, sys

OUT = sys.argv[1]

PATTERN = ("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='56' height='56' viewBox='0 0 56 56'%3E"
           "%3Cg fill='none' stroke='%23b99328' stroke-opacity='.16' stroke-width='1'%3E%3Crect x='16' y='16' width='24' height='24'/%3E"
           "%3Crect x='16' y='16' width='24' height='24' transform='rotate(45 28 28)'/%3E%3Ccircle cx='28' cy='28' r='4'/%3E%3C/g%3E%3C/svg%3E")
LOGO = ('<svg width="30" height="30" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="#0e5a43"/>'
        '<path d="M13 13h6l1.6 14h-9.2z" fill="#fff"/><path d="M12.5 9.5h7v3.5h-7z" fill="#d8b24a"/><path d="M16 5l4 4.5h-8z" fill="#fff"/></svg>')

PAGES = {
    'fr': {
        'file': 'features.html', 'dir': 'ltr', 'beta': '/beta', 'privacy': '/privacy-fr.html',
        'title': 'Manara · Ce que fait Manara, en vidéo',
        'desc': 'Trois vidéos d’une minute : la nuit, Internet, les inconnus. Le contrôle parental transparent et respectueux de nos valeurs.',
        'langs': 'Langue', 'h1': 'Ce que fait Manara',
        'lead': 'Trois vidéos d’une minute pour voir comment Manara protège votre enfant. Rien de caché : votre enfant voit toujours ce qui est en place.',
        'features': [
            ('bedtime', 'La nuit, les applis dorment', ['Vous choisissez l’heure du coucher.', 'TikTok, YouTube et les jeux se mettent en pause.', 'Les appels, les SMS, WhatsApp et le Coran restent ouverts.', 'Le matin, tout revient tout seul.'], ''),
            ('safe-internet', 'Un Internet plus sûr', ['Les sites pour adultes sont bloqués, dans Chrome et dans les applications.', 'La recherche Google reste en mode sécurisé.', 'En option : jeux d’argent, rencontres et alcool bloqués dans Chrome.', 'Les autres navigateurs sont fermés.'], ''),
            ('strangers', 'Les inconnus qui appellent', ['Vous écrivez les numéros que vous connaissez.', 'Un autre numéro, ou un numéro masqué, appelle ? Vous recevez une alerte.', 'L’appel est marqué dans l’historique.', 'Manara n’écoute jamais les appels.'], 'Sur Android, avec la version téléchargée depuis le site.'),
        ],
        'video': 'Vidéo', 'also': 'Et aussi',
        'more': [
            ('⏱️', 'Un temps quotidien pour les réseaux sociaux et un pour les jeux', 'TikTok, Facebook et Instagram partagent un même budget.'),
            ('🔒', 'Les règles restent en place', 'Pas de réinitialisation, de mode sans échec ni de changement d’heure pour les contourner.'),
            ('⏳', 'Un délai avant d’assouplir une règle', 'Pour ne pas céder dans l’instant : un assouplissement attend avant d’arriver sur le téléphone, et vous pouvez l’annuler.'),
            ('📍', 'La position, si vous le choisissez', 'Le téléphone affiche un avis tant que c’est activé.'),
            ('📲', 'Les applications installées ou supprimées', 'Leur nom et l’heure, jamais leur contenu.'),
            ('✉️', 'Un résumé chaque lundi', 'Le temps d’écran de la semaine et les applications les plus utilisées.'),
        ],
        'promise': 'Manara ne garde ni ne transmet jamais les messages, ne voit jamais les photos et n’écoute jamais les appels. Le téléphone de votre enfant affiche toujours qu’il est protégé.',
        'cta': 'Devenez une famille pionnière', 'ctaLine': 'Gratuit pendant le test, installé avec vous par appel.', 'ctaBtn': 'Je m’inscris',
        'foot': 'Manara est fait en Tunisie.', 'privacyText': 'Politique de confidentialité',
    },
    'ar': {
        'file': 'features-ar.html', 'dir': 'rtl', 'beta': '/beta-ar', 'privacy': '/privacy-ar.html',
        'title': 'منارة · ماذا تفعل منارة، بالفيديو',
        'desc': 'ثلاثة فيديوهات في دقيقة: الليل، والإنترنت، والغرباء. رقابة أبوية واضحة تحترم قيمنا.',
        'langs': 'اللغة', 'h1': 'ماذا تفعل منارة',
        'lead': 'ثلاثة فيديوهات قصيرة لترى كيف تحمي منارة طفلك. لا شيء مخفي: يرى طفلك دائمًا ما هو مفعّل.',
        'features': [
            ('bedtime', 'في الليل تنام التطبيقات', ['أنت تختار وقت النوم.', 'يتوقف تيك توك ويوتيوب والألعاب مؤقتًا.', 'تبقى المكالمات والرسائل وواتساب والقرآن متاحة.', 'في الصباح يعود كل شيء وحده.'], ''),
            ('safe-internet', 'إنترنت أكثر أمانًا', ['المواقع المخصّصة للبالغين محجوبة، في Chrome وفي التطبيقات.', 'يبقى بحث Google في الوضع الآمن.', 'اختياريًا: حجب مواقع القمار والمواعدة والكحول في Chrome.', 'المتصفحات الأخرى مغلقة.'], ''),
            ('strangers', 'الغرباء الذين يتصلون', ['تكتب الأرقام التي تعرفها.', 'يتصل رقم آخر أو رقم مخفي؟ يصلك تنبيه.', 'تُعلَّم المكالمة في السجل.', 'منارة لا تستمع إلى المكالمات أبدًا.'], 'على أندرويد، بالنسخة المنزّلة من الموقع.'),
        ],
        'video': 'فيديو', 'also': 'وأيضًا',
        'more': [
            ('⏱️', 'وقت يومي لمواقع التواصل ووقت للألعاب', 'تيك توك وفيسبوك وإنستغرام تتشارك رصيدًا واحدًا.'),
            ('🔒', 'تبقى القواعد مفعّلة', 'لا إعادة ضبط، ولا وضع آمن، ولا تغيير للوقت للالتفاف عليها.'),
            ('⏳', 'مهلة قبل تخفيف أي قاعدة', 'حتى لا تتراجع في لحظة ضعف: ينتظر التخفيف قبل أن يصل إلى الهاتف، ويمكنك إلغاؤه.'),
            ('📍', 'الموقع، إن اخترت ذلك', 'يُظهر الهاتف إشعارًا ما دام مفعّلًا.'),
            ('📲', 'التطبيقات المثبّتة أو المحذوفة', 'اسمها ووقتها، دون محتواها أبدًا.'),
            ('✉️', 'ملخص كل يوم اثنين', 'وقت الشاشة خلال الأسبوع والتطبيقات الأكثر استخدامًا.'),
        ],
        'promise': 'منارة لا تحتفظ بالرسائل ولا تنقلها، ولا ترى الصور، ولا تستمع إلى المكالمات أبدًا. ويُظهر هاتف طفلك دائمًا أنه محمي.',
        'cta': 'كن من العائلات الرائدة', 'ctaLine': 'مجانية خلال التجربة، ونثبّتها معك في مكالمة.', 'ctaBtn': 'سجّل الآن',
        'foot': 'صُنعت منارة في تونس.', 'privacyText': 'سياسة الخصوصية',
    },
    'en': {
        'file': 'features-en.html', 'dir': 'ltr', 'beta': '/beta-en', 'privacy': '/privacy.html',
        'title': 'Manara · What Manara does, on video',
        'desc': 'Three one-minute videos: nights, the internet, strangers. Open parental controls that respect our values.',
        'langs': 'Language', 'h1': 'What Manara does',
        'lead': 'Three one-minute videos to see how Manara protects your child. Nothing hidden: your child always sees what is on.',
        'features': [
            ('bedtime', 'At night, apps sleep', ['You choose bedtime.', 'TikTok, YouTube and games pause.', 'Calls, texts, WhatsApp and the Quran stay open.', 'In the morning, it all comes back by itself.'], ''),
            ('safe-internet', 'A safer internet', ['Adult sites are blocked, in Chrome and in apps.', 'Google search stays on SafeSearch.', 'Optional: gambling, dating and alcohol sites blocked in Chrome.', 'Other browsers are closed.'], ''),
            ('strangers', 'Strangers who call', ['You write down the numbers you know.', 'Another or a hidden number calls? You get an alert.', 'The call is marked in the history.', 'Manara never listens to calls.'], 'On Android, with the version downloaded from the website.'),
        ],
        'video': 'Video', 'also': 'And also',
        'more': [
            ('⏱️', 'A daily time for social media, and one for games', 'TikTok, Facebook and Instagram share one budget.'),
            ('🔒', 'The rules stay on', 'No reset, safe mode or clock change to get around them.'),
            ('⏳', 'A wait before loosening a rule', 'So you don’t give in on the spot: a loosening waits before it reaches the phone, and you can cancel it.'),
            ('📍', 'Location, if you choose', 'The phone shows a notice while it is on.'),
            ('📲', 'Apps installed or removed', 'Their name and the time, never what is inside.'),
            ('✉️', 'A summary every Monday', 'The week’s screen time and the most used apps.'),
        ],
        'promise': 'Manara never keeps or passes on messages, never sees photos and never listens to calls. Your child’s phone always shows that it is protected.',
        'cta': 'Become a founding family', 'ctaLine': 'Free during the test, set up with you on a call.', 'ctaBtn': 'Sign up',
        'foot': 'Manara is made in Tunisia.', 'privacyText': 'Privacy policy',
    },
}

CSS = """
  :root { --bg:#f6f1e6; --surface:#fffdf8; --ink:#1b2a24; --muted:#5b675f; --line:#e5dac3; --brand:#0e5a43; --brand-ink:#ffffff; --soft:#e2efe8; --gold:#8a6a12;
    color-scheme: light; font: 17px/1.6 system-ui, -apple-system, 'Segoe UI', Roboto, 'Noto Sans', sans-serif; color: var(--ink); background: var(--bg); }
  @media (prefers-color-scheme: dark) { :root { --bg:#0a1511; --surface:#10201a; --ink:#ede6d4; --muted:#a9a48d; --line:#24392f; --brand:#d8b24a; --brand-ink:#1a1406; --soft:#2a2a17; --gold:#d8b24a; color-scheme: dark; } }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg) url("PATTERN") repeat; }
  [lang="ar"] { font-family: 'Segoe UI', 'Noto Kufi Arabic', 'Noto Sans Arabic', Tahoma, system-ui, sans-serif; line-height: 1.85; }
  main { max-width: 1040px; margin: 0 auto; padding: 20px 20px 64px; }
  a { color: var(--brand); }
  header { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; padding-block: 8px 4px; }
  header > a { color: var(--ink); text-decoration: none; font-weight: 800; font-size: 1.2rem; display: flex; gap: 10px; align-items: center; }
  header .ar { color: var(--gold); font-weight: 700; }
  .langs { margin-inline-start: auto; font-size: 0.95rem; }
  .langs a, .langs strong { margin-inline-start: 12px; }
  h1 { font-size: clamp(2rem, 5vw, 3rem); line-height: 1.12; margin: 28px 0 12px; font-weight: 800; }
  .lead { font-size: 1.15rem; max-width: 40em; margin: 0 0 8px; }
  .feature { display: grid; grid-template-columns: 300px 1fr; gap: 32px; align-items: center; background: var(--surface); border: 1px solid var(--line); border-radius: 20px; padding: 22px; margin-top: 28px; }
  .feature video { width: 100%; aspect-ratio: 9 / 16; border-radius: 16px; background: #000; display: block; }
  .feature h2 { font-size: 1.6rem; margin: 0 0 12px; }
  .feature ul { margin: 0; padding-inline-start: 0; list-style: none; display: grid; gap: 10px; }
  .feature li { padding-inline-start: 30px; position: relative; }
  .feature li::before { content: '✓'; position: absolute; inset-inline-start: 0; color: var(--brand); font-weight: 800; }
  .feature .note { color: var(--muted); font-size: 0.92rem; margin-top: 14px; }
  .tag { display: inline-block; font-size: 0.8rem; font-weight: 700; color: var(--brand); background: var(--soft); border-radius: 999px; padding: 2px 12px; margin-bottom: 8px; }
  h2.section { font-size: 1.5rem; margin: 48px 0 16px; }
  .more { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
  .item { background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 16px 18px; }
  .item b { font-size: 1.6rem; display: block; margin-bottom: 6px; }
  .item strong { display: block; margin-bottom: 4px; }
  .item span { color: var(--muted); font-size: 0.95rem; }
  .promise { margin-top: 36px; background: var(--soft); border-radius: 16px; padding: 18px 22px; font-weight: 600; }
  .cta { text-align: center; background: var(--surface); border: 1px solid var(--line); border-radius: 20px; padding: 32px 20px; margin-top: 36px; }
  .cta h2 { margin: 0 0 8px; font-size: 1.6rem; }
  .cta p { margin: 0 0 18px; color: var(--muted); }
  .button { display: inline-flex; align-items: center; justify-content: center; min-height: 52px; padding: 12px 28px; border-radius: 999px; background: var(--brand); color: var(--brand-ink); text-decoration: none; font-weight: 700; font-size: 1.05rem; }
  .button:focus-visible { outline: 3px solid var(--gold); outline-offset: 3px; }
  footer { text-align: center; color: var(--muted); font-size: 0.9rem; margin-top: 32px; }
  @media (max-width: 760px) { .feature { grid-template-columns: 1fr; } .feature video { max-width: 320px; margin-inline: auto; } .more { grid-template-columns: 1fr; } }
""".replace('PATTERN', PATTERN)


def esc(s):
    return s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;').replace('"', '&quot;')


def langs(code):
    names = [('fr', 'features.html', 'Français'), ('ar', 'features-ar.html', 'العربية'), ('en', 'features-en.html', 'English')]
    return ''.join(f'<strong lang="{c}">{n}</strong>' if c == code else f'<a href="/{f}" lang="{c}" hreflang="{c}">{n}</a>' for c, f, n in names)


for code, p in PAGES.items():
    features = ''
    for i, (vid, title, points, note) in enumerate(p['features']):
        items = ''.join(f'<li>{esc(x)}</li>' for x in points)
        note_html = f'<p class="note">{esc(note)}</p>' if note else ''
        features += f"""
  <section class="feature" aria-labelledby="f{i}">
    <video controls preload="none" playsinline poster="/videos/manara-{vid}-{code}.jpg" aria-label="{esc(p['video'])}: {esc(title)}">
      <source src="/videos/manara-{vid}-{code}.mp4" type="video/mp4" />
    </video>
    <div><span class="tag">{esc(p['video'])} {i + 1} / 3</span><h2 id="f{i}">{esc(title)}</h2><ul>{items}</ul>{note_html}</div>
  </section>"""
    more = ''.join(f'<div class="item"><b aria-hidden="true">{e}</b><strong>{esc(t)}</strong><span>{esc(d)}</span></div>' for e, t, d in p['more'])
    html = f"""<!doctype html>
<html lang="{code}" dir="{p['dir']}">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="color-scheme" content="light dark" />
<meta name="description" content="{esc(p['desc'])}" />
<meta property="og:title" content="{esc(p['title'])}" />
<meta property="og:description" content="{esc(p['desc'])}" />
<meta property="og:image" content="/videos/manara-bedtime-{code}.jpg" />
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<link rel="alternate" hreflang="fr" href="/features.html" />
<link rel="alternate" hreflang="ar" href="/features-ar.html" />
<link rel="alternate" hreflang="en" href="/features-en.html" />
<title>{esc(p['title'])}</title>
<!-- Generated by tools/featurepages.py; change all three pages together. -->
<style>{CSS}</style>
</head>
<body>
<main>
  <header>
    <a href="/">{LOGO}Manara <span class="ar" lang="ar">منارة</span></a>
    <nav class="langs" aria-label="{esc(p['langs'])}">{langs(code)}</nav>
  </header>
  <h1>{esc(p['h1'])}</h1>
  <p class="lead">{esc(p['lead'])}</p>
{features}
  <h2 class="section">{esc(p['also'])}</h2>
  <div class="more">{more}</div>
  <p class="promise">{esc(p['promise'])}</p>
  <section class="cta">
    <h2>{esc(p['cta'])}</h2>
    <p>{esc(p['ctaLine'])}</p>
    <a class="button" href="{p['beta']}">{esc(p['ctaBtn'])}</a>
  </section>
  <footer>{esc(p['foot'])} · <a href="{p['privacy']}">{esc(p['privacyText'])}</a></footer>
</main>
</body>
</html>
"""
    io.open(f"{OUT}/{p['file']}", 'w', encoding='utf-8', newline='\n').write(html)
    print(p['file'], 'ok')
