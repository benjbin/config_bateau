"""SILLAGE 29 — groupe three.js 'cabins' : pont inférieur (cabines dans les coques, garage, soute technique).

Affiché seul dans la vue « Cabines » du configurateur (coque coupée à y = 2,05, tout ce qui est au-dessus masqué) :
TOUT ce module reste sous y = 2,05 (cloisons arasées à YT = 2,03, escaliers à 2,049) et se lit vu de dessus
comme un plan d'architecte en 3D : cloisons boiseries 'woodInterior' à arase 'metalDark', doublage de bordé et
cloison intérieure laqués 'ceiling', portes = baies (cadres 'metalDark', vantaux ouverts), mobilier arrondi.
Design ORIGINAL NEOKROME (aucune implantation de chantier recopiée). Repère three.js (+X avant, +Y haut, +Z tribord).

Les formes de coque viennent des VRAIES sections de s29_hull (outer_rows / innerA_rows) : doublage du bordé à
5 cm de la peau, cloison intérieure verticale à ZI(x) = max(face intérieure de coque) + 10 cm, cloisons
transversales arrêtées à 12 mm du bordé, plancher 0,35 → 0,40 sous lequel la coque est partout présente.

Cotes choisies par ce module (|z| = distance à l'axe du bateau, côté tribord ; bâbord = miroir) :
  PLANCHER des coques : dessus y 0,40 (épaisseur 5 cm), x −11,95 → 12,33 ; cloisons arasées à 2,03 ; ép. 6 cm.
  ESCALIERS (STAIR_WELLS de s29_interior) : 10 hauteurs de 0,20, giron 0,23, marches massives laquées + nez
    bois + LED ; descente vers l'extérieur (vers le bordé) depuis la trémie du salon.
      bâbord  : x −1,10 → −0,12, départ |z| 2,40, arrivée |z| 4,47 (palier de la suite propriétaire)
      tribord : x  3,06 →  3,72, départ |z| 2,72, arrivée |z| 4,79 (palier des cabines invités)
  BÂBORD (propriétaire) : machine x −11,95 → −8,70 ; dressing −8,70 → −7,05 ; chambre −7,05 → −1,13
    (lit 1,80 × 2,00 en travers, tête capitonnée contre la cloison intérieure, chevets, coiffeuse, fauteuil,
    canapé) ; palier −1,13 → −0,09 ; salle de bains −0,09 → 4,78 (double vasque, baignoire îlot, WC séparé,
    douche italienne vitrée) ; ÉQUIPAGE : cabine capitaine 4,78 → 7,60 (+ salle d'eau), sas/échelle sous le
    panneau x 8,2 (7,60 → 8,78), carré équipage / buanderie 8,78 → 12,33.
  TRIBORD (invités) : machine −11,95 → −8,70 ; local technique −8,70 → −5,30 ; INVITÉS 1 −5,30 → 3,03
    (dressing, lit 1,80 en travers, bureau, salle d'eau 0,97 → 3,03) ; palier 3,03 → 3,75 ; INVITÉS 2
    3,75 → 7,60 (salle d'eau 3,75 → 5,45, lit 1,60 en travers) ; ÉQUIPAGE : sas/échelle 7,60 → 8,78,
    salle d'eau 8,78 → 9,95 (côté bordé), cabine 2 couchettes superposées 9,95 → 12,33.
  GARAGE (entre les coques sous le cockpit) : x −13,62 → −9,60, |z| ≤ 2,95, plancher 1,38 (seuil de la porte
    de garage de s29_hull), 2 scooters sous-marins sur berceaux, 4 paddles sur racks latéraux.
  SOUTE TECHNIQUE de nef (plancher technique y = dessous de nef + 0,08) : réservoirs, groupes froids,
    colonne de compression du mât (x 7,6).
"""
import math
import bmesh  # noqa: F401
from mathutils import Vector, Matrix

from hull import MB, make_obj, add_wn, tube, rbox_mb
import s29_hull as H
from s29_lines import HULL_Z, SALON_FLOOR_Y, sheer
from s29_interior import (Obj, cushion, blk, soft_slab, stadium, pebble, lathe_mb, T, RY, RX, Path2,
                          flutes, tub_chair, curved_sofa, dining_chair, bowl, vase, ring_tube)
try:
    from s29_interior import STAIR_WELLS
except Exception:  # module intérieur ancien : mêmes trémies
    STAIR_WELLS = [(-1.10, -0.12, -4.88, -2.40), (3.06, 3.72, 2.72, 4.88)]

GROUP = 'cabins'
YF0, YF = 0.35, 0.40     # plancher (dessous / dessus)
YT = 2.03                # arase des cloisons
YS_TOP = 2.049           # haut des escaliers dans ce groupe (le reste est dans 'interior')
WT = 0.06                # épaisseur des cloisons
X_AFT, X_FWD = -11.95, 12.33
X_LAZ = -13.58          # soute arrière (sous l'escalier de tableau), jusqu'au tableau x -13,70
RISE, RUN, NST, NOSE = 0.20, 0.23, 9, 0.025
WINS = list(H.WINDOWS)


# ---------------------------------------------------------------------------
# formes réelles de la coque
# ---------------------------------------------------------------------------
_C = {}


def _rows(x):
    k = round(x, 5)
    r = _C.get(k)
    if r is None:
        o = [(y, HULL_Z + zl) for y, zl in H.outer_rows(x)]
        a = H.innerA_rows(x)[:H.A_C + H.N_TC + 1]
        r = _C[k] = (o, a)
    return r


def _cross(rows, y):
    for (y0, z0), (y1, z1) in zip(rows, rows[1:]):
        if (y0 - y) * (y1 - y) <= 0 and abs(y1 - y0) > 1e-9:
            return z0 + (y - y0) / (y1 - y0) * (z1 - z0)
    return None


def zo(x, y):
    """|z| de la peau extérieure (flanc extérieur) à la hauteur y."""
    return _cross(_rows(x)[0], y)


def zi(x, y):
    return _cross(_rows(x)[1], y)


_ZI = {}


def ZI(x):
    """face côté cabine de la cloison intérieure (verticale) : 10 cm au-delà du point le plus extérieur de la
    face intérieure de coque entre le plancher et le dessous de nef."""
    k = round(x, 4)
    if k not in _ZI:
        ytop = min(H.base_y(x) - 0.04, 1.95)
        ys = [YF0 + (ytop - YF0) * i / 24 for i in range(25)]
        m = max((zi(x, y) or 0.0) for y in ys)
        _ZI[k] = max(3.38, m + 0.10)
    return _ZI[k]


def ZO(x, y):
    """doublage du bordé (5 cm à l'intérieur de la peau)."""
    return zo(x, y) - 0.05


def TD(x):
    """plancher technique de nef (dessus), entre les coques."""
    return H.base_y(x) + 0.08


def wb(x):
    """bas des hublots de coque (cf. s29_hull.build_windows)."""
    return sheer(x) - H.WIN_TOP - H.WIN_H


def xgrid(x0, x1, step=0.2, extra=()):
    xs = {x0, x1}
    n = max(1, int(math.ceil((x1 - x0) / step)))
    xs |= {x0 + (x1 - x0) * k / n for k in range(n + 1)}
    xs |= {e for e in extra if x0 < e < x1}
    out = []
    for x in sorted(xs):
        if out and x - out[-1] < 0.01:
            if x in extra or x == x1:
                out[-1] = x
            continue
        out.append(x)
    return out


# ---------------------------------------------------------------------------
# primitives (repère three, côté tribord ; bâbord = MB.mirrored())
# ---------------------------------------------------------------------------
def box_o(mb, x0, x1, y0, y1, z0, z1, mat=0, top=None, skip=()):
    F = {
        '-x': ([(x0, y0, z0), (x0, y0, z1), (x0, y1, z1), (x0, y1, z0)], (-1, 0, 0)),
        '+x': ([(x1, y0, z0), (x1, y1, z0), (x1, y1, z1), (x1, y0, z1)], (1, 0, 0)),
        '-y': ([(x0, y0, z0), (x1, y0, z0), (x1, y0, z1), (x0, y0, z1)], (0, -1, 0)),
        '+y': ([(x0, y1, z0), (x0, y1, z1), (x1, y1, z1), (x1, y1, z0)], (0, 1, 0)),
        '-z': ([(x0, y0, z0), (x0, y1, z0), (x1, y1, z0), (x1, y0, z0)], (0, 0, -1)),
        '+z': ([(x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)], (0, 0, 1)),
    }
    for k, (pts, w) in F.items():
        if k in skip:
            continue
        mb.face_o([mb.add(p) for p in pts], top if (k == '+y' and top is not None) else mat, w)


