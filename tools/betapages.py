"""Generates controller/public/beta.html (fr), beta-ar.html and beta-en.html from one template."""
import io, os, sys
from urllib.parse import quote

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import betaform  # noqa: E402  the sign-up form, its styles and words

OUT = sys.argv[1]
EMAIL = 'nabil.bsalah0@gmail.com'  # already public on the privacy pages
# The buttons jump to the form on the page (betaform.py). Set FORM_URL to send them elsewhere instead.
FORM_URL = '#inscription'
# The API the form posts to: the live server unless MANARA_API_URL says otherwise (local preview).
API = os.environ.get('MANARA_API_URL', betaform.API)

PATTERN = ("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='56' height='56' viewBox='0 0 56 56'%3E"
           "%3Cg fill='none' stroke='%23b99328' stroke-opacity='.16' stroke-width='1'%3E%3Crect x='16' y='16' width='24' height='24'/%3E"
           "%3Crect x='16' y='16' width='24' height='24' transform='rotate(45 28 28)'/%3E%3Ccircle cx='28' cy='28' r='4'/%3E%3C/g%3E%3C/svg%3E")

LOGO = ('<svg width="30" height="30" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="#0e5a43"/>'
        '<path d="M13 13h6l1.6 14h-9.2z" fill="#fff"/><path d="M12.5 9.5h7v3.5h-7z" fill="#d8b24a"/><path d="M16 5l4 4.5h-8z" fill="#fff"/></svg>')

