"""Generates the "Start here" page in three languages: controller/public/start.html (fr, the short
link /start on flyers and posts), start-ar.html and start-en.html.

One question, "Who is this phone for?", and two answers: the parent's own phone (the console, or the
Manara Parents app) and the child's phone (Manara, set up from the console's "Add a phone"). Two apps
on purpose: see tools/parent-app/README.md. Usage: python tools/startpages.py controller/public
"""
import io, sys

OUT = sys.argv[1]
PARENTS_APK = 'https://github.com/bensalah-nabil/manara/releases/download/parents-v1.0.0-test/manara-parents-1.0.0-test.apk'

STYLE = """<style>
  :root { --bg:#f6f1e6; --surface:#fffdf8; --ink:#1b2a24; --muted:#5b675f; --line:#e5dac3; --brand:#0e5a43; --on-brand:#fff; --gold:#b8892a; --soft:#e2efe8;
    color-scheme: light; font: 17px/1.6 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; color: var(--ink); background: var(--bg); }
  @media (prefers-color-scheme: dark) { :root { --bg:#0a1511; --surface:#10201a; --ink:#ede6d4; --muted:#a9a48d; --line:#24392f; --brand:#d8b24a; --on-brand:#14120a; --gold:#d8b24a; --soft:#1a2b22; color-scheme: dark; } }
  body { margin: 0; background: var(--bg); }
  body[lang="ar"] { font-family: 'Segoe UI', 'Noto Kufi Arabic', 'Noto Sans Arabic', Tahoma, system-ui, sans-serif; line-height: 1.85; }
  main { max-width: 880px; margin: 0 auto; padding: 28px 20px 64px; }
  header { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }
  header > a { display: flex; align-items: center; gap: 10px; color: var(--ink); text-decoration: none; font-weight: 700; font-size: 1.15rem; }
  header img { width: 36px; height: 36px; border-radius: 9px; }
  .langs { margin-inline-start: auto; font-size: 0.95rem; }
  .langs a, .langs strong { margin-inline-start: 12px; }
  h1 { font-size: clamp(1.7rem, 5vw, 2.4rem); margin: 32px 0 6px; text-align: center; }
  .lead { text-align: center; color: var(--muted); margin: 0 0 28px; }
  .choices { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 340px), 1fr)); gap: 18px; }
  .choice { background: var(--surface); border: 1px solid var(--line); border-top: 5px solid var(--brand); border-radius: 16px; padding: 22px 22px 18px; display: flex; flex-direction: column; }
  .choice.child { border-top-color: var(--gold); }
  .emoji { font-size: 2.4rem; line-height: 1; }
  h2 { font-size: 1.3rem; margin: 10px 0 6px; }
  .choice p { margin: 6px 0; }
  .choice ol { margin: 8px 0; padding-inline-start: 22px; }
  .choice li { margin: 4px 0; }
  .actions { margin-top: auto; padding-top: 14px; display: flex; flex-direction: column; gap: 10px; }
  a.btn { display: block; text-align: center; font-weight: 700; padding: 13px 18px; border-radius: 999px; text-decoration: none; background: var(--brand); color: var(--on-brand); }
  a.btn.ghost { background: transparent; color: var(--brand); border: 2px solid var(--brand); }
  .small { font-size: 0.9rem; color: var(--muted); }
  .note { background: var(--soft); border-radius: 12px; padding: 14px 16px; margin-top: 24px; text-align: center; }
  a { color: var(--brand); }
  footer { margin-top: 28px; text-align: center; }
  footer a { margin: 0 8px; }
</style>"""

