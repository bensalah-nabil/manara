"""The beta page's sign-up form: markup, styles and words in fr, ar and en (used by betapages.py).

Behaviour is in controller/public/beta-form.js; the server side is POST /api/v1/beta-signups
(backend/internal/transport/console/beta.go). Field names and choice values must match
domain.BetaSignup (backend/internal/domain/beta_signup.go).
"""

API = 'https://manara-api-pvu4.onrender.com/api/v1'
EMAIL = 'nabil.bsalah0@gmail.com'  # already public on the privacy pages

T = {
    'fr': {
        'title': 'Inscription · famille pionnière',
        'counter': 'Étape {n} sur {total}',
        'next': 'Continuer', 'back': 'Retour', 'send': 'Envoyer mon inscription',
        'optional': 'facultatif',
        's1': 'Faisons connaissance',
        'firstName': 'Votre prénom', 'firstNameErr': 'Écrivez votre prénom.',
        'whatsapp': 'Votre numéro WhatsApp', 'whatsappHint': 'Avec l’indicatif, par exemple +216 22 123 456',
        'whatsappErr': 'Écrivez un numéro de 8 à 15 chiffres.',
        'place': 'Pays et ville', 'placeHint': 'Par exemple : Sfax, Tunisie', 'placeErr': 'Écrivez votre pays et votre ville.',
        's2': 'Le téléphone de votre enfant',
        'brand': 'Sa marque', 'brandErr': 'Choisissez une marque.',
        'brands': [('samsung', 'Samsung'), ('xiaomi', 'Xiaomi / Redmi / POCO'), ('oppo-realme', 'Oppo / Realme'), ('other', 'Autre Android'), ('iphone', 'iPhone')],
        'iphone': 'Manara ne fonctionne pas encore sur iPhone. Continuez quand même : on vous garde une place et on vous prévient dès que c’est possible.',
        'model': 'Le modèle', 'modelHint': 'Si vous le connaissez : Paramètres, À propos du téléphone',
        's3': 'Votre enfant',
        'age': 'Son âge', 'ageErr': 'Choisissez un âge.',
        'ages': [('under10', 'Moins de 10 ans'), ('10to13', '10 à 13 ans'), ('14to17', '14 à 17 ans')],
        'worries': 'Ce qui vous préoccupe le plus', 'worriesHint': 'Plusieurs choix possibles',
        'worryList': [('night', '🌙', 'Les nuits'), ('screen-time', '⏱️', 'Le temps d’écran'), ('adult-content', '🛡️', 'Les contenus pour adultes'),
                      ('strangers', '📞', 'Les inconnus'), ('games', '🎮', 'Les jeux'), ('other', '💬', 'Autre chose')],
        's4': 'Notre appel d’installation',
        'callLanguage': 'En quelle langue ?', 'callLanguageErr': 'Choisissez une langue.',
        'languages': [('fr', 'Français'), ('ar', 'العربية'), ('en', 'English')],
        'slots': 'Quand cela vous arrange-t-il ?', 'slotsHint': 'Plusieurs choix possibles',
        'slotList': [('weekday-evening', 'En semaine, le soir'), ('saturday-morning', 'Le samedi matin'), ('other', 'Un autre moment')],
        's5': 'Une promesse, et c’est fini',
        'promise': 'Je confirme qu’il s’agit de mon propre enfant mineur, et qu’il saura que son téléphone est protégé.',
        'promiseErr': 'Manara n’est que pour votre propre enfant, qui le sait : cochez pour continuer.',
        'privacy': 'Vos réponses servent uniquement à vous appeler pour ce test, et sont supprimées après 6 mois.',
        'privacyLink': 'Politique de confidentialité',
        'sending': 'Envoi…', 'waking': 'Un instant, le serveur se réveille…',
        'tooMany': 'Trop d’envois depuis cette connexion. Réessayez dans une heure.',
        'failed': f'L’envoi n’a pas marché. Réessayez dans un moment, ou écrivez à {EMAIL}.',
        'doneTitle': 'Merci, {name} !', 'done': 'Je vous écris sur WhatsApp sous 48 heures pour fixer notre appel.',
        'doneWaitTitle': 'Merci, {name} !', 'doneWait': 'Vous êtes sur la liste d’attente : on vous prévient dès que Manara fonctionne sur iPhone.',
        'sign': 'L’équipe Manara',
    },
    'ar': {
        'title': 'التسجيل · عائلة رائدة',
        'counter': 'الخطوة {n} من {total}',
        'next': 'متابعة', 'back': 'رجوع', 'send': 'إرسال التسجيل',
        'optional': 'اختياري',
        's1': 'لنتعارف',
        'firstName': 'اسمك', 'firstNameErr': 'اكتب اسمك.',
        'whatsapp': 'رقم واتساب', 'whatsappHint': 'مع رمز البلد، مثلًا ‎+216 22 123 456',
        'whatsappErr': 'اكتب رقمًا من 8 إلى 15 خانة.',
        'place': 'البلد والمدينة', 'placeHint': 'مثلًا: صفاقس، تونس', 'placeErr': 'اكتب بلدك ومدينتك.',
        's2': 'هاتف طفلك',
        'brand': 'نوعه', 'brandErr': 'اختر نوع الهاتف.',
        'brands': [('samsung', 'Samsung'), ('xiaomi', 'Xiaomi / Redmi / POCO'), ('oppo-realme', 'Oppo / Realme'), ('other', 'أندرويد آخر'), ('iphone', 'iPhone')],
        'iphone': 'منارة لا تعمل على آيفون بعد. تابع رغم ذلك: نحجز لك مكانًا ونخبرك حين يصبح ذلك ممكنًا.',
        'model': 'الطراز', 'modelHint': 'إن كنت تعرفه: الإعدادات، حول الهاتف',
        's3': 'طفلك',
        'age': 'عمره', 'ageErr': 'اختر العمر.',
        'ages': [('under10', 'أقل من 10 سنوات'), ('10to13', 'من 10 إلى 13'), ('14to17', 'من 14 إلى 17')],
        'worries': 'أكثر ما يقلقك', 'worriesHint': 'يمكنك اختيار أكثر من واحد',
        'worryList': [('night', '🌙', 'الليل'), ('screen-time', '⏱️', 'وقت الشاشة'), ('adult-content', '🛡️', 'محتوى البالغين'),
                      ('strangers', '📞', 'الغرباء'), ('games', '🎮', 'الألعاب'), ('other', '💬', 'شيء آخر')],
        's4': 'مكالمة التثبيت',
        'callLanguage': 'بأي لغة؟', 'callLanguageErr': 'اختر لغة.',
        'languages': [('ar', 'العربية'), ('fr', 'Français'), ('en', 'English')],
        'slots': 'متى يناسبك؟', 'slotsHint': 'يمكنك اختيار أكثر من واحد',
        'slotList': [('weekday-evening', 'مساء أيام الأسبوع'), ('saturday-morning', 'صباح السبت'), ('other', 'وقت آخر')],
        's5': 'وعد واحد، وانتهينا',
        'promise': 'أؤكد أنه طفلي القاصر، وأنه سيعرف أن هاتفه محمي.',
        'promiseErr': 'منارة لطفلك أنت فقط، وهو يعلم بذلك: ضع علامة للمتابعة.',
        'privacy': 'تُستعمل إجاباتك فقط للاتصال بك من أجل هذه التجربة، وتُحذف بعد 6 أشهر.',
        'privacyLink': 'سياسة الخصوصية',
        'sending': 'جارٍ الإرسال…', 'waking': 'لحظة، الخادم يستيقظ…',
        'tooMany': 'إرسالات كثيرة من هذا الاتصال. أعد المحاولة بعد ساعة.',
        'failed': f'لم ينجح الإرسال. أعد المحاولة بعد قليل، أو راسلنا على {EMAIL}.',
        'doneTitle': 'شكرًا يا {name}!', 'done': 'سأراسلك على واتساب خلال 48 ساعة لتحديد موعد المكالمة.',
        'doneWaitTitle': 'شكرًا يا {name}!', 'doneWait': 'أنت على قائمة الانتظار: سنخبرك حين تعمل منارة على آيفون.',
        'sign': 'فريق منارة',
    },
    'en': {
        'title': 'Sign up · founding family',
        'counter': 'Step {n} of {total}',
        'next': 'Continue', 'back': 'Back', 'send': 'Send my sign-up',
        'optional': 'optional',
        's1': 'Nice to meet you',
        'firstName': 'Your first name', 'firstNameErr': 'Write your first name.',
        'whatsapp': 'Your WhatsApp number', 'whatsappHint': 'With the country code, for example +216 22 123 456',
        'whatsappErr': 'Write a number of 8 to 15 digits.',
        'place': 'Country and city', 'placeHint': 'For example: Sfax, Tunisia', 'placeErr': 'Write your country and city.',
        's2': 'Your child’s phone',
        'brand': 'Its brand', 'brandErr': 'Choose a brand.',
        'brands': [('samsung', 'Samsung'), ('xiaomi', 'Xiaomi / Redmi / POCO'), ('oppo-realme', 'Oppo / Realme'), ('other', 'Other Android'), ('iphone', 'iPhone')],
        'iphone': 'Manara doesn’t work on iPhone yet. Carry on anyway: we keep you a place and tell you as soon as it does.',
        'model': 'The model', 'modelHint': 'If you know it: Settings, About phone',
        's3': 'Your child',
        'age': 'Their age', 'ageErr': 'Choose an age.',
        'ages': [('under10', 'Under 10'), ('10to13', '10 to 13'), ('14to17', '14 to 17')],
        'worries': 'What worries you most', 'worriesHint': 'Choose as many as you like',
        'worryList': [('night', '🌙', 'The nights'), ('screen-time', '⏱️', 'Screen time'), ('adult-content', '🛡️', 'Adult content'),
                      ('strangers', '📞', 'Strangers'), ('games', '🎮', 'Games'), ('other', '💬', 'Something else')],
        's4': 'Our setup call',
        'callLanguage': 'In which language?', 'callLanguageErr': 'Choose a language.',
        'languages': [('en', 'English'), ('fr', 'Français'), ('ar', 'العربية')],
        'slots': 'When suits you?', 'slotsHint': 'Choose as many as you like',
        'slotList': [('weekday-evening', 'Weekday evenings'), ('saturday-morning', 'Saturday mornings'), ('other', 'Another time')],
        's5': 'One promise, and you’re done',
        'promise': 'I confirm this is my own minor child, and that they will know their phone is protected.',
        'promiseErr': 'Manara is only for your own child, who knows it: tick to continue.',
        'privacy': 'Your answers are only used to call you about this test, and deleted after 6 months.',
        'privacyLink': 'Privacy policy',
        'sending': 'Sending…', 'waking': 'One moment, the server is waking up…',
        'tooMany': 'Too many sign-ups from this connection. Try again in an hour.',
        'failed': f'Sending didn’t work. Try again in a moment, or write to {EMAIL}.',
        'doneTitle': 'Thank you, {name}!', 'done': 'I’ll write to you on WhatsApp within 48 hours to book our call.',
        'doneWaitTitle': 'Thank you, {name}!', 'doneWait': 'You’re on the waiting list: we’ll tell you as soon as Manara works on iPhone.',
        'sign': 'The Manara team',
    },
}

