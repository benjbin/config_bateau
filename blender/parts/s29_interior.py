"""SILLAGE 29 — groupes three.js 'interior', 'aftDeckFurniture' et mobilier du flybridge (lié à 'roof').

Design original NEOKROME : luxe moderne aux FORMES ARRONDIES — canapés balayés le long de courbes (dossiers
galbés, coussins à passepoil), tables galet / ovales, meubles en plan « stade » aux arêtes très adoucies.
Point de départ : parts/cat_interior.py (DIÈDRE 24), primitives copiées puis implantation refaite aux cotes
lib/s29_lines.py. Repère three.js (+X avant, +Y haut, +Z tribord, m) ; conversion Blender par make_obj.

Cotes choisies par ce module (documentées, cohérentes avec s29_lines) :
  SALON (plancher y 2,40, x -5,2 -> 6,6, demi-largeur 5,05) : contour = SALON_OUTLINE de s29_super s'il existe,
    sinon rectangle aux coins R 1,0 (arrière) / R 2,0 (avant). Plancher = SALON_INNER (face intérieure de l'allège, s29_super) + 2 cm, sinon contour − 6 cm. Mobilier à >= 0,25 m
    des parois ; à l'avant, sous le pare-brise incliné de 38°, tout reste derrière x = 6,45 - (y - 2,40)·tan 38°.
    - bâbord arrière : cuisine le long de la paroi (x -4,3 -> -1,2) + îlot-bar « stade » + 3 tabourets (0,66)
    - tribord arrière : table ovale noyer 3,10 x 1,24 (haut 0,73) + 10 chaises (assise 0,44)
    - bâbord avant : grand canapé en C (dos sur la paroi z -4,55, x 0,0 -> 4,2), table basse galet,
      2 fauteuils tub, tapis ; crédence basse sous le pare-brise bâbord
    - tribord : crédences basses le long de la paroi (x -0,2 -> 3,0)
    - tribord avant : poste de pilotage intérieur (console cintrée x 4,85 -> 5,55, z 0,35 -> 3,55, 3 écrans,
      volant, manettes, 2 sièges pilote à x 4,15, z 1,4 / 2,4)
  COCKPIT (pont y 2,35, sous la casquette du fly x > -9,8) : canapé en U (dos bâbord z -4,7, branches
    x -9,3 / -6,1, ouvert vers tribord), table teck ovale (-7,7 ; -2,5), 2 fauteuils ; allée z 0,6 -> 2,6 libre
    (escalier du fly FLY_STAIR à tribord).
  LOUNGE AVANT : puits FWD_WELL = (x0, x1, demi-largeur, y plancher) = (9,0 ; 12,4 ; 2,5 ; 1,85) sauf si
    s29_hull expose FWD_WELL ; canapé en C contre les parois avant/latérales, ouvert vers l'arrière (marches),
    table teck galet.
  PLATEFORME LOUNGE MER (AFT_LOUNGE, y 0,55) : 2 bains de soleil doubles (|z| 1,0 -> 2,95), dossiers relevés
    vers l'avant (on regarde la mer), axe |z| < 1,0 libre (marches/garage).
  FLYBRIDGE (pont y 5,00, groupe 'roof') : poste de barre à FLY_HELM (console x 3,55 -> 4,25, 2 sièges,
    3 écrans, barre à roue, 2 winchs chrome sur la console) ; bar en arc tribord (x -2,6 -> 0,8) + 3 tabourets +
    meuble arrière ; grand canapé en U bâbord arrière (x -7,3 -> -3,1, dos z -4,6) + table teck ; bains de
    soleil avant bâbord (x 1,6 -> 4,2, z -4,0 -> -0,8). Montants HT_PILLARS et trémie d'escalier dégagés.

Matériaux : clés de la fiche uniquement.
"""
import math
from mathutils import Vector, Matrix

from hull import MB, make_obj, add_bevel, add_wn, lathe, tube
import s29_lines as L29
from s29_lines import (SALON_FLOOR_Y, DECK_Y, SALON_X0, SALON_X1, SALON_ZH, FLY_Y, FLY_HELM, AFT_LOUNGE,
                       HT_PILLARS)

FY = SALON_FLOOR_Y          # 2.40
DY = DECK_Y                 # 2.35
FLY = FLY_Y                 # 5.00
WS_TAN = math.tan(math.radians(38))

FWD_WELL = (9.35, 12.05, 2.45, 1.93)     # (x0, x1, demi-largeur, y fond) — cotes de s29_hull (WELL)
WELL_R = 0.95
try:
    import s29_hull as _h
    FWD_WELL = (float(_h.WX0), float(_h.WX1), float(_h.WZ), float(_h.WFY))
    WELL_R = float(_h.WR)
except Exception:
    pass


def clamp(v, a, b):
    return a if v < a else b if v > b else v


