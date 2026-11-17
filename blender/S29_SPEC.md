# SILLAGE 29 — super-catamaran à voile électrique (contrat commun de l'équipe)

Remplace le DIÈDRE 24 dans le configurateur NEOKROME (le monocoque DIÈDRE 29 reste inchangé).
**28,7 m × 12,8 m**, sloop à mât carbone, propulsion électrique (2 pods), énergie solaire, flybridge.

## Direction de design (prioritaire)
- **Design ORIGINAL NEOKROME.** Le client s'inspire de la catégorie « super-catamaran à voile de luxe ~95 ft »
  (type grands catamarans de voyage contemporains) mais **ne copie aucun bateau existant** : pas de reproduction de
  lignes, de vitrages, de signature graphique ou de détails d'un chantier. Invente tes propres formes.
- **Luxe moderne aux FORMES ARRONDIES** (même ADN que le DIÈDRE 24 qu'on remplace) : surfaces tendues et galbées,
  transitions continues, grands rayons, aucune arête vive ni facette visible sauf joints volontaires.
- Coques : flanc bombé (le point `knZ/knY` de `s29_lines.section` est le point le plus large d'une courbe lisse,
  rayon ≥ 0,4 m), bouchain très adouci, étrave quasi verticale à nez arrondi (rayon en plan ≥ 0,3 m), livet souple,
  franc-bord élevé et élégant ; longue bande vitrée de coque (hublots allongés `glass` fumé, cadre `metalDark`)
  sur le flanc extérieur de chaque coque vers le milieu (cabines).
- Superstructure : salon aux angles très arrondis en plan (rayons 1–2 m), vitrage enveloppant cintré, pare-brise
  incliné bombé sous une casquette arrondie (le pont du flybridge déborde) ; flybridge ouvert sous un hardtop en
  aile mince (chant en goutte d'eau), montants profilés en aile.
- Palette et matériaux identiques au configurateur (mêmes noms), teck, joncs `accent` fins soulignant les courbes.

Cotes : **`lib/s29_lines.py`** (n'invente pas d'autres cotes principales ; si une cote manque, choisis-la, documente-la
en tête de ton script et garde-la cohérente avec les autres modules).

## Pipeline
- Scripts bpy dans `blender/parts/` exposant `build(ctx)` ; assemblage :
  `/Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup -P blender/build.py -- --parts s29_hull,s29_super,s29_interior,s29_rig --name cat29 --out blender/out_s29`
  (`--parts` : uniquement les modules existants ; chacun doit pouvoir se construire seul). Pour tes essais,
  utilise ta propre sortie (`--out blender/out_s29_<toi>`) pour ne pas écraser celle des autres.
- Rendus Cycles : `.../Blender -b <fichier.blend> -P blender/render.py -- --camfile blender/cams_s29.py --cams s_hero,s_profile --samples 32 --res 960x540 --out <dir> [--nowater] [--hide roof,upperGlass]`.
  Regarde tes rendus (outil Read sur les .jpg) et corrige jusqu'à un résultat crédible de catalogue de chantier.
- Modules existants réutilisables PAR IMPORT (ne les modifie pas) : `parts/hull.py` (MB, make_obj, add_bevel, add_wn,
  loft_rows, lathe, tube…), `parts/superstructure.py` (MB, round_corner, rounded_poly…), `parts/propulsion.py`
  (fix_closed, fix_dir, pods/hélices), et surtout les modules du catamaran précédent `parts/cat_hull.py`,
  `parts/cat_super.py`, `parts/cat_interior.py` (DIÈDRE 24, formes arrondies, 24 m × 10,2 m, cotes `lib/cat_lines.py`) :
  ce sont d'excellents points de départ — tu peux COPIER leur code dans ton nouveau module et l'adapter aux cotes
  `s29_lines` (ne modifie pas les fichiers cat_*.py eux-mêmes). Attention : ils importent `cat_lines` et contiennent
  des constantes codées en dur pour 24 m.
- ATTENTION : `make_obj` de hull.py range l'objet dans le groupe 'hull' : pour un autre groupe appelle ensuite
  `ctx.link(ob, '<groupe>')`.
- Repère three.js : +X avant, +Y haut, +Z tribord, mètres, flottaison y = 0 ; `to_bl()` pour Blender.

## Groupes three.js (`ctx.link(obj, groupe)`) et propriétaires
| Groupe | Contenu | Module |
|---|---|---|
| `hull` | 2 coques, nef (dessous + tunnel + avant de nef profilé), poutre avant, ponts en teck (cockpit, passavants, pont avant + lounge avant creusé), pavois bas, hublots de coque, escaliers et plateformes de bain, grande plateforme « lounge mer » arrière entre les coques (abaissée), terrasses latérales rabattables ouvertes (balcons), accastillerie (taquets, chaumards, cadènes), pods + hélices, propulseurs d'étrave, embase du mât | `s29_hull.py` |
| `superstructure` | parois du salon (hors vitrages), seuil, bandeau `accent`, cadres des portes arrière, casquette avant (chant) | `s29_super.py` |
| `upperGlass` | tous les vitrages du salon (`glass`, faces vers l'extérieur) + meneaux, pare-brise du flybridge (bas, en verre) | `s29_super.py` |
| `roof` | toit du salon = pont du flybridge (dessus en teck, chant, sous-face au-dessus du cockpit, plafond intérieur `ceiling` + `ledStrip` + spots), garde-corps vitré du flybridge, escalier cockpit→flybridge, hardtop solaire + montants, **mobilier du flybridge** (voir intérieur) | `s29_super.py` (+ mobilier fly par `s29_interior.py`) |
| `interior` | plancher du salon, mobilier intérieur : poste de pilotage intérieur avant tribord, salon (grand canapé en arc + table basse galet), salle à manger (table ovale 8–10 couverts), îlot cuisine/bar, rangements, tapis | `s29_interior.py` |
| `aftDeckFurniture` | cockpit : grand canapé en U + table repas teck, 2 fauteuils ; lounge avant : canapé en arc + table ; bains de soleil de la plateforme arrière | `s29_interior.py` |
| (dans `roof`) | flybridge : poste de barre tribord avant (`FLY_HELM` : 2 sièges, console, écrans `screens`, 2 winchs `chrome` à côté), bar en arc + tabourets, grand canapé en U + table, bains de soleil avant du fly, jardinières/plantes interdites | `s29_interior.py` (`ctx.link(ob, 'roof')`) |
| `roof` | **gréement** : mât carbone en aile (`metalDark`), barres de flèche, haubans/étai (`chrome`, câbles fins), bôme à enrouleur (`metalDark`) avec grand-voile enroulée cachée, foc enroulé autour de l'étai (`upholsteryExterior` = toile/housse), feu de tête de mât `navWhite`, anémomètre, éclairage de pont | `s29_rig.py` |

Le groupe `roof` est effacé dans la vue « Coupe » (avec `upperGlass`) : salon et cockpit doivent rester lisibles et
« finis » vus du dessus sans toit (le flybridge disparaît aussi, c'est voulu).

## Matériaux (noms EXACTS — clés de `materials` dans js/boat.js)
`hull`, `hullBottom`, `accent`, `superstructure`, `glass`, `chrome`, `metalDark`, `acrylic`, `deck`, `caulk`,
`upholsteryExterior`, `upholsteryInterior`, `woodInterior`, `interiorFloor`, `ceiling`, `screens` (UV 0..1 par écran),
`ledStrip`, `propBronze`, `zinc`, `navRed`/`navGreen`/`navWhite`. Aucun autre nom. UV en mètres (1 UV = 1 m) ;
teck : fil le long de u.

## Implantation (x avant, cotes en m — détails dans s29_lines.py)
- Coques z = ±4,75 ; étrave x = 14,35 ; tableau x = −13,7 ; plateformes jusqu'à x = −14,35 à y = 0,45 ; escalier
  de 6–7 marches dans le tableau de chaque coque (pont 2,35 → plateforme).
- Nef de x = −13,7 à x = 8,6 ; dessous à y = 1,30 ; pont plat teck à y = 2,35. Poutre avant x ≈ 13,0 (dessus 2,70)
  entre les coques ; entre la nef et la poutre : lounge avant creusé dans un pont avant plein (pas de trampoline).
- Plateforme « lounge mer » : x −14,6 → −12,2, |z| ≤ 3,2, y = 0,55, entre les coques, reliée au cockpit par des
  marches ; porte de garage (annexe/jet) dans la face arrière de la nef au-dessus.
- Terrasses latérales : sur le flanc extérieur de chaque coque, x −11,6 → −8,0, débord 1,05 m, dessus y = 2,30 :
  pavois rabattu à l'horizontale (dessus teck, garde-corps verre/inox relevés) — la découpe correspondante dans le pavois.
- Salon : x −5,2 → 6,6, demi-largeur 5,05, plancher 2,40, plafond 4,70 ; pare-brise incliné de 38° sur la verticale.
- Flybridge : pont y = 5,00, x −9,8 → 5,3, demi-largeur 5,20 (casquette au-dessus du cockpit et du pare-brise) ;
  hardtop y = 7,55, x −8,8 → 3,6, |z| ≤ 4,9, 4 montants `HT_PILLARS` ; solaire `SOLAR_HT` ; escalier `FLY_STAIR`.
- Mât : pied x = 7,6, y = 2,35 (pont, juste devant le pare-brise), tête y = 38 ; bôme y = 8,35 jusqu'à x = −8,6
  (au-dessus du hardtop, ne doit pas le toucher) ; étai `FORESTAY` ; cadènes `CHAINPLATES`.
- Propulsion : pod sous chaque coque, aileron vers x = −10,4 ; propulseur d'étrave dans chaque coque vers x = 11,6.
- Feux de nav : `navRed` bâbord / `navGreen` tribord sur les flancs avant du salon ; `navWhite` tête de mât.

## Qualité attendue
Niveau « rendu chantier » : formes lisses (sous-division / splines / fillets), topologie propre, détails crédibles
et sobres, aucun trou ni face inversée (test backface culling), aucune interpénétration visible entre modules
(construis avec les autres parts présentes pour vérifier). **Budget web (GLB total visé ≤ 13 Mo)** : coques+ponts
≤ 380 k triangles, superstructure+toit+vitrages+fly ≤ 200 k, intérieur+mobilier ≤ 220 k, gréement ≤ 40 k.