CSS = """
  #inscription { scroll-margin-top: 16px; }
  .signup { background: var(--surface); border: 1px solid var(--line); border-radius: 20px; padding: 24px; margin-top: 40px; box-shadow: 0 20px 40px -28px rgba(14, 90, 67, .45); }
  .signup h2 { margin: 0 0 4px; }
  .progress { height: 8px; background: var(--soft); border-radius: 999px; overflow: hidden; margin: 14px 0 6px; }
  .progress span { display: block; height: 100%; width: 20%; background: var(--brand); border-radius: 999px; transition: width .35s ease; }
  .counter { color: var(--muted); font-size: .9rem; margin: 0 0 18px; }
  .step h3 { font-size: 1.3rem; margin: 0 0 16px; }
  .field { display: block; margin-bottom: 16px; }
  .field > span { display: block; font-weight: 600; margin-bottom: 6px; }
  .field small, .hint { display: block; color: var(--muted); font-size: .88rem; margin-top: 4px; font-weight: 400; }
  .field input[type=text], .field input[type=tel] { width: 100%; font: inherit; padding: 12px 14px; border: 1.5px solid var(--line); border-radius: 12px; background: var(--bg); color: var(--ink); }
  .field input:focus { outline: none; border-color: var(--brand); box-shadow: 0 0 0 3px var(--soft); }
  fieldset { border: 0; padding: 0; margin: 0 0 18px; min-width: 0; }
  legend { font-weight: 600; margin-bottom: 8px; padding: 0; }
  .tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; }
  .tile { position: relative; }
  .tile input { position: absolute; opacity: 0; inset: 0; margin: 0; cursor: pointer; }
  .tile span { display: flex; align-items: center; gap: 8px; min-height: 52px; padding: 10px 14px; border: 1.5px solid var(--line); border-radius: 14px; background: var(--bg); font-weight: 600; transition: border-color .15s, background .15s, transform .15s; }
  .tile .emoji { font-size: 1.3rem; }
  .tile input:checked + span { border-color: var(--brand); background: var(--soft); box-shadow: inset 0 0 0 1px var(--brand); }
  .tile input:checked + span::after { content: '✓'; margin-inline-start: auto; color: var(--brand); font-weight: 800; }
  .tile input:focus-visible + span { outline: 3px solid var(--gold); outline-offset: 2px; }
  .tile:hover span { transform: translateY(-1px); }
  .iphone-note { background: var(--soft); border-radius: 12px; padding: 12px 14px; margin: -6px 0 16px; }
  .promise { display: flex; gap: 12px; align-items: flex-start; padding: 14px; border: 1.5px solid var(--line); border-radius: 14px; background: var(--bg); cursor: pointer; font-weight: 600; }
  .promise input { width: 22px; height: 22px; margin-top: 2px; accent-color: var(--brand); flex: none; }
  .error { display: block; color: #b42318; font-size: .9rem; min-height: 1.2em; margin-top: 4px; font-weight: 600; }
  @media (prefers-color-scheme: dark) { .error { color: #ff8a7f; } }
  .nav { display: flex; gap: 10px; justify-content: space-between; align-items: center; margin-top: 8px; flex-wrap: wrap; }
  .nav .button { border: 0; cursor: pointer; font: inherit; font-weight: 700; }
  .nav .back { background: transparent; color: var(--brand); border: 0; font: inherit; font-weight: 600; cursor: pointer; padding: 10px 4px; }
  .nav .button:disabled { opacity: .6; cursor: wait; }
  .status { color: var(--muted); min-height: 1.4em; margin: 12px 0 0; }
  .honeypot { position: absolute; left: -9999px; width: 1px; height: 1px; overflow: hidden; }
  .done { text-align: center; background: var(--surface); border: 1px solid var(--line); border-radius: 20px; padding: 36px 24px; margin-top: 40px; }
  .done:focus { outline: none; }
  .done .check { width: 72px; height: 72px; margin: 0 auto 12px; border-radius: 50%; background: var(--brand); color: var(--brand-ink); display: grid; place-items: center; font-size: 2.2rem; animation: pop .45s ease-out; }
  .done h2 { margin: 0 0 8px; }
  .done .sign { color: var(--muted); margin-top: 12px; }
  @keyframes pop { from { transform: scale(.4); opacity: 0; } to { transform: scale(1); opacity: 1; } }
  @media (prefers-reduced-motion: reduce) { .progress span, .tile span, .done .check { transition: none; animation: none; } }
"""