def _ss(a, b, x):
    t = clamp((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3 - 2 * t)

# ---------------------------------------------------------------------------
# objets : un MB + une liste de matériaux par objet
# ---------------------------------------------------------------------------
class Obj:
    def __init__(self, name, group, wn=True, smooth=True, bevel=None):
        self.name, self.group, self.wn, self.smooth, self.bevel = name, group, wn, smooth, bevel
        self.mb = MB()
        self.mats = []

    def m(self, key):
        if key not in self.mats:
            self.mats.append(key)
        return self.mats.index(key)

    def put(self, local, M=None, key=None, mat_map=None):
        mb = local.transformed(M) if M is not None else local
        if key is not None:
            mi = self.m(key)
            mat_map = {i: mi for i in set(mb.fm) | {0}}
        self.mb.merge(mb, mat_map)


def T(x, y, z):
    return Matrix.Translation((x, y, z))


def RY(a):
    return Matrix.Rotation(a, 4, 'Y')


def RX(a):
    return Matrix.Rotation(a, 4, 'X')


def RZ(a):
    return Matrix.Rotation(a, 4, 'Z')


def clamp(v, a, b):
    return a if v < a else b if v > b else v


# ---------------------------------------------------------------------------
# primitives
# ---------------------------------------------------------------------------
def _samples(a, r, step, m):
    if a < 1e-6:
        flat = [0.0]
    else:
        n = max(1, int(math.ceil(2 * a / step)))
        flat = [-a + 2 * a * i / n for i in range(n + 1)]
    cor = [a + r * math.tan(math.pi / 4 * k / m) for k in range(1, m + 1)]
    return [-c for c in reversed(cor)] + flat + cor


def rcube(hx, hy, hz, r, step=(9, 9, 9), m=3, deform=None, mat=0, flat0=None):
    """boîte arrondie (arêtes et coins sphériques de rayon r), centrée, quads ; step : pas des
    zones planes par axe ; deform(p) -> p déformé (coussins bombés, plis, cannelures)."""
    if not isinstance(step, (tuple, list)):
        step = (step, step, step)
    r = min(r, hx, hy, hz)
    a = (hx - r, hy - r, hz - r)
    h = (hx, hy, hz)
    S = [_samples(a[i], r, step[i], m) for i in range(3)]
    if flat0 is not None and a[0] > 1e-6:
        cor = [a[0] + r * math.tan(math.pi / 4 * k / m) for k in range(1, m + 1)]
        S[0] = [-c for c in reversed(cor)] + list(flat0) + cor
    mb = MB(weld=True)

    def P(q):
        c = [clamp(q[i], -a[i], a[i]) for i in range(3)]
        d = [q[i] - c[i] for i in range(3)]
        L = math.sqrt(d[0] ** 2 + d[1] ** 2 + d[2] ** 2)
        p = tuple(c[i] + d[i] / L * r for i in range(3)) if L > 1e-12 else tuple(q)
        return deform(p) if deform else p

    for k in range(3):
        i, j = (k + 1) % 3, (k + 2) % 3
        for s in (-1, 1):
            want = [0, 0, 0]
            want[k] = s
            grid = []
            for ui in S[i]:
                row = []
                for vj in S[j]:
                    q = [0, 0, 0]
                    q[k], q[i], q[j] = s * h[k], ui, vj
                    row.append(mb.add(P(q)))
                grid.append(row)
            for x in range(len(S[i]) - 1):
                for y in range(len(S[j]) - 1):
                    mb.face_o([grid[x][y], grid[x + 1][y], grid[x + 1][y + 1], grid[x][y + 1]], mat, want)
    return mb


def pillow(hx, hy, hz, top=0.0, bottom=0.0, front=0.0, back=0.0, side=0.0, extra=None):
    """déformation « coussin » : faces bombées (amplitude au centre), bords tenus par la couture."""
    def f(p):
        x, y, z = p
        u, v, w = clamp(x / hx, -1, 1), clamp(y / hy, -1, 1), clamp(z / hz, -1, 1)
        fx, fy, fz = 1 - u * u, 1 - v * v, 1 - w * w
        dy = (top if v > 0 else bottom) * fx * fz * v
        dz = (front if w > 0 else back) * fx * fy * w
        dx = side * fy * fz * u
        q = (x + dx, y + dy, z + dz)
        return extra(q, (u, v, w)) if extra else q
    return f


SEAM_STEP = 0.20   # pas des passepoils (budget triangles)
PIPE_SEG = 3


def seam(hx, hy, hz, r, axis=1, sign=1, step=None, deform=None):
    step = step or SEAM_STEP
    """ligne de couture (passepoil) à mi-arrondi autour de la face `axis` de rcube."""
    r = min(r, hx, hy, hz)
    a = [hx - r, hy - r, hz - r]
    i, j = (axis + 1) % 3, (axis + 2) % 3
    k = r * math.sqrt(0.5)
    c = sign * (a[axis] + k)
    ai, aj = a[i], a[j]
    pts2 = []
    corners = [(ai, aj, 0.0), (-ai, aj, 0.5), (-ai, -aj, 1.0), (ai, -aj, 1.5)]
    for n, (ci, cj, a0) in enumerate(corners):
        for t in range(5):
            ang = (a0 + t / 8) * math.pi
            pts2.append((ci + k * math.cos(ang), cj + k * math.sin(ang)))
        # côté droit jusqu'au coin suivant
        ni, nj, na = corners[(n + 1) % 4]
        sa = ((a0 + 0.5)) * math.pi
        p0 = (ci + k * math.cos(sa), cj + k * math.sin(sa))
        p1 = (ni + k * math.cos(sa), nj + k * math.sin(sa))
        L = math.hypot(p1[0] - p0[0], p1[1] - p0[1])
        ns = max(1, int(L / step))
        for t in range(1, ns):
            s = t / ns
            pts2.append((p0[0] + (p1[0] - p0[0]) * s, p0[1] + (p1[1] - p0[1]) * s))
    out = []
    for pi, pj in pts2:
        q = [0, 0, 0]
        q[axis], q[i], q[j] = c, pi, pj
        out.append(deform(tuple(q)) if deform else tuple(q))
    return out


def ring_tube(mb, pts, rad, seg=6, mat=0):
    """tube fermé (boucle) le long de pts."""
    P = [Vector(p) for p in pts]
    n = len(P)
    cen = sum(P, Vector()) / n
    rings = []
    for i in range(n):
        Tg = (P[(i + 1) % n] - P[i - 1]).normalized()
        N = P[i] - cen
        N = (N - Tg * N.dot(Tg))
        N = N.normalized() if N.length > 1e-9 else Vector((0, 1, 0))
        B = Tg.cross(N)
        rings.append([mb.add(tuple(P[i] + (N * math.cos(2 * math.pi * s / seg) + B * math.sin(2 * math.pi * s / seg)) * rad))
                      for s in range(seg)])
    for i in range(n):
        a, b = rings[i], rings[(i + 1) % n]
        for s in range(seg):
            t = (s + 1) % seg
            fi = mb.face([a[s], b[s], b[t], a[t]], mat)
            if fi is not None:
                q = [mb.v[x] for x in mb.f[fi]]
                c = sum((Vector(p) for p in q), Vector()) / 4
                mid = (P[i] + P[(i + 1) % n]) / 2
                from hull import _newell
                nn = Vector(_newell(q))
                if nn.dot(c - mid) < 0:
                    mb.f[fi] = list(reversed(mb.f[fi]))


def open_tube(mb, pts, rad, seg=8, mat=0):
    from hull import tube
    tube(mb, pts, rad, seg=seg, mat=mat, caps=True, round_caps=True)


def cushion(hx, hy, hz, r, top=0.012, bottom=0.004, front=0.006, back=0.004, side=0.005,
            piping=(1, -1), axis=1, pipe_r=0.0055, step=0.035, extra=None, m=3, flat0=None):
    """coussin rembourré : rcube bombé + passepoils sur les coutures (axis : face principale)."""
    df = pillow(hx, hy, hz, top, bottom, front, back, side, extra)
    if not isinstance(step, (tuple, list)):
        rr = min(r, hx, hy, hz)
        step = tuple(max(step, 2 * (h - rr) / 6) for h in (hx, hy, hz))
    mb = rcube(hx, hy, hz, r, step=step, deform=df, m=m if r >= 0.045 else 2, flat0=flat0)
    for sg in piping:
        ring_tube(mb, seam(hx, hy, hz, r, axis, sg, deform=df), pipe_r, seg=PIPE_SEG)
    return mb


def block(w, h, d, r, step=9):
    """bloc à congés (meuble, socle), centré."""
    return rcube(w / 2, h / 2, d / 2, r, step=step, m=2 if r < 0.05 else 3)


def blk(o, key, x0, x1, y0, y1, z0, z1, r, M=None):
    """bloc aligné sur les axes (bornes), dans l'objet o."""
    b = block(x1 - x0, y1 - y0, z1 - z0, r)
    Mt = T((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)
    o.put(b, (M @ Mt) if M is not None else Mt, key)


def prism(poly, y0, y1, mat=0):
    """prisme vertical sur un contour plan (x, z) dans le sens trigonométrique vu de dessus."""
    mb = MB()
    lo = [mb.add((x, y0, z)) for x, z in poly]
    hi = [mb.add((x, y1, z)) for x, z in poly]
    n = len(poly)
    cx = sum(p[0] for p in poly) / n
    cz = sum(p[1] for p in poly) / n
    area = sum(poly[i][0] * poly[(i + 1) % n][1] - poly[(i + 1) % n][0] * poly[i][1] for i in range(n))
    sg = 1.0 if area > 0 else -1.0
    for i in range(n):
        j = (i + 1) % n
        ex, ez = poly[j][0] - poly[i][0], poly[j][1] - poly[i][1]
        mb.face_o([lo[i], lo[j], hi[j], hi[i]], mat, (sg * ez, 0, -sg * ex))
    mb.face_o(list(hi), mat, (0, 1, 0))
    mb.face_o(list(lo), mat, (0, -1, 0))
    return mb


def rounded_poly(pts, rad, seg=5):
    """contour polygonal à coins arrondis (rad : rayon par sommet ou scalaire)."""
    n = len(pts)
    out = []
    for i in range(n):
        p0, p1, p2 = Vector(pts[i - 1]), Vector(pts[i]), Vector(pts[(i + 1) % n])
        r = rad[i] if isinstance(rad, (list, tuple)) else rad
        if r <= 0:
            out.append(tuple(p1))
            continue
        d0, d1 = (p0 - p1).normalized(), (p2 - p1).normalized()
        ang = math.acos(clamp(d0.dot(d1), -1, 1))
        t = r / math.tan(ang / 2)
        a, b = p1 + d0 * t, p1 + d1 * t
        bis = (d0 + d1).normalized()
        c = p1 + bis * (r / math.sin(ang / 2))
        va, vb = a - c, b - c
        A0 = math.atan2(va.y, va.x)
        A1 = math.atan2(vb.y, vb.x)
        dA = A1 - A0
        while dA > math.pi:
            dA -= 2 * math.pi
        while dA < -math.pi:
            dA += 2 * math.pi
        for k in range(seg + 1):
            A = A0 + dA * k / seg
            out.append((c.x + r * math.cos(A), c.y + r * math.sin(A)))
    return out


def ccw(poly):
    """sens trigonométrique vu de dessus (+y) : dans le plan (x, z) avec y haut, l'aire signée
    x->z doit être négative (z vers l'observateur en bas)."""
    s = sum(poly[i][0] * poly[(i + 1) % len(poly)][1] - poly[(i + 1) % len(poly)][0] * poly[i][1]
            for i in range(len(poly)))
    return poly if s < 0 else list(reversed(poly))


def lathe_mb(prof, seg=24, M=None, cap=True):
    mb = MB(weld=True)
    lathe(mb, prof, seg=seg, M=M, cap_top=cap)
    return mb


# ---------------------------------------------------------------------------
# canapé : un tronçon (repère local x le long, y haut depuis le sol, z de 0 = dos vers l'avant)
# ---------------------------------------------------------------------------




# ---------------------------------------------------------------------------
# formes organiques : balayage le long d'une courbe de plan, dalles souples, galets
# ---------------------------------------------------------------------------
class Path2:
    """courbe de plan (x, z) rééchantillonnée ; repère local (u le long, y haut, v vers N = (-Tz, Tx))."""

    def __init__(self, pts, radii=None, step=0.02, seg=12):
        if radii is not None:
            pts = _round_open(pts, radii, seg)
        P = [Vector(pts[0])]
        for a, b in zip(pts[:-1], pts[1:]):
            a, b = Vector(a), Vector(b)
            n = max(1, int(math.ceil((b - a).length / step)))
            for k in range(1, n + 1):
                P.append(a.lerp(b, k / n))
        Q = [P[0]]
        for p in P[1:]:
            if (p - Q[-1]).length > 1e-6:
                Q.append(p)
        self.P = Q
        self.S = [0.0]
        for a, b in zip(Q[:-1], Q[1:]):
            self.S.append(self.S[-1] + (b - a).length)
        self.L = self.S[-1]
        n = len(Q)
        self.T = []
        for i in range(n):
            t = (Q[min(i + 1, n - 1)] - Q[max(i - 1, 0)]).normalized()
            self.T.append(t)
        self.N = [Vector((-t.y, t.x)) for t in self.T]

    def frame(self, u):
        S = self.S
        if u <= 0:
            return self.P[0] + self.T[0] * u, self.N[0]
        if u >= self.L:
            return self.P[-1] + self.T[-1] * (u - self.L), self.N[-1]
        lo, hi = 0, len(S) - 1
        while hi - lo > 1:
            mid = (lo + hi) // 2
            if S[mid] <= u:
                lo = mid
            else:
                hi = mid
        t = (u - S[lo]) / (S[hi] - S[lo])
        p = self.P[lo].lerp(self.P[hi], t)
        nn = self.N[lo].lerp(self.N[hi], t).normalized()
        return p, nn

    def map(self, u, y, v):
        p, n = self.frame(u)
        return (p.x + n.x * v, y, p.y + n.y * v)


def _round_open(pts, radii, seg=12):
    """polyligne ouverte (x, z) aux sommets intérieurs arrondis (arc de cercle de rayon radii[i])."""
    out = [tuple(pts[0])]
    for i in range(1, len(pts) - 1):
        r = radii[i] if isinstance(radii, (list, tuple)) else radii
        p0, p1, p2 = Vector(pts[i - 1]), Vector(pts[i]), Vector(pts[i + 1])
        if r <= 0:
            out.append(tuple(p1))
            continue
        d0, d1 = (p0 - p1).normalized(), (p2 - p1).normalized()
        ang = math.acos(clamp(d0.dot(d1), -1, 1))
        if ang > math.pi - 1e-4:
            out.append(tuple(p1))
            continue
        t = r / math.tan(ang / 2)
        c = p1 + (d0 + d1).normalized() * (r / math.sin(ang / 2))
        a, b = p1 + d0 * t, p1 + d1 * t
        A0 = math.atan2((a - c).y, (a - c).x)
        A1 = math.atan2((b - c).y, (b - c).x)
        dA = A1 - A0
        while dA > math.pi:
            dA -= 2 * math.pi
        while dA < -math.pi:
            dA += 2 * math.pi
        for k in range(seg + 1):
            A = A0 + dA * k / seg
            out.append((c.x + r * math.cos(A), c.y + r * math.sin(A)))
    out.append(tuple(pts[-1]))
    return out


def warp(mb, fn):
    mb.v = [fn(p) for p in mb.v]
    return mb


def path_flat(path, cu, a, maxlen, dang=math.radians(6.0), fine=0.02):
    """échantillons adaptatifs (repère local, centrés sur cu) de la zone plane [-a, a] d'un bloc plié :
    serrés dans les courbes (déviation <= dang), espacés de maxlen au plus dans les droites."""
    if a <= 1e-6:
        return [0.0]
    out = [-a]
    _, n0 = path.frame(cu - a)
    last = -a
    nf = max(2, int(math.ceil(2 * a / fine)))
    for k in range(1, nf):
        x = -a + 2 * a * k / nf
        _, n = path.frame(cu + x)
        if n.dot(n0) < math.cos(dang) or x - last >= maxlen:
            out.append(x)
            last, n0 = x, n
    if a - last < 0.25 * min(maxlen, 2 * a):
        out.pop() if len(out) > 1 else None
    out.append(a)
    return out


def bent(path, u0, u1, y0, y1, v0, v1, r, kind='block', tilt=0.0, pivot=None, lean=0.0, taper=0.0,
         step_u=0.06, **kw):
    """rcube (bloc ou coussin) entre (u0..u1, y0..y1, v0..v1) puis plié le long de path.
    tilt : inclinaison (rad) dans le plan (y, v) autour de pivot (y, v) — haut vers l'arrière (v-) ;
    lean : recul du haut (galbe du dossier, m) ; taper : abaissement du haut aux extrémités (accoudoirs)."""
    hx, hy, hz = (u1 - u0) / 2, (y1 - y0) / 2, (v1 - v0) / 2
    cu, cy, cv = (u0 + u1) / 2, (y0 + y1) / 2, (v0 + v1) / 2
    if kind == 'block':
        rr = min(r, hx, hy, hz)
        fl = path_flat(path, cu, hx - rr, 0.09 if taper else 0.6, dang=math.radians(9.0 if taper else 10.0))
        mb = rcube(hx, hy, hz, r, step=(step_u, 9, 9), m=2, flat0=fl)
    else:
        rr = min(r, hx, hy, hz)
        st = (step_u, max(0.07, 2 * (hy - rr) / 4), max(0.07, 2 * (hz - rr) / 4))
        fl = path_flat(path, cu, hx - rr, 0.09 if taper else 0.25, dang=math.radians(9.0))
        mb = cushion(hx, hy, hz, r, step=st, flat0=fl, **kw)
    ct, sn = math.cos(tilt), math.sin(tilt)
    py, pv = pivot if pivot else (cy, cv)

    def fn(p):
        x, y, z = p
        if taper:
            w = (x / hx) ** 4 if hx > 0 else 0.0
            if y > -hy * 0.2:
                y = -hy * 0.2 + (y + hy * 0.2) * (1 - taper * w)
        if lean:
            f = (y + hy) / (2 * hy)
            z -= lean * f * f
        yy, vv = cy + y, cv + z
        if tilt:
            dy, dv = yy - py, vv - pv
            yy, vv = py + dy * ct + dv * sn, pv - dy * sn + dv * ct
        return path.map(cu + x, yy, vv)
    return warp(mb, fn)


def poly_area(poly):
    n = len(poly)
    return 0.5 * sum(poly[i][0] * poly[(i + 1) % n][1] - poly[(i + 1) % n][0] * poly[i][1] for i in range(n))


def offset_poly(poly, d):
    """décalage (d > 0 vers l'extérieur) par normales de sommet (contours lisses)."""
    n = len(poly)
    sg = 1.0 if poly_area(poly) > 0 else -1.0
    out = []
    for i in range(n):
        p0, p1, p2 = Vector(poly[i - 1]), Vector(poly[i]), Vector(poly[(i + 1) % n])
        e0, e1 = (p1 - p0).normalized(), (p2 - p1).normalized()
        n0 = Vector((e0.y, -e0.x)) * sg
        n1 = Vector((e1.y, -e1.x)) * sg
        m = (n0 + n1)
        m = m.normalized() if m.length > 1e-9 else n1
        c = max(0.35, m.dot(n1))
        q = p1 + m * (d / c)
        out.append((q.x, q.y))
    return out


def soft_slab(poly, y0, y1, r, seg=3, mat=0, crown=0.0):
    """dalle souple : contour plan quelconque, chants arrondis de rayon r (haut et bas), faces planes
    (crown : bombé du dessus au centre, m)."""
    mb = MB()
    r = min(r, (y1 - y0) / 2)
    rings = []
    prof = []
    for k in range(seg + 1):
        a = -math.pi / 2 + (math.pi / 2) * k / seg
        prof.append((r - r * math.cos(a), y0 + r + r * math.sin(a), a))
    for k in range(seg + 1):
        a = (math.pi / 2) * k / seg
        prof.append((r - r * math.cos(a), y1 - r + r * math.sin(a), a))
    sg = 1.0 if poly_area(poly) > 0 else -1.0
    for d, y, a in prof:
        ring = offset_poly(poly, -d) if d > 1e-7 else list(poly)
        rings.append([mb.add((x, y, z)) for x, z in ring])
    n = len(poly)
    for k in range(len(rings) - 1):
        a = prof[k][2]
        for i in range(n):
            j = (i + 1) % n
            e = Vector(poly[j]) - Vector(poly[i])
            no = Vector((e.y, -e.x)).normalized() * sg
            want = (no.x * math.cos(a), math.sin(a), no.y * math.cos(a))
            mb.face_o([rings[k][i], rings[k][j], rings[k + 1][j], rings[k + 1][i]], mat, want)
    mb.face_o(list(rings[0]), mat, (0, -1, 0))
    if crown:
        # dessus bombé : anneaux intérieurs concentriques
        prev = rings[-1]
        top = [(mb.v[i][0], mb.v[i][2]) for i in prev]
        cx = sum(p[0] for p in top) / n
        cz = sum(p[1] for p in top) / n
        for k in range(1, 4):
            s = 1 - k / 4
            ring = [(cx + (x - cx) * s, cz + (z - cz) * s) for x, z in top]
            h = crown * (1 - s * s)
            cur = [mb.add((x, y1 + h, z)) for x, z in ring]
            for i in range(n):
                j = (i + 1) % n
                mb.face_o([prev[i], prev[j], cur[j], cur[i]], mat, (0, 1, 0))
            prev = cur
        mb.face_o(list(prev), mat, (0, 1, 0))
    else:
        mb.face_o(list(rings[-1]), mat, (0, 1, 0))
    return mb


def pebble(cx, cz, a, b, n=2.6, seg=64, skew=0.0, rot=0.0):
    """contour de galet : super-ellipse (exposant n) légèrement dissymétrique."""
    pts = []
    for k in range(seg):
        t = 2 * math.pi * k / seg
        c, s = math.cos(t), math.sin(t)
        x = a * math.copysign(abs(c) ** (2 / n), c)
        z = b * math.copysign(abs(s) ** (2 / n), s) * (1 + skew * c)
        xr = x * math.cos(rot) - z * math.sin(rot)
        zr = x * math.sin(rot) + z * math.cos(rot)
        pts.append((cx + xr, cz + zr))
    return pts


def clip_poly(poly, axis, val, keep_greater):
    """Sutherland-Hodgman contre un demi-plan axe-aligné (axis 0 = x, 1 = z)."""
    out = []
    n = len(poly)
    ins = (lambda p: p[axis] >= val) if keep_greater else (lambda p: p[axis] <= val)
    for i in range(n):
        a, b = poly[i - 1], poly[i]
        ia, ib = ins(a), ins(b)
        if ib:
            if not ia:
                t = (val - a[axis]) / (b[axis] - a[axis])
                out.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))
            out.append(b)
        elif ia:
            t = (val - a[axis]) / (b[axis] - a[axis])
            out.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))
    return out


