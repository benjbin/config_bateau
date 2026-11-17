"""DIÈDRE 24 Catamaran — groupes three.js 'interior' et 'aftDeckFurniture'.

Direction de design (fiche, prioritaire) : luxe MODERNE aux FORMES ARRONDIES — mobilier organique :
canapés balayés le long de courbes (dossiers galbés, extrémités en boudin), tables en galet / ovales,
meubles et îlot en plan « stade » aux arêtes très adoucies, banquette du cockpit en C, bain de soleil au
contour arrondi. Repère three.js (+X avant, +Y haut, +Z tribord, m) ; conversion Blender par make_obj.

Cotes principales : lib/cat_lines.py (plancher salon y = 2,00, salon x -4,8 -> 5,4, pont y = 1,95).
Enveloppe du salon = cotes publiées par cat_super (copiées ici, FOOT_B) : pied des vitrages B (flancs z = ±4,00,
coins avant en Bézier de tangente 2,2, nez x = 5,41 vif / ~5,38 arrondi), seuil yb(x) 2,12 -> 2,50, retrait du
verre au sommet setback(n_x) (0,18 flancs -> 1,134 au nez = pare-brise 35°), face intérieure de l'allège 0,10
en dedans ; mobilier à >= 3 cm de l'allège et >= 6 cm du verre (free()) ; la console avant est un balayage
le long de B (épouse le muret cintré).

Implantation choisie :
  Salon : plancher 'interiorFloor' (contour du pied des glaces − 5 cm, dessus 2,00) + plinthes noires.
    - cuisine bâbord arrière : plan le long de la paroi x -4,30 -> -2,10 (haut 0,92, extrémités arrondies),
      îlot-bar en « stade » x -3,95 -> -2,35 + 2 tabourets (assise 0,66)
    - salle à manger tribord arrière : table ovale noyer 1,70 x 0,96 (haut 0,74), 4 chaises à dossier cintré
    - salon bâbord : canapé en U continu balayé (dos à z -3,75, x -1,60 -> 2,40, retours jusqu'à z -1,20,
      rayons de plan 1,25 m), assise 0,44, dossier galbé 0,80 ; 2 fauteuils « tub » pivotants ;
      2 tables galets (0,40 et 0,32) ; tapis à coins ronds
    - tribord : 2 crédences basses en plan stade (haut 0,60)
    - avant : planche de bord continue (arrière cintré), poste de pilotage tribord (sièges z 0,95 / 1,95,
      assise 0,62, 3 écrans 22", volant cuir), banquette d'équipier bâbord cintrée tournée vers l'avant.
    - allée libre : bande centrale/tribord de la baie arrière (x -4,8) au poste (x 3,2).
  Cockpit (pont y 1,95) : banquette en C (dos x -10,00, branches |z| 0,90 -> 1,60 jusqu'à x -7,00, rayons
    0,9) sur socle laqué 'superstructure', table repas ovale en teck 1,70 x 1,10 (haut 0,72) ; passages
    |z| > 1,7 libres vers les escaliers des coques.
  Pont avant : bain de soleil x 5,95 -> 8,45, |z| <= 2,25 (coins avant R 1,1), socle laqué, 3 matelas,
    3 dossiers relevables (2 relevés à 50°), coussins de tête.

Matériaux : clés de la fiche uniquement (upholsteryInterior/Exterior, woodInterior, metalDark, chrome,
interiorFloor, screens, superstructure, deck). Tapis : champ 'upholsteryExterior' + galon 'upholsteryInterior'.
UV en mètres (projection monde par face) ; écrans : UV 0..1 par écran.
"""
import math
from mathutils import Vector, Matrix

from hull import MB, make_obj, add_bevel, add_wn, lathe
from cat_lines import SALON_FLOOR_Y, DECK_Y

FY = SALON_FLOOR_Y          # 2.00
DY = DECK_Y                 # 1.95
SILL_IN = 0.10              # épaisseur intérieure de l'allège (cat_super)
WS_TAN = math.tan(math.radians(35))
X_AFT = -4.76               # arrière du plancher (sous le seuil de la baie)
RUG = (-0.66, 1.46, -2.80, -0.10)

# Pied des vitrages B (copie des cotes publiées par cat_super) : polyligne vive (-4,76, ±4,00) -> (5,15, ±4,00)
# -> nez (5,41, 0), coins en Bézier quadratique de tangente 2,2 (avant) / 1,6 (nez) ; seuil yb(x) ;
# vitrage : retrait setback(n_x) au sommet (y 4,12) le long de la normale de plan.
YU_GLASS = 4.12


def clamp(v, a, b):
    return a if v < a else b if v > b else v


