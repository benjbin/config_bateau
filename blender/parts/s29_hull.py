"""SILLAGE 29 — groupe three.js 'hull' : 2 coques arrondies, nef (tunnel 1,30, nez en V doux), poutre avant,
ponts en teck (cockpit, passavants, pont avant plein + lounge avant creusé), pavois bas à plat-bord 'accent',
bandes vitrées de coque (cabines), escaliers de tableau + plateformes de bain, plateforme « lounge mer » abaissée
entre les coques (porte de garage dans la face arrière de nef), terrasses latérales rabattues (balcons),
accastillerie (taquets, chaumards, cadènes CHAINPLATES, ferrure d'étai), embase de mât, pods électriques +
hélices contrarotatives + anodes, propulseurs d'étrave.

Repère three.js (+X avant, +Y haut, +Z tribord, mètres), converti par make_obj (hull.py). Cotes : lib/s29_lines.py.
Adapté du module DIÈDRE 24 (parts/cat_hull.py) : un seul maillage quad soudé par coque+nef, sections = polygones
de contrôle dont chaque sommet est remplacé par un congé (Bézier quadratique, topologie constante).

Cotes choisies (absentes de s29_lines, à garder cohérentes dans les autres modules) :
  PAVOIS : épaisseur 0,12 ; haut = livet sheer(x) (2,45 → 2,70) ; plat-bord 'accent' arrondi (r 5 cm).
  NEF : dessous plat 1,30 jusqu'à x = 3,0 puis remontée (smoothstep) jusqu'à 1,80 aux flancs en x = 8,6, V doux
        arrondi (axe 0,34 plus bas vers x = 7,6, 0,14 au bord avant).
  PONT AVANT plein entre les coques : x 8,6 → X_FE = 12,73 (bord avant, sous la poutre avant).
  LOUNGE AVANT creusé : WELL = rectangle arrondi x 9,35 → 12,05, |z| ≤ 2,45, rayon 0,95 en plan ; fond teck
        y = 1,93 (0,42 sous le pont), parois 'superstructure', nez de marche 'accent'.
  POUTRE AVANT : x 12,73 → 13,27 (axe 13,0), dessus y = 2,70, dessous 2,24, de pavois intérieur à pavois
        intérieur ; ferrure d'étai chrome, œil en (13,0 ; 2,95 ; 0).
  ESCALIERS : 7 hauteurs de 0,271 (6 marches + plateforme), giron 0,27, haut X_STAIR = −12,08,
        |z| 4,26 → 5,22 (axe 4,74).
  PLATEFORMES de coque : y 0,08 → 0,45, x −14,35 → −13,66. LOUNGE MER : AFT_LOUNGE (x −14,6 → −12,2,
        |z| ≤ 3,2, dessus 0,55, épaisseur 0,24, angles arrière r 0,6), vérins chromés ; porte de garage
        |z| ≤ 2,55, y 1,38 → 2,22 dans la face arrière de nef (x = −13,70).
  TERRASSES : TERRACE (x −11,6 → −8,0, débord 1,05, dessus 2,30, épaisseur 0,14) ; pavois abaissé au niveau
        du pont (2,362) sur x −11,55 → −8,05 (rampes de 0,18) ; garde-corps verre + main courante inox h 1,0 ;
        joint 'metalDark' du logement du panneau sur le flanc (y 1,25 → 2,28).
  HUBLOTS DE COQUE : 4 vitrages allongés par flanc extérieur, x [−7,4 ; −3,3], [−2,6 ; 1,6], [2,25 ; 4,15], [5,05 ; 6,45],
        haut = livet − 0,40, hauteur 0,36 ; cadre 'metalDark' 3 cm.
  EMBASE DE MÂT : ellipse 1,00 × 0,58 en (7,6 ; 2,35 ; 0), hauteur 0,11 (carbone 'metalDark').
  PODS : échelle 1,0 (D29), aileron centré x ≈ −10,4 ; PROPULSEURS D'ÉTRAVE : x = 11,6, y = −0,05, Ø 0,32.
  PANNEAUX DE PONT fumés : x = 8,2 et 10,9 sur l'axe de chaque coque.
  SALON : lattes arrêtées sous l'emprise (rectangle arrondi |z| ≤ 5,01, x −5,18 → 6,56, angles avant r 2,2) —
        le pont reste continu (fond 'hullBottom') sous le salon.
"""
import math
import bpy
import bmesh
from mathutils import Vector, Matrix

from s29_lines import (XS, XB, XP, HULL_Z, KMAX, TUMBLE, FLARE, DECK_Y, TUNNEL_Y, X_NEF_FWD, Y_PLAT,
                       SALON_X0, SALON_X1, SALON_ZH, AFT_LOUNGE, TERRACE, CHAINPLATES, MAST_X, FORESTAY,
                       X_FWD_BEAM, clamp01, ss, knuckleW, sheer, knuckleY)
from s29_lines import section as _section0
from hull import (MB, make_obj, add_bevel, add_wn, box, loft_rows, lathe, tube, rbox_mb, rrect, sweep,
                  mat_at, on_normal, Frame, piece_sections, split_butts, plank_geo, _hash, _newell,
                  cleat_mb, fairlead_mb, nibM, nibK, smax, PL, GAP, MW, CAULK_D)
from propulsion import fix_closed, fix_dir, nacelle_profile, naca, blade_set, NAC_R, NAC_LEN

# ---------------------------------------------------------------------------
# cotes propres au module
# ---------------------------------------------------------------------------
YD = DECK_Y - CAULK_D      # niveau du fond calfaté (bas des faces de pavois, haut des tableaux)
BT = 0.12                  # épaisseur du pavois bas
X_R0 = 3.0                 # début de la remontée de l'avant de nef
YFDU = 1.80                # dessous du pont avant (aux flancs)
VD, VDF = 0.34, 0.14       # creux du V de nef (max / au bord avant)
X_VD = 7.6
X_FE = 12.73               # bord avant du pont entre les coques (sous la poutre avant)
TF = 0.09
NT = 14                    # rangées du dessous de nef (flanc → axe)
Z_ST = 0.48                # demi-largeur des escaliers
ZC_ST = 4.74               # axe des escaliers (aligné sur le pas des lattes)
N_STEPS = 6
RISE_ST = (DECK_Y - Y_PLAT) / (N_STEPS + 1)
RUN_ST = 0.27
X_STAIR = XS + N_STEPS * RUN_ST    # haut des escaliers (-12,08)
ZS_IN, ZS_OUT = ZC_ST - Z_ST, ZC_ST + Z_ST   # 4,26 / 5,22
ZSAL = SALON_ZH - 0.04     # début des lattes de passavant (sous la paroi du salon)
SX0B, SX1B = SALON_X0 + 0.02, SALON_X1 - 0.04
RSAL = 2.2                 # rayon des angles avant de l'emprise du salon (minorant prudent)
POD_S = 1.0
X_NOSE = -9.45
X_THR, Y_THR, R_THR = 11.6, -0.05, 0.16
R_NOSE, L_NOSE = 0.30, 0.40   # nez d'étrave arrondi en plan
# lounge avant creusé
WX0, WX1, WZ, WR, WFY = 9.35, 12.05, 2.45, 0.95, 1.93
WNOSE = 0.035
WSTEP = (0.36, 0.60)       # marche du lounge avant : profondeur (x depuis WX0), demi-largeur ; dessus 2,14              # largeur du nez de marche du bord du lounge
WXC, WHX = 0.5 * (WX0 + WX1), 0.5 * (WX1 - WX0)
# terrasses
TX0, TX1, TOUT, TY = TERRACE
YCUT = DECK_Y + 0.012      # pavois abaissé au droit des terrasses
TRAMP = 0.18
# poutre avant
BX0, BX1, BYT, BYB = 12.73, 13.27, 2.70, 2.08


def terr_cut(x):
    """0..1 : abaissement du pavois au droit de la terrasse (rampes arrondies)."""
    return ss(TX0 - TRAMP + 0.05, TX0 + 0.05, x) * (1 - ss(TX1 - 0.05, TX1 + TRAMP - 0.05, x))


def wz(x):
    """demi-largeur (|z|) du lounge avant creusé à l'abscisse x (0 hors du lounge)."""
    d = abs(x - WXC) - (WHX - WR)
    if d <= 0:
        return WZ
    if d >= WR:
        return 0.0
    return WZ - WR + math.sqrt(WR * WR - d * d)


# ---------------------------------------------------------------------------
# lignes dérivées
# ---------------------------------------------------------------------------
def section(x):
    """section de cat_lines adoucie : pan coupé arrière lissé (smoothstep sur 1,4 m au lieu d'une rampe
    linéaire) et nez d'étrave arrondi en plan (demi-largeur ~ sqrt(2 R d) près de l'étrave)."""
    s = dict(_section0(x))
    K0 = s['knZ']
    if K0 <= 1e-9:
        return s
    g = (1 - 0.10 * ss(XS + 1.4, XS, x)) / (1 - 0.10 * clamp01((XS + 0.5 - x) / 0.5))
    K1 = K0 * g
    d = max(XB - x, 0.0)
    g *= math.sqrt(K1 * K1 + 2 * R_NOSE * d * math.exp(-d / L_NOSE)) / K1
    for k in ('W', 'knZ', 'chZ'):
        s[k] *= g
    return s


def W_of(x):
    return section(x)['W']


def za_of(x):
    return max(W_of(x) - BT, 0.0)


def e_of(x):
    """face intérieure du pavois extérieur (|z|)."""
    return HULL_Z + za_of(x)


def sh_in(x):
    """livet du pavois intérieur des pointes (x >= X_FE) : à hauteur du livet (la poutre avant s'y raccorde)."""
    return sheer(x)


def W_in(x):
    return P_side(section(x), sh_in(x))


def za_in(x):
    return max(W_in(x) - BT, 0.0)


def zif_of(x):
    """face intérieure du pavois intérieur des pointes (|z|), x >= X_FE."""
    return HULL_Z - za_in(x)


def base_y(x):
    return TUNNEL_Y + (YFDU - TUNNEL_Y) * ss(X_R0, X_NEF_FWD, x)


def vdepth(x):
    return VD * ss(X_R0, X_VD, x) - (VD - VDF) * ss(X_VD, X_FE, x)


def sabs(z, c=0.5):
    return math.sqrt(z * z + c * c) - c


def lerp2(p, q, t):
    return (p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t)


def P_side(s, y):
    """zl (depuis l'axe de coque) du flanc polygonal de référence à la hauteur y (panneau bas puis haut)."""
    if y <= s['knY']:
        d = s['knY'] - s['chY']
        t = (y - s['chY']) / d if d > 1e-9 else 0.0
        return s['chZ'] + t * (s['knZ'] - s['chZ'])
    d = s['sheer'] - s['knY']
    t = (y - s['knY']) / d if d > 1e-9 else 0.0
    return s['knZ'] + t * (s['W'] - s['knZ'])


def P_low(s, y):
    """prolongement du panneau bas (bouchain → point le plus large) à la hauteur y."""
    d = s['knY'] - s['chY']
    t = (y - s['chY']) / d if d > 1e-9 else 0.0
    return s['chZ'] + t * (s['knZ'] - s['chZ'])


# --- profils arrondis : polygone de contrôle + congés (Bézier quadratiques, nombre de points FIXE) -------
def _sub(a, b):
    return (a[0] - b[0], a[1] - b[1])


def _unit(v):
    l = math.hypot(v[0], v[1])
    return ((v[0] / l, v[1] / l), l) if l > 1e-9 else ((0.0, 0.0), 0.0)


