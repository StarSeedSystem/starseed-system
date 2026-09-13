#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Carga y valida los ajustes que los directores Python leen en cada pasada.

Los directores tenían sus umbrales clavados como constantes (ESPERA_MIN, disco,
reintentos, proveedores a usar). Para que la pestaña Director del Mando mande de
verdad, esos ajustes viven ahora en `starseed_memory_root/mando/director-config.json`,
y este módulo PURO los carga fusionando sobre unos valores por defecto y rechazando
lo que no sea válido (tipo o rango).

  · cargar(ruta) -> (dict, list[str]): fusiona el JSON sobre DEFAULTS, validando
    tipos y rangos (enteros >= 0, listas de str) e ignorando claves desconocidas;
    la lista de avisos explica cada valor descartado.
  · validar(d) -> list[str]: los errores de un dict ya leído.
"""

import json
import os

RAIZ = os.environ.get("STARSEED_ROOT") or "/Users/alex/Documents/starseed-os-main"
RUTA_CONFIG = os.path.join(
    RAIZ, "starseed_memory_root", "mando", "director-config.json"
)

DEFAULTS = {
    "espera_aprobacion_min": 10,
    "intervalo_s": 180,
    "trabajadores": 5,
    "tope_por_relanzamiento": 20,
    "reintentos_por_pasada": 3,
    "escalada": {
        "tope_haiku_dia": 20,
        "tope_sonnet_dia": 5,
        "activa": True,
    },
    "proveedores_apartados": [],
    "aviso_checkin": True,
    "pausado": False,
    "disco_min_gb": 5,
}

CLAVES_ENTERO = {
    "espera_aprobacion_min",
    "intervalo_s",
    "trabajadores",
    "tope_por_relanzamiento",
    "reintentos_por_pasada",
    "disco_min_gb",
}
CLAVES_LISTA_STR = {"proveedores_apartados"}
CLAVES_BOOL = {"aviso_checkin", "pausado"}


def _es_entero_no_negativo(v):
    return isinstance(v, int) and not isinstance(v, bool) and v >= 0


def _es_lista_str(v):
    return isinstance(v, list) and all(isinstance(x, str) for x in v)


def validar(d):
    errores = []
    for k, v in d.items():
        if k in CLAVES_ENTERO and not _es_entero_no_negativo(v):
            errores.append("'%s' debe ser un entero >= 0" % k)
        elif k in CLAVES_LISTA_STR and not _es_lista_str(v):
            errores.append("'%s' debe ser una lista de str" % k)
        elif k in CLAVES_BOOL and not isinstance(v, bool):
            errores.append("'%s' debe ser un booleano" % k)
        elif k == "escalada":
            errores.extend(_validar_escalada(v))
    return errores


def _validar_escalada(escalada):
    errores = []
    if not isinstance(escalada, dict):
        return ["'escalada' debe ser un objeto"]
    for k, v in escalada.items():
        if k in {"tope_haiku_dia", "tope_sonnet_dia"} and not _es_entero_no_negativo(v):
            errores.append("'escalada.%s' debe ser un entero >= 0" % k)
        elif k == "activa" and not isinstance(v, bool):
            errores.append("'escalada.activa' debe ser un booleano")
    return errores


def cargar(ruta=None):
    """Carga el JSON (si existe y parsea) y lo fusiona sobre DEFAULTS.

    Ignora claves que DEFAULTS no conoce y deja fuera los valores inválidos: el
    resultado siempre es un dict con las claves de DEFAULTS y valores sanos.
    Devuelve (cfg, avisos): avisos explica cada valor descartado.
    """
    ruta = ruta or RUTA_CONFIG
    cfg = json.loads(json.dumps(DEFAULTS))
    avisos = []
    try:
        with open(ruta, encoding="utf-8") as fh:
            con = json.load(fh)
    except Exception:
        return cfg, avisos
    if not isinstance(con, dict):
        return cfg, avisos
    for k in CLAVES_ENTERO:
        if k in con and _es_entero_no_negativo(con[k]):
            cfg[k] = con[k]
    for k in CLAVES_LISTA_STR:
        if k in con and _es_lista_str(con[k]):
            cfg[k] = list(con[k])
    for k in CLAVES_BOOL:
        if k in con and isinstance(con[k], bool):
            cfg[k] = con[k]
    if isinstance(con.get("escalada"), dict):
        esc = dict(DEFAULTS["escalada"])
        e = con["escalada"]
        for k, v in e.items():
            if k in ("tope_haiku_dia", "tope_sonnet_dia"):
                if _es_entero_no_negativo(v):
                    esc[k] = v
                else:
                    avisos.append("'escalada.%s' inválido, se usa %s" % (k, esc[k]))
            elif k == "activa" and isinstance(v, bool):
                esc[k] = v
        cfg["escalada"] = esc
    return cfg, avisos