def _ss(a, b, x):
    t = clamp((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def sill_top(x):
    return 2.12 + 0.38 * _ss(2.6, 5.2, x)


def setback(nx):
    return 0.18 + (1.134 - 0.18) * _ss(0.30, 0.97, nx)


def _foot_B(step=0.04):
    sharp = [(-4.76, 4.0), (5.15, 4.0), (5.41, 0.0)]
    full = sharp + [(x, -z) for x, z in reversed(sharp[:-1])]
    radii = [0, 2.2, 1.6, 2.2, 0]
    pts = []
    for i, p in enumerate(full):
        r = radii[i]
        if i in (0, len(full) - 1) or r <= 0:
            pts.append(Vector(p))
            continue
        a_, c, b_ = Vector(full[i - 1]), Vector(p), Vector(full[i + 1])
        rr = min(r, 0.45 * (c - a_).length, 0.45 * (b_ - c).length)
        A = c + (a_ - c).normalized() * rr
        B = c + (b_ - c).normalized() * rr
        for k in range(41):
            t = k / 40
            pts.append(A * (1 - t) ** 2 + c * (2 * t * (1 - t)) + B * t * t)
    out = [pts[0]]
    for a_, b_ in zip(pts[:-1], pts[1:]):
        n = max(1, int(math.ceil((b_ - a_).length / step)))
        for k in range(1, n + 1):
            q = a_.lerp(b_, k / n)
            if (q - out[-1]).length > 1e-5:
                out.append(q)
    nh = []
    for i in range(len(out)):
        e = (out[min(i + 1, len(out) - 1)] - out[max(i - 1, 0)]).normalized()
        nh.append(Vector((-e.y, e.x)))          # normale extérieure (droite du parcours)
    return out, nh


FOOT_B, FOOT_N = _foot_B()


def _foot_poly():
    return [(p.x, p.y) for p in FOOT_B]


def plan_q(x, z):
    """(distance signée au pied B, > 0 dedans ; normale extérieure au point le plus proche)."""
    q = Vector((x, z))
    P = FOOT_B
    n = len(P)
    best, bn = 1e9, FOOT_N[0]
    inside = False
    for i in range(n):
        a_, b_ = P[i], P[(i + 1) % n]
        if (a_.y > z) != (b_.y > z) and x < a_.x + (z - a_.y) * (b_.x - a_.x) / (b_.y - a_.y):
            inside = not inside
        e = b_ - a_
        L2 = e.length_squared
        t = clamp((q - a_).dot(e) / L2, 0.0, 1.0) if L2 > 0 else 0.0
        d = (q - a_ - e * t).length
        if d < best:
            best, bn = d, FOOT_N[i] if i < n - 1 else Vector((-1, 0))
    return (best if inside else -best), bn


def plan_clear(x, z):
    return plan_q(x, z)[0]


def front_a(x, y, nx, m=0.06, ms=0.03):
    """retrait minimal (m, le long de la normale) à la hauteur y."""
    yb = sill_top(x)
    if y < yb + 0.02:
        return SILL_IN + ms
    t = clamp((y - yb) / (YU_GLASS - yb), 0.0, 1.0)
    return m + setback(nx) * t


def free(x, y, z, m=0.06, ms=0.03):
    d, n = plan_q(x, z)
    return d >= front_a(x, y, n.x, m, ms)


def xmax(y, z, m=0.06, lo=0.0, hi=5.6):
    if free(hi, y, z, m):
        return hi
    for _ in range(30):
        mid = 0.5 * (lo + hi)
        if free(mid, y, z, m):
            lo = mid
        else:
            hi = mid
    return lo


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


def rcube(hx, hy, hz, r, step=(9, 9, 9), m=3, deform=None, mat=0):
    """boîte arrondie (arêtes et coins sphériques de rayon r), centrée, quads ; step : pas des
    zones planes par axe ; deform(p) -> p déformé (coussins bombés, plis, cannelures)."""
    if not isinstance(step, (tuple, list)):
        step = (step, step, step)
    r = min(r, hx, hy, hz)
    a = (hx - r, hy - r, hz - r)
    h = (hx, hy, hz)
    S = [_samples(a[i], r, step[i], m) for i in range(3)]
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


def seam(hx, hy, hz, r, axis=1, sign=1, step=0.07, deform=None):
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
            piping=(1, -1), axis=1, pipe_r=0.0055, step=0.035, extra=None, m=3):
    """coussin rembourré : rcube bombé + passepoils sur les coutures (axis : face principale)."""
    df = pillow(hx, hy, hz, top, bottom, front, back, side, extra)
    if not isinstance(step, (tuple, list)):
        rr = min(r, hx, hy, hz)
        step = tuple(max(step, 2 * (h - rr) / 6) for h in (hx, hy, hz))
    mb = rcube(hx, hy, hz, r, step=step, deform=df, m=m if r >= 0.045 else 2)
    for sg in piping:
        ring_tube(mb, seam(hx, hy, hz, r, axis, sg, deform=df), pipe_r, seg=5)
    return mb


def block(w, h, d, r, step=9):
    """bloc à congés (meuble, socle), centré."""
    return rcube(w / 2, h / 2, d / 2, r, step=step, m=2 if r < 0.03 else 3)


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


def bent(path, u0, u1, y0, y1, v0, v1, r, kind='block', tilt=0.0, pivot=None, lean=0.0, taper=0.0,
         step_u=0.06, **kw):
    """rcube (bloc ou coussin) entre (u0..u1, y0..y1, v0..v1) puis plié le long de path.
    tilt : inclinaison (rad) dans le plan (y, v) autour de pivot (y, v) — haut vers l'arrière (v-) ;
    lean : recul du haut (galbe du dossier, m) ; taper : abaissement du haut aux extrémités (accoudoirs)."""
    hx, hy, hz = (u1 - u0) / 2, (y1 - y0) / 2, (v1 - v0) / 2
    cu, cy, cv = (u0 + u1) / 2, (y0 + y1) / 2, (v0 + v1) / 2
    if kind == 'block':
        rr = min(r, hx, hy, hz)
        st = (max(step_u, 0.0), 9, 9)
        mb = rcube(hx, hy, hz, r, step=(step_u, 9, 9), m=3 if rr >= 0.03 else 2)
    else:
        rr = min(r, hx, hy, hz)
        st = (step_u, max(0.05, 2 * (hy - rr) / 5), max(0.05, 2 * (hz - rr) / 5))
        mb = cushion(hx, hy, hz, r, step=st, **kw)
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
                    top=0.013 - 0.003 * (k % 2), front=0.008, side=0.004, back=0.0, bottom=0.0, step_u=0.10, m=2),
               None, cush_key)
        if back_cush:
            yb = y0 + seat[1] - 0.025
            vb = back_t + 0.03
            cu.put(bent(path, a, b, yb, yb + 0.42, vb, vb + 0.16, 0.06, kind='cushion', tilt=math.radians(10),
                        pivot=(yb, vb + 0.16), axis=2, top=0.006, front=0.018, back=0.004, side=0.004, bottom=0.0,
                        step_u=0.10, m=2),
                   None, cush_key)
    for (u, key) in pillows:
        yb = y0 + seat[1] + 0.02
        vb = back_t + 0.20
        cu.put(bent(path, u - 0.22, u + 0.22, yb, yb + 0.44, vb, vb + 0.13, 0.065, kind='cushion',
                    tilt=math.radians(16), pivot=(yb, vb + 0.13), axis=2, top=0.01, bottom=0.01, front=0.035,
                    back=0.03, side=0.01, step_u=0.05), None, key)