def bez(a, c, b, t):
    return tuple((1 - t) ** 2 * a[i] + 2 * t * (1 - t) * c[i] + t * t * b[i] for i in (0, 1))


def fillet(p, q, r, R, tmax=None):
    """congé de rayon ~R au sommet q (entre p→q et q→r) : (A, B) points de tangence."""
    u1, l1 = _unit(_sub(q, p))
    u2, l2 = _unit(_sub(r, q))
    c = max(-1.0, min(1.0, u1[0] * u2[0] + u1[1] * u2[1]))
    defl = math.acos(c)
    t = R * math.tan(defl / 2)
    t = min(t, 0.45 * l1, 0.45 * l2)
    if tmax is not None:
        t = min(t, tmax)
    t = max(t, min(0.004, 0.3 * l1, 0.3 * l2))
    return (q[0] - u1[0] * t, q[1] - u1[1] * t), (q[0] + u2[0] * t, q[1] + u2[1] * t), t


def seg(a, b, n):
    """n points de a (exclu) à b (inclus)."""
    return [lerp2(a, b, k / n) for k in range(1, n + 1)]


def arc(a, q, b, n):
    return [bez(a, q, b, k / n) for k in range(1, n + 1)]


R_KEEL, R_CHINE, R_BILGE, R_CAP, R_TUN = 0.22, 0.35, 0.90, 0.05, 0.45
T_TUN = 0.22               # longueur de tangence max du congé coque / nef (rayon effectif ~0,26–0,30 m)
N_KEEL, N_BOT, N_CH, N_LOW, N_BIL, N_UP, N_LV, N_CAPS, N_FACE = 3, 3, 6, 4, 8, 4, 4, 1, 2


def keel_start(s):
    """quille arrondie : demi-congé symétrique, départ horizontal en zl = 0."""
    K = (s['keel'], 0.0)
    ch = (s['chY'], s['chZ'])
    u, l = _unit(_sub(ch, K))
    phi = math.atan2(u[0], u[1]) if l > 0 else 0.0     # angle de relevé du fond
    t = min(R_KEEL * math.tan(phi), 0.3 * l) if l > 0 else 0.0
    B = (K[0] + u[0] * t, K[1] + u[1] * t)
    S = (K[0] + 0.5 * t * u[0], 0.0)
    return [S] + arc(S, ((K[0] + B[0]) / 2, (K[1] + B[1]) / 2), B, N_KEEL), B


def lower_part(s, Qup):
    """quille → bouchain arrondi → flottaison (boot top) → jusqu'au début du congé suivant (Qup=(A, q))."""
    rows, Bk = keel_start(s)
    ch = (s['chY'], s['chZ'])
    Ach, Bch, _ = fillet(Bk, ch, Qup, R_CHINE)
    rows += seg(Bk, Ach, N_BOT) + arc(Ach, ch, Bch, N_CH)
    return rows, Bch


def boot(Bch, Aup):
    yw = min(max(Bch[0] + 0.02, 0.10), Aup[0] - 0.05)
    t = (yw - Bch[0]) / (Aup[0] - Bch[0]) if abs(Aup[0] - Bch[0]) > 1e-9 else 0.5
    t = min(max(t, 0.05), 0.6)
    W = lerp2(Bch, Aup, t)
    return [W] + seg(W, Aup, N_LOW - 1)


def cap_part(lv, za, Ain, prev):
    """livet arrondi + plat-bord en jonc (2 congés r 5 cm) + face intérieure du pavois jusqu'au pont."""
    capI = (lv[0], za)
    face = (YD, za)
    Alv, Blv, _ = fillet(prev, lv, capI, R_CAP)
    Aci, Bci, _ = fillet(lv, capI, face, R_CAP)
    return seg(Ain, Alv, N_UP) + arc(Alv, lv, Blv, N_LV) + seg(Blv, Aci, N_CAPS) + arc(Aci, capI, Bci, N_LV) + seg(Bci, face, N_FACE)


def outer_rows(x):
    s = section(x)
    c = terr_cut(x)
    yl = s['sheer'] + (YCUT - s['sheer']) * c
    kn, lv = (s['knY'], s['knZ']), (yl, P_side(s, yl))
    ch = (s['chY'], s['chZ'])
    Akn, Bkn, _ = fillet(ch, kn, lv, R_BILGE)
    rows, Bch = lower_part(s, kn)
    rows += boot(Bch, Akn) + arc(Akn, kn, Bkn, N_BIL)
    rows += cap_part(lv, za_of(x), Bkn, kn)
    return rows


# indices (profil extérieur)
O_WL = 1 + N_KEEL + N_BOT + N_CH                 # rangée de flottaison (boot top)
O_JONC = O_WL + N_LOW - 1 + N_BIL // 2               # milieu du congé de bouchain haut = point le plus large
O_CAPEND = O_JONC + N_BIL // 2 + N_UP + N_LV + N_CAPS + N_LV
NO_ROWS = O_CAPEND + N_FACE + 1
O_CAPST = O_JONC + N_BIL // 2 + N_UP              # début du plat-bord arrondi ('accent')


def tunnel_geo(x):
    """géométrie du raccord intérieur (commune aux régions A et B) : C, congé, E."""
    s = section(x)
    b = base_y(x)
    C = (b, P_low(s, b))
    ch = (s['chY'], s['chZ'])
    zsC = HULL_Z - C[1]
    vd = vdepth(x)
    yu = lambda z: b - vd * (1 - sabs(z) / sabs(zsC))
    E_zl = C[1] + min(0.9, 0.45 * zsC)
    E = (yu(HULL_Z - E_zl), E_zl)
    AC, BC, tC = fillet(ch, C, E, R_TUN, tmax=T_TUN)
    return s, C, AC, BC, tC, E, yu, zsC


N_TC, N_CE = 10, 2


def innerA_rows(x):
    """côté intérieur + congé + dessous de nef : liste de (y, |z|) côté tribord."""
    s, C, AC, BC, tC, E, yu, zsC = tunnel_geo(x)
    rows, Bch = lower_part(s, C)
    rows += boot(Bch, AC) + arc(AC, C, BC, N_TC) + seg(BC, E, N_CE)
    out = [(y, HULL_Z - zl) for y, zl in rows]
    zE = HULL_Z - E[1]
    for k in range(1, NT + 1):
        z = zE * (1 - k / NT)
        out.append((yu(z), z))
    return out


A_C = O_WL + N_LOW - 1           # début du congé coque / nef (dernière rangée commune A/B)
A_E = A_C + N_TC + N_CE
NA_ROWS = A_E + NT + 1

_GP = None


def innerB_rows(x):
    """pointes de coques (x >= X_FE) : côté intérieur complet (miroir galbé) avec pavois intérieur galbé."""
    global _GP
    s, C, AC, BC, tC, E, yu, zsC = tunnel_geo(x)
    rows, Bch = lower_part(s, C)
    rows += boot(Bch, AC)
    yl = sh_in(x)
    lv = (yl, P_side(s, yl))
    u, l = _unit(_sub(lv, C))
    Bb = (C[0] + u[0] * tC, C[1] + u[1] * tC)
    rows += arc(AC, C, Bb, N_TC)
    za = za_in(x)
    Alv, _, _ = fillet(C, lv, (yl, za), R_CAP)
    if _GP is None:  # position relative du niveau du pont entre Bb et le début du congé de livet, en X_FE
        s0, C0, AC0, BC0, tC0, *_ = tunnel_geo(X_FE)
        yl0 = sh_in(X_FE)
        lv0 = (yl0, P_side(s0, yl0))
        u0, _ = _unit(_sub(lv0, C0))
        Bb0 = (C0[0] + u0[0] * tC0, C0[1] + u0[1] * tC0)
        Alv0, _, _ = fillet(C0, lv0, (yl0, za_in(X_FE)), R_CAP)
        _GP = (YD - Bb0[0]) / (Alv0[0] - Bb0[0])
    P = lerp2(Bb, Alv, _GP)
    rows += seg(Bb, P, 2) + cap_part(lv, za, P, C)
    return [(y, HULL_Z - zl) for y, zl in rows]


B_P = A_C + N_TC + 2
B_JONC = None
NB_ROWS = B_P + N_UP + N_LV + N_CAPS + N_LV + N_FACE + 1


def hull_stations():
    N = 170
    xs = [XS + (XB - XS) * (1 - (1 - i / N) ** 1.3) for i in range(N + 1)]
    xs += [XS + 0.04, X_FE, X_R0, X_NEF_FWD] + [X_FE + 0.08 * k for k in range(1, 18)]
    xs += [X_R0 + 0.3 * k for k in range(1, 33)]
    for xa in (TX0, TX1):   # rampes du pavois abaissé (terrasses)
        xs += [xa - TRAMP + 0.05 + 0.03 * k for k in range(int(TRAMP / 0.03) + 1)]
    xs += [TX0 + 0.05 + 0.25 * k for k in range(int((TX1 - TX0 - 0.1) / 0.25) + 1)] + [TX1 - 0.05]
    xs = sorted(set(round(x, 6) for x in xs if x < XB - 0.5))
    keep = {round(X_FE, 6), round(XS, 6)}
    out = []
    for x in xs:
        if out and x - out[-1] < 0.03:
            if x in keep and out[-1] not in keep:
                out[-1] = x
            continue
        out.append(x)
    # nez d'étrave arrondi : stations resserrées (largeur ~ racine de la distance à l'étrave)
    for d in (0.5, 0.42, 0.35, 0.28, 0.22, 0.165, 0.12, 0.08, 0.05, 0.028, 0.012, 0.003, 0.0):
        out.append(round(XB - d, 6))
    return out


