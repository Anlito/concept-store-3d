import * as THREE from 'three';
import '../ui/base.css';
import './diagnostic.css';
import { h, icon } from '../ui/dom';

/* Page de diagnostic : à ouvrir en double-clic sur un PC du collège, avant tout développement.
   Vérifie le navigateur, l'ouverture en file://, WebGL, les performances 3D et l'accès aux fichiers. */

type Level = 'ok' | 'warn' | 'bad' | 'info' | 'run';
interface Row { k: string; v: string; level?: Level; note?: string }

const LABEL: Record<Level, string> = { ok: 'OK', warn: 'À surveiller', bad: 'Bloquant', info: 'Info', run: 'En cours…' };
const ICON: Record<Level, string> = { ok: 'check_circle', warn: 'warning', bad: 'cancel', info: 'info', run: 'progress_activity' };
const report: { section: string; rows: Row[] }[] = [];
const levels: Level[] = [];

const chip = (l: Level) => h('span', { class: 'chip ' + l }, icon(ICON[l], true), LABEL[l]);

function card(title: string, ic: string, rows: Row[], wide = false, extra?: HTMLElement) {
  report.push({ section: title, rows });
  rows.forEach(r => r.level && levels.push(r.level));
  return h('section', { class: 'dg-card' + (wide ? ' wide' : '') },
    h('h2', null, icon(ic), title),
    h('div', { class: 'dg-rows' }, rows.map(rowEl)),
    extra);
}
const rowEl = (r: Row) => h('div', { class: 'dg-row' },
  h('span', { class: 'k' }, r.k),
  h('span', { class: 'v' }, r.v, r.note ? h('span', { class: 'note' }, r.note) : null),
  r.level ? chip(r.level) : null);

/* ---------- 1. Navigateur ---------- */
function browserInfo(): Row[] {
  const ua = navigator.userAgent;
  const edge = ua.match(/Edg\/(\d+)/), chrome = ua.match(/Chrome\/(\d+)/), firefox = ua.match(/Firefox\/(\d+)/);
  let name = 'Inconnu', version = 0, level: Level = 'warn', note = 'Navigateurs prévus : Chrome ou Edge récents.';
  if (edge) { name = 'Microsoft Edge'; version = +edge[1]; }
  else if (chrome) { name = 'Google Chrome (ou Chromium)'; version = +chrome[1]; }
  else if (firefox) { name = 'Firefox'; version = +firefox[1]; note = 'Firefox fonctionne pour la 3D, mais pas pour l’enregistrement direct dans un dossier : préférer Chrome ou Edge.'; }
  if ((edge || chrome) && version >= 110) { level = 'ok'; note = ''; }
  else if (edge || chrome) { level = 'warn'; note = 'Version ancienne : certaines fonctions (enregistrement direct) peuvent manquer. Version 110 ou plus recommandée.'; }
  const os = /Windows NT 10/.test(ua) ? 'Windows 10 ou 11' : /Windows NT 6\.1/.test(ua) ? 'Windows 7' : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'Inconnu';
  return [
    { k: 'Navigateur', v: `${name} ${version || ''}`.trim(), level, note },
    { k: 'Système', v: os, level: 'info' },
    { k: 'Identifiant complet', v: ua, level: 'info' },
  ];
}

/* ---------- 2. Ouverture du fichier ---------- */
function openingInfo(): Row[] {
  const proto = location.protocol;
  const fonts = document.fonts ? document.fonts.check('800 16px Nunito') : false;
  return [
    { k: 'Mode d’ouverture', v: proto === 'file:' ? 'Double-clic sur le fichier (file://)' : `Serveur web (${proto}//${location.host})`, level: 'info',
      note: location.href.length > 120 ? location.href.slice(0, 120) + '…' : location.href },
    { k: 'Contexte sécurisé', v: window.isSecureContext ? 'Oui' : 'Non', level: window.isSecureContext ? 'ok' : 'warn',
      note: window.isSecureContext ? '' : 'Nécessaire pour enregistrer directement dans un dossier. Ouvrir en file:// ou en https.' },
    { k: 'Code embarqué', v: 'Le script de la page s’exécute', level: 'ok', note: 'La page en fichier unique fonctionne sans Internet.' },
    { k: 'Police embarquée', v: fonts ? 'Nunito chargée' : 'Police de secours', level: fonts ? 'ok' : 'warn' },
  ];
}

