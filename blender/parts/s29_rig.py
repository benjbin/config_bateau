"""SILLAGE 29 — gréement (groupe three.js 'roof') : mât carbone en aile, barres de flèche, haubans, étai + foc
enroulé, bôme à enrouleur, hale-bas rigide, écoute + chariot sur le hardtop, tête de mât (feu, anémomètre, VHF).

Cotes imposées : lib/s29_lines.py (MAST_*, BOOM_*, FORESTAY, CHAINPLATES, SPREADERS_Y, HT_*).
Cotes choisies ici (documentées) :
  - quête du mât RAKE = 1,0° vers l'arrière (compromis : l'étai FORESTAY arrive à x = 7,75 à y = 35,2, quasi à
    l'aplomb du pied ; avec 1,0° le bord d'attaque est ~0,5 m en arrière -> ferrure d'étai profilée en carbone) ;
  - section du mât : « goutte » à 2 cercles tangents (bord d'attaque Ø = largeur, bord de fuite Ø = 0,3 × largeur),
    0,62 × 0,30 constante jusqu'à y = 12 puis effilée jusqu'à 0,36 × 0,18 en tête (y = 37,88) ;
  - barres de flèche (3 étages) en aile, flèche ~26° ; extrémités sur la droite (vue de dessus) cadène -> capelage ;
    les haubans (Ø 16 mm) forment un polygone convexe cadène -> barres 1, 2, 3 -> capelage y = 36,4 ;
    diagonales D2/D3 : extrémité barre n -> pied de barre n+1 ;
  - bôme : section superellipse 0,75 × 0,45 creuse (fente d'enrouleur sur le dessus, grand-voile enroulée
    visible dans la fente), dessus constant à BOOM_Y + 0,375, fond remontant légèrement vers l'arrière ;
    dessous >= 7,975 -> garde >= 0,425 m sur le hardtop (7,55) ;
  - bande anti-UV du foc : 'upholsteryInterior' (toile marine) — seul nom de matériau « toile foncée » disponible.
"""
import math
import bpy
import bmesh
from mathutils import Vector, Matrix

from s29_lines import (MAST_X, MAST_Y0, MAST_TOP_Y, MAST_CHORD, MAST_WIDTH, BOOM_Y, BOOM_X1, FORESTAY,
                       CHAINPLATES, SPREADERS_Y, HT_Y, HT_X0, HT_X1, HT_ZH, clamp01, ss)
from hull import MB, make_obj, lathe, tube, rbox_mb, on_normal

GROUP = 'roof'
RAKE = math.radians(1.0)
Y_TOPMAST = MAST_TOP_Y - 0.12      # fin du tube (capuchon/ferrure au-dessus)
Y_CAP = 36.4                       # capelage des haubans
CHORD_TOP, WIDTH_TOP = 0.36, 0.18
CABLE_R = 0.008                    # haubans Ø 16 mm
STAY_R = 0.011                     # étai Ø 22 mm
BOOM_H, BOOM_W = 0.75, 0.45
BOOM_TOP = BOOM_Y + BOOM_H / 2
BOOM_XF = 6.98                     # avant de la bôme (vit-de-mulet entre elle et le mât)
TRAV_X = HT_X0 + 0.32              # rail d'écoute sur le bord arrière du hardtop


# ------------------------------------------------------------------------------------------------ outils
def V(*a):
    return Vector(a)


def mast_x(y):
    return MAST_X - (y - MAST_Y0) * math.tan(RAKE)


def mast_dims(y):
    t = clamp01((y - 12.0) / (Y_TOPMAST - 12.0))
    t = t ** 1.15
    return MAST_CHORD + (CHORD_TOP - MAST_CHORD) * t, MAST_WIDTH + (WIDTH_TOP - MAST_WIDTH) * t


