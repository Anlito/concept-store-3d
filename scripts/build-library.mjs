// Génère src/library/models.gen.ts : les modèles de library/modeles/*.glb intégrés en base64
// (le HTML final reste un fichier unique, sans fetch, compatible file://). Lancer : node scripts/build-library.mjs
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';

const dir = 'library/modeles/';
const files = readdirSync(dir).filter(f => f.endsWith('.glb')).sort();
const lines = files.map(f => `  ${JSON.stringify(f.replace(/\.glb$/, ''))}: ${JSON.stringify(readFileSync(dir + f).toString('base64'))},`);
writeFileSync('src/library/models.gen.ts',
  '// Fichier généré par scripts/build-library.mjs — ne pas modifier à la main.\n' +
  '/** Modèles GLB de la bibliothèque de base, encodés en base64. */\n' +
  'export const MODELS: Record<string, string> = {\n' + lines.join('\n') + '\n};\n');
console.log(files.length + ' modèles intégrés');
