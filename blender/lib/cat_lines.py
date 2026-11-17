"""DIÈDRE 24 Catamaran — lignes de référence partagées par TOUTE l'équipe (coques, superstructure, intérieur).

Repère three.js : +X avant, +Y haut, +Z tribord, flottaison y = 0, mètres. to_bl() pour Blender (lib/lines.py).
Même ADN que le DIÈDRE 29 : étrave verticale, arête vive « dièdre » (point le plus large), flanc bas laqué
('hull') évasé, flanc haut métal ('accent') en dévers rentrant, fond antifouling ('hullBottom').

Deux demi-coques symétriques centrées en z = ±HULL_Z, reliées par la nef (bridgedeck) dont le dessous est à
TUNNEL_Y au-dessus de l'eau. Pont principal plat à DECK_Y sur toute la largeur.
"""
import math
from lines import clamp01, ss, to_bl  # noqa: F401

LOA = 24.0
XB = 12.0          # étrave (les deux coques)
XS = -11.4         # tableau arrière des coques
XP = -12.0         # bord arrière des plateformes de bain (une par coque)
HULL_Z = 3.75      # axe de chaque coque (|z|)
KMAX = 1.35        # demi-largeur max d'UNE coque à l'arête -> largeur hors tout = 2*(3.75+1.35) = 10,2 m
TUMBLE = math.tan(math.radians(19))
FLARE = math.tan(math.radians(15))

DECK_Y = 1.95      # pont principal (cockpit arrière, passavants, plage avant), surface du teck
TUNNEL_Y = 1.05    # dessous de la nef entre les coques
X_NEF_FWD = 7.2    # avant de la nef pleine (en avant : pont avant réduit puis pointes des coques)
Y_PLAT = 0.40      # plateformes de bain (arrière de chaque coque)

# Salon (superstructure vitrée) et hardtop
SALON_X0, SALON_X1 = -4.8, 5.4      # cloison/portes vitrées arrière -> pied du pare-brise
SALON_ZH = 4.00                      # demi-largeur extérieure du salon (passavants ~0,7 m de chaque côté)
SALON_FLOOR_Y = 2.00                 # plancher intérieur
SALON_CEIL_Y = 4.15                  # plafond intérieur
ROOF_Y = 4.40                        # dessus du hardtop
HARDTOP_X0, HARDTOP_X1 = -10.6, 6.0  # hardtop : du dessus du cockpit à l'avant du pare-brise
PILLARS = [(-10.15, 2.6), (-10.15, -2.6), (-10.15, 4.55), (-10.15, -4.55)]  # (x, z) montants arrière fins
SOLAR = (-9.8, 5.4, 4.0)             # (x0, x1, demi-largeur z) panneaux solaires intégrés au hardtop

# Cockpit arrière (teck) : x -11.4 .. -4.8 ; plage avant : x 5.4 .. 10.5 (bain de soleil)
# Pods électriques : un sous chaque coque, axe x = -8.6, z = ±HULL_Z


def knuckleW(x):
    """Demi-largeur d'une coque à l'arête."""
    d = XB - x
    t = min(d / 10.0, 1.0)
    w = KMAX * (1 - (1 - t) ** 2.2)
    a = ss(-8.5, XS, x)
    return max(w - 0.12 * a * a, 0.0)


def sheer(x):
    return 2.05 + 0.20 * ss(-4, XB, x) ** 1.6   # livet = haut du pavois bas (pont à DECK_Y)


def deckY(x):
    return DECK_Y + 0.0 * x  # pont plat (le livet monte un peu à l'avant : pavois bas)


def knuckleY(x):
    return 0.95 + 0.55 * ss(-4, XB, x) ** 2


def section(x):
    """Demi-section d'UNE coque (côté extérieur), en coordonnées locales (z mesuré depuis l'axe de la coque).
    Profil : quille (0, keel) -> bouchain (chZ, chY) -> arête (knZ, knY) -> livet (W, sheer).
    Le côté intérieur (vers le tunnel) est le miroir jusqu'à l'arête puis rejoint TUNNEL_Y."""
    K = knuckleW(x) * (1 - 0.10 * clamp01((XS + 0.5 - x) / 0.5))
    s = K / KMAX if KMAX else 0
    sh = sheer(x)
    knY = knuckleY(x)
    chY = -0.12 + 0.48 * ss(-2, XB, x) ** 1.5
    W = max(K - (sh - knY) * TUMBLE * s, 0.0)
    return {
        'W': W, 'sheer': sh,
        'keel': -0.95 + 0.62 * ss(3, XB, x) ** 1.3 + 0.25 * ss(-6, XS, x),
        'chZ': max(K - (knY - chY) * FLARE * s, 0.0), 'chY': chY,
        'knZ': K, 'knY': knY,
    }


def hull_z(side):
    """Axe de la coque : side = +1 tribord, -1 bâbord."""
    return side * HULL_Z