def teardrop(c, w, n1=18, n2=10, nl=4):
    """section en goutte (plan local (a, b) : a vers l'avant, b latéral), bord d'attaque en +a."""
    R1, R2 = w / 2, 0.3 * w / 2
    C1, C2 = c / 2 - R1, -c / 2 + R2
    D = C1 - C2
    phi = math.acos((R1 - R2) / D)
    pts = []
    for k in range(n1):                       # arc avant  -phi -> +phi
        a = -phi + 2 * phi * k / n1
        pts.append((C1 + R1 * math.cos(a), R1 * math.sin(a)))
    pA, pB = (C1 + R1 * math.cos(phi), R1 * math.sin(phi)), (C2 + R2 * math.cos(phi), R2 * math.sin(phi))
    for k in range(nl):
        t = k / nl
        pts.append((pA[0] + (pB[0] - pA[0]) * t, pA[1] + (pB[1] - pA[1]) * t))
    for k in range(n2):                       # arc arrière  phi -> 2pi - phi
        a = phi + (2 * math.pi - 2 * phi) * k / n2
        pts.append((C2 + R2 * math.cos(a), R2 * math.sin(a)))
    pA, pB = (C2 + R2 * math.cos(-phi), R2 * math.sin(-phi)), (C1 + R1 * math.cos(-phi), R1 * math.sin(-phi))
    for k in range(nl):
        t = k / nl
        pts.append((pA[0] + (pB[0] - pA[0]) * t, pA[1] + (pB[1] - pA[1]) * t))
    return pts


def loft(mb, rows, mat=0, cap0=True, cap1=True):
    idx = [[mb.add(p) for p in r] for r in rows]
    n = len(rows[0])
    for a in range(len(rows) - 1):
        for j in range(n):
            k = (j + 1) % n
            mb.face([idx[a][j], idx[a][k], idx[a + 1][k], idx[a + 1][j]], mat)
    if cap0:
        mb.face(list(reversed(idx[0])), mat)
    if cap1:
        mb.face(list(idx[-1]), mat)
    return idx


def fix_normals(ob):
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(ob.data)
    bm.free()
    ob.data.update()


def mk(ctx, name, mb, mats, smooth=True, sharp=None):
    ob = make_obj(ctx, name, mb, mats, smooth=smooth, sharp_deg=sharp)
    fix_normals(ob)
    ctx.link(ob, GROUP)
    return ob


def frame_from(z_axis_dir, up_hint=Vector((0, 1, 0))):
    """repère (u, v, w) : w = direction ; u ⟂ w le plus proche de up_hint."""
    w = z_axis_dir.normalized()
    u = up_hint - w * up_hint.dot(w)
    if u.length < 1e-6:
        u = Vector((1, 0, 0)) - w * w.x
    u.normalize()
    v = w.cross(u)
    return u, v, w


def line_pts(a, b, n):
    a, b = Vector(a), Vector(b)
    return [tuple(a + (b - a) * (i / (n - 1))) for i in range(n)]


def disc_lathe(mb, prof, M, seg, mat):
    """lathe fermé (profil commençant et finissant à r = 0), mb soudé."""
    lathe(mb, prof, seg=seg, mat=mat, M=M, cap_top=False)