def soften_corners(poly, r, min_turn=math.radians(30), seg=4):
    """arrondit les seuls sommets vifs (déviation > min_turn) d'un contour."""
    n = len(poly)
    rad = []
    for i in range(n):
        p0, p1, p2 = Vector(poly[i - 1]), Vector(poly[i]), Vector(poly[(i + 1) % n])
        e0, e1 = (p1 - p0), (p2 - p1)
        if e0.length < 1e-6 or e1.length < 1e-6:
            rad.append(0)
            continue
        turn = math.acos(clamp(e0.normalized().dot(e1.normalized()), -1, 1))
        rad.append(min(r, 0.45 * e0.length, 0.45 * e1.length) if turn > min_turn else 0)
    return rounded_poly(poly, rad, seg=seg)


def stadium(x0, x1, z0, z1, r0, r1=None, seg=8):
    """rectangle aux coins arrondis : r0 côté z0, r1 côté z1."""
    r1 = r0 if r1 is None else r1
    return rounded_poly([(x0, z0), (x1, z0), (x1, z1), (x0, z1)], [r0, r0, r1, r1], seg=seg)
def _orient(prof):
    n = len(prof)
    return sum(prof[i][0] * prof[(i + 1) % n][1] - prof[(i + 1) % n][0] * prof[i][1] for i in range(n))


def _out2(prof, i):
    """normale extérieure (x, y, 0) de l'arête i d'un profil plan fermé (x, y)."""
    n = len(prof)
    (x0, y0), (x1, y1) = prof[i], prof[(i + 1) % n]
    sg = 1.0 if _orient(prof) > 0 else -1.0
    return (sg * (y1 - y0), -sg * (x1 - x0), 0.0)


def loft_z(profs, zs, mat=0):
    """loft de profils fermés (x, y) le long de z (un profil par z), extrémités fermées."""
    mb = MB()
    idx = [[mb.add((x, y, z)) for x, y in pr] for pr, z in zip(profs, zs)]
    n = len(profs[0])
    for i in range(len(zs) - 1):
        for j in range(n):
            k = (j + 1) % n
            mb.face_o([idx[i][j], idx[i][k], idx[i + 1][k], idx[i + 1][j]], mat, _out2(profs[i], j))
    mb.face_o(list(idx[0]), mat, (0, 0, -1))
    mb.face_o(list(idx[-1]), mat, (0, 0, 1))
    return mb