def ribbon(mb, xs, lo, hi, y0, y1, mat, top, caps=True):
    """bande verticale suivant x : |z| entre lo(x) et hi(x), y0 → y1."""
    P = [(x, lo(x), hi(x)) for x in xs]
    A = lambda p: mb.add(p)
    for (xa, la, ha), (xb, lb, hb) in zip(P, P[1:]):
        mb.face_o([A((xa, y1, la)), A((xb, y1, lb)), A((xb, y1, hb)), A((xa, y1, ha))], top, (0, 1, 0))
        mb.face_o([A((xa, y0, la)), A((xb, y0, lb)), A((xb, y0, hb)), A((xa, y0, ha))], mat, (0, -1, 0))
        mb.face_o([A((xa, y0, la)), A((xb, y0, lb)), A((xb, y1, lb)), A((xa, y1, la))], mat, (0, 0, -1))
        mb.face_o([A((xa, y0, ha)), A((xb, y0, hb)), A((xb, y1, hb)), A((xa, y1, ha))], mat, (0, 0, 1))
    if caps:
        for (x, l, h), w in ((P[0], -1), (P[-1], 1)):
            mb.face_o([A((x, y0, l)), A((x, y0, h)), A((x, y1, h)), A((x, y1, l))], mat, (w, 0, 0))


def extrude_x(mb, poly, x0, x1, mat, top):
    """prisme d'un contour (u=|z|, y) entre x0 et x1 ; arêtes à y = YT -> matériau d'arase."""
    n = len(poly)
    A2 = sum(poly[i][0] * poly[(i + 1) % n][1] - poly[(i + 1) % n][0] * poly[i][1] for i in range(n))
    sg = 1.0 if A2 > 0 else -1.0
    L = [mb.add((x0, y, u)) for u, y in poly]
    R = [mb.add((x1, y, u)) for u, y in poly]
    for i in range(n):
        j = (i + 1) % n
        du, dy = poly[j][0] - poly[i][0], poly[j][1] - poly[i][1]
        nu, ny = dy * sg, -du * sg
        m = top if (abs(poly[i][1] - YT) < 1e-6 and abs(poly[j][1] - YT) < 1e-6) else mat
        mb.face_o([L[i], L[j], R[j], R[i]], m, (0, ny, nu))
    mb.face_o(L, mat, (-1, 0, 0))
    mb.face_o(R, mat, (1, 0, 0))


class Set:
    """objets d'un côté (tag 'P' bâbord miroir / 'S' tribord / 'C' centre)."""

    def __init__(self, tag):
        self.tag, self.d = tag, {}

    def __call__(self, name, wn=True, sharp=None):
        o = self.d.get(name)
        if o is None:
            o = self.d[name] = Obj(f'cab_{self.tag}_{name}', GROUP, wn=wn)
            o.sharp = sharp
        return o


def fin(ctx, S, mirror=False):
    for o in S.d.values():
        if not o.mb.f:
            continue
        mb = o.mb.mirrored() if mirror else o.mb
        sharp = getattr(o, 'sharp', None)
        ob = make_obj(ctx, o.name, mb, o.mats, smooth=True, sharp_deg=sharp)
        ctx.link(ob, GROUP)
        if o.wn and sharp is None:
            add_wn(ob)


# ---------------------------------------------------------------------------
# coque : plancher, doublage, cloison intérieure, cloisons, portes
# ---------------------------------------------------------------------------
YS_HULL = [YF0, 0.45, 0.60, 0.80, 1.00, 1.20, 1.40, 1.60, 1.80, YT]


def stair_x_ranges(sd):
    return [(w[0], w[1]) for w in STAIR_WELLS if (w[2] + w[3]) * sd > 0]


def build_shell(S, sd, tech):
    """plancher, doublage du bordé (ouvert aux hublots), cloison intérieure (ouverte aux escaliers)."""
    wall = S('walls', sharp=40)
    fl = S('floor', sharp=40)
    ln = S('lining', sharp=50)
    specials = [a for w in WINS for a in w] + [a for r in stair_x_ranges(sd) for a in r]
    specials += [a for r in tech for a in r]
    xs = xgrid(X_LAZ, X_FWD, 0.2, specials + [X_AFT])
    # plancher (tech = tôle 'metalDark')
    tech = list(tech) + [(X_LAZ, X_AFT)]
    cuts = sorted({X_LAZ, X_FWD} | {a for r in tech for a in r})
    for a, b in zip(cuts, cuts[1:]):
        key = 'metalDark' if any(r[0] - 1e-6 <= 0.5 * (a + b) <= r[1] + 1e-6 for r in tech) else 'interiorFloor'
        sx = [x for x in xs if a - 1e-9 <= x <= b + 1e-9]
        ribbon(fl.mb, sx, lambda x: ZI(x) - WT, lambda x: zo(x, YF0) - 0.012, YF0, YF, fl.m(key), fl.m(key))
    # cloison intérieure (verticale) — ouverte au droit des escaliers
    segs = [(X_LAZ, X_FWD)]
    for a, b in stair_x_ranges(sd):
        nxt = []
        for s0, s1 in segs:
            if s0 < a < s1:
                nxt += [(s0, a), (b, s1)]
            else:
                nxt.append((s0, s1))
        segs = nxt
    for s0, s1 in segs:
        sx = [x for x in xs if s0 - 1e-9 <= x <= s1 + 1e-9]
        ribbon(wall.mb, sx, lambda x: ZI(x) - WT, ZI, YF0, YT, wall.m('ceiling'), wall.m('metalDark'))
    # doublage du bordé (vers l'intérieur), arase 'metalDark', baies des hublots + tableaux
    mat, cap = ln.m('ceiling'), ln.m('metalDark')
    rowsY = lambda x: [YF, 0.75, 1.10, 1.45, wb(x), YT]
    G = [[(x, y, ZO(x, y)) for y in rowsY(x)] for x in xs]
    A = lambda p: ln.mb.add(p)
    for i in range(len(xs) - 1):
        xm = 0.5 * (xs[i] + xs[i + 1])
        inwin = any(xa < xm < xb for xa, xb in WINS)
        for r in range(5):
            if inwin and r == 4:
                continue
            ln.mb.face_o([A(G[i][r]), A(G[i + 1][r]), A(G[i + 1][r + 1]), A(G[i][r + 1])], mat, (0, 0, -1))
        yy = 4 if inwin else 5
        q = []
        for k in (i, i + 1):
            x, y, u = G[k][yy]
            q.append(((x, y, u), (x, y, zo(x, y) - 0.004)))
        ln.mb.face_o([A(q[0][0]), A(q[1][0]), A(q[1][1]), A(q[0][1])], mat if inwin else cap, (0, 1, 0))
    for xa, xb in WINS:
        for x, w in ((xa, 1), (xb, -1)):
            y0 = wb(x)
            ln.mb.face_o([A((x, y0, ZO(x, y0))), A((x, y0, zo(x, y0) - 0.004)), A((x, YT, zo(x, YT) - 0.004)),
                          A((x, YT, ZO(x, YT)))], mat, (w, 0, 0))


def bulkhead(S, xb, gaps=(), mat='woodInterior', u_from=None, u_to=None, leaves=(), jambs=True):
    """cloison transversale centrée en x = xb, de la cloison intérieure au bordé (ou u_to).
    gaps : baies (u0, u1) sur toute la hauteur ; leaves : (i_baie, charnière 0/1, sens ±x, angle°)."""
    o = S('walls', sharp=40)
    xa_, xb_ = xb - WT / 2, xb + WT / 2
    u_in = ZI(xb) - WT if u_from is None else u_from
    uh = lambda y: min(zo(xa_, y), zo(xb_, y)) - 0.012
    cur, pieces = u_in, []
    for g0, g1 in sorted(gaps):
        pieces.append((cur, g0))
        cur = g1
    pieces.append((cur, u_to))
    for ua, ub in pieces:
        if ub is None:
            poly = [(ua, YF0)] + [(uh(y), y) for y in YS_HULL] + [(ua, YT)]
        else:
            if ub - ua < 1e-3:
                continue
            poly = [(ua, YF0), (ub, YF0), (ub, YT), (ua, YT)]
        extrude_x(o.mb, poly, xa_, xb_, o.m(mat), o.m('metalDark'))
    for gi, (g0, g1) in enumerate(sorted(gaps)):
        if jambs:
            door_frame(S, 'x', xb, g0, g1)
        for (li, he, sw, ang) in leaves:
            if li == gi:
                door_leaf(S, 'x', xb, g0, g1, he, sw, ang)


