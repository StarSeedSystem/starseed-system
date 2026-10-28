#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Ejecutor por lotes (§5-§7 contrato). Un trabajo a la vez, sin shell."""
import os, sys, json, hashlib, secrets, subprocess, time, signal, shutil, stat
sys.path.insert(0, ".")
import barreras as B; import generador as G; import deteccion as D

def raiz(r=None):
    if r: return r
    return os.environ.get("STARSEED_BLENDER_RAIZ") or os.path.expanduser("~/.starseed/blender-3d")

def escribir_json(ruta, datos, modo=0o600):
    tmp = str(ruta) + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(datos, f, ensure_ascii=False)
    os.chmod(tmp, modo); os.replace(tmp, ruta)

def encolar(trabajo, r):
    ok, limpio, motivos = B.validar_trabajo(trabajo)
    if not ok: raise ValueError("trabajo inválido: " + "; ".join(motivos))
    r = raiz(r)
    id_trabajo = secrets.token_hex(16)
    cola_dir = os.path.join(r, "cola"); trabajo_dir = os.path.join(r, "trabajos", id_trabajo)
    for d in (cola_dir, trabajo_dir, os.path.join(r, "estado"), os.path.join(r, "salidas", id_trabajo)):
        os.makedirs(d, exist_ok=True)
    os.chmod(trabajo_dir, 0o700)
    escribir_json(os.path.join(cola_dir, id_trabajo + ".json"), {"id": id_trabajo, "trabajo": limpio})
    escribir_json(os.path.join(trabajo_dir, "trabajo.json"), limpio)
    escribir_json(os.path.join(r, "estado", id_trabajo + ".json"), {
        "estado": "en_cola", "motivo": "encolado", "id": id_trabajo, "salidas": []})

def ejecutar_uno(id_trabajo, s):
    r = raiz(s.entorno.get("STARSEED_BLENDER_RAIZ")) if hasattr(s, "entorno") else raiz()
    estado_path = os.path.join(r, "estado", id_trabajo + ".json")
    trabajo_path = os.path.join(r, "trabajos", id_trabajo, "trabajo.json")
    if not os.path.exists(trabajo_path):
        escribir_json(estado_path, {"estado":"error","motivo":"falta trabajo","salidas":[]})
        return False
    escribir_json(estado_path, {"estado":"corriendo","motivo":"en curso","salidas":[]})
    guion_path = os.path.join(r, "trabajos", id_trabajo, "guion.py")
    trabajo = json.loads(open(trabajo_path, encoding="utf-8").read())
    guion = G.generar_guion(trabajo, "5.2.0")
    sha_guion = hashlib.sha256(guion.encode("utf-8")).hexdigest()
    with open(guion_path, "w", encoding="utf-8") as f:
        f.write(guion)
    ops_path = os.path.join(os.path.dirname(__file__), "ops_starseed.py")
    shutil.copy2(ops_path, os.path.join(r, "trabajos", id_trabajo, "ops_starseed.py"))
    class S:
        def __init__(self, ent=None):
            self.entorno = ent or os.environ
    blender = D.buscar_blender(S())
    if not blender:
        escribir_json(estado_path, {"estado":"error","motivo":"blender no encontrado","salidas":[]})
        return False
    env = {"PATH":"/usr/bin:/bin", "HOME":os.path.join(r,"trabajos",id_trabajo), "TMPDIR":os.path.join(r,"trabajos",id_trabajo), "LANG":"C.UTF-8", "BLENDER_USER_RESOURCES":os.path.join(r,"trabajos",id_trabajo)}
    proc = subprocess.Popen([blender, "-b", "--factory-startup", "--python-exit-code", "3", "-P", guion_path], cwd=os.path.join(r,"trabajos",id_trabajo), env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True)
    # PENDIENTE: topes de tiempo y memoria; registro recortado; limpieza
    try:
        out, err = proc.communicate(timeout=300)
    except subprocess.TimeoutExpired:
        try: os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
        except Exception: pass
        time.sleep(3)
        try: os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
        except Exception: pass
        escribir_json(estado_path, {"estado":"cancelado","motivo":"tiempo excedido","salidas":[]})
        return False
    escribir_json(estado_path, {"estado":"hecho","motivo":"completado","salidas":["render_png"]})
    return True

def bucle(r):
    r = raiz(r)
    lock_path = os.path.join(r, "ejecutor.lock")
    # PENDIENTE: cerrojo con archivo; bucle de cola
    pass

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--una-vez", action="store_true")
    args = parser.parse_args()
    # PENDIENTE: implementar bucle con lock y procesamiento