# ---------------------------------------------------------------------------
# COQUES + NEF
# ---------------------------------------------------------------------------
def build_shell(ctx):
    xs = hull_stations()
    NS = len(xs)
    iFE = xs.index(round(X_FE, 6))
    mb = MB(weld=True)
    O, A, B = {}, {}, {}
    for i, x in enumerate(xs):
        for sd in (1, -1):
            for r, (y, zl) in enumerate(outer_rows(x)):
                O[(i, r, sd)] = mb.add((x, y, sd * (HULL_Z + zl)))
            if i <= iFE:
                for r, (y, z) in enumerate(innerA_rows(x)):
                    A[(i, r, sd)] = mb.add((x, y, sd * z))
            if i >= iFE:
                for r, (y, z) in enumerate(innerB_rows(x)):
                    B[(i, r, sd)] = mb.add((x, y, sd * z))
    NO, NA, NB = NO_ROWS, NA_ROWS, NB_ROWS
    assert len(outer_rows(0.0)) == NO and len(innerA_rows(0.0)) == NA and len(innerB_rows(11.0)) == NB
    # matériaux : 0 hullBottom, 1 hull, 2 accent
    matO = [0] * O_WL + [1] * (O_CAPST - O_WL) + [2] * (O_CAPEND - O_CAPST) + [1] * (NO - O_CAPEND)
    matA = [0] * O_WL + [1] * (A_C - O_WL) + [0] * (NA - A_C)
    matB = [0] * O_WL + [1] * (B_P + N_UP - O_WL) + [2] * (2 * N_LV + N_CAPS) + [1] * (N_FACE + 1)

    def quad(D, i, r, sd, flip, m):
        q = [D[(i, r, sd)], D[(i + 1, r, sd)], D[(i + 1, r + 1, sd)], D[(i, r + 1, sd)]]
        if all(abs(abs(mb.v[k][2]) - HULL_Z) < 1e-6 for k in q) and xs[i] > XB - 1.0:
            return  # cloison nulle dans le plan d'axe (pavois soudés au nez)
        mb.face(list(reversed(q)) if flip else q, m)

    for sd in (1, -1):
        for i in range(NS - 1):
            for r in range(NO - 1):
                quad(O, i, r, sd, sd < 0, matO[r])
            if i < iFE:
                for r in range(NA - 1):
                    quad(A, i, r, sd, sd > 0, matA[r])
            else:
                for r in range(NB - 1):
                    quad(B, i, r, sd, sd > 0, matB[r])

    for sd in (1, -1):
        # tableau arrière (découpe d'escalier) + face arrière de nef
        S = [mb.add((XS, YD, sd * ZS_OUT)), mb.add((XS, Y_PLAT, sd * ZS_OUT)),
             mb.add((XS, Y_PLAT, sd * ZS_IN)), mb.add((XS, YD, sd * ZS_IN))]
        D0 = mb.add((XS, YD, 0.0))
        ring = [O[(0, r, sd)] for r in range(NO)] + S + [D0] + [A[(0, r, sd)] for r in range(NA - 1, 0, -1)]
        mb.face_o(ring, 1, (-1, 0, 0))
        for r in range(NO - N_FACE - 1):
            mb.ewt('bw_round', O[(0, r, sd)], O[(0, r + 1, sd)], 1.0)
        for r in range(NA - 1):
            mb.ewt('bw_round', A[(0, r, sd)], A[(0, r + 1, sd)], 1.0)
        # joues d'escalier
        jx = [XS + (X_STAIR - XS) * k / N_STEPS for k in range(N_STEPS + 1)]
        for zc, w in ((ZS_OUT, -1), (ZS_IN, 1)):
            top = [mb.add((x, YD, sd * zc)) for x in jx]
            bot = [mb.add((x, Y_PLAT, sd * zc)) for x in jx]
            for k in range(N_STEPS):
                mb.face_o([bot[k], bot[k + 1], top[k + 1], top[k]], 1, (0, 0, sd * w))
        mb.ewt('bw_round', S[0], S[1], 1.0)
        mb.ewt('bw_round', S[2], S[3], 1.0)
        mb.ewt('bw_plain', S[1], S[2], 0.5)
        # face avant du pont avant (normale +x) et about du pavois intérieur (normale -x)
        Df = mb.add((X_FE, YD, 0.0))
        ring = [B[(iFE, r, sd)] for r in range(B_P, A_C, -1)] + [A[(iFE, r, sd)] for r in range(A_C, NA)] + [Df]
        mb.face_o(ring, 1, (1, 0, 0))
        ring = [B[(iFE, r, sd)] for r in range(B_P, NB)]
        mb.face_o(ring, 2, (-1, 0, 0))
        for r in range(A_C, B_P):
            mb.ewt('bw_round', B[(iFE, r, sd)], B[(iFE, r + 1, sd)], 1.0)
        for r in range(A_C, NA - 1):
            mb.ewt('bw_round', A[(iFE, r, sd)], A[(iFE, r + 1, sd)], 1.0)
        for r in range(B_P, NB - 1):
            mb.ewt('bw_plain', B[(iFE, r, sd)], B[(iFE, r + 1, sd)], 0.4)
    ob = make_obj(ctx, 'hull_shell', mb, ['hullBottom', 'hull', 'accent'])
    add_bevel(ob, 0.03, 5, 'bw_round', mat=-1, name='bevel_round').use_clamp_overlap = True
    add_bevel(ob, 0.010, 3, 'bw_plain', mat=-1, name='bevel_plain')
    add_wn(ob)

    # joncs 'accent' au point le plus large (flanc extérieur sur toute la longueur)
    jm = MB()
    for sd in (1, -1):
        path, nrm = [], []
        for x in xs:
            if x < XS + 0.03 or x > XB - 0.3:
                continue
            rows = outer_rows(x)
            p, a, b = rows[O_JONC], rows[O_JONC - 1], rows[O_JONC + 1]
            t = _unit(_sub(b, a))[0]
            n = (-t[1], t[0])               # (dy, dzl) normale extérieure
            if n[1] < 0:
                n = (-n[0], -n[1])
            path.append((x, p[0] + n[0] * 0.004, sd * (HULL_Z + p[1] + n[1] * 0.004)))
        tube(jm, path, 0.011, 12, caps=True, round_caps=True)
    make_obj(ctx, 'hull_joncs', jm, ['accent'])
    return ob


# ---------------------------------------------------------------------------
# PONT EN TECK
# ---------------------------------------------------------------------------
class FrameD:
    """pont plat : u = x (fil), w = |z|, dy vertical."""

    def __init__(self, side):
        self.side = side

    def up(self, u):
        return Vector((0, 1, 0))

    def wdir(self):
        return Vector((0, 0, self.side))

    def p(self, u, w, dy):
        return Vector((u, DECK_Y + dy, self.side * w))


X0D = XS + 0.004


def deck_end():
    a, b = X_FE, XB
    for _ in range(60):
        m = 0.5 * (a + b)
        if za_of(m) > 0.004:
            a = m
        else:
            b = m
    return a


def eKm(x):
    return min(nibK(zif_of(x) + MW), e_of(x))


def eM(x):
    e = e_of(x)
    low = eKm(x) if x >= X_FE else 0.0
    return min(e, max(nibM(e - MW), low))


ZFM = None
XN = SX1B
SAL_PLAN = None


def _salon_plan():
    """pied du salon en plan : courbe B de s29_super (pied des vitrages, flancs z = ±5,02, angles avant
    arrondis, nez x 6,57) décalée de 4 cm vers l'intérieur -> limite des lattes, cachée sous l'allège.
    Repli (module construit seul / s29_super absent) : rectangle arrondi |z| <= 5,01, nez 6,56, angles r RSAL."""
    try:
        from s29_super import PATH_B
        pts = [(float(p[0]), float(p[1])) for p in PATH_B]
    except Exception as e:
        print('[s29_hull] s29_super.PATH_B indisponible, emprise de repli :', e)
        pts = []
        for k in range(41):
            a = k / 40 * math.pi / 2
            pts.append((SX1B - RSAL + RSAL * math.sin(a), (SALON_ZH - 0.03 - RSAL) + RSAL * math.cos(a)))
        pts.append((SX1B, 0.0))
        pts = [(SX0B, SALON_ZH - 0.03)] + pts
    half = [p for p in pts if p[1] >= -1e-9]
    half.sort(key=lambda p: (p[0], -p[1]))
    out = []
    for i, (x, z) in enumerate(half):
        a = half[max(i - 1, 0)]
        b = half[min(i + 1, len(half) - 1)]
        tx, tz = b[0] - a[0], b[1] - a[1]
        l = math.hypot(tx, tz) or 1.0
        n = (tz / l, -tx / l)
        if n[0] + n[1] < 0:
            n = (-n[0], -n[1])
        out.append((x - 0.04 * n[0], max(z - 0.04 * n[1], 0.0)))
    out = [p for p in out if p[0] > 1.0]
    out.sort(key=lambda p: p[0])
    return out


def salon_init():
    global SAL_PLAN, XN, ZSAL
    if SAL_PLAN is None:
        SAL_PLAN = _salon_plan()
        XN = SAL_PLAN[-1][0]
        ZSAL = SAL_PLAN[0][1]


def zex(x):
    """début des lattes (|z|) sous l'emprise du salon."""
    if x <= SAL_PLAN[0][0]:
        return ZSAL
    for (xa, za), (xb, zb) in zip(SAL_PLAN, SAL_PLAN[1:]):
        if xa <= x <= xb:
            t = (x - xa) / (xb - xa) if xb > xa else 0.0
            return min(ZSAL, za + t * (zb - za))
    return 0.0


def fields(x):
    if x >= X_FE:
        return [(eKm(x), eM(x))]
    M = eM(x)
    if x < X_STAIR:
        return [(0.0, ZS_IN), (ZS_OUT, M)]
    if SX0B <= x < XN:
        return [(zex(x), M)]
    if x >= X_FE - MW:
        return [(ZFM, M)]
    w = wz(x)
    if w > 0:
        return [(w + WNOSE, M)]
    return [(0.0, M)]


def _state(x):
    reg = (x >= X_STAIR) + (x >= SX0B) + (x >= XN) + (x >= X_FE - MW) + (x >= X_FE) + 10 * (wz(x) > 0)
    a = math.floor((e_of(x) - MW) / PL - 1 / 3)
    b = math.floor((zif_of(x) + MW) / PL - 2 / 3) if x >= X_FE else 0
    return (reg, a, b)


def curve_pts():
    """abscisses denses des angles arrondis (salon, lounge avant)."""
    pts = [p[0] for p in SAL_PLAN if p[0] > 2.0]
    for c in (WX0 + WR, WX1 - WR):
        sg = -1 if c < WXC else 1
        pts += [c + sg * WR * math.sin(k / 24 * math.pi / 2) for k in range(25)]
    return pts


def deck_stations(x1):
    fixed = {X0D, x1, X_STAIR, SX0B, XN, X_FE - MW, X_FE, WX0, WX1}
    fixed |= set(curve_pts())
    n = int((x1 - X0D) / 0.002)
    xp, sp = X0D, _state(X0D)
    for i in range(1, n + 1):
        x = X0D + (x1 - X0D) * i / n
        st = _state(x)
        if st != sp:
            lo_, hi_ = xp, x
            for _ in range(50):
                m = 0.5 * (lo_ + hi_)
                if _state(m) == sp:
                    lo_ = m
                else:
                    hi_ = m
            fixed.add(0.5 * (lo_ + hi_))
        xp, sp = x, st
    fixed = sorted(fixed)
    reg = []
    x = X0D
    while x < x1:
        x += 0.25 if x < 8.5 else 0.12
        if x < x1 and all(abs(x - f) > 0.03 for f in fixed):
            reg.append(x)
    out = []
    for x in sorted(set(fixed + reg)):
        if out and x - out[-1] < 0.004 and x not in (WX0, WX1, XN):
            continue
        out.append(x)
    return out


def simplify(secs):
    if len(secs) <= 2:
        return secs
    out = [secs[0]]
    for i in range(1, len(secs) - 1):
        a, b, c = out[-1], secs[i], secs[i + 1]
        if c[0] - a[0] < 1e-9:
            out.append(b)
            continue
        t = (b[0] - a[0]) / (c[0] - a[0])
        if abs(a[1] + t * (c[1] - a[1]) - b[1]) < 5e-5 and abs(a[2] + t * (c[2] - a[2]) - b[2]) < 5e-5:
            continue
        out.append(b)
    out.append(secs[-1])
    return out


