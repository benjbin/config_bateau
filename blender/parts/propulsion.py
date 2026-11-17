"""DIÈDRE 29 — propulsion électrique (groupe three.js 'hull').

  - 2 pods électriques orientables (bâbord / tribord) sous la voûte arrière : aileron profilé NACA,
    nacelle carénée, hélices contrarotatives (avant 4 pales Ø 0,84 m, arrière 5 pales Ø 0,72 m) en bronze
    nickel-aluminium, anode zinc annulaire + cône d'anode en bout de moyeu ;
  - propulseur d'étrave : tunnel transversal (ouverture sur les deux bords de la carène) avec grille.
Repère three.js (+X avant, +Y haut, +Z tribord), converti par make_obj (hull.py).
"""
import math
from mathutils import Matrix, Vector

from lines import section
import bmesh
from hull import MB, make_obj, lathe, loft_rows, add_bevel, add_wn


def fix_closed(ob):
    """Normales sortantes cohérentes sur chaque coque fermée (nacelle, pales, anodes)."""
    bm = bmesh.new(); bm.from_mesh(ob.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(ob.data); bm.free(); ob.data.update()
    return ob


def fix_dir(ob, want):
    """Surfaces ouvertes : retourne les faces dont la normale ne suit pas want(centre) (repère Blender)."""
    bm = bmesh.new(); bm.from_mesh(ob.data)
    flip = [f for f in bm.faces if f.normal.dot(Vector(want(f.calc_center_median()))) < 0]
    bmesh.ops.reverse_faces(bm, faces=flip)
    bm.to_mesh(ob.data); bm.free(); ob.data.update()
    return ob

POD_Z = 1.55        # entraxe des pods : ±1,55 m
X_NOSE = -10.0      # nez de nacelle
NAC_LEN = 2.0       # nez -> fin de nacelle
NAC_R = 0.2
DROP = 0.42         # carène -> axe de nacelle


def bottom_y(x, z):
    """Hauteur de la carène (panneau quille -> bouchain) au point (x, |z|)."""
    s = section(x)
    return s['keel'] + (s['chY'] - s['keel']) * min(abs(z), s['chZ']) / max(s['chZ'], 1e-6)


def axis_M(x0, yc, zc):
    """Repère du lathe : axe local +Y -> -X (vers l'arrière), origine au nez."""
    return Matrix.Translation((x0, yc, zc)) @ Matrix.Rotation(math.pi / 2, 4, 'Z')


# ---------------------------------------------------------------------------
def nacelle_profile():
    prof = []
    nose = 0.55
    for i in range(0, 13):  # nez elliptique
        h = nose * i / 12
        prof.append((max(0.004, NAC_R * math.sqrt(max(0.0, 1 - (1 - h / nose) ** 2))), h))
    for h in (0.9, 1.25):
        prof.append((NAC_R, h))
    for i in range(1, 9):   # fuseau arrière -> moyeu
        t = i / 8
        h = 1.25 + t * (NAC_LEN - 1.25)
        prof.append((0.135 + (NAC_R - 0.135) * 0.5 * (1 + math.cos(math.pi * t)), h))
    return prof


def naca(c, tc, n=14):
    """Demi-épaisseurs NACA 00xx : [(x/c, y)]."""
    out = []
    for i in range(n + 1):
        b = i / n
        xc = 0.5 * (1 - math.cos(math.pi * b))
        yt = 5 * tc * c * (0.2969 * math.sqrt(xc) - 0.126 * xc - 0.3516 * xc ** 2 + 0.2843 * xc ** 3 - 0.1036 * xc ** 4)
        out.append((xc, max(yt, 0.0015)))
    return out


def strut(mb, zc, yc, mat):
    """Aileron vertical profilé : de l'axe de nacelle jusque dans la carène."""
    x_le_bot, x_le_top = -10.42, -10.52
    c_bot, c_top = 1.05, 0.86
    y0 = yc
    y1 = bottom_y(-11.0, zc) + 0.18
    rows = []
    for k in range(7):
        t = k / 6
        y = y0 + (y1 - y0) * t
        c = c_bot + (c_top - c_bot) * t
        xle = x_le_bot + (x_le_top - x_le_bot) * t
        half = naca(c, 0.13)
        up = [(xle - xc * c, y, zc + yt) for xc, yt in half]
        lo = [(xle - xc * c, y, zc - yt) for xc, yt in reversed(half[1:-1])]
        rows.append(up + lo)
    loft_rows(mb, rows, mat, closed=True, cap0=True, cap1=True)


def blade_set(mb, xh, yc, zc, R, rh, nb, hand, phase, cmax, P, skew, mat):
    """Pales vrillées à pas constant P (hélice), section lenticulaire, dévers (skew) vers la pointe."""
    NR, NC = 18, 12
    for b in range(nb):
        th0 = phase + 2 * math.pi * b / nb
        rows = []
        for i in range(NR + 1):
            u = i / NR
            r = rh * 0.97 + (R - rh * 0.97) * u
            c = cmax * math.sqrt(max(0.0, 1 - u ** 2.4)) * (0.72 + 0.55 * u) + 0.012
            tmax = 0.034 * (1 - u) + 0.006
            ths = th0 + hand * skew * u ** 1.5
            loop = []
            for side in (1, -1):
                rng = range(NC + 1) if side == 1 else range(NC - 1, 0, -1)
                for j in rng:
                    v = j / NC - 0.5                      # -0,5 bord d'attaque .. +0,5 bord de fuite
                    a = v * c / r                         # angle le long de la corde
                    th = ths + hand * a
                    dx = -(P / (2 * math.pi)) * a         # pas : la pale avance vers l'arrière le long de la corde
                    tk = tmax * math.sqrt(max(0.0, 1 - (2 * v) ** 2)) * (1 - 0.3 * (v + 0.5)) + 0.0012
                    x = xh + dx + side * tk * 0.5
                    loop.append((x, yc + r * math.cos(th), zc + r * math.sin(th)))
            rows.append(loop)
        loft_rows(mb, rows, mat, closed=True, cap1=True)


def pod(ctx, side):
    zc = POD_Z * side
    yc = bottom_y(-11.0, zc) - DROP
    tag = 'Stbd' if side > 0 else 'Port'
    M = axis_M(X_NOSE, yc, zc)

    # nacelle + aileron (antifouling, comme la carène)
    mb = MB()
    lathe(mb, nacelle_profile(), seg=40, mat=0, M=M, cap_top=True)
    strut(mb, zc, yc, 0)
    ob = fix_closed(make_obj(ctx, f'hull_pod{tag}', mb, ['hullBottom'], smooth=True, sharp_deg=60))
    add_wn(ob)

    # anode zinc annulaire sur la nacelle
    mz = MB()
    lathe(mz, [(NAC_R - 0.004, 0.70), (NAC_R + 0.010, 0.71), (NAC_R + 0.014, 0.74), (NAC_R + 0.014, 0.86),
               (NAC_R + 0.010, 0.89), (NAC_R - 0.004, 0.90)], seg=40, mat=0, M=M, cap_top=False)
    # cône d'anode en bout de moyeu
    xa = X_NOSE - NAC_LEN - 0.62
    lathe(mz, [(0.118, 0.0), (0.112, 0.05), (0.08, 0.12), (0.03, 0.17), (0.004, 0.185)], seg=32, mat=0,
          M=axis_M(xa, yc, zc), cap_top=True)
    fix_dir(make_obj(ctx, f'hull_anodes{tag}', mz, ['zinc'], smooth=True, sharp_deg=50),
            lambda c: (min(0.0, c.x - (X_NOSE - NAC_LEN - 0.6)) * 3, c.y + zc, c.z - yc))

    # moyeux + hélices contrarotatives (bronze NiAl poli)
    mp = MB()
    hub = [(0.135, NAC_LEN - 0.005), (0.14, NAC_LEN + 0.02), (0.14, NAC_LEN + 0.24), (0.128, NAC_LEN + 0.30),
           (0.124, NAC_LEN + 0.33), (0.124, NAC_LEN + 0.55), (0.118, NAC_LEN + 0.62)]
    lathe(mp, hub, seg=40, mat=0, M=M, cap_top=False)
    hand = side  # bâbord / tribord en miroir
    blade_set(mp, X_NOSE - NAC_LEN - 0.13, yc, zc, R=0.42, rh=0.14, nb=4, hand=hand, phase=0.3,
              cmax=0.30, P=0.92, skew=0.35, mat=0)
    blade_set(mp, X_NOSE - NAC_LEN - 0.44, yc, zc, R=0.36, rh=0.124, nb=5, hand=-hand, phase=0.9,
              cmax=0.22, P=0.80, skew=0.30, mat=0)
    ob = fix_closed(make_obj(ctx, f'hull_props{tag}', mp, ['propBronze'], smooth=True, sharp_deg=75))
    add_wn(ob)


# ---------------------------------------------------------------------------
def bow_thruster(ctx):
    """Ouverture du tunnel de propulseur d'étrave sur le panneau de carène (deux bords), avec grille."""
    XT, YT, RT = 10.6, -0.18, 0.19
    md = MB()   # fond sombre
    mr = MB()   # jonc + barreaux

    def on_panel(x, y, side, off):
        s = section(x)
        dz, dy = s['chZ'], s['chY'] - s['keel']
        L = math.hypot(dz, dy)
        z = (y - s['keel']) / dy * dz
        nz, ny = dy / L, -dz / L                          # normale extérieure (tribord)
        return (x, y + ny * off, side * (z + nz * off))

    for side in (1, -1):
        N = 40
        ring = lambda r, off: [on_panel(XT + r * math.cos(2 * math.pi * k / N), YT + r * math.sin(2 * math.pi * k / N), side, off) for k in range(N)]
        c = md.add(on_panel(XT, YT, side, 0.004))
        rim0 = [md.add(p) for p in ring(RT, 0.004)]
        for k in range(N):
            f = [c, rim0[k], rim0[(k + 1) % N]]
            md.face(f if side > 0 else list(reversed(f)), 0)
        rows = [ring(RT - 0.004, 0.005), ring(RT, 0.010), ring(RT + 0.022, 0.010), ring(RT + 0.036, 0.0)]
        if side < 0:
            rows = [list(reversed(r)) for r in rows]
        loft_rows(mr, rows, 0, closed=True)
        # barreaux verticaux de la grille
        for bx in (-0.075, 0.0, 0.075):
            h = math.sqrt(RT * RT - bx * bx) - 0.004
            pts = []
            for (dx, dyo) in ((-0.011, -h), (0.011, -h), (0.011, h), (-0.011, h)):
                pts.append(on_panel(XT + bx + dx, YT + dyo, side, 0.012))
            base = [on_panel(XT + bx + dx, YT + dyo, side, 0.004) for (dx, dyo) in ((-0.011, -h), (0.011, -h), (0.011, h), (-0.011, h))]
            I = [mr.add(p) for p in pts]
            B = [mr.add(p) for p in base]
            quads = [I, [B[0], B[1], I[1], I[0]], [B[1], B[2], I[2], I[1]], [B[2], B[3], I[3], I[2]], [B[3], B[0], I[0], I[3]]]
            for q in quads:
                mr.face(q if side > 0 else list(reversed(q)), 0)
    out = lambda c: (0.0, c.y, -0.5)  # Blender : y = -z three ; normale vers l'extérieur et le bas
    fix_dir(make_obj(ctx, 'hull_thrusterWells', md, ['metalDark'], smooth=False), out)
    ob = fix_dir(make_obj(ctx, 'hull_thrusterGrilles', mr, ['accent'], smooth=True, sharp_deg=45), out)
    add_wn(ob)


def build(ctx):
    pod(ctx, 1)
    pod(ctx, -1)
    bow_thruster(ctx)
