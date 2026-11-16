// DIÈDRE 29 — intérieur (salon, pilotage, plafond lumineux, pont arrière)
// Module appelé par boat.js ; reçoit les helpers/constantes de la coque via ctx.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { mergeVertices, toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
const sstep01 = (e0, e1, x) => { const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

let rectLibReady = false;
// émissifs intérieurs suivant le facteur nuit lissé de main.js (k = 1 nuit : aspect inchangé ; k = 0 plein jour) :
// lueurs LED ×0,35, plafond lumineux ×0,25, écrans ×0,6 (≈2,0 → 1,2) — plus de halos chauds dans le reflet de l'eau le jour
let dayMats = null;
export function setInteriorDayFactor(k) {
  if (!dayMats) return;
  k = Math.max(0, Math.min(1, k));
  const f = (day) => day + (1 - day) * k, { M } = dayMats;
  // halos LED : ×0,35 le jour ; la nuit plafonnés à ×0,6 / ×0,7 (à ×1 ils saturaient en brume blanche avec le bloom)
  M.ledGlow.opacity = dayMats.glow * f(0.35) * (1 - 0.4 * k);
  M.ledGlowFloor.opacity = dayMats.glowFloor * f(0.35) * (1 - 0.3 * k);
  M.ceiling.emissive.copy(dayMats.ceil).multiplyScalar(f(0.25));
  for (const [m, base] of dayMats.scr) m.emissiveIntensity = base * f(0.6);
  // lumière du jour (vitrages, pare-brise, rebond du sol) : pleine le jour, ~4 % la nuit (ciel nocturne)
  // Lumières retirées du rendu (visible=false) quand leur apport est négligeable : chaque lumière active coûte à
  // tous les fragments de la scène. Seuils franchis une fois par changement d'ambiance (programmes ensuite en cache).
  for (const [l, base] of dayMats.dayLights || []) { l.intensity = base * (0.04 + 0.96 * (1 - k)); l.visible = k < 0.9; }
  // éclairage artificiel : spots ×0,12 le jour → ×1 la nuit ; gorges ×0,8 → ×1,5 (si l'ambiance LED n'est pas éteinte)
  for (const [l, base] of dayMats.nightLights || []) { l.intensity = base * f(0.12); l.visible = k > 0.3; }
  for (const [l, base] of dayMats.coves || []) l.intensity = l.userData.on === false ? 0 : base * (0.8 - 0.1 * k); // ×0,7 la nuit (×1,5 écrêtait en brume)
  for (const [l, base] of dayMats.fills || []) l.intensity = base * (0.6 - 0.1 * k);
  // balisage de courtoisie 2700 K (assises du cockpit, marches, pied de pavois, spots de plafond) : fente sombre le jour,
  // allumé au crépuscule ; halos additifs (sol, lueur du salon vue à travers les vitrages) masqués le jour
  const kn = sstep01(0.15, 0.9, k);
  if (dayMats.courtesy) dayMats.courtesy.color.copy(dayMats.courtesyOff).lerp(dayMats.courtesyOn, kn);
  for (const [m, op] of dayMats.nightGlow || []) { m.opacity = op * kn; m.visible = kn > 0.01; }
  // diffuseurs des spots de plafond (gris-blanc éteints, chauds allumés) ; lueur des vitrages : nuit seulement (pas en studio)
  for (const [m, base, fl] of dayMats.lensEmit || []) m.emissiveIntensity = m.userData.on === false ? 0 : base * (fl + (1 - fl) * kn);
  const kw = sstep01(0.6, 0.95, k);
  if (dayMats.winGlow) { dayMats.winGlow.opacity = dayMats.winGlowOp * kw; dayMats.winGlow.visible = kw > 0.01; }
}

// ---------------------------------------------------------------------------
// Textures canvas
// ---------------------------------------------------------------------------
function rnd(seed) {
  return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
}
function tex(c, srgb = true, rep = true) {
  const t = new THREE.CanvasTexture(c);
  if (rep) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
// grain de cuir pleine fleur : ~40 000 petites cellules + bruit fin -> normal map + roughness map
// tuile de 0,35 m sur 512 px (≈0,7 mm/px) : pores de 1 à 3 mm
// v2 : grain « pebble » = cellules de Voronoï bombées séparées par de fins plis (tuile 0,35 m sur 1024 px ≈ 0,34 mm/px,
// cellules de 1,5 à 2,5 mm), lignes de croissance ondulées à ~1,5 cm, pores ; rugosité : plis plus mats, sommets lustrés
function makeLeatherMaps() {
  const S = 1024, G = 6, NG = Math.floor(S / G), r = rnd(7); // grille de germes jitterée (6 px ≈ 2 mm)
  const sx = new Float32Array(NG * NG), sy = new Float32Array(NG * NG), sh = new Float32Array(NG * NG);
  for (let i = 0; i < NG * NG; i++) { sx[i] = (i % NG + 0.1 + 0.8 * r()) * G; sy[i] = (Math.floor(i / NG) + 0.1 + 0.8 * r()) * G; sh[i] = r(); }
  const h = new Float32Array(S * S), cr = new Float32Array(S * S);
  const SW = NG * G; // période exacte de la grille
  for (let y = 0; y < S; y++) {
    const gy = Math.floor(y / G);
    for (let x = 0; x < S; x++) {
      const gx = Math.floor(x / G);
      let f1 = 1e9, f2 = 1e9, id = 0;
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
        let cx = gx + i, cy = gy + j, ox = 0, oy = 0;
        if (cx < 0) { cx += NG; ox = -SW; } else if (cx >= NG) { cx -= NG; ox = SW; }
        if (cy < 0) { cy += NG; oy = -SW; } else if (cy >= NG) { cy -= NG; oy = SW; }
        const k = cy * NG + cx, d = Math.hypot(x - sx[k] - ox, y - sy[k] - oy);
        if (d < f1) { f2 = f1; f1 = d; id = k; } else if (d < f2) f2 = d;
      }
      const e = Math.min(1, (f2 - f1) / 3.2); // 0 sur la frontière entre deux cellules
      const dome = Math.pow(e, 0.55) * (0.75 + 0.35 * sh[id]);
      // lignes de croissance : plis plus profonds le long de vagues lâches (~44 px ≈ 1,5 cm)
      // (toutes les fréquences sont des multiples de 2π/S : tuile raccordable)
      const F = 2 * Math.PI / S;
      const w = Math.sin((y + 9 * Math.sin(x * 3 * F) + 5 * Math.sin(x * 9 * F + 1.3)) * 23 * F);
      const seg = Math.max(0, Math.sin(x * 3 * F + 2.3 * Math.sin(y * 2 * F)) * Math.sin((y + x) * F + 1.0)); // lignes interrompues
      const growth = Math.pow(Math.max(0, w), 10) * seg;
      h[y * S + x] = dome * (1 - 0.35 * growth) - 0.25 * growth * (1 - e);
      cr[y * S + x] = (1 - e) * (0.6 + 0.4 * growth);
    }
  }
  for (let k = 0; k < 9000; k++) { const i = Math.floor(r() * S * S); h[i] -= 0.35; } // pores isolés
  for (let i = 0; i < S * S; i++) h[i] += (r() - 0.5) * 0.06;
  const H = (x, y) => h[((y + S) % S) * S + ((x + S) % S)];
  const cN = document.createElement('canvas'); cN.width = cN.height = S;
  const cR = document.createElement('canvas'); cR.width = cR.height = S;
  const gN = cN.getContext('2d'), gR = cR.getContext('2d');
  const imN = gN.createImageData(S, S), imR = gR.createImageData(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = (H(x + 1, y) - H(x - 1, y)) * 0.55, dy = (H(x, y + 1) - H(x, y - 1)) * 0.55;
    const l = Math.hypot(dx, dy, 1), i = (y * S + x) * 4;
    imN.data[i] = (-dx / l * 0.5 + 0.5) * 255; imN.data[i + 1] = (-dy / l * 0.5 + 0.5) * 255; imN.data[i + 2] = (1 / l * 0.5 + 0.5) * 255; imN.data[i + 3] = 255;
    // plis et pores plus mats, sommets des cellules lustrés par l'usage
    const rv = 255 * Math.min(1, 0.8 + 0.28 * cr[y * S + x] - 0.06 * Math.max(0, h[y * S + x]));
    imR.data[i] = imR.data[i + 1] = imR.data[i + 2] = rv; imR.data[i + 3] = 255;
  }
  gN.putImageData(imN, 0, 0); gR.putImageData(imR, 0, 0);
  return { normal: tex(cN, false), rough: tex(cR, false) };
}
// bruit 3D en coordonnées monde + plis de flexion (cuir) : morceaux GLSL injectés par onBeforeCompile
const GLSL_NOISE = /* glsl */`
varying vec3 vSgW;
float sgH(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float sgN(vec3 x) { vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(sgH(i), sgH(i + vec3(1,0,0)), f.x), mix(sgH(i + vec3(0,1,0)), sgH(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(sgH(i + vec3(0,0,1)), sgH(i + vec3(1,0,1)), f.x), mix(sgH(i + vec3(0,1,1)), sgH(i + vec3(1,1,1)), f.x), f.y), f.z); }
float sgF(vec3 p) { return 0.55 * sgN(p) + 0.3 * sgN(p * 2.13 + 7.1) + 0.15 * sgN(p * 4.37 + 3.3); }
`;
// opts : tone (amplitude de variation d'albedo), toneScale (1/m), rough (amplitude de variation de rugosité), crease (plis aux flexions)
function softGoodsShader(mat, opts) {
  const { tone = 0.06, toneScale = 3.0, rough = 0.0, crease = 0, sheenTint = false, albedo = 1, slub = 0 } = opts;
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vSgW;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvSgW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    let fs = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + GLSL_NOISE);
    // nuances d'albedo à grande échelle (teinture, salissure légère, fils plus ou moins tassés)
    fs = fs.replace('#include <color_fragment>', `#include <color_fragment>
      { float t = sgF(vSgW * ${toneScale.toFixed(3)}); float t2 = sgN(vSgW * ${(toneScale * 7.3).toFixed(3)} + 11.0);
        diffuseColor.rgb *= 1.0 + ${tone.toFixed(3)} * ((t - 0.5) * 2.0 + 0.35 * (t2 - 0.5));
        diffuseColor.rgb *= mix(vec3(1.0), vec3(1.012, 1.0, 0.982), t) * ${albedo.toFixed(3)};
        ${slub > 0 ? `// fils flammés : stries fines (1–3 cm) le long de la trame, lisibles à distance (sinon la toile fait « plâtre »)
        float sl = sgN(vec3(vSgW.x * 7.0, vSgW.y * 85.0, vSgW.z * 85.0)) * 0.65 + sgN(vec3(vSgW.x * 3.0 + 4.0, vSgW.y * 40.0, vSgW.z * 40.0)) * 0.35;
        diffuseColor.rgb *= 1.0 + ${slub.toFixed(3)} * (sl - 0.5) * 2.0;` : ''} }`);
    if (rough > 0) fs = fs.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      roughnessFactor = clamp(roughnessFactor * (1.0 + ${rough.toFixed(3)} * (sgF(vSgW * 2.7 + 5.0) - 0.5) * 2.0), 0.05, 1.0);`);
    if (crease > 0) fs = fs.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      { // plis de flexion : là où la normale géométrique tourne vite (arrondis), vaguelettes perpendiculaires à l'axe du pli
        vec3 gN = normalize(vNormal); vec3 dNx = dFdx(gN), dNy = dFdy(gN), dPx = dFdx(vViewPosition), dPy = dFdy(vViewPosition);
        float kc = sqrt((dot(dNx, dNx) + dot(dNy, dNy)) / max(1e-12, dot(dPx, dPx) + dot(dPy, dPy)));
        float m = smoothstep(5.0, 16.0, kc) * (1.0 - smoothstep(60.0, 120.0, kc));
        if (m > 0.001) {
          vec3 c = dot(dNx, dNx) > dot(dNy, dNy) ? dNx : dNy; c = normalize(c - gN * dot(c, gN));
          vec3 a = normalize(cross(gN, c));
          vec3 aw = (vec4(a, 0.0) * viewMatrix).xyz; if (dot(aw, vec3(0.83, 0.31, 0.47)) < 0.0) { aw = -aw; a = -a; }
          float ph = dot(vSgW, aw) * 230.0 + 2.2 * sgN(vSgW * 18.0);
          float amp = m * ${crease.toFixed(3)} * smoothstep(0.35, 0.75, sgN(vSgW * 9.0 + 2.0));
          float w = sin(ph); normal = normalize(normal + amp * sign(w) * pow(abs(w), 0.6) * a);
          roughnessFactor = min(1.0, roughnessFactor + 0.08 * m);
        }
      }`);
    // duvet teinté par la couleur de la toile (suit les options sans toucher main.js) : une toile marine ne se voile plus de blanc
    if (sheenTint) fs = fs.replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
      #ifdef USE_SHEEN
        material.sheenColor *= mix(min(diffuseColor.rgb * 1.6, vec3(1.0)), vec3(1.0), 0.15);
      #endif`);
    sh.fragmentShader = fs;
  };
  mat.customProgramCacheKey = () => 'sg' + tone + '|' + toneScale + '|' + rough + '|' + crease + '|' + sheenTint + '|' + albedo + '|' + slub;
  mat.needsUpdate = true;
}
// textiles : hauteur tissée -> normal map + albedo neutre (teinté par la couleur du matériau)
// 'boucle' : bouclette laineuse (tuile 8 cm) ; 'twill' : laine chevron (tuile 10 cm) ; 'linen' : lin (tuile 6 cm)
function makeFabricMaps(kind) {
  const S = 256, r = rnd(kind === 'boucle' ? 11 : kind === 'twill' ? 23 : 37);
  const h = new Float32Array(S * S);
  const blob = (cx, cy, rad, a) => {
    const R = Math.ceil(rad);
    for (let y = -R; y <= R; y++) for (let x = -R; x <= R; x++) {
      const d = Math.hypot(x, y) / rad; if (d > 1) continue;
      const px = ((Math.floor(cx + x) % S) + S) % S, py = ((Math.floor(cy + y) % S) + S) % S;
      h[py * S + px] += a * (1 - d * d);
    }
  };
  if (kind === 'boucle') {
    for (let k = 0; k < 2600; k++) { // bouclettes : anneaux en relief
      const cx = r() * S, cy = r() * S, rad = 3 + r() * 4, a = 0.5 + r() * 0.5;
      const R = Math.ceil(rad + 1.5);
      for (let y = -R; y <= R; y++) for (let x = -R; x <= R; x++) {
        const d = Math.abs(Math.hypot(x, y) - rad); if (d > 1.6) continue;
        const px = ((Math.floor(cx + x) % S) + S) % S, py = ((Math.floor(cy + y) % S) + S) % S;
        h[py * S + px] += a * (1 - d / 1.6);
      }
    }
    for (let i = 0; i < S * S; i++) h[i] += (r() - 0.5) * 0.4;
  } else if (kind === 'twill') {
    const band = 32; // chevrons de 1,25 cm
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const dir = (Math.floor(x / band) % 2) ? 1 : -1;
      const t = (x * dir + y) * (2 * Math.PI / 6);
      h[y * S + x] = 0.6 * Math.sin(t) + 0.25 * Math.sin(x * 2 * Math.PI / 3) + (r() - 0.5) * 0.5;
    }
    for (let k = 0; k < 1500; k++) blob(r() * S, r() * S, 1 + r() * 2, 0.4); // duvet de laine
  } else { // lin : trame / chaîne irrégulières
    const rowA = Array.from({ length: S }, () => 0.7 + r() * 0.6), colA = Array.from({ length: S }, () => 0.7 + r() * 0.6);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const over = ((x >> 1) + (y >> 1)) % 2 ? 1 : -1;
      h[y * S + x] = over * 0.35 + Math.sin(y * Math.PI) * 0.2 * rowA[y] + Math.sin(x * Math.PI) * 0.2 * colA[x] + (r() - 0.5) * 0.25;
    }
  }
  const H = (x, y) => h[((y + S) % S) * S + ((x + S) % S)];
  let lo = Infinity, hi = -Infinity; for (let i = 0; i < S * S; i++) { lo = Math.min(lo, h[i]); hi = Math.max(hi, h[i]); }
  const cN = document.createElement('canvas'); cN.width = cN.height = S;
  const cA = document.createElement('canvas'); cA.width = cA.height = S;
  const gN = cN.getContext('2d'), gA = cA.getContext('2d');
  const imN = gN.createImageData(S, S), imA = gA.createImageData(S, S);
  const k = kind === 'twill' ? 0.9 : 1.1;
  // fils chinés : chaque fil de chaîne / trame a sa nuance (±6 %), lissée sur 2 px ; + fibres isolées plus claires / sombres
  const rough1 = (n, amp) => { const a = Array.from({ length: n }, () => (r() - 0.5) * 2 * amp); return a.map((x, i) => (x + 0.5 * (a[(i + 1) % n] + a[(i + n - 1) % n])) / 2); };
  const hvAmp = kind === 'boucle' ? 0.02 : 0.06, rowV = rough1(S, hvAmp), colV = rough1(S, hvAmp);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = (H(x + 1, y) - H(x - 1, y)) * k, dy = (H(x, y + 1) - H(x, y - 1)) * k;
    const l = Math.hypot(dx, dy, 1), i = (y * S + x) * 4;
    imN.data[i] = (-dx / l * 0.5 + 0.5) * 255; imN.data[i + 1] = (-dy / l * 0.5 + 0.5) * 255; imN.data[i + 2] = (1 / l * 0.5 + 0.5) * 255; imN.data[i + 3] = 255;
    const t = (h[y * S + x] - lo) / (hi - lo); // creux plus sombres (occlusion des fibres)
    const heather = 1 + (((x >> 1) + (y >> 1)) % 2 ? rowV[y] : colV[x]) + (r() - 0.5) * 0.07;
    const a = Math.min(255, 255 * (0.72 + 0.28 * t) * heather);
    imA.data[i] = imA.data[i + 1] = imA.data[i + 2] = a; imA.data[i + 3] = 255;
  }
  gN.putImageData(imN, 0, 0); gA.putImageData(imA, 0, 0);
  const tile = kind === 'boucle' ? 0.08 : kind === 'twill' ? 0.1 : 0.06;
  const n = tex(cN, false), m = tex(cA, true);
  n.repeat.set(1 / tile, 1 / tile); m.repeat.set(1 / tile, 1 / tile);
  return { normal: n, map: m };
}
// bruit lisse déterministe (somme de sinus) pour plis et bosses
const wob = (x, y, s = 0) => Math.sin(x * 1.7 + s) * Math.cos(y * 1.3 - s * 0.7) + 0.5 * Math.sin(x * 3.1 - y * 2.3 + s * 1.9);
// coussin déhoussable : deux faces bombées cousues, coins pincés, bords concaves, petit « coup de karaté » en haut
function pillowGeometry(W, H, T, seed = 0, chopOn = true) {
  const N = 40, pos = [], uv = [], idx = [];
  const P = (u, w, side) => {
    const e = Math.max(0, (1 - u * u) * (1 - w * w));
    let z = side * (T / 2) * Math.pow(e, 0.42);
    let x = u * W / 2 * (1 - 0.075 * (1 - w * w));
    let y = w * H / 2 * (1 - 0.075 * (1 - u * u));
    // pincement du haut au centre (coup de karaté) et léger affaissement
    const chop = chopOn ? Math.exp(-((u / 0.22) ** 2)) * Math.max(0, w) ** 3 : 0;
    y -= 0.03 * chop; if (side > 0) z -= 0.035 * chop * (T / 0.15);
    // plis rayonnants vers les coins + bosses de garnissage
    const corner = Math.max(0, Math.abs(u) * Math.abs(w) - 0.45) / 0.55;
    z += side * (0.004 * wob(u * 6, w * 6, seed + side) * (0.4 + corner) + 0.006 * corner * Math.sin(Math.atan2(w, u) * 14 + seed)) * Math.pow(e, 0.2);
    return [x, y, z];
  };
  for (const side of [1, -1]) {
    const base = pos.length / 3;
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
      const u = -1 + 2 * i / N, w = -1 + 2 * j / N;
      const p = P(u, w, side); pos.push(...p); uv.push(p[0] + (side < 0 ? 0.5 : 0), p[1]);
    }
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const a = base + j * (N + 1) + i, b = a + 1, c = a + N + 1, d = c + 1;
      if (side > 0) idx.push(a, b, d, a, d, c); else idx.push(a, d, b, a, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  // passepoil sur la couture
  const seam = [];
  const ring = (t) => { // parcours du bord carré
    const q = ((t % 4) + 4) % 4, f = q % 1, s = -1 + 2 * f;
    return q < 1 ? [s, -1] : q < 2 ? [1, s] : q < 3 ? [-s, 1] : [-1, -s];
  };
  for (let k = 0; k < 160; k++) { const [u, w] = ring(k / 40); const p = P(u, w, 1); seam.push(new THREE.Vector3(p[0], p[1], 0)); }
  const pipe = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(seam, true), 240, 0.0055, 6, true);
  return { body: g, pipe };
}
// coussin de cuir rembourré : boîte à congés (rayon r) maillée finement (~2,5 cm), dessus bombé et creusé là où l'on
// s'assoit, face avant légèrement gonflée. Repère local centré, avant vers -z (front = -1) ou +x (front = 'x').
// top(x, z) : déplacement vertical du dessus en (x, z) (pour poser surpiqûres, plaids…)
// dents : [[x, z, rx, rz, profondeur], …] creux d'assise supplémentaires, bordés de plis rayonnants ;
// wrinkle : amplitude des plis (rayonnants autour des creux + vaguelettes de couture le long des arêtes du dessus)
function softBox(w, h, d, r, { crown = 0.007, sag = 0.01, sx = 0, sz = 0, rx = 0.25, rz = 0.22, bulge = 0.004, front = 'z', dents = [], wrinkle = 0, seed = 0 } = {}) {
  const half = [w / 2, h / 2, d / 2], ss = THREE.MathUtils.smoothstep;
  const axis = (L) => {
    const a = [], hl = L / 2, nc = 5, nm = Math.max(2, Math.ceil((L - 2 * r) / 0.025));
    for (let i = 0; i < nc; i++) a.push(-hl + r * i / nc);
    for (let i = 0; i < nm; i++) a.push(-hl + r + (L - 2 * r) * i / nm);
    for (let i = nc; i >= 0; i--) a.push(hl - r * i / nc);
    return a;
  };
  const A = [axis(w), axis(h), axis(d)], pos = [], idx = [];
  for (let k = 0; k < 3; k++) for (const sg of [1, -1]) {
    const u = (k + 1) % 3, q = (k + 2) % 3, base = pos.length / 3, U = A[u], V = A[q];
    for (let j = 0; j < V.length; j++) for (let i = 0; i < U.length; i++) { const p = [0, 0, 0]; p[k] = sg * half[k]; p[u] = U[i]; p[q] = V[j]; pos.push(...p); }
    for (let j = 0; j < V.length - 1; j++) for (let i = 0; i < U.length - 1; i++) {
      const a = base + j * U.length + i, b = a + 1, c = a + U.length, e = c + 1;
      if (sg > 0) idx.push(a, b, e, a, e, c); else idx.push(a, e, b, a, c, e);
    }
  }
  const de = (x, z) => Math.max(0, Math.min(half[0] - Math.abs(x), half[2] - Math.abs(z)));
  const top0 = (x, z) => crown * ss(de(x, z), r * 0.5, r + 0.1) - sag * Math.exp(-(((x - sx) / rx) ** 2 + ((z - sz) / rz) ** 2));
  const top = (!dents.length && !wrinkle) ? top0 : (x, z) => {
    let y = top0(x, z);
    for (const [dx0, dz0, drx, drz, dd] of dents) {
      const ex = (x - dx0) / drx, ez = (z - dz0) / drz, rho = Math.hypot(ex, ez);
      y -= dd * Math.exp(-rho * rho);
      // plis rayonnants sur le bord du creux (cuir tendu qui se ride là où il remonte)
      y += wrinkle * 0.8 * Math.exp(-(((rho - 1.15) / 0.38) ** 2)) * Math.cos(7 * Math.atan2(ez, ex) + dx0 * 13 + seed);
    }
    // vaguelettes de couture : le long des arêtes du dessus, perpendiculaires à la couture, s'éteignent vers le plat
    const e = de(x, z);
    y += wrinkle * Math.exp(-(((e - r * 0.9) / 0.035) ** 2)) * Math.sin((x + z) * 52 + 1.7 * Math.sin((x - z) * 9 + seed));
    return y;
  };
  for (let i = 0; i < pos.length; i += 3) {
    const p = [pos[i], pos[i + 1], pos[i + 2]], n = p.map((c, k) => c - Math.max(-(half[k] - r), Math.min(half[k] - r, c)));
    const l = Math.hypot(...n) || 1; for (let k = 0; k < 3; k++) { n[k] /= l; p[k] = p[k] - (l > 1e-9 ? n[k] * l : 0) + n[k] * r; }
    const wy = Math.max(0, n[1]), nh = front === 'x' ? Math.max(0, n[0]) : Math.max(0, -n[2]);
    p[1] += wy * top(pos[i], pos[i + 2]);
    // face avant : galbe nul aux angles, maximal à mi-hauteur
    const along = front === 'x' ? half[2] - Math.abs(pos[i + 2]) : half[0] - Math.abs(pos[i]);
    const b = bulge * nh * (1 - Math.abs(n[1])) * ss(along, 0, 0.12) * Math.sin(Math.PI * Math.min(1, Math.max(0, (pos[i + 1] + half[1]) / h)));
    if (front === 'x') p[0] += b; else p[2] -= b;
    pos[i] = p[0]; pos[i + 1] = p[1]; pos[i + 2] = p[2];
  }
  let g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
  g = mergeVertices(g, 1e-5); g.computeVertexNormals();
  return { geo: g, top };
}
// plaid plié posé sur l'assise, une moitié retombant par-dessus le nez du coussin, franges en bas.
// repère local : x le long du canapé, y vers le haut (0 = dessus de l'assise), z vers la pièce (nez de l'assise à zNose)
function throwGeometry(W, zBackFold, zNose, rNose, drop, seed = 0) {
  const path = []; // [z, y, zone]  zone 0 couche haute, 1 pli, 2 couche basse, 3 nez, 4 retombée
  const t = 0.009, step = 0.008;
  const lineTo = (z0, y0, z1, y1, zone) => { const n = Math.max(1, Math.ceil(Math.hypot(z1 - z0, y1 - y0) / step)); for (let i = 0; i < n; i++) path.push([z0 + (z1 - z0) * i / n, y0 + (y1 - y0) * i / n, zone]); };
  const arc = (cz, cy, R, a0, a1, zone) => { const n = Math.max(4, Math.ceil(Math.abs(a1 - a0) * R / step)); for (let i = 0; i < n; i++) { const a = a0 + (a1 - a0) * i / n; path.push([cz + Math.cos(a) * R, cy + Math.sin(a) * R, zone]); } };
  const yb = t / 2 + 0.005, yt = yb + t + 0.003, rf = (yt - yb) / 2;
  lineTo(zNose - 0.2, yt, zBackFold, yt, 0);
  arc(zBackFold, (yt + yb) / 2, rf, Math.PI / 2, 3 * Math.PI / 2, 1);
  lineTo(zBackFold, yb, zNose - rNose, yb, 2);
  arc(zNose - rNose, -rNose, rNose + yb, Math.PI / 2, 0, 3);
  lineTo(zNose + yb, -rNose, zNose + yb + 0.03, -rNose - drop, 4);
  path.push([zNose + yb + 0.03, -rNose - drop, 4]);
  // longueur d'arc
  const L = [0]; for (let i = 1; i < path.length; i++) L.push(L[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]));
  const sNose = L[path.findIndex((p) => p[2] === 4)];
  const NW = 48, rows = [];
  for (let i = 0; i < path.length; i++) {
    const a = path[Math.max(0, i - 1)], b = path[Math.min(path.length - 1, i + 1)];
    let tz = b[0] - a[0], ty = b[1] - a[1]; const tl = Math.hypot(tz, ty) || 1; tz /= tl; ty /= tl;
    const nz = -ty, ny = tz; // normale dans le plan (z,y)
    const [z, y, zone] = path[i];
    const hang = Math.max(0, L[i] - sNose);
    const shiftX = zone <= 1 ? 0.012 : 0; // couches pas parfaitement alignées
    const row = [];
    for (let k = 0; k <= NW; k++) {
      const xs = -W / 2 + W * k / NW;
      let off = 0.0015 * (1 + wob(xs * 9, L[i] * 9, seed) / 1.5);
      if (zone === 0) off += 0.004 * wob(xs * 4, L[i] * 5, seed + 3) + 0.002;
      // lisières : légèrement soulevées et ondulées (une laine tissée ne tombe jamais au cordeau)
      const eg = Math.pow(Math.abs(xs) / (W / 2), 6);
      if (zone === 0 || zone >= 3) off += 0.0025 * eg * (1 + Math.sin(L[i] * 31 + seed + (xs > 0 ? 2 : 0)));
      // drapé : plis verticaux qui se creusent en descendant ; bord libre ondulé
      const A = 0.02 * Math.min(1, hang / 0.12);
      off += A * (0.5 + 0.5 * Math.sin(2 * Math.PI * xs / 0.13 + 1.3 * Math.sin(xs * 7 + seed)));
      // la largeur se resserre un peu dans le drapé
      const xw = xs * (1 - 0.03 * Math.min(1, hang / 0.15)) + shiftX + 0.004 * eg * Math.sin(L[i] * 17 + seed * 1.3 + (xs > 0 ? 1.1 : 0));
      row.push([xw, z + nz * off, y + ny * off, nz, ny]);
    }
    rows.push(row);
  }
  // section fermée : dessus (+t/2), chant arrondi, dessous (-t/2)
  const pos = [], uv = [], idx = [];
  const ringN = (NW + 1) * 2 + 2;
  rows.forEach((row, i) => {
    const ringPts = [];
    for (let k = 0; k <= NW; k++) { const [x, z, y, nz, ny] = row[k]; ringPts.push([x, y + ny * t / 2, z + nz * t / 2, x]); }
    { const [x, z, y] = row[NW]; ringPts.push([x + t / 2, y, z, x + t]); }
    for (let k = NW; k >= 0; k--) { const [x, z, y, nz, ny] = row[k]; ringPts.push([x, y - ny * t / 2, z - nz * t / 2, x + 2 * t + (row[NW][0] - x)]); }
    { const [x, z, y] = row[0]; ringPts.push([x - t / 2, y, z, 2 * W]); }
    for (const [x, y, z, u] of ringPts) { pos.push(x, y, z); uv.push(u, L[i]); }
  });
  for (let i = 0; i < rows.length - 1; i++) for (let k = 0; k < ringN; k++) {
    const a = i * ringN + k, b = i * ringN + (k + 1) % ringN, c = a + ringN, d = b + ringN;
    idx.push(a, c, b, b, c, d);
  }
  // bouchons aux deux extrémités
  for (const i of [0, rows.length - 1]) {
    const cIdx = pos.length / 3; const r0 = rows[i][NW >> 1]; pos.push(r0[0], r0[2], r0[1]); uv.push(0, L[i]);
    for (let k = 0; k < ringN; k++) { const a = i * ringN + k, b = i * ringN + (k + 1) % ringN; if (i === 0) idx.push(cIdx, a, b); else idx.push(cIdx, b, a); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  // franges torsadées au bas de la retombée
  const last = rows[rows.length - 1], fr = [], rr = rnd(91 + seed);
  for (let k = 1; k < NW; k++) for (const f of [0.25, 0.75]) {
    const kk = k + f - 0.5; const k0 = Math.floor(kk), k1 = Math.min(NW, k0 + 1), w = kk - k0;
    const x = last[k0][0] * (1 - w) + last[k1][0] * w, z = last[k0][1] * (1 - w) + last[k1][1] * w, y = last[k0][2] * (1 - w) + last[k1][2] * w;
    const len = 0.032 + rr() * 0.014;
    fr.push([new THREE.Vector3(x, y + 0.002, z), new THREE.Vector3(x + (rr() - 0.5) * 0.012, y - len, z + 0.004 + rr() * 0.008)]);
  }
  return { body: g, fringes: fr };
}
// sol : grands carreaux (1,2 m) de résine / ardoise, joints quasi invisibles, nuances légères
// tuile de 2,4 m (2×2 carreaux) sur 1024 px ; texture claire neutre teintée par la couleur
function makeFloorMaps() {
  const S = 1024, T = S / 2, r = rnd(53);
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  const cr = document.createElement('canvas'); cr.width = cr.height = S;
  const gr = cr.getContext('2d');
  for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
    const l = 236 + r() * 9;
    g.fillStyle = `rgb(${l},${l},${l})`; g.fillRect(i * T, j * T, T, T);
    const rl = 215 + r() * 30;
    gr.fillStyle = `rgb(${rl},${rl},${rl})`; gr.fillRect(i * T, j * T, T, T);
  }
  // nuages doux (minéral)
  for (let k = 0; k < 260; k++) {
    const x = r() * S, y = r() * S, rad = 20 + r() * 110, a = 0.02 + r() * 0.04;
    const dark = r() < 0.5;
    const grd = g.createRadialGradient(x, y, 0, x, y, rad);
    grd.addColorStop(0, dark ? `rgba(0,0,0,${a})` : `rgba(255,255,255,${a})`); grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    const grr = gr.createRadialGradient(x, y, 0, x, y, rad);
    grr.addColorStop(0, dark ? `rgba(0,0,0,${a * 1.5})` : `rgba(255,255,255,${a * 1.5})`); grr.addColorStop(1, 'rgba(0,0,0,0)');
    gr.fillStyle = grr; gr.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  // grain fin
  const im = g.getImageData(0, 0, S, S);
  for (let i = 0; i < im.data.length; i += 4) { const n = (r() - 0.5) * 10; im.data[i] += n; im.data[i + 1] += n; im.data[i + 2] += n; }
  g.putImageData(im, 0, 0);
  // joints très fins, à peine plus sombres
  g.fillStyle = 'rgba(0,0,0,0.07)'; gr.fillStyle = 'rgba(255,255,255,0.3)';
  for (const p of [0, T]) { g.fillRect(p, 0, 2, S); g.fillRect(0, p, S, 2); gr.fillRect(p, 0, 2, S); gr.fillRect(0, p, S, 2); }
  return { map: tex(c, true), rough: tex(cr, false) };
}
// ombre de contact : dégradé radial (alpha), utilisé en « 9-slice » (voir aoDecal)
function makeShadowTexture() {
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grd.addColorStop(0, 'rgba(0,0,0,1)'); grd.addColorStop(0.35, 'rgba(0,0,0,0.8)'); grd.addColorStop(0.65, 'rgba(0,0,0,0.3)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd; g.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
// plan horizontal en 9 cases : bords flous de largeur 2m centrés sur le contour [x0,x1]×[z0,z1]
function nineSliceGeo(x0, x1, z0, z1, m, y) {
  const kx = Math.min(m, (x1 - x0) / 2), kz = Math.min(m, (z1 - z0) / 2);
  const xs = [x0 - m, x0 + kx, x1 - kx, x1 + m], zs = [z0 - m, z0 + kz, z1 - kz, z1 + m], us = [0, 0.5, 0.5, 1];
  const pos = [], uv = [], idx = [];
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) { pos.push(xs[i], y, zs[j]); uv.push(us[i], us[j]); }
  for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) {
    const a = j * 4 + i, b = a + 1, c = a + 4, d = c + 1;
    idx.push(a, c, b, b, c, d); // face vers +Y
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
function makeGlowTexture() { // dégradé pour la lumière indirecte qui « lèche » le plafond
  const c = document.createElement('canvas'); c.width = 8; c.height = 256;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.12, 'rgba(255,255,255,0.55)');
  grd.addColorStop(0.45, 'rgba(255,255,255,0.14)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 8, 256);
  return tex(c, true, false);
}
function makeBookTexture() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 400;
  const g = c.getContext('2d');
  const sky = g.createLinearGradient(0, 0, 0, 260);
  sky.addColorStop(0, '#20365a'); sky.addColorStop(0.55, '#6d7fa3'); sky.addColorStop(0.85, '#f1a35a'); sky.addColorStop(1, '#ffcf7a');
  g.fillStyle = sky; g.fillRect(0, 0, 512, 260);
  const sea = g.createLinearGradient(0, 260, 0, 400);
  sea.addColorStop(0, '#d98a4a'); sea.addColorStop(0.2, '#3b4f6e'); sea.addColorStop(1, '#14223a');
  g.fillStyle = sea; g.fillRect(0, 260, 512, 140);
  const sun = g.createRadialGradient(256, 258, 2, 256, 258, 60);
  sun.addColorStop(0, 'rgba(255,240,200,1)'); sun.addColorStop(1, 'rgba(255,190,110,0)');
  g.fillStyle = sun; g.fillRect(150, 190, 212, 140);
  g.fillStyle = 'rgba(255,255,255,0.85)'; g.font = '300 26px Helvetica, Arial, sans-serif'; g.fillText('HORIZONS', 24, 44);
  return tex(c, true, false);
}
function screenCanvas(kind) {
  const W = 2048, H = 512;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const r = rnd(kind.length * 31 + 7);
  const font = (px, w = 400) => `${w} ${px}px Helvetica, Arial, sans-serif`;
  if (kind === 'chart') { // carte marine côtière
    const sea = g.createLinearGradient(0, 0, W, 0);
    sea.addColorStop(0, '#5fd3d6'); sea.addColorStop(0.18, '#2fb3c6'); sea.addColorStop(0.45, '#1784b3'); sea.addColorStop(1, '#0a4a82');
    g.fillStyle = sea; g.fillRect(0, 0, W, H);
    // côte : bande de hauts-fonds, plage, terre
    const coast = (dx, col) => { g.fillStyle = col; g.beginPath(); g.moveTo(0, 0); g.lineTo(760 + dx, 0); g.bezierCurveTo(700 + dx, 90, 610 + dx, 130, 560 + dx, 210); g.bezierCurveTo(500 + dx, 300, 380 + dx, 330, 300 + dx, 420); g.bezierCurveTo(260 + dx, 470, 200 + dx, 500, 160 + dx, 512); g.lineTo(0, 512); g.fill(); };
    coast(90, '#86e0dc'); coast(40, '#b7ecdf'); coast(0, '#e6d3a1'); coast(-40, '#cdbb83');
    g.fillStyle = '#8fb06a'; g.beginPath(); g.moveTo(0, 0); g.lineTo(560, 0); g.bezierCurveTo(500, 90, 420, 150, 380, 220); g.bezierCurveTo(330, 300, 220, 340, 150, 420); g.lineTo(0, 470); g.fill();
    g.fillStyle = '#6f9452'; for (let i = 0; i < 14; i++) { g.beginPath(); g.ellipse(60 + r() * 380, 30 + r() * 300, 20 + r() * 40, 10 + r() * 20, r() * 3, 0, 7); g.fill(); }
    // isobathes
    g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 2;
    for (let k = 1; k <= 6; k++) { const o = 90 + k * 120; g.beginPath(); g.moveTo(760 + o, 0); g.bezierCurveTo(700 + o, 110, 600 + o, 160, 540 + o, 250); g.bezierCurveTo(470 + o, 350, 360 + o, 400, 280 + o, 512); g.stroke(); }
    g.fillStyle = 'rgba(255,255,255,0.75)'; g.font = font(18);
    for (let i = 0; i < 70; i++) g.fillText(String(3 + Math.floor(r() * 45)), 760 + r() * 1240, 50 + r() * 440);
    // îlot + bouées
    g.fillStyle = '#e6d3a1'; g.beginPath(); g.ellipse(1320, 140, 60, 26, 0.4, 0, 7); g.fill();
    for (const [x, y, col] of [[980, 300, '#ff3b3b'], [1060, 250, '#2bd46b'], [1500, 380, '#ffd02b']]) { g.fillStyle = col; g.beginPath(); g.arc(x, y, 9, 0, 7); g.fill(); }
    // route magenta pointillée + bateau
    g.strokeStyle = '#ff3fd2'; g.lineWidth = 7; g.setLineDash([26, 16]);
    g.beginPath(); g.moveTo(1880, 430); g.lineTo(1560, 320); g.lineTo(1200, 260); g.lineTo(900, 170); g.lineTo(700, 90); g.stroke(); g.setLineDash([]);
    g.fillStyle = '#ff3fd2'; for (const [x, y] of [[1560, 320], [1200, 260], [900, 170]]) { g.beginPath(); g.arc(x, y, 12, 0, 7); g.fill(); }
    g.save(); g.translate(1880, 430); g.rotate(-1.9); g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(0, -30); g.lineTo(14, 18); g.lineTo(0, 10); g.lineTo(-14, 18); g.closePath(); g.fill(); g.restore();
    g.fillStyle = 'rgba(4,24,44,0.78)'; g.fillRect(0, 0, W, 54); g.fillRect(W - 360, 54, 360, 150);
    g.fillStyle = '#e8f6ff'; g.font = font(30, 500); g.fillText('SOG 9.4 kn     COG 312°     DPT 18.2 m     WPT 3 · 4.6 nm     ETA 14:32', 28, 38);
    g.font = font(26); g.fillText('NAV  ·  1:25 000', W - 330, 100); g.fillText('ROUTE  PORT-CROS', W - 330, 140); g.fillText('XTE 0.02 nm', W - 330, 180);
  } else if (kind === 'radar') {
    const rb = g.createLinearGradient(0, 0, 0, H); rb.addColorStop(0, '#145a33'); rb.addColorStop(1, '#0c4425');
    g.fillStyle = rb; g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(90,255,150,0.12)'; g.lineWidth = 1; for (let x = 0; x < W; x += 64) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); } for (let y = 0; y < H; y += 64) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    const cx = W / 2, cy = H / 2, R = 236;
    const bg = g.createRadialGradient(cx, cy, 0, cx, cy, R); bg.addColorStop(0, '#1a6a39'); bg.addColorStop(1, '#0a3518');
    g.fillStyle = bg; g.beginPath(); g.arc(cx, cy, R, 0, 7); g.fill();
    g.strokeStyle = 'rgba(90,255,150,0.55)'; g.lineWidth = 2.5;
    for (let k = 1; k <= 4; k++) { g.beginPath(); g.arc(cx, cy, R * k / 4, 0, 7); g.stroke(); }
    g.lineWidth = 1.5; for (let k = 0; k < 12; k++) { const a = k * Math.PI / 6; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); g.stroke(); }
    g.strokeStyle = 'rgba(90,255,150,0.8)'; for (let k = 0; k < 72; k++) { const a = k * Math.PI / 36, l = k % 6 ? 8 : 18; g.beginPath(); g.moveTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); g.lineTo(cx + Math.cos(a) * (R + l), cy + Math.sin(a) * (R + l)); g.stroke(); }
    // balayage dégradé
    for (let k = 0; k < 40; k++) { const a1 = -0.5 - k * 0.025; g.fillStyle = `rgba(110,255,160,${0.5 * (1 - k / 40)})`; g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, R, a1 - 0.025, a1); g.fill(); }
    g.strokeStyle = '#b8ffd0'; g.lineWidth = 3; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(-0.5) * R, cy + Math.sin(-0.5) * R); g.stroke();
    // échos (côte + cibles)
    g.fillStyle = 'rgba(160,255,190,0.85)';
    for (let i = 0; i < 260; i++) { const a = 2.2 + r() * 1.6, d = R * (0.55 + r() * 0.42); g.fillRect(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 4, 4); }
    for (const [a, d] of [[-1.0, 0.45], [0.6, 0.7], [1.9, 0.3], [-2.4, 0.8]]) { const x = cx + Math.cos(a) * R * d, y = cy + Math.sin(a) * R * d; g.beginPath(); g.arc(x, y, 8, 0, 7); g.fill(); g.strokeStyle = '#ffd34f'; g.lineWidth = 2; g.strokeRect(x - 16, y - 16, 32, 32); }
    // cap
    g.strokeStyle = '#ffffff'; g.lineWidth = 2; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx, cy - R); g.stroke();
    g.fillStyle = '#7dffa6'; g.font = font(30, 500);
    g.fillText('RADAR  ·  3 nm', 40, 60); g.fillText('GAIN AUTO   SEA 32   RAIN 10', 40, 105); g.fillText('EBL 045°   VRM 1.25 nm', 40, 150);
    g.textAlign = 'right'; g.fillText('HDG 312° T', W - 40, 60); g.fillText('SOG 9.4 kn', W - 40, 105); g.fillText('4 CIBLES ARPA', W - 40, 150);
    g.fillText('CPA 0.8 nm  TCPA 12 min', W - 40, 470); g.textAlign = 'left'; g.fillText('NORD EN HAUT', 40, 470);
  } else { // systèmes
    const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#2a5594'); bg.addColorStop(1, '#173a70');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    // silhouette du DIÈDRE 29 vue de profil
    const bx = 620, by = 300, s = 28;
    const P = (x, y) => [bx + (x + 14.4) * s, by - y * s];
    g.fillStyle = 'rgba(120,180,255,0.16)'; g.strokeStyle = '#d6e8ff'; g.lineWidth = 4;
    g.beginPath(); let p = P(-13.2, 1.9); g.moveTo(...p);
    for (const [x, y] of [[14.4, 2.1], [14.4, 1.2], [13.2, -0.2], [4, -1.0], [-13.2, -0.6], [-13.2, 1.9]]) g.lineTo(...P(x, y));
    g.closePath(); g.fill(); g.stroke();
    g.beginPath(); for (const [i, [x, y]] of [[-10.4, 1.9], [-10.4, 3.6], [-0.6, 3.6], [3.0, 2.6], [3.6, 1.95]].entries()) { const q = P(x, y); i ? g.lineTo(...q) : g.moveTo(...q); } g.stroke();
    g.beginPath(); g.moveTo(...P(-7.4, 3.6)); g.lineTo(...P(-7.4, 4.6)); g.moveTo(...P(-6.8, 3.6)); g.lineTo(...P(-6.8, 4.8)); g.stroke();
    g.strokeStyle = '#4fd1ff'; g.lineWidth = 3; g.beginPath(); g.moveTo(...P(-13.2, 0.0)); g.lineTo(...P(13.6, 0.0)); g.stroke();
    // batteries dans la coque
    g.fillStyle = '#3ee08a'; for (let k = 0; k < 6; k++) g.fillRect(...P(-6 + k * 1.8, 0.8), 40, 16);
    // pastilles d'état sur la silhouette
    const dot = (x, y, col, label) => { const q = P(x, y); g.fillStyle = col; g.beginPath(); g.arc(q[0], q[1], 13, 0, 7); g.fill(); g.fillStyle = '#cfe0f5'; g.font = font(20); g.textAlign = 'center'; g.fillText(label, q[0], q[1] - 22); };
    dot(-11.5, -0.2, '#3ee08a', 'MOTEURS'); dot(-3, 1.2, '#3ee08a', 'BATTERIES'); dot(6, 1.4, '#ffb44f', 'EAU DOUCE'); dot(-5, 3.9, '#4fd1ff', 'SOLAIRE'); dot(10, 2.3, '#3ee08a', 'PROPULSEUR');
    // jauges
    const gauge = (x, y, v, col, label, val) => {
      g.lineCap = 'round';
      g.strokeStyle = 'rgba(255,255,255,0.14)'; g.lineWidth = 22; g.beginPath(); g.arc(x, y, 88, Math.PI * 0.75, Math.PI * 2.25); g.stroke();
      g.strokeStyle = col; g.beginPath(); g.arc(x, y, 88, Math.PI * 0.75, Math.PI * (0.75 + 1.5 * v)); g.stroke();
      g.fillStyle = '#ffffff'; g.font = font(46, 600); g.textAlign = 'center'; g.fillText(val, x, y + 14);
      g.font = font(22); g.fillStyle = '#9fb8d6'; g.fillText(label, x, y + 62);
    };
    gauge(190, 200, 0.82, '#3ee08a', 'BATTERIE', '82%');
    gauge(1650, 200, 0.47, '#4fd1ff', 'VITESSE kn', '9.4');
    gauge(1880, 200, 0.64, '#ffb44f', 'AUTONOMIE nm', '41');
    // bandeau bas
    g.textAlign = 'left'; g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(40, 400, W - 80, 72);
    g.fillStyle = '#3ee08a'; g.fillRect(40, 400, (W - 80) * 0.82, 8);
    g.fillStyle = '#e8f2ff'; g.font = font(30, 500); g.fillText('DIÈDRE 29   ·   148 kW   ·   SOC 82 %   ·   SOLAIRE 2.4 kW   ·   TOUS SYSTÈMES OK', 70, 452);
  }
  // légère vignette de bord (dalle rétroéclairée)
  { const sy = H / W, cy = H / 2 / sy;
    const vg = g.createRadialGradient(W / 2, cy, W * 0.4, W / 2, cy, W * 0.72);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.42)');
    g.save(); g.setTransform(1, 0, 0, sy, 0, 0); g.fillStyle = vg; g.fillRect(0, 0, W, H / sy); g.restore(); }
  const t = tex(c, true, false); t.anisotropy = 16; return t;
}

