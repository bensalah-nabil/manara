# Familles pionnières: week 1 pieces

The beta campaign's first pieces: the sign-up form, the beta page copy, the founder post, the
WhatsApp message, the tester promise and the setup-call checklist. French, Tunisian Arabic
(Derja) and English. Placeholders in [brackets]. The Derja is a first draft for a native
reader. Every claim here matches the app as it is on 2026-11-20; check again before reusing.

Rules for every piece (ADR-0001, `legal-and-ethics.md`): for a parent's **own minor child**
only; the child always knows the phone is protected; never "spy", "monitor secretly" or
anything that reads as watching another adult.

---

## 1. Sign-up form

**Built into the beta page (2026-11-20)** instead of Google Forms: five steps on /beta, /beta-ar and
/beta-en, sent to Manara's own server (`POST /api/v1/beta-signups`) and listed in the admin
console, "Beta sign-ups", where each family is marked contacted, set up or declined. Kept 180 days,
and on the privacy page. The questions below are the ones it asks; the words are in
`tools/betaform.py`.

**Title:** Familles pionnières Manara / العائلات الرائدة / Manara founding families

**Introduction (FR):**
> Manara cherche 20 familles pour tester gratuitement son contrôle parental, avant sa sortie.
> On l'installe avec vous, par appel, en français, en arabe ou en anglais (environ 20 minutes).
> Vos réponses servent uniquement à vous contacter pour ce test ; elles sont supprimées à la fin
> du test si vous ne continuez pas.

**Introduction (Derja):**
> منارة تلوّج على 20 عايلة باش يجرّبو بالمجان الكونترول الأبوي متاعها قبل ما تخرج.
> نركّبوهولك مع بعضنا في مكالمة، بالعربي ولا بالفرنساوي ولا بالأنقليزي (قريب 20 دقيقة).
> المعلومات هاذي باش نتصلو بيك برك، وتتفسخ كيف يوفى التست كان ما كمّلتش.

**Introduction (EN):**
> Manara is looking for 20 families to test its parental controls for free before release.
> We set it up with you on a call, in French, Arabic or English (about 20 minutes). Your answers
> are only used to contact you about this test, and deleted when it ends if you don't continue.

**Questions** (keep them few: each one costs sign-ups):

| # | Question (FR / EN) | Type | Why |
|---|---|---|---|
| 1 | Prénom / First name | Short text | To greet them |
| 2 | Numéro WhatsApp / WhatsApp number | Short text | To book the call |
| 3 | Pays et ville / Country and city | Short text | Tunisia or abroad, time zone |
| 4 | Langue préférée pour l'appel / Language for the call | FR / العربية / EN | |
| 5 | Marque du téléphone de l'enfant / The child's phone brand | Samsung / Xiaomi, Redmi, POCO / Oppo, Realme / Autre / iPhone | Screening: no iPhone; Samsung and Xiaomi first |
| 6 | Modèle et version d'Android (Paramètres, À propos du téléphone) / Model and Android version | Short text, optional | Android 11 or later |
| 7 | Âge de l'enfant / The child's age | Under 10 / 10 to 13 / 14 to 17 | |
| 8 | Qu'est-ce qui vous inquiète le plus ? / What worries you most? | Checkboxes: screen time, the night, adult content, strangers, games, other | Feedback and messaging |
| 9 | Créneaux qui vous arrangent / Times that suit you | Weekday evening / Saturday morning / Other | Booking |
| 10 | **Je confirme qu'il s'agit de mon propre enfant mineur, et qu'il saura que son téléphone est protégé.** / **I confirm this is my own minor child, and that they will know their phone is protected.** | Required tick box | Ethics, and screens out misuse |

**After sending (FR):**
> Merci ! Je vous écris sur WhatsApp dans les 48 heures pour fixer l'appel. — [Prénom], fondateur de Manara

---

## 2. Beta page copy (for the site)

**FR**