def esc(s):
    return s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;').replace('"', '&quot;')


def tiles(name, kind, choices, error_attr=''):
    out = []
    for choice in choices:
        value, *rest = choice
        label = rest[-1]
        emoji = f'<b class="emoji" aria-hidden="true">{rest[0]}</b>' if len(rest) == 2 else ''
        out.append(f'<label class="tile"><input type="{kind}" name="{name}" value="{value}"{error_attr} /><span>{emoji}{esc(label)}</span></label>')
    return '<div class="tiles">' + ''.join(out) + '</div>'


def nav(t, first=False, last=False):
    back = '' if first else f'<button type="button" class="back">{esc(t["back"])}</button>'
    forward = (f'<button type="submit" class="button">{esc(t["send"])}</button>' if last
               else f'<button type="button" class="button next">{esc(t["next"])}</button>')
    spacer = '<span></span>' if first else ''
    return f'<div class="nav">{back}{spacer}{forward}</div>'


def build(code, privacy_href, api=API):
    t = T[code]
    name_pattern = r'^\+?[0-9 ()\-.]{8,24}$'
    return f"""
  <section id="inscription" aria-labelledby="signup-title">
    <form id="signup" class="signup" novalidate data-api="{esc(api)}"
      data-sending="{esc(t['sending'])}" data-waking="{esc(t['waking'])}" data-too-many="{esc(t['tooMany'])}" data-failed="{esc(t['failed'])}">
      <h2 id="signup-title">{esc(t['title'])}</h2>
      <div class="progress" aria-hidden="true"><span></span></div>
      <p class="counter" data-counter data-template="{esc(t['counter'])}" aria-live="polite"></p>
      <div class="honeypot" aria-hidden="true"><label>Website <input type="text" name="website" tabindex="-1" autocomplete="off" /></label></div>

      <div class="step" data-step>
        <h3>{esc(t['s1'])}</h3>
        <label class="field"><span>{esc(t['firstName'])}</span><input type="text" name="firstName" required maxlength="60" autocomplete="given-name" data-error="{esc(t['firstNameErr'])}" /><em class="error" role="alert"></em></label>
        <label class="field"><span>{esc(t['whatsapp'])}</span><input type="tel" name="whatsapp" required maxlength="24" autocomplete="tel" dir="ltr" data-pattern="{esc(name_pattern)}" data-error="{esc(t['whatsappErr'])}" /><small>{esc(t['whatsappHint'])}</small><em class="error" role="alert"></em></label>
        <label class="field"><span>{esc(t['place'])}</span><input type="text" name="place" required maxlength="80" autocomplete="address-level2" data-error="{esc(t['placeErr'])}" /><small>{esc(t['placeHint'])}</small><em class="error" role="alert"></em></label>
        {nav(t, first=True)}
      </div>

      <div class="step" data-step hidden>
        <h3>{esc(t['s2'])}</h3>
        <fieldset data-required data-error="{esc(t['brandErr'])}"><legend>{esc(t['brand'])}</legend>{tiles('brand', 'radio', t['brands'])}<em class="error" role="alert"></em></fieldset>
        <p class="iphone-note" data-iphone hidden>{esc(t['iphone'])}</p>
        <label class="field"><span>{esc(t['model'])} <small style="display:inline">({esc(t['optional'])})</small></span><input type="text" name="model" maxlength="80" /><small>{esc(t['modelHint'])}</small></label>
        {nav(t)}
      </div>

      <div class="step" data-step hidden>
        <h3>{esc(t['s3'])}</h3>
        <fieldset data-required data-error="{esc(t['ageErr'])}"><legend>{esc(t['age'])}</legend>{tiles('childAge', 'radio', t['ages'])}<em class="error" role="alert"></em></fieldset>
        <fieldset><legend>{esc(t['worries'])}</legend><span class="hint" style="margin:-4px 0 8px">{esc(t['worriesHint'])}</span>{tiles('worries', 'checkbox', t['worryList'])}</fieldset>
        {nav(t)}
      </div>

      <div class="step" data-step hidden>
        <h3>{esc(t['s4'])}</h3>
        <fieldset data-required data-error="{esc(t['callLanguageErr'])}"><legend>{esc(t['callLanguage'])}</legend>{tiles('callLanguage', 'radio', t['languages'])}<em class="error" role="alert"></em></fieldset>
        <fieldset><legend>{esc(t['slots'])}</legend><span class="hint" style="margin:-4px 0 8px">{esc(t['slotsHint'])}</span>{tiles('slots', 'checkbox', t['slotList'])}</fieldset>
        {nav(t)}
      </div>

      <div class="step" data-step hidden>
        <h3>{esc(t['s5'])}</h3>
        <label class="promise"><input type="checkbox" name="ownChild" value="yes" required data-error="{esc(t['promiseErr'])}" /><span>{esc(t['promise'])}<em class="error" role="alert"></em></span></label>
        <p class="hint" style="margin-top:12px">{esc(t['privacy'])} <a href="{privacy_href}">{esc(t['privacyLink'])}</a></p>
        {nav(t, last=True)}
      </div>
      <p class="status" data-status role="status" aria-live="polite"></p>
    </form>

    <div class="done" data-done hidden tabindex="-1">
      <div class="check" aria-hidden="true">✓</div>
      <h2>{esc(t['doneTitle']).replace('{name}', '<span data-name></span>')}</h2>
      <p>{esc(t['done'])}</p>
      <p class="sign">{esc(t['sign'])}</p>
    </div>
    <div class="done" data-done-waitlist hidden tabindex="-1">
      <div class="check" aria-hidden="true">✓</div>
      <h2>{esc(t['doneWaitTitle']).replace('{name}', '<span data-name></span>')}</h2>
      <p>{esc(t['doneWait'])}</p>
      <p class="sign">{esc(t['sign'])}</p>
    </div>
  </section>
"""
