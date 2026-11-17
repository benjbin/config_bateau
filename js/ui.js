// DIÈDRE 29 — Interface du configurateur (NEOKROME)
// Direction artistique : site officiel NEOKROME (papier / encre #0B214A / bleu #145CFF, Outfit + Manrope).
// -----------------------------------------------------------------------------
// API FINALE
//
//   import { initUI } from './ui.js';
//   const ui = initUI({ options, state, onChange, onView, onAction });
//
//   options   = import * as options from './options.js'
//               (utilise GROUPS, VIEW_CHIPS, DEFAULT_STATE, MODEL, GALLERY)
//   state     = { hull:'anthracite', ... , boatName:'DIÈDRE 29' }   (ids d'options)
//   onChange(key, valueId|string)      choix d'une option (boatName : debounce 250 ms)
//   onView(viewId)                      chips de vues + bouton « Voir » des hotspots
//   onAction(name, payload)             actions émises :
//       'share'                         bouton « Partager » (barre haute)
//       'screenshot'                    outil « Capture »
//       'compare-add'                   outil « Comparer »  -> main appelle ui.addToCompare(...)
//       'reset'                         outil « Réinitialiser »
//       'cutaway', bool                 outil « Vue en coupe » (toggle)
//       'autorotate', bool              outil « Rotation auto » (toggle)
//       'summary'                       « Récapitulatif & devis » / « Fiche technique »
//                                       -> main appelle ui.openSummary(...)
//       'gallery'                       « Galerie » (l'UI ouvre elle-même la galerie juste après)
//       'load-config', state            bouton « Charger » d'une carte de comparaison
//
//   UIAPI = {
//     setState(state)                   resynchronise toute l'UI (n'émet pas onChange)
//     setActiveView(viewId)             chip active ; 'cutaway' => bouton « Vue en coupe » enfoncé
//     renderHotspots(list)              list = [{id,x,y,visible,label,text,view}] (px CSS du viewport)
//                                       à appeler à chaque frame : nœuds réutilisés, transform only
//     toast(msg)
//     setLoading(progress0to1 | false)  écran de chargement (#loader) ; false = fondu de sortie
//     getViewportEl()                   -> #stage (conteneur du canvas three.js)
//     openSummary({ state, imageDataURL, shareURL? })   modal récapitulatif imprimable
//     addToCompare({ state, imageDataURL })             tiroir comparaison (max 3)
//     openGallery(index = 0)                             galerie des rendus officiels
//     configCode(state)                 -> 'D29-XXXX-XXXX-XXX' (code lisible ; préfixe S29 pour le catamaran)
//     setModelBusy(progress0to1 | false) indicateur de chargement d'un modèle (GLB paresseux)
//   }
//   Modèles (options.MODELS) : sélecteur en tête du panneau -> onChange('model', id) ; titres, tagline, fiche
//   technique, code, récapitulatif et comparaison suivent state.model.
//
// Ids DOM : #app, #loader, #topbar, #viewport, #stage, #hotspots, #hotspot-bubble, #viewbar,
//           #view-chips, #tools, #compare-drawer, #panel, #panel-body, #btn-summary, #toast,
//           #modal-summary, #modal-gallery, #field-boatName
// -----------------------------------------------------------------------------

