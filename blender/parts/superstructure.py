"""DIÈDRE 29 — superstructure, vitrage et peau extérieure du toit (groupes 'superstructure', 'upperGlass', 'roof').

Portage des cotes de js/boat.js (SUPERSTRUCTURE / joues / baie arrière / TOIT, ~l.1580-1800), remodelé
« réel » : congés et micro-arrondis vrais sur toutes les arêtes, vitrages épais posés dans un joint noir
en retrait avec bordure sérigraphiée, meneaux et traverses profilés, seuil inox profilé, bandeau de toit
à joint creux d'ombre, gouttière en jonc sur le dessus.

Toute la géométrie est calculée en repère three.js (+Y haut, +Z tribord) puis convertie par to_bl().
UV en mètres : balayages = (abscisse curviligne, développé du profil) ; surfaces planes = projection monde.
Hors périmètre (restent procéduraux en JS) : arceau radar, feux (navRed/navGreen/navWhite), plafond et
éclairage intérieur (ceiling, ceilPanel, bezelWhite, downLens, ledStrip, ledGlow, spineSoffit, spineLed,
slotBlack, glassTint).
"""
import math
import bpy
import bmesh
from mathutils import Vector as V, Matrix
from mathutils import geometry as mgeo

from lines import deckY, ss, to_bl

# ---------------------------------------------------------------------------------------------------------
# Cotes (js/boat.js)
# ---------------------------------------------------------------------------------------------------------
FLOOR = 1.70
X_DOOR = -10.3
Z_CHEEK = 2.2
X_SIDE0, X_SIDE1 = -9.6, -0.6
ZD, ZL, ZU = 3.42, 3.38, 2.92
YL, YU, YR, YC = 2.55, 3.62, 3.98, 3.58
X_CHEEK = -11.4
ARC = [math.radians(55), math.radians(22)]
SIDE_X = [X_SIDE0, -7.35, -5.1, -2.85, X_SIDE1]


def outline(z, rx):
    return [(x, z) for x in SIDE_X] + [(X_SIDE1 + rx * math.cos(a), z * math.sin(a)) for a in ARC]


D2, L2, U2 = outline(ZD, 3.64), outline(ZL, 3.6), outline(ZU, 2.5)


def roof_camber(z):
    return 0.12 * max(0.0, 1 - (z / 3.0) ** 2)


def v(x, y, z):
    return V((x, y, z))


def mz(p):
    return V((p.x, p.y, -p.z))


def hor(p):
    return V((p.x, 0.0, p.z))


def out_hint(c):  # vers l'extérieur du rouf (js : out)
    return v(c.x - ((X_SIDE1 - 0.3) if c.x > X_SIDE1 else c.x), 0, c.z)


def bez2(a, c, b, t):
    return a * (1 - t) ** 2 + c * (2 * t * (1 - t)) + b * (t * t)


# ---------------------------------------------------------------------------------------------------------
# Outils géométriques (portages de boat.js)
# ---------------------------------------------------------------------------------------------------------
def fillet_rows(rows, w, seg=5, closed=False):
    """filletRows : chaque sommet anguleux -> Bézier quadratique tangente (longueur w), toutes rangées."""
    n = len(rows[0])
    W = list(w) if isinstance(w, (list, tuple)) else [w] * len(rows)

    def turn(r, i):
        a = r[i] - r[(i - 1) % n]
        b = r[(i + 1) % n] - r[i]
        if a.length_squared < 1e-12 or b.length_squared < 1e-12:
            return 1.0
        return a.normalized().dot(b.normalized())

    sharp = [(closed or 0 < i < n - 1) and any(turn(r, i) < 0.9995 for r in rows) for i in range(n)]
    res = []
    for k, r in enumerate(rows):
        o = []
        for i in range(n):
            c = r[i]
            if not sharp[i]:
                o.append(c.copy())
                continue
            p, q = r[(i - 1) % n], r[(i + 1) % n]
            lp, lq = (c - p).length, (c - q).length
            wi = min(W[k], 0.45 * lp, 0.45 * lq)
            A = c.lerp(p, wi / lp) if lp > 1e-9 else c.copy()
            B = c.lerp(q, wi / lq) if lq > 1e-9 else c.copy()
            for s in range(seg + 1):
                o.append(bez2(A, c, B, s / seg))
        res.append(o)
    return res


def inset2(pts, d):
    """inset() du toit : décalage d'un polygone fermé (x, z) de d vers l'intérieur (onglets bornés)."""
    n = len(pts)
    area = sum(pts[i][0] * pts[(i + 1) % n][1] - pts[(i + 1) % n][0] * pts[i][1] for i in range(n))
    sgn = 1 if area > 0 else -1
    res = []
    for i in range(n):
        a, p, b = V(pts[i - 1]), V(pts[i]), V(pts[(i + 1) % n])
        e1, e2 = (p - a).normalized(), (b - p).normalized()
        n1, n2 = V((-e1.y, e1.x)) * sgn, V((-e2.y, e2.x)) * sgn
        nm = (n1 + n2).normalized()
        q = p + nm * (d / max(0.35, nm.dot(n1)))
        res.append((q.x, q.y))
    return res


