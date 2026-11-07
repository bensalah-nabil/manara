import { defineConfig } from 'vite'

// Preact's JSX runtime directly: no React, no compat layer, no framework plugin.
export default defineConfig({
  oxc: {
    jsx: { runtime: 'automatic', importSource: 'preact' },
  },
})
