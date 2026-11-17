// DIÈDRE 29 / SILLAGE 29 Catamaran — orchestration : options -> modèle 3D -> scène -> UI
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
// Pas de Draco : la CSP du proxy de production interdit les workers blob: (décodeur Draco) — GLB bruts + gzip nginx
import * as options from './options.js';
import { GROUPS, DEFAULT_STATE, MODELS, findItem, defaultsFor } from './options.js';
import { buildBoat, refineBoatMaterials, setLedGain, setWetLine } from './boat.js';
import { buildCatamaran, CAT29_URL } from './catamaran.js';
import { setInteriorDayFactor, releaseInteriorDayFactor } from './interior.js';
import { createStage } from './stage.js';
import { initUI } from './ui.js';

const STATE_KEYS = Object.keys(DEFAULT_STATE);

// ---------- état + URL de partage ----------
// `model` lu en premier : les valeurs par défaut (nom de coque) dépendent du modèle
function readStateFromURL() {
  let s = { ...DEFAULT_STATE };
  try {
    const h = new URLSearchParams(location.hash.slice(1));
    const m = h.get('model');
    s = defaultsFor(m && MODELS[m] ? m : DEFAULT_STATE.model);
    for (const k of STATE_KEYS) {
      if (k === 'model') continue;
      const v = h.get(k);
      if (v == null) continue;
      if (k === 'boatName') s[k] = v.slice(0, 18);
      else if (findItem(k, v)) s[k] = v;
    }
  } catch (e) { /* hash invalide : défauts */ }
  return s;
}
function writeStateToURL(s) {
  const p = new URLSearchParams();
  const def = { ...defaultsFor(s.model), model: DEFAULT_STATE.model }; // model toujours écrit hors défaut
  for (const k of STATE_KEYS) if (s[k] !== def[k]) p.set(k, s[k]);
  const str = p.toString();
  history.replaceState(null, '', str ? '#' + str : location.pathname + location.search);
}
function shareURL(s) {
  const p = new URLSearchParams();
  for (const k of STATE_KEYS) p.set(k, s[k]);
  return location.origin + location.pathname + '#' + p.toString();
}

let state = readStateFromURL();

// ---------- application des matériaux ----------
const tmpColor = new THREE.Color();
const tweens = new Map(); // material -> {from, to, t}

function tweenColor(mat, hex, prop = 'color') {
  if (!mat || !mat[prop] || hex == null) return;
  const key = mat.uuid + prop;
  tweens.set(key, { mat, prop, from: mat[prop].clone(), to: new THREE.Color(hex), t: 0 });
}
function stepTweens(dt) {
  for (const [key, tw] of tweens) {
    tw.t = Math.min(1, tw.t + dt / 0.6);
    const e = tw.t < 0.5 ? 4 * tw.t ** 3 : 1 - Math.pow(-2 * tw.t + 2, 3) / 2;
    tw.mat[tw.prop].copy(tw.from).lerp(tw.to, e);
    if (tw.t >= 1) tweens.delete(key);
  }
}
function setProps(mat, item, keys) {
  if (!mat) return;
  for (const k of keys) if (item[k] !== undefined && k in mat) mat[k] = item[k];
  mat.needsUpdate = true;
}

