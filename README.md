# DIÈDRE 29 — Configurateur 3D

Configurateur web temps réel d'un yacht électrique de 29 m (three.js 0.160, modules ES, sans build).

## Lancer en local

```bash
python3 serve.py 8429
```

Puis ouvrir http://localhost:8429.

## Structure

- `index.html`, `css/style.css` : interface
- `js/main.js` : orchestration, options, ambiances
- `js/stage.js` : scène, lumière, mer, post-traitement
- `js/boat.js` : coque, superstructure, pont, matières
- `js/interior.js` : salon, poste de pilotage, pont arrière
- `js/options.js`, `js/ui.js` : catalogue et panneau d'options
