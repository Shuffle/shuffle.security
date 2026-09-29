import { defineConfig } from 'tsup';
import path from 'node:path';

/**
 * Build config for publishing @shuffleio/shuffle-core to npm.
 *
 * Mirrors the Shuffle-MCPs config: host-provided UI peers are marked external,
 * while markdown utilities are bundled to avoid downstream webpack ESM and
 * source-map-loader issues in consuming apps.
 */
export default defineConfig({
  entry: ['index.tsx'],
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
    // Keep MUI as barrel externals so the emitted ESM does not reference
    // extensionless directory subpaths that webpack 5 rejects as fully specified.
    '@mui/material',
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
    'lucide-react',
    // '@/lib/router-compat' is rewritten to an external 'react-router-dom'
    // import at build time (see routerCompatExternal plugin below), so the
    // published bundle depends on a real peer instead of the unresolvable
    // source-only alias path. Keep both router packages external.
    'react-router-dom',
    'react-router',
    'react-ga4',
    'react-device-detect',
    'mui-chips-input',
    'react-toastify',
    'dayjs',
    /^dayjs\//,
    /^@shuffleio\//,
    /^@tanstack\//,
    'tailwind-merge',
    'clsx',
    'recharts',
    'date-fns',
    /^date-fns\//,
    'framer-motion',
    'sonner',
    'html2canvas-pro',
    'jspdf',
  ],
  loader: {
    '.css': 'copy',
    '.png': 'dataurl',
    '.jpg': 'dataurl',
    '.svg': 'dataurl',
  },
  injectStyle: false,
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
    // Resolve optional Capacitor & Firebase imports to safe in-tree runtime shims,
    // so consuming web apps (such as Shaffuru) are not broken by missing native mobile / push packages.
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
    // Generic resolver for all `@/*` path aliases:
    // Resolves any `@/<path>` import (except `@/lib/router-compat` which is rewritten to react-router-dom)
    // to `<repo-root>/src/<path>`, matching Vite and tsconfig path alias behavior.
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
    // When files in sibling directories (such as ../Shuffle-MCPs or ../lib)
    // import bare dependencies installed in Shuffle-Core's node_modules (e.g. rehype-sanitize),
    // resolve them using Shuffle-Core as the base directory.
    {
      name: 'resolve-sibling-imports-from-core',
      setup(build) {
        build.onResolve({ filter: /^[^./@]/ }, (args) => {
          if (args.resolveDir && !args.resolveDir.startsWith(__dirname)) {
            return build.resolve(args.path, {
              resolveDir: __dirname,
              kind: args.kind,
            });
          }
          return undefined;
        });
      },
    },
  ],
  esbuildOptions(options) {
    options.assetNames = '[name]';
    options.nodePaths = [
      path.resolve(__dirname, 'node_modules'),
      ...(options.nodePaths || []),
    ];
    options.alias = {
      ...(options.alias || {}),
      '@/Shuffle-Core': path.resolve(__dirname, '.'),
      '@/assets': path.resolve(__dirname, '../assets'),
      '@': path.resolve(__dirname, '..'),
    };
  },
  async onSuccess() {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const srcCss = path.resolve(__dirname, 'shuffle-core.css');
    const destCss = path.resolve(__dirname, 'dist/shuffle-core.css');
    if (fs.existsSync(srcCss)) {
      fs.copyFileSync(srcCss, destCss);
    }
  },
});