# ------------------------------------------------------------------------------------------------ mât
def build_mast(ctx):
    mb = MB()
    ys = [MAST_Y0 - 0.05] + [MAST_Y0 + 0.25 + i * (Y_TOPMAST - MAST_Y0 - 0.25) / 22 for i in range(23)]
    rows = []
    for y in ys:
        c, w = mast_dims(y)
        cx = mast_x(y)
        rows.append([(cx + a, y, b) for a, b in teardrop(c, w)])
    loft(mb, rows, 0)
    # rail de grand-voile (bord de fuite) depuis la bôme jusqu'en tête
    tr = MB()
    trows = []
    for y in [BOOM_Y - 0.3 + i * (Y_TOPMAST - 0.25 - BOOM_Y + 0.3) / 10 for i in range(11)]:
        c, w = mast_dims(y)
        x0 = mast_x(y) - c / 2 + 0.01
        trows.append([(x0, y, -0.022), (x0 - 0.045, y, -0.022), (x0 - 0.045, y, 0.022), (x0, y, 0.022)])
    loft(tr, trows, 1)
    mb.merge(tr)
    # collier/étambrai au pied
    col = MB()
    c, w = mast_dims(MAST_Y0)
    for y0, y1, o in ((MAST_Y0 - 0.02, MAST_Y0 + 0.10, 0.06), (MAST_Y0 + 0.10, MAST_Y0 + 0.16, 0.035)):
        rr = []
        for y in (y0, y1):
            rr.append([(mast_x(y) + a * (1 + o / c * 2), y, b * (1 + o / w * 2)) for a, b in teardrop(c, w)])
        loft(col, rr, 0)
    mb.merge(col)
    # ferrure d'étai (lame profilée vers l'avant jusqu'au point FORESTAY haut)
    top = Vector(FORESTAY[1])
    c, w = mast_dims(top.y)
    le = mast_x(top.y) + c / 2
    tg = MB()
    rows = []
    for k, x in enumerate([le - 0.18, (le + top.x) / 2, top.x + 0.06]):
        hh = [0.34, 0.22, 0.09][k]
        th = [0.05, 0.04, 0.035][k]
        yc = top.y + [0.12, 0.05, 0.0][k]
        rows.append([(x, yc + hh / 2 * math.sin(a), th / 2 * math.cos(a)) for a in
                     [2 * math.pi * i / 12 for i in range(12)]])
    loft(tg, rows, 0)
    mb.merge(tg)
    # capuchon de tête
    yc = Y_TOPMAST
    c, w = mast_dims(yc)
    cap = MB()
    rows = []
    for k in range(5):
        a = k / 4 * math.pi / 2
        s = math.cos(a) * 0.96 + 0.04
        y = yc + 0.12 * math.sin(a)
        rows.append([(mast_x(y) + p * s, y, q * s) for p, q in teardrop(c, w)])
    loft(cap, rows, 0, cap0=True, cap1=True)
    mb.merge(cap)
    return mk(ctx, 'rig_mast', mb, ['metalDark', 'chrome'])


# ------------------------------------------------------------------------------------------------ haubans
def rig_points():
    """extrémités de barres de flèche et capelage (côté tribord, z > 0)."""
    cp = Vector(CHAINPLATES[0])
    xcap = mast_x(Y_CAP)
    zcap = mast_dims(Y_CAP)[1] / 2 + 0.01
    tipz = [4.2, 2.75, 1.35]
    tips = []
    for y, z in zip(SPREADERS_Y, tipz):
        x = cp.x + (cp.z - z) / (cp.z - zcap) * (xcap - cp.x)
        tips.append(Vector((x, y, z)))
    return cp, tips, Vector((xcap, Y_CAP, zcap))


def build_spreaders(ctx):
    mb = MB()
    cp, tips, capp = rig_points()
    for side in (1, -1):
        for i, t in enumerate(tips):
            tip = Vector((t.x, t.y, t.z * side))
            root = Vector((mast_x(t.y), t.y - 0.02, 0.0))
            A = tip - root
            H = Vector((0, 1, 0)).cross(A).normalized()
            if H.x < 0:
                H = -H
            Vv = A.cross(H).normalized()
            if Vv.y < 0:
                Vv = -Vv
            rows = []
            n = 7
            for k in range(n):
                s = k / (n - 1)
                p = root + A * s
                ch = 0.30 - 0.16 * s
                th = 0.075 - 0.035 * s
                row = []
                for j in range(12):
                    a = 2 * math.pi * j / 12
                    ca = math.cos(a)
                    # profil légèrement asymétrique (nez rond, fuite effilée)
                    f = ch / 2 * (ca if ca > 0 else ca * 1.15) - ch * 0.04
                    row.append(tuple(p + H * f + Vv * (th / 2 * math.sin(a) * (1 - 0.25 * max(-ca, 0)))))
                rows.append(row)
            loft(mb, rows, 0)
            # embout chromé
            M = on_normal(tip - A.normalized() * 0.06, A)
            m2 = MB(weld=True)
            disc_lathe(m2, [(0, 0), (0.028, 0.0), (0.030, 0.05), (0.022, 0.09), (0, 0.10)], M, 10, 1)
            mb.merge(m2)
    # feux de pont sous les barres basses
    return mk(ctx, 'rig_spreaders', mb, ['metalDark', 'chrome'])


