"""Lignes de coque DIÈDRE 29 — portage exact de js/boat.js (knuckleW, sheer, deckY, knuckleY, section).

Repère three.js : +X avant (étrave), +Y haut, +Z tribord, flottaison y = 0, mètres.
Repère Blender (Z haut) : utiliser to_bl((x, y, z)) -> (x, -z, y). L'export glTF (+Y up) le reconvertit
exactement en repère three.js : x_three = x_bl, y_three = z_bl, z_three = -y_bl.
"""
import math

XS = -13.2      # tableau arrière
XB = 14.4       # étrave
XP = -14.4      # bord arrière de la plateforme de bain
X_STAIR = -11.9 # haut de l'escalier
Z_STAIR = 1.25  # demi-largeur de l'escalier
Y_PLAT = 0.35   # plateforme de bain
KMAX = 3.85     # demi-largeur max à l'arête du dièdre

TUMBLE = math.tan(math.radians(19))  # dévers du panneau haut
FLARE = math.tan(math.radians(15))   # évasement du panneau bas


def clamp01(t):
    return max(0.0, min(1.0, t))


def ss(e0, e1, x):
    t = clamp01((x - e0) / (e1 - e0))
    return t * t * (3 - 2 * t)


def knuckleW(x):
    d = XB - x
    t = min(d / 19.5, 1.0)
    w = KMAX * (1 - math.pow(1 - t, 2.5)) if t < 1 else KMAX
    a = ss(-9, XS, x)
    w -= 0.5 * a * a
    return max(w, 0.0)


def sheer(x):
    return 1.88 + 0.22 * math.pow(ss(-6, XB, x), 1.6)


def deckY(x):
    return sheer(x) - 0.13


def knuckleY(x):
    return 1.07 + 0.74 * math.pow(ss(-6, XB, x), 2)


def section(x):
    """Demi-section à l'abscisse x (repère three.js). Points du profil, de la quille au livet :
    (0, keel) -> (chZ, chY) bouchain -> (knZ, knY) arête du dièdre (point le plus large) -> (W, sheer) livet."""
    K = knuckleW(x) * (1 - 0.12 * clamp01((XS + 0.6 - x) / 0.6))
    s = K / KMAX
    sh = sheer(x)
    knY = knuckleY(x)
    chY = -0.05 + 0.6 * math.pow(ss(-2, XB, x), 1.5)
    W = max(K - (sh - knY) * TUMBLE * s, 0.0)
    return {
        'W': W, 'sheer': sh,
        'keel': -1.1 + 0.75 * math.pow(ss(4, XB, x), 1.3) + 0.35 * ss(-6, XS, x),
        'chZ': max(K - (knY - chY) * FLARE * s, 0.0), 'chY': chY,
        'knZ': K, 'knY': knY,
    }


def halfW(x):
    return section(x)['W']


def to_bl(p):
    """(x, y, z) three.js -> (x, y, z) Blender."""
    x, y, z = p
    return (x, -z, y)