def partition(S, uw, x0, x1, gaps=(), mat='woodInterior', leaves=(), y1=YT):
    """cloison longitudinale (le long de x) entre uw et uw + WT."""
    o = S('walls', sharp=40)
    cur = x0
    for g0, g1 in sorted(gaps):
        if g0 - cur > 1e-3:
            box_o(o.mb, cur, g0, YF0, y1, uw, uw + WT, o.m(mat), o.m('metalDark'))
        cur = g1
    if x1 - cur > 1e-3:
        box_o(o.mb, cur, x1, YF0, y1, uw, uw + WT, o.m(mat), o.m('metalDark'))
    for gi, (g0, g1) in enumerate(sorted(gaps)):
        door_frame(S, 'u', uw + WT / 2, g0, g1)
        for (li, he, sw, ang) in leaves:
            if li == gi:
                door_leaf(S, 'u', uw + WT / 2, g0, g1, he, sw, ang)


def door_frame(S, axis, c, g0, g1):
    o = S('frames', sharp=40)
    t = WT / 2 + 0.012
    mi = o.m('metalDark')
    for a, b in ((g0, g0 + 0.035), (g1 - 0.035, g1)):
        if axis == 'x':
            box_o(o.mb, c - t, c + t, YF, YT - 0.002, a, b, mi)
        else:
            box_o(o.mb, a, b, YF, YT - 0.002, c - t, c + t, mi)
    # seuil
    if axis == 'x':
        box_o(o.mb, c - t, c + t, YF - 0.01, YF + 0.006, g0 + 0.035, g1 - 0.035, mi)
    else:
        box_o(o.mb, g0 + 0.035, g1 - 0.035, YF - 0.01, YF + 0.006, c - t, c + t, mi)


def door_leaf(S, axis, c, g0, g1, hinge_end, swing, ang_deg):
    """vantail bois ouvert de ang_deg vers swing (±x si axis 'x', ±u si axis 'u'), poignées chrome."""
    w = (g1 - g0) - 0.08
    a = math.radians(ang_deg)
    s = 1 if hinge_end == 0 else -1
    gh = g0 + 0.04 if hinge_end == 0 else g1 - 0.04
    if axis == 'x':
        hx, hu = c, gh
        d = (swing * math.sin(a), s * math.cos(a))
    else:
        hx, hu = gh, c
        d = (s * math.cos(a), swing * math.sin(a))
    th = math.atan2(d[0], d[1])           # RY(th) envoie +z local sur (d_x, d_u)
    M = T(hx, 0, hu) @ RY(th)
    lf = MB()
    box_o(lf, -0.02, 0.02, YF + 0.012, YT - 0.03, 0.0, w)
    S('furn').put(lf, M, 'woodInterior')
    for sx in (-1, 1):
        hd = MB()
        tube(hd, [(sx * 0.02, YF + 0.62, w - 0.07), (sx * 0.065, YF + 0.62, w - 0.07),
                  (sx * 0.065, YF + 0.62, w - 0.20)], 0.009, seg=8, caps=True, round_caps=True)
        S('metal').put(hd, M, 'chrome')


# ---------------------------------------------------------------------------
# escaliers (partagé avec s29_interior pour la partie au-dessus de 2,05)
# ---------------------------------------------------------------------------
def stair_parts(well, ylo=-9.0, yhi=YS_TOP, rails=True):
    """parties de l'escalier de la trémie `well` (x0, x1, z0, z1) comprises entre ylo et yhi.
    Renvoie {matériau: MB} en coordonnées réelles (bâbord : miroir)."""
    x0, x1, z0, z1 = well
    sd = 1 if (z0 + z1) > 0 else -1
    ut = min(abs(z0), abs(z1))
    xc = 0.5 * (x0 + x1)
    us = max(ZI(x0), ZI(x1), ZI(xc)) - WT          # limite nef / coque
    td = max(TD(x0), TD(x1)) + 0.0
    out = {k: MB() for k in ('ceiling', 'woodInterior', 'ledStrip', 'chrome')}

    def cbox(key, xa, xb, ya, yb, ua, ub):
        ya2, yb2 = max(ya, ylo), min(yb, yhi)
        if yb2 - ya2 > 1e-4 and ub - ua > 1e-4:
            box_o(out[key], xa, xb, ya2, yb2, ua, ub)

    for k in range(1, NST + 1):
        yk = SALON_FLOOR_Y - RISE * k
        ua, ub = ut + RUN * (k - 1), ut + RUN * k
        for pa, pb in ((ua, min(ub, us)), (max(ua, us), ub)):
            if pb - pa > 1e-4:
                base = td if pb <= us + 1e-6 else YF0
                cbox('ceiling', x0 + 0.004, x1 - 0.004, base, yk - 0.045, pa, pb)
        if ylo <= yk - 0.045 and yk <= yhi:
            rbox_mb(x1 - x0 - 0.012, 0.045, ub - ua + NOSE, 0.012,
                    Matrix.Translation((xc, yk - 0.0225, 0.5 * (ua - NOSE + ub))), mb=out['woodInterior'], seg=2)
            cbox('ledStrip', x0 + 0.04, x1 - 0.04, yk - 0.053, yk - 0.046, ua - NOSE + 0.004, ua - NOSE + 0.016)
    # joues du fût d'escalier dans la nef (du plancher technique au dessous du salon)
    for xa, xb in ((x0 - WT, x0), (x1, x1 + WT)):
        cbox('ceiling', xa, xb, td, SALON_FLOOR_Y - 0.06, ut - 0.02, us)
    if rails and ylo < 1.0:
        for xr in (x0 + 0.055, x1 - 0.055):
            yl = lambda u: SALON_FLOOR_Y - RISE * (u - ut) / RUN + 0.86
            ua = ut + (SALON_FLOOR_Y + 0.86 - (YT - 0.05)) / RISE * RUN
            ub = ut + RUN * NST - 0.05
            pts = [(xr, yl(ua + (ub - ua) * k / 8), ua + (ub - ua) * k / 8) for k in range(9)]
            tube(out['chrome'], pts, 0.019, seg=12, caps=True, round_caps=True)
            for t in (0.15, 0.85):
                u = ua + (ub - ua) * t
                sgx = -1 if xr < xc else 1
                tube(out['chrome'], [(xr, yl(u), u), (xr + sgx * 0.05, yl(u), u)], 0.008, seg=8, caps=True)
    if sd < 0:
        out = {k: m.mirrored() for k, m in out.items()}
    return out


def build_stairs(ctx):
    objs = {}
    for i, w in enumerate(STAIR_WELLS):
        for key, mb in stair_parts(w).items():
            if not mb.f:
                continue
            o = objs.get(key)
            if o is None:
                o = objs[key] = Obj(f'cab_stairs_{key}', GROUP, wn=True)
                o.sharp = 40 if key in ('ceiling', 'ledStrip') else None
            o.put(mb, None, key)
    for o in objs.values():
        ob = make_obj(ctx, o.name, o.mb, o.mats, smooth=True, sharp_deg=o.sharp)
        ctx.link(ob, GROUP)
        if o.sharp is None:
            add_wn(ob)


# ---------------------------------------------------------------------------
# mobilier (repère tribord ; u = |z|)
# ---------------------------------------------------------------------------
def lamp(S, x, y, u, h=0.42):
    S('metal').put(lathe_mb([(0.0, 0.0), (0.075, 0.0), (0.075, 0.012), (0.012, 0.03), (0.010, h - 0.16),
                             (0.0, h - 0.16)], seg=20), T(x, y, u), 'chrome')
    S('furn').put(lathe_mb([(0.0, h - 0.20), (0.13, h - 0.19), (0.115, h), (0.0, h)], seg=24), T(x, y, u), 'ceiling')


def nightstand(S, x0, x1, u0, u1, lampu=True):
    rr = 0.45 * min(x1 - x0, u1 - u0)
    S('furn').put(soft_slab(stadium(x0, x1, u0, u1, min(0.03, rr), min(0.10, rr)), YF + 0.22, YF + 0.52, 0.02, seg=3),
                  None, 'woodInterior')
    S('furn').put(soft_slab(stadium(x0 - 0.01, x1 + 0.01, u0, u1 + 0.01, min(0.03, rr), min(0.11, rr + 0.01)),
                            YF + 0.52, YF + 0.545, 0.008, seg=2), None, 'metalDark')
    blk(S('led'), 'ledStrip', x0 + 0.05, x1 - 0.05, YF + 0.215, YF + 0.222, u0 + 0.04, u1 - 0.05, 0.002)
    if lampu:
        lamp(S, 0.5 * (x0 + x1), YF + 0.545, 0.5 * (u0 + u1))


