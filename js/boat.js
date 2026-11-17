// DIÈDRE 29 — modèle 3D procédural (NEOCHROME)
// Repère : +X avant (étrave), +Y haut, +Z tribord, flottaison y = 0, unités = mètres.
// Aucune texture externe : teck, bois, écrans et nom de coque sont générés en canvas.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { buildInterior } from './interior.js';

const V3 = THREE.Vector3;
const v = (x, y, z) => new V3(x, y, z);

// ---------------------------------------------------------------------------
// Lignes de coque
//   coupe (demi) : quille → bouchain → [flottaison] → dièdre (arête vive, point le plus large)
//                  → livet. Panneau bas anthracite évasé, panneau haut métal en dévers rentrant.
// ---------------------------------------------------------------------------
const XS = -13.2;   // tableau arrière
const XB = 14.4;    // étrave
const XP = -14.4;   // bord arrière de la plateforme de bain
const X_STAIR = -11.9; // haut de l'escalier
const Z_STAIR = 1.25;  // demi-largeur de l'escalier
const Y_PLAT = 0.35;   // plateforme de bain
const KMAX = 3.85;     // demi-largeur max à l'arête du dièdre

const clamp01 = (t) => Math.max(0, Math.min(1, t));
const ss = (e0, e1, x) => { const t = clamp01((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };

function knuckleW(x) { // demi-largeur à l'arête (plan : pointe effilée, côtés parallèles à l'arrière)
  const d = XB - x;
  const t = Math.min(d / 19.5, 1);
  let w = KMAX * (1 - Math.pow(1 - t, 2.5));
  const a = ss(-9, XS, x);
  w -= 0.5 * a * a;
  return Math.max(w, 0);
}
const sheer = (x) => 1.88 + 0.22 * Math.pow(ss(-6, XB, x), 1.6);
const deckY = (x) => sheer(x) - 0.13;
const knuckleY = (x) => 1.07 + 0.74 * Math.pow(ss(-6, XB, x), 2);
const TUMBLE = Math.tan(THREE.MathUtils.degToRad(19)); // dévers du panneau haut
const FLARE = Math.tan(THREE.MathUtils.degToRad(15));  // évasement du panneau bas

function section(x) {
  const K = knuckleW(x) * (1 - 0.12 * clamp01((XS + 0.6 - x) / 0.6)), s = K / KMAX; // pans coupés aux angles du tableau
  const sh = sheer(x), knY = knuckleY(x);
  const chY = -0.05 + 0.6 * Math.pow(ss(-2, XB, x), 1.5);
  const W = Math.max(K - (sh - knY) * TUMBLE * s, 0);
  return {
    W, sheer: sh,
    keel: -1.1 + 0.75 * Math.pow(ss(4, XB, x), 1.3) + 0.35 * ss(-6, XS, x),
    chZ: Math.max(K - (knY - chY) * FLARE * s, 0), chY,
    knZ: K, knY,
  };
}
const halfW = (x) => section(x).W; // demi-largeur au livet

// ---------------------------------------------------------------------------
// Utilitaires géométrie
// ---------------------------------------------------------------------------
function flipWinding(g) {
  for (const name in g.attributes) {
    const a = g.attributes[name], s = a.itemSize, arr = a.array;
    for (let t = 0; t < a.count; t += 3) {
      for (let k = 0; k < s; k++) {
        const i1 = (t + 1) * s + k, i2 = (t + 2) * s + k;
        const tmp = arr[i1]; arr[i1] = arr[i2]; arr[i2] = tmp;
      }
    }
    a.needsUpdate = true;
  }
}
function xf(g, m) {
  if (g.index) g = g.toNonIndexed();
  g.applyMatrix4(m);
  if (m.determinant() < 0) flipWinding(g);
  return g;
}
const MZ = new THREE.Matrix4().makeScale(1, 1, -1);
const mirrorZ = (g) => xf(g.clone(), MZ);

function place(g, x, y, z, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Matrix4().compose(v(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), v(1, 1, 1));
  return xf(g, m);
}
const boxG = (w, h, d, x, y, z, rx, ry, rz) => place(new THREE.BoxGeometry(w, h, d), x, y, z, rx, ry, rz);
// boîte définie par ses bornes
const boxB = (x0, x1, y0, y1, z0, z1) => boxG(x1 - x0, y1 - y0, z1 - z0, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);

function barG(a, b, t = 0.04, w = t) { // barre de section t×w entre a et b
  const d = new V3().subVectors(b, a);
  const g = new THREE.BoxGeometry(d.length(), t, w);
  const q = new THREE.Quaternion().setFromUnitVectors(v(1, 0, 0), d.clone().normalize());
  return xf(g, new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, v(1, 1, 1)));
}
function cylBetween(a, b, r0, r1 = r0, seg = 12) {
  const d = new V3().subVectors(b, a);
  const g = new THREE.CylinderGeometry(r1, r0, d.length(), seg);
  const q = new THREE.Quaternion().setFromUnitVectors(v(0, 1, 0), d.clone().normalize());
  return xf(g, new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, v(1, 1, 1)));
}
// Jonc (profil rond) balayé le long d'une polyligne : coupes d'onglet aux angles vifs, normales lisses
// dans les courbes, embouts arrondis. r : rayon constant ou fonction (indice du sommet) → rayon (effilement).
function tubePath(pts, r, seg = 14, caps = true) {
  const R = typeof r === 'function' ? r : () => r;
  const n = pts.length, d = [];
  for (let i = 0; i < n - 1; i++) d.push(new V3().subVectors(pts[i + 1], pts[i]).normalize());
  const T = pts.map((_, i) => (i === 0 ? d[0].clone() : i === n - 1 ? d[n - 2].clone() : d[i - 1].clone().add(d[i]).normalize()));
  // repère transporté parallèlement (pas de vrille du profil)
  let N = Math.abs(T[0].y) < 0.9 ? v(0, 1, 0) : v(1, 0, 0);
  N = N.sub(T[0].clone().multiplyScalar(N.dot(T[0]))).normalize();
  const rings = [], dirs = [];
  for (let i = 0; i < n; i++) {
    if (i > 0) { N.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(T[i - 1], T[i])); N.sub(T[i].clone().multiplyScalar(N.dot(T[i]))).normalize(); }
    const Bn = new V3().crossVectors(T[i], N);
    let k = null, sc = 1;
    if (i > 0 && i < n - 1) {
      const c = d[i - 1].dot(d[i]);
      if (c < 0.99999) { k = new V3().subVectors(d[i], d[i - 1]).normalize(); sc = 1 / Math.max(T[i].dot(d[i]), 0.2); }
    }
    const ring = [], ringD = [];
    for (let a = 0; a < seg; a++) {
      const th = (a / seg) * Math.PI * 2;
      const dir = N.clone().multiplyScalar(Math.cos(th)).add(Bn.clone().multiplyScalar(Math.sin(th)));
      if (k) dir.add(k.clone().multiplyScalar(dir.dot(k) * (sc - 1)));
      ringD.push(dir); // direction (jamais nulle, même à rayon 0 : normales valides à la pointe effilée)
      ring.push(dir.clone().multiplyScalar(R(i)));
    }
    rings.push(ring); dirs.push(ringD);
  }
  const pos = [], nor = [];
  const push = (p, nn) => { pos.push(p.x, p.y, p.z); nor.push(nn.x, nn.y, nn.z); };
  const tri = (a, b, c) => { // orientation vérifiée sur la normale moyenne
    const g = new V3().subVectors(b[0], a[0]).cross(new V3().subVectors(c[0], a[0]));
    if (g.lengthSq() < 1e-14) return;
    if (g.dot(a[1].clone().add(b[1]).add(c[1])) < 0) { const t = b; b = c; c = t; }
    push(...a); push(...b); push(...c);
  };
  const nrm = (off, dj) => { const q = off.clone().sub(dj.clone().multiplyScalar(off.dot(dj))); return q.lengthSq() > 1e-16 ? q.normalize() : off.clone().normalize(); };
  for (let i = 0; i < n - 1; i++) {
    const dj = d[i];
    for (let a = 0; a < seg; a++) {
      const b = (a + 1) % seg;
      const A0 = [pts[i].clone().add(rings[i][a]), nrm(dirs[i][a], dj)], B0 = [pts[i].clone().add(rings[i][b]), nrm(dirs[i][b], dj)];
      const A1 = [pts[i + 1].clone().add(rings[i + 1][a]), nrm(dirs[i + 1][a], dj)], B1 = [pts[i + 1].clone().add(rings[i + 1][b]), nrm(dirs[i + 1][b], dj)];
      tri(A0, A1, B1); tri(A0, B1, B0);
    }
  }
  if (caps) for (const [i, s] of [[0, -1], [n - 1, 1]]) { // embouts hémisphériques
    const r0 = R(i); if (r0 < 1e-5) continue;
    const t = T[i].clone().multiplyScalar(s), CS = 4;
    for (let q = 0; q < CS; q++) {
      const f0 = (q / CS) * Math.PI / 2, f1 = ((q + 1) / CS) * Math.PI / 2;
      for (let a = 0; a < seg; a++) {
        const b = (a + 1) % seg;
        const P = (f, idx) => {
          const rad = dirs[i][idx].clone().normalize();
          const nn = rad.clone().multiplyScalar(Math.cos(f)).add(t.clone().multiplyScalar(Math.sin(f)));
          return [pts[i].clone().add(rad.multiplyScalar(r0 * Math.cos(f))).add(t.clone().multiplyScalar(r0 * Math.sin(f))), nn];
        };
        tri(P(f0, a), P(f1, a), P(f1, b)); tri(P(f0, a), P(f1, b), P(f0, b));
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return g;
}
// Normales lissées entre facettes voisines dont l'écart angulaire est < seuil (arêtes vives conservées)
// byArea : pondération par l'aire (un grand pan plat garde sa normale exacte au bord d'un congé étroit)
function smoothNormals(g, deg = 25, byArea = false) {
  const p = g.attributes.position, cnt = p.count, cos = Math.cos(THREE.MathUtils.degToRad(deg));
  const fn = [], fa = [], key = (i) => `${p.getX(i).toFixed(4)}|${p.getY(i).toFixed(4)}|${p.getZ(i).toFixed(4)}`;
  const map = new Map();
  for (let t = 0; t < cnt; t += 3) {
    const a = v(p.getX(t), p.getY(t), p.getZ(t)), b = v(p.getX(t + 1), p.getY(t + 1), p.getZ(t + 1)), c = v(p.getX(t + 2), p.getY(t + 2), p.getZ(t + 2));
    const nn = new V3().subVectors(b, a).cross(new V3().subVectors(c, a));
    const area = nn.length(); const u = area > 1e-14 ? nn.clone().divideScalar(area) : v(0, 1, 0);
    fn.push(u); fa.push(byArea ? area : 1);
    for (let k = 0; k < 3; k++) { const kk = key(t + k); if (!map.has(kk)) map.set(kk, []); map.get(kk).push(t / 3); }
  }
  const out = new Float32Array(cnt * 3);
  for (let i = 0; i < cnt; i++) {
    const f = fn[Math.floor(i / 3)], s = v(0, 0, 0);
    for (const j of map.get(key(i))) if (fn[j].dot(f) >= cos) s.addScaledVector(fn[j], fa[j]);
    if (s.lengthSq() < 1e-20) s.copy(f);
    s.normalize();
    out[i * 3] = s.x; out[i * 3 + 1] = s.y; out[i * 3 + 2] = s.z;
  }
  g.setAttribute('normal', new THREE.BufferAttribute(out, 3));
  return g;
}

// Congés : chaque sommet anguleux des rangées (polylignes 3D de même longueur) est remplacé par un arc
// (Bézier quadratique tangente aux deux pans, longueur de tangente w, toujours à l'intérieur de l'angle vif).
// Toutes les rangées reçoivent le même nombre de points → les lofts entre rangées restent étanches.
// w : nombre ou tableau (une valeur par rangée : congé effilé d'une rangée à l'autre).
function filletRows(rows, w, seg = 5, closed = false) {
  const n = rows[0].length, W = Array.isArray(w) ? w : rows.map(() => w);
  const turn = (r, i) => {
    const a = new V3().subVectors(r[i], r[(i - 1 + n) % n]), b = new V3().subVectors(r[(i + 1) % n], r[i]);
    return a.lengthSq() < 1e-12 || b.lengthSq() < 1e-12 ? 1 : a.normalize().dot(b.normalize());
  };
  const sharp = [];
  for (let i = 0; i < n; i++) sharp.push((closed || (i > 0 && i < n - 1)) && rows.some((r) => turn(r, i) < 0.9995));
  return rows.map((r, k) => {
    const out = [];
    for (let i = 0; i < n; i++) {
      const c = r[i];
      if (!sharp[i]) { out.push(c.clone()); continue; }
      const p = r[(i - 1 + n) % n], q = r[(i + 1) % n];
      const lp = c.distanceTo(p), lq = c.distanceTo(q), wi = Math.min(W[k], 0.45 * lp, 0.45 * lq);
      const A = lp > 1e-9 ? c.clone().lerp(p, wi / lp) : c.clone(), Bq = lq > 1e-9 ? c.clone().lerp(q, wi / lq) : c.clone();
      for (let s = 0; s <= seg; s++) { const t = s / seg; out.push(A.clone().multiplyScalar((1 - t) ** 2).addScaledVector(c, 2 * t * (1 - t)).addScaledVector(Bq, t * t)); }
    }
    return out;
  });
}
// Bouge du toit : flèche transversale de 6 cm au centre, nulle au-delà de |z| = 3 m (bord latéral ≈ 0)
const roofCamber = (z) => 0.12 * Math.max(0, 1 - (z / 3.0) ** 2);
// Subdivision 1→4 (niveaux successifs) d'une géométrie non indexée (positions seules)
function subdivideTris(g, levels) {
  let p = Array.from(g.attributes.position.array);
  for (let l = 0; l < levels; l++) {
    const q = [];
    for (let t = 0; t < p.length; t += 9) {
      const A = p.slice(t, t + 3), Bb = p.slice(t + 3, t + 6), Cc = p.slice(t + 6, t + 9);
      const m = (u, w) => [(u[0] + w[0]) / 2, (u[1] + w[1]) / 2, (u[2] + w[2]) / 2];
      const ab = m(A, Bb), bc = m(Bb, Cc), ca = m(Cc, A);
      q.push(...A, ...ab, ...ca, ...ab, ...Bb, ...bc, ...ca, ...bc, ...Cc, ...ab, ...bc, ...ca);
    }
    p = q;
  }
  const o = new THREE.BufferGeometry();
  o.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  return o;
}
// Bézier quadratique (congé en coupe) : a et b sur les deux pans, c = arête vive
const bez2 = (a, c, b, t) => a.clone().multiplyScalar((1 - t) ** 2).addScaledVector(c, 2 * t * (1 - t)).addScaledVector(b, t * t);
// Surface réglée entre deux rangées (triangles dégénérés ignorés), orientée par hintFn(centre)
function loftRows(geo, A, Bq, hintFn, closed = false) {
  const n = A.length, m = closed ? n : n - 1;
  for (let i = 0; i < m; i++) {
    const j = (i + 1) % n;
    const h = hintFn(A[i].clone().add(A[j]).add(Bq[i]).add(Bq[j]).multiplyScalar(0.25));
    for (const [a, b, d] of [[A[i], A[j], Bq[j]], [A[i], Bq[j], Bq[i]]])
      if (new V3().subVectors(b, a).cross(new V3().subVectors(d, a)).lengthSq() > 1e-14) geo.tri(a, b, d, h);
  }
}
// Décalage d'un polygone plan (XZ, Vector2) de d vers l'intérieur (onglets)
function offset2D(pts, d) {
  let area = 0;
  for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; area += a.x * b.y - b.x * a.y; }
  const sgn = area > 0 ? 1 : -1;
  return pts.map((p, i) => {
    const a = pts[(i - 1 + pts.length) % pts.length], b = pts[(i + 1) % pts.length];
    const e1 = p.clone().sub(a).normalize(), e2 = b.clone().sub(p).normalize();
    const n1 = new THREE.Vector2(-e1.y, e1.x).multiplyScalar(sgn), n2 = new THREE.Vector2(-e2.y, e2.x).multiplyScalar(sgn);
    const nm = n1.clone().add(n2).normalize();
    return p.clone().add(nm.multiplyScalar(d / Math.max(0.35, nm.dot(n1))));
  });
}
// Boîte à arêtes arrondies (rayon r) définie comme boxG / boxB
const rboxG = (w, h, d, r, x, y, z, rx = 0, ry = 0, rz = 0) =>
  place(new RoundedBoxGeometry(w, h, d, 3, Math.min(r, 0.499 * Math.min(w, h, d))), x, y, z, rx, ry, rz);
// barre à arêtes arrondies entre a et b (comme barG)
function rbarG(a, b, t, w, r) {
  const d = new V3().subVectors(b, a);
  const g = new RoundedBoxGeometry(d.length(), t, w, 2, Math.min(r, 0.499 * Math.min(t, w, d.length())));
  const q = new THREE.Quaternion().setFromUnitVectors(v(1, 0, 0), d.clone().normalize());
  return xf(g, new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, v(1, 1, 1)));
}
const rboxB = (x0, x1, y0, y1, z0, z1, r) => rboxG(x1 - x0, y1 - y0, z1 - z0, r, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
// Enjoliveur tourné (passe-coque, échappement, spot) : profil de révolution à lèvre arrondie, axe +Y.
// rIn : ouverture, rOut : collerette ; h : saillie ; le fût plonge de `sink` dans la coque (aucun jour).
function bezelG(rIn, rOut, h, sink = 0.01, seg = 28) {
  const lip = Math.min(h * 0.9, (rOut - rIn) * 0.45), pts = [new THREE.Vector2(rIn * 0.92, -sink), new THREE.Vector2(rIn, h - lip)];
  for (let k = 1; k <= 6; k++) { const a = Math.PI - (k / 6) * Math.PI / 2; pts.push(new THREE.Vector2(rIn + lip + lip * Math.cos(a), h - lip + lip * Math.sin(a))); }
  pts.push(new THREE.Vector2(rOut - lip, h));
  for (let k = 1; k <= 6; k++) { const a = Math.PI / 2 - (k / 6) * Math.PI / 2; pts.push(new THREE.Vector2(rOut - lip + lip * Math.cos(a), h - lip + lip * Math.sin(a))); }
  pts.push(new THREE.Vector2(rOut, -sink));
  return new THREE.LatheGeometry(pts.reverse(), seg);
}
// Pose une géométrie (axe local +Y) au point p, axe le long de la normale n
const onNormal = (g, p, n) => xf(g, new THREE.Matrix4().compose(p, new THREE.Quaternion().setFromUnitVectors(v(0, 1, 0), n.clone().normalize()), v(1, 1, 1)));

// Constructeur de facettes (non indexé, normales plates)
class Geo {
  constructor() { this.p = []; }
  tri(a, b, c, hint) {
    if (hint) {
      const n = new V3().subVectors(b, a).cross(new V3().subVectors(c, a));
      if (n.dot(hint) < 0) { const t = b; b = c; c = t; }
    }
    this.p.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  }
  quad(a, b, c, d, hint) { this.tri(a, b, c, hint); this.tri(a, c, d, hint); }
  poly(pts, hint) {
    const ax = Math.abs(hint.x), ay = Math.abs(hint.y), az = Math.abs(hint.z);
    const proj = ay >= ax && ay >= az ? (p) => new THREE.Vector2(p.x, p.z)
      : ax >= az ? (p) => new THREE.Vector2(p.z, p.y) : (p) => new THREE.Vector2(p.x, p.y);
    const faces = THREE.ShapeUtils.triangulateShape(pts.map(proj), []);
    for (const f of faces) this.tri(pts[f[0]], pts[f[1]], pts[f[2]], hint);
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.computeVertexNormals();
    return g;
  }
}
const outward = (c, cx = -4, cy = null) => { const h = new V3(c.x - cx, cy === null ? 0 : c.y - cy, c.z); return h; };

// UV projetées en coordonnées monde (lattes le long de X)
function worldUV(g, su, sv) {
  const p = g.attributes.position, n = g.attributes.normal;
  const uv = new Float32Array(p.count * 2);
  const athwart = !!g.userData.athwart; // lattes transversales (marches : fil parallèle au nez de marche)
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    let u, w;
    if (ay >= ax && ay >= az) { if (athwart) { u = p.getZ(i) / su; w = p.getX(i) / sv; } else { u = p.getX(i) / su; w = p.getZ(i) / sv; } }
    else if (ax >= az) { u = p.getZ(i) / su; w = p.getY(i) / sv; }
    else { u = p.getX(i) / su; w = p.getY(i) / sv; }
    uv[i * 2] = u; uv[i * 2 + 1] = w;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

function normGeo(g) {
  if (g.index) g = g.toNonIndexed();
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  g.clearGroups();
  g.morphAttributes = {};
  return cleanTris(g);
}

// Supprime les triangles dégénérés (aire nulle) et répare toute normale nulle/NaN :
// une seule normale NaN suffit à faire « exploser » le bloom en rectangle noir.
function cleanTris(g) {
  const P = g.attributes.position.array, N = g.attributes.normal.array, U = g.attributes.uv.array;
  const keep = [], a = new V3(), b = new V3(), c = new V3(), n = new V3();
  for (let t = 0; t < P.length / 9; t++) {
    const o = t * 9;
    a.fromArray(P, o); b.fromArray(P, o + 3); c.fromArray(P, o + 6);
    n.subVectors(b, a).cross(c.clone().sub(a));
    if (!(n.lengthSq() > 1e-14)) continue;
    n.normalize();
    for (let k = 0; k < 3; k++) {
      const i = o + k * 3, l = Math.hypot(N[i], N[i + 1], N[i + 2]);
      if (!(l > 1e-6)) { N[i] = n.x; N[i + 1] = n.y; N[i + 2] = n.z; }
      else if (Math.abs(l - 1) > 1e-3) { N[i] /= l; N[i + 1] /= l; N[i + 2] /= l; }
    }
    keep.push(t);
  }
  if (keep.length === P.length / 9) return g;
  const p2 = new Float32Array(keep.length * 9), n2 = new Float32Array(keep.length * 9), u2 = new Float32Array(keep.length * 6);
  keep.forEach((t, j) => { p2.set(P.subarray(t * 9, t * 9 + 9), j * 9); n2.set(N.subarray(t * 9, t * 9 + 9), j * 9); u2.set(U.subarray(t * 6, t * 6 + 6), j * 6); });
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(p2, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(n2, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(u2, 2));
  out.userData = g.userData;
  return out;
}

// Regroupe les géométries par (groupe, matériau) pour limiter les draw calls
class Batcher {
  constructor() { this.map = new Map(); this.skip = null; }
  add(group, mat, geo, o = {}) {
    if (this.skip && this.skip(group, mat)) return; // pièce remplacée par le GLB extérieur (voir buildBoat)
    const cast = o.cast !== false, recv = o.receive !== false, order = o.order || 0;
    const key = `${group.uuid}|${mat.uuid}|${cast}|${recv}|${order}|${o.name || ''}`;
    let e = this.map.get(key);
    if (!e) { e = { group, mat, geos: [], cast, recv, order, name: o.name }; this.map.set(key, e); }
    const ng = normGeo(geo);
    if (o.athwart) ng.userData.athwart = true;
    if (o.keepUV) ng.userData.keepUV = true; // UV fournies (ex. fil de teck qui suit une courbe)
    e.geos.push(ng);
  }
  flush(uvScale) {
    const meshes = [];
    for (const e of this.map.values()) {
      const s = uvScale.get(e.mat);
      if (s) for (const g of e.geos) if (!g.userData.keepUV) worldUV(g, s[0], s[1]);
      const merged = e.geos.length === 1 ? e.geos[0] : mergeGeometries(e.geos, false);
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, e.mat);
      mesh.castShadow = e.cast; mesh.receiveShadow = e.recv;
      mesh.renderOrder = e.order;
      if (e.name) mesh.name = e.name;
      e.group.add(mesh);
      meshes.push(mesh);
    }
    this.map.clear();
    return meshes;
  }
}

// ---------------------------------------------------------------------------
// Textures procédurales
// ---------------------------------------------------------------------------
function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function canvasTex(c, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
function grain(g, r, x0, y0, w, h, count, color, aMin, aMax, wMax) {
  for (let k = 0; k < count; k++) {
    const y = y0 + 3 + r() * (h - 8);
    const amp = r() * 2.5, f = 1 + Math.floor(r() * 3), ph = r() * Math.PI * 2;
    g.strokeStyle = `rgba(${color},${aMin + r() * (aMax - aMin)})`;
    g.lineWidth = 0.6 + r() * wMax;
    g.beginPath();
    for (let x = 0; x <= w; x += 16) {
      const yy = y + amp * Math.sin((2 * Math.PI * f * x) / w + ph);
      if (x === 0) g.moveTo(x0 + x, yy); else g.lineTo(x0 + x, yy);
    }
    g.stroke();
  }
}
// --- outils « data » : bruit périodique, hauteur → normal map, cartes de rugosité --------------
function hash2(x, y, s) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 982451653)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const sstep = (t) => t * t * (3 - 2 * t);
function vnoise1(x, period, seed) { // bruit de valeur 1D périodique, [0,1]
  const i = Math.floor(x), f = sstep(x - i);
  const a = hash2(((i % period) + period) % period, 7, seed), b = hash2((((i + 1) % period) + period) % period, 7, seed);
  return a + (b - a) * f;
}
function vnoise2(x, y, px, py, seed) { // bruit de valeur 2D périodique (px, py cellules), [0,1]
  const i = Math.floor(x), j = Math.floor(y), fx = sstep(x - i), fy = sstep(y - j);
  const w = (a, p) => ((a % p) + p) % p;
  const i0 = w(i, px), i1 = w(i + 1, px), j0 = w(j, py), j1 = w(j + 1, py);
  const a = hash2(i0, j0, seed), b = hash2(i1, j0, seed), c = hash2(i0, j1, seed), d = hash2(i1, j1, seed);
  return (a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fy;
}
// carte de hauteur (Float32, W×H, périodique) → normal map tangente (convention OpenGL, v vers le haut)
function heightToNormal(h, W, H, strength) {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'), img = g.createImageData(W, H), d = img.data;
  for (let y = 0; y < H; y++) {
    const ym = ((y - 1 + H) % H) * W, yp = ((y + 1) % H) * W, yr = y * W;
    for (let x = 0; x < W; x++) {
      const xm = (x - 1 + W) % W, xp = (x + 1) % W;
      const nx = -(h[yr + xp] - h[yr + xm]) * 0.5 * strength;
      const ny = (h[yp + x] - h[ym + x]) * 0.5 * strength; // y canvas vers le bas = v vers le haut
      const il = 1 / Math.sqrt(nx * nx + ny * ny + 1), o = (yr + x) * 4;
      d[o] = (nx * il * 0.5 + 0.5) * 255; d[o + 1] = (ny * il * 0.5 + 0.5) * 255; d[o + 2] = (il * 0.5 + 0.5) * 255; d[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return canvasTex(c, false);
}
function floatToTex(f, W, H) { // carte scalaire [0,1] (rugosité : canal G lu par three)
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'), img = g.createImageData(W, H), d = img.data;
  for (let i = 0; i < W * H; i++) { const v = Math.max(0, Math.min(255, f[i] * 255)); d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v; d[i * 4 + 3] = 255; }
  g.putImageData(img, 0, 0);
  return canvasTex(c, false);
}
function blurWrap(f, W, H, rad, passes) { // flou boîte séparable périodique
  const t = new Float32Array(W * H), k = 1 / (2 * rad + 1);
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < H; y++) { const o = y * W; let s = 0; for (let i = -rad; i <= rad; i++) s += f[o + ((i + W) % W)]; for (let x = 0; x < W; x++) { t[o + x] = s * k; s += f[o + ((x + rad + 1) % W)] - f[o + ((x - rad + W) % W)]; } }
    for (let x = 0; x < W; x++) { let s = 0; for (let i = -rad; i <= rad; i++) s += t[((i + H) % H) * W + x]; for (let y = 0; y < H; y++) { f[y * W + x] = s * k; s += t[((y + rad + 1) % H) * W + x] - t[((y - rad + H) % H) * W + x]; } }
  }
  return f;
}
// profil transversal du fil (zones de printemps/été, lignes minérales) : renvoie un échantillonneur
function grainProfile(r, len, nLines, periodic) {
  const R = 4, p = new Float32Array(len * R);
  const bump = (c, w, a) => { for (let i = 0; i < p.length; i++) { let d = i / R - c; if (periodic) d -= Math.round(d / len) * len; p[i] += a * Math.exp(-(d * d) / (w * w)); } };
  for (let k = 0; k < 4; k++) bump(r() * len, 6 + r() * 16, (r() - 0.4) * 0.1);        // bandes larges (cœur / aubier)
  for (let k = 0; k < nLines; k++) bump(r() * len, 0.45 + r() * 1.0, 0.025 + r() * 0.09); // lignes de bois final
  if (r() < 0.18) bump(r() * len, 0.7 + r() * 0.7, 0.16 + r() * 0.1);                   // ligne minérale sombre
  return (y) => { let i = y * R; if (periodic) i = ((i % p.length) + p.length) % p.length; else i = Math.max(0, Math.min(p.length - 1, i)); const i0 = Math.floor(i), f = i - i0; return p[i0] * (1 - f) + p[Math.min(p.length - 1, i0 + 1)] * f; };
}

// Teck de pont : 8 lattes de 6 cm sur 2048×512 → tuile de 1,92 m × 0,48 m (≈0,94 mm/px), aboutages décalés.
// Teinte de base claire quasi neutre (multipliée par la couleur de l'option « Pont »), variation de ton et de
// teinte latte à latte, fil ondulé, fibres, blanchiment/grisaillement doux près des joints (teck poncé exposé),
// calfatage noir 4–5 mm à largeur irrégulière. Sorties : couleur + normal map (joint en creux, fil en relief,
// arêtes adoucies) + rugosité. composite = lame composite (fil atténué, joints clairs).
function makeTeakMaps(composite = false) {
  const W = 2048, H = 512, n = 8, ph = H / n, half = W / 2;
  const r = rng(composite ? 23 : 11);
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'), img = g.createImageData(W, H), d = img.data;
  const hgt = new Float32Array(W * H), rough = new Float32Array(W * H);
  // demi-largeurs des joints longitudinaux (irrégulières, périodiques en x) : précalculées
  const seamHW = Array.from({ length: n }, (_, i) => Float32Array.from({ length: W }, (_, x) => (4.0 + 0.9 * (vnoise1(x * 55 / W, 55, 100 + i) - 0.5) + 0.4 * (vnoise1(x * 230 / W, 230, 200 + i) - 0.5)) / 2)); // ≈3,5–4 mm
  // grisaillement basse fréquence, échantillonné tous les 4 px
  const WQ = W / 4, HQ = H / 4, wq = new Float32Array(WQ * HQ);
  for (let y = 0; y < HQ; y++) for (let x = 0; x < WQ; x++) wq[y * WQ + x] = vnoise2(x / 32, y / 16, W / 128, H / 64, 31) * 0.6 + vnoise2(x * 50 / WQ, y * 22 / HQ, 50, 22, 37) * 0.4;
  const caulk = composite ? [238, 233, 222] : [11, 10, 9]; // calfatage polysulfure noir franc
  const con = composite ? 0.25 : 1;
  const warp = new Float32Array(W), along = new Float32Array(W), segOf = new Uint8Array(W), dBut = new Float32Array(W);
  for (let i = 0; i < n; i++) {
    // rangée 0 (haut du canvas = v ∈ [0,875 ; 1] de la tuile, z monde ∈ [0,42 ; 0,48] mod 0,48) :
    // latte d'axe (« king plank ») d'un seul tenant — pas d'about, ton unique.
    const king = i === 0 && !composite;
    const y0 = i * ph, cut = Math.floor(r() * W);
    const segs = [0, 1].map(() => ({
      L: composite ? 0.80 + r() * 0.05 : 0.86 + r() * 0.13, hue: r() * 2 - 1, // dispersion latte à latte modérée
      prof: grainProfile(r, ph, composite ? 6 : 10 + Math.floor(r() * 7), false),
      wA: 1 + r() * 3, wf: 0.6 + r() * 1.6, wp: r() * 6.28, wp2: r() * 6.28, lf: 1 + r() * 2, lp: r() * 6.28, fs: Math.floor(r() * 1e6),
      bw: hash2(i, 3, 9) * 0.6 + 1.4, // demi-largeur du joint d'about
    }));
    if (king) segs[1] = segs[0];
    for (let x = 0; x < W; x++) { // grandeurs ne dépendant que de x pour cette rangée
      const xr = (x - cut + W) % W, si = king ? 0 : (xr < half ? 0 : 1), s = segs[si], u = king ? x / W : (xr % half) / half;
      segOf[x] = si; dBut[x] = king ? 1e4 : Math.min(xr, Math.abs(xr - half), W - xr) + 0.5;
      warp[x] = s.wA * Math.sin(6.2832 * u * Math.round(s.wf + 1) + s.wp) + 0.8 * Math.sin(6.2832 * u * (king ? 4 : 3.7) + s.wp2);
      along[x] = 1 + 0.035 * Math.sin(6.2832 * u * Math.round(s.lf) + s.lp);
    }
    const top = seamHW[i], bot = seamHW[(i + 1) % n];
    for (let ly = 0; ly < ph; ly++) {
      const y = y0 + ly;
      for (let x = 0; x < W; x++) {
        const s = segs[segOf[x]];
        const v = s.prof(ly + warp[x]);
        const fib = hash2((x >> 3) + s.fs, y, 5) - 0.5, fine = hash2(x, y, 6) - 0.5;
        let tone = s.L * (1 - v * con) * (1 + fib * 0.05 * con + fine * 0.025) * along[x];
        // joints : distance au joint longitudinal (haut/bas) et aux abouts
        const hwT = top[x], hwB = bot[x], dT = ly + 0.5, dB = ph - ly - 0.5, dBt = dBut[x];
        const covL = Math.max(Math.min(1, Math.max(0, hwT - dT + 0.5)), Math.min(1, Math.max(0, hwB - dB + 0.5)));
        const covB = Math.min(1, Math.max(0, s.bw - dBt + 0.5));
        const cov = Math.max(covL, covB);
        const dEdge = Math.min(dT - hwT, dB - hwB, dBt - s.bw); // distance à l'arête de la latte
        // vieillissement : grisaillement basse fréquence + arêtes blanchies
        const wn = wq[(y >> 2) * WQ + (x >> 2)];
        const edge = Math.max(0, 1 - Math.max(0, dEdge) / 7);
        // (blanchiment d'arête faible : un liseré clair annulait la ligne de joint vue de loin)
        const grey = composite ? 0 : 0.04 + 0.1 * wn + 0.03 * edge * edge;
        let R = 240 * tone * (1 + 0.06 * s.hue * con), G = 233 * tone, B = 221 * tone * (1 - 0.09 * s.hue * con);
        const Lm = (R * 0.3 + G * 0.59 + B * 0.11) * 1.04;
        R += (Lm - R) * grey; G += (Lm - G) * grey; B += (Lm * 1.01 - B) * grey;
        const o = (y * W + x) * 4;
        d[o] = R + (caulk[0] - R) * cov; d[o + 1] = G + (caulk[1] - G) * cov; d[o + 2] = B + (caulk[2] - B) * cov; d[o + 3] = 255;
        // relief : fil final légèrement en relief, arêtes arrondies, joint en creux avec ménisque
        const ease = dEdge < 2.5 ? (1 - sstep(Math.max(0, dEdge) / 2.5)) : 0;
        const woodH = v * (composite ? 0.25 : 1.0) + fib * 0.08 * con - 0.55 * ease;
        hgt[y * W + x] = woodH + (-1.1 - woodH) * cov;
        rough[y * W + x] = (composite ? 0.66 : 0.8 - v * 0.2 + 0.06 * edge + fib * 0.04) * (1 - cov) + (composite ? 0.7 : 0.52) * cov;
      }
    }
  }
  g.putImageData(img, 0, 0);
  return { map: canvasTex(c), normal: heightToNormal(hgt, W, H, 1.6), rough: floatToTex(rough, W, H) };
}
// teck massif (couvertines, table) : fil seul, sans joints (normal + rugosité tuilables), 1024×256
function makeSolidTeakMaps() {
  const W = 1024, H = 256, r = rng(4243);
  const prof = grainProfile(r, H, 60, true), hgt = new Float32Array(W * H), rough = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = x / W, yy = y + 2.2 * Math.sin(6.2832 * u * 2 + y * 0.05) + 1.1 * Math.sin(6.2832 * u * 5 + 1.3);
    const v = prof(yy), fib = hash2(x >> 3, y, 8) - 0.5;
    hgt[y * W + x] = v * 1.0 + fib * 0.1; rough[y * W + x] = 0.78 - v * 0.2 + fib * 0.04;
  }
  return { normal: heightToNormal(hgt, W, H, 1.4), rough: floatToTex(rough, W, H) };
}
// Parquet chêne clair (salon) : tuile 2,4 m × 1,2 m sur 2048×1024 (≈1,2 mm/px), 5 lames de 24 cm,
// aboutages décalés tous les ~1,2 m, micro-chanfrein sombre entre lames, fil droit + ondes larges.
// Couleur portée par la texture (material.color blanc). Normal + rugosité (0,45–0,62, sous vernis).
function makeOakFloorMaps() {
  const W = 2048, H = 1024, n = 5, ph = H / n, r = rng(515);
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'), img = g.createImageData(W, H), d = img.data;
  // R4 : plus de « taches » basse fréquence — ton latte à latte resserré (±6 %) + légère dérive de teinte,
  // fil serré (≈40 lignes / latte), pores allongés du chêne, fibres longues ; micro-chanfrein de 3 mm
  // (rampe + fond sombre) en pleine résolution (normal/rugosité 2048×1024).
  const WH = W / 2, hgt = new Float32Array(W * H), rough = new Float32Array(W * H);
  for (let i = 0; i < n; i++) {
    const y0 = Math.round(i * ph), y1 = Math.round((i + 1) * ph), cut = Math.floor(r() * W);
    const segs = [0, 1].map(() => ({ L: 0.9 + r() * 0.12, hue: r() * 2 - 1, prof: grainProfile(r, y1 - y0, 40, false), wA: 1.5 + r() * 3, wf: 0.5 + r(), wp: r() * 6.28, fs: Math.floor(r() * 1e6) }));
    for (let y = y0; y < y1; y++) {
      const ly = y - y0, dS = Math.min(ly + 0.5, y1 - y - 0.5);
      for (let x = 0; x < W; x++) {
        const xr = (x - cut + W) % W, s = segs[xr < WH ? 0 : 1], u = (xr % WH) / WH;
        const v = s.prof(ly + s.wA * Math.sin(6.2832 * u * s.wf + s.wp)) * 0.9;
        const fib = hash2((x >> 4) + s.fs, y, 12) - 0.5, fine = hash2(x, y, 13) - 0.5;
        const pr = hash2((x >> 2) + s.fs, y, 14), pore = pr > 0.86 ? (pr - 0.86) / 0.14 : 0; // pores : tirets sombres de 5 mm
        const dB = Math.min(xr, Math.abs(xr - WH), W - xr) + 0.5, dE = Math.min(dS, dB);
        const bev = dE < 2.6 ? 1 - dE / 2.6 : 0, core = dE < 1 ? 1 - dE : 0; // chanfrein 3 mm + fond de joint
        const t = s.L * (1 - v) * (1 + fib * 0.06 + fine * 0.03) * (1 - 0.16 * pore) * (1 - 0.22 * bev * bev - 0.4 * core);
        const o = (y * W + x) * 4;
        d[o] = 214 * t * (1 + 0.03 * s.hue); d[o + 1] = 190 * t; d[o + 2] = 156 * t * (1 - 0.05 * s.hue); d[o + 3] = 255;
        const k = y * W + x;
        hgt[k] = v * 0.45 + fib * 0.06 - pore * 0.18 - bev * bev * 1.3;
        rough[k] = 0.48 + v * 0.06 + pore * 0.18 + bev * 0.15;
      }
    }
  }
  g.putImageData(img, 0, 0);
  return { map: canvasTex(c), normal: heightToNormal(hgt, W, H, 1.4), rough: floatToTex(rough, W, H) };
}
// Coque « réelle » : tuile 1,6 m sur 1024 px. Normal = ondulation basse fréquence de carénage (λ ≈ 0,3–0,8 m,
// inclinaison RMS 0,02) + peau d'orange fine (RMS 0,012), intensités calibrées directement (normalScale 1).
// Rugosité (multiplicateur ≈ 0,86–1) : voile basse fréquence + traces de gouttes séchées très discrètes.
function makeHullFinishMaps() {
  const S = 1024, peel = new Float32Array(S * S), und = new Float32Array(S * S);
  for (let i = 0; i < peel.length; i++) peel[i] = hash2(i % S, (i / S) | 0, 177);
  blurWrap(peel, S, S, 2, 3);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++)
    und[y * S + x] = vnoise2(x * 2 / S, y * 3 / S, 2, 3, 61) + 0.6 * vnoise2(x * 5 / S, y * 4 / S, 5, 4, 62) + 0.3 * vnoise2(x * 9 / S, y * 7 / S, 9, 7, 63);
  const grad = (h, out) => { let ss = 0; for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const gx = h[y * S + (x + 1) % S] - h[y * S + (x - 1 + S) % S], gy = h[((y + 1) % S) * S + x] - h[((y - 1 + S) % S) * S + x];
    out[0][y * S + x] = gx; out[1][y * S + x] = gy; ss += gx * gx + gy * gy; } return Math.sqrt(ss / (S * S)) || 1; };
  const gP = [new Float32Array(S * S), new Float32Array(S * S)], gU = [new Float32Array(S * S), new Float32Array(S * S)];
  const kP = 0.012 / grad(peel, gP), kU = 0.02 / grad(und, gU);
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d'), img = g.createImageData(S, S), d = img.data;
  for (let i = 0; i < S * S; i++) {
    const nx = -(gP[0][i] * kP + gU[0][i] * kU), ny = gP[1][i] * kP + gU[1][i] * kU, il = 1 / Math.sqrt(nx * nx + ny * ny + 1);
    d[i * 4] = (nx * il * 0.5 + 0.5) * 255; d[i * 4 + 1] = (ny * il * 0.5 + 0.5) * 255; d[i * 4 + 2] = (il * 0.5 + 0.5) * 255; d[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  // (R4 : carte de rugosité « gouttes » supprimée — retirée de la coque en R3 : traînées verticales)
  return { normal: canvasTex(c, false) };
}
// Superstructure / toit (R4) : normal = peau d'orange fine (bosses ≈2–3 mm, inclinaison RMS 0,014) + très
// légère ondulation (RMS 0,006), tuile 0,8 m (repeat 2 sur l'échelle UV 1,6 m). Rugosité = voile isotrope
// basse fréquence seul (multiplicateur 0,84–1, λ ≈ 0,3–0,8 m) : aucune goutte ni détail fin → pas de traînées
// même là où la projection monde des UV est étirée.
function makeSuperFinishMaps() {
  const S = 512, peel = new Float32Array(S * S), und = new Float32Array(S * S);
  for (let i = 0; i < peel.length; i++) peel[i] = hash2(i % S, (i / S) | 0, 277);
  blurWrap(peel, S, S, 1, 3);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++)
    und[y * S + x] = vnoise2(x * 3 / S, y * 3 / S, 3, 3, 81) + 0.5 * vnoise2(x * 7 / S, y * 6 / S, 7, 6, 82);
  const grad = (h, out) => { let ss = 0; for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const gx = h[y * S + (x + 1) % S] - h[y * S + (x - 1 + S) % S], gy = h[((y + 1) % S) * S + x] - h[((y - 1 + S) % S) * S + x];
    out[0][y * S + x] = gx; out[1][y * S + x] = gy; ss += gx * gx + gy * gy; } return Math.sqrt(ss / (S * S)) || 1; };
  const gP = [new Float32Array(S * S), new Float32Array(S * S)], gU = [new Float32Array(S * S), new Float32Array(S * S)];
  const kP = 0.014 / grad(peel, gP), kU = 0.006 / grad(und, gU);
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d'), img = g.createImageData(S, S), d = img.data;
  for (let i = 0; i < S * S; i++) {
    const nx = -(gP[0][i] * kP + gU[0][i] * kU), ny = gP[1][i] * kP + gU[1][i] * kU, il = 1 / Math.sqrt(nx * nx + ny * ny + 1);
    d[i * 4] = (nx * il * 0.5 + 0.5) * 255; d[i * 4 + 1] = (ny * il * 0.5 + 0.5) * 255; d[i * 4 + 2] = (il * 0.5 + 0.5) * 255; d[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const normal = canvasTex(c, false); normal.repeat.set(2, 2);
  const R = 256, rough = new Float32Array(R * R);
  for (let y = 0; y < R; y++) for (let x = 0; x < R; x++)
    rough[y * R + x] = 0.92 + 0.08 * ((vnoise2(x * 2 / R, y * 2 / R, 2, 2, 91) - 0.5) * 1.4 + (vnoise2(x * 5 / R, y * 5 / R, 5, 5, 92) - 0.5) * 0.6);
  return { normal, rough: floatToTex(rough, R, R) };
}
// peau d'orange du vernis de coque : bosses de 3–6 mm, tuile 0,3 m sur 512 px
function makeOrangePeel() {
  const S = 512, f = new Float32Array(S * S);
  for (let i = 0; i < f.length; i++) f[i] = hash2(i % S, (i / S) | 0, 77);
  blurWrap(f, S, S, 3, 3);
  const f2 = new Float32Array(S * S); for (let i = 0; i < f2.length; i++) f2[i] = hash2(i % S, (i / S) | 0, 78);
  blurWrap(f2, S, S, 1, 2);
  let lo = Infinity, hi = -Infinity; for (let i = 0; i < f.length; i++) { f[i] = f[i] + 0.25 * f2[i]; lo = Math.min(lo, f[i]); hi = Math.max(hi, f[i]); }
  for (let i = 0; i < f.length; i++) f[i] = (f[i] - lo) / (hi - lo);
  return heightToNormal(f, S, S, 6);
}
// inox / alu brossé : stries longues selon u ; normal (micro-sillons) + rugosité striée (moyenne ≈0,85)
function makeBrushedMaps() {
  const W = 512, H = 512, r = rng(91), h = new Float32Array(W * H);
  const row = new Float32Array(H); for (let y = 0; y < H; y++) row[y] = r() - 0.5;
  for (let k = 0; k < 2600; k++) {
    const y = Math.floor(r() * H), x0 = Math.floor(r() * W), len = 30 + r() * 480, a = (r() - 0.5) * 1.2;
    for (let i = 0; i < len; i++) { const t = i / len; h[y * W + ((x0 + i) % W)] += a * Math.sin(Math.PI * t); }
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) h[y * W + x] = h[y * W + x] * 0.5 + row[y] * 0.3 + (hash2(x, y, 92) - 0.5) * 0.1;
  blurWrap(h, W, H, 1, 1); // adoucit les sauts d'une rangée à l'autre (sinon reflet « pointillé » sur les fûts)
  const rough = new Float32Array(W * H);
  for (let i = 0; i < h.length; i++) rough[i] = Math.max(0.55, Math.min(1, 0.85 + h[i] * 0.12));
  return { normal: heightToNormal(h, W, H, 0.9), rough: floatToTex(rough, W, H) };
}
// normal map + rugosité dérivées de la luminance d'un canvas de bois (pores et fil en creux)
function woodDetailFromCanvas(c, strength, rLo, rHi) {
  const W = c.width, H = c.height, d = c.getContext('2d').getImageData(0, 0, W, H).data;
  const h = new Float32Array(W * H), rough = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) { const l = (d[i * 4] * 0.3 + d[i * 4 + 1] * 0.59 + d[i * 4 + 2] * 0.11) / 255; h[i] = l; rough[i] = rLo + (rHi - rLo) * Math.min(1, Math.max(0, (0.95 - l) * 2.2)); }
  return { normal: heightToNormal(h, W, H, strength), rough: floatToTex(rough, W, H) };
}
// Bois intérieur : noyer en placage « flammé » (veinage cathédrale), pores fins, feuilles
// appairées en miroir avec de légères variations ; texture claire neutre (teintée par la couleur).
// Tuile 2,0 m × 0,5 m (uvScale) ; fil le long de u.
function makeWoodTexture() {
  const W = 2048, H = 512, LH = H / 2;
  const r = rng(29);
  const leaf = (seed) => {
    const rr = rng(seed);
    const c = document.createElement('canvas'); c.width = W; c.height = LH;
    const g = c.getContext('2d');
    const l = 232 + rr() * 10;
    g.fillStyle = `rgb(${l},${l - 7},${l - 16})`; g.fillRect(0, 0, W, LH);
    // nuances larges (bois de cœur / aubier)
    for (let k = 0; k < 14; k++) {
      const y = rr() * LH, h = 10 + rr() * 60;
      const grd = g.createLinearGradient(0, y - h, 0, y + h);
      const a = 0.04 + rr() * 0.07;
      grd.addColorStop(0, 'rgba(110,80,55,0)'); grd.addColorStop(0.5, `rgba(110,80,55,${a})`); grd.addColorStop(1, 'rgba(110,80,55,0)');
      g.fillStyle = grd; g.fillRect(0, y - h, W, 2 * h);
    }
    // fil droit de fond
    for (let k = 0; k < 140; k++) {
      const y = rr() * LH, amp = rr() * 3, f = 1 + Math.floor(rr() * 3), ph = rr() * 6.28;
      g.strokeStyle = `rgba(70,48,30,${0.03 + rr() * 0.12})`; g.lineWidth = 0.5 + rr() * 1.6;
      g.beginPath();
      for (let x = 0; x <= W; x += 16) { const yy = y + amp * Math.sin((2 * Math.PI * f * x) / W + ph); x ? g.lineTo(x, yy) : g.moveTo(x, yy); }
      g.stroke();
    }
    // flammes (veinage cathédrale) : arcs emboîtés ouverts vers +u, raccordés au fil droit
    const nF = 3 + Math.floor(rr() * 2);
    for (let f = 0; f < nF; f++) {
      const xt = (f + rr() * 0.6) * W / nF, yc = LH * (0.3 + rr() * 0.4), rings = 9 + Math.floor(rr() * 6);
      const spread = 0.45 + rr() * 0.4, len = 260 + rr() * 260;
      for (let k = 1; k <= rings; k++) {
        const hw = k * (5 + rr() * 2.5); // demi-ouverture
        g.strokeStyle = `rgba(62,40,24,${0.08 + rr() * 0.16})`; g.lineWidth = 0.8 + rr() * 1.8;
        for (const dx of [0, -W, W]) {
          g.beginPath();
          for (let t = -1; t <= 1.0001; t += 0.05) {
            const y = yc + t * hw;
            const x = xt + dx + k * 9 + (t * t) * hw / spread * 1.8;
            t === -1 ? g.moveTo(x, y) : g.lineTo(x, y);
          }
          // les deux branches repartent en fil droit
          const xe = xt + dx + k * 9 + hw / spread * 1.8;
          g.moveTo(xe, yc - hw); g.bezierCurveTo(xe + len * 0.4, yc - hw * 1.05, xe + len * 0.7, yc - hw * 1.1, xe + len, yc - hw * 1.12);
          g.moveTo(xe, yc + hw); g.bezierCurveTo(xe + len * 0.4, yc + hw * 1.05, xe + len * 0.7, yc + hw * 1.1, xe + len, yc + hw * 1.12);
          g.stroke();
        }
      }
    }
    // pores fins (traits courts sombres dans le sens du fil)
    for (let k = 0; k < 9000; k++) {
      const x = rr() * W, y = rr() * LH, len = 2 + rr() * 7;
      g.fillStyle = `rgba(45,30,18,${0.08 + rr() * 0.22})`;
      g.fillRect(x, y, len, rr() < 0.7 ? 1 : 1.6);
    }
    return c;
  };
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const a = leaf(29 + Math.floor(r() * 100));
  g.drawImage(a, 0, 0);
  g.save(); g.translate(0, H); g.scale(1, -1); g.drawImage(a, 0, 0); g.restore(); // feuille appairée en miroir
  // légère différence de teinte entre feuilles + joint de placage très fin
  g.fillStyle = 'rgba(255,245,230,0.05)'; g.fillRect(0, LH, W, LH);
  g.fillStyle = 'rgba(60,40,25,0.25)'; g.fillRect(0, LH - 0.5, W, 1); g.fillRect(0, 0, W, 0.5);
  // pores et fil légèrement en creux sous un vernis satiné (rugosité de base 0,38 → 0,62 dans les pores)
  const det = woodDetailFromCanvas(c, 5, 0.38, 0.62);
  return { map: canvasTex(c), normal: det.normal, rough: det.rough };
}
function makeScreenTexture() {
  const W = 512, H = 320;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, '#16324f'); grd.addColorStop(1, '#0a1626');
  g.fillStyle = grd; g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(120,180,255,0.25)'; g.lineWidth = 1;
  for (let x = 0; x < W; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
  for (let y = 0; y < H; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
  g.strokeStyle = 'rgba(160,220,255,0.9)'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(40, 280); g.bezierCurveTo(160, 220, 260, 200, 470, 50); g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.85)';
  g.fillRect(16, 16, 140, 10); g.fillRect(16, 34, 90, 8);
  g.beginPath(); g.arc(260, 196, 8, 0, Math.PI * 2); g.fill();
  return canvasTex(c);
}

// Cartes partagées (remplies par buildBoat) — réutilisées par refineBoatMaterials / main.js
const TEX = {};

// --- matériaux à shader étendu ------------------------------------------------------------
// onBeforeCompile défini sur le PROTOTYPE : survit à material.clone() (fondu de coupe de stage.js).
// Bandeaux LED (MeshBasic) : gain jour/nuit partagé, piloté par main.js via setLedGain().
const LED_GAIN = { value: 1 };
export function setLedGain(v) { LED_GAIN.value = v; }
class GainBasicMaterial extends THREE.MeshBasicMaterial {
  onBeforeCompile(s) {
    s.uniforms.uLedGain = LED_GAIN;
    s.fragmentShader = 'uniform float uLedGain;\n' + s.fragmentShader.replace('#include <opaque_fragment>', '#include <opaque_fragment>\n\tgl_FragColor.rgb *= uLedGain;');
  }
  customProgramCacheKey() { return 'gainBasic'; }
}
// Physique à reflet d'environnement plafonné (vitrage, acrylique) : la réflexion IBL (et celle du vernis)
// est limitée à userData.envCap (luminance linéaire, défaut 0,5) → un panneau ne peut plus virer au blanc
// plat face à un ciel clair ; le reflet direct du soleil reste libre (scintillement conservé).
class CappedPhysicalMaterial extends THREE.MeshPhysicalMaterial {
  onBeforeCompile(s) {
    const mat = this;
    s.uniforms.uEnvCap = { get value() { return mat.userData.envCap ?? 0.5; } };
    // userData.transGlow (Color linéaire, optionnel) : « transmission » simulée — lumière de l'intérieur vue à
    // travers l'acrylique fumé ∝ éclairement ambiant (IBL) × (1 − Fresnel) : gris fumé vu d'en haut, miroir sombre en rasant.
    const zero = new THREE.Color(0, 0, 0), tg = new THREE.Color();
    // (material.clone() copie userData en JSON : transGlow y redevient un simple {r, g, b} -> reconverti en Color)
    s.uniforms.uTransGlow = { get value() { const g = mat.userData.transGlow; return !g ? zero : g.isColor ? g : tg.setRGB(g.r, g.g, g.b); } };
    s.fragmentShader = 'uniform float uEnvCap;\nuniform vec3 uTransGlow;\n' + s.fragmentShader.replace('#include <lights_fragment_end>',
      '#include <lights_fragment_end>\n\t{ float capM = max( max( reflectedLight.indirectSpecular.r, reflectedLight.indirectSpecular.g ), max( reflectedLight.indirectSpecular.b, 1e-4 ) );\n' +
      '\t  reflectedLight.indirectSpecular *= min( 1.0, uEnvCap / capM );\n' +
      '#ifdef USE_CLEARCOAT\n\t  float capC = max( max( clearcoatSpecularIndirect.r, clearcoatSpecularIndirect.g ), max( clearcoatSpecularIndirect.b, 1e-4 ) );\n' +
      '\t  clearcoatSpecularIndirect *= min( 1.0, uEnvCap / capC );\n#endif\n' +
      '\t  float tNV = saturate( dot( geometryNormal, geometryViewDir ) ), tF = 0.04 + 0.96 * pow( 1.0 - tNV, 5.0 );\n' +
      '\t  reflectedLight.indirectDiffuse += uTransGlow * dot( iblIrradiance, vec3( 0.2126, 0.7152, 0.0722 ) ) * ( 1.0 - tF ) * tNV;\n\t}');
  }
  customProgramCacheKey() { return 'cappedPhysical'; }
}
// Couche de teinte du vitrage : dst × teinte × (1 − F), Fresnel de Schlick (F0 = 0,053, ior 1,6).
// Aux incidences rasantes (reflet dans l'eau, vue de dessous) la transmission s'éteint : la couche
// additive M.glass (réflexion) prend le relais, comme un vrai vitrage.
class GlassTintMaterial extends THREE.MeshBasicMaterial {
  onBeforeCompile(s) {
    s.vertexShader = 'varying vec3 vTintN;\nvarying vec3 vTintV;\n' + s.vertexShader.replace('#include <project_vertex>',
      '#include <project_vertex>\n\tvTintN = normalize( normalMatrix * normal );\n\tvTintV = - mvPosition.xyz;');
    s.fragmentShader = 'varying vec3 vTintN;\nvarying vec3 vTintV;\n' + s.fragmentShader.replace('#include <opaque_fragment>',
      '#include <opaque_fragment>\n\tfloat tintC = 1.0 - abs( dot( normalize( vTintN ), normalize( vTintV ) ) );\n' +
      '\tfloat tintF = 0.053 + 0.947 * tintC * tintC * tintC * tintC * tintC;\n\tgl_FragColor.rgb *= 1.0 - tintF;');
  }
  customProgramCacheKey() { return 'glassTintFresnel'; }
}
// Ligne de flottaison mouillée (coordonnées monde, la bande reste au niveau de la mer quand le bateau
// tangue) : teinte assombrie, rugosité et rugosité du vernis réduites, bord doux. Indépendant de la
// couleur et de la finition (agit en multiplicateur). Les uniforms sont partagés : réglables à chaud.
// (la peinture de coque commence à y = 0,05 : bande pleine jusqu'à 0,06, fondu jusqu'à 0,2)
const WET = { lo: { value: 0.06 }, hi: { value: 0.2 }, on: { value: 1 } };
export function setWetLine(k) { WET.on.value = k; } // 0 en showroom (pas d'eau : la bande y paraîtrait « coupée »)
function addWetLine(mat, darken, gloss) {
  const uD = { value: darken }, uG = { value: gloss };
  mat.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, { uWetLo: WET.lo, uWetHi: WET.hi, uWetOn: WET.on, uWetDark: uD, uWetGloss: uG });
    s.vertexShader = 'varying float vWetY;\n' + s.vertexShader.replace('#include <project_vertex>',
      '#include <project_vertex>\n\tvWetY = ( modelMatrix * vec4( transformed, 1.0 ) ).y;');
    s.fragmentShader = 'varying float vWetY;\nuniform float uWetLo, uWetHi, uWetOn, uWetDark, uWetGloss;\n' + s.fragmentShader
      .replace('#include <color_fragment>', '#include <color_fragment>\n\tfloat wetK = uWetOn * ( 1.0 - smoothstep( uWetLo, uWetHi, vWetY ) );\n\tdiffuseColor.rgb *= 1.0 - uWetDark * wetK;')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n\troughnessFactor *= 1.0 - uWetGloss * wetK;')
      .replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\n#ifdef USE_CLEARCOAT\n\tmaterial.clearcoatRoughness = clamp( material.clearcoatRoughness * ( 1.0 - uWetGloss * wetK ), 0.0525, 1.0 );\n#endif');
  };
  mat.customProgramCacheKey = () => 'wetLine';
  return mat;
}