def plan_normals(path):
    """Normales horizontales sortantes (moyenne des segments, signe donné par out_hint) d'une polyligne."""
    n = len(path)
    segn = []
    for i in range(n - 1):
        e = hor(path[i + 1] - path[i])
        e = e.normalized() if e.length > 1e-12 else V((1, 0, 0))
        segn.append(V((-e.z, 0, e.x)))
    res = []
    for i in range(n):
        ns = [segn[j] for j in (i - 1, i) if 0 <= j < n - 1]
        m = sum(ns, V((0, 0, 0)))
        m = m.normalized()
        if m.dot(out_hint(path[i])) < 0:
            m = -m
        res.append(m)
    return res


def newell(pts):
    n = V((0, 0, 0))
    for i in range(len(pts)):
        a, b = pts[i], pts[(i + 1) % len(pts)]
        n.x += (a.y - b.y) * (a.z + b.z)
        n.y += (a.z - b.z) * (a.x + b.x)
        n.z += (a.x - b.x) * (a.y + b.y)
    return n


def cum_len(pts):
    s = [0.0]
    for i in range(1, len(pts)):
        s.append(s[-1] + (pts[i] - pts[i - 1]).length)
    return s


# ---------------------------------------------------------------------------------------------------------
# Constructeur de maillage (repère three) -> objet Blender
# ---------------------------------------------------------------------------------------------------------
class MB:
    def __init__(self):
        self.v, self.f, self.uv = [], [], []

    def vert(self, p):
        self.v.append(V(p))
        return len(self.v) - 1

    def face(self, idx, hint=None, uvs=None):
        if len(set(idx)) < 3:
            return
        if hint is not None:
            if newell([self.v[i] for i in idx]).dot(hint) < 0:
                idx = idx[::-1]
                uvs = uvs[::-1] if uvs else None
        self.f.append(list(idx))
        self.uv.append(uvs)

    def grid(self, rows, closed=False, hint=None, uv='arc', close_rows=False):
        """Quadrillage entre rangées successives (même nombre de points). hint(centre, i, j) -> vecteur.
        closed : rangées fermées (bouclage en i) ; close_rows : boucle aussi de la dernière à la première rangée."""
        nr, n = len(rows), len(rows[0])
        ids = [[self.vert(p) for p in r] for r in rows]
        # UV : u = abscisse curviligne moyenne le long des rangées, v = développé entre rangées (par colonne)
        U = cum_len(rows[0]) if uv == 'arc' else None
        utot = U[-1] + (rows[0][0] - rows[0][-1]).length if U else 0
        Vv = [[0.0] * n]
        for j in range(1, nr + (1 if close_rows else 0)):
            a, b = rows[j - 1], rows[j % nr]
            Vv.append([Vv[-1][i] + (b[i] - a[i]).length for i in range(n)])
        mi = n if closed else n - 1
        mj = nr if close_rows else nr - 1
        for j in range(mj):
            for i in range(mi):
                i2 = (i + 1) % n
                j2 = (j + 1) % nr
                q = [ids[j][i], ids[j][i2], ids[j2][i2], ids[j2][i]]
                uvs = None
                if U is not None:
                    u0, u1 = U[i], (U[i2] if i2 > 0 else utot)
                    uvs = [(u0, Vv[j][i]), (u1, Vv[j][i2]), (u1, Vv[j + 1][i2]), (u0, Vv[j + 1][i])]
                c = (rows[j][i] + rows[j][i2] + rows[j2][i2] + rows[j2][i]) * 0.25
                self.face(q, hint(c, i, j) if hint else None, uvs)
        return ids

    def box(self, corners):
        """8 coins (ordre : x0y0z0, x1y0z0, x1y1z0, x0y1z0, x0y0z1, x1y0z1, x1y1z1, x0y1z1) en repère local."""
        ids = [self.vert(p) for p in corners]
        c = sum(corners, V((0, 0, 0))) / 8
        for q in ([0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [2, 3, 7, 6], [1, 2, 6, 5], [0, 4, 7, 3]):
            pts = [corners[k] for k in q]
            fc = sum(pts, V((0, 0, 0))) / 4
            self.face([ids[k] for k in q], fc - c)

    def fan(self, ring, hint):
        c = sum(ring, V((0, 0, 0))) / len(ring)
        ci = self.vert(c)
        ids = [self.vert(p) for p in ring]
        for i in range(len(ring)):
            self.face([ci, ids[i], ids[(i + 1) % len(ring)]], hint)


def _world_uv(p, n):
    ax, ay, az = abs(n.x), abs(n.y), abs(n.z)
    if ay >= ax and ay >= az:
        return (p.x, p.z)
    if ax >= az:
        return (p.z, p.y)
    return (p.x, p.y)


def make_obj(ctx, mb, group, mat, label, sharp=40, bevel=None, wn=True, merge=2e-5):
    """bevel : (largeur, segments, angle°) -> modificateur Bevel (arêtes vives > angle) avant Weighted Normal."""
    name = f'{group}__{mat}__{label}'
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bv = [bm.verts.new(to_bl(p)) for p in mb.v]
    bm.verts.ensure_lookup_table()
    uvl = bm.loops.layers.uv.new('UVMap')
    for idx, uvs in zip(mb.f, mb.uv):
        try:
            f = bm.faces.new([bv[i] for i in idx])
        except ValueError:
            continue
        if uvs is None:
            n = newell([mb.v[i] for i in idx]).normalized()
            uvs = [_world_uv(mb.v[i], n) for i in idx]
        for loop, uv in zip(f.loops, uvs):
            loop[uvl].uv = uv
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=merge)
    bmesh.ops.dissolve_degenerate(bm, edges=bm.edges, dist=1e-6)
    lone = [vv for vv in bm.verts if not vv.link_faces]
    if lone:
        bmesh.ops.delete(bm, geom=lone, context='VERTS')
    for f in bm.faces:
        f.smooth = True
    lim = math.radians(sharp)
    for e in bm.edges:
        if len(e.link_faces) != 2 or e.calc_face_angle(0.0) > lim:
            e.smooth = False
    bm.to_mesh(me)
    bm.free()
    me.materials.append(ctx.mat(mat))
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    if bevel:
        w, segs, ang = bevel
        m = ob.modifiers.new('bevel', 'BEVEL')
        m.width = w
        m.segments = segs
        m.limit_method = 'ANGLE'
        m.angle_limit = math.radians(ang)
        m.use_clamp_overlap = True
        m.miter_outer = 'MITER_ARC'
    if wn:
        m = ob.modifiers.new('wnormals', 'WEIGHTED_NORMAL')
        m.mode = 'FACE_AREA'
        m.keep_sharp = True
        m.weight = 50
    ctx.link(ob, group)
    return ob


