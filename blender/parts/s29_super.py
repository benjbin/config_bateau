"""SILLAGE 29 — salon de pont, vitrages, pont du flybridge, garde-corps, escalier et hardtop solaire
(groupes 'superstructure', 'upperGlass', 'roof').  Design original NEOKROME, formes arrondies.

Adapté de parts/cat_super.py (DIÈDRE 24) aux cotes de lib/s29_lines.py, avec le niveau flybridge en plus.
Outils génériques importés de parts/superstructure.py et parts/cat_super.py (non modifiés).

Repère three.js (+X avant, +Y haut, +Z tribord), mètres.

=====================================================================================================
COTES CHOISIES ICI (absentes de s29_lines) — à respecter par s29_hull / s29_interior / s29_rig
=====================================================================================================
Salon
  * Courbe B = pied des vitrages en plan (y = YL = 2,58) : flancs droits z = ±5,02 de x = −5,16 à ~3,30,
    angles avant très arrondis (Bézier, tangente 2,75 m au sommet (6,05 ; ±5,02)), pare-brise bombé en plan,
    nez lissé x ≈ 6,57 en z = 0 (sommet 6,69, tangente 2,0).
    Face extérieure de l'allège 30 mm en dehors de B (z = ±5,05, nez x = 6,60 = SALON_X1).
  * Allège (soubassement) : pied y = 2,355 (joint creux d'ombre 2,355 → 2,39, posé sur le pont 2,35),
    jonc 'accent' demi-rond sous la ligne de seuil, dessus intérieur de l'allège y = YL + 0,004,
    face intérieure 0,10 m en dedans de B (|z| = 4,92 sur les flancs) descendant jusqu'à 2,395.
  * Haut des vitrages (courbe T, y = YU = 4,70) : courbe propre de même structure que B (appariement par indice
    -> verres = surfaces réglées, bombé 30 mm) : flancs z = ±4,82 (dévers 0,20), angle tangente 1,40 au sommet
    (4,70 ; ±4,82), nez lissé x ≈ 4,92 -> pare-brise 38° sur la verticale au centre ; meneaux d'angle inclinés.
  * Joints de vitrage (meneaux metalDark) : x = −2,40 / 0,70 / début d'angle (~3,30) sur les flancs,
    z = ±2,00 au pare-brise (pare-brise central |z| ≤ 2,0 ; verres cintrés d'angle).
  * Traverse haute metalDark 4,67 → 4,775 ; plafond 'ceiling' à 4,70 (bandeau périphérique 0,40 m + spots),
    caisson remonté à 4,76 bordé d'une gorge LED + 2 filets LED (z ±1,60).
  * Montants d'angle arrière : x −5,36 → −5,10, |z| 4,60 → 5,055. Baie arrière pleine largeur (plan x ≈ −5,23),
    6 vantaux télescopiques : fixes |z| 3,04 → 4,60 (rail x −5,165), coulissants |z| 1,50 → 3,10
    (rail −5,230) et 0 → 1,56 (rail −5,295) ; seuil inox/accent 2,355 → 2,41, imposte 4,67 → 4,775.
  * Feux de navigation : boîtiers metalDark sur l'allège des angles avant (x ≈ 4,6), navRed bâbord (z < 0),
    navGreen tribord (z > 0).
Flybridge (pont = toit du salon)
  * Contour FLY_OUTLINE (bord extérieur du chant) : x −9,8 → 5,3, |z| ≤ 5,2, angles arrière tangente 1,4 m,
    casquette avant arrondie (épaules tangente 1,9 m, nez tangente 2,6 m).
  * Chant arrondi mince : sous-face extérieure y = 4,76 (Y_SOF), nez à 4,878 (jonc 'accent'), dessus 5,00 ;
    largeur du chant 0,30 m. Marge laquée 'superstructure' de 0,30 à 0,40 m du bord, puis teck (vraies
    lattes 'deck' de 7,1 cm, joints 'caulk' de 6 mm) sur FLY_FIELD (= contour en retrait de 0,40 m).
  * Garde-corps vitré : ligne FLY_RAIL_LINE à 0,32 m en dedans du bord, sabot metalDark 5,00 → 5,07,
    verre 15 mm, main courante chrome Ø 44 mm au sommet (5,95 sur les flancs/arrière). À l'avant
    (x > 2,4) le verre devient le pare-brise bas du fly : 0,62 m de haut au centre, incliné de 20° vers
    l'arrière, raccord continu vers les garde-corps latéraux (groupe 'upperGlass').
  * Trémie d'escalier FLY_OPENING = (x0 −9,32, x1 −6,40, z0 2,88, z1 3,76) (centre z 3,32 au lieu de 3,40 pour
    dégager le montant du hardtop (−8,2 ; 3,9)) ; marge laquée de 6 cm autour ; garde-corps vitrés sur ses
    côtés intérieur et extérieur (z 2,895 et 3,745) de x −9,42 à −6,40 ; on débouche vers l'avant (+x).
  * Escalier cockpit → fly : 11 hauteurs de 0,241 m, giron 0,32 m, pied x = −9,60 (pont 2,35), marches teck
    flottantes 0,82 m (z 2,91 → 3,73) sur limon central laqué, LED sous chaque nez, joues vitrées + mains
    courantes chrome. Zone à laisser libre dans le cockpit : x −9,75 → −6,35, z 2,80 → 3,85.
  * Sous-face du fly au-dessus du cockpit : spots encastrés + ruban LED en U à 0,36 m du bord (x < −5,6).
Hardtop solaire
  * Contour HT_OUTLINE : x −8,8 → 3,6, |z| ≤ 4,9 (angles arrière tangente 1,2, épaules (3,0 ; ±4,9)
    tangente 1,1, nez tangente 2,0). Aile mince : dessus 7,55, sous-face 7,40 (HT_SOFFIT_Y), chant en goutte
    d'eau de 0,40 m (nez y 7,48, jonc 'accent'). Champ solaire SOLAR_HT (contour en retrait 0,50 m) 7 × 9
    modules affleurants ('acrylic' dans cadre metalDark). Sous-face : spots + gorge LED périphérique.
  * Montants en aile (metalDark, profil NACA 0028, corde 0,40 m) : pieds HT_PILLARS sur le pont du fly
    (y 5,00), avant inclinés vers l'arrière (tête x 1,75, |z| 4,30), arrière verticaux ; pieds et têtes évasés.
  * Rien au-dessus de y 7,56 près de z = 0 (passage de la bôme à 8,35).

EXPORTS pour les autres modules (listes de (x, z), polygones fermés CCW en (x, z)) :
  SALON_OUTLINE      face extérieure de l'allège au pont (y 2,35..2,58), fermée à l'arrière en x −5,36
  SALON_INNER        face intérieure de l'allège (le mobilier du salon reste dedans sous y = YL)
  salon_glass_outline(y, a=0.0)  contour de la face du vitrage à la hauteur y (YL ≤ y ≤ YU), décalé de a
                     (a < 0 vers l'intérieur) -> le mobilier haut doit rester dans salon_glass_outline(y, -0.05)
  GLASS_TOP_OUTLINE  courbe T (haut des vitrages, y = YU)
  FLY_OUTLINE, FLY_FIELD (teck utilisable), FLY_RAIL_LINE, FLY_OPENING (x0, x1, z0, z1), FLY_STAIR_ZONE
  HT_OUTLINE, HT_SOFFIT_Y, HT_PILLAR_FEET / HT_PILLAR_HEADS
  Constantes : YL, YU, Y_SOF, Y_CEIL, FLY_DECK_Y (= FLY_Y)
"""
import math
import bpy  # noqa: F401
from mathutils import Vector as V