// Passe de finition des matériaux, appelée par main.js juste après buildBoat() (avant stage.setBoat) :
//  1. vitrage en deux couches : transmission teintée multiplicative (dst × teinte, sous) + réflexion
//     physique additive (Fresnel, soleil, ciel : M.glass, dessus). Pas de transmission three.js : elle
//     re-rendrait toute la scène opaque (×2 avec le reflet de la mer) et ignorerait l'océan transparent.
//  2. inox (M.chrome, créé par interior.js) : brossage circonférentiel + anisotropie.
//  3. teck massif cloné de M.deck par interior.js (même Color partagée) : fil sans joints de calfatage.
// Renvoie une petite API (cartes de pont alternatives) utilisée par les options.
export function refineBoatMaterials(boat, opts = {}) {
  const M = boat.materials, root = boat.root;
  if (!M.glassTint) {
    M.glassTint = new GlassTintMaterial({
      color: 0x8d969e, transparent: true, premultipliedAlpha: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.DstColorFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    const glassMeshes = [];
    root.traverse((o) => { if (o.isMesh && o.material === M.glass) glassMeshes.push(o); });
    for (const m of glassMeshes) {
      const t = new THREE.Mesh(m.geometry, M.glassTint);
      t.position.copy(m.position); t.quaternion.copy(m.quaternion); t.scale.copy(m.scale);
      t.matrixAutoUpdate = m.matrixAutoUpdate; if (!m.matrixAutoUpdate) t.matrix.copy(m.matrix);
      t.renderOrder = m.renderOrder; m.renderOrder += 1; // teinte d'abord, reflet ensuite
      t.castShadow = t.receiveShadow = false; t.raycast = () => {};
      t.name = 'glassTint';
      m.parent.add(t);
    }
  }
  // (M.chrome : inox 316 poli, défini dans buildBoat et partagé avec interior.js — plus de brossage)
  // Sol du salon : parquet chêne clair à larges lames sous vernis satiné (remplace la dalle sombre posée
  // par interior.js ; même objet M.interiorFloor, UV monde de interior.js = tuile 2,4 m → repeat (1, 2)).
  if (M.interiorFloor && !M.interiorFloor.userData.__oak) {
    const oak = makeOakFloorMaps();
    for (const t of [oak.map, oak.normal, oak.rough]) t.repeat.set(1, 2);
    Object.assign(M.interiorFloor, { map: oak.map, normalMap: oak.normal, roughnessMap: oak.rough, roughness: 1, metalness: 0,
      clearcoat: 0.3, clearcoatRoughness: 0.12, envMapIntensity: 1.0 });
    M.interiorFloor.normalScale.set(0.5, 0.5);
    M.interiorFloor.color.set(0xb4a186); // chêne naturel moyen sous vernis (plus clair : « délavé » sous l'éclairage du salon)
    M.interiorFloor.clearcoatRoughness = 0.08; // reflets de baies lisibles
    M.interiorFloor.userData.__oak = true; M.interiorFloor.needsUpdate = true;
  }
  // plafonds de reflet IBL (CappedPhysicalMaterial) ; écrans de interior.js : verre antireflet
  if (M.glass) M.glass.userData.envCap ??= 0.45;
  if (M.acrylic) {
    M.acrylic.userData.envCap ??= 0.7; // R5 : fumé + reflet du ciel lisibles vus du dessus
    M.acrylic.userData.transGlow ??= new THREE.Color(0x3a4044).multiplyScalar(1.3); // Color(hex) = linéaire
  }
  for (const m of [M.screenRadar, M.screenSystems]) if (m) m.envMapIntensity = 0.25;
  // filtrage anisotrope au maximum du GPU sur les cartes à joints fins (pont en vue rasante, parquet)
  const aniso = opts.maxAnisotropy || 8;
  TEX.aniso = aniso;
  for (const m of [M.deck, M.interiorFloor, M.woodInterior]) for (const k of ['map', 'normalMap', 'roughnessMap']) {
    const t = m && m[k]; if (t && t.anisotropy !== aniso) { t.anisotropy = aniso; t.needsUpdate = true; }
  }
  if (TEX.solidTeak) {
    const seen = new Set();
    root.traverse((o) => {
      if (!o.isMesh) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        if (!m || seen.has(m) || m === M.deck || m.color !== M.deck.color) continue;
        seen.add(m);
        m.normalMap = TEX.solidTeak.normal; m.roughnessMap = TEX.solidTeak.rough;
        m.normalScale.set(0.6, 0.6); m.needsUpdate = true;
      }
    });
  }
  const deckCache = { teak: TEX.teak };
  return {
    deckMaps(kind) { // 'teak' | 'composite' (générée à la demande)
      if (!deckCache[kind]) {
        deckCache[kind] = makeTeakMaps(kind === 'composite');
        for (const t of Object.values(deckCache[kind])) t.anisotropy = TEX.aniso || 8;
      }
      return deckCache[kind];
    },
    // cartes générées ici (libérées par main.js à la bascule de modèle)
    textures() { return Object.values(deckCache).flatMap((c) => Object.values(c)).filter((t) => t && t.isTexture); },
  };
}

// ---------------------------------------------------------------------------
// Extérieur Blender (GLB : assets/diedre29-exterior.glb, voir blender/build.py)
// ---------------------------------------------------------------------------
// Nœuds racines 'hull', 'superstructure', 'roof', 'upperGlass' (= groupes three.js) ; maillages déjà en repère
// three (+X avant, +Y haut, +Z tribord, m). Nom de matériau glTF = clé de `materials` : chaque primitive reçoit
// le matériau partagé du configurateur (options couleur / teck / vitrage / ambiances inchangées).
// UV du GLB en mètres (1 UV = 1 m, projection monde par face comme worldUV, fil du teck le long de u), V inversé
// par l'export glTF (v = 1 − v_Blender) : on rétablit v puis on divise par uvScale (densité identique à worldUV).
const PLANK_P = 0.06; // pas des lattes du pont (joints de la texture de teck à w = k·P)
// Lattes du GLB qui chevauchent un joint peint de la texture (latte de rive de 14 cm et sa courbe, latte d'axe
// à cheval sur z = 0, lattes de plateforme / marches décalées) : chaque latte prend UNE rangée de la texture sur
// toute sa largeur (repère : groupes de sommets de même u = une section de latte) → plus de joint peint au milieu
// d'une latte réelle. kingRow : lattes longues du pont (rive, axe) sur la rangée 0 (« king plank », sans about,
// comme le pont procédural) ; sinon rangée = rang de la latte (tons alternés comme le reste du pont).
function remapPlanks(g, U, W, kingRow) {
  const n = U.length, idx = g.index && g.index.array;
  if (!idx) return;
  const par = new Int32Array(n); for (let i = 0; i < n; i++) par[i] = i;
  const find = (i) => { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; };
  for (let t = 0; t < idx.length; t += 3) {
    const a = find(idx[t]), b = find(idx[t + 1]), c = find(idx[t + 2]);
    par[b] = a; par[c] = a;
  }
  const comps = new Map();
  for (let i = 0; i < n; i++) { const r = find(i); let c = comps.get(r); if (!c) comps.set(r, (c = [])); c.push(i); }
  const out = new Map();
  for (const vs of comps.values()) {
    const rows = new Map();
    let u0 = Infinity, u1 = -Infinity;
    for (const i of vs) {
      const k = Math.round(U[i] * 1e4);
      let r = rows.get(k); if (!r) rows.set(k, (r = { lo: Infinity, hi: -Infinity }));
      r.lo = Math.min(r.lo, W[i]); r.hi = Math.max(r.hi, W[i]);
      u0 = Math.min(u0, U[i]); u1 = Math.max(u1, U[i]);
    }
    let straddle = false;
    for (const r of rows.values()) if (Math.ceil((r.lo + 0.004) / PLANK_P) * PLANK_P < r.hi - 0.004) { straddle = true; break; }
    if (!straddle) continue;
    let wm = 0; for (const i of vs) wm += W[i];
    const row = kingRow && u1 - u0 > 0.9 ? 0 : ((Math.round(wm / vs.length / PLANK_P) % 8) + 8) % 8;
    for (const i of vs) {
      const r = rows.get(Math.round(U[i] * 1e4)), t = r.hi - r.lo > 1e-6 ? (W[i] - r.lo) / (r.hi - r.lo) : 0.5;
      out.set(i, 1 - (row + 0.08 + 0.84 * t) / 8);
    }
  }
  return out;
}
function prepareExteriorUV(g, mat, uvScale, plank, kingRow) {
  const a = g.attributes.uv;
  if (!a) return;
  const n = a.count, U = new Float32Array(n), W = new Float32Array(n);
  for (let i = 0; i < n; i++) { U[i] = a.getX(i); W[i] = 1 - a.getY(i); }
  const s = uvScale.get(mat) || [1, 1];
  const rows = plank ? remapPlanks(g, U, W, kingRow) : null;
  const uv = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    uv[i * 2] = U[i] / s[0];
    uv[i * 2 + 1] = rows && rows.has(i) ? rows.get(i) : W[i] / s[1];
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}
// Fond calfaté du pont GLB (joints géométriques de 5 mm entre lattes réelles) : de loin, le joint devient
// sous-pixel et crénelle (pointillés noirs sur tout le pont, vue de dessus). Le calfatage du groupe hull prend
// donc, quand l'empreinte d'un pixel dépasse ~2 mm, la teinte moyenne du pont (M.deck.color × moyenne de la
// carte, joints peints compris) — comme le ferait le mipmap d'une texture. Le calfatage des vitrages garde M.caulk.
function mapMean(tex, cache) {
  const img = tex && tex.image;
  if (!img || !img.width) return null;
  let c = cache.get(img);
  if (!c) {
    const cv = document.createElement('canvas'); cv.width = 32; cv.height = 8;
    const g = cv.getContext('2d'); g.drawImage(img, 0, 0, 32, 8);
    const d = g.getImageData(0, 0, 32, 8).data, s = [0, 0, 0];
    for (let i = 0; i < d.length; i += 4) for (let k = 0; k < 3; k++) s[k] += d[i + k] / 255;
    c = new THREE.Color().setRGB(s[0] / 256, s[1] / 256, s[2] / 256, THREE.SRGBColorSpace);
    cache.set(img, c);
  }
  return c;
}
function makeDeckCaulk(M) {
  const m = M.caulk.clone();
  m.name = 'deckCaulk';
  const far = new THREE.Color(), cache = new Map();
  const uFar = { get value() { const a = mapMean(M.deck.map, cache); far.copy(M.deck.color); if (a) far.multiply(a); return far; } };
  m.onBeforeCompile = (s) => {
    s.uniforms.uCaulkFar = uFar;
    s.fragmentShader = 'uniform vec3 uCaulkFar;\n' + s.fragmentShader.replace('#include <color_fragment>',
      '#include <color_fragment>\n\t{ float caulkFp = length( fwidth( vViewPosition ) );\n' +
      '\t  diffuseColor.rgb = mix( diffuseColor.rgb, uCaulkFar, smoothstep( 0.0015, 0.006, caulkFp ) ); }');
  };
  m.customProgramCacheKey = () => 'deckCaulkFar';
  return m;
}
// Ajoute les maillages du GLB dans les groupes du configurateur ; renvoie le nombre de maillages ajoutés.
export function addExterior(scene, groups, M, uvScale) {
  scene.updateMatrixWorld(true);
  const done = new Set(), unused = new Set();
  let count = 0;
  for (const [key, group] of Object.entries(groups)) {
    const src = scene.children.find((o) => o.name === key);
    if (!src) { console.warn(`[boat] GLB extérieur : nœud « ${key} » absent`); continue; }
    const inv = new THREE.Matrix4().copy(src.matrixWorld).invert();
    const list = [], batches = new Map(); // matériau → primitives (fusionnées : un draw call par groupe × matériau)
    src.traverse((o) => { if (o.isMesh) list.push(o); });
    for (const o of list) {
      let top = o; while (top.parent && top.parent !== src) top = top.parent; // nœud glTF (objet Blender)
      for (const gm of Array.isArray(o.material) ? o.material : [o.material]) unused.add(gm);
      const key2 = o.material && o.material.name;
      let mat = M[key2];
      if (mat && mat === M.caulk && group === groups.hull) mat = M.deckCaulk || (M.deckCaulk = makeDeckCaulk(M));
      if (!mat || !mat.isMaterial) { console.warn(`[boat] GLB extérieur : matériau « ${key2} » inconnu (${top.name}) — ignoré`); continue; }
      let g = o.geometry;
      if (!done.has(g)) {
        done.add(g);
        prepareExteriorUV(g, mat, uvScale, mat === M.deck && /Boards$/.test(top.name), top.name === 'hull_deckBoards');
      }
      const mx = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
      g = g.clone();
      if (!mx.equals(new THREE.Matrix4())) g.applyMatrix4(mx);
      for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      if (!g.index) g.setIndex([...Array(g.attributes.position.count).keys()]);
      g.morphAttributes = {}; g.clearGroups();
      let e = batches.get(mat); if (!e) batches.set(mat, (e = { geos: [], names: [] }));
      e.geos.push(g); e.names.push(top.name);
    }
    for (const [mat, e] of batches) {
      let parts = [e.geos[0]];
      if (e.geos.length > 1) {
        const merged = mergeGeometries(e.geos, false);
        parts = merged ? [merged] : e.geos; // (repli : un maillage par primitive)
      }
      const short = [...new Set(e.names.map((n) => (n.startsWith(key + '__') ? n.split('__').pop() : n.replace(/^hull_/, ''))))];
      const label = `${key}__${Object.keys(M).find((k) => M[k] === mat) || mat.name}__${short.join('+')}`;
      for (const g of parts) {
        g.computeBoundingSphere();
        const m = new THREE.Mesh(g, mat);
        m.name = label;
        const glass = mat === M.glass;
        m.castShadow = !glass; m.receiveShadow = !glass;
        if (glass) m.renderOrder = 3; // comme les vitrages procéduraux (teinte en 3, reflet en 4 : refineBoatMaterials)
        group.add(m);
        count++;
      }
    }
  }
  for (const gm of unused) gm.dispose(); // matériaux glTF remplacés
  for (const g of done) g.dispose();     // géométries glTF d'origine (copiées / fusionnées ci-dessus)
  return count;
}

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------
// opts.exterior : scène GLTF (gltf.scene) de l'extérieur Blender — remplace coque, pont, superstructure, vitrage
// et peau du toit procéduraux (voir addExterior et la liste des pièces conservées plus bas).
// Matériaux partagés du configurateur (clés = noms de matériaux des GLB Blender) et densités UV (m par tuile).
// Appelée par buildBoat (DIÈDRE 29) et buildCatamaran (js/catamaran.js) : chaque bateau a ses propres instances.
export function createBoatMaterials() {
  const phys = (p) => new THREE.MeshPhysicalMaterial(p);
  const teak = makeTeakMaps();
  const wood = makeWoodTexture();
  const peel = makeOrangePeel();
  const superFin = makeSuperFinishMaps();
  const brushed = makeBrushedMaps();
  Object.assign(TEX, { teak, brushed, peel, solidTeak: makeSolidTeakMaps() });
  const teakTex = teak.map;
  const screenTex = makeScreenTexture();
  const v2 = (a) => new THREE.Vector2(a, a);

  // Rugosités : les cartes (brossé ≈0,85 en moyenne, teck absolu) multiplient material.roughness.
  // envMapIntensity = valeur de base (stage.js la module ensuite selon l'ambiance).
  const materials = {
    // laque bi-couche : base + vernis (clearcoat) à peau d'orange subtile ; finition pilotée par main.js
    // + ligne de flottaison mouillée (addWetLine : bande monde y ≈ 0,04 → 0,14, bord doux)
    // finition : ondulation de carénage + peau d'orange (normal, base ET vernis) + voile/gouttes (rugosités)
    // R5 : aucune carte (normal / rugosité) sur la coque — le relief de carénage marbrait les flancs sombres
    // (nuages gris, rideaux verticaux). Laque miroir nette : vernis très lisse, reflet en bande franche.
    hull: addWetLine(phys({ color: 0x232426, roughness: 0.25, metalness: 0.08, clearcoat: 1.0, clearcoatRoughness: 0.03,
      envMapIntensity: 1.0 }), 0.3, 0.55),
    // antifouling satiné (un peu de reflet : sinon bloc noir qui se fond dans le sol du showroom)
    hullBottom: addWetLine(phys({ color: 0x141517, roughness: 0.7, metalness: 0.0, envMapIntensity: 0.65 }), 0.12, 0.45),
    // bandeau / joncs : métal brossé dans le sens de la longueur (u = x en projection monde).
    // Pas d'anisotropie ici : avec la projection monde par faces, le repère tangent bascule aux arêtes
    // et étire le reflet du soleil en traînées verticales parasites (testé) ; réservée à l'inox tourné.
    accent: phys({ color: 0x8c7a68, metalness: 0.9, roughness: 0.35, roughnessMap: brushed.rough, normalMap: brushed.normal, normalScale: v2(0.12), envMapIntensity: 1.25 }),
    superstructure: phys({ color: 0x60564d, metalness: 0.6, roughness: 0.38, clearcoat: 1.0, clearcoatRoughness: 0.3,
      // R4 : peau d'orange fine + voile de rugosité basse fréquence (makeSuperFinishMaps) : reflets « cassés » sans traînées
      normalMap: superFin.normal, normalScale: v2(1), clearcoatNormalMap: superFin.normal, clearcoatNormalScale: v2(1),
      roughnessMap: superFin.rough, clearcoatRoughnessMap: superFin.rough,
      envMapIntensity: 1.15, side: THREE.DoubleSide }),
    // couche « réflexion » du vitrage (additive : Fresnel + soleil + ciel) ; la teinte est M.glassTint (refineBoatMaterials).
    // Vitrage de yacht à couche réfléchissante : F0 ≈ 0,08, F90 1,5 (specularIntensity) → miroir sombre vu de l'extérieur.
    // Reflet IBL plafonné (CappedPhysicalMaterial, userData.envCap ≈ 0,45) : jamais de panneau blanc plat.
    glass: new CappedPhysicalMaterial({ color: 0x000000, metalness: 0, roughness: 0.012, ior: 1.6, specularIntensity: 1.2, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false, envMapIntensity: 2.2 }),
    // inox 316 poli miroir (taquets, main courante, mâts d'arceau ; interior.js : table, barre — voir plus bas)
    chrome: phys({ color: 0xd8dadc, metalness: 1, roughness: 0.08, envMapIntensity: 1.3 }),
    // acrylique fumé des panneaux de pont : quasi noir, vernis miroir (reflète ciel et soleil)
    // (gris fumé, pas noir ; reflet plafonné ; pas de clearcoat : il doublait le reflet rasant → dalle blanche.
    //  « Légère transmission » simulée par la base grise : la vraie transmission three coûterait une passe opaque.)
    // R4 : gris fumé #3a4044, « transmission ≈ 0,5 » simulée (userData.transGlow, voir CappedPhysicalMaterial),
    // reflet du ciel lisible (plafond 0,55) ; chants arrondis du panneau (rboxG r = 5 mm) → liseré de reflet.
    acrylic: new CappedPhysicalMaterial({ color: 0x1c2023, metalness: 0, roughness: 0.03, ior: 1.49, specularIntensity: 1.6, envMapIntensity: 1.4 }),
    // teck poncé : ton/teinte par latte, fil en relief, calfatage en creux, éclat (sheen) de fibre sèche
    deck: phys({ color: 0x9c8064, map: teakTex, normalMap: teak.normal, normalScale: v2(0.8), roughnessMap: teak.rough, roughness: 1, metalness: 0, sheen: 0.35, sheenRoughness: 0.65, sheenColor: 0x6a5642, envMapIntensity: 0.6 }),
    // calfatage polysulfure noir (même ton/rugosité que les joints de la texture de pont) : pour les joints
    // géométriques — encastrements (nibbing) des lattes dans la latte de rive, pourtour de la latte d'axe
    caulk: phys({ color: 0x0b0a09, roughness: 0.5, metalness: 0, envMapIntensity: 0.5 }),
    upholsteryInterior: phys({ color: 0x1b2536, roughness: 0.55, clearcoat: 0.12, clearcoatRoughness: 0.6, sheen: 0.4, sheenColor: 0x56627a, sheenRoughness: 0.6 }),
    upholsteryExterior: phys({ color: 0xe6e0d3, roughness: 0.9, sheen: 0.6, sheenColor: 0xffffff, sheenRoughness: 0.8 }),
    // noyer : pores en creux sous vernis satiné (clearcoat lisse au-dessus d'une base texturée)
    woodInterior: phys({ color: 0x6b4128, map: wood.map, normalMap: wood.normal, normalScale: v2(0.3), roughnessMap: wood.rough, roughness: 1, clearcoat: 0.35, clearcoatRoughness: 0.2 }),
    interiorFloor: phys({ color: 0x3a3b3e, map: teakTex, roughness: 0.55 }),
    ceiling: phys({ color: 0xe8e2d8, roughness: 0.9 }),
    // noir PVD / anodisé : métal sombre brossé (taquets, montants, arceau)
    metalDark: phys({ color: 0x2a2c2f, metalness: 0.85, roughness: 0.37, roughnessMap: brushed.rough, normalMap: brushed.normal, normalScale: v2(0.08), envMapIntensity: 1.1 }),
    // écrans : verre antireflet (reflet d'environnement faible, sinon voile laiteux)
    screens: phys({ color: 0x05080d, emissive: 0xbfd8ff, emissiveMap: screenTex, emissiveIntensity: 1.4, roughness: 0.15, clearcoat: 1, envMapIntensity: 0.25 }),
    ledStrip: new GainBasicMaterial({ color: 0xffb86b }), // gain jour/nuit (setLedGain, main.js)
    underwaterLight: phys({ color: 0x0a0a0a, emissive: 0x6fdcff, emissiveIntensity: 3 }),
    // propulsion (GLB Blender) : hélices en bronze nickel-aluminium poli, anodes zinc mat
    propBronze: phys({ color: 0xb5895a, metalness: 1, roughness: 0.2, envMapIntensity: 1.2, side: THREE.DoubleSide }),
    zinc: phys({ color: 0x9a9c9e, metalness: 0.55, roughness: 0.55, envMapIntensity: 0.8 }),
    navRed: phys({ color: 0x300000, emissive: 0xff2a1a, emissiveIntensity: 2 }),
    navGreen: phys({ color: 0x002a10, emissive: 0x1aff6a, emissiveIntensity: 2 }),
    navWhite: phys({ color: 0x303030, emissive: 0xffffff, emissiveIntensity: 1.5 }),
    name: null,
  };
  // Un seul inox pour tout le bateau : interior.js fait « M.chrome = phys(...) » (inox 0,14 plus terne).
  // L'affectation est absorbée (setter sans effet) : la table, la barre et les sièges pilote utilisent
  // donc aussi l'inox 316 poli défini ici. Lecture/écriture de M.chrome restent compatibles.
  {
    const chrome316 = materials.chrome;
    Object.defineProperty(materials, 'chrome', { get: () => chrome316, set: () => {}, enumerable: true, configurable: true });
  }

  const uvScale = new Map([
    [materials.deck, [1.92, 0.48]],
    [materials.interiorFloor, [2.88, 0.72]],
    [materials.woodInterior, [2.0, 0.5]],
    [materials.hull, [1.6, 1.6]],           // carénage + peau d'orange (tuile 1,6 m)
    [materials.superstructure, [1.6, 1.6]],
    [materials.accent, [0.5, 0.5]],         // brossé (tuile 0,5 m)
    [materials.metalDark, [0.5, 0.5]],
  ]);
  return { materials, uvScale };
}

export function buildBoat(opts = {}) {
  const EXT = opts.exterior || null;
  const phys = (p) => new THREE.MeshPhysicalMaterial(p);
  const { materials, uvScale } = createBoatMaterials();

  const root = new THREE.Group(); root.name = 'DIEDRE29';
  const hullG = new THREE.Group(); hullG.name = 'hull';
  const superG = new THREE.Group(); superG.name = 'superstructure';
  const roof = new THREE.Group(); roof.name = 'roof';
  const upperGlass = new THREE.Group(); upperGlass.name = 'upperGlass';
  const interior = new THREE.Group(); interior.name = 'interior';
  const aftDeck = new THREE.Group(); aftDeck.name = 'aftDeckFurniture';
  const underwaterLights = new THREE.Group(); underwaterLights.name = 'underwaterLights';
  root.add(hullG, superG, roof, upperGlass, interior, aftDeck, underwaterLights);

  const B = new Batcher();
  const M = materials;
  // Extérieur Blender fourni : les pièces qu'il remplace ne sont pas construites. Les blocs de coque sont sautés
  // (if (!EXT)) ; filet de sécurité au niveau du Batcher : tout le groupe hull (le nom de coque, seul conservé,
  // est un maillage direct), tout upperGlass, et dans superstructure tout sauf les optiques des feux (navRed /
  // navGreen : leurs boîtiers sont dans le GLB). Toit : lignes sautées une à une plus bas (anneau de gouttière,
  // bandeau, joint creux, chanfrein, dessus, sous-face des joues) — radar, feu blanc et plafond restent.
  if (EXT) {
    const superMats = new Set([M.accent, M.hullBottom, M.metalDark, M.superstructure]);
    B.skip = (group, mat) => group === hullG || group === upperGlass || (group === superG && superMats.has(mat));
  }
  const both = (group, mat, g, o) => { B.add(group, mat, g, o); B.add(group, mat, mirrorZ(g), o); };
  const mz = (p) => v(p.x, p.y, -p.z);

  // =========================================================================
  // COQUE
  // =========================================================================
  const N = 110;
  const xs = [];
  for (let i = 0; i <= N; i++) xs.push(XS + (XB - XS) * (1 - Math.pow(1 - i / N, 1.25)));
  xs.push(XS + 0.6); xs.sort((a, b) => a - b);
  const secs = xs.map(section);
  const lerpCK = (s, x, y) => { // point du panneau bas (bouchain→dièdre) à la hauteur y
    const t = (s.knY - s.chY) > 1e-6 ? (y - s.chY) / (s.knY - s.chY) : 0;
    return v(x, y, s.chZ + t * (s.knZ - s.chZ));
  };
  const P = {
    keel: secs.map((s, i) => v(xs[i], s.keel, 0)),
    chine: secs.map((s, i) => v(xs[i], s.chY, s.chZ)),
    wl: secs.map((s, i) => lerpCK(s, xs[i], Math.max(0.05, s.chY))),
    knuckle: secs.map((s, i) => v(xs[i], s.knY, s.knZ)),
    livet: secs.map((s, i) => v(xs[i], s.sheer, s.W)),
  };
  // bande lissée en longueur, arêtes vives entre bandes
  function strip(A, Bp) {
    const n = [];
    for (let i = 0; i < A.length - 1; i++) {
      const q = new V3().subVectors(Bp[i + 1], A[i]).cross(new V3().subVectors(Bp[i], A[i + 1]));
      if (q.lengthSq() < 1e-12) { n.push(n.length ? n[n.length - 1].clone() : v(0, 0, 1)); continue; }
      q.normalize();
      const c = A[i].clone().add(A[i + 1]).add(Bp[i]).add(Bp[i + 1]).multiplyScalar(0.25);
      if (q.dot(v(0, c.y - 0.8, c.z)) < 0) q.negate();
      n.push(q);
    }
    // normales lissées en longueur sauf aux plis (> ~18°) qui restent vifs
    const sm = (a, b) => (a.dot(b) > 0.95 ? a.clone().add(b).normalize() : null);
    const pos = [], nor = [];
    for (let i = 0; i < A.length - 1; i++) {
      const l = (i > 0 && sm(n[i - 1], n[i])) || n[i];
      const r = (i < n.length - 1 && sm(n[i], n[i + 1])) || n[i];
      const tris = [[[A[i], l], [A[i + 1], r], [Bp[i + 1], r]], [[A[i], l], [Bp[i + 1], r], [Bp[i], l]]];
      for (let t of tris) {
        const gn = new V3().subVectors(t[1][0], t[0][0]).cross(new V3().subVectors(t[2][0], t[0][0]));
        if (gn.lengthSq() < 1e-10) continue;
        if (gn.dot(n[i]) < 0) t = [t[0], t[2], t[1]];
        for (const [p, nn] of t) { pos.push(p.x, p.y, p.z); nor.push(nn.x, nn.y, nn.z); }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    return g;
  }
  if (!EXT) {
  both(hullG, M.hullBottom, strip(P.keel, P.chine));
  both(hullG, M.hullBottom, strip(P.chine, P.wl));
  both(hullG, M.hull, strip(P.wl, P.knuckle), { name: 'flancBas' });
  both(hullG, M.accent, strip(P.knuckle, P.livet), { name: 'flancHaut' });
  // biseau métal sur l'arête du dièdre et sur le bouchain
  // jonc continu (profil rond, onglet au pan coupé), effilé jusqu'à zéro à l'étrave : aucun about visible
  {
    const kp = [P.knuckle[0]];
    for (let i = 1; i < P.knuckle.length; i++) if (P.knuckle[i].distanceTo(kp[kp.length - 1]) > 1e-4) kp.push(P.knuckle[i]);
    both(hullG, M.accent, tubePath(kp, (i) => 0.016 * Math.min(1, Math.max(0, (XB - kp[i].x) / 0.6)), 14), { cast: false });
  }
  // liston / bourrelet de défense au livet : profil caoutchouc noir mat (Ø 45 mm, à moitié noyé, il couvre
  // l'arête livet / plat-bord) + jonc inox poli en insert (saillant de 7 mm) ; effilés à zéro à l'étrave, embouts au tableau
  {
    const rail = [], ins = [], xr = [];
    for (let i = 0; i < P.livet.length; i++) {
      const L0 = P.livet[i], K0 = P.knuckle[i];
      if (L0.x < XS + 0.035 || (rail.length && L0.x - xr[xr.length - 1] < 1e-4)) continue;
      const d = new V3().subVectors(K0, L0); d.x = 0; d.normalize();
      const n = v(0, d.z, -d.y); // normale sortante du panneau haut (dévers)
      const c = L0.clone().addScaledVector(d, 0.021).addScaledVector(n, 0.003);
      rail.push(c); ins.push(c.clone().addScaledVector(n, 0.0215)); xr.push(L0.x);
    }
    const tp = (r0) => (i) => r0 * Math.min(1, Math.max(0, (XB - 0.05 - xr[i]) / 0.9));
    both(hullG, M.hullBottom, tubePath(rail, tp(0.0225), 16), { name: 'rubRail' });
    both(hullG, M.chrome, tubePath(ins, tp(0.0075), 12), { cast: false });
  }
  } // !EXT (coque)

  // ---------- pont teck avec trémie de la cabine (salon en contrebas) ----------
  const FLOOR = 1.70;          // sol du salon (de plain-pied avec le pont arrière)
  const X_DOOR = -10.3;        // baie arrière
  const Z_CHEEK = 2.2;         // face intérieure des joues arrière
  const X_SIDE0 = -9.6, X_SIDE1 = -0.6;
  const ZD = 3.42, ZL = 3.38, ZU = 2.92;      // pied / seuil / arête du toit (côtés)
  const YL = 2.55, YU = 3.62, YR = 3.98, YC = 3.58;
  const CAISSON = { x0: -9.3, x1: 0.3, z: 2.45, h: 0.12 }; // caisson central du plafond (+0,12 m)
  const ARC = [55, 22].map((d) => THREE.MathUtils.degToRad(d));
  const sideX = [X_SIDE0, -7.35, -5.1, -2.85, X_SIDE1];
  const outline = (z, rx) => [...sideX.map((x) => [x, z]), ...ARC.map((a) => [X_SIDE1 + rx * Math.cos(a), z * Math.sin(a)])];
  const D2 = outline(ZD, 3.64), L2 = outline(ZL, 3.6), U2 = outline(ZU, 2.5); // pare-brise long et incliné ; la caméra salon (x=1.5, y=3) reste à l'intérieur
  const holeLine = [[X_DOOR, Z_CHEEK], [X_SIDE0, Z_CHEEK], ...D2];
  const XH0 = X_DOOR, XH1 = D2[D2.length - 1][0];
  const zHole = (x, mid) => {
    for (let i = 0; i < holeLine.length - 1; i++) {
      const [xa, za] = holeLine[i], [xb, zb] = holeLine[i + 1];
      if (xb - xa > 1e-6 && mid >= xa - 1e-9 && mid <= xb + 1e-9) return za + (zb - za) * (x - xa) / (xb - xa);
    }
    return 0;
  };
  if (!EXT) {
    const bw = new Geo(), cap = new Geo(), deck = new Geo(), wing = new Geo();
    for (let i = 0; i < N; i++) {
      const xa = xs[i], xb = xs[i + 1], sa = secs[i], sb = secs[i + 1];
      const za = Math.max(sa.W - 0.1, 0), zb = Math.max(sb.W - 0.1, 0);
      bw.quad(v(xa, deckY(xa), za), v(xb, deckY(xb), zb), v(xb, sb.sheer, zb), v(xa, sa.sheer, za), v(0, 0, -1));
      cap.quad(v(xa, sa.sheer, za), v(xb, sb.sheer, zb), v(xb, sb.sheer, sb.W), v(xa, sa.sheer, sa.W), v(0, 1, 0));
    }
    // planches de rive (Mw = 14 cm, le long de la face intérieure du pavois) et planche de quille effilée
    // (24 cm au rouf → 12 cm à l'étrave), découpées dans le pont. Chaque planche est UNE latte continue :
    // ses UV prennent une seule rangée de la texture (joint calfaté sur chaque bord) et, en longueur, la
    // fenêtre sans about de cette rangée (entre ses deux abouts, détectés sur le canvas de la carte),
    // étirée sur toute la longueur → aucun about ni changement de ton. Les UV sont recalculées si la
    // carte du pont change (teck ↔ composite).
    const XK0 = XH1;
    const fore = {
      Mw: 0.14, s: 0, pos: [], prm: [],
      K(x) { return 0.12 - 0.06 * clamp01((x - XK0) / (XB - XK0)); },
      st(x, e) { const K = this.K(x), kp = Math.min(K, e), zm = Math.max(e - this.Mw, kp); return { kp, zm }; },
      tri(p, q) { // p : 3 points, q : 3 × [rangée, abscisse (m), travers 0..1] ; orienté vers le haut
        const n = new V3().subVectors(p[1], p[0]).cross(new V3().subVectors(p[2], p[0]));
        if (n.lengthSq() < 1e-14) return;
        const o = n.y < 0 ? [0, 2, 1] : [0, 1, 2];
        for (const k of o) { this.pos.push(p[k].x, p[k].y, p[k].z); this.prm.push(...q[k]); }
      },
      quad(p, q) { this.tri([p[0], p[1], p[2]], [q[0], q[1], q[2]]); this.tri([p[0], p[2], p[3]], [q[0], q[2], q[3]]); },
      // Écarts : le pont est en lattes de P = 6 cm parallèles à l'axe (joints à z = k·P, cf. worldUV).
      // Abouts « nibbés » : une latte qui vient mourir contre la planche de rive (ou contre la planche de
      // quille effilée) est coupée le long de la planche tant qu'elle garde ≥ 1/3 de sa largeur, puis
      // d'équerre (nib) ; la planche de rive / de quille reçoit l'encoche correspondante.
      P: 0.06, H: 0.004, I: 0.012, seam: new Geo(),
      raw(x) { const e = Math.max(halfW(x) - 0.1, 0), kp = Math.min(this.K(x), e); return { e, kp, zm: Math.max(e - this.Mw, kp) }; },
      nibM(z) { const f = z / this.P, k = Math.floor(f); return f - k >= 1 / 3 ? z : k * this.P; },
      nibK(z) { const f = z / this.P, k = Math.floor(f); return f - k <= 2 / 3 ? z : (k + 1) * this.P; },
      at(x) {
        const r = this.raw(x), eK = Math.min(this.nibK(r.kp), r.e), eM = Math.min(r.e, Math.max(this.nibM(r.zm), eK));
        return { e: r.e, eK, eM, zt: Math.max(eK - this.I, 0) };
      },
      jumps(x0, x1) { // abscisses exactes des nibs (changement de régime, par dichotomie)
        const out = [], n = 4000, P = this.P;
        for (const g of [(x) => Math.floor(this.raw(x).zm / P - 1 / 3), (x) => Math.floor(this.raw(x).kp / P - 2 / 3)]) {
          let xp = x0, gp = g(x0);
          for (let i = 1; i <= n; i++) {
            const x = x0 + (x1 - x0) * i / n, gi = g(x);
            if (gi !== gp) { let a = xp, b = x; for (let it = 0; it < 48; it++) { const m = (a + b) / 2; if (g(m) === gp) a = m; else b = m; } out.push((a + b) / 2); }
            xp = x; gp = gi;
          }
        }
        return out;
      },
      // stations : abscisses du pont avant ; deck : Geo des lattes courantes (UV monde)
      build(stations, deck) {
        const st = [...stations].sort((a, b) => a - b), x0 = st[0], x1 = st[st.length - 1];
        const X = [...new Set([...st, ...this.jumps(x0, x1)])].sort((a, b) => a - b);
        const H = this.H, up = v(0, 1, 0);
        let prev = null;
        for (let i = 0; i < X.length - 1; i++) {
          const a = X[i], b = X[i + 1];
          if (b - a < 1e-6) continue;
          const eps = Math.min(1e-6, (b - a) / 4), A = this.at(a + eps), Bv = this.at(b - eps), ya = deckY(a), yb = deckY(b);
          const sa = this.s, sb = (this.s += Math.hypot(b - a, yb - ya, Bv.e - A.e));
          // joint calfaté (5 mm) entre lattes et planche de rive, y compris le long de chaque nib
          const g = 0.012, Nx =i + 2 < X.length ? this.at(b + eps) : null, len = b - a;
          const tL = prev && prev.eM > A.eM + 1e-6 ? Math.min(g / len, 1 / 3) : 0, tR = Nx && Nx.eM > Bv.eM + 1e-6 ? 1 - Math.min(g / len, 1 / 3) : 1;
          const at = (t) => ({ x: a + len * t, y: ya + (yb - ya) * t, s: sa + (sb - sa) * t, e: A.e + (Bv.e - A.e) * t, m: A.eM + (Bv.eM - A.eM) * t });
          const piece = (s, row, t0, t1, zi0, zi1) => { // rive entre z intérieur (fonction de t) et e
            const p0 = at(t0), p1 = at(t1), z0 = Math.min(zi0(p0), p0.e), z1 = Math.min(zi1(p1), p1.e);
            this.quad([v(p0.x, p0.y, s * p0.e), v(p1.x, p1.y, s * p1.e), v(p1.x, p1.y, s * z1), v(p0.x, p0.y, s * z0)], [[row, p0.s, 0], [row, p1.s, 0], [row, p1.s, 1], [row, p0.s, 1]]);
          };
          const ck = (s, t0, t1, za, zb) => { const p0 = at(t0), p1 = at(t1), A0 = Math.min(za(p0), p0.e), A1 = Math.min(za(p1), p1.e), B0 = Math.min(zb(p0), p0.e), B1 = Math.min(zb(p1), p1.e);
            if (Math.max(B0 - A0, B1 - A1) > 1e-7) this.seam.quad(v(p0.x, p0.y, s * A0), v(p1.x, p1.y, s * A1), v(p1.x, p1.y, s * B1), v(p0.x, p0.y, s * B0), up); };
          const mg = (p) => p.m + g;
          for (const [s, row] of [[1, 3], [-1, 2]]) {
            deck.quad(v(a, ya, s * A.eK), v(b, yb, s * Bv.eK), v(b, yb, s * Bv.eM), v(a, ya, s * A.eM), up); // lattes courantes
            ck(s, 0, 1, (p) => p.m, mg); // joint longitudinal
            if (tL > 0) { ck(s, 0, tL, mg, () => prev.eM + g); piece(s, row, 0, tL, () => prev.eM + g, () => prev.eM + g); } // joint du nib (côté avant)
            piece(s, row, tL, tR, mg, mg); // rive
            if (tR < 1) { ck(s, tR, 1, mg, () => Nx.eM + g); piece(s, row, tR, 1, () => Nx.eM + g, () => Nx.eM + g); }
            // chanfrein calfaté de la planche de quille (surélevée de 2 mm)
            this.seam.quad(v(a, ya, s * A.eK), v(b, yb, s * Bv.eK), v(b, yb + H, s * Bv.zt), v(a, ya + H, s * A.zt), v(0, 1, s));
          }
          const kw = (z, zt) => (zt > 1e-6 ? (z / zt + 1) / 2 : 0.5);
          this.quad([v(a, ya + H, -A.zt), v(b, yb + H, -Bv.zt), v(b, yb + H, Bv.zt), v(a, ya + H, A.zt)],
            [[0, a - XK0, 0], [0, b - XK0, 0], [0, b - XK0, 1], [0, a - XK0, 1]]); // planche de quille (rangée 0 : sans about)
          // ressaut de la planche de quille au droit d'un nib, ou about arrière
          const L = prev ? prev : { eK: 0, zt: 0 };
          if (Math.abs(L.eK - A.eK) > 1e-7) {
            const h = v(L.eK > A.eK ? 1 : -1, 0.3, 0);
            for (const s of [1, -1]) this.seam.quad(v(a, ya, s * L.eK), v(a, ya, s * A.eK), v(a, ya + H, s * A.zt), v(a, ya + H, s * L.zt), h);
          }
          prev = Bv;
        }
        B.add(hullG, M.caulk || M.hullBottom, this.seam.build(), { cast: false });
      },
      // fenêtre sans about d'une rangée : colonne d'about = écart maximal à la médiane (joint sombre ou clair)
      window(tex, row) {
        const c = tex && tex.image;
        if (!c || !c.getContext) return [0.02, 0.48];
        const W = c.width, ph = c.height / 8, y0 = Math.round(row * ph + ph * 0.25), h = Math.max(1, Math.round(ph * 0.5));
        const d = c.getContext('2d').getImageData(0, y0, W, h).data, col = new Float32Array(W);
        for (let x = 0; x < W; x++) { let s = 0; for (let y = 0; y < h; y++) { const o = (y * W + x) * 4; s += d[o] * 0.3 + d[o + 1] * 0.59 + d[o + 2] * 0.11; } col[x] = s / h; }
        const med = Float32Array.from(col).sort()[W >> 1];
        let best = 0, c0 = 0;
        for (let x = 0; x < W; x++) { const e = Math.abs(col[x] - med) + Math.abs(col[(x + 1) % W] - med) + Math.abs(col[(x + W - 1) % W] - med); if (e > best) { best = e; c0 = x; } }
        return [(c0 + 30) / W, (c0 + W / 2 - 30) / W];
      },
      mapUV(tex) {
        const win = {}, L = { 2: this.s, 3: this.s, 0: XB - XK0 };
        for (const r of [2, 3, 0]) win[r] = this.window(tex, r); // (rangée 0 sans about : la fenêtre reste valable)
        const P = this.prm, uv = this.mesh.geometry.attributes.uv;
        for (let i = 0; i < uv.count; i++) {
          const r = P[i * 3], [u0, u1] = win[r];
          uv.setXY(i, u0 + (u1 - u0) * P[i * 3 + 1] / L[r], 1 - (r + P[i * 3 + 2]) / 8);
        }
        uv.needsUpdate = true;
      },
      flush() {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(this.pos.length / 3 * 2), 2));
        g.computeVertexNormals();
        const m = this.mesh = new THREE.Mesh(g, M.deck);
        m.name = 'deckBoards'; m.receiveShadow = true;
        let cur = null;
        m.onBeforeRender = () => { if (M.deck.map !== cur) { cur = M.deck.map; this.mapUV(cur); } };
        this.mapUV(M.deck.map); cur = M.deck.map;
        g.computeBoundingSphere();
        hullG.add(m);
      },
    };
    const dx = [...new Set([X_STAIR, ...xs.filter((x) => x > X_STAIR + 0.02), ...holeLine.map((p) => p[0])].map((x) => +x.toFixed(5)))].sort((a, b) => a - b);
    const foreSt = new Set();
    for (let i = 0; i < dx.length - 1; i++) {
      const xa = dx[i], xb = dx[i + 1];
      if (xb - xa < 1e-4) continue;
      const mid = (xa + xb) / 2;
      const ea = Math.max(halfW(xa) - 0.1, 0), eb = Math.max(halfW(xb) - 0.1, 0);
      const ya = deckY(xa), yb = deckY(xb);
      if (mid > XH0 && mid < XH1) {
        const ha = zHole(xa, mid), hb = zHole(xb, mid);
        const q = new Geo();
        q.quad(v(xa, ya, ha), v(xb, yb, hb), v(xb, yb, eb), v(xa, ya, ea), v(0, 1, 0));
        const g = q.build(); B.add(hullG, M.deck, g, { cast: false }); B.add(hullG, M.deck, mirrorZ(g), { cast: false });
      } else if (mid > XH1) {
        // plage avant : planche de rive (fil qui suit la courbe du pavois) + planche de quille (axe),
        // découpées dans le pont (coplanaires, aucun recouvrement : pas de z-fighting)
        foreSt.add(xa); foreSt.add(xb); // construit après la boucle (abouts nibbés)
      } else {
        deck.quad(v(xa, ya, -ea), v(xb, yb, -eb), v(xb, yb, eb), v(xa, ya, ea), v(0, 1, 0));
      }
    }
    fore.build(foreSt, deck);
    fore.flush();
    for (let i = 0; i < 6; i++) {
      const xa = XS + (X_STAIR - XS) * i / 6, xb = XS + (X_STAIR - XS) * (i + 1) / 6;
      wing.quad(v(xa, deckY(xa), Z_STAIR), v(xb, deckY(xb), Z_STAIR), v(xb, deckY(xb), halfW(xb) - 0.1), v(xa, deckY(xa), halfW(xa) - 0.1), v(0, 1, 0));
    }
    both(hullG, M.hull, bw.build());
    both(hullG, M.accent, cap.build());
    B.add(hullG, M.deck, deck.build(), { cast: false });
    both(hullG, M.deck, wing.build(), { cast: false });
  }

  // ---------- tableau arrière + découpe d'escalier ----------
  const sT = section(XS);
  if (!EXT) {
    const c = [
      [sT.W, sT.sheer], [sT.knZ, sT.knY], [sT.chZ, sT.chY], [0, sT.keel], [-sT.chZ, sT.chY], [-sT.knZ, sT.knY], [-sT.W, sT.sheer],
      [-Z_STAIR, sT.sheer], [-Z_STAIR, Y_PLAT], [Z_STAIR, Y_PLAT], [Z_STAIR, sT.sheer],
    ];
    const tg = new Geo(); tg.poly(c.map(([z, y]) => v(XS, y, z)), v(-1, 0, 0));
    B.add(hullG, M.hull, tg.build());
    // parois intérieures des ailes
    const wl = new Geo();
    for (let i = 0; i < 4; i++) {
      const xa = XS + (X_STAIR - XS) * i / 4, xb = XS + (X_STAIR - XS) * (i + 1) / 4;
      wl.quad(v(xa, Y_PLAT - 0.2, Z_STAIR), v(xb, Y_PLAT - 0.2, Z_STAIR), v(xb, deckY(xb), Z_STAIR), v(xa, deckY(xa), Z_STAIR), v(0, 0, -1));
    }
    both(hullG, M.hull, wl.build());
    // arête métal le long du bord de l'aile côté escalier (jonc continu, embouts arrondis)
    // (le jonc du contour du tableau est posé avec l'about du pavois, plus bas)
    both(hullG, M.accent, tubePath([v(XS + 0.01, deckY(XS) + 0.004, Z_STAIR - 0.004), v(X_STAIR, deckY(X_STAIR) + 0.004, Z_STAIR - 0.004)], 0.016, 14), { cast: false });
    // hiloire arrière de l'aile : le tableau dépasse le pont de l'aile de 13 cm, on lui donne une épaisseur
    // (sinon sa face intérieure, non rendue, laissait voir à travers entre le dossier de banquette et le tableau)
    both(hullG, M.hull, boxB(XS, XS + 0.04, deckY(XS) - 0.002, sT.sheer, Z_STAIR + 0.002, sT.W - 0.36 + 0.01));
    // poignées inox en U sur les faces intérieures des ailes (au-dessus des marches, coudes cintrés, platines murales)
    for (const x of [-12.85]) {
      const z = Z_STAIR - 0.08, y0 = 1.02, y1 = 1.52, rb = 0.035;
      const lower = [], upper = [];
      for (let k = 0; k <= 6; k++) { const a = (k / 6) * Math.PI / 2; lower.push(v(x, y0 + rb - rb * Math.cos(a), z + rb - rb * Math.sin(a))); }
      for (let k = 0; k <= 6; k++) { const a = (k / 6) * Math.PI / 2; upper.push(v(x, y1 - rb + rb * Math.sin(a), z + rb - rb * Math.cos(a))); }
      const handle = [v(x, y0, Z_STAIR), ...lower, ...upper, v(x, y1, Z_STAIR)];
      both(hullG, M.chrome, tubePath(handle, 0.014, 14, false), { cast: false });
      for (const y of [y0, y1]) both(hullG, M.accent, cylBetween(v(x, y, Z_STAIR), v(x, y, Z_STAIR - 0.006), 0.03, 0.03, 24), { cast: false });
    }
  }

  // ---------- rebords de poupe : pavois massifs facettés montant vers les joues ----------
  const X_CHEEK = -11.4;
  // hauteur constante (0,72 m au-dessus du pont) du tableau arrière jusqu'à la joue : ligne de pavois continue,
  // qui masque les banquettes de l'extérieur et vient mourir proprement dans la joue
  // devant la joue, le pavois plonge en courbe douce le long de la joue jusqu'au livet (coque moulée, aucun about)
  const X_SWEEP = -10.0;
  const bulwarkTop = (x) => x <= X_CHEEK ? deckY(x) + 0.72 : sheer(x) + 0.59 * (1 - ss(X_CHEEK, X_SWEEP, x));
  const BT = 0.36;
  if (!EXT) {
    const out = new Geo(), top = new Geo(), inn = new Geo();
    const xsB = [XS, -12.9, -12.6, -12.3, -12.0, -11.7, X_CHEEK];
    for (let i = 1; i <= 14; i++) xsB.push(X_CHEEK + (X_SWEEP - X_CHEEK) * i / 14); // plongée progressive
    const jo = [], ji = []; // joncs continus des arêtes du dessus
    for (let i = 0; i < xsB.length - 1; i++) {
      const xa = xsB[i], xb = xsB[i + 1], wa = halfW(xa), wb = halfW(xb);
      const ha = bulwarkTop(xa), hb = bulwarkTop(xb);
      const fa = 1 - ss(X_SWEEP - 0.3, X_SWEEP, xa), fb = 1 - ss(X_SWEEP - 0.3, X_SWEEP, xb); // dessus qui s'aplatit en fin de plongée
      const ia = Math.max(ha - 0.03 * fa, deckY(xa) + 0.01), ib = Math.max(hb - 0.03 * fb, deckY(xb) + 0.01); // dessus quasi plat : rien ne dépasse vu de l'extérieur
      const oa = wa - 0.05 * (ha - sheer(xa)) / 0.59, ob = wb - 0.05 * (hb - sheer(xb)) / 0.59; // retrait proportionnel : faces planes, sans facettes
      out.quad(v(xa, sheer(xa) - 0.01, wa), v(xb, sheer(xb) - 0.01, wb), v(xb, hb, ob), v(xa, ha, oa), v(0, 0.3, 1));
      top.quad(v(xa, ha, oa), v(xb, hb, ob), v(xb, ib, wb - BT), v(xa, ia, wa - BT), v(0, 1, 0.4));
      inn.quad(v(xa, deckY(xa), wa - BT), v(xb, deckY(xb), wb - BT), v(xb, ib, wb - BT), v(xa, ia, wa - BT), v(0, 0, -1));
      if (i === 0) { jo.push(v(xa, ha, oa)); ji.push(v(xa, ia, wa - BT)); }
      jo.push(v(xb, hb, ob)); ji.push(v(xb, ib, wb - BT));
    }
    // joncs effilés à zéro en fin de plongée : le pavois « meurt » dans le livet sans about
    const taper = (pts, r0) => (i) => r0 * Math.min(1, Math.max(0, (X_SWEEP - pts[i].x) / 0.5));
    both(hullG, M.accent, tubePath(jo, taper(jo, 0.015), 14), { cast: false });
    both(hullG, M.accent, tubePath(ji, taper(ji, 0.0125), 12), { cast: false });
    // about arrière du pavois (fermeture au droit du tableau, au-dessus du livet : pas de recouvrement avec le tableau)
    {
      const w = halfW(XS), h = bulwarkTop(XS), ia = h - 0.03;
      const cap = new Geo();
      cap.poly([v(XS, sT.sheer, w), v(XS, sT.sheer, w - BT), v(XS, ia, w - BT), v(XS, h, w - 0.05)], v(-1, 0, 0));
      both(hullG, M.accent, cap.build());
      // jonc unique du contour du tableau : escalier → livet → about du pavois → livet → dièdre → bouchain
      const xo = XS - 0.006;
      const contour = [
        v(xo, Y_PLAT, Z_STAIR), v(xo, sT.sheer, Z_STAIR), v(xo, sT.sheer, w - BT), v(xo, ia, w - BT), v(xo, h, w - 0.05),
        v(xo, sT.sheer, sT.W), v(xo, sT.knY, sT.knZ), v(xo, sT.chY, sT.chZ),
      ];
      both(hullG, M.accent, tubePath(contour, 0.02, 16), { cast: false });
    }
    both(hullG, M.accent, smoothNormals(out.build()));
    both(hullG, M.superstructure, smoothNormals(top.build()));
    both(hullG, M.hull, smoothNormals(inn.build()));
  }

  // ---------- escalier central 5 marches ----------
  if (!EXT) {
    const nSteps = 5, rise = (deckY(X_STAIR) - Y_PLAT) / (nSteps + 1), run = (X_STAIR - XS) / nSteps;
    for (let i = 1; i <= nSteps; i++) {
      const yTop = deckY(X_STAIR) - rise * i;
      const xa = X_STAIR - run * i, xb = X_STAIR - run * (i - 1);
      B.add(hullG, M.deck, boxB(xa, xb + 0.01, yTop - 0.05, yTop, -Z_STAIR + 0.005, Z_STAIR - 0.005), { athwart: true }); // lattes parallèles au nez de marche
      B.add(hullG, M.deck, boxB(xa + 0.03, X_STAIR + 0.3, Y_PLAT - 0.15, yTop - 0.05, -Z_STAIR + 0.005, Z_STAIR - 0.005), { athwart: true }); // contremarche teck
      B.add(hullG, M.accent, rboxB(xa - 0.014, xa + 0.014, yTop - 0.055, yTop + 0.002, -Z_STAIR + 0.01, Z_STAIR - 0.01, 0.008)); // nez de marche arrondi
    }
    B.add(hullG, M.deck, boxB(X_STAIR - 0.002, X_STAIR + 0.3, Y_PLAT - 0.15, deckY(X_STAIR) - 0.006, -Z_STAIR + 0.005, Z_STAIR - 0.005), { athwart: true }); // contremarche teck
    B.add(hullG, M.accent, rboxB(X_STAIR - 0.016, X_STAIR + 0.016, deckY(X_STAIR) - 0.05, deckY(X_STAIR) + 0.004, -Z_STAIR - 0.012, Z_STAIR + 0.012, 0.008)); // bouts arrondis noyés dans les joues de l'escalier
  }

  // ---------- plateforme de bain épaisse ----------
  if (!EXT) {
    const ZP = sT.knZ + 0.08, y0 = 0.06, y1 = Y_PLAT;
    const ol = [[XS + 0.02, ZP], [XP + 0.4, ZP], [XP, ZP - 0.4], [XP, -ZP + 0.4], [XP + 0.4, -ZP], [XS + 0.02, -ZP]];
    const top = new Geo(), bot = new Geo(), side = new Geo(), edge = new Geo();
    // arête du dessus arrondie (R 14 mm) : le teck s'arrête à R du bord, le chant à R sous le dessus,
    // un jonc de rayon R centré sur le coin rentrant les raccorde tangentiellement (quart-de-rond exact)
    const RP = 0.014, olIn = offset2D(ol.map(([x, z]) => new THREE.Vector2(x, z)), RP);
    top.poly(olIn.map((p) => v(p.x, y1, p.y)), v(0, 1, 0));
    bot.poly(ol.map(([x, z]) => v(x, y0, z)), v(0, -1, 0));
    B.add(hullG, M.accent, tubePath([...olIn, olIn[0]].map((p) => v(p.x, y1 - RP, p.y)), RP, 12), { cast: false });
    // joint creux (plateforme / tableau) : filet noir mat au pied du tableau, sur toute la largeur
    B.add(hullG, M.hullBottom, boxB(XS - 0.014, XS + 0.035, y1 - 0.004, y1 + 0.0015, -ZP + 0.03, ZP - 0.03), { cast: false });
    for (let i = 0; i < ol.length; i++) { // boucle fermée : la face avant (contre le tableau) dépasse de la coque sur les côtés
      const [xa, za] = ol[i], [xb, zb] = ol[(i + 1) % ol.length];
      const h = v((xa + xb) / 2 + 13.8, 0, (za + zb) / 2);
      edge.quad(v(xa, y1 - 0.07, za), v(xb, y1 - 0.07, zb), v(xb, y1 - RP, zb), v(xa, y1 - RP, za), h);
      // chant inférieur légèrement rentrant (biseau)
      const k = 0.06, ia = v(xa + (xa < XS - 0.1 ? k : 0), y0, za - Math.sign(za) * k), ib = v(xb + (xb < XS - 0.1 ? k : 0), y0, zb - Math.sign(zb) * k);
      side.quad(ia, ib, v(xb, y1 - 0.07, zb), v(xa, y1 - 0.07, za), h);
    }
    B.add(hullG, M.deck, top.build(), { cast: false });
    B.add(hullG, M.hullBottom, bot.build());
    B.add(hullG, M.metalDark, side.build());
    B.add(hullG, M.accent, edge.build());
  }

  // ---------- détails de coque : coffres du tableau, échappements, passe-coques ----------
  if (!EXT) {
    // trappes de coffre sur les ailes du tableau : joints creux noirs (8 mm) à angles arrondis + poignée inox
    const zc = (Z_STAIR + 0.22 + sT.knZ - 0.42) / 2, hw = (sT.knZ - 0.42 - Z_STAIR - 0.22) / 2, yc = 1.06, hh = 0.42, rc = 0.07, xg = XS - 0.0015;
    const rr = (o) => {
      const pts = [], r = rc + o, ax = hw + o - r, ay = hh + o - r;
      for (const [sx, sy, a0] of [[1, 1, 0], [-1, 1, 0.5], [-1, -1, 1], [1, -1, 1.5]])
        for (let k = 0; k <= 6; k++) { const a = (a0 + k / 12) * Math.PI; pts.push(v(xg, yc + sy * ay + r * Math.sin(a), zc + sx * ax + r * Math.cos(a))); }
      return pts;
    };
    const gr = new Geo();
    loftRows(gr, rr(-0.004), rr(0.004), () => v(-1, 0, 0), true);
    both(hullG, M.hullBottom, gr.build(), { cast: false });
    both(hullG, M.chrome, rboxG(0.014, 0.022, 0.16, 0.007, XS - 0.004, yc + hh - 0.1, zc), { cast: false });
    // enjoliveurs tournés posés normalement à la coque (normale calculée sur le panneau bas, convergence incluse)
    const hp = (x, y) => lerpCK(section(x), x, y);
    const hn = (x, y) => {
      const n = new V3().subVectors(hp(x + 0.01, y), hp(x - 0.01, y)).cross(new V3().subVectors(hp(x, y + 0.01), hp(x, y - 0.01))).normalize();
      return n.z < 0 ? n.negate() : n;
    };
    const fitting = (x, y, rIn, rOut, h) => {
      const p = hp(x, y), n = hn(x, y);
      both(hullG, M.chrome, onNormal(bezelG(rIn, rOut, h, 0.014, rOut > 0.05 ? 36 : 20), p, n), { cast: false });
      both(hullG, M.hullBottom, onNormal(xf(new THREE.CircleGeometry(rIn * 0.99, rOut > 0.05 ? 36 : 20), new THREE.Matrix4().makeRotationX(-Math.PI / 2).setPosition(0, 0.003, 0)), p, n), { cast: false });
    };
    fitting(-12.25, 0.52, 0.068, 0.098, 0.016); // sorties d'échappement
    for (const x of [-11.2, -10.3, -4.2]) fitting(x, 0.4, 0.022, 0.034, 0.007); // passe-coques (vidanges)
  }

  // ---------- panneaux de pont, taquets, feux ----------
  if (!EXT) {
    // le pont monte vers l'avant (tonture) : panneaux et taquets suivent la pente au lieu de rester horizontaux
    const slope = (x) => Math.atan2(deckY(x + 0.01) - deckY(x - 0.01), 0.02);
    // panneaux de pont : hiloire alu à profil arrondi (noyée de 12 mm), cuvette sombre en retrait,
    // joint caoutchouc, couvercle = cadre alu + verre acrylique fumé, charnières et poignée inox
    {
      const rrect = (hx, hz, r, y, o = 0) => { // rectangle arrondi décalé de o, fermé (sans doublon)
        const pts = [], R = r + o, ax = hx - r, az = hz - r;
        for (const [sx, sz, a0] of [[1, 1, 0], [-1, 1, 0.5], [-1, -1, 1], [1, -1, 1.5]])
          for (let k = 0; k <= 6; k++) { const a = (a0 + k / 12) * Math.PI; pts.push(v(sx * ax + R * Math.cos(a), y, sz * az + R * Math.sin(a))); }
        return pts;
      };
      const sweep = (hx, hz, r, prof) => { // profil (décalage o, hauteur y) balayé autour du rectangle arrondi
        const g = new Geo(), rows = prof.map(([o, y]) => rrect(hx, hz, r, y, o));
        for (let k = 0; k < prof.length - 1; k++) {
          const nO = prof[k + 1][1] - prof[k][1], nY = -(prof[k + 1][0] - prof[k][0]); // normale du segment de profil
          loftRows(g, rows[k], rows[k + 1], (c) => { const h = v(c.x / hx, 0, c.z / hz).normalize(); return h.multiplyScalar(nO).add(v(0, nY, 0)); }, true);
        }
        return smoothNormals(g.build(), 40, true);
      };
      const HX = 0.48, HZ = 0.205, HR = 0.05, TOP = 0.055, YL0 = TOP + 0.009;
      const coaming = sweep(HX, HZ, HR, [[0.03, -0.012], [0.03, TOP - 0.015], [0.0285, TOP - 0.006], [0.024, TOP - 0.001], [0.017, TOP], [-0.022, TOP], [-0.027, TOP - 0.002], [-0.03, TOP - 0.007], [-0.03, 0]]);
      const floor = new Geo(); floor.poly(rrect(HX, HZ, HR, 0.002, -0.03), v(0, 1, 0));
      const gasket = tubePath([...rrect(HX, HZ, HR, TOP + 0.003, -0.004), rrect(HX, HZ, HR, TOP + 0.003, -0.004)[0]], 0.006, 10);
      const LX = 0.49, LZ = 0.215, LR = 0.045;
      const lidFrame = sweep(LX, LZ, LR, [[-0.01, YL0 + 0.004], [0.016, YL0], [0.018, YL0 + 0.004], [0.018, YL0 + 0.014], [0.013, YL0 + 0.021], [0.006, YL0 + 0.023], [-0.008, YL0 + 0.023], [-0.012, YL0 + 0.019], [-0.012, YL0 + 0.012]]);
      const pane = rboxG(2 * (LX - 0.008), 0.01, 2 * (LZ - 0.008), 0.005, 0, YL0 + 0.013, 0); // chants pris dans le cadre
      const hw = [];
      for (const zz of [-0.13, 0.13]) {
        hw.push(place(new THREE.CapsuleGeometry(0.011, 0.06, 4, 16), -LX - 0.012, YL0 + 0.004, zz, Math.PI / 2, 0, 0)); // charnière
        hw.push(rboxG(0.05, 0.006, 0.07, 0.003, -LX + 0.012, YL0 + 0.025, zz)); // ferrure sur le cadre
        hw.push(place(new THREE.CylinderGeometry(0.011, 0.013, 0.016, 18), 0.32, YL0 + 0.03, zz > 0 ? LZ : -LZ)); // tourniquets (taquets de fermeture)
      }
      hw.push(rboxG(0.02, 0.01, 0.13, 0.0045, LX, YL0 + 0.027, 0)); // poignée avant, sur le cadre
      for (const x of [4.6, 8.4]) for (const z of [-1.0, 1.0]) {
        const m = new THREE.Matrix4().makeRotationZ(slope(x)).setPosition(x, deckY(x), z);
        const put = (mat, g, o) => B.add(hullG, mat, xf(g.clone(), m), o);
        put(M.accent, coaming);
        put(M.metalDark, floor.build(), { cast: false });
        put(M.hullBottom, gasket, { cast: false });
        put(M.accent, lidFrame);
        put(M.acrylic, pane);
        for (const g of hw) put(M.chrome, g, { cast: false });
      }
    }
    // taquet : semelle à arêtes arrondies (noyée de 12 mm), pieds tournés à congé de pied, corne effilée
    // aux extrémités relevées (balayage d'un profil rond à rayon variable, embouts hémisphériques)
    const legProf = [[0.052, 0.006], [0.05, 0.02], [0.044, 0.027], [0.038, 0.036], [0.034, 0.055], [0.031, 0.09], [0.03, 0.15]].map(([r, h]) => new THREE.Vector2(r, h));
    const horn = []; for (let k = 0; k <= 16; k++) { const t = k / 8 - 1; horn.push(v(0.2 * t, 0.165 + 0.02 * t * t * t * t, 0)); }
    const cleatParts = [
      rboxG(0.32, 0.04, 0.12, 0.014, 0, 0.008, 0),
      ...[-0.09, 0.09].map((dx) => place(new THREE.LatheGeometry(legProf, 24), dx, 0, 0)),
      tubePath(horn, (i) => 0.025 + 0.014 * (1 - (i / 8 - 1) ** 2), 18),
    ];
    const cleat = (x, z, y = deckY(x), a = slope(x)) => {
      const m = new THREE.Matrix4().makeRotationZ(a).setPosition(x, y, z);
      for (const g of cleatParts) B.add(hullG, M.chrome, xf(g.clone(), m));
    };
    // chaumard fermé inox (filoir) : anneau ovale sur platine, ouverture tournée vers l'extérieur (axe z)
    const fairlead = (x, y, z, a, tilt = 0) => {
      const m = new THREE.Matrix4().compose(v(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt, 0, a, 'XYZ')), v(1, 1, 1));
      const ring = xf(new THREE.TorusGeometry(0.042, 0.013, 12, 28), new THREE.Matrix4().makeScale(1.7, 1, 1).setPosition(0, 0.05, 0));
      B.add(hullG, M.chrome, xf(ring, m.clone()));
      B.add(hullG, M.chrome, xf(rboxG(0.22, 0.016, 0.06, 0.007, 0, 0.002, 0), m.clone()));
    };
    for (const s of [1, -1]) {
      cleat(3.4, s * (halfW(3.4) - 0.35));
      cleat(-12.1, s * (halfW(-12.1) - 0.2), bulwarkTop(-12.1) - 0.02);
      fairlead(3.55, sheer(3.55), s * (halfW(3.55) - 0.05), slope(3.55));
      { // sur le dessus du pavois (légèrement incliné vers l'intérieur)
        const x = -12.55, w = halfW(x), h = bulwarkTop(x), z = w - 0.13, oz = w - 0.05 * (h - sheer(x)) / 0.59;
        const y = h - 0.03 * (oz - z) / (oz - (w - BT)), tilt = Math.atan2(0.03, oz - (w - BT));
        fairlead(x, y, s * z, slope(x), -s * tilt);
      }
    }
  }

  // ---------- nom de coque (sur la moitié basse anthracite, vers l'avant) ----------
  const nameCanvas = document.createElement('canvas');
  nameCanvas.width = 2048; nameCanvas.height = 224;
  const nameTex = new THREE.CanvasTexture(nameCanvas);
  nameTex.colorSpace = THREE.SRGBColorSpace; nameTex.anisotropy = 8;
  M.name = phys({ map: nameTex, transparent: true, metalness: 0.55, roughness: 0.32, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, depthWrite: false });
  function setName(str) {
    const g = nameCanvas.getContext('2d');
    const W = nameCanvas.width, H = nameCanvas.height;
    g.clearRect(0, 0, W, H);
    const txt = String(str && String(str).trim() ? str : 'DIÈDRE 29').toUpperCase();
    let fs = 150;
    const font = (s) => `300 ${s}px "Helvetica Neue", "Inter", "Segoe UI", Arial, sans-serif`;
    const chars = [...txt];
    const measure = (s) => { g.font = font(s); return chars.reduce((a, ch) => a + g.measureText(ch).width, 0) + s * 0.24 * (chars.length - 1); };
    let tw = measure(fs);
    if (tw > W * 0.94) { fs = fs * (W * 0.94) / tw; tw = measure(fs); }
    g.font = font(fs);
    g.fillStyle = '#e2cfac';
    g.textBaseline = 'middle';
    let x = (W - tw) / 2;
    for (const ch of chars) { g.fillText(ch, x, H / 2 + fs * 0.05); x += g.measureText(ch).width + fs * 0.24; }
    nameTex.needsUpdate = true;
  }
  {
    const x0 = 6.9, x1 = 11.5, y0 = 0.98, y1 = 1.37, nx = 24;
    for (const side of [1, -1]) {
      const pos = [], uv = [], col = [];
      for (let i = 0; i <= nx; i++) {
        const x = x0 + (x1 - x0) * i / nx, s = section(x);
        const pz = (y) => { const p = lerpCK(s, x, y); return v(x, y, (p.z + 0.012) * side); };
        col.push([pz(y0), pz(y1), side > 0 ? i / nx : 1 - i / nx]);
      }
      for (let i = 0; i < nx; i++) {
        const [a0, a1, ua] = col[i], [b0, b1, ub] = col[i + 1];
        const tris = [[[a0, ua, 0], [b0, ub, 0], [b1, ub, 1]], [[a0, ua, 0], [b1, ub, 1], [a1, ua, 1]]];
        for (let t of tris) {
          const gn = new V3().subVectors(t[1][0], t[0][0]).cross(new V3().subVectors(t[2][0], t[0][0]));
          if (gn.z * side < 0) t = [t[0], t[2], t[1]];
          for (const [p, uu, vv] of t) { pos.push(p.x, p.y, p.z); uv.push(uu, vv); }
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, M.name);
      m.name = side > 0 ? 'nameStarboard' : 'namePort';
      m.renderOrder = 1; m.receiveShadow = true;
      hullG.add(m);
    }
  }

  // =========================================================================
  // SUPERSTRUCTURE : base facettée, verrière en dévers, joues arrière massives
  // =========================================================================
  const D = D2.map(([x, z]) => v(x, deckY(x), z));
  const Df = D2.map(([x, z]) => v(x, FLOOR, z));
  const L = L2.map(([x, z]) => v(x, YL, z));
  const U = U2.map(([x, z]) => v(x, YU, z));
  const nO = D.length; // 8 sommets par bord ; le pan central relie le dernier sommet à son symétrique
  const go = { order: 3, cast: false, receive: false };
  {
    const half = new Geo(), center = new Geo(), glassH = [], glassC = new Geo();
    const out = (c) => v(c.x - (c.x > X_SIDE1 ? X_SIDE1 - 0.3 : c.x), 0, c.z);
    // vitrage bombé : les pans du pare-brise latéral sont gauches (seuil et arête de toit non parallèles) ;
    // une nappe bilinéaire à normales analytiques remplace les 2 triangles plats (sinon reflets cassés en diagonale)
    const bilinear = (a, b, c, d, hint, nu = 10, nw = 6) => { // a,b = bas ; d,c = haut
      const P = (u, w) => a.clone().lerp(b, u).lerp(d.clone().lerp(c, u), w);
      const Nr = (u, w) => new V3().subVectors(b, a).lerp(new V3().subVectors(c, d), w).cross(new V3().subVectors(d, a).lerp(new V3().subVectors(c, b), u)).normalize();
      const s = Nr(0.5, 0.5).dot(hint) < 0 ? -1 : 1;
      const pos = [], nor = [];
      const push = (u, w) => { const p = P(u, w), n = Nr(u, w).multiplyScalar(s); pos.push(p.x, p.y, p.z); nor.push(n.x, n.y, n.z); };
      for (let i = 0; i < nu; i++) for (let j = 0; j < nw; j++) {
        const u0 = i / nu, u1 = (i + 1) / nu, w0 = j / nw, w1 = (j + 1) / nw;
        const t = s > 0 ? [[u0, w0], [u1, w0], [u1, w1], [u0, w0], [u1, w1], [u0, w1]] : [[u0, w0], [u1, w1], [u1, w0], [u0, w0], [u0, w1], [u1, w1]];
        for (const [u, w] of t) push(u, w);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      return g;
    };
    for (let i = 0; i < nO - 1; i++) {
      glassH.push(bilinear(L[i], L[i + 1], U[i + 1], U[i], out(L[i].clone().add(U[i + 1]).multiplyScalar(0.5))));
    }
    // flasque arrière : la section D0-L0-U0 déborde de la face droite des joues (pied→toit) ; on la ferme
    half.tri(D[0], L[0], U[0], v(-1, 0, 0));
    const k = nO - 1;
    // paroi basse d'un seul tenant (bâbord → pan avant → tribord) : congés verticaux (tangente 35 mm) à chaque
    // pli de facette, normales lissées pondérées par l'aire (plus de couture de normales sur le pan avant,
    // les pans restent plans et les plis lisent comme un rayon qui accroche une ligne de reflet)
    const ring = (arr) => [...arr, ...arr.slice().reverse().map(mz)];
    {
      const [fDf, fD, fL, sD] = filletRows([ring(Df), ring(D), ring(L), ring(D)], [0.035, 0.035, 0.035, 1e-6], 6);
      // joint creux d'ombre au pied du rouf (18 mm de haut, 8 mm de retrait, noir mat) : le rouf « flotte » sur le pont
      const GH = 0.018, GI = 0.008;
      const inN = (p) => { const o = out(p); o.y = 0; return o.normalize().multiplyScalar(-GI); };
      const gIn0 = fDf.map((p) => p.clone().add(inN(p))), gIn1 = fD.map((p) => p.clone().add(inN(p)).add(v(0, GH, 0)));
      const gOut = fD.map((p) => p.clone().add(v(0, GH, 0)));
      const gap = new Geo(), wall = new Geo();
      loftRows(gap, gIn0, gIn1, (c) => out(c)); loftRows(gap, gIn1, gOut, () => v(0, -1, 0));
      // fond du joint : ferme la trémie du pont (polygone vif) jusqu'au pied en retrait (aucun jour aux congés)
      const yb = (p) => v(p.x, p.y - 0.003, p.z);
      loftRows(gap, sD.map(yb), fD.map((p) => yb(p).add(inN(p)).add(inN(p).multiplyScalar(0.25))), () => v(0, 1, 0));
      // flancs légèrement galbés (bouge vertical de 12 mm à mi-hauteur), ramené à zéro sur 0,6 m aux deux
      // extrémités (raccord exact avec le flasque et les joues)
      {
        const sAcc = [0]; for (let i = 1; i < fD.length; i++) sAcc.push(sAcc[i - 1] + Math.hypot(fD[i].x - fD[i - 1].x, fD[i].z - fD[i - 1].z));
        const Lr = sAcc[sAcc.length - 1], NB = 6;
        const rows = [];
        for (let k = 0; k <= NB; k++) {
          const t = k / NB;
          rows.push(gOut.map((p, i) => {
            const q = p.clone().lerp(fL[i], t), o = out(q); o.y = 0; o.normalize();
            return q.addScaledVector(o, 0.048 * t * (1 - t) * ss(0, 0.6, Math.min(sAcc[i], Lr - sAcc[i])));
          }));
        }
        for (let k = 0; k < NB; k++) loftRows(wall, rows[k], rows[k + 1], out);
      }
      B.add(superG, M.hullBottom, smoothNormals(gap.build(), 32, true), { cast: false });
      B.add(superG, M.superstructure, smoothNormals(wall.build(), 32, true));
    }
    glassC.quad(L[k], mz(L[k]), mz(U[k]), U[k], v(1, 1, 0));
    both(superG, M.superstructure, half.build());
    both(upperGlass, M.glass, mergeGeometries(glassH, false), go);
    B.add(upperGlass, M.glass, glassC.build(), go);

    // meneaux fins + entourage métal (seuil)
    // (profils à arêtes arrondies R 12 mm : chaque montant accroche une ligne de reflet)
    for (let i = 1; i < nO; i++) both(upperGlass, M.metalDark, rbarG(L[i], U[i], 0.035, 0.05, 0.012));
    { const dx = v(0.025, 0, 0); both(upperGlass, M.metalDark, rbarG(L[0].clone().add(dx), U[0].clone().add(dx), 0.035, 0.05, 0.012)); } // montant arrière, en appui sur le flasque
    // seuil et linteau : joncs continus à onglets (plus d'about de barres qui se chevauchent aux angles)
    B.add(superG, M.accent, tubePath(ring(L), 0.024, 16), { cast: false });
    B.add(superG, M.metalDark, tubePath(ring(U).map((p) => p.clone().add(v(0, -0.02, 0))), 0.018, 14), { cast: false });

    // feux de navigation (rouge bâbord, vert tribord) : boîtier noir à plat sur le pan avant du rouf, optique légèrement en saillie
    {
      const f = 0.78, w = 0.5;
      const pb = D[4].clone().lerp(D[5], f), pt = L[4].clone().lerp(L[5], f);
      const p = pb.clone().lerp(pt, w);
      const t = new V3().subVectors(D[5], D[4]).normalize();
      const n = new V3().crossVectors(t, new V3().subVectors(pt, pb)).normalize();
      if (n.z < 0) n.negate();
      const u = new V3().crossVectors(n, t).normalize();
      const onFacet = (g, depth, lift) => xf(g, new THREE.Matrix4().makeBasis(t, u, n).setPosition(p.clone().addScaledVector(n, lift + depth / 2)));
      const housing = onFacet(new RoundedBoxGeometry(0.24, 0.09, 0.035, 3, 0.012), 0.035, 0.001); // (+11 mm : galbe du flanc)
      const lens = onFacet(new RoundedBoxGeometry(0.19, 0.05, 0.012, 2, 0.005), 0.012, 0.03);
      B.add(superG, M.metalDark, housing, { cast: false });
      B.add(superG, M.metalDark, mirrorZ(housing), { cast: false });
      B.add(superG, M.navGreen, lens, { cast: false });
      B.add(superG, M.navRed, mirrorZ(lens), { cast: false });
    }
  }

  // joues arrière massives : loft entre le plan au pont et le plan au toit
  const cheekBase = [[X_CHEEK, Z_CHEEK], [X_CHEEK, 3.0], [-11.0, ZD], [X_SIDE0, ZD], [X_SIDE0, Z_CHEEK]];
  const cheekTop = [[-10.8, Z_CHEEK], [-10.8, 2.55], [-10.4, ZU], [X_SIDE0, ZU], [X_SIDE0, Z_CHEEK]];
  {
    const g = new Geo();
    const rb = cheekBase.map(([x, z]) => v(x, FLOOR, z));
    const rd = cheekBase.map(([x, z]) => v(x, deckY(x), z));
    const rt = cheekTop.map(([x, z]) => v(x, YU, z));
    // congés verticaux à chaque angle : 12 mm au pont (les faces arrière, contre les banquettes, ne bougent
    // qu'à moins de 4 mm du coin), 40 mm au toit (identiques à ceux du bandeau de toit : raccord exact)
    {
      const [fb, fd, ft] = filletRows([rb, rd, rt], [0.012, 0.012, 0.04], 6, true);
      const cen = v(-10.45, 0, 2.75), hint = (c) => v(c.x - cen.x, 0, c.z - cen.z);
      loftRows(g, fb, fd, hint, true); loftRows(g, fd, ft, hint, true);
    }
    both(superG, M.superstructure, smoothNormals(g.build(), 40, true));
    // arêtes métal des joues : joncs ronds à embouts hémisphériques (ex-barres carrées à about franc)
    // (arrêtés 12 mm sous le bandeau ; ils naissent au-dessus de la ligne du pavois / des dossiers de banquette)
    for (const i of [1, 2]) { const e = rt[i].clone().addScaledVector(new V3().subVectors(rt[i], rd[i]).normalize(), -0.024); const s0 = rd[i].clone().lerp(rt[i], 0.74 / (rt[i].y - rd[i].y)); both(superG, M.accent, tubePath([s0, e], 0.021, 16), { cast: false }); }
    // vitrage trapèze sombre sur la face latérale, collé dans un cadre noir (sérigraphie + chant fermé)
    const a = rd[2].clone().lerp(rd[3], 0.3).lerp(rt[2].clone().lerp(rt[3], 0.3), 0.18);
    const b = rd[2].clone().lerp(rd[3], 0.92).lerp(rt[2].clone().lerp(rt[3], 0.92), 0.18);
    const c = rt[2].clone().lerp(rt[3], 0.92).lerp(rd[2].clone().lerp(rd[3], 0.92), 0.12);
    const d = rt[2].clone().lerp(rt[3], 0.62).lerp(rd[2].clone().lerp(rd[3], 0.62), 0.12);
    const off = (p, o = 0.012) => v(p.x, p.y, p.z + o);
    const tg = new Geo(); tg.quad(off(a), off(b), off(c), off(d), v(0, 0.3, 1));
    both(upperGlass, M.glass, tg.build(), go);
    {
      const q = [a, b, c, d], W = 0.035, nf = new V3().subVectors(b, a).cross(new V3().subVectors(d, a)).normalize();
      if (nf.z < 0) nf.negate();
      const ctr = a.clone().add(b).add(c).add(d).multiplyScalar(0.25);
      const edgeN = (p0, p1) => { const e = new V3().subVectors(p1, p0).cross(nf).normalize(); return e.dot(new V3().subVectors(p0, ctr)) < 0 ? e.negate() : e; };
      const Q = q.map((p, i) => { // coin extérieur : intersection des deux bords décalés de W
        const n1 = edgeN(q[(i + 3) % 4], p), n2 = edgeN(p, q[(i + 1) % 4]);
        return p.clone().addScaledVector(n1.clone().add(n2), W / (1 + n1.dot(n2)));
      });
      const fr = new Geo();
      for (let i = 0; i < 4; i++) {
        const j = (i + 1) % 4, h = edgeN(q[i], q[j]);
        fr.quad(off(q[i], 0.016), off(q[j], 0.016), off(Q[j], 0.016), off(Q[i], 0.016), nf);  // face du cadre
        fr.quad(off(Q[i], -0.004), off(Q[j], -0.004), off(Q[j], 0.016), off(Q[i], 0.016), h); // chant extérieur
        fr.quad(off(q[i], 0.008), off(q[j], 0.008), off(q[j], 0.016), off(q[i], 0.016), h.clone().negate()); // lèvre intérieure
      }
      both(superG, M.metalDark, fr.build(), { cast: false });
    }
  }

  // baie coulissante arrière (ouverte au centre)
  {
    const yf = deckY(X_DOOR), yt = YC;
    const door = new Geo();
    for (const dx of [0, 0.07]) door.quad(v(X_DOOR + dx, yf, 1.72 + dx), v(X_DOOR + dx, yf, Z_CHEEK), v(X_DOOR + dx, yt, Z_CHEEK), v(X_DOOR + dx, yt, 1.72 + dx), v(-1, 0, 0));
    both(upperGlass, M.glass, door.build(), go);
    // cadres à arêtes arrondies ; bouts noyés (haut dans le linteau, bas dans le seuil, côtés dans les joues)
    for (const z of [1.72, 1.79]) both(upperGlass, M.metalDark, rboxB(X_DOOR - 0.025, X_DOOR + 0.095, yf - 0.01, yt + 0.01, z - 0.018, z + 0.018, 0.01));
    both(superG, M.metalDark, rboxB(X_DOOR - 0.03, X_DOOR + 0.12, yf - 0.01, yt + 0.01, Z_CHEEK - 0.06, Z_CHEEK + 0.03, 0.012)); // montant épais
    B.add(superG, M.metalDark, rboxB(X_DOOR - 0.03, X_DOOR + 0.1, yt - 0.05, YU + 0.012, -Z_CHEEK - 0.02, Z_CHEEK + 0.02, 0.012));
    B.add(superG, M.accent, rboxB(X_DOOR - 0.03, X_DOOR + 0.1, yf - 0.012, yf + 0.02, -Z_CHEEK - 0.02, Z_CHEEK + 0.02, 0.008), { cast: false });
  }

  // =========================================================================
  // TOIT : bandeau, grand chanfrein métal, dessus plat ; plafond ; arceau radar
  // =========================================================================
  {
    const sideLoop = [v(-10.8, YU, 2.55), v(-10.4, YU, ZU), ...U];
    const loop = [...sideLoop, ...sideLoop.slice().reverse().map(mz)];
    const loop2 = loop.map((p) => new THREE.Vector2(p.x, p.z));
    const inset = (pts, d) => {
      let area = 0;
      for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; area += a.x * b.y - b.x * a.y; }
      const sgn = area > 0 ? 1 : -1;
      return pts.map((p, i) => {
        const a = pts[(i - 1 + pts.length) % pts.length], b = pts[(i + 1) % pts.length];
        const e1 = p.clone().sub(a).normalize(), e2 = b.clone().sub(p).normalize();
        const n1 = new THREE.Vector2(-e1.y, e1.x).multiplyScalar(sgn), n2 = new THREE.Vector2(-e2.y, e2.x).multiplyScalar(sgn);
        const nm = n1.clone().add(n2).normalize();
        return p.clone().add(nm.multiplyScalar(d / Math.max(0.35, nm.dot(n1))));
      });
    };
    const YF = YU + 0.07;
    const F = loop.map((p) => v(p.x, YF, p.z));
    const R = inset(loop2, 0.36).map((p) => v(p.x, YR, p.y));
    const C = inset(loop2, 0.05).map((p) => v(p.x, YC, p.y));
    const fascia = new Geo(), bevel = new Geo(), top = new Geo(), ceil = new Geo(), reveal = new Geo();
    // congés en coupe : bandeau → chanfrein (20 mm) et chanfrein → dessus (22 mm), remplaçant l'arête vive
    // et l'ancienne barre carrée ; puis congés en plan (tangente 40 mm, = joues) à chaque angle du contour.
    const NS = 4, rF = 0.02, rR = 0.022;
    const dirB = F.map((p, i) => new V3().subVectors(R[i], p).normalize());
    const Fa = F.map((p) => v(p.x, YF - rF, p.z)), Fb = F.map((p, i) => p.clone().addScaledVector(dirB[i], rF));
    const Ra = R.map((p, i) => p.clone().addScaledVector(dirB[i], -rR));
    const Rt = inset(loop2, 0.36 + rR).map((p) => v(p.x, YR, p.y));
    const arcF = [], arcR = [];
    for (let s = 0; s <= NS; s++) {
      arcF.push(F.map((p, i) => bez2(Fa[i], p, Fb[i], s / NS)));
      arcR.push(R.map((p, i) => bez2(Ra[i], p, Rt[i], s / NS)));
    }
    const fr = filletRows([loop, ...arcF, ...arcR, C], 0.04, 6, true);
    // bouge : tout ce qui est au-dessus du pied du bandeau suit roofCamber(z) (le bandeau grandit de 0 à 6 cm
    // vers l'axe, avant et arrière : l'arête du toit dessine un arc vue de face)
    const lift = (p) => v(p.x, p.y + roofCamber(p.z), p.z);
    const fl = fr[0], fF = fr.slice(1, NS + 2).map((r) => r.map(lift)), fRflat = fr.slice(NS + 2, 2 * NS + 3), fC = fr[fr.length - 1];
    const fR = fRflat.map((r) => r.map(lift));
    const hOut = (c) => v(c.x + 4.5, 0, c.z), hBand = (c) => v(c.x + 4.5, 0.6, c.z);
    loftRows(fascia, fl, fF[0], hOut, true);
    const band = [...fF, ...fR];
    for (let s = 0; s < band.length - 1; s++) loftRows(bevel, band[s], band[s + 1], hBand, true);
    // joint creux noir fermant le caisson du toit entre le bas du bandeau (YU) et le bord du plafond (YC, 5 cm en retrait)
    loftRows(reveal, fl, fC, (c) => v((c.x + 4.5) * 0.2, -1, c.z * 0.2), true);
    loftRows(reveal, fl, fC, (c) => v(-(c.x + 4.5) * 0.2, 1, -c.z * 0.2), true);
    top.poly(fRflat[NS], v(0, 1, 0)); // dessus : triangulé à plat, subdivisé puis bombé (normales lissées)
    // jonc d'égouttage : petit bourrelet arrondi sur le dessus, 5 cm en retrait de l'arête (GLB : roofDripRail)
    if (!EXT) {
      const ring = filletRows([inset(loop2, 0.36 + rR + 0.04).map((p) => v(p.x, YR + 0.004, p.y))], 0.03, 5, true)[0].map(lift);
      B.add(roof, M.metalDark, tubePath([...ring, ring[0]], 0.013, 12)); // Ø26 mm sombre, porte ombre
    }
    // plafond percé de la trémie du caisson central rehaussé (voir interior.js)
    {
      const K = CAISSON, hole = [v(K.x0, YC, -K.z), v(K.x1, YC, -K.z), v(K.x1, YC, K.z), v(K.x0, YC, K.z)];
      const pr = (p) => new THREE.Vector2(p.x, p.z);
      const all = [...fC, ...hole];
      for (const f of THREE.ShapeUtils.triangulateShape(fC.map(pr), [hole.map(pr)])) ceil.tri(all[f[0]], all[f[1]], all[f[2]], v(0, -1, 0));
    }
    if (!EXT) { // GLB : roofFascia, roofBevel, roofTop (peau extérieure du toit)
      B.add(roof, M.metalDark, smoothNormals(fascia.build(), 40, true), { name: 'roofFascia' });
      B.add(roof, M.metalDark, reveal.build(), { cast: false });
      B.add(roof, M.accent, smoothNormals(bevel.build(), 40, true), { name: 'roofBevel' });
      const topG = subdivideTris(top.build(), 3);
      { const a = topG.attributes.position; for (let i = 0; i < a.count; i++) a.setY(i, a.getY(i) + roofCamber(a.getZ(i))); }
      B.add(roof, M.superstructure, smoothNormals(topG, 20, true));
    }
    B.add(roof, M.ceiling, ceil.build(), { cast: false });
    // sous-face des joues (plafond du pavillon arrière) (GLB : cheekSoffit)
    if (!EXT) for (const s of [1, -1]) {
      const g = new Geo();
      g.poly([v(-10.8, YC + 0.01, s * Z_CHEEK), v(-10.8, YC + 0.01, s * 2.55), v(-10.4, YC + 0.01, s * ZU), v(X_SIDE0, YC + 0.01, s * ZU), v(X_SIDE0, YC + 0.01, s * Z_CHEEK)], v(0, -1, 0));
      B.add(roof, M.superstructure, g.build(), { cast: false });
    }
  }

  const radar = new THREE.Group(); radar.name = 'radarCamera';
  {
    const xr = -7.2, y0 = YR + roofCamber(0); // posé sur le dessus bombé
    // arceau : socle, montants et traverse à arêtes arrondies (profils extrudés à grands rayons)
    B.add(roof, M.metalDark, rboxB(xr - 0.25, xr + 0.25, y0 - 0.01, y0 + 0.06, -0.6, 0.6, 0.025));
    for (const z of [-0.45, 0.45]) B.add(roof, M.chrome, rboxB(xr - 0.06, xr + 0.06, y0 + 0.02, y0 + 0.3, z - 0.06, z + 0.06, 0.035));
    B.add(roof, M.chrome, rboxB(xr - 0.09, xr + 0.09, y0 + 0.28, y0 + 0.36, -1.45, 1.45, 0.036));
    // radômes : piédestal et fût tournés à arêtes arrondies (profils de révolution), au lieu de cylindres vifs
    const arc = (pts, cx, cy, r, a0, a1, n = 5) => { for (let k = 0; k <= n; k++) { const a = a0 + (a1 - a0) * k / n; pts.push(new THREE.Vector2(cx + r * Math.cos(a), cy + r * Math.sin(a))); } };
    const ped = [new THREE.Vector2(0, 0.355)]; arc(ped, 0.125, 0.37, 0.015, -Math.PI / 2, 0); arc(ped, 0.105, 0.465, 0.015, 0, Math.PI / 2); ped.push(new THREE.Vector2(0, 0.48));
    const body = [new THREE.Vector2(0, 0.48)]; arc(body, 0.295, 0.505, 0.025, -Math.PI / 2, 0, 6); body.push(new THREE.Vector2(0.32, 0.745));
    for (const z of [-1.15, 1.15]) {
      B.add(roof, M.metalDark, place(new THREE.LatheGeometry(ped, 24), xr, y0, z));
      B.add(roof, M.metalDark, place(new THREE.LatheGeometry(body, 48), xr, y0, z));
      B.add(roof, M.metalDark, place(new THREE.SphereGeometry(0.32, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), xr, y0 + 0.74, z));
      B.add(roof, M.metalDark, place(new THREE.TorusGeometry(0.325, 0.012, 6, 32), xr, y0 + 0.74, z, Math.PI / 2));
    }
    for (const z of [-0.32, 0.32]) {
      B.add(roof, M.chrome, cylBetween(v(xr + 0.02, y0 + 0.36, z), v(xr + 0.02, y0 + 1.1, z), 0.035, 0.03, 10));
      B.add(roof, M.metalDark, cylBetween(v(xr + 0.02, y0 + 1.1, z), v(xr + 0.02, y0 + 2.05, z), 0.018, 0.01, 8));
      B.add(roof, M.metalDark, place(new THREE.CylinderGeometry(0.04, 0.04, 0.06, 10), xr + 0.02, y0 + 0.8, z));
    }
    B.add(roof, M.navWhite, place(new THREE.CylinderGeometry(0.04, 0.04, 0.08, 12), xr, y0 + 0.4, 0.75), { cast: false });
    radar.position.set(xr, y0 + 0.4, 0);
    B.add(radar, M.metalDark, place(new THREE.CylinderGeometry(0.035, 0.035, 0.08, 10), 0, 0, 0));
    B.add(radar, M.metalDark, place(new THREE.SphereGeometry(0.11, 18, 12), 0, 0.12, 0));
    B.add(radar, M.glass, place(new THREE.CircleGeometry(0.055, 16), -0.106, 0.12, 0, 0, -Math.PI / 2), { order: 3, cast: false });
    roof.add(radar);
  }

  // =========================================================================
  // INTÉRIEUR (salon de plain-pied, pilotage, pont arrière) : voir interior.js
  // =========================================================================
  const interiorApi = buildInterior({ B, M, Geo, interior, roof, aftDeck, both, mz, v, boxB, boxG, place, cylBetween, xf, section, deckY, halfW, uvScale,
    FLOOR, YL, YU, YC, X_DOOR, Z_CHEEK, X_SIDE0, D2, L2, U2, BT, CAISSON });

  // =========================================================================
  // SPOTS SOUS-MARINS
  // =========================================================================
  {
    const disk = (pos, normal) => {
      const m = new THREE.Mesh(new THREE.CircleGeometry(0.085, 20), M.underwaterLight);
      m.position.copy(pos).addScaledVector(normal, 0.012);
      m.lookAt(m.position.clone().add(normal));
      underwaterLights.add(m);
      // enjoliveur tourné inox (lèvre arrondie) au lieu d'un anneau plat
      const rim = new THREE.Mesh(onNormal(bezelG(0.083, 0.115, 0.018, 0.012, 32), pos.clone(), normal), M.chrome || M.accent);
      underwaterLights.add(rim);
    };
    for (const z of [-1.3, -0.5, 0.5, 1.3]) disk(v(XS, -0.32, z), v(-1, 0, 0));
    const xl = -10.6, sl = section(xl), y = -0.3, t = (y - sl.keel) / (sl.chY - sl.keel);
    for (const sgn of [1, -1]) disk(v(xl, y, t * sl.chZ * sgn), v(0, -sl.chZ, (sl.chY - sl.keel) * sgn).normalize());
  }

  B.flush(uvScale);

  // extérieur Blender : maillages du GLB rangés dans les mêmes groupes que les pièces procédurales remplacées
  // (coupe : roof + upperGlass masqués ; miniature : clone ci-dessous ; stage.js : parts.hull, superstructure…)
  if (EXT) {
    const n = addExterior(EXT, { hull: hullG, superstructure: superG, roof, upperGlass }, M, uvScale);
    if (!n) throw new Error('GLB extérieur vide');
  }

  // =========================================================================
  // MAQUETTE SUR LA TABLE BASSE : clone exact de l'extérieur, au 1/25
  // (matériaux partagés → elle suit les options de couleur en direct)
  // =========================================================================
  if (interiorApi.modelMatrix) {
    const skipMats = new Set([M.ledGlow, M.ledStrip, M.ceiling].filter(Boolean));
    const mini = new THREE.Group(); mini.name = 'miniature';
    for (const src of [hullG, superG, roof, upperGlass]) {
      const c = src.clone(true);
      const drop = [];
      c.traverse((o) => {
        if (o.isLight) drop.push(o);
        else if (o.isMesh) {
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          if (mats.some((m) => skipMats.has(m))) drop.push(o);
        }
      });
      for (const o of drop) o.removeFromParent();
      mini.add(c);
    }
    mini.matrixAutoUpdate = false;
    mini.matrix.copy(interiorApi.modelMatrix);
    interior.add(mini);
  }

  // =========================================================================
  // API
  // =========================================================================
  function setLedColor(hex) { interiorApi.setLed(hex); }

  const hotspots = [
    { id: 'bow', label: 'Plage avant', text: 'Longue plage avant en teck, quatre panneaux de pont et taquets noirs.', position: v(7.5, 2.25, 0), view: 'bow' },
    { id: 'hull', label: 'Coque', text: 'Étrave verticale et bouchains marqués : flanc bas anthracite, flanc haut métal en dévers, séparés par une arête vive.', position: v(13.2, 1.3, 0.7), view: 'profile' },
    { id: 'glazing', label: 'Verrière', text: 'Verrière basse à facettes, vitrages inclinés soulignés par le bandeau titane fumé.', position: v(-4.5, 2.7, 3.2), view: 'exterior' },
    { id: 'salon', label: 'Salon', text: 'Deux méridiennes en cuir face à face autour d’une table basse en noyer.', position: v(-4.7, 2.5, 0), view: 'salon' },
    { id: 'helm', label: 'Poste de pilotage', text: 'À tribord avant : deux sièges pilote face à trois écrans.', position: v(0.8, 2.9, 1.7), view: 'helm' },
    { id: 'aftdeck', label: 'Pont arrière', text: 'Banquettes en L sur les deux ailes, table ronde en teck à tribord, escalier central vers la plateforme de bain.', position: v(-11.7, 2.5, 0), view: 'aftdeck' },
    { id: 'stairs', label: 'Escalier & plateforme', text: 'Escalier central entre les deux rebords de la poupe, vers la plateforme de bain.', position: v(-13.0, 1.0, 0), view: 'stern' },
    { id: 'radar', label: 'Arceau radar', text: 'Arceau noir avec deux radômes, deux antennes fouet et une caméra.', position: v(-7.2, 4.8, 0), view: 'top' },
  ];

  setName('DIÈDRE 29');
  setLedColor(0xffb86b);

  return {
    root,
    materials,
    parts: { roof, upperGlass, interior, underwaterLights, radar, aftDeck, hull: hullG, superstructure: superG },
    hotspots,
    setName,
    setLedColor,
  };
}
