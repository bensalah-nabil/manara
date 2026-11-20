// Scenes of the feature videos (vertical, 1080 x 1920), per video and language. Every name and
// number shown is invented. Each sentence matches what Manara does (checked 2026-11-20 against the
// console's rule texts, the phone's strings and the alert's wording); change them together.

export const VOICES = { en: 'en-US-JennyNeural', fr: 'fr-FR-DeniseNeural', ar: 'ar-TN-ReemNeural' }

// --- Drawing helpers -------------------------------------------------------------------------

const APPS = {
    tiktok: ['#111', '♪'], youtube: ['#e62117', '▶'], game: ['#6d28d9', '🎮'], insta: ['#d6249f', '◎'],
    quran: ['#0e5a43', '📖'], whatsapp: ['#25d366', '💬'], phone: ['#2563eb', '📞'], sms: ['#0ea5e9', '✉'],
    clock: ['#334155', '⏰'], settings: ['#64748b', '⚙'], chrome: ['#f59e0b', '◉'], firefox: ['#ea580c', '🦊'],
}

function icon(id, label, state = '') {
    const [bg, glyph] = APPS[id]
    return `<div class="app ${state}"><div class="ico" style="background:${bg}">${glyph}${state === 'paused' ? '<b class="badge">⏸</b>' : ''}</div><span>${label}</span></div>`
}

function grid(apps) {
    return `<div class="grid">${apps.map(([id, label, state]) => icon(id, label, state)).join('')}</div>`
}

function phone(inner, { night = false, time = '22:00' } = {}) {
    return `<div class="phone"><div class="screen ${night ? 'night' : ''}"><div class="bar" dir="ltr"><span>${time}</span><span>▮▮▮ 85%</span></div>${inner}</div></div>`
}

function consoleCard(title, inner) {
    return `<div class="console"><div class="chead"><i></i><i></i><i></i><span>${title}</span></div><div class="cbody">${inner}</div></div>`
}

function toggle(label, on, note = '') {
    return `<div class="rule ${on ? 'on' : ''}"><div><strong>${label}</strong>${note ? `<small>${note}</small>` : ''}</div><span class="switch ${on ? 'on' : ''}"></span></div>`
}

function dialog(title, lines) {
    return `<div class="dim"><div class="dialog"><strong>${title}</strong>${lines.map((l) => `<p>${l}</p>`).join('')}</div></div>`
}

const HOME = (L, states = {}) => grid([
    ['tiktok', 'TikTok', states.tiktok], ['youtube', 'YouTube', states.youtube], ['game', L.game, states.game], ['insta', 'Instagram', states.insta],
    ['quran', L.quran, states.quran], ['whatsapp', 'WhatsApp', states.whatsapp], ['phone', L.phone, states.phone], ['sms', L.sms, states.sms],
    ['clock', L.clock, states.clock], ['settings', L.settings, states.settings], ['chrome', 'Chrome', states.chrome], ['firefox', L.browser, states.firefox],
])
const NIGHT = { tiktok: 'paused', youtube: 'paused', game: 'paused', insta: 'paused', chrome: 'paused', firefox: 'paused' }

// --- Words ------------------------------------------------------------------------------------