from s29_lines import (SALON_X0, SALON_X1, SALON_ZH, SALON_FLOOR_Y, SALON_CEIL_Y, FLY_Y, FLY_X0, FLY_X1, FLY_ZH,
                       HT_Y, HT_X0, HT_X1, HT_ZH, HT_PILLARS, SOLAR_HT, FLY_STAIR, DECK_Y)
from superstructure import MB, make_obj, inset2, cum_len, round_corner, rounded_poly, frame_box, aabb, rod, glazing, Patch
from cat_super import (fillet2, plan_nrm, sweep_prof, glazing_poly, rrect, loft_section, cdt_fill, clip_poly,
                       clip_convex, area2, ccw, circle, spot, _subdiv, _bez, _dedupe)

UP = V((0, 1, 0))

# ------------------------------------------------------------------------------------------------ cotes
A_WALL = 0.03                        # face de l'allège en dehors de B
T_WALL = 0.10                        # face intérieure en dedans de B
ZB = SALON_ZH - A_WALL               # 5.02
X_POST0, X_POST1 = SALON_X0 - 0.16, SALON_X0 + 0.10      # -5.36, -5.10
X_WALL0 = SALON_X0 + 0.04            # -5.16
X_GLASS0 = X_POST1
Y_GAP0, Y_GAP1 = DECK_Y + 0.005, DECK_Y + 0.040
YL = 2.58                            # pied des vitrages / dessus du seuil
YU = 4.70                            # haut des vitrages
Y_RAIL0, Y_RAIL1 = 4.67, 4.775       # traverse haute
Y_SOF = 4.76                         # sous-face extérieure du pont du fly
Y_CEIL = SALON_CEIL_Y                # 4.70
Y_COFFER = 4.76
Y_FLOOR = SALON_FLOOR_Y              # 2.40
FLY_DECK_Y = FLY_Y                   # 5.00
WS_TAN = math.tan(math.radians(38))
SIDE_SET = 0.20
WS_SET = (YU - YL) * WS_TAN          # 1.656
BULGE = 0.03
JOINT_Z = 2.00

# flybridge
FLY_EDGE = 0.30                      # largeur du chant arrondi
FLY_RAIL_A = 0.32                    # ligne du garde-corps (en dedans du bord)
FLY_FIELD_A = 0.40                   # limite du teck
FLY_OPENING = (-9.32, FLY_STAIR[1], 2.88, 3.76)
OPEN_M = 0.06                        # marge laquée autour de la trémie
STAIR_X0, STAIR_X1 = FLY_STAIR[0], FLY_STAIR[1]
STAIR_ZC = 0.5 * (FLY_OPENING[2] + FLY_OPENING[3])
STAIR_W = 0.82
FLY_STAIR_ZONE = (STAIR_X0 - 0.15, STAIR_X1 + 0.05, FLY_OPENING[2] - 0.08, FLY_OPENING[3] + 0.09)
X_DEFL0, X_DEFL1 = 2.4, 4.4          # transition garde-corps -> pare-brise du fly
RAIL_H = 0.93                        # hauteur du verre des garde-corps (au-dessus du sabot)
DEFL_H, DEFL_RAKE = 0.62, math.radians(20)

# hardtop
HT_EDGE = 0.40
HT_SOFFIT_Y = 7.40
HT_PILLAR_FEET = list(HT_PILLARS)
HT_PILLAR_HEADS = [(x - 0.45, z - math.copysign(0.10, z)) if x > 0 else (x, z) for x, z in HT_PILLARS]


def v(x, y, z):
    return V((x, y, z))


def mz(p):
    return V((p.x, p.y, -p.z))


