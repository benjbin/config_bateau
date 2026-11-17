// SILLAGE 29 — super-catamaran à voile électrique, modèle 3D (NEOKROME)
// Repère : +X avant, +Y haut, +Z tribord, flottaison y = 0, mètres. Coques à z = ±4,75 (voir blender/S29_SPEC.md).
// Tout le bateau vient du GLB Blender assets/cat29.glb (groupes hull, superstructure, roof, upperGlass, interior,
// aftDeckFurniture ; matériaux nommés comme les clés de `materials`) : on y remet les matériaux partagés du
// configurateur (createBoatMaterials / addExterior de boat.js) puis on ajoute les éléments procéduraux génériques :
// nom de coque sur le flanc extérieur des deux coques, projecteurs sous-marins, éclairage du salon, émissifs jour/nuit.
// Même API que buildBoat (boat.js) + hullProfile ('cat29' : vues, houle, berceau… de stage.js) et setDayFactor.
import * as THREE from 'three';
import { createBoatMaterials, addExterior } from './boat.js';
import { makeLeatherMaps, softGoodsShader, screenCanvas } from './interior.js';

export const CAT29_URL = 'assets/cat29.glb?v=2'; // ?v : contourne le cache 24 h des GLB (nginx) à chaque nouvel export

const V3 = THREE.Vector3;
const v = (x, y, z) => new V3(x, y, z);