# ---------------------------------------------------------------------------
# canapé balayé le long d'une courbe de plan (dos à v = 0, assise vers +v)
# ---------------------------------------------------------------------------
def curved_sofa(fr, cu, path, D, *, y0, frame_key, cush_key, plinth=True, back_h=0.80, seat=(0.27, 0.43),
                arms=(True, True), arm_w=0.22, n_seat=4, back_t=0.17, pillows=(), split=None, back_cush=True):
    L = path.L
    if plinth:
        fr.put(bent(path, 0.14, L - 0.14, y0, y0 + 0.075, 0.07, D - 0.08, 0.025, step_u=0.12), None, 'metalDark')
    fr.put(bent(path, 0.0, L, y0 + 0.07, y0 + seat[0] + 0.005, 0.0, D, 0.07, step_u=0.11), None, frame_key)
    fr.put(bent(path, 0.0, L, y0 + 0.07, y0 + back_h, 0.0, back_t, 0.075, lean=0.05, step_u=0.09), None, frame_key)
    ua, ub = 0.0, L
    if arms[0]:
        fr.put(bent(path, 0.0, arm_w, y0 + 0.07, y0 + 0.60, 0.0, D, 0.10, step_u=0.04), None, frame_key)
        ua = arm_w
    if arms[1]:
        fr.put(bent(path, L - arm_w, L, y0 + 0.07, y0 + 0.60, 0.0, D, 0.10, step_u=0.04), None, frame_key)
        ub = L - arm_w
    g = 0.006
    cuts = split or [ua + (ub - ua) * k / n_seat for k in range(n_seat + 1)]
    for k in range(len(cuts) - 1):
        a, b = cuts[k] + g, cuts[k + 1] - g
        cu.put(bent(path, a, b, y0 + seat[0], y0 + seat[1], back_t - 0.01, D - 0.012, 0.05, kind='cushion',
                    top=0.013 - 0.003 * (k % 2), front=0.008, side=0.004, back=0.0, bottom=0.0, step_u=0.10, m=2,
                    piping=(1,)),
               None, cush_key)
        if back_cush:
            yb = y0 + seat[1] - 0.025
            vb = back_t + 0.03
            cu.put(bent(path, a, b, yb, yb + 0.42, vb, vb + 0.16, 0.06, kind='cushion', tilt=math.radians(10),
                        pivot=(yb, vb + 0.16), axis=2, top=0.006, front=0.018, back=0.004, side=0.004, bottom=0.0,
                        step_u=0.10, m=2, piping=(1,)),
                   None, cush_key)
    for (u, key) in pillows:
        yb = y0 + seat[1] + 0.02
        vb = back_t + 0.20
        cu.put(bent(path, u - 0.22, u + 0.22, yb, yb + 0.44, vb, vb + 0.13, 0.065, kind='cushion',
                    tilt=math.radians(16), pivot=(yb, vb + 0.13), axis=2, top=0.01, bottom=0.01, front=0.035,
                    back=0.03, side=0.01, step_u=0.05, piping=(1,)), None, key)

def tub_chair(fr, cu, cx, cz, face, y0, up='upholsteryInterior', base='metalDark'):
    """fauteuil « tub » pivotant : coque cintrée (accoudoirs descendants), assise ronde, coussin de dos."""
    R = 0.44
    pts = []
    c0 = face + math.pi
    for k in range(41):
        th = c0 - 2.05 + 4.1 * k / 40
        pts.append((cx + R * math.cos(th), cz + R * math.sin(th)))
    path = Path2(pts, step=0.02)
    fr.put(lathe_mb([(0.0, 0.0), (0.26, 0.0), (0.265, 0.006), (0.25, 0.014), (0.07, 0.03), (0.05, 0.08),
                     (0.0, 0.08)], seg=32), T(cx, y0, cz), base)
    prof = [(0.0, 0.07)]
    for k in range(7):
        a = -math.pi / 2 + math.pi * k / 6
        prof.append((0.33 + 0.045 * math.cos(a), 0.175 + 0.105 * math.sin(a)))
    prof.append((0.0, 0.28))
    fr.put(lathe_mb(prof, seg=28), T(cx, y0, cz), up)
    fr.put(bent(path, 0.0, path.L, y0 + 0.07, y0 + 0.74, 0.0, 0.12, 0.055, taper=0.36, lean=0.04, step_u=0.04),
           None, up)
    # assise ronde bombée + passepoil
    prof = [(0.0, 0.0)]
    for k in range(9):
        a = -math.pi / 2 + math.pi * k / 8
        prof.append((0.31 + 0.04 * math.cos(a), 0.065 + 0.065 * math.sin(a) + (0.008 if a > 0 else 0)))
    prof.append((0.15, 0.142))
    prof.append((0.0, 0.145))
    cu.put(lathe_mb(prof, seg=28), T(cx + 0.03 * math.cos(face), y0 + 0.28, cz + 0.03 * math.sin(face)), up)
    rt = MB()
    ring_tube(rt, [(cx + 0.03 * math.cos(face) + 0.348 * math.cos(2 * math.pi * k / 28), y0 + 0.28 + 0.09,
                    cz + 0.03 * math.sin(face) + 0.348 * math.sin(2 * math.pi * k / 28)) for k in range(28)], 0.005, seg=3)
    cu.put(rt, None, up)
    cu.put(bent(path, 0.30, path.L - 0.30, y0 + 0.40, y0 + 0.70, 0.12, 0.24, 0.05, kind='cushion', axis=2,
                tilt=math.radians(8), pivot=(y0 + 0.40, 0.24), front=0.016, top=0.005, side=0.004, step_u=0.05),
           None, up)
def dining_chair(o, cx, cz, face, FY, up="upholsteryInterior", leg="metalDark"):
    """chaise rembourrée à dossier cintré enveloppant (assise 0,46), piètement noir fuselé."""

    from hull import tube
    cf, sf = math.cos(face), math.sin(face)

    def W(fx, fy, fz):   # local : fz vers l'avant (direction face), fx à droite
        return (cx + fz * cf - fx * sf, fy, cz + fz * sf + fx * cf)
    for sx in (-1, 1):
        for sz in (-1, 1):
            lg = MB()
            tube(lg, [W(sx * 0.20, FY, sz * 0.20), W(sx * 0.17, FY + 0.36, sz * 0.17)],
                 lambda i: 0.010 if i == 0 else 0.014, seg=8, caps=True)
            o.put(lg, None, leg)
    o.put(soft_slab(pebble(cx, cz, 0.23, 0.23, n=3.2, seg=24), FY + 0.35, FY + 0.38, 0.012, seg=2), None, leg)
    o.put(soft_slab(pebble(cx + 0.005 * cf, cz + 0.005 * sf, 0.245, 0.24, n=3.4, seg=28), FY + 0.375, FY + 0.44, 0.028, seg=3,
                    crown=0.010), None, up)
    pts = []
    R = 0.27
    for k in range(25):
        th = face + math.pi - 1.15 + 2.3 * k / 24
        pts.append((cx + R * math.cos(th) + 0.03 * cf, cz + R * math.sin(th) + 0.03 * sf))
    p = Path2(pts, step=0.02)
    o.put(bent(p, 0.0, p.L, FY + 0.41, FY + 0.86, 0.0, 0.055, 0.027, taper=0.25, lean=0.03, step_u=0.04), None, up)
def flutes(pitch, depth, width, axis=0, faces=(1,)):
    """cannelures (surpiqûres en canaux) sur une face d'un coussin : creux gaussiens tous les `pitch`."""
    def ex(q, uvw):
        x, y, z = q
        c = (x, y, z)[axis]
        d = (c / pitch) - math.floor(c / pitch + 0.5)
        g = math.exp(-((d * pitch) / width) ** 2)
        out = list(q)
        for fa in faces:
            s = 1 if fa > 0 else -1
            ax = abs(fa) - 1 if abs(fa) > 0 else 1
            # fa : 2 -> y+, 3 -> z+
            k = {2: 1, 3: 2}[abs(fa)]
            wv = max(0.0, uvw[k] * s)
            out[k] -= s * depth * g * wv ** 3
        return tuple(out)
    return ex


def helm_seat(o, M, up='upholsteryInterior'):
    """siège pilote (repère local : avant +z, sol y = 0), assise 0,62."""
    # piétement : platine, fût, repose-pieds
    o.put(lathe_mb([(0.0, 0.0), (0.24, 0.0), (0.245, 0.008), (0.235, 0.016), (0.07, 0.03), (0.055, 0.05),
                    (0.055, 0.40), (0.07, 0.43), (0.0, 0.43)], seg=24), M, 'metalDark')
    rg = MB()
    ring_tube(rg, [(0.2 * math.cos(2 * math.pi * k / 24), 0.24, 0.2 * math.sin(2 * math.pi * k / 24)) for k in range(24)],
              0.011, seg=6)
    o.put(rg, M, 'chrome')
    # coque noire sous l'assise
    blk(o, 'metalDark', -0.27, 0.27, 0.43, 0.50, -0.25, 0.27, 0.03, M)
    # assise rembourrée (passepoil) + bourrelets latéraux
    c = cushion(0.19, 0.05, 0.25, 0.04, top=0.012, front=0.008, side=0.004, piping=(1,), step=0.12, m=2)
    o.put(c, M @ T(0.0, 0.555, 0.01), up)
    for sx in (-1, 1):
        b = cushion(0.045, 0.07, 0.26, 0.04, top=0.008, side=0.004, step=0.10, piping=(1,))
        o.put(b, M @ T(sx * 0.235, 0.57, 0.01) @ RZ(sx * 0.12), up)
    # dossier : coque + canaux cousus, incliné de 14°
    tl = math.radians(14)
    Mb = M @ T(0.0, 0.62, -0.20) @ RX(-tl)
    blk(o, 'metalDark', -0.26, 0.26, 0.0, 0.62, -0.06, -0.01, 0.025, Mb)
    c = cushion(0.19, 0.28, 0.045, 0.04, top=0.0, front=0.014, side=0.004, piping=(1,), step=0.14, axis=2, m=2)
    o.put(c, Mb @ T(0.0, 0.31, 0.035), up)
    for sx in (-1, 1):
        b = cushion(0.045, 0.27, 0.07, 0.04, front=0.008, side=0.004, step=0.10, axis=2, piping=(1,))
        o.put(b, Mb @ T(sx * 0.225, 0.31, 0.03) @ RY(-sx * 0.25), up)
    # appui-tête
    c = cushion(0.15, 0.08, 0.06, 0.05, top=0.006, front=0.014, step=0.09, axis=2, piping=(1,))
    o.put(c, Mb @ T(0.0, 0.72, 0.01), up)
    blk(o, 'chrome', -0.07, -0.055, 0.60, 0.67, -0.03, -0.015, 0.006, Mb)
    blk(o, 'chrome', 0.055, 0.07, 0.60, 0.67, -0.03, -0.015, 0.006, Mb)
    # accoudoirs
    for sx in (-1, 1):
        blk(o, 'metalDark', sx * 0.29 - 0.02, sx * 0.29 + 0.02, 0.50, 0.80, -0.20, -0.14, 0.015, M)
        c = cushion(0.035, 0.025, 0.17, 0.024, top=0.004, step=0.12, piping=(1,))
        o.put(c, M @ T(sx * 0.29, 0.83, -0.06), up)