// Finitions de coque : laque bi-couche (base + vernis). Les valeurs du catalogue (options.js) servent de
// repli ; ce tableau règle le rendu physique (vernis plein, rugosité du vernis, peau d'orange).
const HULL_FINISH = {
  // satiné : vernis à reflet adouci mais lisible (horizon et soleil flous), entre Brillante (0,035) et Mate
  // peau d'orange réduite à ~0,02 : au-delà, reflets « tachés » sur les grands panneaux plans
  // (peel = multiplicateur de la carte de finition, déjà calibrée : carénage RMS 0,02 + peau d'orange 0,012)
  // R5 : coque sans carte de relief (peel sans effet) ; vernis très lisse → reflet en bande nette, pas un voile
  satin: { roughness: 0.25, clearcoat: 1.0, clearcoatRoughness: 0.03, peel: 0 },
  gloss: { roughness: 0.22, clearcoat: 1.0, clearcoatRoughness: 0.02, peel: 0 },
  matte: { roughness: 0.68, clearcoat: 0.0, clearcoatRoughness: 0.8, peel: 0 },
};
// albédo de rendu plus sombre que la pastille du catalogue (anthracite : sinon gris délavé sous l'IBL)
const HULL_ALBEDO = { anthracite: '#232426' };
// Pont : carte (teck / composite), relief du fil, éclat de fibre (sheen) ; hsl = correction de la teinte du
// catalogue en sRGB [Δteinte, ×saturation, ×luminosité] : teck naturel #a8714a → ≈ #9c8064 (miel grisé)
const DECK_FINISH = {
  teck: { maps: 'teak', normal: 0.8, sheen: 0.35, hsl: [0.014, 0.57, 1.057] },
  teckGris: { maps: 'teak', normal: 1.15, sheen: 0.2, hsl: [0, 1, 1] },   // teck vieilli : fil plus marqué, plus sec
  teckFonce: { maps: 'teak', normal: 0.7, sheen: 0.3, hsl: [0.01, 0.7, 1] },
  liege: { maps: 'composite', normal: 0.45, sheen: 0.05, hsl: [0, 1, 1] }, // composite : joints clairs, fil discret
};
function deckTint(hex, hsl) {
  const c = new THREE.Color(hex), h = {};
  c.getHSL(h, THREE.SRGBColorSpace);
  c.setHSL((h.h + hsl[0]) % 1, Math.min(1, h.s * hsl[1]), Math.min(1, h.l * hsl[2]), THREE.SRGBColorSpace);
  return '#' + c.getHexString();
}
// Vitrage : teinte de transmission (couche multiplicative) + couche de réflexion
function glassParams(it, inside) {
  const mirror = (it.metalness ?? 0) > 0.5;
  const c = new THREE.Color(it.color);
  const hue = c.clone().multiplyScalar(1 / Math.max(c.r, c.g, c.b, 1e-4));
  // vu de l'extérieur : vitrage de yacht teinté sombre (Fumé ≈ 14 %, Bronze/Bleu ≈ 16 %) ; ×3 en vues intérieures
  let T = mirror ? 0.08 : Math.min(0.4, Math.max(0.06, 0.8 * (1 - (it.opacity ?? 0.82))));
  if (inside) T = Math.min(0.8, T * (mirror ? 3.5 : 3.0));
  const tint = new THREE.Color(1, 1, 1).lerp(hue, mirror ? 0.15 : 0.55);
  tint.multiplyScalar(T / (tint.r * 0.2126 + tint.g * 0.7152 + tint.b * 0.0722));
  return { tint: '#' + tint.getHexString(), refl: mirror ? it.color : '#000000', metalness: mirror ? 0.9 : 0, opacity: inside ? 0.35 : 1 };
}
// Émissifs jour/nuit : de jour, bandeaux LED et feux de navigation sont atténués (sinon « brûlés » par le
// bloom) ; pleine puissance la nuit. Facteur lissé sur ~1 s pour suivre le fondu d'ambiance de stage.js.
const NIGHT_TARGET = { night: 1, studio: 0.05, sunset: 0.2, overcast: 0 };
let nightK = -1;
function stepEmissives(b, ambiance, dt) {
  const M = b.materials;
  const target = NIGHT_TARGET[ambiance] ?? 0;
  nightK = nightK < 0 ? target : nightK + (target - nightK) * Math.min(1, dt / 0.5);
  setLedGain(0.3 + 0.7 * nightK);
  // lueurs LED, plafond lumineux, écrans : interior.js (DIÈDRE 29) ou le bateau lui-même (catamaran)
  if (b.setDayFactor) b.setDayFactor(nightK); else setInteriorDayFactor(nightK);
  for (const m of [M.navRed, M.navGreen, M.navWhite, M.underwaterLight]) {
    if (!m) continue;
    if (m.userData.__baseEmissive == null) m.userData.__baseEmissive = m.emissiveIntensity;
    m.emissiveIntensity = m.userData.__baseEmissive * (0.3 + 0.7 * nightK);
  }
}
function applyGlass(M, it, inside) {
  if (!M.glass) return;
  const p = glassParams(it, inside);
  tweenColor(M.glassTint, p.tint);
  tweenColor(M.glass, p.refl);
  M.glass.metalness = p.metalness;
  M.glass.opacity = p.opacity;
  M.glass.userData.envCap = p.metalness > 0.5 ? 0.9 : 0.45; // miroir : reflet plus fort autorisé
}

