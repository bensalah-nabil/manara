"""Generates the "Delete your account" page in three languages: controller/public/delete-account.html
(en, the address Google Play's Data safety form points to), delete-account-fr.html and -ar.html.

The console's labels are quoted as the console shows them (controller/src/messages/*.ts). What is
deleted matches the database on 2026-11-20: the account's rows cascade (parents, devices, events,
setups...); the alert log (no link to the account, 90 days) and a beta sign-up (separate, 180 days)
are said too. Usage: python tools/deletepages.py controller/public
"""
import io, sys

OUT = sys.argv[1]
EMAIL = 'nabil.bsalah0@gmail.com'

STYLE = """<style>
  :root { --bg:#f6f1e6; --surface:#fffdf8; --ink:#1b2a24; --muted:#5b675f; --line:#e5dac3; --brand:#0e5a43; --soft:#e2efe8;
    color-scheme: light; font: 16px/1.6 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; color: var(--ink); background: var(--bg); }
  @media (prefers-color-scheme: dark) { :root { --bg:#0a1511; --surface:#10201a; --ink:#ede6d4; --muted:#a9a48d; --line:#24392f; --brand:#d8b24a; --soft:#2a2a17; color-scheme: dark; } }
  body { margin: 0; background: var(--bg); }
  body[lang="ar"] { font-family: 'Segoe UI', 'Noto Kufi Arabic', 'Noto Sans Arabic', Tahoma, system-ui, sans-serif; line-height: 1.85; }
  main { max-width: 760px; margin: 0 auto; padding: 32px 20px 64px; }
  header { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }
  header > a { color: var(--ink); text-decoration: none; font-weight: 700; font-size: 1.15rem; }
  .langs { margin-inline-start: auto; font-size: 0.95rem; }
  .langs a, .langs strong { margin-inline-start: 12px; }
  h1 { font-size: 1.8rem; margin: 24px 0 4px; }
  h2 { font-size: 1.15rem; margin: 32px 0 8px; }
  .muted { color: var(--muted); }
  section { background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 4px 20px 16px; margin-top: 16px; }
  .note { background: var(--soft); border-radius: 10px; padding: 12px 14px; }
  li { margin: 4px 0; }
  a { color: var(--brand); }
  code { font-weight: 700; }
</style>"""

