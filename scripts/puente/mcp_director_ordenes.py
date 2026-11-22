# -*- coding: utf-8 -*-
"""Órdenes cerradas de MetaGenesis para el director (ACC1121B).

El presidente pide operaciones por nombre; nunca una consola libre. Cada orden
llama a una herramienta que ya existe, valida sus argumentos y deja rastro en
`starseed_memory_root/mando/ordenes-direccion.jsonl`. Lo reservado a Alex no se
ejecuta: se devuelve con su motivo.
"""
import contextlib
import io
import json
import os
import re
import time

ORDENES = {
    "priorizar": ("Marca una tarea para que vaya la primera.", ("tarea",)),
    "reabrir": ("Devuelve una tarea bloqueada a la cola viva.", ("tarea",)),
    "encargar": ("Crea una tarea nueva y su cola.", ("ola", "id", "titulo", "archivos", "prompt", "depende")),
    "lanzar_cola": ("Lanza una cola en el enjambre.", ("cola", "trabajadores")),
    "pausar_enjambre": ("Pausa la autonomía del enjambre (no la publicación).", ()),
    "reanudar_enjambre": ("Reanuda la autonomía del enjambre.", ()),
    "buscar_capacidad": ("Busca capacidad y, si se pide, la aplica.", ("aplicar", "sondear_medios", "mac")),
    "lanzar_nube": ("Lanza la nube cediendo trabajo de la Mac.", ("cola", "trabajadores", "minutos", "tope")),
    "compilar_prueba": ("Pide una compilación de prueba.", ("accion", "sha", "numero", "nota")),
    "escalar": ("Escala una tarea al siguiente motor disponible.", ("tarea", "intentos", "es_arquitectura", "es_diseno", "disponibilidad", "presupuesto")),
    "archivar_worktrees": ("Archiva y poda worktrees terminados.", ("aplicar",)),
    "notar": ("Apunta una nota o un relevo en el canal común.", ("texto", "tipo", "canal")),
}
RESERVADAS = {
    "publicar": "publicar fuera de las puertas",
    "publicar_fuera_de_puertas": "publicar fuera de las puertas",
    "quitar_pausa_publicacion": "quitar una pausa de publicación",
    "claves": "tocar claves o cuentas",
    "cuentas": "tocar claves o cuentas",
    "a1_con_privilegios": "dar privilegios al A1",
    "aceptar_en_nombre_de_alex": "aceptar algo en nombre de Alex",
    "conceder_en_nombre_de_alex": "conceder algo en nombre de Alex",
    "cerrar_apps": "cerrar las apps de Alex",
}
_RE_ID = re.compile(r"^[A-Za-z]+\d+[A-Za-z0-9]*$")
_RE_COLA = re.compile(r"^cola-[A-Za-z0-9._-]{1,80}$")
_RE_OLA = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{1,40}$")
_RE_CANAL = re.compile(r"^[a-z][a-z0-9-]{1,39}$")
_RE_SHA = re.compile(r"^[0-9a-f]{40}$")


def _raiz():
    return os.environ.get("STARSEED_ROOT") or os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def _registro():
    return os.environ.get("STARSEED_ORDENES_DIRECCION") or os.path.join(
        _raiz(), "starseed_memory_root", "mando", "ordenes-direccion.jsonl"
    )


def _fail(motivo):
    raise ValueError(motivo)


def _leer_json(ruta, defecto):
    try:
        with open(ruta, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return defecto


def _texto(v, campo, maximo=2000, requerido=True):
    if v is None and not requerido:
        return ""
    if not isinstance(v, str) or not v.strip():
        _fail("%s es obligatorio" % campo)
    v = v.strip()
    if len(v) > maximo:
        _fail("%s pasa de %d caracteres" % (campo, maximo))
    return v


def _id(v, campo="tarea"):
    if not isinstance(v, str) or not _RE_ID.match(v.strip()):
        _fail("%s no válido" % campo)
    return v.strip()


def _cola(v):
    if not isinstance(v, str) or not _RE_COLA.match(v.strip()):
        _fail("cola no válida")
    return v.strip()


def _ola(v):
    if not isinstance(v, str) or not _RE_OLA.match(v.strip()):
        _fail("ola no válida")
    return v.strip()


def _canal(v):
    if v is None:
        return "mando"
    if not isinstance(v, str) or not _RE_CANAL.match(v.strip()):
        _fail("canal no válido")
    return v.strip()


def _lista_ids(v, campo, maximo=20):
    if v is None:
        return []
    if not isinstance(v, list) or len(v) > maximo:
        _fail("%s debe ser una lista de hasta %d ids" % (campo, maximo))
    return [_id(x, campo) for x in v]


def _bool(v, campo, defecto=False):
    if v is None:
        return defecto
    if not isinstance(v, bool):
        _fail("%s debe ser true o false" % campo)
    return v


def _entero(v, campo, defecto, minimo, maximo):
    if v is None:
        return defecto
    if isinstance(v, bool) or not isinstance(v, int) or not minimo <= v <= maximo:
        _fail("%s debe ser un entero entre %d y %d" % (campo, minimo, maximo))
    return v
