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
/** Cartouche obligatoire : nom de l'équipe, prénoms, classe. */
async function fillCartouche(page: Page) {
  await page.getByLabel('Nom de l’équipe').fill('Les Bâtisseurs');
  await page.getByLabel('Prénoms').fill('Léa, Malik');
  await page.getByLabel('Classe').fill('4e B');
  await page.getByLabel('Classe').press('Tab');
}
/** Sans explorateur (navigateur ancien) : le PDF est téléchargé. */
async function download(page: Page, path: string) {
  await page.evaluate(() => { delete (window as any).showSaveFilePicker; });
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Enregistrer le PDF' }).click();
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
  await page.getByRole('button', { name: 'Boutique exemple' }).click();
});
test.afterEach(() => expect(errors).toEqual([]));

test('le PDF est un A3 paysage, à l’échelle exacte, avec le cartouche', async ({ page }, info) => {
  await openExport(page);
  // La boutique exemple fait 10 × 7 m (le maximum) : elle tient à 1 m = 3 cm
  await expect(page.getByRole('button', { name: '1 m = 3 cm', exact: true })).toHaveClass(/on/);
  await expect(page.getByText('Le plan tient sur la feuille')).toBeVisible();
  await fillCartouche(page);
  await expect(page.getByTestId('sheet')).toContainText('ÉQUIPELes Bâtisseurs');
  const file = info.outputPath('plan.pdf');
  expect(await download(page, file)).toBe('Plan-A3-Lea_Malik.pdf');
  const pdf = readPdf(file);
  expect(pdf.header).toBe('%PDF-');
  expect(pdf.w).toBeCloseTo(420, 1);
  expect(pdf.h).toBeCloseTo(297, 1);
  // 1 m = 3 cm : mur de 10 m → 300 mm, mur de 7 m → 210 mm
  expect(pdf.segs.some(l => Math.abs(l - 300) < 0.05)).toBe(true);
  expect(pdf.segs.some(l => Math.abs(l - 210) < 0.05)).toBe(true);
  expect(pdf.texts.join(' ')).toContain('Les Bâtisseurs');
  expect(pdf.texts.join(' ')).toContain('Échelle : 1 m = 3 cm');
  // Le cartouche est enregistré dans le projet
  const team = await page.evaluate(() => (window as any).cs3d.store.doc.team);
  expect(team).toMatchObject({ name: 'Les Bâtisseurs', members: 'Léa, Malik', klass: '4e B' });
});

