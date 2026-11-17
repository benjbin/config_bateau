# DIÈDRE 24 Catamaran — fiche de conception (contrat commun de l'équipe)

Second modèle du configurateur NEOKROME, à côté du DIÈDRE 29 (monocoque, inchangé). Catamaran à moteurs
électriques de luxe, 24,0 m × 10,2 m. **DIRECTION DE DESIGN (demande du client, prioritaire) : luxe MODERNE aux
FORMES ARRONDIES** — à l'opposé des arêtes vives du DIÈDRE 29. Inspirations : grands catamarans à moteur
contemporains (lignes fluides, surfaces tendues et galbées, transitions continues).
- Coques : sections arrondies et galbées, PAS d'arête vive « dièdre » : l'« arête » (knZ/knY de cat_lines.py)
  devient le point le plus large d'un flanc bombé à grand rayon (≥ 0,35 m), bouchain très adouci (≥ 0,15 m),
  étrave légèrement inversée ou verticale avec un nez arrondi (rayon de plan ≥ 0,25 m), livet souple.
  Les cotes principales de cat_lines.py restent valables (emprise, hauteurs, largeurs) ; les formes, elles,
  doivent être lissées (sous-division, splines, fillets), aucune facette visible.
- Superstructure : salon aux angles en plan très arrondis (rayons 0,8–1,5 m), parois galbées, vitrage enveloppant
  continu à angles cintrés (verre courbe), pare-brise bombé, montants effilés ; hardtop aux bords en goutte
  d'eau, chant aminci, angles arrondis en plan, transition douce vers les montants.
- Intérieur et mobilier : formes organiques, canapés aux dossiers galbés et angles ronds, tables ovales ou en
  galet, consoles aux arêtes très adoucies.
- Matériaux et palette identiques (mêmes noms), teck, métal 'accent' en joncs fins soulignant les courbes.
Cotes de référence : `lib/cat_lines.py` (n'invente pas d'autres cotes principales ; si une cote manque,
choisis-la, documente-la en tête de ton script et garde-la cohérente avec les autres modules).

## Pipeline
- Scripts bpy dans `blender/parts/` exposant `build(ctx)` ; assemblage :
  `/Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup -P blender/build.py -- --parts cat_hull,cat_super,cat_interior --name cat24 --out <dir>`
  (`--parts` : uniquement les modules existants ; chacun doit pouvoir se construire seul).
- Réutilise les utilitaires de `blender/parts/hull.py` (MB, make_obj, add_bevel, add_wn, loft_rows, lathe, tube…),
  `propulsion.py` (fix_closed, fix_dir, nacelle/hélices) et `lib/lines.py` (to_bl) par import ; ne les modifie pas.
  ATTENTION : `make_obj` de hull.py range l'objet dans le groupe 'hull' (constante GROUP) : pour un autre groupe,
  appelle ensuite `ctx.link(ob, '<groupe>')` (ou écris ta propre variante dans ton module).
- Rendus Cycles : `blender/render.py` (`--cams`, `--nowater`) — ajoute tes caméras dans ton propre script de rendu
  si besoin (les caméras de render.py visent le monocoque).
- Repère three.js : +X avant, +Y haut, +Z tribord, mètres, flottaison y = 0 ; to_bl() pour Blender.