/* ---------- 3. WebGL ---------- */
interface GLInfo { rows: Row[]; ok: boolean; software: boolean }
function webglInfo(): GLInfo {
  const c = document.createElement('canvas');
  const gl2 = c.getContext('webgl2') as WebGL2RenderingContext | null;
  const gl = gl2 || (c.getContext('webgl') as WebGLRenderingContext | null);
  if (!gl) return {
    ok: false, software: false, rows: [{ k: 'WebGL', v: 'Indisponible', level: 'bad',
      note: 'La 3D ne peut pas s’afficher. Vérifier dans le navigateur : Paramètres › Système › « Utiliser l’accélération graphique », ou demander à l’administrateur réseau si WebGL est bloqué.' }],
  };
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  const renderer = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
  const vendor = dbg ? String(gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL)) : String(gl.getParameter(gl.VENDOR));
  const software = /swiftshader|llvmpipe|basic render|software|microsoft basic/i.test(renderer);
  const maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
  const rows: Row[] = [
    { k: 'WebGL', v: gl2 ? 'WebGL 2 disponible' : 'WebGL 1 seulement', level: gl2 ? 'ok' : 'warn', note: gl2 ? '' : 'Fonctionne, avec un rendu un peu moins soigné.' },
    { k: 'Carte graphique', v: renderer, level: software ? 'warn' : 'ok',
      note: software ? 'Rendu logiciel (sans accélération) : la 3D sera lente. Activer l’accélération graphique dans les paramètres du navigateur si possible.' : vendor },
    { k: 'Taille max. des textures', v: `${maxTex} px`, level: maxTex >= 4096 ? 'ok' : 'warn', note: 'Les images importées sont réduites à 2048 px.' },
  ];
  (gl.getExtension('WEBGL_lose_context') as WEBGL_lose_context | null)?.loseContext();
  return { rows, ok: true, software };
}

/* ---------- 4. Matériel et écran ---------- */
function hardwareInfo(): Row[] {
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  const cores = navigator.hardwareConcurrency || 0;
  const sw = screen.width, sh = screen.height, ww = window.innerWidth, wh = window.innerHeight;
  return [
    { k: 'Écran', v: `${sw} × ${sh} px (zoom système ${Math.round(devicePixelRatio * 100)} %)`,
      level: sw >= 1366 && sh >= 768 ? 'ok' : 'warn', note: sw >= 1366 ? '' : 'L’interface est prévue pour 1366 × 768 minimum.' },
    { k: 'Fenêtre du navigateur', v: `${ww} × ${wh} px`, level: 'info', note: 'Afficher le navigateur en plein écran (F11) donne plus de place.' },
    { k: 'Processeur', v: cores ? `${cores} cœurs logiques` : 'Non communiqué', level: cores && cores < 4 ? 'warn' : 'info' },
    { k: 'Mémoire', v: mem ? `${mem} Go ou plus` : 'Non communiquée', level: mem !== undefined && mem < 4 ? 'warn' : 'info',
      note: mem ? 'Valeur arrondie par le navigateur (8 Go au maximum).' : '' },
  ];
}

/* ---------- 5. Fichiers et sauvegarde ---------- */
type FSWindow = Window & {
  showOpenFilePicker?: unknown; showDirectoryPicker?: (o?: object) => Promise<FileSystemDirectoryHandle & { values(): AsyncIterable<FileSystemHandle> }>;
  showSaveFilePicker?: (o?: object) => Promise<FileSystemFileHandle>;
};
const W = window as FSWindow;
function filesInfo(): Row[] {
  let ls = false;
  try { localStorage.setItem('cs3d-test', '1'); ls = localStorage.getItem('cs3d-test') === '1'; localStorage.removeItem('cs3d-test'); } catch { ls = false; }
  const fsa = typeof W.showSaveFilePicker === 'function' && typeof W.showOpenFilePicker === 'function';
  const dir = typeof W.showDirectoryPicker === 'function';
  return [
    { k: 'Enregistrer dans un dossier', v: fsa ? 'Disponible' : 'Indisponible', level: fsa ? 'ok' : 'warn',
      note: fsa ? 'L’élève choisit le dossier de son équipe et le nom du fichier.' : 'Repli : le projet sera téléchargé dans « Téléchargements ».' },
    { k: 'Lire un dossier entier', v: dir ? 'Disponible' : 'Indisponible', level: dir ? 'ok' : 'warn',
      note: dir ? 'Bouton « Charger le dossier du professeur » utilisable.' : 'Repli : fichier manifest.json généré par le script du professeur.' },
    { k: 'Copie de secours (navigateur)', v: ls ? 'Disponible' : 'Bloquée', level: ls ? 'ok' : 'warn',
      note: ls ? '' : 'Pas de copie de secours automatique : penser à enregistrer souvent.' },
    { k: 'Téléchargement de fichiers', v: 'Testable avec le bouton ci-dessous', level: 'info' },
  ];
}