test('plan trop grand : avertissement, téléchargement bloqué, corrections proposées', async ({ page }) => {
  // Murs de 50 cm : la boutique de 10 × 7 m dépasse à 1 m = 3 cm avec les cotes
  await page.evaluate(() => (window as any).cs3d.store.update((d: any) => { d.walls.thickness = 0.5; }));
  await openExport(page);
  await fillCartouche(page);
  // L'outil a déjà choisi 1 m = 2 cm ; on force 1 m = 3 cm
  await expect(page.getByRole('button', { name: '1 m = 2 cm', exact: true })).toHaveClass(/on/);
  await page.getByRole('button', { name: '1 m = 3 cm', exact: true }).click();
  await expect(page.getByText('Boutique trop grande pour cette échelle')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Enregistrer le PDF' })).toBeDisabled();
  // Sans les cotes, elle tient
  await page.getByRole('button', { name: 'Masquer les cotes' }).click();
  await expect(page.getByRole('button', { name: 'Enregistrer le PDF' })).toBeEnabled();
  // Ou bien à une échelle plus petite
  await page.getByRole('button', { name: 'Cotes des murs' }).click();
  await page.getByRole('button', { name: 'Passer à 1 m = 2 cm' }).click();
  await expect(page.getByRole('button', { name: 'Enregistrer le PDF' })).toBeEnabled();
  // 1 m = 1 cm : la barre d'échelle mesure 10 cm pour 10 m
  await page.getByRole('button', { name: '1 m = 1 cm', exact: true }).click();
  await expect(page.getByTestId('sheet')).toContainText('cette barre mesure exactement 10 cm (= 10 m dans la boutique)');
});

test('une boutique plus profonde que large est tournée sur la feuille', async ({ page }, info) => {
  await page.evaluate(() => (window as any).cs3d.store.update((d: any) => {
    d.floor.points = [{ x: 0, y: 0 }, { x: 7, y: 0 }, { x: 7, y: 10 }, { x: 0, y: 10 }];
    d.openings = [];
  }));
  await openExport(page);
  await fillCartouche(page);
  await expect(page.getByTestId('sheet')).toContainText('Plan tourné d’un quart de tour');
  await expect(page.getByRole('button', { name: 'Enregistrer le PDF' })).toBeEnabled();
  const f = info.outputPath('p.pdf'); await download(page, f);
  const pdf = readPdf(f);
  expect(pdf.segs.some(l => Math.abs(l - 300) < 0.05)).toBe(true);
  expect(pdf.segs.some(l => Math.abs(l - 210) < 0.05)).toBe(true);
});

test('le plan ne contient que les murs : pas de mobilier', async ({ page }, info) => {
  await openExport(page);
  await fillCartouche(page);
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
  // Boutique exemple à 1 m = 3 cm : portes de 1,20 m et 0,90 m → 36 mm et 27 mm (sur les deux faces du mur)
  expect(door).toEqual(expect.arrayContaining([36, 36, 27, 27]));
  // Fenêtre de 2,50 m et vitrines de 2,80 m → 75 mm et 84 mm
  expect(win).toEqual(expect.arrayContaining([75, 75, 84, 84, 84, 84]));
});

test('cartouche obligatoire, puis l’explorateur s’ouvre dans le dossier de l’équipe', async ({ page }) => {
  // Explorateur simulé : on garde les options et le fichier écrit.
  await page.evaluate(() => {
    const w = window as any; w.__saved = null;
    w.showSaveFilePicker = async (o: any) => ({ name: o.suggestedName, createWritable: async () => {
      const parts: Blob[] = [];
      return { write: async (b: Blob) => { parts.push(b); }, close: async () => { w.__saved = { opts: o, head: await new Blob(parts).slice(0, 5).text() }; } };
    } });
  });
  await openExport(page);
  const save = page.getByRole('button', { name: 'Enregistrer le PDF' });
  await expect(save).toBeDisabled();
  await expect(page.getByText('Cartouche à compléter')).toBeVisible();
  await expect(page.getByLabel('Classe')).toHaveClass(/missing/);
  await expect(page.getByText('Bureau › Classe › 4X › COMMUN › TECHNOLOGIE › CONCEPT STORE › Prénom_Prénom')).toBeVisible();
  await page.getByLabel('Nom de l’équipe').fill('Les Bâtisseurs');
  await page.getByLabel('Prénoms').fill('Léa, Malik');
  await expect(save).toBeDisabled(); // la classe manque encore
  await page.getByLabel('Classe').fill('4e B');
  await expect(save).toBeEnabled();
  await expect(page.getByText('Cartouche à compléter')).toBeHidden();
  await save.click();
  await expect(page.locator('.toast')).toContainText('Plan enregistré : « Plan-A3-Lea_Malik.pdf »');
  const saved = await page.evaluate(() => (window as any).__saved);
  expect(saved.opts).toMatchObject({ id: 'cs3d-equipe', suggestedName: 'Plan-A3-Lea_Malik.pdf' });
  expect(saved.opts.types[0].accept).toEqual({ 'application/pdf': ['.pdf'] });
  expect(saved.head).toBe('%PDF-');
  // L'étape « Plan A3 » est cochée, le cartouche gardé dans le projet.
  const d = await page.evaluate(() => (window as any).cs3d.store.doc);
  expect(d.steps).toContain('plan');
  expect(d.team).toEqual({ name: 'Les Bâtisseurs', members: 'Léa, Malik', klass: '4e B' });
});
