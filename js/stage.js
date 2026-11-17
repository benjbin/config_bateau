// DIÈDRE 29 — Scène / rendu (NEOCHROME)
// Renderer, ciel procédural, océan procédural, sol studio, lumières, caméra & vues.
// Aucune texture externe : tout est procédural (shaders / canvas).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// ---------------------------------------------------------------------------
// Vues caméra (repère : +X avant, +Y haut, +Z tribord, flottaison y = 0)
// `interior: true` => near réduit, orbite « tête qui tourne » autour d'un point
// placé à `lookRadius` m devant la caméra (la cible du contrat sert de direction).
// ---------------------------------------------------------------------------
const VIEWS = {
  // héro 3/4 plus bas (~9°) : le bordé laqué reflète la mer rasante et la bande d'horizon (prise de vue « yacht »)
  exterior: { label: '360°', pos: [28, 6.4, -32], target: [-0.5, 1.7, 0] },
  profile:  { label: 'Profil', pos: [-1, 3.2, -50], target: [-1, 1.9, 0] },
  bow:      { label: 'Étrave', pos: [31, 4.2, -11], target: [7, 1.8, 0] },
  stern:    { label: 'Poupe', pos: [-33, 5.2, -6], target: [-11, 1.6, 0] },
  top:      { label: 'Dessus', pos: [0, 50, 0.6], target: [0, 1.5, 0], panelShift: true },
  aftdeck:  { label: 'Pont arrière', pos: [-20.5, 3.6, -4.6], target: [-11.0, 2.2, 0.3], minDistance: 3.5 },
  salon:    { label: 'Salon', pos: [1.5, 3.15, 0], target: [-12, 2.6, 0], interior: true, lookRadius: 0.6, fov: 46 },
  helm:     { label: 'Pilotage', pos: [-3.5, 3.1, -1.0], target: [5.0, 2.2, 0.4], interior: true, lookRadius: 0.6, fov: 52 },
  cutaway:  { label: 'Coupe', pos: [15, 33, -27], target: [-3, 1.2, 0], panelShift: true },
};
// SILLAGE 29 (28,7 m × 12,8 m, catamaran à voile) : coques à z = ±4,75, salon x −5,2 → 6,6 (plancher 2,40,
// plafond 4,70), flybridge 5,00 + hardtop 7,55, mât x 7,6 (tête 38 m), cockpit x −13,7 → −5,2, pilotage avant tribord
const VIEWS_CAT29 = {
  exterior: { label: '360°', pos: [31, 7.6, -36], target: [0, 3.6, 0] },
  profile:  { label: 'Profil', pos: [0, 4.6, -58], target: [0, 3.6, 0] },
  bow:      { label: 'Étrave', pos: [33, 5.4, -12], target: [6, 2.9, 0] },
  stern:    { label: 'Poupe', pos: [-36, 6.2, -8], target: [-12, 2.8, 0] },
  top:      { label: 'Dessus', pos: [0, 66, 0.6], target: [0, 1.5, 0], panelShift: true },
  aftdeck:  { label: 'Cockpit', pos: [-23.5, 4.8, -5.0], target: [-9.5, 3.3, 0.3], minDistance: 3.5 },
  salon:    { label: 'Salon', pos: [5.4, 3.95, -3.2], target: [-6, 3.25, 1.0], interior: true, lookRadius: 0.6, fov: 50 },
  helm:     { label: 'Pilotage', pos: [0.6, 3.9, -0.8], target: [6.6, 3.15, 3.0], interior: true, lookRadius: 0.6, fov: 52 },
  cutaway:  { label: 'Coupe', pos: [16, 38, -30], target: [-1, 2.4, 0], panelShift: true },
};

// ---------------------------------------------------------------------------
// Profils de coque : tout ce qui, dans la scène, dépend de la forme du bateau (vues, houle échantillonnée sous
// la carène, réponse dynamique, ellipse(s) d'amortissement de l'eau, halos nocturnes, berceau du showroom…).
// Le bateau le choisit par api.hullProfile (défaut 'd29' : valeurs historiques du DIÈDRE 29, inchangées).
// ---------------------------------------------------------------------------
function seaGrid(xs, width, hullsZ) {
  const pts = [];
  for (const x of xs) {
    const w = width(x);
    for (const hz of hullsZ) for (const zf of (hullsZ.length > 1 ? [-1, 0, 1] : [-1, -0.5, 0, 0.5, 1])) pts.push([x, hz + zf * w]);
  }
  return pts;
}
const HULL_PROFILES = {
  d29: {
    views: VIEWS,
    // Tenue à la mer : grille couvrant la flottaison (28 m × 7,7 m), carène effilée vers l'étrave
    seaPts: seaGrid([-12, -8, -4, 0, 4, 8, 12], (x) => 3.3 * Math.min(1, (14.4 - x) / 9), [0]),
    // périodes propres d'un yacht de 29 m, roulis peu amorti
    dof: { heave: [4.4, 0.38], pitch: [3.9, 0.42], roll: [6.2, 0.13], yaw: [14, 0.6] },
    gain: { pitch: 0.6, roll: 1.15, yaw: 0.08 },
    ell: [15.6, 4.3, 0],                  // demi-axes x, z de l'ellipse d'eau calme, décalage |z| des coques
    ends: [8.0, 13.0, -10.0, -13.8],      // clapot renforcé à l'étrave / au tableau (dx relatif au bateau)
    spillA: [-5.0, 4.8, 4.3, 1.4],        // halo nocturne le long des flancs : centre x, demi-longueur, |z|, largeur
    spillB: [-16.2, 1.6, 2.6, 0],         // halo du cockpit / jupe : x, longueur, largeur z, décalage |z|
    glowSpread: 0.25,
    cradle: { stations: [-9.0, -1.0, 7.0], hulls: [0], sideZ: 2.0, keelPad: [0.62, 0.4], sidePad: [0.56, 0.62] },
    contact: [36, 11],
    interiorLight: [-4.2, 2.9, 0],
    cut: [4.4, 2.45],
    nav: null,                            // feux calculés d'après la boîte de la superstructure (historique)
  },
  cat29: {
    views: VIEWS_CAT29,
    // deux coques (z = ±4,75), flottaison ~28 m : 7 couples × 3 points par coque
    seaPts: seaGrid([-13, -9, -4.5, 0, 4.5, 9, 12.6], (x) => 1.15 * Math.min(1, (14.35 - x) / 6), [-4.75, 4.75]),
    // catamaran plus grand et plus lourd que le 24 m : périodes un peu plus longues, roulis raide bien amorti
    dof: { heave: [4.0, 0.42], pitch: [3.8, 0.45], roll: [3.9, 0.36], yaw: [13, 0.6] },
    gain: { pitch: 0.55, roll: 0.9, yaw: 0.05 },
    ell: [15.0, 1.85, 4.75],
    ends: [8.0, 13.4, -10.8, -14.6],
    spillA: [0.4, 6.4, 6.8, 1.3],
    spillB: [-15.0, 1.6, 2.0, 4.75],
    glowSpread: 0.03,
    cradle: { stations: [-7.0, 0.5, 7.4], hulls: [-4.75, 4.75], sideZ: 0.78, keelPad: [0.6, 0.36], sidePad: [0.55, 0.46] },
    contact: [36, 18],
    interiorLight: [0.4, 3.6, 0],
    cut: [5.3, 3.15],
    shadowTop: 15,                        // mât de 38 m : la caméra d'ombre ne cadre que le bas (résolution)
    nav: { port: [6.0, 3.1, -5.1], stbd: [6.0, 3.1, 5.1], mast: [7.4, 38.2, 0], stern: [-13.75, 2.6, 0] },
  },

};

// ---------------------------------------------------------------------------
// Ambiances
// ---------------------------------------------------------------------------
function sunDirFrom(elevDeg, azDeg) {
  const e = THREE.MathUtils.degToRad(elevDeg), a = THREE.MathUtils.degToRad(azDeg);
  // azimut 0 = +X (avant), 90 = +Z (tribord)
  return new THREE.Vector3(Math.cos(e) * Math.cos(a), Math.sin(e), Math.cos(e) * Math.sin(a));
}

const AMBIANCES = {
  overcast: {
    // ciel couvert « lumineux » : nappes nuageuses fragmentées, soleil voilé qui perce (ombres présentes mais douces)
    zenith: '#7f93ab', horizon: '#cdd1d5', seaHorizon: '#7a858f', skyCurve: 0.5, sunDir: sunDirFrom(34, -58),
    sunColor: '#fff1e0', sunGlow: 0.5, sunDisk: 9.0, cloudCover: 0.68, cloudOpacity: 0.97,
    cloudColor: '#d6d9dc', cloudShade: '#5e6570', stars: 0, studio: 0,
    light: 2.7, lightColor: '#f8f2e8', hemi: 0.46, hemiSky: '#c6d3e4', hemiGround: '#6a737a',
    fill: 0, rim: 0, interior: 1.2, softbox: 0.0, exposure: 1.06, envGain: 1.6, envInt: 1.3, bloom: 0.16,
    waterDeep: '#1a2a37', waterScatter: '#34505f', sunSpec: 0.6, waveAmp: 1.0, night: 0,
    sunVeil: 0.75, envSun: 22, shadowRadius: 2.0, ao: 0.85, foam: 0.3, rimColor: '#ffffff', whitecap: 0, lanes: 1,
  },
  sunset: {
    // coucher de soleil bicolore : orange concentré autour du soleil/horizon, ciel haut bleu, mer bleu-ardoise
    zenith: '#2c4f94', horizon: '#ec9a62', seaHorizon: '#4c5670', skyCurve: 0.24, sunDir: sunDirFrom(4.0, 118),
    sunColor: '#ffad60', sunGlow: 0.62, sunDisk: 60.0, cloudCover: 0.4, cloudOpacity: 0.75,
    cloudColor: '#c98a8c', cloudShade: '#34395a', stars: 0, studio: 0,
    light: 2.8, lightColor: '#ffbb78', hemi: 0.42, hemiSky: '#5a7ed2', hemiGround: '#3a2d2a',
    fill: 0.35, rim: 1.1, interior: 1.0, softbox: 0.0, exposure: 0.92, envGain: 1.1, envInt: 1.2, bloom: 0.3,
    waterDeep: '#0c1828', waterScatter: '#2a3850', sunSpec: 3.2, waveAmp: 0.85, night: 0,
    sunVeil: 0.2, envSun: 32, shadowRadius: 1.3, ao: 0.85, foam: 0.35, rimColor: '#8aaeff', whitecap: 0, lanes: 1,
  },
  night: {
    zenith: '#02040b', horizon: '#14233f', seaHorizon: '#09121f', skyCurve: 0.45, sunDir: sunDirFrom(32, -40),
    sunColor: '#b3c8ff', sunGlow: 0.12, sunDisk: 4.0, cloudCover: 0.32, cloudOpacity: 0.55,
    cloudColor: '#1c263b', cloudShade: '#060910', stars: 1, studio: 0,
    light: 0.38, lightColor: '#9db3e2', hemi: 0.1, hemiSky: '#2a3a5c', hemiGround: '#05070b',
    fill: 0, rim: 0.25, interior: 7.0, softbox: 0.14, exposure: 1.6, envGain: 1.0, envInt: 1.0, bloom: 0.45,
    waterDeep: '#02050a', waterScatter: '#06121f', sunSpec: 0.9, waveAmp: 0.7, night: 1,
    sunVeil: 0.3, envSun: 2.5, shadowRadius: 1.8, ao: 0.55, foam: 0.25, rimColor: '#9db3e2', whitecap: 0, lanes: 0.6,
  },
  studio: {
    zenith: '#1b1d21', horizon: '#53575d', seaHorizon: '#4b4e54', skyCurve: 0.6, sunDir: sunDirFrom(52, -55),
    sunColor: '#ffffff', sunGlow: 0.0, sunDisk: 0.0, cloudCover: 0.0, cloudOpacity: 0.0,
    cloudColor: '#808080', cloudShade: '#404040', stars: 0, studio: 1,
    light: 2.1, lightColor: '#ffffff', hemi: 0.25, hemiSky: '#d8dce2', hemiGround: '#202124',
    fill: 0.7, rim: 1.8, interior: 0.12, softbox: 1.0, exposure: 1.05, envGain: 1.0, envInt: 1.15, bloom: 0.2,
    // studio + « En mer » : bassin d'eau noire quasi immobile (miroir sombre façon salon nautique), voulu
    waterDeep: '#050608', waterScatter: '#0b0d10', sunSpec: 0.2, waveAmp: 0.22, night: 0,
    sunVeil: 0, envSun: 0, shadowRadius: 2.6, ao: 0.85, foam: 0.6, rimColor: '#ffffff', whitecap: 0, lanes: 0,
  },
};

const COLOR_KEYS = ['zenith', 'horizon', 'seaHorizon', 'sunColor', 'cloudColor', 'cloudShade',
  'lightColor', 'hemiSky', 'hemiGround', 'waterDeep', 'waterScatter', 'rimColor'];
const NUM_KEYS = ['skyCurve', 'sunGlow', 'sunDisk', 'cloudCover', 'cloudOpacity', 'stars', 'studio', 'light', 'hemi',
  'fill', 'rim', 'interior', 'softbox', 'exposure', 'sunSpec', 'waveAmp', 'night', 'envGain', 'envInt', 'bloom',
  'sunVeil', 'envSun', 'shadowRadius', 'ao', 'foam', 'whitecap', 'lanes'];

function makeAmbState(def) {
  const s = { sunDir: def.sunDir.clone() };
  for (const k of COLOR_KEYS) s[k] = new THREE.Color(def[k]);
  for (const k of NUM_KEYS) s[k] = def[k];
  return s;
}
function copyAmbState(dst, src) {
  dst.sunDir.copy(src.sunDir);
  for (const k of COLOR_KEYS) dst[k].copy(src[k]);
  for (const k of NUM_KEYS) dst[k] = src[k];
}
function lerpAmbState(dst, a, b, t) {
  dst.sunDir.copy(a.sunDir).lerp(b.sunDir, t).normalize();
  for (const k of COLOR_KEYS) dst[k].lerpColors(a[k], b[k], t);
  for (const k of NUM_KEYS) dst[k] = a[k] + (b[k] - a[k]) * t;
}

