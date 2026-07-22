import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const pkg = JSON.parse(readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf-8'))

// https://vite.dev/config/
export default defineConfig(({ command }) => {
  // Served from https://rexmarchant.github.io/busybeegrocer/ in production;
  // local dev stays at the site root.
  const base = command === 'build' ? '/busybeegrocer/' : '/'

  return {
    base,
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
      __BUILD_DATE__: JSON.stringify(new Date().toISOString()),
      // Set by CI from the commit count, so it increments on every deploy
      // without anyone having to remember to bump package.json by hand.
      __BUILD_NUMBER__: JSON.stringify(process.env.VITE_BUILD_NUMBER ?? 'dev'),
    },
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.svg'],
        manifest: {
          name: 'BusyBeeGrocer',
          short_name: 'BusyBeeGrocer',
          description: 'Shared shopping lists for your group.',
          theme_color: '#2a78d6',
          background_color: '#fcfcfb',
          display: 'standalone',
          start_url: base,
          icons: [
            { src: `${base}icons/icon-192.png`, sizes: '192x192', type: 'image/png' },
            { src: `${base}icons/icon-512.png`, sizes: '512x512', type: 'image/png' },
            { src: `${base}icons/icon-512-maskable.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        },
      }),
    ],
  }
})