def build_shrouds(ctx):
    mb = MB()
    cp, tips, capp = rig_points()
    for side in (1, -1):
        def S(p):
            return Vector((p.x, p.y, p.z * side))
        chain = [S(cp)] + [S(t) for t in tips] + [S(capp)]
        for a, b in zip(chain, chain[1:]):
            tube(mb, line_pts(a, b, 2), CABLE_R, seg=6, mat=0)
        # diagonales : extrémité barre n -> pied de barre n+1
        for i in range(2):
            a = S(tips[i])
            y = tips[i + 1].y - 0.05
            b = Vector((mast_x(y), y, mast_dims(y)[1] / 2 * side))
            tube(mb, line_pts(a, b, 2), CABLE_R * 0.85, seg=6, mat=0)
        # ridoir + cadène
        c = S(cp)
        d = (S(tips[0]) - c).normalized()
        M = on_normal(c, d)
        m2 = MB(weld=True)
        disc_lathe(m2, [(0, -0.06), (0.03, -0.06), (0.03, 0.0), (0.022, 0.05), (0.022, 0.32), (0.014, 0.40),
                        (0, 0.42)], M, 8, 0)
        mb.merge(m2)
    return mk(ctx, 'rig_shrouds', mb, ['chrome'])


# ------------------------------------------------------------------------------------------------ étai + foc
def build_forestay(ctx):
    P0, P1 = Vector(FORESTAY[0]), Vector(FORESTAY[1])
    D = (P1 - P0)
    L = D.length
    d = D.normalized()
    mb = MB()
    tube(mb, [tuple(P0), tuple(P1)], STAY_R, seg=8, mat=0)
    # tambour d'enrouleur : toggle vertical depuis la poutre (2,70) + tambour aligné sur l'étai
    m2 = MB(weld=True)
    disc_lathe(m2, [(0, 2.70), (0.17, 2.70), (0.17, 2.74), (0.05, 2.76), (0.045, 2.95), (0, 2.96)],
               Matrix.Translation((P0.x, 0, P0.z)), 16, 1)
    mb.merge(m2)
    M = on_normal(P0, d)
    m3 = MB(weld=True)
    disc_lathe(m3, [(0, -0.02), (0.05, -0.02), (0.05, 0.03), (0.20, 0.03), (0.20, 0.07), (0.19, 0.075),
                    (0.19, 0.17), (0.20, 0.175), (0.20, 0.21), (0.06, 0.21), (0.05, 0.40), (0.04, 0.50), (0, 0.50)],
               M, 24, 1)
    mb.merge(m3)
    # émerillon de drisse en tête de foc
    sw = 0.93 * L
    M = on_normal(P0 + d * sw, d)
    m4 = MB(weld=True)
    disc_lathe(m4, [(0, -0.05), (0.04, -0.05), (0.055, 0.0), (0.055, 0.16), (0.03, 0.22), (0, 0.22)], M, 12, 1)
    mb.merge(m4)
    stay = mk(ctx, 'rig_forestay', mb, ['chrome', 'metalDark'], sharp=40)

    # foc enroulé : fuseau autour de l'étai, ondulation hélicoïdale (spires de la chute) + bande UV en ruban
    s0, s1 = 0.50 + 0.05, sw - 0.02
    u, v, w = frame_from(d, Vector((1, 0, 0)))
    NS, NR = 20, 170
    TURNS = 6.5

    def rad(t):
        # mince à l'amure, gonflé vers le bas (bordure), effilé vers la têtière
        return max(0.035 + 0.17 * ss(0.0, 0.07, t) * (1 - 0.82 * t ** 1.1), 0.028)

    def surf(t, a, dr=0.0):
        ph = 2 * math.pi * TURNS * t
        dphi = (a - ph) % (2 * math.pi)
        bump = 0.10 * math.exp(-((dphi - 0.6) / 0.55) ** 2) - 0.03 * math.cos(a - ph)
        c = P0 + d * (s0 + (s1 - s0) * t)
        return c + (u * math.cos(a) + v * math.sin(a)) * (rad(t) * (1 + bump) + dr)

    jib = MB()
    rows = [[tuple(surf(i / NR, 2 * math.pi * j / NS)) for j in range(NS)] for i in range(NR + 1)]
    idx = loft(jib, rows, 0, cap0=False, cap1=False)
    for e, sg in ((0, -1), (NR, 1)):                     # bouts fermés en pointe vers l'étai
        c = jib.add(tuple(P0 + d * ((s0 if e == 0 else s1) + sg * 0.03)))
        for j in range(NS):
            k = (j + 1) % NS
            jib.face([idx[e][j], idx[e][k], c], 0)
    # bande anti-UV : ruban hélicoïdal posé sur la chute (bord libre), de l'amure (au-dessus du point d'écoute)
    # jusqu'à la têtière
    rows = []
    NB = 5
    for i in range(int(NR * 0.03), NR - 1):
        t = i / NR
        ph = 2 * math.pi * TURNS * t
        top = [surf(t, ph + 0.12 + 1.0 * q / (NB - 1), 0.010) for q in range(NB)]
        bot = [surf(t, ph + 0.12 + 1.0 * q / (NB - 1), -0.004) for q in reversed(range(NB))]
        rows.append([tuple(p) for p in top + bot])
    loft(jib, rows, 1)
    sail = mk(ctx, 'rig_jib', jib, ['upholsteryExterior', 'upholsteryInterior'])
    ctx.link(sail, 'sails')   # groupe à part : le configurateur le masque quand le foc est déroulé
    return stay, sail