P = {
    'fr': dict(file='start.html', dir='ltr', title='Manara · Par où commencer', label='Langue', guide='/guide-fr.html', download='/download-fr.html',
               features='/features', privacy='/privacy-fr.html', body=f"""
  <h1>Ce téléphone est pour qui&nbsp;?</h1>
  <p class="lead">Manara, ce sont deux applications&nbsp;: une pour vous, une pour votre enfant.</p>

  <div class="choices">
    <section class="choice">
      <div class="emoji" aria-hidden="true">👨‍👩‍👧</div>
      <h2>Le mien, je suis le parent</h2>
      <p><strong>Manara Parents</strong>&nbsp;: depuis votre téléphone, réglez les règles, recevez les alertes et voyez l'activité
        du téléphone de votre enfant.</p>
      <p class="small">Elle ne demande aucune autorisation sur votre téléphone et ne le gère pas.</p>
      <div class="actions">
        <a class="btn" href="/">Ouvrir la console</a>
        <a class="btn ghost" href="{PARENTS_APK}">Application Android (test)</a>
        <span class="small">Bientôt sur le Play Store. Sur iPhone ou ordinateur, la console s'ouvre dans le navigateur.</span>
      </div>
    </section>

    <section class="choice child">
      <div class="emoji" aria-hidden="true">🧒</div>
      <h2>Celui de mon enfant</h2>
      <p><strong>Manara</strong> s'installe sur le téléphone de l'enfant. Il affiche toujours qu'il est géré.</p>
      <ol>
        <li>Créez votre compte parent dans la console.</li>
        <li>Choisissez <strong>Ajouter un téléphone</strong>&nbsp;: la console vous guide pas à pas (environ 15&nbsp;minutes).</li>
      </ol>
      <div class="actions">
        <a class="btn" href="/">Commencer dans la console</a>
        <a class="btn ghost" href="{{guide}}">Lire le guide</a>
        <span class="small">Android uniquement. Fonctionne sur un téléphone déjà utilisé, sans le réinitialiser.</span>
      </div>
    </section>
  </div>

  <p class="note">Uniquement pour le téléphone de <strong>votre propre enfant mineur</strong>. Manara ne lit jamais les
    messages, ne voit jamais les photos et n'écoute jamais les appels.</p>"""),
    'ar': dict(file='start-ar.html', dir='rtl', title='منارة · من أين تبدأ', label='اللغة', guide='/guide-ar.html', download='/download-ar.html',
               features='/features-ar', privacy='/privacy-ar.html', body=f"""
  <h1>لمن هذا الهاتف؟</h1>
  <p class="lead">منارة تطبيقان: واحد لك، وواحد لطفلك.</p>

  <div class="choices">
    <section class="choice">
      <div class="emoji" aria-hidden="true">👨‍👩‍👧</div>
      <h2>هاتفي، أنا الوليّ</h2>
      <p><strong>منارة للأبوين</strong>: من هاتفك، اضبط القواعد، واستلم التنبيهات، واطّلع على نشاط هاتف طفلك.</p>
      <p class="small">لا تطلب أي إذن على هاتفك ولا تتحكّم فيه.</p>
      <div class="actions">
        <a class="btn" href="/">افتح لوحة التحكم</a>
        <a class="btn ghost" href="{PARENTS_APK}">تطبيق أندرويد (تجريبي)</a>
        <span class="small">قريبًا على متجر Play. على الآيفون أو الحاسوب، تُفتح لوحة التحكم في المتصفح.</span>
      </div>
    </section>

    <section class="choice child">
      <div class="emoji" aria-hidden="true">🧒</div>
      <h2>هاتف طفلي</h2>
      <p>تُثبَّت <strong>منارة</strong> على هاتف الطفل، وتُظهر دائمًا أنّ الهاتف مُدار.</p>
      <ol>
        <li>أنشئ حسابك في لوحة التحكم.</li>
        <li>اختر <strong>إضافة هاتف</strong>: ترشدك لوحة التحكم خطوة بخطوة (نحو 15 دقيقة).</li>
      </ol>
      <div class="actions">
        <a class="btn" href="/">ابدأ في لوحة التحكم</a>
        <a class="btn ghost" href="{{guide}}">اقرأ الدليل</a>
        <span class="small">أندرويد فقط. تعمل على هاتف مستعمل دون إعادة ضبطه.</span>
      </div>
    </section>
  </div>

  <p class="note">لهاتف <strong>طفلك القاصر</strong> فقط. منارة لا تقرأ الرسائل أبدًا، ولا ترى الصور، ولا تستمع إلى
    المكالمات.</p>"""),
    'en': dict(file='start-en.html', dir='ltr', title='Manara · Start here', label='Language', guide='/guide.html', download='/download.html',
               features='/features-en', privacy='/privacy.html', body=f"""
  <h1>Who is this phone for?</h1>
  <p class="lead">Manara is two apps: one for you, one for your child.</p>

  <div class="choices">
    <section class="choice">
      <div class="emoji" aria-hidden="true">👨‍👩‍👧</div>
      <h2>Mine, I'm the parent</h2>
      <p><strong>Manara Parents</strong>: from your own phone, set the rules, get the alerts and see the activity on your
        child's phone.</p>
      <p class="small">It asks for no permission on your phone and doesn't manage it.</p>
      <div class="actions">
        <a class="btn" href="/">Open the console</a>
        <a class="btn ghost" href="{PARENTS_APK}">Android app (test)</a>
        <span class="small">Coming to the Play Store. On an iPhone or a computer, the console opens in the browser.</span>
      </div>
    </section>

    <section class="choice child">
      <div class="emoji" aria-hidden="true">🧒</div>
      <h2>My child's</h2>
      <p><strong>Manara</strong> goes on the child's phone. It always shows that the phone is managed.</p>
      <ol>
        <li>Create your parent account in the console.</li>
        <li>Choose <strong>Add a phone</strong>: the console guides you step by step (about 15 minutes).</li>
      </ol>
      <div class="actions">
        <a class="btn" href="/">Start in the console</a>
        <a class="btn ghost" href="{{guide}}">Read the guide</a>
        <span class="small">Android only. Works on a phone already in use, without resetting it.</span>
      </div>
    </section>
  </div>

  <p class="note">Only for <strong>your own minor child's</strong> phone. Manara never reads messages, never sees photos and
    never listens to calls.</p>"""),
}