def ss(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def yb(x):
    return YL


# ------------------------------------------------------------------------------------------------ outils 2D
def out_normals(loop):
    """Normales sortantes (compensées en onglet) d'une boucle fermée CCW en (x, z)."""
    return [-n for n in plan_nrm(loop, closed=True)]


def offset_loop(loop, d, nrm=None):
    nrm = nrm or out_normals(loop)
    return [(p[0] + n.x * d, p[1] + n.z * d) for p, n in zip(loop, nrm)]


def closed_subdiv(loop, step):
    return _subdiv(list(loop) + [loop[0]], step)[:-1]


def resample_closed(loop, step):
    """Rééchantillonnage régulier (abscisse curviligne) d'une boucle fermée."""
    P = [V(p) for p in loop] + [V(loop[0])]
    L = cum_len(P)
    n = max(8, int(round(L[-1] / step)))
    out, k = [], 0
    for i in range(n):
        s = L[-1] * i / n
        while L[k + 1] < s:
            k += 1
        t = (s - L[k]) / max(L[k + 1] - L[k], 1e-12)
        q = P[k].lerp(P[k + 1], t)
        out.append((q.x, q.y))
    return out


def sub_path(P, L, s0, s1, step=0.10):
    """Portion [s0, s1] (abscisses curvilignes, éventuellement > longueur : bouclage) d'une boucle fermée P."""
    tot = L[-1]
    n = max(2, int(math.ceil((s1 - s0) / step)) + 1)
    out = []
    for i in range(n):
        s = (s0 + (s1 - s0) * i / (n - 1)) % tot
        k = 0
        lo, hi = 0, len(L) - 1
        while hi - lo > 1:
            mid = (lo + hi) // 2
            if L[mid] <= s:
                lo = mid
            else:
                hi = mid
        k = lo
        t = (s - L[k]) / max(L[k + 1] - L[k], 1e-12)
        q = P[k].lerp(P[k + 1], t)
        out.append((q.x, q.y))
    return out


def poly_centroid(poly):
    return sum((V(p) for p in poly), V((0, 0))) / len(poly)


def reveals(mb, poly, y0, y1, inward=True):
    """Parois verticales le long d'un polygone CCW (x, z) ; normales vers l'intérieur (ou l'extérieur)."""
    n = len(poly)
    for k in range(n):
        a, b = poly[k], poly[(k + 1) % n]
        dx, dz = b[0] - a[0], b[1] - a[1]
        h = v(-dz, 0, dx) * (1 if inward else -1)
        mb.face([mb.vert(v(a[0], y0, a[1])), mb.vert(v(b[0], y0, b[1])), mb.vert(v(b[0], y1, b[1])),
                 mb.vert(v(a[0], y1, a[1]))], h)


def clip_x(poly, c, keep_le):
    if not poly:
        return []
    a, b = ((c, 0.0), (c, 1.0)) if keep_le else ((c, 1.0), (c, 0.0))
    return clip_poly(poly, a, b)


def rect_ccw(x0, x1, z0, z1):
    return [(x0, z0), (x1, z0), (x1, z1), (x0, z1)]


def foil(cx, cz, chord, thick, n=12):
    """Section en aile symétrique (NACA 00xx, bord d'attaque vers +x), CCW en (x, z)."""
    def yt(t):
        return 5 * thick * (0.2969 * math.sqrt(t) - 0.1260 * t - 0.3516 * t * t + 0.2843 * t ** 3 - 0.1036 * t ** 4)
    ts = [0.5 * (1 - math.cos(math.pi * k / n)) for k in range(n + 1)]   # 0 = bord d'attaque
    up = [(cx + chord * (0.5 - t), cz + chord * yt(t)) for t in ts]
    lo = [(cx + chord * (0.5 - t), cz - chord * yt(t)) for t in reversed(ts[1:-1])]
    return ccw(up + lo)


# ------------------------------------------------------------------------------------------------ courbes du salon
def _bezq(a, c, b, t):
    return a * (1 - t) ** 2 + c * (2 * t * (1 - t)) + b * (t * t)


def _plan_curve(zs, xc, xn, rc, rn, side_x, nc=24, nf=6, nn=10):
    """Demi-courbe tribord (x, z) : flanc droit z = zs aux abscisses side_x, angle (Bézier quadratique de
    tangente rc au sommet (xc, zs)), pan avant droit, nez (Bézier de tangente rn au sommet (xn, 0)), puis
    symétrique bâbord. Mêmes nombres de points pour B et T -> appariement par indice (surface réglée)."""
    C, N = V((xc, zs)), V((xn, 0.0))
    dF = (N - C).normalized()
    c0, c1 = C + V((-1, 0)) * rc, C + dF * rc
    n0 = N - dF * rn
    n0m = V((n0.x, -n0.y))
    half = [V((x, zs)) for x in side_x]
    half += [_bezq(c0, C, c1, k / nc) for k in range(1, nc + 1)]
    half += [c1.lerp(n0, k / nf) for k in range(1, nf + 1)]
    half += [_bezq(n0, N, n0m, 0.5 * k / nn) for k in range(1, nn + 1)]
    full = half + [V((p.x, -p.y)) for p in reversed(half[:-1])]
    return [(p.x, p.y) for p in full], c0.x


# sommets (avant lissage) des courbes B (pied) et T (haut) ; nez lissé B ≈ 6,57, T ≈ 4,92 (38°)
XB_CORNER, XB_NOSE_S, RB_CORNER, RB_NOSE = 6.05, 6.69, 2.75, 2.0
XT_CORNER, XT_NOSE_S, RT_CORNER, RT_NOSE = 4.70, 4.97, 1.40, 1.6
ZT = ZB - SIDE_SET


def _salon_curves():
    x_cs = XB_CORNER - RB_CORNER
    joints = (-2.40, 0.70, x_cs)
    xs = sorted(set([round(X_WALL0 + (x_cs - X_WALL0) * k / 30, 6) for k in range(30)] + [X_GLASS0, -2.40, 0.70]))
    xs = [x for x in xs if x < x_cs - 1e-6]
    pts, _ = _plan_curve(ZB, XB_CORNER, XB_NOSE_S, RB_CORNER, RB_NOSE, xs)
    tps, _ = _plan_curve(ZT, XT_CORNER, XT_NOSE_S, RT_CORNER, RT_NOSE, xs)
    nrm = plan_nrm(pts)
    nh = [v(n.x, 0, n.z).normalized() for n in nrm]
    B3 = [v(p[0], yb(p[0]), p[1]) for p in pts]
    T3 = [v(p[0], YU, p[1]) for p in tps]
    return pts, nrm, nh, B3, T3, joints


PATH_B, NRM_B, NH_B, B3, T3, JOINT_X = _salon_curves()


def joint_indices():
    idx = []
    n = len(PATH_B)
    for x in (X_GLASS0,) + JOINT_X:
        idx.append(min(range(n // 2), key=lambda i: abs(PATH_B[i][0] - x) + abs(PATH_B[i][1] - ZB)))
    zs = [min(range(n), key=lambda i: abs(PATH_B[i][1] - zj) + (99 if PATH_B[i][0] < 5.0 else 0)) for zj in (JOINT_Z, -JOINT_Z)]
    idx += zs
    for x in reversed((X_GLASS0,) + JOINT_X):
        idx.append(min(range(n // 2, n), key=lambda i: abs(PATH_B[i][0] - x) + abs(PATH_B[i][1] + ZB)))
    return idx


def surf(i, t):
    return B3[i].lerp(T3[i], t) + NH_B[i] * (BULGE * math.sin(math.pi * t))


class CPatch(Patch):
    def __init__(self, i0, i1):
        self.ids = list(range(i0, i1 + 1))
        self.M = len(self.ids)
        self.s = 1
        mid = self.ids[self.M // 2]
        self.s = -1 if self.N0(0.5, 0.5).dot(NH_B[mid]) < 0 else 1
        self.hs = 0.5 * ((T3[i0] - B3[i0]).length + (T3[i1] - B3[i1]).length)

    def P(self, u, w):
        f = max(0.0, min(1.0, u)) * (self.M - 1)
        k = min(int(f), self.M - 2)
        r = f - k
        return surf(self.ids[k], w).lerp(surf(self.ids[k + 1], w), r)

    def N0(self, u, w):
        du, dw = 1e-3, 1e-3
        pu = self.P(min(1, u + du), w) - self.P(max(0, u - du), w)
        pw = self.P(u, min(1, w + dw)) - self.P(u, max(0, w - dw))
        return pu.cross(pw).normalized()

    def uspan(self, w, eL, eR):
        L = sum((self.P((k + 1) / (self.M - 1), w) - self.P(k / (self.M - 1), w)).length for k in range(self.M - 1))
        return eL / L, 1 - eR / L


def joint_strip(mb, i, hw=0.014, d0=-0.016, d1=0.006, nw=12):
    rows, cens = [], []
    e = V((PATH_B[min(i + 1, len(PATH_B) - 1)][0] - PATH_B[max(i - 1, 0)][0], 0,
           PATH_B[min(i + 1, len(PATH_B) - 1)][1] - PATH_B[max(i - 1, 0)][1])).normalized()
    for k in range(nw + 1):
        t = -0.01 + 1.03 * k / nw
        p = surf(i, t)
        g = (surf(i, min(t + 0.01, 1.02)) - surf(i, max(t - 0.01, -0.01))).normalized()
        n = e.cross(g).normalized()
        if n.dot(NH_B[i]) < 0:
            n = -n
        s = g.cross(n).normalized()
        rows.append([p - s * hw + n * d0, p + s * hw + n * d0, p + s * hw * 0.8 + n * d1, p - s * hw * 0.8 + n * d1])
        cens.append(p + n * (0.5 * (d0 + d1)))
    mb.grid(rows, closed=True, hint=lambda c, ii, j: c - (cens[j] + cens[j + 1]) * 0.5, uv='arc')
    mb.face([mb.vert(q) for q in rows[0]], cens[0] - cens[1])
    mb.face([mb.vert(q) for q in rows[-1]], cens[-1] - cens[-2])


def salon_top_outline(a):
    pts2 = [(p.x, p.z) for p in T3]
    nrm = plan_nrm(pts2)
    pts = [(p[0] + n.x * a, p[1] + n.z * a) for p, n in zip(pts2, nrm)]
    xa = -5.24 if a > 0 else -5.14
    pts[0] = (xa, pts[0][1])
    pts[-1] = (xa, pts[-1][1])
    return ccw(pts)


def salon_glass_outline(y, a=0.0):
    """Contour (x, z) CCW de la face du vitrage à la hauteur y (bombé compris), décalé de a selon la normale."""
    t = max(0.0, min(1.0, (y - YL) / (YU - YL)))
    pts = []
    for i in range(len(PATH_B)):
        p = surf(i, t) + NH_B[i] * a
        pts.append((p.x, p.z))
    pts += [(X_POST1, pts[-1][1]), (X_POST1, pts[0][1])]
    return ccw(_dedupe(pts))


def _close_aft(pts, x):
    return ccw(_dedupe(list(pts) + [(x, pts[-1][1]), (x, pts[0][1])]))


SALON_OUTLINE = _close_aft([(p[0] + n.x * A_WALL, p[1] + n.z * A_WALL) for p, n in zip(PATH_B, NRM_B)], X_POST0)
SALON_INNER = _close_aft([(p[0] - n.x * T_WALL, p[1] - n.z * T_WALL) for p, n in zip(PATH_B, NRM_B)], X_POST1)
GLASS_TOP_OUTLINE = [(p.x, p.z) for p in T3]


# ------------------------------------------------------------------------------------------------ contours fly / hardtop
def _fly_loop():
    Z = FLY_ZH
    pts = [(FLY_X0, -Z), (FLY_X0, Z), (5.25, Z), (FLY_X1 + 0.10, 0.0), (5.25, -Z)]
    radii = [1.4, 1.4, 1.8, 2.4, 1.8]
    loop = ccw(rounded_poly(pts, radii, 18))
    return resample_closed(loop, 0.12)


def _ht_loop():
    Z = HT_ZH
    pts = [(HT_X0, -Z), (HT_X0, Z), (3.0, Z), (HT_X1, 0.0), (3.0, -Z)]
    radii = [1.2, 1.2, 1.1, 2.0, 1.1]
    loop = ccw(rounded_poly(pts, radii, 18))
    return resample_closed(loop, 0.12)


FLY_OUTLINE = _fly_loop()
FLY_NRM = out_normals(FLY_OUTLINE)
FLY_FIELD = ccw(offset_loop(FLY_OUTLINE, -FLY_FIELD_A, FLY_NRM))
FLY_RAIL_LINE = ccw(offset_loop(FLY_OUTLINE, -FLY_RAIL_A, FLY_NRM))
HT_OUTLINE = _ht_loop()


def _inside2(p, poly):
    x, y = p
    c = False
    n = len(poly)
    for i in range(n):
        x1, y1 = poly[i]
        x2, y2 = poly[(i + 1) % n]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            c = not c
    return c


def check_fit():
    ring = offset_loop(FLY_OUTLINE, -FLY_EDGE - 0.02, FLY_NRM)
    bad = [p for p in salon_top_outline(0.02) if not _inside2(p, ring)]
    if bad:
        print(f'[s29_super] ATTENTION : {len(bad)} points du haut du salon hors de la sous-face du fly, ex. {bad[:3]}')
    else:
        print('[s29_super] haut du salon couvert par la casquette du fly : ok')


# ------------------------------------------------------------------------------------------------ build
def build(ctx):
    check_fit()
    build_salon(ctx)
    build_glazing(ctx)
    build_aft_bay(ctx)
    build_ceiling(ctx)
    build_fly_deck(ctx)
    build_fly_rails(ctx)
    build_stair(ctx)
    build_hardtop(ctx)


# ================================================================================================ SALON
def build_salon(ctx):
    path, nrm = PATH_B, NRM_B
    gap, wall, sill = MB(), MB(), MB()
    profs = []
    for p in path:
        yl = yb(p[0])
        pr = [(0.020, Y_GAP0), (0.020, Y_GAP1)]
        pr += round_corner((0.020, Y_GAP1), (A_WALL - 0.004, Y_GAP1), (A_WALL - 0.004, Y_GAP1 + 0.05), 0.006, 3)
        h = yl - 0.040 - (Y_GAP1 + 0.006)
        for k in (1, 2, 3):
            t = k / 4
            pr.append((A_WALL - 0.004 + 0.008 * math.sin(math.pi * 0.5 * t) - 0.004 * t, Y_GAP1 + 0.006 + h * t))
        pr += [(A_WALL, yl - 0.040), (A_WALL - 0.006, yl - 0.040), (A_WALL - 0.006, yl - 0.032)]
        cy = yl - 0.014
        for k in range(7):
            a = -math.pi / 2 + math.pi * k / 6
            pr.append((A_WALL + 0.004 + 0.016 * math.cos(a), cy + 0.018 * math.sin(a)))
        pr += [(-0.02, yl + 0.004)]
        pr += round_corner((-0.02, yl + 0.004), (-T_WALL, yl + 0.004), (-T_WALL, Y_FLOOR), 0.012, 3)
        pr += [(-T_WALL, Y_FLOOR - 0.005)]
        profs.append(pr)
    npf = len(profs[0])
    j_wall0, j_sill0, j_sill1 = 2, 2 + 3 + 3 + 1, npf - 1 - 5
    mats = [gap if j < j_wall0 else wall if j < j_sill0 else sill if j < j_sill1 else wall for j in range(npf - 1)]
    sweep_prof(path, nrm, profs, mats, caps=True, cap_mb=wall)
    make_obj(ctx, gap, 'superstructure', 'caulk', 's29SalonShadowGap', sharp=30)
    make_obj(ctx, wall, 'superstructure', 'superstructure', 's29SalonWall', sharp=40)
    make_obj(ctx, sill, 'superstructure', 'accent', 's29SalonSillBead', sharp=50)

    # montants d'angle arrière (laqués, effilés, tête évasée)
    post = MB()
    xc = (X_POST0 + X_POST1) / 2
    for s in (1, -1):
        secs = []
        for y, zo, fx in ((Y_GAP0, 5.055, 1.0), (YL, 5.055, 1.0), (3.6, 4.975, 0.92), (4.50, 4.90, 1.0),
                          (4.66, 4.89, 1.18), (Y_RAIL1 + 0.01, 4.885, 1.45)):
            zi = 4.60
            hx = (X_POST1 - X_POST0) / 2 * fx
            hz = (zo - zi) / 2
            sec = ccw(rrect(xc, (zo + zi) / 2, hx, hz, 0.95 * min(hx, hz), 6))
            secs.append([v(x, y, s * z) for x, z in sec])
        loft_section(post, secs, lambda y, s=s: v(xc, y, s * 4.83))
    make_obj(ctx, post, 'superstructure', 'superstructure', 's29AftCornerPosts', sharp=35)

    # feux de navigation (boîtiers galets metalDark, lentilles navRed bâbord / navGreen tribord)
    nav, red, green = MB(), MB(), MB()
    n = len(PATH_B)
    i_nav = min(range(n // 2), key=lambda i: abs(PATH_B[i][0] - 4.6))
    p2, nh = PATH_B[i_nav], NH_B[i_nav]
    t2 = V((PATH_B[i_nav + 1][0] - PATH_B[i_nav - 1][0], 0, PATH_B[i_nav + 1][1] - PATH_B[i_nav - 1][1])).normalized()
    ymid = 0.5 * (Y_GAP1 + YL - 0.035)
    for s in (1, -1):
        M = (lambda q: q) if s > 0 else mz
        o = M(v(p2[0], ymid, p2[1]) + nh * A_WALL)
        t, nn = M(t2), M(nh)
        frame_box(nav, o, t, UP, nn, -0.16, 0.16, -0.050, 0.050, -0.006, 0.032)
        lens = green if s > 0 else red
        frame_box(lens, o, t, UP, nn, -0.130, 0.130, -0.030, 0.030, 0.026, 0.042)
    make_obj(ctx, nav, 'superstructure', 'metalDark', 's29NavHousings', bevel=(0.03, 4, 30))
    make_obj(ctx, green, 'superstructure', 'navGreen', 's29NavLensStbd', bevel=(0.02, 4, 30))
    make_obj(ctx, red, 'superstructure', 'navRed', 's29NavLensPort', bevel=(0.02, 4, 30))


def build_glazing(ctx):
    glass, caulk, joints, head, wip = MB(), MB(), MB(), MB(), MB()
    E_S, E_B, E_T = 0.024, 0.030, 0.045
    J = joint_indices()
    for k in range(len(J) - 1):
        i0, i1 = J[k], J[k + 1]
        pt = CPatch(i0, i1)
        eL = 0.03 if k == 0 else E_S
        eR = 0.03 if k == len(J) - 2 else E_S
        nu = max(4, i1 - i0)
        glazing(glass, caulk, pt, (eL, eR, E_B, E_T), nu=nu, nw=8, thick=0.014, frit=0.016, back=0.006)
    for i in J[1:-1]:
        joint_strip(joints, i)
    path = [(p.x, p.z) for p in T3]
    nrm = plan_nrm(path)
    prof = ccw(rounded_poly([(-0.075, Y_RAIL0), (0.035, Y_RAIL0), (0.035, Y_RAIL1), (-0.075, Y_RAIL1)],
                            [0.010, 0.016, 0.0, 0.0], 4))
    sweep_prof(path, nrm, [prof] * len(path), [head] * len(prof), closed_prof=True, caps=True, cap_mb=head)
    # essuie-glaces (2, parallèles, au repos au bas du pare-brise central, côté poste de pilotage tribord)
    n = len(PATH_B)
    for zp in (1.80, 0.55):
        i = min(range(n), key=lambda q: abs(PATH_B[q][1] - zp) + (99 if PATH_B[q][0] < 5.0 else 0))
        base = surf(i, 0.0)
        tu = (surf(i, 0.05) - base).normalized()
        e = V((PATH_B[i + 1][0] - PATH_B[i - 1][0], 0, PATH_B[i + 1][1] - PATH_B[i - 1][1])).normalized()
        if e.z > 0:
            e = -e
        nc = e.cross(tu).normalized()
        if nc.dot(NH_B[i]) < 0:
            nc = -nc
        ez = -e
        frame_box(wip, base + tu * 0.055, ez, tu, nc, -0.030, 0.030, -0.030, 0.030, 0.0, 0.028)
        frame_box(wip, base + tu * 0.055, ez, tu, nc, -0.75, 0.0, -0.010, 0.010, 0.020, 0.034)
        frame_box(wip, base + tu * 0.110, ez, tu, nc, -1.20, -0.30, -0.007, 0.007, 0.012, 0.028)
        frame_box(wip, base + tu * 0.055 + ez * -0.75, ez, tu, nc, -0.012, 0.012, -0.012, 0.068, 0.014, 0.034)
    make_obj(ctx, wip, 'upperGlass', 'metalDark', 's29Wipers', bevel=(0.004, 2, 30))
    make_obj(ctx, glass, 'upperGlass', 'glass', 's29SalonGlazing', sharp=60, wn=False)
    make_obj(ctx, caulk, 'upperGlass', 'caulk', 's29SalonGlazingJoints', sharp=30)
    make_obj(ctx, joints, 'upperGlass', 'metalDark', 's29GlassMullions', sharp=50)
    make_obj(ctx, head, 'upperGlass', 'metalDark', 's29HeadRail', sharp=50)


def build_aft_bay(ctx):
    """Baie vitrée arrière pleine largeur : 6 vantaux télescopiques (cadres 'superstructure', verres 'upperGlass')."""
    frames, header, sill, rails, handles = MB(), MB(), MB(), MB(), MB()
    glass, caulk = MB(), MB()
    ZO = 4.60
    YS, YH = Y_FLOOR + 0.010, Y_RAIL0
    aabb(header, X_POST0 + 0.005, X_POST1 - 0.005, YH, Y_RAIL1, -ZO - 0.02, ZO + 0.02)
    aabb(sill, X_POST0 - 0.03, X_POST1 + 0.01, Y_GAP0, YS, -ZO - 0.02, ZO + 0.02)
    RX = (-5.165, -5.230, -5.295)
    for xr in RX:
        aabb(rails, xr - 0.006, xr + 0.006, YS - 0.002, YS + 0.010, -ZO, ZO)
    leaves = []
    for s in (1, -1):
        leaves.append((RX[0], 3.04, ZO, s, False))
        leaves.append((RX[1], 1.50, 3.10, s, True))
        leaves.append((RX[2], 0.0, 1.56, s, True))
    for xc, z0, z1, s, slide in leaves:
        za, zb = sorted((s * z0, s * z1))
        hx = 0.0225
        SW, TR, BR = 0.050, 0.060, 0.080
        y0, y1 = YS + 0.004, YH - 0.004
        aabb(frames, xc - hx, xc + hx, y0, y1, za, za + SW)
        aabb(frames, xc - hx, xc + hx, y0, y1, zb - SW, zb)
        aabb(frames, xc - hx, xc + hx, y1 - TR, y1, za + SW, zb - SW)
        aabb(frames, xc - hx, xc + hx, y0, y0 + BR, za + SW, zb - SW)
        gz0, gz1 = za + SW - 0.012, zb - SW + 0.012
        gy0, gy1 = y0 + BR - 0.012, y1 - TR + 0.012
        poly = [v(xc, gy0, gz0), v(xc, gy0, gz1), v(xc, gy1, gz1), v(xc, gy1, gz0)]
        glazing_poly(glass, caulk, poly, v(-1, 0, 0), [0.010] * 4, thick=0.010, frit=0.004, back=0.005)
        if slide and z0 == 0.0:
            zh = s * 0.16
            aabb(handles, xc - hx - 0.045, xc - hx - 0.025, 2.95, 3.85, zh - 0.012, zh + 0.012)
            for yy in (2.98, 3.82):
                aabb(handles, xc - hx - 0.03, xc - hx + 0.001, yy - 0.01, yy + 0.01, zh - 0.008, zh + 0.008)
    make_obj(ctx, frames, 'superstructure', 'metalDark', 's29AftDoorFrames', bevel=(0.006, 3, 30))
    make_obj(ctx, header, 'superstructure', 'metalDark', 's29AftDoorHeader', bevel=(0.010, 3, 30))
    make_obj(ctx, sill, 'superstructure', 'accent', 's29AftDoorSill', bevel=(0.006, 3, 30))
    make_obj(ctx, rails, 'superstructure', 'metalDark', 's29AftDoorRails', bevel=(0.003, 2, 30))
    make_obj(ctx, handles, 'superstructure', 'metalDark', 's29AftDoorHandles', bevel=(0.005, 2, 30))
    make_obj(ctx, glass, 'upperGlass', 'glass', 's29AftBayGlazing', sharp=60, wn=False)
    make_obj(ctx, caulk, 'upperGlass', 'caulk', 's29AftBayJoints', sharp=30)


def build_ceiling(ctx):
    """Plafond intérieur du salon (groupe 'roof')."""
    cout = salon_top_outline(-0.05)
    cin = ccw(inset2(cout, 0.40))
    band_line = ccw(inset2(cout, 0.20))
    L = cum_len([V(p) for p in band_line] + [V(band_line[0])])
    tot = L[-1]
    nsp = max(8, int(tot / 1.2))
    spots = []
    loopc = [V(p) for p in band_line] + [V(band_line[0])]
    for k in range(nsp):
        sv = tot * (k + 0.5) / nsp
        for i in range(len(L) - 1):
            if L[i] <= sv <= L[i + 1]:
                t = (sv - L[i]) / max(L[i + 1] - L[i], 1e-9)
                spots.append(tuple(loopc[i].lerp(loopc[i + 1], t)))
                break
    band, ceil_wall, led, coffer = MB(), MB(), MB(), MB()
    cdt_fill(band, Y_CEIL, cout, [ccw(cin)] + [ccw(circle(x, z, 0.045, 16)) for x, z in spots], down=True)
    reveals(ceil_wall, cin, Y_CEIL, Y_CEIL + 0.03)
    reveals(led, cin, Y_CEIL + 0.03, Y_CEIL + 0.05)
    reveals(ceil_wall, cin, Y_CEIL + 0.05, Y_COFFER)
    strips = [rect_ccw(-4.3, 3.2, zc - 0.02, zc + 0.02) for zc in (-1.6, 1.6)]
    cdt_fill(coffer, Y_COFFER, ccw(cin), strips, down=True)
    for s in strips:
        reveals(ceil_wall, s, Y_COFFER, Y_COFFER + 0.012)
        led.face([led.vert(v(x, Y_COFFER + 0.012, z)) for x, z in s], -UP)
    make_obj(ctx, band, 'roof', 'ceiling', 's29CeilingPanel', sharp=30)
    make_obj(ctx, coffer, 'roof', 'ceiling', 's29CeilingCoffer', sharp=30)
    make_obj(ctx, ceil_wall, 'roof', 'ceiling', 's29CeilingReveals', sharp=30)
    make_obj(ctx, led, 'roof', 'ledStrip', 's29CeilingLedStrips', sharp=30, wn=False)
    bez, lens = MB(), MB()
    for x, z in spots:
        spot(bez, lens, x, z, Y_CEIL)
    make_obj(ctx, bez, 'roof', 'metalDark', 's29CeilingSpotBezels', sharp=50)
    make_obj(ctx, lens, 'roof', 'ledStrip', 's29CeilingSpotLenses', sharp=50, wn=False)


# ================================================================================================ FLY
def edge_profile(w, y_sof, y_top, y_nose, nose_h=0.016):
    """Chant arrondi (a vers l'extérieur, y absolu) : sous-face -> nez (jonc) -> dessus. Renvoie (profil, clés mat)."""
    yn0, yn1 = y_nose - nose_h / 2, y_nose + nose_h / 2
    under = _bez((-w, y_sof), (-0.48 * w, y_sof), (0.0, yn0 - 0.55 * (yn0 - y_sof)), (0.0, yn0 - 0.004), 10)
    nose = [(0.0018, yn0), (0.0026, y_nose), (0.0018, yn1)]
    top = _bez((0.0, yn1 + 0.004), (0.0, yn1 + 0.55 * (y_top - yn1)), (-0.42 * w, y_top), (-w, y_top), 12)
    prof = under + nose + top
    mk = ['s'] * (len(under) - 1) + ['a'] * (len(nose) + 1) + ['s'] * (len(top) - 1)
    return prof, mk


def teak_field(boards, caulk, field, y, rect_holes, pitch, z_origin, gap=0.006, butt=4.6, h=0.0035):
    """Vraies lattes de teck (fil selon x) découpées dans le polygone convexe field, moins les trous
    rectangulaires (x0, x1, z0, z1) alignés sur les lattes ; fond calfaté 'caulk' en retrait de h."""
    xs = [p[0] for p in field]
    zs = [p[1] for p in field]
    xmin, xmax = min(xs) - 0.5, max(xs) + 0.5
    k0 = int(math.floor((min(zs) - z_origin) / pitch)) - 1
    k1 = int(math.ceil((max(zs) - z_origin) / pitch)) + 1
    for k in range(k0, k1):
        za, zb = z_origin + k * pitch + gap / 2, z_origin + (k + 1) * pitch - gap / 2
        P = clip_convex(rect_ccw(xmin, xmax, za, zb), field)
        if len(P) < 3:
            continue
        pieces = [P]
        zm = 0.5 * (za + zb)
        for (ox0, ox1, oz0, oz1) in rect_holes:
            if oz0 < zm < oz1:
                pieces = [q for p in pieces for q in (clip_x(p, ox0, True), clip_x(p, ox1, False))]
        off = ((k * 7) % 5) / 5.0 * butt
        cuts = [xmin + off + m * butt for m in range(-1, int((xmax - xmin) / butt) + 3)]
        for p in pieces:
            segs = [p]
            for c in cuts:
                nxt = []
                for q in segs:
                    if not q:
                        continue
                    qx = [t[0] for t in q]
                    if min(qx) < c < max(qx):
                        nxt += [clip_x(q, c - gap / 2, True), clip_x(q, c + gap / 2, False)]
                    else:
                        nxt.append(q)
                segs = nxt
            for q in segs:
                q = _dedupe([tuple(t) for t in q])
                if len(q) < 3 or abs(area2(q)) < 2e-4:
                    continue
                q = ccw(q)
                boards.face([boards.vert(v(x, y, z)) for x, z in q], UP)
                reveals(boards, q, y - h, y, inward=False)
    holes = [rect_ccw(ox0, ox1, oz0, oz1) for (ox0, ox1, oz0, oz1) in rect_holes]
    cdt_fill(caulk, y - h, field, holes)


def build_fly_deck(ctx):
    loop, nrm = FLY_OUTLINE, FLY_NRM
    prof, mk = edge_profile(FLY_EDGE, Y_SOF, FLY_Y, 4.878)
    edge_s, edge_a = MB(), MB()
    mbs = [{'s': edge_s, 'a': edge_a}[k] for k in mk]
    sweep_prof(loop, nrm, [prof] * len(loop), mbs, closed_path=True)
    make_obj(ctx, edge_s, 'roof', 'superstructure', 's29FlyDeckEdge', sharp=40)
    make_obj(ctx, edge_a, 'roof', 'accent', 's29FlyDeckNoseBead', sharp=60)

    ring = ccw(offset_loop(loop, -FLY_EDGE, nrm))
    ox0, ox1, oz0, oz1 = FLY_OPENING
    hole = rect_ccw(ox0, ox1, oz0, oz1)
    hole_m = (ox0 - OPEN_M, ox1 + OPEN_M, oz0 - OPEN_M, oz1 + OPEN_M)
    # marge laquée (bord -> teck) + marge autour de la trémie
    margin = MB()
    cdt_fill(margin, FLY_Y, ring, [FLY_FIELD])
    cdt_fill(margin, FLY_Y, rect_ccw(*hole_m), [hole])
    make_obj(ctx, margin, 'roof', 'superstructure', 's29FlyDeckMargin', sharp=30)
    # teck
    boards, caulk = MB(), MB()
    pitch = (hole_m[3] - hole_m[2]) / 13.0
    teak_field(boards, caulk, FLY_FIELD, FLY_Y, [hole_m], pitch, hole_m[2])
    make_obj(ctx, boards, 'roof', 'deck', 's29FlyDeckBoards', sharp=30, wn=False)
    make_obj(ctx, caulk, 'roof', 'caulk', 's29FlyDeckCaulk', sharp=30, wn=False)
    # parois de la trémie
    well = MB()
    reveals(well, hole, Y_SOF, FLY_Y, inward=True)
    make_obj(ctx, well, 'roof', 'superstructure', 's29FlyStairWell', sharp=30)

    # sous-face extérieure (casquette + dessus du cockpit) : spots + ruban LED en U
    sof = MB()
    salon_hole = salon_top_outline(0.015)
    spots = [(x, z) for x in (-9.0, -7.9, -6.8, -5.75) for z in (-2.3, -0.85, 0.85, 2.3)]
    # ruban LED en U parallèle au bord (x < -5.6)
    led_line = offset_loop(loop, -0.36, nrm)
    P = [V(p) for p in led_line] + [V(led_line[0])]
    L = cum_len(P)
    # abscisses où la ligne franchit x = -5.6 (côté tribord puis bâbord en tournant par l'arrière)
    cross = []
    for i in range(len(P) - 1):
        a, b = P[i], P[i + 1]
        if (a.x - -5.6) * (b.x - -5.6) < 0:
            t = (-5.6 - a.x) / (b.x - a.x)
            cross.append((L[i] + (L[i + 1] - L[i]) * t, a.y + (b.y - a.y) * t))
    # boucle CCW : de tribord (z>0) on passe à l'arrière puis à bâbord
    s_st = [c[0] for c in cross if c[1] > 0][0]
    s_po = [c[0] for c in cross if c[1] < 0][0]
    if s_po < s_st:
        s_po += L[-1]
    cl = sub_path(P, L, s_st, s_po, 0.12)
    cn = plan_nrm(cl)
    wl = 0.0125
    strip = ccw([(p[0] + n.x * wl, p[1] + n.z * wl) for p, n in zip(cl, cn)] +
                [(p[0] - n.x * wl, p[1] - n.z * wl) for p, n in zip(reversed(cl), list(reversed(cn)))])
    holes = [salon_hole, hole, strip] + [ccw(circle(x, z, 0.045, 16)) for x, z in spots]
    cdt_fill(sof, Y_SOF, ring, holes, down=True)
    make_obj(ctx, sof, 'roof', 'superstructure', 's29FlySoffit', sharp=30)
    rv, led = MB(), MB()
    reveals(rv, strip, Y_SOF, Y_SOF + 0.012)
    cdt_fill(led, Y_SOF + 0.012, strip, down=True)
    make_obj(ctx, rv, 'roof', 'superstructure', 's29FlySoffitLedReveal', sharp=30)
    make_obj(ctx, led, 'roof', 'ledStrip', 's29FlySoffitLedStrip', sharp=30, wn=False)
    bez, lens = MB(), MB()
    for x, z in spots:
        spot(bez, lens, x, z, Y_SOF)
    make_obj(ctx, bez, 'roof', 'metalDark', 's29FlySoffitSpotBezels', sharp=50)
    make_obj(ctx, lens, 'roof', 'ledStrip', 's29FlySoffitSpotLenses', sharp=50, wn=False)


def _tube_prof(ac, yc, r, n=12):
    return [(ac + r * math.cos(2 * math.pi * k / n), yc + r * math.sin(2 * math.pi * k / n)) for k in range(n)]


def _shoe_prof():
    return ccw(rounded_poly([(-0.03, FLY_Y - 0.004), (0.03, FLY_Y - 0.004), (0.03, FLY_Y + 0.07), (-0.03, FLY_Y + 0.07)],
                            [0.0, 0.0, 0.012, 0.012], 3))


def _rail_set(path, closed, glass_mb_of, shoe, hand, blend=None, panel=1.75, gapg=0.012):
    """Garde-corps vitré le long de path (x, z) : sabot continu, verres en panneaux, main courante continue.
    blend(p) -> w (1 = garde-corps vertical plein, 0 = pare-brise bas incliné)."""
    if closed:
        nrm = out_normals(path)
    else:
        nrm = plan_nrm(path)   # tronçon ouvert : côté arbitraire (profils symétriques)
    blend = blend or (lambda p: 1.0)
    t = 0.0075
    yg0 = FLY_Y + 0.035

    def gprof(p):
        w = blend(p)
        H = DEFL_H + (RAIL_H - DEFL_H) * w
        dx = -H * math.tan(DEFL_RAKE * (1 - w))
        return [(-t, yg0), (t, yg0), (t + dx, yg0 + H), (-t + dx, yg0 + H)], (dx, yg0 + H)

    shoe_p = _shoe_prof()
    sweep_prof(path, nrm, [shoe_p] * len(path), [shoe] * len(shoe_p), closed_path=closed, closed_prof=True,
               caps=not closed, cap_mb=shoe)
    hp = []
    for p in path:
        _, (dx, ytop) = gprof(p)
        hp.append(_tube_prof(dx, ytop + 0.008, 0.022))
    sweep_prof(path, nrm, hp, [hand] * len(hp[0]), closed_path=closed, closed_prof=True, caps=not closed, cap_mb=hand)
    # panneaux de verre
    P = [V(p) for p in path] + ([V(path[0])] if closed else [])
    L = cum_len(P)
    tot = L[-1]
    npan = max(1, int(round(tot / panel)))
    for k in range(npan):
        s0 = tot * k / npan + gapg / 2
        s1 = tot * (k + 1) / npan - gapg / 2
        if closed:
            sp = sub_path(P, L, s0, s1, 0.10)
        else:
            sp = _open_sub(P, L, s0, s1)
        sn = plan_nrm(sp)
        if closed:
            sn = [-n for n in sn]
        profs = [gprof(p)[0] for p in sp]
        mid = sp[len(sp) // 2]
        gm = glass_mb_of(mid)
        sweep_prof(sp, sn, profs, [gm] * 4, closed_prof=True, caps=True, cap_mb=gm)


def _open_sub(P, L, s0, s1, step=0.10):
    n = max(2, int(math.ceil((s1 - s0) / step)) + 1)
    out = []
    for i in range(n):
        s = s0 + (s1 - s0) * i / (n - 1)
        k = 0
        while k < len(L) - 2 and L[k + 1] < s:
            k += 1
        t = (s - L[k]) / max(L[k + 1] - L[k], 1e-12)
        q = P[k].lerp(P[k + 1], t)
        out.append((q.x, q.y))
    return out


def build_fly_rails(ctx):
    shoe, hand, g_rail, g_defl = MB(), MB(), MB(), MB()
    path = resample_closed(FLY_RAIL_LINE, 0.10)

    def blend(p):
        return 1.0 - ss(X_DEFL0, X_DEFL1, p[0])

    _rail_set(path, True, lambda m: g_defl if m[0] > X_DEFL0 + 0.3 else g_rail, shoe, hand, blend=blend)
    # garde-corps de la trémie (côtés intérieur et extérieur), on débouche vers l'avant
    for zg in (FLY_OPENING[2] + 0.015, FLY_OPENING[3] - 0.015):
        sp = [(x, zg) for x in [FLY_OPENING[1] - (FLY_OPENING[1] - (-9.42)) * k / 20 for k in range(21)]]
        _rail_set(sp, False, lambda m: g_rail, shoe, hand, panel=1.6)
    make_obj(ctx, shoe, 'roof', 'metalDark', 's29FlyRailShoe', sharp=40)
    make_obj(ctx, hand, 'roof', 'chrome', 's29FlyHandrail', sharp=60)
    make_obj(ctx, g_rail, 'roof', 'glass', 's29FlyRailGlass', sharp=60, wn=False)
    make_obj(ctx, g_defl, 'upperGlass', 'glass', 's29FlyWindDeflector', sharp=60, wn=False)


# ================================================================================================ ESCALIER
def build_stair(ctx):
    X0, X1 = STAIR_X0, STAIR_X1
    ZC = STAIR_ZC
    N = 11
    r = (FLY_Y - DECK_Y) / N
    g = (X1 - X0) / (N - 1)
    z0, z1 = ZC - STAIR_W / 2, ZC + STAIR_W / 2
    treads, led, brk, spine = MB(), MB(), MB(), MB()
    TH = 0.055
    S = lambda x: DECK_Y + (x - X0) * r / g - 0.10      # dessus du limon
    for k in range(1, N):
        xa = X0 + (k - 1) * g - 0.035
        xb = X0 + k * g
        yt = DECK_Y + k * r
        aabb(treads, xa, xb, yt - TH, yt, z0, z1)
        aabb(led, xa + 0.012, xa + 0.030, yt - TH - 0.006, yt - TH + 0.001, z0 + 0.05, z1 - 0.05)
        bx0, bx1 = xb - 0.17, xb - 0.03
        aabb(brk, bx0, bx1, S(bx0) - 0.03, yt - TH + 0.002, ZC - 0.05, ZC + 0.05)
    make_obj(ctx, treads, 'roof', 'deck', 's29FlyStairTreads', bevel=(0.008, 3, 30))
    make_obj(ctx, led, 'roof', 'ledStrip', 's29FlyStairLeds', sharp=30, wn=False)
    make_obj(ctx, brk, 'roof', 'metalDark', 's29FlyStairBrackets', bevel=(0.004, 2, 30))
    # limon central laqué (section arrondie verticale 0,16 × 0,22), du pont à la paroi avant de la trémie
    xs = [X0 - 0.12 + (X1 + 0.02 - (X0 - 0.12)) * k / 16 for k in range(17)]
    sec = ccw(rounded_poly([(-0.08, -0.22), (0.08, -0.22), (0.08, 0.0), (-0.08, 0.0)], 0.035, 4))
    rows = [[v(x, S(x) + b, ZC + a) for a, b in sec] for x in xs]
    axis = lambda x: v(x, S(x) - 0.11, ZC)
    spine.grid(rows, closed=True, hint=lambda c, i, j: c - axis(c.x), uv='arc')
    spine.face([spine.vert(p) for p in rows[0]], v(-1, 0, 0))
    spine.face([spine.vert(p) for p in rows[-1]], v(1, 0, 0))
    make_obj(ctx, spine, 'roof', 'superstructure', 's29FlyStairSpine', sharp=35)
    # joues vitrées + mains courantes (alignées sur les garde-corps de la trémie)
    glass, hand = MB(), MB()
    nose = lambda x: DECK_Y + r + (x - X0 + 0.035) * r / g
    xa = X0 - 0.03
    xe = X1 - 0.01
    yc = Y_SOF - 0.02
    # abscisse où le haut de la joue atteint la sous-face
    xc = X0 - 0.035 + (yc - 0.90 - DECK_Y - r) * g / r
    for zg in (FLY_OPENING[2] + 0.015, FLY_OPENING[3] - 0.015):
        pts = [(xa, nose(xa) - 0.20), (xe, nose(xe) - 0.20), (xe, yc), (xc, yc), (xa, nose(xa) + 0.90)]
        slab_xy(glass, pts, zg, 0.012)
        a = v(xa + 0.02, nose(xa + 0.02) + 0.93, zg)
        b = v(xc - 0.06, nose(xc - 0.06) + 0.93, zg)
        rod(hand, a, b, 0.021, seg=14)
    make_obj(ctx, glass, 'roof', 'glass', 's29FlyStairGlass', sharp=60, wn=False)
    make_obj(ctx, hand, 'roof', 'chrome', 's29FlyStairHandrails', sharp=60)


def slab_xy(mb, pts, zc, t):
    """Plaque d'épaisseur t (selon z) de contour pts (x, y) convexe."""
    pts = ccw(pts)
    f = [mb.vert(v(x, y, zc + t / 2)) for x, y in pts]
    b = [mb.vert(v(x, y, zc - t / 2)) for x, y in pts]
    mb.face(f)
    mb.face(b[::-1])
    n = len(pts)
    for k in range(n):
        k2 = (k + 1) % n
        mb.face([f[k], b[k], b[k2], f[k2]])


# ================================================================================================ HARDTOP
def build_hardtop(ctx):
    loop = HT_OUTLINE
    nrm = out_normals(loop)
    prof, mk = edge_profile(HT_EDGE, HT_SOFFIT_Y, HT_Y, 7.480)
    edge_s, edge_a = MB(), MB()
    mbs = [{'s': edge_s, 'a': edge_a}[k] for k in mk]
    sweep_prof(loop, nrm, [prof] * len(loop), mbs, closed_path=True)
    make_obj(ctx, edge_s, 'roof', 'superstructure', 's29HardtopEdge', sharp=40)
    make_obj(ctx, edge_a, 'roof', 'accent', 's29HardtopNoseBead', sharp=60)
    ring = ccw(offset_loop(loop, -HT_EDGE, nrm))

    # champ solaire
    x0, x1, zh = SOLAR_HT
    F = offset_loop(loop, -0.50, nrm)
    F = _dedupe([tuple(p) for p in clip_convex(ccw(F), rect_ccw(x0, x1, -zh, zh))])
    F = ccw(F)
    Fo = ccw(inset2(F, -0.010))
    Fi = ccw(inset2(F, 0.070))
    topm = MB()
    cdt_fill(topm, HT_Y, ring, [Fo])
    make_obj(ctx, topm, 'roof', 'superstructure', 's29HardtopTop', sharp=30)
    groove = MB()
    YG = HT_Y - 0.012
    reveals(groove, Fo, YG, HT_Y, inward=True)
    cdt_fill(groove, YG, Fo, [F])
    reveals(groove, F, YG, HT_Y, inward=False)
    make_obj(ctx, groove, 'roof', 'caulk', 's29SolarGroove', sharp=30)
    cells = []
    ncol, nrow = 7, 9
    bw = 0.026
    for i in range(ncol):
        xa, xb = x0 + (x1 - x0) * i / ncol + bw, x0 + (x1 - x0) * (i + 1) / ncol - bw
        for j in range(nrow):
            za, zb = -zh + 2 * zh * j / nrow + bw, -zh + 2 * zh * (j + 1) / nrow - bw
            c = clip_convex(rect_ccw(xa, xb, za, zb), Fi)
            c = _dedupe([tuple(p) for p in c])
            if len(c) >= 3 and abs(area2(c)) > 0.30:
                cells.append(ccw(c))
    tray, cell_mb, cwall = MB(), MB(), MB()
    cdt_fill(tray, HT_Y, F, cells)
    YC = HT_Y - 0.004
    for c in cells:
        cell_mb.face([cell_mb.vert(v(x, YC, z)) for x, z in c], UP)
        reveals(cwall, c, YC, HT_Y, inward=True)
    make_obj(ctx, tray, 'roof', 'metalDark', 's29SolarFrame', sharp=30)
    make_obj(ctx, cwall, 'roof', 'metalDark', 's29SolarCellReveals', sharp=30)
    make_obj(ctx, cell_mb, 'roof', 'acrylic', 's29SolarCells', sharp=30, wn=False)

    # sous-face : gorge LED périphérique + spots
    lo = ccw(offset_loop(loop, -0.55, nrm))
    li = ccw(offset_loop(loop, -0.58, nrm))
    sof, rv, led = MB(), MB(), MB()
    spots = [(x, z) for x in (-7.6, -5.6, -3.6, -1.6, 0.4, 2.2) for z in (-3.2, -1.3, 1.3, 3.2)]
    cdt_fill(sof, HT_SOFFIT_Y, ring, [lo], down=True)
    cdt_fill(sof, HT_SOFFIT_Y, li, [ccw(circle(x, z, 0.045, 16)) for x, z in spots], down=True)
    reveals(rv, lo, HT_SOFFIT_Y, HT_SOFFIT_Y + 0.012, inward=True)
    reveals(rv, li, HT_SOFFIT_Y, HT_SOFFIT_Y + 0.012, inward=False)
    cdt_fill(led, HT_SOFFIT_Y + 0.012, lo, [li], down=True)
    make_obj(ctx, sof, 'roof', 'superstructure', 's29HardtopSoffit', sharp=30)
    make_obj(ctx, rv, 'roof', 'superstructure', 's29HardtopLedReveal', sharp=30)
    make_obj(ctx, led, 'roof', 'ledStrip', 's29HardtopLedCove', sharp=30, wn=False)
    bez, lens = MB(), MB()
    for x, z in spots:
        spot(bez, lens, x, z, HT_SOFFIT_Y)
    make_obj(ctx, bez, 'roof', 'metalDark', 's29HardtopSpotBezels', sharp=50)
    make_obj(ctx, lens, 'roof', 'ledStrip', 's29HardtopSpotLenses', sharp=50, wn=False)

    # 4 montants en aile (pieds et têtes évasés, avant inclinés vers l'arrière)
    pil = MB()
    y0, y1 = FLY_Y - 0.005, HT_SOFFIT_Y + 0.012
    for (fx, fz), (hx, hz) in zip(HT_PILLAR_FEET, HT_PILLAR_HEADS):
        secs, cens = [], []
        for y, f in ((y0, 1.32), (FLY_Y + 0.03, 1.20), (FLY_Y + 0.14, 1.03), (FLY_Y + 0.5, 1.0), (6.6, 0.97),
                     (7.15, 1.0), (7.30, 1.10), (7.37, 1.28), (y1, 1.45)):
            t = (y - y0) / (y1 - y0)
            cx, cz = fx + (hx - fx) * t, fz + (hz - fz) * t
            ch = 0.40 * (1 + (f - 1) * 0.6)
            sec = foil(cx, cz, ch, 0.11 * f / ch, 12)
            secs.append([v(x, y, z) for x, z in sec])
        axis = lambda y, fx=fx, fz=fz, hx=hx, hz=hz: v(fx + (hx - fx) * (y - y0) / (y1 - y0), y,
                                                     fz + (hz - fz) * (y - y0) / (y1 - y0))
        loft_section(pil, secs, axis)
    make_obj(ctx, pil, 'roof', 'metalDark', 's29HardtopPillars', sharp=35)
