import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { fileURLToPath } from 'node:url';

const stub = fileURLToPath(new URL('./src/stubs/empty.ts', import.meta.url));

// Deux sorties « fichier unique » qui s'ouvrent en double-clic (file://) :
//   vite build                  → dist/index.html       (l'application)
//   vite build --mode diagnostic → dist/diagnostic.html  (test du poste)
// Tout (JS, CSS, polices, modèles) est intégré dans le HTML : aucun fetch, aucun module externe.
export default defineConfig(({ mode }) => {
  const diag = mode === 'diagnostic';
  return {
    base: './',
    define: { __APP_VERSION__: JSON.stringify(process.env.npm_package_version || '0.1.0') },
    plugins: [viteSingleFile({ removeViteModuleLoader: true })],
    resolve: { alias: { html2canvas: stub, dompurify: stub, canvg: stub } },
    build: {
      target: 'es2020',
      outDir: 'dist',
      emptyOutDir: !diag,
      chunkSizeWarningLimit: 20000,
      rollupOptions: { input: diag ? 'diagnostic.html' : 'index.html' },
    },
  };
});