> # Devenez une famille pionnière
> **Protégez votre enfant sur Internet, en toute transparence et selon nos valeurs.**
> Gratuit pendant le test · Installé avec vous par appel · Limité à 20 familles
>
> **Rien de caché.** Votre enfant sait que son téléphone est protégé et voit ce que vous voyez.
>
> **Des nuits calmes, les devoirs d'abord.** À l'heure du coucher, les applications se mettent en
> pause ; le Coran, WhatsApp et les appels restent ouverts.
>
> **Moins de contenus choquants, moins d'inconnus.** Sites pour adultes bloqués, recherche Google
> sécurisée, une alerte quand un numéro inconnu appelle votre enfant.
>
> **On l'installe avec vous.** Un appel avec le fondateur, en français, en arabe ou en anglais.
> Il marche sur le téléphone que votre enfant utilise déjà, sans le réinitialiser.
>
> [Bouton : Je m'inscris]
>
> **Questions fréquentes**
> - *C'est pour quels téléphones ?* Android 11 ou plus récent. Testé sur Samsung et Xiaomi.
>   Pas encore sur iPhone.
> - *Mon enfant le saura-t-il ?* Oui, toujours. Le téléphone affiche en permanence qu'il est
>   protégé et ce que vous pouvez voir. Manara ne lit jamais les messages et n'écoute jamais les appels.
> - *Que devient notre vie privée ?* Pas de publicité, rien n'est revendu. Vous pouvez tout
>   arrêter et supprimer votre compte à tout moment. [Lien : politique de confidentialité]
> - *Et après le test ?* Vous gardez Manara si vous le souhaitez. Le prix après le test reste à
>   fixer, et les familles pionnières seront prévenues avant.
> - *Qui est derrière Manara ?* [Prénom], ingénieur tunisien et père de famille [à adapter].

**Derja**

> # ولّي عايلة رائدة
> **احمي صغيرك على الإنترنت، بالوضوح وعلى حسب قيمنا.**
> بالمجان وقت التست · نركّبوهولك في مكالمة · 20 عايلة برك
>
> **حتى شي مخبّي.** صغيرك يعرف اللي التليفون متاعو محمي، ويشوف شنوّة تشوف إنت.
>
> **ليالي هادية والقراية قبل كل شي.** في وقت الرقاد، التطبيقات تتوقّف؛ القرآن والواتساب
> والمكالمات يقعدو محلولين.
>
> **محتوى خايب أقل، وغرباء أقل.** المواقع متاع الكبار مسكّرة، البحث في Google محمي، وتجيك
> تنبيه كيف نمرو ما تعرفوش يكلّم صغيرك.
>
> **نركّبوهولك مع بعضنا.** مكالمة مع المؤسّس، بالعربي ولا بالفرنساوي ولا بالأنقليزي.
> يخدم على التليفون اللي يستعمل فيه صغيرك توّا، من غير ما تفسخ منو شي.
>
> [زر: نسجّل]

**EN**

> # Become a founding family
> **Protect your child online, openly and in line with our values.**
> Free during the test · Set up with you on a call · Limited to 20 families
>
> **Nothing hidden.** Your child knows the phone is protected, and sees what you can see.
>
> **Calmer nights, homework first.** At bedtime the apps pause; the Quran, WhatsApp and calls
> stay open.
>
> **Less harmful content, fewer strangers.** Adult sites blocked, Google SafeSearch on, and an
> alert when an unknown number calls your child.
>
> **We set it up with you.** A call with the founder, in French, Arabic or English. It works on
> the phone your child already uses, without resetting it.
>
> [Button: Sign up]

---

## 3. Founder post (Facebook, your own profile and parent groups)

Check each group's rules first; some ask for the admin's approval before any app is mentioned.

**FR**

> Je m'appelle [Prénom], je suis [ingénieur / père de X enfants] à [ville].
>
> Comme beaucoup de parents, je voyais nos enfants rester sur TikTok jusqu'à minuit, tomber sur
> des contenus qu'ils ne devraient pas voir, et recevoir des appels de numéros que personne ne
> connaissait. Les outils existants étaient en anglais, compliqués, et pensés pour espionner,
> pas pour protéger.
>
> Alors j'ai créé **Manara** : un contrôle parental pour Android, en arabe, en français et en
> anglais, **où rien n'est caché**. L'enfant sait que son téléphone est protégé. Les applications se
> mettent en pause la nuit, mais le Coran, WhatsApp et les appels restent ouverts. Les sites pour
> adultes sont bloqués, et vous êtes prévenu quand un inconnu appelle votre enfant.
>
> Je cherche **20 familles pionnières** pour le tester **gratuitement**. **Je l'installe avec vous
> par appel**, en français, en arabe ou en anglais (environ 20 minutes), et vous me dites ce qui
> marche et ce qui ne marche pas.
>
> 👉 Inscription : [lien]
> Il faut un téléphone Android 11 ou plus récent (pas encore d'iPhone).

**Derja**

> أنا [الاسم]، [مهندس / بو X صغار] من [المدينة].
>
> كيف برشا والدين، كنت نشوف صغارنا يقعدو على تيك توك حتى نص الليل، يطيحو على حاجات ما
> يلزمهمش يشوفوها، ويجيوهم مكالمات من نمر حتى حد ما يعرفها. والتطبيقات الموجودة بالأنقليزي،
> صعيبة، ومعمولة باش تتجسّس موش باش تحمي.
>
> عملت **منارة**: كونترول أبوي للأندرويد، بالعربي والفرنساوي والأنقليزي، **حتى شي فيه مخبّي**.
> الصغير يعرف اللي التليفون متاعو محمي. التطبيقات تتوقّف في الليل، أما القرآن والواتساب
> والمكالمات يقعدو محلولين. المواقع متاع الكبار مسكّرة، وتجيك تنبيه كيف واحد ما تعرفوش يكلّم صغيرك.
>
> نلوّج على **20 عايلة رائدة** يجرّبوه **بالمجان**. **نركّبوهولك أنا وإياك في مكالمة**، بالعربي
> ولا بالفرنساوي ولا بالأنقليزي (قريب 20 دقيقة)، وإنت تقلي شنوّة يخدم وشنوّة لا.
>
> 👉 التسجيل: [الرابط]
> لازم تليفون أندرويد 11 ولا أحدث (الآيفون مازال لا).

**EN**

> I'm [first name], a [engineer / father of X] in [city].
>
> Like many parents, I watched our children stay on TikTok until midnight, stumble on things they
> shouldn't see, and get calls from numbers nobody knew. The tools out there were in English,
> complicated, and built to spy rather than to protect.
>
> So I built **Manara**: parental controls for Android, in Arabic, French and English, **with
> nothing hidden**. The child knows the phone is protected. Apps pause at night, but the Quran,
> WhatsApp and calls stay open. Adult sites are blocked, and you're told when a stranger calls
> your child.
>
> I'm looking for **20 founding families** to test it **for free**. **I set it up with you on a
> call**, in French, Arabic or English (about 20 minutes), and you tell me what works and what
> doesn't.
>
> 👉 Sign up: [link]
> You need an Android 11 or newer phone (no iPhone yet).

---

## 4. WhatsApp message (your own contacts, class groups)

**FR**
> Salam [Prénom] 🙂 J'ai créé Manara, un contrôle parental pour Android, transparent et
> respectueux de nos valeurs (pause la nuit, sites pour adultes bloqués, alerte si un inconnu
> appelle). Je cherche quelques familles pour le tester gratuitement : je l'installe avec vous par
> appel en 20 minutes. Ça t'intéresse, ou tu connais un parent que ça intéresserait ?
> [vidéo] [lien]

**Derja**
> السلام [الاسم] 🙂 عملت منارة، كونترول أبوي للأندرويد، واضح ويحترم قيمنا (يوقّف في الليل،
> يسكّر المواقع متاع الكبار، ويعلمك كيف واحد ما تعرفوش يكلّم صغيرك). نلوّج على شوية عايلات
> يجرّبوه بالمجان: نركّبوهولك في مكالمة في 20 دقيقة. يهمّك، ولا تعرف والد يهمّو؟
> [الفيديو] [الرابط]

**EN**
> Hi [name] 🙂 I built Manara, parental controls for Android that are open and respect our values
> (apps pause at night, adult sites blocked, an alert if a stranger calls). I'm looking for a few
> families to test it for free: I set it up with you on a 20-minute call. Interested, or know a
> parent who would be?
> [video] [link]

---

## 5. Tester promise (sent on WhatsApp before the call)

**FR**
> **Ce que Manara vous promet pendant le test**
> - C'est gratuit, sans engagement.
> - On l'installe ensemble par appel, et je reste joignable sur WhatsApp en cas de souci.
> - Votre enfant voit toujours que son téléphone est protégé et ce que vous pouvez voir.
> - Vous pouvez tout arrêter quand vous voulez : les règles sont levées, et votre compte et ses
>   données sont supprimés si vous le demandez.
> - Pas de publicité, rien n'est revendu. [Lien : politique de confidentialité]
>
> **Ce que je vous demande**
> - L'utiliser au moins 2 semaines.
> - Répondre à 2 courts questionnaires (après 1 semaine et après 2 semaines).
> - Me dire franchement ce qui ne va pas.
>
> **Pour l'appel, préparez :** le téléphone de l'enfant chargé (ou branché) et sur le Wi-Fi, le
> mot de passe du compte Google de ce téléphone, votre ordinateur ou votre propre téléphone pour
> la console, et environ 20 minutes.

**Derja**
> **شنوّة تضمنلك منارة وقت التست**
> - بالمجان، ومن غير أي التزام.
> - نركّبوه مع بعضنا في مكالمة، ونقعد معاك على الواتساب كان صار مشكل.
> - صغيرك ديما يشوف اللي التليفون متاعو محمي وشنوّة تنجم تشوف.
> - تنجم توقّف كل شي وقت ما تحب: القواعد تتنحّى، والحساب ومعلوماتو يتفسخو كان تطلب.
> - حتى إشهار، وحتى شي ما يتباع.
>
> **شنوّة نطلب منك**
> - تستعملو جمعتين على الأقل.
> - تجاوب على زوز استبيانات قصار (بعد جمعة وبعد جمعتين).
> - تقلي بالصراحة شنوّة ما يمشيش.
>
> **للمكالمة حضّر:** تليفون الصغير مشحون (ولا مبرنشي) وعلى الويفي، الموت دو باس متاع حساب
> Google في التليفون هذاكا، الكمبيوتر ولا التليفون متاعك للكونسول، وقريب 20 دقيقة.

**EN**
> **What Manara promises during the test**
> - It's free, with no commitment.
> - We set it up together on a call, and I'm on WhatsApp if anything goes wrong.
> - Your child always sees that the phone is protected and what you can see.
> - You can stop at any time: the rules are lifted, and your account and its data are deleted if
>   you ask.
> - No ads, nothing is resold.
>
> **What I ask of you**
> - Use it for at least 2 weeks.
> - Answer 2 short surveys (after 1 week and after 2 weeks).
> - Tell me honestly what doesn't work.
>
> **For the call, have ready:** the child's phone charged (or plugged in) and on Wi-Fi, the
> password of that phone's Google account, your computer or own phone for the console, and about
> 20 minutes.

---

## 6. Setup-call checklist (for the founder)

**Before the call**
- [ ] The form says Android 11 or later, and the brand. Samsung and Xiaomi are tested; anything
      else is a test in itself: allow more time, and note what happens.
- [ ] Sent: the tester promise and the "have this ready" list.
- [ ] The parent has created their console account (or does it at the start of the call).

**During the call**
1. **Console:** Add a phone → "the phone already in use". Choose the brand.
2. **Install Manara** from the download page on the child's phone.
   - *Play Protect blocks it* ("Appli bloquée", no "install anyway"): this is the known problem
     (enrollment-xiaomi.md, X1). With the parent's agreement only: Play Store, profile, Play
     Protect, settings, turn scanning off, install, **turn it straight back on**.
3. **Xiaomi, Redmi, POCO:** Paramètres → Applications → *Applications clonées*: turn off every
   clone. If guided setup still waits for "another user", the empty space must be removed too
   (X2: how is still being written up).
4. **Developer options and wireless debugging,** following the console's steps (Xiaomi: tap
   "Version de l'OS" 7 times). Keep the phone **on the charger and unlocked**; the connection drops
   when the screen goes off.
5. **Accounts:** the console lists what has to be removed. **Before removing Google, check the
   parent can sign back in** (password, a phone for the code). Samsung: every account. Xiaomi:
   Google and Google Meet only.
6. **Device owner** ("Manara now manages the phone"), then sign back in to Google first, then
   tap **Finish setup**.
7. **Xiaomi:** Manara's app page → turn on **Démarrage automatique**, battery **Aucune restriction**.
8. **A first rule together,** for example bedtime, and **Lock now** to show it works.
9. Show the parent **What your child sees**, and tell the child together if they're there.

**After the call**
- [ ] The next day: "Is everything working?" on WhatsApp.
- [ ] Note where the parent got stuck, the phone, and the time it took (the usability record, E-10).
- [ ] Day 7 and day 14: send the surveys.

---

## 7. Before publishing

- [ ] The founder decides: name and photo shown, or not. The posts are written for yes.
- [ ] A native reader checks the Derja.
- [ ] A claims check of the final copy against the app on the day (every promise above must be true).
- [ ] The privacy page link works, and the form's data use matches it.

---

# Week 2: advice posts and ads

The advice posts give something useful first and mention Manara only at the end: parents'
groups remove posts that only sell. Post one every two days (30 November to 6 December), in the
groups and on your own page. The hook is the first-trimester exams.

## 8. Advice post 1: sleep before the exams

**FR**
> **Examens du 1er trimestre : le sommeil compte plus que les révisions de minuit**
>
> Un enfant qui dort trop peu retient moins ce qu'il a appris, et le téléphone au lit, c'est
> souvent une heure de sommeil en moins. Trois idées simples pour ces semaines d'examens :
> 1. Un horaire fixe où **tous** les écrans de la maison s'arrêtent, les parents compris.
> 2. Le téléphone qui charge **hors de la chambre**.
> 3. Le soir, garder ce qui apaise : le Coran, un appel à la famille.
>
> C'est pour ça que j'ai conçu Manara ainsi : à l'heure du coucher, les applications se mettent
> en pause, mais le Coran, WhatsApp et les appels restent ouverts. Je cherche des familles pour le
> tester gratuitement, et je l'installe avec vous : [lien]

**Derja**
> **امتحانات الثلاثي الأول: النوم أهم من المراجعة متاع نص الليل**
>
> الصغير اللي ما يرقدش بالقدا يحفظ أقل، والتليفون في الفرش ساعات ياكل ساعة نوم.
> ثلاثة أفكار ساهلة للجمعات هاذم:
> 1. وقت ثابت تتسكّر فيه **الشاشات الكل** في الدار، حتى متاع الكبار.
> 2. التليفون يتشحن **برّا البيت**.
> 3. في الليل، خلّي اللي يهدّي: القرآن، مكالمة مع العايلة.
>
> على هذا عملت منارة هكّا: في وقت الرقاد التطبيقات تتوقّف، أما القرآن والواتساب والمكالمات
> يقعدو محلولين. نلوّج على عايلات يجرّبوه بالمجان، ونركّبهولك معاك: [الرابط]

**EN**
> **First-term exams: sleep matters more than midnight revision**
>
> A child who sleeps too little remembers less of what they learned, and a phone in bed often
> costs an hour of sleep. Three simple ideas for exam weeks:
> 1. A fixed time when **every** screen in the house goes off, parents' too.
> 2. The phone charges **outside the bedroom**.
> 3. In the evening, keep what calms: the Quran, a call to family.
>
> That's why I built Manara this way: at bedtime the apps pause, but the Quran, WhatsApp and calls
> stay open. I'm looking for families to test it for free, and I set it up with you: [link]

If you want a figure: the American Academy of Sleep Medicine recommends 9 to 12 hours for ages 6
to 12 and 8 to 10 for ages 13 to 18 (Paruthi et al., *J Clin Sleep Med*, 2016). Check the
source before quoting it.

## 9. Advice post 2: what a child meets by searching

**FR**
> **Ce que votre enfant trouve en cherchant une image pour un exposé**
>
> Une recherche d'images innocente peut afficher n'importe quoi. Deux réglages gratuits, à faire
> ce soir sur le téléphone de l'enfant :
> 1. **Google SafeSearch** : application Google, photo de profil, Paramètres, SafeSearch, Filtrer.
> 2. **YouTube** : profil, Paramètres, Général, Mode restreint.
>
> Le problème : un enfant peut les désactiver en deux gestes. Manara garde la recherche Google
> sécurisée, bloque les sites pour adultes, et l'enfant sait que c'est en place. Familles
> pionnières, gratuit, installé avec vous : [lien]

**Derja**
> **شنوّة يلقى صغيرك كيف يلوّج على تصويرة لعرض**
>
> بحث بريء على التصاور ينجم يطلّعلو أي شي. زوز ريغلاجات بالمجان، اعملهم الليلة في تليفون الصغير:
> 1. **Google SafeSearch**: تطبيق Google، التصويرة متاع البروفيل، الإعدادات، SafeSearch، فلتر.
> 2. **YouTube**: البروفيل، الإعدادات، عام، الوضع المحظور.
>
> المشكل: الصغير ينجم ينحّيهم في زوز حركات. منارة تخلّي البحث في Google محمي، تسكّر المواقع
> متاع الكبار، والصغير يعرف اللي هذا موجود. عايلات رائدة، بالمجان، نركّبوه معاك: [الرابط]

**EN**
> **What your child finds searching for a picture for homework**
>
> An innocent image search can show anything. Two free settings to change tonight on your child's
> phone:
> 1. **Google SafeSearch**: Google app, profile picture, Settings, SafeSearch, Filter.
> 2. **YouTube**: profile, Settings, General, Restricted Mode.
>
> The catch: a child can turn them off in two taps. Manara keeps Google search safe, blocks adult
> sites, and the child knows it's in place. Founding families, free, set up with you: [link]

The SafeSearch and YouTube menu paths change between app versions: check them on a phone the day
you post.

## 10. Advice post 3: calls from strangers

**FR**
> **Votre enfant reçoit-il des appels de numéros inconnus ?**
>
> Beaucoup d'enfants ne le disent pas. Trois règles à leur apprendre :
> 1. On ne donne jamais son adresse, son école ni ses horaires à quelqu'un qu'on ne connaît pas.
> 2. Un adulte inconnu qui insiste, on raccroche et on le dit à papa ou maman.
> 3. Personne n'a le droit de demander de garder un secret vis-à-vis des parents.
>
> Avec Manara, vous écrivez la liste des numéros que vous connaissez, et vous êtes prévenu quand un
> autre numéro appelle votre enfant. L'enfant voit sur son téléphone que c'est activé.
> Familles pionnières : [lien]

**Derja**
> **صغيرك يجيوه مكالمات من نمر ما يعرفهاش؟**
>
> برشا صغار ما يقولوش. ثلاثة قواعد نعلّموهملهم:
> 1. ما نعطيوش العنوان ولا المكتب ولا الأوقات لحد ما نعرفوهش.
> 2. كبير ما نعرفوهش ويلحّ، نسكّرو ونقولو لبابا ولا ماما.
> 3. حتى حد ما عندو الحق يطلب سرّ نخبّيوه على الوالدين.
>
> بمنارة، تكتب ليستة النمر اللي تعرفهم، وتجيك تنبيه كيف نمرة أخرى تكلّم صغيرك. والصغير يشوف في
> التليفون متاعو اللي هذا مفعّل. عايلات رائدة: [الرابط]

**EN**
> **Does your child get calls from unknown numbers?**
>
> Many children don't say. Three rules to teach them:
> 1. Never give your address, school or timetable to someone you don't know.
> 2. If an adult you don't know insists, hang up and tell Mum or Dad.
> 3. Nobody may ask you to keep a secret from your parents.
>
> With Manara you write down the numbers you know, and you're told when another number calls your
> child. The child sees on their phone that it's on. Founding families: [link]

Unknown-caller alerts need the direct APK, not the Play Store version: fine for the beta, but
don't reuse this post once families install from Play.

## 11. Ads (Meta: Facebook and Instagram)

**Budget:** about 200 TND over weeks 2 to 4: two ads at the same time, then keep the one with the
cheaper cost per sign-up after 5 days.

**Audience:** parents aged 28 to 50. Ad 1 in Tunisia (French and Arabic); ad 2 in France,
Belgium and Canada (French), parenting and Islam interests.

**Meta's rules:** no sentence that asserts a personal trait ("Êtes-vous un parent inquiet ?" is
refused); no before/after; the page must say what the ad says.

