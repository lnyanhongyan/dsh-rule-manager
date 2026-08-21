import { defineConfig } from 'tsdown'

const PLUGIN_ID = '@deepseek-ai/dsh-rule-manager'

/**
 * Two artifacts for one dual-face plugin:
 *  - lib/index.js  : Host half (ESM, node) — the Cordis plugin registering /rules/* routes.
 *  - lib/client.js : Browser half (CJS) wrapped in window.__ModuleLoader__.load({ id, factory }),
 *                    consumed by dsh-client-modules at /plugins/<id>/client.js.
 */
export default defineConfig([
  {
    name: `${PLUGIN_ID}/host`,
    entry: { index: 'src/index.ts' },
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2022',
    dts: true,
    clean: false,
    deps: {
      neverBundle: (id) =>
        id === '@deepseek-ai/cordis' ||
        id === '@deepseek-ai/dsh-host-webserver' ||
        id.startsWith('@deepseek-ai/dsh-'),
    },
  },
  {
    name: `${PLUGIN_ID}/client`,
    entry: { client: 'src/client/index.ts' },
    outDir: 'lib',
    format: 'cjs',
    platform: 'browser',
    target: 'es2022',
    dts: true,
    clean: false,
    deps: {
      // Everything except the module-table rows must inline. The loader answers
      // react and the dsh-client-* module-table rows; nothing else is requested.
      neverBundle: (id) => id === 'react' || id.startsWith('@deepseek-ai/dsh-'),
      alwaysBundle: (id) => id !== 'react' && !id.startsWith('@deepseek-ai/dsh-'),
    },
    outputOptions: {
      entryFileNames: 'client.js',
      banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(PLUGIN_ID)}, factory: (require) => {`,
      footer: 'return module.exports; } });',
      intro: 'var module = { exports: {} }; var exports = module.exports;',
    },
  },
])