# ------------------------------------------------------------------------------------------------ bôme
def superellipse(hw, hh, n, k):
    """points (z, y) d'une superellipse, angle k ∈ [0, 2pi)."""
    c, s = math.cos(k), math.sin(k)
    return (hw * math.copysign(abs(c) ** (2 / n), c), hh * math.copysign(abs(s) ** (2 / n), s))


def boom_section(h):
    """boucle fermée (z, y) relative au dessus de bôme : coque creuse avec fente sur le dessus."""
    hw, hh = BOOM_W / 2, h / 2
    t = 0.022
    slot = 0.075
    n = 2.6
    yc = -hh                                       # centre de la section sous le dessus
    outer, inner = [], []
    # angle de la lèvre : dessus, |z| = slot
    N = 30
    # angle de la lèvre (z = slot sur le dessus), par dichotomie
    lo, hi = 0.0, math.pi / 2
    for _ in range(40):
        m = (lo + hi) / 2
        z, _y = superellipse(hw, hh, n, m)
        if z > slot:
            lo = m
        else:
            hi = m
    ka = (lo + hi) / 2
    for i in range(N + 1):                          # de ka (lèvre tribord) en descendant jusqu'à pi - ka
        k = ka - (2 * math.pi - (math.pi - 2 * ka)) * i / N
        z, y = superellipse(hw, hh, n, k)
        outer.append((z, y + yc))
        zi, yi = superellipse(hw - t, hh - t, n, k)
        inner.append((zi, yi + yc))
    loop = outer + [(-slot, -0.06), (-slot + 0.004, -0.10)]
    loop += list(reversed(inner))
    loop += [(slot - 0.004, -0.10), (slot, -0.06)]
    # lèvres arrondies vers l'intérieur
    return loop


