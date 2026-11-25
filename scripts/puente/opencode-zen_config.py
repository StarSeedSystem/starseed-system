#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""opencode-zen_config · declara y prueba los modelos gratuitos de OpenCode Zen.

Zen solo responde gratis a cuatro modelos dentro de opencode; claude-*, gpt-* y
gemini-* son de pago. Decide en PURA, jamás guarda claves y aplica el bloque a
~/.config/opencode/opencode.json de forma atómica; `--probar` usa `opencode run`.
"""
import argparse
import json
import os
import re
import shutil
import subprocess
MODELOS = ("opencode/glm-5.3-flash-free", "opencode/deepseek-v4.1-flash-free",
           "opencode/minimax-m3.1-flash-free", "opencode/big-pickle")
PROVEEDOR, RUTA = "opencode", "~/.config/opencode/opencode.json"
RUTA_AUTH = "~/.local/share/opencode/auth.json"
def es_gratuito(modelo):
    """Solo los gratuitos de Zen: los que acaban en «-free» y big-pickle."""
    nombre = str(modelo or "").split("/", 1)[-1]
    return nombre.endswith("-free") or nombre == "big-pickle"

def modelos_gratuitos(modelos=MODELOS):
    """Los gratuitos de una lista, sin repetir y en el orden recibido."""
    vistos, fuera = set(), []
    for modelo in modelos or ():
        if es_gratuito(modelo) and modelo not in vistos:
            vistos.add(modelo)
            fuera.append(modelo)
    return fuera

def bloque_zen(existente=None):
    """Bloque `provider.opencode` con SOLO gratuitos, conservando lo que ya hubiera."""
    bloque = dict(existente) if isinstance(existente, dict) else {}
    crudo = bloque.get("models")
    modelos = dict(crudo) if isinstance(crudo, dict) else {}
    for completo in modelos_gratuitos():
        nombre = completo.split("/", 1)[1]
        modelos.setdefault(nombre, {"name": nombre})
    bloque["name"] = bloque.get("name") or "OpenCode Zen (gratis)"
    bloque["models"] = modelos
    return bloque

def fusionar(cfg):
    """Copia del cfg con el proveedor Zen asegurado. No muta el dict recibido."""
    nuevo = json.loads(json.dumps(cfg)) if isinstance(cfg, dict) else {}
    if not isinstance(nuevo.get("provider"), dict):
        nuevo["provider"] = {}
    previo = nuevo["provider"].get(PROVEEDOR)
    nuevo["provider"][PROVEEDOR] = bloque_zen(previo)
    return nuevo, previo != nuevo["provider"][PROVEEDOR]

def hay_clave(entorno=None, ruta_auth=None, archivos=("~/.starseed/env", "~/.hermes/.env")):
    """¿Puede opencode autenticarse en Zen? Solo mira NOMBRES, nunca valores."""
    entorno = os.environ if entorno is None else entorno
    if str(entorno.get("OPENCODE_API_KEY") or "").strip():
        return True
    patron = re.compile(r"\s*(export\s+)?OPENCODE_API_KEY\s*=\s*\S")
    for ruta in archivos or ():
        try:
            with open(os.path.expanduser(ruta), encoding="utf-8") as f:
                if any(patron.match(linea) for linea in f):
                    return True
        except OSError:
            pass
    try:
        with open(os.path.expanduser(ruta_auth or RUTA_AUTH), encoding="utf-8") as f:
            return PROVEEDOR in (json.load(f) or {})
    except (OSError, ValueError, TypeError):
        return False

def probar(modelo=MODELOS[0], segundos=90):
    """Prueba REAL: una respuesta mínima de opencode con el modelo gratuito."""
    binario = shutil.which("opencode")
    if not binario:
        return False, "opencode no está instalado"
    try:
        r = subprocess.run([binario, "run", "--model", modelo, "Responde solo: zen"],
                           capture_output=True, text=True, timeout=segundos)
    except subprocess.TimeoutExpired:
        return False, "sin respuesta en %s s" % segundos
    salida = (r.stdout or r.stderr or "").strip()
    return (r.returncode == 0 and bool(salida)), (salida or "respuesta vacía")[:200]

def main(argv=None):
    p = argparse.ArgumentParser(description="Declara y prueba los gratuitos de OpenCode Zen.")
    p.add_argument("--config", default=RUTA)
    p.add_argument("--seco", action="store_true")
    p.add_argument("--probar", action="store_true")
    p.add_argument("--modelo", default=MODELOS[0])
    args = p.parse_args(argv)
    destino = os.path.expanduser(args.config)
    try:
        with open(destino, encoding="utf-8") as f:
            cfg = json.load(f)
    except FileNotFoundError:
        cfg = {}
    except ValueError as error:
        raise SystemExit("opencode.json inválido: %s" % error)
    nuevo, cambio = fusionar(cfg)
    if cambio and not args.seco:
        os.makedirs(os.path.dirname(destino) or ".", exist_ok=True)
        with open(destino + ".tmp", "w", encoding="utf-8") as f:
            json.dump(nuevo, f, ensure_ascii=False, indent=2)
        os.replace(destino + ".tmp", destino)
    estado = ("cambiaría" if cambio else "sin cambios") if args.seco else (
        "actualizado" if cambio else "ya estaba")
    print("opencode-zen: %s · %s" % (estado, args.config))
    print("modelos gratuitos: %s" % ", ".join(m.split("/", 1)[1] for m in MODELOS))
    if not hay_clave():
        print("aviso: sin OPENCODE_API_KEY ni sesión en auth.json; Zen fallará dentro de opencode")
    if not args.probar:
        return 0
    correcto, detalle = probar(args.modelo)
    print("prueba %s · %s: %s" % (args.modelo, "OK" if correcto else "FALLO", detalle))
    return 0 if correcto else 1

if __name__ == "__main__":
    raise SystemExit(main())
