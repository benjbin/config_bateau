"""DIÈDRE 29 — groupe three.js 'hull' : coque, pont teck, plateforme, escalier, pavois, accastillerie.

Tout est calculé en repère three.js (+X avant, +Y haut, +Z tribord, mètres) à partir de lib/lines.py
(portage exact de js/boat.js) puis converti en repère Blender à la création des maillages (to_bl).

Principes :
  - coque = UN maillage quad (loft des sections, quille → bouchain → flottaison → dièdre → livet → plat-bord
    → pavois intérieur), fermé par le tableau arrière et les joues d'escalier ; arêtes réelles par
    modificateurs Bevel pilotés par attributs d'arête (bw_plain, bw_accent) + harden normals ;
  - pont = vraies lattes (6 cm, joints de 5 mm sur un fond 'caulk' en retrait de 1,2 mm), latte de rive
    de 14 cm qui suit le pavois, latte d'axe effilée, encastrements (nibbing) exacts comme boat.js,
    abouts décalés ; chants arrondis 2 mm, normales analytiques ; UV en mètres, fil le long de u ;
  - exclus : nom de coque, feux, lumières sous-marines (restent procéduraux en JS).
"""
import math
import bpy
import bmesh
from mathutils import Vector, Matrix

from lines import (XS, XB, XP, X_STAIR, Z_STAIR, Y_PLAT, KMAX, TUMBLE, FLARE,
                   clamp01, ss, knuckleW, sheer, deckY, knuckleY, section, halfW, to_bl)

GROUP = 'hull'

# ---------------------------------------------------------------------------
# constantes reprises de boat.js
# ---------------------------------------------------------------------------
X_CHEEK = -11.4
X_SWEEP = -10.0
BT = 0.36
X_DOOR = -10.3
Z_CHEEK = 2.2
X_SIDE0, X_SIDE1 = -9.6, -0.6
ZD = 3.42
_sideX = [X_SIDE0, -7.35, -5.1, -2.85, X_SIDE1]
_ARC = [math.radians(55), math.radians(22)]
D2 = [(x, ZD) for x in _sideX] + [(X_SIDE1 + 3.64 * math.cos(a), ZD * math.sin(a)) for a in _ARC]
HOLE = [(X_DOOR, Z_CHEEK), (X_SIDE0, Z_CHEEK)] + D2
XH0, XH1 = X_DOOR, D2[-1][0]

# pont
PL = 0.06      # pas des lattes
GAP = 0.005    # joint calfaté
MW = 0.14      # latte de rive
CAULK_D = 0.0012  # retrait du calfatage sous le dessus des lattes
BOARD_R = 0.002   # arrondi des chants de latte
BOARD_H = 0.006   # hauteur visible des chants


def bulwarkTop(x):
    return deckY(x) + 0.72 if x <= X_CHEEK else sheer(x) + 0.59 * (1 - ss(X_CHEEK, X_SWEEP, x))


def bt(x):
    """épaisseur du pavois (face intérieure) : 0,36 m, raccordée en fin de plongée au plat-bord (0,10 m)."""
    if x >= X_SWEEP:
        return 0.1
    return BT - (BT - 0.1) * ss(X_SWEEP - 0.9, X_SWEEP, x)


def slope(x):
    return math.atan2(deckY(x + 0.01) - deckY(x - 0.01), 0.02)


def zHole(x):
    # même règle que boat.js : segment de la ligne de trémie contenant x (côté x croissant)
    for (xa, za), (xb, zb) in zip(HOLE, HOLE[1:]):
        if xb - xa > 1e-6 and xa - 1e-9 <= x <= xb + 1e-9:
            return za + (zb - za) * (x - xa) / (xb - xa)
    return 0.0


def lerpCK(s, y):
    """(y, z) sur le panneau bas (bouchain → dièdre) à la hauteur y."""
    d = s['knY'] - s['chY']
    t = (y - s['chY']) / d if d > 1e-6 else 0.0
    return s['chZ'] + t * (s['knZ'] - s['chZ'])


def smax(a, b, k=0.01):
    return 0.5 * (a + b + math.sqrt((a - b) ** 2 + k * k))


# ---------------------------------------------------------------------------
# utilitaires maillage
# ---------------------------------------------------------------------------
class MB:
    """Constructeur de maillage en repère three.js. weld=True soude les sommets confondus."""

    def __init__(self, weld=False):
        self.v, self.f, self.fm, self.fuv = [], [], [], []
        self.vn = None
        self.weld = weld
        self.key = {}
        self.ew = {}
        self._fset = set()

    def add(self, p):
        if self.weld:
            k = (round(p[0], 6), round(p[1], 6), round(p[2], 6))
            i = self.key.get(k)
            if i is not None:
                return i
            self.key[k] = len(self.v)
        self.v.append((float(p[0]), float(p[1]), float(p[2])))
        return len(self.v) - 1

    def face(self, idx, mat=0, uv=None):
        out, ouv = [], []
        for j, i in enumerate(idx):
            if out and out[-1] == i:
                continue
            out.append(i)
            if uv:
                ouv.append(uv[j])
        if len(out) > 1 and out[0] == out[-1]:
            out.pop()
            if uv:
                ouv.pop()
        if len(out) < 3 or len(set(out)) < len(out):
            return None
        k = tuple(sorted(out))
        if k in self._fset:
            return None
        self._fset.add(k)
        self.f.append(out)
        self.fm.append(mat)
        self.fuv.append(ouv if uv else None)
        return len(self.f) - 1

    def face_o(self, idx, mat, want, uv=None):
        fi = self.face(idx, mat, uv)
        if fi is not None:
            n = _newell([self.v[i] for i in self.f[fi]])
            if n[0] * want[0] + n[1] * want[1] + n[2] * want[2] < 0:
                self.f[fi] = list(reversed(self.f[fi]))
                if self.fuv[fi]:
                    self.fuv[fi] = list(reversed(self.fuv[fi]))
        return fi

    def ewt(self, attr, a, b, w):
        if a == b:
            return
        self.ew.setdefault(attr, {})[(min(a, b), max(a, b))] = w

    def merge(self, other, mat_map=None):
        o = len(self.v)
        self.v += other.v
        for f, m, uv in zip(other.f, other.fm, other.fuv):
            self.f.append([i + o for i in f])
            self.fm.append(mat_map[m] if mat_map else m)
            self.fuv.append(uv)
        if other.vn is not None or self.vn is not None:
            base = self.vn if self.vn is not None else [None] * o
            self.vn = base + (other.vn if other.vn is not None else [None] * len(other.v))
        for a, d in other.ew.items():
            for (i, j), w in d.items():
                self.ew.setdefault(a, {})[(i + o, j + o)] = w

    def transformed(self, M):
        """copie transformée par la matrice 4x4 M (repère three)."""
        o = MB()
        o.v = [tuple(M @ Vector(p)) for p in self.v]
        o.f = [list(f) for f in self.f]
        o.fm = list(self.fm)
        o.fuv = list(self.fuv)
        o.ew = {a: dict(d) for a, d in self.ew.items()}
        if self.vn is not None:
            R = M.to_3x3().inverted().transposed()
            o.vn = [None if n is None else tuple((R @ Vector(n)).normalized()) for n in self.vn]
        return o

    def mirrored(self):
        o = MB()
        o.v = [(x, y, -z) for x, y, z in self.v]
        o.f = [list(reversed(f)) for f in self.f]
        o.fm = list(self.fm)
        o.fuv = [list(reversed(u)) if u else None for u in self.fuv]
        o.ew = {a: dict(d) for a, d in self.ew.items()}
        if self.vn is not None:
            o.vn = [None if n is None else (n[0], n[1], -n[2]) for n in self.vn]
        return o