// ---------------------------------------------------------------------------
// GLSL partagé : ciel (gradient + soleil + nuages fbm + étoiles)
// ---------------------------------------------------------------------------
const SKY_UNIFORMS_GLSL = /* glsl */`
uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uSeaHorizon;
uniform vec3 uSunDir; uniform vec3 uSunColor; uniform vec3 uCloudColor; uniform vec3 uCloudShade;
uniform float uSunGlow; uniform float uSunDisk; uniform float uCloudCover; uniform float uCloudOpacity;
uniform float uStars; uniform float uStudio; uniform float uTime; uniform float uSkyCurve;
uniform float uSunVeil; uniform float uEnvSun;
`;
const SKY_FUNCS_GLSL = /* glsl */`
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float hash13(vec3 p3){ p3 = fract(p3 * .1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3. - 2. * f);
  return mix(mix(hash12(i), hash12(i + vec2(1., 0.)), u.x), mix(hash12(i + vec2(0., 1.)), hash12(i + vec2(1., 1.)), u.x), u.y);
}
const mat2 FBM_M = mat2(1.6, 1.2, -1.2, 1.6);
float fbm5(vec2 p){ float a = .5, s = 0.; for (int i = 0; i < 5; i++){ s += a * vnoise(p); p = FBM_M * p; a *= .5; } return s; }
float fbm3(vec2 p){ float a = .5, s = 0.; for (int i = 0; i < 3; i++){ s += a * vnoise(p); p = FBM_M * p; a *= .5; } return s * 1.14; }

// densité nuageuse (0..1) + coefficient d'ombrage, octaves complètes ou réduites
vec2 clouds(vec3 dir, bool hq){
  float y = max(dir.y, 0.0);
  vec2 uv = dir.xz / (y + 0.06) * 0.8;
  uv += vec2(uTime * 0.006, uTime * 0.0025);
  float n = hq ? fbm5(uv * 1.3) : fbm3(uv * 1.3);
  float n2 = hq ? fbm5(uv * 2.9 + n * 1.7 + 5.3) : fbm3(uv * 2.9 + n * 1.7 + 5.3);
  float v = n * 0.62 + n2 * 0.48;
  float th = 1.0 - uCloudCover;
  float c = smoothstep(th - 0.02, th + 0.32, v);
  float dens = clamp((v - th) * 2.6 + (n2 - 0.5) * 0.6, 0.0, 1.0);
  float fade = smoothstep(0.0, 0.10, dir.y);
  return vec2(c * uCloudOpacity * fade, dens);
}

vec3 skyColor(vec3 dir, bool hq){
  float y = dir.y;
  float h = max(y, 0.0);
  vec3 col = mix(uHorizon, uZenith, pow(h, uSkyCurve));
  // bande lumineuse juste au-dessus de l'horizon (brume)
  col = mix(col, uHorizon * 1.06, exp(-h * 18.0) * 0.5);
  // nuit : l'horizon se fond dans la brume marine (pas de liseré dur ciel/mer)
  col = mix(col, uSeaHorizon * 1.15, uStars * (exp(-h * 22.0) * 0.6 + (1.0 - smoothstep(0.0, 0.02, h)) * 0.4));
  // studio : vignette verticale douce
  col *= 1.0 - uStudio * 0.25 * smoothstep(0.1, 0.9, h);
  // studio : le bas du fond remonte depuis la teinte du sol/bassin comme une gorge de cyclo (aucune ligne d'horizon)
  col = mix(col, uSeaHorizon, uStudio * (1.0 - smoothstep(0.0, 0.35, h)));
  if (y < 0.0) col = mix(uSeaHorizon, uSeaHorizon * 0.75, smoothstep(0.0, -0.4, y) * (1.0 - uStudio));
  float sd = max(dot(dir, uSunDir), 0.0);
  vec3 glow = uSunColor * uSunGlow * (pow(sd, 10.0) * 0.22 + pow(sd, 90.0) * 0.6 + pow(sd, 900.0) * 1.5);
  glow *= smoothstep(-0.05, 0.02, y);
  col += glow;
  if (y > 0.0 && uCloudOpacity > 0.001){
    vec2 cl = clouds(dir, hq);
    vec3 cc = mix(uCloudColor, uCloudShade, smoothstep(0.0, 1.0, cl.y));
    // liseré lumineux côté soleil
    cc += uSunColor * uSunGlow * pow(sd, 5.0) * (1.0 - cl.y) * 0.8;
    // diffusion avant : nuage fin éclairé par transparence autour du soleil (soleil voilé)
    cc += uSunColor * uSunGlow * (pow(sd, 60.0) * 1.6 + pow(sd, 600.0) * 3.0) * uSunVeil * (1.0 - 0.6 * cl.y);
    // nuages qui se fondent dans la brume d'horizon
    cc = mix(cc, mix(uHorizon, uSeaHorizon * 1.15, uStars), exp(-h * 9.0) * 0.7);
    col = mix(col, cc, cl.x);
  }
  // nuit : fondu ciel/mer sur ~±1° (même teinte que la brume de mer côté océan)
  if (y >= 0.0) col = mix(col, uSeaHorizon * 1.15, uStars * (1.0 - smoothstep(0.0, 0.035, h)));
  return col;
}

float sunDiskMask(vec3 dir){
  float sd = dot(dir, uSunDir);
  return smoothstep(0.99990, 0.99994, sd);
}
`;

function makeSkyUniforms() {
  return {
    uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() },
    uSeaHorizon: { value: new THREE.Color() }, uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uSunColor: { value: new THREE.Color() }, uCloudColor: { value: new THREE.Color() },
    uCloudShade: { value: new THREE.Color() }, uSunGlow: { value: 0 }, uSunDisk: { value: 0 },
    uCloudCover: { value: 0 }, uCloudOpacity: { value: 0 }, uStars: { value: 0 }, uStudio: { value: 0 },
    uTime: { value: 0 }, uSkyCurve: { value: 0.5 },
    uSunVeil: { value: 0 }, uEnvSun: { value: 0 },
  };
}

