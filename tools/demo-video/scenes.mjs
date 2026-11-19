// Scenes of the demo video, per language. Every name and address shown is invented.

export const VOICES = { en: 'en-US-JennyNeural', fr: 'fr-FR-DeniseNeural', ar: 'ar-TN-ReemNeural' }

export const UI = {
    en: { brand: 'Manara', logoLetter: 'M' },
    fr: { brand: 'Manara', logoLetter: 'M' },
    ar: { brand: 'منارة', logoLetter: 'م' },
}

const T = {
    en: {
        console: 'Manara console', child: "Child's phone", parent: 'Your phone',
        which: 'Which phone are you setting up?', fresh: 'A new phone, or one you can reset', easiest: 'Easiest',
        inUse: 'The phone your child already uses', longer: 'Takes longer',
        ready: 'Before you start, have this ready',
        need: ["A way back into the phone's Google account", "On a Samsung: the Samsung account's password", 'The phone charged and on Wi-Fi', 'Time to finish in one go'],
        dlTitle: 'Download Manara', dlBtn: 'Download', warnTitle: 'Install unknown app?', warnText: 'Your phone allows installing from this source.', install: 'Install',
        scan: 'Scan the code', typeCode: 'Or type the code', codeTitle: 'Connection code for this phone',
        settings: 'Settings', about: 'About phone', software: 'Software information', build: 'Build number', model: 'Model name', version: 'Android version', x7: '× 7', pin: 'Enter your PIN',
        dev: 'Developer options', wireless: 'Wireless debugging', allowQ: 'Allow wireless debugging on this network?', allow: 'Allow', cancel: 'Cancel',
        pairCode: 'Pair device with pairing code', pairQr: 'Pair device with QR code', wifiCode: 'Wi-Fi pairing code', typeHere: 'Type the 6 digits', paired: 'Wireless debugging paired',
        backIn: "Before removing anything: how you'll get back in", backInText: 'Sign in to the Google account on your own phone now. It works? Continue.', signIn: 'Sign in', signedOk: 'Signed in',
        accounts: 'Manage accounts', remove: 'Remove account', still: 'Still on the phone', listEmpty: 'Nothing left: Manara continues by itself',
        steps: ['Phone linked to your account', 'Wireless debugging paired', 'Accounts on the phone checked', 'Accounts removed in Settings', 'Manara made the phone manager'],
        addGoogle: 'Add Google account', email: 'Email or phone', next: 'Next', back: 'Back on the phone',
        managed: 'This device is managed', managedText: 'Manara: your parent can see and set rules on this phone.', finish: 'Finish setup', done: 'Setup finished',
    },
    fr: {
        console: 'Console Manara', child: 'Téléphone de l\'enfant', parent: 'Votre téléphone',
        which: 'Quel téléphone installez-vous ?', fresh: 'Un téléphone neuf, ou à réinitialiser', easiest: 'Le plus simple',
        inUse: 'Le téléphone que votre enfant utilise déjà', longer: 'Plus long',
        ready: 'Avant de commencer, préparez ceci',
        need: ['Un moyen de revenir dans le compte Google', 'Sur un Samsung : le mot de passe du compte Samsung', 'Le téléphone chargé et sur le Wi-Fi', 'Du temps pour finir d\'une traite'],
        dlTitle: 'Télécharger Manara', dlBtn: 'Télécharger', warnTitle: 'Installer une appli inconnue ?', warnText: 'Votre téléphone autorise cette source.', install: 'Installer',
        scan: 'Scanner le code', typeCode: 'Ou saisir le code', codeTitle: 'Code de connexion de ce téléphone',
        settings: 'Paramètres', about: 'À propos du téléphone', software: 'Informations sur le logiciel', build: 'Numéro de version', model: 'Nom du modèle', version: 'Version d\'Android', x7: '× 7', pin: 'Saisissez votre code',
        dev: 'Options de développement', wireless: 'Débogage sans fil', allowQ: 'Autoriser le débogage sans fil sur ce réseau ?', allow: 'Autoriser', cancel: 'Annuler',
        pairCode: 'Associer avec un code d\'association', pairQr: 'Associer avec un code QR', wifiCode: 'Code d\'association Wi-Fi', typeHere: 'Saisissez les 6 chiffres', paired: 'Débogage sans fil associé',
        backIn: 'Avant de retirer quoi que ce soit : comment revenir', backInText: 'Connectez-vous au compte Google sur votre propre téléphone. Ça marche ? Continuez.', signIn: 'Se connecter', signedOk: 'Connecté',
        accounts: 'Gérer les comptes', remove: 'Supprimer le compte', still: 'Encore sur le téléphone', listEmpty: 'Plus rien : Manara continue tout seul',
        steps: ['Téléphone lié à votre compte', 'Débogage sans fil associé', 'Comptes du téléphone vérifiés', 'Comptes retirés dans les Paramètres', 'Manara est devenu gestionnaire du téléphone'],
        addGoogle: 'Ajouter un compte Google', email: 'Adresse e-mail ou téléphone', next: 'Suivant', back: 'De retour sur le téléphone',
        managed: 'Cet appareil est géré', managedText: 'Manara : votre parent peut voir et régler ce téléphone.', finish: 'Terminer l\'installation', done: 'Installation terminée',
    },
    ar: {
        console: 'لوحة تحكم منارة', child: 'هاتف الطفل', parent: 'هاتفك',
        which: 'أي هاتف تُعِدّه؟', fresh: 'هاتف جديد، أو يمكنك إعادة ضبطه', easiest: 'الأسهل',
        inUse: 'الهاتف الذي يستعمله طفلك الآن', longer: 'يستغرق وقتًا أطول',
        ready: 'قبل أن تبدأ، جهّز ما يلي',
        need: ['طريقة للعودة إلى حساب Google', 'على سامسونج: كلمة مرور حساب سامسونج', 'الهاتف مشحون ومتصل بشبكة Wi-Fi', 'وقت كافٍ لإكمال الإعداد دفعة واحدة'],
        dlTitle: 'تنزيل منارة', dlBtn: 'تنزيل', warnTitle: 'تثبيت تطبيق غير معروف؟', warnText: 'هاتفك يسمح بالتثبيت من هذا المصدر.', install: 'تثبيت',
        scan: 'امسح الرمز', typeCode: 'أو اكتب الرمز', codeTitle: 'رمز الربط لهذا الهاتف',
        settings: 'الإعدادات', about: 'حول الهاتف', software: 'معلومات البرنامج', build: 'رقم الإصدار', model: 'اسم الطراز', version: 'إصدار أندرويد', x7: '× 7', pin: 'أدخل رمز القفل',
        dev: 'خيارات المطور', wireless: 'تصحيح الأخطاء اللاسلكي', allowQ: 'السماح بتصحيح الأخطاء اللاسلكي على هذه الشبكة؟', allow: 'سماح', cancel: 'إلغاء',
        pairCode: 'إقران الجهاز برمز الإقران', pairQr: 'إقران الجهاز برمز QR', wifiCode: 'رمز إقران Wi-Fi', typeHere: 'اكتب الأرقام الستة', paired: 'تم إقران تصحيح الأخطاء اللاسلكي',
        backIn: 'قبل إزالة أي شيء: كيف ستعود', backInText: 'سجّل الدخول إلى حساب Google على هاتفك الآن. نجح؟ تابع.', signIn: 'تسجيل الدخول', signedOk: 'تم تسجيل الدخول',
        accounts: 'إدارة الحسابات', remove: 'إزالة الحساب', still: 'ما زال على الهاتف', listEmpty: 'لم يبقَ شيء: منارة تُكمل وحدها',
        steps: ['الهاتف مربوط بحسابك', 'تم إقران تصحيح الأخطاء اللاسلكي', 'تم فحص حسابات الهاتف', 'أُزيلت الحسابات من الإعدادات', 'أصبحت منارة مديرة الهاتف'],
        addGoogle: 'إضافة حساب Google', email: 'البريد الإلكتروني أو الهاتف', next: 'التالي', back: 'عاد إلى الهاتف',
        managed: 'هذا الجهاز خاضع للإشراف', managedText: 'منارة: يمكن لوالدك رؤية هذا الهاتف وضبط قواعده.', finish: 'إنهاء الإعداد', done: 'اكتمل الإعداد',
    },
}

