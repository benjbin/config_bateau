"""DIÈDRE 24 Catamaran — salon vitré, vitrages et hardtop (groupes 'superstructure', 'upperGlass', 'roof').

Direction de design (fiche, demande client) : luxe MODERNE aux FORMES ARRONDIES. Salon aux angles très
arrondis en plan, vitrage enveloppant continu en verre cintré (surface réglée galbée entre la ligne de seuil et
la traverse haute, bombé de 25 mm), pare-brise bombé à 35°, joints fins effilés, montants arrière effilés à pied
et tête évasés ; hardtop aux bords en goutte d'eau (chant aminci, jonc 'accent' fin au nez), angles arrondis en
plan, sous-face qui se raccorde en douceur aux montants. Vitrages épais posés dans un joint noir en retrait
(bordure sérigraphiée), joint creux d'ombre au pied (même principe que le DIÈDRE 29).
Utilitaires importés de parts/superstructure.py (MB, make_obj, Patch, glazing, inset2…).

Repère three.js (+X avant, +Y haut, +Z tribord), cotes principales : lib/cat_lines.py.

Cotes CHOISIES ici (absentes de la fiche) — à respecter par cat_hull / cat_interior :
  * Pied des vitrages en plan (courbe B, plan a = 0) : flancs droits z = ±4,00 de x = -4,70 à ~3,35, angles
    avant arrondis (Bézier, tangente 1,80 m, rayon mini ≈ 1,27 m), pare-brise bombé en plan, nez x = 5,38 en
    z = 0. Face extérieure du soubassement 30 mm en dehors de B (z = ±4,03, x = 5,41 au nez).
  * Base des vitrages / dessus de seuil yb(x) = 2,12 + 0,38·smoothstep(2,6 ; 5,2 ; x) (2,12 flancs -> 2,50 avant).
  * Haut des vitrages (courbe T, y = 4,12) : T = B − n·d, d = 0,18 (dévers des flancs) -> 1,134 au nez
    (pare-brise 35° sur la verticale) ; d = 0,18 + 0,954·smoothstep(0,30 ; 0,97 ; n_x).
    Au centre : x_ws(y) = 5,38 − (y − 2,50)·tan 35° (haut x ≈ 4,25).
  * Soubassement : pied y = 1,95 (joint creux d'ombre 1,935 → 1,968) ; face intérieure 0,10 m en dedans de B
    (|z| = 3,90 sur les flancs), descend jusqu'à 1,995 ; dessus intérieur de l'allège à yb + 0,004.
    -> le mobilier reste derrière la face intérieure de l'allège (y < yb) et derrière le verre au-dessus.
  * Joints de vitrage : x = -2,05 / 0,60 / 3,00 sur les flancs, z = ±1,60 au pare-brise (verres cintrés
    d'angle de x 3,00 à z ±1,60 ; pare-brise central |z| ≤ 1,60).
  * Traverse haute (metalDark) 4,09 → 4,185 ; plafond 'ceiling' à 4,15 (bandeau périphérique 0,40 m, spots),
    caisson central à 4,21 bordé d'une gorge LED + 2 filets LED (z ±1,25) ; sous-face extérieure y = 4,17.
  * Hardtop : plan arrondi (x -10,6 → 6,0, demi-largeur 4,75 ; angles arrière tangente 1,0 m, épaule avant
    (2,6 ; ±4,75) tangente 1,8 m, (5,75 ; ±2,9) tangente 1,3 m, nez bombé x = 6,0). Chant en goutte d'eau :
    dessus plat 4,40 qui s'enroule sur 0,40 m jusqu'au nez (y 4,27–4,29, jonc 'accent'), sous-face remontant
    de 4,17 au nez. Champ solaire = contour en retrait de 0,55 borné à SOLAR, 9 × 8 modules (barres 56 mm).
  * Montants d'angle arrière du salon (laqués, effilés) : x -4,96 → -4,70, |z| 3,58 → 4,035 (pied) / 3,86
    (tête), tête évasée dans la sous-face.
  * Baie arrière coulissante (plan x ≈ -4,80) : 4 vantaux, ouverture |z| ≤ 3,58, seuil 1,94 → 2,008,
    imposte 4,09 → 4,17 ; vantaux fixes |z| 1,78 → 3,58 (rail avant x -4,78), coulissants |z| 0 → 1,84
    (rail arrière x -4,875).
"""
import math
import bpy  # noqa: F401
from mathutils import Vector as V
from mathutils import geometry as mgeo

from cat_lines import ROOF_Y, HARDTOP_X0, HARDTOP_X1, PILLARS, SOLAR, SALON_CEIL_Y
from superstructure import (MB, make_obj, inset2, cum_len, newell, round_corner, rounded_poly, frame_box, aabb,
                            _inside, Patch, glazing)

UP = V((0, 1, 0))

# ------------------------------------------------------------------------------------------------ cotes
X_POST0, X_POST1 = -4.96, -4.70      # montants d'angle arrière du salon
X_WALL0 = -4.76                      # début du soubassement / traverse (noyé dans le montant)
X_GLASS0 = -4.70                     # début des vitrages latéraux
Y_GAP0, Y_GAP1 = 1.935, 1.968        # joint creux d'ombre au pied
YL_SIDE, YL_FRONT = 2.12, 2.50       # base des vitrages (dessus de seuil)
YU = 4.12                            # haut des vitrages
Y_RAIL0, Y_RAIL1 = 4.09, 4.185       # traverse haute
Y_SOF = 4.17                         # sous-face extérieure du hardtop
Y_CEIL = SALON_CEIL_Y                # 4.15
Y_COFFER = 4.21
Y_TOP = ROOF_Y                       # 4.40
A_WALL = 0.03                        # face du soubassement / plan du pied des glaces
T_WALL = 0.10                        # face intérieure en dedans du pied des glaces
WS_TAN = math.tan(math.radians(35))
Y_FLOOR = 2.00
BULGE = 0.025                        # bombé vertical des verres
JOINT_X = (-2.05, 0.60, 3.00)
JOINT_Z = 1.60


