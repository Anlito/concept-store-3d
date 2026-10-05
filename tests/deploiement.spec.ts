import { test, expect } from '@playwright/test';
import { cpSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

/* Script « Deployer-dans-les-classes » (Windows) : copie l'outil dans le dossier de chaque classe. */

test.skip(process.platform !== 'win32', 'script Windows');

test('déploiement dans les dossiers des classes : copie, mise à jour, projets des élèves intacts', () => {
  const root = mkdtempSync(join(tmpdir(), 'cs3d-deploi-'));
  const maitre = join(root, 'Prof'), outil = join(maitre, 'Concept-Store-3D');
  mkdirSync(maitre, { recursive: true });
  cpSync('dist', outil, { recursive: true, filter: s => !/[\/]\.[^\/]*$/.test(s) });
  for (const f of readdirSync('deploiement')) copyFileSync(join('deploiement', f), join(maitre, f));
  // Mobilier du professeur : un modèle .glb sans liste à jour.
  mkdirSync(join(outil, 'Mobilier', 'Assises'), { recursive: true });
  const glb = readdirSync('library/modeles').find(f => f.endsWith('.glb'))!;
  copyFileSync(join('library/modeles', glb), join(outil, 'Mobilier', 'Assises', glb));

  const a = join(root, 'Classes', '4e A'), b = join(root, 'Classes', 'Élèves 4e B');
  mkdirSync(a, { recursive: true });
  mkdirSync(join(b, 'Concept-Store-3D'), { recursive: true });
  writeFileSync(join(b, 'Concept-Store-3D', 'projet-equipe.json'), '{"eleve":true}');
  writeFileSync(join(maitre, 'classes.txt'), `# test\r\n${a}\r\n\r\n"${b}"\r\n${join(root, 'Classes', '4e Z')}\r\n`, 'utf8');

  const run = () => spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(maitre, 'Deployer-dans-les-classes.ps1')], { encoding: 'utf8' });
  let r = run();
  expect(r.status, r.stdout + r.stderr).toBe(1); // une classe introuvable
  expect(r.stdout).toContain('2 classe(s) a jour, 1 echec(s).');
  expect(r.stdout).toMatch(/ECHEC .*4e Z/);
  for (const c of [a, b]) {
    for (const f of ['index.html', 'diagnostic.html', 'Fiche-eleve.pdf', 'LISEZMOI.txt', 'Mobilier/mobilier-prof.js'])
      expect(existsSync(join(c, 'Concept-Store-3D', f)), c + ' ' + f).toBe(true);
    expect(readFileSync(join(c, 'Concept-Store-3D', 'Mobilier', 'mobilier-prof.js'), 'utf8')).toContain('Assises/' + glb);
  }
  expect(readFileSync(join(b, 'Concept-Store-3D', 'projet-equipe.json'), 'utf8')).toBe('{"eleve":true}');

  // Mise à jour : un projet modèle ajouté dans la copie maître arrive dans toutes les classes.
  writeFileSync(join(maitre, 'classes.txt'), `${a}\r\n${b}\r\n`, 'utf8');
  writeFileSync(join(outil, 'modele-concept-store.json'), '{"modele":true}');
  r = run();
  expect(r.status, r.stdout + r.stderr).toBe(0);
  expect(r.stdout).toContain('2 classe(s) a jour, 0 echec(s).');
  for (const c of [a, b]) expect(existsSync(join(c, 'Concept-Store-3D', 'modele-concept-store.json'))).toBe(true);
  expect(existsSync(join(b, 'Concept-Store-3D', 'projet-equipe.json'))).toBe(true);
});