const SAY = {
    en: [
        ['Setting up the phone your child already uses', "This video shows how to set up Manara on the phone your child already uses. Nothing on it is erased. Before you start, have a way back into the phone's Google account, and on a Samsung, the Samsung account's password."],
        ['1. Install Manara', "On your child's phone, open the address shown in the console and tap Download. Android warns because Manara comes from outside the Play Store. That is expected: tap Install."],
        ['2. Connect the phone', 'Open Manara and tap Scan the code. Scan the code shown in the console. The console now shows the steps for this exact phone.'],
        ['3. Unlock Developer options', 'Open Settings, then About phone, then Software information. Tap Build number seven times, and enter the phone\'s PIN. This unlocks a hidden menu. It is normal.'],
        ['4. Turn on Wireless debugging', 'Go back to Settings and open Developer options. Turn on Wireless debugging, then tap Allow. Manara turns it off again at the end.'],
        ['5. Pair the phone', 'Tap Pair device with pairing code. Type the six digits in the console. Stay on this screen until the console says it is paired.'],
        ['6. Check you can get back in', 'Before removing anything, sign in to the child\'s Google account on your own phone. If it works, continue. If it does not, stop here, and use the new phone way instead.'],
        ['7. Remove the accounts for a moment', 'On a Samsung, remove each account in the list. No app is uninstalled, and the apps keep their data. The list in the console empties as you go.'],
        ['8. Manara sets itself up', 'Once nothing is left, Manara becomes the phone\'s manager by itself. Each step ticks in the console.'],
        ['9. Sign back in', 'Now sign back in, Google first. Its saved passwords bring the others back. Apps like Facebook and WhatsApp usually come back by themselves.'],
        ['10. Finish', 'Press Finish setup in the console. Your child\'s phone always shows a notice saying it is managed. Manara never hides.'],
    ],
    fr: [
        ['Installer le téléphone que votre enfant utilise déjà', 'Cette vidéo montre comment installer Manara sur le téléphone que votre enfant utilise déjà. Rien n\'est effacé. Avant de commencer, ayez un moyen de revenir dans le compte Google du téléphone, et sur un Samsung, le mot de passe du compte Samsung.'],
        ['1. Installer Manara', 'Sur le téléphone de votre enfant, ouvrez l\'adresse affichée dans la console et touchez Télécharger. Android prévient, car Manara ne vient pas du Play Store. C\'est normal : touchez Installer.'],
        ['2. Connecter le téléphone', 'Ouvrez Manara et touchez Scanner le code. Scannez le code affiché dans la console. La console montre alors les étapes pour ce téléphone précis.'],
        ['3. Débloquer les options de développement', 'Ouvrez Paramètres, puis À propos du téléphone, puis Informations sur le logiciel. Touchez sept fois Numéro de version, et saisissez le code du téléphone. Cela débloque un menu caché. C\'est normal.'],
        ['4. Activer le débogage sans fil', 'Revenez aux Paramètres et ouvrez les Options de développement. Activez le Débogage sans fil, puis touchez Autoriser. Manara le désactive à la fin.'],
        ['5. Associer le téléphone', 'Touchez Associer avec un code d\'association. Saisissez les six chiffres dans la console. Restez sur cet écran jusqu\'à ce que la console indique que c\'est associé.'],
        ['6. Vérifier que vous pouvez revenir', 'Avant de retirer quoi que ce soit, connectez-vous au compte Google de l\'enfant sur votre propre téléphone. Si ça marche, continuez. Sinon, arrêtez-vous ici, et choisissez plutôt la voie du téléphone neuf.'],
        ['7. Retirer les comptes un instant', 'Sur un Samsung, supprimez chaque compte de la liste. Aucune appli n\'est désinstallée, et les applis gardent leurs données. La liste de la console se vide au fur et à mesure.'],
        ['8. Manara s\'installe tout seul', 'Quand il ne reste plus rien, Manara devient gestionnaire du téléphone tout seul. Chaque étape se coche dans la console.'],
        ['9. Se reconnecter', 'Reconnectez-vous maintenant, Google en premier. Ses mots de passe enregistrés ramènent les autres. Les applis comme Facebook et WhatsApp reviennent en général toutes seules.'],
        ['10. Terminer', 'Touchez Terminer l\'installation dans la console. Le téléphone de votre enfant affiche toujours un avis indiquant qu\'il est géré. Manara ne se cache jamais.'],
    ],
    ar: [
        ['إعداد الهاتف الذي يستعمله طفلك الآن', 'يشرح هذا الفيديو كيف تُعِدّ منارة على الهاتف الذي يستعمله طفلك الآن. لا يُمحى أي شيء. قبل أن تبدأ، جهّز طريقة للعودة إلى حساب Google على الهاتف، وعلى هاتف سامسونج، كلمة مرور حساب سامسونج.'],
        ['1. ثبّت منارة', 'على هاتف طفلك، افتح العنوان الظاهر في لوحة التحكم واضغط تنزيل. ينبّهك أندرويد لأن منارة ليست من متجر Play. هذا طبيعي: اضغط تثبيت.'],
        ['2. اربط الهاتف', 'افتح منارة واضغط امسح الرمز. امسح الرمز الظاهر في لوحة التحكم. تعرض لوحة التحكم الآن خطوات هذا الهاتف بالتحديد.'],
        ['3. افتح خيارات المطور', 'افتح الإعدادات، ثم حول الهاتف، ثم معلومات البرنامج. اضغط رقم الإصدار سبع مرات، وأدخل رمز قفل الهاتف. هذا يفتح قائمة مخفية. هذا طبيعي.'],
        ['4. شغّل تصحيح الأخطاء اللاسلكي', 'ارجع إلى الإعدادات وافتح خيارات المطور. شغّل تصحيح الأخطاء اللاسلكي، ثم اضغط سماح. تُطفئه منارة من جديد في النهاية.'],
        ['5. اقرن الهاتف', 'اضغط إقران الجهاز برمز الإقران. اكتب الأرقام الستة في لوحة التحكم. ابقَ على هذه الشاشة حتى تقول لوحة التحكم إن الإقران تم.'],
        ['6. تأكد أنك تستطيع العودة', 'قبل إزالة أي شيء، سجّل الدخول إلى حساب Google الخاص بطفلك على هاتفك أنت. إذا نجح، تابع. وإذا لم ينجح، توقف هنا، واختر طريقة الهاتف الجديد.'],
        ['7. أزِل الحسابات للحظة', 'على هاتف سامسونج، أزِل كل حساب في القائمة. لا يُحذف أي تطبيق، وتحتفظ التطبيقات ببياناتها. تفرغ القائمة في لوحة التحكم كلما تقدمت.'],
        ['8. منارة تُكمل وحدها', 'عندما لا يبقى شيء، تصبح منارة مديرة الهاتف وحدها. تظهر علامة على كل خطوة في لوحة التحكم.'],
        ['9. سجّل الدخول من جديد', 'سجّل الدخول الآن من جديد، وابدأ بحساب Google. كلمات المرور المحفوظة فيه تعيد الحسابات الأخرى. تطبيقات مثل فيسبوك وواتساب تعود غالبًا وحدها.'],
        ['10. أنهِ الإعداد', 'اضغط إنهاء الإعداد في لوحة التحكم. يعرض هاتف طفلك دائمًا إشعارًا يقول إنه خاضع للإشراف. منارة لا تختبئ أبدًا.'],
    ],
}