# ---------------------------------------------------------------------------
# SALON
# ---------------------------------------------------------------------------
def build_floor(ctx, objs):
    o = Obj('int_floor', 'interior', wn=True)
    foot = _foot_poly()
    fl = offset_poly(foot, -0.05)
    fl = [(max(x, X_AFT) if x < -4.5 else x, z) for x, z in fl]
    fl = [(X_AFT if x < -4.5 else x, z) for x, z in fl]
    o.put(prism(fl, FY - 0.05, FY), None, 'interiorFloor')
    objs.append(o)
    # plinthes noires au pied de l'allège (h 7 cm), le long de tout le contour sauf la baie arrière
    pl = Obj('int_plinths', 'interior', wn=True)
    inner = offset_poly(foot, -(SILL_IN + 0.0005))
    outer2 = offset_poly(foot, -(SILL_IN + 0.012))
    keep = [i for i, (x, z) in enumerate(inner) if x > -4.62]
    mb = MB()
    # bande continue (deux rubans) ouverte à l'arrière
    seq = keep
    rows = []
    for i in seq:
        a, b = inner[i], outer2[i]
        rows.append([(a[0], FY - 0.002, a[1]), (b[0], FY - 0.002, b[1]), (b[0], FY + 0.07, b[1]),
                     (a[0], FY + 0.07, a[1])])
    idx = [[mb.add(p) for p in r] for r in rows]
    cx = 0.5
    for k in range(len(rows) - 1):
        for j in (1, 2):           # face intérieure et dessus
            q = [idx[k][j], idx[k + 1][j], idx[k + 1][j + 1], idx[k][j + 1]]
            pm = Vector(rows[k][j])
            want = (cx - pm.x, 0, -pm.z) if j == 1 else (0, 1, 0)
            mb.face_o(q, 0, want)
    pl.put(mb, None, 'metalDark')
    objs.append(pl)
    # tapis : coins très arrondis, galon cuir + champ laine
    rg = Obj('int_rug', 'interior', wn=True)
    rx0, rx1, rz0, rz1 = RUG
    rg.put(soft_slab(stadium(rx0, rx1, rz0, rz1, 0.38, seg=10), FY + 0.001, FY + 0.011, 0.004, seg=2), None,
           'upholsteryInterior')
    e = 0.06
    rg.put(soft_slab(stadium(rx0 + e, rx1 - e, rz0 + e, rz1 - e, 0.32, seg=10), FY + 0.002, FY + 0.013, 0.004,
                     seg=2), None, 'upholsteryExterior')
    objs.append(rg)


def tub_chair(fr, cu, cx, cz, face, y0):
    """fauteuil « tub » pivotant : coque cintrée (accoudoirs descendants), assise ronde, coussin de dos."""
    up = 'upholsteryInterior'
    R = 0.44
    pts = []
    c0 = face + math.pi
    for k in range(41):
        th = c0 - 2.05 + 4.1 * k / 40
        pts.append((cx + R * math.cos(th), cz + R * math.sin(th)))
    path = Path2(pts, step=0.02)
    fr.put(lathe_mb([(0.0, 0.0), (0.26, 0.0), (0.265, 0.006), (0.25, 0.014), (0.07, 0.03), (0.05, 0.08),
                     (0.0, 0.08)], seg=32), T(cx, y0, cz), 'metalDark')
    prof = [(0.0, 0.07)]
    for k in range(7):
        a = -math.pi / 2 + math.pi * k / 6
        prof.append((0.33 + 0.045 * math.cos(a), 0.175 + 0.105 * math.sin(a)))
    prof.append((0.0, 0.28))
    fr.put(lathe_mb(prof, seg=40), T(cx, y0, cz), up)
    fr.put(bent(path, 0.0, path.L, y0 + 0.07, y0 + 0.74, 0.0, 0.12, 0.055, taper=0.36, lean=0.04, step_u=0.04),
           None, up)
    # assise ronde bombée + passepoil
    prof = [(0.0, 0.0)]
    for k in range(9):
        a = -math.pi / 2 + math.pi * k / 8
        prof.append((0.31 + 0.04 * math.cos(a), 0.065 + 0.065 * math.sin(a) + (0.008 if a > 0 else 0)))
    prof.append((0.15, 0.142))
    prof.append((0.0, 0.145))
    cu.put(lathe_mb(prof, seg=40), T(cx + 0.03 * math.cos(face), y0 + 0.28, cz + 0.03 * math.sin(face)), up)
    rt = MB()
    ring_tube(rt, [(cx + 0.03 * math.cos(face) + 0.348 * math.cos(2 * math.pi * k / 40), y0 + 0.28 + 0.09,
                    cz + 0.03 * math.sin(face) + 0.348 * math.sin(2 * math.pi * k / 40)) for k in range(40)], 0.005, seg=5)
    cu.put(rt, None, up)
    cu.put(bent(path, 0.30, path.L - 0.30, y0 + 0.40, y0 + 0.70, 0.12, 0.24, 0.05, kind='cushion', axis=2,
                tilt=math.radians(8), pivot=(y0 + 0.40, 0.24), front=0.016, top=0.005, side=0.004, step_u=0.05),
           None, up)


def build_lounge(ctx, objs):
    fr = Obj('int_sofa_frame', 'interior', wn=True)
    cu = Obj('int_sofa_cushions', 'interior', wn=False)
    up = 'upholsteryInterior'
    XA, XF, ZW, ZE = -1.60, 2.40, -3.75, -1.20
    path = Path2([(XA, ZE), (XA, ZW), (XF, ZW), (XF, ZE)], radii=[0, 1.25, 1.25, 0], step=0.02, seg=24)
    L = path.L
    curved_sofa(fr, cu, path, 0.95, y0=FY, frame_key=up, cush_key=up, n_seat=8,
                pillows=((L * 0.30, up), (L * 0.70, up), (L * 0.5 + 0.35, up)))
    # banquette d'équipier bâbord avant, légèrement cintrée, tournée vers le pare-brise
    pc = Path2([(2.92, -1.05), (2.76, -2.15), (2.92, -3.25)], radii=[0, 2.6, 0], step=0.02, seg=16)
    curved_sofa(fr, cu, pc, 0.85, y0=FY, frame_key=up, cush_key=up, n_seat=2, pillows=((0.75, up),))
    # 2 fauteuils tub face au canapé (posés sur le tapis)
    for xc in (-0.12, 0.92):
        tub_chair(fr, cu, xc, -0.80, -math.pi / 2, FY + 0.013)
    objs += [fr, cu]

    # table basse « galet » : plateau noyer à chant tendu, socle galet noir en retrait ; coupe tournée
    tb = Obj('int_coffeeTable', 'interior', wn=True)
    cx, cz = 0.40, -1.98
    tb.put(soft_slab(pebble(cx, cz, 0.70, 0.40, n=2.5, skew=0.05), FY + 0.355, FY + 0.40, 0.02, seg=3, crown=0.0),
           None, 'woodInterior')
    tb.put(soft_slab(pebble(cx + 0.03, cz, 0.50, 0.25, n=2.3, skew=0.05), FY + 0.013, FY + 0.36, 0.035, seg=3),
           None, 'metalDark')
    bowl = lathe_mb([(0.0, 0.0), (0.06, 0.0), (0.12, 0.03), (0.16, 0.07), (0.155, 0.075), (0.11, 0.035),
                     (0.0, 0.03)], seg=36, cap=False)
    tb.put(bowl, T(cx + 0.28, FY + 0.40, cz + 0.04), 'woodInterior')
    tb.put(soft_slab(pebble(cx - 0.25, cz - 0.02, 0.16, 0.11, n=2.2), FY + 0.40, FY + 0.43, 0.012, seg=2), None,
           'metalDark')
    tb.put(soft_slab(pebble(cx - 0.22, cz + 0.12, 0.09, 0.07, n=2.2, rot=0.6), FY + 0.40, FY + 0.47, 0.02, seg=2),
           None, 'woodInterior')
    objs.append(tb)


