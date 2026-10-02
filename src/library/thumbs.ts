import * as THREE from 'three';
import { loadProto, instantiate } from './library';

/* Miniatures des meubles, calculées à la demande avec un petit moteur de rendu dédié
   (une seule fois par modèle et par session). */

let renderer: THREE.WebGLRenderer | null = null;
const scene = new THREE.Scene();
const cam = new THREE.PerspectiveCamera(30, 4 / 3, 0.01, 100);
const cache = new Map<string, Promise<string>>();
let queue: Promise<unknown> = Promise.resolve();

function setup() {
  if (renderer) return renderer;
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setSize(240, 180, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.1;
  scene.add(new THREE.HemisphereLight(0xffffff, 0xd9d2c6, 2.2));
  const sun = new THREE.DirectionalLight(0xffffff, 1.4); sun.position.set(2, 4, 3); scene.add(sun);
  return renderer;
}

/** Image PNG (data URL) d'un modèle, vu de trois quarts. */
export function thumbnail(id: string, color: string | null = null): Promise<string> {
  const key = id + '|' + (color ?? '');
  let p = cache.get(key);
  if (p) return p;
  p = (queue = queue.then(async () => {
    const r = setup();
    const proto = await loadProto(id);
    const o = instantiate(proto, color);
    scene.add(o);
    const { w, d, h } = proto.dims;
    const rad = Math.max(Math.hypot(w, d, h) / 2, 0.05);
    const c = new THREE.Vector3(0, h / 2, 0);
    const dist = rad / Math.sin(THREE.MathUtils.degToRad(cam.fov / 2)) * 0.95;
    cam.position.copy(c).add(new THREE.Vector3(0.75, 0.6, 1).normalize().multiplyScalar(dist));
    cam.lookAt(c);
    r.render(scene, cam);
    const url = r.domElement.toDataURL('image/png');
    scene.remove(o);
    return url;
  })) as Promise<string>;
  cache.set(key, p);
  return p;
}
