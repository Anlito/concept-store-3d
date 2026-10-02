import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { distUrl } from './util';

/* Étape 4 : export du plan des murs en PDF A3 à l'échelle — en file://. */

const PT_TO_MM = 25.4 / 72;

/** Lit un PDF produit par jsPDF : format de page, segments tracés (mm) et textes. */
function readPdf(path: string) {
  const buf = readFileSync(path), s = buf.toString('latin1');
  let content = '';
  const re = /stream\r?\n/g; let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    const start = m.index + m[0].length, end = s.indexOf('endstream', start);
    try { content += inflateSync(buf.subarray(start, end)).toString('latin1'); } catch { content += buf.subarray(start, end).toString('latin1'); }
  }
  const box = s.match(/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/)!;
  const segs = [...content.matchAll(/([\d.]+) ([\d.]+) m\s*([\d.]+) ([\d.]+) l/g)].map(x => Math.hypot(+x[3] - +x[1], +x[4] - +x[2]) * PT_TO_MM);
  const texts = [...content.matchAll(/\((.*?)\) Tj/g)].map(x => x[1]);
  return { header: s.slice(0, 5), w: +box[1] * PT_TO_MM, h: +box[2] * PT_TO_MM, segs, texts };
}

async function openExport(page: Page) {
  await page.getByRole('button', { name: 'Plan A3' }).click();
  await expect(page.getByTestId('export')).toBeVisible();
}
async function download(page: Page, path: string) {
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Télécharger le PDF' }).click();
  const d = await dl;
  await d.saveAs(path);
  return d.suggestedFilename();
}

let errors: string[];
test.beforeEach(async ({ page }) => {
  errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(distUrl('index.html'));
  await page.getByTestId('template').click(); // boutique exemple 10 × 7 m, murs de 15 cm
});
test.afterEach(() => expect(errors).toEqual([]));

test('le PDF est un A3 paysage, à l’échelle exacte, avec le cartouche', async ({ page }, info) => {
  await openExport(page);
  // L'outil propose la plus grande échelle qui tient : 1:20 est trop grand pour 10 × 7 m, donc 1:50
  await expect(page.getByRole('button', { name: '1:50', exact: true })).toHaveClass(/on/);
  await expect(page.getByText('Le plan tient sur la feuille')).toBeVisible();
  await page.getByLabel('Nom de l’équipe').fill('Les Bâtisseurs');
  await page.getByLabel('Prénoms').fill('Léa, Malik');
  await page.getByLabel('Classe').fill('4e B');
  await page.getByLabel('Classe').press('Tab');
  await expect(page.getByTestId('sheet')).toContainText('Équipe : Les Bâtisseurs');
  const file = info.outputPath('plan.pdf');
  expect(await download(page, file)).toBe('plan-A3-boutique-exemple-1-50.pdf');
  const pdf = readPdf(file);
  expect(pdf.header).toBe('%PDF-');
  expect(pdf.w).toBeCloseTo(420, 1);
  expect(pdf.h).toBeCloseTo(297, 1);
  // Mur de 10 m → 200 mm à 1:50 ; mur de 7 m → 140 mm ; barre d'échelle de 10 cm = 10 cases de 10 mm
  expect(pdf.segs.some(l => Math.abs(l - 200) < 0.05)).toBe(true);
  expect(pdf.segs.some(l => Math.abs(l - 140) < 0.05)).toBe(true);
  expect(pdf.texts.join(' ')).toContain('Les Bâtisseurs');
  expect(pdf.texts.join(' ')).toContain('Échelle 1:50');
  // Le cartouche est enregistré dans le projet
  const team = await page.evaluate(() => (window as any).cs3d.store.doc.team);
  expect(team).toMatchObject({ name: 'Les Bâtisseurs', members: 'Léa, Malik', klass: '4e B' });
});

test('échelle trop grande : avertissement, téléchargement bloqué, correction en un clic', async ({ page }) => {
  await openExport(page);
  await page.getByRole('button', { name: '1:20', exact: true }).click();
  await expect(page.getByText('Boutique trop grande pour cette échelle')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Télécharger le PDF' })).toBeDisabled();
  await page.getByRole('button', { name: 'Passer à 1:50' }).click();
  await expect(page.getByRole('button', { name: 'Télécharger le PDF' })).toBeEnabled();
  // 1:100 tient aussi : la barre d'échelle indique 10 m pour 10 cm
  await page.getByRole('button', { name: '1:100', exact: true }).click();
  await expect(page.getByTestId('sheet')).toContainText('10 cm sur la feuille = 10 m dans la boutique');
});

test('le plan ne contient que les murs : pas de mobilier', async ({ page }, info) => {
  await openExport(page);
  const a = info.outputPath('a.pdf'); await download(page, a);
  await page.getByRole('button', { name: 'Retour à l’éditeur' }).click();
  await page.locator('[data-tool="mobilier"]').click();
  await page.locator('.fc', { hasText: 'Canapé' }).first().dblclick();
  await expect.poll(() => page.evaluate(() => (window as any).cs3d.store.doc.objects.length)).toBe(1);
  await openExport(page);
  const b = info.outputPath('b.pdf'); await download(page, b);
  const pa = readPdf(a), pb = readPdf(b);
  expect(pb.segs.length).toBe(pa.segs.length);
  expect(pb.texts.join(' ')).not.toContain('Canapé');
});

test('portes et fenêtres : le trait du mur devient pointillé sur la largeur exacte', async ({ page }) => {
  await openExport(page);
  // Aperçu : lignes en tirets longs (portes) et pointillés serrés (fenêtres)
  const dashes = await page.getByTestId('sheet').locator('line[stroke-dasharray]').evaluateAll(ls => ls.map(l => [l.getAttribute('stroke-dasharray'),
    Math.hypot(+l.getAttribute('x2')! - +l.getAttribute('x1')!, +l.getAttribute('y2')! - +l.getAttribute('y1')!)]));
  const door = dashes.filter(d => d[0] === '5 2.5').map(d => +(d[1] as number).toFixed(2));
  const win = dashes.filter(d => d[0] === '0.9 0.9').map(d => +(d[1] as number).toFixed(2));
  // Boutique exemple : portes de 1,20 m et 0,90 m → 24 mm et 18 mm à 1:50 (sur les deux faces du mur), + légende
  expect(door).toEqual(expect.arrayContaining([24, 24, 18, 18]));
  // Fenêtre de 2,50 m et vitrines de 2,80 m → 50 mm et 56 mm
  expect(win).toEqual(expect.arrayContaining([50, 50, 56, 56, 56, 56]));
});