def sweep(mb, frames, prof, closed_path=False, caps=True):
    """Balaye un profil 2D fermé (a = selon E1, b = selon E2) le long d'un chemin de repères (o, E1, E2).
    Profil remis dans le sens trigonométrique -> air à droite du parcours -> faces orientées dehors."""
    area = sum(prof[i][0] * prof[(i + 1) % len(prof)][1] - prof[(i + 1) % len(prof)][0] * prof[i][1]
               for i in range(len(prof)))
    if area < 0:
        prof = prof[::-1]
    np_ = len(prof)
    rows = [[o + E1 * a + E2 * b for (o, E1, E2) in frames] for (a, b) in prof]

    def hint(c, i, j):
        (a0, b0), (a1, b1) = prof[j], prof[(j + 1) % np_]
        _, E1, E2 = frames[i]
        return E1 * (b1 - b0) - E2 * (a1 - a0)

    mb.grid(rows, closed=closed_path, hint=hint, close_rows=True)
    if caps and not closed_path:
        for k, sgn in ((0, -1), (len(frames) - 1, 1)):
            t = frames[min(k + 1, len(frames) - 1)][0] - frames[max(k - 1, 0)][0]
            mb.fan([r[k] for r in rows], t * sgn)
    return rows


def round_corner(p_prev, c, p_next, r, seg=3):
    """Points d'un arrondi 2D (Bézier) au coin c entre p_prev et p_next, tangente r."""
    c, a_, b_ = V(c), V(p_prev), V(p_next)
    A = c + (a_ - c).normalized() * r
    B = c + (b_ - c).normalized() * r
    return [tuple(bez2(A, c, B, s / seg)) for s in range(seg + 1)]


def rounded_poly(pts, r, seg=3):
    """Polygone 2D fermé aux coins arrondis (r scalaire ou liste par coin)."""
    n = len(pts)
    R = r if isinstance(r, (list, tuple)) else [r] * n
    res = []
    for i in range(n):
        if R[i] <= 0:
            res.append(pts[i])
        else:
            res += round_corner(pts[i - 1], pts[i], pts[(i + 1) % n], R[i], seg)
    return res


def frame_box(mb, o, ex, ey, ez, x0, x1, y0, y1, z0, z1):
    """Boîte alignée sur le repère (o, ex, ey, ez)."""
    P = lambda x, y, z: o + ex * x + ey * y + ez * z
    mb.box([P(x0, y0, z0), P(x1, y0, z0), P(x1, y1, z0), P(x0, y1, z0),
            P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)])


def aabb(mb, x0, x1, y0, y1, z0, z1):
    frame_box(mb, V((0, 0, 0)), V((1, 0, 0)), V((0, 1, 0)), V((0, 0, 1)), x0, x1, y0, y1, z0, z1)


def rod(mb, a, b, r, seg=16, cap_rings=4):
    """Jonc droit à embouts hémisphériques."""
    t = (b - a).normalized()
    e1 = t.orthogonal().normalized()
    e2 = t.cross(e1)
    rows = []
    for k in range(cap_rings, -1, -1):  # embout a
        ang = (math.pi / 2) * k / cap_rings
        rows.append((a - t * (r * math.sin(ang)), r * math.cos(ang)))
    for k in range(0, cap_rings + 1):
        ang = (math.pi / 2) * k / cap_rings
        rows.append((b + t * (r * math.sin(ang)), r * math.cos(ang)))
    ring = lambda c, rr: [c + (e1 * math.cos(2 * math.pi * s / seg) + e2 * math.sin(2 * math.pi * s / seg)) * max(rr, 1e-5)
                          for s in range(seg)]
    R = [ring(c, rr) for c, rr in rows]
    axis_c = (a + b) * 0.5
    mb.grid(R, closed=True, hint=lambda c, i, j: c - (a + t * (c - a).dot(t)) if 0 < j < len(R) - 2 else c - axis_c)


