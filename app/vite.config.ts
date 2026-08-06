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
          // Without an explicit id, a PWA's identity defaults to its start_url,
          // which means changing start_url orphans every existing install.
          // Setting it to `base` resolves to exactly the same value the implicit
          // id has today ('/busybeegrocer/', trailing slash included), so nobody
          // currently running the installed app is affected -- while making the
          // identity explicit from here on.
          //
          // NOTE for the busybeegrocer.com move: identity is scoped to the
          // origin, so a domain change orphans installs regardless and everyone
          // reinstalls once. At that point pin this to a permanent value that
          // does NOT track `base`, so any future path change is survivable.
          id: base,
          categories: ['shopping', 'lifestyle', 'productivity'],
          theme_color: '#2a78d6',
          background_color: '#fcfcfb',
          display: 'standalone',
          start_url: base,
          // Android and desktop show a much richer install prompt when these
          // exist, and fall back to a bare one-liner when they don't. All three
          // must share an aspect ratio, and the long side must stay within 2.3x
          // the short side, or Chrome ignores the lot.
          screenshots: [
            {
              src: `${base}screenshots/shot-1.webp`,
              sizes: '720x1406',
              type: 'image/webp',
              form_factor: 'narrow',
              label: 'Your list, grouped by store and aisle',
            },
            {
              src: `${base}screenshots/shot-2.webp`,
              sizes: '720x1406',
              type: 'image/webp',
              form_factor: 'narrow',
              label: 'Shopping mode, showing only what is still needed',
            },
            {
              src: `${base}screenshots/shot-3.webp`,
              sizes: '720x1406',
              type: 'image/webp',
              form_factor: 'narrow',
              label: 'Finish a trip and send the list on',
            },
          ],
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