def grooves(o, pts_x, y0, y1, z, dz, key='metalDark'):
    """joints creux verticaux (façades) : fines lames sombres affleurantes."""
    for x in pts_x:
        blk(o, key, x - 0.003, x + 0.003, y0, y1, z - dz, z + dz, 0.0015)


def build_galley(ctx, objs):
    o = Obj('int_galley', 'interior', wn=True)
    sl = Obj('int_galleySlabs', 'interior', wn=True)
    H = 0.92
    # plan le long de la paroi bâbord : façade noyer, extrémités arrondies, plan noir débordant
    x0, x1, zb, zf = -4.30, -2.10, -3.80, -3.18
    sl.put(soft_slab(stadium(x0 + 0.05, x1 - 0.05, zb + 0.03, zf - 0.05, 0.02, 0.22), FY, FY + 0.08, 0.01, seg=2),
           None, 'metalDark')
    sl.put(soft_slab(stadium(x0, x1, zb, zf, 0.02, 0.28), FY + 0.075, FY + H - 0.03, 0.02, seg=3), None,
           'woodInterior')
    sl.put(soft_slab(stadium(x0 - 0.01, x1 + 0.01, zb, zf + 0.02, 0.02, 0.30), FY + H - 0.03, FY + H, 0.012, seg=3),
           None, 'metalDark')
    grooves(o, [-3.75, -3.20, -2.65], FY + 0.10, FY + H - 0.05, zf, 0.0025)
    # gorge de préhension sous le plan
    blk(o, 'metalDark', x0 + 0.25, x1 - 0.25, FY + H - 0.065, FY + H - 0.035, zf - 0.02, zf + 0.001, 0.004)
    # évier + mitigeur
    sx, sz = -3.62, -3.50
    blk(o, 'chrome', sx - 0.25, sx + 0.25, FY + H - 0.002, FY + H + 0.002, sz - 0.19, sz + 0.19, 0.05)
    blk(o, 'metalDark', sx - 0.22, sx + 0.22, FY + H - 0.0015, FY + H + 0.0025, sz - 0.16, sz + 0.16, 0.045)
    from hull import tube
    fau = MB()
    path = [(sx, FY + H, sz - 0.24)]
    for k in range(9):
        a = math.pi * k / 8
        path.append((sx, FY + H + 0.22 + 0.10 * math.sin(a), sz - 0.24 + 0.10 * (1 - math.cos(a))))
    path.append((sx, FY + H + 0.17, sz - 0.04))
    tube(fau, path, 0.011, seg=10, caps=True, round_caps=True)
    o.put(fau, None, 'chrome')
    o.put(lathe_mb([(0.0, 0.0), (0.025, 0.0), (0.025, 0.04), (0.018, 0.06), (0.0, 0.06)], seg=16),
          T(sx, FY + H, sz - 0.24), 'chrome')
    # plaque de cuisson affleurante
    sl.put(soft_slab(stadium(-2.95, -2.40, -3.68, -3.28, 0.06), FY + H, FY + H + 0.006, 0.003, seg=1), None,
           'metalDark')
    # îlot-bar en « stade » : corps noyer cannelé côté salon, plateau noyer épais débordant
    ix0, ix1, iz0, iz1 = -3.95, -2.35, -2.25, -1.78
    sl.put(soft_slab(stadium(ix0 + 0.05, ix1 - 0.05, iz0 + 0.04, iz1 - 0.04, 0.19), FY, FY + 0.08, 0.01, seg=2),
           None, 'metalDark')
    sl.put(soft_slab(stadium(ix0, ix1, iz0, iz1, 0.23), FY + 0.075, FY + H - 0.04, 0.025, seg=3), None,
           'woodInterior')
    sl.put(soft_slab(stadium(ix0 - 0.10, ix1 + 0.10, iz0 - 0.03, iz1 + 0.30, 0.30), FY + H - 0.045, FY + H,
                     0.02, seg=3), None, 'woodInterior')
    # cannelures (côtes demi-rondes) sur la face salon
    n = 13
    for k in range(n):
        a = ix0 + 0.27 + (ix1 - ix0 - 0.54) * k / (n - 1)
        rib = MB()
        tube(rib, [(a, FY + 0.10, iz1), (a, FY + H - 0.07, iz1)], 0.018, seg=8, caps=True, round_caps=True)
        o.put(rib, None, 'woodInterior')
    objs += [o, sl]

    # tabourets de bar (assise 0,66)
    st = Obj('int_stools', 'interior', wn=False)
    for x in (-3.55, -2.75):
        z = -1.18
        st.put(lathe_mb([(0.0, 0.0), (0.20, 0.0), (0.205, 0.006), (0.20, 0.014), (0.05, 0.022), (0.022, 0.04),
                         (0.022, 0.56), (0.05, 0.58), (0.16, 0.60), (0.0, 0.60)], seg=32), T(x, FY, z), 'metalDark')
        ring = MB()
        ring_tube(ring, [(x + 0.17 * math.cos(2 * math.pi * k / 32), FY + 0.24, z + 0.17 * math.sin(2 * math.pi * k / 32))
                         for k in range(32)], 0.009, seg=8)
        st.put(ring, None, 'chrome')
        for k in range(3):
            a = 2 * math.pi * k / 3 + 0.5
            spk = MB()
            tube(spk, [(x + 0.02 * math.cos(a), FY + 0.24, z + 0.02 * math.sin(a)),
                       (x + 0.165 * math.cos(a), FY + 0.24, z + 0.165 * math.sin(a))], 0.006, seg=6)
            st.put(spk, None, 'chrome')
        prof = [(0.0, 0.0)]
        R, Hh = 0.20, 0.075
        for k in range(9):
            a = -math.pi / 2 + math.pi * k / 8
            prof.append((R - 0.03 + 0.03 * math.cos(a), Hh / 2 + Hh / 2 * math.sin(a)))
        prof.append((0.0, Hh + 0.01))
        st.put(lathe_mb(prof, seg=36), T(x, FY + 0.595, z), 'upholsteryInterior')
        pr = MB()
        ring_tube(pr, [(x + (R - 0.004) * math.cos(2 * math.pi * k / 40), FY + 0.595 + Hh * 0.86,
                        z + (R - 0.004) * math.sin(2 * math.pi * k / 40)) for k in range(40)], 0.005, seg=5)
        st.put(pr, None, 'upholsteryInterior')
        # petit dossier cintré
        pts = [(x + 0.19 * math.cos(a), z + 0.19 * math.sin(a))
               for a in [math.pi * (0.25 + 0.5 * t / 12) for t in range(13)]]
        pth = Path2(pts, step=0.02)
        st.put(bent(pth, 0.0, pth.L, FY + 0.68, FY + 0.80, -0.012, 0.012, 0.012, step_u=0.03), None,
               'upholsteryInterior')
    objs.append(st)