# ---------------------------------------------------------------------------------------------------------
# Vitrage : panneau sur nappe bilinéaire (a, b = bas ; d, c = haut)
# ---------------------------------------------------------------------------------------------------------
class Patch:
    def __init__(self, a, b, c, d, hint):
        self.a, self.b, self.c, self.d = a, b, c, d
        m = self.N0(0.5, 0.5)
        self.s = -1 if m.dot(hint) < 0 else 1
        self.hs = (d - a).length * 0.5 + (c - b).length * 0.5

    def P(self, u, w):
        return self.a.lerp(self.b, u).lerp(self.d.lerp(self.c, u), w)

    def N0(self, u, w):
        return (self.b - self.a).lerp(self.c - self.d, w).cross((self.d - self.a).lerp(self.c - self.b, u)).normalized()

    def N(self, u, w):
        return self.N0(u, w) * self.s

    def wspan(self, eB, eT):
        return eB / self.hs, 1 - eT / self.hs

    def uspan(self, w, eL, eR):
        L = (self.P(1, w) - self.P(0, w)).length
        return eL / L, 1 - eR / L

    def ring(self, e, nu, nw):
        """Contour (u, w) du panneau en retrait e = (eL, eR, eB, eT), sens bas -> droite -> haut -> gauche."""
        eL, eR, eB, eT = e
        w0, w1 = self.wspan(eB, eT)
        pts = []
        for i in range(nu):
            u0, u1 = self.uspan(w0, eL, eR)
            pts.append((u0 + (u1 - u0) * i / nu, w0))
        for j in range(nw):
            w = w0 + (w1 - w0) * j / nw
            pts.append((self.uspan(w, eL, eR)[1], w))
        for i in range(nu, 0, -1):
            u0, u1 = self.uspan(w1, eL, eR)
            pts.append((u0 + (u1 - u0) * i / nu, w1))
        for j in range(nw, 0, -1):
            w = w0 + (w1 - w0) * j / nw
            pts.append((self.uspan(w, eL, eR)[0], w))
        return pts

    def at(self, uw, depth=0.0):
        u, w = uw
        return self.P(u, w) + self.N(u, w) * depth


def glazing(glass, caulk, pt, e, nu=10, nw=6, thick=0.012, frit=0.010, back=0.007):
    """Verre (face extérieure seule, 'glass'), chant du verre et joint de calfeutrage en retrait ('caulk'),
    bordure sérigraphiée noire vue à travers le verre (bande de 'frit' derrière le bord du verre)."""
    eL, eR, eB, eT = e
    w0, w1 = pt.wspan(eB, eT)
    rows = []
    for j in range(nw + 1):
        w = w0 + (w1 - w0) * j / nw
        u0, u1 = pt.uspan(w, eL, eR)
        rows.append([pt.P(u0 + (u1 - u0) * i / nu, w) for i in range(nu + 1)])
    hint = lambda c, i, j: pt.N(0.5, 0.5)
    ids = glass.grid(rows, hint=hint, uv='arc')
    # chant du verre
    r0 = pt.ring(e, nu, nw)
    edge = [[pt.at(uw, 0.0) for uw in r0], [pt.at(uw, -thick) for uw in r0]]
    caulk.grid(edge, closed=True, hint=lambda c, i, j: c - pt.P(0.5, 0.5) - pt.N(0.5, 0.5) * (c - pt.P(0.5, 0.5)).dot(pt.N(0.5, 0.5)))
    # fond de joint (de la limite du panneau jusqu'à frit sous le verre), en retrait
    ro = pt.ring((0, 0, 0, 0), nu, nw)
    ri = pt.ring((eL + frit, eR + frit, eB + frit, eT + frit), nu, nw)
    bk = [[pt.at(uw, -back) for uw in ro], [pt.at(uw, -back) for uw in ri]]
    caulk.grid(bk, closed=True, hint=lambda c, i, j: pt.N(0.5, 0.5))


