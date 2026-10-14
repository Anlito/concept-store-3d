import { test, expect, type Page } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { distUrl, nouveauProjet } from './util';

/* Étape 5 : enregistrer, ouvrir, projet modèle protégé, copie de secours — en file://. */

const doc = (page: Page) => page.evaluate(() => (window as any).cs3d.store.doc);
const status = (page: Page) => page.locator('.tb-status');

/** Remplace les sélecteurs de fichiers de Chrome par un faux disque en mémoire (window.__fs). */
async function fakeDisk(page: Page) {
  await page.addInitScript(() => {
    const fs: any = { files: {} as Record<string, string>, saveQueue: [] as string[], openQueue: [] as string[], saveCalls: [] as string[] };
    (window as any).__fs = fs;
    const mk = (name: string) => ({
      kind: 'file', name,
      async getFile() { return new File([fs.files[name] ?? ''], name, { type: 'application/json' }); },
      async createWritable() { let buf = ''; return { async write(t: string) { buf += t; }, async close() { fs.files[name] = buf; } }; },
      async isSameEntry(o: any) { return o?.name === name; },
      async queryPermission() { return 'granted'; }, async requestPermission() { return 'granted'; },
    });
    (window as any).showSaveFilePicker = async (o: any) => { fs.saveCalls.push(o.suggestedName); return mk(fs.saveQueue.shift() ?? o.suggestedName); };
    (window as any).showOpenFilePicker = async () => [mk(fs.openQueue.shift())];
  });
}
/** Navigateur sans sélecteurs (Firefox, ancien Chrome) : repli par téléchargement. */
async function noPickers(page: Page) {
  await page.addInitScript(() => { delete (window as any).showSaveFilePicker; delete (window as any).showOpenFilePicker; });
}

let errors: string[];
test.beforeEach(({ page }) => { errors = []; page.on('pageerror', e => errors.push(e.message)); });
test.afterEach(() => expect(errors).toEqual([]));

test('sans sélecteur de dossier : le projet est téléchargé puis rouvert à l’identique', async ({ page }, info) => {
  await noPickers(page);
  await page.goto(distUrl('index.html'));
  await page.getByTestId('template').click();
  await page.getByRole('button', { name: 'Boutique exemple' }).click();
  // Un meuble, pour vérifier qu'il est bien enregistré
  await page.locator('[data-tool="mobilier"]').click();
  await page.locator('.fc', { hasText: 'Comptoir caisse' }).first().dblclick();
  await expect(status(page)).toHaveText('Non enregistré');
  const before = await doc(page);
  const dl = page.waitForEvent('download');
  await page.keyboard.press('Control+s');
  const d = await dl;
  expect(d.suggestedFilename()).toBe('boutique-exemple.json');
  await expect(status(page)).toHaveText('Enregistré');
  const file = info.outputPath('projet.json'); await d.saveAs(file);
  const json = JSON.parse(readFileSync(file, 'utf8'));
  expect(json.format).toBe('concept-store-3d');
  expect(json.isTemplate).toBeUndefined();
  // Rouvrir dans une nouvelle page
  await page.goto(distUrl('index.html'));
  const chooser = page.waitForEvent('filechooser');
  await page.getByTestId('open-project').click();
  await (await chooser).setFiles(file);
  await expect(page.locator('.tb-name')).toHaveValue('Boutique exemple');
  const after = await doc(page);
  expect(after.floor).toEqual(before.floor);
  expect(after.openings).toEqual(before.openings);
  expect(after.objects).toEqual(before.objects);
  await expect(status(page)).toHaveText('Enregistré');
});

test('un fichier qui n’est pas un projet est refusé', async ({ page }, info) => {
  await noPickers(page);
  await page.goto(distUrl('index.html'));
  const bad = info.outputPath('autre.json');
  writeFileSync(bad, '{"bonjour": 1}');
  const chooser = page.waitForEvent('filechooser');
  await page.getByTestId('open-project').click();
  await (await chooser).setFiles(bad);
  await expect(page.getByText('n’est pas un projet Concept Store 3D')).toBeVisible();
  await expect(page.getByTestId('new-project')).toBeVisible();
});

