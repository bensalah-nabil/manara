import { defineConfig } from 'vite'

// Without VITE_API_URL the console falls back to localhost:8080 (App.tsx): fine on a PC, but a
// deployed build would quietly send every parent's browser there. The agent's release build once
// shipped that way (CLAUDE.md); Vercel sets VERCEL=1 for its builds, so only those are stopped.
if (process.env.VERCEL && !process.env.VITE_API_URL) {
  throw new Error('VITE_API_URL is not set: this Vercel build would talk to localhost:8080.')
}

// Preact's JSX runtime directly: no React, no compat layer, no framework plugin.
export default defineConfig({
  oxc: {
    jsx: { runtime: 'automatic', importSource: 'preact' },
  },
})
