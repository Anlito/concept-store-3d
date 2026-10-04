// Fiche élève : fiche/fiche-eleve.html (icônes et police embarquées) → dist/Fiche-eleve.pdf (A4, une page).
// Lancé par « npm run package » après le build ; utilise le Chromium de Playwright.
import { readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve('.tools/pw-browsers');
const { chromium } = await import('@playwright/test');

const version = JSON.parse(readFileSync('package.json', 'utf8')).version;
const icon = n => {
  const s = readFileSync(`node_modules/@material-symbols/svg-400/rounded/${n}.svg`, 'utf8');
  const d = [...s.matchAll(/<path d="([^"]+)"/g)].map(m => m[1]).join(' ');
  return `<svg class="ic" viewBox="0 -960 960 960" aria-hidden="true"><path d="${d}"/></svg>`;
};
const font = w => 'data:font/woff2;base64,' +
  readFileSync(`node_modules/@fontsource/nunito/files/nunito-latin-${w}-normal.woff2`).toString('base64');

const html = readFileSync('fiche/fiche-eleve.html', 'utf8')
  .replace(/\{\{ic:([a-z0-9_]+)\}\}/g, (_, n) => icon(n))
  .replace(/\{\{font:(\d+)\}\}/g, (_, w) => font(w))
  .replace(/\{\{version\}\}/g, version);

mkdirSync('dist', { recursive: true });
const tmp = resolve('dist/.fiche-eleve.html');
writeFileSync(tmp, html);
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(pathToFileURL(tmp).href);
await page.evaluate(() => document.fonts.ready);
const overflow = await page.evaluate(() => document.body.scrollHeight - document.body.clientHeight);
if (overflow > 0) { console.error(`Fiche élève trop longue de ${overflow} px : elle ne tient pas sur une page.`); process.exitCode = 1; }
await page.pdf({ path: 'dist/Fiche-eleve.pdf', format: 'A4', printBackground: true, preferCSSPageSize: true });
if (process.argv.includes('--png')) await page.screenshot({ path: 'dist/.fiche-eleve.png', fullPage: true });
await browser.close();
unlinkSync(tmp);
console.log('dist/Fiche-eleve.pdf écrite');