def _proj_uv(p, n):
    ax, ay, az = abs(n[0]), abs(n[1]), abs(n[2])
    if ay >= ax and ay >= az:
        return (p[0], p[2])
    if ax >= az:
        return (p[2], p[1])
    return (p[0], p[1])


def _newell(pts):
    nx = ny = nz = 0.0
    for i in range(len(pts)):
        x0, y0, z0 = pts[i]
        x1, y1, z1 = pts[(i + 1) % len(pts)]
        nx += (y0 - y1) * (z0 + z1)
        ny += (z0 - z1) * (x0 + x1)
        nz += (x0 - x1) * (y0 + y1)
    l = math.sqrt(nx * nx + ny * ny + nz * nz) or 1.0
    return (nx / l, ny / l, nz / l)


def make_obj(ctx, name, mb, mats, smooth=True, sharp_deg=None):
    """Crée l'objet Blender (repère converti), matériaux par nom (clés de boat.js), UV en mètres."""
    me = bpy.data.meshes.new(name)
    verts = [to_bl(p) for p in mb.v]
    me.from_pydata(verts, [], mb.f)
    for m in mats:
        me.materials.append(ctx.mat(m))
    for poly, mi in zip(me.polygons, mb.fm):
        poly.material_index = mi
    uvl = me.uv_layers.new(name='UVMap')
    for poly, fuv, f in zip(me.polygons, mb.fuv, mb.f):
        if fuv:
            for li, uv in zip(poly.loop_indices, fuv):
                uvl.data[li].uv = uv
        else:
            n = _newell([mb.v[i] for i in f])
            for li, vi in zip(poly.loop_indices, f):
                uvl.data[li].uv = _proj_uv(mb.v[vi], n)
    for poly in me.polygons:
        poly.use_smooth = smooth
    if mb.ew:
        ek = {tuple(sorted(e.vertices)): e.index for e in me.edges}
        for attr, d in mb.ew.items():
            a = me.attributes.new(attr, 'FLOAT', 'EDGE')
            vals = [0.0] * len(me.edges)
            for k, w in d.items():
                i = ek.get(k)
                if i is not None:
                    vals[i] = w
            a.data.foreach_set('value', vals)
    if sharp_deg is not None:
        bm = bmesh.new()
        bm.from_mesh(me)
        lim = math.radians(sharp_deg)
        sharp = [(not e.is_manifold) or (e.calc_face_angle(0.0) > lim) for e in bm.edges]
        bm.free()
        a = me.attributes.get('sharp_edge') or me.attributes.new('sharp_edge', 'BOOLEAN', 'EDGE')
        a.data.foreach_set('value', sharp)
    me.validate(clean_customdata=False)
    if mb.vn is not None and len(mb.vn) == len(me.vertices):
        vn = []
        for i, n in enumerate(mb.vn):
            vn.append(to_bl(n) if n is not None else (0.0, 0.0, 0.0))
        me.normals_split_custom_set_from_vertices(vn)
    me.update()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    ctx.link(ob, GROUP)
    return ob


def add_bevel(ob, width, seg=3, attr=None, mat=-1, angle=None, harden=True, name='bevel', profile=0.5):
    m = ob.modifiers.new(name, 'BEVEL')
    m.width = width
    m.segments = seg
    m.profile = profile
    m.use_clamp_overlap = False
    m.harden_normals = harden
    m.miter_outer = 'MITER_ARC'
    m.material = mat
    if attr:
        m.limit_method = 'WEIGHT'
        m.edge_weight = attr
    elif angle is not None:
        m.limit_method = 'ANGLE'
        m.angle_limit = math.radians(angle)
    return m


def add_wn(ob):
    m = ob.modifiers.new('wnormal', 'WEIGHTED_NORMAL')
    m.keep_sharp = True
    m.mode = 'FACE_AREA'
    return m


# ---------------------------------------------------------------------------
# primitives (repère three)
# ---------------------------------------------------------------------------
def box(mb, x0, x1, y0, y1, z0, z1, mat=0, skip=()):
    P = [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0),
         (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]
    I = [mb.add(p) for p in P]
    F = {'-z': [0, 3, 2, 1], '+z': [4, 5, 6, 7], '-y': [0, 1, 5, 4], '+y': [3, 7, 6, 2],
         '-x': [0, 4, 7, 3], '+x': [1, 2, 6, 5]}
    for k, f in F.items():
        if k not in skip:
            mb.face([I[i] for i in f], mat)


def loft_rows(mb, rows, mat=0, closed=False, cap0=False, cap1=False, uv=None):
    """rows : liste de rangées de points (même nombre). Quads entre rangées successives ;
    closed = rangées fermées (boucle). Renvoie les indices."""
    idx = [[mb.add(p) for p in r] for r in rows]
    n = len(rows[0])
    for a in range(len(rows) - 1):
        for j in range(n if closed else n - 1):
            k = (j + 1) % n
            mb.face([idx[a][j], idx[a][k], idx[a + 1][k], idx[a + 1][j]], mat)
    if cap0:
        mb.face(list(reversed(idx[0])), mat)
    if cap1:
        mb.face(idx[-1], mat)
    return idx


def lathe(mb, prof, seg=24, mat=0, M=None, cap_top=True):
    """profil [(r, h)] tourné autour de l'axe local Y ; M : matrice 4x4 (repère three)."""
    rows = []
    for r, h in prof:
        row = []
        for k in range(seg):
            a = 2 * math.pi * k / seg
            p = Vector((r * math.cos(a), h, r * math.sin(a)))
            row.append(tuple(M @ p) if M else tuple(p))
        rows.append(row)
    idx = [[mb.add(p) for p in r] for r in rows]
    for a in range(len(rows) - 1):
        for j in range(seg):
            k = (j + 1) % seg
            mb.face([idx[a][j], idx[a + 1][j], idx[a + 1][k], idx[a][k]], mat)
    if cap_top:
        mb.face([idx[-1][j] for j in reversed(range(seg))], mat)
    return idx


def frames(path):
    """repères parallèles (tangente, normale, binormale) le long d'une polyligne."""
    P = [Vector(p) for p in path]
    T = []
    for i in range(len(P)):
        a = P[max(i - 1, 0)]
        b = P[min(i + 1, len(P) - 1)]
        T.append((b - a).normalized())
    up = Vector((0, 1, 0)) if abs(T[0].y) < 0.9 else Vector((1, 0, 0))
    N = [(up - T[0] * up.dot(T[0])).normalized()]
    for i in range(1, len(P)):
        n = N[-1] - T[i] * N[-1].dot(T[i])
        if n.length < 1e-9:
            n = N[-1]
        N.append(n.normalized())
    B = [t.cross(n) for t, n in zip(T, N)]
    return P, T, N, B