def bed(S, xc, u0, L, W, head_w=None, head_h=1.20, pillows=2, accent=True, throw=True):
    """lit double flottant en travers : tête contre la cloison intérieure (u0), pieds vers le bordé (+u)."""
    xa, xb = xc - W / 2, xc + W / 2
    ub = u0 + L
    hw = head_w or (W + 1.1)
    # tête de lit capitonnée (cannelures verticales), panneau bois derrière
    blk(S('furn'), 'woodInterior', xc - hw / 2, xc + hw / 2, YF + 0.02, YF + head_h + 0.06, u0 - 0.002, u0 + 0.05, 0.015)
    hb = cushion(hw / 2 - 0.08, (head_h - 0.32) / 2, 0.045, 0.04, top=0.0, bottom=0.0, front=0.014, back=0.0,
                 side=0.004, axis=2, piping=(1,), step=(0.04, 0.16, 0.05),
                 extra=flutes(0.16, 0.011, 0.028, axis=0, faces=(3,)))
    S('soft').put(hb, T(xc, YF + 0.34 + (head_h - 0.32) / 2, u0 + 0.095), 'upholsteryInterior')
    # socle en retrait + LED rasante, sommier gainé
    blk(S('metal'), 'metalDark', xa + 0.15, xb - 0.15, YF, YF + 0.12, u0 + 0.20, ub - 0.22, 0.02)
    S('led').put(soft_slab(stadium(xa + 0.13, xb - 0.13, u0 + 0.18, ub - 0.20, 0.04), YF + 0.001, YF + 0.006,
                           0.002, seg=1), None, 'ledStrip')
    blk(S('furn'), 'upholsteryInterior', xa - 0.03, xb + 0.03, YF + 0.12, YF + 0.36, u0 + 0.14, ub + 0.03, 0.06)
    # matelas, couette, plaid, oreillers
    S('soft').put(cushion(W / 2 - 0.01, 0.09, (L - 0.14) / 2, 0.06, top=0.008, piping=(1,), step=0.18),
                  T(xc, YF + 0.45, u0 + 0.14 + (L - 0.14) / 2 + 0.01), 'ceiling')
    d0, d1 = u0 + 0.70, ub + 0.04
    S('soft').put(cushion(W / 2 + 0.025, 0.035, (d1 - d0) / 2, 0.03, top=0.014, front=0.01, back=0.02, side=0.01,
                          piping=(), step=0.18), T(xc, YF + 0.565, 0.5 * (d0 + d1)), 'ceiling')
    if throw:
        S('soft').put(cushion(W / 2 + 0.045, 0.02, 0.24, 0.02, top=0.006, piping=(), step=0.18),
                      T(xc, YF + 0.61, ub - 0.34), 'upholsteryInterior')
    n = pillows
    pw = (W - 0.10) / n
    for k in range(n):
        px = xa + 0.05 + pw * (k + 0.5)
        S('soft').put(cushion(pw / 2 - 0.02, 0.07, 0.21, 0.06, top=0.03, bottom=0.01, front=0.02, piping=(), step=0.16),
                      T(px, YF + 0.62, u0 + 0.40) @ RX(math.radians(-18)), 'ceiling')
    if accent:
        for k in range(2):
            px = xc + (k - 0.5) * 0.48
            S('soft').put(cushion(0.21, 0.15, 0.06, 0.05, top=0.01, front=0.03, back=0.02, axis=2, piping=(1,), step=0.14),
                          T(px, YF + 0.70, u0 + 0.64) @ RX(math.radians(-14)), 'upholsteryInterior')


def wardrobe(S, x0, x1, u0, u1, front, y1=YT - 0.03):
    """penderie toute hauteur ; front : +1 façade vers +u, -1 vers -u, 'x+' / 'x-' façade vers ±x."""
    blk(S('furn'), 'woodInterior', x0, x1, YF, y1, u0, u1, 0.012)
    if front in (1, -1):
        uf = u1 if front > 0 else u0
        n = max(1, int(round((x1 - x0) / 0.55)))
        for k in range(1, n):
            gx = x0 + (x1 - x0) * k / n
            fr = S('frames', sharp=40)
            box_o(fr.mb, gx - 0.003, gx + 0.003, YF + 0.06, y1 - 0.04, uf - 0.003, uf + 0.003, fr.m('metalDark'))
        for k in range(n):
            gx = x0 + (x1 - x0) * (k + 0.5) / n
            fr = S('frames', sharp=40)
            box_o(fr.mb, gx - 0.012, gx + 0.012, YF + 0.75, YF + 1.25, *sorted((uf + front * 0.005, uf + front * 0.022)),
                  fr.m('chrome'))
    else:
        sgn = 1 if front == 'x+' else -1
        xf = x1 if sgn > 0 else x0
        n = max(1, int(round((u1 - u0) / 0.55)))
        for k in range(1, n):
            gu = u0 + (u1 - u0) * k / n
            fr = S('frames', sharp=40)
            box_o(fr.mb, xf - 0.003, xf + 0.003, YF + 0.06, y1 - 0.04, gu - 0.003, gu + 0.003, fr.m('metalDark'))
        for k in range(n):
            gu = u0 + (u1 - u0) * (k + 0.5) / n
            fr = S('frames', sharp=40)
            box_o(fr.mb, *sorted((xf + sgn * 0.005, xf + sgn * 0.022)), YF + 0.75, YF + 1.25, gu - 0.012, gu + 0.012,
                  fr.m('chrome'))


def vanity(S, x0, x1, u0, u1, basins, mirror=True, top='acrylic', M=None):
    """meuble vasque suspendu (mur en u0, profondeur +u ; M : repère local -> réel) : caisson bois, plan pierre
    fumée, vasques à poser, robinets chrome, miroir."""
    TM = (lambda m: M @ m) if M is not None else (lambda m: m)
    S('furn').put(soft_slab(stadium(x0 + 0.02, x1 - 0.02, u0, u1 - 0.02, 0.02, 0.10), YF + 0.30, YF + 0.80, 0.02,
                            seg=3), M, 'woodInterior')
    S('led').put(soft_slab(stadium(x0 + 0.08, x1 - 0.08, u0 + 0.05, u1 - 0.08, 0.02, 0.06), YF + 0.292, YF + 0.30,
                           0.002, seg=1), M, 'ledStrip')
    S('furn').put(soft_slab(stadium(x0, x1, u0, u1, 0.02, 0.12), YF + 0.80, YF + 0.84, 0.012, seg=2), M, top)
    for bx in basins:
        bu = 0.5 * (u0 + u1) + 0.02
        S('furn').put(lathe_mb([(0.0, 0.004), (0.10, 0.0), (0.17, 0.03), (0.195, 0.10), (0.19, 0.13), (0.175, 0.13),
                                (0.165, 0.10), (0.15, 0.04), (0.0, 0.025)], seg=32, cap=False),
                      TM(T(bx, YF + 0.84, bu)), 'ceiling')
        f = MB()
        tube(f, [(bx, YF + 0.84, u0 + 0.06), (bx, YF + 1.12, u0 + 0.06), (bx, YF + 1.15, u0 + 0.09),
                 (bx, YF + 1.13, u0 + 0.20)], 0.012, seg=10, caps=True, round_caps=True)
        S('metal').put(f, M, 'chrome')
    if mirror:
        S('metal').put(soft_slab(stadium(x0 + 0.05, x1 - 0.05, u0 - 0.002, u0 + 0.012, 0.004), YF + 1.02, YF + 1.58,
                                 0.004, seg=1), M, 'chrome')


def wc(S, x, u, face):
    """WC suspendu (face = direction du siège dans le plan, rad), plaque chrome."""
    c, s = math.cos(face), math.sin(face)
    M = T(x, YF, u) @ RY(math.atan2(c, s))     # +z local -> direction face
    S('furn').put(soft_slab(pebble(0.0, 0.30, 0.19, 0.30, n=2.2), 0.30, 0.42, 0.05, seg=3), M, 'ceiling')
    S('furn').put(soft_slab(pebble(0.0, 0.31, 0.19, 0.29, n=2.2), 0.42, 0.45, 0.012, seg=2), M, 'ceiling')
    blk(S('furn'), 'ceiling', -0.22, 0.22, 0.0, 1.0, -0.02, 0.10, 0.03, M)
    blk(S('metal'), 'chrome', -0.12, 0.12, 0.82, 0.96, 0.10, 0.112, 0.005, M)