const ICONS = {
  share: '<path d="M12 3v12M7.5 7.5 12 3l4.5 4.5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"/>',
  cut: '<path d="M3 9.5 12 4l9 5.5v5L12 20l-9-5.5z"/><path d="M3 9.5 12 15l9-5.5" stroke-dasharray="2 2.2"/>',
  rotate: '<path d="M20 12a8 8 0 1 1-2.3-5.6"/><path d="M20 4v4.5h-4.5"/>',
  camera: '<path d="M4 8h3l1.5-2.5h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z"/><circle cx="12" cy="13" r="3.5"/>',
  compare: '<rect x="3" y="5" width="7.5" height="14" rx="1.2"/><rect x="13.5" y="5" width="7.5" height="14" rx="1.2"/>',
  reset: '<path d="M4 12a8 8 0 1 0 2.3-5.6"/><path d="M4 4v4.5h4.5"/>',
  pin: '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="8"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  left: '<path d="m15 5-7 7 7 7"/>',
  right: '<path d="m9 5 7 7-7 7"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  print: '<path d="M7 9V3h10v6M7 17H4v-7h16v7h-3"/><rect x="7" y="14" width="10" height="7"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  images: '<rect x="3" y="5" width="18" height="14" rx="1.5"/><path d="m3 16 5-5 4 4 3-3 6 6"/><circle cx="16" cy="9" r="1.5"/>',
  doc: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
};
const icon = (name, cls = 'ico') =>
  `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;

// orthographe de la marque : toujours NEOKROME (filet de sécurité sur les textes du catalogue)
const brandFix = (s) => String(s ?? '').replace(/NEOCHROME/g, 'NEOKROME').replace(/Neochrome/g, 'Neokrome');
const LOGO = `<span class="logo" role="img" aria-label="NEOKROME tech"><svg viewBox="0 0 220 230" aria-hidden="true" focusable="false"><polygon class="mk-panel" points="0,42 99,112 99,229 0,172"/><polygon class="mk-panel" points="140,122 219,72 219,172 140,229"/><polygon class="mk-lid" points="78,45 204,1 205,69 139,100"/></svg><span class="wm" aria-hidden="true"><b>NEO<i class="k">K</i>ROME</b><small><i class="td"></i>tech</small></span></span>`;
const ARR = '<span class="arr" aria-hidden="true">→</span>';
const esc = (s) => brandFix(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* stockage indisponible */ } },
};

export function initUI({ options, state: initialState, onChange = () => {}, onView = () => {}, onAction = () => {} }) {
  const { GROUPS, VIEW_CHIPS = [], DEFAULT_STATE = {}, MODEL = {}, GALLERY = [] } = options;
  const MODELS = options.MODELS || { [MODEL.id || 'd29']: MODEL };
  const chipsFor = options.viewChipsFor || (() => VIEW_CHIPS);
  const galleryFor = (id) => (options.GALLERIES && options.GALLERIES[id]) || (id === (MODEL.id || 'd29') ? GALLERY : []);
  let state = { ...DEFAULT_STATE, ...initialState };
  const modelOf = (s) => MODELS[s && s.model] || MODEL;
  let curModel = modelOf(state);
  let modelName = curModel.name || 'DIÈDRE 29';
  const studio = brandFix(MODEL.studio || 'NEOKROME');
  const lengthTxt = (m) => (m.length ? ' · ' + m.length : '');

  const groupByKey = new Map(GROUPS.map((g) => [g.key, g]));
  const itemOf = (key, id) => groupByKey.get(key)?.items?.find((i) => i.id === id) || null;
  const labelOf = (key, id) => (key === 'boatName' ? (id || '').trim() || modelName : itemOf(key, id)?.label ?? '—');
  const sections = [];
  for (const g of GROUPS) {
    let s = sections.find((x) => x.name === (g.section || 'Options'));
    if (!s) sections.push((s = { name: g.section || 'Options', id: 'sec-' + slug(g.section || 'options'), groups: [] }));
    s.groups.push(g);
  }

  function configCode(s) {
    let c = '';
    for (const g of GROUPS) {
      if (!g.items) continue;
      const i = Math.max(0, g.items.findIndex((it) => it.id === s[g.key]));
      c += i.toString(36).toUpperCase();
    }
    return ((modelOf(s).code || 'D29') + '-' + c.slice(0, 4) + '-' + c.slice(4, 8) + (c.length > 8 ? '-' + c.slice(8) : '')).replace(/-$/, '');
  }

  // ---------------------------------------------------------------- squelette
  let app = document.getElementById('app');
  if (!app) { app = document.createElement('div'); app.id = 'app'; app.className = 'app'; document.body.appendChild(app); }

  app.innerHTML = `
    <a class="skip" href="#panel">Aller aux options</a>
    <header class="topbar glass" id="topbar">
      <div class="brand">
        ${LOGO}
        <span class="brand__sep" aria-hidden="true"></span>
        <span class="brand__model"><b class="brand__name">${esc(modelName)}</b><small>Configurateur</small></span>
      </div>
      <nav class="topnav" aria-label="Navigation principale">
        <button type="button" class="topnav__link" data-act="gallery">${icon('images')}<span>Galerie</span></button>
        <button type="button" class="topnav__link" data-act="specs">${icon('doc')}<span>Fiche technique</span></button>
        <button type="button" class="topnav__link" data-act="compare-open" aria-controls="compare-drawer" aria-expanded="false">${icon('compare')}<span>Comparaison</span><span class="badge" hidden>0</span></button>
      </nav>
      <div class="topbar__actions">
        <div class="seg" role="group" aria-label="Thème de l’interface">
          <button type="button" class="seg__btn" data-theme-set="light" aria-pressed="true" title="Thème clair">${icon('sun')}<span>Lumière</span></button>
          <button type="button" class="seg__btn" data-theme-set="dark" aria-pressed="false" title="Thème sombre">${icon('moon')}<span>Sombre</span></button>
        </div>
        <button type="button" class="btn btn--share" data-act="share">${icon('share')}<span>Partager</span></button>
      </div>
    </header>

    <main class="layout">
      <section class="viewport" id="viewport" aria-label="Vue 3D du ${esc(modelName)}">
        <div class="stage" id="stage"></div>
        <div class="scrim scrim--top" aria-hidden="true"></div>
        <div class="scrim scrim--bottom" aria-hidden="true"></div>

        <header class="vhead">
          <p class="vhead__eyebrow eyebrow">${esc(studio)} · Étude de concept</p>
          <h1 class="vhead__title">${esc(modelName)}<span class="b">.</span></h1>
          <p class="vhead__tagline">${esc(curModel.tagline || 'Concept de yacht électrique')}${esc(lengthTxt(curModel))}</p>
          <p class="vhead__name" hidden></p>
        </header>

        <div class="hotspots" id="hotspots" aria-label="Points d’intérêt">
          <div class="bubble glass" id="hotspot-bubble" role="dialog" aria-modal="false" aria-labelledby="bubble-title" hidden>
            <button type="button" class="bubble__close" aria-label="Fermer">${icon('close')}</button>
            <p class="bubble__num"></p>
            <h3 class="bubble__title" id="bubble-title"></h3>
            <p class="bubble__text"></p>
            <button type="button" class="btn bubble__go"><span>Voir</span>${ARR}</button>
          </div>
        </div>

        <p class="vhint" aria-hidden="true">Glisser pour pivoter · Molette ou pincer pour zoomer</p>

        <div class="viewbar" id="viewbar">
          <div class="viewbar__views glass" id="view-chips" role="group" aria-label="Vues de caméra">
            ${VIEW_CHIPS.map((v) => `<button type="button" class="vchip" data-view="${esc(v.id)}" aria-pressed="false">${esc(v.label)}</button>`).join('')}
          </div>
        </div>

          <div class="toolrail glass" id="tools" role="toolbar" aria-orientation="vertical" aria-label="Outils">
            <button type="button" class="tool" data-tool="cutaway" aria-pressed="false" data-tip="Vue en coupe">${icon('cut')}<span class="sr">Vue en coupe</span></button>
            <button type="button" class="tool" data-tool="autorotate" aria-pressed="false" data-tip="Rotation auto">${icon('rotate')}<span class="sr">Rotation auto</span></button>
            <button type="button" class="tool" data-tool="hotspots" aria-pressed="true" data-tip="Points d’intérêt">${icon('pin')}<span class="sr">Repères</span></button>
            <span class="tools__sep" aria-hidden="true"></span>
            <button type="button" class="tool" data-tool="screenshot" data-tip="Capture">${icon('camera')}<span class="sr">Capture</span></button>
            <button type="button" class="tool" data-tool="compare-add" data-tip="Ajouter à la comparaison">${icon('compare')}<span class="sr">Comparer</span></button>
            <button type="button" class="tool" data-tool="reset" data-tip="Réinitialiser">${icon('reset')}<span class="sr">Réinitialiser</span></button>
          </div>

        <aside class="drawer glass" id="compare-drawer" aria-label="Comparaison des configurations" hidden>
          <div class="drawer__head">
            <div>
              <p class="eyebrow">Comparer</p>
              <h2 class="drawer__title"><span class="drawer__count">0</span> / 3 configurations</h2>
            </div>
            <button type="button" class="iconbtn" data-act="compare-close" aria-label="Fermer la comparaison">${icon('close')}</button>
          </div>
          <div class="drawer__list"></div>
        </aside>
      </section>

      <aside class="panel" id="panel" aria-label="Options de configuration" tabindex="-1">
        <div class="panel__head">
          <div class="panel__titles">
            <p class="eyebrow">Configurateur</p>
            <h2 class="panel__title">Votre ${esc(modelName)}<span class="b">.</span></h2>
          </div>
          <div class="models" role="radiogroup" aria-label="Modèle">
            ${Object.values(MODELS).map((m) => `<button type="button" class="model" role="radio" aria-checked="false" data-model="${esc(m.id)}">
              <span class="model__type">${esc(m.type || '')}</span>
              <span class="model__name">${esc(m.name)}</span>
              <span class="model__len">${esc(m.length || '')}</span>
              <span class="model__load" aria-hidden="true"><i></i></span>
            </button>`).join('')}
          </div>
          <nav class="ptabs" aria-label="Sections">
            ${sections.map((s, i) => `<button type="button" class="ptab${i === 0 ? ' is-active' : ''}" data-goto="${s.id}">${esc(s.name)}</button>`).join('')}
          </nav>
        </div>
        <div class="panel__body" id="panel-body"></div>
        <div class="panel__foot">
          <div class="foot__meta">
            <span class="foot__label">Code de configuration</span>
            <span class="foot__code" id="config-code"></span>
          </div>
          <button type="button" class="btn btn--primary btn--block" id="btn-summary">
            <span>Récapitulatif &amp; devis</span>${ARR}
          </button>
        </div>
      </aside>
    </main>

    <div class="toast glass" id="toast" role="status" aria-live="polite"></div>
  `;

  const $ = (sel, root = app) => root.querySelector(sel);
  const $$ = (sel, root = app) => Array.from(root.querySelectorAll(sel));
  const stageEl = $('#stage');
  const viewportEl = $('#viewport');
  const panelBody = $('#panel-body');
  const toastEl = $('#toast');

  // ---------------------------------------------------------------- panneau d'options
  const groupEls = new Map(); // key -> { root, valueEl, buttons: Map(id->btn), input }

  function renderGroup(g) {
    const hid = 'grp-' + g.key;
    const root = h(`<div class="grp grp--${g.type}" data-key="${esc(g.key)}">
      <div class="grp__head"><h3 class="grp__title" id="${hid}">${esc(g.title)}</h3><span class="grp__value"></span></div>
    </div>`);
    const rec = { root, valueEl: root.querySelector('.grp__value'), buttons: new Map(), input: null };

    if (g.type === 'text') {
      const max = g.maxLength || 18;
      const wrap = h(`<div class="field">
        <input class="field__input" id="field-${esc(g.key)}" type="text" maxlength="${max}" autocomplete="off" spellcheck="false"
          placeholder="${esc(g.placeholder || '')}" aria-labelledby="${hid}" aria-describedby="hint-${esc(g.key)}">
        <span class="field__count" aria-hidden="true"></span>
        <p class="field__hint" id="hint-${esc(g.key)}">Peint sur les deux flancs, à l’avant. ${max} caractères maximum.</p>
      </div>`);
      const input = wrap.querySelector('input');
      const count = wrap.querySelector('.field__count');
      let timer = 0;
      input.addEventListener('input', () => {
        count.textContent = `${input.value.length}/${max}`;
        rec.valueEl.textContent = labelOf(g.key, input.value);
        clearTimeout(timer);
        timer = setTimeout(() => {
          state[g.key] = input.value;
          onChange(g.key, input.value);
          updateMeta();
        }, 250);
      });
      rec.input = input;
      rec.count = count;
      root.appendChild(wrap);
    } else {
      const cls = { 'material-grid': 'mgrid', swatches: 'swatches', chips: 'chips' }[g.type] || 'chips';
      const list = h(`<div class="${cls}" role="radiogroup" aria-labelledby="${hid}"></div>`);
      for (const it of g.items) {
        let btn;
        if (g.type === 'material-grid') {
          btn = h(`<button type="button" class="mcard" role="radio" aria-checked="false" data-id="${esc(it.id)}">
            <span class="mcard__dot" style="background:${esc(it.swatch || it.color || '#888')}"></span>
            <span class="mcard__txt"><span class="mcard__label">${esc(it.label)}</span><span class="mcard__sub">${esc(it.sub || '')}</span></span>
          </button>`);
        } else if (g.type === 'swatches') {
          btn = h(`<button type="button" class="swatch" role="radio" aria-checked="false" aria-label="${esc(it.label)}" data-id="${esc(it.id)}" data-tip="${esc(it.label)}">
            <span class="swatch__dot" style="background:${esc(it.swatch || it.color || '#888')}"></span>
          </button>`);
        } else {
          btn = h(`<button type="button" class="chip" role="radio" aria-checked="false" data-id="${esc(it.id)}">${esc(it.label)}</button>`);
        }
        btn.addEventListener('click', () => select(g.key, it.id));
        rec.buttons.set(it.id, btn);
        list.appendChild(btn);
      }
      list.addEventListener('keydown', (e) => radioKeys(e, g.key, list));
      root.appendChild(list);
    }
    groupEls.set(g.key, rec);
    return root;
  }

  function radioKeys(e, key, list) {
    const keys = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1, Home: 'first', End: 'last' };
    if (!(e.key in keys)) return;
    e.preventDefault();
    const btns = Array.from(list.children);
    const cur = btns.indexOf(document.activeElement);
    let n = keys[e.key] === 'first' ? 0 : keys[e.key] === 'last' ? btns.length - 1 : (cur + keys[e.key] + btns.length) % btns.length;
    btns[n].focus();
    select(key, btns[n].dataset.id);
  }

  for (const s of sections) {
    const sec = h(`<section class="psec is-open" id="${s.id}">
      <h2 class="psec__h"><button type="button" class="psec__head" aria-expanded="true" aria-controls="${s.id}-body">
        <span class="psec__name">${esc(s.name)}</span>
        <span class="psec__meta">${s.groups.length} option${s.groups.length > 1 ? 's' : ''}</span>
        ${icon('chevron', 'ico psec__chev')}
      </button></h2>
      <div class="psec__body" id="${s.id}-body"><div class="psec__inner"></div></div>
    </section>`);
    const inner = sec.querySelector('.psec__inner');
    s.groups.forEach((g) => inner.appendChild(renderGroup(g)));
    const head = sec.querySelector('.psec__head');
    head.addEventListener('click', () => {
      const open = !sec.classList.contains('is-open');
      sec.classList.toggle('is-open', open);
      head.setAttribute('aria-expanded', String(open));
    });
    panelBody.appendChild(sec);
  }

  // onglets de section + scroll-spy
  $$('.ptab').forEach((t) => t.addEventListener('click', () => {
    const sec = document.getElementById(t.dataset.goto);
    if (!sec.classList.contains('is-open')) sec.querySelector('.psec__head').click();
    panelBody.scrollTo({ top: sec.offsetTop - panelBody.offsetTop - 4, behavior: 'smooth' });
    setTab(t.dataset.goto);
  }));
  function setTab(id) { $$('.ptab').forEach((t) => t.classList.toggle('is-active', t.dataset.goto === id)); }
  panelBody.addEventListener('scroll', () => {
    const top = panelBody.scrollTop + 40;
    let cur = sections[0].id;
    for (const s of sections) if (document.getElementById(s.id).offsetTop - panelBody.offsetTop <= top) cur = s.id;
    if (panelBody.scrollTop + panelBody.clientHeight >= panelBody.scrollHeight - 2) cur = sections[sections.length - 1].id;
    setTab(cur);
  }, { passive: true });

  function syncGroup(key) {
    const rec = groupEls.get(key);
    if (!rec) return;
    const val = state[key];
    if (rec.input) {
      if (document.activeElement !== rec.input) rec.input.value = val ?? '';
      rec.count.textContent = `${rec.input.value.length}/${rec.input.maxLength}`;
      rec.valueEl.textContent = labelOf(key, rec.input.value);
      return;
    }
    let any = false;
    for (const [id, btn] of rec.buttons) {
      const on = id === val;
      any ||= on;
      btn.setAttribute('aria-checked', String(on));
      btn.tabIndex = on ? 0 : -1;
    }
    if (!any && rec.buttons.size) rec.buttons.values().next().value.tabIndex = 0;
    rec.valueEl.textContent = labelOf(key, val);
  }

  function select(key, id) {
    if (state[key] === id) return;
    state[key] = id;
    syncGroup(key);
    updateMeta();
    onChange(key, id);
  }

  function updateMeta() {
    $('#config-code').textContent = configCode(state);
    const nameEl = $('.vhead__name');
    const n = (state.boatName || '').trim();
    const custom = n && n.toUpperCase() !== modelName.toUpperCase();
    nameEl.hidden = !custom;
    if (custom) nameEl.textContent = `« ${n} »`;
    renderCompare();
  }

  function setState(s) {
    state = { ...DEFAULT_STATE, ...s };
    applyModel();
    for (const key of groupEls.keys()) syncGroup(key);
    updateMeta();
  }

  // ---------------------------------------------------------------- vues + outils
  const viewBtns = $$('.vchip');
  const toolBtn = (n) => $(`.tool[data-tool="${n}"]`);
  viewBtns.forEach((b) => b.addEventListener('click', () => { closeBubble(); onView(b.dataset.view); }));

  function setActiveView(id) {
    viewBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === id)));
    toolBtn('cutaway').setAttribute('aria-pressed', String(id === 'cutaway'));
  }

  let hotspotsOn = true;
  $('#tools').addEventListener('click', (e) => {
    const b = e.target.closest('.tool');
    if (!b) return;
    const n = b.dataset.tool;
    if (n === 'cutaway' || n === 'autorotate') {
      const on = b.getAttribute('aria-pressed') !== 'true';
      b.setAttribute('aria-pressed', String(on));
      closeBubble();
      onAction(n, on);
    } else if (n === 'hotspots') {
      hotspotsOn = !hotspotsOn;
      b.setAttribute('aria-pressed', String(hotspotsOn));
      hsLayer.classList.toggle('is-off', !hotspotsOn);
      if (!hotspotsOn) closeBubble();
    } else {
      if (n === 'reset') { toolBtn('autorotate').setAttribute('aria-pressed', 'false'); onAction('autorotate', false); }
      onAction(n);
    }
  });

  // indice d'interaction : disparaît au premier geste
  const hint = $('.vhint');
  const hideHint = () => { hint.classList.add('is-gone'); stageEl.removeEventListener('pointerdown', hideHint); };
  stageEl.addEventListener('pointerdown', hideHint);
  setTimeout(hideHint, 9000);

  // ---------------------------------------------------------------- hotspots
  const hsLayer = $('#hotspots');
  const bubble = $('#hotspot-bubble');
  const pins = new Map(); // id -> { el, x, y, vis, num, data }
  let activeId = null;
  let layerW = 0, layerH = 0;
  let bx = NaN, by = NaN, bSide = '';
  new ResizeObserver(([e]) => { layerW = e.contentRect.width; layerH = e.contentRect.height; bx = NaN; }).observe(hsLayer);

  function makePin(hsp) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'hs is-hidden';
    el.innerHTML = '<span class="hs__pulse nk-dot" aria-hidden="true"></span><span class="hs__num"></span>';
    el.addEventListener('click', (e) => { e.stopPropagation(); activeId === hsp.id ? closeBubble() : openBubble(hsp.id); });
    hsLayer.insertBefore(el, bubble);
    return { el, x: NaN, y: NaN, vis: null, num: 0, label: '', data: hsp };
  }

  function renderHotspots(list = []) {
    let i = 0;
    for (const hsp of list) {
      i++;
      let p = pins.get(hsp.id);
      if (!p) { p = makePin(hsp); pins.set(hsp.id, p); }
      p.data = hsp;
      p.seen = true;
      if (p.num !== i) { p.num = i; p.el.lastChild.textContent = i; }
      if (p.label !== hsp.label) { p.label = hsp.label; p.el.setAttribute('aria-label', `${i}. ${hsp.label || ''}`); }
      const vis = !!hsp.visible && Number.isFinite(hsp.x) && Number.isFinite(hsp.y);
      if (vis !== p.vis) {
        p.vis = vis;
        p.el.classList.toggle('is-hidden', !vis);
        p.el.tabIndex = vis ? 0 : -1;
        if (!vis && activeId === hsp.id) closeBubble();
      }
      if (vis && !(Math.abs(hsp.x - p.x) <= 0.3 && Math.abs(hsp.y - p.y) <= 0.3)) {
        p.x = hsp.x; p.y = hsp.y;
        p.el.style.transform = `translate3d(${p.x.toFixed(1)}px,${p.y.toFixed(1)}px,0)`;
      }
    }
    if (pins.size > i) {
      for (const [id, p] of pins) {
        if (!p.seen) { p.el.remove(); pins.delete(id); if (activeId === id) closeBubble(); }
      }
    }
    for (const p of pins.values()) p.seen = false;
    if (activeId) placeBubble();
  }

  function placeBubble() {
    const p = pins.get(activeId);
    if (!p || !Number.isFinite(p.x)) return;
    if (Math.abs(p.x - bx) < 0.3 && Math.abs(p.y - by) < 0.3) return;
    bx = p.x; by = p.y;
    const bw = bubble.offsetWidth || 280, bh = bubble.offsetHeight || 160;
    const right = p.x + 26 + bw < layerW - 12;
    let x = right ? p.x + 24 : p.x - 24 - bw;
    x = Math.max(12, Math.min(x, layerW - bw - 12));
    let y = Math.max(76, Math.min(p.y - bh / 2, layerH - bh - 96));
    const side = right ? 'r' : 'l';
    if (side !== bSide) { bubble.dataset.side = side; bSide = side; }
    bubble.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)`;
  }

  function openBubble(id) {
    const p = pins.get(id);
    if (!p) return;
    if (activeId) pins.get(activeId)?.el.classList.remove('is-active');
    activeId = id;
    p.el.classList.add('is-active');
    p.el.setAttribute('aria-expanded', 'true');
    bubble.querySelector('.bubble__num').textContent = String(p.num).padStart(2, '0');
    bubble.querySelector('.bubble__title').textContent = brandFix(p.data.label || '');
    bubble.querySelector('.bubble__text').textContent = brandFix(p.data.text || '');
    bubble.querySelector('.bubble__go').hidden = !p.data.view;
    bubble.hidden = false;
    bx = NaN;
    placeBubble();
    requestAnimationFrame(() => bubble.classList.add('is-open'));
  }
  function closeBubble() {
    if (!activeId) return;
    const p = pins.get(activeId);
    if (p) { p.el.classList.remove('is-active'); p.el.setAttribute('aria-expanded', 'false'); }
    activeId = null;
    bubble.classList.remove('is-open');
    bubble.hidden = true;
  }
  bubble.querySelector('.bubble__close').addEventListener('click', () => { const p = pins.get(activeId); closeBubble(); p?.el.focus(); });
  bubble.querySelector('.bubble__go').addEventListener('click', () => {
    const v = pins.get(activeId)?.data.view;
    closeBubble();
    if (v) onView(v);
  });
  viewportEl.addEventListener('pointerdown', (e) => {
    if (activeId && !bubble.contains(e.target) && !e.target.closest('.hs')) closeBubble();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && activeId) closeBubble(); });

  // ---------------------------------------------------------------- toast
  let toastTimer = 0;
  function toast(msg) {
    toastEl.textContent = brandFix(msg);
    toastEl.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('is-on'), 2800);
  }

  // ---------------------------------------------------------------- loader
  let loader = document.getElementById('loader');
  if (!loader) {
    loader = h(`<div id="loader" class="loader" role="progressbar" aria-label="Chargement du configurateur" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
      <div class="loader__inner"><div class="loader__box" aria-hidden="true"><svg viewBox="0 0 220 230"><polygon class="lb-l" points="0,42 99,112 99,229 0,172"/><polygon class="lb-r" points="140,122 219,72 219,172 140,229"/><polygon class="lb-t" points="78,45 204,1 205,69 139,100"/></svg></div>
      <p class="loader__studio eyebrow">${esc(studio)} · Étude de concept</p><p class="loader__title">${esc(modelName)}<span class="b">.</span></p>
      <p class="loader__tagline">${esc(curModel.tagline || '')}${esc(lengthTxt(curModel))}</p><div class="loader__bar"><span class="loader__fill"></span></div>
      <p class="loader__pct"><span class="loader__num">0</span> %</p></div></div>`);
    document.body.appendChild(loader);
  }
  const loaderFill = loader.querySelector('.loader__fill');
  const loaderNum = loader.querySelector('.loader__num');
  let loaderTimer = 0;
  function setLoading(p) {
    clearTimeout(loaderTimer);
    if (p === false || p == null) {
      loaderFill.style.transform = 'scaleX(1)';
      loaderNum.textContent = '100';
      loader.setAttribute('aria-valuenow', '100');
      loader.classList.add('is-done');
      document.documentElement.classList.add('is-ready');
      loaderTimer = setTimeout(() => { loader.hidden = true; }, 900);
      return;
    }
    const v = Math.max(0, Math.min(1, +p || 0));
    loader.hidden = false;
    loader.classList.remove('is-done');
    loaderFill.style.transform = `scaleX(${v})`;
    loaderNum.textContent = Math.round(v * 100);
    loader.setAttribute('aria-valuenow', String(Math.round(v * 100)));
  }

  // ---------------------------------------------------------------- thème
  function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    $$('.seg__btn').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.themeSet === t)));
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = t === 'dark' ? '#0b214a' : '#ffffff';
  }
  applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');
  $$('.seg__btn').forEach((b) => b.addEventListener('click', () => { applyTheme(b.dataset.themeSet); store.set('d29-theme', b.dataset.themeSet); }));

  // ---------------------------------------------------------------- barre haute
  $('#topbar').addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const a = b.dataset.act;
    if (a === 'gallery') { onAction('gallery'); if (!galleryDlg.open) openGallery(0); }
    else if (a === 'specs') onAction('summary');
    else if (a === 'compare-open') toggleDrawer();
    else onAction(a);
  });
  $('#btn-summary').addEventListener('click', () => onAction('summary'));

  // ---------------------------------------------------------------- modales (dialog natif)
  function makeDialog(id, cls, label) {
    const d = document.createElement('dialog');
    d.id = id;
    d.className = 'modal ' + cls;
    d.setAttribute('aria-label', label);
    d.addEventListener('click', (e) => { if (e.target === d) closeDialog(d); }); // clic sur le fond
    d.addEventListener('cancel', (e) => { e.preventDefault(); closeDialog(d); });
    document.body.appendChild(d);
    return d;
  }
  function openDialog(d) {
    if (d.open) return;
    d.classList.remove('is-closing');
    d.showModal();
    document.documentElement.classList.add('has-modal');
  }
  function closeDialog(d) {
    if (!d.open || d.classList.contains('is-closing')) return;
    d.classList.add('is-closing');
    setTimeout(() => {
      d.close();
      d.classList.remove('is-closing');
      if (!document.querySelector('dialog[open]')) document.documentElement.classList.remove('has-modal');
    }, 220);
  }

  // ---- récapitulatif
  const summaryDlg = makeDialog('modal-summary', 'modal--summary', 'Récapitulatif de configuration');
  function openSummary({ state: s = state, imageDataURL = '', shareURL = '' } = {}) {
    const cfg = { ...DEFAULT_STATE, ...s };
    const mdl = modelOf(cfg), mName = mdl.name || modelName;
    const name = (cfg.boatName || '').trim() || mName;
    const code = configCode(cfg);
    const date = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
    const link = shareURL || location.href;
    const modelRow = `<div class="sum__sec"><h4 class="sum__sech">Modèle</h4><dl class="sum__list"><div class="sum__row"><dt>${esc(mdl.type || 'Modèle')}</dt><dd><span>${esc(mName)}</span><span class="sum__sub">${esc(mdl.length || '')}</span></dd></div></dl></div>`;
    const choices = modelRow + sections.map((sec) => `
      <div class="sum__sec">
        <h4 class="sum__sech">${esc(sec.name)}</h4>
        <dl class="sum__list">${sec.groups.map((g) => {
          const it = g.items ? itemOf(g.key, cfg[g.key]) : null;
          const dot = it?.swatch ? `<span class="sum__dot" style="background:${esc(it.swatch)}"></span>` : '';
          const sub = it?.sub ? `<span class="sum__sub">${esc(it.sub)}</span>` : '';
          return `<div class="sum__row"><dt>${esc(g.title)}</dt><dd>${dot}<span>${esc(labelOf(g.key, cfg[g.key]))}</span>${sub}</dd></div>`;
        }).join('')}</dl>
      </div>`).join('');
    const specs = (mdl.specs || []).map(([k, v]) => `<div class="sum__row"><dt>${esc(k)}</dt><dd><strong>${esc(v)}</strong></dd></div>`).join('');

    summaryDlg.innerHTML = `
      <div class="modal__card sum">
        <header class="modal__head">
          <div>
            <div class="modal__brand">${LOGO}</div>
            <p class="eyebrow">Récapitulatif de configuration · ${esc(date)}</p>
            <h2 class="modal__title">${esc(name)}<span class="b">.</span></h2>
            <p class="modal__sub">${esc(mName)} — ${esc(mdl.tagline || '')}${esc(lengthTxt(mdl))} · par ${esc(studio)}</p>
          </div>
          <button type="button" class="iconbtn no-print" data-close aria-label="Fermer le récapitulatif">${icon('close')}</button>
        </header>
        <div class="sum__grid">
          <div class="sum__visual">
            <figure class="sum__fig">${imageDataURL
              ? `<img src="${esc(imageDataURL)}" alt="Rendu de la configuration ${esc(name)}">`
              : `<div class="sum__noimg">${esc(mName)}</div>`}</figure>
            <div class="sum__code">
              <span class="foot__label">Code de configuration</span>
              <span class="sum__codev">${esc(code)}</span>
            </div>
            <section class="sum__specs">
              <h4 class="sum__sech">Fiche technique</h4>
              <dl class="sum__list">${specs}</dl>
              ${mdl.pending ? `<p class="sum__pending"><span>À préciser en avant-projet</span>${esc(mdl.pending)}</p>` : ''}
            </section>
          </div>
          <div class="sum__choices">${choices}</div>
        </div>
        <footer class="modal__foot no-print">
          <p class="sum__note">Configuration indicative — étude de concept. Un conseiller ${esc(studio)} établira un devis détaillé.</p>
          <div class="modal__actions">
            <button type="button" class="btn btn--ghost" data-copy>${icon('link')}<span>Copier le lien</span></button>
            <button type="button" class="btn btn--primary" data-print>${icon('print')}<span>Imprimer / PDF</span>${ARR}</button>
          </div>
        </footer>
        <p class="print-only sum__printlink">${esc(link)}</p>
      </div>`;
    summaryDlg.querySelector('[data-close]').addEventListener('click', () => closeDialog(summaryDlg));
    summaryDlg.querySelector('[data-print]').addEventListener('click', () => window.print());
    summaryDlg.querySelector('[data-copy]').addEventListener('click', () => copyText(link).then(
      () => toast('Lien de configuration copié'), () => toast('Copie impossible — lien : ' + link)));
    openDialog(summaryDlg);
    summaryDlg.querySelector('[data-print]').focus();
  }

  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return; } catch { /* repli */ }
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;opacity:0;top:0';
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    if (!ok) throw new Error('copy');
  }

  // ---- galerie
  const galleryDlg = makeDialog('modal-gallery', 'modal--gallery', 'Galerie des rendus officiels');
  galleryDlg.innerHTML = `
    <div class="modal__card gal">
      <header class="modal__head">
        <div><p class="eyebrow">Rendus officiels · ${esc(studio)}</p><h2 class="modal__title">Galerie<span class="b">.</span></h2></div>
        <div class="gal__count" aria-live="polite"></div>
        <button type="button" class="iconbtn" data-close aria-label="Fermer la galerie">${icon('close')}</button>
      </header>
      <figure class="gal__stage">
        <button type="button" class="gal__nav gal__nav--prev" aria-label="Image précédente">${icon('left')}</button>
        <img class="gal__img" alt="">
        <button type="button" class="gal__nav gal__nav--next" aria-label="Image suivante">${icon('right')}</button>
        <figcaption class="gal__cap"></figcaption>
      </figure>
      <div class="gal__thumbs" role="group" aria-label="Miniatures">
        ${GALLERY.map((g, i) => `<button type="button" class="gal__thumb" data-i="${i}" aria-label="${esc(g.label)} (${i + 1}/${GALLERY.length})"><img src="${esc(g.src)}" alt="" loading="lazy"></button>`).join('')}
      </div>
    </div>`;
  let galIndex = 0;
  const galImg = galleryDlg.querySelector('.gal__img');
  function showGallery(i) {
    if (!GALLERY.length) return;
    galIndex = (i + GALLERY.length) % GALLERY.length;
    const g = GALLERY[galIndex];
    galImg.classList.add('is-swap');
    const img = new Image();
    img.onload = img.onerror = () => {
      galImg.src = g.src;
      galImg.alt = `${modelName} — ${g.label}`;
      requestAnimationFrame(() => galImg.classList.remove('is-swap'));
    };
    img.src = g.src;
    galleryDlg.querySelector('.gal__cap').textContent = g.label;
    galleryDlg.querySelector('.gal__count').textContent = `${String(galIndex + 1).padStart(2, '0')} / ${String(GALLERY.length).padStart(2, '0')}`;
    galleryDlg.querySelectorAll('.gal__thumb').forEach((t, k) => t.setAttribute('aria-current', String(k === galIndex)));
  }
  galleryDlg.querySelector('[data-close]').addEventListener('click', () => closeDialog(galleryDlg));
  galleryDlg.querySelector('.gal__nav--prev').addEventListener('click', () => showGallery(galIndex - 1));
  galleryDlg.querySelector('.gal__nav--next').addEventListener('click', () => showGallery(galIndex + 1));
  galleryDlg.querySelectorAll('.gal__thumb').forEach((t) => t.addEventListener('click', () => showGallery(+t.dataset.i)));
  galleryDlg.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); showGallery(galIndex - 1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); showGallery(galIndex + 1); }
    else if (e.key === 'Home') { e.preventDefault(); showGallery(0); }
    else if (e.key === 'End') { e.preventDefault(); showGallery(GALLERY.length - 1); }
  });
  let touchX = null;
  galleryDlg.querySelector('.gal__stage').addEventListener('touchstart', (e) => { touchX = e.touches[0].clientX; }, { passive: true });
  galleryDlg.querySelector('.gal__stage').addEventListener('touchend', (e) => {
    if (touchX == null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 40) showGallery(galIndex + (dx < 0 ? 1 : -1));
    touchX = null;
  });
  function openGallery(i = 0) {
    showGallery(i);
    openDialog(galleryDlg);
    galleryDlg.querySelector('.gal__nav--next').focus();
  }

  // ---------------------------------------------------------------- comparaison
  const drawer = $('#compare-drawer');
  const drawerList = drawer.querySelector('.drawer__list');
  const compareBadge = $('[data-act="compare-open"] .badge');
  const compareNavBtn = $('[data-act="compare-open"]');
  const KEY_DIFF = ['hull', 'hullFinish', 'accent', 'glass', 'deck', 'upholsteryInterior', 'woodInterior', 'upholsteryExterior', 'ambientLight'];
  let compares = [];
  let cmpSeq = 0;

  function toggleDrawer(force) {
    const open = force ?? drawer.hidden;
    drawer.hidden = !open;
    compareNavBtn.setAttribute('aria-expanded', String(open));
    if (open) { renderCompare(); requestAnimationFrame(() => drawer.classList.add('is-open')); }
    else drawer.classList.remove('is-open');
  }
  drawer.querySelector('[data-act="compare-close"]').addEventListener('click', () => { toggleDrawer(false); compareNavBtn.focus(); });

  function addToCompare({ state: s = state, imageDataURL = '' } = {}) {
    const cfg = { ...DEFAULT_STATE, ...s };
    const sig = JSON.stringify(Object.keys(DEFAULT_STATE).map((k) => cfg[k]));
    if (compares.some((c) => c.sig === sig)) { toggleDrawer(true); toast('Cette configuration est déjà dans la comparaison'); return false; }
    if (compares.length >= 3) { compares.shift(); toast('Comparaison limitée à 3 — la plus ancienne a été retirée'); }
    compares.push({ uid: ++cmpSeq, state: cfg, img: imageDataURL, sig, at: new Date() });
    toggleDrawer(true);
    renderCompare();
    return true;
  }

  function renderCompare() {
    compareBadge.hidden = !compares.length;
    compareBadge.textContent = compares.length;
    drawer.querySelector('.drawer__count').textContent = compares.length;
    if (drawer.hidden) return;
    if (!compares.length) {
      drawerList.innerHTML = `<div class="drawer__empty">${icon('compare')}<p>Ajoutez jusqu’à trois configurations avec l’outil <strong>Comparer</strong> pour les mettre côte à côte.</p></div>`;
      return;
    }
    drawerList.innerHTML = compares.map((c, i) => {
      const diffs = ['model', ...KEY_DIFF].filter((k) => c.state[k] !== state[k]);
      const cm = modelOf(c.state);
      const name = (c.state.boatName || '').trim() || cm.name;
      const rows = KEY_DIFF.slice(0, 6).map((k) => {
        const it = itemOf(k, c.state[k]);
        const d = c.state[k] !== state[k];
        return `<li class="${d ? 'is-diff' : ''}"><span class="cmp__k">${esc(groupByKey.get(k).title)}</span>
          <span class="cmp__v">${it?.swatch ? `<i style="background:${esc(it.swatch)}"></i>` : ''}${esc(it?.label || '—')}</span></li>`;
      }).join('');
      return `<article class="cmp" data-uid="${c.uid}">
        <div class="cmp__thumb">${c.img ? `<img src="${esc(c.img)}" alt="">` : ''}<span class="cmp__idx">${String.fromCharCode(65 + i)}</span></div>
        <div class="cmp__body">
          <h3 class="cmp__name">${esc(name)}</h3>
          <p class="cmp__meta">${esc(cm.name)} · ${esc(configCode(c.state))} · ${diffs.length ? `${diffs.length} différence${diffs.length > 1 ? 's' : ''} avec l’actuelle` : 'Identique à l’actuelle'}</p>
          <ul class="cmp__rows">${rows}</ul>
          <div class="cmp__actions">
            <button type="button" class="btn btn--small btn--primary" data-load>Charger</button>
            <button type="button" class="iconbtn iconbtn--small" data-del aria-label="Retirer ${esc(name)} de la comparaison">${icon('trash')}</button>
          </div>
        </div>
      </article>`;
    }).join('');
  }
  drawerList.addEventListener('click', (e) => {
    const card = e.target.closest('.cmp');
    if (!card) return;
    const c = compares.find((x) => x.uid === +card.dataset.uid);
    if (!c) return;
    if (e.target.closest('[data-load]')) onAction('load-config', { ...c.state });
    else if (e.target.closest('[data-del]')) { compares = compares.filter((x) => x !== c); renderCompare(); }
  });

  // ---------------------------------------------------------------- modèle (sélecteur + textes qui en dépendent)
  const modelBtns = $$('.model');
  let appliedModel = null;
  function applyModel() {
    curModel = modelOf(state);
    modelName = curModel.name || 'DIÈDRE 29';
    modelBtns.forEach((b) => { const on = b.dataset.model === curModel.id; b.setAttribute('aria-checked', String(on)); b.tabIndex = on ? 0 : -1; });
    if (appliedModel === curModel.id) return;
    appliedModel = curModel.id;
    const dot = '<span class="b">.</span>';
    $('.brand__name').textContent = brandFix(modelName);
    $('.vhead__title').innerHTML = esc(modelName) + dot;
    $('.vhead__tagline').textContent = brandFix((curModel.tagline || '') + lengthTxt(curModel));
    $('.panel__title').innerHTML = 'Votre ' + esc(modelName) + dot;
    viewportEl.setAttribute('aria-label', 'Vue 3D du ' + brandFix(modelName));
    const lt = loader.querySelector('.loader__title'), lg = loader.querySelector('.loader__tagline');
    if (lt) lt.innerHTML = esc(modelName) + dot;
    if (lg) lg.textContent = brandFix((curModel.tagline || '') + lengthTxt(curModel));
    const labels = Object.fromEntries(chipsFor(curModel.id).map((c) => [c.id, c.label]));
    viewBtns.forEach((b) => { if (labels[b.dataset.view]) b.textContent = labels[b.dataset.view]; });
    const nameIn = groupEls.get('boatName')?.input;
    if (nameIn) nameIn.placeholder = modelName;
    $('[data-act="gallery"]').hidden = !galleryFor(curModel.id).length;
    document.title = `${modelName} — Configurateur`;
  }
  function selectModel(id) {
    if (!MODELS[id] || state.model === id) return;
    state.model = id;
    applyModel();
    updateMeta();
    closeBubble();
    onChange('model', id);
  }
  modelBtns.forEach((b) => b.addEventListener('click', () => selectModel(b.dataset.model)));
  $('.models').addEventListener('keydown', (e) => {
    const k = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!k) return;
    e.preventDefault();
    const i = (modelBtns.findIndex((b) => b.dataset.model === state.model) + k + modelBtns.length) % modelBtns.length;
    modelBtns[i].focus();
    selectModel(modelBtns[i].dataset.model);
  });
  // chargement paresseux d'un modèle : barre fine dans le bouton choisi + pastille sur la vue 3D
  const mload = h(`<div class="mload glass" role="status" aria-live="polite" hidden><span class="mload__txt"></span><span class="mload__bar"><i></i></span></div>`);
  viewportEl.appendChild(mload);
  function setModelBusy(p) {
    const busy = !(p === false || p == null);
    const v = busy ? Math.max(0, Math.min(1, +p || 0)) : 1;
    $('.models').setAttribute('aria-busy', String(busy));
    modelBtns.forEach((b) => {
      const on = busy && b.dataset.model === state.model;
      b.classList.toggle('is-loading', on);
      b.querySelector('.model__load i').style.transform = `scaleX(${on ? v : 0})`;
    });
    mload.hidden = !busy;
    if (busy) {
      mload.querySelector('.mload__txt').textContent = `Chargement du ${brandFix(modelName)}… ${Math.round(v * 100)} %`;
      mload.querySelector('.mload__bar i').style.transform = `scaleX(${v})`;
    }
  }

  // ---------------------------------------------------------------- init
  setState(state);

  return {
    setState,
    setActiveView,
    renderHotspots,
    toast,
    setLoading,
    getViewportEl: () => stageEl,
    openSummary,
    addToCompare,
    openGallery,
    configCode,
    setModelBusy,
  };
}