// ---------------------------------------------------------------------------
export function buildInterior(ctx) {
  const { B, M, Geo, interior, roof, aftDeck, both, mz, v, boxB, boxG, place, cylBetween, xf, section, deckY, halfW, uvScale } = ctx;
  const { FLOOR: IF, YL, YU, YC, X_DOOR, Z_CHEEK, X_SIDE0, D2, L2, U2, BT } = ctx;
  const phys = (p) => new THREE.MeshPhysicalMaterial(p);

  // matériaux d'appoint (non pilotés par les options)
  // cuir pleine fleur mat : pas de vernis (clearcoat 0) ni de voile gris ; sheen teinté (suit l'option, voir main.js)
  const leather = makeLeatherMaps();
  const U = M.upholsteryInterior;
  U.normalMap = leather.normal; U.normalScale = new THREE.Vector2(0.8, 0.8);
  U.roughnessMap = leather.rough; U.roughness = 0.56; // ≈0,45 (sommets lustrés) à 0,56 (plis) avec la carte : satiné de cuir nourri, pas de vernis
  U.clearcoat = 0; U.specularIntensity = 0.6;
  U.sheen = 0.3; U.sheenRoughness = 0.4; { const h = {}; U.color.getHSL(h); U.sheenColor.setHSL(h.h, h.s, Math.min(1, h.l + 0.25)); }
  // nuances de peau (±4 %), lustre irrégulier (zones patinées / mates), plis aux arrondis
  softGoodsShader(U, { tone: 0.04, toneScale: 2.2, rough: 0.22, crease: 0.22 });
  uvScale.set(U, [0.35, 0.35]);
  // sol : résine / ardoise sombre continue, grands carreaux de 1,2 m à joints quasi invisibles
  const floorMaps = makeFloorMaps();
  M.interiorFloor.map = floorMaps.map; M.interiorFloor.roughnessMap = floorMaps.rough;
  M.interiorFloor.color.set(0x1d1e20);
  M.interiorFloor.roughness = 0.8; M.interiorFloor.clearcoat = 0; M.interiorFloor.needsUpdate = true;
  uvScale.set(M.interiorFloor, [2.4, 2.4]);
  M.ceiling.color.set(0xf3ece0); M.ceiling.emissive.set(0x2a241c); M.ceiling.roughness = 0.95;
  // dégradé de plafond (repère bateau, géométrie fusionnée sans transformation) : clair le long des vitrages
  // (|z| > 2,7) et vers le pare-brise, ~55 % au centre — le plafond ne se lit plus comme un aplat blanc uniforme
  M.ceiling.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vCeilG;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vCeilG = max(smoothstep(0.6, 2.8, abs(position.z)), 0.75 * smoothstep(-1.2, 1.0, position.x));`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vCeilG;')
      .replace('#include <color_fragment>', '#include <color_fragment>\n  diffuseColor.rgb *= mix(0.46, 1.0, vCeilG);')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance *= mix(0.45, 1.0, vCeilG);');
  };
  M.ceiling.customProgramCacheKey = () => 'ceilGrad1';
  M.ceiling.needsUpdate = true;

  M.dashNavy = phys({ color: 0x1a2438, roughness: 0.32, clearcoat: 0.7, clearcoatRoughness: 0.2, envMapIntensity: 0.9 });
  M.pianoBlack = phys({ color: 0x050607, roughness: 0.08, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.2 });
  // fil de surpiqûre : coton ciré mat, ton sable plus sourd (le 0xcdb98f brillait comme un ruban LED)
  M.stitch = phys({ color: 0x9d8b69, roughness: 0.85, specularIntensity: 0.3 });
  const ST = 0.0022; // rayon du fil de surpiqûre (≈ 4,5 mm visibles, à demi noyé)
  M.lacquer = phys({ color: 0xebe5d9, roughness: 0.22, clearcoat: 0.7, clearcoatRoughness: 0.15 });
  M.stone = phys({ color: 0x2f3134, roughness: 0.82 });
  M.chrome = phys({ color: 0xd4d7db, metalness: 1, roughness: 0.14 });
  M.slotBlack = phys({ color: 0x040404, roughness: 0.9 });
  // habillage (non piloté par les options)
  // textiles : albedo/normal procéduraux, sheen pour le duvet des fibres
  const fabB = makeFabricMaps('boucle'), fabT = makeFabricMaps('twill'), fabL = makeFabricMaps('linen');
  M.plaid = phys({ color: 0xb0814f, map: fabT.map, normalMap: fabT.normal, normalScale: new THREE.Vector2(0.9, 0.9), roughness: 1, sheen: 1, sheenColor: 0xe7c08f, sheenRoughness: 0.45, side: THREE.DoubleSide });
  M.cushionDeco = phys({ color: 0xd2ccc0, map: fabB.map, normalMap: fabB.normal, normalScale: new THREE.Vector2(1.1, 1.1), roughness: 1, sheen: 1, sheenColor: 0xf4efe6, sheenRoughness: 0.55 });
  M.cushionLinen = phys({ color: 0xa98763, map: fabL.map, normalMap: fabL.normal, normalScale: new THREE.Vector2(0.7, 0.7), roughness: 0.95, sheen: 0.6, sheenColor: 0xd9bf9c, sheenRoughness: 0.5 });
  // laine / bouclette : nuances de teinture chinées à l'échelle de la main (pas d'aplat), duvet plus diffus (sheenRoughness)
  M.plaid.sheenRoughness = 0.6;
  softGoodsShader(M.plaid, { tone: 0.07, toneScale: 9.0 });
  softGoodsShader(M.cushionDeco, { tone: 0.05, toneScale: 11.0 });
  softGoodsShader(M.cushionLinen, { tone: 0.06, toneScale: 8.0 });
  M.ceramic = phys({ color: 0xe6e0d4, roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.2 });
  M.bookA = phys({ color: 0x2c3a4c, roughness: 0.7 });
  M.bookB = phys({ color: 0xcfc6b4, roughness: 0.75 });
  M.paper = phys({ color: 0xf1ece0, roughness: 0.9 });
  // écrans de navigation : niveaux homogènes
  M.screenRadar = phys({ color: 0x000000, emissive: 0xffffff, emissiveMap: screenCanvas('radar'), emissiveIntensity: 2.0, roughness: 0.1, clearcoat: 1, clearcoatRoughness: 0.03 });
  M.screenSystems = phys({ color: 0x000000, emissive: 0xffffff, emissiveMap: screenCanvas('sys'), emissiveIntensity: 2.2, roughness: 0.1, clearcoat: 1, clearcoatRoughness: 0.03 });
  M.screens.color.set(0x000000); M.screens.emissiveMap = screenCanvas('chart'); M.screens.emissive.set(0xffffff); M.screens.emissiveIntensity = 1.6; M.screens.clearcoat = 1; M.screens.clearcoatRoughness = 0.03; M.screens.needsUpdate = true;
  // écrans moins laiteux : verre traité antireflet (reflet d'environnement faible), émissif 2,0 la nuit → 1,2 le jour (×0,6, setInteriorDayFactor)
  for (const m of [M.screens, M.screenRadar, M.screenSystems]) {
    m.emissiveIntensity = 2.0; m.envMapIntensity = 0.12; m.specularIntensity = 0.25; m.roughness = 0.3;
    m.clearcoat = 0.3; m.clearcoatRoughness = 0.04; m.needsUpdate = true;
  }
  M.ledGlow = new THREE.MeshBasicMaterial({ color: 0xffb86b, map: makeGlowTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 1 });
  // lueur LED projetée au sol (même couleur que les rubans, plus douce)
  M.ledGlowFloor = new THREE.MeshBasicMaterial({ color: 0xffb86b, map: makeGlowTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.5,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  // jour / nuit (setInteriorDayFactor, appelé par main.js) : valeurs de nuit = valeurs ci-dessus
  dayMats = { M, glow: M.ledGlow.opacity, glowFloor: M.ledGlowFloor.opacity, ceil: M.ceiling.emissive.clone(),
    scr: [[M.screens, M.screens.emissiveIntensity], [M.screenRadar, M.screenRadar.emissiveIntensity], [M.screenSystems, M.screenSystems.emissiveIntensity]] };
  // balisage de courtoisie 2700 K, indépendant de l'option « ambiance LED » (sécurité de circulation) : piloté jour/nuit
  M.courtesyLed = new THREE.MeshBasicMaterial({ color: 0xffb36b });
  M.courtesyGlow = new THREE.MeshBasicMaterial({ color: 0xffa95c, map: makeGlowTexture(), transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, opacity: 0.6, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  // lueur chaude du salon vue de l'extérieur à travers les vitrages (une face, tournée vers l'extérieur : invisible du salon)
  // (tour 5 : réduite à un léger dégradé sous la corniche — c'est l'intérieur éclairé qui doit se lire à travers le verre)
  M.salonGlowOut = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.2 });
  Object.assign(dayMats, { courtesy: M.courtesyLed, courtesyOn: new THREE.Color(0xffb36b), courtesyOff: new THREE.Color(0x1d1b19),
    nightGlow: [[M.courtesyGlow, 1.0]], winGlow: M.salonGlowOut, winGlowOp: 0.2 });
  // ruban de lueur au sol le long d'une polyligne [[x, z]…] : bord lumineux sur la ligne, s'estompe sur w selon dirs[i]
  const glowRibbon = (parent, pts, y, w, dirs) => {
    const pos = [], uv = [], idx = [];
    pts.forEach(([x, z, yp], i) => { const [nx, nz] = dirs[i], yy = yp ?? y; pos.push(x, yy, z, x + nx * w, yy, z + nz * w); uv.push(0.5, 1, 0.5, 0); });
    for (let i = 0; i < pts.length - 1; i++) idx.push(2 * i, 2 * i + 1, 2 * i + 2, 2 * i + 1, 2 * i + 3, 2 * i + 2);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
    const m = new THREE.Mesh(g, M.courtesyGlow); m.renderOrder = 2; m.name = 'courtesyGlow'; parent.add(m); return m;
  };
  // ombres de contact (AO) : décalques noirs en alpha
  const shadowTex = makeShadowTexture();
  const aoMat = (op) => new THREE.MeshBasicMaterial({ color: 0x000000, map: shadowTex, transparent: true, opacity: op, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  const aoDecal = (parent, x0, x1, z0, z1, m, y, op = 0.6) => {
    const mesh = new THREE.Mesh(nineSliceGeo(x0, x1, z0, z1, m, y), aoMat(op));
    mesh.renderOrder = 1; mesh.name = 'aoDecal'; parent.add(mesh); return mesh;
  };
  // bande de lueur au sol : bord lumineux sur [a0,a1] le long de l'axe `axis`, s'estompe sur `w` dans la direction `dir`
  const floorGlow = (parent, axis, a0, a1, edge, dir, w, y) => {
    const P = (a, b) => (axis === 'x' ? [a, y, b] : [b, y, a]);
    const pos = [...P(a0, edge), ...P(a1, edge), ...P(a0, edge + dir * w), ...P(a1, edge + dir * w)];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 1, 1, 0, 0, 1, 0], 2));
    g.setIndex([0, 2, 1, 1, 2, 3]);
    const m = new THREE.Mesh(g, M.ledGlowFloor);
    m.material.side = THREE.DoubleSide;
    m.renderOrder = 2; m.name = 'ledFloorGlow';
    parent.add(m); glowMeshes.push(m); return m;
  };

  const nl = { cast: false, receive: false };
  const rbox = (w, h, d, r, x, y, z, rx = 0, ry = 0, rz = 0) => place(new RoundedBoxGeometry(w, h, d, 4, r), x, y, z, rx, ry, rz);
  const basis = (ax, ay, az, p) => new THREE.Matrix4().makeBasis(ax, ay, az).setPosition(p);

  // =========================================================================
  // SOL de plain-pied avec le pont arrière
  // =========================================================================
  {
    const pts = [[X_DOOR, Z_CHEEK], [X_SIDE0, Z_CHEEK], ...D2.map(([x, z]) => [x, z - 0.02])];
    const shape = new THREE.Shape([...pts, ...pts.slice().reverse().map(([x, z]) => [x, -z])].map(([x, z]) => new THREE.Vector2(x, z)));
    const g = new THREE.ShapeGeometry(shape);
    B.add(interior, M.interiorFloor, xf(g, basis(v(1, 0, 0), v(0, 0, 1), v(0, 1, 0), v(0, IF, 0))), { cast: false });
    // seuil fin noir à la baie
    B.add(interior, M.metalDark, boxB(X_DOOR - 0.06, X_DOOR + 0.06, deckY(X_DOOR) - 0.02, IF + 0.008, -Z_CHEEK, Z_CHEEK), { cast: false });
  }

  // =========================================================================
  // PLAFOND : gorges LED continues + 3 spots linéaires noirs
  // =========================================================================
  const glowMeshes = [];
  // caisson central rehaussé (+0.12) : la trémie est découpée dans le plafond (boat.js, ctx.CAISSON)
  const CS = ctx.CAISSON || { x0: -9.3, x1: 0.3, z: 2.45, h: 0.12 };
  const YK = YC + CS.h; // sous-face du caisson
  {
    const { x0: xa, x1: xb, z: zk } = CS;
    // sous-face du caisson (face vers le bas)
    const top = new THREE.PlaneGeometry(xb - xa, 2 * zk); top.rotateX(Math.PI / 2); top.translate((xa + xb) / 2, YK, 0);
    B.add(roof, M.ceiling, top, { cast: false });
    // contremarches (faces tournées vers l'intérieur du caisson)
    for (const s of [1, -1]) {
      const g = new THREE.PlaneGeometry(xb - xa, CS.h);
      if (s > 0) g.rotateY(Math.PI);
      g.translate((xa + xb) / 2, YC + CS.h / 2, s * zk);
      B.add(roof, M.ceiling, g, { cast: false });
    }
    for (const xe of [xa, xb]) {
      const g = new THREE.PlaneGeometry(2 * zk, CS.h); g.rotateY(xe === xa ? Math.PI / 2 : -Math.PI / 2); g.translate(xe, YC + CS.h / 2, 0);
      B.add(roof, M.ceiling, g, { cast: false });
    }
    for (const s of [1, -1]) {
      // gorge dans la contremarche : lèvre basse (retombée de 3 cm), ruban LED caché derrière, lueur qui lèche le caisson
      B.add(roof, M.ceiling, boxB(xa, xb, YC - 0.004, YC + 0.03, Math.min(s * zk, s * (zk - 0.06)), Math.max(s * zk, s * (zk - 0.06))), { cast: false });
      B.add(roof, M.ledStrip, boxB(xa + 0.05, xb - 0.05, YC + 0.03, YC + 0.042, s * (zk - 0.035) - 0.01, s * (zk - 0.035) + 0.01), nl);
      const w = 1.3;
      const g = new THREE.PlaneGeometry(xb - xa - 0.1, w);
      const uv = g.attributes.uv; if (s < 0) for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
      const m = new THREE.Mesh(g, M.ledGlow);
      m.rotation.x = Math.PI / 2; // face vers le bas, dégradé lumineux côté contremarche
      m.position.set((xa + xb) / 2, YK - 0.003, s * zk - s * w / 2);
      m.renderOrder = 2; m.name = 'ledGlow';
      roof.add(m); glowMeshes.push(m);
      // reflet de la gorge sur la contremarche elle-même
      const gr = new THREE.PlaneGeometry(xb - xa - 0.1, CS.h - 0.03);
      const m2 = new THREE.Mesh(gr, M.ledGlow);
      m2.rotation.y = s > 0 ? Math.PI : 0;
      m2.position.set((xa + xb) / 2, YC + 0.03 + (CS.h - 0.03) / 2, s * (zk - 0.002));
      m2.renderOrder = 2; m2.name = 'ledGlow';
      roof.add(m2); glowMeshes.push(m2);
    }
    // spots linéaires encastrés, regroupés au-dessus de la table + un au-dessus du poste
    for (const [x, z] of [[-5.6, 0], [-4.7, 0], [-3.8, 0], [-0.05, 1.56]]) {
      const d = z === 0 ? 0.024 : 0; // ceux du champ de panneaux affleurent sous les panneaux (2,2 cm plus bas)
      B.add(roof, M.metalDark, boxB(x - 0.05, x + 0.05, YK - 0.012 - d, YK + 0.002 - d, z - 0.32, z + 0.32), { cast: false });
      for (const dz of [-0.16, 0.16]) B.add(roof, M.ledStrip, boxB(x - 0.024, x + 0.024, YK - 0.016 - d, YK - 0.012 - d, z + dz - 0.05, z + dz + 0.05), nl);
    }
    // champ central de panneaux tendus (suédine ivoire, chants arrondis) : 6 × 2 panneaux de 1,48 × 1,0 m, joints creux noirs
    // de 2 cm, épine centrale en gorge indirecte (ruban LED dans une saignée), 1 spot rond encastré par panneau
    // (lunette satinée, réflecteur noir, diffuseur chaud piloté jour/nuit). Les bandes latérales restent lisses (lueur des gorges).
    {
      M.ceilPanel = phys({ color: 0xebe4d8, roughness: 0.88, sheen: 0.5, sheenColor: 0xfff6ea, sheenRoughness: 0.7 });
      const PX0 = -9.1, PX1 = -0.1, NPX = 6, PW = (PX1 - PX0) / NPX, ZI = 0.055, ZO = 1.1, PT = 0.02, GAP = 0.02;
      B.add(roof, M.slotBlack, boxB(PX0 - 0.01, PX1 + 0.01, YK - 0.0025, YK - 0.0008, -ZO - 0.01, ZO + 0.01), nl); // fond des joints
      const ring = new THREE.TorusGeometry(0.047, 0.006, 8, 32); ring.rotateX(Math.PI / 2);
      // tour 5 : lunette laquée blanc satiné + diffuseur opale gris-blanc affleurant (plus de gorge noire visible) ;
      // émissif chaud en dégradé radial piloté jour/nuit (lensEmit dans setInteriorDayFactor)
      const grad = (w, h, stops, radial) => {
        const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
        const gr = radial ? g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2) : g.createLinearGradient(0, 0, 0, h);
        for (const [o, col] of stops) gr.addColorStop(o, col);
        g.fillStyle = gr; g.fillRect(0, 0, w, h); return tex(c, true, false);
      };
      M.bezelWhite = phys({ color: 0xf1eee8, roughness: 0.32, clearcoat: 0.3, clearcoatRoughness: 0.3 });
      M.downLens = phys({ color: 0xdedad2, roughness: 0.5, emissive: 0xffb36b, emissiveIntensity: 0,
        emissiveMap: grad(64, 64, [[0, '#fff'], [0.55, '#f0f0f0'], [0.85, '#707070'], [1, '#303030']], true) });
      // épine : fond de saignée gris chaud (plus de vide noir), lavé par le ruban en dégradé transversal
      M.spineSoffit = phys({ color: 0x9a9389, roughness: 0.8, emissive: 0xffaa5e, emissiveIntensity: 0,
        emissiveMap: grad(4, 64, [[0, '#2a2a2a'], [0.35, '#9a9a9a'], [0.5, '#ffffff'], [0.65, '#9a9a9a'], [1, '#2a2a2a']], false) });
      // ruban de l'épine : même gain jour/nuit que les autres rubans (clone → shader du prototype), teinte ramenée à ~2800 K
      M.spineLed = M.ledStrip.clone(); M.spineLed.color.set(0xffad5c).multiplyScalar(0.8);
      dayMats.lensEmit = [[M.downLens, 1.3, 0], [M.spineSoffit, 0.9, 0.25]];
      for (let i = 0; i < NPX; i++) {
        const xc = PX0 + PW * (i + 0.5);
        for (const s of [1, -1]) {
          const zc = s * (ZI + ZO) / 2;
          B.add(roof, M.ceilPanel, rbox(PW - GAP, PT, ZO - ZI - GAP, 0.009, xc, YK - 0.003 - PT / 2, zc), { cast: false });
          const dx = xc + (i % 2 ? 0.18 : -0.18); // décalé : laisse la place aux spots linéaires au-dessus de la table
          B.add(roof, M.bezelWhite, place(ring.clone(), dx, YK - 0.003 - PT, zc), nl);
          B.add(roof, M.downLens, place(new THREE.CylinderGeometry(0.044, 0.044, 0.004, 32), dx, YK - 0.0035 - PT, zc), nl);
        }
      }
      // épine centrale : fond gris chaud lavé de lumière + ruban LED ~2800 K (suit l'option d'ambiance) + lèvres laquées blanches
      { const sg = new THREE.PlaneGeometry(PX1 - PX0, 2 * ZI + GAP); sg.rotateX(Math.PI / 2); B.add(roof, M.spineSoffit, place(sg, (PX0 + PX1) / 2, YK - 0.004, 0), nl); }
      B.add(roof, M.spineLed, boxB(PX0, PX1, YK - 0.007, YK - 0.0045, -0.007, 0.007), nl);
      for (const s of [1, -1]) B.add(roof, M.bezelWhite, boxB(PX0, PX1, YK - 0.003 - PT - 0.002, YK - 0.003 - PT + 0.004, s * ZI - 0.004, s * ZI + 0.004), nl);
    }
  }
  // lueur chaude du salon vue de l'extérieur la nuit : nappe additive à 7 cm derrière chaque vitrage latéral, tournée vers
  // l'extérieur (éliminée en face arrière depuis le salon), plus claire sous la corniche (gorges) et en allège (lampes),
  // fondue aux extrémités ; sous le bandeau noir de tête de vitrage. Opacité pilotée par setInteriorDayFactor (nulle le jour).
  {
    const n = L2.length, NV = 6, T1 = Math.min(0.8, (YC - 0.17 - YL) / (YU - YL)), T0 = T1 - 0.4;
    const rows = [];
    for (let i = 0; i < n - 1; i++) for (let q = 0; q < 4; q++) {
      const t = q / 4, L = (a, b) => a + (b - a) * t;
      rows.push([L(L2[i][0], L2[i + 1][0]), L(L2[i][1], L2[i + 1][1]), L(U2[i][0], U2[i + 1][0]), L(U2[i][1], U2[i + 1][1])]);
    }
    rows.push([...L2[n - 1], ...U2[n - 1]]);
    const pos = [], col = [], idx = [], NR = rows.length;
    for (const s of [1, -1]) {
      const base = pos.length / 3;
      rows.forEach(([lx, lz, ux, uz], c) => {
        const ex = Math.min(1, c / 3, (NR - 1 - c) / 3);
        for (let j = 0; j <= NV; j++) {
          const t = T0 + (T1 - T0) * j / NV, y = YL + (YU - YL) * t, x = lx + (ux - lx) * t, z = lz + (uz - lz) * t - 0.07;
          // tour 5 : dégradé franc, clair sous la corniche (gorges) → nul à mi-hauteur, modulé par les spots le long de la coque
          const pr = Math.exp(-(((t - T1) / 0.2) ** 2)) * (0.7 + 0.3 * Math.cos(c * 1.3));
          const kk = ex * pr * Math.min(1, j / 2) * Math.min(1, 0.4 + (NV - j) / 1.5);
          pos.push(x, y, s * z); col.push(kk, 0.6 * kk, 0.28 * kk);
        }
      });
      for (let c = 0; c < NR - 1; c++) for (let j = 0; j < NV; j++) {
        const a = base + c * (NV + 1) + j, b = a + NV + 1;
        // orientation : normale vers l'extérieur (signe de z du côté)
        const P = (k) => v(pos[3 * k], pos[3 * k + 1], pos[3 * k + 2]);
        const nz = P(b).sub(P(a)).cross(P(a + 1).sub(P(a))).z;
        if (nz * s > 0) idx.push(a, b, a + 1, a + 1, b, b + 1); else idx.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx);
    const m = new THREE.Mesh(g, M.salonGlowOut); m.name = 'salonGlowOut'; m.renderOrder = 3; m.frustumCulled = false; interior.add(m);
  }
  // bandeau noir le long du haut des vitrages (intérieur)
  {
    const yb0 = YC - 0.16;
    const onGlass = (Lp, Up, y, inset) => {
      const t = (y - YL) / (YU - YL);
      const p = new THREE.Vector3(Lp[0] + (Up[0] - Lp[0]) * t, y, Lp[1] + (Up[1] - Lp[1]) * t);
      return p.setZ(p.z - inset);
    };
    const n = L2.length;
    const band = [];
    for (let i = 0; i < n - 1; i++) {
      const a0 = onGlass(L2[i], U2[i], yb0, 0.03), a1 = onGlass(L2[i], U2[i], YC, 0.03);
      const b0 = onGlass(L2[i + 1], U2[i + 1], yb0, 0.03), b1 = onGlass(L2[i + 1], U2[i + 1], YC, 0.03);
      band.push([a0, b0, b1, a1]);
    }
    // les pans sont gauches (comme le vitrage) : nappe bilinéaire subdivisée à normales analytiques, au lieu de
    // 2 triangles plats pliés en diagonale. Deux faces : l'extérieure (vue à travers le vitrage) et l'intérieure
    // (sans elle le bandeau était éliminé par le back-face culling depuis le salon : tête de vitrage non finie)
    const NU = 12, NW = 3;
    const nappe = (quads) => {
    const pos = [], nor = [];
    for (const [a, b, c, d] of quads) { // a,b bas ; d,c haut
      const P = (u, w) => a.clone().lerp(b, u).lerp(d.clone().lerp(c, u), w);
      const Nr = (u, w) => new THREE.Vector3().subVectors(b, a).lerp(new THREE.Vector3().subVectors(c, d), w)
        .cross(new THREE.Vector3().subVectors(d, a).lerp(new THREE.Vector3().subVectors(c, b), u)).normalize();
      for (const s of [1, -1]) {
        for (let i = 0; i < NU; i++) for (let j = 0; j < NW; j++) {
          const u0 = i / NU, u1 = (i + 1) / NU, w0 = j / NW, w1 = (j + 1) / NW;
          const t = s > 0 ? [[u0, w0], [u1, w0], [u1, w1], [u0, w0], [u1, w1], [u0, w1]] : [[u0, w0], [u1, w1], [u1, w0], [u0, w0], [u0, w1], [u1, w1]];
          for (const [u, w] of t) { const p = P(u, w), nn = Nr(u, w).multiplyScalar(s); pos.push(p.x, p.y, p.z); nor.push(nn.x, nn.y, nn.z); }
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    return g;
    };
    both(roof, M.metalDark, nappe(band), { cast: false });
    // pan central du pare-brise (au-dessus de la planche) : même bandeau, retrait de 3 cm vers l'arrière
    {
      const k = n - 1, sh = (p) => p.setX(p.x - 0.03); // retrait en x (le raccord d'angle tombe derrière le meneau)
      const a = sh(onGlass(L2[k], U2[k], yb0, 0.03)), d = sh(onGlass(L2[k], U2[k], YC, 0.03));
      const m = (p) => p.clone().setZ(-p.z);
      B.add(roof, M.metalDark, nappe([[a, m(a), m(d), d]]), { cast: false });
    }
  }

  // lumière réelle des gorges (RectAreaLight) + éclairage d'ambiance doux
  if (!rectLibReady) { RectAreaLightUniformsLib.init(); rectLibReady = true; }
  const coveLights = [];
  const COVE_I = 10;
  for (const s of [1, -1]) {
    // ruban caché dans la corniche, tourné vers le plafond
    const l = new THREE.RectAreaLight(0xffb86b, COVE_I, CS.x1 - CS.x0 - 0.1, 0.2);
    l.position.set((CS.x0 + CS.x1) / 2, YC + 0.04, (CS.z - 0.035) * s);
    l.rotation.x = Math.PI / 2;
    l.name = 'coveLight';
    interior.add(l); coveLights.push(l);
  }
  const fill = new THREE.RectAreaLight(0xffdcb0, 4.5, 9, 2.6);
  fill.position.set(-5.2, YK - 0.02, 0); fill.rotation.x = -Math.PI / 2; fill.name = 'salonFill';
  interior.add(fill);
  // dalle recentrée et réduite : elle ne dépasse plus la ligne haute du pare-brise (plus de triangle clair sur le verre)
  const helmFill = new THREE.RectAreaLight(0xffe2bc, 3.5 * (2.6 * 4.4) / (1.6 * 4.0), 1.6, 4.0);
  helmFill.position.set(0.0, YC - 0.02, 0); helmFill.rotation.x = -Math.PI / 2; helmFill.name = 'helmFill';
  interior.add(helmFill);
  // dalles d'ambiance suivies par setInteriorDayFactor : ×0,6 le jour (pièce plus sombre que la mer), ×0,5 la nuit (salon feutré)
  const fillLights = [[fill, fill.intensity], [helmFill, helmFill.intensity]];
  // lumière du jour qui entre par les vitrages : grandes sources douces juste derrière chaque bandeau vitré (tournées vers
  // l'intérieur et vers le sol), le pare-brise, et le rebond du sol clair vers le plafond (sans lui, plafond gris en plein jour).
  // Intensités = plein jour ; setInteriorDayFactor les réduit à ~4 % la nuit.
  const dayLights = [], nightLights = [];
  const area = (col, I, w, h, pos, look, name) => {
    const l = new THREE.RectAreaLight(col, I, w, h); l.position.set(...pos); l.lookAt(...look); l.name = name;
    interior.add(l); dayLights.push([l, I]); return l;
  };
  // (intensités −40 % : la pièce doit rester plus sombre que la mer vue par les vitrages)
  for (const s of [1, -1]) area(0xf3f4f6, 0.9, 9.0, 0.95, [-5.0, 3.05, 3.02 * s], [-5.0, 1.4, 0], 'windowLight');
  // (pas de lumière de pare-brise dédiée : helmFill éclaire déjà le poste ; chaque RectAreaLight coûte cher par fragment)
  area(0xf4eee4, 0.6, 9.6, 4.6, [-4.8, IF + 0.02, 0], [-4.8, 5, 0], 'floorBounce');
  // downlights (soir / nuit) : 1 large au-dessus de la table, 1 au poste, 1 par méridienne (faisceaux larges, pénombre douce).
  // Coût : chaque lumière est évaluée par tous les fragments de la scène → 4 spots seulement, éteints (visible=false) de jour.
  // (nuit sans écrêtage : table 60 cd, méridiennes 50 cd, poste 25 cd à faisceau élargi — il faisait une tache blanche au premier plan)
  const SPOT_POS = [[-4.7, 0, 60, 0.75], [-0.05, 1.56, 25, 0.75], [-4.7, 2.2, 50, 0.95], [-4.7, -2.2, 50, 0.95]];
  for (const [x, z, I, ang] of SPOT_POS) {
    const sp = new THREE.SpotLight(0xffc68a, I, 0, ang, 0.9, 2);
    sp.position.set(x, YK - 0.02, z); sp.target.position.set(x, IF, z); sp.name = 'downlight';
    interior.add(sp, sp.target); nightLights.push([sp, I]);
  }
  // spots ronds encastrés au-dessus des méridiennes (les autres positions ont déjà leurs spots linéaires)
  for (const [x, z] of [[-6.4, 2.2], [-3.0, 2.2], [-6.4, -2.2], [-3.0, -2.2]]) {
    B.add(roof, M.metalDark, place(new THREE.CylinderGeometry(0.045, 0.045, 0.012, 24), x, YK - 0.004, z), { cast: false });
    B.add(roof, M.ledStrip, place(new THREE.CylinderGeometry(0.028, 0.028, 0.004, 20), x, YK - 0.011, z), nl);
  }
  dayMats.fills = fillLights;
  dayMats.dayLights = dayLights; dayMats.nightLights = nightLights; dayMats.coves = coveLights.map((l) => [l, COVE_I]);

  // cloison arrière intérieure (faces des joues vues depuis le salon) : habillage sombre
  {
    const lining = phys({ color: 0x15171a, roughness: 0.12, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.05 }); // verre fumé noir
    M.lining = lining;
    // panneau découpé au profil latéral (pied D0 → seuil L0 → vitrage vers U0), 3 cm en retrait de la paroi :
    // l'ancienne boîte pleine hauteur jusqu'à z = 3,42 débordait jusqu'à 0,5 m hors du vitrage en tête
    {
      const [, zD] = D2[0], [, zL] = L2[0], [, zU] = U2[0], e = 0.03;
      const zAtYC = zL + (zU - zL) * (YC - YL) / (YU - YL);
      const prof = [[Z_CHEEK, IF], [zD - e, IF], [zD - e, deckY(X_SIDE0)], [zL - e, YL], [zAtYC - e, YC], [Z_CHEEK, YC]];
      const sh = new THREE.Shape(prof.map(([z, y]) => new THREE.Vector2(z, y)));
      const lg = new THREE.ExtrudeGeometry(sh, { depth: 0.02, bevelEnabled: false });
      both(interior, lining, xf(lg, basis(v(0, 0, 1), v(0, 1, 0), v(-1, 0, 0), v(X_SIDE0 + 0.025, 0, 0))), { cast: false });
    }
    both(interior, lining, boxB(X_DOOR - 0.12, X_SIDE0 + 0.025, IF, YC, Z_CHEEK - 0.02, Z_CHEEK), { cast: false });
    // balisage de seuil : 2 veilleuses encastrées basses dans les tableaux de la baie, flaque de lumière au sol
    for (const s of [1, -1]) {
      const xm = (X_DOOR + X_SIDE0) / 2;
      B.add(interior, M.metalDark, boxB(xm - 0.07, xm + 0.07, IF + 0.2, IF + 0.26, s > 0 ? Z_CHEEK - 0.026 : -Z_CHEEK + 0.02, s > 0 ? Z_CHEEK - 0.02 : -Z_CHEEK + 0.026), nl);
      B.add(interior, M.ledStrip, boxB(xm - 0.055, xm + 0.055, IF + 0.206, IF + 0.214, s > 0 ? Z_CHEEK - 0.03 : -Z_CHEEK + 0.026, s > 0 ? Z_CHEEK - 0.026 : -Z_CHEEK + 0.03), nl);
      floorGlow(interior, 'x', xm - 0.22, xm + 0.22, s * (Z_CHEEK - 0.03), -s, 0.45, IF + 0.002);
    }
  }

  // =========================================================================
  // CRÉDENCES en noyer sous les vitrages
  // =========================================================================
  // extrémité arrière : vient buter à plat contre l'habillage de la joue (X_SIDE0 + 0,025) — plus de demi-cylindre
  // qui s'enfonçait dans la cloison
  const CR = { zi: 2.9, zo: 3.32, xa: X_SIDE0 + 0.027, xb: -0.62, top: YL + 0.02 };
  {
    const { zi, zo, xa, xb, top } = CR, zc = (zi + zo) / 2;
    const body = rbox(xb - xa, top - IF - 0.03, zo - zi, 0.025, (xa + xb) / 2, (IF + top - 0.03) / 2, zc);
    both(interior, M.woodInterior, body);
    // plateau débordant de 3 cm (côté pièce et côté poste), affleurant la cloison à l'arrière
    both(interior, M.woodInterior, rbox(xb - xa + 0.03, 0.035, zo - zi + 0.03, 0.012, (xa + xb + 0.03) / 2, top - 0.0175, zc - 0.015));
    // rainure horizontale (bande tiroirs) + joints verticaux des panneaux
    const zf = zi - 0.003;
    both(interior, M.metalDark, boxB(xa, xb, IF + 0.617, IF + 0.623, zf - 0.003, zf + 0.003), nl);
    const cuts = [xa]; for (let x = xa + 0.9; x < xb - 0.2; x += 0.9) cuts.push(x); cuts.push(xb);
    for (const x of cuts.slice(1, -1)) both(interior, M.metalDark, boxB(x - 0.003, x + 0.003, IF + 0.06, top - 0.06, zf - 0.003, zf + 0.003), nl);
    // prises-fentes noires (0,28 × 0,014) au centre de chaque panneau
    for (let i = 0; i < cuts.length - 1; i++) {
      const xm = (cuts[i] + cuts[i + 1]) / 2;
      both(interior, M.slotBlack, boxB(xm - 0.14, xm + 0.14, IF + 0.733, IF + 0.747, zi - 0.006, zi + 0.004), nl);
    }
    // socle en retrait
    both(interior, M.metalDark, boxB(xa, xb, IF, IF + 0.035, zi + 0.04, zo), nl);
    for (const s of [1, -1]) {
      // ombre de contact au pied + lueur LED au sol (parties dégagées, hors méridienne)
      aoDecal(interior, xa, xb, s > 0 ? zi + 0.02 : -zo, s > 0 ? zo : -zi - 0.02, 0.07, IF + 0.003, 0.55);
      floorGlow(interior, 'x', xa + 0.05, -8.2, s * (zi + 0.03), -s, 0.32, IF + 0.002);
      floorGlow(interior, 'x', -2.05, xb - 0.05, s * (zi + 0.03), -s, 0.32, IF + 0.002);
    }
    // habillage : bol céramique + 2 livres sur la crédence tribord avant
    B.add(interior, M.bookA, boxG(0.30, 0.03, 0.22, -1.15, top + 0.015, 3.1, 0, 0.12, 0));
    B.add(interior, M.paper, boxG(0.292, 0.026, 0.205, -1.148, top + 0.015, 3.1, 0, 0.12, 0), nl);
    B.add(interior, M.bookB, boxG(0.25, 0.024, 0.19, -1.17, top + 0.042, 3.1, 0, -0.08, 0));
    {
      const prof = [[0, 0], [0.045, 0], [0.06, 0.006], [0.1, 0.035], [0.125, 0.07], [0.13, 0.085], [0.124, 0.086], [0.118, 0.072], [0.094, 0.04], [0.055, 0.016], [0, 0.014]]
        .map(([x, y]) => new THREE.Vector2(x, y));
      B.add(interior, M.ceramic, place(new THREE.LatheGeometry(prof, 40), -1.68, top, 3.1));
    }
  }

  // =========================================================================
  // MÉRIDIENNES cuir bleu nuit : profil bas, dossier roulé intégré, coussins d'assise
  // =========================================================================
  const ML = { xa: -7.7, len: 5.4, zBack: 2.88 };
  {
    const { xa, len, zBack } = ML, xb = xa + len;
    // profil (u vers l'intérieur, v vers le haut) ; biseau 0.035 inclus : plateforme 0.28, dossier 0.60, profondeur 1.05
    const prof = new THREE.Shape();
    prof.moveTo(0.02, 0.135); prof.lineTo(1.0, 0.135); prof.lineTo(1.0, 0.215);
    prof.quadraticCurveTo(1.0, 0.245, 0.97, 0.245); prof.lineTo(0.27, 0.245);
    prof.quadraticCurveTo(0.21, 0.25, 0.195, 0.33);
    prof.lineTo(0.18, 0.47); prof.quadraticCurveTo(0.17, 0.565, 0.1, 0.565);
    prof.quadraticCurveTo(0.02, 0.565, 0.02, 0.48); prof.lineTo(0.02, 0.135);
    // dossier roulé capitonné en côtes verticales (~45 cm) : coutures rentrées de 9 mm, côtes gonflées de 7 mm entre elles
    // (le rouleau ne se lit plus comme un tube rigide). Repère du profil : u vers la pièce, v vers le haut, d le long du canapé.
    const DEPTH = len - 0.1, NCH = 12, PCH = DEPTH / NCH, RC = [0.1, 0.46];
    const rollDisp = (u, vv, d) => {
      const w = sstep01(0.3, 0.38, vv) * sstep01(-0.05, 0.06, d) * sstep01(-0.05, 0.06, DEPTH - d);
      if (w <= 0) return 0;
      const f = ((d / PCH) % 1 + 1) % 1, ds = Math.min(f, 1 - f) * PCH;
      return w * (0.007 * Math.pow(Math.sin(Math.PI * f), 0.7) - 0.009 * Math.exp(-((ds / 0.011) ** 2)));
    };
    const bodyRaw = new THREE.ExtrudeGeometry(prof, { depth: DEPTH, bevelEnabled: true, bevelSize: 0.035, bevelThickness: 0.05, bevelSegments: 4, curveSegments: 9, steps: NCH * 18 });
    // (pas de 2,45 cm calé sur les coutures : un sommet tombe exactement au fond de chaque côte → creux net
    //  avec ~45 % de triangles en moins qu'un pas libre de 2 cm à 16 segments de courbe)
    {
      const p = bodyRaw.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const u = p.getX(i), vv = p.getY(i), d = p.getZ(i), dd = rollDisp(u, vv, d);
        if (!dd) continue;
        const ru = u - RC[0], rv = vv - RC[1], rl = Math.hypot(ru, rv) || 1;
        p.setX(i, u + dd * ru / rl); p.setY(i, vv + dd * rv / rl);
      }
    }
    // fil de couture au fond de chaque côte (relevé sur le maillage déformé, de l'avant du rouleau jusqu'au dos)
    {
      const p = bodyRaw.attributes.position, bodyM = basis(v(0, 0, -1), v(0, 1, 0), v(1, 0, 0), v(xa + 0.05, IF, zBack));
      for (let k = 1; k < NCH; k++) {
        const dS = k * PCH, bins = new Map();
        for (let i = 0; i < p.count; i++) {
          const d = p.getZ(i); if (Math.abs(d - dS) > 0.0101) continue;
          const u = p.getX(i), vv = p.getY(i); if (vv < 0.36) continue;
          let a = Math.atan2(vv - RC[1], u - RC[0]); if (a < -Math.PI / 2) a += 2 * Math.PI; // avant → dessus → dos
          const key = Math.round(a * 40);
          const ex = bins.get(key); if (!ex || Math.abs(d - dS) < ex[3]) bins.set(key, [u, vv, a, Math.abs(d - dS)]);
        }
        const pts = [...bins.values()].sort((A, Bq) => A[2] - Bq[2]).map(([u, vv]) => {
          const ru = u - RC[0], rv = vv - RC[1], rl = Math.hypot(ru, rv) || 1;
          return v(u + 0.0012 * ru / rl, vv + 0.0012 * rv / rl, dS).applyMatrix4(bodyM);
        });
        if (pts.length > 3) both(interior, M.stitch, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), pts.length * 2, ST * 0.9, 5), nl);
      }
    }
    const bodyG = xf(toCreasedNormals(bodyRaw, 0.6), basis(v(0, 0, -1), v(0, 1, 0), v(1, 0, 0), v(xa + 0.05, IF, zBack)));
    both(interior, M.upholsteryInterior, bodyG);
    // coussins d'assise (2) : h 0.14, dessus à IF+0.42, profondeur 0.80, joint 5 mm
    const c0 = xa + 0.05, c1 = xb - 0.08, half = (c1 - c0) / 2;
    const cu0 = 0.24, cu1 = 1.04;
    const seatCush = [];
    for (let k = 0; k < 2; k++) {
      const cx = c0 + half / 2 + k * half, cz = zBack - (cu0 + cu1) / 2;
      // garnissage souple : bombé de 7 mm, creux d'assise de 11 mm un peu reculé (pas au même endroit sur les deux coussins)
      // (amplitudes réglées pour se lire depuis la vue « Salon » à 5–8 m : bombé 13 mm, creux 22 mm, nez gonflé 9 mm)
      // tour 3 : dessus franchement bombé (22 mm), 3 creux d'assise inégaux aux places, plis rayonnants et de couture (3 mm)
      const sc = softBox(half - 0.005, 0.14, cu1 - cu0, 0.05, { crown: 0.022, sag: 0.0, bulge: 0.011, wrinkle: 0.0028, seed: k * 3.1,
        dents: k ? [[-0.82, 0.07, 0.27, 0.22, 0.017], [0.06, 0.05, 0.25, 0.2, 0.012], [0.9, 0.08, 0.28, 0.23, 0.02]]
          : [[-0.95, 0.06, 0.28, 0.22, 0.019], [-0.05, 0.08, 0.26, 0.21, 0.014], [0.86, 0.05, 0.25, 0.2, 0.011]] });
      seatCush.push({ cx, cz, top: sc.top });
      both(interior, M.upholsteryInterior, place(sc.geo, cx, IF + 0.35, cz));
      // surpiqûre fine sur le plat du dessus, à 6 cm du nez (à demi noyée dans le cuir), qui suit le bombé et le creux
      const zl = -(cu1 - cu0) / 2 + 0.06, pts = [];
      for (let x = -half / 2 + 0.06; x <= half / 2 - 0.06 + 1e-6; x += 0.02) pts.push(v(cx + x, IF + 0.4205 + sc.top(x, zl), cz + zl));
      both(interior, M.stitch, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), pts.length, ST, 6), nl);
    }
    // surpiqûre le long du sommet du dossier roulé (hors des biseaux d'extrémité)
    { // (suit les côtes du capitonnage)
      const pts = []; for (let d = 0.02; d <= len - 0.15 + 1e-6; d += 0.01) pts.push(v(xa + 0.05 + d, IF + 0.5995 + rollDisp(0.1, 0.6, d), zBack - 0.1));
      both(interior, M.stitch, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), pts.length, ST, 6), nl);
    }
    // accoudoir avant droit : bloc cuir plein, dessus plat (IF+0.55), surpiqûres sur les arêtes hautes
    {
      const ax0 = xb - 0.06, ax1 = xb + 0.2, ay1 = IF + 0.55, az0 = zBack - 1.06, az1 = zBack - 0.02;
      const acx = (ax0 + ax1) / 2, acz = (az0 + az1) / 2;
      both(interior, M.upholsteryInterior, rbox(ax1 - ax0, ay1 - IF - 0.1, az1 - az0, 0.06, acx, (IF + 0.1 + ay1) / 2, acz));
      // cadre de surpiqûres sur le plat du dessus (le congé de 6 cm commence à 6 cm du bord : on reste à 7 cm)
      const sy = ay1 + 0.0005, si = 0.07;
      const sq = [v(ax0 + si, sy, az0 + si), v(ax1 - si, sy, az0 + si), v(ax1 - si, sy, az1 - si), v(ax0 + si, sy, az1 - si)];
      for (let k = 0; k < 4; k++) both(interior, M.stitch, cylBetween(sq[k], sq[(k + 1) % 4], ST, ST, 6), nl);
    }
    // extrémité arrière : pod accoudoir en noyer massif, chant arrondi cerclé d'inox
    // bloc posé sur le socle (comme le canapé et l'accoudoir avant), plan à angles arrondis R 0,14 côté allée,
    // angles vifs côté canapé (il s'y adosse, 1 cm noyé dans le biseau) ; jonc inox encastré qui suit le galbe
    const PX0 = xa - 0.45, PX1 = xa + 0.01, PZ0 = zBack - 1.08, PZ1 = zBack - 0.02;
    {
      const PY0 = IF + 0.1, PY1 = IF + 0.55, bev = 0.012, R = 0.14;
      // contour en plan (s = x, t = z), décalé de d (d > 0 : vers l'extérieur)
      const plan = (d) => {
        const s = new THREE.Shape(), x0 = PX0 - d, x1 = PX1 + d, z0 = PZ0 - d, z1 = PZ1 + d, r = R + d;
        s.moveTo(x0 + r, z0); s.lineTo(x1, z0); s.lineTo(x1, z1); s.lineTo(x0 + r, z1);
        s.absarc(x0 + r, z1 - r, r, Math.PI / 2, Math.PI, false); s.lineTo(x0, z0 + r);
        s.absarc(x0 + r, z0 + r, r, Math.PI, 1.5 * Math.PI, false);
        return s;
      };
      const up = (y) => basis(v(1, 0, 0), v(0, 0, 1), v(0, -1, 0), v(0, y, 0)); // shape (x,z), extrusion vers le bas
      const blk = new THREE.ExtrudeGeometry(plan(-bev), { depth: PY1 - PY0 - 2 * bev, bevelEnabled: true, bevelSize: bev, bevelThickness: bev, bevelSegments: 3, curveSegments: 20 });
      both(interior, M.woodInterior, xf(blk, up(PY1 - bev)));
      // jonc inox de 12 mm, 4 cm sous le dessus, saillie 2 mm
      const ring = plan(0.002); ring.holes.push(plan(-0.01));
      both(interior, M.chrome, xf(new THREE.ExtrudeGeometry(ring, { depth: 0.012, bevelEnabled: false, curveSegments: 20 }), up(PY1 - 0.04)), nl);
    }
    // socle en retrait + ruban LED chaud au ras du sol + lueur projetée + ombre de contact
    // (le socle court aussi sous le pod arrière : plus rien ne flotte au-dessus du sol)
    both(interior, M.metalDark, boxB(PX0 + 0.04, xb + 0.2, IF, IF + 0.1, zBack - 0.95, zBack - 0.02));
    both(interior, M.ledStrip, boxB(PX0 + 0.04, xb + 0.2, IF + 0.004, IF + 0.016, zBack - 0.98, zBack - 0.955), nl);
    for (const s of [1, -1]) {
      const za = zBack - 1.08, zb = zBack;
      aoDecal(interior, PX0, xb + 0.2, s > 0 ? za : -zb, s > 0 ? zb : -za, 0.12, IF + 0.003, 0.7);
      // pénombre large (lumière du jour diffuse, sans ombres portées des RectAreaLight) : le canapé « pèse » sur le sol
      aoDecal(interior, PX0 + 0.1, xb + 0.1, s > 0 ? za + 0.1 : -zb, s > 0 ? zb : -za - 0.1, 0.45, IF + 0.0025, 0.42);
      floorGlow(interior, 'x', PX0 + 0.04, xb + 0.2, s * (zBack - 0.96), -s, 0.35, IF + 0.002);
    }
    // habillage textile : coussins garnis plume (tribord, contre l'accoudoir avant ; bâbord, contre le pod arrière)
    // + plaid en laine chevron plié sur l'assise bâbord, retombant sur le nez du coussin
    {
      const seatY = IF + 0.42;
      // side +1 = tribord (dossier à +z, la pièce vers -z) ; -1 = bâbord
      const putPillow = (mat, W, H, T, x, d, side, tilt, yaw, roll, seed) => {
        // dispersion « posé à la main » : ±3 % de taille, ±3° de lacet / roulis, garnissage plus ou moins tassé
        const jr = rnd(seed * 97 + 5); jr(); W *= 0.97 + 0.06 * jr(); H *= 0.97 + 0.06 * jr(); T *= 0.92 + 0.14 * jr();
        yaw += (jr() - 0.5) * 0.1; roll += (jr() - 0.5) * 0.1; tilt += (jr() - 0.5) * 0.08;
        const { body, pipe } = pillowGeometry(W, H, T, seed);
        // posé sur le dessus réel du coussin (bombé / creux du tour 3) + marge du roulis : plus d'interpénétration (test de rayons)
        const sc = seatCush.find((q) => Math.abs(x - q.cx) <= half / 2 + 0.01) || seatCush[0];
        // (point haut de l'empreinte : le bombé remonte vers le nez, le bord avant du coussin incliné s'y enfonçait)
        let hMax = -1;
        for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++)
          hMax = Math.max(hMax, sc.top(x - sc.cx + (i / 4 - 0.5) * W * 0.9, (zBack - d) - sc.cz - T * 0.75 + j / 4 * T));
        const yTop = hMax + 0.5 * W * Math.abs(Math.sin(roll)) + 0.002;
        const m = new THREE.Matrix4().makeTranslation(x, seatY + yTop + H / 2 * Math.cos(tilt), side * (zBack - d))
          .multiply(new THREE.Matrix4().makeRotationY(side > 0 ? Math.PI + yaw : yaw))
          .multiply(new THREE.Matrix4().makeRotationZ(roll))
          .multiply(new THREE.Matrix4().makeRotationX(-tilt));
        B.add(interior, mat, xf(body, m));
        B.add(interior, mat, xf(pipe, m));
      };
      putPillow(M.cushionDeco, 0.48, 0.46, 0.16, xb - 0.36, 0.27, 1, 0.36, 0.06, 0.03, 1);
      putPillow(M.cushionLinen, 0.42, 0.40, 0.14, xb - 0.84, 0.31, 1, 0.3, -0.12, -0.1, 2); // calé derrière le premier, sans s'y enfoncer
      putPillow(M.cushionDeco, 0.48, 0.46, 0.16, xa + 0.32, 0.27, -1, 0.36, -0.08, -0.04, 3);
      // plaid bâbord : local z vers la pièce (+z monde), x le long du canapé
      const th = throwGeometry(0.62, 0.42, 1.047, 0.05, 0.2, 5); // nez à 1,047 : couvre le gonflé de 11 mm du coussin (test de rayons)
      const mT = new THREE.Matrix4().makeTranslation(xa + 1.15, seatY, -zBack);
      { // le plaid épouse le bombé / le creux du coussin (repère du coussin : x - cx, z = profondeur 0,64 - distance au dossier)
        const sc = seatCush[0], p = th.body.attributes.position;
        for (let i = 0; i < p.count; i++) {
          const y = p.getY(i), w = Math.max(0, Math.min(1, 1 + y / 0.03));
          p.setY(i, y + w * sc.top(xa + 1.15 + p.getX(i) - sc.cx, zBack - sc.cz - p.getZ(i)));
        }
        th.body.computeVertexNormals();
      }
      B.add(interior, M.plaid, xf(th.body, mT));
      for (const [a, b] of th.fringes) B.add(interior, M.plaid, cylBetween(a.applyMatrix4(mT), b.applyMatrix4(mT), 0.0022, 0.0014, 4), nl);
    }
  }

  // =========================================================================
  // TABLE BASSE : socle laqué épousant le plateau, cadre noyer, insert pierre ; maquette + livre
  // =========================================================================
  const tx = -4.7, tTop = IF + 0.42, sTop = tTop - 0.02; // sTop : dessus de l'insert pierre
  let modelMatrix = null;
  {
    const rr = (w, h, r) => {
      const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
      s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
      s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
      return s;
    };
    const flat = (y) => basis(v(1, 0, 0), v(0, 0, 1), v(0, 1, 0), v(tx, y, 0));
    const PL = 3.0, PW = 1.9, PR = 0.3, EDGE = 0.18;
    // socle laqué : même plan que le plateau, en retrait de 4 cm ; niche ouverte côté arrière
    {
      const L = PL - 0.08, W = PW - 0.08, r = PR - 0.04, bev = 0.012, nd = 0.55;
      const top = tTop - 0.086, yb = IF, bh = top - yb;
      const slab = (y0, h) => B.add(interior, M.lacquer, xf(new THREE.ExtrudeGeometry(rr(L - 2 * bev, W - 2 * bev, r - bev), { depth: h - 2 * bev, bevelEnabled: true, bevelSize: bev, bevelThickness: bev, bevelSegments: 3, curveSegments: 12 }), flat(y0 + bev)));
      slab(yb, 0.06); slab(top - 0.07, 0.07);
      // couche intermédiaire échancrée par la niche
      const x0 = -L / 2, zN = W / 2 - r;
      const mid = new THREE.Shape();
      mid.moveTo(x0 + r, -W / 2); mid.lineTo(L / 2 - r, -W / 2); mid.quadraticCurveTo(L / 2, -W / 2, L / 2, -W / 2 + r);
      mid.lineTo(L / 2, W / 2 - r); mid.quadraticCurveTo(L / 2, W / 2, L / 2 - r, W / 2);
      mid.lineTo(x0 + r, W / 2); mid.quadraticCurveTo(x0, W / 2, x0, zN);
      mid.lineTo(x0 + nd, zN); mid.lineTo(x0 + nd, -zN); mid.lineTo(x0, -zN);
      mid.quadraticCurveTo(x0, -W / 2, x0 + r, -W / 2);
      B.add(interior, M.lacquer, xf(new THREE.ExtrudeGeometry(mid, { depth: bh - 0.13, bevelEnabled: false, curveSegments: 12 }), flat(yb + 0.06)));
      const xa0 = tx + x0, y0 = yb + 0.06, y1 = top - 0.07;
      // fond et sol de niche bleu nuit, séparation laquée
      B.add(interior, M.dashNavy, boxB(xa0 + nd - 0.012, xa0 + nd + 0.001, y0, y1, -zN, zN), { cast: false });
      B.add(interior, M.dashNavy, boxB(xa0 + 0.01, xa0 + nd, y0, y0 + 0.003, -zN, zN), { cast: false });
      B.add(interior, M.lacquer, boxB(xa0 + 0.01, xa0 + nd, y0, y1, -0.02, 0.02));
      // livres rangés
      B.add(interior, M.bookA, boxB(xa0 + 0.08, xa0 + 0.42, y0 + 0.003, y0 + 0.043, 0.1, 0.5));
      B.add(interior, M.lacquer, boxB(xa0 + 0.1, xa0 + 0.4, y0 + 0.043, y0 + 0.068, 0.12, 0.48));
      B.add(interior, M.upholsteryInterior, boxB(xa0 + 0.08, xa0 + 0.44, y0 + 0.003, y0 + 0.073, -0.5, -0.12));
      B.add(interior, M.woodInterior, boxB(xa0 + 0.09, xa0 + 0.43, y0 + 0.073, y0 + 0.083, -0.49, -0.13)); // couvercle noyer du coffret cuir
      aoDecal(interior, tx - L / 2, tx + L / 2, -W / 2, W / 2, 0.1, IF + 0.003, 0.65);
      aoDecal(interior, tx - L / 2 + 0.15, tx + L / 2 - 0.15, -W / 2 + 0.15, W / 2 - 0.15, 0.5, IF + 0.0025, 0.4);
    }
    const frame = rr(PL, PW, PR); frame.holes.push(rr(PL - 2 * EDGE, PW - 2 * EDGE, 0.14));
    B.add(interior, M.woodInterior, xf(new THREE.ExtrudeGeometry(frame, { depth: 0.05, bevelEnabled: true, bevelSize: 0.018, bevelThickness: 0.018, bevelSegments: 2, curveSegments: 10 }), flat(tTop - 0.068)));
    B.add(interior, M.stone, xf(new THREE.ExtrudeGeometry(rr(PL - 2 * EDGE, PW - 2 * EDGE, 0.14), { depth: 0.05, bevelEnabled: false, curveSegments: 10 }), flat(sTop - 0.05)));
    // livre (couverture photo) posé sur la pierre
    const book = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.045, 0.34), [M.lacquer, M.lacquer, phys({ map: makeBookTexture(), roughness: 0.65, envMapIntensity: 0.4 }), M.lacquer, M.lacquer, M.lacquer]);
    book.position.set(tx - 0.75, sTop + 0.0225, -0.35); book.rotation.y = 0.06;
    book.castShadow = true; book.receiveShadow = true; interior.add(book);
    // maquette du DIÈDRE 29 sur deux cales en bois posées sur la pierre
    const sc = 1 / 17;
    const lift = 0.03, keelMin = -1.181; // la quille la plus basse flotte à 3 cm de la pierre
    const toModel = new THREE.Matrix4().makeTranslation(tx + 0.2, sTop + lift - keelMin * sc, 0.12)
      .multiply(new THREE.Matrix4().makeRotationY(0.55)).multiply(new THREE.Matrix4().makeScale(sc, sc, sc));
    // la miniature elle-même est un clone du vrai bateau (voir boat.js, modelMatrix)
    modelMatrix = toModel;
    // cales : hauteur calculée pour toucher la quille à leur position
    for (const x of [-6, 5]) {
      const p = new THREE.Vector3(x, 0, 0).applyMatrix4(toModel);
      const h = lift + (section(x).keel - keelMin) * sc + 0.004;
      B.add(interior, M.woodInterior, boxG(0.07, h, 0.26, p.x, sTop + h / 2, p.z, 0, 0.55, 0));
    }
  }

  // =========================================================================
  // PILOTAGE : planche de bord pleine largeur sous le pare-brise, estrade, 2 sièges
  // =========================================================================
  {
    const XF = 0.6;              // face arrière de la planche
    const XE = -0.9;             // nez de l'estrade
    const YE = IF + 0.12;        // dessus de l'estrade
    const YT = YL - 0.01;        // dessus de la planche
    const navy = M.dashNavy, piano = M.pianoBlack;
    const flatAt = (y) => basis(v(1, 0, 0), v(0, 0, 1), v(0, 1, 0), v(0, y, 0));
    // plan de la planche (moitié tribord, symétrisée) : face droite, retours vers les crédences, suit le vitrage
    const n = L2.length;
    const front = L2.slice(n - 3).map(([x, z]) => [x - 0.07, z - 0.07]); // 55°, 22° (+ dernier)
    const halfPl = [[XF, 0], [XF, 2.45], [-0.62, 2.88], [-0.62, 3.3], ...front.filter(([x]) => x > -0.5).map(([x, z]) => [x, z]), ];
    const lastF = halfPl[halfPl.length - 1];
    const pl = [...halfPl, [lastF[0], 0]];
    const full = [...pl.slice(0, -1), ...pl.slice(1, -1).reverse().map(([x, z]) => [x, -z])];
    const shape = new THREE.Shape(full.map(([x, z]) => new THREE.Vector2(x, z)));
    const dashG = new THREE.ExtrudeGeometry(shape, { depth: YT - 0.05 - IF, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 3, curveSegments: 4 });
    B.add(interior, navy, xf(dashG, flatAt(IF + 0.02)));
    // joints fins des panneaux (face arrière + retours)
    for (let z = -2.4; z <= 2.41; z += 0.6) B.add(interior, M.metalDark, boxB(XF - 0.025, XF - 0.015, IF + 0.06, YT - 0.1, z - 0.003, z + 0.003), nl);
    B.add(interior, M.metalDark, boxB(XF - 0.025, XF - 0.015, IF + 0.42, IF + 0.426, -2.45, 2.45), nl);
    // liseré noyer horizontal sur le dessus + plateau
    B.add(interior, M.woodInterior, rbox(0.12, 0.05, 4.95, 0.015, XF + 0.04, YT - 0.06, 0));
    for (const s of [1, -1]) B.add(interior, M.woodInterior, xf(new THREE.BoxGeometry(1.34, 0.05, 0.1), new THREE.Matrix4().compose(v(-0.01, YT - 0.06, 2.67 * s), new THREE.Quaternion().setFromAxisAngle(v(0, 1, 0), 0.34 * s), v(1, 1, 1))));
    B.add(interior, navy, xf(new THREE.ShapeGeometry(shape), flatAt(YT - 0.03)), { cast: false });
    // éléments hauts du poste (bandeau, écrans, volant, sièges) : masqués quand la caméra
    // se tient devant eux, dans la timonerie (vue 'salon' tournée vers l'arrière)
    const helmG = new THREE.Group(); helmG.name = 'helmFront'; interior.add(helmG);
    {
      const probe = new THREE.Mesh(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0], 3)),
        new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, depthTest: false }));
      probe.frustumCulled = false; probe.renderOrder = -1000; probe.name = 'helmProbe';
      const wp = new THREE.Vector3();
      probe.onBeforeRender = (r, sc, cam) => {
        cam.getWorldPosition(wp);
        if (!cam.isPerspectiveCamera || wp.y < 0.5) return; // caméras miroir / orthographiques : ne décident pas
        interior.worldToLocal(wp);
        helmG.visible = !(wp.x > 0.35 && Math.abs(wp.z) < 3.2 && wp.y > IF && wp.y < YC);
      };
      interior.add(probe);
    }
    // bandeau noir brillant incliné : 3 grands écrans (≈1,3 m, 3.5:1) séparés par de fins montants
    const SW = 1.3, SH = SW / 3.5, GAP = 0.045;
    const scrZ = [-1.67, -1.67 + SW + GAP, -1.67 + 2 * (SW + GAP)];
    const tilt = -0.3, bz0 = scrZ[0] - SW / 2 - 0.05, bz1 = scrZ[2] + SW / 2 + 0.05, bh = SH + 0.1;
    const bc = v(XF + 0.2, YT - 0.03 + bh / 2 * Math.cos(tilt), (bz0 + bz1) / 2);
    bc.x += -Math.sin(tilt) * bh / 2;
    B.add(helmG, piano, rbox(0.06, bh, bz1 - bz0, 0.022, bc.x, bc.y, bc.z, 0, 0, tilt));
    const nrm = new THREE.Vector3(-1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 0, 1), tilt);
    const scrMats = [M.screens, M.screenRadar, M.screenSystems];
    scrZ.forEach((zc, i) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(SW, SH), scrMats[i]);
      m.position.set(bc.x, bc.y, zc).addScaledVector(nrm, 0.031);
      m.lookAt(m.position.clone().add(nrm));
      m.name = 'helmScreen';
      helmG.add(m);
    });
    // fins montants noirs entre les écrans
    for (const zm of [scrZ[0] + (SW + GAP) / 2, scrZ[1] + (SW + GAP) / 2]) {
      const p = bc.clone().setZ(zm).addScaledVector(nrm, 0.034);
      B.add(helmG, M.metalDark, rbox(0.01, SH + 0.02, 0.018, 0.004, p.x, p.y, p.z, 0, 0, tilt), nl);
    }
    // matériaux du poste : métal satiné (lunette, branches, quadrant), cuir noir de jante, rétroéclairage des touches
    const satin = M.helmSatin = phys({ color: 0x9a9da2, metalness: 1, roughness: 0.3, envMapIntensity: 1.1 });
    M.wheelLeather = phys({ color: 0x141518, roughness: 0.6, normalMap: leather.normal, normalScale: new THREE.Vector2(0.6, 0.6),
      roughnessMap: leather.rough, sheen: 0.25, sheenColor: 0x50535c, sheenRoughness: 0.5, specularIntensity: 0.6 });
    const swLed = M.switchLed = new THREE.MeshBasicMaterial({ color: 0x9ccfff });
    const rrShape = (w, h, r) => { const s = new THREE.Shape(), x0 = -w / 2, y0 = -h / 2;
      s.moveTo(x0 + r, y0); s.lineTo(x0 + w - r, y0); s.quadraticCurveTo(x0 + w, y0, x0 + w, y0 + r); s.lineTo(x0 + w, y0 + h - r);
      s.quadraticCurveTo(x0 + w, y0 + h, x0 + w - r, y0 + h); s.lineTo(x0 + r, y0 + h); s.quadraticCurveTo(x0, y0 + h, x0, y0 + h - r);
      s.lineTo(x0, y0 + r); s.quadraticCurveTo(x0, y0, x0 + r, y0); return s; };
    // lunette : cadre en métal satiné qui ceinture le bandeau d'écrans (lèvre de 9 mm, arêtes chanfreinées)
    {
      const W = bz1 - bz0, o = 0.007, ring = rrShape(W + 2 * o, bh + 2 * o, 0.022 + o);
      ring.holes.push(rrShape(W - 0.004, bh - 0.004, 0.022));
      const g = new THREE.ExtrudeGeometry(ring, { depth: 0.06, bevelEnabled: true, bevelSize: 0.0025, bevelThickness: 0.0025, bevelSegments: 2, curveSegments: 6 });
      g.translate(0, 0, -0.03);
      const up = v(-Math.sin(tilt), Math.cos(tilt), 0), th = v(Math.cos(tilt), Math.sin(tilt), 0);
      B.add(helmG, satin, xf(g, basis(v(0, 0, -1), up, th, bc)), nl);
    }

    // bourrelet de planche (crash pad) en cuir surpiqué : profil roulé balayé le long de la face arrière,
    // léger cintrage (1,6 cm au centre), embouts arrondis rentrant dans la planche ; liseré noyer visible dessous
    {
      const prof0 = [[0.175, -0.006], [0.12, 0.006], [0.06, 0.0135], [0.022, 0.013], [-0.003, 0.0], [-0.014, -0.022],
        [-0.012, -0.047], [-0.002, -0.062], [0.004, -0.068], [0.03, -0.072]];
      const prof = new THREE.CatmullRomCurve3(prof0.map(([a, b]) => v(a, b, 0)), false, 'centripetal').getPoints(27);
      const NP = prof.length, ZL = 2.38, NZ = 120, X0 = XF - 0.02, Y0 = YT - 0.01, C = [0.06, -0.02];
      const bow = (z) => 0.016 * (1 - (z / ZL) ** 2);
      const endK = (z) => { const e = Math.abs(z) - (ZL - 0.05); return e <= 0 ? 1 : Math.sqrt(Math.max(0, 1 - (e / 0.05) ** 2)); };
      const P = (q, z) => { const k = endK(z); return v(X0 - bow(z) + C[0] + (q.x - C[0]) * k, Y0 + C[1] + (q.y - C[1]) * k, z); };
      const pos = [], uv = [], idx = [], arc = [0];
      for (let t = 1; t < NP; t++) arc.push(arc[t - 1] + prof[t].distanceTo(prof[t - 1]));
      for (let j = 0; j <= NZ; j++) {
        const z = -ZL + 2 * ZL * j / NZ;
        for (let t = 0; t < NP; t++) { const p = P(prof[t], z); pos.push(p.x, p.y, p.z); uv.push(z / 0.35, arc[t] / 0.35); }
      }
      for (let j = 0; j < NZ; j++) for (let t = 0; t < NP - 1; t++) {
        const a = j * NP + t, b = a + NP;
        idx.push(a, a + 1, b, a + 1, b + 1, b);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx); g.computeVertexNormals();
      // UV développées le long du rouleau (la projection monde du lot, qui bascule d'axe selon la normale, striait
      // le cuir tous les 4 cm sur l'arrondi) : clone du cuir intérieur, teinte resynchronisée sur l'option à chaque rendu
      // (plis de flexion réduits : sur ce rouleau tendu, le crease 0,22 des sièges se lisait en côtes régulières)
      const padMat = U.clone(); softGoodsShader(padMat, { tone: 0.04, toneScale: 2.2, rough: 0.22, crease: 0.06 });
      const pm = new THREE.Mesh(g, padMat); pm.name = 'dashPad'; pm.castShadow = pm.receiveShadow = true;
      pm.onBeforeRender = () => { padMat.color.copy(U.color); padMat.sheenColor.copy(U.sheenColor); };
      interior.add(pm);
      // 2 surpiqûres : sur le dessus (≈6 cm de l'arête) et sur la joue arrière du bourrelet
      for (const t of [Math.round(NP * 0.21), Math.round(NP * 0.6)]) {
        const T = prof[t + 1].clone().sub(prof[t - 1]).normalize(), n = v(T.y, -T.x, 0);
        const q = prof[t].clone().addScaledVector(n, 0.0012), pts = [];
        for (let j = 0; j <= 90; j++) pts.push(P(q, -ZL + 0.07 + (2 * ZL - 0.14) * j / 90));
        B.add(interior, M.stitch, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 180, ST, 5, false), nl);
      }
      // casquette anti-reflet au-dessus des écrans : même cuir, porte-à-faux de 20 cm vers le pilote, bord roulé tombant surpiqué,
      // embouts arrondis ; posée sur l'arête haute du bandeau
      {
        const up = v(-Math.sin(tilt), Math.cos(tilt), 0), E = bc.clone().addScaledVector(up, bh / 2);
        const hp0 = [[0.05, -0.006], [0.03, 0.028], [-0.05, 0.042], [-0.14, 0.034], [-0.19, 0.018], [-0.205, -0.006],
          [-0.198, -0.028], [-0.185, -0.032], [-0.1, -0.008], [0.0, -0.004], [0.04, -0.014]];
        const hp = new THREE.CatmullRomCurve3(hp0.map(([a, b]) => v(a, b, 0)), true, 'centripetal').getPoints(30);
        const NH = hp.length, Z0 = bz0 - 0.02, Z1 = bz1 + 0.02, NZh = 80, Ch = [-0.07, 0.01];
        const endH = (z) => { const e = Math.max(Z0 + 0.04 - z, z - (Z1 - 0.04)); return e <= 0 ? 1 : Math.sqrt(Math.max(0, 1 - (e / 0.04) ** 2)); };
        const PH = (q, z) => { const k = endH(z); return v(E.x + Ch[0] + (q.x - Ch[0]) * k, E.y + Ch[1] + (q.y - Ch[1]) * k, z); };
        const hpos = [], huv = [], hidx = [], harc = [0];
        for (let t = 1; t < NH; t++) harc.push(harc[t - 1] + hp[t].distanceTo(hp[t - 1]));
        for (let j = 0; j <= NZh; j++) {
          const z = Z0 + (Z1 - Z0) * j / NZh;
          for (let t = 0; t < NH; t++) { const p = PH(hp[t], z); hpos.push(p.x, p.y, p.z); huv.push(z / 0.35, harc[t] / 0.35); }
        }
        for (let j = 0; j < NZh; j++) for (let t = 0; t < NH - 1; t++) { const a = j * NH + t, b = a + NH; hidx.push(a, a + 1, b, a + 1, b + 1, b); }
        const hg = new THREE.BufferGeometry();
        hg.setAttribute('position', new THREE.Float32BufferAttribute(hpos, 3)); hg.setAttribute('uv', new THREE.Float32BufferAttribute(huv, 2));
        hg.setIndex(hidx); hg.computeVertexNormals();
        const hm = new THREE.Mesh(hg, padMat); hm.name = 'screenHood'; hm.castShadow = hm.receiveShadow = true;
        hm.onBeforeRender = pm.onBeforeRender; helmG.add(hm);
        const q = hp[Math.round(NH * 0.32)], pts = [];
        for (let j = 0; j <= 60; j++) pts.push(PH(q, Z0 + 0.06 + (Z1 - Z0 - 0.12) * j / 60).add(v(0, 0.0012, 0)));
        B.add(helmG, M.stitch, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 120, ST, 5, false), nl);
      }
    }

    // pupitre de pilotage (cuir, arêtes biseautées) : face inclinée vers le pilote d'où sort la colonne de barre,
    // 2 panneaux de touches rétroéclairées de part et d'autre de la colonne, surpiqûres
    const PZ0 = 1.79, PZ1 = 2.37, PB = 0.014;
    const fA = v(0.64, YT - 0.02, 0), fB = v(0.75, YT + 0.2, 0);
    const fd = fB.clone().sub(fA).normalize(), fn = v(-fd.y, fd.x, 0); // fd : le long de la face (montant), fn : vers le pilote
    const F0 = fA.clone().addScaledVector(fn, PB);
    {
      const s = new THREE.Shape([new THREE.Vector2(0.64, -0.02), new THREE.Vector2(0.75, 0.2), new THREE.Vector2(0.99, 0.215), new THREE.Vector2(0.99, -0.02)]);
      const g = new THREE.ExtrudeGeometry(s, { depth: PZ1 - PZ0 - 2 * PB, bevelEnabled: true, bevelSize: PB, bevelThickness: PB, bevelSegments: 4, curveSegments: 1 });
      g.translate(0, YT, PZ0 + PB);
      B.add(helmG, M.upholsteryInterior, toCreasedNormals(g, 0.5));
      const faceAt = (s0, z, h) => F0.clone().addScaledVector(fd, s0).addScaledVector(fn, h).setZ(z);
      const L = fA.distanceTo(fB);
      // surpiqûres : sous l'arête haute de la face, et sur le dessus
      const st1 = [], st2 = [];
      const tn = v(-0.015 / 0.24, 1, 0).normalize();
      for (let j = 0; j <= 20; j++) {
        const z = PZ0 + 0.018 + (PZ1 - PZ0 - 0.036) * j / 20;
        st1.push(faceAt(L - 0.035, z, 0.0012));
        st2.push(v(0.785, YT + 0.2 + 0.035 * 0.015 / 0.24, z).addScaledVector(tn, PB + 0.0012));
      }
      for (const pts of [st1, st2]) B.add(helmG, M.stitch, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, ST, 5, false), nl);
      // panneaux de touches : plaque noir laqué, 2×3 touches (capuchon métal sombre + témoin bleu glacier)
      const rotF = -Math.atan2(fd.x, fd.y); // fait pivoter l'axe y local sur fd
      for (const zc of [PZ0 + 0.052, PZ1 - 0.052]) {
        const c = faceAt(0.125, zc, 0.003);
        B.add(helmG, piano, rbox(0.006, 0.14, 0.074, 0.003, c.x, c.y, c.z, 0, 0, rotF), nl);
        for (const ds of [-0.042, 0, 0.042]) for (const dz of [-0.018, 0.018]) {
          const b = faceAt(0.125 + ds, zc + dz, 0.008);
          B.add(helmG, M.metalDark, rbox(0.008, 0.026, 0.026, 0.004, b.x, b.y, b.z, 0, 0, rotF), nl);
          const l = faceAt(0.125 + ds + 0.008, zc + dz, 0.0125);
          B.add(helmG, swLed, place(new THREE.BoxGeometry(0.0015, 0.003, 0.012), l.x, l.y, l.z, 0, 0, rotF), nl);
        }
      }
    }

    // volant : jante gainée de cuir noir (section ovale, double surpiqûre intérieure), 3 branches en métal satiné
    // effilées et embouties (moyeu en retrait de 3,5 cm), moyeu tourné + médaillon laqué ; colonne axiale
    const wheelC = v(0.6, YT + 0.26, 2.08), R = 0.2;
    const wheel = new THREE.Group(); wheel.position.copy(wheelC);
    {
      const rimG = new THREE.TorusGeometry(R, 0.0165, 16, 128); rimG.scale(1, 1, 1.18);
      const uva = rimG.attributes.uv; for (let i = 0; i < uva.count; i++) uva.setXY(i, uva.getX(i) * 3.6, uva.getY(i) * 0.31); // même densité de grain que le cuir des sièges (tuile 35 cm)
      wheel.add(new THREE.Mesh(rimG, M.wheelLeather));
      for (const s of [1, -1]) { const t = new THREE.Mesh(new THREE.TorusGeometry(R - 0.0134, 0.0011, 4, 128), M.stitch); t.position.z = s * 0.0129; wheel.add(t); }
      const sp = new THREE.Shape(); sp.moveTo(0.035, -0.017); sp.lineTo(0.15, -0.011); sp.quadraticCurveTo(0.175, -0.011, 0.192, -0.017);
      sp.lineTo(0.192, 0.017); sp.quadraticCurveTo(0.175, 0.011, 0.15, 0.011); sp.lineTo(0.035, 0.017); sp.closePath();
      const spG = new THREE.ExtrudeGeometry(sp, { depth: 0.006, bevelEnabled: true, bevelSize: 0.003, bevelThickness: 0.003, bevelSegments: 2, curveSegments: 6 });
      spG.translate(0, 0, -0.003);
      { const p = spG.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) - 0.035 * Math.max(0, 0.19 - p.getX(i)) / 0.155); }
      spG.computeVertexNormals();
      for (const a of [0, Math.PI, -Math.PI / 2]) { const m = new THREE.Mesh(spG, satin); m.rotation.z = a; wheel.add(m); }
      const hubP = [[0, -0.068], [0.05, -0.068], [0.058, -0.06], [0.058, -0.046], [0.052, -0.038], [0.034, -0.032], [0, -0.032]].map(([r, y]) => new THREE.Vector2(r, y));
      const hubG = new THREE.LatheGeometry(hubP, 40); hubG.rotateX(Math.PI / 2);
      wheel.add(new THREE.Mesh(hubG, satin));
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.004, 32), piano); cap.rotation.x = Math.PI / 2; cap.position.z = -0.031;
      wheel.add(cap);
    }
    wheel.rotation.y = -Math.PI / 2; wheel.rotateX(-0.3); // haut de jante incliné vers l'avant, face tournée vers le pilote
    wheel.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    helmG.add(wheel);
    {
      // colonne : de l'arrière du moyeu, le long de l'axe, jusqu'à la face du pupitre (+ soufflet de cuir)
      const ax = v(0, 0, -1).applyQuaternion(wheel.quaternion); // axe vers l'avant (opposé au pilote)
      const h0 = wheelC.clone().addScaledVector(ax, 0.066);
      const t = F0.clone().setZ(wheelC.z).sub(h0).dot(fn) / ax.dot(fn);
      const h1 = h0.clone().addScaledVector(ax, t + 0.01);
      B.add(helmG, M.metalDark, cylBetween(h0, h1, 0.024, 0.026, 20));
      B.add(helmG, M.wheelLeather, cylBetween(h1.clone().addScaledVector(ax, -0.045), h1, 0.032, 0.055, 24));
    }

    // commandes moteur : socle laqué, flasques de quadrant en métal satiné, 2 leviers inclinés vers le pilote
    {
      const zc = 2.54, xc = 0.76;
      B.add(helmG, piano, rbox(0.24, 0.07, 0.2, 0.02, xc, YT + 0.02, zc));
      const qs = new THREE.Shape(); qs.absarc(0, 0, 0.068, 0, Math.PI, false); qs.closePath();
      const qg = new THREE.ExtrudeGeometry(qs, { depth: 0.006, bevelEnabled: true, bevelSize: 0.002, bevelThickness: 0.002, bevelSegments: 2, curveSegments: 16 });
      for (const z of [zc - 0.085, zc + 0.079]) B.add(helmG, satin, xf(qg.clone(), new THREE.Matrix4().makeTranslation(xc, YT + 0.05, z)));
      B.add(helmG, M.slotBlack, rbox(0.15, 0.004, 0.13, 0.002, xc, YT + 0.056, zc), nl);
      const dir = v(-0.36, 0.933, 0);
      for (const [dz, k] of [[-0.033, 0.0], [0.033, 0.12]]) {
        const p0 = v(xc, YT + 0.05, zc + dz), d = dir.clone().applyAxisAngle(v(0, 0, 1), k), p1 = p0.clone().addScaledVector(d, 0.14);
        B.add(helmG, satin, cylBetween(p0, p1, 0.0075, 0.0065, 12));
        const hg = new THREE.CapsuleGeometry(0.014, 0.034, 6, 14); hg.rotateX(Math.PI / 2);
        B.add(helmG, M.wheelLeather, place(hg, p1.x, p1.y, p1.z));
      }
    }

    // panneau d'interrupteurs basculants (face arrière, devant le copilote) : 8 rockers + témoins
    // tour 3 : encadrement satiné saillant de 14 mm (le panneau se lit en creux), basculeurs plus épais
    const faceRing = (w, h, wi, hi, depth, z, y) => { // cadre en saillie sur la face arrière (x = XF − 0,02), vers le pilote
      const ring = rrShape(w, h, 0.01); ring.holes.push(rrShape(wi, hi, 0.006));
      const g = new THREE.ExtrudeGeometry(ring, { depth, bevelEnabled: true, bevelSize: 0.002, bevelThickness: 0.002, bevelSegments: 2, curveSegments: 4 });
      return xf(g, basis(v(0, 0, 1), v(0, 1, 0), v(-1, 0, 0), v(XF - 0.022, y, z)));
    };
    {
      const x = XF - 0.022, y = YT - 0.13;
      B.add(interior, piano, rbox(0.008, 0.06, 0.46, 0.004, x, y, 0.9), nl);
      B.add(interior, satin, faceRing(0.49, 0.085, 0.462, 0.062, 0.014, 0.9, y), nl);
      for (let i = 0; i < 8; i++) {
        const z = 0.9 - 0.175 + i * 0.05;
        B.add(interior, M.metalDark, rbox(0.018, 0.034, 0.022, 0.005, x - 0.009, y - 0.003, z, 0, 0, 0.14), nl);
        B.add(interior, swLed, place(new THREE.BoxGeometry(0.0015, 0.004, 0.008), x - 0.0125, y + 0.022, z), nl);
      }
    }
    // grilles de ventilation (désembuage / clim) en pied de planche : cadre satiné, fond noir, 6 lames inclinées
    for (const zc of [-0.3, -1.5]) {
      const y = IF + 0.24;
      B.add(interior, M.slotBlack, boxB(XF - 0.024, XF - 0.019, y - 0.045, y + 0.045, zc - 0.21, zc + 0.21), nl);
      B.add(interior, satin, faceRing(0.46, 0.11, 0.43, 0.09, 0.01, zc, y), nl);
      for (let i = 0; i < 6; i++) B.add(interior, M.metalDark, rbox(0.016, 0.004, 0.425, 0.0015, XF - 0.03, y - 0.036 + i * 0.0145, zc, 0, 0, -0.6), nl);
    }

    // estrade basse sur toute la largeur + ruban LED au nez de marche
    const zE = CR.zi - 0.001; // l'estrade vient buter contre la face des crédences (plus de fente de 4 cm)
    B.add(interior, M.interiorFloor, boxB(XE, XF + 0.02, IF, YE, -zE, zE));
    B.add(interior, M.metalDark, boxB(XE - 0.012, XE + 0.03, IF, YE + 0.002, -zE, zE), { cast: false });
    B.add(interior, M.ledStrip, boxB(XE - 0.016, XE - 0.008, IF + 0.012, IF + 0.026, -zE + 0.03, zE - 0.03), nl);
    floorGlow(interior, 'z', -zE + 0.05, zE - 0.05, XE - 0.016, -1, 0.35, IF + 0.002);
    // ombre de contact au pied de la planche de bord (sur l'estrade)
    aoDecal(interior, XF - 0.01, XF + 0.01, -2.45, 2.45, 0.08, YE + 0.0065, 0.5);

    // tour 4 — estrade : tapis tissé laine anthracite incrusté (4 mm), encadré d'un jonc satiné ; nez de marche coiffé satiné
    {
      // tissage natté (basket weave) procédural : 16 × 16 nattes de 2 cm par tuile de 32 cm, chaque natte = 4 brins ombrés
      const weave = (() => {
        const c = document.createElement('canvas'); c.width = c.height = 512; const g = c.getContext('2d'), N = 16, P = 512 / N, r = rnd(41);
        g.fillStyle = '#3a3a3a'; g.fillRect(0, 0, 512, 512);
        for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
          const hor = (i + j) % 2 === 0, base = 150 + r() * 40;
          for (let k = 0; k < 4; k++) {
            const o = k * P / 4, w = P / 4;
            const grd = hor ? g.createLinearGradient(0, j * P + o, 0, j * P + o + w) : g.createLinearGradient(i * P + o, 0, i * P + o + w, 0);
            const b = base + (r() - 0.5) * 30;
            grd.addColorStop(0, `rgb(${b * 0.45 | 0},${b * 0.45 | 0},${b * 0.45 | 0})`); grd.addColorStop(0.5, `rgb(${b | 0},${b | 0},${b | 0})`);
            grd.addColorStop(1, `rgb(${b * 0.45 | 0},${b * 0.45 | 0},${b * 0.45 | 0})`);
            g.fillStyle = grd;
            if (hor) g.fillRect(i * P + 1, j * P + o, P - 2, w); else g.fillRect(i * P + o, j * P + 1, w, P - 2);
          }
        }
        const t = tex(c, true, true); t.anisotropy = 8; return t;
      })();
      M.daisCarpet = phys({ color: 0x8a8378, map: weave, bumpMap: weave, bumpScale: 2.5, roughness: 0.95,
        sheen: 0.5, sheenColor: 0xa49c90, sheenRoughness: 0.8 });
      uvScale.set(M.daisCarpet, [0.32, 0.32]);
      const cx0 = XE + 0.07, cx1 = XF - 0.035, cz = zE - 0.07;
      B.add(interior, M.daisCarpet, boxB(cx0, cx1, YE - 0.002, YE + 0.004, -cz, cz), { cast: false });
      const T = 0.016; // jonc
      B.add(interior, satin, boxB(cx0 - T, cx0, YE - 0.002, YE + 0.005, -cz - T, cz + T), { cast: false });
      B.add(interior, satin, boxB(cx1, cx1 + T, YE - 0.002, YE + 0.005, -cz - T, cz + T), { cast: false });
      for (const s of [1, -1]) B.add(interior, satin, boxB(cx0, cx1, YE - 0.002, YE + 0.005, s > 0 ? cz : -cz - T, s > 0 ? cz + T : -cz), { cast: false });
      B.add(interior, satin, rbox(0.044, 0.006, 2 * zE, 0.002, XE + 0.009, YE + 0.003, 0), { cast: false });
    }
    // tour 4 — planche, face arrière : parement en suédine (type Alcantara) gris ardoise, un panneau par travée de 60 cm
    // (joints creux sur les montants existants), surpiqûre périphérique ; plinthe inox brossé en pied ; repose-pieds inox
    {
      M.alcantara = phys({ color: 0x2c2f36, map: fabB.map, normalMap: fabB.normal, normalScale: new THREE.Vector2(0.35, 0.35), roughness: 1,
        sheen: 1, sheenColor: 0x6d7282, sheenRoughness: 0.85 });
      uvScale.set(M.alcantara, [0.2, 0.2]);
      const xP = XF - 0.028, yB = IF + 0.44;
      for (let z0 = -2.4; z0 < 2.39; z0 += 0.6) {
        const za = z0 + 0.009, zb = z0 + 0.6 - 0.009, yT = (z0 > 0.5 && z0 < 0.7) ? YT - 0.19 : YT - 0.095; // travée du panneau d'interrupteurs
        const h = yT - yB, w = zb - za, zc = (za + zb) / 2, yc = (yB + yT) / 2;
        B.add(interior, M.alcantara, rbox(0.016, h, w, 0.007, xP, yc, zc));
        const r = 0.018, i = 0.02, hw = w / 2 - i, hh = h / 2 - i, pts = [];
        for (const [cy, cz2, a0] of [[hh - r, hw - r, 0], [hh - r, -hw + r, Math.PI / 2], [-hh + r, -hw + r, Math.PI], [-hh + r, hw - r, 1.5 * Math.PI]])
          for (let k = 0; k <= 4; k++) { const a = a0 + k * Math.PI / 8; pts.push(v(xP - 0.0085, yc + cy + Math.sin(a) * r, zc + cz2 + Math.cos(a) * r)); }
        B.add(interior, M.stitch, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 80, ST, 5, true), nl);
      }
      // plinthe inox brossé
      B.add(interior, satin, boxB(XF - 0.027, XF - 0.019, YE + 0.004, YE + 0.055, -2.42, 2.42), { cast: false });
      // repose-pieds tubulaire devant les 2 sièges, sur 3 consoles
      const yF = YE + 0.19, xF = XF - 0.11, z0 = 0.6, z1 = 2.4;
      B.add(interior, M.chrome, cylBetween(v(xF, yF, z0), v(xF, yF, z1), 0.013, 0.013, 16));
      for (const z of [z0, z1]) B.add(interior, M.chrome, place(new THREE.SphereGeometry(0.013, 12, 8), xF, yF, z));
      for (const z of [0.72, 1.55, 2.28]) {
        B.add(interior, M.chrome, cylBetween(v(xF, yF, z), v(XF - 0.02, yF, z), 0.008, 0.008, 10));
        B.add(interior, satin, place(new THREE.CylinderGeometry(0.022, 0.022, 0.006, 20), XF - 0.022, yF, z, 0, 0, Math.PI / 2), nl);
      }
    }

    // 2 sièges pilote : coque baquet en révolution partielle (~200°), dossier haut galbé
    // qui s'évase en ailes / accoudoirs, assise épaisse, surpiqûres ; fût chromé + repose-pieds
    const PSUB = 4, NPROF = 13 * PSUB + 1; // profil de coque : 13 points d'origine, ×4
    const shellGeo = (() => {
      // profil (rayon, hauteur) fermé : épaisseur de coque ~6 cm, bord supérieur arrondi
      const prof0 = [[0.215, 0.0], [0.255, 0.0], [0.285, 0.04], [0.3, 0.16], [0.305, 0.34], [0.295, 0.52], [0.27, 0.62],
        [0.235, 0.645], [0.21, 0.62], [0.215, 0.5], [0.22, 0.32], [0.215, 0.14], [0.205, 0.04]].map(([x, y]) => new THREE.Vector3(x, y, 0));
      // profil lissé (spline fermée, 4 segments par point d'origine : le point k d'origine devient l'indice 4k) :
      // plus de facettes visibles sur la silhouette du dossier
      const prof = new THREE.CatmullRomCurve3(prof0, true, 'centripetal').getPoints(PSUB * prof0.length).map((q) => new THREE.Vector2(q.x, q.y));
      const span = THREE.MathUtils.degToRad(206);
      const g = new THREE.LatheGeometry(prof, 48, 1.5 * Math.PI - span / 2, span);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        let ang = Math.atan2(x, z); if (ang < 0) ang += Math.PI * 2;
        const d = Math.min(1, Math.abs(ang - 1.5 * Math.PI) / (span / 2)); // 0 dos → 1 bout d'aile
        const k = THREE.MathUtils.smoothstep(d, 0.25, 0.85);
        // le dos reste haut, les ailes descendent à hauteur d'accoudoir et s'évasent
        const yy = y * (1 - 0.56 * k);
        const flare = 1 + 0.16 * k * (y / 0.645);
        p.setXYZ(i, x * flare * (1 + 0.12 * k), yy, z * flare);
      }
      g.computeVertexNormals();
      g.scale(0.92, 0.92, 0.92); // coque ×0.92
      return g;
    })();
    // embouts des ailes : capuchons arrondis
    const capG = new THREE.SphereGeometry(0.034 * 0.92, 16, 12);
    for (const z of [1.05, 2.08]) { // siège pilote dans l'axe du volant (z 2.08), copilote à bâbord de lui
      const x = 0.05, ys = YE + 0.43; // avancés : portée réaliste au volant
      aoDecal(helmG, x, x, z, z, 0.34, YE + 0.0065, 0.55); // (au-dessus du tapis d'estrade)
      aoDecal(helmG, x - 0.1, x + 0.1, z - 0.1, z + 0.1, 0.4, YE + 0.006, 0.35);
      // pied : base disque, fût fin, repose-pieds annulaire, platine
      B.add(helmG, M.chrome, place(new THREE.CylinderGeometry(0.2, 0.23, 0.03, 40), x, YE + 0.015, z));
      B.add(helmG, M.chrome, place(new THREE.CylinderGeometry(0.042, 0.042, ys - YE - 0.06, 28), x, (YE + ys - 0.06) / 2 + 0.015, z));
      B.add(helmG, M.chrome, place(new THREE.TorusGeometry(0.19, 0.011, 10, 48), x + 0.02, YE + 0.24, z, Math.PI / 2, 0, 0));
      // rayons : du fût jusqu'à l'axe du jonc (centré 2 cm en avant du fût) — ils ne dépassent plus de l'anneau
      for (const a of [0.6, -0.6, Math.PI]) B.add(helmG, M.chrome, cylBetween(v(x, YE + 0.24, z), v(x + 0.02 + Math.cos(a) * 0.19, YE + 0.24, z + Math.sin(a) * 0.19), 0.008, 0.008, 8));
      B.add(helmG, M.chrome, place(new THREE.CylinderGeometry(0.13, 0.1, 0.035, 32), x, ys - 0.045, z));
      // assise épaisse arrondie
      // (dessus bombé, creux d'assise reculé ; pas de galbe des flancs : ils sont contre la coque)
      B.add(helmG, M.upholsteryInterior, place(softBox(0.46, 0.14, 0.44, 0.065, { crown: 0.006, sag: 0.011, sx: -0.05, sz: z > 1.5 ? 0.01 : -0.015, rx: 0.16, rz: 0.15, bulge: 0, front: 'x' }).geo, x + 0.037, ys + 0.041, z));
      // coque
      const M4 = new THREE.Matrix4().makeTranslation(x, ys - 0.02, z);
      B.add(helmG, M.upholsteryInterior, xf(shellGeo.clone(), M4));
      // embouts d'ailes (fermeture des extrémités)
      const pos = shellGeo.attributes.position, nP = NPROF; // points du profil lissé
      for (const seg of [0, 48]) {
        let cx = 0, cy = 0, cz = 0;
        for (let j = 0; j < nP; j++) { const i = seg * nP + j; cx += pos.getX(i); cy += pos.getY(i); cz += pos.getZ(i); }
        cx /= nP; cy /= nP; cz /= nP;
        const ring = []; for (let j = 0; j < nP; j++) { const i = seg * nP + j; ring.push(v(pos.getX(i), pos.getY(i), pos.getZ(i))); }
        const cg = new Geo(); const c0 = v(cx, cy, cz);
        const out = v(cx, 0, cz).normalize().applyAxisAngle(v(0, 1, 0), seg ? -Math.PI / 2 : Math.PI / 2);
        for (let j = 0; j < nP - 1; j++) { cg.tri(c0, ring[j], ring[j + 1], out); cg.tri(c0, ring[j], ring[j + 1], out.clone().negate()); }
        B.add(helmG, M.upholsteryInterior, xf(cg.build(), M4));
        B.add(helmG, M.upholsteryInterior, xf(capG.clone().scale(1, 1.6, 1), new THREE.Matrix4().makeTranslation(x + cx, ys - 0.02 + cy, z + cz)));
      }
      // surpiqûre le long du bord supérieur de la coque
      // (fil fin à demi noyé dans le cuir, comme sur les méridiennes)
      const top = []; for (let s = 0; s <= 48; s += 2) { const i = s * nP + 7 * PSUB; top.push(v(pos.getX(i), pos.getY(i) + 0.0012, pos.getZ(i)).applyMatrix4(M4)); }
      B.add(helmG, M.stitch, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(top), 96, ST, 6, false), nl);
      const seam = []; for (let s = 0; s <= 48; s += 2) { const i = s * nP + 4 * PSUB; seam.push(v(pos.getX(i) * 1.004, pos.getY(i), pos.getZ(i) * 1.004).applyMatrix4(M4)); }
      B.add(helmG, M.stitch, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(seam), 96, ST, 6, false), nl);
      // coussin de dossier capitonné
      B.add(helmG, M.upholsteryInterior, place(new RoundedBoxGeometry(0.065, 0.31, 0.28, 4, 0.028), x - 0.175, ys + 0.276, z, 0, 0, -0.1));
    }
  }

  // =========================================================================
  // PONT ARRIÈRE : banquettes en L sur les ailes, table ronde à tribord ; toile d'extérieur
  // =========================================================================
  {
    const Y = deckY(-11.5);
    const tx2 = -11.3, tz = 2.0; // ensemble repas entièrement sur le pont plein (x > -11,9 : haut de l'escalier)
    // toile d'extérieur (type Sunbrella) : grain de lin en coordonnées monde, tuile 6 cm
    {
      const fx = makeFabricMaps('linen');
      for (const t of [fx.normal, fx.map]) t.repeat.set(1, 1);
      const UX = M.upholsteryExterior;
      UX.normalMap = fx.normal; UX.normalScale = new THREE.Vector2(1.0, 1.0); UX.map = fx.map; UX.roughness = 0.88;
      // toile acrylique teinte masse : léger duvet (sheen gris neutre, pas de voile blanc sur les teintes sombres),
      // nuances de tissage / patine à grande échelle pour que l'ivoire ne soit plus un aplat
      UX.sheen = 0.4; UX.sheenColor.set(0xffffff); UX.sheenRoughness = 0.55; UX.specularIntensity = 0.4;
      // albedo ×0,86 : l'ivoire 0xe6e0d3 de l'option devient un écru de toile réelle (≈ 0,62 de réflectance), pas un blanc de plâtre
      softGoodsShader(UX, { tone: 0.045, toneScale: 2.6, rough: 0.08, sheenTint: true, albedo: 0.86, slub: 0.05 });
      uvScale.set(UX, [0.06, 0.06]);
    }
    void tx2; void tz;
    // banquettes en L épousant le bateau. Tout est tracé en plan par décalage NORMAL à la face intérieure réelle du
    // pavois (polyligne de boat.js) : dossier et couvertine gardent leur largeur là où le pavois se resserre vers le
    // tableau. Vers l'avant, socle, dossier et couvertine viennent mourir contre la joue de superstructure (face arrière
    // inclinée + pan coupé) et la couvertine suit la plongée du pavois ; l'angle intérieur de l'assise est un congé
    // tangent au bord avant (aucune cassure).
    const XA = -13.12, DEP = 0.66, BK = 0.14, ZS = 1.33;
    const SEAT = 0.30, CUSH = 0.12, BACK = 0.66; // couvertine 0,66 → 0,69 : arête intérieure du dessus de pavois
    const sstep = (e0, e1, x) => { const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
    const KN = [-13.2, -12.9, -12.6, -12.3, -12.0, -11.7]; for (let i = 0; i <= 14; i++) KN.push(-11.4 + 0.1 * i); // stations du pavois (boat.js)
    const KW = KN.map((x) => halfW(x) - BT);                                                // face intérieure verticale du pavois
    const KI = KN.map((x) => (x <= -11.4 ? 0.69 : 0.69 - 0.59 * sstep(-11.4, -10.0, x))); // arête intérieure du dessus (au-dessus du pont)
    const lin = (K, x) => { let i = 0; while (i < KN.length - 2 && x > KN[i + 1]) i++; return K[i] + (K[i + 1] - K[i]) * (x - KN[i]) / (KN[i + 1] - KN[i]); };
    const Wl = (x) => lin(KW, x) - 0.026; // quelques mm de jeu (biseaux et onglet compris) contre le pavois, masqués par le jonc du pavois
    const iaRel = (x) => (x <= -11.4 ? 0.69 : lin(KI, x));
    // point décalé de o vers l'intérieur, normalement au pavois (pente lissée sur ±12 cm : cassure des pans coupés franchie proprement)
    const offP = (u, o) => { const e = 0.12, m = (Wl(u + e) - Wl(u - e)) / (2 * e), n = 1 / Math.hypot(1, m); return [u + o * m * n, Wl(u) - o * n]; };
    const solveU = (o, X) => { let lo = X - 0.45, hi = X + 0.05; for (let k = 0; k < 40; k++) { const mid = (lo + hi) / 2; if (offP(mid, o)[0] < X) lo = mid; else hi = mid; } return (lo + hi) / 2; };
    const along = (o, x0, x1, n) => { const u0 = solveU(o, x0), u1 = solveU(o, x1), pts = []; for (let i = 0; i <= n; i++) pts.push(offP(u0 + (u1 - u0) * i / n, o)); return pts; };
    // joue de superstructure (boat.js : cheekBase → cheekTop), triangles exacts : x de la joue au point (y, |z|), +∞ hors joue
    const CH = (() => { const d0 = [-11.4, Y, 2.2], d1 = [-11.4, Y, 3.0], d2 = [-11.0, Y, 3.42], t0 = [-10.8, YU, 2.2], t1 = [-10.8, YU, 2.55], t2 = [-10.4, YU, 2.92];
      return [[d0, d1, t1], [d0, t1, t0], [d1, d2, t2], [d1, t2, t1]]; })();
    const cheekX = (y, z) => {
      let best = Infinity; y = Math.max(y, Y + 1e-5);
      for (const [a, b, c] of CH) {
        const det = (b[1] - a[1]) * (c[2] - a[2]) - (c[1] - a[1]) * (b[2] - a[2]);
        const l1 = ((y - a[1]) * (c[2] - a[2]) - (c[1] - a[1]) * (z - a[2])) / det, l2 = ((b[1] - a[1]) * (z - a[2]) - (y - a[1]) * (b[2] - a[2])) / det;
        if (l1 < -1e-6 || l2 < -1e-6 || l1 + l2 > 1 + 1e-6) continue;
        best = Math.min(best, a[0] + l1 * (b[0] - a[0]) + l2 * (c[0] - a[0]));
      }
      return best;
    };
    // recule un sommet le long du pavois jusqu'à la joue (à `gap` près) ; yAt : hauteur dépendant de x (couvertine plongeante)
    const fit = (x, y, z, gap, yAt) => {
      for (let k = 0; k < 4; k++) { const X = cheekX(y, z) - gap; if (x <= X) break; z += Wl(X) - Wl(x); x = X; if (yAt) y = yAt(x); }
      return [x, y, z];
    };
    const trim = (g, s, gap) => { const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const [x, , z] = fit(p.getX(i), p.getY(i), s * p.getZ(i), gap); p.setX(i, x); p.setZ(i, s * z); } return g; };
    // normales lissées à arêtes vives (biseaux, congés et courbes sans facettes ; faces planes horizontales gardées planes) ;
    // triangles dégénérés retirés
    const smooth = (g, cosT = Math.cos(0.6)) => {
      const P = g.attributes.position.array, UV = g.attributes.uv ? g.attributes.uv.array : null, pos = [], uvs = [], fn = [];
      const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
      for (let t = 0; t < P.length / 9; t++) {
        a.fromArray(P, 9 * t); b.fromArray(P, 9 * t + 3).sub(a); c.fromArray(P, 9 * t + 6).sub(a);
        const n = b.cross(c), l = n.length(); if (l < 1e-9) continue;
        n.divideScalar(l); fn.push(n.x, n.y, n.z, l, Math.abs(n.y) > 0.9999 ? 0 : Math.abs(n.y) < 1e-3 ? 1 : 2);
        for (let k = 0; k < 9; k++) pos.push(P[9 * t + k]);
        if (UV) for (let k = 0; k < 6; k++) uvs.push(UV[6 * t + k]);
      }
      const key = (i) => `${Math.round(pos[3 * i] * 2e4)},${Math.round(pos[3 * i + 1] * 2e4)},${Math.round(pos[3 * i + 2] * 2e4)}`;
      const map = new Map(), nV = pos.length / 3, nor = new Float32Array(nV * 3);
      for (let i = 0; i < nV; i++) { const k = key(i); (map.get(k) || map.set(k, []).get(k)).push((i / 3) | 0); }
      for (let i = 0; i < nV; i++) {
        const t = (i / 3) | 0, ct = fn[5 * t + 4]; let x = 0, y = 0, z = 0;
        for (const u of map.get(key(i))) {
          if (u !== t && (ct === 0 || (ct === 1 && fn[5 * u + 4] !== 1))) continue;
          if (fn[5 * t] * fn[5 * u] + fn[5 * t + 1] * fn[5 * u + 1] + fn[5 * t + 2] * fn[5 * u + 2] < cosT) continue;
          x += fn[5 * u] * fn[5 * u + 3]; y += fn[5 * u + 1] * fn[5 * u + 3]; z += fn[5 * u + 2] * fn[5 * u + 3];
        }
        const l = Math.hypot(x, y, z); nor[3 * i] = x / l; nor[3 * i + 1] = y / l; nor[3 * i + 2] = z / l;
      }
      const out = new THREE.BufferGeometry();
      out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      if (UV) out.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      return out;
    };
    const extr = (pts, s, y0, h, bev, seg = 4, steps = 1) => { // pts [x, z] (tribord) -> pièce extrudée de y0 à y0+h ; s = -1 : bâbord
      const sh = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, s * z)));
      const g = new THREE.ExtrudeGeometry(sh, { depth: Math.max(0.001, h - 2 * bev), bevelEnabled: bev > 0, bevelSize: bev, bevelThickness: bev, bevelSegments: bev > 0 ? seg : 1, curveSegments: 4, steps });
      return xf(g, new THREE.Matrix4().makeTranslation(0, y0 + h - bev, 0).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2)));
    };
    // balayage d'un profil fermé [o, py] (décalage normal, hauteur) : uAt(t, o) paramètre le long du pavois, yAt(x, py) hauteur
    const sweep = (s, nS, prof, uAt, yAt, gap) => {
      const R = [];
      for (let k = 0; k <= nS; k++) R.push(prof.map(([o, py]) => {
        const [x0, z0] = offP(uAt(k / nS, o), o);
        const [x, y, z] = fit(x0, yAt(x0, py), z0, gap, (xx) => yAt(xx, py));
        return v(x, y, s * z);
      }));
      const g = new Geo(), n = prof.length, cen = (row) => row.reduce((m, p) => m.add(p), v(0, 0, 0)).multiplyScalar(1 / row.length);
      for (let k = 0; k < nS; k++) {
        const c0 = cen(R[k]).add(cen(R[k + 1])).multiplyScalar(0.5);
        for (let j = 0; j < n; j++) {
          const a = R[k][j], b = R[k][(j + 1) % n], c = R[k + 1][(j + 1) % n], d = R[k + 1][j];
          g.quad(a, b, c, d, a.clone().add(b).add(c).add(d).multiplyScalar(0.25).sub(c0));
        }
      }
      g.poly(R[0], cen(R[0]).sub(cen(R[1]))); // l'autre extrémité est plaquée contre la joue
      return smooth(g.build());
    };
    // fil du bois le long de `path` (plan, tribord) : grain continu qui suit la pièce
    const uvAlong = (g, path, s, su = 1.2, sv = 0.3) => {
      const L = [0]; for (let i = 1; i < path.length; i++) L.push(L[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]));
      const p = g.attributes.position, nn = g.attributes.normal, uv = new Float32Array(p.count * 2);
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), z = s * p.getZ(i); let best = Infinity, bu = 0, bd = 0;
        for (let k = 0; k < path.length - 1; k++) {
          const [ax, az] = path[k], dx = path[k + 1][0] - ax, dz = path[k + 1][1] - az, l = Math.hypot(dx, dz);
          const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (l * l))), d2 = (x - ax - dx * t) ** 2 + (z - az - dz * t) ** 2;
          if (d2 < best) { best = d2; bu = L[k] + t * l; bd = ((x - ax) * dz - (z - az) * dx) / l; }
        }
        uv[2 * i] = bu / su; uv[2 * i + 1] = (Math.abs(nn.getY(i)) > 0.7 ? bd : p.getY(i)) / sv;
      }
      g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); return g;
    };
    // teck massif (couvertines, table) : fil continu sans joints de calfatage ; même Color que le pont (suit l'option « Pont »)
    const teakTex = (() => {
      const W = 1024, H = 256, c = document.createElement('canvas'); c.width = W; c.height = H;
      const g = c.getContext('2d'), r = rnd(4242);
      g.fillStyle = 'rgb(236,230,222)'; g.fillRect(0, 0, W, H);
      for (let k = 0; k < 26; k++) { const y = r() * H, h = 4 + r() * 22, l = 214 + r() * 34; g.fillStyle = `rgba(${l | 0},${(l - 6) | 0},${(l - 14) | 0},0.45)`; for (const d of [-H, 0, H]) g.fillRect(0, y + d, W, h); }
      for (let k = 0; k < 170; k++) {
        const y = r() * H, amp = 0.5 + r() * 2.5, f = 1 + Math.floor(r() * 3), ph = r() * Math.PI * 2;
        g.strokeStyle = `rgba(70,52,38,${(0.05 + r() * 0.14).toFixed(3)})`; g.lineWidth = 0.5 + r() * 1.3;
        for (const d of [-H, 0, H]) { g.beginPath(); for (let x = 0; x <= W; x += 8) { const yy = y + d + amp * Math.sin(2 * Math.PI * f * x / W + ph); if (x) g.lineTo(x, yy); else g.moveTo(x, yy); } g.stroke(); }
      }
      return tex(c);
    })();
    const teak = M.deck.clone(); teak.map = teakTex; teak.color = M.deck.color;
    const teakVarnish = teak.clone(); teakVarnish.color = M.deck.color; teakVarnish.roughness = 0.42; teakVarnish.clearcoat = 0.5; teakVarnish.clearcoatRoughness = 0.25;
    const X_END = -11.10; // au-delà de la joue : les pièces y sont ensuite plaquées (fit / trim)
    const endPts = (p, q, n = 8) => { const r = []; for (let i = 1; i < n; i++) r.push([p[0] + (q[0] - p[0]) * i / n, p[1] + (q[1] - p[1]) * i / n]); return r; };
    // contour du L : décalages depuis le pavois (b), le tableau (a), le bord d'escalier (c) ; profondeur d'assise dd ; congé r ; extrémité avant xE
    const contour = ({ b = 0, a = 0, c = 0, dd = DEP, r = 0.28, xE = X_END }) => {
      const xA = XA + a, zS = ZS + c, xI = XA + dd, Cx = xI + r;
      const outer = along(b, xE, xA, 40);
      const Q = [], uE = solveU(dd, xE);
      for (let u = -12.4; u < uE - 0.003; u += 0.005) Q.push(offP(u, dd));
      Q.push(offP(uE, dd));
      const near = (zc) => { let m = Infinity, k = 0; Q.forEach(([qx, qz], i) => { const d = Math.hypot(qx - Cx, qz - zc); if (d < m) { m = d; k = i; } }); return [m, k]; };
      const zr = Q.reduce((p, q) => (Math.abs(q[0] - Cx) < Math.abs(p[0] - Cx) ? q : p))[1];
      let lo = zr - 3 * r, hi = zr - 0.2 * r; // centre du congé tangent au bord du retour (x = xI) et au bord avant
      for (let k = 0; k < 40; k++) { const mid = (lo + hi) / 2; if (near(mid)[0] > r) lo = mid; else hi = mid; }
      const zc = (lo + hi) / 2, kt = near(zc)[1], ph = Math.atan2(Q[kt][1] - zc, Q[kt][0] - Cx);
      const pts = [...outer, [xA, zS], [xI, zS]];
      for (let i = 0; i <= 16; i++) { const t = Math.PI + (ph - Math.PI) * i / 16; pts.push([Cx + r * Math.cos(t), zc + r * Math.sin(t)]); }
      for (let i = kt + 10; i < Q.length - 6; i += 10) pts.push(Q[i]);
      pts.push(Q[Q.length - 1], ...endPts(Q[Q.length - 1], outer[0]));
      return pts;
    };
    // bande parallèle au pavois et au tableau entre les décalages o0 et o1 ; part 'stern' : retour arrière seul (coupe d'onglet)
    const band = (o0, o1, { xE = X_END, zEnd = ZS + 0.01, part = 'all' } = {}) => {
      const outer = along(o0, xE, XA + o0, 40), inner = along(o1, XA + o1, xE, 40);
      if (part === 'stern') return [outer[outer.length - 1], [XA + o0, zEnd], [XA + o1, zEnd], inner[0]];
      return [...outer, [XA + o0, zEnd], [XA + o1, zEnd], ...inner, ...endPts(inner[inner.length - 1], outer[0])];
    };
    // profil de couvertine : 0,03 × (BK + 36 mm), arêtes adoucies r = 6 mm (identique aux biseaux du retour arrière)
    const capProf = (() => {
      const oL = -0.018, oR = BK + 0.018, H = 0.03, r = 0.006, P = [];
      const arc = (co, cy, a0) => { for (let i = 0; i <= 4; i++) { const t = a0 + (Math.PI / 2) * i / 4; P.push([co + r * Math.cos(t), cy + r * Math.sin(t)]); } };
      arc(oR - r, r, -Math.PI / 2); arc(oR - r, H - r, 0);
      for (let i = 1; i < 6; i++) P.push([oR - r - (oR - oL - 2 * r) * i / 6, H]);
      arc(oL + r, H - r, Math.PI / 2); arc(oL + r, r, Math.PI);
      return P;
    })();
    // ---- sellerie souple (coussins du pont arrière) ----
    // contour plan redensifié (pas ≤ step) et sans doublons
    const densify = (P, step) => { const o = []; for (let i = 0; i < P.length; i++) { const A = P[i], Q = P[(i + 1) % P.length], n = Math.max(1, Math.ceil(Math.hypot(Q[0] - A[0], Q[1] - A[1]) / step)); for (let k = 0; k < n; k++) o.push([A[0] + (Q[0] - A[0]) * k / n, A[1] + (Q[1] - A[1]) * k / n]); } return o; };
    const dedup = (P) => P.filter((p, i) => { const q = P[(i + 1) % P.length]; return Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-6; });
    const inPoly = (P, x, z) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, zi] = P[i], [xj, zj] = P[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c; } return c; };
    // distance signée au contour (> 0 dedans), abscisse curviligne et point le plus proche
    const polyDist = (P) => {
      const L = [0]; for (let i = 0; i < P.length; i++) { const Q = P[(i + 1) % P.length]; L.push(L[i] + Math.hypot(Q[0] - P[i][0], Q[1] - P[i][1])); }
      return (x, z) => {
        let best = Infinity, arc = 0, qx = 0, qz = 0;
        for (let i = 0; i < P.length; i++) {
          const [ax, az] = P[i], Q = P[(i + 1) % P.length], dx = Q[0] - ax, dz = Q[1] - az, l2 = dx * dx + dz * dz || 1e-12;
          const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)), px = ax + dx * t, pz = az + dz * t, d2 = (x - px) ** 2 + (z - pz) ** 2;
          if (d2 < best) { best = d2; arc = L[i] + t * Math.sqrt(l2); qx = px; qz = pz; }
        }
        const d = Math.sqrt(best);
        return { d: inPoly(P, x, z) ? d : -d, arc, qx, qz };
      };
    };
    // triangulation de Delaunay (Bowyer–Watson) de points plans [x, z]
    const delaunay = (pts) => {
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (const [x, z] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
      const n = pts.length, D = 20 * Math.max(x1 - x0, z1 - z0), mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
      const P = pts.concat([[mx - D, mz - D], [mx + D, mz - D], [mx, mz + D]]);
      const mk = (a, b, c) => {
        const [ax, az] = P[a], [bx, bz] = P[b], [cx, cz] = P[c], d = 2 * (ax * (bz - cz) + bx * (cz - az) + cx * (az - bz));
        const a2 = ax * ax + az * az, b2 = bx * bx + bz * bz, c2 = cx * cx + cz * cz;
        const ux = (a2 * (bz - cz) + b2 * (cz - az) + c2 * (az - bz)) / d, uz = (a2 * (cx - bx) + b2 * (ax - cx) + c2 * (bx - ax)) / d;
        return [a, b, c, ux, uz, (ax - ux) ** 2 + (az - uz) ** 2];
      };
      let T = [mk(n, n + 1, n + 2)];
      for (let i = 0; i < n; i++) {
        const [px, pz] = P[i], keep = [], edges = new Map();
        for (const t of T) {
          if ((px - t[3]) ** 2 + (pz - t[4]) ** 2 < t[5]) {
            for (const [a, b] of [[t[0], t[1]], [t[1], t[2]], [t[2], t[0]]]) { const k = a < b ? a * 1e5 + b : b * 1e5 + a; edges.set(k, edges.has(k) ? null : [a, b]); }
          } else keep.push(t);
        }
        for (const e of edges.values()) if (e) keep.push(mk(e[0], e[1], i));
        T = keep;
      }
      return T.filter((t) => t[0] < n && t[1] < n && t[2] < n).map((t) => [t[0], t[1], t[2]]);
    };
    // champ de déformation d'une assise (repère tribord) : bombé + creux d'assise + fronces + flancs galbés -> [dx, dy, dz]
    const CUTS0 = [XA + DEP, (XA + DEP - 11.31) / 2];
    const backOff = (x, z) => Math.min(Wl(x) - z, x - XA) - BK; // distance à la face des coussins de dossier (≈ 0,17 = leur nez)
    const seatField = (poly, y0, h, k, s) => {
      const Dst = polyDist(poly), top = y0 + h, seed = 1.7 * k + (s > 0 ? 0 : 4.1);
      // creux d'assise : barycentre de la zone dégagée (hors dossier), un peu reculé ; asymétrie bâbord / tribord
      let sw = 0, sx = 0, sz = 0;
      for (let x = -13.2; x < -11.2; x += 0.02) for (let z = 1.2; z < 3.2; z += 0.02) if (inPoly(poly, x, z)) { const w = sstep(0.17, 0.27, backOff(x, z)); sw += w; sx += w * x; sz += w * z; }
      sx /= sw; sz /= sw;
      const jit = (s > 0 ? 1 : -1) * (k === 1 ? 0.03 : -0.02);
      const spot = k === 0 ? { x: sx - 0.03, z: sz + jit, rx: 0.22, rz: 0.29, a: 0.028 } : { x: sx + jit, z: sz + 0.04, rx: 0.29, rz: 0.23, a: 0.03 };
      return (x, y, z) => {
        const { d, arc, qx, qz } = Dst(x, z);
        const sit = sstep(0.17, 0.27, backOff(x, z));
        const sagN = Math.exp(-(((x - spot.x) / spot.rx) ** 2 + ((z - spot.z) / spot.rz) ** 2)) * sit;
        const sag = spot.a * sagN + 0.003 * sit * sstep(0.02, 0.2, d);    // creux local + léger tassement général
        const crown = 0.017 * sstep(0, 0.14, d) * sit;                  // garnissage bombé (le nez du dossier le comprime)
        const wv = sstep(y0 + 0.3 * h, top, y);
        // fronces : vaguelettes irrégulières perpendiculaires au passepoil, plus marquées là où la toile est tirée par le creux
        const near = Math.exp(-Math.abs(d) / 0.014);
        const wr = 0.0022 * (0.35 + 0.65 * (0.5 + 0.5 * Math.sin(arc * 9.1 + seed))) * (1 + 1.6 * sagN) * near * (0.3 + 0.7 * sit)
          * Math.sin(2 * Math.PI * arc / 0.05 + 1.6 * Math.sin(arc * 13 + seed));
        const dy = wv * (crown - sag + wr);
        let dx = 0, dz = 0;
        if (d < -0.002) { // flancs : galbe horizontal (plus fort sous la charge), nul contre la joue, réduit côté dossier et aux joints
          const vf = Math.max(0, Math.min(1, (y - y0) / h)), ox = x - qx, oz = z - qz, ol = Math.hypot(ox, oz) || 1;
          let bul = (0.0055 + 0.004 * sagN) * Math.sin(Math.PI * vf) * (1 - sstep(-11.40, -11.345, x)) * (0.3 + 0.7 * sit);
          if (Math.abs(ox / ol) > 0.7 && CUTS0.some((c) => Math.abs(x - c) < 0.06)) bul *= 0.4; // joints de 10 mm : ≤ 3,8 mm de chaque côté
          dx = bul * ox / ol; dz = bul * oz / ol;
        }
        return [dx, dy, dz];
      };
    };
    // assise : extrusion à biseau dont le dessus plat est remplacé par un maillage fin, puis déformée par le champ
    const softSeat = (poly, s, y0, h, bev, seg, field) => {
      const P = dedup(densify(poly, 0.016)), top = y0 + h; // (maillage allégé : 1,6 cm au bord, 3 cm au cœur, invisible à distance de vue)
      const g = extr(P, s, y0, h, bev, seg, 3), pa = g.attributes.position.array, out = [];
      for (let t = 0; t < pa.length; t += 9) if (!(pa[t + 1] > top - 1e-6 && pa[t + 4] > top - 1e-6 && pa[t + 7] > top - 1e-6)) for (let k = 0; k < 9; k++) out.push(pa[t + k]);
      const Dst = polyDist(P), pts = P.slice(), r = rnd(5);
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (const [x, z] of P) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
      for (let x = x0 + 0.015; x < x1; x += 0.03) for (let z = z0 + 0.015; z < z1; z += 0.03) {
        const px = x + (r() - 0.5) * 0.002, pz = z + (r() - 0.5) * 0.002;
        if (Dst(px, pz).d > 0.017) pts.push([px, pz]);
      }
      for (const [a, b, c] of delaunay(pts)) {
        const A = pts[a], Bp = pts[b], C = pts[c];
        if (!inPoly(P, (A[0] + Bp[0] + C[0]) / 3, (A[1] + Bp[1] + C[1]) / 3)) continue;
        const W = [A, Bp, C].map(([x, z]) => [x, top, s * z]);
        const ny = (W[1][2] - W[0][2]) * (W[2][0] - W[0][0]) - (W[1][0] - W[0][0]) * (W[2][2] - W[0][2]);
        if (ny < 0) W.reverse();
        for (const q of W) out.push(...q);
      }
      for (let i = 0; i < out.length; i += 3) {
        const [dx, dy, dz] = field(out[i], out[i + 1], s * out[i + 2]);
        out[i] += dx; out[i + 1] += dy; out[i + 2] += s * dz;
      }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
      return smooth(geo, Math.cos(0.7));
    };
    // coussin de dossier : face avant gonflée (nulle aux extrémités, en haut et en bas), arête haute avant légèrement tassée
    const softBack = (poly, s, y0, h, bev, seg, ends) => {
      const g = extr(dedup(densify(poly, 0.02)), s, y0, h, bev, seg, 5), p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = s * p.getZ(i);
        const oW = Wl(x) - z, oT = x - XA, wF = sstep(0.10, 0.165, Math.min(oW, oT) - BK);
        if (wF <= 0) continue;
        const eU = sstep(0, 0.16, ends(x, z) - bev), vf = Math.max(0, Math.min(1, (y - y0) / h)), eV = Math.pow(Math.sin(Math.PI * vf), 0.8);
        const e = 0.12, m = (Wl(x + e) - Wl(x - e)) / (2 * e), n = 1 / Math.hypot(1, m), wT = sstep(-0.03, 0.03, oW - oT);
        let ux = (1 - wT) * m * n + wT, uz = -(1 - wT) * n; const ul = Math.hypot(ux, uz); ux /= ul; uz /= ul;
        const corner = sstep(0.02, 0.14, Math.abs(oW - oT)); // angle rentrant du L : la toile y est tendue, pas de galbe (sinon les faces se croisent)
        const bul = 0.018 * eU * eV * wF * corner * (1 + 0.12 * wob(x * 7, y * 9, s));
        p.setX(i, x + bul * ux); p.setZ(i, s * (z + bul * uz));
        p.setY(i, y - 0.004 * eU * wF * sstep(y0 + h - 0.07, y0 + h, y));
      }
      return smooth(g, Math.cos(0.7));
    };
    for (const s of [1, -1]) {
      B.add(aftDeck, M.metalDark, smooth(trim(extr(contour({ b: 0.05, a: 0.05, c: 0.05, dd: DEP - 0.05 }), s, Y, 0.075, 0), s, 0.003)), nl); // plinthe en retrait
      B.add(aftDeck, M.superstructure, smooth(trim(extr(contour({ a: 0.008 }), s, Y + 0.07, SEAT - 0.07, 0.015, 3), s, 0.004)));          // socle
      // dossier d'une seule pièce du socle à la couvertine (dos côté tableau sans joint) ; puis raccord jusqu'à la joue sous la couvertine plongeante
      B.add(aftDeck, M.superstructure, smooth(extr(band(0.008, BK - 0.02, { xE: -11.42, zEnd: ZS + 0.006 }), s, Y + 0.07, BACK - 0.07, 0.02, 3)));
      B.add(aftDeck, M.superstructure, sweep(s, 24, [[-0.012, 0], [BK - 0.001, 0], [BK - 0.001, 1], [-0.012, 1]], (t, o) => solveU(o, -11.405 + 0.505 * t),
        (x, py) => Y + 0.07 + py * (Math.min(BACK, iaRel(x) - 0.03) - 0.07), 0.003));
      // couvertine teck massif : retour arrière + aile en coupe d'onglet, fil dans le sens de chaque pièce ; l'aile suit la plongée du pavois jusqu'à la joue
      B.add(aftDeck, teak, uvAlong(smooth(extr(band(-0.012, BK + 0.012, { zEnd: ZS - 0.014, part: 'stern' }), s, Y + BACK, 0.03, 0.006, 3)), [[XA + BK / 2, 3.2], [XA + BK / 2, 1.0]], s));
      {
        const uC0 = (o) => solveU(o, XA + o), u1 = -10.85, um = uC0(BK / 2), path = [];
        for (let i = 0; i <= 60; i++) path.push(offP(um + (u1 - um) * i / 60, BK / 2));
        B.add(aftDeck, teak, uvAlong(sweep(s, 90, capProf, (t, o) => { const u0 = uC0(o); return u0 + (u1 - u0) * t; }, (x, py) => Y + iaRel(x) - 0.03 + py, 0.003), path, s));
      }
      // coussins en sections, comme une vraie sellerie : retour arrière (angle compris) + aile en deux, joints alignés assise / dossier
      const bev = 0.035, JOINT = 0.005; // demi-joint : 10 mm entre deux coussins, arrondis compris
      const CUTS = [XA + DEP, (XA + DEP - 11.31) / 2];
      const clipX = (pts, lo, hi) => { // découpe du contour plan entre x = lo et x = hi (Sutherland–Hodgman), coupe redensifiée
        const half = (P, keep, X) => { const o = []; for (let i = 0; i < P.length; i++) { const A = P[i], Bq = P[(i + 1) % P.length], ka = keep(A[0]), kb = keep(Bq[0]); if (ka) o.push(A); if (ka !== kb) { const t = (X - A[0]) / (Bq[0] - A[0]); o.push([X, A[1] + t * (Bq[1] - A[1])]); } } return o; };
        let P = pts; if (lo > -Infinity) P = half(P, (x) => x >= lo, lo); if (hi < Infinity) P = half(P, (x) => x <= hi, hi);
        const out = []; for (let i = 0; i < P.length; i++) { const A = P[i], Bq = P[(i + 1) % P.length]; out.push(A); const onCut = (q) => Math.abs(q[0] - lo) < 1e-9 || Math.abs(q[0] - hi) < 1e-9; if (onCut(A) && onCut(Bq) && Math.abs(A[0] - Bq[0]) < 1e-9) { const n = Math.ceil(Math.abs(Bq[1] - A[1]) / 0.03); for (let k = 1; k < n; k++) out.push([A[0], A[1] + (Bq[1] - A[1]) * k / n]); } }
        return out;
      };
      const pieces = (pad) => { const e = [-Infinity, ...CUTS, Infinity]; return e.slice(0, -1).map((a, k) => [a === -Infinity ? a : a + pad, e[k + 1] === Infinity ? Infinity : e[k + 1] - pad]); };
      const seatC = contour({ b: BK + bev + 0.004, a: BK + bev + 0.004, c: bev + 0.006, dd: DEP - bev - 0.004, r: 0.28 - bev, xE: -11.31 - bev });
      // assises souples : dessus maillé (Delaunay) bombé, creusé là où l'on s'assoit, flancs galbés, fronces près du passepoil
      const fields = pieces(bev + JOINT).map(([lo, hi], k) => {
        const poly = clipX(seatC, lo, hi), f = seatField(poly, Y + SEAT, CUSH, k, s);
        B.add(aftDeck, M.upholsteryExterior, softSeat(poly, s, Y + SEAT, CUSH, bev, 5, f));
        return f;
      });
      // passepoil cousu sur l'arrondi haut de chaque assise (à 45°, à moitié noyé), fait le tour de chaque coussin et suit ses déformations
      {
        const i = 0.0087;
        const pipeC = contour({ b: BK + 0.004 + i, a: BK + 0.004 + i, c: 0.006 + i, dd: DEP - 0.004 - i, r: 0.28 - i, xE: -11.31 - i });
        pieces(i + JOINT).forEach(([lo, hi], k) => {
          const pts = dedup(densify(clipX(pipeC, lo, hi), 0.012)).map(([x, z]) => { const y = Y + SEAT + CUSH - i, [dx, dy, dz] = fields[k](x, y, z); return v(x + dx, y + dy, s * (z + dz)); });
          B.add(aftDeck, M.upholsteryExterior, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true, 'centripetal'), pts.length * 2, 0.0055, 8, true), nl);
        });
      }
      // coussins de dossier : posés contre le dossier, glissés sous le débord de la couvertine, joints dans l'alignement des assises ;
      // face avant gonflée au centre de chaque section, arête haute légèrement tassée
      const backC = band(BK + 0.044, BK + 0.13, { xE: -11.29 - 0.04, zEnd: ZS + 0.046 });
      for (const [lo, hi] of pieces(0.04 + JOINT)) {
        const ends = (x, z) => Math.min(lo === -Infinity ? z - (ZS + 0.046) : x - lo, hi === Infinity ? -11.33 - x : hi - x);
        B.add(aftDeck, M.upholsteryExterior, softBack(clipX(backC, lo, hi), s, Y + SEAT + CUSH - 0.005, 0.24, 0.04, 5, ends));
      }
      // coussin déco dans l'angle, tourné vers le centre
      {
        const { body, pipe } = pillowGeometry(0.38, 0.31, 0.13, 11 + s);
        const tilt = 0.45, H = 0.31, px = XA + BK + 0.373; // +13 mm : ne s'enfonce plus (~1 cm) dans le dossier de poupe
        // assise bombée : posé plus haut ; chaque côté légèrement différent (lancé à la main, pas symétrique)
        const jy = s > 0 ? 0.1 : -0.06, jr = s > 0 ? 0.05 : -0.035, sc = s > 0 ? 1 : 0.96;
        const m = new THREE.Matrix4().makeTranslation(px, Y + SEAT + CUSH + H / 2 * Math.cos(tilt) - 0.007, s * (Wl(px) - BK - 0.34))
          .multiply(new THREE.Matrix4().makeRotationY((s > 0 ? 0.75 * Math.PI : 0.25 * Math.PI) + jy))
          .multiply(new THREE.Matrix4().makeRotationZ(jr))
          .multiply(new THREE.Matrix4().makeRotationX(-tilt - (s > 0 ? 0 : 0.06)))
          .multiply(new THREE.Matrix4().makeScale(sc, sc, 1));
        B.add(aftDeck, M.cushionDeco, xf(body, m)); B.add(aftDeck, M.cushionDeco, xf(pipe, m));
      }
    }
    // tour 4 — balisage de courtoisie 2700 K (piloté jour/nuit, indépendant de l'option LED) :
    // (a) ruban sous le débord du socle des banquettes (pied en retrait de 5 cm), lueur rasante sur le teck ;
    // (b) un ruban sous chaque nez de marche de l'escalier de poupe, lueur sur la marche inférieure / la plateforme
    {
      for (const s of [1, -1]) {
        const raw = contour({ dd: DEP - 0.032 }), front = [];
        for (const p of raw.slice(42, raw.length - 7)) if (!front.length || Math.hypot(p[0] - front[front.length - 1][0], p[1] - front[front.length - 1][1]) > 0.02) front.push(p);
        B.add(aftDeck, M.courtesyLed, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(front.map(([x, z]) => v(x, Y + 0.061, s * z))), front.length * 3, 0.0045, 6), nl);
        const dirs = front.map(([x, z], i) => {
          const a = front[Math.max(0, i - 1)], b = front[Math.min(front.length - 1, i + 1)];
          let tx = b[0] - a[0], tz = b[1] - a[1]; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
          let nx = -tz, nz = tx; if (nx * (-11.9 - x) + nz * (0 - z) < 0) { nx = -nx; nz = -nz; }
          return [nx, s * nz];
        });
        glowRibbon(aftDeck, front.map(([x, z]) => [x, s * z]), Y + 0.0025, 0.32, dirs);
      }
      const XST = -11.9, ZST = 1.25, YP = 0.35, nS = 5, y0 = deckY(XST), rise = (y0 - YP) / (nS + 1), run = (XST + 13.2) / nS;
      for (let i = 0; i <= nS; i++) {
        const xa = XST - run * i, yTop = y0 - rise * i, xr = i === 0 ? XST - 0.002 : xa + 0.03; // face de contremarche sous le nez
        B.add(aftDeck, M.courtesyLed, boxB(xr - 0.01, xr + 0.001, yTop - 0.074, yTop - 0.066, -ZST + 0.06, ZST - 0.06), nl);
        const yLow = i < nS ? yTop - rise : YP, w = i < nS ? Math.min(0.22, run - 0.04) : 0.4;
        glowRibbon(aftDeck, [[xr, -ZST + 0.04], [xr, ZST - 0.04]], yLow + 0.0025, w, [[-1, 0], [-1, 0]]);
      }
      // (c) pied de pavois du pont avant (passavants et plage avant ; le long du salon la superstructure rejoint le pavois) :
      // ruban encastré à 3,5 cm du pont dans la face intérieure du pavois, lueur rasante vers l'axe
      for (const s of [1, -1]) {
        const pts = [];
        for (let x = 1.7; x < 30; x += 0.1) { const zi = halfW(x) - BT - 0.006; if (!(zi > 0.45)) break; pts.push([x, zi, deckY(x)]); }
        if (pts.length < 4) continue;
        B.add(aftDeck, M.courtesyLed, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(([x, z, y]) => v(x, y + 0.035, s * z))), pts.length * 2, 0.0045, 6), nl);
        // normale vers l'axe, calculée côté tribord puis symétrisée
        const dirs = pts.map((p, i) => {
          const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], tx = b[0] - a[0], tz = b[1] - a[1], l = Math.hypot(tx, tz) || 1;
          let nx = -tz / l, nz = tx / l; if (nz > 0) { nx = -nx; nz = -nz; }
          return [nx, s * nz];
        });
        glowRibbon(aftDeck, pts.map(([x, z, y]) => [x, s * z, y + 0.003]), 0, 0.26, dirs);
      }
    }
    // table ronde à tribord : plateau teck vernis à chant arrondi, fût et platine inox
    {
      const cx = -11.98, cz = 1.84, R = 0.4, TH = 0.7; // chant du plateau au droit du bord avant de l'assise
      const prof = [[0, 0], [R - 0.012, 0], [R, 0.008], [R + 0.002, 0.018], [R, 0.028], [R - 0.012, 0.036], [0, 0.036]].map(([a, b]) => new THREE.Vector2(a, b));
      B.add(aftDeck, teakVarnish, uvAlong(place(new THREE.LatheGeometry(prof, 96), cx, Y + TH - 0.036, cz), [[cx - 1, cz], [cx + 1, cz]], 1, 0.9, 0.225));
      B.add(aftDeck, M.chrome, place(new THREE.CylinderGeometry(0.16, 0.16, 0.012, 40), cx, Y + TH - 0.042, cz));
      B.add(aftDeck, M.chrome, place(new THREE.CylinderGeometry(0.04, 0.05, TH - 0.06, 28), cx, Y + (TH - 0.06) / 2 + 0.012, cz));
      B.add(aftDeck, M.chrome, place(new THREE.CylinderGeometry(0.23, 0.25, 0.016, 48), cx, Y + 0.008, cz));
      aoDecal(aftDeck, cx - 0.36, cx + 0.36, cz - 0.36, cz + 0.36, 0.25, Y + 0.003, 0.45);
    }
  }

  // =========================================================================
  function setLed(hex) {
    const on = !(hex === null || hex === undefined || hex === false);
    if (on) {
      M.ledStrip.color.set(hex); M.ledGlow.color.set(hex); M.ledGlow.visible = true;
      coveLights.forEach((l) => { l.color.set(hex); l.intensity = COVE_I; l.userData.on = true; });
      M.ledGlowFloor.color.set(hex); M.ledGlowFloor.visible = true;
      // épine du plafond : teinte de l'option ramenée vers 2800 K (accord avec les gorges chaudes)
      M.spineLed.color.set(hex).lerp(new THREE.Color(0xffad5c), 0.65).multiplyScalar(0.8); M.spineSoffit.userData.on = true;
    } else {
      M.spineLed.color.set(0x1b1b1b); M.spineSoffit.userData.on = false;
      M.ledStrip.color.set(0x1b1b1b); M.ledGlow.visible = false; M.ledGlowFloor.visible = false;
      coveLights.forEach((l) => { l.intensity = 0; l.userData.on = false; });
    }
  }
  return { setLed, glowMeshes, modelMatrix };
}