def finalize(ctx, o):
    if not o.mb.f:
        return None
    ob = make_obj(ctx, o.name, o.mb, o.mats, smooth=True)
    ctx.link(ob, o.group)
    if o.bevel:
        add_bevel(ob, o.bevel, seg=3, angle=35, harden=False)
    if o.wn or o.bevel:
        add_wn(ob)
    return ob


# ===========================================================================
# SILLAGE 29 — implantation
# ===========================================================================
def salon_outline():
    try:
        import s29_super as _s
        so = getattr(_s, 'SALON_OUTLINE', None)
        if callable(so):
            so = so()
        if so and len(so) > 8 and len(so[0]) == 2:
            return [(float(a), float(b)) for a, b in so]
    except Exception:
        pass
    return rounded_poly([(SALON_X0, -SALON_ZH), (SALON_X1, -SALON_ZH), (SALON_X1, SALON_ZH), (SALON_X0, SALON_ZH)],
                        [1.0, 2.0, 2.0, 1.0], seg=16)


# --- composants génériques -------------------------------------------------
def console(o, path, y0, D, H, body, top, plinth='metalDark'):
    """console cintrée balayée le long de path (v = 0 côté vitrage, v = D côté pilote)."""
    Lp = path.L
    o.put(bent(path, 0.05, Lp - 0.05, y0, y0 + 0.08, 0.04, D - 0.07, 0.02, step_u=0.10), None, plinth)
    o.put(bent(path, 0.0, Lp, y0 + 0.075, y0 + H - 0.035, 0.0, D, 0.06, step_u=0.06), None, body)
    o.put(bent(path, -0.015, Lp + 0.015, y0 + H - 0.04, y0 + H, -0.01, D + 0.035, 0.018, step_u=0.06), None, top)


def screen_pod(o, scr, xc, yc, zc, tilt, n=3, pitch=0.60, hw=0.265, hh=0.155, hz=None):
    """nacelle d'écrans (face vers -x = pilote, inclinée de tilt) ; écrans 'screens' UV 0..1 chacun."""
    from hull import _newell
    hxp, y0p, y1p = 0.05, -hh - 0.035, hh + 0.045
    hz = hz or (pitch * (n - 1) / 2 + hw + 0.06)
    Mb = T(xc, yc, zc) @ RZ(-tilt)
    blk(o, 'metalDark', -hxp, hxp, y0p, y1p, -hz, hz, 0.04, Mb)
    smb = MB()
    for k in range(n):
        dz = (k - (n - 1) / 2) * pitch
        Ms = Mb @ T(-hxp - 0.0006, 0.005, dz)
        P = [(0, -hh, -hw), (0, -hh, hw), (0, hh, hw), (0, hh, -hw)]
        ids = [smb.add(tuple(Ms @ Vector(q))) for q in P]
        fi = smb.face(ids, 0, uv=[(0, 0), (1, 0), (1, 1), (0, 1)])
        nrm = Mb.to_3x3() @ Vector((-1, 0, 0))
        if Vector(_newell([smb.v[i] for i in smb.f[fi]])).dot(nrm) < 0:
            smb.f[fi] = list(reversed(smb.f[fi]))
            smb.fuv[fi] = list(reversed(smb.fuv[fi]))
    scr.put(smb, None, 'screens')
    return Mb, hz


def oval_table(o, cx, cz, a, b, y0, ty, top_key, base_key, rot=0.0, n=2.4, npost=2, decor=None):
    """table ovale / galet : plateau à chant tendu, ceinture en retrait, pieds-tulipes noirs."""
    o.put(soft_slab(pebble(cx, cz, a, b, n=n, rot=rot), y0 + ty - 0.045, y0 + ty, 0.018, seg=3), None, top_key)
    o.put(soft_slab(pebble(cx, cz, a * 0.80, b * 0.55, n=n, rot=rot), y0 + ty - 0.085, y0 + ty - 0.04, 0.012, seg=2),
          None, base_key)
    ca, sa = math.cos(rot), math.sin(rot)
    for k in range(npost):
        lng = max(a, b)
        d = 0.0 if npost == 1 else (-1 + 2 * k / (npost - 1)) * lng * 0.48
        if b > a:
            px, pz = cx - d * sa, cz + d * ca
        else:
            px, pz = cx + d * ca, cz + d * sa
        rb = min(0.26, min(a, b) * 0.62)
        o.put(lathe_mb([(0.0, 0.0), (rb, 0.0), (rb + 0.005, 0.006), (rb - 0.01, 0.014), (0.06, 0.03), (0.04, 0.08),
                        (0.04, ty - 0.10), (0.12, ty - 0.08), (0.0, ty - 0.08)], seg=32), T(px, y0, pz), base_key)


def bowl(o, x, y, z, r=0.16, key='woodInterior'):
    s = r / 0.16
    o.put(lathe_mb([(0.0, 0.0), (0.06 * s, 0.0), (0.12 * s, 0.03 * s), (0.16 * s, 0.07 * s), (0.155 * s, 0.075 * s),
                    (0.11 * s, 0.035 * s), (0.0, 0.03 * s)], seg=36, cap=False), T(x, y, z), key)


def vase(o, x, y, z, h=0.38, key='metalDark'):
    s = h / 0.38
    o.put(lathe_mb([(0.0, 0.0), (0.06 * s, 0.0), (0.085 * s, 0.08 * s), (0.09 * s, 0.16 * s), (0.06 * s, 0.30 * s),
                    (0.035 * s, 0.36 * s), (0.04 * s, 0.38 * s), (0.0, 0.38 * s)], seg=32), T(x, y, z), key)


def stool(st, x, z, y0, seat_h, up, frame='metalDark', ring='chrome', back_dir=None):
    """tabouret de bar : platine galet, fût, repose-pieds annulaire, assise ronde bombée + passepoil."""
    st.put(lathe_mb([(0.0, 0.0), (0.20, 0.0), (0.205, 0.006), (0.20, 0.014), (0.05, 0.022), (0.022, 0.04),
                     (0.022, seat_h - 0.10), (0.05, seat_h - 0.08), (0.16, seat_h - 0.06), (0.0, seat_h - 0.06)],
                    seg=24), T(x, y0, z), frame)
    yr = y0 + seat_h * 0.38
    rg = MB()
    ring_tube(rg, [(x + 0.17 * math.cos(2 * math.pi * k / 24), yr, z + 0.17 * math.sin(2 * math.pi * k / 24))
                   for k in range(24)], 0.009, seg=6)
    st.put(rg, None, ring)
    for k in range(3):
        a = 2 * math.pi * k / 3 + 0.5
        spk = MB()
        tube(spk, [(x + 0.02 * math.cos(a), yr, z + 0.02 * math.sin(a)),
                   (x + 0.165 * math.cos(a), yr, z + 0.165 * math.sin(a))], 0.006, seg=6)
        st.put(spk, None, ring)
    prof = [(0.0, 0.0)]
    R, Hh = 0.20, 0.075
    for k in range(9):
        a = -math.pi / 2 + math.pi * k / 8
        prof.append((R - 0.03 + 0.03 * math.cos(a), Hh / 2 + Hh / 2 * math.sin(a)))
    prof.append((0.0, Hh + 0.01))
    ys = y0 + seat_h - 0.065
    st.put(lathe_mb(prof, seg=28), T(x, ys, z), up)
    pr = MB()
    ring_tube(pr, [(x + (R - 0.004) * math.cos(2 * math.pi * k / 28), ys + Hh * 0.86,
                    z + (R - 0.004) * math.sin(2 * math.pi * k / 28)) for k in range(28)], 0.005, seg=3)
    st.put(pr, None, up)
    if back_dir is not None:          # petit dossier cintré, côté back_dir (angle de plan)
        pts = [(x + 0.19 * math.cos(a), z + 0.19 * math.sin(a))
               for a in [back_dir - 0.8 + 1.6 * t / 12 for t in range(13)]]
        pth = Path2(pts, step=0.02)
        st.put(bent(pth, 0.0, pth.L, ys + 0.085, ys + 0.20, -0.012, 0.012, 0.012, step_u=0.03), None, up)


def credenza(o, x0, x1, z0, z1, y0, H, body, top, plinth='metalDark', r_lo=0.22, r_hi=0.22, grooves_z=None):
    """meuble bas en plan « stade » : socle noir en retrait, corps, dessus débordant, joints de portes."""
    o.put(soft_slab(stadium(x0 + 0.06, x1 - 0.06, z0 + 0.04, z1 - 0.04, max(0.02, r_lo - 0.05),
                            max(0.02, r_hi - 0.05)), y0, y0 + 0.075, 0.01, seg=2), None, plinth)
    o.put(soft_slab(stadium(x0, x1, z0, z1, r_lo, r_hi), y0 + 0.07, y0 + H - 0.025, 0.02, seg=3), None, body)
    o.put(soft_slab(stadium(x0 - 0.012, x1 + 0.012, z0 - 0.015, z1 + 0.015, r_lo + 0.012, r_hi + 0.012),
                    y0 + H - 0.03, y0 + H, 0.012, seg=3), None, top)
    if grooves_z is not None:
        nd = max(2, int(round((x1 - x0 - 0.44) / 0.55)))
        for k in range(1, nd):
            gx = x0 + 0.22 + (x1 - x0 - 0.44) * k / nd
            blk(o, 'metalDark', gx - 0.003, gx + 0.003, y0 + 0.10, y0 + H - 0.05, grooves_z - 0.0025,
                grooves_z + 0.0025, 0.0015)