test('le projet modèle du professeur n’est jamais écrasé', async ({ page }) => {
  await fakeDisk(page);
  await page.goto(distUrl('index.html'));
  // Le professeur prépare un modèle (sol de 8 × 6 m) et l'enregistre comme modèle
  await nouveauProjet(page);
  await page.getByRole('button', { name: 'Rectangle', exact: true }).click();
  const fields = page.getByTestId('panel').locator('input');
  await fields.nth(0).fill('8'); await fields.nth(0).press('Enter');
  await fields.nth(1).fill('6'); await fields.nth(1).press('Enter');
  await page.getByRole('button', { name: 'Créer ce rectangle' }).click();
  await page.locator('.tb-name').fill('Boutique à compléter'); await page.locator('.tb-name').press('Enter');
  await page.getByRole('button', { name: 'Autres façons d’enregistrer' }).click();
  await page.getByRole('menuitem', { name: 'Enregistrer comme modèle (professeur)' }).click();
  await expect(page.getByText('Modèle enregistré')).toBeVisible();
  const fsState = () => page.evaluate(() => (window as any).__fs);
  const tpl = (await fsState()).files['modele-boutique-a-completer.json'];
  expect(JSON.parse(tpl).isTemplate).toBe(true);

  // Un élève ouvre le modèle
  await page.evaluate(() => { (window as any).__fs.openQueue.push('modele-boutique-a-completer.json'); });
  await page.locator('.tb-logo').click();
  await page.getByRole('button', { name: 'Quitter sans enregistrer' }).click().catch(() => { /* rien à enregistrer */ });
  await page.getByTestId('template').click();
  await page.getByRole('button', { name: 'Modèle du professeur' }).click();
  await expect(page.locator('.tb-name')).toHaveValue('Boutique à compléter');
  await expect(status(page)).toHaveText('Pas encore enregistré');
  // Il essaie d'enregistrer… par-dessus le modèle : refusé
  await page.evaluate(() => { (window as any).__fs.saveQueue.push('modele-boutique-a-completer.json'); });
  await page.keyboard.press('Control+s');
  await expect(page.getByText('C’est un fichier modèle')).toBeVisible();
  expect((await fsState()).files['modele-boutique-a-completer.json']).toBe(tpl);
  // L'outil propose un nouveau nom (pas celui du modèle) ; l'élève accepte
  await page.keyboard.press('Control+s');
  await expect(status(page)).toHaveText('Enregistré');
  const fs = await fsState();
  expect(fs.saveCalls.at(-1)).toBe('boutique-a-completer.json');
  expect(JSON.parse(fs.files['boutique-a-completer.json']).isTemplate).toBeUndefined();
  expect(fs.files['modele-boutique-a-completer.json']).toBe(tpl);
  // Ensuite « Enregistrer » réécrit son propre fichier sans redemander
  const calls = fs.saveCalls.length;
  await page.locator('[data-tool="sol"]').click();
  const hgt = page.getByTestId('panel').getByLabel('Hauteur');
  await hgt.fill('250'); await hgt.press('Enter');
  await expect(status(page)).toHaveText('Enregistrement auto');
  await page.keyboard.press('Control+s');
  await expect(status(page)).toHaveText('Enregistré');
  const fs2 = await fsState();
  expect(fs2.saveCalls.length).toBe(calls);
  expect(JSON.parse(fs2.files['boutique-a-completer.json']).walls.height).toBe(2.5);
});

test('copie de secours : un travail non enregistré se retrouve dans « Projets récents »', async ({ page }) => {
  await page.goto(distUrl('index.html'));
  await nouveauProjet(page);
  await page.getByRole('button', { name: 'Rectangle', exact: true }).click();
  await page.getByRole('button', { name: 'Créer ce rectangle' }).click();
  await page.locator('.tb-name').fill('Le Comptoir Vert'); await page.locator('.tb-name').press('Enter');
  await page.waitForTimeout(1800); // copie de secours automatique
  // Fermer l'onglet sans enregistrer : le navigateur prévient
  const p2 = await page.context().newPage();
  let warned = false;
  page.on('dialog', d => { warned = d.type() === 'beforeunload'; void d.accept(); });
  await page.close({ runBeforeUnload: true });
  await expect.poll(() => warned).toBe(true);
  // Au retour, le projet est dans les récents, marqué « non enregistré »
  await p2.goto(distUrl('index.html'));
  const card = p2.getByTestId('recents').locator('.rc', { hasText: 'Le Comptoir Vert' });
  await expect(card).toContainText('Modifications non enregistrées');
  await card.click();
  await expect(p2.locator('.tb-name')).toHaveValue('Le Comptoir Vert');
  await expect(p2.locator('.tb-status')).toHaveText('Non enregistré');
  const d = await p2.evaluate(() => (window as any).cs3d.store.doc);
  expect(d.floor.points).toHaveLength(4);
});

