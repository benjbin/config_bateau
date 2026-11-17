# SILLAGE 29 — pont inférieur (cabines dans les coques)

Complément de `S29_SPEC.md` (mêmes règles : design ORIGINAL NEOKROME, formes arrondies, luxe moderne,
matériaux de la liste, repère three.js, cotes `lib/s29_lines.py`). Programme classique d'un catamaran de ~29 m
(ne pas recopier le plan d'un chantier existant) : 1 suite propriétaire, 2 cabines invités, quartier équipage,
locaux techniques, garage à jouets.

## Groupe three.js
Nouveau groupe **`cabins`** (déclaré dans build.py). Il n'est affiché que dans la vue « Cabines » du configurateur :
tout ce qui est au-dessus du pont principal est alors masqué et la coque est coupée net à **y = 2,05** (plan de
section horizontal ; les faces arrière coupées sont teintées « coupe »). Tout ce qui est dans `cabins` doit donc rester
**sous y = 2,05**, et l'aménagement doit être lisible et « fini » vu de dessus (comme un plan d'architecte en 3D).

## Implantation (à affiner selon les formes réelles de s29_hull.py — mesure l'intérieur de la coque)
- Plancher des cabines vers y ≈ 0,30–0,45 (suit le fond), plafond = dessous du pont (≈ 2,25) ; hauteur sous barrots ≈ 1,95.
- Coque **bâbord** (z < 0) : suite propriétaire au milieu (lit double ~1,80 × 2,00, tête de lit capitonnée, chevets,
  canapé ou bureau, dressing), salle de bain en suite (double vasque, douche italienne vitrée, WC), escalier depuis le
  salon vers x ≈ −4 ; local technique / moteurs à l'arrière (cloison fermée, porte).
- Coque **tribord** (z > 0) : 2 cabines invités (lit double, chevets, rangement) chacune avec salle d'eau, escalier
  depuis le salon ; local technique arrière.
- **Avant des deux coques** : équipage (cabine à 2 couchettes superposées + cabine capitaine, carré équipage /
  buanderie, salle d'eau), accès par panneau de pont.
- Coursives, portes (cadres `metalDark`), cloisons en `woodInterior` (boiseries) ou `ceiling` (laqué clair).
- **Garage** entre les coques sous le cockpit (porte arrière existante, hauteur libre ~0,8 m) : 2 scooters sous-marins
  et planches de paddle sur racks (pas de jet-ski : hauteur insuffisante).
- Escaliers : ouvertures dans le plancher du salon (`s29_interior.py`) et le pont (`s29_hull.py`) aux trémies choisies ;
  tu peux modifier ces deux fichiers UNIQUEMENT pour percer ces trémies (et garde-corps), rien d'autre.

## Matériaux
Planchers `interiorFloor` ; cloisons/boiseries `woodInterior` ; murs laqués/plafonds/linge de lit `ceiling` ;
têtes de lit, coussins, canapés `upholsteryInterior` ; plans vasques/douches `acrylic` (pierre fumée) ou `woodInterior` ;
robinetterie, poignées `chrome` ; parois de douche `glass` ; cadres `metalDark` ; LED `ledStrip`.

## Budget
≤ 180 k triangles pour `cabins`. Aucun objet ne traverse la coque (vérifie avec les vraies surfaces de s29_hull).