const phone = (t, title, body) => `<div style="display:grid;gap:8px;justify-items:center"><div class="phone"><div class="screen"><div class="bar"><span>10:24</span><span>▮▮ ◔</span></div>${title ? `<div class="ptitle">${title}</div>` : ''}${body}</div></div><strong style="font-size:17px;color:#475569">${t.child}</strong></div>`
const consoleBox = (t, body, w) => `<div class="console"${w ? ` style="width:${w}px"` : ''}><div class="chead"><i></i><i></i><i></i>&nbsp;${t.console}</div><div class="cbody">${body}</div></div>`
const ok = (s) => `<div><span class="check">✓</span> ${s}</div>`
const wait = (s) => `<div class="wait">○ ${s}</div>`

function stages(t) {
    return [
        () => consoleBox(t, `<strong>${t.which}</strong>
            <div class="card">${t.fresh} <span class="tag ok">${t.easiest}</span></div>
            <div class="card sel">◉ <strong>${t.inUse}</strong> <span class="tag">${t.longer}</span></div>
            <div class="box"><strong>${t.ready}</strong><ul>${t.need.map((n) => `<li>${n}</li>`).join('')}</ul></div>`, 600),
        () => phone(t, '', `<div style="padding:18px 14px;display:grid;gap:10px;text-align:center"><div class="logo" style="margin:auto">M</div><strong>${t.dlTitle}</strong><div class="btn">${t.dlBtn}</div></div>
            <div class="dim"><div class="dialog"><strong>${t.warnTitle}</strong><p style="font-size:12px;color:#64748b;margin:6px 0">${t.warnText}</p><div class="btn">${t.install}</div></div></div>`),
        (u, h) => phone(t, 'Manara', `<div style="padding:14px;display:grid;gap:10px"><div class="btn hl" style="margin:0">${t.scan}</div><div class="btn ghost" style="margin:0">${t.typeCode}</div><div style="height:150px;border-radius:14px;background:#0f172a;display:grid;place-items:center;color:#94a3b8">📷</div></div>`)
            + consoleBox(t, `<strong>${t.codeTitle}</strong>${h.qr(7)}`, 360),
        () => phone(t, t.software, `<div class="row">${t.model}<small>Galaxy A04e</small></div><div class="row">${t.version}<small>14</small></div><div class="row hl">${t.build}<small>UP1A.231005.007</small><span class="tap">${t.x7}</span></div>`)
            + phone(t, '', `<div style="padding:24px 14px;display:grid;gap:14px;text-align:center"><strong>${t.pin}</strong><div class="digits" style="font-size:24px">• • • •</div></div>`),
        () => phone(t, t.dev, `<div class="row">USB<small>…</small></div><div class="row hl">${t.wireless}<span class="toggle"></span></div>`)
            + phone(t, '', `<div class="dim"><div class="dialog"><strong style="font-size:14px">${t.allowQ}</strong><div style="display:flex;gap:6px;margin-top:10px"><div class="btn ghost" style="margin:0;flex:1">${t.cancel}</div><div class="btn hl" style="margin:0;flex:1">${t.allow}</div></div></div></div>`),
        () => phone(t, t.wireless, `<div class="row">${t.wireless}<span class="toggle"></span></div><div class="row">${t.pairQr}</div><div class="row hl">${t.pairCode}</div><div class="dialog" style="margin:10px"><small>${t.wifiCode}</small><div class="digits" style="font-size:22px;letter-spacing:.12em;white-space:nowrap">482 915</div></div>`)
            + consoleBox(t, `<strong>${t.typeHere}</strong><div class="digits">482 915</div>${ok(t.paired)}`, 380),
        () => consoleBox(t, `<div class="warn"><strong>${t.backIn}</strong><p>${t.backInText}</p></div>`, 460)
            + `<div style="display:grid;gap:8px;justify-items:center"><div class="phone"><div class="screen"><div class="bar"><span>10:31</span><span>▮▮ ◔</span></div><div class="ptitle">Google</div><div class="row">child@example.com</div><div class="btn">${t.signIn}</div><div style="text-align:center" class="check">✓ ${t.signedOk}</div></div></div><strong style="font-size:17px;color:#475569">${t.parent}</strong></div>`,
        () => phone(t, t.accounts, `<div class="row">Google<small>child@example.com</small></div><div class="row">Samsung account<small>child@example.com</small></div><div class="row">WhatsApp<small dir="ltr">+216 •• ••• •••</small></div><div class="btn red hl">${t.remove}</div>`)
            + consoleBox(t, `<strong>${t.still} (3 → 0)</strong><div style="text-decoration:line-through;color:#94a3b8">Google · Samsung account · WhatsApp</div>${ok(t.listEmpty)}`, 420),
        () => consoleBox(t, t.steps.map((s) => ok(s)).join(''), 560),
        () => phone(t, t.addGoogle, `<div style="padding:12px 14px;display:grid;gap:10px"><div class="card">${t.email}<small style="display:block;color:#64748b">child@example.com</small></div><div class="btn" style="margin:0">${t.next}</div></div>`)
            + consoleBox(t, `${ok('Google — ' + t.back)}${ok('WhatsApp — ' + t.back)}${wait('Facebook')}`, 420),
        () => phone(t, '', `<div class="notif"><strong>${t.managed}</strong><p style="font-size:12px;margin-top:4px">${t.managedText}</p></div>`)
            + consoleBox(t, `<div class="btn" style="margin:0">${t.finish}</div>${ok(t.done)}`, 380),
    ]
}

export const SCENES = Object.fromEntries(Object.keys(SAY).map((lang) => {
    const st = stages(T[lang])
    return [lang, SAY[lang].map(([title, say], i) => ({ title, say, stage: st[i] }))]
}))
