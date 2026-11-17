"""Matériaux Blender nommés EXACTEMENT comme les clés de `materials` dans js/boat.js.

Le configurateur ne lit que le NOM du matériau (il remplace par son propre matériau three.js, pour que
les options couleur/teck/vitrage continuent de marcher). Les réglages ci-dessous servent uniquement
aux rendus Cycles de contrôle et au futur rendu marketing.
"""
import bpy


def _hex(h):
    def c(v):  # sRGB -> linéaire
        v /= 255.0
        return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4
    return (c((h >> 16) & 255), c((h >> 8) & 255), c(h & 255), 1.0)


# clé: (couleur, métal, rugosité, vernis, émission, alpha)
SPECS = {
    'hull':           (0x232426, 0.08, 0.25, 1.0, None, 1.0),
    'hullBottom':     (0x141517, 0.0, 0.7, 0.0, None, 1.0),
    'accent':         (0x8c7a68, 0.9, 0.35, 0.0, None, 1.0),
    'superstructure': (0x60564d, 0.6, 0.38, 1.0, None, 1.0),
    'glass':          (0x0a0d10, 0.0, 0.02, 0.0, None, 1.0),
    'chrome':         (0xd8dadc, 1.0, 0.08, 0.0, None, 1.0),
    'acrylic':        (0x1c2023, 0.0, 0.03, 0.0, None, 1.0),
    'deck':           (0x9c8064, 0.0, 0.75, 0.0, None, 1.0),
    'caulk':          (0x0b0a09, 0.0, 0.5, 0.0, None, 1.0),
    'metalDark':      (0x2a2c2f, 0.85, 0.37, 0.0, None, 1.0),
    'upholsteryExterior': (0xe6e0d3, 0.0, 0.9, 0.0, None, 1.0),
    'propBronze':     (0xb5895a, 1.0, 0.22, 0.0, None, 1.0),
    'zinc':           (0x9a9c9e, 0.6, 0.55, 0.0, None, 1.0),
    'upholsteryInterior': (0x1b2536, 0.0, 0.55, 0.0, None, 1.0),
    'woodInterior':   (0x6b4128, 0.0, 0.45, 0.3, None, 1.0),
    'interiorFloor':  (0x3a3b3e, 0.0, 0.55, 0.0, None, 1.0),
    'ceiling':        (0xe8e2d8, 0.0, 0.9, 0.0, None, 1.0),
    'screens':        (0x05080d, 0.0, 0.15, 1.0, 0x9fc4ff, 1.0),
    'ledStrip':       (0xffb86b, 0.0, 0.5, 0.0, 0xffb86b, 1.0),
    'navRed':         (0x300000, 0.0, 0.4, 0.0, 0xff2a1a, 1.0),
    'navGreen':       (0x002a10, 0.0, 0.4, 0.0, 0x1aff6a, 1.0),
    'navWhite':       (0x303030, 0.0, 0.4, 0.0, 0xffffff, 1.0),
}


def get(name):
    """Renvoie (ou crée) le matériau `name`. Un nom absent de SPECS est autorisé (gris neutre) mais
    le configurateur ne saura pas le mapper : rester sur les clés de SPECS / boat.js."""
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes.get('Principled BSDF')
    col, met, rough, coat, emis, alpha = SPECS.get(name, (0x808080, 0.0, 0.5, 0.0, None, 1.0))
    b.inputs['Base Color'].default_value = _hex(col)
    b.inputs['Metallic'].default_value = met
    b.inputs['Roughness'].default_value = rough
    if coat:
        b.inputs['Coat Weight'].default_value = coat
        b.inputs['Coat Roughness'].default_value = 0.03
    if emis is not None:
        b.inputs['Emission Color'].default_value = _hex(emis)
        b.inputs['Emission Strength'].default_value = 4.0
    if name == 'glass':
        b.inputs['IOR'].default_value = 1.6
        b.inputs['Specular IOR Level'].default_value = 0.7
    if name == 'deck':  # lattes : fil simple pour les rendus de contrôle
        nt = m.node_tree
        wave = nt.nodes.new('ShaderNodeTexWave')
        wave.wave_type = 'BANDS'; wave.bands_direction = 'X'
        wave.inputs['Scale'].default_value = 40.0
        wave.inputs['Distortion'].default_value = 6.0
        ramp = nt.nodes.new('ShaderNodeValToRGB')
        ramp.color_ramp.elements[0].color = _hex(0x7f6249)
        ramp.color_ramp.elements[1].color = _hex(0xa88a6c)
        nt.links.new(wave.outputs['Fac'], ramp.inputs['Fac'])
        nt.links.new(ramp.outputs['Color'], b.inputs['Base Color'])
    m.diffuse_color = _hex(col)
    return m