test('revenir à l’accueil sans enregistrer demande confirmation', async ({ page }) => {
  await page.goto(distUrl('index.html'));
  await page.getByTestId('template').click();
  await page.getByRole('button', { name: 'Boutique exemple' }).click();
  await page.locator('[data-tool="sol"]').click();
  const hgt = page.getByTestId('panel').getByLabel('Hauteur');
  await hgt.fill('280'); await hgt.press('Enter');
  await page.locator('.tb-logo').click();
  await expect(page.getByRole('dialog', { name: 'Ton projet n’est pas enregistré' })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Annuler' }).click();
  await expect(page.locator('.tb-name')).toBeVisible();
  await page.locator('.tb-logo').click();
  await page.getByRole('button', { name: 'Quitter sans enregistrer' }).click();
  await expect(page.getByTestId('new-project')).toBeVisible();
});

test('nouveau projet : l’équipe, son dossier, puis enregistrement automatique', async ({ page }) => {
  await fakeDisk(page);
  await page.goto(distUrl('index.html'));
  await page.getByTestId('new-project').click();
  const dlg = page.getByRole('dialog', { name: 'Nouveau projet' });
  await dlg.getByLabel('Prénoms de l’équipe').fill('Léa, Malik');
  await expect(dlg).toContainText('4X › COMMUN › TECHNOLOGIE › CONCEPT STORE › Lea_Malik');
  await dlg.getByLabel('Classe').fill('4e B');
  await dlg.getByLabel('Nom de l’équipe').fill('Les Bâtisseurs');
  await dlg.getByLabel('Nom de la boutique').fill('Le Comptoir Vert');
  await dlg.getByRole('button', { name: 'Choisir le dossier et commencer' }).click();
  // Le dossier est demandé tout de suite ; le projet y est enregistré
  await expect(status(page)).toHaveText('Enregistré');
  const fsState = () => page.evaluate(() => (window as any).__fs);
  expect((await fsState()).saveCalls).toEqual(['le-comptoir-vert-les-batisseurs.json']);
  let d = await doc(page);
  expect(d.team).toEqual({ name: 'Les Bâtisseurs', members: 'Léa, Malik', klass: '4e B' });
  expect(d.name).toBe('Le Comptoir Vert');
  // Une modification : enregistrée toute seule quelques secondes plus tard, sans fenêtre
  await page.getByRole('button', { name: 'Rectangle', exact: true }).click();
  await page.getByRole('button', { name: 'Créer ce rectangle' }).click();
  await expect(status(page)).toHaveText('Enregistrement auto');
  await expect(status(page)).toHaveText('Enregistré', { timeout: 15_000 });
  const fs = await fsState();
  expect(fs.saveCalls).toHaveLength(1);
  expect(JSON.parse(fs.files['le-comptoir-vert-les-batisseurs.json']).floor.points).toHaveLength(4);
  // Le cartouche du plan A3 est déjà rempli
  await page.getByRole('button', { name: 'Plan A3' }).click();
  await expect(page.getByLabel('Prénoms')).toHaveValue('Léa, Malik');
  await expect(page.getByLabel('Classe')).toHaveValue('4e B');
});

test('nouveau projet : les champs sont facultatifs, et le dossier peut être choisi plus tard', async ({ page }) => {
  await fakeDisk(page);
  await page.goto(distUrl('index.html'));
  await page.evaluate(() => { (window as any).showSaveFilePicker = async () => { throw new DOMException('Annulé', 'AbortError'); }; });
  await page.getByTestId('new-project').click();
  await page.getByRole('dialog', { name: 'Nouveau projet' }).getByRole('button', { name: 'Choisir le dossier et commencer' }).click();
  await expect(page.getByText('Pas de dossier choisi')).toBeVisible();
  await expect(status(page)).toHaveText('Pas encore enregistré');
  expect((await doc(page)).team).toEqual({ name: '', members: '', klass: '' });
});