/* ---------- 6. Test de performance 3D ---------- */
interface Phase { id: string; name: string; desc: string; shadows: false | { size: number; soft: boolean }; fps?: number; p95?: number }
const PHASES: Phase[] = [
  { id: 'none', name: 'Sans ombres', desc: 'Qualité minimale', shadows: false },
  { id: 'low', name: 'Ombres légères', desc: 'Carte d’ombres 1024 px', shadows: { size: 1024, soft: false } },
  { id: 'high', name: 'Ombres soignées', desc: 'Carte d’ombres 2048 px, adoucies', shadows: { size: 2048, soft: true } },
];
const PHASE_MS = 4000;

function buildTestScene(scene: THREE.Scene) {
  scene.background = new THREE.Color('#EFEEEA');
  const hemi = new THREE.HemisphereLight(0xffffff, 0xd9d2c6, 1.6);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 1.8);
  sun.position.set(6, 10, 4);
  sun.target.position.set(5, 0, 3.5);
  Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 1, far: 30 });
  sun.shadow.bias = -0.0005;
  scene.add(sun, sun.target);
  const mat = (c: string) => new THREE.MeshLambertMaterial({ color: c });
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(geo, m); mesh.position.set(x, y, z); mesh.castShadow = mesh.receiveShadow = true; scene.add(mesh); return mesh;
  };
  add(new THREE.BoxGeometry(10, 0.1, 7), mat('#EFE9DF'), 5, -0.05, 3.5);
  const wall = mat('#FCFBF9');
  add(new THREE.BoxGeometry(10.3, 3, 0.15), wall, 5, 1.5, -0.075);
  add(new THREE.BoxGeometry(0.15, 3, 7), wall, -0.075, 1.5, 3.5);
  add(new THREE.BoxGeometry(0.15, 3, 7), wall, 10.075, 1.5, 3.5);
  const cols = ['#C9A97E', '#2E2D2B', '#F6F4F0', '#BF4E36', '#6E8B6B', '#D9D2C6', '#5B6B7A'];
  // ~60 meubles simples (≈ 250 volumes) : un peu plus chargé qu'une vraie boutique d'élève.
  let n = 0;
  for (let i = 0; i < 10; i++) for (let j = 0; j < 6; j++) {
    const x = 0.6 + i * 0.95, z = 0.6 + j * 1.05, c = mat(cols[n++ % cols.length]);
    if ((i + j) % 3 === 0) {
      add(new THREE.CylinderGeometry(0.22, 0.22, 0.04, 24), c, x, 0.72, z);
      add(new THREE.CylinderGeometry(0.03, 0.03, 0.7, 12), mat('#2E2D2B'), x, 0.35, z);
      add(new THREE.CylinderGeometry(0.18, 0.18, 0.02, 24), mat('#2E2D2B'), x, 0.01, z);
    } else {
      add(new THREE.BoxGeometry(0.6, 0.05, 0.45), c, x, 0.45, z);
      for (const [dx, dz] of [[-.27, -.2], [.27, -.2], [-.27, .2], [.27, .2]]) add(new THREE.BoxGeometry(0.04, 0.43, 0.04), c, x + dx, 0.215, z + dz);
    }
  }
  return sun;
}