**Ad 1: carousel of 4 images** (made, in `docs/marketing/ads/`, French and Arabic, 1080 × 1080)

| Card | French | Arabic |
|---|---|---|
| 1 | La nuit, les applis dorment. Le Coran reste ouvert. | في الليل تنام التطبيقات، ويبقى القرآن مفتوحًا. |
| 2 | Sites pour adultes bloqués. Recherche Google sécurisée. | المواقع المخصّصة للبالغين محجوبة، والبحث الآمن مفعّل. |
| 3 | Un inconnu appelle votre enfant ? Vous êtes prévenu. | رقم مجهول يتصل بطفلك؟ يصلك تنبيه. |
| 4 | Rien de caché. Gratuit pendant le test, installé avec vous. | لا شيء مخفي. مجانية خلال التجربة، ونثبّتها معك. |

- **Primary text (FR):** Manara protège votre enfant sur Internet, sans rien lui cacher. Nous
  cherchons 20 familles pour le tester gratuitement, et nous l'installons avec vous par appel.
- **Primary text (AR):** منارة تحمي طفلك على الإنترنت دون أن تخفي عنه شيئًا. نبحث عن 20 عائلة
  لتجربتها مجانًا، ونثبّتها معك في مكالمة.
- **Headline:** Devenez une famille pionnière / كن من العائلات الرائدة
- **Button:** S'inscrire, to `/beta.html` or `/beta-ar.html`.

