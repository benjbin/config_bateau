// Catalogue des options du configurateur DIÈDRE 29 — NEOCHROME
// Les ids sont le contrat entre UI (ui.js), application 3D (main.js) et URL de partage.
// swatch : CSS background de la pastille. Les autres props sont appliquées au matériau 3D.

// Modèles du configurateur : clé d'état `model` (URL #model=cat29 ; défaut d29, absent de l'URL).
// code : préfixe du code de configuration ; length : affiché après la tagline ; type : sous-titre du sélecteur.
export const MODEL = {
  id: 'd29',
  code: 'D29',
  type: 'Monocoque',
  length: '28,8 m',
  name: 'DIÈDRE 29',
  studio: 'NEOKROME',
  tagline: 'Concept de yacht électrique',
  specs: [
    ['Longueur hors tout', '28,8 m'],
    ['Largeur maximale au pont', '≈ 7,5 m'],
    ['Largeur à la poupe', '≈ 6,4 m'],
    ['Profondeur du pont arrière', '≈ 3,1 m'],
    ['Largeur de chaque aile arrière', '≈ 2,0 m'],
    ['Profondeur de la plateforme de bain', '≈ 1,2 m'],
    ['Propulsion', 'Électrique nouvelle génération'],
  ],
  pending: 'Puissance, batteries, vitesse, autonomie, recharge, déplacement et tirant d’eau : à préciser en avant-projet.',
};

export const MODELS = {
  d29: MODEL,
  cat29: {
    id: 'cat29',
    code: 'S29',
    type: 'Catamaran à voile',
    length: '28,7 m',
    name: 'SILLAGE 29',
    studio: 'NEOKROME',
    tagline: 'Super-catamaran à voile électrique',
    sails: true, // bouton « Voiles » (animation hissage / enroulement)
    specs: [
      ['Longueur hors tout', '28,7 m'],
      ['Largeur hors tout', '12,8 m'],
      ['Architecture', 'Catamaran à voile, deux coques à étrave verticale'],
      ['Gréement', 'Sloop, mât carbone (≈ 38 m), bôme à enrouleur, foc sur enrouleur'],
      ['Propulsion', 'Électrique, 2 pods (un par coque), hélices contrarotatives'],
      ['Énergie', 'Hardtop solaire du flybridge, panneaux intégrés'],
      ['Ponts', 'Salon de pont panoramique, flybridge avec poste de barre, bar et salon'],
      ['Extérieur', 'Cockpit abrité, lounge avant, plateforme de bain arrière, terrasses latérales rabattables'],
    ],
    pending: 'Surface de voile, puissance, batteries, surface solaire, vitesse, autonomie, déplacement et tirant d’eau : à préciser en avant-projet.',
  },

};
export const MODEL_IDS = Object.keys(MODELS);

