// Crée « livrables/Concept-Store-3D-<version>.zip » à partir de dist/ (à copier sur le réseau du collège).
import { readFileSync, readdirSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { zipSync } from 'fflate';

const version = JSON.parse(readFileSync('package.json', 'utf8')).version;
const files = {};
const walk = d => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else files['Concept-Store-3D/' + relative('dist', p).split(sep).join('/')] = readFileSync(p); } };
walk('dist');
mkdirSync('livrables', { recursive: true });
const out = `livrables/Concept-Store-3D-${version}.zip`;
writeFileSync(out, zipSync(files, { level: 9 }));
console.log(`${out} : ${Object.keys(files).length} fichiers, ${(statSync(out).size / 1024 / 1024).toFixed(1)} Mo`);