def build_deck(ctx):
    global ZFM
    salon_init()
    ZFM = eKm(X_FE)
    x1 = deck_end()
    U = deck_stations(x1)
    boards = MB()

    def clip(fn):
        return lambda u: fn(u) if X0D - 1e-9 <= u <= x1 + 1e-9 else 0.0

    for side in (1, -1):
        fr = FrameD(side)
        # latte de rive (pavois extérieur), sur toute la longueur
        for run in piece_sections(lambda u: eM(u), lambda u: e_of(u), U, GAP / 2, 0.0, gend=GAP / 2):
            plank_geo(boards, simplify(run), fr, GAP / 2, 0.0, uvmode='s')
        # latte de rive du pavois intérieur des pointes
        Ut = [u for u in U if u >= X_FE - 1e-9]
        lo = lambda u: zif_of(u) if u >= X_FE - 1e-9 else 0.0
        hi = lambda u: eKm(u) if u >= X_FE - 1e-9 else 0.0
        for run in piece_sections(lo, hi, Ut, 0.0, GAP / 2, gend=GAP / 2):
            plank_geo(boards, simplify(run), fr, 0.0, GAP / 2, uvmode='s')
        # lattes courantes
        nb = int(e_of(-1.0) / PL) + 2
        for k in range(nb):
            z0, z1 = k * PL, (k + 1) * PL

            def bounds(u, z0=z0, z1=z1):
                if u < X0D - 1e-9 or u > x1 + 1e-9:
                    return (z0, z0)
                best, bw = (z0, z0), 0.0
                for L, H in fields(u):
                    a, b = max(z0, L), min(z1, H)
                    if b - a > bw:
                        best, bw = (a, b), b - a
                return best
            lo = lambda u, f=bounds: f(u)[0]
            hi = lambda u, f=bounds: f(u)[1]
            for run in piece_sections(lo, hi, U, GAP / 2, GAP / 2):
                Lp = 4.8
                off = _hash(k, side) * Lp
                butts = [XS + off + m * Lp for m in range(-1, 7)]
                for pl in split_butts(run, butts):
                    plank_geo(boards, simplify(pl), fr, GAP / 2, GAP / 2)
    # latte de rive transversale du bord avant (fil le long de z)
    fr = Frame('plat', y0=DECK_Y)
    secs = [(-ZFM, X_FE - MW, X_FE), (ZFM, X_FE - MW, X_FE)]
    for pl in split_butts(secs, [-2.2, 0.0, 2.2], minlen=0.9):
        plank_geo(boards, pl, fr, GAP / 2, 0.0, uvmode='s')
    make_obj(ctx, 'hull_deckBoards', boards, ['deck'])

    # fond calfaté continu (+ fond 'hullBottom' sous l'emprise du salon)
    caulk = MB(weld=True)
    xs = sorted(set([XS] + [u for u in U if u > XS] + [SALON_X0, XN, X_STAIR, X_FE, WX0, WX1] + curve_pts() +
                    [XS + 0.25 * k for k in range(int((x1 - XS) / 0.25) + 1)]))
    xs = [x for x in xs if x <= x1]
    for a, b in zip(xs, xs[1:]):
        if b - a < 1e-6:
            continue
        m = 0.5 * (a + b)
        if m < X_STAIR:
            iv = [(lambda x: 0.0, lambda x: ZS_IN, 0), (lambda x: ZS_OUT, e_of, 0)]
        elif m >= X_FE:
            iv = [(zif_of, e_of, 0)]
        elif SALON_X0 <= m < XN:
            iv = [(lambda x: 0.0, zex, 1), (zex, e_of, 0)]
        elif WX0 < m < WX1:
            iv = [(lambda x: wz(x) + 0.004, e_of, 0)]
        else:
            iv = [(lambda x: 0.0, e_of, 0)]
        for side in (1, -1):
            for fl, fh, mat in iv:
                q = [(a, YD, side * fl(a)), (b, YD, side * fl(b)), (b, YD, side * fh(b)), (a, YD, side * fh(a))]
                caulk.face_o([caulk.add(p) for p in q], mat, (0, 1, 0))
    ob = make_obj(ctx, 'hull_deckCaulk', caulk, ['caulk', 'hullBottom'], smooth=False)
    _cut_stair_wells(ob)

    # liston de bord (tableau arrière, bord avant du pont) : profil métal arrondi
    trim = MB()
    h = 0.056
    yc = DECK_Y + 0.0015 - h / 2
    for z0, z1 in ((-ZS_IN + 0.016, ZS_IN - 0.016), (ZS_OUT + 0.016, e_of(XS)), (-e_of(XS), -ZS_OUT - 0.016)):
        rbox_mb(0.03, h, z1 - z0, 0.008, Matrix.Translation((XS - 0.011, yc, 0.5 * (z0 + z1))), mb=trim, seg=3)
    make_obj(ctx, 'hull_deckTrims', trim, ['accent'], sharp_deg=50)


def _cut_stair_wells(ob):
    """trémies des escaliers du pont inférieur (s29_interior.STAIR_WELLS) dans le fond du pont sous le salon."""
    try:
        from s29_interior import STAIR_WELLS as rects
    except Exception:
        rects = [(-1.10, -0.12, -4.88, -2.40), (3.06, 3.72, 2.72, 4.88)]
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    for x0, x1, z0, z1 in rects:
        for co, no in (((x0, 0, 0), (1, 0, 0)), ((x1, 0, 0), (1, 0, 0)), ((0, -z0, 0), (0, 1, 0)),
                       ((0, -z1, 0), (0, 1, 0))):
            bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=co, plane_no=no)
        kill = [f for f in bm.faces if x0 < f.calc_center_median().x < x1 and z0 < -f.calc_center_median().y < z1]
        bmesh.ops.delete(bm, geom=kill, context='FACES')
    bm.to_mesh(ob.data)
    bm.free()
    ob.data.update()


# ---------------------------------------------------------------------------
# ESCALIERS (dans chaque tableau)
# ---------------------------------------------------------------------------
def build_stairs(ctx):
    nS = N_STEPS
    rise = (DECK_Y - Y_PLAT) / (nS + 1)
    run = (X_STAIR - XS) / nS
    zt = Z_ST - 0.005
    boards, caulk, riser, nose = MB(), MB(), MB(weld=True), MB()
    for i in range(1, nS + 1):
        yTop = DECK_Y - rise * i
        xa, xb = X_STAIR - run * i, X_STAIR - run * (i - 1)
        box(caulk, xa + 0.01, xb + 0.01, yTop - 0.05, yTop - CAULK_D, -zt, zt, 0, skip=('-y', '-z', '+z'))
        fr = Frame('plat', y0=yTop)
        w0, w1 = xa + 0.014, xb + 0.01
        nb = 4
        pw = (w1 - w0) / nb
        for k in range(nb):
            lo = lambda u, a=w0 + k * pw: a
            hi = lambda u, b=w0 + (k + 1) * pw: b
            for r_ in piece_sections(lo, hi, [-zt, zt], GAP / 2, GAP / 2, gend=0.0):
                plank_geo(boards, r_, fr, GAP / 2 if k else 0.0, GAP / 2 if k < nb - 1 else 0.0)
        box(riser, xa + 0.03, X_STAIR + 0.3, Y_PLAT - 0.15, yTop - 0.05, -zt, zt, 0, skip=('-y', '+x'))
        rbox_mb(0.028, 0.057, 2 * (Z_ST - 0.01), 0.013, Matrix.Translation((xa, yTop - 0.0265, 0)), 0, nose)
    box(riser, X_STAIR - 0.002, X_STAIR + 0.3, Y_PLAT - 0.15, DECK_Y - 0.006, -zt, zt, 0, skip=('-y', '+x'))
    rbox_mb(0.032, 0.054, 2 * (Z_ST + 0.012), 0.014, Matrix.Translation((X_STAIR, DECK_Y - 0.0255, 0)), 0, nose)
    for s in (1, -1):  # nez des bords de trémie, au niveau du pont
        L = X_STAIR + 0.016 - XS + 0.026
        rbox_mb(L, 0.056, 0.032, 0.014, Matrix.Translation((XS - 0.026 + L / 2, DECK_Y + 0.0015 - 0.028, s * Z_ST)), 0, nose)
    # mains courantes en U sur les joues
    chrome = MB()
    x = XS + 0.72
    ya, yb, rb = 1.22, 1.98, 0.035
    for s in (1, -1):
        z = Z_ST - 0.08
        lower = [(x, ya + rb - rb * math.cos(k / 6 * math.pi / 2), z + rb - rb * math.sin(k / 6 * math.pi / 2)) for k in range(7)]
        upper = [(x, yb - rb + rb * math.sin(k / 6 * math.pi / 2), z + rb - rb * math.cos(k / 6 * math.pi / 2)) for k in range(7)]
        path = [(x, ya, Z_ST)] + lower + upper + [(x, yb, Z_ST)]
        hmb = MB()
        tube(hmb, path, 0.014, 16, caps=True)
        chrome.merge(hmb if s > 0 else hmb.mirrored())
        for y in (ya, yb):
            b = MB()
            lathe(b, [(0.0305, 0.0), (0.03, 0.003), (0.027, 0.006), (0.0, 0.0065)], 28,
                  M=on_normal(Vector((x, y, s * Z_ST)), (0, 0, -s)), cap_top=False)
            nose.merge(b)
    out = {k: MB() for k in ('b', 'c', 'r', 'n', 'h')}
    for sd in (1, -1):
        M = Matrix.Translation((0, 0, sd * ZC_ST))
        out['b'].merge(boards.transformed(M))
        out['c'].merge(caulk.transformed(M))
        out['r'].merge(riser.transformed(M))
        out['n'].merge(nose.transformed(M))
        out['h'].merge(chrome.transformed(M))
    make_obj(ctx, 'hull_stairBoards', out['b'], ['deck'])
    make_obj(ctx, 'hull_stairCaulk', out['c'], ['caulk'], smooth=False)
    ob = make_obj(ctx, 'hull_stairRisers', out['r'], ['deck'])
    add_bevel(ob, 0.003, 2, angle=40, name='bevel')
    make_obj(ctx, 'hull_stairNosings', out['n'], ['accent'], sharp_deg=50)
    make_obj(ctx, 'hull_stairHandles', out['h'], ['chrome'], sharp_deg=55)