P = {
    'en': dict(file='delete-account.html', dir='ltr', title='Manara · Delete your account', label='Language', home='Manara', privacy='/privacy.html', body=f"""
  <h1>Delete your Manara account</h1>
  <p class="muted">For parents who use Manara, the parental controls app by Nabil Ben Salah.</p>

  <section>
    <h2>Delete it yourself, in the console</h2>
    <ol>
      <li>Release every phone first: in the console, open each phone, then the <strong>This phone</strong> tab, and choose
        <strong>Remove Manara from this phone</strong>. This takes Manara off the phone and deletes that phone's data. If the
        phone can't be reached, <strong>Show release code</strong> gives a code to type on it; after that, choose
        <strong>Remove from my list</strong>. If a phone is lost or was reset, choose <strong>Remove from my list</strong> instead.</li>
      <li>Choose <strong>Account</strong> at the top of the console, then <strong>Delete your account</strong>.</li>
      <li>Enter your password, type <code>DELETE</code> (in capitals), and confirm.</li>
    </ol>
    <p class="note">The console asks you to release every phone first on purpose: a child's phone still managed by an account
      that no longer exists could not be released by anyone.</p>
  </section>

  <section>
    <h2>What is deleted</h2>
    <p>Everything stored with the account, at once: your email address and password hash, and for every phone its rules,
      activity reports, locations, app usage, call history, apps installed or removed, limit history, protection status,
      setup records, and its push token, device token and release key. Nothing is kept for any other purpose.</p>
    <p>Two records are not linked to your account and are deleted on their own: the record that an alert was sent (its kind
      and time, with no email or name), after 90 days; and, if you signed up for the test on the beta page, that sign-up,
      after 180 days, or at once if you ask.</p>
    <p>The database provider keeps a short restore history, 6 hours on the current plan, after which deleted data is gone
      for good. The server's logs hold only internal account and phone numbers, never your email or your child's data. If
      you received emails from Manara, our email provider (Brevo) keeps its own record of them (address and subject) for its
      limited retention period.</p>
  </section>

  <section>
    <h2>If you can't sign in</h2>
    <p>Use <strong>Forgot your password?</strong> on the sign-in page to get a reset link by email. If that doesn't work,
      write to <a href="mailto:{EMAIL}">{EMAIL}</a> from the email address of the account, and ask for it to be deleted.
      We answer within 30 days, and we will ask you to release the phones first, or confirm they are lost or reset.</p>
  </section>"""),
    'fr': dict(file='delete-account-fr.html', dir='ltr', title='Manara · Supprimer votre compte', label='Langue', home='Manara', privacy='/privacy-fr.html', body=f"""
  <h1>Supprimer votre compte Manara</h1>
  <p class="muted">Pour les parents qui utilisent Manara, l'application de contrôle parental de Nabil Ben Salah.</p>

  <section>
    <h2>Le supprimer vous-même, dans la console</h2>
    <ol>
      <li>Libérez d'abord chaque téléphone : dans la console, ouvrez chaque téléphone, puis l'onglet <strong>Ce téléphone</strong>,
        et choisissez <strong>Retirer Manara de ce téléphone</strong>. Cela retire Manara du téléphone et supprime ses données. Si
        le téléphone est injoignable, <strong>Afficher le code de libération</strong> donne un code à saisir dessus ; ensuite,
        choisissez <strong>Retirer de ma liste</strong>. Si un téléphone est perdu ou a été réinitialisé, choisissez directement
        <strong>Retirer de ma liste</strong>.</li>
      <li>Choisissez <strong>Compte</strong> en haut de la console, puis <strong>Supprimer votre compte</strong>.</li>
      <li>Saisissez votre mot de passe, tapez <code>DELETE</code> (en majuscules, en anglais), et confirmez.</li>
    </ol>
    <p class="note">La console demande exprès de libérer d'abord chaque téléphone : le téléphone d'un enfant encore géré par un
      compte qui n'existe plus ne pourrait être libéré par personne.</p>
  </section>

  <section>
    <h2>Ce qui est supprimé</h2>
    <p>Tout ce qui est enregistré avec le compte, d'un coup : votre adresse e-mail et l'empreinte de votre mot de passe, et pour
      chaque téléphone ses règles, ses rapports d'activité, ses positions, l'utilisation des applications, l'historique des
      appels, les applications installées ou supprimées, l'historique des limites, l'état des protections, les données
      d'installation, ainsi que ses jetons de notification et d'appareil et sa clé de libération. Rien n'est gardé pour un
      autre usage.</p>
    <p>Deux traces ne sont pas liées à votre compte et sont supprimées d'elles-mêmes : la trace qu'une alerte a été envoyée (son
      type et l'heure, sans e-mail ni nom), après 90 jours ; et, si vous vous êtes inscrit au test sur la page dédiée, cette
      inscription, après 180 jours, ou tout de suite si vous le demandez.</p>
    <p>L'hébergeur de la base de données garde un court historique de restauration, 6 heures avec l'offre actuelle, après quoi
      les données supprimées disparaissent définitivement. Les journaux du serveur ne contiennent que des numéros internes de
      compte et de téléphone, jamais votre e-mail ni les données de votre enfant. Si vous avez reçu des e-mails de Manara,
      notre prestataire d'e-mail (Brevo) en garde sa propre trace (adresse et objet) pendant sa durée de conservation limitée.</p>
  </section>

  <section>
    <h2>Si vous ne pouvez pas vous connecter</h2>
    <p>Utilisez <strong>Mot de passe oublié ?</strong> sur la page de connexion pour recevoir un lien de réinitialisation par
      e-mail. Si cela ne marche pas, écrivez à <a href="mailto:{EMAIL}">{EMAIL}</a> depuis l'adresse e-mail du compte, et
      demandez sa suppression. Nous répondons sous 30 jours, et nous vous demanderons de libérer d'abord les téléphones, ou de
      confirmer qu'ils sont perdus ou réinitialisés.</p>
  </section>"""),
    'ar': dict(file='delete-account-ar.html', dir='rtl', title='منارة · حذف حسابك', label='اللغة', home='منارة', privacy='/privacy-ar.html', body=f"""
  <h1>حذف حسابك في منارة</h1>
  <p class="muted">للأولياء الذين يستعملون منارة، تطبيق الرقابة الأبوية من تطوير نبيل بن صالح.</p>

  <section>
    <h2>احذفه بنفسك، من لوحة التحكم</h2>
    <ol>
      <li>حرّر كل هاتف أولًا: في لوحة التحكم، افتح كل هاتف، ثم تبويب <strong>هذا الهاتف</strong>، واختر
        <strong>إزالة منارة من هذا الهاتف</strong>. هذا يزيل منارة من الهاتف ويحذف بياناته. إذا تعذّر الوصول إلى الهاتف، يعطيك
        <strong>إظهار رمز التحرير</strong> رمزًا تكتبه عليه؛ ثم اختر <strong>إزالة من قائمتي</strong>. وإذا فُقد هاتف أو أُعيد
        ضبطه، فاختر <strong>إزالة من قائمتي</strong> مباشرة.</li>
      <li>اختر <strong>الحساب</strong> في أعلى لوحة التحكم، ثم <strong>حذف حسابك</strong>.</li>
      <li>أدخل كلمة مرورك، واكتب <code dir="ltr">DELETE</code> (بالأحرف اللاتينية الكبيرة)، ثم أكّد.</li>
    </ol>
    <p class="note">تطلب لوحة التحكم تحرير كل هاتف أولًا عن قصد: هاتف طفل لا يزال يديره حساب لم يعد موجودًا لا يمكن لأحد تحريره.</p>
  </section>

  <section>
    <h2>ما الذي يُحذف</h2>
    <p>كل ما هو محفوظ مع الحساب، دفعة واحدة: بريدك الإلكتروني وبصمة كلمة مرورك، ولكل هاتف قواعده وتقارير نشاطه ومواقعه واستخدام
      التطبيقات وسجل المكالمات والتطبيقات المثبَّتة أو المحذوفة وسجل الحدود وحالة الحماية وبيانات الإعداد، إضافة إلى رموز الإشعارات
      والجهاز ومفتاح التحرير. لا يُحتفظ بشيء لأي غرض آخر.</p>
    <p>أثران غير مرتبطين بحسابك ويُحذفان وحدهما: أثر إرسال تنبيه (نوعه ووقته، دون بريد ولا اسم)، بعد 90 يومًا؛ وإن كنت سجّلت في
      التجربة من صفحتها، فذلك التسجيل، بعد 180 يومًا، أو فورًا إن طلبت ذلك.</p>
    <p>يحتفظ مزوّد قاعدة البيانات بسجل استرجاع قصير، 6 ساعات في الخطة الحالية، تختفي بعدها البيانات المحذوفة نهائيًا. ولا تحتوي
      سجلات الخادم إلا على أرقام داخلية للحسابات والهواتف، لا بريدك ولا بيانات طفلك أبدًا. وإن تلقيت رسائل من منارة، يحتفظ مزوّد
      البريد لدينا (Brevo) بسجله الخاص عنها (العنوان والموضوع) خلال مدة احتفاظه المحدودة.</p>
  </section>

  <section>
    <h2>إذا تعذّر عليك تسجيل الدخول</h2>
    <p>استعمل <strong>نسيت كلمة المرور؟</strong> في صفحة تسجيل الدخول لتتلقى رابط إعادة التعيين بالبريد. وإن لم ينجح ذلك، راسلنا
      على <a href="mailto:{EMAIL}" dir="ltr">{EMAIL}</a> من البريد الإلكتروني للحساب، واطلب حذفه. نردّ خلال 30 يومًا، وسنطلب منك
      تحرير الهواتف أولًا، أو تأكيد أنها مفقودة أو أُعيد ضبطها.</p>
  </section>"""),
}