def shower(S, x0, x1, u0, u1, glass=(), bench=None, head=None):
    """douche à l'italienne : receveur pierre fumée, caniveau, parois verre (segments (xa, ua, xb, ub))."""
    S('furn').put(soft_slab(stadium(x0, x1, u0, u1, 0.02), YF, YF + 0.018, 0.006, seg=2), None, 'acrylic')
    blk(S('metal'), 'metalDark', x0 + 0.08, x1 - 0.08, YF + 0.017, YF + 0.021, u0 + 0.05, u0 + 0.10, 0.003)
    for xa, ua, xb, ub in glass:
        o = S('glass', wn=False, sharp=30)
        L = math.hypot(xb - xa, ub - ua)
        th = math.atan2(xb - xa, ub - ua)
        M = T(xa, 0, ua) @ RY(th)
        g = MB()
        box_o(g, -0.005, 0.005, YF + 0.02, YT - 0.04, 0.0, L)
        o.put(g, M, 'glass')
        p = MB()
        box_o(p, -0.012, 0.012, YT - 0.045, YT - 0.02, 0.0, L)
        box_o(p, -0.012, 0.012, YF + 0.018, YF + 0.04, 0.0, L)
        S('metal').put(p, M, 'metalDark')
    if bench:
        bx0, bx1, bu0, bu1 = bench
        blk(S('furn'), 'woodInterior', bx0, bx1, YF + 0.40, YF + 0.46, bu0, bu1, 0.012)
        blk(S('furn'), 'acrylic', bx0 + 0.02, bx1 - 0.02, YF, YF + 0.40, bu0 + 0.02, bu1 - 0.01, 0.01)
    if head:
        hx, hu = head
        S('metal').put(lathe_mb([(0.0, -0.012), (0.16, -0.012), (0.165, 0.0), (0.0, 0.0)], seg=32),
                       T(hx, YT - 0.06, hu), 'chrome')
        a = MB()
        tube(a, [(hx, YT - 0.06, hu), (hx, YT - 0.06, u0 if abs(hu - u0) < abs(hu - u1) else u1)], 0.012, seg=10)
        S('metal').put(a, None, 'chrome')


def tub(S, xc, uc, a, b):
    """baignoire îlot : coque galet (anneaux décalés), rebord fin, bec chrome sur colonne."""
    o = S('tub', wn=True)
    base = pebble(xc, uc, a, b, n=2.3, seg=48)
    prof = [(0.06, YF), (0.0, YF + 0.10), (0.0, YF + 0.56), (0.012, YF + 0.585), (0.04, YF + 0.59),
            (0.065, YF + 0.565), (0.075, YF + 0.50), (0.12, YF + 0.16), (0.22, YF + 0.10)]
    rings = []
    for d, y in prof:
        rings.append([o.mb.add((x, y, z)) for x, z in (I_off(base, -d) if d > 0 else base)])
    n = len(base)
    mi = o.m('ceiling')
    cx, cz = xc, uc
    for k in range(len(rings) - 1):
        for i in range(n):
            j = (i + 1) % n
            q = [rings[k][i], rings[k][j], rings[k + 1][j], rings[k + 1][i]]
            fi = o.mb.face(q, mi)
            if fi is None:
                continue
            P = [Vector(o.mb.v[t]) for t in o.mb.f[fi]]
            c = sum(P, Vector()) / len(P)
            from hull import _newell
            nn = Vector(_newell([tuple(p) for p in P]))
            out = Vector((c.x - cx, 0, c.z - cz))
            inner = k >= 4   # paroi intérieure : normale vers l'axe
            want = -out if inner else out
            if k == 3:
                want = Vector((0, 1, 0))
            if nn.dot(want) < 0:
                o.mb.f[fi] = list(reversed(o.mb.f[fi]))
    o.mb.face_o(rings[0], mi, (0, -1, 0))
    o.mb.face_o(rings[-1], mi, (0, 1, 0))
    # eau (plan acrylique)
    S('furn').put(soft_slab(I_off(base, -0.10), YF + 0.40, YF + 0.405, 0.002, seg=1), None, 'acrylic')
    # colonne + bec
    f = MB()
    px, pu = xc - a - 0.16, uc
    tube(f, [(px, YF, pu), (px, YF + 0.86, pu), (px + 0.05, YF + 0.90, pu), (px + 0.20, YF + 0.86, pu)], 0.016, seg=12,
         caps=True, round_caps=True)
    S('metal').put(f, None, 'chrome')


def I_off(poly, d):
    from s29_interior import offset_poly
    return offset_poly(poly, d)


def desk(S, x0, x1, u0, u1, chair_face, chair=True):
    S('furn').put(soft_slab(stadium(x0, x1, u0, u1, 0.02, 0.16), YF + 0.72, YF + 0.76, 0.012, seg=3), None,
                  'woodInterior')
    blk(S('furn'), 'woodInterior', x0 + 0.03, x0 + 0.45, YF + 0.56, YF + 0.72, u0 + 0.01, u1 - 0.06, 0.012)
    for xx in (x0 + 0.04, x1 - 0.06):
        blk(S('metal'), 'metalDark', xx, xx + 0.02, YF, YF + 0.72, u0 + 0.06, u1 - 0.08, 0.008)
    if chair:
        cx = 0.5 * (x0 + x1) + 0.15
        cu = u1 + 0.30
        dining_chair(S('furn'), cx, cu, chair_face, YF)
    lamp(S, x1 - 0.18, YF + 0.76, u0 + 0.15, h=0.36)


def sofa(S, pts, D=0.80, radii=None, seats=2, pillows=()):
    pth = Path2(pts, radii=radii, step=0.02, seg=16)
    curved_sofa(S('furn'), S('soft', wn=False), pth, D, y0=YF, frame_key='upholsteryInterior',
                cush_key='upholsteryInterior', n_seat=seats, back_h=0.78,
                pillows=[(pth.L * t, k) for t, k in pillows])


def side_table(S, x, u, r=0.22):
    S('furn').put(soft_slab(pebble(x, u, r, r * 0.9, n=2.2), YF + 0.50, YF + 0.53, 0.01, seg=2), None, 'woodInterior')
    S('metal').put(lathe_mb([(0.0, 0.0), (0.15, 0.0), (0.15, 0.01), (0.025, 0.02), (0.02, 0.50), (0.0, 0.50)],
                            seg=20), T(x, YF, u), 'metalDark')


def ottoman(S, x, u, r=0.30):
    S('soft').put(cushion(r, 0.20, r * 0.75, 0.10, top=0.02, piping=(1,), step=0.08),
                  T(x, YF + 0.21, u), 'upholsteryInterior')


def rug(S, x0, x1, u0, u1, r=0.3):
    S('furn').put(soft_slab(stadium(x0, x1, u0, u1, r), YF + 0.001, YF + 0.012, 0.004, seg=2), None,
                  'upholsteryExterior')


def ladder(S, xf, xt, uc, w=0.46):
    """échelle de descente (pied xf au plancher, haut xt sous le panneau), limons chrome, marches teck clair."""
    for su in (-1, 1):
        r = MB()
        tube(r, [(xf, YF, uc + su * w / 2), (xt, YT - 0.01, uc + su * w / 2)], 0.02, seg=12, caps=True)
        S('metal').put(r, None, 'chrome')
    n = 6
    for k in range(1, n + 1):
        t = k / (n + 0.5)
        x = xf + (xt - xf) * t
        y = YF + (YT - 0.01 - YF) * t
        blk(S('furn'), 'woodInterior', x - 0.08, x + 0.08, y - 0.03, y, uc - w / 2 + 0.02, uc + w / 2 - 0.02, 0.01)


def bunk(S, x0, x1, ya, inner_u, outer_fn):
    """couchette (pont + matelas) entre inner_u et le doublage (outer_fn(x) - jeu), à la hauteur ya."""
    xs = [x0 + (x1 - x0) * k / 6 for k in range(7)]
    poly = [(x, inner_u) for x in xs] + [(x, outer_fn(x) - 0.03) for x in reversed(xs)]
    S('furn').put(soft_slab(I_soft(poly), ya, ya + 0.05, 0.012, seg=2), None, 'woodInterior')
    m = [(x, inner_u + 0.04) for x in xs] + [(x, outer_fn(x) - 0.06) for x in reversed(xs)]
    S('soft').put(soft_slab(I_soft(m), ya + 0.05, ya + 0.20, 0.05, seg=3, crown=0.012), None, 'ceiling')
    S('soft').put(soft_slab(I_soft([(x0 + 0.08, inner_u + 0.08), (x0 + 0.50, inner_u + 0.08),
                                    (x0 + 0.50, outer_fn(x0 + 0.5) - 0.10), (x0 + 0.08, outer_fn(x0 + 0.08) - 0.10)]),
                            ya + 0.20, ya + 0.30, 0.04, seg=2, crown=0.01), None, 'ceiling')
    S('soft').put(soft_slab(I_soft([(x0 + 1.05, inner_u + 0.02), (x1 - 0.05, inner_u + 0.02),
                                    (x1 - 0.05, outer_fn(x1) - 0.04), (x0 + 1.05, outer_fn(x0 + 1.05) - 0.04)]),
                            ya + 0.20, ya + 0.23, 0.012, seg=2), None, 'upholsteryInterior')


def I_soft(poly):
    from s29_interior import soften_corners
    return soften_corners(poly, 0.06)