function applyState(boat, stage, s, prev = {}) {
  const M = boat.materials;
  const changed = (k) => prev[k] !== s[k];

  if (changed('hull') || changed('hullFinish')) {
    const it = findItem('hull', s.hull);
    const fin = { ...findItem('hullFinish', s.hullFinish), ...HULL_FINISH[s.hullFinish] };
    tweenColor(M.hull, HULL_ALBEDO[s.hull] || it.color);
    M.hull.metalness = it.metalness ?? 0.08;
    setProps(M.hull, fin, ['roughness', 'clearcoat', 'clearcoatRoughness']);
    M.hull.clearcoatNormalScale?.setScalar(fin.peel ?? 0.06);
    if (M.superstructure) {
      setProps(M.superstructure, fin, ['clearcoat', 'clearcoatRoughness']);
      M.superstructure.clearcoatNormalScale?.setScalar(1); // carte dédiée déjà calibrée (makeSuperFinishMaps, R4)
    }
  }
  if (changed('hull') || changed('accent')) {
    // superstructure : métal titane bronzé = mélange coque / bandeau (comme les rendus)
    const h = findItem('hull', s.hull), a = findItem('accent', s.accent);
    if (M.superstructure) {
      tweenColor(M.superstructure, '#' + new THREE.Color(h.color).lerp(new THREE.Color(a.color), 0.8).getHexString());
      M.superstructure.metalness = 0.6;
      M.superstructure.roughness = 0.38;
    }
  }
  if (changed('accent')) {
    const it = findItem('accent', s.accent);
    tweenColor(M.accent, it.color);
    setProps(M.accent, it, ['metalness']);
    // la carte de brossage vaut ≈0,85 en moyenne : on compense pour garder la rugosité du catalogue
    M.accent.roughness = (it.roughness ?? 0.3) / 0.85;
  }
  if (changed('glass')) applyGlass(M, findItem('glass', s.glass), interiorGlass);
  if (changed('deck')) {
    const it = findItem('deck', s.deck), f = DECK_FINISH[s.deck] || DECK_FINISH.teck;
    const tint = deckTint(it.tint, f.hsl);
    tweenColor(M.deck, tint);
    const maps = boat.lib?.deckMaps(f.maps);
    if (maps && M.deck.map !== maps.map) { M.deck.map = maps.map; M.deck.normalMap = maps.normal; M.deck.roughnessMap = maps.rough; M.deck.needsUpdate = true; }
    M.deck.normalScale.setScalar(f.normal);
    M.deck.sheen = f.sheen;
    // éclat de fibre : teinte du pont éclaircie, atténuée (pas de voile blanc)
    { const c = new THREE.Color(tint), h = {}; c.getHSL(h); c.setHSL(h.h, h.s * 0.6, Math.min(1, h.l * 0.9)); tweenColor(M.deck, '#' + c.getHexString(), 'sheenColor'); }
  }
  if (changed('upholsteryInterior')) {
    const hex = findItem('upholsteryInterior', s.upholsteryInterior).color;
    tweenColor(M.upholsteryInterior, hex);
    // reflet satiné du cuir : sa propre couleur éclaircie (pas de voile gris)
    { const c = new THREE.Color(hex), h = {}; c.getHSL(h); c.setHSL(h.h, h.s, Math.min(1, h.l + 0.25)); tweenColor(M.upholsteryInterior, '#' + c.getHexString(), 'sheenColor'); }
  }
  if (changed('woodInterior')) tweenColor(M.woodInterior, findItem('woodInterior', s.woodInterior).tint);
  if (changed('upholsteryExterior')) tweenColor(M.upholsteryExterior, findItem('upholsteryExterior', s.upholsteryExterior).color);
  if (changed('ambientLight')) boat.setLedColor?.(findItem('ambientLight', s.ambientLight).color);
  if (changed('boatName')) boat.setName?.((s.boatName || '').trim() || (MODELS[s.model] || MODELS.d29).name);
  if (changed('ambiance')) { stage.setAmbiance(s.ambiance); document.documentElement.dataset.scene = s.ambiance; }
  if (changed('setting')) { stage.setSetting(s.setting); setWetLine(s.setting === 'sea' ? 1 : 0); }
}

