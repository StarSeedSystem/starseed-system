#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Generador del guion de Blender desde un Trabajo3D validado (§4.3 del contrato).

Puro y determinista: mismo trabajo + misma versión de Blender → el mismo texto byte a byte.
Nunca interpola textos libres dentro del código; los textos van como literales de `json.dumps`.
El nombre de cada archivo de salida lo fabrica este módulo desde el índice, nunca la persona.
Las claves de `animar` se emiten como listas [fotograma, valor] en el orden del vocabulario.
"""
import hashlib, json, math, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import barreras as B

EXTENSIONES = {"render_png": "png", "render_mp4": "mp4", "render_exr": "exr", "exportar_glb": "glb"}


def _literal(valor, espec=None):
    if espec and espec.get("t") == "obj":
        campos = espec.get("campos", {})
        return "[" + ", ".join(_literal(valor[c], campos.get(c)) for c in campos if c in valor) + "]"
    if isinstance(valor, bool): return "True" if valor else "False"
    if isinstance(valor, int): return repr(valor)
    if isinstance(valor, float):
        if not math.isfinite(valor): raise ValueError("número no finito en el trabajo")
        return repr(valor)
    if isinstance(valor, str): return json.dumps(valor, ensure_ascii=True)
    if valor is None: return "None"
    if isinstance(valor, (list, tuple)): return "[" + ", ".join(_literal(x, espec.get("de") if espec else None) for x in valor) + "]"
    raise ValueError("literal no admitido: %s" % type(valor).__name__)


def _cabecera(version_blender, version_vocabulario):
    version = " ".join(str(version_blender).split())
    return "# StarSeed OS · Blender %s · vocabulario v%s\n# Generado desde un Trabajo3D validado. No editar a mano." % (version, version_vocabulario)


def _llamada(nombre, campos, definicion):
    partes = ["%s=%s" % (campo, _literal(campos[campo], definicion["params"][campo])) for campo in definicion.get("params", {}) if campo in campos]
    return "o.%s(%s)" % (nombre, ", ".join(partes))


def _salida(salida, indice, vocab):
    tipo = salida["tipo"]
    partes = ["%s=%s" % (campo, _literal(salida[campo], vocab["salidas"][tipo]["params"][campo])) for campo in vocab["salidas"][tipo]["params"] if campo in salida]
    partes.append("ruta=%s" % _literal("salidas/salida-%d.%s" % (indice, EXTENSIONES[tipo])))
    return "o.%s(%s)" % (tipo, ", ".join(partes))


def generar_guion(trabajo, version_blender):
    vocab = B.cargar_vocabulario()
    ok, limpio, motivos = B.validar_trabajo(trabajo, vocab)
    if not ok: raise ValueError("trabajo inválido: " + "; ".join(motivos))
    lineas = [_cabecera(version_blender, vocab["version"]), "import sys", 'sys.path.insert(0, ".")', "import ops_starseed as o", "o.iniciar()"]
    lineas += [_llamada(op["op"], op, vocab["operaciones"][op["op"]]) for op in limpio["escena"]]
    lineas += [_salida(s, i, vocab) for i, s in enumerate(limpio["salidas"], 1)]
    src = "\n".join(lineas) + "\n"
    errores = B.verificar_guion(src)
    if errores: raise ValueError("guion no verificado: " + "; ".join(errores))
    return src


def sha256_guion(src): return hashlib.sha256(src.encode("utf-8")).hexdigest()