export const GROUPS = [
  {
    key: 'hull', title: 'Coque', section: 'Extérieur', type: 'material-grid',
    items: [
      { id: 'anthracite', label: 'Anthracite', sub: 'Signature NEOKROME', color: '#2a2b2d', swatch: 'linear-gradient(135deg,#3a3b3e,#1e1f21)' },
      { id: 'abysse', label: 'Noir abysse', sub: 'Profond', color: '#0f1012', swatch: 'linear-gradient(135deg,#25262a,#08090a)' },
      { id: 'titane', label: 'Gris titane', sub: 'Minéral', color: '#5d5f62', swatch: 'linear-gradient(135deg,#7a7c80,#4a4c4f)' },
      { id: 'perle', label: 'Blanc perle', sub: 'Classique', color: '#d9d6cf', swatch: 'linear-gradient(135deg,#f1eee8,#c9c5bd)' },
      { id: 'nuit', label: 'Bleu nuit', sub: 'Marine', color: '#18233a', swatch: 'linear-gradient(135deg,#283656,#0f1626)' },
      { id: 'olive', label: 'Olive', sub: 'Expédition', color: '#3b3f30', swatch: 'linear-gradient(135deg,#545a44,#2b2e23)' },
      { id: 'bronze', label: 'Bronze sombre', sub: 'Métallisé', color: '#3d3128', metalness: 0.55, swatch: 'linear-gradient(135deg,#6a5544,#2c231d)' },
      { id: 'sable', label: 'Sable', sub: 'Lumineux', color: '#b9ab94', swatch: 'linear-gradient(135deg,#d4c7b1,#a39580)' },
    ],
  },
  {
    key: 'hullFinish', title: 'Finition de coque', section: 'Extérieur', type: 'chips',
    items: [
      { id: 'satin', label: 'Satinée', roughness: 0.42, clearcoat: 0.35, clearcoatRoughness: 0.35 },
      { id: 'gloss', label: 'Brillante', roughness: 0.18, clearcoat: 1.0, clearcoatRoughness: 0.05 },
      { id: 'matte', label: 'Mate', roughness: 0.78, clearcoat: 0.0, clearcoatRoughness: 0.8 },
    ],
  },
  {
    key: 'accent', title: 'Bandeau & verrière', section: 'Extérieur', type: 'swatches',
    items: [
      { id: 'titane', label: 'Titane fumé', color: '#8c7a68', metalness: 0.9, roughness: 0.32, swatch: 'linear-gradient(135deg,#b19c86,#6e5f51)' },
      { id: 'champagne', label: 'Champagne', color: '#c2a77f', metalness: 0.95, roughness: 0.28, swatch: 'linear-gradient(135deg,#e1caa2,#9c8461)' },
      { id: 'bronze', label: 'Bronze', color: '#7a5532', metalness: 0.95, roughness: 0.3, swatch: 'linear-gradient(135deg,#a8784c,#583c22)' },
      { id: 'rose', label: 'Or rose', color: '#b07a68', metalness: 0.95, roughness: 0.26, swatch: 'linear-gradient(135deg,#d6a08d,#8a5a4b)' },
      { id: 'acier', label: 'Acier brossé', color: '#a3a6aa', metalness: 1.0, roughness: 0.38, swatch: 'linear-gradient(135deg,#d0d3d6,#7d8084)' },
      { id: 'noir', label: 'Noir chromé', color: '#1c1c1e', metalness: 1.0, roughness: 0.22, swatch: 'linear-gradient(135deg,#3c3c40,#0c0c0d)' },
    ],
  },
  {
    key: 'glass', title: 'Vitrages', section: 'Extérieur', type: 'swatches',
    items: [
      { id: 'fume', label: 'Fumé', color: '#1d2329', opacity: 0.82, swatch: 'linear-gradient(135deg,#3a434c,#12161a)' },
      { id: 'bronze', label: 'Bronze', color: '#3a2a1c', opacity: 0.8, swatch: 'linear-gradient(135deg,#6b5139,#2a1d12)' },
      { id: 'miroir', label: 'Miroir', color: '#8d949b', opacity: 0.95, metalness: 0.9, swatch: 'linear-gradient(135deg,#dfe4e8,#6f767c)' },
      { id: 'bleu', label: 'Bleu acier', color: '#1d3141', opacity: 0.8, swatch: 'linear-gradient(135deg,#3b5b74,#122130)' },
    ],
  },
  {
    key: 'deck', title: 'Pont', section: 'Extérieur', type: 'material-grid',
    items: [
      { id: 'teck', label: 'Teck naturel', sub: 'Joints noirs', color: '#ffffff', tint: '#a8714a', swatch: 'repeating-linear-gradient(90deg,#9a6440 0 7px,#2a1d14 7px 8px)' },
      { id: 'teckGris', label: 'Teck vieilli', sub: 'Argenté', color: '#ffffff', tint: '#9a928a', swatch: 'repeating-linear-gradient(90deg,#9c958d 0 7px,#3b3835 7px 8px)' },
      { id: 'teckFonce', label: 'Teck fumé', sub: 'Profond', color: '#ffffff', tint: '#5e3b25', swatch: 'repeating-linear-gradient(90deg,#5a3824 0 7px,#160f0a 7px 8px)' },
      { id: 'liege', label: 'Composite sable', sub: 'Joints clairs', color: '#ffffff', tint: '#cbbd9f', swatch: 'repeating-linear-gradient(90deg,#d0c3a6 0 7px,#efe9dc 7px 8px)' },
    ],
  },
  {
    key: 'upholsteryInterior', title: 'Sellerie du salon', section: 'Intérieur', type: 'material-grid',
    items: [
      { id: 'bleuNuit', label: 'Cuir bleu nuit', sub: 'Surpiqûres sable', color: '#1b2536', swatch: 'linear-gradient(135deg,#2c3a52,#121a27)' },
      { id: 'cognac', label: 'Cuir cognac', sub: 'Pleine fleur', color: '#7a4424', swatch: 'linear-gradient(135deg,#9c5a33,#5a3019)' },
      { id: 'sable', label: 'Cuir sable', sub: 'Nubuck', color: '#bfae93', swatch: 'linear-gradient(135deg,#d6c7ae,#a3937a)' },
      { id: 'graphite', label: 'Cuir graphite', sub: 'Mat', color: '#2f3033', swatch: 'linear-gradient(135deg,#46474b,#1f2022)' },
      { id: 'ivoire', label: 'Cuir ivoire', sub: 'Lumineux', color: '#e3dccd', swatch: 'linear-gradient(135deg,#f3eee3,#cfc6b4)' },
      { id: 'vert', label: 'Cuir vert anglais', sub: 'Club', color: '#1f3328', swatch: 'linear-gradient(135deg,#2f4a3b,#14211a)' },
    ],
  },
  {
    key: 'woodInterior', title: 'Essence de bois', section: 'Intérieur', type: 'swatches',
    items: [
      { id: 'noyer', label: 'Noyer', tint: '#6b4128', swatch: 'linear-gradient(135deg,#83522f,#4d2c1a)' },
      { id: 'chene', label: 'Chêne fumé', tint: '#4a3a2c', swatch: 'linear-gradient(135deg,#5f4b39,#30251c)' },
      { id: 'teck', label: 'Teck', tint: '#94603a', swatch: 'linear-gradient(135deg,#b07548,#6e4528)' },
      { id: 'ebene', label: 'Ébène', tint: '#1e1814', swatch: 'linear-gradient(135deg,#352b24,#0f0c0a)' },
      { id: 'frene', label: 'Frêne blond', tint: '#c9ad86', swatch: 'linear-gradient(135deg,#dcc4a0,#a98c66)' },
    ],
  },
  {
    key: 'upholsteryExterior', title: 'Coussins extérieurs', section: 'Intérieur', type: 'swatches',
    items: [
      { id: 'ivoire', label: 'Ivoire', color: '#e6e0d3', swatch: '#e6e0d3' },
      { id: 'sable', label: 'Sable', color: '#c4b393', swatch: '#c4b393' },
      { id: 'gris', label: 'Gris perle', color: '#9b9c9a', swatch: '#9b9c9a' },
      { id: 'marine', label: 'Marine', color: '#1e2a3f', swatch: '#1e2a3f' },
      { id: 'anthracite', label: 'Anthracite', color: '#333436', swatch: '#333436' },
    ],
  },
  {
    key: 'ambientLight', title: 'Éclairage d’ambiance', section: 'Intérieur', type: 'swatches',
    items: [
      { id: 'ambre', label: 'Ambre', color: '#ffb86b', swatch: 'radial-gradient(circle,#ffd29c,#e08a2c)' },
      { id: 'blanc', label: 'Blanc pur', color: '#f2f5ff', swatch: 'radial-gradient(circle,#ffffff,#c8d0e0)' },
      { id: 'bleu', label: 'Bleu lagon', color: '#3fb7ff', swatch: 'radial-gradient(circle,#9ee0ff,#1f84c9)' },
      { id: 'off', label: 'Éteint', color: null, swatch: 'linear-gradient(135deg,#2a2a2a,#111)' },
    ],
  },
  {
    key: 'boatName', title: 'Nom du yacht', section: 'Personnalisation', type: 'text', maxLength: 18,
    placeholder: 'DIÈDRE 29',
  },
  {
    key: 'ambiance', title: 'Ambiance', section: 'Scène', type: 'chips',
    items: [
      { id: 'overcast', label: 'Ciel couvert' },
      { id: 'sunset', label: 'Coucher de soleil' },
      { id: 'night', label: 'Nuit' },
      { id: 'studio', label: 'Studio' },
    ],
  },
  {
    key: 'setting', title: 'Décor', section: 'Scène', type: 'chips',
    items: [
      { id: 'sea', label: 'En mer' },
      { id: 'studio', label: 'Showroom' },
    ],
  },
];