// ---------- démarrage ----------
let ui, stage, boat;
let cutaway = false;
let interiorGlass = false;
// vues intérieures : vitrages beaucoup plus transparents pour voir franchement la mer
// (transmission ×2 et reflet atténué : voir glassParams)
function setInteriorGlass(on) {
  interiorGlass = on;
  if (!boat?.materials.glass) return;
  applyGlass(boat.materials, findItem('glass', state.glass), on);
}

ui = initUI({
  options,
  state,
  onChange: (key, value) => {
    const prev = state;
    state = { ...state, [key]: value };
    if (key === 'model') {
      // options communes conservées ; le nom de coque par défaut suit le modèle
      const n = (prev.boatName || '').trim();
      if (!n || n === (MODELS[prev.model] || {}).name) state.boatName = MODELS[value].name;
      ui.setState(state);
      writeStateToURL(state);
      switchModel(value);
      return;
    }
    if (boat) applyState(boat, stage, state, prev);
    writeStateToURL(state);
  },
  onView: (id) => {
    if (!stage) return;
    if (cutaway && id !== 'cutaway') { cutaway = false; stage.setCutaway(false, boat); }
    ui.setActiveView(id);
    setInteriorGlass(id === 'salon' || id === 'helm');
    stage.flyTo(id);
  },
  onAction: async (name, payload) => {
    if (!stage) return;
    switch (name) {
      case 'share': {
        const url = shareURL(state);
        try {
          if (navigator.share && matchMedia('(pointer:coarse)').matches) await navigator.share({ title: 'Mon ' + MODELS[state.model].name, url });
          else { await navigator.clipboard.writeText(url); ui.toast('Lien de configuration copié'); }
        } catch { ui.toast('Lien : ' + url); }
        break;
      }
      case 'screenshot': {
        const a = document.createElement('a');
        a.href = stage.screenshot();
        a.download = `${state.model === 'cat29' ? 'SILLAGE29' : 'DIEDRE29'}-${(state.boatName || 'config').replace(/[^\w-]+/g, '_')}.png`;
        a.click();
        ui.toast('Capture enregistrée');
        break;
      }
      case 'compare-add':
        ui.addToCompare?.({ state: { ...state }, imageDataURL: stage.screenshot() });
        break;
      case 'load-config': {
        const prev = state;
        state = { ...defaultsFor(payload.model), ...payload };
        if (state.model !== boatModel) switchModel(state.model);
        else applyState(boat, stage, state, prev);
        ui.setState(state);
        writeStateToURL(state);
        ui.toast('Configuration chargée');
        break;
      }
      case 'reset': {
        const prev = state;
        state = defaultsFor(state.model); // le modèle choisi est conservé
        applyState(boat, stage, state, prev);
        ui.setState(state);
        writeStateToURL(state);
        if (cutaway) { cutaway = false; stage.setCutaway(false, boat); }
        ui.setActiveView('exterior');
        stage.flyTo('exterior');
        ui.toast('Configuration réinitialisée');
        break;
      }
      case 'cutaway':
        cutaway = typeof payload === 'boolean' ? payload : !cutaway;
        stage.setCutaway(cutaway, boat);
        ui.setActiveView(cutaway ? 'cutaway' : 'exterior');
        if (!cutaway) stage.flyTo('exterior');
        break;
      case 'sails':
        boat.setSails?.(!!payload);
        if (payload) {
          ui.toast('Hissage des voiles…');
          // recul de caméra pour voir toute la voilure (mât de 38 m), sauf à l'intérieur ou en coupe
          if (!cutaway && !['salon', 'helm'].includes(stage.currentView)) {
            stage.flyTo({ label: 'Voiles', pos: [50, 8, -62], target: [-1, 17.5, 0] }, { duration: 2.4 });
            ui.setActiveView(null);
          }
        }
        break;
      case 'autorotate':
        stage.setAutoRotate(typeof payload === 'boolean' ? payload : true);
        break;
      case 'summary':
        ui.openSummary?.({ state: { ...state }, imageDataURL: stage.screenshot(), shareURL: shareURL(state) });
        break;
      case 'gallery':
        ui.openGallery?.();
        break;
      case 'quote':
        ui.openSummary?.({ state: { ...state }, imageDataURL: stage.screenshot(), shareURL: shareURL(state) });
        break;
    }
  },
});

