# DIÈDRE 29 — Configurateur 3D (contrat d'équipe)

Configurateur web 3D du yacht électrique **DIÈDRE 29** dessiné par **NEOCHROME**.
Référence de qualité : configurateurs de chantiers type « Jackky M Studio » (bateau 3D flottant au
centre, panneau de matériaux à droite, chips de vues en bas, hotspots cliquables, vue en coupe intérieure,
partage / comparaison). On veut faire **mieux** : rendu plus luxueux, transitions caméra fluides,
ambiances lumineuses, récapitulatif imprimable.

## Stack (obligatoire)
- Pur ES modules, **aucun build**. `index.html` déclare un importmap :
  ```html
  <script type="importmap">{"imports":{
    "three":"https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js",
    "three/addons/":"https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/"}}</script>
  ```
- **Aucune texture / fichier externe** hormis three.js depuis jsdelivr et Google Fonts. Toute texture
  (teck, eau, normal maps, nom de coque) est générée en **canvas / procédural**.
- Servi en http (pas file://). Test : `python3 -m http.server 8429` dans le dossier.
- Langue de l'interface : **français**.

## Fichiers et propriétaires
| Fichier | Propriétaire |
|---|---|
| `js/options.js` | lead (déjà écrit — catalogue des options, NE PAS modifier les ids) |
| `js/boat.js` | agent MODÈLE 3D |
| `js/stage.js` | agent SCÈNE / RENDU |
| `index.html`, `css/style.css`, `js/ui.js` | agent UI |
| `js/main.js` | lead (colle tout) |
| `assets/*.jpg` | rendus officiels du PDF (galerie) |

## Le bateau (source : dossier PDF NEOCHROME)
- Longueur hors tout **28,8 m**, largeur max au pont **≈ 7,5 m**, largeur à la poupe **≈ 6,4 m**.
- Pont arrière profond de **≈ 3,1 m**, deux « ailes » arrière de **≈ 2,0 m** de large chacune, escalier
  central (5 marches) qui descend entre les ailes vers une **plateforme de bain** de **≈ 1,2 m**.
- Coque **anthracite satinée**, étrave **verticale**, bouchains **marqués**, flancs facettés (le nom
  « diedre » = dièdre : volumes facettés, arêtes vives, low-poly élégant, PAS de courbes molles).
- **Bandeau ton titane fumé / bronze** (liston métallique) qui court le long du livet et souligne la
  verrière basse à facettes.
- Superstructure basse, facettée, toit plat légèrement bombé, grandes vitres fumées (4 panneaux par bord
  + pare-brise en 3 pans), pavillon prolongé vers l'arrière au-dessus du pont arrière.
- Sur le toit (arrière) : un arceau/barre noire avec **2 radômes** sphériques noirs, **2 antennes fouet**
  verticales et une petite caméra.
- Plage avant longue en **teck** avec 4 hublots/panneaux de pont noirs (2×2), 4 taquets noirs (2 avant,
  2 arrière).
- Intérieur (salon / pilotage) : 2 méridiennes en **cuir bleu nuit** face à face, table basse
  centrale en **noyer** (plateau sombre cerclé de bois), crédences en noyer sous les vitres, plafond
  clair avec rubans LED ambrés, sol gris foncé. À tribord avant : 2 sièges pilote face à 3 écrans.
  Baie vitrée coulissante vers le pont arrière.
- Pont arrière : coin repas pour 4 à **tribord** (table bois + 4 chaises), banquette en L à **bâbord**,
  coussins **ivoire**, passage central vers l'escalier.
- Propulsion électrique (pas de cheminée, pas d'échappement).

## Repère 3D (commun à tous)
- Unités = **mètres**. Axe **+X = avant (étrave)**, −X = arrière. **+Y = haut**. **+Z = tribord**,
  −Z = bâbord. Ligne de flottaison **y = 0**. Bateau centré en x (x ∈ [−14.4, +14.4]).
- Livet (bord du pont) ≈ y = 1.9. Pont teck ≈ y = 1.75. Toit superstructure ≈ y = 4.3.
  Fond de coque ≈ y = −1.1. Plateforme de bain ≈ y = 0.35, x ∈ [−14.4, −13.2].
- Superstructure ≈ x ∈ [−10.8, +2.4]. Pont arrière x ∈ [−13.2, −10.8] (+ escalier).

## API `js/boat.js`
```js
import * as THREE from 'three';
export function buildBoat() // -> BoatAPI
BoatAPI = {
  root: THREE.Group,             // tout le bateau, origine = centre à la flottaison
  materials: {                   // TOUS MeshPhysicalMaterial (sauf mention) partagés par les meshes
    hull,            // flancs de coque (couleur option "hull")
    hullBottom,      // œuvres vives (sous flottaison) — gardé sombre
    accent,          // bandeau titane + entourages verrière + rebords poupe
    superstructure,  // parois de la superstructure (même teinte que hull par défaut, géré via hull)
    glass,           // vitrages (transmission/opacité gérées ici)
    deck,            // teck (map canvas procédurale) — color appliquée en teinte
    upholsteryInterior, // cuir des méridiennes
    upholsteryExterior, // coussins extérieurs
    woodInterior,    // noyer intérieur (map procédurale)
    interiorFloor, ceiling, metalDark /* taquets, radômes, arceau */, screens /* emissive */,
    ledStrip         // MeshBasicMaterial ou emissive : rubans LED d'ambiance (couleur option)
  },
  parts: {
    roof,          // Object3D : toit + bandeau haut, à masquer pour la vue en coupe
    upperGlass,    // Object3D optionnel : vitrages à masquer aussi en coupe (peut être null)
    interior,      // Group : tout l'intérieur
    underwaterLights, // Group : spots sous-marins (meshes emissive) à allumer la nuit
    radar,         // Object3D qui peut tourner doucement (radômes peuvent rester fixes)
  },
  hotspots: [ { id, label, text, position: THREE.Vector3 /* coord locales root */, view: 'idDeVue' } ],
  setName(str),   // redessine le nom (texture canvas) sur les DEUX flancs, avant ; défaut "DIÈDRE 29"
  setLedColor(hex|null), // null = éteint
}
```
Hotspots attendus (ids) : `bow` (plage avant teck), `glazing` (verrière facettée), `salon` (salon),
`helm` (poste de pilotage), `aftdeck` (pont arrière), `stairs` (escalier + plateforme de bain),
`radar` (mât / radômes), `hull` (coque / étrave verticale).

## API `js/stage.js`
```js
import * as THREE from 'three';
export function createStage(containerEl) // -> StageAPI
StageAPI = {
  scene, camera, renderer, controls,   // OrbitControls
  add(object3D),                        // ajoute le bateau
  setAmbiance(id),     // 'overcast' | 'sunset' | 'night' | 'studio'   (voir options.ambiance)
  setSetting(id),      // 'sea' | 'studio'  — mer animée vs sol studio réfléchissant / fond uni
  flyTo(viewId, {duration=1.6}) , // transition caméra easée vers une vue nommée (voir VIEWS)
  VIEWS,               // { id: {label, pos:[x,y,z], target:[x,y,z]} }
  setAutoRotate(bool),
  setCutaway(bool, boatApi), // masque boat.parts.roof (+upperGlass) avec fondu ; la caméra plonge en vue 3/4 haute
  projectHotspots(hotspots, boatRoot) // -> [{id, x, y, visible}] en pixels CSS du container (occlusion simple : derrière la caméra = invisible)
  onFrame(cb),          // cb(dt, t) chaque frame
  screenshot(),         // -> dataURL PNG (preserveDrawingBuffer ou rendu forcé)
  setBoat(boatApi),     // pour animer : léger tangage/roulis sur l'eau, rotation radar, spots la nuit
}
```
Vues (ids) : `exterior` (3/4 avant bâbord, défaut), `profile` (profil bâbord), `bow` (étrave),
`stern` (poupe / escalier), `top` (vue de dessus), `salon` (dans le salon regardant vers l'arrière, comme
le rendu), `aftdeck` (pont arrière), `helm` (poste de pilotage), `cutaway` (3/4 haute pour coupe).

## API `js/ui.js`
```js
export function initUI({ options, state, onChange, onView, onAction }) // -> UIAPI
// options = import * from './options.js'
// state = { hull:'anthracite', hullFinish:'satin', accent:'titane', ... } (ids)
// onChange(key, valueId|string)  -> main applique au 3D
// onView(viewId)
// onAction(name, payload) name ∈ 'share'|'screenshot'|'compare-add'|'reset'|'cutaway'|'autorotate'|'summary'|'gallery'|'quote'
UIAPI = {
  setState(state),               // resynchronise toute l'UI
  setActiveView(viewId),
  renderHotspots(list),          // list = [{id,x,y,visible,label,text,view}] -> pastilles DOM positionnées
  toast(msg),
  setLoading(progress0to1|false),
  getViewportEl()                // conteneur où stage met son canvas
}
```

## `js/options.js`
Voir le fichier : `GROUPS` (sections du panneau, dans l'ordre), chaque groupe a `key`, `title`,
`type` ('material-grid' | 'swatches' | 'chips' | 'text'), `items` [{id,label,sub,swatch, ...props 3D}].
`DEFAULT_STATE`. `MODEL` (fiche technique).
