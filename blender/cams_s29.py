# Caméras de contrôle du SILLAGE 29 (repère three.js : pos, cible, focale mm) — render.py --camfile blender/cams_s29.py
CAMS = {
    's_hero':    ((34, 7.5, 30), (0, 6.0, 0), 35),          # 3/4 avant tribord, mât compris
    's_bow34':   ((28, 5.0, 18), (4, 3.2, 0), 45),
    's_profile': ((0, 4.0, 52), (0, 4.5, 0), 40),
    's_rig':     ((0, 18, 75), (0, 19, 0), 35),             # profil entier avec gréement
    's_stern34': ((-30, 7, 20), (-8, 3.0, 0), 40),
    's_stern':   ((-34, 4.0, 0.01), (-12, 3.0, 0), 40),
    's_top':     ((0.5, 70, 0.01), (0.5, 0, 0), 35),
    's_fly':     ((-16, 11, 10), (-2, 5.6, 0), 32),          # flybridge vu de l'arrière haut
    's_cockpit': ((-20, 4.6, 5.0), (-8, 3.0, 0), 35),
    's_fwd':     ((20, 6.5, 6), (9.5, 2.8, 0), 32),          # lounge avant et pied de mât
    's_salon':   ((5.6, 3.95, -3.4), (-4, 3.2, 1.0), 20),    # intérieur (avec --hide roof,upperGlass ou non)
    's_cut':     ((16, 36, -28), (-1, 2.5, 0), 35),          # coupe : --hide roof,upperGlass
    's_pods':    ((-21, -2.2, 9.0), (-12.5, -1.0, 4.75), 35),
    's_under':   ((6, -6, 22), (0, 0, 0), 30),
}