# ---------------------------------------------------------------------------
# PLATEFORMES DE BAIN (une par coque)
# ---------------------------------------------------------------------------
def platform_local():
    sT = section(XS)
    ZP = sT['knZ'] + 0.08
    y0, y1 = 0.08, Y_PLAT
    XF = XS + 0.04
    RP = 0.45   # angles arrière arrondis en plan
    ol = [(XF, ZP)]
    for zs, a0 in ((1, 0.0), (-1, 0.5)):
        for k in range(9):
            a = (a0 + k / 16) * math.pi
            ol.append((XP + RP - RP * math.sin(a), zs * (ZP - RP) + RP * math.cos(a) * (1 if zs > 0 else 1)))
    ol.append((XF, -ZP))
    mb = MB(weld=True)
    yt = y1 - CAULK_D
    ych = y1 - 0.07
    k = 0.06
    inset = lambda x, z: (x + (k if x < XS - 0.1 else 0), z - math.copysign(k, z))
    T = [mb.add((x, yt, z)) for x, z in ol]
    C = [mb.add((x, ych, z)) for x, z in ol]
    Bt = [mb.add((inset(x, z)[0], y0, inset(x, z)[1])) for x, z in ol]
    n = len(ol)
    xm = 0.5 * (XS + XP)
    mb.face_o(list(T), 0, (0, 1, 0))
    mb.face_o(list(Bt), 3, (0, -1, 0))
    for i in range(n):
        j = (i + 1) % n
        for Av, Bv, m in ((T, C, 1), (C, Bt, 2)):
            f = [Av[i], Av[j], Bv[j], Bv[i]]
            cx = sum(mb.v[q][0] for q in f) / 4 - xm
            cz = sum(mb.v[q][2] for q in f) / 4
            mb.face_o(f, m, (cx, 0, cz))
        mb.ewt('bw_top', T[i], T[j], 1.0)
        mb.ewt('bw_side', C[i], C[j], 0.6)
        mb.ewt('bw_side', Bt[i], Bt[j], 0.4)
    # lattes transversales (u = z), latte de rive le long du bord arrière et des pans coupés
    IN = 0.016
    fr = Frame('plat', y0=y1)

    def xa(u):
        a = abs(u)
        c = ZP - RP
        if a <= c:
            return XP + IN
        return XP + RP - math.sqrt(max((RP - IN) ** 2 - (a - c) ** 2, 0.0))
    xf = XS - 0.004
    uz = ZP - IN
    U = sorted({-uz, uz, -(ZP - RP), ZP - RP, 0.0} | {sg * (ZP - RP + (RP - IN) * k / 12) for sg in (1, -1) for k in range(1, 12)})
    W0 = XP + IN + MW
    st = lambda u: math.floor((xa(u) + MW - W0) / PL - 2 / 3)
    for sgn in (1, -1):
        a0, a1 = ZP - RP, uz
        N = 2000
        prev = st(sgn * a0)
        for i in range(1, N + 1):
            a = a0 + (a1 - a0) * i / N
            s_ = st(sgn * a)
            if s_ != prev:
                lo_, hi_ = a0 + (a1 - a0) * (i - 1) / N, a
                for _ in range(50):
                    m = 0.5 * (lo_ + hi_)
                    if st(sgn * m) == prev:
                        lo_ = m
                    else:
                        hi_ = m
                U.append(sgn * 0.5 * (lo_ + hi_))
            prev = s_
    U = sorted(set(U))
    nibk = lambda m: (lambda f, k: W0 + (m - W0 if f - k <= 2 / 3 else (k + 1) * PL))(
        (m - W0) / PL, math.floor((m - W0) / PL))
    mline = lambda u: xa(u) + MW
    boards = MB()
    for run in piece_sections(lambda u: xa(u), lambda u: nibk(mline(u)), U, 0.0, GAP / 2, gend=0.0):
        plank_geo(boards, run, fr, 0.0, GAP / 2, uvmode='s')
    nb = int((xf - W0) / PL) + 1
    for k in range(nb):
        w0, w1 = W0 + k * PL, min(W0 + (k + 1) * PL, xf)
        lo = lambda u, w0=w0: max(w0, nibk(mline(u)))
        hi = lambda u, w1=w1: w1
        for run in piece_sections(lo, hi, U, GAP / 2, GAP / 2 if w1 < xf else 0.0):
            plank_geo(boards, simplify(run), fr, GAP / 2, GAP / 2 if w1 < xf else 0.0)
    j = MB()
    box(j, XS - 0.012, XS + 0.01, y1 - 0.004, y1 + 0.0012, -ZP + 0.03, ZP - 0.03, 0)
    return mb, boards, j


def build_platforms(ctx):
    mb, boards, j = platform_local()
    o = {k: MB() for k in 'pbj'}
    for sd in (1, -1):
        M = Matrix.Translation((0, 0, sd * HULL_Z))
        o['p'].merge(mb.transformed(M))
        o['b'].merge(boards.transformed(M))
        o['j'].merge(j.transformed(M))
    ob = make_obj(ctx, 'hull_platforms', o['p'], ['caulk', 'accent', 'metalDark', 'hullBottom'])
    add_bevel(ob, 0.012, 3, 'bw_side', mat=-1, name='bevel_corners')
    add_bevel(ob, 0.014, 4, 'bw_top', mat=1, name='bevel_top')
    make_obj(ctx, 'hull_platformBoards', o['b'], ['deck'])
    make_obj(ctx, 'hull_platformJoints', o['j'], ['hullBottom'], smooth=False)


# ---------------------------------------------------------------------------
# PANNEAUX DE PONT FUMÉS (repris de hull.py, pont plat)
# ---------------------------------------------------------------------------
def build_hatches(ctx):
    acc, dark, gask, acr, chr_ = MB(), MB(), MB(), MB(), MB()
    HX, HZ, HR, TOP = 0.48, 0.205, 0.05, 0.055
    YL0 = TOP + 0.009
    coaming = sweep(HX, HZ, HR, [(-0.03, 0.0), (-0.03, TOP - 0.007), (-0.027, TOP - 0.002), (-0.022, TOP),
                                 (0.017, TOP), (0.024, TOP - 0.001), (0.0285, TOP - 0.006), (0.03, TOP - 0.015),
                                 (0.03, -0.012)])
    floor = MB()
    fl = [floor.add(p) for p in rrect(HX, HZ, HR, 0.002, -0.03)]
    floor.face(list(reversed(fl)), 0)
    gasket = MB()
    rp = rrect(HX, HZ, HR, TOP + 0.003, -0.004)
    tube(gasket, rp + [rp[0]], 0.006, 10, caps=False)
    LX, LZ, LR = 0.49, 0.215, 0.045
    lid = sweep(LX, LZ, LR, [(-0.012, YL0 + 0.012), (-0.012, YL0 + 0.019), (-0.008, YL0 + 0.023), (0.006, YL0 + 0.023),
                             (0.013, YL0 + 0.021), (0.018, YL0 + 0.014), (0.018, YL0 + 0.004), (0.016, YL0),
                             (-0.01, YL0 + 0.004)])
    pane = rbox_mb(2 * (LX - 0.008), 0.01, 2 * (LZ - 0.008), 0.005, Matrix.Translation((0, YL0 + 0.013, 0)), seg=3)
    hw = MB()
    for zz in (-0.13, 0.13):
        tube(hw, [(-LX - 0.012, YL0 + 0.004, zz - 0.041), (-LX - 0.012, YL0 + 0.004, zz + 0.041)], 0.011, 16, caps=True, round_caps=True)
        rbox_mb(0.05, 0.006, 0.07, 0.003, Matrix.Translation((-LX + 0.012, YL0 + 0.025, zz)), mb=hw, seg=2)
        lathe(hw, [(0.013, -0.008), (0.012, 0.004), (0.011, 0.008), (0.0, 0.0085)], 20,
              M=Matrix.Translation((0.32, YL0 + 0.03, LZ if zz > 0 else -LZ)), cap_top=False)
    rbox_mb(0.02, 0.01, 0.13, 0.0045, Matrix.Translation((LX, YL0 + 0.027, 0)), mb=hw, seg=2)
    for x in (8.2, 10.9):
        for z in (-HULL_Z, HULL_Z):
            M = mat_at(x, DECK_Y, z)
            acc.merge(coaming.transformed(M))
            acc.merge(lid.transformed(M))
            dark.merge(floor.transformed(M))
            gask.merge(gasket.transformed(M))
            acr.merge(pane.transformed(M))
            chr_.merge(hw.transformed(M))
    make_obj(ctx, 'hull_hatchFrames', acc, ['accent'], sharp_deg=50)
    make_obj(ctx, 'hull_hatchWells', dark, ['metalDark'], smooth=False)
    make_obj(ctx, 'hull_hatchGaskets', gask, ['hullBottom'], sharp_deg=70)
    make_obj(ctx, 'hull_hatchPanes', acr, ['acrylic'], sharp_deg=50)
    make_obj(ctx, 'hull_hatchHardware', chr_, ['chrome'], sharp_deg=50)


# ---------------------------------------------------------------------------
# TAQUETS ET CHAUMARDS
# ---------------------------------------------------------------------------
def build_cleats(ctx):
    c, f = cleat_mb(), fairlead_mb()
    out, fo = MB(), MB()
    for s in (1, -1):
        for x in (-13.12, -0.6, 11.85):  # arrière, garde, avant
            z = e_of(x) - 0.15
            out.merge(c.transformed(mat_at(x, DECK_Y, s * z)))
        for x in (-13.38, -0.2, 12.2):
            y = sheer(x)
            z = HULL_Z + W_of(x) - 0.05
            yaw = math.atan2(W_of(x + 0.05) - W_of(x - 0.05), 0.1)
            fo.merge(f.transformed(Matrix.Translation((x, y, s * z)) @ Matrix.Rotation(-s * yaw, 4, 'Y')))
    make_obj(ctx, 'hull_cleats', out, ['metalDark'], sharp_deg=55)
    make_obj(ctx, 'hull_fairleads', fo, ['chrome'], sharp_deg=55)


# ---------------------------------------------------------------------------
# PROPULSION (pods électriques, hélices contrarotatives, anodes, propulseurs d'étrave)
# ---------------------------------------------------------------------------
def keel_y(x):
    return section(x)['keel']


def axis_M(x0, yc, zc, S=1.0):
    return Matrix.Translation((x0, yc, zc)) @ Matrix.Rotation(math.pi / 2, 4, 'Z') @ Matrix.Scale(S, 4)


def build_pods(ctx):
    S = POD_S
    for side in (1, -1):
        zc = side * HULL_Z
        yc = keel_y(-10.4) - 0.54 * S
        tag = 'Stbd' if side > 0 else 'Port'
        M = axis_M(X_NOSE, yc, zc, S)
        mb = MB()
        lathe(mb, nacelle_profile(), seg=40, mat=0, M=M, cap_top=True)
        # aileron
        x_le_bot, x_le_top = X_NOSE - 0.42 * S, X_NOSE - 0.52 * S
        c_bot, c_top = 1.05 * S, 0.86 * S
        y1 = max(keel_y(x_le_bot), keel_y(x_le_bot - c_bot)) + 0.16
        rows = []
        for k in range(7):
            t = k / 6
            y = yc + (y1 - yc) * t
            c = c_bot + (c_top - c_bot) * t
            xle = x_le_bot + (x_le_top - x_le_bot) * t
            half = naca(c, 0.13)
            up = [(xle - xc * c, y, zc + yt) for xc, yt in half]
            lo = [(xle - xc * c, y, zc - yt) for xc, yt in reversed(half[1:-1])]
            rows.append(up + lo)
        loft_rows(mb, rows, 0, closed=True, cap0=True, cap1=True)
        ob = fix_closed(make_obj(ctx, f'hull_pod{tag}', mb, ['hullBottom'], smooth=True, sharp_deg=60))
        add_wn(ob)
        # anodes
        mz = MB()
        lathe(mz, [(NAC_R - 0.004, 0.70), (NAC_R + 0.010, 0.71), (NAC_R + 0.014, 0.74), (NAC_R + 0.014, 0.86),
                   (NAC_R + 0.010, 0.89), (NAC_R - 0.004, 0.90)], seg=40, mat=0, M=M, cap_top=False)
        xa = X_NOSE - (NAC_LEN + 0.62) * S
        lathe(mz, [(0.118, 0.0), (0.112, 0.05), (0.08, 0.12), (0.03, 0.17), (0.004, 0.185)], seg=32, mat=0,
              M=axis_M(xa, yc, zc, S), cap_top=True)
        xr = X_NOSE - (NAC_LEN + 0.6) * S
        fix_dir(make_obj(ctx, f'hull_anodes{tag}', mz, ['zinc'], smooth=True, sharp_deg=50),
                lambda c, zc=zc, yc=yc, xr=xr: (min(0.0, c.x - xr) * 3, c.y + zc, c.z - yc))
        # moyeux + hélices
        mp = MB()
        hub = [(0.135, NAC_LEN - 0.005), (0.14, NAC_LEN + 0.02), (0.14, NAC_LEN + 0.24), (0.128, NAC_LEN + 0.30),
               (0.124, NAC_LEN + 0.33), (0.124, NAC_LEN + 0.55), (0.118, NAC_LEN + 0.62)]
        lathe(mp, hub, seg=40, mat=0, M=M, cap_top=False)
        blade_set(mp, X_NOSE - (NAC_LEN + 0.13) * S, yc, zc, R=0.42 * S, rh=0.14 * S, nb=4, hand=side, phase=0.3,
                  cmax=0.30 * S, P=0.92 * S, skew=0.35, mat=0)
        blade_set(mp, X_NOSE - (NAC_LEN + 0.44) * S, yc, zc, R=0.36 * S, rh=0.124 * S, nb=5, hand=-side, phase=0.9,
                  cmax=0.22 * S, P=0.80 * S, skew=0.30, mat=0)
        ob = fix_closed(make_obj(ctx, f'hull_props{tag}', mp, ['propBronze'], smooth=True, sharp_deg=75))
        add_wn(ob)


