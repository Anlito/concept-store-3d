// Import des packs CC0 téléchargés dans .tools/packs vers library/modeles/<id>.glb, d'après library/catalogue.json.
// Les fichiers .gltf (+ .bin + texture) sont regroupés en un seul .glb.
// Écrit aussi library/inventaire.json (source, auteur, licence de chaque modèle).
// Lancer : node scripts/import-packs.mjs
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';

const PACK_DIRS = {
  kenney: '.tools/packs/kenney/Models/GLTF format',
  kaykit: '.tools/packs/kaykit/KayKit-Furniture-Bits-1.0-main/addons/kaykit_furniture_bits/Assets/gltf',
};
const cat = JSON.parse(readFileSync('library/catalogue.json', 'utf8'));
mkdirSync('library/modeles', { recursive: true });

const pad4 = n => (4 - (n % 4)) % 4;

/** Regroupe un .gltf à fichiers externes en un .glb. */
function packGltf(file) {
  const dir = dirname(file);
  const json = JSON.parse(readFileSync(file, 'utf8'));
  const chunks = [];
  let offset = 0;
  const pushBin = buf => { const start = offset; chunks.push(buf); offset += buf.length; const p = pad4(offset); if (p) { chunks.push(Buffer.alloc(p)); offset += p; } return start; };
  // Tampons existants → un seul tampon ; on décale les bufferViews.
  const bufferOffsets = (json.buffers || []).map(b => pushBin(readFileSync(join(dir, decodeURIComponent(b.uri)))));
  for (const bv of json.bufferViews || []) { bv.byteOffset = (bv.byteOffset || 0) + bufferOffsets[bv.buffer]; bv.buffer = 0; }
  // Images → bufferViews
  for (const img of json.images || []) {
    if (!img.uri || img.uri.startsWith('data:')) continue;
    const data = readFileSync(join(dir, decodeURIComponent(img.uri)));
    const start = pushBin(data);
    json.bufferViews.push({ buffer: 0, byteOffset: start, byteLength: data.length });
    img.bufferView = json.bufferViews.length - 1;
    img.mimeType = img.mimeType || (img.uri.endsWith('.png') ? 'image/png' : 'image/jpeg');
    delete img.uri;
  }
  const bin = Buffer.concat(chunks);
  json.buffers = [{ byteLength: bin.length }];
  return makeGlb(json, bin);
}
function makeGlb(json, bin) {
  let js = Buffer.from(JSON.stringify(json), 'utf8');
  js = Buffer.concat([js, Buffer.alloc(pad4(js.length), 0x20)]);
  const b = Buffer.concat([bin, Buffer.alloc(pad4(bin.length))]);
  const header = Buffer.alloc(12); header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(12 + 8 + js.length + 8 + b.length, 8);
  const jh = Buffer.alloc(8); jh.writeUInt32LE(js.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
  const bh = Buffer.alloc(8); bh.writeUInt32LE(b.length, 0); bh.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, jh, js, bh, b]);
}

const inventory = [];
let total = 0, missing = 0;
for (const m of cat.modeles) {
  const base = join(PACK_DIRS[m.pack], m.src);
  let glb;
  if (existsSync(base + '.glb')) glb = readFileSync(base + '.glb');
  else if (existsSync(base + '.gltf')) glb = packGltf(base + '.gltf');
  else { console.error('Introuvable : ' + base); missing++; continue; }
  writeFileSync(`library/modeles/${m.id}.glb`, glb);
  total += glb.length;
  const p = cat.packs[m.pack];
  inventory.push({ id: m.id, nom: m.nom, fichier_origine: m.src, pack: p.nom, auteur: p.auteur, licence: p.licence, source: p.source, verifie_le: new Date().toISOString().slice(0, 10) });
}
writeFileSync('library/inventaire.json', JSON.stringify({
  _lisezmoi: 'Inventaire des modèles intégrés à la bibliothèque de base. Seuls des modèles CC0 ou CC-BY sont autorisés. Licence vérifiée sur la fiche (License.txt) de chaque pack avant intégration.',
  modeles: inventory,
}, null, 2) + '\n');
console.log(`${inventory.length} modèles importés (${(total / 1024).toFixed(0)} Ko)` + (missing ? `, ${missing} introuvables` : ''));
if (missing) process.exitCode = 1;
