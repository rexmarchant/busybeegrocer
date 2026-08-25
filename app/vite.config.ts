import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const pkg = JSON.parse(readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf-8'))

// https://vite.dev/config/
export default defineConfig(({ command }) => {
  // The app lives under /app/ on busybeegrocer.com, leaving the root for the
  // landing page. Local dev stays at the site root.
  //
  // Everything downstream reads import.meta.env.BASE_URL rather than hardcoding
  // a path -- the router basename, every asset URL, the manifest, the magic-link
  // redirect and the share QR -- so this one line moves the whole app.
  const base = command === 'build' ? '/app/' : '/'

  return {
    base,
    // PRIVACY.md lives at the repo root, one level above Vite's root, and the
    // app imports it with ?raw so the policy exists in exactly one place.
    server: { fs: { allow: ['..'] } },
    build: {
      // Built into the deploy directory at the path it will be served from, so
      // the landing page can occupy the root alongside it. emptyOutDir is
      // explicit because the target sits outside Vite's root, and it clears
      // only dist/app -- the landing page copied to dist/ is untouched.
      outDir: '../dist/app',
      emptyOutDir: true,
    },
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
          name: 'Busy Bee Grocer',
          short_name: 'Busy Bee',
          description: 'Shared shopping lists for your group.',
          // A fixed string, deliberately not `base`.
          //
          // A PWA's identity is its origin plus this id. Moving to
          // busybeegrocer.com changes the origin, so every existing install
          // orphans and everyone reinstalls once -- unavoidable, and the reason
          // the domain, the /app split and the host move all ship together.
          //
          // Pinning it here means that is the *last* time. Because this no
          // longer tracks the served path, the app could later move to the root
          // or to another folder and installed copies would follow it.
          id: '/busybeegrocer',
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
              src: `${base}screenshots/shot-1-v2.webp`,
              sizes: '720x1406',
              type: 'image/webp',
              form_factor: 'narrow',
              label: 'Your list, grouped by store and aisle',
            },
            {
              src: `${base}screenshots/shot-2-v2.webp`,
              sizes: '720x1406',
              type: 'image/webp',
              form_factor: 'narrow',
              label: 'Shopping mode, showing only what is still needed',
            },
            {
              src: `${base}screenshots/shot-3-v2.webp`,
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