export const VIEW_CHIPS = [
  { id: 'exterior', label: '360°' },
  { id: 'profile', label: 'Profil' },
  { id: 'bow', label: 'Étrave' },
  { id: 'stern', label: 'Poupe' },
  { id: 'top', label: 'Dessus' },
  { id: 'aftdeck', label: 'Pont arrière' },
  { id: 'salon', label: 'Salon' },
  { id: 'helm', label: 'Pilotage' },
];

export const DEFAULT_STATE = {
  model: 'd29',
  hull: 'anthracite',
  hullFinish: 'satin',
  accent: 'titane',
  glass: 'fume',
  deck: 'teck',
  upholsteryInterior: 'bleuNuit',
  woodInterior: 'noyer',
  upholsteryExterior: 'ivoire',
  ambientLight: 'ambre',
  boatName: 'DIÈDRE 29',
  ambiance: 'overcast',
  setting: 'sea',
};

// libellés de vues propres à un modèle (mêmes ids : profils de caméra de stage.js)
export const VIEW_LABELS = { cat29: { aftdeck: 'Cockpit' } };
export function viewChipsFor(model) {
  const o = VIEW_LABELS[model] || {};
  return VIEW_CHIPS.map((c) => ({ ...c, label: o[c.id] || c.label }));
}

// valeurs par défaut d'un modèle (nom de coque = nom du modèle)
export function defaultsFor(model) {
  const m = MODELS[model] ? model : 'd29';
  return { ...DEFAULT_STATE, model: m, boatName: MODELS[m].name };
}

export const GALLERY = [
  { src: 'assets/render-profile.jpg', label: 'Profil bâbord' },
  { src: 'assets/render-bow.jpg', label: 'Rendu officiel' },
  { src: 'assets/render-stern.jpg', label: 'Rendu officiel' },
  { src: 'assets/render-salon.jpg', label: 'Salon et poste de pilotage' },
  { src: 'assets/render-salon2.jpg', label: 'Salon et pont arrière' },
];

// rendus officiels par modèle (le catamaran n'en a pas encore : bouton « Galerie » masqué)
export const GALLERIES = { d29: GALLERY, cat29: [] };

export function findItem(key, id) {
  if (key === 'model') return MODELS[id] || null;
  const g = GROUPS.find((x) => x.key === key);
  return g && g.items ? g.items.find((i) => i.id === id) : null;
}
