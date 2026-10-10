import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// URL prefixes the Express server owns (see server.js). In development the Vite
// dev server forwards them to the API, like Create React App's "proxy" did.
const API_PREFIXES = [
  '/auth',
  '/bgtracker',
  '/communitylibrary',
  '/meetings',
  '/church',
  '/hipaa',
  '/doctor',
  '/admin',
  '/patient-doctors',
  '/owenenterprises',
  '/images',
];

export default defineConfig(({ mode }) => {
  // PORT comes from the .env file in the project root (the server's .env).
  const env = loadEnv(mode, path.resolve(__dirname, '..'), '');
  const target = `http://localhost:${env.PORT || 4000}`;

  // /meetings, /doctor and /admin are both API prefixes and React Router pages.
  // A browser navigation (Accept: text/html, e.g. a refresh on /meetings) must
  // get the app's index.html; fetch() calls from the app go to the API.
  // Static pictures live in client/public/images/... and are served by Vite itself (in the
  // build they end up at /images/... too). Pictures people upload are written by the server
  // into its own images/ folder, so a /images request that is not in client/public still
  // goes to Express.
  const publicDir = path.resolve(__dirname, 'public');

  const proxy = Object.fromEntries(
    API_PREFIXES.map((prefix) => [
      prefix,
      {
        target,
        bypass: (req) => {
          if (req.headers.accept && req.headers.accept.includes('text/html')) return '/index.html';
          if (prefix === '/images') {
            let file = '';
            try { file = decodeURI((req.url || '').split('?')[0]); } catch { return undefined; }
            const full = path.join(publicDir, file);
            if (full.startsWith(publicDir + path.sep) && fs.existsSync(full) && fs.statSync(full).isFile()) return file;
          }
          return undefined;
        },
      },
    ])
  );

  return {
    plugins: [react()],
    server: { port: 3000, proxy },
    // Keep the old output folder so server.js (client/build) is unchanged.
    build: {
      outDir: 'build',
      emptyOutDir: true,
      rollupOptions: {
        output: {
          // Chart.js is only needed by the chart pages, so keep it in its own
          // chunk that loads on demand instead of inside the main bundle.
          manualChunks(id) {
            if (id.includes('node_modules/chart.js') || id.includes('node_modules/react-chartjs-2')) return 'charts';
          // React must live in its own chunk, otherwise Rollup folds it into
          // the charts chunk (react-chartjs-2 uses it) and the main bundle
          // would then load the charts chunk at start-up.
            if (/node_modules\/(react|react-dom|scheduler|object-assign|prop-types)\//.test(id)) return 'react-vendor';
          },
        },
      },
    },
  };
});