**Ad 2: vertical video** for Reels and Stories: the existing
`controller/public/pub/manara-pub-vertical.mp4`, with the same text and button. Watch it once
more before using it: it was made before the beta, so check nothing in it is out of date.

---

# Weeks 3 and 4: schools, flyers, feedback

## 12. The flyer (A5, made)

`docs/marketing/print/flyer-fr.pdf` and `flyer-ar.pdf` print on A5 (148 × 210 mm), with the
background to the edges: ask the print shop for full-bleed printing, or print on A4 and cut. The
`.png` files are the same flyers to send on WhatsApp. The QR code opens `/beta` (French) or
`/beta-ar` (Arabic). Scan one printed copy with a phone before printing many. Rebuild with
`tools/flyer/make.mjs`.

## 13. Letter to a school, a Quran school or a parents' association

Hand it in with a few flyers. Ask for nothing more than passing the flyer to parents, or ten
minutes at a parents' meeting.

**FR**

> Madame, Monsieur,
>
> Je m'appelle [Prénom Nom], je suis [ingénieur / père de famille] à [ville]. J'ai créé Manara, un
> contrôle parental pour les téléphones Android, en arabe, en français et en anglais, pensé pour nos
> familles et nos valeurs.
>
> Beaucoup de parents s'inquiètent du temps que leurs enfants passent sur le téléphone, la nuit
> surtout, des contenus qu'ils peuvent croiser, et des inconnus qui peuvent les contacter. Manara
> permet de mettre les applications en pause la nuit en gardant le Coran, WhatsApp et les appels
> ouverts, de bloquer les sites pour adultes, et de prévenir le parent quand un numéro inconnu appelle
> l'enfant. Rien n'est caché : l'enfant voit toujours sur son téléphone ce qui est en place.
>
> Je cherche 20 familles pour le tester gratuitement, et je l'installe avec chacune par appel. Je
> vous serais reconnaissant de bien vouloir faire connaître cette proposition aux parents, par
> exemple en distribuant le dépliant ci-joint ou en m'accordant quelques minutes lors d'une réunion
> de parents. Je ne demande aucune information sur les élèves : chaque parent s'inscrit lui-même,
> s'il le souhaite.
>
> Je reste à votre disposition pour vous présenter Manara.
>
> Avec mes respectueuses salutations,
> [Prénom Nom] · [téléphone] · [e-mail] · manara-rosy.vercel.app/decouvrir.html