def build_sideboards(ctx, objs):
    o = Obj('int_sideboards', 'interior', wn=True)
    zf, zb = 3.33, 3.78
    for x0, x1 in ((-4.30, -2.10), (-0.80, 2.30)):
        o.put(soft_slab(stadium(x0 + 0.06, x1 - 0.06, zf + 0.05, zb - 0.03, 0.17, 0.02), FY, FY + 0.075, 0.01,
                        seg=2), None, 'metalDark')
        o.put(soft_slab(stadium(x0, x1, zf, zb, 0.22, 0.02), FY + 0.07, FY + 0.575, 0.02, seg=3), None, 'woodInterior')
        o.put(soft_slab(stadium(x0 - 0.01, x1 + 0.01, zf - 0.015, zb, 0.235, 0.02), FY + 0.57, FY + 0.60, 0.012,
                        seg=3), None, 'woodInterior')
        nd = max(2, int(round((x1 - x0 - 0.44) / 0.55)))
        grooves(o, [x0 + 0.22 + (x1 - x0 - 0.44) * k / nd for k in range(1, nd)], FY + 0.10, FY + 0.55, zf, 0.0025)
    yt = FY + 0.60
    o.put(lathe_mb([(0.0, 0.0), (0.07, 0.0), (0.16, 0.035), (0.20, 0.08), (0.195, 0.085), (0.15, 0.04),
                    (0.0, 0.035)], seg=36, cap=False), T(0.40, yt, 3.56), 'woodInterior')
    o.put(lathe_mb([(0.0, 0.0), (0.06, 0.0), (0.085, 0.08), (0.09, 0.16), (0.06, 0.30), (0.035, 0.36), (0.04, 0.38),
                    (0.0, 0.38)], seg=32), T(1.50, yt, 3.58), 'metalDark')
    o.put(lathe_mb([(0.0, 0.0), (0.045, 0.0), (0.06, 0.06), (0.055, 0.20), (0.03, 0.25), (0.032, 0.26),
                    (0.0, 0.26)], seg=32), T(1.68, yt, 3.52), 'metalDark')
    o.put(soft_slab(pebble(-3.30, 3.56, 0.24, 0.14, n=2.2), yt, yt + 0.014, 0.005, seg=1), None, 'metalDark')
    o.put(lathe_mb([(0.0, 0.0), (0.05, 0.0), (0.11, 0.05), (0.115, 0.055), (0.06, 0.012), (0.0, 0.012)], seg=32,
                   cap=False), T(-3.30, yt + 0.014, 3.56), 'woodInterior')
    objs.append(o)


def dining_chair(o, cx, cz, face):
    """chaise rembourrée à dossier cintré enveloppant (assise 0,46), piètement noir fuselé."""
    up = 'upholsteryInterior'
    from hull import tube
    cf, sf = math.cos(face), math.sin(face)

    def W(fx, fy, fz):   # local : fz vers l'avant (direction face), fx à droite
        return (cx + fz * cf - fx * sf, fy, cz + fz * sf + fx * cf)
    for sx in (-1, 1):
        for sz in (-1, 1):
            lg = MB()
            tube(lg, [W(sx * 0.20, 0.0, sz * 0.20), W(sx * 0.17, 0.38, sz * 0.17)],
                 lambda i: 0.010 if i == 0 else 0.014, seg=8, caps=True)
            o.put(lg, None, 'metalDark')
    o.put(soft_slab(pebble(cx, cz, 0.23, 0.23, n=3.2), 0.0 + FY + 0.37, FY + 0.40, 0.012, seg=2), None, 'metalDark')
    o.put(soft_slab(pebble(cx + 0.005 * cf, cz + 0.005 * sf, 0.245, 0.24, n=3.4), FY + 0.395, FY + 0.465, 0.03, seg=3,
                    crown=0.010), None, up)
    pts = []
    R = 0.27
    for k in range(25):
        th = face + math.pi - 1.15 + 2.3 * k / 24
        pts.append((cx + R * math.cos(th) + 0.03 * cf, cz + R * math.sin(th) + 0.03 * sf))
    p = Path2(pts, step=0.02)
    o.put(bent(p, 0.0, p.L, FY + 0.43, FY + 0.86, 0.0, 0.055, 0.027, taper=0.25, lean=0.03, step_u=0.04), None, up)


def build_dining(ctx, objs):
    o = Obj('int_dining', 'interior', wn=True)
    cx, cz = -3.15, 1.98
    ty = FY + 0.74
    top = Obj('int_diningTop', 'interior', wn=True)
    top.put(soft_slab(pebble(cx, cz, 0.85, 0.48, n=2.3), ty - 0.04, ty, 0.018, seg=3), None, 'woodInterior')
    objs.append(top)
    for dx in (-0.42, 0.42):
        o.put(lathe_mb([(0.0, 0.0), (0.22, 0.0), (0.225, 0.006), (0.215, 0.014), (0.06, 0.03), (0.035, 0.08),
                        (0.035, 0.66), (0.12, 0.70), (0.0, 0.70)], seg=32), T(cx + dx, FY, cz), 'metalDark')
    o.put(soft_slab(pebble(cx, cz, 0.62, 0.10, n=2.4), ty - 0.08, ty - 0.04, 0.012, seg=2), None, 'metalDark')
    for dx in (-0.38, 0.38):
        dining_chair(o, cx + dx, cz - 0.70, math.pi / 2)
        dining_chair(o, cx + dx, cz + 0.70, -math.pi / 2)
    objs.append(o)