def tube(mb, path, radius, seg=16, mat=0, caps=True, round_caps=False):
    P, T, N, B = frames(path)
    rows = []
    for i, p in enumerate(P):
        r = radius(i) if callable(radius) else radius
        rows.append([tuple(p + (N[i] * math.cos(2 * math.pi * k / seg) + B[i] * math.sin(2 * math.pi * k / seg)) * r)
                     for k in range(seg)])
    idx = [[mb.add(q) for q in r] for r in rows]
    for a in range(len(rows) - 1):
        for j in range(seg):
            k = (j + 1) % seg
            mb.face([idx[a][j], idx[a][k], idx[a + 1][k], idx[a + 1][j]], mat)
    if caps:
        for end, sgn in ((0, -1), (len(P) - 1, 1)):
            r = radius(end) if callable(radius) else radius
            if round_caps and r > 1e-5:
                prev = idx[end]
                for s in range(1, 4):
                    a = s / 4 * math.pi / 2
                    c = P[end] + T[end] * (sgn * r * math.sin(a))
                    ring = [mb.add(tuple(c + (N[end] * math.cos(2 * math.pi * k / seg) + B[end] * math.sin(2 * math.pi * k / seg)) * r * math.cos(a))) for k in range(seg)]
                    for j in range(seg):
                        k = (j + 1) % seg
                        if sgn > 0:
                            mb.face([prev[j], prev[k], ring[k], ring[j]], mat)
                        else:
                            mb.face([prev[j], ring[j], ring[k], prev[k]], mat)
                    prev = ring
                tip = mb.add(tuple(P[end] + T[end] * (sgn * r)))
                for j in range(seg):
                    k = (j + 1) % seg
                    mb.face_o([prev[j], prev[k], tip], mat, tuple(T[end] * sgn))
            else:
                f = list(idx[end]) if sgn > 0 else list(reversed(idx[end]))
                mb.face(f, mat)
    return idx


def rrect(hx, hz, r, y, o=0.0, seg=6):
    """rectangle arrondi (plan XZ local) décalé de o, fermé sans doublon."""
    pts = []
    R, ax, az = r + o, hx - r, hz - r
    for sx, sz, a0 in ((1, 1, 0), (-1, 1, 0.5), (-1, -1, 1), (1, -1, 1.5)):
        for k in range(seg + 1):
            a = (a0 + k / (2 * seg)) * math.pi
            pts.append((sx * ax + R * math.cos(a), y, sz * az + R * math.sin(a)))
    return pts


def rbox_mb(w, h, d, r, M=None, mat=0, mb=None, seg=3):
    """boîte arrondie exacte (coins sphériques) centrée, rayon r ; M matrice (repère three)."""
    mb = mb or MB()
    hx, hy, hz = w / 2, h / 2, d / 2
    r = min(r, hx * 0.99, hy * 0.99, hz * 0.99)
    # lignes de latitude : profil vertical arrondi, chaque rangée = rectangle arrondi en plan
    rows = []
    prof = []
    for k in range(seg + 1):
        a = -math.pi / 2 + (k / seg) * math.pi / 2
        prof.append((r * math.cos(a) - r, -hy + r + r * math.sin(a)))
    for k in range(seg + 1):
        a = (k / seg) * math.pi / 2
        prof.append((r * math.cos(a) - r, hy - r + r * math.sin(a)))
    for o, y in prof:
        row = rrect(hx, hz, r, y, o, seg)
        rows.append([tuple(M @ Vector(p)) if M else p for p in row])
    idx = [[mb.add(p) for p in row] for row in rows]
    n = len(rows[0])
    for a in range(len(rows) - 1):
        for j in range(n):
            k = (j + 1) % n
            mb.face([idx[a][j], idx[a + 1][j], idx[a + 1][k], idx[a][k]], mat)
    mb.face(list(idx[0]), mat)
    mb.face(list(reversed(idx[-1])), mat)
    return mb


def mat_at(x, y, z, rz=0.0, rx=0.0, ry=0.0):
    return Matrix.Translation((x, y, z)) @ Matrix.Rotation(ry, 4, 'Y') @ Matrix.Rotation(rz, 4, 'Z') @ Matrix.Rotation(rx, 4, 'X')


def on_normal(p, n):
    q = Vector((0, 1, 0)).rotation_difference(Vector(n).normalized())
    return Matrix.Translation(p) @ q.to_matrix().to_4x4()


# ---------------------------------------------------------------------------
# COQUE
# ---------------------------------------------------------------------------
def hull_stations():
    N = 170
    xs = [XS + (XB - XS) * (1 - (1 - i / N) ** 1.3) for i in range(N + 1)]
    xs += [XS + 0.6, XS + 0.15, XS + 0.3, XS + 0.45, XS + 0.04, X_STAIR]
    xs = sorted(set(round(x, 6) for x in xs))
    out = []
    for x in xs:  # pas de stations trop proches (bevel)
        if out and x - out[-1] < 0.025 and x not in (XS + 0.6,):
            if x >= XB - 1e-9:
                out[-1] = x
            continue
        out.append(x)
    return out


# rangées de la section (avec rangées intermédiaires pour un ombrage propre des panneaux vrillés)
NB_BOT, NB_LOW, NB_UP = 4, 2, 2
R_KEEL = 0
R_CH = NB_BOT
R_WL = R_CH + 1
R_KN = R_WL + NB_LOW
R_LV = R_KN + NB_UP
R_CI = R_LV + 1
R_BW = R_CI + 1


def section_rows(x):
    s = section(x)
    W, sh = s['W'], s['sheer']
    yw = min(smax(0.05, s['chY'] + 0.015), s['knY'] - 0.05)
    za = max(W - 0.1, 0.0)
    keel, ch = (s['keel'], 0.0), (s['chY'], s['chZ'])
    wl, kn, lv = (yw, lerpCK(s, yw)), (s['knY'], s['knZ']), (sh, W)
    lerp = lambda p, q, t: (p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t)
    rows = [lerp(keel, ch, k / NB_BOT) for k in range(NB_BOT)] + [ch, wl]
    rows += [lerp(wl, kn, k / NB_LOW) for k in range(1, NB_LOW)] + [kn]
    rows += [lerp(kn, lv, k / NB_UP) for k in range(1, NB_UP)] + [lv, (sh, za), (deckY(x), za)]
    return rows