PAGES = {
    'fr': {
        'file': 'beta.html', 'dir': 'ltr',
        'title': 'Manara · Devenez une famille pionnière',
        'desc': "Testez gratuitement Manara, le contrôle parental transparent et respectueux de nos valeurs. Installé avec vous par appel, en français, en arabe ou en anglais.",
        'langs': 'Langue',
        'h1': 'Devenez une famille pionnière',
        'lead': 'Protégez votre enfant sur Internet, en toute transparence et selon nos valeurs.',
        'chips': ['Gratuit pendant le test', 'Installé avec vous par appel', 'Limité à 20 familles'],
        'cta': 'Je m’inscris',
        'subject': 'Famille pionnière Manara',
        'body': "Bonjour,\n\nJe souhaite tester Manara.\nPrénom :\nPays et ville :\nLangue pour l'appel (français, arabe, anglais) :\nMarque et modèle du téléphone de l'enfant :\nÂge de l'enfant :\n\nJe confirme qu'il s'agit de mon propre enfant mineur, et qu'il saura que son téléphone est protégé.",
        'note': 'Android 11 ou plus récent · pas encore d’iPhone',
        'video': 'Voir l’installation en 1 minute',
        'why': 'Ce que Manara fait pour votre famille',
        'cards': [
            ('Rien de caché', 'Votre enfant sait que son téléphone est protégé et voit ce que vous voyez.'),
            ('Des nuits calmes, les devoirs d’abord', 'À l’heure du coucher, les applications se mettent en pause ; le Coran, WhatsApp et les appels restent ouverts.'),
            ('Moins de contenus choquants, moins d’inconnus', 'Sites pour adultes bloqués, recherche Google sécurisée, et une alerte quand un numéro inconnu appelle votre enfant.'),
            ('On l’installe avec vous', 'Un appel avec le fondateur, en français, en arabe ou en anglais. Sur le téléphone que votre enfant utilise déjà, sans le réinitialiser.'),
        ],
        'how': 'Comment se passe le test',
        'steps': [
            ('Vous vous inscrivez', 'Quelques questions sur le téléphone et vos disponibilités.'),
            ('On l’installe ensemble', 'Un appel d’environ 20 minutes, je vous guide pas à pas.'),
            ('Vous l’utilisez deux semaines', 'Puis vous me dites franchement ce qui marche et ce qui ne marche pas.'),
        ],
        'faq': 'Questions fréquentes',
        'qa': [
            ('C’est pour quels téléphones ?', 'Android 11 ou plus récent. Testé sur Samsung et Xiaomi. Pas encore sur iPhone.'),
            ('Mon enfant le saura-t-il ?', 'Oui, toujours. Le téléphone affiche en permanence qu’il est protégé et ce que vous pouvez voir. Manara ne lit jamais les messages et n’écoute jamais les appels.'),
            ('Que devient notre vie privée ?', 'Rien n’est vendu ni utilisé pour la publicité. Vous pouvez tout arrêter et supprimer votre compte à tout moment.'),
            ('Et après le test ?', 'Vous gardez Manara si vous le souhaitez. Le prix après le test reste à fixer, et les familles pionnières seront prévenues avant.'),
            ('Pour qui est-ce ?', 'Pour un parent et son propre enfant mineur. Jamais pour surveiller un autre adulte.'),
        ],
        'privacy': 'Politique de confidentialité',
        'privacy_href': '/privacy-fr.html',
        'foot': 'Manara est fait en Tunisie.',
        'last': 'Prêt à essayer ?',
    },
    'ar': {
        'file': 'beta-ar.html', 'dir': 'rtl',
        'title': 'منارة · كن من العائلات الرائدة',
        'desc': 'جرّب منارة مجانًا: رقابة أبوية واضحة تحترم قيمنا. نثبّتها معك في مكالمة، بالعربية أو الفرنسية أو الإنجليزية.',
        'langs': 'اللغة',
        'h1': 'كن من العائلات الرائدة',
        'lead': 'احمِ طفلك على الإنترنت، بوضوح ووفق قيمنا.',
        'chips': ['مجانًا خلال التجربة', 'نثبّتها معك في مكالمة', '20 عائلة فقط'],
        'cta': 'سجّل الآن',
        'subject': 'عائلة رائدة - منارة',
        'body': 'السلام عليكم،\n\nأرغب في تجربة منارة.\nالاسم:\nالبلد والمدينة:\nلغة المكالمة (العربية، الفرنسية، الإنجليزية):\nنوع هاتف الطفل وطرازه:\nعمر الطفل:\n\nأؤكد أنه طفلي القاصر، وأنه سيعرف أن هاتفه محمي.',
        'note': 'أندرويد 11 أو أحدث · لا يعمل على آيفون بعد',
        'video': 'شاهد التثبيت في دقيقة',
        'why': 'ما تقدّمه منارة لعائلتك',
        'cards': [
            ('لا شيء مخفي', 'يعرف طفلك أن هاتفه محمي، ويرى ما تراه أنت.'),
            ('ليالٍ هادئة والدراسة أولًا', 'في وقت النوم تتوقف التطبيقات مؤقتًا، وتبقى تطبيقات القرآن وواتساب والمكالمات متاحة.'),
            ('محتوى صادم أقل، وغرباء أقل', 'المواقع المخصّصة للبالغين محجوبة، والبحث الآمن في Google مفعّل، وتصلك تنبيهات عندما يتصل رقم مجهول بطفلك.'),
            ('نثبّتها معك', 'مكالمة مع المؤسّس، بالعربية أو الفرنسية أو الإنجليزية. تعمل على الهاتف الذي يستعمله طفلك حاليًا، دون إعادة ضبطه.'),
        ],
        'how': 'كيف تجري التجربة',
        'steps': [
            ('تسجّل', 'بعض الأسئلة عن الهاتف والأوقات التي تناسبك.'),
            ('نثبّتها معًا', 'مكالمة مدّتها نحو 20 دقيقة، أرشدك فيها خطوة بخطوة.'),
            ('تستعملها مدّة أسبوعين', 'ثم تخبرني بصراحة بما يعمل وما لا يعمل.'),
        ],
        'faq': 'أسئلة شائعة',
        'qa': [
            ('ما الهواتف المدعومة؟', 'أندرويد 11 أو أحدث. جُرّبت على سامسونغ وشاومي، ولا تعمل على آيفون بعد.'),
            ('هل سيعرف طفلي؟', 'نعم، دائمًا. يُظهر الهاتف باستمرار أنه محمي وما يمكنك رؤيته. منارة لا تقرأ الرسائل ولا تستمع إلى المكالمات أبدًا.'),
            ('وماذا عن خصوصيتنا؟', 'لا نبيع أي بيانات ولا نستعملها للإعلانات. يمكنك إيقاف كل شيء وحذف حسابك في أي وقت.'),
            ('وبعد التجربة؟', 'تحتفظ بمنارة إن أردت. لم يُحدَّد السعر بعد التجربة، وستُبلَّغ به العائلات الرائدة مسبقًا.'),
            ('لمن منارة؟', 'للأبوين وطفلهما القاصر فقط، وليست أبدًا لمراقبة شخص بالغ.'),
        ],
        'privacy': 'سياسة الخصوصية',
        'privacy_href': '/privacy-ar.html',
        'foot': 'صُنعت منارة في تونس.',
        'last': 'مستعد للتجربة؟',
    },
    'en': {
        'file': 'beta-en.html', 'dir': 'ltr',
        'title': 'Manara · Become a founding family',
        'desc': 'Try Manara for free: open parental controls that respect our values. Set up with you on a call, in French, Arabic or English.',
        'langs': 'Language',
        'h1': 'Become a founding family',
        'lead': 'Protect your child online, openly and in line with our values.',
        'chips': ['Free during the test', 'Set up with you on a call', 'Limited to 20 families'],
        'cta': 'Sign up',
        'subject': 'Manara founding family',
        'body': "Hello,\n\nI'd like to test Manara.\nFirst name:\nCountry and city:\nLanguage for the call (French, Arabic, English):\nThe child's phone brand and model:\nThe child's age:\n\nI confirm this is my own minor child, and that they will know their phone is protected.",
        'note': 'Android 11 or newer · no iPhone yet',
        'video': 'See the setup in a minute',
        'why': 'What Manara does for your family',
        'cards': [
            ('Nothing hidden', 'Your child knows the phone is protected, and sees what you can see.'),
            ('Calmer nights, homework first', 'At bedtime the apps pause; the Quran, WhatsApp and calls stay open.'),
            ('Less harmful content, fewer strangers', 'Adult sites blocked, Google SafeSearch on, and an alert when an unknown number calls your child.'),
            ('We set it up with you', 'A call with the founder, in French, Arabic or English. On the phone your child already uses, without resetting it.'),
        ],
        'how': 'How the test works',
        'steps': [
            ('You sign up', 'A few questions about the phone and when suits you.'),
            ('We set it up together', 'A call of about 20 minutes; I guide you step by step.'),
            ('You use it for two weeks', 'Then you tell me honestly what works and what doesn’t.'),
        ],
        'faq': 'Questions',
        'qa': [
            ('Which phones?', 'Android 11 or newer. Tested on Samsung and Xiaomi. Not on iPhone yet.'),
            ('Will my child know?', 'Yes, always. The phone always shows that it is protected and what you can see. Manara never reads messages and never listens to calls.'),
            ('What about our privacy?', 'Nothing is sold or used for advertising. You can stop everything and delete your account at any time.'),
            ('After the test?', 'You keep Manara if you want. The price after the test isn’t set yet, and founding families will be told first.'),
            ('Who is it for?', 'A parent and their own minor child. Never for watching another adult.'),
        ],
        'privacy': 'Privacy policy',
        'privacy_href': '/privacy.html',
        'foot': 'Manara is made in Tunisia.',
        'last': 'Ready to try it?',
    },
}