ui.setLoading(0.1);

// DIÈDRE 29 : extérieur modélisé sous Blender (coque, pont, superstructure, vitrages, peau du toit), GLB préchargé
// AVANT buildBoat (synchrone). Échec (réseau, fichier absent, GLB invalide) → modèle procédural complet de boat.js.
// ?procedural dans l'URL force le modèle procédural (comparaison, diagnostic).
// SILLAGE 29 (catamaran à voile) : tout le bateau est dans assets/cat29.glb (pas de repli procédural), chargé seulement quand
// on le choisit (ou si l'URL partagée l'indique).
const MODEL_GLB = { d29: 'assets/diedre29-exterior.glb', cat29: CAT29_URL };
function loadModelGLB(id, onProgress) {
  if (id === 'd29' && new URLSearchParams(location.search).has('procedural')) return Promise.resolve(null);
  const url = MODEL_GLB[id];
  return new GLTFLoader().loadAsync(url, (e) => {
    if (e.lengthComputable && e.total) onProgress?.(e.loaded / e.total);
  }).then((gltf) => gltf.scene, (err) => {
    if (id !== 'd29') throw err;
    console.warn('[DIÈDRE 29] extérieur GLB indisponible (' + url + ') : modèle procédural utilisé.', err);
    return null;
  });
}
function buildModel(id, exterior) {
  let b;
  if (id === 'cat29') b = buildCatamaran({ exterior });
  else {
    try {
      b = buildBoat({ exterior });
    } catch (err) {
      if (!exterior) throw err;
      console.warn('[DIÈDRE 29] intégration du GLB extérieur impossible : modèle procédural utilisé.', err);
      b = buildBoat();
    }
  }
  b.model = id;
  b.lib = refineBoatMaterials(b, { maxAnisotropy: stage.renderer.capabilities.getMaxAnisotropy() });
  return b;
}
// libération GPU d'un bateau retiré : géométries, matériaux (y compris ceux qui ne sont plus montés, ex. clones de
// coupe déjà rendus), textures (cartes procédurales, canvas du nom, cartes de pont alternatives)
function disposeBoat(b) {
  const geos = new Set(), mats = new Set(), texs = new Set();
  b.root.traverse((o) => {
    if (o.geometry) geos.add(o.geometry);
    if (o.material) for (const m of Array.isArray(o.material) ? o.material : [o.material]) mats.add(m);
  });
  for (const m of Object.values(b.materials)) if (m && m.isMaterial) mats.add(m);
  for (const m of mats) for (const k of Object.keys(m)) { const t = m[k]; if (t && t.isTexture) texs.add(t); }
  for (const t of b.lib?.textures?.() || []) texs.add(t);
  b.root.removeFromParent();
  geos.forEach((g) => g.dispose());
  mats.forEach((m) => m.dispose());
  texs.forEach((t) => t.dispose());
  b.dispose?.();
  if (b.model !== 'cat29') releaseInteriorDayFactor();
}
function disposeScene(sc) {
  sc?.traverse((o) => {
    o.geometry?.dispose();
    if (o.material) for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.dispose();
  });
}