function perfCard(onDone: (phases: Phase[]) => void) {
  const canvasBox = h('div', { class: 'dg-canvas' });
  const badge = h('div', { class: 'badge' }, icon('speed'), 'Préparation…');
  canvasBox.appendChild(badge);
  const phaseEls = PHASES.map(p => {
    const fps = h('span', { class: 'fps' }, '—');
    const el = h('div', { class: 'dg-phase' }, h('span', { class: 'n' }, p.name, h('small', null, p.desc)), fps);
    return { p, el, fps };
  });
  const verdict = h('div', { class: 'dg-rows' });
  const el = h('section', { class: 'dg-card wide' },
    h('h2', null, icon('speed'), 'Performance 3D'),
    h('div', { class: 'dg-perf' }, canvasBox, h('div', { class: 'dg-phases' }, phaseEls.map(x => x.el))),
    verdict);

  const run = () => {
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    } catch {
      badge.replaceChildren(icon('cancel'), 'WebGL indisponible');
      onDone(PHASES); return;
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    canvasBox.prepend(renderer.domElement);
    const scene = new THREE.Scene();
    const sun = buildTestScene(scene);
    const cam = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 100);
    const resize = () => {
      const w = canvasBox.clientWidth, hh = canvasBox.clientHeight;
      renderer.setSize(w, hh, false); cam.aspect = w / hh; cam.updateProjectionMatrix();
    };
    resize();
    let idx = -1, t0 = 0, frames: number[] = [], last = 0;
    const startPhase = (i: number) => {
      idx = i; frames = []; t0 = performance.now(); last = t0;
      const p = PHASES[i];
      renderer.shadowMap.enabled = !!p.shadows;
      if (p.shadows) {
        renderer.shadowMap.type = THREE.PCFShadowMap;
        sun.shadow.radius = p.shadows.soft ? 4 : 1;
        sun.castShadow = true; sun.shadow.mapSize.set(p.shadows.size, p.shadows.size);
        sun.shadow.map?.dispose(); sun.shadow.map = null;
      } else sun.castShadow = false;
      scene.traverse(o => { const m = (o as THREE.Mesh).material as THREE.Material | undefined; if (m) m.needsUpdate = true; });
      phaseEls.forEach((x, j) => x.el.classList.toggle('active', j === i));
      badge.replaceChildren(icon('speed'), `Test ${i + 1}/3 : ${p.name}`);
    };
    const loop = (now: number) => {
      if (document.hidden) { // onglet caché : le navigateur ralentit l'affichage, on recommence la phase
        startPhase(idx); requestAnimationFrame(loop); return;
      }
      const a = (now - t0) / 3000;
      cam.position.set(5 + 8 * Math.cos(a), 6, 3.5 + 8 * Math.sin(a));
      cam.lookAt(5, 0.5, 3.5);
      renderer.render(scene, cam);
      if (now - t0 > 500) frames.push(now - last); // on ignore la première demi-seconde (compilation des shaders)
      last = now;
      if (now - t0 >= PHASE_MS) {
        const p = PHASES[idx];
        const total = frames.reduce((s, v) => s + v, 0);
        p.fps = frames.length ? Math.round(1000 * frames.length / total) : 0;
        const sorted = [...frames].sort((x, y) => x - y);
        p.p95 = sorted.length ? Math.round(sorted[Math.floor(sorted.length * 0.95)]) : 0;
        const pe = phaseEls[idx];
        pe.fps.textContent = `${p.fps} im/s`;
        pe.fps.style.color = p.fps >= 40 ? 'var(--ok)' : p.fps >= 25 ? 'var(--warn-text)' : 'var(--accent-hover)';
        if (idx + 1 < PHASES.length) startPhase(idx + 1);
        else {
          phaseEls.forEach(x => x.el.classList.remove('active'));
          badge.replaceChildren(icon('check_circle', true), 'Test terminé');
          const rows = perfVerdict();
          verdict.replaceChildren(...rows.map(rowEl));
          report.push({ section: 'Performance 3D', rows: [...PHASES.map(p => ({ k: p.name, v: `${p.fps} images/s (95 % des images en moins de ${p.p95} ms)` })), ...rows] });
          rows.forEach(r => r.level && levels.push(r.level));
          renderer.setAnimationLoop(null);
          onDone(PHASES);
          return;
        }
      }
      requestAnimationFrame(loop);
    };
    startPhase(0);
    requestAnimationFrame(loop);
  };
  return { el, run };
}

