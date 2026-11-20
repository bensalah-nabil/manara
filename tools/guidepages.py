"""Generates the parent guide in three languages: controller/public/guide.html (en), guide-fr.html
and guide-ar.html, from one structure so they can't drift apart.

The console's labels are quoted as the console shows them (controller/src/messages/*.ts); every
sentence matches the app on 2026-11-20. When a label or a feature changes, change it here, then:
python tools/guidepages.py controller/public
"""
import io, sys

OUT = sys.argv[1]
EMAIL = 'nabil.bsalah0@gmail.com'

STYLE = """<style>
  :root { --bg:#f6f1e6; --surface:#fffdf8; --ink:#1b2a24; --muted:#5b675f; --line:#e5dac3; --brand:#0e5a43; --soft:#e2efe8;
    color-scheme: light; font: 16px/1.6 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; color: var(--ink); background: var(--bg); }
  @media (prefers-color-scheme: dark) { :root { --bg:#0a1511; --surface:#10201a; --ink:#ede6d4; --muted:#a9a48d; --line:#24392f; --brand:#d8b24a; --soft:#2a2a17; color-scheme: dark; } }
  body { margin: 0; background: var(--bg); }
  [lang="ar"] body, body[lang="ar"] { font-family: 'Segoe UI', 'Noto Kufi Arabic', 'Noto Sans Arabic', Tahoma, system-ui, sans-serif; line-height: 1.85; }
  main { max-width: 760px; margin: 0 auto; padding: 32px 20px 64px; }
  header { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }
  header > a { color: var(--ink); text-decoration: none; font-weight: 700; font-size: 1.15rem; }
  .langs { margin-inline-start: auto; font-size: 0.95rem; }
  .langs a, .langs strong { margin-inline-start: 12px; }
  h1 { font-size: 1.8rem; margin: 24px 0 4px; }
  h2 { font-size: 1.15rem; margin: 28px 0 8px; }
  h3 { font-size: 1rem; margin: 18px 0 4px; }
  .muted { color: var(--muted); }
  section { background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 4px 20px 16px; margin-top: 16px; }
  .note { background: var(--soft); border-radius: 10px; padding: 12px 14px; }
  nav.toc ol { columns: 2; column-gap: 32px; padding-inline-start: 20px; }
  @media (max-width: 560px) { nav.toc ol { columns: 1; } }
  li { margin: 4px 0; }
  a { color: var(--brand); }
  strong { font-weight: 650; }
  details { border: 1px solid var(--line); border-radius: 10px; padding: 8px 12px; margin: 10px 0; }
  summary { cursor: pointer; font-weight: 650; }
  video { display: block; width: 100%; height: auto; margin-top: 10px; border-radius: 8px; background: #000; }
</style>"""

VIDEOS = {'en': ('English (2 min)', 'Open the video'), 'fr': ('Français (2 min 20)', 'Ouvrir la vidéo'), 'ar': ('العربية (دقيقتان و40 ثانية)', 'افتح الفيديو')}


def video_block(code):
    order = [code] + [c for c in ('fr', 'ar', 'en') if c != code]
    out = []
    for i, c in enumerate(order):
        label, open_text = VIDEOS[c]
        attrs = (' open' if i == 0 else '') + ('' if c == code else f' lang="{c}"') + (' dir="rtl"' if c == 'ar' and code != 'ar' else '') + (' dir="ltr"' if code == 'ar' and c != 'ar' else '')
        out.append(f'''    <details{attrs}>
      <summary>{label}</summary>
      <video controls preload="none" playsinline poster="/guide-video/manara-setup-{c}.jpg" width="1280" height="720">
        <source src="/guide-video/manara-setup-{c}.mp4" type="video/mp4" />
        <a href="/guide-video/manara-setup-{c}.mp4">{open_text}</a>
      </video>
    </details>''')
    return '\n'.join(out)


T = {}

