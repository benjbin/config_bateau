"""Rendus Cycles de contrôle d'un .blend produit par build.py.

  /Applications/Blender.app/Contents/MacOS/Blender -b blender/out/diedre29.blend -P blender/render.py -- \
      [--out blender/out/renders] [--cams bow34,profile,stern34,top,detail] [--samples 64] [--res 1280x720]

Caméras définies en repère three.js (pos, cible) puis converties. Ciel physique + plan d'eau sombre brillant.
"""
import bpy, sys, os, math, argparse
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, 'lib'))
from lines import to_bl  # noqa: E402

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
ap = argparse.ArgumentParser()
ap.add_argument('--out', default=os.path.join(HERE, 'out', 'renders'))
ap.add_argument('--cams', default='bow34,profile,stern34,top,detail')
ap.add_argument('--samples', type=int, default=64)
ap.add_argument('--res', default='1280x720')
args = ap.parse_args(argv)
os.makedirs(args.out, exist_ok=True)

CAMS = {  # nom: (position three, cible three, focale mm)
    'bow34':   ((22, 5.5, 16), (1.5, 1.6, 0), 50),
    'profile': ((0, 2.0, 34), (0, 1.6, 0), 50),
    'stern34': ((-24, 6, 14), (-6, 1.6, 0), 50),
    'top':     ((0.5, 40, 0.01), (0.5, 0, 0), 50),
    'detail':  ((15.5, 2.2, 5.5), (12.5, 1.5, 1.6), 85),
    'deck':    ((10, 6.5, 6), (4, 2.0, 0), 35),
}

sc = bpy.context.scene
sc.render.engine = 'CYCLES'
try:
    prefs = bpy.context.preferences.addons['cycles'].preferences
    prefs.compute_device_type = 'METAL'
    prefs.get_devices()
    for d in prefs.devices:
        d.use = True
    sc.cycles.device = 'GPU'
except Exception as e:
    print('[render] GPU indisponible, CPU :', e)
sc.cycles.samples = args.samples
sc.cycles.use_denoising = True
w, h = (int(v) for v in args.res.split('x'))
sc.render.resolution_x, sc.render.resolution_y = w, h
sc.render.image_settings.file_format = 'JPEG'
sc.render.image_settings.quality = 92
sc.view_settings.view_transform = 'AgX'

# ciel
world = bpy.data.worlds.new('sky'); sc.world = world; world.use_nodes = True
nt = world.node_tree; bg = nt.nodes['Background']
sky = nt.nodes.new('ShaderNodeTexSky')
try:
    sky.sky_type = 'NISHITA'
except Exception:
    pass
sky.sun_elevation = math.radians(28); sky.sun_rotation = math.radians(140)
nt.links.new(sky.outputs['Color'], bg.inputs['Color'])
bg.inputs['Strength'].default_value = 0.35

# eau : plan sombre brillant légèrement ondulé
bpy.ops.mesh.primitive_plane_add(size=400, location=(0, 0, 0))
water = bpy.context.active_object; water.name = '_water'
wm = bpy.data.materials.new('_water'); wm.use_nodes = True
b = wm.node_tree.nodes['Principled BSDF']
b.inputs['Base Color'].default_value = (0.01, 0.02, 0.03, 1)
b.inputs['Roughness'].default_value = 0.06
noise = wm.node_tree.nodes.new('ShaderNodeTexNoise'); noise.inputs['Scale'].default_value = 3.0
bump = wm.node_tree.nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.08
wm.node_tree.links.new(noise.outputs['Fac'], bump.inputs['Height'])
wm.node_tree.links.new(bump.outputs['Normal'], b.inputs['Normal'])
water.data.materials.append(wm)

cam_data = bpy.data.cameras.new('cam'); cam = bpy.data.objects.new('cam', cam_data)
sc.collection.objects.link(cam); sc.camera = cam
for name in [c.strip() for c in args.cams.split(',') if c.strip()]:
    pos, tgt, f = CAMS[name]
    cam.location = Vector(to_bl(pos))
    d = Vector(to_bl(tgt)) - cam.location
    cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    cam_data.lens = f
    sc.render.filepath = os.path.join(args.out, f'{name}.jpg')
    bpy.ops.render.render(write_still=True)
    print('[render]', sc.render.filepath)