def build_thrusters(ctx):
    md, mr = MB(), MB()

    def on_panel(x, y, zsign, off, sd):
        s = section(x)
        dz, dy = s['chZ'], s['chY'] - s['keel']
        L = math.hypot(dz, dy)
        zl = (y - s['keel']) / dy * dz
        nz, ny = dy / L, -dz / L
        zl2 = zl + nz * off
        return (x, y + ny * off, sd * (HULL_Z + zsign * zl2))

    for sd in (1, -1):
        for zs in (1, -1):
            flip = (sd * zs) < 0
            N = 40
            ring = lambda r, off: [on_panel(X_THR + r * math.cos(2 * math.pi * k / N), Y_THR + r * math.sin(2 * math.pi * k / N), zs, off, sd) for k in range(N)]
            c = md.add(on_panel(X_THR, Y_THR, zs, 0.004, sd))
            rim0 = [md.add(p) for p in ring(R_THR, 0.004)]
            for k in range(N):
                f = [c, rim0[k], rim0[(k + 1) % N]]
                md.face(list(reversed(f)) if flip else f, 0)
            rows = [ring(R_THR - 0.004, 0.005), ring(R_THR, 0.010), ring(R_THR + 0.020, 0.010), ring(R_THR + 0.032, 0.0)]
            if flip:
                rows = [list(reversed(r)) for r in rows]
            loft_rows(mr, rows, 0, closed=True)
            for bx in (-0.065, 0.0, 0.065):
                h = math.sqrt(R_THR * R_THR - bx * bx) - 0.004
                corners = ((-0.010, -h), (0.010, -h), (0.010, h), (-0.010, h))
                I = [mr.add(on_panel(X_THR + bx + dx, Y_THR + dyo, zs, 0.012, sd)) for dx, dyo in corners]
                Bq = [mr.add(on_panel(X_THR + bx + dx, Y_THR + dyo, zs, 0.004, sd)) for dx, dyo in corners]
                quads = [I, [Bq[0], Bq[1], I[1], I[0]], [Bq[1], Bq[2], I[2], I[1]], [Bq[2], Bq[3], I[3], I[2]], [Bq[3], Bq[0], I[0], I[3]]]
                for q in quads:
                    mr.face(list(reversed(q)) if flip else q, 0)
    # Blender : y = -z three ; normale vers l'extérieur de la coque concernée et vers le bas
    out = lambda c: (0.0, c.y - math.copysign(HULL_Z, c.y), -0.6)
    fix_dir(make_obj(ctx, 'hull_thrusterWells', md, ['metalDark'], smooth=False), out)
    ob = fix_islands(make_obj(ctx, 'hull_thrusterGrilles', mr, ['accent'], smooth=True, sharp_deg=45), out)
    add_wn(ob)




# ---------------------------------------------------------------------------
# outils : lattes à plat (fil le long de x), points du flanc extérieur
# ---------------------------------------------------------------------------
class FrameX:
    """surface plane horizontale y0 : u = x (fil), w = z."""

    def __init__(self, y0):
        self.y0 = y0

    def up(self, u):
        return Vector((0, 1, 0))

    def wdir(self):
        return Vector((0, 0, 1))

    def p(self, u, w, dy):
        return Vector((u, self.y0 + dy, w))


def plank_field(boards, fr, wlo, whi, U, z0, z1, rim=0.0):
    """remplit en lattes (pas PL, fil le long de u = x) le domaine wlo(u) <= w <= whi(u), z0 <= w <= z1."""
    k0 = math.floor(z0 / PL)
    k1 = math.ceil(z1 / PL)
    for k in range(k0, k1):
        a, b = k * PL, (k + 1) * PL

        def lo(u, a=a):
            return max(a, wlo(u) + rim)

        def hi(u, b=b):
            return min(b, whi(u) - rim)
        for run in piece_sections(lo, hi, U, GAP / 2, GAP / 2):
            plank_geo(boards, simplify(run), fr, GAP / 2, GAP / 2)


def rr_half(u, uc, hu, hw, r):
    """demi-largeur d'un rectangle arrondi (centre uc, demi-longueur hu, demi-largeur hw, rayon r) à u."""
    d = abs(u - uc) - (hu - r)
    if d <= 0:
        return hw
    if d >= r:
        return 0.0
    return hw - r + math.sqrt(r * r - d * d)


def flank(x, y, off=0.0):
    """point (repère three, côté tribord) et normale du flanc extérieur à (x, y), décalé de off."""
    rows = outer_rows(x)
    lo_r, hi_r = O_WL, O_CAPST + 1
    best = None
    for r in range(lo_r, hi_r):
        (y0, z0), (y1, z1) = rows[r], rows[r + 1]
        if (y0 - y) * (y1 - y) <= 0 and abs(y1 - y0) > 1e-9:
            t = (y - y0) / (y1 - y0)
            best = (z0 + t * (z1 - z0), y1 - y0, z1 - z0)
            break
    if best is None:
        (y0, z0), (y1, z1) = rows[hi_r - 1], rows[hi_r]
        best = (z1, y1 - y0, z1 - z0)
    zl, ty, tz = best
    l = math.hypot(ty, tz)
    ny, nz = -tz / l, ty / l
    if nz < 0:
        ny, nz = -ny, -nz
    return Vector((x, y + ny * off, HULL_Z + zl + nz * off)), Vector((0, ny, nz))


def rr_outline(xa, xb, H, rc, grow, nc=6, step=0.2):
    """contour (u, v) d'un rectangle arrondi [xa, xb] x [0, H] agrandi de grow (sens trigo), points intermédiaires."""
    R = rc + grow
    cs = [(xb - rc, H - rc, 0.0), (xa + rc, H - rc, 0.5), (xa + rc, rc, 1.0), (xb - rc, rc, 1.5)]
    pts = []
    for i, (cu, cv, a0) in enumerate(cs):
        for k in range(nc + 1):
            a = (a0 + k / (2 * nc)) * math.pi
            pts.append((cu + R * math.cos(a), cv + R * math.sin(a)))
        nu, nv, _ = cs[(i + 1) % 4]
        # bord droit jusqu'au coin suivant
        a1 = (a0 + 0.5) * math.pi
        p0 = (cu + R * math.cos(a1), cv + R * math.sin(a1))
        a2 = cs[(i + 1) % 4][2] * math.pi
        p1 = (nu + R * math.cos(a2), nv + R * math.sin(a2))
        L = math.hypot(p1[0] - p0[0], p1[1] - p0[1])
        n = max(int(L / step), 0)
        for j in range(1, n):
            t = j / n
            pts.append((p0[0] + t * (p1[0] - p0[0]), p0[1] + t * (p1[1] - p0[1])))
    return pts


def flank_ring(mb, xa, xb, H, rc, ybot, w, off, mat, side, depth=0.006):
    """cadre en anneau collé au flanc : largeur w autour du rectangle arrondi, en relief de off (+ chants)."""
    inner = rr_outline(xa, xb, H, rc, 0.0)
    outer = rr_outline(xa, xb, H, rc, w)
    P = lambda uv, o: flank(uv[0], ybot(uv[0]) + uv[1], o)[0]
    n = len(inner)
    I = [mb.add(tuple(P(q, off))) for q in inner]
    O = [mb.add(tuple(P(q, off))) for q in outer]
    Ib = [mb.add(tuple(P(q, off - depth))) for q in inner]
    Ob = [mb.add(tuple(P(q, -0.004))) for q in outer]
    for i in range(n):
        j = (i + 1) % n
        mb.face([I[i], O[i], O[j], I[j]], mat)
        mb.face([O[i], Ob[i], Ob[j], O[j]], mat)
        mb.face([Ib[i], I[i], I[j], Ib[j]], mat)


def flank_patch(mb, xa, xb, H, rc, ybot, off, mat, nv=8, nu=None, wall=None):
    """vitrage galbé : grille (rangées en v, étendue en u selon le rectangle arrondi) collée au flanc."""
    nu = nu or max(int((xb - xa) / 0.12), 8)
    uc, hu = 0.5 * (xa + xb), 0.5 * (xb - xa)
    vs = [H * (0.5 - 0.5 * math.cos(math.pi * i / nv)) for i in range(nv + 1)]
    grid = []
    for v in vs:
        dv = abs(v - H / 2) - (H / 2 - rc)
        e = hu if dv <= 0 else hu - rc + math.sqrt(max(rc * rc - dv * dv, 0.0))
        row = []
        for j in range(nu + 1):
            u = uc - e + 2 * e * j / nu
            row.append(mb.add(tuple(flank(u, ybot(u) + v, off)[0])))
        grid.append(row)
    for i in range(nv):
        for j in range(nu):
            mb.face([grid[i][j], grid[i][j + 1], grid[i + 1][j + 1], grid[i + 1][j]], mat)
    if wall is not None:   # chant du vitrage jusqu'au cadre
        bnd = [grid[0][j] for j in range(nu + 1)] + [grid[i][nu] for i in range(1, nv + 1)] + \
              [grid[nv][j] for j in range(nu - 1, -1, -1)] + [grid[i][0] for i in range(nv - 1, 0, -1)]
        low = []
        for q in bnd:
            x, y, z = mb.v[q]
            pnt, nrm = flank(x, y, 0.0)
            low.append(mb.add(tuple(Vector((x, y, z)) - nrm * (off - wall))))
        n = len(bnd)
        for i in range(n):
            j = (i + 1) % n
            mb.face([bnd[i], low[i], low[j], bnd[j]], mat)


def fix_all(ob, want):
    """surface ouverte d'un seul tenant : retourne TOUTES les faces si la majorité (pondérée par l'aire)
    ne suit pas want(centre) (repère Blender) — garde un enroulement cohérent."""
    bm = bmesh.new(); bm.from_mesh(ob.data)
    sc = sum(f.calc_area() * (1 if f.normal.dot(Vector(want(f.calc_center_median()))) >= 0 else -1) for f in bm.faces)
    if sc < 0:
        bmesh.ops.reverse_faces(bm, faces=list(bm.faces))
    bm.to_mesh(ob.data); bm.free(); ob.data.update()
    return ob


