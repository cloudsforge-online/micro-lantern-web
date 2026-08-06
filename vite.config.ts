import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/**
 * There is deliberately no `define`, no `envPrefix` and no `.env` file in this repository.
 *
 * A build-time constant is an environment baked into an image, and an image with an environment
 * baked into it has to be rebuilt to be promoted — which means the artefact that reaches
 * production is not the artefact that passed CI. Every host this app talks to is resolved at
 * RUNTIME from `window.location.hostname` by `cloudsforgeHosts()`, so one image serves localhost,
 * staging, a preview deployment and production. `test/no-build-time-config.test.ts` fails the
 * build if `import.meta.env.VITE_` ever reappears.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    // @cloudsforge/ui is a `file:` link, so its own node_modules holds a second copy of React.
    // Two copies means two dispatchers, and the shared bar would throw on its first useState.
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: {
    // The linked package is shipped as TypeScript source until it is published; pre-bundling it
    // would freeze a stale copy of a package that is edited in the same working tree.
    exclude: ['@cloudsforge/ui'],
  },
  build: {
    // Named chunks and a real manifest of hashes: the assets are immutable-cached by nginx, and
    // that is only safe when every rebuild produces a new filename.
    sourcemap: true,
  },
  // 5190. Checked against the siblings rather than inherited: 5180 is micro-hub-web, 5185 is
  // micro-foresight-admin-web, 5188 is micro-status-web, and the template's own 5199 is a
  // deliberate placeholder that several frontends shipped unchanged. 5191 is left free for
  // `beacon-web`, which is being cut at the same time as this one — two frontends that collide on
  // a dev port do not fail, they serve each other's bundle to whoever started second.
  //
  // NOT lantern's registry devPort (4010, surfaces.ts). That is the port the SERVICE binds,
  // and this is the port the page is served from; they are two different things and `apiBase()`
  // in src/lib/hosts.ts derives the cross-origin gap between them.
  server: { port: 5190 },
  preview: { port: 5190 },
})
