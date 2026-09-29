import { defineConfig } from 'tsup';
import path from 'node:path';

/**
 * Build config for publishing @shuffleio/shuffle-mcps to npm.
 *
 * This is only used by CI when packaging the library — it is NOT used by the
 * host app's Vite build. The host app keeps importing source directly via the
 * `@/Shuffle-MCPs` path alias.
 *
 * Notes:
 *  - Host-provided UI deps (MUI, framer-motion, sonner, lucide-react,
 *    @/lib/router-compat, etc.) are declared `external` so they are NOT bundled.
 *  - Markdown / JSON viewer utilities are bundled to avoid downstream webpack
 *    ESM resolution and source-map-loader issues in consuming apps.
 *  - The library source uses `@/Shuffle-MCPs/*` and `@/assets/*` path
 *    aliases (Vite-style) which esbuild cannot resolve on its own. We map
 *    them here to relative paths inside the library directory.
 */
export default defineConfig({
  entry: ['index.ts'],
  format: ['esm', 'cjs'],
  tsconfig: 'tsconfig.build.json',
  dts: {
    resolve: true,
    tsconfig: 'tsconfig.build.json',
  },
  sourcemap: false,
  clean: true,
  noExternal: ['rehype-sanitize'],
  external: [
    'react',
    'react-dom',
    'react/jsx-runtime',
    // Host-app provided peers — never bundle.
    // List deep MUI/emotion subpaths explicitly (as plain strings, not regex)
    // so esbuild emits bare specifiers that webpack 5's `fullySpecified`
    // check in consuming apps accepts without extension.
    '@mui/material',
    '@mui/material/styles',
    '@mui/material/utils',
    '@mui/system',
    '@mui/system/RtlProvider',
    '@mui/system/createTheme',
    '@mui/system/styled',
    '@mui/icons-material',
    '@mui/x-data-grid',
    '@emotion/react',
    '@emotion/styled',
    '@emotion/cache',
    'framer-motion',
    'sonner',
    'lucide-react',
    // '@/lib/router-compat' is rewritten to an external 'react-router-dom'
    // import at build time (see routerCompatExternal plugin below), so the
    // published bundle depends on a real peer instead of the unresolvable
    // source-only alias path. Keep both router packages external.
    'react-router-dom',
    'react-router',
    'react-toastify',
    'react-ga4',
    'react-device-detect',
    'mui-chips-input',
    'dayjs',
    /^dayjs\//,
    'tailwind-merge',
    'clsx',
    'recharts',
    'date-fns',
    /^date-fns\//,
    'html2canvas-pro',
    'jspdf',
    /^@tanstack\//,
    /^@shuffleio\//,
  ],
  esbuildPlugins: [
    // Redirect the host-specific router shim to react-router-dom and keep it
    // external, so dist emits a plain `from "react-router-dom"` (no inlining,
    // no reliance on react-router dedup). The host app that consumes this
    // package provides react-router-dom (>=6) as a peer dependency.
    {
      name: 'router-compat-external',
      setup(build) {
        build.onResolve({ filter: /^@\/lib\/router-compat$/ }, () => ({
          path: 'react-router-dom',
          external: true,
        }));
      },
    },
    {
      name: 'resolve-optional-shims',
      setup(build) {
        build.onResolve({ filter: /^@capacitor\// }, () => ({
          path: path.resolve(__dirname, 'shims/capacitor-shim.ts'),
        }));
        build.onResolve({ filter: /^firebase\// }, () => ({
          path: path.resolve(__dirname, 'shims/firebase-shim.ts'),
        }));
      },
    },
    {
      name: 'resolve-at-alias',
      setup(build) {
        build.onResolve({ filter: /^@\// }, (args) => {
          if (args.path === '@/lib/router-compat') {
            return undefined;
          }
          const subpath = args.path.replace(/^@\//, '');
          const srcDir = path.resolve(__dirname, '..');
          const target = path.resolve(srcDir, subpath);
          return build.resolve(target, {
            resolveDir: args.resolveDir,
            kind: args.kind,
          });
        });
      },
    },
    {
      name: 'externalize-missing-sibling-deps',
      setup(build) {
        build.onResolve({ filter: /^[^.\/]/ }, async (args) => {
          if (args.path.startsWith('@/')) return undefined;
          if (!args.resolveDir || args.resolveDir.startsWith(__dirname)) {
            return undefined;
          }
          try {
            const result = await build.resolve(args.path, {
              resolveDir: __dirname,
              kind: args.kind,
            });
            if (result.errors.length > 0) {
              return { path: args.path, external: true };
            }
            return result;
          } catch {
            return { path: args.path, external: true };
          }
        });
      },
    },
  ],
  loader: {
    '.css': 'copy',
    '.png': 'dataurl',
    '.jpg': 'dataurl',
    '.svg': 'dataurl',
  },
  injectStyle: false,
  esbuildOptions(options) {
    options.platform = 'browser';
    options.alias = {
      ...(options.alias || {}),
      '@/Shuffle-MCPs': path.resolve(__dirname, '.'),
      '@/Shuffle-Core': path.resolve(__dirname, '../Shuffle-Core'),
      '@/assets': path.resolve(__dirname, '../assets'),
      '@/lib': path.resolve(__dirname, '../lib'),
    };
  },
});