// Lignes de référence (portage de blender/lib/cat_lines.py) : repli si le lancer de rayons sur la coque échoue
const XB = 14.35, XS = -13.7, HULL_Z = 4.75, KMAX = 1.65;
const TUMBLE = Math.tan(THREE.MathUtils.degToRad(14)), FLARE = Math.tan(THREE.MathUtils.degToRad(12));
const clamp01 = (t) => Math.max(0, Math.min(1, t));
const ss = (e0, e1, x) => { const t = clamp01((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };
function section(x) {
  const t = Math.min((XB - x) / 11.5, 1), a = ss(-10, XS, x);
  const kw = Math.max(KMAX * (1 - (1 - t) ** 2.2) - 0.14 * a * a, 0);
  const K = kw * (1 - 0.1 * clamp01((XS + 0.5 - x) / 0.5));
  const knY = 1.15 + 0.60 * ss(-5, XB, x) ** 2, chY = -0.10 + 0.55 * ss(-2, XB, x) ** 1.5;
  return { knZ: K, knY, chZ: Math.max(K - (knY - chY) * FLARE * (K / KMAX), 0), chY };
}
// point du flanc bas extérieur (bouchain -> arête) à la hauteur y, coque side (+1 tribord / -1 bâbord)
function flankPoint(x, y, side) {
  const s = section(x), t = (s.knY - s.chY) > 1e-6 ? (y - s.chY) / (s.knY - s.chY) : 0;
  return v(x, y, side * (HULL_Z + s.chZ + t * (s.knZ - s.chZ)));
}

export function buildCatamaran(opts = {}) {
  const EXT = opts.exterior;
  if (!EXT) throw new Error('GLB du catamaran manquant');
  const phys = (p) => new THREE.MeshPhysicalMaterial(p);
  const { materials, uvScale } = createBoatMaterials();
  const M = materials;

  // ---- finitions intérieures (équivalent générique de interior.js, sans dépendre de la géométrie du DIÈDRE 29) ----
  {
    const leather = makeLeatherMaps(), U = M.upholsteryInterior;
    U.normalMap = leather.normal; U.normalScale = new THREE.Vector2(0.8, 0.8);
    U.roughnessMap = leather.rough; U.roughness = 0.56; U.clearcoat = 0; U.specularIntensity = 0.6;
    U.sheen = 0.3; U.sheenRoughness = 0.4;
    softGoodsShader(U, { tone: 0.04, toneScale: 2.2, rough: 0.22, crease: 0.22 });
    uvScale.set(U, [0.35, 0.35]);
  }
  uvScale.set(M.interiorFloor, [2.4, 2.4]); // parquet de refineBoatMaterials (tuile 2,4 m, repeat 1×2)
  M.ceiling.color.set(0xf3ece0); M.ceiling.emissive.set(0x2a241c); M.ceiling.roughness = 0.95;
  // écrans du poste de pilotage (UV 0..1 par écran) : carte marine, verre antireflet
  M.screens.color.set(0x000000); M.screens.emissive.set(0xffffff); M.screens.emissiveMap = screenCanvas('chart');
  Object.assign(M.screens, { emissiveIntensity: 2.0, envMapIntensity: 0.12, specularIntensity: 0.25, roughness: 0.3, clearcoat: 0.3, clearcoatRoughness: 0.04 });
  M.screens.needsUpdate = true;

  // ---- groupes three.js (mêmes noms que le DIÈDRE 29 : stage.js / main.js s'y retrouvent) ----
  const root = new THREE.Group(); root.name = 'SILLAGE29';
  const hullG = new THREE.Group(); hullG.name = 'hull';
  const superG = new THREE.Group(); superG.name = 'superstructure';
  const roof = new THREE.Group(); roof.name = 'roof';
  const upperGlass = new THREE.Group(); upperGlass.name = 'upperGlass';
  const interior = new THREE.Group(); interior.name = 'interior';
  const aftDeck = new THREE.Group(); aftDeck.name = 'aftDeckFurniture';
  const underwaterLights = new THREE.Group(); underwaterLights.name = 'underwaterLights';
  root.add(hullG, superG, roof, upperGlass, interior, aftDeck, underwaterLights);

  const all = { hull: hullG, superstructure: superG, roof, upperGlass, interior, aftDeckFurniture: aftDeck };
  const present = Object.fromEntries(Object.entries(all).filter(([k]) => EXT.children.some((o) => o.name === k)));
  if (!present.hull) throw new Error('GLB du catamaran : groupe « hull » absent');
  const n = addExterior(EXT, present, M, uvScale);
  if (!n) throw new Error('GLB du catamaran vide');
  root.updateMatrixWorld(true);

  // lancer de rayons sur la coque réelle du GLB (flancs, tableau) — positionne nom et projecteurs exactement
  const hullMeshes = [];
  hullG.traverse((o) => { if (o.isMesh && (o.material === M.hull || o.material === M.hullBottom || o.material === M.accent)) hullMeshes.push(o); });
  const rc = new THREE.Raycaster();
  const hit = (from, dir, far) => {
    rc.set(from, dir); rc.far = far;
    const h = rc.intersectObjects(hullMeshes, false)[0];
    if (!h || !h.face) return null;
    return { p: h.point, n: h.face.normal.clone().transformDirection(h.object.matrixWorld).normalize() };
  };

  // =========================================================================
  // NOM DE COQUE : flanc bas laqué, vers l'avant, côté extérieur de chaque coque
  // =========================================================================
  const nameCanvas = document.createElement('canvas');
  nameCanvas.width = 2048; nameCanvas.height = 185; // proportions du bandeau (4,2 m × 0,38 m)
  const nameTex = new THREE.CanvasTexture(nameCanvas);
  nameTex.colorSpace = THREE.SRGBColorSpace; nameTex.anisotropy = 8;
  M.name = phys({ map: nameTex, transparent: true, metalness: 0.55, roughness: 0.32, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, depthWrite: false });
  function setName(str) {
    const g = nameCanvas.getContext('2d');
    const W = nameCanvas.width, H = nameCanvas.height;
    g.clearRect(0, 0, W, H);
    const txt = String(str && String(str).trim() ? str : 'SILLAGE 29').toUpperCase();
    let fs = 128;
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
    const x0 = 8.0, x1 = 12.2, y0 = 0.98, y1 = 1.36, nx = 24, ny = 3;
    for (const side of [1, -1]) {
      const grid = [];
      for (let i = 0; i <= nx; i++) {
        const x = x0 + (x1 - x0) * i / nx, col = [];
        for (let j = 0; j <= ny; j++) {
          const y = y0 + (y1 - y0) * j / ny;
          const h = hit(v(x, y, side * 14), v(0, 0, -side), 14);
          // décollé de 12 mm le long de la normale (comme le DIÈDRE 29) ; repli : lignes de référence
          col.push(h && Math.abs(h.p.z) > HULL_Z ? h.p.clone().addScaledVector(h.n, 0.012) : flankPoint(x, y, side).add(v(0, 0, side * 0.012)));
        }
        grid.push(col);
      }
      const pos = [], uv = [];
      const U = (i) => (side > 0 ? i / nx : 1 - i / nx);
      for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
        const a0 = [grid[i][j], U(i), j / ny], b0 = [grid[i + 1][j], U(i + 1), j / ny];
        const a1 = [grid[i][j + 1], U(i), (j + 1) / ny], b1 = [grid[i + 1][j + 1], U(i + 1), (j + 1) / ny];
        for (let t of [[a0, b0, b1], [a0, b1, a1]]) {
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
  // PROJECTEURS SOUS-MARINS : deux par coque, dans le tableau immergé
  // =========================================================================
  {
    const rimGeo = new THREE.TorusGeometry(0.1, 0.016, 10, 32);
    for (const hz of [-HULL_Z, HULL_Z]) for (const dz of [-0.42, 0.42]) {
      const h = hit(v(-18, -0.3, hz + dz), v(1, 0, 0), 8);
      const p = h && h.p.x < XS + 0.8 ? h.p : v(XS, -0.3, hz + dz);
      const nrm = h && h.p.x < XS + 0.8 && h.n.x < -0.3 ? h.n : v(-1, 0, 0);
      const disk = new THREE.Mesh(new THREE.CircleGeometry(0.085, 20), M.underwaterLight);
      disk.position.copy(p).addScaledVector(nrm, 0.012);
      disk.lookAt(disk.position.clone().add(nrm));
      underwaterLights.add(disk);
      const rim = new THREE.Mesh(rimGeo, M.chrome);
      rim.position.copy(p).addScaledVector(nrm, 0.008);
      rim.lookAt(rim.position.clone().add(nrm));
      underwaterLights.add(rim);
    }
  }

  // =========================================================================
  // ÉCLAIRAGE DU SALON ET DU COCKPIT (le GLB n'a pas de lumières) : spots de plafond chauds la nuit,
  // couleur d'ambiance LED sur les gorges ; lumière du jour diffuse (vitrages) le jour
  // =========================================================================
  const nightLights = [], dayLights = [];
  {
    for (const [x, z] of [[-3.6, -2.0], [-3.6, 2.0], [0.6, -2.0], [0.6, 2.0], [4.6, 2.6], [4.0, -2.4]]) {
      const l = new THREE.PointLight(0xffd2a0, 1.7, 7.5, 2);
      l.position.set(x, 4.45, z);
      interior.add(l); nightLights.push([l, l.intensity]);
    }
    for (const x of [-11.2, -7.6]) { // cockpit, sous la casquette du flybridge
      const ck = new THREE.PointLight(0xffc890, 1.4, 7.5, 2);
      ck.position.set(x, 4.55, 0);
      aftDeck.add(ck); nightLights.push([ck, ck.intensity]);
    }
    for (const x of [-5.5, -0.5]) { // flybridge, sous le hardtop
      const fl = new THREE.PointLight(0xffc890, 1.3, 8, 2);
      fl.position.set(x, 7.15, 0);
      roof.add(fl); nightLights.push([fl, fl.intensity]);
    }
    const day = new THREE.PointLight(0xe8eef8, 2.4, 13, 1.6); // rebond de la lumière du jour dans le salon
    day.position.set(0.4, 3.4, 0); // à mi-hauteur : pas de tache sur le plafond
    interior.add(day); dayLights.push([day, day.intensity]);
  }
  const ceilBase = M.ceiling.emissive.clone(), scrBase = M.screens.emissiveIntensity;
  let ledOn = true;
  function setDayFactor(k) { // k = 1 nuit, 0 plein jour (main.js : facteur lissé)
    k = clamp01(k);
    const f = (day) => day + (1 - day) * k;
    M.ceiling.emissive.copy(ceilBase).multiplyScalar(f(0.25) * (ledOn ? 1 : 0.5));
    M.screens.emissiveIntensity = scrBase * f(0.6);
    for (const [l, base] of nightLights) { l.intensity = base * f(0.12); l.visible = k > 0.3; }
    for (const [l, base] of dayLights) { l.intensity = base * (0.04 + 0.96 * (1 - k)); l.visible = k < 0.9; }
  }
  function setLedColor(hex) {
    ledOn = !(hex === null || hex === undefined || hex === false);
    M.ledStrip.color.set(ledOn ? hex : 0x1b1b1b);
  }

  // =========================================================================
  // API
  // =========================================================================
  const hotspots = [
    { id: 'rig', label: 'Gréement carbone', text: 'Sloop à mât carbone de 38 m, bôme à enrouleur et foc sur enrouleur : toute la voilure se manœuvre depuis le flybridge.', position: v(7.6, 12.0, 0), view: 'exterior' },
    { id: 'bow', label: 'Lounge avant', text: 'Pont avant plein en teck avec un lounge creusé face à la mer, entre les deux étraves.', position: v(10.8, 2.9, 0), view: 'bow' },
    { id: 'hull', label: 'Deux coques', text: 'Coques galbées à franc-bord élevé, hublots allongés des cabines. Largeur hors tout 12,8 m.', position: v(9.5, 1.6, HULL_Z + 1.4), view: 'profile' },
    { id: 'glazing', label: 'Salon panoramique', text: 'Vitrage enveloppant cintré, pare-brise incliné sous la casquette du flybridge.', position: v(0.5, 3.6, 5.05), view: 'exterior' },
    { id: 'salon', label: 'Salon de pont', text: 'Salon de plain-pied avec le cockpit : grand canapé, salle à manger, îlot bar et vue à 360°.', position: v(-1.5, 3.0, 0), view: 'salon' },
    { id: 'helm', label: 'Pilotage intérieur', text: 'Poste de pilotage intérieur avant tribord, face au pare-brise.', position: v(5.2, 3.4, 2.8), view: 'helm' },
    { id: 'fly', label: 'Flybridge', text: 'Poste de barre, bar et grand salon extérieur sous le hardtop solaire.', position: v(-2.5, 5.9, 0), view: 'top' },
    { id: 'aftdeck', label: 'Cockpit', text: 'Cockpit abrité par le flybridge : grand canapé en U et table repas en teck.', position: v(-9.5, 3.0, 0), view: 'aftdeck' },
    { id: 'stern', label: 'Plateforme de bain', text: 'Grande plateforme arrière au ras de l’eau entre les coques, garage pour l’annexe et terrasses latérales rabattables.', position: v(-13.6, 1.0, 0), view: 'stern' },
    { id: 'pods', label: 'Propulsion électrique', text: 'Un pod électrique sous chaque coque, hélices contrarotatives ; propulseur d’étrave dans chaque coque.', position: v(-10.4, -0.9, -HULL_Z), view: 'stern' },
  ];

  setName('SILLAGE 29');
  setLedColor(0xffb86b);
  setDayFactor(0);

  return {
    model: 'cat29',
    hullProfile: 'cat29',
    root,
    materials,
    parts: { roof, upperGlass, interior, underwaterLights, aftDeck, hull: hullG, superstructure: superG },
    hotspots,
    setName,
    setLedColor,
    setDayFactor,
  };
}
