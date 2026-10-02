// Capture d'écran d'une page construite (outil de développement) : node scripts/shot.mjs page.html sortie.png [attente ms] [largeur] [hauteur]
import { chromium } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const [file, out, wait = '1000', w = '1366', hgt = '768'] = process.argv.slice(2);
const b = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: +w, height: +hgt } });
p.on('pageerror', e => console.log('ERREUR PAGE:', e.message));
p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log('console.' + m.type() + ':', m.text()); });
await p.goto(file.startsWith('http') ? file : pathToFileURL(resolve(file)).href);
await p.waitForTimeout(+wait);
await p.screenshot({ path: out, fullPage: true });
await b.close();