T['en'] = dict(file='guide.html', dir='ltr', title='Manara · Parent guide', langLabel='Language', home='Manara',
    h1='Parent guide', lead="How to set up your child's phone with Manara, choose its rules, and take Manara off again.",
    toc=['How Manara works', 'Before you start', 'Watch it first (video)', 'Create your account', 'Connect the phone', 'Guided setup',
         'Choose the rules', 'Every day', 'Alerts', 'Move or remove Manara', 'If something goes wrong'],
    download='/download.html', privacy='/privacy.html', beta='/beta-en', features='/features-en',
    body=f"""
  <section id="how">
    <h2>How Manara works</h2>
    <p>Manara manages your child's Android phone openly. The phone always shows a notice saying it is managed, and opening
      Manara on it shows exactly which rules are on and what you can see. There is no hidden mode. Manara never reads
      messages, never sees photos and never listens to calls.</p>
    <p>You set the rules in the <strong>console</strong>, a web page you open on your own phone or computer. Manara on the
      child's phone applies them, and keeps applying them without a connection. To see what it does first, watch
      <a href="/features-en">the short videos</a>.</p>
  </section>

  <section id="before">
    <h2>Before you start</h2>
    <p>Setup takes about 15 minutes, longer on a Samsung. No app is uninstalled and no app data is lost. Prepare:</p>
    <ul>
      <li>The phone runs <strong>Android 11 or newer</strong>, is on <strong>Wi-Fi</strong>, and is charged above 50%, or on its
        charger. No computer or cable is needed.</li>
      <li><strong>On a Samsung</strong> every account is removed for a moment, and <strong>on a Xiaomi</strong> the Google (and
        Google Meet) account; other brands are not tested yet. They are signed back in at the end. Check now that you can get
        back in to the phone's <strong>Google account</strong> without remembering its password: a
        <a href="https://g.co/passkeys">passkey</a> on your own phone, a code by SMS to its
        <a href="https://myaccount.google.com/signinoptions/rescuephone">recovery phone</a>, or a Family Link password reset if
        you created the account. Manara never sees or stores passwords.</li>
      <li><strong>A new phone, with nothing on it?</strong> The console's other way scans one QR code instead, but it
        <strong>erases the phone</strong>: never use it on a phone your child already uses.</li>
      <li>As a precaution, <strong>back up chats</strong> (for WhatsApp: Settings, Chats, Chat backup).</li>
      <li>On a Samsung, a <strong>Secure Folder</strong> must be removed first: move anything you need out of it. On a Xiaomi,
        turn off <strong>cloned apps</strong> first (Settings, Apps, Cloned apps): the clone and its data are deleted, the main
        app stays.</li>
      <li>On a Xiaomi, once Manara is installed, turn on <strong>Autostart</strong> for it and set its battery saver to
        <strong>No restrictions</strong> (Settings, Apps, Manage apps, Manara), or it stops after every restart.</li>
      <li>Tell your child the phone will be managed, and why.</li>
    </ul>
    <p class="note">Rather not do it alone? <a href="/beta-en">Join the founding families</a>: we set it up with you on a call.</p>
  </section>

  <section id="video">
    <h2>Watch it first (video)</h2>
    <p>A short video shows setting up a phone your child already uses, step by step. The screens are drawings and every name
      in them is invented; your phone's menus may be worded slightly differently.</p>
{video_block('en')}
  </section>

  <section id="account">
    <h2>1. Create your account</h2>
    <p>Open the <a href="/">console</a>, choose <strong>New here? Create an account</strong>, and enter your email address and a
      password of at least 8 characters. Use an address you check: password-reset links and alerts go there.</p>
  </section>

  <section id="connect">
    <h2>2. Connect the phone</h2>
    <ol>
      <li>Install <strong>Manara</strong> on your child's phone: open <a href="/download.html">the download page</a> on that
        phone. The console's <strong>+ Add a phone</strong> also shows a QR code that opens it.</li>
      <li>In the console, choose <strong>+ Add a phone</strong>. Confirm the three statements (you are the parent or guardian,
        the child is a minor, the child will be told), then choose <strong>The phone your child already uses</strong>.</li>
      <li>Follow the console's steps for the phone's brand to turn on <strong>Wireless debugging</strong>: usually Settings,
        About phone, tap <strong>Build number</strong> seven times (on a Xiaomi: <strong>OS version</strong>), then Developer
        options, Wireless debugging. If a menu name differs, search for it in Settings.</li>
      <li>The console shows a <strong>connection code</strong>, as a QR code and as text. On the phone, open Manara and tap
        <strong>Scan the code</strong>, or type it.</li>
    </ol>
  </section>

  <section id="setup">
    <h2>3. Guided setup</h2>
    <ol>
      <li>On the phone, tap <strong>Start guided setup</strong> in Manara, then open <strong>Wireless debugging</strong>.
        <strong>Leave the phone on that screen, unlocked and charging</strong>: Android stops pairing the moment you leave it,
        and a phone left to sleep loses the connection.</li>
      <li>In the console, open the phone's page and pair it: with <strong>Pair device with QR code</strong> on the phone, or
        <strong>Pair device with pairing code</strong> and the 6 digits typed into the console.</li>
      <li>Setup then runs by itself, and the console shows each step. Manara pauses the apps that hold an account for a few
        seconds, becomes the phone's manager, and turns them back on.</li>
      <li>If Android also needs accounts removed (Samsung, Xiaomi), the console lists them, shows how you'll get back in to
        each one, and asks you to confirm first. Then tap <strong>Open accounts</strong> in Manara's notice on the phone and
        remove them. Don't uninstall any app.</li>
      <li>At the end, sign back in, Google first, from Manara's notice. Apps like Facebook usually come back by themselves.
        Then choose <strong>Finish setup</strong> in the console.</li>
    </ol>
    <p class="note">If the phone restarts during setup, before Manara manages it, setup stops: the console says so. Open Manara
      and start guided setup again; accounts already removed stay removed.</p>
  </section>

  <section id="rules">
    <h2>4. Choose the rules</h2>
    <p>Open the phone in the console. Every rule is off until you turn it on, and the child sees each one on the phone.
      To start quickly, choose your child's age at the top of the <strong>Rules</strong> tab.</p>
    <h3>Rules tab</h3>
    <ul>
      <li><strong>Adult sites</strong>: blocked in Chrome and in apps; other browsers are closed, and Google stays on SafeSearch.</li>
      <li><strong>Ads in games and apps</strong>: stops most ad networks.</li>
      <li><strong>Family values</strong>: well-known gambling, dating and alcohol websites, in Chrome.</li>
      <li><strong>Social media</strong> and <strong>Games</strong>: one daily budget each.</li>
      <li><strong>Bedtime</strong>: at night apps pause; calls, texts, WhatsApp, Quran apps, the clock and Settings still work.</li>
      <li><strong>Keep the rules on</strong>: no factory reset from Settings, safe mode, new users or clock changes. On by default.</li>
      <li>Under <strong>More options</strong>: limits app by app, other pause times (school, prayer), Chrome settings, each
        setting to lock (VPN, Private DNS, developer options), and <strong>Wait before loosening</strong>: a loosened rule waits
        before it reaches the phone, and you can cancel it meanwhile.</li>
    </ul>
    <h3>What you see tab</h3>
    <p>What the phone sends you, each one only while you turn it on, and listed on the child's phone while it is:</p>
    <ul>
      <li><strong>Location</strong>, at the interval you choose.</li>
      <li><strong>Daily app usage</strong>: minutes per app.</li>
      <li><strong>Call history</strong> and <strong>Calls from numbers you don't know</strong> (you list the numbers you know):
        Android, with the version downloaded from the website.</li>
      <li><strong>Apps installed or removed</strong>: their name and the time.</li>
    </ul>
    <h3>This phone tab</h3>
    <ul><li>Your child's name and a color, and removing Manara (see 7).</li></ul>
    <p>A saved rule reaches the phone within seconds. The console says when it can't, and when the phone will get it instead.</p>
  </section>

  <section id="everyday">
    <h2>5. Every day</h2>
    <ul>
      <li><strong>Lock now</strong>, at the top of the phone's page, locks the phone in a few seconds.</li>
      <li>The <strong>Activity</strong> tab shows whether every protection is working, screen time, time by app, calls and apps
        installed or removed (for what you turned on).</li>
      <li>The list of phones shows when each phone last checked in.</li>
    </ul>
  </section>

  <section id="alerts">
    <h2>6. Alerts</h2>
    <p>Manara emails you when:</p>
    <ul>
      <li>a phone hasn't checked in for 12 hours: it may be off, out of battery or offline, or Manara may have been stopped;</li>
      <li>a protection stops working, for example Usage access turned off;</li>
      <li>a number you don't know calls your child, if you turned that on.</li>
    </ul>
    <p>And every Monday morning, an email says last week's report is ready (you can turn it off under Account).</p>
    <p class="muted">You get one email per problem, not one at every check-in. Check your spam folder the first time.</p>
  </section>

  <section id="release">
    <h2>7. Move or remove Manara</h2>
    <p>Only you can do this. Manara on the phone has no button for it, so your child can't remove it.</p>
    <ul>
      <li><strong>Remove Manara from this phone</strong> (This phone tab): within seconds, or at the phone's next check-in if
        it is offline, every rule is lifted and the phone becomes an ordinary phone again.</li>
      <li><strong>Move to another account</strong>: for example, to the other parent's account. The phone keeps its setup.</li>
      <li><strong>Phone can't be reached?</strong> Choose <strong>Show release code</strong> and type the code on the phone,
        in Manara, under <strong>Release this phone</strong>. Then choose <strong>Remove from my list</strong>.</li>
      <li>A lost or reset phone: <strong>Remove from my list</strong>.</li>
    </ul>
    <p>To delete your account and all its data, see <a href="/delete-account.html">Delete your account</a>.</p>
  </section>

  <section id="trouble">
    <h2>If something goes wrong</h2>
    <h3>Play Protect blocks the installation</h3>
    <p>On some phones Google Play Protect blocks Manara outright. Don't change a security setting on your own: write to us, or
      <a href="/beta-en">join the founding families</a>, and we install it with you.</p>
    <h3>Setup stays on "pairing"</h3>
    <p>The phone must stay on the Wireless debugging screen until pairing is done. Open it again, choose the QR code or the
      pairing code again, and try once more. The phone and the console must both be online.</p>
    <h3>The phone shows "Not reporting"</h3>
    <p>The phone hasn't checked in for 2 hours. Check that it is on and online. Opening Manara on it and tapping
      <strong>Check now</strong> makes it check in at once. On some phones, battery saving stops apps in the background:
      allow Manara to run without restrictions in the phone's battery settings (on a Xiaomi, also turn on Autostart).</p>
    <h3>Forgot your password</h3>
    <p>On the sign-in page, choose <strong>Forgot your password?</strong>. The emailed link works for one hour.</p>
    <h3>Anything else</h3>
    <p>Write to <a href="mailto:{EMAIL}">{EMAIL}</a>.</p>
  </section>

  <p class="muted"><a href="/privacy.html">Privacy policy</a> · <a href="/delete-account.html">Delete your account</a></p>""")