const L = {
    fr: {
        game: 'Jeu', quran: 'Coran', phone: 'Téléphone', sms: 'Messages', clock: 'Horloge', settings: 'Paramètres', browser: 'Navigateur',
        console: 'Console Manara', child: 'Sami', try: 'Essayez Manara', cta: 'Familles pionnières', ctaLine: 'Gratuit pendant le test · installé avec vous par appel',
        ctaLink: 'manara-rosy.vercel.app/beta', ctaSay: 'Manara est gratuit pendant le test, et on l\'installe avec vous, par appel. Le lien est dans la description.',
        managedTitle: 'Ce téléphone est géré', managed: 'Ton parent gère ce téléphone avec Manara.', open: 'Ouvre Manara pour voir les règles.',
        bedNotice: 'C\'est l\'heure du coucher : applications en pause, mais appels, SMS, WhatsApp et Coran restent possibles.',
        browserNotice: 'Seul Chrome permet de naviguer sur le web.', paused: 'Application en pause',
        callsNotice: 'L\'historique des appels est envoyé à ton parent',
    },
    ar: {
        game: 'لعبة', quran: 'القرآن', phone: 'الهاتف', sms: 'الرسائل', clock: 'الساعة', settings: 'الإعدادات', browser: 'متصفح',
        console: 'لوحة تحكم منارة', child: 'سامي', try: 'جرّب منارة', cta: 'العائلات الرائدة', ctaLine: 'مجانية خلال التجربة · نثبّتها معك في مكالمة',
        ctaLink: 'manara-rosy.vercel.app/beta-ar', ctaSay: 'منارة مجانية خلال التجربة، ونثبّتها معك في مكالمة. الرابط في الوصف.',
        managedTitle: 'هذا الهاتف خاضع للإشراف', managed: 'يدير ولي أمرك هذا الهاتف بواسطة منارة.', open: 'افتح منارة لترى القواعد.',
        bedNotice: 'حان وقت النوم: التطبيقات متوقفة، لكن يمكنك الاتصال وإرسال الرسائل واستخدام واتساب وقراءة القرآن.',
        browserNotice: 'لا يمكن تصفح الويب إلا عبر Chrome.', paused: 'التطبيق متوقف مؤقتًا',
        callsNotice: 'يُرسَل سجل المكالمات إلى ولي أمرك',
    },
    en: {
        game: 'Game', quran: 'Quran', phone: 'Phone', sms: 'Messages', clock: 'Clock', settings: 'Settings', browser: 'Browser',
        console: 'Manara console', child: 'Sami', try: 'Try Manara', cta: 'Founding families', ctaLine: 'Free during the test · set up with you on a call',
        ctaLink: 'manara-rosy.vercel.app/beta-en', ctaSay: 'Manara is free during the test, and we set it up with you on a call. The link is in the description.',
        managedTitle: 'This phone is managed', managed: 'Your parent manages this phone with Manara.', open: 'Open Manara to see the rules.',
        bedNotice: 'It is bedtime: apps are paused, but calls, texts, WhatsApp and the Quran still work.',
        browserNotice: 'Only Chrome can be used to browse the web.', paused: 'App paused',
        callsNotice: 'Call history is sent to your parent',
    },
}

function cta(l, footnote = '') {
    return {
        title: l.try,
        say: l.ctaSay,
        stage: () => `<div class="cta"><div class="mark">✓</div><h2>${l.cta}</h2><p>${l.ctaLine}</p><div class="link" dir="ltr">${l.ctaLink}</div>${footnote ? `<small>${footnote}</small>` : ''}</div>`,
    }
}

// --- The three videos -------------------------------------------------------------------------

