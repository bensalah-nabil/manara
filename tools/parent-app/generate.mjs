// Generates the "Manara Parents" Android project (a Trusted Web Activity of the parent console) in
// ./android, without Bubblewrap's interactive questions: the same @bubblewrap/core library, with
// the answers below. The values come from the live manifest (controller/public/manifest.webmanifest).
// Usage: BUBBLEWRAP=<path to @bubblewrap/core> node generate.mjs   (see README.md)
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const core = await import(process.env.BUBBLEWRAP ? pathToFileURL(join(process.env.BUBBLEWRAP, 'dist', 'index.js')).href : '@bubblewrap/core')
const { TwaManifest, TwaGenerator, ConsoleLog } = core.default ?? core

const target = join(here, 'android')
mkdirSync(target, { recursive: true })

const twa = await TwaManifest.fromWebManifest('https://manara-rosy.vercel.app/manifest.webmanifest')
Object.assign(twa, {
  // Never changes once published.
  packageId: 'com.manara.parents',
  host: 'manara-rosy.vercel.app',
  name: 'Manara · Parents',
  launcherName: 'Manara',
  startUrl: '/?source=app',
  themeColor: twa.themeColor, // #0e5a43 from the manifest
  navigationColor: twa.themeColor,
  backgroundColor: twa.backgroundColor, // #0a1511
  enableNotifications: false, // none yet; web push comes after the beta
  appVersionName: '1.0.0',
  appVersionCode: 1,
  fallbackType: 'customtabs',
  // The upload key lives outside the repo (README, "Create the upload key"); only its place is named here.
  signingKey: { path: '../../../../manara-keys/manara-parents-upload.keystore', alias: 'upload' },
})
const problem = twa.validate()
if (problem) throw new Error(problem)
await twa.saveToFile(join(target, 'twa-manifest.json'))
await new TwaGenerator().createTwaProject(target, twa, new ConsoleLog('manara-parents'))
console.log('project written to', target)