def build_hull(ctx):
    xs = hull_stations()
    NS = len(xs)
    mb = MB(weld=True)
    idx = {}
    for i, x in enumerate(xs):
        for side in (1, -1):
            for r, (y, z) in enumerate(section_rows(x)):
                idx[(i, r, side)] = mb.add((x, y, side * z))
    # matériaux : 0 hullBottom, 1 hull, 2 accent
    rowmat = [0] * R_WL + [1] * (R_KN - R_WL) + [2] * (R_CI - R_KN) + [1]
    for side in (1, -1):
        for i in range(NS - 1):
            for r in range(R_BW):
                q = [idx[(i, r, side)], idx[(i + 1, r, side)], idx[(i + 1, r + 1, side)], idx[(i, r + 1, side)]]
                if r == R_CI and xs[i + 1] > XB - 0.5 and idx[(i, r, side)] == idx[(i, r, -side)] \
                        and idx[(i + 1, r, side)] == idx[(i + 1, r, -side)]:
                    continue  # paroi intérieure nulle à la pointe d'étrave
                mb.face(q if side > 0 else list(reversed(q)), rowmat[r])
    # tableau arrière (avec découpe d'escalier) + joues d'escalier + hiloire de l'aile
    sT = section(XS)
    yd = deckY(XS)
    zl = halfW(XS) - BT  # face intérieure du pavois
    t = {}
    for side in (1, -1):
        t[('lipO', side)] = mb.add((XS, sT['sheer'], side * zl))
        t[('stT', side)] = mb.add((XS, sT['sheer'], side * Z_STAIR))
        t[('stD', side)] = mb.add((XS, yd, side * Z_STAIR))
        t[('stB', side)] = mb.add((XS, Y_PLAT, side * Z_STAIR))
    ring = [idx[(0, r, 1)] for r in range(R_LV, 0, -1)] + [idx[(0, 0, 1)]] + [idx[(0, r, -1)] for r in range(1, R_LV + 1)]
    ring += [t[('lipO', -1)], t[('stT', -1)], t[('stD', -1)], t[('stB', -1)],
             t[('stB', 1)], t[('stD', 1)], t[('stT', 1)], t[('lipO', 1)]]
    mb.face_o(ring, 1, (-1, 0, 0))
    XL = XS + 0.04  # épaisseur de la hiloire arrière de l'aile
    for side in (1, -1):
        a = [t[('lipO', side)], t[('stT', side)]]
        b = [mb.add((XL, sT['sheer'], side * zl)), mb.add((XL, sT['sheer'], side * Z_STAIR))]
        c = [mb.add((XL, yd, side * zl)), mb.add((XL, yd, side * Z_STAIR))]
        mb.face_o([a[0], a[1], b[1], b[0]], 1, (0, 1, 0))                  # dessus
        mb.face_o([b[0], b[1], c[1], c[0]], 1, (1, 0, 0))                  # face avant
        mb.face_o([t[('stT', side)], t[('stD', side)], c[1], b[1]], 1, (0, 0, -side))  # bout côté escalier
        # joue d'escalier (z = ±Z_STAIR) de XS à X_STAIR
        jx = [XS + (X_STAIR - XS) * k / 6 for k in range(7)]
        top = [t[('stD', side)]] + [mb.add((x, deckY(x), side * Z_STAIR)) for x in jx[1:]]
        bot = [t[('stB', side)]] + [mb.add((x, Y_PLAT, side * Z_STAIR)) for x in jx[1:]]
        for k in range(6):
            mb.face_o([bot[k], bot[k + 1], top[k + 1], top[k]], 1, (0, 0, -side))
        mb.ewt('bw_accent', t[('stB', side)], t[('stD', side)], 1.4)
        mb.ewt('bw_accent', t[('stD', side)], t[('stT', side)], 0.7)
        mb.ewt('bw_accent', t[('stT', side)], t[('lipO', side)], 0.7)
        mb.ewt('bw_plain', t[('stT', side)], b[1], 0.5)
    # arêtes : bevel (attributs)
    ic = xs.index(min(xs, key=lambda v: abs(v - (XS + 0.6))))
    for side in (1, -1):
        for i in range(NS - 1):
            x = xs[i]
            e = lambda r, w, a='bw_plain': mb.ewt(a, idx[(i, r, side)], idx[(i + 1, r, side)], w)
            e(R_KEEL, 1.0)                                                   # quille
            e(R_CH, 0.8)                                                     # bouchain
            e(R_KN, 0.35 + 0.65 * clamp01((XB - x) / 0.8), 'bw_accent')     # arête du dièdre
            e(R_LV, 0.5)                                                     # livet (sous le liston)
            e(R_CI, 0.9 * clamp01((halfW(xs[i + 1]) - 0.16) / 0.15))         # arête intérieure du plat-bord
        for r in range(R_LV):
            mb.ewt('bw_plain', idx[(NS - 1, r, side)], idx[(NS - 1, r + 1, side)], 1.0 if r >= R_CH else 0.6)  # étrave
            if r < R_CH:
                mb.ewt('bw_plain', idx[(0, r, side)], idx[(0, r + 1, side)], 0.8)   # tableau, sous le bouchain
            else:
                mb.ewt('bw_accent', idx[(0, r, side)], idx[(0, r + 1, side)], 1.4)  # contour métal du tableau
            mb.ewt('bw_plain', idx[(ic, r, side)], idx[(ic, r + 1, side)], 1.4)     # pans coupés
    ob = make_obj(ctx, 'hull_shell', mb, ['hullBottom', 'hull', 'accent'])
    add_bevel(ob, 0.014, 4, 'bw_accent', mat=2, name='bevel_accent')
    add_bevel(ob, 0.010, 3, 'bw_plain', mat=-1, name='bevel_plain')
    return ob


# ---------------------------------------------------------------------------
# LISTON (bourrelet caoutchouc + jonc inox)
# ---------------------------------------------------------------------------
def build_rubrail(ctx):
    xs = [x for x in hull_stations() if XS + 0.035 <= x <= XB - 0.05]
    xs = [XS + 0.035, XS + 0.045, XS + 0.06] + [x for x in xs if x > XS + 0.07] + [XB - 0.05]
    xs = sorted(set(xs))
    rail, ins = MB(), MB()
    R_rows, I_rows = [], []
    NP, NI = 12, 9
    for x in xs:
        s = section(x)
        L = Vector((x, s['sheer'], s['W']))
        K = Vector((x, s['knY'], s['knZ']))
        d = K - L
        d.x = 0
        d.normalize()
        nrm = Vector((0, d.z, -d.y))
        tp = 0.3 + 0.7 * clamp01((XB - 0.05 - x) / 0.9)
        te = math.sqrt(clamp01((x - XS - 0.035) / 0.025))
        f = tp * (0.45 + 0.55 * te)
        a, b = 0.0235 * f, 0.026 * f
        c = L + d * 0.021
        row = []
        # dos plat noyé dans le bordé (n = -0.002), puis demi-ellipse vers l'extérieur
        for k in range(NP + 1):
            th = -math.pi / 2 + math.pi * k / NP
            row.append(tuple(c + d * (a * math.sin(th)) + nrm * (b * math.cos(th) - 0.002)))
        R_rows.append(row)
        ci = c + nrm * (b - 0.0035)
        ri = 0.0075 * f
        I_rows.append([tuple(ci + d * (ri * math.sin(-math.pi / 2 + math.pi * k / (NI - 1))) +
                             nrm * (ri * math.cos(-math.pi / 2 + math.pi * k / (NI - 1)))) for k in range(NI)])
    for rows, m, closedcap in ((R_rows, rail, True), (I_rows, ins, True)):
        idx = [[m.add(p) for p in r] for r in rows]
        n = len(rows[0])
        for i in range(len(rows) - 1):
            for j in range(n - 1):
                m.face([idx[i][j], idx[i][j + 1], idx[i + 1][j + 1], idx[i + 1][j]], 0)
        # embouts + dos (fermeture côté coque)
        m.face_o(list(idx[0]), 0, (-1, 0, 0))
        m.face_o(list(idx[-1]), 0, (1, 0, 0))
        for i in range(len(rows) - 1):
            m.face([idx[i][n - 1], idx[i][0], idx[i + 1][0], idx[i + 1][n - 1]], 0)
    for m, matn, nm in ((rail, 'hullBottom', 'hull_rubRail'), (ins, 'chrome', 'hull_rubRailInsert')):
        both = MB()
        both.merge(m)
        both.merge(m.mirrored())
        make_obj(ctx, nm, both, [matn], sharp_deg=60)


# ---------------------------------------------------------------------------
# PAVOIS DE POUPE
# ---------------------------------------------------------------------------
def build_bulwarks(ctx):
    xsB = [XS, -13.1, -12.9, -12.6, -12.3, -12.0, -11.7, X_CHEEK]
    for i in range(1, 25):
        xsB.append(X_CHEEK + (X_SWEEP - X_CHEEK) * i / 24)
    mb = MB(weld=True)
    I = []
    for x in xsB:
        w, h, sh = halfW(x), bulwarkTop(x), sheer(x)
        f = 1 - ss(X_SWEEP - 0.3, X_SWEEP, x)
        o = w - 0.05 * (h - sh) / 0.59
        dip = 0.004 * ss(X_SWEEP - 0.25, X_SWEEP, x)  # plonge sous le plat-bord (pas de faces coplanaires)
        h -= dip
        ia = max(h - 0.03 * f, deckY(x) + 0.01)
        rows = [(sh - 0.01, w), (h, o), (ia, w - bt(x)), (deckY(x), w - bt(x))]
        I.append([mb.add((x, y, z)) for y, z in rows])
    mats = [0, 1, 2]  # accent / superstructure / hull
    for i in range(len(xsB) - 1):
        for r in range(3):
            mb.face([I[i][r], I[i + 1][r], I[i + 1][r + 1], I[i][r + 1]], mats[r])
        tw = clamp01((X_SWEEP - xsB[i + 1]) / 0.5)
        mb.ewt('bw_accent', I[i][1], I[i + 1][1], 1.0 * tw)
        mb.ewt('bw_accent', I[i][2], I[i + 1][2], 0.85 * tw)
    # about arrière (au-dessus du tableau)
    x = XS
    w = halfW(x)
    top = mb.add((x, sheer(x), w - BT))
    mb.face_o([I[0][0], top, I[0][2], I[0][1]], 0, (-1, 0, 0))
    for a, b in ((I[0][0], I[0][1]), (I[0][1], I[0][2]), (I[0][2], top)):
        mb.ewt('bw_accent', a, b, 0.8)
    both = MB()
    both.merge(mb)
    both.merge(mb.mirrored())
    ob = make_obj(ctx, 'hull_bulwarks', both, ['accent', 'superstructure', 'hull'])
    add_bevel(ob, 0.016, 4, 'bw_accent', mat=0, name='bevel_accent')
    return ob