const BEDTIME = {
    fr: (l) => [
        { title: '22 h. L\'heure de dormir.', say: 'Il est vingt-deux heures. Votre enfant devrait dormir, mais le téléphone est encore allumé.', stage: () => phone(HOME(l), { night: true }) },
        { title: 'Vous choisissez l\'heure', say: 'Dans la console Manara, activez l\'heure du coucher et choisissez l\'horaire, par exemple de vingt et une heures trente à sept heures.', stage: () => consoleCard(l.console, toggle('Heure du coucher', true, '21:30 → 07:00, chaque nuit')) },
        { title: 'La nuit, les applis dorment', say: 'À l\'heure dite, les applications se mettent en pause : TikTok, YouTube, les jeux.', stage: () => phone(HOME(l, NIGHT), { night: true, time: '21:30' }) },
        { title: 'Le Coran et la famille restent', say: 'Mais les appels, les SMS, WhatsApp et le Coran restent ouverts. Votre enfant peut toujours appeler sa famille.', stage: () => phone(HOME(l, { ...NIGHT, quran: 'hl', whatsapp: 'hl', phone: 'hl', sms: 'hl' }), { night: true, time: '21:45' }) },
        { title: 'Votre enfant sait pourquoi', say: 'S\'il touche une application en pause, le téléphone lui explique pourquoi. Rien n\'est caché.', stage: () => phone(dialog(l.paused, [l.bedNotice, l.open]), { night: true, time: '22:10' }) },
        { title: 'Le matin, tout revient', say: 'À sept heures, tout revient tout seul. Vous n\'avez rien à faire.', stage: () => phone(HOME(l), { time: '07:00' }) },
        cta(l),
    ],
    ar: (l) => [
        { title: 'العاشرة ليلًا. وقت النوم.', say: 'الساعة العاشرة ليلًا. يجب أن ينام طفلك، لكن الهاتف ما زال مشتعلًا.', stage: () => phone(HOME(l), { night: true }) },
        { title: 'أنت تختار الوقت', say: 'في لوحة تحكم منارة، فعّل وقت النوم واختر الموعد، مثلًا من التاسعة والنصف ليلًا إلى السابعة صباحًا.', stage: () => consoleCard(l.console, toggle('وقت النوم', true, '21:30 ← 07:00، كل ليلة')) },
        { title: 'في الليل تنام التطبيقات', say: 'في الموعد، تتوقف التطبيقات مؤقتًا: تيك توك، ويوتيوب، والألعاب.', stage: () => phone(HOME(l, NIGHT), { night: true, time: '21:30' }) },
        { title: 'القرآن والعائلة متاحان', say: 'لكن المكالمات والرسائل وواتساب والقرآن تبقى متاحة. يمكن لطفلك دائمًا الاتصال بعائلته.', stage: () => phone(HOME(l, { ...NIGHT, quran: 'hl', whatsapp: 'hl', phone: 'hl', sms: 'hl' }), { night: true, time: '21:45' }) },
        { title: 'طفلك يعرف السبب', say: 'إذا لمس تطبيقًا متوقفًا، يشرح له الهاتف السبب. لا شيء مخفي.', stage: () => phone(dialog(l.paused, [l.bedNotice, l.open]), { night: true, time: '22:10' }) },
        { title: 'في الصباح يعود كل شيء', say: 'في السابعة صباحًا يعود كل شيء وحده. لا تحتاج إلى فعل أي شيء.', stage: () => phone(HOME(l), { time: '07:00' }) },
        cta(l),
    ],
    en: (l) => [
        { title: '10 pm. Time to sleep.', say: 'It\'s ten at night. Your child should be asleep, but the phone is still on.', stage: () => phone(HOME(l), { night: true }) },
        { title: 'You choose the time', say: 'In the Manara console, turn on bedtime and choose the hours, for example from half past nine at night to seven in the morning.', stage: () => consoleCard(l.console, toggle('Bedtime', true, '21:30 → 07:00, every night')) },
        { title: 'At night, apps sleep', say: 'At that time, apps pause: TikTok, YouTube, games.', stage: () => phone(HOME(l, NIGHT), { night: true, time: '21:30' }) },
        { title: 'Quran and family stay open', say: 'But calls, texts, WhatsApp and the Quran stay open. Your child can always call family.', stage: () => phone(HOME(l, { ...NIGHT, quran: 'hl', whatsapp: 'hl', phone: 'hl', sms: 'hl' }), { night: true, time: '21:45' }) },
        { title: 'Your child knows why', say: 'If they tap a paused app, the phone tells them why. Nothing is hidden.', stage: () => phone(dialog(l.paused, [l.bedNotice, l.open]), { night: true, time: '22:10' }) },
        { title: 'In the morning, it all comes back', say: 'At seven, everything comes back by itself. You don\'t have to do anything.', stage: () => phone(HOME(l), { time: '07:00' }) },
        cta(l),
    ],
}

function blocked(title, text) {
    return `<div class="chrome"><div class="url" dir="ltr">🔒 ••••••••.com</div><div class="blockpage"><div class="stop">⛔</div><strong>${title}</strong><p>${text}</p></div></div>`
}

function search(query, note) {
    const r = (w) => `<div class="result"><b></b><i style="width:${w}%"></i><i style="width:${w - 20}%"></i></div>`
    return `<div class="chrome"><div class="url" dir="ltr">google.com</div><div class="gsearch"><div class="q">🔍 ${query}</div><div class="safe">🔒 ${note}</div>${r(90)}${r(80)}${r(85)}</div></div>`
}

