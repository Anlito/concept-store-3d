import { test, expect, type Page } from '@playwright/test';
import { cpSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { distUrl } from './util';

/* Étape 8 : dossier « Mobilier » du professeur (niveau C) — en file://. */

/** GLB minimal : une boîte de 120 × 80 × 60 « unités » (comme un modèle fait en centimètres). */
function boxGlbInCm(): Buffer {
  const [X, Y, Z] = [120, 80, 60];
  const c = [[0, 0, 0], [X, 0, 0], [X, Y, 0], [0, Y, 0], [0, 0, Z], [X, 0, Z], [X, Y, Z], [0, Y, Z]];
  const f = [[0, 1, 2], [0, 2, 3], [4, 6, 5], [4, 7, 6], [0, 4, 5], [0, 5, 1], [1, 5, 6], [1, 6, 2], [2, 6, 7], [2, 7, 3], [3, 7, 4], [3, 4, 0]];
  const pos = new Float32Array(f.flat().flatMap(i => c[i]));
  const bin = Buffer.from(pos.buffer);
  const json = { asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    accessors: [{ bufferView: 0, componentType: 5126, count: pos.length / 3, type: 'VEC3', min: [0, 0, 0], max: [X, Y, Z] }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: bin.length }], buffers: [{ byteLength: bin.length }] };
  let js = Buffer.from(JSON.stringify(json)); js = Buffer.concat([js, Buffer.alloc((4 - js.length % 4) % 4, 0x20)]);
  const h = Buffer.alloc(12); h.writeUInt32LE(0x46546c67, 0); h.writeUInt32LE(2, 4); h.writeUInt32LE(12 + 8 + js.length + 8 + bin.length, 8);
  const jh = Buffer.alloc(8); jh.writeUInt32LE(js.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
  const bh = Buffer.alloc(8); bh.writeUInt32LE(bin.length, 0); bh.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([h, jh, js, bh, bin]);
}

/** Copie de dist/ avec des modèles dans Mobilier/, et mobilier-prof.js généré par le script du professeur. */
function distWithTeacherModels(dir: string) {
  cpSync(resolve('dist'), dir, { recursive: true });
  const mob = join(dir, 'Mobilier');
  mkdirSync(join(mob, 'Plantes'), { recursive: true }); mkdirSync(join(mob, 'Comptoirs'), { recursive: true });
  cpSync(resolve('library/modeles/cactus-grand.glb'), join(mob, 'Plantes', 'Grand_cactus.glb'));
  cpSync(resolve('library/modeles/chaise.glb'), join(mob, 'Tabouret_maison_65cm.glb'));
  writeFileSync(join(mob, 'Comptoirs', 'Presentoir_en_cm.glb'), boxGlbInCm());
  if (process.platform === 'win32') {
    // Lancé depuis le dossier lui-même, comme le .bat (évite de passer un chemin accentué en argument).
    try { execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 'Mettre-a-jour-le-mobilier.ps1'], { cwd: mob }); }
    catch (e) { throw new Error('Script du professeur en échec (' + readdirSync(mob).join(', ') + ') : ' + ((e as { stderr?: Buffer }).stderr?.toString('latin1') ?? '')); }
  } else { // même format que le script Windows
    const files = ['Comptoirs/Presentoir_en_cm.glb', 'Plantes/Grand_cactus.glb', 'Tabouret_maison_65cm.glb'];
    writeFileSync(join(mob, 'mobilier-prof.js'), 'window.CS3D_MOBILIER = ' + JSON.stringify(files.map(p => { const b = readFileSync(join(mob, p)); return { path: p, size: b.length, data: b.toString('base64') }; })) + ';');
  }
  return pathToFileURL(join(dir, 'index.html')).href;
}

const doc = (page: Page) => page.evaluate(() => (window as any).cs3d.store.doc);
async function openProfTab(page: Page) {
  await page.getByTestId('template').click();
  await page.getByRole('button', { name: 'Boutique exemple' }).click();
  await page.locator('[data-tool="mobilier"]').click();
  await page.locator('.lib-tab', { hasText: 'Ajouts du professeur' }).click();
}

let errors: string[];
test.beforeEach(({ page }) => { errors = []; page.on('pageerror', e => errors.push(e.message)); });
test.afterEach(() => expect(errors).toEqual([]));