def sunpad(base, cu, Lx, W, y0, M, H=0.24, nb=2, raised=(True, True), ang=math.radians(45), r_head=0.35,
           r_foot=0.9, base_key='superstructure', ue='upholsteryExterior'):
    """bain de soleil : repère local x 0 (tête) -> Lx (pieds), z ±W/2, sol y = 0 ; M : placement monde
    (translation incluant y0). Socle laqué au contour arrondi, nb matelas, dossiers relevables, coussins de tête."""
    ZH = W / 2
    X0, X1 = 0.0, Lx
    outline = rounded_poly([(X0, -ZH), (X1, -ZH), (X1, ZH), (X0, ZH)], [r_head, r_foot, r_foot, r_head], seg=14)
    base.put(soft_slab(offset_poly(outline, -0.05), 0.001, 0.08, 0.01, seg=2), M, 'metalDark')
    base.put(soft_slab(outline, 0.07, H, 0.05, seg=4), M, base_key)
    XH = min(0.75, Lx * 0.32)
    yb = H
    pad = offset_poly(outline, -0.025)
    w = W / nb
    g = 0.007
    for k in range(nb):
        za, zb = -ZH + w * k + g, -ZH + w * (k + 1) - g
        band = clip_poly(clip_poly(pad, 1, za, True), 1, zb, False)
        main = soften_corners(clip_poly(band, 0, XH + g, True), 0.05)
        cu.put(soft_slab(main, yb, yb + 0.12, 0.05, seg=4, crown=0.012), M, ue)
        rest = soften_corners(clip_poly(band, 0, XH - g, False), 0.05)
        a = ang if raised[k] else 0.0
        Mh = M @ T(XH, yb, 0.0) @ RZ(-a) @ T(-XH, -yb, 0.0)
        lift = 0.014 if raised[k] else 0.0
        cu.put(soft_slab(rest, yb + lift, yb + lift + 0.10, 0.045, seg=4, crown=0.010), Mh, ue)
        zc = (za + zb) / 2
        if raised[k]:
            base.put(soft_slab(offset_poly(rest, -0.04), yb, yb + 0.014, 0.004, seg=1), Mh, 'metalDark')
            for dz in (-w / 2 + 0.14, w / 2 - 0.14):
                stt = MB()
                p_top = T(XH, yb, 0.0) @ RZ(-a) @ T(-XH, -yb, 0.0) @ Vector((XH * 0.38, yb, zc + dz))
                tube(stt, [(XH * 0.20, yb + 0.002, zc + dz), tuple(p_top)], 0.012, seg=8, caps=True,
                     round_caps=True)
                base.put(stt, M, 'metalDark')
        hc = cushion(min(0.32, w / 2 - 0.12), 0.07, 0.10, 0.07, top=0.025, bottom=0.008, front=0.01, back=0.01,
                     step=0.05)
        cu.put(hc, Mh @ T(0.22, yb + lift + 0.10 + 0.068, zc) @ RY(math.pi / 2), ue)


def winch(o, x, y0, z, h=0.20, r=0.105):
    """winch chrome self-tailing (embase noire, tambour, mâchoire, chapeau)."""
    o.put(lathe_mb([(0.0, 0.0), (r + 0.035, 0.0), (r + 0.035, 0.012), (r + 0.01, 0.025), (0.0, 0.025)], seg=32),
          T(x, y0, z), 'metalDark')
    prof = [(0.0, 0.02), (r + 0.01, 0.02), (r + 0.015, 0.04), (r, 0.06), (r * 0.86, h * 0.62), (r * 0.90, h * 0.66),
            (r * 1.02, h * 0.70), (r * 1.02, h * 0.80), (r * 0.80, h * 0.84), (r * 0.62, h * 0.96), (r * 0.45, h),
            (0.0, h)]
    o.put(lathe_mb(prof, seg=36), T(x, y0, z), 'chrome')
    o.put(lathe_mb([(0.0, 0.0), (0.026, 0.0), (0.026, 0.012), (0.0, 0.012)], seg=12), T(x, y0 + h, z), 'metalDark')


def wheel(o, C, normal, R=0.32, rim=0.017, spokes=5, rim_key='chrome', hub_key='metalDark', cover=None):
    """barre à roue : jante (gainée si cover), rayons, moyeu ; plan perpendiculaire à normal."""
    n = Vector(normal).normalized()
    up = Vector((0, 1, 0))
    a = (up - n * up.dot(n)).normalized()
    b = n.cross(a)
    pts = [tuple(C + (a * math.cos(2 * math.pi * k / 56) + b * math.sin(2 * math.pi * k / 56)) * R) for k in range(56)]
    w = MB()
    ring_tube(w, pts, rim, seg=8)
    o.put(w, None, cover or rim_key)
    for k in range(spokes):
        t = 2 * math.pi * k / spokes + math.pi / 2
        d = a * math.cos(t) + b * math.sin(t)
        sp = MB()
        tube(sp, [tuple(C + d * 0.055), tuple(C + d * (R - rim * 0.6))], 0.009, seg=8)
        o.put(sp, None, rim_key)
    hb = MB()
    tube(hb, [tuple(C - n * 0.03), tuple(C + n * 0.05)], 0.055, seg=20, caps=True, round_caps=True)
    o.put(hb, None, hub_key)


# --- SALON -----------------------------------------------------------------
def build_salon_floor(ctx, objs):
    o = Obj('int_floor', 'interior', wn=True)
    try:      # face intérieure de l'allège publiée par s29_super : le plancher passe 2 cm dessous
        import s29_super as _s
        fl = offset_poly([(float(a), float(b)) for a, b in _s.SALON_INNER], 0.02)
    except Exception:
        fl = offset_poly(salon_outline(), -0.06)
    o.put(prism(fl, FY - 0.06, FY), None, 'interiorFloor')
    objs.append(o)
    rg = Obj('int_rug', 'interior', wn=True)
    rx0, rx1, rz0, rz1 = 0.45, 3.75, -3.75, 0.15
    rg.put(soft_slab(stadium(rx0, rx1, rz0, rz1, 0.55, seg=10), FY + 0.001, FY + 0.011, 0.004, seg=2), None,
           'upholsteryInterior')
    e = 0.07
    rg.put(soft_slab(stadium(rx0 + e, rx1 - e, rz0 + e, rz1 - e, 0.48, seg=10), FY + 0.002, FY + 0.013, 0.004,
                     seg=2), None, 'upholsteryExterior')
    objs.append(rg)


def build_salon_lounge(ctx, objs):
    fr = Obj('int_sofa_frame', 'interior', wn=True)
    cu = Obj('int_sofa_cushions', 'interior', wn=False)
    up = 'upholsteryInterior'
    XA, XF, ZW, ZE = 0.0, 4.2, -4.55, -1.35
    path = Path2([(XA, ZE), (XA, ZW), (XF, ZW), (XF, ZE)], radii=[0, 1.35, 1.35, 0], step=0.02, seg=24)
    Lp = path.L
    curved_sofa(fr, cu, path, 0.95, y0=FY, frame_key=up, cush_key=up, n_seat=7,
                pillows=((Lp * 0.26, 'upholsteryExterior'), (Lp * 0.74, 'upholsteryExterior'), (Lp * 0.5 + 0.4, up),
                         (Lp * 0.5 - 0.45, 'upholsteryExterior')))
    for xc in (1.45, 2.75):
        tub_chair(fr, cu, xc, -0.55, -math.pi / 2, FY + 0.013)
    objs += [fr, cu]
    tb = Obj('int_coffeeTable', 'interior', wn=True)
    cx, cz = 2.1, -2.55
    tb.put(soft_slab(pebble(cx, cz, 0.78, 0.50, n=2.5, skew=0.05), FY + 0.355, FY + 0.40, 0.02, seg=3), None,
           'woodInterior')
    tb.put(soft_slab(pebble(cx + 0.03, cz, 0.56, 0.31, n=2.3, skew=0.05), FY + 0.013, FY + 0.36, 0.035, seg=3),
           None, 'metalDark')
    bowl(tb, cx + 0.30, FY + 0.40, cz + 0.05)
    tb.put(soft_slab(pebble(cx - 0.28, cz - 0.04, 0.17, 0.12, n=2.2), FY + 0.40, FY + 0.43, 0.012, seg=2), None,
           'metalDark')
    # petite table d'appoint galet entre les fauteuils
    tb.put(soft_slab(pebble(2.1, -0.35, 0.20, 0.20, n=2.2), FY + 0.48, FY + 0.51, 0.012, seg=2), None, 'woodInterior')
    tb.put(lathe_mb([(0.0, 0.0), (0.16, 0.0), (0.16, 0.012), (0.03, 0.02), (0.025, 0.48), (0.0, 0.48)], seg=24),
           T(2.1, FY + 0.013, -0.35), 'metalDark')
    objs.append(tb)
    # crédence basse sous le pare-brise bâbord (rangements)
    cr = Obj('int_credenzaFwd', 'interior', wn=True)
    credenza(cr, 4.62, 5.45, -3.55, -0.75, FY, 0.55, 'woodInterior', 'metalDark', r_lo=0.30, r_hi=0.30)
    vase(cr, 5.05, FY + 0.55, -1.2, h=0.30)
    bowl(cr, 5.05, FY + 0.55, -2.6, r=0.18)
    objs.append(cr)