// ---------- bascule de modèle ----------
let boatModel = null;   // modèle effectivement affiché
let switchSeq = 0;      // dernière demande (les chargements dépassés sont abandonnés)
async function switchModel(id) {
  if (!MODELS[id] || !stage || !boat) return;
  const token = ++switchSeq;
  if (id === boatModel) { ui.setModelBusy(false); return; }
  ui.setModelBusy(0);
  let exterior;
  try {
    exterior = await loadModelGLB(id, (p) => token === switchSeq && ui.setModelBusy(0.95 * p));
  } catch (err) {
    if (token !== switchSeq) return;
    console.error(err);
    ui.setModelBusy(false);
    ui.toast('Modèle ' + MODELS[id].name + ' indisponible');
    const prev = state;
    state = { ...state, model: boatModel };
    if (prev.boatName === MODELS[id].name) state.boatName = MODELS[boatModel].name;
    ui.setState(state); writeStateToURL(state);
    return;
  }
  if (token !== switchSeq) { disposeScene(exterior); return; }
  ui.setModelBusy(0.97);
  await new Promise((r) => setTimeout(r, 40)); // laisse l'indicateur s'afficher (construction synchrone)
  if (token !== switchSeq) { disposeScene(exterior); return; }
  let nb;
  try {
    nb = buildModel(id, exterior);
  } catch (err) {
    console.error(err);
    ui.setModelBusy(false);
    ui.toast('Erreur de chargement 3D : ' + err.message);
    return;
  }
  const view = cutaway ? 'exterior' : (stage.currentView || 'exterior');
  if (cutaway) { cutaway = false; ui.setActiveView('exterior'); }
  const old = boat;
  for (const k of [...tweens.keys()]) tweens.delete(k);
  setWetLine(state.setting === 'sea' ? 1 : 0);
  stage.add(nb.root);
  stage.setBoat(nb); // retire l'ancien, recalcule profil de coque, berceau, boîte, ombres, reflets, feux
  boat = nb; boatModel = id;
  disposeBoat(old);
  interiorGlass = false;
  applyState(boat, stage, state, { ambiance: state.ambiance, setting: state.setting });
  stepTweens(10);
  ui.setActiveView(view);
  stage.flyTo(view, { duration: 0 });
  ui.setModelBusy(false);
}

const firstModel = state.model;
const exteriorReady = loadModelGLB(firstModel, (p) => ui.setLoading(0.1 + 0.3 * p)).catch((err) => {
  // catamaran indisponible dans une URL partagée : on retombe sur le DIÈDRE 29
  console.error(err);
  return null;
});

try {
  stage = createStage(ui.getViewportEl());
  let exterior = await exteriorReady; // téléchargé pendant createStage
  ui.setLoading(0.5);
  let id = firstModel;
  if (id !== 'd29' && !exterior) {
    ui.toast('Modèle ' + MODELS[id].name + ' indisponible');
    id = 'd29';
    state = { ...state, model: 'd29', boatName: state.boatName === MODELS[firstModel].name ? MODELS.d29.name : state.boatName };
    ui.setState(state); writeStateToURL(state);
    exterior = await loadModelGLB('d29', (p) => ui.setLoading(0.1 + 0.3 * p));
  }
  boat = buildModel(id, exterior);
  boatModel = id;
  performance.mark('d29-boat-built');
  setWetLine(state.setting === 'sea' ? 1 : 0); // vitrage bi-couche, inox brossé, teck massif (avant stage.setBoat)
  ui.setLoading(0.8);
  stage.add(boat.root);
  stage.setBoat(boat);
  stage.setAmbiance(state.ambiance, { duration: 0 });
  document.documentElement.dataset.scene = state.ambiance;
  stage.setSetting(state.setting, { duration: 0 });
  applyState(boat, stage, state, { ambiance: state.ambiance, setting: state.setting }); // tout le reste
  // pas d'animation de couleur au premier rendu
  stepTweens(10);
  stage.onFrame((dt) => {
    stepTweens(dt);
    stepEmissives(boat, stage.ambiance, dt);
    // suit la vue courante (y compris flyTo appelé directement) : vitrages clairs en vues intérieures
    const inside = !!stage.VIEWS[stage.currentView]?.interior;
    if (inside !== interiorGlass) setInteriorGlass(inside);
    const list = stage.projectHotspots(boat.hotspots, boat.root);
    const byId = Object.fromEntries(boat.hotspots.map((h) => [h.id, h]));
    ui.renderHotspots(list.map((p) => ({ ...byId[p.id], ...p })));
  });
  ui.setActiveView('exterior');
  stage.flyTo('exterior', { duration: 0.01 });
  performance.mark('d29-ready');
  setTimeout(() => ui.setLoading(false), 350);
} catch (err) {
  console.error(err);
  ui.setLoading(false);
  ui.toast('Erreur de chargement 3D : ' + err.message);
}

// partage via changement manuel du hash
addEventListener('hashchange', () => {
  const prev = state;
  state = readStateFromURL();
  if (boat && state.model !== boatModel) switchModel(state.model);
  else if (boat) applyState(boat, stage, state, prev);
  ui.setState(state);
});

window.__diedre = { get state() { return state; }, get stage() { return stage; }, get boat() { return boat; }, get model() { return boatModel; }, switchModel };