# ---------------------------------------------------------------------------
# POSTE DE PILOTAGE (tribord avant) + planche de bord
# ---------------------------------------------------------------------------
DASH_X0 = 3.98
DASH_TOP = FY + 0.80
HELM_Z = (0.95, 1.95)
SCR_ZC = 1.45


def build_helm(ctx, objs):
    o = Obj('int_helmConsole', 'interior', wn=True)
    yt = DASH_TOP

    def x0(z):            # ligne arrière de la planche dans la zone centrale (cintrée vers le pilote)
        return DASH_X0 - 0.10 * (1 - min(1.0, (z / 2.6) ** 2))
    # console cintrée : balayage d'un profil le long du pied des vitrages (x >= 2,60), qui épouse le muret
    ids = [i for i, p in enumerate(FOOT_B) if p.x >= 2.60][::2]
    P = [FOOT_B[i] for i in ids]
    N = [FOOT_N[i] for i in ids]
    na = len(P)
    aft = []
    for p, nn in zip(P, N):
        side = 0.46
        if nn.x > 0.12:
            proj = (p.x - x0(p.y)) / nn.x
        else:
            proj = side
        w = _ss(2.0, 3.0, abs(p.y))
        aft.append(clamp(proj * (1 - w) + side * w, side, 1.7))
    for _ in range(12):                       # lissage de la profondeur
        aft = [aft[0]] + [(aft[i - 1] + 2 * aft[i] + aft[i + 1]) / 4 for i in range(1, na - 1)] + [aft[-1]]
    yf = [FY, 2.30, 2.49, 2.53, 2.66, yt - 0.03]
    profs, tops = [], []
    for p, nn, A in zip(P, N, aft):
        fa = []
        for y in yf:
            v = front_a(p.x, y, nn.x) + 0.005
            fa.append(max(v, fa[-1]) if fa else v)
        A = max(A, fa[-1] + 0.25)
        ft = front_a(p.x, yt, nn.x) + 0.005
        # profil (s, y), s = -a (a : retrait vers l'intérieur depuis le pied des vitrages)
        pts = [(-(A - 0.07), FY)] + [(-a_, y) for a_, y in zip(fa, yf)] + \
              [(-(A - 0.06), yt - 0.03), (-(A + 0.02), yt - 0.12), (-(A + 0.02), FY + 0.16), (-(A - 0.07), FY + 0.08)]
        rad = [0.0] * (1 + len(fa)) + [0.05, 0.06, 0.05, 0.02]
        profs.append(rounded_poly(pts, rad, seg=4))
        tops.append(rounded_poly([(-(A - 0.04), yt - 0.03), (-(fa[-1] - 0.002), yt - 0.03), (-max(ft, fa[-1]), yt),
                                  (-(A - 0.07), yt)], [0.0, 0.0, 0.0, 0.025], seg=3))

    def sweep(profs, shrink=0.0):
        mb = MB()
        idx = []
        for k in range(na):
            row = []
            for sx, y in profs[k]:
                q = P[k] + N[k] * sx
                row.append(mb.add((q.x, y, q.y)))
            idx.append(row)
        m_ = len(profs[0])
        for k in range(na - 1):
            for j in range(m_):
                jj = (j + 1) % m_
                ws, wy, _ = _out2(profs[k], j)
                want = (N[k].x * ws, wy, N[k].y * ws)
                mb.face_o([idx[k][j], idx[k][jj], idx[k + 1][jj], idx[k + 1][j]], 0, want)
        t0 = P[0] - P[1]
        t1 = P[-1] - P[-2]
        mb.face_o(list(idx[0]), 0, (t0.x, 0, t0.y))
        mb.face_o(list(idx[-1]), 0, (t1.x, 0, t1.y))
        return mb
    od = Obj('int_dash', 'interior', wn=True, bevel=0.015)
    od.put(sweep(profs), None, 'woodInterior')
    objs.append(od)
    ot = Obj('int_dashTop', 'interior', wn=True, bevel=0.008)
    ot.put(sweep(tops), None, 'metalDark')
    objs.append(ot)

    # nacelle d'écrans aux angles très arrondis, inclinée vers le pilote
    tilt = math.radians(18)
    hxp, y0p, y1p, hzp = 0.05, -0.19, 0.20, 0.93
    cs, sn = math.cos(tilt), math.sin(tilt)
    yc = yt + 0.17
    ytop = yc + y1p * cs + hxp * sn
    xc = min(xmax(ytop, SCR_ZC + hzp, 0.05), xmax(ytop, SCR_ZC - hzp, 0.05)) - (hxp * cs + y1p * sn)
    Mb = T(xc, yc, SCR_ZC) @ RZ(-tilt)
    blk(o, 'metalDark', -hxp, hxp, y0p, y1p, -hzp, hzp, 0.045, Mb)
    blk(o, 'metalDark', xc - 0.07, xc + 0.05, yt - 0.01, yc - 0.12, SCR_ZC - hzp + 0.08,
        SCR_ZC + hzp - 0.08, 0.03)
    scr = Obj('int_screens', 'interior', wn=False)
    smb = MB()
    from hull import _newell
    pitch = 0.60
    hw, hh = 0.265, 0.155
    for k in (-1, 0, 1):
        dz = k * pitch
        Ms = Mb @ T(-hxp - 0.0005, 0.005, dz)
        P = [(0, -hh, -hw), (0, -hh, hw), (0, hh, hw), (0, hh, -hw)]     # u vers +z (droite du pilote)
        ids = [smb.add(tuple(Ms @ Vector(q))) for q in P]
        fi = smb.face(ids, 0, uv=[(0, 0), (1, 0), (1, 1), (0, 1)])
        nrm = Mb.to_3x3() @ Vector((-1, 0, 0))
        if Vector(_newell([smb.v[i] for i in smb.f[fi]])).dot(nrm) < 0:
            smb.f[fi] = list(reversed(smb.f[fi]))
            smb.fuv[fi] = list(reversed(smb.fuv[fi]))
        e = 0.014
        xa, xb = -hxp - 0.006, -hxp + 0.001
        blk(o, 'metalDark', xa, xb, -hh - e, -hh, dz - hw - e, dz + hw + e, 0.002, Mb)
        blk(o, 'metalDark', xa, xb, hh, hh + e, dz - hw - e, dz + hw + e, 0.002, Mb)
        blk(o, 'metalDark', xa, xb, -hh, hh, dz - hw - e, dz - hw, 0.002, Mb)
        blk(o, 'metalDark', xa, xb, -hh, hh, dz + hw, dz + hw + e, 0.002, Mb)
    scr.put(smb, None, 'screens')
    objs.append(scr)

    # volant cuir devant le pilote
    from hull import tube
    wz = HELM_Z[1]
    wc = Vector((x0(wz) - 0.15, yt - 0.03, wz))
    Mw = T(*wc) @ RZ(-math.radians(24)) @ RY(math.pi / 2)
    wheel = MB()
    R = 0.19
    ring_tube(wheel, [tuple(Mw @ Vector((R * math.cos(2 * math.pi * k / 48), R * math.sin(2 * math.pi * k / 48), 0)))
                      for k in range(48)], 0.016, seg=10)
    o.put(wheel, None, 'upholsteryInterior')
    o.put(lathe_mb([(0.0, -0.03), (0.055, -0.03), (0.06, 0.0), (0.05, 0.02), (0.0, 0.025)], seg=24),
          Mw @ RX(-math.pi / 2), 'metalDark')
    for a in (math.radians(-90), math.radians(15), math.radians(165)):
        sp = MB()
        tube(sp, [tuple(Mw @ Vector((0.05 * math.cos(a), 0.05 * math.sin(a), 0.0))),
                  tuple(Mw @ Vector((0.178 * math.cos(a), 0.178 * math.sin(a), 0.0)))], 0.010, seg=8)
        o.put(sp, None, 'metalDark')
    col = MB()
    tube(col, [tuple(Mw @ Vector((0, 0, 0.02))), tuple(Mw @ Vector((0, 0, 0.24)))], 0.032, seg=16)
    o.put(col, None, 'metalDark')
    # commandes moteurs
    zt = wz + 0.62
    X0 = x0(zt)
    o.put(soft_slab(pebble(X0 + 0.24, zt, 0.10, 0.13, n=2.4), yt - 0.005, yt + 0.028, 0.012, seg=2), None,
          'metalDark')
    for dz in (-0.045, 0.045):
        lv = MB()
        tube(lv, [(X0 + 0.26, yt + 0.02, zt + dz), (X0 + 0.18, yt + 0.15, zt + dz)], 0.009, seg=8)
        o.put(lv, None, 'chrome')
        o.put(lathe_mb([(0.0, 0.0), (0.02, 0.0), (0.024, 0.03), (0.02, 0.06), (0.0, 0.065)], seg=16),
              T(X0 + 0.18, yt + 0.145, zt + dz), 'metalDark')
    # repose-pieds inox cintré
    fr = MB()
    za, zb = HELM_Z[0] - 0.35, HELM_Z[1] + 0.35
    pts = []
    for k in range(17):
        z = za + (zb - za) * k / 16
        pts.append((x0(z) - 0.085 * math.sin(math.pi * k / 16) ** 0.4 - 0.012, FY + 0.22, z))
    tube(fr, pts, 0.014, seg=10, caps=True, round_caps=True)
    o.put(fr, None, 'chrome')
    objs.append(o)

    seats = Obj('int_helmSeats', 'interior', wn=False)
    for zs_ in HELM_Z:
        helm_seat(seats, T(3.12, FY, zs_) @ RY(math.pi / 2))
    objs.append(seats)


