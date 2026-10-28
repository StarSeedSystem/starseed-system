#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import bpy, math

def iniciar():
    bpy.ops.wm.read_factory_settings(use_empty=True)

TABLAS = {
"primitiva":{"cubo":lambda s:bpy.ops.mesh.primitive_cube_add(size=s/2),"esfera":lambda s:bpy.ops.mesh.primitive_uv_sphere_add(radius=s/2),"icosfera":lambda s:bpy.ops.mesh.primitive_ico_sphere_add(radius=s/2),"cilindro":lambda s:bpy.ops.mesh.primitive_cylinder_add(radius=s/2,depth=s),"cono":lambda s:bpy.ops.mesh.primitive_cone_add(radius1=s/2,depth=s),"toro":lambda s:bpy.ops.mesh.primitive_torus_add(major_radius=s/2,minor_radius=s/8),"plano":lambda s:bpy.ops.mesh.primitive_plane_add(size=s),"circulo":lambda s:bpy.ops.mesh.primitive_circle_add(radius=s/2)},
"luz":{"sol":lambda**k:bpy.ops.object.light_add(type="SUN",**k),"punto":lambda**k:bpy.ops.object.light_add(type="POINT",**k),"foco":lambda**k:bpy.ops.object.light_add(type="SPOT",**k),"area":lambda**k:bpy.ops.object.light_add(type="AREA",**k)},
}

def primitiva(tipo="cubo",nombre="obj",tam=1.0,segmentos=0):
    op=TABLAS["primitiva"].get(tipo)
    if op is None:raise ValueError("primitiva: %s"%tipo)
    op(tam);obj=bpy.context.active_object;obj.name=nombre

def transformar(objeto="obj",ubicacion=[0,0,0],rotacion=[0,0,0],escala=[1,1,1]):
    obj=bpy.data.objects.get(objeto)
    if obj is None:raise ValueError("transformar: %s"%objeto)
    obj.location=tuple(ubicacion);obj.rotation_euler=tuple(math.radians(r)for r in rotacion);obj.scale=tuple(escala)

def material(objeto="obj",color=[0.8,0.8,0.8,1],metalico=0.0,rugosidad=0.5,emision_color=[0,0,0,0],emision_fuerza=0.0,alfa=1.0):
    obj=bpy.data.objects.get(objeto)
    if obj is None:raise ValueError("material: %s"%objeto)
    mat=bpy.data.materials.new(name=obj.name+"_mat");mat.use_nodes=True;nodes=mat.node_tree.nodes;links=mat.node_tree.links
    for n in list(nodes):nodes.remove(n)
    bsdf=nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Base Color"].default_value=tuple(color);bsdf.inputs["Metallic"].default_value=metalico;bsdf.inputs["Roughness"].default_value=rugosidad;bsdf.inputs["Emission Color"].default_value=tuple(emision_color);bsdf.inputs["Emission Strength"].default_value=emision_fuerza;bsdf.inputs["Alpha"].default_value=alfa
    out=nodes.new("ShaderNodeOutputMaterial");links.new(bsdf.outputs["BSDF"],out.inputs["Surface"]);obj.data.materials.append(mat)

def modificador(objeto="obj",tipo="subdivision",niveles=1,ancho=0.0,espesor=0.0,cantidad=1,relacion=0.0,desplazamiento=[0,0,0]):
    obj=bpy.data.objects.get(objeto)
    if obj is None:raise ValueError("modificador: %s"%objeto)
    t=tipo
    if t=="subdivision":mod=obj.modifiers.new(name="sub",type="SUBSURF");mod.levels=niveles
    elif t=="bisel":mod=obj.modifiers.new(name="bis",type="BEVEL");mod.width=ancho;mod.thickness=espesor
    elif t=="solidificar":mod=obj.modifiers.new(name="sol",type="SOLIDIFY");mod.thickness=espesor
    elif t=="espejo":mod=obj.modifiers.new(name="mir",type="MIRROR")
    elif t=="matriz":mod=obj.modifiers.new(name="arr",type="ARRAY");mod.count=int(cantidad)
    elif t=="decimar":mod=obj.modifiers.new(name="dec",type="DECIMATE");mod.ratio=max(0.001,min(1.0,1.0-cantidad/100.0))
    elif t=="malla_alambre":mod=obj.modifiers.new(name="wir",type="WIREFRAME");mod.thickness=espesor
    else:raise ValueError("modificador: %s"%tipo)

def texto3d(nombre="texto",texto="Hola",extrusion=0.1,tam=1.0):
    bpy.ops.object.text_add();obj=bpy.context.active_object;obj.name=nombre;obj.data.body=texto;obj.data.extrude=extrusion;obj.scale=(tam,tam,tam)

def camara(nombre="cam",ubicacion=[0,-5,2],mira_a=[0,0,0],lente_mm=50,ortografica=False):
    bpy.ops.object.camera_add();cam=bpy.context.active_object;cam.name=nombre;cam.location=tuple(ubicacion);data=cam.data;data.type="ORTHO"if ortografica else"PERSP";data.lens=lente_mm;bpy.context.scene.camera=cam