def fix_islands(ob, want):
    """enroulement cohérent par îlot (recalc), puis chaque îlot orienté selon want (majorité pondérée)."""
    bm = bmesh.new(); bm.from_mesh(ob.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    seen = set()
    for f0 in bm.faces:
        if f0.index in seen:
            continue
        isl, stack = [], [f0]
        seen.add(f0.index)
        while stack:
            f = stack.pop()
            isl.append(f)
            for e in f.edges:
                for g in e.link_faces:
                    if g.index not in seen:
                        seen.add(g.index)
                        stack.append(g)
        sc = sum(f.calc_area() * (1 if f.normal.dot(Vector(want(f.calc_center_median()))) >= 0 else -1) for f in isl)
        if sc < 0:
            bmesh.ops.reverse_faces(bm, faces=isl)
    bm.to_mesh(ob.data); bm.free(); ob.data.update()
    return ob


def out_dir(c):
    """normale voulue (repère Blender) : vers l'extérieur de la coque la plus proche."""
    return (0.0, c.y - math.copysign(HULL_Z, c.y), 0.0)


# ---------------------------------------------------------------------------
# BANDES VITRÉES DE COQUE (cabines) + joint des terrasses
# ---------------------------------------------------------------------------
WINDOWS = [(-7.4, -3.3), (-2.6, 1.6), (2.25, 4.15), (5.05, 6.45)]   # la cadène (x 4,6) entre deux vitrages
WIN_H, WIN_TOP, WIN_RC, WIN_FW = 0.36, 0.40, 0.13, 0.035


def build_windows(ctx):
    ybot = lambda x: sheer(x) - WIN_TOP - WIN_H
    fr, gl = MB(), MB()
    for xa, xb in WINDOWS:
        flank_ring(fr, xa, xb, WIN_H, WIN_RC, ybot, WIN_FW, 0.008, 0, 1, depth=0.004)
        flank_patch(gl, xa, xb, WIN_H, WIN_RC, ybot, 0.011, 0, wall=0.002)
    # joint du logement des panneaux de terrasse (rabattus)
    yb = lambda x: 1.25
    flank_ring(fr, TX0 + 0.04, TX1 - 0.04, 2.27 - 1.25, 0.12, yb, 0.022, 0.004, 0, 1, depth=0.003)
    for name, mb, m in (('hull_windowFrames', fr, 'metalDark'), ('hull_windowGlass', gl, 'glass')):
        both = MB()
        both.merge(mb)
        both.merge(mb.mirrored())
        make_obj(ctx, name, both, [m], smooth=True, sharp_deg=60)


# ---------------------------------------------------------------------------
# LOUNGE AVANT CREUSÉ
# ---------------------------------------------------------------------------
def build_well(ctx):
    M = Matrix.Translation((WXC, 0, 0))
    nose, wall, caulk = MB(), MB(), MB()
    c, r = (0.02, DECK_Y - 0.02), 0.02
    prof = [(WNOSE, YD - 0.012), (WNOSE, DECK_Y + 0.0008), (0.02, DECK_Y + 0.0008)]
    prof += [(c[0] - r * math.sin(a), c[1] + r * math.cos(a)) for a in [k / 5 * math.pi / 2 for k in range(1, 6)]]
    prof += [(0.0, DECK_Y - 0.05)]
    loft_rows(nose, [[tuple(M @ Vector(p)) for p in rrect(WHX, WZ, WR, y, o, 10)] for o, y in prof], 0, closed=True)
    loft_rows(wall, [[tuple(M @ Vector(p)) for p in rrect(WHX, WZ, WR, y, 0.0, 10)] for y in (DECK_Y - 0.05, WFY - 0.03)], 0, closed=True)
    ring = [caulk.add(tuple(M @ Vector(p))) for p in rrect(WHX, WZ, WR, WFY - CAULK_D, 0.0, 10)]
    caulk.face_o(ring, 0, (0, 1, 0))
    toc = lambda c: (c.x - WXC, -c.y, 0.0)   # vers l'intérieur du lounge (repère Blender)
    fix_all(make_obj(ctx, 'hull_wellNosing', nose, ['accent'], smooth=True, sharp_deg=60), lambda c: (WXC - c.x, -c.y, 0.0))
    fix_all(make_obj(ctx, 'hull_wellWalls', wall, ['superstructure'], smooth=True), lambda c: (WXC - c.x, -c.y, 0.0))
    make_obj(ctx, 'hull_wellCaulk', caulk, ['caulk'], smooth=False)
    # fond en teck (fil le long de x)
    boards = MB()
    xs = sorted(set([WX0 + 0.01 * k for k in range(int((WX1 - WX0) / 0.01) + 1)]))
    xs = [x for x in xs if WX0 + 0.002 < x < WX1 - 0.002]
    hw = lambda u: rr_half(u, WXC, WHX, WZ, WR)
    plank_field(boards, FrameX(WFY), lambda u: -hw(u), hw, xs, -WZ, WZ)
    # marche intermédiaire (côté arrière, axe) : pont 2,35 -> marche -> fond
    ys = 0.5 * (DECK_Y + WFY)
    sd, sz = WSTEP
    body, acc = MB(), MB()
    rbox_mb(sd + 0.04, ys - 0.006 - WFY + 0.03, 2 * sz, 0.02,
            Matrix.Translation((WX0 - 0.02 + (sd + 0.04) / 2, 0.5 * (ys - 0.006 + WFY - 0.03), 0)), mb=body, seg=3)
    fr = Frame('plat', y0=ys)
    nb = 5
    w0, w1 = WX0 + 0.005, WX0 + sd - 0.02
    pw = (w1 - w0) / nb
    for k in range(nb):
        lo = lambda u, a=w0 + k * pw: a
        hi = lambda u, b=w0 + (k + 1) * pw: b
        for r_ in piece_sections(lo, hi, [-sz + 0.01, sz - 0.01], GAP / 2, GAP / 2, gend=0.0):
            plank_geo(boards, r_, fr, GAP / 2 if k else 0.0, GAP / 2)
    rbox_mb(0.032, 0.05, 2 * sz + 0.004, 0.013, Matrix.Translation((WX0 + sd - 0.012, ys - 0.024, 0)), mb=acc, seg=3)
    make_obj(ctx, 'hull_wellBoards', boards, ['deck'])
    ob = fix_closed(make_obj(ctx, 'hull_wellStep', body, ['superstructure'], smooth=True, sharp_deg=60))
    make_obj(ctx, 'hull_wellStepNosing', acc, ['accent'], smooth=True, sharp_deg=60)


# ---------------------------------------------------------------------------
# POUTRE AVANT + ferrure d'étai
# ---------------------------------------------------------------------------
def _closed_fillet(poly, radii, n=6, nseg=3):
    out = []
    N = len(poly)
    F = []
    for i in range(N):
        A, B, _ = fillet(poly[i - 1], poly[i], poly[(i + 1) % N], radii[i])
        F.append((A, poly[i], B))
    for i in range(N):
        A, q, B = F[i]
        out += [A] + arc(A, q, B, n)
        out += seg(B, F[(i + 1) % N][0], nseg)[:-1]
    return out


def build_beam(ctx):
    poly = [(BX0, BYB + 0.02), (BX0, BYT), (BX1, BYT - 0.07), (BX1 - 0.10, BYB)]
    prof = _closed_fillet(poly, [0.05, 0.10, 0.26, 0.16], n=8, nseg=3)
    NZ = 40
    rows = []
    for k in range(NZ + 1):
        t = -1 + 2 * k / NZ
        row = []
        for x, y in prof:
            ye = y - 0.035 * t * t * clamp01((y - BYB) / (BYT - BYB))
            s = section(x)
            ze = HULL_Z - P_side(s, max(ye, s['chY'])) + 0.05
            row.append((x, ye, t * ze))
        rows.append(row)
    mb = MB()
    loft_rows(mb, rows, 0, closed=True)
    ob = fix_all(make_obj(ctx, 'hull_fwdBeam', mb, ['hull'], smooth=True),
                 lambda c: (c.x - 13.0, 0.0, c.z - 2.42))
    add_wn(ob)
    # jonc 'accent' sur le dessus de la poutre
    jm = MB()
    path = [(13.0 - 0.05, BYT + 0.002 - 0.035 * (z / 4.4) ** 2, z) for z in [-4.3 + 8.6 * k / 40 for k in range(41)]]
    tube(jm, path, 0.009, 10, caps=True, round_caps=True)
    make_obj(ctx, 'hull_fwdBeamJonc', jm, ['accent'])
    # ferrure d'étai (œil en FORESTAY[0])
    fx, fy, fz = FORESTAY[0]
    ch = MB()
    rbox_mb(0.34, 0.03, 0.16, 0.012, Matrix.Translation((fx, BYT + 0.004, 0)), mb=ch, seg=3)
    plate = [(fx - 0.09, BYT), (fx + 0.09, BYT), (fx + 0.05, fy + 0.03), (fx - 0.05, fy + 0.03)]
    prof2 = _closed_fillet(plate, [0.01, 0.01, 0.05, 0.05], n=5, nseg=1)
    loft_rows(ch, [[(x, y, -0.014) for x, y in prof2], [(x, y, 0.014) for x, y in prof2]], 0, closed=True, cap0=True, cap1=True)
    tube(ch, [(fx, fy, -0.03), (fx, fy, 0.03)], 0.013, 16, caps=True, round_caps=False)
    fix_closed(make_obj(ctx, 'hull_forestayFitting', ch, ['chrome'], smooth=True, sharp_deg=50))


# ---------------------------------------------------------------------------
# EMBASE DE MÂT, CADÈNES
# ---------------------------------------------------------------------------
def build_mast_step(ctx):
    mb = MB()
    prof = [(1.0, -0.01), (1.0, 0.02), (0.985, 0.045), (0.94, 0.07), (0.86, 0.09), (0.74, 0.105), (0.6, 0.11), (0.0, 0.112)]
    M = Matrix.Translation((MAST_X, DECK_Y, 0)) @ Matrix.Diagonal((0.50, 1.0, 0.29, 1.0))
    lathe(mb, prof, 48, M=M, cap_top=True)
    ob = fix_closed(make_obj(ctx, 'hull_mastStep', mb, ['metalDark'], smooth=True))
    add_wn(ob)
    # bague 'accent' au pied
    rm = MB()
    lathe(rm, [(1.045, -0.004), (1.045, 0.006), (1.02, 0.012), (0.98, 0.012), (0.98, -0.004)], 48,
          M=Matrix.Translation((MAST_X, DECK_Y, 0)) @ Matrix.Diagonal((0.50, 1.0, 0.29, 1.0)), cap_top=False)
    make_obj(ctx, 'hull_mastStepRing', rm, ['accent'], smooth=True, sharp_deg=50)


def build_chainplates(ctx):
    ch = MB()
    for (cx, cy, cz) in CHAINPLATES:
        if cz < 0:
            continue
        # plaque sur le flanc (de 2,02 au livet)
        y0, y1 = 2.02, sheer(cx) - 0.03
        nseg = 6
        rows = []
        for k in range(nseg + 1):
            y = y0 + (y1 - y0) * k / nseg
            p, n = flank(cx, y, 0.0)
            ex = Vector((1, 0, 0))
            row = []
            for dx, o in ((-0.055, -0.002), (0.055, -0.002), (0.055, 0.012), (-0.055, 0.012)):
                row.append(tuple(p + ex * dx + n * o))
            rows.append(row)
        loft_rows(ch, rows, 0, closed=True, cap0=True, cap1=True)
        # ferrure verticale avec œil (cy) en z = cz
        plate = [(cx - 0.06, sheer(cx) - 0.05), (cx + 0.06, sheer(cx) - 0.05), (cx + 0.035, cy + 0.04), (cx - 0.035, cy + 0.04)]
        prof = _closed_fillet(plate, [0.005, 0.005, 0.035, 0.035], n=5, nseg=1)
        loft_rows(ch, [[(x, y, cz - 0.011) for x, y in prof], [(x, y, cz + 0.011) for x, y in prof]], 0, closed=True, cap0=True, cap1=True)
        tube(ch, [(cx, cy, cz - 0.026), (cx, cy, cz + 0.026)], 0.011, 14, caps=True)
    both = MB()
    both.merge(ch)
    both.merge(ch.mirrored())
    fix_closed(make_obj(ctx, 'hull_chainplates', both, ['chrome'], smooth=True, sharp_deg=50))


# ---------------------------------------------------------------------------
# TERRASSES LATÉRALES (pavois rabattus en balcons)
# ---------------------------------------------------------------------------
TT = 0.14           # épaisseur du panneau


def build_terraces(ctx):
    zh = min(flank(x, TY - TT, 0.0)[0].z for x in (TX0, 0.5 * (TX0 + TX1), TX1))
    zin = zh - 0.04
    zo = zh + TOUT
    xc, hx = 0.5 * (TX0 + TX1), 0.5 * (TX1 - TX0)
    body, caulk, boards, glass, steel = MB(), MB(), MB(), MB(), MB()
    # panneau (dessous et chants = coque) : rectangle arrondi (angles extérieurs r 0,22)
    RT = 0.22
    hz = 0.5 * (zo - zin)
    zc = 0.5 * (zo + zin)
    prof = [(-0.03, TY - TT), (-0.008, TY - TT + 0.004), (0.0, TY - TT + 0.03), (0.0, TY - 0.03), (-0.006, TY - 0.008), (-0.02, TY - 0.004)]
    rows = [[(xc + p[0], p[1], zc + p[2]) for p in rrect(hx, hz, RT, y, o, 8)] for o, y in prof]
    idx = loft_rows(body, rows, 0, closed=True)
    body.face(list(reversed(idx[0])), 0)
    body.face(list(idx[-1]), 0)
    # fond calfaté + lattes (fil le long de x)
    hzf = lambda u: rr_half(u, xc, hx - 0.02, hz - 0.02, RT - 0.02)
    ring = [caulk.add((xc + p[0], TY - CAULK_D, zc + p[2])) for p in rrect(hx - 0.02, hz - 0.02, RT - 0.02, 0, 0.0, 8)]
    caulk.face_o(ring, 0, (0, 1, 0))
    U = [TX0 + 0.005 + (TX1 - TX0 - 0.01) * k / 360 for k in range(361)]
    hz_in = lambda u: max(flank(u, TY, 0.0)[0].z, zin) + 0.004
    plank_field(boards, FrameX(TY), lambda u: max(zc - hzf(u), hz_in(u)) if hzf(u) > 0 else zc,
                lambda u: zc + hzf(u), U, zin, zo, rim=0.0)
    # garde-corps : main courante inox continue (r 0,15 aux angles), vitrages, poteaux
    YR = TY + 1.0
    zr = zo - 0.06
    xa, xb = TX0 + 0.06, TX1 - 0.06
    Rc = 0.15
    path = [(xa, YR, zh - 0.02), (xa, YR, zr - Rc)]
    path += [(xa + Rc - Rc * math.cos(a), YR, zr - Rc + Rc * math.sin(a)) for a in [k / 6 * math.pi / 2 for k in range(1, 7)]]
    path += [(xb - Rc + Rc * math.sin(a), YR, zr - Rc + Rc * math.cos(a)) for a in [k / 6 * math.pi / 2 for k in range(0, 7)]]
    path += [(xb, YR, zh - 0.02)]
    tube(steel, path, 0.024, 16, caps=True, round_caps=True)
    posts = [(xa, zr), (xb, zr)] + [(xa + (xb - xa) * k / 3, zr) for k in (1, 2)] + [(xa, zin + 0.45), (xb, zin + 0.45)]
    for px, pz in posts:
        tube(steel, [(px, TY - 0.002, pz), (px, YR - 0.02, pz)], 0.018, 12, caps=True)
        lathe(steel, [(0.035, 0.0), (0.034, 0.012), (0.024, 0.02), (0.0, 0.021)], 20, M=Matrix.Translation((px, TY - 0.004, pz)))
    # vitrages (feuilletés, 12 mm) entre poteaux
    gy0, gy1 = TY + 0.06, YR - 0.07
    for x0, x1 in ((xa + 0.04, xa + (xb - xa) / 3 - 0.03), (xa + (xb - xa) / 3 + 0.03, xa + 2 * (xb - xa) / 3 - 0.03),
                   (xa + 2 * (xb - xa) / 3 + 0.03, xb - 0.04)):
        rbox_mb(x1 - x0, gy1 - gy0, 0.012, 0.006, Matrix.Translation((0.5 * (x0 + x1), 0.5 * (gy0 + gy1), zr)), mb=glass, seg=2)
    for x in (xa, xb):
        for z0, z1 in ((zh + 0.03, zin + 0.42), (zin + 0.48, zr - 0.04)):
            rbox_mb(0.012, gy1 - gy0, z1 - z0, 0.006, Matrix.Translation((x, 0.5 * (gy0 + gy1), 0.5 * (z0 + z1))), mb=glass, seg=2)
    # charnière et vérins
    tube(steel, [(TX0 + 0.1, TY - TT + 0.02, zh + 0.005), (TX1 - 0.1, TY - TT + 0.02, zh + 0.005)], 0.03, 16, caps=True, round_caps=True)
    for x in (TX0 + 0.55, TX1 - 0.55):
        p0 = flank(x, 1.42, 0.0)[0]
        p1 = Vector((x, TY - TT - 0.005, zh + 0.62))
        tube(steel, [tuple(p0 + (p1 - p0) * t) for t in (0.0, 0.55)], 0.032, 14, caps=True)
        tube(steel, [tuple(p0 + (p1 - p0) * t) for t in (0.5, 1.0)], 0.02, 14, caps=True, round_caps=True)
    out = {}
    for name, mb, mats in (('hull_terracePanels', body, ['hull']), ('hull_terraceCaulk', caulk, ['caulk']),
                           ('hull_terraceBoards', boards, ['deck']), ('hull_terraceGlass', glass, ['glass']),
                           ('hull_terraceSteel', steel, ['chrome'])):
        both = MB()
        both.merge(mb)
        both.merge(mb.mirrored())
        out[name] = make_obj(ctx, name, both, mats, smooth=name != 'hull_terraceCaulk',
                             sharp_deg=None if name in ('hull_terraceBoards',) else 60)
    fix_closed(out['hull_terracePanels'])
    fix_closed(out['hull_terraceGlass'])


# ---------------------------------------------------------------------------
# LOUNGE MER (plateforme abaissée entre les coques) + porte de garage
# ---------------------------------------------------------------------------
def build_sea_lounge(ctx):
    x0, x1, zl, yt = AFT_LOUNGE
    zl = min(zl, 3.18)
    T = 0.24
    xc, hx = 0.5 * (x0 + x1), 0.5 * (x1 - x0)
    R = 0.6
    body, caulk, boards, steel, dark = MB(), MB(), MB(), MB(), MB()
    # corps : plan rectangle arrondi (angles avant r 0,6 aussi, cachés sous la nef), chants arrondis
    prof = [(-0.05, yt - T), (-0.012, yt - T + 0.006), (0.0, yt - T + 0.04), (0.0, yt - 0.035), (-0.006, yt - 0.01), (-0.025, yt - CAULK_D - 0.004)]
    rows = [[(xc + p[0], p[1], p[2]) for p in rrect(hx, zl, R, y, o, 10)] for o, y in prof]
    idx = loft_rows(body, rows, 0, closed=True)
    body.face(list(reversed(idx[0])), 0)
    body.face(list(idx[-1]), 0)
    # fond calfaté + lattes
    ring = [caulk.add((xc + p[0], yt - CAULK_D, p[2])) for p in rrect(hx - 0.02, zl - 0.02, R - 0.02, 0, 0.0, 10)]
    caulk.face_o(ring, 0, (0, 1, 0))
    hw = lambda u: rr_half(u, xc, hx - 0.02, zl - 0.02, R - 0.02)
    U = [x0 + 0.005 + (x1 - x0 - 0.01) * k / 300 for k in range(301)]
    plank_field(boards, FrameX(yt), lambda u: -hw(u), hw, U, -zl, zl)
    # nez arrière 'accent'
    acc = MB()
    path = [(xc + p[0], yt - 0.012, p[2]) for p in rrect(hx + 0.004, zl + 0.004, R + 0.004, 0, 0.0, 10) if p[0] < -0.5 * hx]
    path.sort(key=lambda q: q[2])
    tube(acc, path, 0.014, 12, caps=True, round_caps=True)
    # vérins hydrauliques vers le dessous de nef
    for z in (-2.2, 2.2):
        for xr in (x1 - 0.45,):
            tube(dark, [(xr, yt - 0.01, z), (xr, yt + 0.42, z)], 0.075, 20, caps=True)
            tube(steel, [(xr, yt + 0.40, z), (xr, TUNNEL_Y + 0.02, z)], 0.045, 20, caps=True)
            lathe(dark, [(0.12, 0.0), (0.12, 0.03), (0.08, 0.05), (0.0, 0.05)], 24, M=Matrix.Translation((xr, TUNNEL_Y + 0.02, z)) @ Matrix.Rotation(math.pi, 4, 'X'))
    # échelle de bain (arrière, axe)
    for zz in (-0.22, 0.22):
        p = [(x0 - 0.03, yt - 0.02, zz), (x0 - 0.10, yt - 0.10, zz), (x0 - 0.16, yt - 0.30, zz), (x0 - 0.16, -0.75, zz)]
        tube(steel, p, 0.016, 12, caps=True, round_caps=True)
    for yy in (0.15, -0.15, -0.45):
        tube(steel, [(x0 - 0.16, yy, -0.22), (x0 - 0.16, yy, 0.22)], 0.014, 12, caps=True)
    # porte de garage dans la face arrière de nef
    door = MB()
    GZ, GY0, GY1 = 2.55, 1.38, 2.22
    rbox_mb(0.03, GY1 - GY0, 2 * GZ, 0.012, Matrix.Translation((XS - 0.012, 0.5 * (GY0 + GY1), 0)), mb=door, seg=3)
    rbox_mb(0.016, GY1 - GY0 + 0.04, 2 * GZ + 0.04, 0.008, Matrix.Translation((XS - 0.005, 0.5 * (GY0 + GY1), 0)), mb=dark, seg=2)
    for z in (-1.3, 1.3):  # poignées encastrées
        rbox_mb(0.012, 0.035, 0.42, 0.012, Matrix.Translation((XS - 0.03, GY0 + 0.12, z)), mb=acc, seg=3)
    out = {}
    for name, mb, mats, sh in (('hull_seaLounge', body, ['hull'], 60), ('hull_seaLoungeCaulk', caulk, ['caulk'], None),
                               ('hull_seaLoungeBoards', boards, ['deck'], None), ('hull_seaLoungeSteel', steel, ['chrome'], 60),
                               ('hull_seaLoungeDark', dark, ['metalDark'], 60), ('hull_seaLoungeAccent', acc, ['accent'], 60),
                               ('hull_garageDoor', door, ['hull'], 60)):
        out[name] = make_obj(ctx, name, mb, mats, smooth=sh is not None, sharp_deg=sh)
    for k in ('hull_seaLounge', 'hull_garageDoor'):
        fix_closed(out[k])


# ---------------------------------------------------------------------------
def build(ctx):
    build_shell(ctx)
    build_deck(ctx)
    build_stairs(ctx)
    build_platforms(ctx)
    build_hatches(ctx)
    build_cleats(ctx)
    build_pods(ctx)
    build_thrusters(ctx)
    build_windows(ctx)
    build_well(ctx)
    build_beam(ctx)
    build_mast_step(ctx)
    build_chainplates(ctx)
    build_terraces(ctx)
    build_sea_lounge(ctx)