function perfVerdict(): Row[] {
  const [none, low, high] = PHASES.map(p => p.fps || 0);
  if (high >= 40) return [{ k: 'Recommandation', v: 'Ombres soignées', level: 'ok', note: 'Le poste affiche la 3D avec fluidité, même avec la meilleure qualité.' }];
  if (low >= 40) return [{ k: 'Recommandation', v: 'Ombres légères', level: 'ok', note: 'Fluide avec des ombres légères. Les ombres soignées seront un peu saccadées.' }];
  if (none >= 30) return [{ k: 'Recommandation', v: 'Ombres désactivées', level: 'warn', note: 'Le poste est fluide sans ombres seulement. L’outil démarrera avec les ombres désactivées.' }];
  if (none >= 18) return [{ k: 'Recommandation', v: 'Utilisable, mais lent', level: 'warn', note: 'La 3D sera saccadée. Le plan 2D restera confortable.' }];
  return [{ k: 'Recommandation', v: 'Trop lent pour la 3D', level: 'bad', note: 'Vérifier l’accélération graphique du navigateur, fermer les autres programmes, ou utiliser surtout le plan 2D.' }];
}

/* ---------- Tests manuels (fichiers) ---------- */
function toast(msg: string) {
  const t = h('div', { class: 'toast' }, icon('info'), msg);
  document.body.appendChild(t); setTimeout(() => t.remove(), 3200);
}
const manual: Row[] = [];
function fileTests(onChange: () => void) {
  const out = h('div', { class: 'dg-rows', style: { display: 'none' } });
  const log = (r: Row) => { manual.push(r); out.style.display = ''; out.appendChild(rowEl(r)); onChange(); };
  const saveTest = async () => {
    if (!W.showSaveFilePicker) { log({ k: 'Écriture dans un dossier', v: 'Fonction indisponible', level: 'warn' }); return; }
    try {
      const fh = await W.showSaveFilePicker({ suggestedName: 'test-concept-store.txt', types: [{ description: 'Texte', accept: { 'text/plain': ['.txt'] } }] });
      const w = await (fh as FileSystemFileHandle & { createWritable(): Promise<FileSystemWritableFileStream> }).createWritable();
      await w.write('Test Concept Store 3D — ' + new Date().toLocaleString('fr-FR')); await w.close();
      log({ k: 'Écriture dans un dossier', v: `Réussie : « ${fh.name} »`, level: 'ok', note: 'Vous pouvez supprimer ce fichier de test.' });
    } catch (e) {
      const err = e as DOMException;
      if (err.name === 'AbortError') return;
      log({ k: 'Écriture dans un dossier', v: 'Échec : ' + err.name, level: 'bad', note: err.message + ' — Le dossier choisi est peut-être en lecture seule, ou bloqué par le navigateur (dossiers système).' });
    }
  };
  const dirTest = async () => {
    if (!W.showDirectoryPicker) { log({ k: 'Lecture d’un dossier', v: 'Fonction indisponible', level: 'warn' }); return; }
    try {
      const d = await W.showDirectoryPicker({ mode: 'read' });
      let n = 0, glb = 0;
      for await (const e of d.values()) { n++; if (e.kind === 'file' && /\.glb$/i.test(e.name)) glb++; if (n > 500) break; }
      log({ k: 'Lecture d’un dossier', v: `Réussie : « ${d.name} », ${n} élément(s) dont ${glb} fichier(s) .glb`, level: 'ok' });
    } catch (e) {
      const err = e as DOMException;
      if (err.name === 'AbortError') return;
      log({ k: 'Lecture d’un dossier', v: 'Échec : ' + err.name, level: 'bad', note: err.message });
    }
  };
  const dlTest = () => {
    const a = h('a', { href: URL.createObjectURL(new Blob(['Test de téléchargement Concept Store 3D'], { type: 'text/plain' })), download: 'test-telechargement.txt' });
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    log({ k: 'Téléchargement', v: 'Fichier « test-telechargement.txt » envoyé', level: 'info', note: 'Vérifier qu’il apparaît dans le dossier Téléchargements.' });
  };
  return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } },
    h('div', { class: 'dg-tests' },
      h('button', { class: 'btn btn-secondary', onclick: saveTest }, icon('save'), 'Tester l’enregistrement'),
      h('button', { class: 'btn btn-secondary', onclick: dirTest }, icon('folder_open'), 'Tester la lecture d’un dossier'),
      h('button', { class: 'btn btn-secondary', onclick: dlTest }, icon('download'), 'Tester le téléchargement')),
    h('div', { class: 'dg-foot' }, 'Astuce : pour l’enregistrement, choisir le dossier réseau d’une équipe ; pour la lecture, le dossier « Mobilier ».'),
    out);
}