def appliance(S, x0, x1, u0, u1, y0, y1, face_u):
    """lave-linge / sèche-linge (façade vers -u si face_u < 0) : caisse laquée, hublot verre + bague chrome."""
    blk(S('furn'), 'ceiling', x0, x1, y0, y1, u0, u1, 0.02)
    uf = u0 if face_u < 0 else u1
    xc, yc = 0.5 * (x0 + x1), 0.5 * (y0 + y1) - 0.03
    rg = MB()
    ring_tube(rg, [(xc + 0.17 * math.cos(2 * math.pi * k / 24), yc + 0.17 * math.sin(2 * math.pi * k / 24),
                    uf + face_u * 0.012) for k in range(24)], 0.018, seg=6)
    S('metal').put(rg, None, 'chrome')
    g = MB()
    box_o(g, xc - 0.15, xc + 0.15, yc - 0.15, yc + 0.15, uf + face_u * 0.004 - 0.003, uf + face_u * 0.004 + 0.003)
    S('glass', wn=False, sharp=30).put(g, None, 'glass')


# ---------------------------------------------------------------------------
# locaux techniques (communs aux deux coques)
# ---------------------------------------------------------------------------
def engine_room(S, utility=False):
    # moteur électrique + réducteur au droit du pod (x -10,4), sur l'axe de coque
    blk(S('tech'), 'metalDark', -10.95, -9.85, YF, YF + 0.62, 4.40, 5.10, 0.08)
    S('tech').put(lathe_mb([(0.0, 0.0), (0.22, 0.0), (0.24, 0.04), (0.24, 0.50), (0.20, 0.56), (0.0, 0.56)], seg=28),
                  T(-10.40, YF + 0.62, 4.75), 'metalDark')
    S('tech').put(lathe_mb([(0.0, 0.0), (0.245, 0.0), (0.245, 0.03), (0.0, 0.03)], seg=28),
                  T(-10.40, YF + 0.88, 4.75), 'accent')
    # armoires onduleur / chargeurs (côté bordé), batteries (côté nef)
    blk(S('tech'), 'ceiling', -11.75, -11.05, YF, YF + 1.45, 5.35, 5.95, 0.03)
    for k in range(3):
        blk(S('tech'), 'metalDark', -11.70 + 0.62 * k, -11.18 + 0.62 * k, YF, YF + 0.85, ZI(-10.5) + 0.03,
            ZI(-10.5) + 0.58, 0.02)
        blk(S('led'), 'ledStrip', -11.62 + 0.62 * k, -11.40 + 0.62 * k, YF + 0.78, YF + 0.80, ZI(-10.5) + 0.58,
            ZI(-10.5) + 0.595, 0.003)
    # soute arrière (sous l'escalier de tableau) : défenses et aussières lovées
    for k, uu in enumerate((ZI(-12.8) + 0.25, 5.60)):
        for j in range(2):
            S('gear').put(lathe_mb([(0.0, -0.36), (0.07, -0.35), (0.12, -0.30), (0.13, -0.2), (0.13, 0.2), (0.12, 0.30),
                                    (0.07, 0.35), (0.0, 0.36)], seg=16),
                          T(-12.9 + 0.30 * j, YF + 0.14, uu) @ Matrix.Rotation(math.pi / 2, 4, 'Z'), 'upholsteryExterior')
    rl = MB()
    ring_tube(rl, [(-12.75 + 0.22 * math.cos(2 * math.pi * k / 20), YF + 0.04, 5.0 + 0.22 * math.sin(2 * math.pi * k / 20))
                   for k in range(20)], 0.035, seg=8)
    S('gear').put(rl, None, 'upholsteryExterior')
    # chemin de câbles (onduleurs -> moteur), orthogonal, sous l'arase
    fr = S('frames', sharp=40)
    box_o(fr.mb, -11.05, -10.25, YF + 1.30, YF + 1.36, 5.55, 5.75, fr.m('metalDark'))
    box_o(fr.mb, -10.45, -10.25, YF + 1.18, YF + 1.30, 5.10, 5.75, fr.m('metalDark'))
    # caillebotis (passage)
    for k in range(16):
        x = -11.80 + 0.11 * k
        box_o(fr.mb, x, x + 0.06, YF, YF + 0.025, 4.0, 4.3, fr.m('metalDark'))
    if utility:
        # local technique : dessalinisateur, ballon d'eau chaude, tableau électrique
        blk(S('tech'), 'ceiling', -8.45, -7.25, YF, YF + 0.70, ZI(-7.8) + 0.02, ZI(-7.8) + 0.60, 0.04)
        S('tech').put(lathe_mb([(0.0, 0.0), (0.30, 0.0), (0.30, 0.95), (0.25, 1.05), (0.0, 1.05)], seg=28),
                      T(-6.35, YF, 5.55), 'ceiling')
        blk(S('tech'), 'metalDark', -7.10, -5.75, YF, YF + 1.60, ZI(-6.4) + 0.02, ZI(-6.4) + 0.42, 0.02)
        S('screens').put(soft_slab(stadium(-6.90, -6.40, ZI(-6.4) + 0.42, ZI(-6.4) + 0.426, 0.002), YF + 1.10,
                                   YF + 1.42, 0.001, seg=1), None, 'screens')
        for k in range(3):
            p = MB()
            tube(p, [(-8.30 + 0.2 * k, YF + 0.70, ZI(-7.8) + 0.30), (-8.30 + 0.2 * k, YF + 1.40, ZI(-7.8) + 0.30),
                     (-8.30 + 0.2 * k, YF + 1.40, 5.85)], 0.02, seg=8, caps=True)
            S('tech').put(p, None, 'chrome')


