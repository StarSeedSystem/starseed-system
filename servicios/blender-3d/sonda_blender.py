import json, bpy

def main():
    addon = bpy.context.preferences.addons.get("cycles")
    dispositivos = []
    if addon:
        for d in addon.preferences.get_device_types(bpy.context):
            dispositivos.append(d.name)

    engines = [m.name for m in bpy.context.scene.render.get_engines()]

    codec = getattr(bpy.app.build_options, "codec_ffmpeg", None)

    gpu_utilizable = any("GPU" in str(d).upper() for d in dispositivos) or bpy.context.preferences.system.get("gpu", False)

    output = {
        "dispositivos_ciclos": dispositivos,
        "codec_ffmpeg": codec,
        "motores": engines,
        "gpu_utilizable": gpu_utilizable,
    }
    print("STARSEED_SONDA:" + json.dumps(output, ensure_ascii=False))

if __name__ == "__main__":
    main()