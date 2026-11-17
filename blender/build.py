"""Assemble le modèle Blender DIÈDRE 29 et l'exporte.

  /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup -P blender/build.py -- \
      [--parts hull,superstructure] [--out blender/out]

Chaque module de blender/parts/ expose build(ctx). ctx fournit :
  ctx.col(group)   -> collection Blender du groupe three.js ('hull', 'superstructure', 'roof', 'upperGlass')
  ctx.mat(key)     -> matériau nommé comme une clé de js/boat.js `materials`
  ctx.link(obj, group) -> range l'objet dans la collection du groupe
Sorties : <out>/diedre29.blend, <out>/diedre29.glb (un nœud racine par groupe, enfants = objets).
"""
import bpy, sys, os, importlib, argparse

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [os.path.join(HERE, 'lib'), os.path.join(HERE, 'parts')]
import materials  # noqa: E402

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
ap = argparse.ArgumentParser()
ap.add_argument('--parts', default='hull,superstructure,propulsion')
ap.add_argument('--out', default=os.path.join(HERE, 'out'))
ap.add_argument('--no-export', action='store_true')
ap.add_argument('--name', default='diedre29', help='nom des fichiers de sortie (diedre29, cat24)')
args = ap.parse_args(argv)
os.makedirs(args.out, exist_ok=True)

GROUPS = ['hull', 'superstructure', 'roof', 'upperGlass', 'interior', 'aftDeckFurniture']

# scène vierge
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.unit_settings.system = 'METRIC'


class Ctx:
    def __init__(self):
        self.cols = {}
        self.roots = {}
        for g in GROUPS:
            c = bpy.data.collections.new(g)
            scene.collection.children.link(c)
            self.cols[g] = c
            # nœud racine nommé comme le groupe three.js (repère d'export)
            e = bpy.data.objects.new(g, None)
            c.objects.link(e)
            self.roots[g] = e

    def col(self, g):
        return self.cols[g]

    def mat(self, key):
        return materials.get(key)

    def link(self, obj, g):
        for c in list(obj.users_collection):
            c.objects.unlink(obj)
        self.cols[g].objects.link(obj)
        obj.parent = self.roots[g]
        return obj


ctx = Ctx()
for name in [p.strip() for p in args.parts.split(',') if p.strip()]:
    mod = importlib.import_module(name)
    importlib.reload(mod)
    print(f'[build] {name} ...')
    mod.build(ctx)

# statistiques
tris = 0
for o in scene.objects:
    if o.type == 'MESH':
        dg = o.evaluated_get(bpy.context.evaluated_depsgraph_get())
        me = dg.to_mesh()
        me.calc_loop_triangles()
        tris += len(me.loop_triangles)
        dg.to_mesh_clear()
print(f'[build] objets={len(scene.objects)} triangles(évalués)={tris}')

bpy.ops.wm.save_as_mainfile(filepath=os.path.join(args.out, args.name + '.blend'))
if not args.no_export:
    bpy.ops.export_scene.gltf(
        filepath=os.path.join(args.out, args.name + '.glb'), export_format='GLB',
        export_apply=True, export_yup=True, export_texcoords=True, export_normals=True,
        export_materials='EXPORT', export_image_format='NONE', export_cameras=False, export_lights=False,
        use_selection=False)
print('[build] ok ->', args.out)