# ---------------------------------------------------------------------------
# COQUE BÂBORD : suite propriétaire + quartier capitaine / carré équipage (construit côté +z, miroir)
# ---------------------------------------------------------------------------
def build_owner(ctx):
    S = Set('P')
    well = [w for w in STAIR_WELLS if w[2] + w[3] < 0][0]
    sx0, sx1 = well[0], well[1]
    build_shell(S, -1, tech=[(X_AFT, -8.70)])
    # cloisons transversales
    bulkhead(S, X_AFT, mat='ceiling')
    bulkhead(S, -8.70, gaps=[(4.45, 5.15)], mat='ceiling', leaves=[(0, 0, -1, 80)])
    bulkhead(S, -7.05, gaps=[(4.20, 5.45)], jambs=False)                      # dressing / chambre (baie)
    bulkhead(S, sx0 - WT / 2, gaps=[(5.05, 5.75)], leaves=[(0, 0, -1, 80)])    # palier -> chambre
    bulkhead(S, sx1 + WT / 2, gaps=[(5.05, 5.75)], leaves=[(0, 0, 1, 80)])     # palier -> salle de bains
    bulkhead(S, 4.78)
    bulkhead(S, 7.60, gaps=[(5.10, 5.70)], mat='ceiling', leaves=[(0, 1, -1, 80)])
    bulkhead(S, 8.78, gaps=[(5.05, 5.62)], mat='ceiling', leaves=[(0, 1, 1, 80)])
    bulkhead(S, X_FWD, mat='ceiling')
    engine_room(S)
    # --- dressing (x -8.67 -> -7.08) : penderies des deux bords, pouf
    zi_ = ZI(-7.9)
    wardrobe(S, -8.64, -7.10, zi_, zi_ + 0.60, 1)
    wardrobe(S, -8.64, -7.10, 5.50, min(ZO(-7.9, YF), ZO(-7.9, YT)) - 0.02, -1)
    ottoman(S, -7.85, 4.85, 0.26)
    # --- chambre propriétaire (x -7.02 -> -1.16)
    zi_ = ZI(-4.3)
    bed(S, -4.30, zi_, 2.00, 1.80, head_w=2.95, head_h=1.25, pillows=2)
    nightstand(S, -5.78, -5.32, zi_ + 0.16, zi_ + 0.60)
    nightstand(S, -3.28, -2.82, zi_ + 0.16, zi_ + 0.60)
    desk(S, -6.95, -5.98, zi_ + 0.02, zi_ + 0.52, -math.pi / 2)
    tub_chair(S('furn'), S('soft', wn=False), -6.30, 5.55, 0.0, YF + 0.012)
    side_table(S, -5.55, 5.92, 0.16)
    sofa(S, [(-1.19, zi_ + 0.02), (-1.19, 4.85)], D=0.78, seats=2,
         pillows=((0.3, 'upholsteryExterior'), (0.7, 'ceiling')))
    side_table(S, -2.15, zi_ + 0.35, 0.18)
    rug(S, -5.6, -3.0, 5.0, 5.95, 0.25)
    # --- palier : console + miroir côté bordé
    # --- salle de bains propriétaire (x -0.06 -> 4.75)
    zb = ZI(2.0)
    vanity(S, 0.25, 2.30, zb, zb + 0.56, basins=(0.80, 1.75))
    partition(S, 4.55, 2.45, 3.40, gaps=[(2.55, 3.20)], mat='ceiling', leaves=[(0, 0, 1, 75)])   # WC
    bulkhead(S, 2.42, u_to=4.61, mat='ceiling', jambs=False)
    bulkhead(S, 3.43, u_to=4.61, mat='ceiling', jambs=False)
    wc(S, 2.92, ZI(2.9) + 0.02, math.pi / 2)
    shower(S, 3.46, 4.74, ZI(4.1) + 0.0, min(ZO(4.1, YF), ZO(4.1, YT)) - 0.03,
           glass=[(3.43, 4.61, 3.43, 5.45)], bench=(4.25, 4.72, ZI(4.4) + 0.05, ZI(4.4) + 0.95),
           head=(3.95, ZI(4.0) + 0.35))
    tub(S, 1.70, 5.35, 0.85, 0.42)
    rug(S, 0.35, 2.35, zb + 0.70, zb + 1.30, 0.2)
    # --- cabine capitaine (x 4.81 -> 7.57) + salle d'eau (x 4.81 -> 5.88)
    bulkhead(S, 5.88, gaps=[(5.10, 5.70)], mat='ceiling', leaves=[(0, 1, 1, 80)])
    zc = ZI(6.6)
    bed(S, 6.70, zc, 1.90, 1.40, head_w=1.70, head_h=1.10, pillows=2, accent=False)
    nightstand(S, 7.44, 7.57, zc + 0.16, zc + 0.52, lampu=False)
    zw = ZI(5.3)
    shower(S, 4.83, 5.84, zw, 4.28, glass=[(4.83, 4.31, 5.40, 4.31)], head=(5.3, zw + 0.30))
    wc(S, 4.81, 4.78, 0.0)
    vanity(S, -0.32, 0.32, 0.0, 0.44, basins=(0.0,), M=T(4.81, 0, 5.62) @ RY(math.pi / 2))
    # --- sas / échelle sous le panneau de pont x 8,2
    ladder(S, 7.78, 8.42, HULL_Z, 0.46)
    # --- carré équipage + buanderie (x 8.81 -> 12.30)
    zm = ZI(9.4)
    S('soft').put(cushion(0.65, 0.07, 0.22, 0.05, top=0.012, piping=(1,), step=0.10), T(9.55, YF + 0.40, zm + 0.26),
                  'upholsteryInterior')
    blk(S('furn'), 'woodInterior', 8.86, 10.25, YF, YF + 0.33, zm + 0.02, zm + 0.50, 0.03)
    S('soft').put(cushion(0.65, 0.20, 0.06, 0.05, top=0.0, front=0.02, axis=2, piping=(1,), step=0.10),
                  T(9.55, YF + 0.66, zm + 0.08) @ RX(math.radians(-8)), 'upholsteryInterior')
    I_tbl = pebble(9.55, zm + 0.95, 0.55, 0.34, n=2.4)
    S('furn').put(soft_slab(I_tbl, YF + 0.70, YF + 0.74, 0.012, seg=2), None, 'woodInterior')
    S('metal').put(lathe_mb([(0.0, 0.0), (0.20, 0.0), (0.20, 0.012), (0.04, 0.03), (0.035, 0.70), (0.0, 0.70)],
                            seg=20), T(9.55, YF, zm + 0.95), 'metalDark')
    za = ZI(10.7)
    appliance(S, 10.40, 11.00, za + 0.01, za + 0.61, YF, YF + 0.82, 1)
    appliance(S, 10.40, 11.00, za + 0.01, za + 0.61, YF + 0.84, YF + 1.62, 1)
    zk = ZI(12.0)
    blk(S('furn'), 'woodInterior', 11.06, 12.25, YF, YF + 0.88, zk + 0.02, zk + 0.50, 0.02)
    S('furn').put(soft_slab(stadium(11.04, 12.27, zk + 0.01, zk + 0.53, 0.02, 0.08), YF + 0.88, YF + 0.91, 0.01,
                            seg=2), None, 'acrylic')
    blk(S('metal'), 'chrome', 11.45, 11.85, YF + 0.905, YF + 0.912, zk + 0.10, zk + 0.40, 0.04)
    fin(ctx, S, mirror=True)


# ---------------------------------------------------------------------------
# COQUE TRIBORD : 2 cabines invités + cabine équipage 2 couchettes + salle d'eau équipage
# ---------------------------------------------------------------------------
def build_guests(ctx):
    S = Set('S')
    well = [w for w in STAIR_WELLS if w[2] + w[3] > 0][0]
    sx0, sx1 = well[0], well[1]
    build_shell(S, 1, tech=[(X_AFT, -5.30)])
    bulkhead(S, X_AFT, mat='ceiling')
    bulkhead(S, -8.70, gaps=[(4.45, 5.15)], mat='ceiling', leaves=[(0, 1, 1, 80)])
    bulkhead(S, -5.30, gaps=[(4.45, 5.15)], mat='ceiling', leaves=[(0, 0, -1, 80)])
    bulkhead(S, -3.98, gaps=[(4.20, 5.45)], jambs=False)                       # dressing / chambre
    bulkhead(S, sx0 - WT / 2, gaps=[(5.05, 5.75)], leaves=[(0, 1, -1, 80)])
    bulkhead(S, sx1 + WT / 2, gaps=[(5.05, 5.75)], leaves=[(0, 0, 1, 80)])
    bulkhead(S, 7.60)
    bulkhead(S, 8.78, gaps=[(3.90, 4.45), (5.10, 5.60)], mat='ceiling', leaves=[(0, 0, 1, 80), (1, 1, 1, 70)])
    bulkhead(S, X_FWD, mat='ceiling')
    engine_room(S, utility=True)
    # --- INVITÉS 1 : dressing (x -5.27 -> -4.01)
    zi_ = ZI(-4.6)
    wardrobe(S, -5.25, -4.03, zi_, zi_ + 0.60, 1)
    wardrobe(S, -5.25, -4.03, 5.50, min(ZO(-4.6, YF), ZO(-4.6, YT)) - 0.02, -1)
    # chambre (x -3.95 -> 0.94)
    zi_ = ZI(-2.4)
    bed(S, -2.45, zi_, 2.00, 1.80, head_w=2.75, head_h=1.20, pillows=2)
    nightstand(S, -3.88, -3.44, zi_ + 0.16, zi_ + 0.60)
    nightstand(S, -1.46, -1.02, zi_ + 0.16, zi_ + 0.60)
    desk(S, -0.85, 0.30, zi_ + 0.02, zi_ + 0.52, -math.pi / 2)
    rug(S, -3.7, -1.2, 5.05, 5.95, 0.25)
    # salle d'eau (x 1.00 -> 3.00, |z| ZI -> 4.85) + passage d'entrée côté bordé
    bulkhead(S, 0.97, u_to=4.91, jambs=False)
    partition(S, 4.85, 1.00, sx0 - WT, gaps=[(2.15, 2.80)], leaves=[(0, 1, 1, 80)])
    zb = ZI(2.0)
    shower(S, 1.02, 1.95, zb, 4.83, glass=[(1.98, zb, 1.98, 4.30)], head=(1.45, zb + 0.25))
    vanity(S, 2.02, 2.98, zb, zb + 0.52, basins=(2.50,))
    wc(S, 2.97, 4.42, math.pi)
    # --- INVITÉS 2 (x 3.78 -> 7.57) : salle d'eau côté nef, passage côté bordé, chambre à l'avant
    partition(S, 4.85, sx1 + WT, 5.45, gaps=[(4.55, 5.20)], leaves=[(0, 0, -1, 80)])
    bulkhead(S, 5.45 + WT / 2, u_to=4.91, jambs=False)
    zb = ZI(4.6)
    shower(S, 3.80, 4.50, zb, 4.83, glass=[(4.53, zb, 4.53, 4.25)], head=(4.15, zb + 0.25))
    vanity(S, 4.58, 5.45, zb, zb + 0.50, basins=(5.0,))
    wc(S, 5.44, 4.45, math.pi)
    zc = ZI(6.55)
    bed(S, 6.55, zc, 1.90, 1.60, head_w=1.98, head_h=1.15, pillows=2)
    nightstand(S, 5.53, 5.69, zc + 0.16, zc + 0.52, lampu=False)
    nightstand(S, 7.41, 7.57, zc + 0.16, zc + 0.52, lampu=False)
    # --- ÉQUIPAGE : sas + échelle (panneau x 8,2), salle d'eau (x 8.81 -> 9.95 côté bordé), couchettes
    ladder(S, 7.78, 8.42, HULL_Z, 0.46)
    partition(S, 4.62, 8.81, 9.95, mat='ceiling')
    bulkhead(S, 9.95, u_from=4.62, mat='ceiling', jambs=False)
    zo_ = min(ZO(9.6, YF), ZO(9.6, YT))
    shower(S, 9.36, 9.91, 4.69, zo_ - 0.02, glass=[(9.33, 4.69, 9.33, 5.20)], head=(9.65, zo_ - 0.30))
    wc(S, 9.05, 4.69, math.pi / 2)
    ofn = lambda x: min(ZO(x, YF + 0.35), ZO(x, YF + 1.30))
    bunk(S, 10.05, 12.10, YF + 0.28, 4.55, ofn)
    bunk(S, 10.05, 12.10, YF + 1.18, 4.55, ofn)
    for x in (10.05, 12.10):
        blk(S('furn'), 'woodInterior', x - 0.03, x + 0.03, YF, YF + 1.62, 4.53, ofn(x) - 0.02, 0.01)
    rl = MB()
    tube(rl, [(10.4, YF + 1.55, 4.57), (11.75, YF + 1.55, 4.57)], 0.015, seg=10, caps=True, round_caps=True)
    S('metal').put(rl, None, 'chrome')
    fin(ctx, S, mirror=False)