# ---------------------------------------------------------------------------------------------------------
# Construction
# ---------------------------------------------------------------------------------------------------------
def build(ctx):
    D = [v(x, deckY(x), z) for x, z in D2]
    Df = [v(x, FLOOR, z) for x, z in D2]
    L = [v(x, YL, z) for x, z in L2]
    U = [v(x, YU, z) for x, z in U2]
    nO = len(D)
    k6 = nO - 1

    def ring(arr):
        return list(arr) + [mz(p) for p in reversed(arr)]

    # ============================ PAROI BASSE DU ROUF (superstructure) =================================
    fDf, fD, fL, sD, fU = fillet_rows([ring(Df), ring(D), ring(L), ring(D), ring(U)],
                                      [0.035, 0.035, 0.035, 1e-6, 0.04], 6)
    nR = len(fD)
    GH, GI = 0.018, 0.008
    pn = plan_normals(fD)
    inN = [-n * GI for n in pn]
    gIn0 = [fDf[i] + inN[i] for i in range(nR)]
    gIn1 = [fD[i] + inN[i] + v(0, GH, 0) for i in range(nR)]
    gOut = [fD[i] + v(0, GH, 0) for i in range(nR)]

    wall = MB()
    gap = MB()
    # joint creux d'ombre au pied (noir mat) + fond de trémie
    gap.grid([gIn0, gIn1], hint=lambda c, i, j: out_hint(c))
    gap.grid([gIn1, [p + pn[i] * -0.003 for i, p in enumerate(gOut)]], hint=lambda c, i, j: v(0, -1, 0))
    yb = lambda p: v(p.x, p.y - 0.003, p.z)
    gap.grid([[yb(p) for p in sD], [yb(fD[i]) + inN[i] * 1.25 for i in range(nR)]], hint=lambda c, i, j: v(0, 1, 0))
    # flanc : arête basse arrondie (r 3 mm) puis galbe vertical de 12 mm, nul aux extrémités
    sAcc = cum_len([hor(p) for p in fD])
    Lr = sAcc[-1]
    rows = []
    for s in range(4):  # arrondi de l'arête basse
        t = s / 3
        rows.append([bez2(gOut[i] - pn[i] * 0.004, gOut[i], gOut[i] + v(0, 0.004, 0), t) for i in range(nR)])
    NB = 10
    base = rows[-1]
    for kk in range(1, NB + 1):
        t = kk / NB
        r_ = []
        for i in range(nR):
            q = base[i].lerp(fL[i], t)
            o = pn[i]
            r_.append(q + o * (0.048 * t * (1 - t) * ss(0, 0.6, min(sAcc[i], Lr - sAcc[i]))))
        rows.append(r_)
    wall.grid(rows, hint=lambda c, i, j: out_hint(c) if j > 0 else v(0, -1, 0) + out_hint(c).normalized())
    # flasque arrière (plan x = X_SIDE0, vers l'arrière) : ferme la section pied -> seuil -> arête de toit
    for sgn, col in ((1, 0), (-1, nR - 1)):
        poly = [rows[k][col] for k in range(len(rows))] + [U[0] if sgn > 0 else mz(U[0])]
        poly = [D[0] if sgn > 0 else mz(D[0])] + poly
        ids = [wall.vert(p) for p in poly]
        wall.face(ids, v(-1, 0, 0))
    make_obj(ctx, gap, 'superstructure', 'hullBottom', 'shadowGap', sharp=30)
    make_obj(ctx, wall, 'superstructure', 'superstructure', 'deckhouseWall', sharp=40)

    # ============================ SEUIL INOX PROFILÉ (accent) ==========================================
    pnL = plan_normals(fL)
    sill_prof = rounded_poly([(-0.03, -0.045), (0.022, -0.045), (0.022, 0.012), (0.014, 0.026), (-0.03, 0.0275)],
                             [0, 0.006, 0.007, 0.006, 0], 3)
    sill = MB()
    sweep(sill, [(fL[i], pnL[i], v(0, 1, 0)) for i in range(nR)], sill_prof)
    make_obj(ctx, sill, 'superstructure', 'accent', 'sill', sharp=50)

    # ============================ VERRIÈRE (upperGlass) ===============================================
    glass, caulk, mull = MB(), MB(), MB()
    E_SIDE, E_B, E_T = 0.031, 0.032, 0.049
    patches = []
    for sgn in (1, -1):
        Ls = L if sgn > 0 else [mz(p) for p in L]
        Us = U if sgn > 0 else [mz(p) for p in U]
        side = []
        for i in range(nO - 1):
            pt = Patch(Ls[i], Ls[i + 1], Us[i + 1], Us[i], out_hint((Ls[i] + Us[i + 1]) * 0.5))
            side.append(pt)
            eL = 0.056 if i == 0 else E_SIDE  # montant arrière décalé de 25 mm
            glazing(glass, caulk, pt, (eL, E_SIDE, E_B, E_T))
        patches.append(side)
    pc = Patch(L[k6], mz(L[k6]), mz(U[k6]), U[k6], v(1, 1, 0))
    glazing(glass, caulk, pc, (E_SIDE, E_SIDE, E_B, E_T), nu=8)
    # meneaux : capot profilé 50 mm, saillie 11 mm, arêtes arrondies (bevel 6 mm)
    for sgn, side in ((1, patches[0]), (-1, patches[1])):
        Ls = L if sgn > 0 else [mz(p) for p in L]
        Us = U if sgn > 0 else [mz(p) for p in U]
        for i in range(0, nO):
            a, b = Ls[i], Us[i]
            if i == 0:
                n = side[0].N(0, 0.5)
                a, b = a + v(0.025, 0, 0), b + v(0.025, 0, 0)
            elif i < nO - 1:
                n = (side[i - 1].N(1, 0.5) + side[i].N(0, 0.5)).normalized()
            else:
                n = (side[i - 1].N(1, 0.5) + pc.N(0 if sgn > 0 else 1, 0.5)).normalized()
            t = (b - a).normalized()
            s = t.cross(n).normalized()
            n = s.cross(t).normalized() * (1 if s.cross(t).dot(n) > 0 else -1)
            frame_box(mull, a, t, s, n, -0.03, (b - a).length + 0.005, -0.025, 0.025, -0.02, 0.011)
    # traverse haute profilée sous le bandeau (suit le pied du toit, dévers du vitrage)
    pnU = plan_normals(fU)
    fr_ = []
    for i in range(nR):
        g = (fL[i] - fU[i]).normalized()
        n = (pnU[i] - g * pnU[i].dot(g)).normalized()
        fr_.append((fU[i], n, -g))
    head_prof = rounded_poly([(-0.025, 0.002), (0.013, 0.002), (0.013, -0.045), (-0.025, -0.045)],
                             [0, 0.003, 0.007, 0], 3)
    head = MB()
    sweep(head, fr_, head_prof)
    make_obj(ctx, glass, 'upperGlass', 'glass', 'canopyGlazing', sharp=60, wn=False)
    make_obj(ctx, caulk, 'upperGlass', 'caulk', 'canopyJoints', sharp=30)
    make_obj(ctx, mull, 'upperGlass', 'metalDark', 'mullions', bevel=(0.006, 3, 30))
    make_obj(ctx, head, 'upperGlass', 'metalDark', 'headRail', sharp=50)

    # ============================ FEUX : BOÎTIERS (metalDark ; optiques restées en JS) =================
    nav = MB()
    f_, w_ = 0.78, 0.5
    pb, ptp = D[4].lerp(D[5], f_), L[4].lerp(L[5], f_)
    p = pb.lerp(ptp, w_)
    t = (D[5] - D[4]).normalized()
    n = t.cross(ptp - pb).normalized()
    if n.z < 0:
        n = -n
    u = n.cross(t).normalized()
    for sgn in (1, -1):
        M = (lambda q: q) if sgn > 0 else mz
        o = M(p)
        tt, uu, nn = M(t), M(u), M(n)
        frame_box(nav, o, tt, uu, nn, -0.12, 0.12, -0.045, 0.045, 0.001, 0.036)
    make_obj(ctx, nav, 'superstructure', 'metalDark', 'navHousings', bevel=(0.01, 3, 30))

    # ============================ JOUES ARRIÈRE ========================================================
    cheekBase = [(X_CHEEK, Z_CHEEK), (X_CHEEK, 3.0), (-11.0, ZD), (X_SIDE0, ZD), (X_SIDE0, Z_CHEEK)]
    cheekTop = [(-10.8, Z_CHEEK), (-10.8, 2.55), (-10.4, ZU), (X_SIDE0, ZU), (X_SIDE0, Z_CHEEK)]
    cheek, rods, cframe = MB(), MB(), MB()
    cglass, ccaulk = MB(), MB()
    for sgn in (1, -1):
        M = (lambda q: q) if sgn > 0 else mz
        rb = [M(v(x, FLOOR, z)) for x, z in cheekBase]
        rd = [M(v(x, deckY(x), z)) for x, z in cheekBase]
        rt = [M(v(x, YU, z)) for x, z in cheekTop]
        fb, fd, ft = fillet_rows([rb, rd, rt], [0.012, 0.012, 0.04], 6, closed=True)
        # rangées intermédiaires (normales lisses sur la hauteur, congé qui s'élargit vers le toit)
        mids = []
        for kk in range(1, 6):
            tt = kk / 6
            mids.append([fd[i].lerp(ft[i], tt) for i in range(len(fd))])
        cen = M(v(-10.45, 0, 2.75))
        cheek.grid([fb, fd] + mids + [ft], closed=True, hint=lambda c, i, j, cen=cen: v(c.x - cen.x, 0, c.z - cen.z))
        for i in (1, 2):
            dvec = (rt[i] - rd[i]).normalized()
            e = rt[i] - dvec * 0.024
            s0 = rd[i].lerp(rt[i], 0.74 / (rt[i].y - rd[i].y))
            rod(rods, s0, e, 0.021)
        # vitrage trapèze de la face latérale
        a = rd[2].lerp(rd[3], 0.3).lerp(rt[2].lerp(rt[3], 0.3), 0.18)
        b = rd[2].lerp(rd[3], 0.92).lerp(rt[2].lerp(rt[3], 0.92), 0.18)
        c = rt[2].lerp(rt[3], 0.92).lerp(rd[2].lerp(rd[3], 0.92), 0.12)
        d = rt[2].lerp(rt[3], 0.62).lerp(rd[2].lerp(rd[3], 0.62), 0.12)
        off = lambda q, o: q + v(0, 0, o * sgn)
        q4 = [a, b, c, d]
        nf = (b - a).cross(d - a).normalized()
        if nf.z * sgn < 0:
            nf = -nf
        ctr = (a + b + c + d) * 0.25

        def edgeN(p0, p1):
            e_ = (p1 - p0).cross(nf).normalized()
            return -e_ if e_.dot(p0 - ctr) < 0 else e_

        def offq(W):
            res = []
            for i in range(4):
                n1, n2 = edgeN(q4[(i + 3) % 4], q4[i]), edgeN(q4[i], q4[(i + 1) % 4])
                res.append(q4[i] + (n1 + n2) * (W / (1 + n1.dot(n2))))
            return res
        Q = offq(0.035)
        # cadre : face à +16 mm, chant extérieur noyé dans la joue, lèvre intérieure à +6 mm
        rr = [[off(p, 0.006) for p in q4], [off(p, 0.016) for p in q4], [off(p, 0.016) for p in Q], [off(p, -0.006) for p in Q]]
        cframe.grid(rr, closed=True, hint=lambda c_, i, j: nf if j == 1 else (c_ - ctr) * (1 if j == 2 else -1))
        pt = Patch(off(a, 0.010), off(b, 0.010), off(c, 0.010), off(d, 0.010), nf)
        glazing(cglass, ccaulk, pt, (0.006, 0.006, 0.006, 0.006), nu=4, nw=3, thick=0.006, frit=0.018, back=0.004)
    make_obj(ctx, cheek, 'superstructure', 'superstructure', 'aftCheeks', sharp=40)
    make_obj(ctx, rods, 'superstructure', 'accent', 'cheekRods', sharp=60)
    make_obj(ctx, cframe, 'superstructure', 'metalDark', 'cheekWindowFrames', bevel=(0.003, 2, 30))

    # ============================ BAIE COULISSANTE ARRIÈRE ============================================
    yf, yt = deckY(X_DOOR), YC
    dstile, dpost, dhead, dsill = MB(), MB(), MB(), MB()
    for sgn in (1, -1):
        for dx in (0.0, 0.07):
            z0, z1 = 1.72 + dx, Z_CHEEK
            x = X_DOOR + dx
            P4 = [v(x, yf, z0 * sgn), v(x, yf, z1 * sgn), v(x, yt, z1 * sgn), v(x, yt, z0 * sgn)]
            # bas, bas, haut, haut ; retraits : montant (18+5 mm), poteau (z 2.14), traverse (3.53), seuil (+20 mm)
            pt = Patch(P4[0], P4[1], P4[2], P4[3], v(-1, 0, 0))
            glazing(cglass, ccaulk, pt, (0.023, 0.065, 0.026, 0.055), nu=2, nw=4, thick=0.010, frit=0.012, back=0.005)
        for z in (1.72, 1.79):
            aabb(dstile, X_DOOR - 0.025, X_DOOR + 0.095, yf - 0.01, yt + 0.01, sgn * z - 0.018, sgn * z + 0.018)
        za, zb = sorted((sgn * (Z_CHEEK - 0.06), sgn * (Z_CHEEK + 0.03)))
        aabb(dpost, X_DOOR - 0.03, X_DOOR + 0.12, yf - 0.01, yt + 0.01, za, zb)
    aabb(dhead, X_DOOR - 0.03, X_DOOR + 0.1, yt - 0.05, YU + 0.012, -Z_CHEEK - 0.02, Z_CHEEK + 0.02)
    aabb(dsill, X_DOOR - 0.03, X_DOOR + 0.1, yf - 0.012, yf + 0.02, -Z_CHEEK - 0.02, Z_CHEEK + 0.02)
    make_obj(ctx, cglass, 'upperGlass', 'glass', 'aftGlazing', sharp=60, wn=False)
    make_obj(ctx, ccaulk, 'upperGlass', 'caulk', 'aftGlazingJoints', sharp=30)
    make_obj(ctx, dstile, 'upperGlass', 'metalDark', 'doorStiles', bevel=(0.01, 3, 30))
    make_obj(ctx, dpost, 'superstructure', 'metalDark', 'doorPosts', bevel=(0.012, 3, 30))
    make_obj(ctx, dhead, 'superstructure', 'metalDark', 'doorHeader', bevel=(0.012, 3, 30))
    make_obj(ctx, dsill, 'superstructure', 'accent', 'doorSill', bevel=(0.008, 3, 30))

    build_roof(ctx)