CSS = """
  :root { --bg:#f6f1e6; --surface:#fffdf8; --ink:#1b2a24; --muted:#5b675f; --line:#e5dac3; --brand:#0e5a43; --brand-ink:#ffffff; --soft:#e2efe8; --gold:#8a6a12;
    color-scheme: light; font: 17px/1.6 system-ui, -apple-system, 'Segoe UI', Roboto, 'Noto Sans', sans-serif; color: var(--ink); background: var(--bg); }
  @media (prefers-color-scheme: dark) { :root { --bg:#0a1511; --surface:#10201a; --ink:#ede6d4; --muted:#a9a48d; --line:#24392f; --brand:#d8b24a; --brand-ink:#1a1406; --soft:#2a2a17; --gold:#d8b24a; color-scheme: dark; } }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg) url("PATTERN") repeat; }
  [lang="ar"] { font-family: 'Segoe UI', 'Noto Kufi Arabic', 'Noto Sans Arabic', Tahoma, system-ui, sans-serif; line-height: 1.85; }
  main { max-width: 980px; margin: 0 auto; padding: 20px 20px 64px; }
  a { color: var(--brand); }
  header { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; padding-block: 8px 4px; }
  header > a { color: var(--ink); text-decoration: none; font-weight: 800; font-size: 1.2rem; display: flex; gap: 10px; align-items: center; }
  header .ar { color: var(--gold); font-weight: 700; }
  .langs { margin-inline-start: auto; font-size: 0.95rem; }
  .langs a, .langs strong { margin-inline-start: 12px; }
  .hero { display: grid; grid-template-columns: 1.1fr 0.9fr; gap: 36px; align-items: center; padding-block: 28px 40px; }
  h1 { font-size: clamp(2rem, 5vw, 3rem); line-height: 1.12; margin: 0 0 12px; font-weight: 800; }
  .lead { font-size: 1.2rem; margin: 0 0 20px; color: var(--ink); }
  .chips { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 24px; padding: 0; list-style: none; }
  .chips li { background: var(--surface); border: 1px solid var(--line); border-radius: 999px; padding: 4px 14px; font-size: 0.92rem; }
  .button { display: inline-flex; align-items: center; justify-content: center; min-height: 52px; padding: 12px 28px; border-radius: 999px; background: var(--brand); color: var(--brand-ink); text-decoration: none; font-weight: 700; font-size: 1.05rem; }
  .button:hover { filter: brightness(1.1); }
  .button:focus-visible { outline: 3px solid var(--gold); outline-offset: 3px; }
  .note { color: var(--muted); font-size: 0.92rem; margin: 10px 0 0; }
  figure { margin: 0; }
  video { width: 100%; max-width: 360px; display: block; margin-inline: auto; border-radius: 22px; border: 1px solid var(--line); background: #000; }
  figcaption { text-align: center; color: var(--muted); font-size: 0.9rem; margin-top: 8px; }
  h2 { font-size: 1.45rem; margin: 40px 0 16px; }
  .cards { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; }
  .card { background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 18px 20px; border-inline-start: 4px solid var(--brand); }
  .card h3 { margin: 0 0 6px; font-size: 1.08rem; }
  .card p { margin: 0; color: var(--muted); }
  .steps { list-style: none; padding: 0; margin: 0; display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; counter-reset: step; }
  .steps li { background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 18px 20px; counter-increment: step; }
  .steps li::before { content: counter(step); display: inline-grid; place-items: center; width: 32px; height: 32px; border-radius: 50%; background: var(--soft); color: var(--brand); font-weight: 800; margin-bottom: 8px; }
  .steps strong { display: block; margin-bottom: 4px; }
  .steps span { color: var(--muted); }
  details { background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 12px 18px; margin-bottom: 10px; }
  summary { cursor: pointer; font-weight: 700; }
  details p { margin: 8px 0 2px; color: var(--muted); }
  .last { text-align: center; background: var(--surface); border: 1px solid var(--line); border-radius: 16px; padding: 28px 20px; margin-top: 40px; }
  .last h2 { margin: 0 0 14px; }
  footer { text-align: center; color: var(--muted); font-size: 0.9rem; margin-top: 32px; }
  @media (max-width: 760px) { .hero { grid-template-columns: 1fr; } .cards, .steps { grid-template-columns: 1fr; } }
""".replace('PATTERN', PATTERN)


