import { defineConfig } from '@playwright/test';

// Les tests ouvrent les fichiers construits (dist/*.html) en file://, comme sur les PC du collège.
// Lancer « npm run build » avant « npm test ».
export default defineConfig({
  testDir: 'tests',
  timeout: 60_000,
  fullyParallel: true,
  reporter: [['list']],
  use: {
    viewport: { width: 1366, height: 768 },
    locale: 'fr-FR',
    launchOptions: { args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
  },
});
