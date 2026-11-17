"""SILLAGE 29 — super-catamaran à voile électrique (NEOKROME) : cotes de référence partagées par TOUTE l'équipe.

Remplace le DIÈDRE 24. 28,7 m × 12,8 m. Design original NEOKROME (formes arrondies, luxe moderne) — ne copie
aucun yacht existant.

Repère three.js : +X avant, +Y haut, +Z tribord, flottaison y = 0, mètres. to_bl() pour Blender (lib/lines.py).
Deux coques symétriques centrées en z = ±HULL_Z reliées par la nef (bridgedeck) ; pont principal plat à DECK_Y ;
salon de pont ; flybridge au-dessus du salon (pont FLY_Y) abrité par un hardtop solaire ; mât carbone en avant
du salon, bôme à enrouleur au-dessus du hardtop, foc enroulé sur l'étai.
"""
import math
from lines import clamp01, ss, to_bl  # noqa: F401

LOA = 28.7
XB = 14.35         # étraves (les deux coques)
XS = -13.70        # tableau arrière des coques
XP = -14.35        # bord arrière des plateformes de bain de chaque coque
HULL_Z = 4.75      # axe de chaque coque (|z|)
KMAX = 1.65        # demi-largeur max d'UNE coque (point le plus large du flanc bombé) -> 2*(4.75+1.65) = 12,8 m
TUMBLE = math.tan(math.radians(14))   # rentrée du flanc haut (galbe, pas d'arête vive)
FLARE = math.tan(math.radians(12))

DECK_Y = 2.35      # pont principal (cockpit, passavants, pont avant), surface du teck
TUNNEL_Y = 1.30    # dessous de la nef entre les coques
X_NEF_FWD = 8.6    # avant de la nef pleine (en avant : pont avant/lounge avant puis pointes des coques)
X_FWD_BEAM = 13.0  # poutre avant (bout-dehors/étai) entre les étraves, dessus à y = 2.70
Y_PLAT = 0.45      # plateformes de bain (arrière de chaque coque)

# Grande plateforme arrière « lounge mer » entre les coques (abaissée = position de la maquette) :
AFT_LOUNGE = (-14.6, -12.2, 3.2, 0.55)   # (x0, x1, demi-largeur z, y dessus) ; garage à annexe/jet sous le cockpit
# Terrasses latérales rabattables (pavois ouverts en balcons) sur le flanc extérieur de chaque coque :
TERRACE = (-11.6, -8.0, 1.05, 2.30)      # (x0, x1, débord hors coque en z, y dessus) — ouvertes sur la maquette

# Salon de pont
SALON_X0, SALON_X1 = -5.2, 6.6     # baie vitrée arrière -> pied du pare-brise (pare-brise incliné de 38° sur la
                                   # verticale : son haut rejoint le toit vers x ≈ 4,7, sous la casquette du flybridge)
SALON_ZH = 5.05                    # demi-largeur extérieure du salon (passavants ~1,0 m + pavois)
SALON_FLOOR_Y = 2.40
SALON_CEIL_Y = 4.70
FLY_Y = 5.00                       # pont du flybridge (= dessus du toit du salon), teck
FLY_X0, FLY_X1 = -9.8, 5.3         # pont du flybridge : déborde vers l'arrière (couvre le cockpit) et vers l'avant
                                   # (casquette arrondie au-dessus du pare-brise)
FLY_ZH = 5.20                      # demi-largeur du pont flybridge (casquette au-dessus des passavants)
# Hardtop du flybridge (solaire)
HT_Y = 7.55                        # dessus du hardtop
HT_X0, HT_X1 = -8.8, 3.6
HT_ZH = 4.90
HT_PILLARS = [(-8.2, 3.9), (-8.2, -3.9), (2.2, 4.4), (2.2, -4.4)]   # (x, z) montants (profil en aile)
SOLAR_HT = (-8.4, 3.2, 4.55)       # panneaux sur le hardtop (x0, x1, |z|max)
FLY_STAIR = (-9.6, -6.4, 3.4)      # escalier cockpit -> flybridge, tribord arrière : x0, x1, z centre
FLY_HELM = (3.4, 2.0)              # poste de barre du flybridge : x centre, z centre (tribord)

# Cockpit arrière : x XS .. SALON_X0, sous la casquette du flybridge ; pont avant : X_NEF_FWD .. X_FWD_BEAM
# (lounge avant creusé avec canapé en arc), filet/plage avant en teck

# Gréement (sloop, mât carbone sur le roof avant du salon)
MAST_X = 7.6                       # pied de mât (x), z = 0 : sur le pont, juste devant le pied du pare-brise
MAST_Y0 = DECK_Y                   # pied du mât (embase carbone sur la nef, structure de compression)
MAST_TOP_Y = 38.0                  # tête de mât au-dessus de l'eau
MAST_CHORD, MAST_WIDTH = 0.62, 0.30  # section en aile (longueur, épaisseur) au pied ; effilée vers le haut
BOOM_Y = 8.35                      # axe de la bôme (enrouleur), au-dessus du hardtop
BOOM_X1 = -8.6                     # bout de bôme (arrière)
FORESTAY = ((13.0, 2.95, 0.0), (7.75, 35.2, 0.0))   # étai : point bas sur la poutre avant -> sur le mât
CHAINPLATES = [(4.6, 2.62, 6.05), (4.6, 2.62, -6.05)]  # cadènes des haubans (flanc extérieur, au livet)
SPREADERS_Y = [14.0, 22.5, 30.5]   # barres de flèche

# Propulsion : un pod électrique sous chaque coque, axe x = -10.4, z = ±HULL_Z ; propulseur d'étrave x = 11.6


def knuckleW(x):
    """Demi-largeur max d'une coque (point le plus large du flanc bombé)."""
    d = XB - x
    t = min(d / 11.5, 1.0)
    w = KMAX * (1 - (1 - t) ** 2.2)
    a = ss(-10.0, XS, x)
    return max(w - 0.14 * a * a, 0.0)


def sheer(x):
    return 2.45 + 0.25 * ss(-5, XB, x) ** 1.6   # livet = haut du pavois bas (pont à DECK_Y)


def deckY(x):
    return DECK_Y + 0.0 * x


def knuckleY(x):
    return 1.15 + 0.60 * ss(-5, XB, x) ** 2


def section(x):
    """Demi-section d'UNE coque (côté extérieur), z mesuré depuis l'axe de la coque.
    quille (0, keel) -> bouchain arrondi (chZ, chY) -> point le plus large (knZ, knY) -> livet (W, sheer).
    Toutes ces « arêtes » sont des points de passage de courbes lisses (rayons ≥ 0,4 m), pas des arêtes vives."""
    K = knuckleW(x) * (1 - 0.10 * clamp01((XS + 0.5 - x) / 0.5))
    s = K / KMAX if KMAX else 0
    sh = sheer(x)
    knY = knuckleY(x)
    chY = -0.10 + 0.55 * ss(-2, XB, x) ** 1.5
    W = max(K - (sh - knY) * TUMBLE * s, 0.0)
    return {
        'W': W, 'sheer': sh,
        'keel': -1.10 + 0.72 * ss(3, XB, x) ** 1.3 + 0.28 * ss(-7, XS, x),
        'chZ': max(K - (knY - chY) * FLARE * s, 0.0), 'chY': chY,
        'knZ': K, 'knY': knY,
    }


def hull_z(side):
    return side * HULL_Z