T['fr'] = dict(file='guide-fr.html', dir='ltr', title='Manara · Guide des parents', langLabel='Langue', home='Manara',
    h1='Guide des parents', lead="Comment installer Manara sur le téléphone de votre enfant, choisir ses règles, et retirer Manara.",
    toc=['Comment fonctionne Manara', 'Avant de commencer', "Regarder d'abord (vidéo)", 'Créer votre compte', 'Connecter le téléphone',
         'Installation guidée', 'Choisir les règles', 'Au quotidien', 'Les alertes', 'Déplacer ou retirer Manara', 'En cas de problème'],
    body=f"""
  <section id="how">
    <h2>Comment fonctionne Manara</h2>
    <p>Manara gère le téléphone Android de votre enfant, ouvertement. Le téléphone affiche toujours un avis indiquant qu'il est
      géré, et Manara y montre exactement quelles règles sont en place et ce que vous pouvez voir. Il n'y a pas de mode caché.
      Manara ne lit jamais les messages, ne voit jamais les photos et n'écoute jamais les appels.</p>
    <p>Vous réglez les règles dans la <strong>console</strong>, une page web que vous ouvrez sur votre propre téléphone ou
      ordinateur. Manara, sur le téléphone de l'enfant, les applique, même sans connexion. Pour voir d'abord ce qu'il fait,
      regardez <a href="/features">les courtes vidéos</a>.</p>
  </section>

  <section id="before">
    <h2>Avant de commencer</h2>
    <p>L'installation prend environ 15 minutes, un peu plus sur un Samsung. Aucune application n'est désinstallée et aucune
      donnée n'est perdue. Préparez :</p>
    <ul>
      <li>Le téléphone est sous <strong>Android 11 ou plus récent</strong>, sur le <strong>Wi-Fi</strong>, et chargé à plus de
        50 %, ou branché. Ni ordinateur ni câble.</li>
      <li><strong>Sur un Samsung</strong>, tous les comptes sont retirés un moment, et <strong>sur un Xiaomi</strong> le compte
        Google (et Google Meet) ; les autres marques ne sont pas encore testées. On s'y reconnecte à la fin. Vérifiez dès
        maintenant que vous pouvez revenir dans le <strong>compte Google</strong> du téléphone sans vous souvenir de son mot de
        passe : une <a href="https://g.co/passkeys">clé d'accès</a> sur votre propre téléphone, un code par SMS sur son
        <a href="https://myaccount.google.com/signinoptions/rescuephone">téléphone de récupération</a>, ou une réinitialisation
        par Family Link si vous avez créé le compte. Manara ne voit ni ne garde jamais de mot de passe.</li>
      <li><strong>Un téléphone neuf, sans rien dessus ?</strong> L'autre méthode de la console scanne un seul code QR, mais elle
        <strong>efface le téléphone</strong> : ne l'utilisez jamais sur un téléphone que votre enfant utilise déjà.</li>
      <li>Par précaution, <strong>sauvegardez les discussions</strong> (pour WhatsApp : Paramètres, Discussions, Sauvegarde).</li>
      <li>Sur un Samsung, le <strong>Dossier sécurisé</strong> doit d'abord être supprimé : sortez-en ce dont vous avez besoin.
        Sur un Xiaomi, désactivez d'abord les <strong>applications clonées</strong> (Paramètres, Applications, Applications
        clonées) : le clone et ses données sont supprimés, l'application principale reste.</li>
      <li>Sur un Xiaomi, une fois Manara installé, activez son <strong>Démarrage automatique</strong> et réglez son économiseur de
        batterie sur <strong>Aucune restriction</strong> (Paramètres, Applications, Gérer les applications, Manara), sinon il
        s'arrête à chaque redémarrage.</li>
      <li>Dites à votre enfant que le téléphone sera géré, et pourquoi.</li>
    </ul>
    <p class="note">Vous préférez ne pas le faire seul ? <a href="/beta">Rejoignez les familles pionnières</a> : nous l'installons
      avec vous par appel.</p>
  </section>

  <section id="video">
    <h2>Regarder d'abord (vidéo)</h2>
    <p>Une courte vidéo montre, étape par étape, l'installation sur un téléphone que votre enfant utilise déjà. Les écrans sont
      des dessins et tous les noms sont inventés ; les menus de votre téléphone peuvent être formulés un peu différemment.</p>
{video_block('fr')}
  </section>

  <section id="account">
    <h2>1. Créer votre compte</h2>
    <p>Ouvrez la <a href="/">console</a>, choisissez <strong>Nouveau ici ? Créer un compte</strong>, et saisissez votre adresse
      e-mail et un mot de passe d'au moins 8 caractères. Prenez une adresse que vous consultez : les liens de réinitialisation
      et les alertes y arrivent.</p>
  </section>

  <section id="connect">
    <h2>2. Connecter le téléphone</h2>
    <ol>
      <li>Installez <strong>Manara</strong> sur le téléphone de votre enfant : ouvrez <a href="/download-fr.html">la page de
        téléchargement</a> sur ce téléphone. Le bouton <strong>+ Ajouter un téléphone</strong> de la console affiche aussi un
        code QR qui l'ouvre.</li>
      <li>Dans la console, choisissez <strong>+ Ajouter un téléphone</strong>. Confirmez les trois déclarations (vous êtes le
        parent ou le tuteur, l'enfant est mineur, l'enfant sera prévenu), puis choisissez <strong>Le téléphone que votre enfant
        utilise déjà</strong>.</li>
      <li>Suivez les étapes de la console pour la marque du téléphone afin d'activer le <strong>Débogage sans fil</strong> :
        généralement Paramètres, À propos du téléphone, touchez sept fois <strong>Numéro de version</strong> (sur un Xiaomi :
        <strong>Version de l'OS</strong>), puis Options pour les développeurs, Débogage sans fil. Si un menu porte un autre nom,
        cherchez-le dans les Paramètres.</li>
      <li>La console affiche un <strong>code de connexion</strong>, en code QR et en texte. Sur le téléphone, ouvrez Manara et
        touchez <strong>Scanner le code</strong>, ou saisissez-le.</li>
    </ol>
  </section>

  <section id="setup">
    <h2>3. Installation guidée</h2>
    <ol>
      <li>Sur le téléphone, touchez <strong>Démarrer l'installation guidée</strong> dans Manara, puis ouvrez le <strong>Débogage
        sans fil</strong>. <strong>Laissez le téléphone sur cet écran, déverrouillé et en charge</strong> : Android arrête
        l'association dès que vous le quittez, et un téléphone qui se met en veille perd la connexion.</li>
      <li>Dans la console, ouvrez la page du téléphone et associez-le : avec <strong>Associer avec un code QR</strong> sur le
        téléphone, ou <strong>Associer avec un code d'association</strong> et les 6 chiffres saisis dans la console.</li>
      <li>L'installation continue alors toute seule, et la console montre chaque étape. Manara met en pause quelques secondes les
        applications qui ont un compte, devient gestionnaire du téléphone, puis les réactive.</li>
      <li>Si Android exige aussi de retirer des comptes (Samsung, Xiaomi), la console les liste, montre comment revenir dans
        chacun, et vous demande d'abord de confirmer. Touchez alors <strong>Ouvrir les comptes</strong> dans la notification de
        Manara sur le téléphone, et retirez-les. Ne désinstallez aucune application.</li>
      <li>À la fin, reconnectez-vous, Google en premier, depuis la notification de Manara. Les applications comme Facebook
        reviennent en général toutes seules. Puis choisissez <strong>Terminer l'installation</strong> dans la console.</li>
    </ol>
    <p class="note">Si le téléphone redémarre pendant l'installation, avant que Manara le gère, l'installation s'arrête : la
      console le dit. Ouvrez Manara et relancez l'installation guidée ; les comptes déjà retirés le restent.</p>
  </section>

  <section id="rules">
    <h2>4. Choisir les règles</h2>
    <p>Ouvrez le téléphone dans la console. Chaque règle est désactivée tant que vous ne l'activez pas, et l'enfant la voit sur
      le téléphone. Pour démarrer vite, choisissez l'âge de votre enfant en haut de l'onglet <strong>Règles</strong>.</p>
    <h3>Onglet Règles</h3>
    <ul>
      <li><strong>Sites pour adultes</strong> : bloqués dans Chrome et dans les applications ; les autres navigateurs sont
        fermés, et Google reste en recherche sécurisée.</li>
      <li><strong>Publicités dans les jeux et applications</strong> : arrête la plupart des régies publicitaires.</li>
      <li><strong>Valeurs familiales</strong> : sites connus de jeux d'argent, de rencontres et d'alcool, dans Chrome.</li>
      <li><strong>Réseaux sociaux</strong> et <strong>Jeux</strong> : un budget quotidien chacun.</li>
      <li><strong>Heure du coucher</strong> : la nuit, les applications sont en pause ; les appels, les SMS, WhatsApp, les
        applications de Coran, l'horloge et les Paramètres restent utilisables.</li>
      <li><strong>Garder les règles en place</strong> : pas de réinitialisation depuis les Paramètres, de mode sans échec, de
        nouvel utilisateur ni de changement d'heure. Activé par défaut.</li>
      <li>Dans <strong>Plus d'options</strong> : des limites application par application, d'autres moments de pause (école,
        prière), les réglages de Chrome, chaque réglage à verrouiller (VPN, DNS privé, options pour les développeurs), et
        l'<strong>Attente avant assouplissement</strong> : une règle assouplie attend avant d'arriver sur le téléphone, et vous
        pouvez l'annuler entre-temps.</li>
    </ul>
    <h3>Onglet Ce que vous voyez</h3>
    <p>Ce que le téléphone vous envoie, chaque élément seulement si vous l'activez, et affiché sur le téléphone de l'enfant tant
      qu'il est activé :</p>
    <ul>
      <li>La <strong>position</strong>, à l'intervalle que vous choisissez.</li>
      <li>L'<strong>utilisation quotidienne des applications</strong> : les minutes par application.</li>
      <li>L'<strong>historique des appels</strong> et les <strong>appels de numéros inconnus</strong> (vous écrivez les numéros
        que vous connaissez) : sur Android, avec la version téléchargée depuis le site.</li>
      <li>Les <strong>applications installées ou supprimées</strong> : leur nom et l'heure.</li>
    </ul>
    <h3>Onglet Ce téléphone</h3>
    <ul><li>Le prénom de votre enfant et une couleur, et le retrait de Manara (voir 7).</li></ul>
    <p>Une règle enregistrée arrive sur le téléphone en quelques secondes. La console dit quand ce n'est pas possible, et quand le
      téléphone la recevra.</p>
  </section>

  <section id="everyday">
    <h2>5. Au quotidien</h2>
    <ul>
      <li><strong>Verrouiller maintenant</strong>, en haut de la page du téléphone, verrouille le téléphone en quelques secondes.</li>
      <li>L'onglet <strong>Activité</strong> montre si chaque protection fonctionne, le temps d'écran, le temps par application,
        les appels et les applications installées ou supprimées (pour ce que vous avez activé).</li>
      <li>La liste des téléphones montre quand chacun a donné des nouvelles pour la dernière fois.</li>
    </ul>
  </section>

  <section id="alerts">
    <h2>6. Les alertes</h2>
    <p>Manara vous écrit quand :</p>
    <ul>
      <li>un téléphone n'a pas donné de nouvelles depuis 12 heures : il est peut-être éteint, sans batterie ou hors ligne, ou
        Manara a peut-être été arrêté ;</li>
      <li>une protection ne fonctionne plus, par exemple l'accès aux données d'utilisation désactivé ;</li>
      <li>un numéro que vous ne connaissez pas appelle votre enfant, si vous l'avez activé.</li>
    </ul>
    <p>Et chaque lundi matin, un e-mail indique que le bilan de la semaine est prêt (désactivable dans Compte).</p>
    <p class="muted">Un seul e-mail par problème, pas un à chaque nouvelle. Regardez dans vos spams la première fois.</p>
  </section>

  <section id="release">
    <h2>7. Déplacer ou retirer Manara</h2>
    <p>Vous seul pouvez le faire. Manara n'a pas de bouton pour cela sur le téléphone : votre enfant ne peut pas le retirer.</p>
    <ul>
      <li><strong>Retirer Manara de ce téléphone</strong> (onglet Ce téléphone) : en quelques secondes, ou à la prochaine
        connexion du téléphone s'il est hors ligne, toutes les règles sont levées et le téléphone redevient ordinaire.</li>
      <li><strong>Déplacer vers un autre compte</strong> : par exemple vers le compte de l'autre parent. Le téléphone garde son
        installation.</li>
      <li><strong>Le téléphone est injoignable ?</strong> Choisissez <strong>Afficher le code de libération</strong> et saisissez
        le code sur le téléphone, dans Manara, sous <strong>Libérer ce téléphone</strong>. Puis choisissez
        <strong>Retirer de ma liste</strong>.</li>
      <li>Un téléphone perdu ou réinitialisé : <strong>Retirer de ma liste</strong>.</li>
    </ul>
    <p>Pour supprimer votre compte et toutes ses données, voir <a href="/delete-account.html">Supprimer votre compte</a>.</p>
  </section>

  <section id="trouble">
    <h2>En cas de problème</h2>
    <h3>Play Protect bloque l'installation</h3>
    <p>Sur certains téléphones, Google Play Protect bloque complètement Manara. Ne changez aucun réglage de sécurité seul :
      écrivez-nous, ou <a href="/beta">rejoignez les familles pionnières</a>, et nous l'installons avec vous.</p>
    <h3>L'installation reste sur « association »</h3>
    <p>Le téléphone doit rester sur l'écran Débogage sans fil jusqu'à la fin de l'association. Rouvrez-le, choisissez à nouveau
      le code QR ou le code d'association, et réessayez. Le téléphone et la console doivent tous deux être en ligne.</p>
    <h3>Le téléphone affiche « Ne donne plus de nouvelles »</h3>
    <p>Le téléphone n'a pas donné de nouvelles depuis 2 heures. Vérifiez qu'il est allumé et en ligne. Ouvrir Manara et toucher
      <strong>Vérifier maintenant</strong> le fait se connecter tout de suite. Sur certains téléphones, l'économie de batterie
      arrête les applications en arrière-plan : autorisez Manara à fonctionner sans restriction dans les réglages de batterie
      (sur un Xiaomi, activez aussi le Démarrage automatique).</p>
    <h3>Mot de passe oublié</h3>
    <p>Sur la page de connexion, choisissez <strong>Mot de passe oublié ?</strong>. Le lien envoyé par e-mail est valable une heure.</p>
    <h3>Autre chose</h3>
    <p>Écrivez à <a href="mailto:{EMAIL}">{EMAIL}</a>.</p>
  </section>

  <p class="muted"><a href="/privacy-fr.html">Politique de confidentialité</a> · <a href="/delete-account.html">Supprimer votre compte</a></p>""")