# ---------------------------------------------------------------------------
# COCKPIT ARRIÈRE : banquette en C + table repas ovale en teck
# ---------------------------------------------------------------------------
def build_cockpit(ctx, objs):
    fr = Obj('aft_bench_base', 'aftDeckFurniture', wn=True)
    cu = Obj('aft_bench_cushions', 'aftDeckFurniture', wn=False)
    ue = 'upholsteryExterior'
    XB, XE, ZO = -10.00, -7.00, 1.60
    path = Path2([(XE, ZO), (XB, ZO), (XB, -ZO), (XE, -ZO)], radii=[0, 0.95, 0.95, 0], step=0.02, seg=24)
    L = path.L
    curved_sofa(fr, cu, path, 0.70, y0=DY + 0.001, frame_key='superstructure', cush_key=ue, arms=(False, False),
                n_seat=8, back_t=0.13, seat=(0.30, 0.44), pillows=((L * 0.36, ue), (L * 0.64, ue)))
    objs += [fr, cu]
    tb = Obj('aft_table', 'aftDeckFurniture', wn=True)
    cx, cz = -8.15, 0.0
    ty = DY + 0.72
    tb.put(soft_slab(pebble(cx, cz, 0.86, 0.56, n=2.4), ty - 0.04, ty, 0.016, seg=3), None, 'deck')
    tb.put(soft_slab(pebble(cx, cz, 0.70, 0.40, n=2.4), ty - 0.09, ty - 0.035, 0.012, seg=2), None, 'metalDark')
    for dx in (-0.42, 0.42):
        tb.put(lathe_mb([(0.0, 0.0), (0.24, 0.0), (0.245, 0.006), (0.235, 0.014), (0.06, 0.03), (0.04, 0.08),
                         (0.04, 0.62), (0.12, 0.64), (0.0, 0.64)], seg=32), T(cx + dx, DY + 0.001, cz), 'metalDark')
    objs.append(tb)