const INTERNET = {
    fr: (l) => [
        { title: 'Une image pour un exposé…', say: 'Votre enfant cherche une image pour un exposé. Sur Internet, n\'importe quoi peut s\'afficher.', stage: () => phone(search('volcan exposé', 'SafeSearch'), { time: '17:20' }) },
        { title: 'Un seul interrupteur', say: 'Dans la console, activez Sites pour adultes. Ajoutez, si vous voulez, le filtre Valeurs familiales : jeux d\'argent, rencontres, alcool.', stage: () => consoleCard(l.console, toggle('Sites pour adultes', true, 'Bloqués dans Chrome et dans les applis') + toggle('Valeurs familiales', true, 'Jeux d\'argent, rencontres, alcool')) },
        { title: 'Les sites pour adultes bloqués', say: 'Les sites pour adultes ne s\'ouvrent plus, dans Chrome comme dans les applications.', stage: () => phone(blocked('Ce site est bloqué', l.managed), { time: '17:22' }) },
        { title: 'Google reste en mode sécurisé', say: 'La recherche Google reste en mode sécurisé, et votre enfant ne peut pas le désactiver.', stage: () => phone(search('volcan exposé', 'SafeSearch : activé'), { time: '17:25' }) },
        { title: 'Pas de porte dérobée', say: 'Les autres navigateurs sont fermés. Votre enfant navigue avec Chrome, protégé.', stage: () => phone(dialog(l.paused, [l.browserNotice, l.open]), { time: '17:30' }) },
        { title: 'Rien de caché', say: 'Votre enfant voit sur son téléphone que ces règles sont en place. Manara ne cache rien.', stage: () => phone(`<div class="notif"><strong>${l.managedTitle}</strong><p>${l.managed}</p></div>` + HOME(l, { firefox: 'paused' }), { time: '17:31' }) },
        cta(l),
    ],
    ar: (l) => [
        { title: 'صورة من أجل عرض مدرسي…', say: 'يبحث طفلك عن صورة من أجل عرض مدرسي. على الإنترنت، قد يظهر أي شيء.', stage: () => phone(search('بركان عرض', 'SafeSearch'), { time: '17:20' }) },
        { title: 'زر واحد', say: 'في لوحة التحكم، فعّل المواقع المخصّصة للبالغين. وإن أردت، أضف فلتر القيم العائلية: القمار، والمواعدة، والكحول.', stage: () => consoleCard(l.console, toggle('مواقع البالغين', true, 'محجوبة في Chrome وفي التطبيقات') + toggle('القيم العائلية', true, 'القمار، المواعدة، الكحول')) },
        { title: 'مواقع البالغين محجوبة', say: 'لا تُفتح المواقع المخصّصة للبالغين، لا في Chrome ولا في التطبيقات.', stage: () => phone(blocked('هذا الموقع محجوب', l.managed), { time: '17:22' }) },
        { title: 'بحث Google آمن', say: 'يبقى بحث Google في الوضع الآمن، ولا يستطيع طفلك إيقافه.', stage: () => phone(search('بركان عرض', 'SafeSearch: مفعّل'), { time: '17:25' }) },
        { title: 'لا أبواب خلفية', say: 'المتصفحات الأخرى مغلقة. يتصفح طفلك عبر Chrome، وهو محمي.', stage: () => phone(dialog(l.paused, [l.browserNotice, l.open]), { time: '17:30' }) },
        { title: 'لا شيء مخفي', say: 'يرى طفلك على هاتفه أن هذه القواعد مفعّلة. منارة لا تخفي شيئًا.', stage: () => phone(`<div class="notif"><strong>${l.managedTitle}</strong><p>${l.managed}</p></div>` + HOME(l, { firefox: 'paused' }), { time: '17:31' }) },
        cta(l),
    ],
    en: (l) => [
        { title: 'A picture for homework…', say: 'Your child searches for a picture for a school project. On the internet, anything can show up.', stage: () => phone(search('volcano project', 'SafeSearch'), { time: '17:20' }) },
        { title: 'One switch', say: 'In the console, turn on Adult sites. If you like, add the Family values filter: gambling, dating, alcohol.', stage: () => consoleCard(l.console, toggle('Adult sites', true, 'Blocked in Chrome and in apps') + toggle('Family values', true, 'Gambling, dating, alcohol')) },
        { title: 'Adult sites blocked', say: 'Adult sites no longer open, in Chrome or in apps.', stage: () => phone(blocked('This site is blocked', l.managed), { time: '17:22' }) },
        { title: 'Google stays on SafeSearch', say: 'Google search stays on SafeSearch, and your child can\'t turn it off.', stage: () => phone(search('volcano project', 'SafeSearch: on'), { time: '17:25' }) },
        { title: 'No back door', say: 'Other browsers are closed. Your child browses with Chrome, protected.', stage: () => phone(dialog(l.paused, [l.browserNotice, l.open]), { time: '17:30' }) },
        { title: 'Nothing hidden', say: 'Your child sees on the phone that these rules are on. Manara hides nothing.', stage: () => phone(`<div class="notif"><strong>${l.managedTitle}</strong><p>${l.managed}</p></div>` + HOME(l, { firefox: 'paused' }), { time: '17:31' }) },
        cta(l),
    ],
}