# ---------------------------------------------------------------------------
# LATTES (générateur générique)
# ---------------------------------------------------------------------------
class Frame:
    """(u le long de la latte, w en travers, dy vertical) -> repère three."""

    def __init__(self, kind, side=1, y0=0.0, xa=0.0):
        self.kind, self.side, self.y0, self.xa = kind, side, y0, xa

    def top(self, u):
        return deckY(u) if self.kind == 'deck' else self.y0

    def up(self, u):
        if self.kind == 'deck':
            d = (deckY(u + 0.01) - deckY(u - 0.01)) / 0.02
            l = math.hypot(d, 1)
            return Vector((-d / l, 1 / l, 0))
        return Vector((0, 1, 0))

    def wdir(self):
        return Vector((0, 0, self.side)) if self.kind == 'deck' else Vector((1, 0, 0))

    def p(self, u, w, dy):
        if self.kind == 'deck':
            return Vector((u, deckY(u), self.side * w)) + self.up(u) * dy
        return Vector((w, self.y0 + dy, u))  # u = z, w = x


def piece_sections(lo, hi, U, glo, ghi, gend=GAP / 2, minw=None, delta=0.0008):
    """Découpe en lattes continues : liste de runs, chaque run = [(u, lo, hi)]."""
    eps = 1e-7
    minw = minw if minw is not None else glo + ghi + 0.004
    width = lambda u: hi(u) - lo(u)
    def cross(a, b, a_in):
        for _ in range(40):
            m = 0.5 * (a + b)
            if (width(m) > minw) == a_in:
                a = m
            else:
                b = m
        return 0.5 * (a + b)
    # sous-intervalles présents (avec points de fuite exacts dans les intervalles partiels)
    subs = []
    for j in range(len(U) - 1):
        a, b = U[j] + eps, U[j + 1] - eps
        if b <= a:
            continue
        pa, pb = width(a) > minw, width(b) > minw
        if pa and pb:
            subs.append([U[j], U[j + 1], True, True])
        elif pa:
            subs.append([U[j], cross(a, b, True), True, False])
        elif pb:
            subs.append([cross(a, b, False), U[j + 1], False, True])
    runs = []
    i = 0
    while i < len(subs):
        j = i
        while j + 1 < len(subs) and subs[j][3] and subs[j + 1][2] and abs(subs[j + 1][0] - subs[j][1]) < 1e-9:
            j += 1
        secs = []
        us = subs[i][0] + (gend if subs[i][2] else 0.0)
        secs.append((us, lo(us), hi(us)))
        for k in range(i + 1, j + 1):
            u = subs[k][0]
            l0, l1 = lo(u - eps), lo(u + eps)
            h0, h1 = hi(u - eps), hi(u + eps)
            jl, jh = abs(l1 - l0) > 1e-5, abs(h1 - h0) > 1e-5
            if not jl and not jh:
                secs.append((u, lo(u), hi(u)))
                continue
            cl = (u - glo if l1 > l0 else u + glo) if jl else None
            ch = (u + ghi if h1 > h0 else u - ghi) if jh else None
            pts = set()
            for c in (cl, ch):
                if c is not None:
                    pts.add(c - delta / 2)
                    pts.add(c + delta / 2)
            for q in sorted(pts):
                lv = (l0 if q < cl else l1) if jl else lo(q)
                hv = (h0 if q < ch else h1) if jh else hi(q)
                secs.append((q, lv, hv))
        ue = subs[j][1] - (gend if subs[j][3] else 0.0)
        secs.append((ue, lo(ue), hi(ue)))
        # monotonie stricte
        clean = []
        for s in sorted(secs, key=lambda t: t[0]):
            if clean and s[0] - clean[-1][0] < 0.0003:
                continue
            clean.append(s)
        if len(clean) >= 2:
            runs.append(clean)
        i = j + 1
    return runs


def _interp(secs, u):
    for a, b in zip(secs, secs[1:]):
        if a[0] <= u <= b[0]:
            t = (u - a[0]) / (b[0] - a[0]) if b[0] > a[0] else 0
            return (u, a[1] + t * (b[1] - a[1]), a[2] + t * (b[2] - a[2]))
    return None


def split_butts(run, butts, gend=GAP / 2, minlen=0.9):
    out, cur = [], run
    for ub in sorted(butts):
        if ub - cur[0][0] < minlen or cur[-1][0] - ub < minlen:
            continue
        # pas d'about dans une rampe (encastrement)
        if any(abs(s[0] - ub) < 0.03 for s in cur[1:-1] if True) and \
                any(abs(a[0] - b[0]) < 0.004 for a, b in zip(cur, cur[1:]) if abs(a[0] - ub) < 0.03):
            continue
        a = _interp(cur, ub - gend)
        b = _interp(cur, ub + gend)
        if a is None or b is None:
            continue
        out.append([s for s in cur if s[0] < a[0] - 1e-4] + [a])
        cur = [b] + [s for s in cur if s[0] > b[0] + 1e-4]
    out.append(cur)
    return out


def plank_geo(mb, secs, fr, glo, ghi, uvmode='u', r=BOARD_R, h=BOARD_H):
    """Latte à chants arrondis : sections (u, lo, hi) → maillage (normales analytiques)."""
    if len(secs) < 2:
        return
    c45 = math.sqrt(0.5)
    rows, nors, uvs = [], [], []
    s_acc = 0.0
    prev = None
    wd = fr.wdir()
    for (u, lo, hi) in secs:
        lo, hi = lo + glo, hi - ghi
        if hi - lo < 0.002:
            hi = lo + 0.002
        rr = min(r, (hi - lo) / 3)
        up = fr.up(u)
        prof = [(lo, -h, (-1, 0)), (lo, -rr, (-1, 0)), (lo + rr * (1 - c45), -rr * (1 - c45), (-c45, c45)),
                (lo + rr, 0, (0, 1)), (hi - rr, 0, (0, 1)), (hi - rr * (1 - c45), -rr * (1 - c45), (c45, c45)),
                (hi, -rr, (1, 0)), (hi, -h, (1, 0))]
        mid = fr.p(u, 0.5 * (lo + hi), 0)
        if prev is not None:
            s_acc += (mid - prev).length
        prev = mid
        row, nr, uvr = [], [], []
        for w, dy, (nw, nu) in prof:
            row.append(tuple(fr.p(u, w, dy)))
            nr.append(tuple((wd * nw + up * nu).normalized()))
            uu = s_acc if uvmode == 's' else u
            uvr.append((uu, w if uvmode != 's' else w))
        rows.append(row)
        nors.append(nr)
        uvs.append(uvr)
    base = len(mb.v)
    if mb.vn is None:
        mb.vn = [None] * base
    idx = []
    for row, nr in zip(rows, nors):
        ir = []
        for p, n in zip(row, nr):
            mb.v.append(p)
            mb.vn.append(n)
            ir.append(len(mb.v) - 1)
        idx.append(ir)
    F = []
    for i in range(len(rows) - 1):
        for j in range(7):
            F.append(([idx[i][j], idx[i][j + 1], idx[i + 1][j + 1], idx[i + 1][j]],
                      [uvs[i][j], uvs[i][j + 1], uvs[i + 1][j + 1], uvs[i + 1][j]]))
    # embouts
    F.append((list(reversed(idx[0])), list(reversed(uvs[0]))))
    F.append((list(idx[-1]), list(uvs[-1])))
    # orientation (dessus vers le haut)
    q = F[3][0]
    n = _newell([mb.v[i] for i in q])
    flip = Vector(n).dot(fr.up(secs[0][0])) < 0
    for f, uv in F:
        if flip:
            f, uv = list(reversed(f)), list(reversed(uv))
        mb.f.append(f)
        mb.fm.append(0)
        mb.fuv.append(uv)