def esc(s):
    return s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;').replace('"', '&quot;')


def signup(p):
    if FORM_URL:
        return FORM_URL
    return f"mailto:{EMAIL}?subject={quote(p['subject'])}&body={quote(p['body'])}"


def langs(code):
    names = [('fr', 'beta.html', 'Français'), ('ar', 'beta-ar.html', 'العربية'), ('en', 'beta-en.html', 'English')]
    out = []
    for c, f, n in names:
        out.append(f'<strong lang="{c}">{n}</strong>' if c == code else f'<a href="/{f}" lang="{c}" hreflang="{c}">{n}</a>')
    return ''.join(out)


for code, p in PAGES.items():
    href = esc(signup(p))
    cards = ''.join(f'<div class="card"><h3>{esc(t)}</h3><p>{esc(d)}</p></div>' for t, d in p['cards'])
    steps = ''.join(f'<li><strong>{esc(t)}</strong><span>{esc(d)}</span></li>' for t, d in p['steps'])
    qa = ''.join(f'<details><summary>{esc(q)}</summary><p>{esc(a)}</p></details>' for q, a in p['qa'])
    chips = ''.join(f'<li>{esc(c)}</li>' for c in p['chips'])
    html = f"""<!doctype html>
<html lang="{code}" dir="{p['dir']}">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="color-scheme" content="light dark" />
<meta name="description" content="{esc(p['desc'])}" />
<meta property="og:title" content="{esc(p['title'])}" />
<meta property="og:description" content="{esc(p['desc'])}" />
<meta property="og:image" content="/guide-video/manara-setup-{code}.jpg" />
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<link rel="alternate" hreflang="fr" href="/beta.html" />
<link rel="alternate" hreflang="ar" href="/beta-ar.html" />
<link rel="alternate" hreflang="en" href="/beta-en.html" />
<title>{esc(p['title'])}</title>
<!-- Generated from one template (docs/marketing/familles-pionnieres.md); change all three pages together. -->
<style>{CSS}{betaform.CSS}</style>
</head>
<body>
<main>
  <header>
    <a href="/">{LOGO}Manara <span class="ar" lang="ar">منارة</span></a>
    <nav class="langs" aria-label="{esc(p['langs'])}">{langs(code)}</nav>
  </header>

  <section class="hero">
    <div>
      <h1>{esc(p['h1'])}</h1>
      <p class="lead">{esc(p['lead'])}</p>
      <ul class="chips">{chips}</ul>
      <a class="button" href="{href}">{esc(p['cta'])}</a>
      <p class="note">{esc(p['note'])}</p>
    </div>
    <figure>
      <video controls preload="none" playsinline poster="/guide-video/manara-setup-{code}.jpg">
        <source src="/guide-video/manara-setup-{code}.mp4" type="video/mp4" />
      </video>
      <figcaption>{esc(p['video'])}</figcaption>
    </figure>
  </section>

  <h2>{esc(p['why'])}</h2>
  <div class="cards">{cards}</div>

  <h2>{esc(p['how'])}</h2>
  <ol class="steps">{steps}</ol>
{betaform.build(code, p["privacy_href"], API)}

  <h2>{esc(p['faq'])}</h2>
  {qa}

  <section class="last">
    <h2>{esc(p['last'])}</h2>
    <a class="button" href="{href}">{esc(p['cta'])}</a>
    <p class="note">{esc(p['note'])}</p>
  </section>

  <footer>{esc(p['foot'])} · <a href="{p['privacy_href']}">{esc(p['privacy'])}</a></footer>
</main>
<script src="/beta-form.js" defer></script>
</body>
</html>
"""
    io.open(f"{OUT}/{p['file']}", 'w', encoding='utf-8', newline='\n').write(html)
    print(p['file'], 'ok')