## Groupes three.js (ctx.link(obj, groupe)) et propriétaires
| Groupe | Contenu | Module |
|---|---|---|
| `hull` | 2 coques, nef (dessous + tunnel), ponts en teck (cockpit, passavants, pont avant), pavois bas, escaliers et plateformes de bain arrière, accastillerie, pods + hélices (comme le DIÈDRE 29) | `cat_hull.py` |
| `superstructure` | parois du salon (hors vitrages), montants, bandeau `accent`, seuil, portes arrière (cadres) | `cat_super.py` |
| `upperGlass` | tous les vitrages du salon (matériau `glass`, faces vers l'extérieur) + meneaux | `cat_super.py` |
| `roof` | hardtop (dessus, chant, sous-face extérieure au-dessus du cockpit), montants arrière fins, panneaux solaires, plafond intérieur du salon (`ceiling`) + bandeaux LED (`ledStrip`) + spots | `cat_super.py` |
| `interior` | plancher du salon, mobilier intérieur : poste de pilotage avant tribord (2 sièges, console, 3 écrans `screens`), salon (canapé en U ou 2 canapés face à face, table basse), îlot cuisine/bar, rangements, tapis | `cat_interior.py` |
| `aftDeckFurniture` | cockpit arrière : banquette en U + table repas en teck ; pont avant : grand bain de soleil + coussins | `cat_interior.py` |

Le groupe `roof` est effacé dans la vue « Coupe » et `upperGlass` avec lui : l'intérieur doit rester lisible et
« fini » vu du dessus sans toit. Le plafond (`ceiling`) appartient au toit.

## Matériaux (noms EXACTS — clés de `materials` dans js/boat.js ; le configurateur remet ses propres matériaux)
`hull` (flanc bas laqué), `hullBottom` (antifouling, dessous de nef, fonds), `accent` (bandeau, flanc haut métal,
joncs), `superstructure` (parois/hardtop laqués), `glass`, `chrome` (inox poli), `metalDark` (noir PVD : montants,
cadres, taquets), `acrylic` (panneaux de pont fumés), `deck` (teck), `caulk` (joints noirs), `upholsteryExterior`
(coussins extérieurs), `upholsteryInterior` (cuir/tissu intérieur), `woodInterior` (boiseries, tables),
`interiorFloor` (plancher intérieur), `ceiling` (plafond), `screens` (écrans — UV 0..1 par écran), `ledStrip`
(bandeaux lumineux), `propBronze`, `zinc`, `navRed`/`navGreen`/`navWhite` (lentilles des feux de navigation).
Aucun autre nom. UV en mètres (1 UV = 1 m) ; teck : fil le long de u.

## Implantation (x avant, cotes en m)
- Coques : axe z = ±3,75 ; étrave x = 12,0 ; tableau x = −11,4 ; plateforme de bain de chaque coque jusqu'à
  x = −12,0 à y = 0,40, escalier de 5–6 marches dans le tableau de chaque coque, du pont (1,95) à la plateforme.
- Nef (bridgedeck) : de x = −11,4 à x = 7,2 entre les coques ; dessous à y = 1,05 (tunnel), avant de nef
  profilé en V doux ; pont plat en teck à y = 1,95 (cockpit x −11,4 → −4,8 ; passavants latéraux ; pont avant
  x 5,4 → 10,5 avec bain de soleil). Pavois bas / jonc en `accent` au livet ; pas de filières hautes.
- Salon : x −4,8 (baie vitrée arrière coulissante pleine largeur) → 5,4 (pied du pare-brise incliné ~35°),
  demi-largeur extérieure 4,0 ; plancher y = 2,00 ; plafond 4,15 ; vitrages latéraux pleine hauteur à facettes.
- Hardtop : y dessus 4,40, de x = −10,6 (couvre le cockpit) à x = 6,0 ; 4 montants fins à x = −10,15,
  z = ±2,6 et ±4,55 ; panneaux solaires intégrés x −9,8 → 5,4, |z| ≤ 4,0, cadre affleurant.
- Poste de pilotage : intérieur, avant tribord (x ≈ 3,5 → 5,2, z ≈ 1,2 → 3,4), face au pare-brise.
- Propulsion : un pod électrique sous chaque coque, aileron vers x = −8,6, hélices contrarotatives (comme le
  DIÈDRE 29, à l'échelle), anodes zinc ; propulseur d'étrave dans chaque coque vers x = 9,5.
- Feux de navigation : boîtiers `metalDark` avec lentilles `navRed` (bâbord) / `navGreen` (tribord) sur les
  flancs avant du salon, `navWhite` en haut du hardtop.

## Qualité attendue (même niveau que le DIÈDRE 29 refait)
Formes arrondies et lisses (sous-division / splines / fillets à grand rayon), aucune facette ni arête vive visible sauf joints volontaires, topologie propre, détails
crédibles et sobres, aucun trou ni face inversée (test backface culling), aucune interpénétration visible entre
modules (vérifie avec les autres parts quand elles existent). Budget web : coques+ponts ≤ 350 k triangles,
superstructure+toit+vitrages ≤ 150 k, intérieur+mobilier ≤ 250 k.