def _hash(k, s=0):
    x = math.sin(k * 127.1 + s * 311.7) * 43758.5453
    return x - math.floor(x)


# ---------------------------------------------------------------------------
# PONT
# ---------------------------------------------------------------------------
def e_out(x):
    w = halfW(x)
    return max(w - bt(x), 0.0)


def inner(x):
    if x < X_STAIR:
        return Z_STAIR
    if x < XH0:
        return 0.0
    if x < XH1:
        return zHole(x)
    return 0.0


def kingK(x):
    return 0.12 - 0.06 * clamp01((x - XH1) / (XB - XH1))


def nibM(z):
    f = z / PL
    k = math.floor(f)
    return z if f - k >= 1 / 3 else k * PL


def nibK(z):
    f = z / PL
    k = math.floor(f)
    return z if f - k <= 2 / 3 else (k + 1) * PL


def fields(x):
    e = e_out(x)
    if x >= XH1:
        kp = min(kingK(x), e)
        eK = min(nibK(kp), e)
    else:
        eK = min(inner(x), e)
    eM = min(e, max(nibM(e - MW), eK))
    return e, eK, eM


def _state(x):
    e = e_out(x)
    reg = 0 if x < X_STAIR else 1 if x < XH0 else 2 if x < X_SIDE0 else 3 if x < XH1 else 4
    a = math.floor((e - MW) / PL - 1 / 3)
    b = math.floor(min(kingK(x), e) / PL - 2 / 3) if x >= XH1 else 0
    return (reg, a, b)


def deck_stations():
    x0 = XS + 0.04
    # extrémité avant du pont (e = 0)
    a, b = XB - 1.0, XB
    for _ in range(60):
        m = 0.5 * (a + b)
        if e_out(m) > 0:
            a = m
        else:
            b = m
    x1 = a
    U = {x0, x1, X_STAIR, XH0, X_SIDE0, XH1, X_SWEEP, XS + 0.6} | {p[0] for p in HOLE}
    # discontinuités (encastrements)
    n = int((x1 - x0) / 0.003)
    xp, sp = x0, _state(x0)
    jumps = []
    for i in range(1, n + 1):
        x = x0 + (x1 - x0) * i / n
        st = _state(x)
        if st != sp:
            lo_, hi_ = xp, x
            for _ in range(50):
                m = 0.5 * (lo_ + hi_)
                if _state(m) == sp:
                    lo_ = m
                else:
                    hi_ = m
            jumps.append(0.5 * (lo_ + hi_))
        xp, sp = x, st
    U |= set(jumps)
    fixed = sorted(U)
    reg = []
    x = x0
    while x < x1:
        step = 0.3 if x < XH1 else 0.2 if x < XB - 2 else 0.1
        x += step
        if x < x1 and all(abs(x - f) > 0.04 for f in fixed):
            reg.append(x)
    return sorted(set(fixed + reg)), x1


def build_deck(ctx):
    U, x1 = deck_stations()
    boards, caulk = MB(), MB()
    nb = int(4.0 / PL) + 1
    for side in (1, -1):
        fr = Frame('deck', side)
        # latte de rive
        lo = lambda u: fields(u)[2]
        hi = lambda u: fields(u)[0]
        for run in piece_sections(lo, hi, U, GAP / 2, 0.0, gend=GAP / 2):
            plank_geo(boards, run, fr, GAP / 2, 0.0, uvmode='s')
        # lattes courantes
        for k in range(nb):
            z0, z1 = k * PL, (k + 1) * PL
            lo = lambda u, z0=z0: max(z0, fields(u)[1])
            hi = lambda u, z1=z1: min(z1, fields(u)[2])
            for run in piece_sections(lo, hi, U, GAP / 2, GAP / 2):
                Lp = 5.4
                off = _hash(k, side) * Lp
                butts = [XS + off + m * Lp for m in range(-1, 9)]
                for pl in split_butts(run, butts):
                    plank_geo(boards, pl, fr, GAP / 2, GAP / 2)
    # latte d'axe (pont avant)
    fr = Frame('deck', 1)
    lo = lambda u: -fields(u)[1] if u >= XH1 else 0.0
    hi = lambda u: fields(u)[1] if u >= XH1 else 0.0
    for run in piece_sections(lo, hi, U, GAP / 2, GAP / 2):
        plank_geo(boards, run, fr, GAP / 2, GAP / 2)
    # fond calfaté
    eps = 1e-7
    for j in range(len(U) - 1):
        a, b = U[j] + eps, U[j + 1] - eps
        ya, yb = deckY(a) - CAULK_D, deckY(b) - CAULK_D
        ea, eb = e_out(a), e_out(b)
        if a >= XH1 - 1e-6:
            q = [(a, ya, -ea), (b, yb, -eb), (b, yb, eb), (a, ya, ea)]
            caulk.face([caulk.add(p) for p in reversed(q)], 0)
            continue
        ia, ib = min(inner(a), ea), min(inner(b), eb)
        for side in (1, -1):
            q = [(a, ya, side * ia), (b, yb, side * ib), (b, yb, side * eb), (a, ya, side * ea)]
            f = [caulk.add(p) for p in q]
            mb_f = f if side < 0 else list(reversed(f))
            caulk.face(mb_f, 0)
    ob = make_obj(ctx, 'hull_deckBoards', boards, ['deck'])
    make_obj(ctx, 'hull_deckCaulk', caulk, ['caulk'], smooth=False)
    return ob