# ---------------------------------------------------------------------------------------------------------
# TOIT : sous-face (joint creux), bandeau sombre, joint d'ombre, grand chanfrein métal, dessus bombé, gouttière
# ---------------------------------------------------------------------------------------------------------
YF = YU + 0.07
RF, RR = 0.02, 0.022


def build_roof(ctx):
    U = [v(x, YU, z) for x, z in U2]
    side = [v(-10.8, YU, 2.55), v(-10.4, YU, ZU)] + U
    loop = side + [mz(p) for p in reversed(side)]
    # rééchantillonnage des longs côtés droits (pas <= 0,25 m) : le bouge (fonction de z) s'applique alors
    # continûment au bandeau et au chanfrein (en JS, l'arête arrière reste une corde droite sous un dessus bombé)
    loop2 = []
    for i in range(len(loop)):
        a, b = loop[i], loop[(i + 1) % len(loop)]
        loop2.append((a.x, a.z))
        Ls, mg = (b - a).length, 0.45  # marge : l'onglet du retrait de 0,38 m ne doit pas replier les points
        if Ls > 2 * mg + 0.1:
            k = max(1, math.ceil((Ls - 2 * mg) / 0.25))
            for t in range(k + 1):
                f = (mg + (Ls - 2 * mg) * t / k) / Ls
                loop2.append((a.x + (b.x - a.x) * f, a.z + (b.z - a.z) * f))

    # profil en coupe (d = retrait vers l'intérieur depuis le contour, y absolu avant bouge)
    dirB = V((0.36, YR - YF)).normalized()
    Fb = V((0.0, YF)) + dirB * RF
    Ra = V((0.36, YR)) - dirB * RR
    prof_dark = [(0.05, YC), (0.006, 3.6168)] + round_corner((0.006, 3.6168), (0.0, 3.6225), (0.0, 3.66), 0.0035, 3)[0:] + \
        [(0.0, 3.6630)] + round_corner((0.0, 3.663), (0.0, 3.6665), (0.0045, 3.6665), 0.0018, 2) + [(0.0045, 3.6700)]
    prof_acc = [(0.0045, 3.6700)] + round_corner((0.0045, 3.670), (0.0, 3.670), (0.0, 3.69), 0.0018, 2) + \
        [tuple(bez2(V((0.0, YF - RF + 0.005)), V((0.0, YF)), Fb, s / 5)) for s in range(6)] + \
        [tuple(bez2(Ra, V((0.36, YR)), V((0.36 + RR, YR)), s / 6)) for s in range(7)]

    def lift_k(y):
        return min(1.0, max(0.0, (y - 3.6225) / (3.6630 - 3.6225)))

    def rows_for(prof):
        rr = [[v(x, y, z) for (x, z) in inset2(loop2, d)] for (d, y) in prof]
        return rr

    allprof = prof_dark + prof_acc[1:]
    R = fillet_rows(rows_for(allprof), 0.04, 6, closed=True)
    R = [[v(p.x, p.y + roof_camber(p.z) * lift_k(allprof[j][1]), p.z) for p in r] for j, r in enumerate(R)]
    nd = len(prof_dark)
    # repères pour l'orientation : E1 = vers l'extérieur (horizontal), E2 = haut
    m = len(R[0])
    E1 = [hor(R[0][i] - R[-1][i]).normalized() for i in range(m)]

    def mk_hint(prof):
        def h(c, i, j):
            (a0, b0), (a1, b1) = prof[j], prof[j + 1]
            # profil en (a = -d, b = y) : air à droite du parcours
            return E1[i] * (b1 - b0) - v(0, 1, 0) * (-(a1 - a0))
        return h

    fascia, bevel_ = MB(), MB()
    fascia.grid(R[:nd], closed=True, hint=mk_hint(prof_dark))
    bevel_.grid(R[nd - 1:], closed=True, hint=mk_hint(prof_dark[-1:] + prof_acc[1:]))
    make_obj(ctx, fascia, 'roof', 'metalDark', 'roofFascia', sharp=45)
    make_obj(ctx, bevel_, 'roof', 'accent', 'roofBevel', sharp=45)

    # dessus : remplissage Delaunay (pas 0,2 m) du contour Rt, puis bouge
    top_ring = R[-1]
    bnd = [V((p.x, p.z)) for p in top_ring]
    xs = [b.x for b in bnd]
    zs = [b.y for b in bnd]
    pts = list(bnd)
    step = 0.2
    inner = inset2([(b.x, b.y) for b in bnd], 0.08)
    x = min(xs) + 0.1
    while x < max(xs):
        z = min(zs) + 0.1
        while z < max(zs):
            if _inside((x, z), inner):
                pts.append(V((x, z)))
            z += step
        x += step
    nb = len(bnd)
    vo, eo, fo, *_ = mgeo.delaunay_2d_cdt(pts, [(i, (i + 1) % nb) for i in range(nb)], [list(range(nb))], 1, 1e-7)
    top = MB()
    ids = [top.vert(v(q.x, YR + roof_camber(q.y), q.y)) for q in vo]
    for f in fo:
        top.face([ids[k] for k in f], v(0, 1, 0))
    make_obj(ctx, top, 'roof', 'superstructure', 'roofTop', sharp=30)

    # gouttière : jonc plat arrondi Ø26 × 12 mm, 4 cm en retrait de l'arête du chanfrein
    dg = 0.36 + RR + 0.04
    bead_prof = [(-0.013, -0.004), (-0.013, 0.004), (-0.009, 0.0105), (-0.004, 0.0125), (0.004, 0.0125),
                 (0.009, 0.0105), (0.013, 0.004), (0.013, -0.004)]
    brow = fillet_rows([[v(x, YR, z) for (x, z) in inset2(loop2, dg + a)] for (a, b) in bead_prof], 0.03, 6, closed=True)
    brow = [[v(p.x, YR + roof_camber(p.z) + bead_prof[j][1], p.z) for p in r] for j, r in enumerate(brow)]
    bead = MB()
    bc = [sum((r[i] for r in brow), V((0, 0, 0))) / len(brow) - v(0, 0.004, 0) for i in range(len(brow[0]))]
    bead.grid(brow, closed=True, close_rows=True, hint=lambda c, i, j: c - bc[i])
    make_obj(ctx, bead, 'roof', 'metalDark', 'roofDripRail', sharp=60)

    # sous-face des joues (plafond du pavillon arrière)
    sof = MB()
    for s in (1, -1):
        poly = [v(-10.8, YC + 0.01, s * Z_CHEEK), v(-10.8, YC + 0.01, s * 2.55), v(-10.4, YC + 0.01, s * ZU),
                v(X_SIDE0, YC + 0.01, s * ZU), v(X_SIDE0, YC + 0.01, s * Z_CHEEK)]
        sof.face([sof.vert(p) for p in poly], v(0, -1, 0))
    make_obj(ctx, sof, 'roof', 'superstructure', 'cheekSoffit', sharp=30)


def _inside(p, poly):
    x, y = p
    c = False
    n = len(poly)
    for i in range(n):
        x1, y1 = poly[i]
        x2, y2 = poly[(i + 1) % n]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            c = not c
    return c