**AR**

> السيدة المديرة / السيد المدير،
>
> أنا [الاسم واللقب]، [مهندس / أب] من [المدينة]. أنشأت «منارة»، وهي رقابة أبوية لهواتف أندرويد،
> بالعربية والفرنسية والإنجليزية، صُمّمت لعائلاتنا ووفق قيمنا.
>
> يقلق كثير من الأولياء من الوقت الذي يقضيه أبناؤهم على الهاتف، ولا سيما في الليل، ومن المحتوى
> الذي قد يصادفونه، ومن الغرباء الذين قد يتصلون بهم. تتيح منارة إيقاف التطبيقات مؤقتًا في الليل
> مع إبقاء القرآن وواتساب والمكالمات متاحة، وحجب المواقع المخصّصة للبالغين، وتنبيه الولي عندما
> يتصل رقم مجهول بطفله. لا شيء مخفي: يرى الطفل دائمًا على هاتفه ما هو مفعّل.
>
> أبحث عن 20 عائلة لتجربتها مجانًا، وأثبّتها مع كل عائلة في مكالمة. وسأكون ممتنًا لو تفضّلتم بإعلام
> الأولياء بهذا العرض، بتوزيع المطوية المرفقة مثلًا، أو بمنحي بضع دقائق خلال اجتماع للأولياء. لا
> أطلب أي معلومة عن التلاميذ: يسجّل كل ولي بنفسه إن رغب في ذلك.
>
> وأبقى على ذمّتكم لتقديم منارة.
>
> مع فائق الاحترام،
> [الاسم واللقب] · [الهاتف] · [البريد الإلكتروني] · manara-rosy.vercel.app/decouvrir-ar.html

