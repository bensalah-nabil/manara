import { defineConfig } from 'vite'

// A deployed admin build must know its API and its Entra app; without them it would point at
// localhost, or at no app at all. Vercel sets VERCEL=1 for its builds.
if (process.env.VERCEL) {
  for (const name of ['VITE_API_URL', 'VITE_ENTRA_TENANT_ID', 'VITE_ENTRA_CLIENT_ID']) {
    if (!process.env[name]) throw new Error(`${name} is not set for this Vercel build.`)
  }
}

export default defineConfig({
  oxc: {
    jsx: { runtime: 'automatic', importSource: 'preact' },
  },
})