def build_boom(ctx):
    mb = MB()
    xs = [BOOM_XF, BOOM_XF - 0.05] + [BOOM_XF - 0.3 - i * (BOOM_XF - 0.3 - BOOM_X1) / 14 for i in range(15)]
    rows = []
    for x in xs:
        h = BOOM_H - 0.11 * ss(-1.0, BOOM_X1, x)
        rows.append([(x, BOOM_TOP + y, z) for z, y in boom_section(h)])
    idx = loft(mb, rows, 0, cap0=True, cap1=True)
    # embout arrière arrondi (bouchon) et réas
    h = BOOM_H - 0.11
    cap = MB()
    rr = []
    for k in range(5):
        a = k / 4 * math.pi / 2
        s = 0.12 + 0.88 * math.cos(a)
        x = BOOM_X1 - 0.12 * math.sin(a)
        hw, hh = BOOM_W / 2 * s + 0.004, h / 2 * s + 0.004
        rr.append([(x, BOOM_TOP - h / 2 + y, z) for z, y in
                   [superellipse(hw, hh, 2.6, 2 * math.pi * j / 32)[::1] for j in range(32)]])
    loft(cap, rr, 0, cap0=True, cap1=True)
    mb.merge(cap)
    cap = MB()
    rr = []
    for k in range(4):
        a = k / 3 * math.pi / 2
        sc = 0.55 + 0.45 * math.cos(a)
        x = BOOM_XF - 0.03 + 0.10 * math.sin(a)
        hw, hh = BOOM_W / 2 * sc + 0.004, BOOM_H / 2 * sc + 0.004
        rr.append([(x, BOOM_TOP - BOOM_H / 2 + y, z) for z, y in
                   [superellipse(hw, hh, 2.6, 2 * math.pi * j / 32) for j in range(32)]])
    loft(cap, rr, 0, cap0=True, cap1=True)
    mb.merge(cap)
    # grand-voile enroulée (mandrin) visible dans la fente
    sail = MB()
    tube(sail, [(BOOM_XF - 0.25, BOOM_TOP - 0.24, 0), (BOOM_X1 + 0.35, BOOM_TOP - 0.24, 0)], 0.15, seg=16, mat=1)
    mb.merge(sail)
    # vit-de-mulet + tambour/moteur d'enrouleur
    gn = rbox_mb(0.36, 0.30, 0.17, 0.05, M=Matrix.Translation((BOOM_XF + 0.12, BOOM_Y + 0.02, 0)), mat=0)
    mb.merge(gn)
    # rail du point d'écoute sur le dessus (de chaque côté de la fente)
    for s in (1, -1):
        box_strip(mb, BOOM_XF - 0.6, BOOM_X1 + 0.5, BOOM_TOP - 0.003, BOOM_TOP + 0.018, s * 0.105, s * 0.145, 2)
    ob = mk(ctx, 'rig_boom', mb, ['metalDark', 'upholsteryExterior', 'chrome'], sharp=55)
    return ob


def box_strip(mb, x0, x1, y0, y1, z0, z1, mat):
    za, zb = min(z0, z1), max(z0, z1)
    rows = [[(x, y0, za), (x, y0, zb), (x, y1, zb - 0.006), (x, y1, za + 0.006)] for x in (x0, x1)]
    loft(mb, rows, mat)