def build_galley(ctx, objs):
    o = Obj('int_galley', 'interior', wn=True)
    sl = Obj('int_galleySlabs', 'interior', wn=True)
    H = 0.92
    x0, x1, zb, zf = -4.30, -1.20, -4.78, -4.12
    sl.put(soft_slab(stadium(x0 + 0.05, x1 - 0.05, zb + 0.03, zf - 0.05, 0.02, 0.22), FY, FY + 0.08, 0.01, seg=2),
           None, 'metalDark')
    sl.put(soft_slab(stadium(x0, x1, zb, zf, 0.02, 0.28), FY + 0.075, FY + H - 0.03, 0.02, seg=3), None,
           'woodInterior')
    sl.put(soft_slab(stadium(x0 - 0.01, x1 + 0.01, zb, zf + 0.02, 0.02, 0.30), FY + H - 0.03, FY + H, 0.012, seg=3),
           None, 'metalDark')
    for gx in (-3.70, -3.10, -2.50, -1.90):
        blk(o, 'metalDark', gx - 0.003, gx + 0.003, FY + 0.10, FY + H - 0.05, zf - 0.0025, zf + 0.0025, 0.0015)
    blk(o, 'metalDark', x0 + 0.25, x1 - 0.25, FY + H - 0.065, FY + H - 0.035, zf - 0.02, zf + 0.001, 0.004)
    sx, sz = -3.55, -4.45
    blk(o, 'chrome', sx - 0.30, sx + 0.30, FY + H - 0.002, FY + H + 0.002, sz - 0.19, sz + 0.19, 0.05)
    blk(o, 'metalDark', sx - 0.27, sx + 0.27, FY + H - 0.0015, FY + H + 0.0025, sz - 0.16, sz + 0.16, 0.045)
    fau = MB()
    pth = [(sx, FY + H, sz - 0.26)]
    for k in range(9):
        a = math.pi * k / 8
        pth.append((sx, FY + H + 0.22 + 0.10 * math.sin(a), sz - 0.26 + 0.10 * (1 - math.cos(a))))
    pth.append((sx, FY + H + 0.17, sz - 0.06))
    tube(fau, pth, 0.011, seg=10, caps=True, round_caps=True)
    o.put(fau, None, 'chrome')
    o.put(lathe_mb([(0.0, 0.0), (0.025, 0.0), (0.025, 0.04), (0.018, 0.06), (0.0, 0.06)], seg=16),
          T(sx, FY + H, pth[0][2]), 'chrome')
    sl.put(soft_slab(stadium(-2.55, -1.75, -4.62, -4.25, 0.06), FY + H, FY + H + 0.006, 0.003, seg=1), None,
           'metalDark')
    # îlot-bar « stade »
    ix0, ix1, iz0, iz1 = -4.05, -1.55, -3.30, -2.70
    sl.put(soft_slab(stadium(ix0 + 0.05, ix1 - 0.05, iz0 + 0.04, iz1 - 0.04, 0.25), FY, FY + 0.08, 0.01, seg=2),
           None, 'metalDark')
    sl.put(soft_slab(stadium(ix0, ix1, iz0, iz1, 0.29), FY + 0.075, FY + H - 0.04, 0.025, seg=3), None,
           'woodInterior')
    sl.put(soft_slab(stadium(ix0 - 0.12, ix1 + 0.12, iz0 - 0.03, iz1 + 0.32, 0.33), FY + H - 0.045, FY + H,
                     0.02, seg=3), None, 'metalDark')
    n = 17
    for k in range(n):
        a = ix0 + 0.32 + (ix1 - ix0 - 0.64) * k / (n - 1)
        rib = MB()
        tube(rib, [(a, FY + 0.10, iz1), (a, FY + H - 0.07, iz1)], 0.018, seg=8, caps=True, round_caps=True)
        o.put(rib, None, 'woodInterior')
    bowl(o, -2.2, FY + H, -2.9, r=0.20)
    objs += [o, sl]
    st = Obj('int_stools', 'interior', wn=False)
    for x in (-3.50, -2.80, -2.10):
        stool(st, x, -2.12, FY, 0.66, 'upholsteryInterior', back_dir=math.pi / 2)
    objs.append(st)


def build_dining(ctx, objs):
    o = Obj('int_dining', 'interior', wn=True)
    top = Obj('int_diningTop', 'interior', wn=True)
    cx, cz = -2.2, 2.75
    a, b = 1.55, 0.62
    oval_table(top, cx, cz, a, b, FY, 0.73, 'woodInterior', 'metalDark', n=2.3)
    bowl(top, cx, FY + 0.73, cz, r=0.22)
    vase(top, cx - 0.55, FY + 0.73, cz + 0.05, h=0.26)
    objs.append(top)
    for dx in (-1.05, -0.35, 0.35, 1.05):
        dining_chair(o, cx + dx, cz - 0.92, math.pi / 2, FY)
        dining_chair(o, cx + dx, cz + 0.92, -math.pi / 2, FY)
    dining_chair(o, cx - a - 0.38, cz, 0.0, FY)
    dining_chair(o, cx + a + 0.38, cz, math.pi, FY)
    objs.append(o)


def build_sideboards(ctx, objs):
    o = Obj('int_sideboards', 'interior', wn=True)
    zf, zb = 4.28, 4.76
    x0, x1 = -0.20, 3.00
    credenza(o, x0, x1, zf, zb, FY, 0.60, 'woodInterior', 'woodInterior', r_lo=0.22, r_hi=0.02, grooves_z=zf)
    yt = FY + 0.60
    bowl(o, 0.5, yt, 4.52, r=0.20)
    vase(o, 1.75, yt, 4.54, h=0.40)
    vase(o, 1.95, yt, 4.48, h=0.27)
    o.put(soft_slab(pebble(2.55, 4.52, 0.22, 0.14, n=2.2), yt, yt + 0.014, 0.005, seg=1), None, 'metalDark')
    objs.append(o)


SAL_HELM_Z = (1.40, 2.40)


def build_salon_helm(ctx, objs):
    o = Obj('int_helmConsole', 'interior', wn=True)
    scr = Obj('int_screens', 'interior', wn=False)
    H = 0.82
    yt = FY + H
    path = Path2([(5.30, 0.30), (5.58, 1.95), (5.30, 3.60)], radii=[0, 3.2, 0], step=0.02, seg=20)
    console(o, path, FY, 0.72, H, 'woodInterior', 'metalDark')
    # nacelle d'écrans inclinée vers le pilote, sur pied noir
    tilt = math.radians(20)
    xc, yc, zc = 5.20, yt + 0.24, 1.95
    Mb, hz = screen_pod(o, scr, xc, yc, zc, tilt)
    blk(o, 'metalDark', xc - 0.06, xc + 0.06, yt - 0.01, yc - 0.12, zc - hz + 0.15, zc + hz - 0.15, 0.03)
    # volant gainé devant le pilote (tribord)
    wz = SAL_HELM_Z[1]
    C = Vector((4.70, yt + 0.02, wz))
    nrm = Vector((-math.cos(math.radians(28)), math.sin(math.radians(28)), 0.0))
    wheel(o, C, nrm, R=0.19, rim=0.016, spokes=3, cover='upholsteryInterior')
    col = MB()
    tube(col, [tuple(C + nrm * 0.03), tuple(C - nrm * 0.28)], 0.032, seg=16)
    o.put(col, None, 'metalDark')
    # manettes (à droite du pilote)
    zt = wz + 0.62
    o.put(soft_slab(pebble(5.0, zt, 0.12, 0.13, n=2.4), yt - 0.005, yt + 0.028, 0.012, seg=2), None, 'metalDark')
    for dz in (-0.045, 0.045):
        lv = MB()
        tube(lv, [(5.02, yt + 0.02, zt + dz), (4.94, yt + 0.15, zt + dz)], 0.009, seg=8)
        o.put(lv, None, 'chrome')
        o.put(lathe_mb([(0.0, 0.0), (0.02, 0.0), (0.024, 0.03), (0.02, 0.06), (0.0, 0.065)], seg=16),
              T(4.94, yt + 0.145, zt + dz), 'metalDark')
    # repose-pieds inox
    fr = MB()
    pts = [path.map(u, FY + 0.22, 0.79) for u in [0.5 + (path.L - 1.0) * k / 16 for k in range(17)]]
    tube(fr, pts, 0.014, seg=10, caps=True, round_caps=True)
    o.put(fr, None, 'chrome')
    objs += [o, scr]
    seats = Obj('int_helmSeats', 'interior', wn=False)
    for zs_ in SAL_HELM_Z:
        helm_seat(seats, T(4.12, FY, zs_) @ RY(math.pi / 2))
    objs.append(seats)


# --- PONTS EXTÉRIEURS (aftDeckFurniture) ---------------------------------------
def build_cockpit(ctx, objs):
    fr = Obj('aft_sofa_base', 'aftDeckFurniture', wn=True)
    cu = Obj('aft_sofa_cushions', 'aftDeckFurniture', wn=False)
    ue = 'upholsteryExterior'
    y0 = DY + 0.001
    XA, XF, ZW, ZE = -9.30, -6.10, -4.70, -1.15
    path = Path2([(XA, ZE), (XA, ZW), (XF, ZW), (XF, ZE)], radii=[0, 1.1, 1.1, 0], step=0.02, seg=24)
    Lp = path.L
    curved_sofa(fr, cu, path, 0.85, y0=y0, frame_key='superstructure', cush_key=ue, n_seat=7, back_t=0.15,
                seat=(0.28, 0.43), pillows=((Lp * 0.30, 'upholsteryInterior'), (Lp * 0.5, ue),
                                            (Lp * 0.70, 'upholsteryInterior')))
    for xc in (-8.25, -7.15):
        tub_chair(fr, cu, xc, -0.30, -math.pi / 2, y0, up=ue, base='metalDark')
    objs += [fr, cu]
    tb = Obj('aft_table', 'aftDeckFurniture', wn=True)
    oval_table(tb, -7.70, -2.50, 1.06, 0.56, y0, 0.72, 'deck', 'metalDark', rot=math.pi / 2, n=2.4)
    bowl(tb, -7.70, y0 + 0.72, -2.6, r=0.2, key='woodInterior')
    objs.append(tb)


def build_fwd_lounge(ctx, objs):
    fr = Obj('fwd_sofa_base', 'aftDeckFurniture', wn=True)
    cu = Obj('fwd_sofa_cushions', 'aftDeckFurniture', wn=False)
    ue = 'upholsteryExterior'
    x0, x1, zh, yw = FWD_WELL
    y0 = yw + 0.001
    m = 0.06
    XB = x1 - m
    ZB = zh - m
    XO = x0 + WELL_R          # les branches s'arrêtent au début des congés arrière du puits (accès libre)
    path = Path2([(XO, -ZB), (XB, -ZB), (XB, ZB), (XO, ZB)], radii=[0, WELL_R - m, WELL_R - m, 0], step=0.02,
                 seg=24)
    Lp = path.L
    D = 0.78
    curved_sofa(fr, cu, path, D, y0=y0, frame_key='superstructure', cush_key=ue, n_seat=5, back_t=0.14,
                seat=(0.28, 0.43), back_h=0.80, pillows=((Lp * 0.30, ue), (Lp * 0.70, ue)))
    objs += [fr, cu]
    tb = Obj('fwd_table', 'aftDeckFurniture', wn=True)
    fx = XB - D - 0.17
    a = 0.48
    oval_table(tb, fx - a, 0.0, a, ZB - D - 0.20, y0, 0.66, 'deck', 'metalDark', rot=0.0, n=2.6, npost=2)
    bowl(tb, fx - a, y0 + 0.66, 0.3, r=0.17)
    objs.append(tb)