T['ar'] = dict(file='guide-ar.html', dir='rtl', title='منارة · دليل الوالدين', langLabel='اللغة', home='منارة',
    h1='دليل الوالدين', lead='كيف تثبّت منارة على هاتف طفلك، وتختار قواعده، وتزيل منارة.',
    toc=['كيف تعمل منارة', 'قبل أن تبدأ', 'شاهد أولًا (فيديو)', 'أنشئ حسابك', 'اربط الهاتف', 'الإعداد الموجَّه',
         'اختر القواعد', 'كل يوم', 'التنبيهات', 'نقل منارة أو إزالتها', 'إذا حدثت مشكلة'],
    body=f"""
  <section id="how">
    <h2>كيف تعمل منارة</h2>
    <p>تدير منارة هاتف طفلك الأندرويد بوضوح. يعرض الهاتف دائمًا إشعارًا بأنه خاضع للإشراف، وتُظهر منارة عليه بالضبط القواعد
      المفعّلة وما يمكنك رؤيته. لا يوجد وضع مخفي. منارة لا تقرأ الرسائل، ولا ترى الصور، ولا تستمع إلى المكالمات أبدًا.</p>
    <p>تضبط القواعد في <strong>لوحة التحكم</strong>، وهي صفحة ويب تفتحها على هاتفك أو حاسوبك. وتطبّقها منارة على هاتف الطفل،
      حتى دون اتصال. لترى أولًا ما تفعله، شاهد <a href="/features-ar">الفيديوهات القصيرة</a>.</p>
  </section>

  <section id="before">
    <h2>قبل أن تبدأ</h2>
    <p>يستغرق الإعداد نحو 15 دقيقة، وأكثر قليلًا على سامسونغ. لا يُحذف أي تطبيق ولا تضيع أي بيانات. جهّز:</p>
    <ul>
      <li>الهاتف بنظام <strong>أندرويد 11 أو أحدث</strong>، ومتصل بشبكة <strong>Wi-Fi</strong>، ومشحون بأكثر من 50% أو موصول
        بالشاحن. لا حاجة إلى حاسوب ولا إلى كابل.</li>
      <li><strong>على سامسونغ</strong> تُزال كل الحسابات لحظة، و<strong>على شاومي</strong> حساب Google (وGoogle Meet)؛ ولم تُختبر
        العلامات الأخرى بعد. ويُعاد تسجيل الدخول إليها في النهاية. تأكّد الآن أنك تستطيع العودة إلى <strong>حساب Google</strong>
        على الهاتف دون تذكّر كلمة مروره: <a href="https://g.co/passkeys">مفتاح مرور</a> على هاتفك، أو رمز بالرسائل القصيرة إلى
        <a href="https://myaccount.google.com/signinoptions/rescuephone">هاتف الاسترداد</a>، أو إعادة تعيين عبر Family Link إن كنت
        أنشأت الحساب. منارة لا ترى كلمات المرور ولا تحفظها أبدًا.</li>
      <li><strong>هاتف جديد، لا شيء عليه؟</strong> الطريقة الأخرى في لوحة التحكم تمسح رمز QR واحدًا، لكنها <strong>تمحو
        الهاتف</strong>: لا تستعملها أبدًا على هاتف يستعمله طفلك.</li>
      <li>احتياطًا، <strong>احفظ نسخة من المحادثات</strong> (في واتساب: الإعدادات، الدردشات، النسخ الاحتياطي).</li>
      <li>على سامسونغ يجب أولًا حذف <strong>المجلد الآمن</strong>: أخرج منه ما تحتاجه. وعلى شاومي، أوقف أولًا
        <strong>التطبيقات المستنسخة</strong> (الإعدادات، التطبيقات، التطبيقات المستنسخة): تُحذف النسخة وبياناتها، ويبقى التطبيق الأصلي.</li>
      <li>على شاومي، بعد تثبيت منارة، فعّل لها <strong>التشغيل التلقائي</strong> واضبط موفّر البطارية على <strong>بلا قيود</strong>
        (الإعدادات، التطبيقات، إدارة التطبيقات، منارة)، وإلا فإنها تتوقف بعد كل إعادة تشغيل.</li>
      <li>أخبر طفلك أن الهاتف سيكون خاضعًا للإشراف، ولماذا.</li>
    </ul>
    <p class="note">تفضّل ألّا تفعل ذلك وحدك؟ <a href="/beta-ar">انضم إلى العائلات الرائدة</a>: نثبّتها معك في مكالمة.</p>
  </section>

  <section id="video">
    <h2>شاهد أولًا (فيديو)</h2>
    <p>فيديو قصير يعرض، خطوة بخطوة، الإعداد على هاتف يستعمله طفلك. الشاشات رسوم وكل الأسماء مختلَقة؛ وقد تختلف تسميات القوائم
      في هاتفك قليلًا.</p>
{video_block('ar')}
  </section>

  <section id="account">
    <h2>1. أنشئ حسابك</h2>
    <p>افتح <a href="/">لوحة التحكم</a>، واختر <strong>جديد هنا؟ أنشئ حسابًا</strong>، وأدخل بريدك الإلكتروني وكلمة مرور من 8
      أحرف على الأقل. استعمل عنوانًا تتفقده: إليه تصل روابط إعادة التعيين والتنبيهات.</p>
  </section>

  <section id="connect">
    <h2>2. اربط الهاتف</h2>
    <ol>
      <li>ثبّت <strong>منارة</strong> على هاتف طفلك: افتح <a href="/download-ar.html">صفحة التنزيل</a> على ذلك الهاتف. ويعرض زر
        <strong>+ إضافة هاتف</strong> في لوحة التحكم أيضًا رمز QR يفتحها.</li>
      <li>في لوحة التحكم، اختر <strong>+ إضافة هاتف</strong>. أكّد التصريحات الثلاثة (أنت الوالد أو الوصي، والطفل قاصر، وسيُخبَر
        الطفل)، ثم اختر <strong>الهاتف الذي يستعمله طفلك الآن</strong>.</li>
      <li>اتبع خطوات لوحة التحكم الخاصة بعلامة الهاتف لتفعيل <strong>تصحيح الأخطاء اللاسلكي</strong>: عادةً الإعدادات، حول الهاتف،
        المس <strong>رقم الإصدار</strong> سبع مرات (على شاومي: <strong>إصدار النظام</strong>)، ثم خيارات المطوّر، تصحيح الأخطاء
        اللاسلكي. إذا اختلف اسم قائمة، فابحث عنه في الإعدادات.</li>
      <li>تعرض لوحة التحكم <strong>رمز ربط</strong>، كرمز QR وكنص. على الهاتف، افتح منارة والمس <strong>امسح الرمز</strong>، أو اكتبه.</li>
    </ol>
  </section>

  <section id="setup">
    <h2>3. الإعداد الموجَّه</h2>
    <ol>
      <li>على الهاتف، المس <strong>بدء الإعداد الموجَّه</strong> في منارة، ثم افتح <strong>تصحيح الأخطاء اللاسلكي</strong>.
        <strong>اترك الهاتف على تلك الشاشة، غير مقفل وموصولًا بالشاحن</strong>: يوقف أندرويد الإقران فور مغادرتها، والهاتف الذي
        ينام يفقد الاتصال.</li>
      <li>في لوحة التحكم، افتح صفحة الهاتف وأقرنه: عبر <strong>إقران الجهاز برمز QR</strong> على الهاتف، أو <strong>إقران الجهاز
        برمز الإقران</strong> وكتابة الأرقام الستة في لوحة التحكم.</li>
      <li>يتابع الإعداد بعدها وحده، وتعرض لوحة التحكم كل خطوة. توقف منارة لبضع ثوانٍ التطبيقات التي لها حساب، وتصبح مديرة الهاتف،
        ثم تعيد تشغيلها.</li>
      <li>إذا تطلّب أندرويد أيضًا إزالة حسابات (سامسونغ، شاومي)، تعرضها لوحة التحكم، وتبيّن كيف تعود إلى كل منها، وتطلب تأكيدك
        أولًا. المس عندها <strong>فتح الحسابات</strong> في إشعار منارة على الهاتف، وأزلها. لا تحذف أي تطبيق.</li>
      <li>في النهاية، سجّل الدخول من جديد، Google أولًا، من إشعار منارة. تعود تطبيقات مثل فيسبوك عادةً وحدها. ثم اختر
        <strong>إنهاء الإعداد</strong> في لوحة التحكم.</li>
    </ol>
    <p class="note">إذا أُعيد تشغيل الهاتف أثناء الإعداد، قبل أن تديره منارة، يتوقف الإعداد: وتقول لوحة التحكم ذلك. افتح منارة
      وابدأ الإعداد الموجَّه من جديد؛ الحسابات التي أُزيلت تبقى مُزالة.</p>
  </section>

  <section id="rules">
    <h2>4. اختر القواعد</h2>
    <p>افتح الهاتف في لوحة التحكم. كل قاعدة متوقفة حتى تفعّلها، ويراها الطفل على الهاتف. للبدء بسرعة، اختر عمر طفلك في أعلى
      تبويب <strong>القواعد</strong>.</p>
    <h3>تبويب القواعد</h3>
    <ul>
      <li><strong>مواقع البالغين</strong>: محجوبة في Chrome وفي التطبيقات؛ المتصفحات الأخرى مغلقة، ويبقى بحث Google آمنًا.</li>
      <li><strong>الإعلانات في الألعاب والتطبيقات</strong>: يوقف معظم شبكات الإعلانات.</li>
      <li><strong>قيم الأسرة</strong>: مواقع معروفة للقمار والمواعدة والكحول، في Chrome.</li>
      <li><strong>وسائل التواصل الاجتماعي</strong> و<strong>الألعاب</strong>: رصيد يومي لكل منهما.</li>
      <li><strong>وقت النوم</strong>: في الليل تتوقف التطبيقات؛ وتبقى المكالمات والرسائل وواتساب وتطبيقات القرآن والساعة
        والإعدادات متاحة.</li>
      <li><strong>إبقاء القواعد سارية</strong>: لا إعادة ضبط من الإعدادات، ولا وضع آمن، ولا مستخدم جديد، ولا تغيير للوقت. مفعّلة
        افتراضيًا.</li>
      <li>في <strong>خيارات أخرى</strong>: حدود لكل تطبيق، وأوقات توقف أخرى (المدرسة، الصلاة)، وإعدادات Chrome، وكل إعداد يمكن
        قفله (VPN، ‏DNS الخاص، خيارات المطوّر)، و<strong>الانتظار قبل التخفيف</strong>: تنتظر القاعدة المخفَّفة قبل أن تصل إلى
        الهاتف، ويمكنك إلغاؤها في الأثناء.</li>
    </ul>
    <h3>تبويب ما تراه</h3>
    <p>ما يرسله لك الهاتف، كل عنصر فقط إذا فعّلته، ويُعرض على هاتف الطفل ما دام مفعّلًا:</p>
    <ul>
      <li><strong>الموقع</strong>، بالفاصل الزمني الذي تختاره.</li>
      <li><strong>الاستخدام اليومي للتطبيقات</strong>: الدقائق لكل تطبيق.</li>
      <li><strong>سجل المكالمات</strong> و<strong>مكالمات من أرقام لا تعرفها</strong> (تكتب الأرقام التي تعرفها): على أندرويد،
        بالنسخة المنزّلة من الموقع.</li>
      <li><strong>التطبيقات المثبَّتة أو المحذوفة</strong>: اسمها ووقتها.</li>
    </ul>
    <h3>تبويب هذا الهاتف</h3>
    <ul><li>اسم طفلك ولون، وإزالة منارة (انظر 7).</li></ul>
    <p>تصل القاعدة المحفوظة إلى الهاتف خلال ثوانٍ. وتقول لوحة التحكم متى لا يمكن ذلك، ومتى سيتلقاها الهاتف.</p>
  </section>

  <section id="everyday">
    <h2>5. كل يوم</h2>
    <ul>
      <li><strong>قفل الآن</strong>، في أعلى صفحة الهاتف، يقفل الهاتف خلال ثوانٍ.</li>
      <li>يعرض تبويب <strong>النشاط</strong> هل تعمل كل حماية، ووقت الشاشة، والوقت لكل تطبيق، والمكالمات، والتطبيقات المثبَّتة أو
        المحذوفة (لما فعّلته).</li>
      <li>تعرض قائمة الهواتف متى تواصل كل هاتف آخر مرة.</li>
    </ul>
  </section>

  <section id="alerts">
    <h2>6. التنبيهات</h2>
    <p>تراسلك منارة بالبريد عندما:</p>
    <ul>
      <li>لا يتواصل هاتف منذ 12 ساعة: ربما أُطفئ، أو نفدت بطاريته، أو انقطع اتصاله، أو أُوقفت منارة؛</li>
      <li>تتوقف حماية عن العمل، مثل إيقاف الوصول إلى بيانات الاستخدام؛</li>
      <li>يتصل بطفلك رقم لا تعرفه، إذا فعّلت ذلك.</li>
    </ul>
    <p>وفي صباح كل اثنين، يصلك بريد بأن تقرير الأسبوع جاهز (يمكن إيقافه من الحساب).</p>
    <p class="muted">بريد واحد لكل مشكلة، لا عند كل تواصل. تفقّد مجلد الرسائل غير المرغوب فيها في المرة الأولى.</p>
  </section>

  <section id="release">
    <h2>7. نقل منارة أو إزالتها</h2>
    <p>أنت وحدك تستطيع ذلك. ليس في منارة على الهاتف زر لذلك، فلا يستطيع طفلك إزالتها.</p>
    <ul>
      <li><strong>إزالة منارة من هذا الهاتف</strong> (تبويب هذا الهاتف): خلال ثوانٍ، أو عند التواصل التالي إن كان الهاتف دون
        اتصال، تُرفع كل القواعد ويعود الهاتف عاديًا.</li>
      <li><strong>النقل إلى حساب آخر</strong>: مثلًا إلى حساب الوالد الآخر. يحتفظ الهاتف بإعداده.</li>
      <li><strong>لا يمكن الوصول إلى الهاتف؟</strong> اختر <strong>إظهار رمز التحرير</strong> واكتب الرمز على الهاتف، في منارة، تحت
        <strong>تحرير هذا الهاتف</strong>. ثم اختر <strong>إزالة من قائمتي</strong>.</li>
      <li>هاتف مفقود أو أُعيد ضبطه: <strong>إزالة من قائمتي</strong>.</li>
    </ul>
    <p>لحذف حسابك وكل بياناته، انظر <a href="/delete-account.html">حذف حسابك</a>.</p>
  </section>

  <section id="trouble">
    <h2>إذا حدثت مشكلة</h2>
    <h3>Play Protect يحجب التثبيت</h3>
    <p>على بعض الهواتف يحجب Google Play Protect منارة تمامًا. لا تغيّر أي إعداد أمان بمفردك: راسلنا، أو
      <a href="/beta-ar">انضم إلى العائلات الرائدة</a>، ونثبّتها معك.</p>
    <h3>يبقى الإعداد على «الإقران»</h3>
    <p>يجب أن يبقى الهاتف على شاشة تصحيح الأخطاء اللاسلكي حتى ينتهي الإقران. افتحها من جديد، واختر رمز QR أو رمز الإقران مرة
      أخرى، وأعد المحاولة. ويجب أن يكون الهاتف ولوحة التحكم متصلين بالإنترنت.</p>
    <h3>يظهر الهاتف «لا يتواصل»</h3>
    <p>لم يتواصل الهاتف منذ ساعتين. تأكّد أنه مشغّل ومتصل. فتح منارة ولمس <strong>تحقّق الآن</strong> يجعله يتواصل فورًا. على
      بعض الهواتف يوقف توفير البطارية التطبيقات في الخلفية: اسمح لمنارة بالعمل دون قيود في إعدادات البطارية (وعلى شاومي، فعّل
      أيضًا التشغيل التلقائي).</p>
    <h3>نسيت كلمة المرور</h3>
    <p>في صفحة تسجيل الدخول، اختر <strong>نسيت كلمة المرور؟</strong>. يعمل الرابط المرسَل بالبريد ساعة واحدة.</p>
    <h3>شيء آخر</h3>
    <p>راسلنا على <a href="mailto:{EMAIL}" dir="ltr">{EMAIL}</a>.</p>
  </section>

  <p class="muted"><a href="/privacy-ar.html">سياسة الخصوصية</a> · <a href="/delete-account.html">حذف حسابك</a></p>""")