# ---------------------------------------------------------------------------
# PLATEFORME DE BAIN
# ---------------------------------------------------------------------------
def build_platform(ctx):
    sT = section(XS)
    ZP = sT['knZ'] + 0.08
    y0, y1 = 0.06, Y_PLAT
    ol = [(XS + 0.02, ZP), (XP + 0.4, ZP), (XP, ZP - 0.4), (XP, -ZP + 0.4), (XP + 0.4, -ZP), (XS + 0.02, -ZP)]
    mb = MB(weld=True)
    yt = y1 - CAULK_D
    ych = y1 - 0.07
    k = 0.06
    inset = lambda x, z: (x + (k if x < XS - 0.1 else 0), z - math.copysign(k, z))
    T = [mb.add((x, yt, z)) for x, z in ol]
    C = [mb.add((x, ych, z)) for x, z in ol]
    Bt = [mb.add((inset(x, z)[0], y0, inset(x, z)[1])) for x, z in ol]
    n = len(ol)
    mb.face_o(list(T), 0, (0, 1, 0))
    mb.face_o(list(Bt), 3, (0, -1, 0))
    for i in range(n):
        j = (i + 1) % n
        for A, Bv, m in ((T, C, 1), (C, Bt, 2)):
            f = [A[i], A[j], Bv[j], Bv[i]]
            cx = sum(mb.v[q][0] for q in f) / 4 + 13.8
            cz = sum(mb.v[q][2] for q in f) / 4
            mb.face_o(f, m, (cx, 0, cz))
        mb.ewt('bw_top', T[i], T[j], 1.0)
        mb.ewt('bw_side', C[i], C[j], 0.6)
        mb.ewt('bw_side', Bt[i], Bt[j], 0.4)
    for i in range(1, n - 1):  # angles en plan arrondis
        mb.ewt('bw_side', T[i], C[i], 3.0)
        mb.ewt('bw_side', C[i], Bt[i], 3.0)
    ob = make_obj(ctx, 'hull_platform', mb, ['caulk', 'accent', 'metalDark', 'hullBottom'])
    add_bevel(ob, 0.012, 3, 'bw_side', mat=-1, name='bevel_corners')
    add_bevel(ob, 0.014, 4, 'bw_top', mat=1, name='bevel_top')
    # lattes transversales (u = z, w = x), latte de rive le long du bord arrière et des pans coupés
    IN = 0.016
    fr = Frame('plat', y0=y1)
    def xa(u):
        a = abs(u)
        c = ZP - 0.4
        return XP + IN + (0 if a <= c else (a - c) + IN * 0.414)
    xf = XS - 0.004
    uz = ZP - IN
    U = sorted({-uz, uz, -(ZP - 0.4), ZP - 0.4, 0.0})
    # discontinuités d'encastrement sur les pans coupés
    st = lambda u: math.floor((xa(u) + MW - (XP + IN + MW)) / PL - 2 / 3)
    for sgn in (1, -1):
        a0, a1 = ZP - 0.4, uz
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
    W0 = XP + IN + MW
    nibk = lambda m: (lambda f, k: W0 + (m - W0 if f - k <= 2 / 3 else (k + 1) * PL))(
        (m - W0) / PL, math.floor((m - W0) / PL))
    mline = lambda u: xa(u) + MW
    boards = MB()
    lo = lambda u: xa(u)
    hi = lambda u: nibk(mline(u))
    for run in piece_sections(lo, hi, U, 0.0, GAP / 2, gend=0.0):
        plank_geo(boards, run, fr, 0.0, GAP / 2, uvmode='s')
    nb = int((xf - W0) / PL) + 1
    for k in range(nb):
        w0, w1 = W0 + k * PL, min(W0 + (k + 1) * PL, xf)
        lo = lambda u, w0=w0: max(w0, nibk(mline(u)))
        hi = lambda u, w1=w1: w1
        for run in piece_sections(lo, hi, U, GAP / 2, GAP / 2 if w1 < xf else 0.0):
            plank_geo(boards, run, fr, GAP / 2, GAP / 2 if w1 < xf else 0.0)
    # UV : fil le long de u (= z ici) → déjà u ; projeter v = x
    make_obj(ctx, 'hull_platformBoards', boards, ['deck'])
    # joint creux plateforme / tableau
    j = MB()
    box(j, XS - 0.012, XS + 0.01, y1 - 0.004, y1 + 0.0012, -ZP + 0.03, ZP - 0.03, 0)
    make_obj(ctx, 'hull_platformJoint', j, ['hullBottom'], smooth=False)


# ---------------------------------------------------------------------------
# ESCALIER CENTRAL
# ---------------------------------------------------------------------------
def build_stairs(ctx):
    nS = 5
    rise = (deckY(X_STAIR) - Y_PLAT) / (nS + 1)
    run = (X_STAIR - XS) / nS
    zt = Z_STAIR - 0.005
    boards, caulk, riser, nose = MB(), MB(), MB(weld=True), MB()
    for i in range(1, nS + 1):
        yTop = deckY(X_STAIR) - rise * i
        xa, xb = X_STAIR - run * i, X_STAIR - run * (i - 1)
        # fond de marche (calfatage) + lattes transversales (fil parallèle au nez)
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
        # contremarche teck (chants arrondis par bevel)
        box(riser, xa + 0.03, X_STAIR + 0.3, Y_PLAT - 0.15, yTop - 0.05, -zt, zt, 0, skip=('-y', '+x'))
        # nez de marche métal arrondi
        rbox_mb(0.028, 0.057, 2 * (Z_STAIR - 0.01), 0.008, Matrix.Translation((xa, yTop - 0.0265, 0)), 0, nose)
    yd = deckY(X_STAIR)
    box(riser, X_STAIR - 0.002, X_STAIR + 0.3, Y_PLAT - 0.15, yd - 0.006, -zt, zt, 0, skip=('-y', '+x'))
    rbox_mb(0.032, 0.054, 2 * (Z_STAIR + 0.012), 0.008, Matrix.Translation((X_STAIR, yd - 0.023, 0)), 0, nose)
    # nez des bords d'ailes (le long de la joue, au niveau du pont)
    for s in (1, -1):
        L = X_STAIR + 0.016 - XS - 0.04
        rbox_mb(L, 0.054, 0.032, 0.008, Matrix.Translation((XS + 0.04 + L / 2, deckY(XS) - 0.023, s * Z_STAIR)), 0, nose)
    make_obj(ctx, 'hull_stairBoards', boards, ['deck'])
    make_obj(ctx, 'hull_stairCaulk', caulk, ['caulk'], smooth=False)
    ob = make_obj(ctx, 'hull_stairRisers', riser, ['deck'])
    add_bevel(ob, 0.003, 2, angle=40, name='bevel')
    make_obj(ctx, 'hull_stairNosings', nose, ['accent'], sharp_deg=50)