def build_sea_lounge(ctx, objs):
    base = Obj('aft_seaLounge_base', 'aftDeckFurniture', wn=True)
    cu = Obj('aft_seaLounge_pads', 'aftDeckFurniture', wn=True)
    xa, xb, zh, y = AFT_LOUNGE
    # seule la partie à ciel ouvert (en arrière du tableau de nef x = XS) est utilisable : la plateforme passe
    # sous la nef (garage, 0,75 m de hauteur libre) -> transats allongés selon z, tête relevée côté coque.
    x0, x1 = xa + 0.12, L29.XS - 0.06
    W = x1 - x0
    xc = 0.5 * (x0 + x1)
    Lz = 1.95
    for s in (-1, 1):
        zh0 = s * (0.88 + Lz)
        M = T(xc, y + 0.001, zh0) @ RY(s * math.pi / 2)
        sunpad(base, cu, Lz, W, y, M, H=0.16, nb=1, raised=(True,), ang=math.radians(38), r_head=0.22,
               r_foot=0.22)
    objs += [base, cu]


# --- FLYBRIDGE (groupe roof) -----------------------------------------------
def build_fly(ctx, objs):
    ue = 'upholsteryExterior'
    y0 = FLY + 0.001
    hx, hz = FLY_HELM
    # poste de barre
    o = Obj('fly_helmConsole', 'roof', wn=True)
    scr = Obj('fly_screens', 'roof', wn=False)
    H = 0.86
    yt = y0 + H
    path = Path2([(hx + 0.58, hz - 1.22), (hx + 0.80, hz), (hx + 0.58, hz + 1.22)], radii=[0, 3.5, 0], step=0.02,
                 seg=20)
    console(o, path, y0, 0.66, H, 'superstructure', 'metalDark')
    tilt = math.radians(24)
    xc, yc = hx + 0.64, yt + 0.22
    Mb, hzp = screen_pod(o, scr, xc, yc, hz, tilt)
    blk(o, 'metalDark', xc - 0.06, xc + 0.06, yt - 0.01, yc - 0.12, hz - hzp + 0.15, hz + hzp - 0.15, 0.03)
    # barre à roue devant le barreur (tribord)
    wz = hz + 0.50
    C = Vector((hx + 0.08, y0 + 1.00, wz))
    nrm = Vector((-math.cos(math.radians(22)), math.sin(math.radians(22)), 0.0))
    wheel(o, C, nrm, R=0.34, rim=0.018, spokes=5, rim_key='chrome', cover='upholsteryInterior')
    ax = MB()
    tube(ax, [tuple(C + nrm * 0.03), tuple(C - nrm * 0.20)], 0.035, seg=16)
    o.put(ax, None, 'metalDark')
    # winchs sur les ailes de la console
    for dz in (-1.00, 1.00):
        p = path.map(path.L / 2 + dz, yt, 0.30)
        winch(o, p[0], yt, p[2])
    # manettes
    zt = hz - 0.05
    o.put(soft_slab(pebble(hx + 0.42, zt, 0.12, 0.13, n=2.4), yt - 0.005, yt + 0.028, 0.012, seg=2), None,
          'metalDark')
    for dz in (-0.045, 0.045):
        lv = MB()
        tube(lv, [(hx + 0.44, yt + 0.02, zt + dz), (hx + 0.36, yt + 0.15, zt + dz)], 0.009, seg=8)
        o.put(lv, None, 'chrome')
        o.put(lathe_mb([(0.0, 0.0), (0.02, 0.0), (0.024, 0.03), (0.02, 0.06), (0.0, 0.065)], seg=16),
              T(hx + 0.36, yt + 0.145, zt + dz), 'metalDark')
    fr = MB()
    pts = [path.map(u, y0 + 0.22, 0.74) for u in [0.45 + (path.L - 0.9) * k / 16 for k in range(17)]]
    tube(fr, pts, 0.014, seg=10, caps=True, round_caps=True)
    o.put(fr, None, 'chrome')
    objs += [o, scr]
    seats = Obj('fly_helmSeats', 'roof', wn=False)
    for dz in (-0.50, 0.50):
        helm_seat(seats, T(hx - 0.52, y0, hz + dz) @ RY(math.pi / 2), up=ue)
    objs.append(seats)

    # bar en arc (tribord milieu) + tabourets + meuble arrière
    br = Obj('fly_bar', 'roof', wn=True)
    bpath = Path2([(-2.6, 3.85), (-0.9, 2.25), (0.8, 3.85)], radii=[0, 1.7, 0], step=0.02, seg=24)
    BH = 1.05
    Lb = bpath.L
    br.put(bent(bpath, 0.05, Lb - 0.05, y0, y0 + 0.08, 0.06, 0.55, 0.02, step_u=0.08), None, 'metalDark')
    br.put(bent(bpath, 0.0, Lb, y0 + 0.075, y0 + BH - 0.05, 0.0, 0.58, 0.07, step_u=0.06), None, 'superstructure')
    br.put(bent(bpath, -0.06, Lb + 0.06, y0 + BH - 0.05, y0 + BH, -0.26, 0.64, 0.022, step_u=0.06), None, 'deck')
    rail = MB()
    tube(rail, [bpath.map(u, y0 + 0.26, -0.10) for u in [0.25 + (Lb - 0.5) * k / 20 for k in range(21)]], 0.014,
         seg=10, caps=True, round_caps=True)
    br.put(rail, None, 'chrome')
    for u in (0.25, Lb - 0.25):
        sp = MB()
        p0 = bpath.map(u, y0 + 0.26, -0.10)
        p1 = bpath.map(u, y0 + 0.26, 0.005)
        tube(sp, [p0, p1], 0.010, seg=8)
        br.put(sp, None, 'chrome')
    # évier + mitigeur sur le plan
    sp_ = bpath.map(Lb / 2, y0 + BH, 0.30)
    blk(br, 'chrome', sp_[0] - 0.22, sp_[0] + 0.22, y0 + BH - 0.002, y0 + BH + 0.003, sp_[2] - 0.15, sp_[2] + 0.15, 0.04)
    blk(br, 'metalDark', sp_[0] - 0.19, sp_[0] + 0.19, y0 + BH - 0.0015, y0 + BH + 0.0035, sp_[2] - 0.12,
        sp_[2] + 0.12, 0.035)
    fau = MB()
    fx, fzz = sp_[0], sp_[2] + 0.22
    pth = [(fx, y0 + BH, fzz)]
    for k in range(9):
        a = math.pi * k / 8
        pth.append((fx, y0 + BH + 0.20 + 0.09 * math.sin(a), fzz - 0.09 * (1 - math.cos(a))))
    pth.append((fx, y0 + BH + 0.15, fzz - 0.20))
    tube(fau, pth, 0.011, seg=10, caps=True, round_caps=True)
    br.put(fau, None, 'chrome')
    # meuble arrière (grill / frigo) le long du garde-corps
    credenza(br, -2.3, 0.5, 4.25, 4.70, y0, 0.90, 'superstructure', 'deck', r_lo=0.22, r_hi=0.05, grooves_z=4.25)
    blk(br, 'metalDark', -1.6, -0.9, y0 + 0.90, y0 + 0.906, 4.33, 4.62, 0.004)
    objs.append(br)
    st = Obj('fly_stools', 'roof', wn=False)
    for u in (Lb * 0.24, Lb * 0.5, Lb * 0.76):
        p = bpath.map(u, 0, -0.62)
        q = bpath.map(u, 0, 0.0)
        bd = math.atan2(p[2] - q[2], p[0] - q[0])
        stool(st, p[0], p[2], y0, 0.76, ue, back_dir=bd)
    objs.append(st)

    # grand canapé en U (bâbord arrière) + table teck
    fr2 = Obj('fly_sofa_base', 'roof', wn=True)
    cu2 = Obj('fly_sofa_cushions', 'roof', wn=False)
    XA, XF, ZW, ZE = -7.30, -3.10, -4.60, -0.80
    path = Path2([(XA, ZE), (XA, ZW), (XF, ZW), (XF, ZE)], radii=[0, 1.2, 1.2, 0], step=0.02, seg=24)
    Lp = path.L
    curved_sofa(fr2, cu2, path, 0.85, y0=y0, frame_key='superstructure', cush_key=ue, n_seat=7, back_t=0.15,
                seat=(0.28, 0.43), pillows=((Lp * 0.28, 'upholsteryInterior'), (Lp * 0.5 - 0.3, ue),
                                            (Lp * 0.5 + 0.3, 'upholsteryInterior'), (Lp * 0.72, ue)))
    objs += [fr2, cu2]
    tb = Obj('fly_table', 'roof', wn=True)
    oval_table(tb, -5.20, -2.85, 1.02, 0.66, y0, 0.72, 'deck', 'metalDark', n=2.4)
    bowl(tb, -5.0, y0 + 0.72, -2.85, r=0.2)
    objs.append(tb)

    # bains de soleil avant (bâbord)
    sb = Obj('fly_sunpad_base', 'roof', wn=True)
    sc = Obj('fly_sunpad_pads', 'roof', wn=True)
    M = T(1.60, y0, -2.40)
    sunpad(sb, sc, 2.60, 3.20, y0, M, H=0.24, nb=2, raised=(True, True), ang=math.radians(48), r_head=0.35,
           r_foot=1.0)
    objs += [sb, sc]


def build(ctx):
    objs = []
    build_salon_floor(ctx, objs)
    build_salon_lounge(ctx, objs)
    build_galley(ctx, objs)
    build_dining(ctx, objs)
    build_sideboards(ctx, objs)
    build_salon_helm(ctx, objs)
    build_cockpit(ctx, objs)
    build_fwd_lounge(ctx, objs)
    build_sea_lounge(ctx, objs)
    build_fly(ctx, objs)
    for o in objs:
        finalize(ctx, o)