def langs(code, label):
    names = [('en', 'guide.html', 'English'), ('fr', 'guide-fr.html', 'Français'), ('ar', 'guide-ar.html', 'العربية')]
    links = ''.join(f'<strong lang="{c}">{n}</strong>' if c == code else f'<a href="/{f}" lang="{c}" hreflang="{c}">{n}</a>' for c, f, n in names)
    return f'<nav class="langs" aria-label="{label}">{links}</nav>'


IDS = ['how', 'before', 'video', 'account', 'connect', 'setup', 'rules', 'everyday', 'alerts', 'release', 'trouble']
for code, p in T.items():
    toc = ''.join(f'<li><a href="#{i}">{t}</a></li>' for i, t in zip(IDS, p['toc']))
    html = f"""<!doctype html>
<html lang="{code}" dir="{p['dir']}">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="color-scheme" content="light dark" />
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<link rel="alternate" hreflang="en" href="/guide.html" />
<link rel="alternate" hreflang="fr" href="/guide-fr.html" />
<link rel="alternate" hreflang="ar" href="/guide-ar.html" />
<title>{p['title']}</title>
<!-- Generated by tools/guidepages.py; change all three languages there. -->
{STYLE}
</head>
<body{' lang="ar"' if code == 'ar' else ''}>
<main>
  <header><a href="/">{p['home']}</a>{langs(code, p['langLabel'])}</header>
  <h1>{p['h1']}</h1>
  <p class="muted">{p['lead']}</p>

  <nav class="toc" aria-label="{p['toc'][0] if False else ('Contents' if code == 'en' else 'Sommaire' if code == 'fr' else 'المحتويات')}">
    <ol>{toc}</ol>
  </nav>
{p['body']}
</main>
</body>
</html>
"""
    io.open(f"{OUT}/{p['file']}", 'w', encoding='utf-8', newline='\n').write(html)
    print(p['file'], 'ok')