test('les modèles du dossier « Mobilier » apparaissent au lancement (script du professeur)', async ({ page }) => {
  await page.goto(distWithTeacherModels(mkdtempSync(join(tmpdir(), 'cs3d-prof-'))));
  await openProfTab(page);
  const lib = page.getByTestId('library');
  await expect(lib.locator('.lib-tab', { hasText: 'Ajouts du professeur' })).toContainText('3');
  await expect(lib).toContainText('fichier « mobilier-prof.js » lu au démarrage');
  // Catégories d'après les sous-dossiers, noms d'après les fichiers, badge « Prof »
  await lib.locator('.lib-cat', { hasText: 'Plantes' }).click();
  await expect(lib.locator('.fc')).toHaveCount(1);
  await expect(lib.locator('.fc')).toContainText('Grand cactus');
  await lib.locator('.lib-cat', { hasText: 'Tout' }).click();
  // Hauteur fixée par le nom (_65cm)
  const tab = lib.locator('.fc', { hasText: 'Tabouret maison' });
  await expect(tab.locator('.fc-d')).toHaveText(/× 65 cm$/);
  await expect(tab.locator('.fc-badge')).toHaveText('Prof');
  // Modèle fait en centimètres : 120 × 80 × 60 unités → 1,20 m × 0,60 m × 0,80 m (y vers le haut)
  await expect(lib.locator('.fc', { hasText: 'Presentoir en cm' }).locator('.fc-d')).toHaveText('120 × 60 × 80 cm');
  await tab.dblclick();
  const d = await doc(page);
  expect(d.objects[0].model).toBe('prof:Tabouret_maison_65cm.glb');
  expect(d.objects[0].size.h).toBeCloseTo(0.65, 2);
  await expect(page.getByTestId('panel')).toContainText('Ajouts du professeur');
});

test('corriger la taille et l’orientation d’un ajout du professeur', async ({ page }) => {
  await page.goto(distWithTeacherModels(mkdtempSync(join(tmpdir(), 'cs3d-prof-'))));
  await openProfTab(page);
  const card = page.locator('.fc', { hasText: 'Presentoir en cm' });
  await card.hover();
  await card.getByTitle('Corriger la taille ou l’orientation').click();
  const dlg = page.getByRole('dialog', { name: 'Corriger le modèle' });
  await dlg.getByLabel('Hauteur réelle').fill('100');
  await dlg.getByText('Le modèle est couché').click();
  await dlg.getByRole('button', { name: 'Appliquer' }).click();
  // Redressé : l'ancienne profondeur (60) devient la hauteur, mise à 100 cm → 200 × 133 × 100 cm
  await expect(page.locator('.fc', { hasText: 'Presentoir en cm' }).locator('.fc-d')).toHaveText('200 × 133 × 100 cm');
});

test('Chrome / Edge : « Charger le dossier du professeur »', async ({ page }) => {
  await page.addInitScript((b64: string) => {
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const file = (name: string) => ({ kind: 'file', name, getFile: async () => new File([bytes], name) });
    const dir = (name: string, kids: any[]) => ({ kind: 'directory', name, async *values() { for (const k of kids) yield k; },
      queryPermission: async () => 'granted', requestPermission: async () => 'granted' });
    (window as any).showDirectoryPicker = async () => dir('Mobilier', [file('Lampe_ronde_150cm.glb'), file('notes.txt'), dir('Luminaires', [file('Applique.glb')])]);
  }, readFileSync(resolve('library/modeles/lampadaire-rond.glb')).toString('base64'));
  await page.goto(distUrl('index.html'));
  await openProfTab(page);
  await page.getByRole('button', { name: 'Charger le dossier du professeur' }).click();
  await expect(page.getByText('2 modèles chargés depuis « Mobilier »')).toBeVisible();
  await page.locator('.lib-cat', { hasText: 'Luminaires' }).click();
  await expect(page.locator('.fc')).toHaveCount(1);
  await page.locator('.lib-cat', { hasText: 'Tout' }).click();
  await expect(page.locator('.fc', { hasText: 'Lampe ronde' }).locator('.fc-d')).toHaveText(/× 150 cm$/);
});

test('un projet qui utilise un modèle absent s’ouvre quand même (boîte grise et message)', async ({ page }, info) => {
  await page.addInitScript(() => { delete (window as any).showOpenFilePicker; });
  await page.goto(distUrl('index.html'));
  const p = { format: 'concept-store-3d', version: 1, id: 'x', name: 'Boutique du prof', team: { name: '', members: '', klass: '' },
    floor: { points: [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 4 }, { x: 0, y: 4 }], material: 'parquet', color: '#EFE9DF' },
    walls: { height: 3, thickness: 0.1, styles: [] }, openings: [], creations: [], assets: [], images: [],
    objects: [{ id: 'o1', model: 'prof:Mannequin_170cm.glb', x: 3, y: 2, z: 0, rot: 0, size: { w: 0.5, d: 0.4, h: 1.7 }, color: null, locked: false }] };
  const f = info.outputPath('p.json'); writeFileSync(f, JSON.stringify(p));
  const fc = page.waitForEvent('filechooser');
  await page.getByTestId('open-project').click();
  await (await fc).setFiles(f);
  await page.locator('[data-tool="mobilier"]').click();
  await page.keyboard.press('Escape');
  await page.evaluate(() => (window as any).cs3d.ui.set({ sel: { kind: 'objects', ids: ['o1'] } }));
  await expect(page.getByTestId('panel')).toContainText('Modèle introuvable');
  expect((await doc(page)).objects).toHaveLength(1);
});