# ------------------------------------------------------------------------------------------------ hale-bas, écoute
def build_vang_sheet(ctx):
    mb = MB()
    yb = BOOM_TOP - BOOM_H                     # dessous de bôme (avant)
    A = Vector((5.05, yb + 0.02, 0))
    yv = 5.45
    c, w = mast_dims(yv)
    B = Vector((mast_x(yv) - c / 2 + 0.02, yv, 0))
    d = (A - B)
    L = d.length
    dn = d.normalized()
    # tube extérieur (côté mât) + tige (côté bôme) + embouts
    tube(mb, [tuple(B + dn * 0.10), tuple(B + dn * (0.62 * L))], 0.068, seg=16, mat=0)
    tube(mb, [tuple(B + dn * (0.60 * L)), tuple(A - dn * 0.10)], 0.045, seg=16, mat=1)
    for p, q in ((B, dn), (A, -dn)):
        M = on_normal(p, q)
        m2 = MB(weld=True)
        disc_lathe(m2, [(0, 0.0), (0.05, 0.0), (0.055, 0.04), (0.055, 0.10), (0.07, 0.12), (0.07, 0.16),
                        (0, 0.16)], M, 12, 0)
        mb.merge(m2)
    # ferrures (chapes)
    mb.merge(rbox_mb(0.10, 0.16, 0.12, 0.025, M=Matrix.Translation(tuple(B + V(0.02, 0, 0))), mat=0))
    mb.merge(rbox_mb(0.22, 0.08, 0.12, 0.025, M=Matrix.Translation(tuple(A + V(0, 0.01, 0))), mat=0))

    # rail de chariot d'écoute sur le bord arrière du hardtop
    TZ = 3.1
    yt = HT_Y
    mb2 = MB()
    rows = []
    for z in (-TZ, TZ):
        rows.append([(TRAV_X - 0.065, yt - 0.06, z), (TRAV_X + 0.065, yt - 0.06, z),
                     (TRAV_X + 0.055, yt + 0.035, z), (TRAV_X - 0.055, yt + 0.035, z)])
    loft(mb2, rows, 0)
    for s in (1, -1):                           # butées
        mb2.merge(rbox_mb(0.16, 0.10, 0.09, 0.025, M=Matrix.Translation((TRAV_X, yt + 0.0, s * (TZ - 0.02))), mat=0))
    # chariot + poulie
    mb2.merge(rbox_mb(0.17, 0.07, 0.32, 0.025, M=Matrix.Translation((TRAV_X, yt + 0.06, 0.6)), mat=1))
    Xb = BOOM_X1 + 0.55
    yb2 = BOOM_TOP - (BOOM_H - 0.11 * ss(-1.0, BOOM_X1, Xb))
    blocks = []
    for (bx, by, bz, dn) in ((TRAV_X, yt + 0.16, 0.6, 1), (Xb, yb2 - 0.11, 0.0, -1)):
        M = Matrix.Translation((bx, by, bz)) @ Matrix.Rotation(math.pi / 2, 4, 'X')
        m3 = MB(weld=True)
        disc_lathe(m3, [(0, -0.03), (0.06, -0.03), (0.075, 0.0), (0.06, 0.03), (0, 0.03)], M, 14, 2)
        mb2.merge(m3)
        mb2.merge(rbox_mb(0.05, 0.09, 0.045, 0.012,
                          M=Matrix.Translation((bx, by + dn * 0.07, bz)), mat=1))
        blocks.append(Vector((bx, by, bz)))
    # brins d'écoute (4)
    a, b = blocks
    for k in range(4):
        off = V(0, 0, (k - 1.5) * 0.022)
        tube(mb2, [tuple(a + off + V(0, 0.05, 0)), tuple(b + off - V(0, 0.05, 0))], 0.0065, seg=6, mat=3)
    # sangle/hale-bas de poulie sous la bôme
    mb.merge(mb2)
    return mk(ctx, 'rig_vang_sheet', mb, ['metalDark', 'chrome', 'chrome', 'upholsteryExterior'])