FOOT = {
    'fr': ('Découvrir les fonctions', 'Télécharger Manara', 'Confidentialité'),
    'ar': ('اكتشف الميزات', 'تنزيل منارة', 'الخصوصية'),
    'en': ('See the features', 'Download Manara', 'Privacy'),
}
HOME = {'fr': 'Manara', 'ar': 'منارة', 'en': 'Manara'}


def langs(code, label):
    names = [('fr', 'start', 'Français'), ('ar', 'start-ar', 'العربية'), ('en', 'start-en', 'English')]
    links = ''.join(f'<strong lang="{c}">{n}</strong>' if c == code else f'<a href="/{f}" lang="{c}" hreflang="{c}">{n}</a>' for c, f, n in names)
    return f'<nav class="langs" aria-label="{label}">{links}</nav>'


for code, p in P.items():
    feat, down, priv = FOOT[code]
    body = p['body'].replace('{guide}', p['guide'])
    html = f"""<!doctype html>
<html lang="{code}" dir="{p['dir']}">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="color-scheme" content="light dark" />
<meta name="theme-color" content="#0e5a43" />
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<link rel="alternate" hreflang="fr" href="/start" />
<link rel="alternate" hreflang="ar" href="/start-ar" />
<link rel="alternate" hreflang="en" href="/start-en" />
<title>{p['title']}</title>
<!-- Generated by tools/startpages.py; change all three languages there. -->
{STYLE}
</head>
<body{' lang="ar"' if code == 'ar' else ''}>
<main>
  <header><a href="/"><img src="/icons/icon-192.png" alt="" />{HOME[code]}</a>{langs(code, p['label'])}</header>
{body}

  <footer class="small"><a href="{p['features']}">{feat}</a> · <a href="{p['download']}">{down}</a> · <a href="{p['privacy']}">{priv}</a></footer>
</main>
</body>
</html>
"""
    io.open(f"{OUT}/{p['file']}", 'w', encoding='utf-8', newline='\n').write(html)
    print(p['file'], 'ok')