FOOT = {'en': 'Privacy policy', 'fr': 'Politique de confidentialité', 'ar': 'سياسة الخصوصية'}


def langs(code, label):
    names = [('en', 'delete-account.html', 'English'), ('fr', 'delete-account-fr.html', 'Français'), ('ar', 'delete-account-ar.html', 'العربية')]
    links = ''.join(f'<strong lang="{c}">{n}</strong>' if c == code else f'<a href="/{f}" lang="{c}" hreflang="{c}">{n}</a>' for c, f, n in names)
    return f'<nav class="langs" aria-label="{label}">{links}</nav>'


for code, p in P.items():
    html = f"""<!doctype html>
<html lang="{code}" dir="{p['dir']}">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="color-scheme" content="light dark" />
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<link rel="alternate" hreflang="en" href="/delete-account.html" />
<link rel="alternate" hreflang="fr" href="/delete-account-fr.html" />
<link rel="alternate" hreflang="ar" href="/delete-account-ar.html" />
<title>{p['title']}</title>
<!-- Generated by tools/deletepages.py; change all three languages there. -->
{STYLE}
</head>
<body{' lang="ar"' if code == 'ar' else ''}>
<main>
  <header><a href="/">{p['home']}</a>{langs(code, p['label'])}</header>
{p['body']}

  <p class="muted"><a href="{p['privacy']}">{FOOT[code]}</a></p>
</main>
</body>
</html>
"""
    io.open(f"{OUT}/{p['file']}", 'w', encoding='utf-8', newline='\n').write(html)
    print(p['file'], 'ok')