## 14. Feedback questionnaires (day 7 and day 14)

Short enough to answer on WhatsApp, or copy them into a form. Send day 7 a week after the setup
call, day 14 a week later. Questions in French; the Arabic follows each.

**Day 7: first week** (5 questions)

1. Sur 10, à quel point l'installation a-t-elle été facile ? Qu'est-ce qui a bloqué ? — من 10، ما مدى سهولة التثبيت؟ ما الذي أوقفك؟
2. Quelles règles avez-vous activées ? — ما القواعد التي فعّلتها؟
3. Votre enfant a-t-il compris ce qui était en place ? Comment l'a-t-il pris ? — هل فهم طفلك ما هو مفعّل؟ كيف تقبّله؟
4. Quelque chose ne marche pas comme prévu ? — هل هناك شيء لا يعمل كما توقعت؟
5. Une seule chose à améliorer ? — شيء واحد نحسّنه؟

**Day 14: two weeks** (6 questions)

1. Utilisez-vous encore Manara ? Sinon, pourquoi ? — هل ما زلت تستعمل منارة؟ إن لا، فلماذا؟
2. Qu'est-ce qui a le plus changé à la maison ? — ما أكثر ما تغيّر في البيت؟
3. Sur 10, recommanderiez-vous Manara à un autre parent ? — من 10، هل تنصح وليًا آخر بمنارة؟
4. Combien seriez-vous prêt à payer par mois, si c'était payant ? (rien / moins de 5 DT / 5 à 10 DT / plus) — كم تقبل أن تدفع شهريًا لو كانت بمقابل؟
5. Pouvons-nous citer votre avis, avec votre prénom ou anonymement ? — هل نستطيع نشر رأيك، باسمك الأول أو دون اسم؟
6. Un parent autour de vous qui aimerait l'essayer ? — هل تعرف وليًا يرغب في تجربتها؟

Question 4 feeds the price decision, still open (`docs/standby.md`). Question 5 needs a clear yes
before any testimonial is published; keep the answer.