def v(x, y, z):
    return V((x, y, z))


def mz(p):
    return V((p.x, p.y, -p.z))


def ss(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def yb(x):
    return YL_SIDE + (YL_FRONT - YL_SIDE) * ss(2.6, 5.2, x)


def setback(nx):
    return 0.18 + (1.134 - 0.18) * ss(0.30, 0.97, nx)


# ------------------------------------------------------------------------------------------------ outils
def fillet2(pts, radii, seg=4, closed=False):
    """Polyligne 2D (x, z) aux coins arrondis (Bézier tangente, r par sommet ; extrémités conservées)."""
    n = len(pts)
    out = []
    for i in range(n):
        r = radii[i] if isinstance(radii, (list, tuple)) else radii
        if (not closed and (i == 0 or i == n - 1)) or r <= 0:
            out.append(tuple(pts[i]))
            continue
        a, c, b = V(pts[i - 1]), V(pts[i]), V(pts[(i + 1) % n])
        if abs((c - a).normalized().dot((b - c).normalized())) > 0.9999:
            out.append(tuple(pts[i]))
            continue
        rr = min(r, 0.45 * (c - a).length, 0.45 * (b - c).length)
        out += round_corner(a, c, b, rr, seg)
    return out


def plan_nrm(path2, closed=False):
    """Normales horizontales (x, z) à droite du parcours (= extérieur pour un parcours tribord -> avant -> bâbord)."""
    n = len(path2)
    segn = []
    rng = range(n) if closed else range(n - 1)
    for i in rng:
        a, b = V(path2[i]), V(path2[(i + 1) % n])
        e = (b - a).normalized()
        segn.append(V((-e.y, e.x)))
    res = []
    for i in range(n):
        if closed:
            ns = [segn[i - 1], segn[i]]
        else:
            ns = [segn[j] for j in (i - 1, i) if 0 <= j < n - 1]
        m = sum(ns, V((0, 0))).normalized()
        # compensation d'onglet (épaisseur constante)
        c = max(0.5, m.dot(ns[0]))
        res.append(v(m.x / c, 0, m.y / c))
    return res


def round_open(pts, radii, seg=3):
    """Profil 2D ouvert (a, y) : arrondit les sommets intérieurs de rayon > 0."""
    out = [tuple(pts[0])]
    for i in range(1, len(pts) - 1):
        r = radii[i]
        if r > 0:
            out += round_corner(pts[i - 1], pts[i], pts[i + 1], r, seg)
        else:
            out.append(tuple(pts[i]))
    out.append(tuple(pts[-1]))
    return out


def sweep_prof(path, nrm, profs, mbs, closed_path=False, closed_prof=False, caps=None, cap_mb=None):
    """Balaye des profils (a, y) (a = selon la normale horizontale nrm[i], y absolu) le long de path (x, z).
    profs[i] = profil au point i (même nombre de points). mbs[j] = MB du segment de profil j.
    Convention : profil parcouru face extérieure vers le haut (sens trigonométrique en (a, y)) -> normales
    sortantes = nrm·dy − up·da. UV en mètres : u = abscisse le long du parcours, v = développé du profil."""
    n = len(path)
    npf = len(profs[0])
    P3 = [[v(path[i][0], 0, path[i][1]) + nrm[i] * a + UP * y for (a, y) in profs[i]] for i in range(n)]
    U = cum_len([v(p[0], 0, p[1]) for p in path])
    if closed_path:
        U.append(U[-1] + (V(path[0]) - V(path[-1])).length)
    Vv = []
    for i in range(n):
        acc = [0.0]
        for j in range(1, npf + (1 if closed_prof else 0)):
            acc.append(acc[-1] + (V(profs[i][j % npf]) - V(profs[i][j - 1])).length)
        Vv.append(acc)
    mi = n if closed_path else n - 1
    mj = npf if closed_prof else npf - 1
    for j in range(mj):
        mb = mbs[j]
        if mb is None:
            continue
        j2 = (j + 1) % npf
        for i in range(mi):
            i2 = (i + 1) % n
            da = 0.5 * ((profs[i][j2][0] - profs[i][j][0]) + (profs[i2][j2][0] - profs[i2][j][0]))
            dy = 0.5 * ((profs[i][j2][1] - profs[i][j][1]) + (profs[i2][j2][1] - profs[i2][j][1]))
            nn = (nrm[i] + nrm[i2]).normalized()
            hint = nn * dy - UP * da
            q = [P3[i][j], P3[i2][j], P3[i2][j2], P3[i][j2]]
            u0, u1 = U[i], U[i + 1]
            uvs = [(u0, Vv[i][j]), (u1, Vv[i2][j]), (u1, Vv[i2][j + 1]), (u0, Vv[i][j + 1])]
            mb.face([mb.vert(p) for p in q], hint, uvs)
    if caps and not closed_path and cap_mb is not None:
        for i, sgn in ((0, -1), (n - 1, 1)):
            t = V((path[min(i + 1, n - 1)][0] - path[max(i - 1, 0)][0], 0, path[min(i + 1, n - 1)][1] - path[max(i - 1, 0)][1]))
            cap_mb.face([cap_mb.vert(p) for p in P3[i]], t * sgn)
    return P3


def offset2(pts2, ds):
    """Décalage vers l'intérieur d'un polygone convexe 2D, distance par arête (arête k = k -> k+1)."""
    n = len(pts2)
    c = sum((V(p) for p in pts2), V((0, 0))) / n
    lines = []
    for k in range(n):
        p, q = V(pts2[k]), V(pts2[(k + 1) % n])
        t = (q - p).normalized()
        m = V((-t.y, t.x))
        if m.dot(c - p) < 0:
            m = -m
        lines.append((p + m * ds[k], t))
    out = []
    for k in range(n):
        (p1, t1), (p2, t2) = lines[k - 1], lines[k]
        den = t1.x * t2.y - t1.y * t2.x
        if abs(den) < 1e-9:
            out.append(p2)
            continue
        s = ((p2.x - p1.x) * t2.y - (p2.y - p1.y) * t2.x) / den
        out.append(p1 + t1 * s)
    return out


def glazing_poly(glass, caulk, poly, out, e, thick=0.012, frit=0.012, back=0.007):
    """Vitrage plan convexe : verre (face extérieure seule) en retrait e[k] par arête, chant du verre et fond de
    joint ('caulk') en retrait de back sous le verre jusqu'à frit au-delà du bord du verre (sérigraphie)."""
    n = newell(poly).normalized()
    if n.dot(out) < 0:
        n = -n
    c = sum(poly, V((0, 0, 0))) / len(poly)
    ex = (poly[1] - poly[0]).normalized()
    ey = n.cross(ex).normalized()
    to2 = [V(((p - c).dot(ex), (p - c).dot(ey))) for p in poly]
    P = lambda q, d: c + ex * q.x + ey * q.y + n * d
    gi = offset2(to2, e)
    fi = offset2(to2, [x + frit for x in e])
    glass.face([glass.vert(P(q, 0.0)) for q in gi], n)
    m = len(gi)
    for k in range(m):
        a, b = gi[k], gi[(k + 1) % m]
        mid = (a + b) * 0.5
        h = ex * mid.x + ey * mid.y
        caulk.face([caulk.vert(P(a, 0.0)), caulk.vert(P(b, 0.0)), caulk.vert(P(b, -thick)), caulk.vert(P(a, -thick))], h)
    for k in range(m):
        a0, b0 = to2[k], to2[(k + 1) % m]
        a1, b1 = fi[k], fi[(k + 1) % m]
        caulk.face([caulk.vert(P(a0, -back)), caulk.vert(P(b0, -back)), caulk.vert(P(b1, -back)), caulk.vert(P(a1, -back))], n)


def rrect(cx, cz, hx, hz, r, seg=4):
    pts = [(cx - hx, cz - hz), (cx + hx, cz - hz), (cx + hx, cz + hz), (cx - hx, cz + hz)]
    return rounded_poly(pts, r, seg)


def loft_section(mb, secs, center_fn, cap0=True, cap1=True):
    """secs : liste de rangées fermées 3D ; normales sortantes = c − axe(y)."""
    mb.grid(secs, closed=True, hint=lambda c, i, j: c - center_fn(c.y), uv='arc')
    if cap0:
        mb.face([mb.vert(p) for p in secs[0]], -UP)
    if cap1:
        mb.face([mb.vert(p) for p in secs[-1]], UP)


def lathe(mb, prof, cx, cz, seg=24):
    """Profil (r, y) tourné autour de l'axe vertical (cx, cz) ; r = 0 aux extrémités pour fermer."""
    rows = []
    for r, y in prof:
        rows.append([v(cx + max(r, 1e-5) * math.cos(2 * math.pi * k / seg), y, cz + max(r, 1e-5) * math.sin(2 * math.pi * k / seg))
                     for k in range(seg)])
    ax = lambda y: v(cx, y, cz)
    for j in range(len(rows) - 1):
        (r0, y0), (r1, y1) = prof[j], prof[j + 1]
        for k in range(seg):
            k2 = (k + 1) % seg
            q = [rows[j][k], rows[j][k2], rows[j + 1][k2], rows[j + 1][k]]
            c = sum(q, V((0, 0, 0))) / 4
            radial = (c - ax(c.y)).normalized()
            # profil parcouru de bas en haut côté extérieur : normale = radial·dy − up·dr
            hint = radial * (y1 - y0) - UP * (r1 - r0)
            mb.face([mb.vert(p) for p in q], hint)


def cdt_fill(mb, y, outer, holes=(), down=False, step=None):
    """Remplit à y le polygone outer (x, z) moins les trous ; normales vers le haut (ou le bas)."""
    pts, edges, faces = [], [], []
    for loop in [outer] + list(holes):
        b = len(pts)
        pts += [V(p) for p in loop]
        nl = len(loop)
        edges += [(b + i, b + (i + 1) % nl) for i in range(nl)]
        faces.append(list(range(b, b + nl)))
    vo, eo, fo, *_ = mgeo.delaunay_2d_cdt(pts, edges, faces, 1, 1e-7)
    ids = [mb.vert(v(q.x, y, q.y)) for q in vo]
    h = -UP if down else UP
    for f in fo:
        c = sum((vo[k] for k in f), V((0, 0))) / len(f)
        cc = (c.x, c.y)
        if not _inside(cc, outer) or any(_inside(cc, hl) for hl in holes):
            continue
        mb.face([ids[k] for k in f], h)


def clip_poly(poly, a, b):
    """Sutherland-Hodgman : garde la partie de poly à gauche de la droite a -> b (2D)."""
    a, b = V(a), V(b)
    side = lambda p: (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)
    out = []
    n = len(poly)
    for i in range(n):
        p, q = V(poly[i]), V(poly[(i + 1) % n])
        sp, sq = side(p), side(q)
        if sp >= 0:
            out.append(p)
        if (sp >= 0) != (sq >= 0):
            t = sp / (sp - sq)
            out.append(p.lerp(q, t))
    return out


def clip_convex(poly, conv):
    """Intersection de poly avec le polygone convexe conv (sens trigonométrique)."""
    res = [V(p) for p in poly]
    n = len(conv)
    for i in range(n):
        if not res:
            break
        res = clip_poly(res, conv[i], conv[(i + 1) % n])
    return res


def area2(poly):
    n = len(poly)
    return 0.5 * sum(poly[i][0] * poly[(i + 1) % n][1] - poly[(i + 1) % n][0] * poly[i][1] for i in range(n))


def ccw(poly):
    return poly if area2(poly) > 0 else poly[::-1]


def circle(cx, cz, r, seg=16):
    return [(cx + r * math.cos(2 * math.pi * k / seg), cz + r * math.sin(2 * math.pi * k / seg)) for k in range(seg)]


def spot(bez, lens, cx, cz, y0, R=0.045, r=0.030, depth=0.012, seg=16):
    """Spot encastré tourné vers le bas dans un trou de rayon R à y0 : collerette, puits, lentille."""
    outer = [v(x, y0, z) for x, z in circle(cx, cz, R, seg)]
    inner = [v(x, y0, z) for x, z in circle(cx, cz, r, seg)]
    deep = [v(x, y0 + depth, z) for x, z in circle(cx, cz, r, seg)]
    for k in range(seg):
        k2 = (k + 1) % seg
        bez.face([bez.vert(outer[k]), bez.vert(outer[k2]), bez.vert(inner[k2]), bez.vert(inner[k])], -UP,
                 None)
        c = (inner[k] + deep[k2]) * 0.5
        bez.face([bez.vert(inner[k]), bez.vert(inner[k2]), bez.vert(deep[k2]), bez.vert(deep[k])], v(cx - c.x, 0, cz - c.z))
    lens.face([lens.vert(p) for p in deep], -UP)


def seg_param(p2, stations):
    """Interpole la 3e valeur des stations (x, z, val) au point p2 (x, z) le plus proche de la polyligne."""
    best, bv = 1e9, stations[0][2]
    for k in range(len(stations) - 1):
        a = V(stations[k][:2]); b = V(stations[k + 1][:2])
        ab = b - a
        t = max(0.0, min(1.0, (V(p2) - a).dot(ab) / ab.length_squared))
        d = (a + ab * t - V(p2)).length
        if d < best:
            best, bv = d, stations[k][2] + (stations[k + 1][2] - stations[k][2]) * t
    return bv




# ------------------------------------------------------------------------------------------------ courbes du salon
def _subdiv(pts, maxstep):
    out = []
    for i in range(len(pts) - 1):
        a, b = V(pts[i]), V(pts[i + 1])
        k = max(1, math.ceil((b - a).length / maxstep))
        for j in range(k):
            out.append(tuple(a.lerp(b, j / k)))
    out.append(tuple(pts[-1]))
    return out


def _salon_curves():
    """Courbe B (pied des vitrages, plan) tribord arrière -> nez -> bâbord arrière, normales, courbe T."""
    sharp = [(X_WALL0, 4.0), (5.15, 4.0), (5.41, 0.0)]
    full = sharp + [(x, -z) for x, z in reversed(sharp[:-1])]
    pts = fillet2(full, [0, 2.2, 1.6, 2.2, 0], seg=28)
    # insertion exacte des stations des flancs (début des vitrages, joints) puis subdivision (pas <= 0,30 m)
    for zs in (4.0, -4.0):
        for x in (X_GLASS0,) + JOINT_X:
            for i in range(len(pts) - 1):
                a, b = pts[i], pts[i + 1]
                if abs(a[1] - zs) < 1e-6 and abs(b[1] - zs) < 1e-6 and min(a[0], b[0]) < x < max(a[0], b[0]):
                    pts.insert(i + 1, (x, zs))
                    break
    pts = _subdiv(pts, 0.30)
    nrm = plan_nrm(pts)
    nh = [v(n.x, 0, n.z).normalized() for n in nrm]
    B3 = [v(p[0], yb(p[0]), p[1]) for p in pts]
    T3 = [v(p[0] - n.x * setback(n.x), YU, p[1] - n.z * setback(n.x)) for p, n in zip(pts, nh)]
    return pts, nrm, nh, B3, T3


PATH_B, NRM_B, NH_B, B3, T3 = _salon_curves()


def joint_indices():
    """Indices des échantillons de B aux limites des verres (pied des montants arrière, joints)."""
    idx = []
    n = len(PATH_B)
    for x in (X_GLASS0,) + JOINT_X:
        idx.append(min(range(n // 2), key=lambda i: abs(PATH_B[i][0] - x) + abs(PATH_B[i][1] - 4.0)))
    zs = [min(range(n), key=lambda i: abs(PATH_B[i][1] - zj) + (99 if PATH_B[i][0] < 4.0 else 0)) for zj in (JOINT_Z, -JOINT_Z)]
    idx += zs
    for x in reversed((X_GLASS0,) + JOINT_X):
        idx.append(min(range(n // 2, n), key=lambda i: abs(PATH_B[i][0] - x) + abs(PATH_B[i][1] + 4.0)))
    return idx


def surf(i, t):
    """Point du vitrage (surface réglée galbée) à l'échantillon i, hauteur relative t."""
    return B3[i].lerp(T3[i], t) + NH_B[i] * (BULGE * math.sin(math.pi * t))


class CPatch(Patch):
    """Verre cintré entre les échantillons i0..i1 de B/T (interface de superstructure.Patch pour glazing())."""

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
        a, b = surf(self.ids[k], w), surf(self.ids[k + 1], w)
        return a.lerp(b, r)

    def N0(self, u, w):
        du, dw = 1e-3, 1e-3
        pu = self.P(min(1, u + du), w) - self.P(max(0, u - du), w)
        pw = self.P(u, min(1, w + dw)) - self.P(u, max(0, w - dw))
        return pu.cross(pw).normalized()

    def uspan(self, w, eL, eR):
        L = sum((self.P((k + 1) / (self.M - 1), w) - self.P(k / (self.M - 1), w)).length for k in range(self.M - 1))
        return eL / L, 1 - eR / L


def joint_strip(mb, i, hw=0.012, d0=-0.016, d1=0.005, nw=10):
    """Joint de vitrage effilé (metalDark) le long de la génératrice i : section 24 × 21 mm, pointe aux bouts."""
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
    """Contour du haut du salon (x, z) = courbe T décalée de a (positif = extérieur), fermé en x = -4,80 / -4,74."""
    pts2 = [(p.x, p.z) for p in T3]
    nrm = plan_nrm(pts2)
    pts = [(p[0] + n.x * a, p[1] + n.z * a) for p, n in zip(pts2, nrm)]
    pts[0] = (-4.80 if a > 0 else -4.74, pts[0][1])
    pts[-1] = (-4.80 if a > 0 else -4.74, pts[-1][1])
    return ccw(pts)


# ------------------------------------------------------------------------------------------------ build
def build(ctx):
    build_salon(ctx)
    build_glazing(ctx)
    build_aft_bay(ctx)
    build_roof(ctx)
    build_ceiling(ctx)


def build_salon(ctx):
    # ============ SOUBASSEMENT (allège) : joint creux, paroi galbée, seuil-jonc 'accent', retour intérieur ====
    path, nrm = PATH_B, NRM_B
    gap, wall, sill = MB(), MB(), MB()
    profs = []
    for p in path:
        yl = yb(p[0])
        pr = [(0.020, Y_GAP0), (0.020, Y_GAP1)]
        pr += round_corner((0.020, Y_GAP1), (A_WALL - 0.004, Y_GAP1), (A_WALL - 0.004, Y_GAP1 + 0.05), 0.006, 3)
        # face galbée (bombé 4 mm) jusqu'au jonc
        h = yl - 0.040 - (Y_GAP1 + 0.006)
        for k in (1, 2, 3):
            t = k / 4
            pr.append((A_WALL - 0.004 + 0.008 * math.sin(math.pi * 0.5 * t) - 0.004 * t, Y_GAP1 + 0.006 + h * t))
        pr += [(A_WALL, yl - 0.040), (A_WALL - 0.006, yl - 0.040), (A_WALL - 0.006, yl - 0.032)]
        # jonc demi-rond (accent) qui souligne la ligne de seuil
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
    make_obj(ctx, gap, 'superstructure', 'caulk', 'catSalonShadowGap', sharp=30)
    make_obj(ctx, wall, 'superstructure', 'superstructure', 'catSalonWall', sharp=40)
    make_obj(ctx, sill, 'superstructure', 'accent', 'catSalonSillBead', sharp=50)

    # ============ MONTANTS D'ANGLE ARRIÈRE (laqués, effilés, tête évasée dans la sous-face) ===============
    post = MB()
    xc = (X_POST0 + X_POST1) / 2
    for s in (1, -1):
        secs = []
        for y, zo, fx in ((1.94, 4.035, 1.0), (YL_SIDE, 4.035, 1.0), (3.2, 3.95, 0.92), (3.95, 3.875, 1.0),
                          (4.10, 3.865, 1.18), (Y_RAIL1 + 0.01, 3.86, 1.45)):
            zi = 3.58
            hx = (X_POST1 - X_POST0) / 2 * fx
            hz = (zo - zi) / 2
            sec = ccw(rrect(xc - (hx - (X_POST1 - X_POST0) / 2) * 0.0, (zo + zi) / 2, hx, hz, 0.95 * min(hx, hz), 6))
            secs.append([v(x, y, s * z) for x, z in sec])
        loft_section(post, secs, lambda y, s=s: v(xc, y, s * 3.8))
    make_obj(ctx, post, 'superstructure', 'superstructure', 'catAftCornerPosts', sharp=35)

    # ============ FEUX DE NAVIGATION (boîtiers metalDark galets, lentilles navRed / navGreen) =============
    nav, red, green = MB(), MB(), MB()
    n = len(PATH_B)
    i_nav = min(range(n // 2), key=lambda i: abs(PATH_B[i][0] - 4.35))
    p2, nh = PATH_B[i_nav], NH_B[i_nav]
    t2 = V((PATH_B[i_nav + 1][0] - PATH_B[i_nav - 1][0], 0, PATH_B[i_nav + 1][1] - PATH_B[i_nav - 1][1])).normalized()
    for s in (1, -1):
        M = (lambda q: q) if s > 0 else mz
        o = M(v(p2[0], 2.21, p2[1]) + nh * A_WALL)
        t, nn = M(t2), M(nh)
        frame_box(nav, o, t, UP, nn, -0.13, 0.13, -0.045, 0.045, -0.006, 0.030)
        lens = green if s > 0 else red
        frame_box(lens, o, t, UP, nn, -0.105, 0.105, -0.028, 0.028, 0.024, 0.040)
    make_obj(ctx, nav, 'superstructure', 'metalDark', 'catNavHousings', bevel=(0.03, 4, 30))
    make_obj(ctx, green, 'superstructure', 'navGreen', 'catNavLensStbd', bevel=(0.02, 4, 30))
    make_obj(ctx, red, 'superstructure', 'navRed', 'catNavLensPort', bevel=(0.02, 4, 30))


def build_glazing(ctx):
    glass, caulk, joints, head, wip = MB(), MB(), MB(), MB(), MB()
    E_S, E_B, E_T = 0.022, 0.030, 0.045
    J = joint_indices()
    for k in range(len(J) - 1):
        i0, i1 = J[k], J[k + 1]
        pt = CPatch(i0, i1)
        eL = 0.03 if k == 0 else E_S
        eR = 0.03 if k == len(J) - 2 else E_S
        nu = max(4, i1 - i0)
        glazing(glass, caulk, pt, (eL, eR, E_B, E_T), nu=nu, nw=6, thick=0.012, frit=0.014, back=0.006)
    for i in J[1:-1]:
        joint_strip(joints, i)
    # traverse haute (sous le hardtop) : profil arrondi balayé le long de la courbe T
    path = [(p.x, p.z) for p in T3]
    nrm = plan_nrm(path)
    prof = ccw(rounded_poly([(-0.075, Y_RAIL0), (0.035, Y_RAIL0), (0.035, Y_RAIL1), (-0.075, Y_RAIL1)],
                            [0.010, 0.016, 0.0, 0.0], 4))
    sweep_prof(path, nrm, [prof] * len(path), [head] * len(prof), closed_prof=True, caps=True, cap_mb=head)
    # essuie-glaces (2, parallèles, au repos au bas du pare-brise central)
    n = len(PATH_B)
    for zp in (1.30, 0.06):
        i = min(range(n), key=lambda q: abs(PATH_B[q][1] - zp) + (99 if PATH_B[q][0] < 4.0 else 0))
        base = surf(i, 0.0)
        tu = (surf(i, 0.05) - base).normalized()
        e = V((PATH_B[i + 1][0] - PATH_B[i - 1][0], 0, PATH_B[i + 1][1] - PATH_B[i - 1][1])).normalized()
        if e.z > 0:
            e = -e
        nc = e.cross(tu).normalized()
        if nc.dot(NH_B[i]) < 0:
            nc = -nc
        ez = -e  # vers +z
        frame_box(wip, base + tu * 0.055, ez, tu, nc, -0.028, 0.028, -0.028, 0.028, 0.0, 0.026)
        frame_box(wip, base + tu * 0.055, ez, tu, nc, -0.70, 0.0, -0.009, 0.009, 0.018, 0.032)
        frame_box(wip, base + tu * 0.105, ez, tu, nc, -1.12, -0.28, -0.007, 0.007, 0.010, 0.026)
        frame_box(wip, base + tu * 0.055 + ez * -0.70, ez, tu, nc, -0.012, 0.012, -0.012, 0.062, 0.012, 0.032)
    make_obj(ctx, wip, 'upperGlass', 'metalDark', 'catWipers', bevel=(0.004, 2, 30))
    make_obj(ctx, glass, 'upperGlass', 'glass', 'catSalonGlazing', sharp=60, wn=False)
    make_obj(ctx, caulk, 'upperGlass', 'caulk', 'catSalonGlazingJoints', sharp=30)
    make_obj(ctx, joints, 'upperGlass', 'metalDark', 'catGlassJoints', sharp=50)
    make_obj(ctx, head, 'upperGlass', 'metalDark', 'catHeadRail', sharp=50)


def build_aft_bay(ctx):
    """Baie vitrée arrière coulissante pleine largeur (cadres 'superstructure', verres 'upperGlass')."""
    frames, header, sill, rails, handles = MB(), MB(), MB(), MB(), MB()
    glass, caulk = MB(), MB()
    ZO = 3.58
    YS, YH = 2.008, 4.09
    aabb(header, X_POST0 + 0.005, X_POST1 - 0.005, YH, Y_RAIL1, -ZO - 0.02, ZO + 0.02)
    aabb(sill, X_POST0 - 0.02, X_POST1 + 0.01, 1.94, YS, -ZO - 0.02, ZO + 0.02)
    for xr in (-4.78, -4.875):  # rails du seuil
        aabb(rails, xr - 0.006, xr + 0.006, YS - 0.002, YS + 0.010, -ZO, ZO)
    leaves = []
    for s in (1, -1):
        leaves.append((-4.78, 1.78, ZO, s, False))      # fixe
        leaves.append((-4.875, 0.0, 1.84, s, True))     # coulissant
    for xc, z0, z1, s, slide in leaves:
        za, zb = sorted((s * z0, s * z1))
        hx = 0.0225
        SW, TR, BR = 0.055, 0.060, 0.085
        y0, y1 = YS + 0.004, YH - 0.004
        aabb(frames, xc - hx, xc + hx, y0, y1, za, za + SW)
        aabb(frames, xc - hx, xc + hx, y0, y1, zb - SW, zb)
        aabb(frames, xc - hx, xc + hx, y1 - TR, y1, za + SW, zb - SW)
        aabb(frames, xc - hx, xc + hx, y0, y0 + BR, za + SW, zb - SW)
        # verre au milieu de l'épaisseur du vantail, bords pris dans le cadre
        gz0, gz1 = za + SW - 0.012, zb - SW + 0.012
        gy0, gy1 = y0 + BR - 0.012, y1 - TR + 0.012
        poly = [v(xc, gy0, gz0), v(xc, gy0, gz1), v(xc, gy1, gz1), v(xc, gy1, gz0)]
        glazing_poly(glass, caulk, poly, v(-1, 0, 0), [0.010] * 4, thick=0.010, frit=0.004, back=0.005)
        if slide:
            # poignée verticale côté arrière, près du montant central
            zh = s * (0.0 + 0.16)
            aabb(handles, xc - hx - 0.045, xc - hx - 0.025, 2.75, 3.45, zh - 0.012, zh + 0.012)
            for yy in (2.78, 3.42):
                aabb(handles, xc - hx - 0.03, xc - hx + 0.001, yy - 0.01, yy + 0.01, zh - 0.008, zh + 0.008)
    make_obj(ctx, frames, 'superstructure', 'metalDark', 'catAftDoorFrames', bevel=(0.006, 3, 30))
    make_obj(ctx, header, 'superstructure', 'metalDark', 'catAftDoorHeader', bevel=(0.010, 3, 30))
    make_obj(ctx, sill, 'superstructure', 'accent', 'catAftDoorSill', bevel=(0.006, 3, 30))
    make_obj(ctx, rails, 'superstructure', 'metalDark', 'catAftDoorRails', bevel=(0.003, 2, 30))
    make_obj(ctx, handles, 'superstructure', 'metalDark', 'catAftDoorHandles', bevel=(0.005, 2, 30))
    make_obj(ctx, glass, 'upperGlass', 'glass', 'catAftBayGlazing', sharp=60, wn=False)
    make_obj(ctx, caulk, 'upperGlass', 'caulk', 'catAftBayJoints', sharp=30)




# ------------------------------------------------------------------------------------------------ hardtop
RZ = 4.75
EDGE_W = 0.40      # largeur du chant en goutte d'eau (dessus plat et sous-face plate au-delà)


def roof_loop():
    pts = [(HARDTOP_X0, -RZ), (HARDTOP_X0, RZ), (2.6, RZ), (5.75, 2.9), (HARDTOP_X1, 0.0), (5.75, -2.9), (2.6, -RZ)]
    radii = [1.0, 1.0, 1.8, 1.3, 1.4, 1.3, 1.8]
    loop = ccw(rounded_poly(pts, radii, 16))
    return _subdiv(loop + [loop[0]], 0.30)[:-1]


def _bez(p0, p1, p2, p3, n):
    out = []
    for k in range(n + 1):
        t = k / n
        a = (1 - t) ** 3
        b = 3 * (1 - t) ** 2 * t
        c = 3 * (1 - t) * t * t
        d = t ** 3
        out.append((a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]))
    return out


def build_roof(ctx):
    loop = roof_loop()
    nrm = [-n for n in plan_nrm(loop, closed=True)]   # boucle trigonométrique -> normales sortantes
    # profil en goutte d'eau (a vers l'extérieur, y absolu), sous-face -> nez -> dessus
    under = _bez((-EDGE_W, Y_SOF), (-0.20, Y_SOF), (0.0, 4.215), (0.0, 4.268), 10)
    nose = [(0.0018, 4.272), (0.0024, 4.280), (0.0018, 4.288)]
    top = _bez((0.0, 4.292), (0.0, 4.345), (-0.16, Y_TOP), (-EDGE_W, Y_TOP), 12)
    prof = under + nose + top
    mk = ['s'] * (len(under) - 1) + ['a'] * (len(nose) + 1) + ['s'] * (len(top) - 1)
    edge_s, edge_a = MB(), MB()
    mbs = [{'s': edge_s, 'a': edge_a}[k] for k in mk]
    sweep_prof(loop, nrm, [prof] * len(loop), mbs, closed_path=True)
    make_obj(ctx, edge_s, 'roof', 'superstructure', 'catHardtopEdge', sharp=40)
    make_obj(ctx, edge_a, 'roof', 'accent', 'catHardtopNoseBead', sharp=60)

    ring_top = [(p[0] - n.x * EDGE_W, p[1] - n.z * EDGE_W) for p, n in zip(loop, nrm)]
    ring_sof = ring_top

    # ---- champ solaire : contour en retrait de 0,55 borné à x [-9,8 ; 5,4], |z| ≤ 4,0
    x0, x1, zh = SOLAR
    F = [(p[0] - n.x * 0.55, p[1] - n.z * 0.55) for p, n in zip(loop, nrm)]
    box = [(x0, -zh), (x1, -zh), (x1, zh), (x0, zh)]
    F = _dedupe([tuple(p) for p in clip_convex(F, box)])
    Fo = inset2(F, -0.010)
    Fi = inset2(F, 0.075)
    topm = MB()
    cdt_fill(topm, Y_TOP, ring_top, [Fo])
    make_obj(ctx, topm, 'roof', 'superstructure', 'catHardtopTop', sharp=30)
    groove = MB()
    YG = Y_TOP - 0.012
    n_ = len(F)
    for k in range(n_):
        k2 = (k + 1) % n_
        a0, b0 = v(Fo[k][0], Y_TOP, Fo[k][1]), v(Fo[k2][0], Y_TOP, Fo[k2][1])
        a1, b1 = v(Fo[k][0], YG, Fo[k][1]), v(Fo[k2][0], YG, Fo[k2][1])
        c0, d0 = v(F[k][0], YG, F[k][1]), v(F[k2][0], YG, F[k2][1])
        e0, f0 = v(F[k][0], Y_TOP, F[k][1]), v(F[k2][0], Y_TOP, F[k2][1])
        mid = (a0 + b0) * 0.5
        inward = v(-2.0 - mid.x, 0, -mid.z)
        groove.face([groove.vert(p) for p in (a0, b0, b1, a1)], inward)
        groove.face([groove.vert(p) for p in (a1, b1, d0, c0)], UP)
        groove.face([groove.vert(p) for p in (c0, d0, f0, e0)], -inward)
    make_obj(ctx, groove, 'roof', 'caulk', 'catSolarGroove', sharp=30)
    cells = []
    ncol, nrow = 9, 8
    bw = 0.028
    for i in range(ncol):
        xa, xb = x0 + (x1 - x0) * i / ncol + bw, x0 + (x1 - x0) * (i + 1) / ncol - bw
        for j in range(nrow):
            za, zb = -zh + 2 * zh * j / nrow + bw, -zh + 2 * zh * (j + 1) / nrow - bw
            c = clip_convex([(xa, za), (xb, za), (xb, zb), (xa, zb)], ccw(Fi))
            c = _dedupe([tuple(p) for p in c])
            if len(c) >= 3 and abs(area2(c)) > 0.25:
                cells.append(ccw(c))
    tray, cell_mb, cwall = MB(), MB(), MB()
    cdt_fill(tray, Y_TOP, F, cells)
    YC = Y_TOP - 0.004
    for c in cells:
        cell_mb.face([cell_mb.vert(v(x, YC, z)) for x, z in c], UP)
        m = len(c)
        cc = sum((V(p) for p in c), V((0, 0))) / m
        for k in range(m):
            a, b = c[k], c[(k + 1) % m]
            mid = (V(a) + V(b)) * 0.5
            inward = v(cc.x - mid.x, 0, cc.y - mid.y)
            cwall.face([cwall.vert(p) for p in (v(a[0], Y_TOP, a[1]), v(b[0], Y_TOP, b[1]), v(b[0], YC, b[1]), v(a[0], YC, a[1]))], inward)
    make_obj(ctx, tray, 'roof', 'metalDark', 'catSolarFrame', sharp=30)
    make_obj(ctx, cwall, 'roof', 'metalDark', 'catSolarCellReveals', sharp=30)
    make_obj(ctx, cell_mb, 'roof', 'acrylic', 'catSolarCells', sharp=30, wn=False)

    # ---- sous-face extérieure + spots
    sof = MB()
    hole_salon = salon_top_outline(0.02)
    ext_spots = [(x, z) for x in (-9.55, -8.15, -6.75, -5.45) for z in (-1.7, 1.7)]
    holes = [hole_salon] + [ccw(circle(x, z, 0.045, 16)) for x, z in ext_spots]
    cdt_fill(sof, Y_SOF, ring_sof, holes, down=True)
    make_obj(ctx, sof, 'roof', 'superstructure', 'catHardtopSoffit', sharp=30)
    bez, lens = MB(), MB()
    for x, z in ext_spots:
        spot(bez, lens, x, z, Y_SOF)
    make_obj(ctx, bez, 'roof', 'metalDark', 'catSoffitSpotBezels', sharp=50)
    make_obj(ctx, lens, 'roof', 'ledStrip', 'catSoffitSpotLenses', sharp=50, wn=False)

    # ---- 4 montants arrière effilés (metalDark) : section galet, pied et tête évasés en trompette
    pil = MB()
    for px, pz in PILLARS:
        secs = []
        for y, f in ((1.935, 1.75), (1.965, 1.55), (2.05, 1.12), (2.35, 1.0), (3.1, 0.88), (3.85, 1.0),
                     (4.05, 1.25), (4.15, 1.75), (4.215, 2.3)):
            hx, hz = 0.06 * f, 0.034 * f
            sec = ccw(rrect(px, pz, hx, hz, 0.97 * hz, 6))
            secs.append([v(x, y, z) for x, z in sec])
        loft_section(pil, secs, lambda y, px=px, pz=pz: v(px, y, pz))
    make_obj(ctx, pil, 'roof', 'metalDark', 'catAftPillars', sharp=35)

    # ---- feu de mouillage (navWhite) sur l'avant du hardtop
    base, lensw = MB(), MB()
    ax, az = 5.45, 0.0
    lathe(base, [(0.0, Y_TOP - 0.002), (0.055, Y_TOP - 0.002), (0.055, Y_TOP + 0.008), (0.048, Y_TOP + 0.018),
                 (0.032, Y_TOP + 0.024), (0.0, Y_TOP + 0.024)], ax, az)
    lathe(lensw, [(0.0, Y_TOP + 0.024), (0.034, Y_TOP + 0.024), (0.036, Y_TOP + 0.060), (0.030, Y_TOP + 0.090),
                  (0.0, Y_TOP + 0.090)], ax, az)
    lathe(base, [(0.0, Y_TOP + 0.090), (0.034, Y_TOP + 0.090), (0.036, Y_TOP + 0.098), (0.026, Y_TOP + 0.108),
                 (0.0, Y_TOP + 0.111)], ax, az)
    make_obj(ctx, base, 'roof', 'metalDark', 'catAnchorLightBase', sharp=40)
    make_obj(ctx, lensw, 'roof', 'navWhite', 'catAnchorLightLens', sharp=40)


def _dedupe(poly, eps=1e-4):
    out = []
    for p in poly:
        if not out or (V(p) - V(out[-1])).length > eps:
            out.append(tuple(p))
    if len(out) > 1 and (V(out[0]) - V(out[-1])).length <= eps:
        out.pop()
    return out



def build_ceiling(ctx):
    """Plafond intérieur du salon (groupe 'roof') : bandeau périphérique à 4,15 avec spots, caisson remonté
    à 4,21 bordé d'une gorge LED, deux filets LED longitudinaux."""
    cout = salon_top_outline(-0.05)
    cin = ccw(inset2(cout, 0.40))
    band_line = ccw(inset2(cout, 0.20))
    # spots : échantillonnage régulier du contour médian (pas ≈ 1,15 m)
    L = cum_len([V(p) for p in band_line] + [V(band_line[0])])
    tot = L[-1]
    nsp = max(8, int(tot / 1.15))
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
    # gradin : ceiling 4,15 -> 4,18 puis gorge LED 4,18 -> 4,205 puis ombre jusqu'au caisson
    n_ = len(cin)
    cen = sum((V(p) for p in cin), V((0, 0))) / n_
    for k in range(n_):
        a, b = cin[k], cin[(k + 1) % n_]
        mid = (V(a) + V(b)) * 0.5
        inward = v(cen.x - mid.x, 0, cen.y - mid.y)
        for y0, y1, mb in ((Y_CEIL, 4.18, ceil_wall), (4.18, 4.200, led), (4.200, Y_COFFER, ceil_wall)):
            mb.face([mb.vert(p) for p in (v(a[0], y0, a[1]), v(b[0], y0, b[1]), v(b[0], y1, b[1]), v(a[0], y1, a[1]))], inward)
    # caisson avec deux filets LED longitudinaux encastrés
    strips = []
    for zc in (-1.25, 1.25):
        strips.append(ccw([(-3.9, zc - 0.02), (2.6, zc - 0.02), (2.6, zc + 0.02), (-3.9, zc + 0.02)]))
    cdt_fill(coffer, Y_COFFER, ccw(cin), strips, down=True)
    for s in strips:
        m = len(s)
        cc = sum((V(p) for p in s), V((0, 0))) / m
        for k in range(m):
            a, b = s[k], s[(k + 1) % m]
            mid = (V(a) + V(b)) * 0.5
            inward = v(cc.x - mid.x, 0, cc.y - mid.y)
            ceil_wall.face([ceil_wall.vert(p) for p in (v(a[0], Y_COFFER, a[1]), v(b[0], Y_COFFER, b[1]),
                                                       v(b[0], Y_COFFER + 0.012, b[1]), v(a[0], Y_COFFER + 0.012, a[1]))], inward)
        led.face([led.vert(v(x, Y_COFFER + 0.012, z)) for x, z in s], -UP)
    make_obj(ctx, band, 'roof', 'ceiling', 'catCeilingPanel', sharp=30)
    make_obj(ctx, coffer, 'roof', 'ceiling', 'catCeilingCoffer', sharp=30)
    make_obj(ctx, ceil_wall, 'roof', 'ceiling', 'catCeilingReveals', sharp=30)
    make_obj(ctx, led, 'roof', 'ledStrip', 'catCeilingLedStrips', sharp=30, wn=False)
    bez, lens = MB(), MB()
    for x, z in spots:
        spot(bez, lens, x, z, Y_CEIL)
    make_obj(ctx, bez, 'roof', 'metalDark', 'catCeilingSpotBezels', sharp=50)
    make_obj(ctx, lens, 'roof', 'ledStrip', 'catCeilingSpotLenses', sharp=50, wn=False)