# ---------------------------------------------------------------------------
# GARAGE + SOUTE TECHNIQUE DE NEF (entre les coques)
# ---------------------------------------------------------------------------
GX0, GX1, GZ = -13.62, -9.60, 2.95


def scooter(S, x, z, y0):
    """scooter sous-marin sur berceau : corps fuselé, carénage d'hélice, poignées."""
    M = T(x, y0 + 0.30, z) @ Matrix.Rotation(math.pi / 2, 4, 'Z')   # axe du corps le long de x
    prof = [(0.0, -0.32), (0.08, -0.31), (0.15, -0.26), (0.17, -0.15), (0.17, 0.20), (0.15, 0.30), (0.09, 0.34),
            (0.0, 0.345)]
    S('gear').put(lathe_mb(prof, seg=28), M, 'hull')
    S('gear').put(lathe_mb([(0.172, -0.10), (0.18, -0.10), (0.18, -0.04), (0.172, -0.04)], seg=28, cap=False), M,
                  'accent')
    S('gear').put(lathe_mb([(0.20, 0.36), (0.22, 0.38), (0.22, 0.50), (0.20, 0.52), (0.185, 0.50), (0.185, 0.38)],
                           seg=28, cap=False), M, 'metalDark')
    for s in (-1, 1):
        h = MB()
        tube(h, [(x - 0.05, y0 + 0.30, z + s * 0.17), (x - 0.12, y0 + 0.30, z + s * 0.30),
                 (x - 0.26, y0 + 0.30, z + s * 0.30)], 0.018, seg=8, caps=True, round_caps=True)
        S('gear').put(h, None, 'metalDark')
    for dx in (-0.20, 0.20):
        blk(S('gear'), 'metalDark', x + dx - 0.04, x + dx + 0.04, y0, y0 + 0.14, z - 0.16, z + 0.16, 0.02)


def board(S, x0, x1, uc, w, y0, side):
    pts = pebble(0.5 * (x0 + x1), uc, 0.5 * (x1 - x0), w / 2, n=2.0, seg=40)
    pts = [(x, side * z) for x, z in pts]
    S('gear').put(soft_slab(pts, y0, y0 + 0.12, 0.05, seg=3), None, 'upholsteryExterior')
    pad = pebble(0.5 * (x0 + x1) - 0.1, uc, 0.5 * (x1 - x0) * 0.42, w / 2 - 0.08, n=3.0, seg=32)
    S('gear').put(soft_slab([(x, side * z) for x, z in pad], y0 + 0.118, y0 + 0.126, 0.003, seg=1), None, 'metalDark')


def build_center(ctx):
    S = Set('C')
    fl = S('floor', sharp=40)
    xs = xgrid(GX0, 8.40, 0.25, [GX1, X_AFT])
    U = lambda x: ZI(x) - WT
    # plancher technique de nef (tôle) puis garage (plancher sombre + LED)
    xs_t = [x for x in xs if x >= GX1 - 1e-9]
    tdm = fl.m('metalDark')
    # bande centrale + bandes latérales le long des coques (plancher à TD(x))
    A = lambda p: fl.mb.add(p)
    for a, b in zip(xs_t, xs_t[1:]):
        ya, yb = TD(a), TD(b)
        q = [A((a, ya, -U(a))), A((b, yb, -U(b))), A((b, yb, U(b))), A((a, ya, U(a)))]
        fl.mb.face_o(q, tdm, (0, 1, 0))
    # garage : plancher + flancs latéraux (de |z| 2,95 aux coques) au même niveau
    xs_g = [x for x in xs if x <= GX1 + 1e-9]
    gm = fl.m('interiorFloor')
    for a, b in zip(xs_g, xs_g[1:]):
        y = TD(a)
        fl.mb.face_o([A((a, y, -GZ)), A((b, y, -GZ)), A((b, y, GZ)), A((a, y, GZ))], gm, (0, 1, 0))
        for s in (1, -1):
            fl.mb.face_o([A((a, y, s * GZ)), A((b, y, s * GZ)), A((b, y, s * U(b))), A((a, y, s * U(a)))], tdm,
                         (0, 1, 0))
    w = S('walls', sharp=40)
    yg = TD(GX0)
    for s in (1, -1):
        z0, z1 = sorted((s * GZ, s * (GZ + WT)))
        box_o(w.mb, GX0, GX1, yg, YT, z0, z1, w.m('ceiling'), w.m('metalDark'))
    box_o(w.mb, GX1, GX1 + WT, yg, YT, -U(GX1), U(GX1), w.m('ceiling'), w.m('metalDark'))
    # garage : 2 scooters, 4 paddles sur racks, LED
    for z in (-0.85, 0.85):
        scooter(S, -11.6, z, yg)
    for s in (1, -1):
        for k, yb in enumerate((yg + 0.12, yg + 0.42)):
            board(S, -13.35, -10.15, 2.30, 0.78, yb, s)
        for x in (-12.9, -11.7, -10.5):
            for yb in (yg + 0.12, yg + 0.42):
                blk(S('metal'), 'chrome', x - 0.02, x + 0.02, yb - 0.03, yb, s * 1.85 - 0.02 if s > 0 else -2.92,
                    2.92 if s > 0 else -1.85 + 0.02, 0.008)
            blk(S('metal'), 'metalDark', x - 0.03, x + 0.03, yg, YT - 0.05, (2.86 if s > 0 else -2.92),
                (2.92 if s > 0 else -2.86), 0.008)
    S('led').put(soft_slab(stadium(GX0 + 0.3, GX1 - 0.3, -0.06, 0.06, 0.05), yg + 0.001, yg + 0.006, 0.002, seg=1),
                 None, 'ledStrip')
    # soute technique : réservoirs d'eau (alu), groupes froids, batteries de service, colonne de mât
    t = S('tech')
    for s in (1, -1):
        for (x0, x1) in ((-8.9, -6.3), (-5.6, -3.0)):
            y = TD(x0)
            blk(t, 'metalDark', x0, x1, y, y + 0.40, min(s * 0.6, s * 2.75), max(s * 0.6, s * 2.75), 0.08)
        y = TD(5.0) + 0.01
        blk(t, 'metalDark', 3.6, 5.0, y, y + 0.30, min(s * 0.8, s * 2.2), max(s * 0.8, s * 2.2), 0.06)
    y = TD(-1.0)
    for k in range(4):
        blk(t, 'metalDark', -2.2 + 0.55 * k, -1.75 + 0.55 * k, y, y + 0.42, -0.45, 0.45, 0.02)
        blk(S('led'), 'ledStrip', -2.12 + 0.55 * k, -1.83 + 0.55 * k, y + 0.36, y + 0.375, 0.45, 0.46, 0.002)
    yc = TD(7.6)
    t.put(lathe_mb([(0.0, 0.0), (0.16, 0.0), (0.16, 0.03), (0.10, 0.06), (0.10, YT - yc - 0.02), (0.0, YT - yc - 0.02)],
                   seg=28), T(7.6, yc, 0.0), 'metalDark')
    for s in (1, -1):   # collecteurs (tuyauterie le long de la nef)
        p = MB()
        tube(p, [(-9.4, TD(-9.4) + 0.58, s * 0.62), (3.0, TD(3.0) + 0.58, s * 0.62)], 0.03, seg=8, caps=True)
        t.put(p, None, 'chrome')
    fin(ctx, S)


def build(ctx):
    build_owner(ctx)
    build_guests(ctx)
    build_center(ctx)
    build_stairs(ctx)