# ---------------------------------------------------------------------------
# DÉTAILS DE COQUE : coffres du tableau, poignées, échappements, passe-coques
# ---------------------------------------------------------------------------
def build_hull_details(ctx):
    sT = section(XS)
    chrome, dark, acc = MB(), MB(), MB()
    # trappes de coffre : joint creux noir (8 mm) arrondi + poignée inox
    zc = (Z_STAIR + 0.22 + sT['knZ'] - 0.42) / 2
    hw = (sT['knZ'] - 0.42 - Z_STAIR - 0.22) / 2
    yc, hh, rc, xg = 1.06, 0.42, 0.07, XS - 0.0015
    def rr(o):
        pts = []
        r = rc + o
        ax, ay = hw + o - r, hh + o - r
        for sx, sy, a0 in ((1, 1, 0), (-1, 1, 0.5), (-1, -1, 1), (1, -1, 1.5)):
            for k in range(9):
                a = (a0 + k / 16) * math.pi
                pts.append((xg, yc + sy * ay + r * math.sin(a), zc + sx * ax + r * math.cos(a)))
        return pts
    g = MB()
    loft_rows(g, [rr(-0.004), rr(0.004)], 0, closed=True)
    if _newell([g.v[i] for i in g.f[0]])[0] > 0:
        g.f = [list(reversed(f)) for f in g.f]
    dark.merge(g)
    dark.merge(g.mirrored())
    hd = rbox_mb(0.014, 0.022, 0.16, 0.007, Matrix.Translation((XS - 0.004, yc + hh - 0.1, zc)))
    chrome.merge(hd)
    chrome.merge(hd.mirrored())
    # poignées en U sur les joues d'escalier
    x = -12.85
    z, ya, yb, rb = Z_STAIR - 0.08, 1.02, 1.52, 0.035
    lower = [(x, ya + rb - rb * math.cos(k / 6 * math.pi / 2), z + rb - rb * math.sin(k / 6 * math.pi / 2)) for k in range(7)]
    upper = [(x, yb - rb + rb * math.sin(k / 6 * math.pi / 2), z + rb - rb * math.cos(k / 6 * math.pi / 2)) for k in range(7)]
    path = [(x, ya, Z_STAIR)] + lower + upper + [(x, yb, Z_STAIR)]
    h = MB()
    tube(h, path, 0.014, 16, caps=True)
    chrome.merge(h)
    chrome.merge(h.mirrored())
    for y in (ya, yb):
        b = MB()
        lathe(b, [(0.0305, 0.0), (0.03, 0.003), (0.027, 0.006), (0.0, 0.0065)], 28,
              M=on_normal(Vector((x, y, Z_STAIR)), (0, 0, -1)))
        acc.merge(b)
        acc.merge(b.mirrored())
    # enjoliveurs tournés normaux au panneau bas
    def hp(x, y):
        s = section(x)
        return Vector((x, y, lerpCK(s, y)))
    def hn(x, y):
        a = hp(x + 0.01, y) - hp(x - 0.01, y)
        b = hp(x, y + 0.01) - hp(x, y - 0.01)
        n = a.cross(b).normalized()
        return -n if n.z < 0 else n
    def fitting(x, y, rIn, rOut, hgt):
        p, n = hp(x, y), hn(x, y)
        M = on_normal(p - n * 0.004, n)
        seg = 40 if rOut > 0.05 else 24
        b = MB()
        lathe(b, list(reversed([(rIn, -0.01), (rIn, hgt * 0.55), (rIn + 0.25 * (rOut - rIn), hgt), (rIn + 0.7 * (rOut - rIn), hgt * 0.92),
                  (rOut - 0.002, hgt * 0.55), (rOut, 0.0), (rOut, -0.004)])), seg, M=M, cap_top=False)
        # orientation : extérieur
        chrome.merge(b)
        chrome.merge(b.mirrored())
        d = MB()
        lathe(d, [(rIn, -0.0), (0.0, -0.0)], seg, M=on_normal(p + n * 0.0, n), cap_top=False)
        dark.merge(d)
        dark.merge(d.mirrored())
    fitting(-12.25, 0.52, 0.068, 0.098, 0.016)
    for x in (-11.2, -10.3, -4.2):
        fitting(x, 0.4, 0.022, 0.034, 0.007)
    # dalots (évacuations) dans la face intérieure du plat-bord, pont avant : platine métal + lumière sombre
    for x in (3.9, 6.9, 9.9):
        w = halfW(x) - 0.1
        yaw = math.atan2(halfW(x + 0.05) - halfW(x - 0.05), 0.1)
        for sgn in (1, -1):
            M = Matrix.Translation((x, deckY(x), sgn * w)) @ Matrix.Rotation(-sgn * yaw, 4, 'Y')
            pl = rbox_mb(0.2, 0.05, 0.006, 0.0025, M @ Matrix.Translation((0, 0.03, -sgn * 0.0005)), seg=2)
            acc.merge(pl)
            sl = rbox_mb(0.15, 0.022, 0.008, 0.008, M @ Matrix.Translation((0, 0.026, -sgn * 0.0005)), seg=2)
            dark.merge(sl)
    make_obj(ctx, 'hull_fittingsChrome', chrome, ['chrome'], sharp_deg=55)
    make_obj(ctx, 'hull_fittingsDark', dark, ['hullBottom'], sharp_deg=60)
    make_obj(ctx, 'hull_fittingsAccent', acc, ['accent'], sharp_deg=55)


# ---------------------------------------------------------------------------
# PANNEAUX DE PONT
# ---------------------------------------------------------------------------
def sweep(hx, hz, r, prof, seg=6):
    g = MB()
    rows = [rrect(hx, hz, r, y, o, seg) for o, y in prof]
    loft_rows(g, rows, 0, closed=True)
    return g


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
              M=Matrix.Translation((0.32, YL0 + 0.03, LZ if zz > 0 else -LZ)))
    rbox_mb(0.02, 0.01, 0.13, 0.0045, Matrix.Translation((LX, YL0 + 0.027, 0)), mb=hw, seg=2)
    for x in (4.6, 8.4):
        for z in (-1.0, 1.0):
            M = mat_at(x, deckY(x), z, rz=slope(x))
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
def cleat_mb():
    m = MB()
    rbox_mb(0.32, 0.04, 0.12, 0.014, Matrix.Translation((0, 0.008, 0)), mb=m, seg=3)
    leg = [(0.054, 0.006), (0.052, 0.02), (0.046, 0.027), (0.040, 0.036), (0.035, 0.055), (0.032, 0.09), (0.031, 0.15), (0.0, 0.15)]
    for dx in (-0.09, 0.09):
        lathe(m, leg, 28, M=Matrix.Translation((dx, 0, 0)), cap_top=False)
    horn = [(0.2 * (k / 10 - 1), 0.165 + 0.02 * (k / 10 - 1) ** 4, 0) for k in range(21)]
    tube(m, horn, lambda i: 0.025 + 0.014 * (1 - (i / 10 - 1) ** 2), 20, caps=True, round_caps=True)
    return m


def fairlead_mb():
    m = MB()
    seg, sr = 36, 14
    R, r = 0.042, 0.013
    rows = []
    for i in range(seg):
        a = 2 * math.pi * i / seg
        row = []
        for j in range(sr):
            b = 2 * math.pi * j / sr
            rad = R + r * math.cos(b)
            row.append((1.7 * rad * math.cos(a), 0.05 + rad * math.sin(a), r * math.sin(b)))
        rows.append(row)
    idx = [[m.add(p) for p in row] for row in rows]
    for i in range(seg):
        for j in range(sr):
            m.face([idx[i][j], idx[(i + 1) % seg][j], idx[(i + 1) % seg][(j + 1) % sr], idx[i][(j + 1) % sr]], 0)
    rbox_mb(0.22, 0.016, 0.06, 0.007, Matrix.Translation((0, 0.002, 0)), mb=m, seg=2)
    return m


def build_cleats(ctx):
    c, f = cleat_mb(), fairlead_mb()
    out = MB()
    for s in (1, -1):
        x = 3.4
        out.merge(c.transformed(mat_at(x, deckY(x), s * (halfW(x) - 0.35), rz=slope(x))))
        x = -12.1
        out.merge(c.transformed(mat_at(x, bulwarkTop(x) - 0.02, s * (halfW(x) - 0.2), rz=slope(x))))
        x = 3.55
        out.merge(f.transformed(mat_at(x, sheer(x), s * (halfW(x) - 0.05), rz=slope(x))))
        x = -12.55
        w, h = halfW(x), bulwarkTop(x)
        z = w - 0.13
        oz = w - 0.05 * (h - sheer(x)) / 0.59
        y = h - 0.03 * (oz - z) / (oz - (w - BT))
        tilt = math.atan2(0.03, oz - (w - BT))
        out.merge(f.transformed(Matrix.Translation((x, y, s * z)) @ Matrix.Rotation(-s * tilt, 4, 'X')))
    make_obj(ctx, 'hull_cleats', out, ['chrome'], sharp_deg=55)


# ---------------------------------------------------------------------------
def build(ctx):
    build_hull(ctx)
    build_rubrail(ctx)
    build_bulwarks(ctx)
    build_deck(ctx)
    build_platform(ctx)
    build_stairs(ctx)
    build_hull_details(ctx)
    build_hatches(ctx)
    build_cleats(ctx)