function makeSkyMaterial(uniforms, isEnv) {
  return new THREE.ShaderMaterial({
    uniforms: isEnv ? { ...uniforms, uEnvGain: { value: 1 }, uEnvSea: { value: new THREE.Color() } } : uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
    defines: isEnv ? { IS_ENV: 1 } : {},
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main(){
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */`
      ${SKY_UNIFORMS_GLSL}
      varying vec3 vDir;
      #ifdef IS_ENV
      uniform float uEnvGain; uniform vec3 uEnvSea;
      #endif
      ${SKY_FUNCS_GLSL}
      void main(){
        vec3 dir = normalize(vDir);
        vec3 col = skyColor(dir, true);
        float cloudOcc = 0.0;
        if (dir.y > 0.0 && uCloudOpacity > 0.001) cloudOcc = clouds(dir, true).x;
        col += uSunColor * uSunDisk * sunDiskMask(dir) * (1.0 - cloudOcc * (1.0 - uSunVeil * 0.8));
        #ifndef IS_ENV
        if (uStars > 0.001 && dir.y > 0.0){
          vec3 p = dir * 260.0;
          vec3 cell = floor(p);
          float hs = hash13(cell);
          if (hs > 0.9965){
            vec3 o = vec3(hash13(cell + 1.7), hash13(cell + 3.1), hash13(cell + 5.9)) * 0.6 + 0.2;
            float d = length(fract(p) - o);
            float tw = 0.65 + 0.35 * sin(uTime * (1.5 + hs * 40.0) + hs * 100.0);
            float s = smoothstep(0.16, 0.0, d) * tw * smoothstep(0.02, 0.25, dir.y) * (1.0 - cloudOcc);
            col += vec3(0.85, 0.9, 1.0) * s * uStars * (hs > 0.9993 ? 2.2 : 0.9);
          }
          // voie lactée très discrète
          float mw = exp(-pow(dot(dir, normalize(vec3(0.3, 0.55, 0.78))) * 4.0, 2.0));
          col += vec3(0.05, 0.06, 0.09) * mw * fbm3(dir.xz / (dir.y + 0.2) * 3.0) * uStars * (1.0 - cloudOcc);
        }
        #endif
        #ifdef IS_ENV
        // env map : ciel plus lumineux au-dessus de l'horizon, mer sombre dessous -> horizon marqué sur les métaux
        col *= dir.y > 0.0 ? uEnvGain : 0.85;
        if (uStudio < 0.5){
          // mer : s'assombrit vers le nadir (eau profonde vue d'en haut) -> ligne d'horizon nette sur coque / inox
          // hémisphère bas = vraie mer : reflet de brume près de l'horizon -> eau profonde teintée vers le nadir,
          // modulée par des bandes de houle (évite le gris uniforme sur une coque miroir)
          if (dir.y < 0.0){
            float below = smoothstep(0.0, -0.25, dir.y);
            vec2 suv = dir.xz / max(-dir.y, 0.03) * 0.9;
            float sw = fbm3(vec2(suv.x * 0.55 + suv.y * 0.35, suv.y * 1.6 - suv.x * 0.2));
            // marche nette ciel/mer : la mer à l'horizon est nettement plus sombre que le ciel juste au-dessus
            // marche ciel/mer ~5x en luminance : la ligne d'horizon se lit franchement dans les vernis sombres
            // mer = corps sombre + ciel réfléchi pondéré par le Fresnel de l'eau selon l'angle de plongée :
            // ~0.6x le ciel juste sous l'horizon (marche nette), ~0.2x à -12° (ce que voit un bordé vertical
            // depuis la vue héro), quasi noir à la verticale. C'est ce dégradé que la coque laque doit refléter.
            float sd = clamp(-dir.y, 0.0, 1.0);
            // bande d'horizon nette (≈0.6x ciel sur 0..-2°) puis chute rapide : < 0.1x dès -5°, mer sombre dessous
            float frW = exp(-sd * 26.0);
            vec3 skyH = uHorizon * uEnvGain;
            // reflets de ciel sur les faces de vagues : stries horizontales étirées -> la coque miroir
            // montre une eau vivante (clair/sombre ondulé) au lieu d'un aplat
            float st = fbm3(vec2(suv.x * 0.22 + sw * 0.6, suv.y * 2.6));
            float streak = mix(0.55, 1.6, smoothstep(0.42, 0.72, st));
            vec3 seaBody = mix(uEnvSea, uSeaHorizon * 0.5, 0.3);
            col = seaBody * (0.8 + 0.4 * sw) + skyH * 0.6 * frW * streak;
          }
          // liseré de brume lumineuse pile sur l'horizon
          col += uHorizon * 0.22 * exp(-abs(dir.y) * 90.0) * uEnvGain * step(0.0, dir.y);
          // bande claire de ciel/nuages éclairés au-dessus de l'horizon (le reflet « signature » des vernis)
          col += uHorizon * 0.35 * smoothstep(0.0, 0.012, dir.y) * exp(-max(dir.y, 0.0) * 9.0) * uEnvGain;
          // chemin de soleil sur l'eau (réflexion du soleil vue dans l'env)
          vec3 md = vec3(dir.x, -dir.y, dir.z);
          float sdm = max(dot(md, uSunDir), 0.0);
          col += uSunColor * (pow(sdm, 220.0) * 2.2 + pow(sdm, 24.0) * 0.12) * uEnvSun * 0.05 * step(dir.y, 0.0) * smoothstep(-0.05, 0.05, uSunDir.y);
        }
        // soleil HDR élargi (survit au filtrage PMREM) : point chaud net pour la peinture, l'inox, le verre
        float sdE = dot(dir, uSunDir);
        float hot = smoothstep(0.99972, 0.99986, sdE) * 1.0 + pow(max(sdE, 0.0), 2500.0) * 0.2;
        col += uSunColor * uEnvSun * hot * (1.0 - cloudOcc * (1.0 - uSunVeil * 0.85)) * smoothstep(-0.03, 0.02, uSunDir.y);
        #endif
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

// ---------------------------------------------------------------------------
// Océan : grille polaire dense près de la caméra, Gerstner + somme de sinus
// ---------------------------------------------------------------------------
function makeOceanGeometry(radius = 2600, rings = 190, segs = 256, a = 6.2) {
  const pos = [];
  const idx = [];
  const ea = Math.exp(a) - 1;
  pos.push(0, 0, 0);
  for (let j = 1; j <= rings; j++) {
    const r = radius * (Math.exp(a * j / rings) - 1) / ea;
    for (let i = 0; i < segs; i++) {
      const t = (i / segs) * Math.PI * 2;
      pos.push(Math.cos(t) * r, 0, Math.sin(t) * r);
    }
  }
  // centre -> premier anneau
  for (let i = 0; i < segs; i++) idx.push(0, 1 + ((i + 1) % segs), 1 + i);
  for (let j = 1; j < rings; j++) {
    const b0 = 1 + (j - 1) * segs, b1 = 1 + j * segs;
    for (let i = 0; i < segs; i++) {
      const i1 = (i + 1) % segs;
      idx.push(b0 + i, b0 + i1, b1 + i);
      idx.push(b0 + i1, b1 + i1, b1 + i);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), radius);
  return g;
}

const N_WAVES = 20;
const N_GERSTNER = 5;
function makeWaves() {
  // spectre déterministe : longueurs d'onde décroissantes autour d'un vent dominant
  // (20 composantes : plus de directions -> moins de figures d'interférence « marbrées » à mi-distance)
  const out = [];
  const wind = 0.55;
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < N_WAVES; i++) {
    const wl = i < N_GERSTNER ? 34 * Math.pow(0.73, i) : 34 * Math.pow(0.73, N_GERSTNER) * Math.pow(0.82, i - N_GERSTNER);
    // houle : ±0.55 rad autour du vent ; vagues courtes : angle d'or (répartition sans alignement)
    // -> plus de treillis diagonal visible dans le chemin de soleil
    const r0 = rnd();
    const ang = i < N_GERSTNER ? wind + (r0 - 0.5) * 1.1
      : wind + (((i * 0.6180339887 + r0 * 0.15) % 1) - 0.5) * 2 * 1.45;
    const k = (2 * Math.PI) / wl;
    const amp = i < N_GERSTNER ? wl * 0.0062 : wl * 0.0066;
    out.push(new THREE.Vector4(Math.cos(ang), Math.sin(ang), k, amp));
  }
  return out;
}

// Texture de normales d'eau tuilable (somme de ~48 ondes à vecteurs d'onde entiers -> périodique),
// pente stockée en RG ; échantillonnée à 3 échelles défilantes, mipmappée (moyenne au loin au lieu de s'éteindre).
const WATER_TILE = 10; // m
function makeWaterNormalTex(size = 256) {
  const N = 48, wind = 0.55;
  let seed = 11;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const waves = [];
  for (let i = 0; i < N; i++) {
    const kmag = 4 + Math.pow(rnd(), 1.6) * 34;                 // cycles / tuile : λ ≈ 0.26 .. 2.5 m
    const ang = wind + (rnd() - 0.5) * 2 * (rnd() < 0.8 ? 1.1 : 3.1);
    const n = Math.round(Math.cos(ang) * kmag), m = Math.round(Math.sin(ang) * kmag);
    if (!n && !m) continue;
    const kx = (2 * Math.PI * n) / WATER_TILE, kz = (2 * Math.PI * m) / WATER_TILE;
    const wl = WATER_TILE / Math.hypot(n, m);
    waves.push([kx, kz, wl * 0.0105 * (0.6 + 0.8 * rnd()), rnd() * Math.PI * 2]);
  }
  const data = new Uint8Array(size * size * 4);
  const cell = WATER_TILE / size;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = x * cell, pz = y * cell;
      let gx = 0, gz = 0;
      for (const [kx, kz, a, ph] of waves) {
        const c = a * Math.cos(kx * px + kz * pz + ph);
        gx += c * kx; gz += c * kz;
      }
      const o = (y * size + x) * 4;
      data[o] = Math.max(0, Math.min(255, Math.round((gx * 0.5 + 0.5) * 255)));
      data[o + 1] = Math.max(0, Math.min(255, Math.round((gz * 0.5 + 0.5) * 255)));
      data[o + 2] = 255; data[o + 3] = 255;
    }
  }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

function makeOceanMaterial(skyUniforms) {
  const uniforms = {
    ...skyUniforms,
    uWaves: { value: makeWaves() },
    uWaveAmp: { value: 1 },
    uWaterDeep: { value: new THREE.Color() },
    uWaterScatter: { value: new THREE.Color() },
    uSunSpec: { value: 1 },
    uOpacity: { value: 1 },
    uBoat: { value: new THREE.Vector3(0, 0, 0) },   // x, z, influence
    uEll: { value: new THREE.Vector3(15.6, 4.3, 0) },  // ellipse d'eau calme : demi-axes x, z ; décalage |z| des coques
    uEnds: { value: new THREE.Vector4(8, 13, -10, -13.8) },
    uSpillA: { value: new THREE.Vector4(-5, 4.8, 4.3, 1.4) },
    uSpillB: { value: new THREE.Vector4(-16.2, 1.6, 2.6, 0) },
    uGlowPos: { value: Array.from({ length: 8 }, () => new THREE.Vector3()) },
    uGlowCount: { value: 0 },
    uGlowColor: { value: new THREE.Color('#38c8ff') },
    uGlow: { value: 0 },
    uFogDensity: { value: 0.0013 },
    uReflTex: { value: null }, uReflMat: { value: new THREE.Matrix4() }, uReflOn: { value: 0 },
    uMaskTex: { value: null }, uMaskMat: { value: new THREE.Matrix4() }, uMaskOn: { value: 0 },
    uFoam: { value: 1 },
    uNrm: { value: makeWaterNormalTex() },
    uLanes: { value: 1 }, uWhitecap: { value: 0 }, uSpill: { value: 0 }, uSpillColor: { value: new THREE.Color('#ffb066') },
  };
  return new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: true,
    fog: false,
    extensions: { derivatives: true },
    vertexShader: /* glsl */`
      uniform vec4 uWaves[${N_WAVES}];
      uniform float uWaveAmp; uniform float uTime; uniform vec3 uBoat; uniform vec3 uEll;
      varying vec3 vWorld; varying float vH;
      float boatEll(vec2 p){ vec2 d = p - uBoat.xy; return length(vec2(d.x / uEll.x, (uEll.z > 0.0 ? abs(d.y) - uEll.z : d.y) / uEll.y)); }
      void main(){
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vec2 p = wp.xz;
        float camD = length(p - cameraPosition.xz);
        float fade = 1.0 - smoothstep(120.0, 700.0, camD);
        // amortissement léger près de la coque (évite que la houle traverse la carène) sans « flaque miroir »
        float damp = mix(1.0, mix(0.6, 1.0, smoothstep(0.9, 1.6, boatEll(p))), uBoat.z);
        vec3 disp = vec3(0.0);
        for (int i = 0; i < ${N_GERSTNER}; i++){
          vec4 w = uWaves[i];
          float om = sqrt(9.81 * w.z);
          float th = w.z * dot(w.xy, p) - om * uTime + float(i) * 1.7;
          float Q = 0.55 / (w.z * w.w * ${N_GERSTNER}.0 + 1e-4);
          Q = min(Q, 1.0);
          disp.xz += Q * w.w * w.xy * cos(th);
          disp.y += w.w * sin(th);
        }
        disp *= uWaveAmp * fade * damp;
        wp.xyz += disp;
        vH = disp.y;
        vWorld = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */`
      ${SKY_UNIFORMS_GLSL}
      uniform vec4 uWaves[${N_WAVES}];
      uniform float uWaveAmp; uniform vec3 uWaterDeep; uniform vec3 uWaterScatter; uniform float uSunSpec;
      uniform float uOpacity; uniform vec3 uBoat; uniform vec3 uEll; uniform vec4 uEnds; uniform vec4 uSpillA; uniform vec4 uSpillB;
      uniform vec3 uGlowPos[8]; uniform int uGlowCount; uniform vec3 uGlowColor; uniform float uGlow;
      uniform float uFogDensity;
      uniform sampler2D uReflTex; uniform mat4 uReflMat; uniform float uReflOn;
      uniform sampler2D uMaskTex; uniform mat4 uMaskMat; uniform float uMaskOn; uniform float uFoam;
      uniform sampler2D uNrm;
      uniform float uLanes; uniform float uWhitecap; uniform float uSpill; uniform vec3 uSpillColor;
      varying vec3 vWorld; varying float vH;
      float maskAt(vec2 uv){ return texture2D(uMaskTex, uv).r; }
      ${SKY_FUNCS_GLSL}
      float boatEll(vec2 p){ vec2 d = p - uBoat.xy; return length(vec2(d.x / uEll.x, (uEll.z > 0.0 ? abs(d.y) - uEll.z : d.y) / uEll.y)); }
      void main(){
        vec2 p = vWorld.xz;
        vec3 toCam = cameraPosition - vWorld;
        float dist = length(toCam);
        vec3 V = toCam / dist;
        float fw = max(length(dFdx(p)), length(dFdy(p))) + 1e-4;
        float ell = boatEll(p);
        vec2 grad = vec2(0.0);
        float slick = 0.0;
        float lost = 0.0; // pente « perdue » par anti-aliasing -> élargit la rugosité au lieu d'aplatir l'eau
        for (int i = 0; i < ${N_WAVES}; i++){
          vec4 w = uWaves[i];
          float wl = 6.2831853 / w.z;
          float att = clamp(wl / (fw * 5.0) - 1.0, 0.0, 1.0);
          float boost = (i >= ${N_GERSTNER}) ? 1.0 : 0.3;
          lost += (1.0 - att) * w.w * w.z * boost;
          if (att <= 0.0) continue;
          float om = sqrt(9.81 * w.z);
          float th = w.z * dot(w.xy, p) - om * uTime + float(i) * 1.7;
          grad += w.w * w.z * w.xy * cos(th) * att * boost;
        }
        // micro-détail : texture de normales tuilable, 3 échelles tournées / défilantes (mipmaps = moyenne au loin)
        {
          const mat2 R1 = mat2(0.809, 0.588, -0.588, 0.809);   // 36°
          const mat2 R2 = mat2(0.276, -0.961, 0.961, 0.276);   // -74°
          float t = uTime;
          vec2 a = texture2D(uNrm, p / 9.0 + vec2(t * 0.020, t * 0.012)).rg * 2.0 - 1.0;
          vec2 b = texture2D(uNrm, (R1 * p) / 3.6 + vec2(-t * 0.041, t * 0.017)).rg * 2.0 - 1.0;
          vec2 c = texture2D(uNrm, (R2 * p) / 23.0 + vec2(t * 0.007, -t * 0.010)).rg * 2.0 - 1.0;
          // retour au repère monde (transposée de la rotation) et mise à l'échelle de la pente
          vec2 g3 = a * (${WATER_TILE}.0 / 9.0) * 0.55 + (transpose(R1) * b) * (${WATER_TILE}.0 / 3.6) * 0.16
                  + (transpose(R2) * c) * (${WATER_TILE}.0 / 23.0) * 0.8;
          // bandes de vent (« wind lanes ») : longues traînées où les rides capillaires sont couchées (eau lisse,
          // reflet plus net) alternant avec des zones ridées — étirées dans le lit du vent, dérive très lente
          vec2 wq = vec2(dot(p, vec2(0.8, 0.6)), dot(p, vec2(-0.6, 0.8)));
          float ln = fbm3(vec2(wq.x * 0.0035 + t * 0.0012, wq.y * 0.028) + 7.3);
          slick = smoothstep(0.50, 0.66, ln) * uLanes;
          grad += g3 * 0.32 * mix(1.0, 0.3, slick);
        }
        grad *= uWaveAmp * 0.5;
        vec3 N = normalize(vec3(-grad.x, 1.0, -grad.y));
        float NdV = max(dot(N, V), 0.0);
        float fres = 0.02 + 0.98 * pow(1.0 - NdV, 5.0);
        vec3 R = reflect(-V, N);
        R.y = abs(R.y) + 0.002;
        R = normalize(R);
        vec3 refl = skyColor(R, false);
        // rugosité apparente au loin : reflet moyenné
        vec3 avgSky = mix(uHorizon, uZenith, 0.25);
        avgSky = mix(avgSky, mix(uCloudColor, uCloudShade, 0.45), uCloudOpacity * uCloudCover * 0.8);
        // (les contours nets des nuages, déformés par la houle, donnaient un aspect « marbré » : on adoucit)
        refl = mix(refl, avgSky, clamp(0.42 + smoothstep(25.0, 600.0, dist) * 0.38 + lost * 1.5 - slick * 0.45, 0.0, 0.92));
        // les nappes lisses renvoient un ciel plus clair/net au loin (rugosité moindre) -> bandes lisibles
        refl *= mix(1.0, mix(0.93, 1.16, slick), smoothstep(20.0, 140.0, dist) * uLanes);
        // réflexion planaire (bateau) distordue par les normales
        if (uReflOn > 0.5){
          vec4 rc = uReflMat * vec4(vWorld.x, 0.0, vWorld.z, 1.0);
          // distorsion par les normales + flou étiré verticalement (reflet « brossé » par les rides, bords non crénelés)
          vec2 ruv = rc.xy / rc.w + vec2(N.x * 0.6, N.z) * clamp(3.2 / dist, 0.012, 0.055);
          // flou vertical ~4x plus long (traînée typique des reflets sur clapot), 6 prises
          float bl = clamp(0.45 / dist, 0.004, 0.02);
          vec4 rt = texture2D(uReflTex, ruv + vec2(0.0, -2.5 * bl)) * 0.10
                  + texture2D(uReflTex, ruv + vec2(bl * 0.15, -1.5 * bl)) * 0.17
                  + texture2D(uReflTex, ruv + vec2(-bl * 0.15, -0.5 * bl)) * 0.23
                  + texture2D(uReflTex, ruv + vec2(bl * 0.15, 0.5 * bl)) * 0.23
                  + texture2D(uReflTex, ruv + vec2(-bl * 0.15, 1.5 * bl)) * 0.17
                  + texture2D(uReflTex, ruv + vec2(0.0, 2.5 * bl)) * 0.10;
          refl = mix(refl, rt.rgb / max(rt.a, 1e-3), rt.a * 0.85);
        }
        // corps de l'eau
        float sunUp = clamp(uSunDir.y * 3.0, 0.0, 1.0);
        vec3 body = uWaterDeep * (0.75 + 0.25 * sunUp);
        body += uWaterScatter * clamp(vH * 1.6 + 0.35, 0.0, 1.0) * (0.4 + 0.6 * (1.0 - NdV)) * 0.6;
        // facettes : les pentes tournées vers le soleil / le ciel sont plus claires (texture lisible vue de dessus)
        vec2 sxz = normalize(uSunDir.xz + vec2(1e-4));
        body *= clamp(1.0 + dot(vec2(N.x, N.z), sxz) * 2.2 * (0.4 + 0.6 * sunUp) + (1.0 - N.y) * 1.5, 0.6, 1.6);
        vec3 col = mix(body, refl, fres);
        // soleil : reflet net + scintillement large
        float RdL = max(dot(R, uSunDir), 0.0);
        float spec = pow(RdL, 900.0) * 6.0 + pow(RdL, 90.0) * 0.6 + pow(RdL, 14.0) * 0.06;
        col += uSunColor * spec * uSunSpec * smoothstep(-0.02, 0.05, uSunDir.y + 0.04);
        // paillettes : facettes de rides qui renvoient le soleil (scintillement), atténuées au loin
        {
          vec2 gp = p * 4.0;
          vec2 gc = floor(gp);
          // facette fixe par cellule, allumage continu (sinus à phase/fréquence aléatoires) : pas de saut à 5 Hz
          float hs = hash12(gc);
          float h2 = hash12(gc + 41.7);
          vec2 gpos = vec2(hash12(gc + 3.1), hash12(gc + 9.4)) * 0.7 + 0.15;
          float gd = length(fract(gp) - gpos);
          float tw = sin(uTime * (2.0 + 4.0 * h2) + h2 * 40.0);
          tw = tw * tw * tw * tw;
          // point brillant de taille ~ 1 pixel (dépend de l'empreinte écran fw), jamais un carré
          float pr = max(fw * 4.0 * 0.6, 0.02);
          float near2 = clamp(0.06 / fw - 1.0, 0.0, 1.0);
          float glint = step(0.95, hs) * tw * smoothstep(pr, 0.0, gd) * pow(RdL, 60.0) * near2;
          col += uSunColor * glint * uSunSpec * 2.0 * smoothstep(0.0, 0.05, uSunDir.y + 0.02);
        }
        // interaction coque / eau : ombre de contact + ourlet d'écume le long de la flottaison
        if (uMaskOn > 0.5){
          vec4 mc = uMaskMat * vec4(p.x, 0.0, p.y, 1.0);
          vec2 muv = mc.xy;
          if (muv.x > 0.0 && muv.x < 1.0 && muv.y > 0.0 && muv.y < 1.0){
            vec2 px = vec2(1.0 / 20.0, 1.0 / 40.0); // 1 m en uv (fenêtre 20 m en z x 40 m en x)
            float m0 = maskAt(muv);
            float ms = 0.0, ml = 0.0;
            for (int k = 0; k < 8; k++){
              float a = float(k) * 0.785398 + 0.39;
              vec2 d = vec2(cos(a), sin(a));
              ms += maskAt(muv + d * px * 0.45);
              ml += maskAt(muv + d * px * 1.7);
            }
            ms /= 8.0; ml /= 8.0;
            float near = max(ms, m0);
            col *= 1.0 - 0.3 * smoothstep(0.0, 0.7, max(ml * 0.7, near));
            // bateau au mouillage : simple liseré de clapot, fin, cassé, surtout transparent, collé à la coque
            // (+ un peu plus à l'étrave et au tableau, aucune « dentelle » au large)
            float dx = p.x - uBoat.x;
            float endsK = max(smoothstep(uEnds.x, uEnds.y, dx), smoothstep(uEnds.z, uEnds.w, dx));
            float fA = fbm3((p + vec2(uTime * 0.12, -uTime * 0.09)) * 4.2);
            float fB = vnoise(p * 11.0 - vec2(uTime * 0.6, uTime * 0.4));
            float lap = smoothstep(0.30, 0.62, ms) * (1.0 - smoothstep(0.9, 1.0, m0) * 0.7); // ~0.2 m de large
            float crest = clamp(vH * 3.0 + 0.4, 0.0, 1.0);                                   // ourlet plus vif sur les crêtes
            float foam = smoothstep(0.55, 0.85, fA * 0.8 + fB * 0.35 + crest * 0.2) * lap;
            foam += smoothstep(0.6, 0.85, fA + 0.2 * fB) * smoothstep(0.08, 0.4, ms) * endsK * 0.6;
            foam = clamp(foam, 0.0, 1.0) * uFoam;
            vec3 foamCol = (avgSky * 1.15 + uSunColor * max(uSunDir.y, 0.0) * 0.35) * (1.0 - 0.6 * uStars);
            col = mix(col, foamCol, foam * 0.7);
          }
        } else {
          float ao = mix(1.0, mix(0.5, 1.0, smoothstep(0.85, 1.5, ell)), uBoat.z);
          col *= ao;
        }
        // projecteurs sous-marins
        if (uGlow > 0.001){
          float g = 0.0;
          for (int i = 0; i < 8; i++){
            if (i >= uGlowCount) break;
            vec2 d = p - uGlowPos[i].xz;
            float r2 = dot(d, d);
            // tache sous la surface : noyau compact + diffusion en profondeur (la lumière remonte de ~1 m d'eau)
            g += exp(-r2 / 0.12) * 1.3 + exp(-r2 / 0.7) * 0.32 + exp(-r2 / 5.0) * 0.07;
          }
          if (uGlowCount == 0){
            vec2 d = p - (uBoat.xy + vec2(-14.6, 0.0));
            g += exp(-dot(d, d) / 2.0) * 0.6;
          }
          // couleur : noyau quasi blanc-turquoise, halo plus profond/désaturé (absorption du rouge avec la distance)
          float gs = clamp(g, 0.0, 2.0);
          vec3 gc = mix(uGlowColor * vec3(0.55, 0.8, 0.85), vec3(0.75, 0.95, 1.0), smoothstep(0.6, 1.6, gs));
          // Fresnel : la lumière sous-marine ne se voit qu'en regardant dans l'eau (vue plongeante), pas en rasant
          float fK = pow(1.0 - fres, 2.0) * smoothstep(0.02, 0.35, V.y);
          col += gc * gs * uGlow * fK;
        }
        // moutons épars : crêtes des vagues dominantes qui déferlent (seuil bruité, mousse effilochée)
        if (uWhitecap > 0.001){
          float nearW = 1.0 - smoothstep(0.08, 0.5, fw);                       // disparaît avant d'aliasser
          // rares (quelques % de la surface), petits (1-3 m), allongés en travers du vent, cœur dense + voile effiloché
          vec2 wq2 = vec2(dot(p, vec2(0.8, 0.6)), dot(p, vec2(-0.6, 0.8)));
          float n1 = vnoise(wq2 * vec2(1.3, 0.6) + vec2(uTime * 0.08, 0.0)) * 0.6 + vnoise(wq2 * vec2(3.1, 1.4) - uTime * 0.05) * 0.4;
          float crestW = smoothstep(0.0, 0.3, vH);
          float cap = smoothstep(0.78, 0.95, n1 + crestW * 0.1);
          // mousse = filaments (bruit haute fréquence seuillé) dont la densité suit « cap » -> jamais d'aplat
          float tex = vnoise(wq2 * vec2(6.0, 14.0) + uTime * 0.35) * 0.55 + vnoise(p * 23.0 - uTime * 0.2) * 0.45;
          float wc = smoothstep(1.0 - cap * 0.75, 1.05 - cap * 0.6, tex) * cap * nearW * uWhitecap * (1.0 - slick * 0.7);
          if (uMaskOn > 0.5) wc *= smoothstep(1.05, 1.5, ell);
          vec3 wcCol = (avgSky * 1.1 + uSunColor * max(uSunDir.y, 0.0) * 0.4) * (1.0 - 0.7 * uStars);
          col = mix(col, wcCol, clamp(wc, 0.0, 1.0) * 0.6);
        }
        // nuit : lumière chaude du salon qui « tombe » dans l'eau le long des flancs (diffusée SOUS la surface :
        // visible en regardant dans l'eau, cassée par les rides, nulle en incidence rasante)
        if (uSpill > 0.001){
          vec2 lq = p - uBoat.xy;
          float az = abs(lq.y);
          // halos gaussiens (pas de bords nets) : sous les vitrages du salon, centrés vers x ≈ -5
          float along = exp(-pow((lq.x - uSpillA.x) / uSpillA.y, 2.0));
          float side = exp(-pow((az - uSpillA.z) / uSpillA.w, 2.0)) * 0.75;
          float aft = exp(-pow((lq.x - uSpillB.x) / uSpillB.y, 2.0)) * exp(-pow((uSpillB.w > 0.0 ? az - uSpillB.w : lq.y) / uSpillB.z, 2.0)) * 0.9;   // cockpit / jupe
          float sp = (side * along + aft) * (0.65 + 0.7 * vnoise(p * 1.7 + vec2(uTime * 0.3, 0.0)));
          // vue plongeante : halo atténué (sinon rectangles lumineux nets vus du dessus)
          float fK2 = pow(1.0 - fres, 2.0) * smoothstep(0.02, 0.3, V.y) * (1.0 - 0.85 * smoothstep(0.35, 0.8, V.y));
          col += uSpillColor * sp * uSpill * fK2 * 0.5;
        }
        // brume d'horizon -> fond dans le ciel
        float fogK = 1.0 - exp(-dist * uFogDensity);
        fogK = fogK * fogK * (3.0 - 2.0 * fogK);
        vec3 hz = normalize(vec3(-V.x, 0.0, -V.z));
        float sdh = max(dot(hz, normalize(vec3(uSunDir.x, 0.0, uSunDir.z))), 0.0);
        vec3 fogCol = uSeaHorizon + uSunColor * uSunGlow * pow(sdh, 24.0) * 0.25 * smoothstep(0.35, 0.0, uSunDir.y);
        col = mix(col, fogCol, clamp(fogK, 0.0, 1.0));
        // nuit : la mer se fond dans le ciel sur ±1° autour de l'horizon (pas de ligne dure)
        col = mix(col, uSeaHorizon * 1.15, uStars * (1.0 - smoothstep(0.0, 0.035, V.y)));
        gl_FragColor = vec4(col, uOpacity);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

// ---------------------------------------------------------------------------
// Utilitaires
// ---------------------------------------------------------------------------
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp01 = (x) => Math.min(1, Math.max(0, x));

function radialTexture(rgb = '0,0,0', alpha = 1, size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grd.addColorStop(0, `rgba(${rgb},${alpha})`);
  grd.addColorStop(0.35, `rgba(${rgb},${alpha * 0.75})`);
  grd.addColorStop(0.7, `rgba(${rgb},${alpha * 0.22})`);
  grd.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function forEachMaterial(mesh, fn) {
  if (Array.isArray(mesh.material)) mesh.material.forEach(fn);
  else if (mesh.material) fn(mesh.material);
}

// ---------------------------------------------------------------------------
// createStage
// ---------------------------------------------------------------------------
export function createStage(containerEl) {
  const container = containerEl || document.body;

  // --- renderer -------------------------------------------------------------
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  let pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(pixelRatio);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;
  // PCF (et non PCFSoft) : respecte shadow.radius -> pénombre réglée par ambiance, soleil net
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const canvas = renderer.domElement;
  canvas.style.display = 'block';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.touchAction = 'none';
  container.appendChild(canvas);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x888888, 400, 4000);

  // --- caméra & contrôles ---------------------------------------------------
  const BASE_FOV = 35;
  const camera = new THREE.PerspectiveCamera(BASE_FOV, 1, 0.25, 7000);
  let prof = HULL_PROFILES.d29;
  let views = prof.views;
  camera.position.fromArray(views.exterior.pos);
  const controls = new OrbitControls(camera, canvas);
  controls.target.fromArray(views.exterior.target);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.enablePan = false;
  controls.rotateSpeed = 0.7;
  controls.zoomSpeed = 0.8;
  controls.autoRotateSpeed = 0.45;
  controls.minDistance = 9;
  controls.maxDistance = 110;
  controls.maxPolarAngle = Math.PI * 0.485;
  controls.update();

  // --- ciel -----------------------------------------------------------------
  const skyUniforms = makeSkyUniforms();
  const skyMat = makeSkyMaterial(skyUniforms, false);
  const skyGeo = new THREE.SphereGeometry(3000, 64, 32);
  const skyDome = new THREE.Mesh(skyGeo, skyMat);
  skyDome.frustumCulled = false;
  skyDome.renderOrder = -1000;
  scene.add(skyDome);

  // --- scène d'environnement (PMREM) ---------------------------------------
  const envScene = new THREE.Scene();
  const envSkyMat = makeSkyMaterial(skyUniforms, true);
  const envDome = new THREE.Mesh(new THREE.SphereGeometry(100, 48, 24), envSkyMat);
  envDome.renderOrder = -1000;
  envScene.add(envDome);
  // softboxes (studio) pour de beaux reflets métalliques
  const softboxes = [];
  const addSoftbox = (w, h, pos, look, gain) => {
    const m = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, fog: false, toneMapped: false });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
    mesh.position.set(...pos);
    mesh.lookAt(...look);
    mesh.userData.gain = gain;
    envScene.add(mesh);
    softboxes.push(mesh);
  };
  addSoftbox(36, 10, [0, 22, 0], [0, 0, 0], 3.2);       // plafond
  addSoftbox(40, 6, [0, 7, -24], [0, 3, 0], 3.0);       // bande bâbord
  addSoftbox(40, 6, [0, 7, 24], [0, 3, 0], 2.0);        // bande tribord
  addSoftbox(6, 14, [30, 9, -10], [0, 3, 0], 2.2);      // avant
  addSoftbox(6, 14, [-30, 9, 10], [0, 3, 0], 3.0);      // arrière (rim)
  // longues bandes lumineuses fines : longs liserés spéculaires sur la coque et la superstructure
  addSoftbox(80, 1.1, [0, 12, -20], [0, 1.5, 0], 5.0);  // bandeau haut bâbord
  addSoftbox(80, 0.8, [0, 4.5, -26], [0, 1.0, 0], 4.0); // bandeau bas bâbord (ligne sur le bordé)
  addSoftbox(80, 1.1, [0, 12, 20], [0, 1.5, 0], 3.5);   // bandeau haut tribord
  // bandeaux SOUS l'horizon de l'env : le bordé vertical, vu d'en haut, réfléchit des directions descendantes
  // (-5° à -15°) -> c'est là que doivent être les sources pour tracer de longs liserés sur la coque
  addSoftbox(120, 3.6, [0, -7.5, -25], [0, 0, 0], 1.5); // ~-17° bâbord (bordé en léger retour)
  addSoftbox(120, 1.5, [0, -3.2, -26], [0, 0, 0], 2.8); // ~-7° bâbord : liseré net, lisible sur le bordé en vue héro
  addSoftbox(120, 3.6, [0, -7.5, 25], [0, 0, 0], 1.2);  // ~-17° tribord

  const pmrem = new THREE.PMREMGenerator(renderer);
  // PMREM 512 (au lieu de 256 imposé par fromScene en r160) : ligne d'horizon et soleil nets dans les vernis
  // (coût uniquement à la régénération : changement d'ambiance)
  if (typeof pmrem._setSize === 'function') {
    const setSize0 = pmrem._setSize.bind(pmrem);
    pmrem._setSize = () => setSize0(512);
  }
  let envRT = null;
  function regenEnv() {
    const rt = pmrem.fromScene(envScene, 0, 0.1, 500);
    scene.environment = rt.texture;
    if (envRT) envRT.dispose();
    envRT = rt;
  }

  // --- lumières -------------------------------------------------------------
  const hemi = new THREE.HemisphereLight(0xffffff, 0x333333, 0.3);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 1.5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(3072, 3072);
  const sc = sun.shadow.camera;
  sc.left = -19; sc.right = 19; sc.top = 19; sc.bottom = -19; sc.near = 1; sc.far = 160;
  // cadrage serré recalculé chaque frame (fitShadow) -> ~5 mm/texel ; biais faibles (pas de peter-panning)
  sun.shadow.bias = -0.00015;
  sun.shadow.normalBias = 0.012;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(0xdfe6ff, 0);
  fill.position.set(-20, 12, 30);
  const rim = new THREE.DirectionalLight(0xffffff, 0);
  rim.position.set(-35, 14, 18);
  scene.add(fill, rim);
  const interiorLight = new THREE.PointLight(0xffd6a8, 1, 11, 2);
  interiorLight.position.set(-4.2, 2.9, 0);
  scene.add(interiorLight);

  // --- océan ----------------------------------------------------------------
  const oceanMat = makeOceanMaterial(skyUniforms);
  const ocean = new THREE.Mesh(makeOceanGeometry(), oceanMat);
  ocean.frustumCulled = false;
  ocean.renderOrder = -10;
  scene.add(ocean);

  // --- sol studio -----------------------------------------------------------
  const studioGroup = new THREE.Group();
  studioGroup.visible = false;
  scene.add(studioGroup);
  let reflector = null;
  // plateau rond jusqu'au pied du cyclo (CYC_R), puis gorge courbe (cyclorama « infinite cove ») : plus de ligne sol/fond
  const CYC_R = 80, CYC_CURVE = 34, CYC_H = 140;
  const floorGeo = new THREE.CircleGeometry(CYC_R + 0.5, 96);
  try {
    reflector = new Reflector(floorGeo, {
      clipBias: 0.003,
      textureWidth: 1024, textureHeight: 1024,
      color: 0x8a8d92,
      multisample: 0,
    });
    reflector.rotation.x = -Math.PI / 2;
    reflector.position.y = -0.002;
    studioGroup.add(reflector);
  } catch (e) { reflector = null; }
  // sol mat (sans spéculaire) au-dessus d'un miroir : brillance « laque » douce
  // voile mat radial : 86 % au centre (reflet laqué) -> 100 % au pied du cyclo (le miroir s'éteint en douceur,
  // plus de jonction visible sol/gorge ; même teinte que la gorge)
  const floorAlpha = (() => {
    const s = 256, c = document.createElement('canvas');
    c.width = c.height = s;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grd.addColorStop(0, 'rgb(219,219,219)');
    grd.addColorStop(0.45, 'rgb(219,219,219)');
    grd.addColorStop(0.92, 'rgb(255,255,255)');
    grd.addColorStop(1, 'rgb(255,255,255)');
    g.fillStyle = grd; g.fillRect(0, 0, s, s);
    return new THREE.CanvasTexture(c);
  })();
  const floorMat = new THREE.MeshLambertMaterial({ color: 0x0c0d0f, transparent: true, opacity: 0.86, alphaMap: floorAlpha });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  studioGroup.add(floor);
  // gorge du cyclo : profil quart de cercle puis mur vertical, révolution autour de Y
  const cycPts = [];
  for (let i = 0; i <= 16; i++) {
    const a = (i / 16) * Math.PI / 2;
    cycPts.push(new THREE.Vector2(CYC_R + Math.sin(a) * CYC_CURVE, (1 - Math.cos(a)) * CYC_CURVE));
  }
  cycPts.push(new THREE.Vector2(CYC_R + CYC_CURVE, CYC_H));
  const cycMat = new THREE.MeshLambertMaterial({ color: 0x2a2c30, side: THREE.BackSide, transparent: true, opacity: 0 });
  const cyc = new THREE.Mesh(new THREE.LatheGeometry(cycPts, 96), cycMat);
  cyc.position.y = -0.003;
  studioGroup.add(cyc);
  // ber de présentation (créé à la pose du bateau, d'après la forme réelle de la carène)
  const STUDIO_LIFT = 0.42;
  const cradle = new THREE.Group();
  studioGroup.add(cradle);
  // ber : acier thermolaqué graphite satiné, têtes de vérin inox brossé, patins caoutchouc chanfreinés
  // moulés sur la carène (grille de rayons -> surface supérieure épousant exactement le bordé, 3 mm sous la coque)
  // (thermolaquage mat-satiné sans vernis : pas de scintillement spéculaire sur les petits rayons d'arête)
  const cradleMat = new THREE.MeshStandardMaterial({ color: 0x2b2e33, metalness: 0.2, roughness: 0.62 });
  const steelMat = new THREE.MeshStandardMaterial({ color: 0xa3a8ad, metalness: 1, roughness: 0.42 });
  // feutre/caoutchouc gris moyen : se détache du fond de carène noir (lisible depuis la vue héro)
  const padMat = new THREE.MeshStandardMaterial({ color: 0x55585d, metalness: 0, roughness: 0.95 });
  // béquilles vers le bouchain : visibles sous le bordé, appui sur la partie plate de la carène (prof.cradle.sideZ :
  // 2,0 m pour le DIÈDRE 29 ; catamaran : un berceau sous chaque coque, stations hors des pods)
  let cradleBuilt = false;
  // patin conforme : sommet = surface de coque (yAt) - 3 mm, chanfrein périphérique, épaisseur T
  function conformPad(cx, cz, sx, sz, T, yAt, flatBottom = false) {
    const nx = 7, nz = 7, gap = 0.003, bev = 0.014;
    const pos = [], idx = [];
    const ys = [];
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const u = i / (nx - 1) - 0.5, v = j / (nz - 1) - 0.5;
      const y = yAt(cx + u * sx, cz + v * sz);
      if (y == null) return null;
      ys.push(y - gap);
    }
    const vid = (i, j) => j * nx + i;
    // grille supérieure (bord rentré de bev = haut du chanfrein)
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const u = i / (nx - 1) - 0.5, v = j / (nz - 1) - 0.5;
      const ix = i === 0 ? bev : i === nx - 1 ? -bev : 0, iz = j === 0 ? bev : j === nz - 1 ? -bev : 0;
      pos.push(cx + u * sx + ix, ys[vid(i, j)], cz + v * sz + iz);
    }
    for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
      const a = vid(i, j), b = vid(i + 1, j), c = vid(i, j + 1), d = vid(i + 1, j + 1);
      idx.push(a, c, b, b, c, d);
    }
    // périmètre (sens trigo dans le plan x-z)
    const per = [];
    for (let i = 0; i < nx - 1; i++) per.push([i, 0]);
    for (let j = 0; j < nz - 1; j++) per.push([nx - 1, j]);
    for (let i = nx - 1; i > 0; i--) per.push([i, nz - 1]);
    for (let j = nz - 1; j > 0; j--) per.push([0, j]);
    // fond plat (tin de quille entaillé en V) ou fond parallèle à la carène (patin de béquille sur rotule)
    const yFlat = Math.min(...ys) - T;
    const ring = (dy, flat) => {
      const start = pos.length / 3;
      for (const [i, j] of per) {
        const u = i / (nx - 1) - 0.5, v = j / (nz - 1) - 0.5;
        pos.push(cx + u * sx, flat ? yFlat : ys[vid(i, j)] - dy, cz + v * sz);
      }
      return start;
    };
    const A = per.map(([i, j]) => vid(i, j));
    const m0 = ring(bev, false), b0 = ring(T, flatBottom);
    const M = per.map((_, k) => m0 + k), Bv = per.map((_, k) => b0 + k);
    const wall = (U, L) => {
      for (let k = 0; k < per.length; k++) {
        const k1 = (k + 1) % per.length;
        idx.push(U[k], U[k1], L[k], U[k1], L[k1], L[k]);
      }
    };
    wall(A, M); wall(M, Bv);
    const cb = pos.length / 3;
    pos.push(cx, flatBottom ? yFlat : ys.reduce((s, y) => s + y, 0) / ys.length - T, cz);
    for (let k = 0; k < per.length; k++) idx.push(cb, Bv[k], Bv[(k + 1) % per.length]);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return { geo: g, yMinBottom: Math.min(...ys) - T, yCenterBottom: ys[vid(3, 3)] - T };
  }
  function buildCradle() {
    while (cradle.children.length) { const c = cradle.children.pop(); c.geometry.dispose(); }
    const hull = boatApi && boatApi.parts && (boatApi.parts.hull || boatRoot);
    if (!hull || !boatRoot) return;
    // patins moulés sur la carène dans l'assiette du showroom (roulis / tangage nuls) : le berceau se construit au
    // début du fondu mer -> showroom, quand le bateau garde encore l'attitude de la houle (patins sinon décalés,
    // d'autant plus sur la grande largeur d'un catamaran)
    const rot0 = boatRoot.rotation.clone();
    boatRoot.rotation.set(0, 0, 0);
    boatRoot.updateMatrixWorld(true);
    const rc = new THREE.Raycaster();
    const up = new THREE.Vector3(0, 1, 0);
    // hauteur de coque (monde, bateau posé en studio) au point monde (x, z)
    const base = STUDIO_LIFT + keelDepth;
    const yAt = (wx, wz) => {
      rc.set(new THREE.Vector3(wx, boatRoot.position.y - 8, wz), up); rc.far = 14;
      const h = rc.intersectObject(hull, true)[0];
      return h ? h.point.y - boatRoot.position.y + base : null;
    };
    const mesh = (geo, mat, x, y, z) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
      cradle.add(m);
      return m;
    };
    const rbox = (w, h, d, r, mat, x, y, z) => mesh(new RoundedBoxGeometry(w, h, d, 3, Math.min(r, h / 2 - 1e-3, w / 2 - 1e-3, d / 2 - 1e-3)), mat, x, y, z);
    const cyl = (r, h, mat, x, y, z) => mesh(new THREE.CylinderGeometry(r, r, h, 24), mat, x, y, z);
    const FOOT = 0.003; // jamais coplanaire au sol (pas de z-fighting)
    const { stations, hulls, sideZ: SIDE_Z, keelPad, sidePad } = prof.cradle;
    for (const hz of hulls) for (const lx of stations) {
      const z0 = boatBase.z + hz;
      const wx = boatBase.x + lx;
      const keel = conformPad(wx, z0, keelPad[0], keelPad[1], 0.07, yAt, true);
      if (!keel) continue;
      const sides = [];
      for (const s of [1, -1]) {
        const sp = conformPad(wx, z0 + SIDE_Z * s, sidePad[0], sidePad[1], 0.07, yAt);
        if (sp && sp.yMinBottom > 0.3) sides.push({ s, sp });
      }
      const halfSpan = SIDE_Z + 0.32;
      // embase : traverse à arêtes rayonnées + 2 semelles
      rbox(0.26, 0.12, halfSpan * 2, 0.035, cradleMat, wx, FOOT + 0.06, z0);
      for (const s of [1, -1]) rbox(0.42, 0.035, 0.3, 0.012, padMat, wx, FOOT + 0.0175 - 0.0005, z0 + s * (halfSpan - 0.1));
      const beamTop = FOOT + 0.12;
      // tin de quille : fût rayonné + platine inox + patin moulé
      const kb = keel.yMinBottom;
      const plate = 0.018;
      if (kb - beamTop > plate + 0.02) {
        rbox(0.24, kb - beamTop - plate, 0.24, 0.03, cradleMat, wx, beamTop + (kb - beamTop - plate) / 2, z0);
        rbox(0.4, plate, 0.3, 0.006, steelMat, wx, kb - plate / 2 - 0.0015, z0);
      }
      mesh(keel.geo, padMat, 0, 0, 0);
      // béquilles latérales : bras inclinés depuis la traverse vers la tête de vérin, tige inox, rotule, patin
      for (const { s, sp } of sides) {
        mesh(sp.geo, padMat, 0, 0, 0);
        const zc = z0 + SIDE_Z * s;
        // sellette inox inclinée parallèle au fond du patin (pente locale de la carène) : contact franc, sans jour
        const yc = sp.yCenterBottom;
        const m = ((yAt(wx, zc + 0.1) ?? yc) - (yAt(wx, zc - 0.1) ?? yc)) / 0.2;
        const n = new THREE.Vector3(0, 1, -m).normalize();
        const rotH = 0.05;
        const head = cyl(0.11, rotH, steelMat, 0, 0, 0);
        head.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
        head.position.set(wx, yc, zc).addScaledVector(n, -(rotH / 2 - 0.002));
        const rodTop = yc - rotH * 0.5 - 0.11 * Math.abs(m), rodLen = Math.max(0.05, rodTop - (beamTop + 0.16));
        cyl(0.04, rodLen, steelMat, wx, rodTop - rodLen / 2, zc);             // tige de vérin
        const tubeH = 0.16;
        cyl(0.07, tubeH, cradleMat, wx, beamTop + tubeH / 2, zc);            // corps de vérin
        // bras de contreventement incliné (traverse -> corps de vérin)
        const a = new THREE.Vector3(wx, beamTop, z0 + s * 0.35), b = new THREE.Vector3(wx, beamTop + tubeH * 0.85, zc - s * 0.04);
        const len = a.distanceTo(b);
        const arm = rbox(0.06, len, 0.06, 0.02, cradleMat, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
        arm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      }
    }
    boatRoot.rotation.copy(rot0);
    boatRoot.updateMatrixWorld(true);
    cradleBuilt = cradle.children.length > 0;
  }
  const contactTex = radialTexture('0,0,0', 0.85);
  const contactMat = new THREE.MeshBasicMaterial({ map: contactTex, transparent: true, depthWrite: false, opacity: 0.9, fog: false, toneMapped: false });
  const contact = new THREE.Mesh(new THREE.PlaneGeometry(36, 11), contactMat);
  contact.rotation.x = -Math.PI / 2;
  contact.position.y = 0.004;
  contact.renderOrder = 2;
  studioGroup.add(contact);
  // halo doux au sol (podium lumineux)
  const haloTex = radialTexture('255,255,255', 0.06);
  const haloMat = new THREE.MeshBasicMaterial({ map: haloTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(70, 40), haloMat);
  halo.rotation.x = -Math.PI / 2;
  halo.position.y = 0.003;
  halo.renderOrder = 1;
  studioGroup.add(halo);

  // --- état ambiance --------------------------------------------------------
  let ambianceId = 'overcast';
  const amb = makeAmbState(AMBIANCES.overcast);
  const ambFrom = makeAmbState(AMBIANCES.overcast);
  const ambTo = makeAmbState(AMBIANCES.overcast);
  let ambT = 1, ambDur = 1.1, envDirty = true, envFrameCounter = 0;
  let interiorK = 0; // 0 extérieur → 1 vues intérieures (exposition légèrement relevée)

  function applyAmbiance() {
    const u = skyUniforms;
    u.uZenith.value.copy(amb.zenith);
    u.uHorizon.value.copy(amb.horizon);
    u.uSeaHorizon.value.copy(amb.seaHorizon);
    u.uSunDir.value.copy(amb.sunDir);
    u.uSunColor.value.copy(amb.sunColor);
    u.uCloudColor.value.copy(amb.cloudColor);
    u.uCloudShade.value.copy(amb.cloudShade);
    u.uSunGlow.value = amb.sunGlow;
    u.uSunDisk.value = amb.sunDisk;
    u.uCloudCover.value = amb.cloudCover;
    u.uCloudOpacity.value = amb.cloudOpacity;
    u.uStars.value = amb.stars;
    u.uStudio.value = amb.studio;
    u.uSkyCurve.value = amb.skyCurve;
    u.uSunVeil.value = amb.sunVeil;
    u.uEnvSun.value = amb.envSun;
    sun.shadow.radius = amb.shadowRadius;
    if (gtaoPass) gtaoPass.blendIntensity = amb.ao * (1 - 0.15 * interiorK);
    oceanMat.uniforms.uFoam.value = amb.foam;
    oceanMat.uniforms.uWhitecap.value = amb.whitecap;
    // studio « En mer » : le bassin se fond dans le fond (brume dense à la teinte du cyclo) au lieu d'un horizon net
    oceanMat.uniforms.uFogDensity.value = 0.0013 + 0.016 * amb.studio;
    oceanMat.uniforms.uLanes.value = amb.lanes;
    oceanMat.uniforms.uWaterDeep.value.copy(amb.waterDeep);
    oceanMat.uniforms.uWaterScatter.value.copy(amb.waterScatter);
    oceanMat.uniforms.uSunSpec.value = amb.sunSpec;
    oceanMat.uniforms.uWaveAmp.value = amb.waveAmp * (1 - settingK);
    sun.color.copy(amb.lightColor);
    sun.intensity = amb.light;
    hemi.color.copy(amb.hemiSky);
    hemi.groundColor.copy(amb.hemiGround);
    // la lumière d'hémisphère ignore le pavillon : en vue intérieure de jour on la réduit, sinon le salon
    // paraît plus lumineux que le dehors vu à travers les vitres
    hemi.intensity = amb.hemi * (1 - 0.45 * interiorK * (1 - amb.night));
    fill.intensity = amb.fill;
    rim.intensity = amb.rim;
    rim.color.copy(amb.rimColor);
    // intérieur : pas de surexposition de jour (le salon reste plus sombre que le dehors, comme en vrai) ;
    // de nuit la lampe intérieure dominante ne doit pas clipper -> exposition et éclairage réduits
    const nightIn = interiorK * amb.night;
    interiorLight.intensity = amb.interior * (1 - 0.35 * nightIn);
    renderer.toneMappingExposure = amb.exposure * (1 - 0.06 * interiorK) * (1 - 0.22 * nightIn);
    envSkyMat.uniforms.uEnvGain.value = amb.envGain;
    // couleur de la mer vue d'en haut dans l'env (eau profonde + diffusion), cf. shader océan
    envSkyMat.uniforms.uEnvSea.value.copy(amb.waterDeep).lerp(amb.waterScatter, 0.45).multiplyScalar(1.15);
    // r160 n'a pas scene.environmentIntensity : on module envMapIntensity des matériaux du bateau
    const innerEnv = 1 - (0.35 + 0.2 * interiorK) * (1 - amb.night) * (1 - amb.studio);
    for (const m of boatMats) {
      let k = m.userData.__interiorOnly ? innerEnv : 1;
      // laques sombres vernies : l'albédo ~2 % rend l'IBL diffus négligeable, donc relever envMapIntensity
      // agit presque uniquement sur le reflet (miroir du monde sur le bordé) ; neutre pour les teintes claires
      if (m.clearcoat > 0.3 && m.color && !m.userData.__interiorOnly) {
        const c = m.color, lum = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
        k *= 1 + 0.2 * (1 - THREE.MathUtils.smoothstep(lum, 0.03, 0.2));
      }
      m.envMapIntensity = m.userData.__baseEnvInt * amb.envInt * k;
    }
    if (bloomPass) bloomPass.strength = amb.bloom * (1 - 0.6 * interiorK) * (postFX ? 1 : 0);
    for (const sb of softboxes) sb.material.color.setScalar(amb.softbox * sb.userData.gain);
    scene.fog.color.copy(amb.seaHorizon);
    floorMat.color.copy(amb.seaHorizon).multiplyScalar(1.3);
    cycMat.color.copy(floorMat.color);
  }

  // opts.duration (s, défaut 1.1) — 0 = instantané (ex. état initial)
  function setAmbiance(id, opts = {}) {
    if (!AMBIANCES[id]) return;
    ambianceId = id;
    copyAmbState(ambFrom, amb);
    copyAmbState(ambTo, makeAmbState(AMBIANCES[id]));
    ambDur = opts.duration != null ? opts.duration : 1.1;
    if (ambDur <= 0) { copyAmbState(amb, ambTo); ambT = 1; envDirty = true; }
    else ambT = 0;
  }

  // --- décor ----------------------------------------------------------------
  let settingId = 'sea';
  let settingK = 0, settingTarget = 0;
  function setSetting(id, opts = {}) {
    if (id !== 'sea' && id !== 'studio') return;
    settingId = id;
    settingTarget = id === 'studio' ? 1 : 0;
    if (opts.duration === 0) settingK = settingTarget;
  }
  function applySetting() {
    const k = easeInOutCubic(settingK);
    ocean.visible = settingK < 0.999;
    oceanMat.uniforms.uOpacity.value = 1 - k;
    studioGroup.visible = settingK > 0.001;
    floorMat.opacity = k;
    cycMat.opacity = k;
    cycMat.transparent = k < 0.999;
    if (!cradleBuilt && settingK > 0.001 && keelDepth > 0.05) buildCradle();
    cradle.scale.y = Math.max(k, 0.001);
    contactMat.opacity = 0.9 * k;
    haloMat.opacity = k;
    if (reflector) reflector.visible = settingK > 0.35;
    // brouillard du sol studio (fond dans le fond uni), quasi nul en mer
    scene.fog.near = THREE.MathUtils.lerp(500, 35, k);
    scene.fog.far = THREE.MathUtils.lerp(5000, 130, k);
  }

  // --- bateau ---------------------------------------------------------------
  let boatApi = null;
  let boatRoot = null;
  const boatBase = new THREE.Vector3();
  const glowLocal = [];

  function prepareShadows(root) {
    root.traverse((o) => {
      if (!o.isMesh) return;
      let transparent = false;
      forEachMaterial(o, (m) => { if (m.transparent || (m.transmission && m.transmission > 0)) transparent = true; });
      if (!o.userData.noShadow) {
        o.castShadow = !transparent;
        o.receiveShadow = !transparent;
      }
    });
  }

  // anti-aliasing spéculaire géométrique (Tokuyoshi-Kaplanyan) sur les métaux : la rugosité est relevée là où
  // la normale varie vite à l'écran (inox fin de 8,5 mm, mains courantes tubulaires vus de loin) -> plus de
  // scintillement / « crawl » des reflets ; coût : 4 instructions, aucun effet de près
  function addSpecularAA(m) {
    if (m.userData.__sAA || !(m.metalness >= 0.6)) return;
    m.userData.__sAA = true;
    const ob = m.onBeforeCompile;
    const hasOb = ob && ob !== THREE.Material.prototype.onBeforeCompile;
    m.onBeforeCompile = function (sh, r) {
      if (hasOb) ob.call(this, sh, r);
      sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          vec3 dnx = dFdx(normal), dny = dFdy(normal);
          float kv = min(0.5 * (dot(dnx, dnx) + dot(dny, dny)), 0.16);
          float a = roughnessFactor * roughnessFactor;
          roughnessFactor = sqrt(sqrt(a * a + kv));
        }`);
    };
    const key0 = m.customProgramCacheKey.bind(m);
    m.customProgramCacheKey = () => key0() + '|sAA';
    m.needsUpdate = true;
  }

  const boatMats = [];
  function collectBoatMats() {
    boatMats.length = 0;
    if (!boatRoot) return;
    const seen = new Set();
    boatRoot.traverse((o) => {
      if (!o.isMesh) return;
      forEachMaterial(o, (m) => {
        if (seen.has(m) || !(m.isMeshStandardMaterial)) return;
        seen.add(m);
        if (m.userData.__baseEnvInt == null) m.userData.__baseEnvInt = m.envMapIntensity != null ? m.envMapIntensity : 1;
        boatMats.push(m);
        addSpecularAA(m);
      });
    });
    // matériaux propres au salon : l'IBL ignore le pavillon -> on l'atténue (sinon intérieur plus clair que le dehors)
    const inner = new Set(), outer = new Set();
    const inGroup = boatApi && boatApi.parts && boatApi.parts.interior;
    boatRoot.traverse((o) => {
      if (!o.isMesh) return;
      let isIn = false;
      if (inGroup) o.traverseAncestors((a) => { if (a === inGroup) isIn = true; });
      forEachMaterial(o, (m) => (isIn ? inner : outer).add(m));
    });
    for (const m of boatMats) m.userData.__interiorOnly = inner.has(m) && !outer.has(m);
  }

  function add(object3D) {
    if (!object3D) return;
    scene.add(object3D);
    prepareShadows(object3D);
  }

  let profId = 'd29';
  function applyProfile(id) {
    profId = HULL_PROFILES[id] ? id : 'd29';
    prof = HULL_PROFILES[profId];
    views = prof.views;
    const u = oceanMat.uniforms;
    u.uEll.value.fromArray(prof.ell);
    u.uEnds.value.fromArray(prof.ends);
    u.uSpillA.value.fromArray(prof.spillA);
    u.uSpillB.value.fromArray(prof.spillB);
    contact.scale.set(prof.contact[0] / 36, prof.contact[1] / 11, 1);
    interiorLight.position.fromArray(prof.interiorLight);
    [CUT_Y_TOP, CUT_Y] = prof.cut;
    setSeaProfile();
  }
  // Bascule de modèle : l'ancien bateau est retiré de la scène (sa libération GPU revient à l'appelant, main.js)
  // et tout ce qui en dépend est recalculé : profil de coque, coupe, berceau, boîte (ombre, tirant d'eau), reflets,
  // matériaux (IBL), feux, projecteurs sous-marins.
  function setBoat(api) {
    const prevRoot = boatRoot;
    if (prevRoot && (!api || api.root !== prevRoot)) {
      if (cutFade) endCutFade();
      if (secEntries) applySection(false);
      cutawayOn = false; cutK = 0;
      for (const n of navLights) n.sprite.material.dispose();
      navLights.length = 0; navGroup.clear(); navGroup.removeFromParent();
      prevRoot.removeFromParent();
    }
    applyProfile(api && api.hullProfile);
    boatApi = api || null;
    boatRoot = api ? api.root : null;
    glowLocal.length = 0;
    cradleBuilt = false;
    while (cradle.children.length) { const c = cradle.children.pop(); c.geometry.dispose(); }
    boatBoxRel.makeEmpty(); boxCounter = 0;
    collectBoatMats();
    collectReflGlass();
    if (!boatRoot) return;
    if (!boatRoot.parent) scene.add(boatRoot);
    prepareShadows(boatRoot);
    boatBase.copy(boatRoot.position);
    const uw = api.parts && api.parts.underwaterLights;
    if (uw) {
      boatRoot.updateMatrixWorld(true);
      const inv = new THREE.Matrix4().copy(boatRoot.matrixWorld).invert();
      const tmp = new THREE.Vector3();
      // seuls les projecteurs du tableau (disques émissifs, pas les enjoliveurs) : 4 taches discrètes,
      // décalées vers l'arrière (le faisceau part en arrière/bas), pas de bande continue le long de la coque
      const pts = [];
      uw.traverse((o) => {
        if (!o.isMesh || !o.material || !o.material.emissive || o.material.emissive.getHex() === 0) return;
        o.getWorldPosition(tmp);
        pts.push(tmp.clone().applyMatrix4(inv));
      });
      const minX = pts.reduce((a, p) => Math.min(a, p.x), Infinity);
      for (const p of pts) {
        if (p.x > minX + 0.6 || glowLocal.length >= 4) continue;
        glowLocal.push(p.clone().add(new THREE.Vector3(-1.1, 0, p.z * prof.glowSpread)));
      }
      uw.visible = amb.night > 0.5;
    }
    buildNavLights();
    fitShadow(); // boîte et tirant d'eau du nouveau bateau tout de suite (berceau, pose en showroom)
  }

  // --- feux de navigation (nuit) : halos HDR (bloom), secteurs réglementaires --------------------------
  // bâbord rouge / tribord vert (112,5° chacun vers l'avant), tête de mât blanc (225° avant), poupe blanc (135° arrière)
  const navGroup = new THREE.Group();
  navGroup.name = 'navLights';
  const navTex = (() => {
    const s = 128, c = document.createElement('canvas');
    c.width = c.height = s;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.06, 'rgba(255,255,255,0.95)');
    grd.addColorStop(0.14, 'rgba(255,255,255,0.22)');
    grd.addColorStop(0.3, 'rgba(255,255,255,0.03)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, s, s);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const navLights = [];
  function buildNavLights() {
    for (const n of navLights) n.sprite.material.dispose();
    navLights.length = 0;
    navGroup.clear();
    if (!boatRoot) return;
    boatRoot.add(navGroup);
    const p = (boatApi && boatApi.parts) || {};
    boatRoot.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(boatRoot.matrixWorld).invert();
    const localBox = (o) => {
      const b = new THREE.Box3();
      if (!o) return b;
      o.traverse((m) => { if (m.isMesh) { m.geometry.computeBoundingBox(); b.union(m.geometry.boundingBox.clone().applyMatrix4(m.matrixWorld)); } });
      return b.isEmpty() ? b : b.applyMatrix4(inv);
    };
    const sb = localBox(p.superstructure), hb = localBox(p.hull), rb = localBox(p.radar);
    if (sb.isEmpty() || hb.isEmpty()) return;
    const add = (hex, gain, pos, size, sector) => {
      const m = new THREE.SpriteMaterial({ map: navTex, color: new THREE.Color(hex).multiplyScalar(gain), blending: THREE.AdditiveBlending,
        depthWrite: false, transparent: true, fog: false, toneMapped: false });
      const s = new THREE.Sprite(m);
      s.position.copy(pos); s.scale.setScalar(size); s.renderOrder = 5;
      s.raycast = () => {}; // jamais « cliquable » (et pas d'erreur Sprite sans raycaster.camera)
      navGroup.add(s);
      navLights.push({ sprite: s, gain, hex, sector });
    };
    if (prof.nav) { // profil : optiques du GLB (matériaux navRed / navGreen / navWhite) sinon positions de la fiche
      const M = (boatApi && boatApi.materials) || {};
      const lens = (mat, fb) => {
        const b = new THREE.Box3();
        if (mat) boatRoot.traverse((o) => { if (o.isMesh && o.material === mat) { o.geometry.computeBoundingBox(); b.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld)); } });
        return b.isEmpty() || b.getSize(new THREE.Vector3()).length() > 1.5 ? new THREE.Vector3().fromArray(fb) : b.applyMatrix4(inv).getCenter(new THREE.Vector3());
      };
      const pr = lens(M.navRed, prof.nav.port), st = lens(M.navGreen, prof.nav.stbd), mw = lens(M.navWhite, prof.nav.mast);
      add('#ff2a1a', 3.2, pr.add(new THREE.Vector3(0, 0, -0.04)), 0.55, 'port');
      add('#18ff6a', 3.2, st.add(new THREE.Vector3(0, 0, 0.04)), 0.55, 'stbd');
      add('#fff2dc', 2.2, mw.add(new THREE.Vector3(0, 0.08, 0)), 0.32, 'mast');
      add('#fff2dc', 2.2, new THREE.Vector3().fromArray(prof.nav.stern), 0.4, 'stern');
      return;
    }
    const xs = sb.max.x - 0.45, ys = sb.min.y + 0.62;
    add('#ff2a1a', 3.2, new THREE.Vector3(xs, ys, sb.min.z - 0.03), 0.55, 'port');
    add('#18ff6a', 3.2, new THREE.Vector3(xs, ys, sb.max.z + 0.03), 0.55, 'stbd');
    const mx = rb.isEmpty() ? sb.max.x - 3 : (rb.min.x + rb.max.x) / 2;
    const my = rb.isEmpty() ? sb.max.y + 0.8 : rb.max.y + 0.12;
    add('#fff2dc', 2.2, new THREE.Vector3(mx, my, 0), 0.32, 'mast');
    add('#fff2dc', 2.2, new THREE.Vector3(hb.min.x + 0.08, sb.min.y - 0.05, 0), 0.4, 'stern');
  }
  const _navV = new THREE.Vector3();
  function updateNavLights(on) {
    navGroup.visible = on > 0.01 && navLights.length > 0;
    if (!navGroup.visible) return;
    // direction caméra dans le repère bateau -> secteurs de visibilité (fondu doux aux limites)
    _navV.copy(camera.position);
    boatRoot.worldToLocal(_navV);
    for (const n of navLights) {
      const d = _navV.clone().sub(n.sprite.position).normalize();
      let k = 1;
      if (n.sector === 'port') k = THREE.MathUtils.smoothstep(-d.z, 0.0, 0.18) * THREE.MathUtils.smoothstep(d.x, -0.45, -0.3);
      else if (n.sector === 'stbd') k = THREE.MathUtils.smoothstep(d.z, 0.0, 0.18) * THREE.MathUtils.smoothstep(d.x, -0.45, -0.3);
      else if (n.sector === 'mast') k = cutawayOn ? 0 : THREE.MathUtils.smoothstep(d.x, -0.45, -0.3);
      else if (n.sector === 'stern') k = 1 - THREE.MathUtils.smoothstep(d.x, -0.45, -0.3);
      n.sprite.material.color.set(n.hex).multiplyScalar(n.gain * k * on);
      n.sprite.visible = k * on > 0.002;
    }
  }

  // --- vues / vol caméra ----------------------------------------------------
  let currentView = views.exterior;
  let currentViewId = 'exterior';
  let flight = null;

  function viewTargetVec(v) {
    const pos = new THREE.Vector3().fromArray(v.pos);
    const tgt = new THREE.Vector3().fromArray(v.target);
    if (v.interior && v.lookRadius) {
      const dir = tgt.clone().sub(pos).normalize();
      tgt.copy(pos).addScaledVector(dir, v.lookRadius);
    }
    return { pos, tgt };
  }

  function applyViewLimits(v) {
    if (v.interior) {
      controls.minDistance = 0.05;
      controls.maxDistance = Math.max(2.5, (v.lookRadius || 1) * 2.5);
      controls.minPolarAngle = Math.PI * 0.08;
      controls.maxPolarAngle = Math.PI * 0.92;
      controls.rotateSpeed = 0.45;
      controls.enableZoom = true;
    } else {
      const d = new THREE.Vector3().fromArray(v.pos).distanceTo(new THREE.Vector3().fromArray(v.target));
      controls.minDistance = v.minDistance != null ? v.minDistance : Math.min(9, d * 0.8);
      controls.maxDistance = Math.max(110, d * 1.3);
      controls.minPolarAngle = 0;
      controls.maxPolarAngle = Math.PI * 0.485;
      controls.rotateSpeed = 0.7;
    }
  }

  function syncControls() {
    const damp = controls.enableDamping;
    controls.enableDamping = false;
    controls.update();
    controls.enableDamping = damp;
  }

  function flyTo(viewId, opts = {}) {
    const duration = opts.duration != null ? opts.duration : 1.6;
    let v = typeof viewId === 'string' ? views[viewId] : viewId;
    if (!v) return Promise.resolve(false);
    if (flight) { flight.resolve(false); flight = null; }
    const { pos, tgt } = viewTargetVec(v);
    const fromPos = camera.position.clone();
    const fromTgt = controls.target.clone();
    currentView = v;
    currentViewId = typeof viewId === 'string' ? viewId : null;
    // near réduit dès le départ si on entre à l'intérieur
    if (v.interior) { camera.near = 0.03; camera.updateProjectionMatrix(); }
    syncControls();
    const fromFov = camera.fov, toFov = v.fov || BASE_FOV;
    if (duration <= 0) {
      camera.fov = toFov; camera.updateProjectionMatrix();
      camera.position.copy(pos); controls.target.copy(tgt);
      finishFlight(v);
      return Promise.resolve(true);
    }
    // interpolation sphérique de l'offset caméra autour d'une cible interpolée
    const offA = new THREE.Spherical().setFromVector3(fromPos.clone().sub(fromTgt));
    const offB = new THREE.Spherical().setFromVector3(pos.clone().sub(tgt));
    let dTheta = offB.theta - offA.theta;
    while (dTheta > Math.PI) dTheta -= Math.PI * 2;
    while (dTheta < -Math.PI) dTheta += Math.PI * 2;
    // les deux bouts à l'extérieur : passage en arc ; sinon ligne droite (entrée en cabine)
    const arc = !v.interior && !(fromTgt.distanceTo(fromPos) < 3);
    return new Promise((resolve) => {
      flight = { t: 0, duration, fromPos, fromTgt, pos, tgt, offA, offB, dTheta, arc, v, resolve, fromFov, toFov };
    });
  }

  function finishFlight(v) {
    applyViewLimits(v);
    if (!v.interior) { camera.near = 0.25; camera.updateProjectionMatrix(); }
    camera.lookAt(controls.target);
    syncControls();
  }

  const _sph = new THREE.Spherical();
  function stepFlight(dt) {
    const f = flight;
    f.t += dt / f.duration;
    const k = easeInOutCubic(clamp01(f.t));
    controls.target.lerpVectors(f.fromTgt, f.tgt, k);
    if (f.fromFov !== f.toFov) { camera.fov = THREE.MathUtils.lerp(f.fromFov, f.toFov, k); camera.updateProjectionMatrix(); }
    if (f.arc) {
      _sph.radius = THREE.MathUtils.lerp(f.offA.radius, f.offB.radius, k);
      _sph.phi = THREE.MathUtils.lerp(f.offA.phi, f.offB.phi, k);
      _sph.theta = f.offA.theta + f.dTheta * k;
      // léger soulèvement au milieu du trajet pour survoler le bateau
      _sph.phi = Math.max(0.02, _sph.phi - Math.sin(Math.PI * k) * Math.min(0.25, Math.abs(f.dTheta) * 0.12));
      camera.position.setFromSpherical(_sph).add(controls.target);
    } else {
      camera.position.lerpVectors(f.fromPos, f.pos, k);
    }
    camera.lookAt(controls.target);
    if (f.t >= 1) {
      flight = null;
      camera.position.copy(f.pos);
      controls.target.copy(f.tgt);
      finishFlight(f.v);
      f.resolve(true);
    }
  }

  controls.addEventListener('start', () => {
    if (flight) {
      const f = flight; flight = null;
      applyViewLimits(f.v);
      if (!f.v.interior) { camera.near = 0.25; camera.updateProjectionMatrix(); }
      syncControls();
      f.resolve(false);
    }
  });

  function setAutoRotate(on) { controls.autoRotate = !!on; }

  // --- coupe ----------------------------------------------------------------
  let cutawayOn = false;
  let cutFade = null; // { meshes:[{mesh, orig, clone}], from, to, t, parts }
  function cutawayParts(api) {
    const p = (api && api.parts) || {};
    const list = [p.roof, p.upperGlass].filter(Boolean);
    // le radar flotterait dans le vide s'il n'est pas un enfant du toit : on le masque aussi
    if (p.radar && p.roof) {
      let inRoof = false;
      p.radar.traverseAncestors((a) => { if (a === p.roof || a === p.upperGlass) inRoof = true; });
      if (!inRoof) list.push(p.radar);
    }
    return list;
  }
  // --- coupe : plan de section + capots pleins (faces arrière rendues en teinte « coupe ») -------------
  // Les montants, cloisons et pavillons restants de la superstructure sont sectionnés net à ~0,75 m au-dessus
  // du pont ; l'intérieur des volumes coupés apparaît plein (gl_FrontFacing) au lieu d'être creux.
  renderer.localClippingEnabled = true;
  const cutPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 1e4);
  let CUT_Y_TOP = 4.4, CUT_Y = 2.45; // prof.cut
  let cutK = 0;
  let secEntries = null;
  function secMaterial(m) {
    if (m.transparent || m.blending !== THREE.NormalBlending) return null;
    const c = m.clone();
    const ob = m.onBeforeCompile;
    c.clippingPlanes = [cutPlane];
    c.side = THREE.DoubleSide;
    c.onBeforeCompile = (sh, r) => {
      if (ob && ob !== THREE.Material.prototype.onBeforeCompile) ob.call(c, sh, r);
      sh.fragmentShader = sh.fragmentShader.replace('#include <dithering_fragment>',
        '#include <dithering_fragment>\n  if (!gl_FrontFacing) gl_FragColor = vec4(0.30, 0.285, 0.265, 1.0);');
    };
    const key = m.customProgramCacheKey ? m.customProgramCacheKey() : '';
    c.customProgramCacheKey = () => key + '|section';
    return c;
  }
  function applySection(on) {
    if (on && !secEntries) {
      secEntries = [];
      const p = (boatApi && boatApi.parts) || {};
      if (!p.superstructure) return;
      const skip = new Set(cutawayParts(boatApi));
      const cache = new Map();
      // (intérieur exclu : ses doublages sont des coques simples orientées vers l'intérieur -> pas de capot possible)
      const groups = [p.superstructure];
      for (const g of groups) g.traverse((o) => {
        if (!o.isMesh || Array.isArray(o.material)) return;
        let inCut = false;
        o.traverseAncestors((a) => { if (skip.has(a)) inCut = true; });
        if (inCut || skip.has(o)) return;
        if (!cache.has(o.material)) cache.set(o.material, secMaterial(o.material));
        const c = cache.get(o.material);
        if (!c) return;
        secEntries.push({ mesh: o, orig: o.material });
        o.material = c;
      });
    } else if (!on && secEntries) {
      const disposed = new Set();
      for (const e of secEntries) {
        if (!disposed.has(e.mesh.material)) { disposed.add(e.mesh.material); e.mesh.material.dispose(); }
        e.mesh.material = e.orig;
      }
      secEntries = null;
    }
  }
  function updateSection(dt) {
    const tgt = cutawayOn ? 1 : 0;
    if (cutK === 0 && tgt === 0) return;
    cutK = tgt > cutK ? Math.min(1, cutK + dt / 0.9) : Math.max(0, cutK - dt / 0.6);
    if (cutK > 0) applySection(true);
    const y0 = boatRoot ? boatRoot.position.y : 0;
    cutPlane.constant = y0 + THREE.MathUtils.lerp(CUT_Y_TOP, CUT_Y, easeInOutCubic(cutK));
    if (cutK === 0) applySection(false);
  }

  function setCutaway(on, api) {
    on = !!on;
    api = api || boatApi;
    if (on === cutawayOn && !cutFade) return Promise.resolve(true);
    cutawayOn = on;
    const parts = cutawayParts(api);
    // termine un fondu en cours
    if (cutFade) endCutFade(true);
    const entries = [];
    for (const part of parts) {
      part.visible = true;
      part.traverse((o) => {
        if (!o.isMesh) return;
        const orig = o.material;
        const mk = (m) => {
          const c = m.clone();
          c.transparent = true;
          c.userData.baseOpacity = m.opacity != null ? m.opacity : 1;
          c.depthWrite = !on;
          return c;
        };
        const clone = Array.isArray(orig) ? orig.map(mk) : mk(orig);
        o.material = clone;
        entries.push({ mesh: o, orig, clone });
      });
    }
    cutFade = { entries, parts, from: on ? 1 : 0, to: on ? 0 : 1, t: 0, on };
    applyCutOpacity(cutFade.from);
    const p = flyTo(on ? 'cutaway' : 'exterior', { duration: 1.6 });
    return p;
  }
  function applyCutOpacity(a) {
    for (const e of cutFade.entries) {
      const set = (m) => { m.opacity = m.userData.baseOpacity * a; };
      Array.isArray(e.clone) ? e.clone.forEach(set) : set(e.clone);
    }
  }
  function endCutFade() {
    const f = cutFade;
    cutFade = null;
    for (const e of f.entries) {
      e.mesh.material = e.orig;
      const disp = (m) => m.dispose();
      Array.isArray(e.clone) ? e.clone.forEach(disp) : disp(e.clone);
    }
    for (const part of f.parts) part.visible = !f.on;
  }

  // --- hotspots -------------------------------------------------------------
  const _v = new THREE.Vector3();
  const _vc = new THREE.Vector3();
  function projectHotspots(hotspots, root) {
    const w = container.clientWidth || 1, h = container.clientHeight || 1;
    root = root || boatRoot;
    if (root) root.updateMatrixWorld();
    camera.updateMatrixWorld();
    return (hotspots || []).map((hs) => {
      const p = hs.position;
      if (p && p.isVector3) _v.copy(p); else if (Array.isArray(p)) _v.fromArray(p); else _v.set(0, 0, 0);
      if (root) root.localToWorld(_v);
      _vc.copy(_v).applyMatrix4(camera.matrixWorldInverse);
      const behind = _vc.z > -camera.near;
      _v.project(camera);
      const inFrame = Math.abs(_v.x) <= 1.02 && Math.abs(_v.y) <= 1.02;
      return {
        id: hs.id, label: hs.label, text: hs.text, view: hs.view,
        x: (_v.x * 0.5 + 0.5) * w,
        y: (-_v.y * 0.5 + 0.5) * h,
        depth: -_vc.z,
        visible: !behind && inFrame,
      };
    });
  }

  // --- callbacks / screenshot ----------------------------------------------
  const frameCbs = new Set();
  function onFrame(cb) { frameCbs.add(cb); return () => frameCbs.delete(cb); }

  function screenshot() {
    render();
    return canvas.toDataURL('image/png');
  }

  // --- post-traitement : MSAA + bloom léger + vignette + tone mapping ACES ----
  let postFX = true;
  let composer = null, bloomPass = null, composerRT = null, gtaoPass = null;
  try {
    // MSAA x4 (x2 en Retina, où l'aliasing est déjà faible)
    composerRT = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, samples: pixelRatio >= 1.75 ? 2 : 4 });
    composer = new EffectComposer(renderer, composerRT);
    composer.addPass(new RenderPass(scene, camera));
    // occlusion ambiante GTAO (coins, pied de cloisons, assises, contact équipements / pont)
    try {
      gtaoPass = new GTAOPass(scene, camera, 2, 2);
      gtaoPass.updateGtaoMaterial({ radius: 1.0, distanceExponent: 1.0, thickness: 1.0, scale: 1.2, samples: 12, distanceFallOff: 1.0, screenSpaceRadius: false });
      gtaoPass.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
      // AO calculée en demi-résolution (≈ -30 % de coût), remontée en bilinéaire au mélange
      const baseSetSize = gtaoPass.setSize.bind(gtaoPass);
      gtaoPass.setSize = (w, h) => baseSetSize(Math.max(2, Math.round(w / 2)), Math.max(2, Math.round(h / 2)));
      // ciel, océan (déplacé en vertex shader) et surfaces transparentes exclus du G-buffer AO
      const baseOverride = gtaoPass.overrideVisibility.bind(gtaoPass);
      gtaoPass.overrideVisibility = function () {
        baseOverride(); // mémorise la visibilité de tous les objets (restaurée par restoreVisibility)
        scene.traverse((o) => {
          if (!o.visible) return;
          let hide = o === skyDome || o === ocean || o === halo || o === contact || o.isSprite || o === navGroup;
          if (!hide && o.isMesh) forEachMaterial(o, (m) => { if (m.transparent || m.transmission > 0 || m.isMeshBasicMaterial) hide = true; });
          if (hide) o.visible = false;
        });
      };
      composer.addPass(gtaoPass);
    } catch (e) { gtaoPass = null; console.warn('GTAO indisponible', e); }
    // seuil > 1 : seules les vraies hautes lumières (soleil, LED, spéculaires) diffusent — pas les surfaces blanches
    bloomPass = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.16, 0.35, 1.6);
    composer.addPass(bloomPass);
    composer.addPass(new ShaderPass({
      uniforms: { tDiffuse: { value: null }, uAmount: { value: 0.32 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform sampler2D tDiffuse; uniform float uAmount; varying vec2 vUv;
        void main(){ vec4 c = texture2D(tDiffuse, vUv); vec2 d = vUv - 0.5; d.x *= 1.25;
          float v = 1.0 - uAmount * smoothstep(0.25, 0.95, length(d)); gl_FragColor = vec4(c.rgb * v, c.a); }`,
    }));
    composer.addPass(new OutputPass());
  } catch (e) { composer = null; postFX = false; console.warn('postFX indisponible', e); }
  function setPostFX(on) { postFX = !!on && !!composer; }

  // --- resize ---------------------------------------------------------------
  // --- mode capture vidéo (rendu image par image, taille et caméra imposées) ---
  let capSize = null, cap = null, capDt = null;
  function resize() {
    const w = capSize ? capSize.w : Math.max(1, container.clientWidth), h = capSize ? capSize.h : Math.max(1, container.clientHeight);
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    reflRT.setSize(Math.max(2, Math.round(w * pixelRatio * 0.5)), Math.max(2, Math.round(h * pixelRatio * 0.5)));
    if (composer) {
      composer.setPixelRatio(pixelRatio);
      composer.setSize(w, h);
    }
    if (reflector) {
      const s = Math.min(1, pixelRatio) * 0.6;
      reflector.getRenderTarget().setSize(Math.round(w * s * pixelRatio), Math.round(h * s * pixelRatio));
    }
  }
  const ro = new ResizeObserver(resize);
  ro.observe(container);

  // --- boucle ---------------------------------------------------------------
  const clock = new THREE.Clock();
  let time = 0;
  let viewShift = 0, panelOverlap = 0, panelCheck = 0;
  let perfAcc = 0, perfN = 0, perfWarm = 0, perfSlow = 0;
  const tmpV = new THREE.Vector3();

  // --- réflexion planaire de l'océan (miroir y = 0, demi-résolution) ---------
  const reflRT = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType });
  const reflCam = new THREE.PerspectiveCamera();
  const reflClip = [new THREE.Plane(new THREE.Vector3(0, 1, 0), 0.0)];
  const biasM = new THREE.Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
  oceanMat.uniforms.uReflTex.value = reflRT.texture;
  const _dir = new THREE.Vector3(), _up = new THREE.Vector3(), _clear = new THREE.Color();
  // vitrage vu depuis l'eau : verre sombre opaque, réflexion Fresnel de l'environnement (cache l'intérieur)
  const reflGlassMat = new THREE.MeshStandardMaterial({ color: 0x080a0d, roughness: 0.05, metalness: 0.0, envMapIntensity: 1.5, side: THREE.DoubleSide });
  const reflGlassMeshes = [], reflTintMeshes = [];
  function collectReflGlass() {
    reflGlassMeshes.length = 0; reflTintMeshes.length = 0;
    if (!boatRoot) return;
    const tintGeo = new Set();
    boatRoot.traverse((o) => { if (o.isMesh && (o.name === 'glassTint' || (o.material && o.material.name === 'glassTint'))) { reflTintMeshes.push(o); tintGeo.add(o.geometry); } });
    boatRoot.traverse((o) => {
      if (!o.isMesh || reflTintMeshes.includes(o)) return;
      const m = o.material;
      if (tintGeo.has(o.geometry) || (m && !Array.isArray(m) && m.transparent && m.blending === THREE.AdditiveBlending)) reflGlassMeshes.push(o);
    });
  }
  // couvercle de flottaison : empreinte de la coque (masque vu de dessus) rendue en sombre à y≈0, réflexion seule
  const waterCap = new THREE.Mesh(new THREE.PlaneGeometry(44, 24), new THREE.ShaderMaterial({
    uniforms: { uMaskTex: oceanMat.uniforms.uMaskTex, uMaskMat: oceanMat.uniforms.uMaskMat },
    side: THREE.DoubleSide, fog: false,
    vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `uniform sampler2D uMaskTex; uniform mat4 uMaskMat; varying vec3 vW;
      void main(){ vec4 mc = uMaskMat * vec4(vW.x, 0.0, vW.z, 1.0);
        if (mc.x < 0.0 || mc.x > 1.0 || mc.y < 0.0 || mc.y > 1.0 || texture2D(uMaskTex, mc.xy).r < 0.5) discard;
        gl_FragColor = vec4(0.010, 0.011, 0.013, 1.0); }`,
  }));
  waterCap.rotation.x = -Math.PI / 2;
  waterCap.visible = false;
  waterCap.frustumCulled = false;
  scene.add(waterCap);
  function renderReflection() {
    if (!boatRoot || !ocean.visible) { oceanMat.uniforms.uReflOn.value = 0; return; }
    reflCam.copy(camera, false);
    reflCam.projectionMatrix.copy(camera.projectionMatrix);
    reflCam.projectionMatrixInverse.copy(camera.projectionMatrixInverse);
    reflCam.position.set(camera.position.x, -camera.position.y, camera.position.z);
    camera.getWorldDirection(_dir);
    _dir.y = -_dir.y;
    _up.set(0, 1, 0).applyQuaternion(camera.quaternion);
    _up.y = -_up.y;
    reflCam.up.copy(_up);
    reflCam.lookAt(_dir.add(reflCam.position));
    reflCam.updateMatrixWorld();
    oceanMat.uniforms.uReflMat.value.copy(biasM).multiply(reflCam.projectionMatrix).multiply(reflCam.matrixWorldInverse);

    const vis = [ocean.visible, skyDome.visible, studioGroup.visible];
    ocean.visible = false; skyDome.visible = false; studioGroup.visible = false;
    // vue « depuis l'eau » : ni intérieur, ni mobilier de pont, ni projecteurs ; vitrage opaque réfléchissant ;
    // couvercle de flottaison (sinon la coque coupée à y=0 laisse voir l'intérieur par en dessous)
    const hidden = [];
    const parts = (boatApi && boatApi.parts) || {};
    for (const o of [parts.underwaterLights, parts.interior, parts.aftDeck, ...reflTintMeshes]) {
      if (o && o.visible) { o.visible = false; hidden.push(o); }
    }
    const swapped = [];
    for (const m of reflGlassMeshes) { swapped.push(m.material); m.material = reflGlassMat; }
    waterCap.visible = oceanMat.uniforms.uMaskOn.value > 0.5;
    waterCap.position.set(boatRoot.position.x, 0.01, boatRoot.position.z);
    waterCap.updateMatrixWorld();
    renderer.getClearColor(_clear); const ca = renderer.getClearAlpha();
    const shadowAuto = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false;
    renderer.clippingPlanes = reflClip;
    renderer.setRenderTarget(reflRT);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(scene, reflCam);
    renderer.setRenderTarget(null);
    renderer.clippingPlanes = [];
    renderer.setClearColor(_clear, ca);
    renderer.shadowMap.autoUpdate = shadowAuto;
    ocean.visible = vis[0]; skyDome.visible = vis[1]; studioGroup.visible = vis[2];
    waterCap.visible = false;
    for (const o of hidden) o.visible = true;
    reflGlassMeshes.forEach((m, i) => { m.material = swapped[i]; });
    oceanMat.uniforms.uReflOn.value = 1;
  }

  // --- masque de flottaison (empreinte de la coque vue de dessus) ------------
  const maskRT = new THREE.WebGLRenderTarget(256, 512);
  const maskCam = new THREE.OrthographicCamera(-20, 20, 10, -10, 0.1, 80);
  const maskMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, fog: false });
  const maskClip = [new THREE.Plane(new THREE.Vector3(0, -1, 0), 0.25)]; // garde y < 0.25
  oceanMat.uniforms.uMaskTex.value = maskRT.texture;
  let maskCounter = 0;
  function renderMask() {
    if (!boatRoot || !ocean.visible) { oceanMat.uniforms.uMaskOn.value = 0; return; }
    if ((maskCounter++ % 6) !== 0 && oceanMat.uniforms.uMaskOn.value > 0.5) return;
    maskCam.position.set(boatRoot.position.x, 40, boatRoot.position.z);
    maskCam.up.set(1, 0, 0);
    maskCam.lookAt(boatRoot.position.x, 0, boatRoot.position.z);
    maskCam.updateMatrixWorld();
    // cadre 40 m (x) x 20 m (z) : 'up' = +X -> axe vertical de l'image = X
    maskCam.left = -10; maskCam.right = 10; maskCam.top = 20; maskCam.bottom = -20;
    maskCam.updateProjectionMatrix();
    oceanMat.uniforms.uMaskMat.value.copy(biasM).multiply(maskCam.projectionMatrix).multiply(maskCam.matrixWorldInverse);
    const vis = [ocean.visible, skyDome.visible, studioGroup.visible];
    ocean.visible = false; skyDome.visible = false; studioGroup.visible = false;
    const uw = boatApi && boatApi.parts && boatApi.parts.underwaterLights;
    const uwVis = uw ? uw.visible : false; if (uw) uw.visible = false;
    const fog = scene.fog, bg = scene.background;
    scene.fog = null; scene.background = null;
    scene.overrideMaterial = maskMat;
    renderer.getClearColor(_clear); const ca = renderer.getClearAlpha();
    const shadowAuto = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false;
    renderer.clippingPlanes = maskClip;
    renderer.setRenderTarget(maskRT);
    renderer.setClearColor(0x000000, 1);
    renderer.clear();
    renderer.render(scene, maskCam);
    renderer.setRenderTarget(null);
    renderer.clippingPlanes = [];
    renderer.setClearColor(_clear, ca);
    renderer.shadowMap.autoUpdate = shadowAuto;
    scene.overrideMaterial = null; scene.fog = fog; scene.background = bg;
    ocean.visible = vis[0]; skyDome.visible = vis[1]; studioGroup.visible = vis[2];
    if (uw) uw.visible = uwVis;
    oceanMat.uniforms.uMaskOn.value = 1;
  }

  function render() {
    renderMask();
    renderReflection();
    if (postFX && composer) composer.render();
    else renderer.render(scene, camera);
  }

  // --- cadrage serré de la caméra d'ombre sur la boîte englobante du bateau ---
  const boatBoxRel = new THREE.Box3();   // boîte monde relative à boatRoot.position
  let keelDepth = 0;
  const _box = new THREE.Box3(), _corner = new THREE.Vector3();
  let boxCounter = 0;
  function fitShadow() {
    if (!boatRoot) return;
    if ((boxCounter++ % 45) === 0 || boatBoxRel.isEmpty()) {
      const uw = boatApi && boatApi.parts && boatApi.parts.underwaterLights;
      const uwVis = uw ? uw.visible : false; if (uw) uw.visible = false;
      boatRoot.updateMatrixWorld(true);
      _box.setFromObject(boatRoot);
      if (uw) uw.visible = uwVis;
      if (!_box.isEmpty()) {
        boatBoxRel.copy(_box);
        boatBoxRel.min.sub(boatRoot.position); boatBoxRel.max.sub(boatRoot.position);
        // tirant d'eau mesuré (hors heave/lift) : en showroom, la quille repose sur le sol miroir
        keelDepth = Math.max(0, -boatBoxRel.min.y);
        boatBoxRel.min.y = Math.max(boatBoxRel.min.y, -1.5); // la carène immergée ne projette rien de visible
        if (prof.shadowTop) boatBoxRel.max.y = Math.min(boatBoxRel.max.y, prof.shadowTop);
        boatBoxRel.expandByScalar(0.25); // roulis / tangage
      }
    }
    if (boatBoxRel.isEmpty()) return;
    sun.updateMatrixWorld();
    sc.position.copy(sun.position);
    sc.lookAt(sun.target.position);
    sc.updateMatrixWorld();
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let i = 0; i < 8; i++) {
      _corner.set(i & 1 ? boatBoxRel.max.x : boatBoxRel.min.x, i & 2 ? boatBoxRel.max.y : boatBoxRel.min.y, i & 4 ? boatBoxRel.max.z : boatBoxRel.min.z)
        .add(boatRoot.position).applyMatrix4(sc.matrixWorldInverse);
      x0 = Math.min(x0, _corner.x); x1 = Math.max(x1, _corner.x);
      y0 = Math.min(y0, _corner.y); y1 = Math.max(y1, _corner.y);
      z0 = Math.min(z0, _corner.z); z1 = Math.max(z1, _corner.z);
    }
    // texels « accrochés » à la grille pour éviter le scintillement des bords d'ombre
    const tx = (x1 - x0) / sun.shadow.mapSize.x, ty = (y1 - y0) / sun.shadow.mapSize.y;
    sc.left = Math.floor(x0 / tx) * tx; sc.right = Math.ceil(x1 / tx) * tx;
    sc.bottom = Math.floor(y0 / ty) * ty; sc.top = Math.ceil(y1 / ty) * ty;
    sc.near = Math.max(0.1, -z1 - 1);
    sc.far = -z0 + 40; // récepteurs derrière (sol studio)
    sc.updateProjectionMatrix();
  }

  // --- Tenue à la mer : le bateau suit la MÊME houle que le shader d'océan (Gerstner, mêmes ondes/temps) ---
  // Hauteur d'eau échantillonnée sur une grille couvrant la flottaison (28 m × 7,7 m) : la moyenne filtre
  // naturellement les vagues courtes (un 29 m ne « sent » que la houle longue). Pilonnement, tangage et roulis
  // = moyenne et pentes (moindres carrés) de cette surface, puis réponse dynamique du 2e ordre par degré de
  // liberté (périodes propres d'un yacht de 29 m, roulis peu amorti) : retard, inertie et léger balancement résiduel.
  // (points, périodes et gains : prof.seaPts / prof.dof / prof.gain, voir HULL_PROFILES)
  let SEA_PTS = prof.seaPts, SEA_SXX = 1, SEA_SZZ = 1;
  function setSeaProfile() {
    SEA_PTS = prof.seaPts;
    SEA_SXX = SEA_PTS.reduce((s, p) => s + p[0] * p[0], 0);
    SEA_SZZ = SEA_PTS.reduce((s, p) => s + p[1] * p[1], 0);
    for (const k in DOF) { DOF[k].w0 = (2 * Math.PI) / prof.dof[k][0]; DOF[k].zeta = prof.dof[k][1]; }
    seaInit = false; // le nouveau bateau part de l'équilibre (pas de saut hérité de l'ancien)
  }
  function waterHeight(px, pz) {
    const W = oceanMat.uniforms.uWaves.value, amp = oceanMat.uniforms.uWaveAmp.value, t = time;
    // Gerstner : la surface en (px, pz) vient d'un point d'origine déplacé horizontalement -> 2 itérations de point fixe
    let ox = px, oz = pz;
    for (let it = 0; it < 2; it++) {
      let dx = 0, dz = 0;
      for (let i = 0; i < N_GERSTNER; i++) {
        const w = W[i], om = Math.sqrt(9.81 * w.z);
        const th = w.z * (w.x * ox + w.y * oz) - om * t + i * 1.7;
        const Q = Math.min(0.55 / (w.z * w.w * N_GERSTNER + 1e-4), 1);
        dx += Q * w.w * w.x * Math.cos(th); dz += Q * w.w * w.y * Math.cos(th);
      }
      ox = px - dx * amp; oz = pz - dz * amp;
    }
    let h = 0;
    for (let i = 0; i < N_GERSTNER; i++) {
      const w = W[i], om = Math.sqrt(9.81 * w.z);
      h += w.w * Math.sin(w.z * (w.x * ox + w.y * oz) - om * t + i * 1.7);
    }
    return h * amp;
  }
  // [position, vitesse] par degré de liberté ; pulsation propre w0 et amortissement réduit zeta
  const DOF = {
    heave: { w0: (2 * Math.PI) / 4.4, zeta: 0.38, x: 0, v: 0 },
    pitch: { w0: (2 * Math.PI) / 3.9, zeta: 0.42, x: 0, v: 0 },
    roll:  { w0: (2 * Math.PI) / 6.2, zeta: 0.13, x: 0, v: 0 },
    yaw:   { w0: (2 * Math.PI) / 14, zeta: 0.6, x: 0, v: 0 },
  };
  let seaInit = false;
  setSeaProfile();
  function seaTargets() {
    const bx = boatBase.x, bz = boatBase.z;
    let sh = 0, sxh = 0, szh = 0;
    for (const [x, z] of SEA_PTS) {
      const h = waterHeight(bx + x, bz + z);
      sh += h; sxh += x * h; szh += z * h;
    }
    const n = SEA_PTS.length;
    const sx = sxh / SEA_SXX, sz = szh / SEA_SZZ;      // pentes de la surface moyenne
    return {
      heave: sh / n,
      pitch: Math.atan(sx) * prof.gain.pitch,          // proue qui monte quand l'eau est plus haute à l'avant
      roll: -Math.atan(sz) * prof.gain.roll,           // tribord (+z) qui monte quand l'eau y est plus haute
      yaw: Math.atan(sz) * prof.gain.yaw,              // embardée minime induite par le roulis
    };
  }
  function stepSea(dt) {
    const tg = seaTargets();
    if (!seaInit) { for (const k in DOF) { DOF[k].x = tg[k]; DOF[k].v = 0; } seaInit = true; return; }
    const n = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = Math.min(dt, 0.25) / n;
    for (const k in DOF) {
      const d = DOF[k];
      for (let i = 0; i < n; i++) { // Euler semi-implicite (stable)
        d.v += (d.w0 * d.w0 * (tg[k] - d.x) - 2 * d.zeta * d.w0 * d.v) * h;
        d.x += d.v * h;
      }
    }
  }

  function updateBoat(dt) {
    if (!boatRoot) return;
    const sea = 1 - easeInOutCubic(settingK);
    stepSea(dt);
    const roll = DOF.roll.x * sea, pitch = DOF.pitch.x * sea, heave = DOF.heave.x * sea, yaw = DOF.yaw.x * sea;
    // showroom : coque posée sur le sol (quille à y≈0), plus de bateau « coupé » flottant au-dessus du miroir
    boatRoot.position.set(boatBase.x, boatBase.y + heave + (keelDepth > 0.05 ? keelDepth + STUDIO_LIFT : 1.2) * easeInOutCubic(settingK), boatBase.z);
    boatRoot.rotation.set(roll, yaw, pitch, 'YXZ');
    const parts = boatApi && boatApi.parts;
    if (parts && parts.radar) parts.radar.rotation.y += dt * 0.6;
    if (parts && parts.underwaterLights) parts.underwaterLights.visible = amb.night > 0.5 && settingK < 0.5;
  }

  function tick() {
    const dtRaw = capDt != null ? capDt : clock.getDelta();
    const dt = Math.min(dtRaw, 0.1);
    time += dt;

    // ambiance
    if (ambT < 1) {
      ambT = Math.min(1, ambT + dt / ambDur);
      lerpAmbState(amb, ambFrom, ambTo, easeInOutCubic(ambT));
      envDirty = true;
    }
    // décor
    if (settingK !== settingTarget) {
      const s = dt / 1.2;
      settingK = settingTarget > settingK ? Math.min(settingTarget, settingK + s) : Math.max(settingTarget, settingK - s);
    }
    { const tgtK = cap ? (cap.interior ? 1 : 0) : (currentView && currentView.interior && !flight ? 1 : 0); interiorK += (tgtK - interiorK) * Math.min(1, dt * 3); }
    applyAmbiance();
    applySetting();
    skyUniforms.uTime.value = time;

    // environnement PMREM : régénéré pendant les transitions (1 frame sur 4) et à la fin
    if (envDirty) {
      envFrameCounter++;
      if (ambT >= 1 || envFrameCounter % 4 === 0 || !envRT) {
        regenEnv();
        if (ambT >= 1) envDirty = false;
      }
    }

    updateBoat(dt);

    // océan centré caméra, données bateau
    ocean.position.set(camera.position.x, 0, camera.position.z);
    const bx = boatRoot ? boatRoot.position.x : 0, bz = boatRoot ? boatRoot.position.z : 0;
    oceanMat.uniforms.uBoat.value.set(bx, bz, boatRoot ? 1 : 0);
    const glowOn = amb.night * (1 - settingK);
    oceanMat.uniforms.uGlow.value = glowOn;
    oceanMat.uniforms.uSpill.value = glowOn;
    updateNavLights(glowOn);
    if (boatRoot && glowOn > 0.001) {
      boatRoot.updateMatrixWorld();
      oceanMat.uniforms.uGlowCount.value = glowLocal.length;
      glowLocal.forEach((lp, i) => oceanMat.uniforms.uGlowPos.value[i].copy(lp).applyMatrix4(boatRoot.matrixWorld));
    }
    contact.position.x = bx; contact.position.z = bz;
    halo.position.x = bx; halo.position.z = bz;

    // soleil / ombre suivent le bateau
    tmpV.set(bx, 1.2, bz);
    sun.target.position.copy(tmpV);
    sun.position.copy(tmpV).addScaledVector(amb.sunDir, 70);
    // éviter une lumière rasante sous l'horizon
    if (sun.position.y < tmpV.y + 6) sun.position.y = tmpV.y + 6;
    fitShadow();

    // caméra
    if (cap) {
      camera.position.fromArray(cap.pos); controls.target.fromArray(cap.tgt);
      camera.fov = cap.fov || BASE_FOV; camera.near = cap.interior ? 0.03 : 0.25; camera.updateProjectionMatrix();
      camera.up.set(0, 1, 0); camera.lookAt(controls.target);
      if (cap.roll) camera.rotateZ(cap.roll);
    } else if (flight) stepFlight(dt);
    else controls.update();
    // vues « plan » (dessus, coupe) : recentrage hors du panneau de droite s'il recouvre le canvas
    // (décalage de projection = moitié du recouvrement mesuré ; 0 quand le panneau est à côté du canvas)
    {
      const cw = container.clientWidth || 1, ch = container.clientHeight || 1;
      let tgtShift = 0;
      if (currentView && currentView.panelShift && !flight) {
        if ((panelCheck++ % 30) === 0) {
          const pe = document.querySelector('aside.panel');
          const cr = canvas.getBoundingClientRect();
          panelOverlap = 0;
          if (pe) { const pr = pe.getBoundingClientRect(); if (pr.width > 0 && pr.height > 0) panelOverlap = Math.max(0, cr.right - Math.max(pr.left, cr.left)); }
          if (panelOverlap > cw * 0.6) panelOverlap = 0; // tiroir plein écran (mobile) : ignorer
        }
        tgtShift = panelOverlap * 0.5;
      }
      viewShift += (tgtShift - viewShift) * Math.min(1, dt * 4);
      if (Math.abs(viewShift) > 0.5) camera.setViewOffset(cw, ch, viewShift, 0, cw, ch);
      else if (camera.view && camera.view.enabled) camera.clearViewOffset();
    }
    // garde-fou : jamais sous l'eau / le sol
    const minY = (currentView && currentView.interior) ? 0.4 : (settingK > 0.5 ? 0.4 : 0.8);
    if (camera.position.y < minY) camera.position.y = minY;
    skyDome.position.copy(camera.position);

    // coupe
    updateSection(dt);
    if (cutFade) {
      cutFade.t = Math.min(1, cutFade.t + dt / 0.7);
      applyCutOpacity(THREE.MathUtils.lerp(cutFade.from, cutFade.to, easeInOutCubic(cutFade.t)));
      if (cutFade.t >= 1) endCutFade();
    }

    for (const cb of frameCbs) { try { cb(dt, time); } catch (e) { console.error(e); } }

    render();

    // pixel ratio adaptatif (si < ~40 fps de façon soutenue)
    if (!capSize && document.visibilityState === 'visible' && dtRaw < 0.25) {
      perfWarm += dtRaw;
      if (perfWarm > 3) {
        perfAcc += dtRaw; perfN++;
        if (perfN >= 120) {
          const avg = perfAcc / perfN;
          perfSlow = avg > 1 / 40 ? perfSlow + 1 : 0;
          if (perfSlow >= 2) {
            perfSlow = 0;
            if (pixelRatio > 1.5) { pixelRatio = 1.5; resize(); }
            else if (postFX) { postFX = false; }
            else if (pixelRatio > 1) { pixelRatio = Math.max(1, pixelRatio - 0.25); resize(); }
          }
          perfAcc = 0; perfN = 0;
        }
      }
    }
  }

  // init
  resize();
  applyAmbiance();
  applySetting();
  regenEnv();
  renderer.setAnimationLoop(tick);

  function dispose() {
    renderer.setAnimationLoop(null);
    ro.disconnect();
    controls.dispose();
    pmrem.dispose();
    reflRT.dispose(); maskRT.dispose(); if (composerRT) composerRT.dispose();
    if (envRT) envRT.dispose();
    renderer.dispose();
    canvas.remove();
  }

  return {
    scene, camera, renderer, controls,
    get VIEWS() { return views; },
    get hullProfile() { return profId; },
    add,
    setAmbiance,
    setSetting,
    flyTo,
    setAutoRotate,
    setCutaway,
    projectHotspots,
    onFrame,
    screenshot,
    setBoat,
    setPostFX,
    // extras (hors contrat, optionnels)
    get ambiance() { return ambianceId; },
    get setting() { return settingId; },
    get currentView() { return currentViewId; },
    get cutaway() { return cutawayOn; },
    // diagnostic rendu (mesures de perf / réglages en console)
    get _debug() { return { composer, gtaoPass, bloomPass, sun, oceanMat, render, regenEnv, tick }; },
    // capture vidéo : captureBegin(1080, 1920) puis captureFrame({ pos, tgt, fov, roll, interior, view, dt }) par image
    captureBegin(w, h) {
      renderer.setAnimationLoop(null); flight = null;
      capSize = { w, h }; pixelRatio = 1; resize();
    },
    captureFrame(o) {
      cap = o; capDt = o.dt != null ? o.dt : 1 / 30;
      const id = o.view || (o.interior ? 'salon' : 'exterior');
      currentViewId = id;
      currentView = Object.assign({}, views[id] || {}, { panelShift: false, interior: !!o.interior });
      tick();
      return canvas;
    },
    captureEnd() { cap = null; capDt = null; capSize = null; resize(); renderer.setAnimationLoop(tick); },
    dispose,
  };
}