/* ---------- Rapport ---------- */
function reportText() {
  const lines = ['Concept Store 3D — rapport de test du poste', new Date().toLocaleString('fr-FR'), ''];
  const all = [...report, ...(manual.length ? [{ section: 'Tests manuels', rows: manual }] : [])];
  for (const s of all) {
    lines.push('== ' + s.section);
    for (const r of s.rows) lines.push(`- ${r.k} : ${r.v}${r.level && r.level !== 'info' ? ' [' + LABEL[r.level] + ']' : ''}${r.note ? '\n    ' + r.note : ''}`);
    lines.push('');
  }
  return lines.join('\n');
}

/* ---------- Page ---------- */
function main() {
  const app = document.getElementById('app')!;
  const vIcon = h('div', { class: 'big' }, icon('progress_activity'));
  const vTitle = h('div', { class: 't' }, 'Test en cours…');
  const vDesc = h('div', { class: 'd' }, 'Le test de performance dure environ 12 secondes. Garder cette fenêtre au premier plan.');
  const copyBtn = h('button', { class: 'btn btn-secondary', disabled: true, onclick: async () => {
    try { await navigator.clipboard.writeText(reportText()); toast('Rapport copié'); } catch { toast('Copie impossible : utiliser « Télécharger »'); }
  } }, icon('content_copy'), 'Copier le rapport');
  const dlBtn = h('button', { class: 'btn btn-primary', disabled: true, onclick: () => {
    const a = h('a', { href: URL.createObjectURL(new Blob([reportText()], { type: 'text/plain;charset=utf-8' })), download: 'rapport-test-poste.txt' });
    a.click();
  } }, icon('download'), 'Télécharger le rapport');
  const verdict = h('div', { class: 'dg-verdict run' }, vIcon, h('div', null, vTitle, vDesc), h('div', { class: 'actions' }, copyBtn, dlBtn));

  const gl = webglInfo();
  const perf = perfCard(() => {
    const worst: Level = levels.includes('bad') ? 'bad' : levels.includes('warn') ? 'warn' : 'ok';
    verdict.className = 'dg-verdict ' + worst;
    vIcon.replaceChildren(icon(worst === 'ok' ? 'check_circle' : worst === 'warn' ? 'warning' : 'cancel', true));
    vTitle.textContent = worst === 'ok' ? 'Ce poste est prêt pour Concept Store 3D' : worst === 'warn' ? 'Ce poste convient, avec quelques réserves' : 'Un point bloque l’utilisation';
    vDesc.textContent = worst === 'ok' ? 'Tout fonctionne. Envoyez le rapport pour confirmation.' : 'Lisez les lignes marquées « À surveiller » ou « Bloquant », puis envoyez le rapport.';
    copyBtn.disabled = dlBtn.disabled = false;
  });

  app.appendChild(h('div', { class: 'dg' },
    h('header', { class: 'dg-head' },
      h('div', { class: 'dg-brand' }, h('div', { class: 'dg-logo' }, icon('storefront')), 'Concept Store 3D')),
    h('main', { class: 'dg-main' },
      h('h1', null, 'Test du poste'),
      h('p', { class: 'dg-lead' }, 'Cette page vérifie que l’ordinateur peut faire fonctionner l’outil : navigateur, 3D (WebGL), performances et accès aux fichiers. Elle n’envoie aucune donnée : le rapport reste sur ce poste.'),
      verdict,
      h('div', { class: 'dg-grid' },
        card('Navigateur', 'web', browserInfo()),
        card('Ouverture de l’outil', 'description', openingInfo()),
        card('3D (WebGL)', 'view_in_ar', gl.rows),
        card('Ordinateur et écran', 'computer', hardwareInfo()),
        perf.el,
        card('Fichiers et sauvegarde', 'folder', filesInfo(), true, fileTests(() => {}))),
      h('p', { class: 'dg-foot' }, 'Concept Store 3D · page de diagnostic · version ' + __APP_VERSION__))));

  if (gl.ok) setTimeout(perf.run, 300);
  else perf.run();
}

declare const __APP_VERSION__: string;
(async () => {
  try { await Promise.all([600, 700, 800].map(w => document.fonts.load(`${w} 16px Nunito`))); } catch { /* police de secours */ }
  main();
})();