function incoming(label, number) {
    return `<div class="call"><div class="avatar">?</div><strong>${label}</strong><div class="num" dir="ltr">${number}</div><div class="callbtns"><span class="no">✕</span><span class="yes">✆</span></div></div>`
}

function alertNotif(app, title, text) {
    return `<div class="lock"><div class="clockbig" dir="ltr">19:42</div><div class="notif alert"><small>${app}</small><strong>${title}</strong><p>${text}</p></div></div>`
}

function history(rows) {
    return rows.map(([time, who, tag]) => `<div class="hist"><span dir="ltr">${time}</span><b dir="ltr">${who}</b>${tag ? `<em>${tag}</em>` : ''}</div>`).join('')
}

const STRANGERS = {
    fr: (l) => [
        { title: 'Un inconnu appelle votre enfant', say: 'Un numéro que vous ne connaissez pas appelle votre enfant. Le sauriez-vous ?', stage: () => phone(incoming('Numéro inconnu', '+216 5• ••• 731'), { time: '19:41' }) },
        { title: 'Vous écrivez les numéros connus', say: 'Dans la console, écrivez les numéros que vous connaissez : la famille, l\'école, les parents des amis.', stage: () => consoleCard(l.console, toggle('Appels de numéros inconnus', true, 'M\'alerter quand un numéro que je ne connais pas appelle') + '<div class="numbers" dir="ltr">+216 2• ••• 456 · Maman<br>+216 9• ••• 222 · Papa<br>+216 7• ••• 100 · École</div>') },
        { title: 'Un autre numéro appelle', say: 'Quand un autre numéro appelle, ou un numéro masqué…', stage: () => phone(incoming('Numéro masqué', '•••'), { time: '19:41' }) },
        { title: 'Vous êtes prévenu', say: '…vous recevez une alerte : un appel d\'un numéro que vous ne connaissez pas.', stage: () => phone(alertNotif('Manara · e-mail', 'Sami : un appel d\'un numéro que vous ne connaissez pas', 'Le numéro est dans la console, dans l\'historique des appels.'), { time: '19:42' }) },
        { title: 'Marqué dans l\'historique', say: 'Dans l\'historique des appels, l\'appel est marqué Numéro inconnu. Vous pouvez en parler avec votre enfant.', stage: () => consoleCard(l.console, '<strong>Historique des appels</strong>' + history([['19:41', '+216 5• ••• 731', 'Numéro inconnu'], ['18:05', 'Maman', ''], ['16:30', 'École', '']])) },
        { title: 'Rien de caché', say: 'Votre enfant voit sur son téléphone que l\'historique des appels est envoyé à son parent. Manara n\'écoute jamais les appels.', stage: () => phone(`<div class="notif"><strong>${l.managedTitle}</strong><p>${l.callsNotice}</p></div>` + HOME(l), { time: '19:50' }) },
        cta(l, 'Sur Android, avec la version téléchargée depuis le site.'),
    ],
    ar: (l) => [
        { title: 'مجهول يتصل بطفلك', say: 'رقم لا تعرفه يتصل بطفلك. هل كنت ستعلم بذلك؟', stage: () => phone(incoming('رقم غير معروف', '+216 5• ••• 731'), { time: '19:41' }) },
        { title: 'تكتب الأرقام التي تعرفها', say: 'في لوحة التحكم، اكتب الأرقام التي تعرفها: العائلة، والمدرسة، وأولياء أمور الأصدقاء.', stage: () => consoleCard(l.console, toggle('مكالمات من أرقام مجهولة', true, 'نبّهني عندما يتصل رقم لا أعرفه') + '<div class="numbers" dir="rtl">ماما · <span dir="ltr">+216 2• ••• 456</span><br>بابا · <span dir="ltr">+216 9• ••• 222</span><br>المدرسة · <span dir="ltr">+216 7• ••• 100</span></div>') },
        { title: 'رقم آخر يتصل', say: 'عندما يتصل رقم آخر، أو رقم مخفي…', stage: () => phone(incoming('رقم مخفي', '•••'), { time: '19:41' }) },
        { title: 'يصلك تنبيه', say: '…يصلك تنبيه: مكالمة من رقم لا تعرفه.', stage: () => phone(alertNotif('منارة · بريد إلكتروني', 'سامي: مكالمة من رقم لا تعرفه', 'الرقم موجود في لوحة التحكم، في سجل المكالمات.'), { time: '19:42' }) },
        { title: 'مُعلَّم في السجل', say: 'في سجل المكالمات، تُعلَّم المكالمة برقم غير معروف. يمكنك أن تتحدث مع طفلك عنها.', stage: () => consoleCard(l.console, '<strong>سجل المكالمات</strong>' + history([['19:41', '+216 5• ••• 731', 'رقم غير معروف'], ['18:05', 'ماما', ''], ['16:30', 'المدرسة', '']])) },
        { title: 'لا شيء مخفي', say: 'يرى طفلك على هاتفه أن سجل المكالمات يُرسَل إلى ولي أمره. منارة لا تستمع إلى المكالمات أبدًا.', stage: () => phone(`<div class="notif"><strong>${l.managedTitle}</strong><p>${l.callsNotice}</p></div>` + HOME(l), { time: '19:50' }) },
        cta(l, 'على أندرويد، بالنسخة المنزّلة من الموقع.'),
    ],
    en: (l) => [
        { title: 'A stranger calls your child', say: 'A number you don\'t know calls your child. Would you know?', stage: () => phone(incoming('Unknown number', '+216 5• ••• 731'), { time: '19:41' }) },
        { title: 'You list the numbers you know', say: 'In the console, write the numbers you know: family, school, friends\' parents.', stage: () => consoleCard(l.console, toggle('Calls from unknown numbers', true, 'Alert me when a number I don\'t know calls') + '<div class="numbers" dir="ltr">+216 2• ••• 456 · Mum<br>+216 9• ••• 222 · Dad<br>+216 7• ••• 100 · School</div>') },
        { title: 'Another number calls', say: 'When any other number calls, or a hidden one…', stage: () => phone(incoming('Hidden number', '•••'), { time: '19:41' }) },
        { title: 'You are alerted', say: '…you get an alert: a call from a number you don\'t know.', stage: () => phone(alertNotif('Manara · email', 'Sami: a call from a number you don\'t know', 'The number is in the console, under Call history.'), { time: '19:42' }) },
        { title: 'Marked in the history', say: 'In the call history, the call is marked Unknown number. You can talk about it with your child.', stage: () => consoleCard(l.console, '<strong>Call history</strong>' + history([['19:41', '+216 5• ••• 731', 'Unknown number'], ['18:05', 'Mum', ''], ['16:30', 'School', '']])) },
        { title: 'Nothing hidden', say: 'Your child sees on the phone that call history is sent to their parent. Manara never listens to calls.', stage: () => phone(`<div class="notif"><strong>${l.managedTitle}</strong><p>${l.callsNotice}</p></div>` + HOME(l), { time: '19:50' }) },
        cta(l, 'On Android, with the version downloaded from the website.'),
    ],
}

export const VIDEOS = {
    bedtime: (lang) => BEDTIME[lang](L[lang]),
    'safe-internet': (lang) => INTERNET[lang](L[lang]),
    strangers: (lang) => STRANGERS[lang](L[lang]),
}