# ---------------------------------------------------------------------------
# PONT AVANT : bain de soleil au contour arrondi
# ---------------------------------------------------------------------------
def build_sunbed(ctx, objs):
    base = Obj('fwd_sunbed_base', 'aftDeckFurniture', wn=True)
    cu = Obj('fwd_sunbed_cushions', 'aftDeckFurniture', wn=True)
    ue = 'upholsteryExterior'
    X0, X1, ZH = 5.95, 8.45, 2.25
    H = 0.26
    outline = rounded_poly([(X0, -ZH), (X1, -ZH), (X1, ZH), (X0, ZH)], [0.35, 1.10, 1.10, 0.35], seg=14)
    base.put(soft_slab(offset_poly(outline, -0.05), DY + 0.001, DY + 0.08, 0.01, seg=2), None, 'metalDark')
    base.put(soft_slab(outline, DY + 0.07, DY + H, 0.05, seg=4), None, 'superstructure')
    objs.append(base)
    XH = 6.70
    yb = DY + H
    pad = offset_poly(outline, -0.025)
    w = 2 * ZH / 3
    g = 0.007
    from hull import tube
    for k in range(3):
        za, zb = -ZH + w * k + g, -ZH + w * (k + 1) - g
        band = clip_poly(clip_poly(pad, 1, za, True), 1, zb, False)
        main = soften_corners(clip_poly(band, 0, XH + g, True), 0.05)
        cu.put(soft_slab(main, yb, yb + 0.12, 0.05, seg=4, crown=0.012), None, ue)
        rest = soften_corners(clip_poly(band, 0, XH - g, False), 0.05)
        ang = math.radians(50) if k != 1 else 0.0
        Mh = T(XH, yb, 0.0) @ RZ(-ang) @ T(-XH, -yb, 0.0)
        lift = 0.0 if k == 1 else 0.014
        r_mb = soft_slab(rest, yb + lift, yb + lift + 0.10, 0.045, seg=4, crown=0.010)
        cu.put(r_mb, Mh, ue)
        if k != 1:
            zc = (za + zb) / 2
            fb = soft_slab(offset_poly(rest, -0.04), yb + 0.0, yb + 0.014, 0.004, seg=1)
            base.put(fb, Mh, 'metalDark')
            for dz in (-w / 2 + 0.14, w / 2 - 0.14):
                st = MB()
                p_top = Mh @ Vector((XH - (XH - X0) * 0.62, yb, zc + dz))
                tube(st, [(X0 + 0.16, yb + 0.002, zc + dz), tuple(p_top)], 0.012, seg=8, caps=True, round_caps=True)
                base.put(st, None, 'metalDark')
            hc = cushion(0.30, 0.07, 0.10, 0.07, top=0.025, bottom=0.008, front=0.01, back=0.01, step=0.05)
            cu.put(hc, Mh @ T(X0 + 0.20, yb + lift + 0.10 + 0.068, zc) @ RY(math.pi / 2), ue)
    hc = cushion(0.32, 0.07, 0.11, 0.07, top=0.025, bottom=0.008, front=0.01, back=0.01, step=0.05)
    cu.put(hc, T(X0 + 0.24, yb + 0.10 + 0.068, 0.0) @ RY(math.pi / 2), ue)
    objs.append(cu)


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


def helm_seat(o, M):
    """siège pilote (repère local : avant +z, sol y = 0), assise 0,62."""
    up = 'upholsteryInterior'
    # piétement : platine, fût, repose-pieds
    o.put(lathe_mb([(0.0, 0.0), (0.24, 0.0), (0.245, 0.008), (0.235, 0.016), (0.07, 0.03), (0.055, 0.05),
                    (0.055, 0.40), (0.07, 0.43), (0.0, 0.43)], seg=32), M, 'metalDark')
    rg = MB()
    ring_tube(rg, [(0.2 * math.cos(2 * math.pi * k / 32), 0.24, 0.2 * math.sin(2 * math.pi * k / 32)) for k in range(32)],
              0.011, seg=8)
    o.put(rg, M, 'chrome')
    # coque noire sous l'assise
    blk(o, 'metalDark', -0.27, 0.27, 0.43, 0.50, -0.25, 0.27, 0.03, M)
    # assise : 6 canaux cousus (cannelures) + bourrelets latéraux
    nch, cw = 6, 0.40 / 6
    for k in range(nch):
        x = -0.20 + cw * (k + 0.5)
        c = cushion(cw / 2 - 0.001, 0.05, 0.25, 0.022, top=0.008, front=0.008, side=0.0, piping=(), step=0.06, m=2)
        o.put(c, M @ T(x, 0.555, 0.01), up)
    for sx in (-1, 1):
        b = cushion(0.045, 0.07, 0.26, 0.04, top=0.008, side=0.004, step=0.06, piping=(1,))
        o.put(b, M @ T(sx * 0.235, 0.57, 0.01) @ RZ(sx * 0.12), up)
    # dossier : coque + canaux cousus, incliné de 14°
    tl = math.radians(14)
    Mb = M @ T(0.0, 0.62, -0.20) @ RX(-tl)
    blk(o, 'metalDark', -0.26, 0.26, 0.0, 0.62, -0.06, -0.01, 0.025, Mb)
    for k in range(nch):
        x = -0.20 + cw * (k + 0.5)
        c = cushion(cw / 2 - 0.001, 0.28, 0.045, 0.022, top=0.0, front=0.009, side=0.0, piping=(), step=0.06,
                    axis=2, m=2)
        o.put(c, Mb @ T(x, 0.31, 0.035), up)
    for sx in (-1, 1):
        b = cushion(0.045, 0.27, 0.07, 0.04, front=0.008, side=0.004, step=0.06, axis=2, piping=(1,))
        o.put(b, Mb @ T(sx * 0.225, 0.31, 0.03) @ RY(-sx * 0.25), up)
    # appui-tête
    c = cushion(0.15, 0.08, 0.06, 0.05, top=0.006, front=0.014, step=0.04, axis=2)
    o.put(c, Mb @ T(0.0, 0.72, 0.01), up)
    blk(o, 'chrome', -0.07, -0.055, 0.60, 0.67, -0.03, -0.015, 0.006, Mb)
    blk(o, 'chrome', 0.055, 0.07, 0.60, 0.67, -0.03, -0.015, 0.006, Mb)
    # accoudoirs
    for sx in (-1, 1):
        blk(o, 'metalDark', sx * 0.29 - 0.02, sx * 0.29 + 0.02, 0.50, 0.80, -0.20, -0.14, 0.015, M)
        c = cushion(0.035, 0.025, 0.17, 0.024, top=0.004, step=0.04)
        o.put(c, M @ T(sx * 0.29, 0.83, -0.06), up)


# ---------------------------------------------------------------------------
# COCKPIT ARRIÈRE : banquette en U + table repas teck
# ---------------------------------------------------------------------------
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


def build(ctx):
    objs = []
    build_floor(ctx, objs)
    build_lounge(ctx, objs)
    build_galley(ctx, objs)
    build_sideboards(ctx, objs)
    build_dining(ctx, objs)
    build_helm(ctx, objs)
    build_cockpit(ctx, objs)
    build_sunbed(ctx, objs)
    for o in objs:
        finalize(ctx, o)