def luz(nombre="luz",tipo="sol",color=[1,1,1,1],energia=1.0,ubicacion=[0,0,0],rotacion=[0,0,0]):
    op=TABLAS["luz"].get(tipo)
    if op is None:raise ValueError("luz: %s"%tipo)
    op(location=tuple(ubicacion));obj=bpy.context.active_object;obj.name=nombre;obj.data.color=tuple(color[:3]);obj.data.energy=energia

def mundo(color=[0,0,0,1],fuerza=1.0,hdri=None):
    w=bpy.context.scene.world
    if w is None:w=bpy.data.worlds.new("mundo");bpy.context.scene.world=w
    w.use_nodes=True;nodes=w.node_tree.nodes;links=w.node_tree.links
    for n in list(nodes):nodes.remove(n)
    bg=nodes.new("ShaderNodeBackground");bg.inputs["Color"].default_value=tuple(color);bg.inputs["Strength"].default_value=fuerza
    out=nodes.new("ShaderNodeOutputWorld");links.new(bg.outputs["Background"],out.inputs["Surface"])

TABLAS_IMPORT={".obj":lambda a:bpy.ops.import_scene.obj(filepath=a),".stl":lambda a:bpy.ops.import_mesh.stl(filepath=a),".ply":lambda a:bpy.ops.import_mesh.ply(filepath=a),".fbx":lambda a:bpy.ops.import_scene.fbx(filepath=a),".glb":lambda a:bpy.ops.import_scene.gltf(filepath=a),".gltf":lambda a:bpy.ops.import_scene.gltf(filepath=a),".svg":lambda a:bpy.ops.import_curve.svg(filepath=a)}

def importar(archivo="modelo.glb",nombre="importado"):
    ext=archivo[archivo.rfind("."):].lower();op=TABLAS_IMPORT.get(ext)
    if op is None:raise ValueError("importar: %s"%ext)
    op(archivo);parent=bpy.data.objects.new(nombre,None);parent.empty_display_type="ARROWS";bpy.context.collection.objects.link(parent)
    for obj in bpy.context.selected_objects:obj.parent=parent;obj.name=nombre

def animar(objeto="obj",propiedad="ubicacion",claves=[{"fotograma":0,"valor":[0,0,0]}],interpolacion="lineal"):
    obj=bpy.data.objects.get(objeto)
    if obj is None:raise ValueError("animar: %s"%objeto)
    for c in claves:
        f=int(c.get("fotograma",0));val=c.get("valor",[0,0,0])
        if propiedad=="ubicacion":obj.location=tuple(val)
        elif propiedad=="escala":obj.scale=tuple(val)
        elif propiedad=="rotacion":obj.rotation_euler=tuple(math.radians(v)for v in val)
        obj.keyframe_insert(data_path=propiedad,frame=f)

def _motor(motor):
    if motor=="workbench":return"BLENDER_WORKBENCH"
    if motor in("cycles-cpu","cycles-gpu"):return"CYCLES"
    for nom in("BLENDER_EEVEE","BLENDER_EEVEE_NEXT"):
        if nom in dir(bpy.ops.render):return nom
    return"BLENDER_EEVEE"

def render_png(ancho=256,alto=256,muestras=8,motor="workbench",fondo_transparente=False,ruta="salidas/salida-1.png"):
    s=bpy.context.scene;s.render.engine=_motor(motor);s.render.resolution_x=int(ancho);s.render.resolution_y=int(alto);s.render.resolution_percentage=100;s.render.image_settings.file_format="PNG";s.render.image_settings.color_mode="RGBA"if fondo_transparente else"RGB"
    s.cycles.samples=1 if motor=="workbench"else int(muestras);s.render.filepath=ruta;bpy.ops.render.render(write_still=True)

def render_mp4(ancho=256,alto=256,fps=24,desde=0,hasta=30,muestras=8,motor="workbench",ruta="salidas/salida-1.mp4"):
    s=bpy.context.scene;s.render.engine=_motor(motor);s.render.resolution_x=int(ancho);s.render.resolution_y=int(alto);s.render.resolution_percentage=100;s.render.fps=int(fps);s.frame_start=int(desde);s.frame_end=int(hasta);s.render.image_settings.file_format="FFMPEG";s.render.ffmpeg.format="MPEG4"
    s.cycles.samples=1 if motor=="workbench"else int(muestras);s.render.filepath=ruta;bpy.ops.render.render(animation=True)

def render_exr(ancho=256,alto=256,muestras=8,motor="workbench",ruta="salidas/salida-1.exr"):
    s=bpy.context.scene;s.render.engine=_motor(motor);s.render.resolution_x=int(ancho);s.render.resolution_y=int(alto);s.render.resolution_percentage=100;s.render.image_settings.file_format="OPEN_EXR";s.render.image_settings.color_depth="32"
    s.cycles.samples=1 if motor=="workbench"else int(muestras);s.render.filepath=ruta;bpy.ops.render.render(write_still=True)

def exportar_glb(objetos=None,y_arriba=True,aplicar_modificadores=True,draco=False,meshopt=False,ruta="salidas/salida-1.glb"):
    bpy.ops.export_scene.gltf(filepath=ruta,export_format="GLB",export_yup=y_arriba,export_apply=aplicar_modificadores,export_selected_objects=(objetos is not None))