# ------------------------------------------------------------------------------------------------ tête de mât, feux
def build_masthead(ctx):
    mb = MB()
    yt = Y_TOPMAST + 0.12
    xt = mast_x(yt)
    c, w = mast_dims(Y_TOPMAST)
    # ferrure de tête (plateau)
    mb.merge(rbox_mb(c * 0.95, 0.06, w * 1.05, 0.02, M=Matrix.Translation((xt, yt - 0.01, 0)), mat=0))
    # feu de tête (navWhite) sur embase
    m = MB(weld=True)
    disc_lathe(m, [(0, 0), (0.06, 0), (0.06, 0.03), (0.05, 0.035), (0, 0.035)],
               Matrix.Translation((xt + 0.05, yt + 0.02, 0)), 14, 0)
    mb.merge(m)
    m = MB(weld=True)
    disc_lathe(m, [(0, 0), (0.045, 0), (0.048, 0.05), (0.042, 0.10), (0, 0.10)],
               Matrix.Translation((xt + 0.05, yt + 0.055, 0)), 14, 1)
    mb.merge(m)
    m = MB(weld=True)
    disc_lathe(m, [(0, 0), (0.05, 0), (0.05, 0.015), (0, 0.02)],
               Matrix.Translation((xt + 0.05, yt + 0.155, 0)), 14, 0)
    mb.merge(m)
    # antenne VHF (fouet) à l'arrière
    m = MB(weld=True)
    disc_lathe(m, [(0, 0), (0.02, 0), (0.02, 0.10), (0.011, 0.14), (0.008, 1.25), (0, 1.27)],
               Matrix.Translation((xt - c * 0.35, yt + 0.02, 0)), 8, 0)
    mb.merge(m)
    # potence (crane) vers l'avant, légèrement relevée, puis anémomètre
    ang = math.radians(6)
    L = 1.05
    p0 = Vector((xt + c * 0.2, yt - 0.03, 0))
    dirc = Vector((math.cos(ang), math.sin(ang), 0))
    rows = []
    for k in range(6):
        s = k / 5
        p = p0 + dirc * (L * s)
        hh = 0.10 - 0.05 * s
        hw = 0.05 - 0.02 * s
        rows.append([tuple(p + V(0, hh / 2 * math.sin(a), hw / 2 * math.cos(a))) for a in
                     [2 * math.pi * j / 10 for j in range(10)]])
    loft(mb, rows, 0)
    tip = p0 + dirc * L
    m = MB(weld=True)
    disc_lathe(m, [(0, 0), (0.016, 0), (0.016, 0.22), (0.022, 0.24), (0.022, 0.30), (0, 0.31)],
               Matrix.Translation(tuple(tip)), 8, 0)
    mb.merge(m)
    hub = tip + V(0, 0.27, 0)
    for k in range(3):                      # coupelles
        a = 2 * math.pi * k / 3
        e = V(math.cos(a), 0, math.sin(a))
        tube(mb, [tuple(hub), tuple(hub + e * 0.11)], 0.004, seg=6, mat=0)
        q = MB(weld=True)
        M = Matrix.Translation(tuple(hub + e * 0.13)) @ Matrix.Rotation(a + math.pi / 2, 4, 'Y')
        disc_lathe(q, [(0, -0.025), (0.018, -0.02), (0.025, 0.0), (0.018, 0.02), (0, 0.025)],
                   M @ Matrix.Rotation(math.pi / 2, 4, 'X'), 8, 2)
        mb.merge(q)
    # girouette
    tube(mb, [tuple(hub + V(0, 0.04, 0)), tuple(hub + V(-0.22, 0.05, 0))], 0.005, seg=6, mat=0)
    mb.merge(rbox_mb(0.09, 0.07, 0.006, 0.002, M=Matrix.Translation(tuple(hub + V(-0.24, 0.05, 0))), mat=0))

    # feu de route (steaming, navWhite) sur le bord d'attaque + projecteurs de pont sous la barre basse
    ys = 19.0
    c, w = mast_dims(ys)
    le = mast_x(ys) + c / 2
    mb.merge(rbox_mb(0.08, 0.16, 0.12, 0.03, M=Matrix.Translation((le + 0.015, ys, 0)), mat=0))
    mb.merge(rbox_mb(0.03, 0.10, 0.08, 0.012, M=Matrix.Translation((le + 0.058, ys, 0)), mat=1))
    yd = SPREADERS_Y[0] - 0.10
    c, w = mast_dims(yd)
    for s in (1, -1):
        for xo in (0.08, -0.12):
            P = Vector((mast_x(yd) + xo, yd - 0.04, s * (w / 2 + 0.05)))
            mb.merge(rbox_mb(0.16, 0.07, 0.10, 0.025, M=Matrix.Translation(tuple(P)), mat=0))
            mb.merge(rbox_mb(0.12, 0.015, 0.075, 0.006, M=Matrix.Translation(tuple(P - V(0, 0.035, 0))), mat=1))
    # projecteurs sous le capelage pour éclairer le flybridge/pont avant
    return mk(ctx, 'rig_masthead_lights', mb, ['metalDark', 'navWhite', 'chrome'])


# ------------------------------------------------------------------------------------------------
def build(ctx):
    obs = [build_mast(ctx), build_spreaders(ctx), build_shrouds(ctx)]
    obs += list(build_forestay(ctx))
    obs += [build_boom(ctx), build_vang_sheet(ctx), build_masthead(ctx)]
    tris = 0
    for o in obs:
        o.data.calc_loop_triangles()
        tris += len(o.data.loop_triangles)
    # contrôles
    boom_bottom = min(v.co.z for v in bpy.data.objects['rig_boom'].data.vertices
                      if HT_X0 - 0.2 <= v.co.x <= HT_X1 + 0.2 and v.co.z < BOOM_Y)
    cp, tips, capp = rig_points()
    print(f'[s29_rig] triangles={tris}  dessous bôme sur hardtop={boom_bottom:.3f} '
          f'(garde {boom_bottom - HT_Y:.3f} m)  barres z={[round(t.z, 2) for t in tips]} '
          f'x={[round(t.x, 2) for t in tips]}')
