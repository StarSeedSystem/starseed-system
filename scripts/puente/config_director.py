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

# Los pesos por defecto viven en prioridad_logica; si ese módulo no está (o
# cambia de nombre), este módulo debe seguir cargando, así que va con respaldo.
try:
    from prioridad_logica import PESOS as PESOS_DEFECTO
except ImportError:
    PESOS_DEFECTO = {
        "desbloqueo_por_tarea": 10.0,
        "desbloqueo_tope": 5,
        "continuidad": 15.0,
        "antiguedad_por_hora": 1.0,
        "antiguedad_tope": 24.0,
        "castigo_intento": 8.0,
        "castigo_riesgo": 10.0,
    }


# Solo las claves con valor numérico se pueden ajustar desde el Mando; las que
# son estructuras (p. ej. "corta", una tabla por niveles) no entran en el panel.
def _es_valor_numerico(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool)


PESOS = {k: v for k, v in PESOS_DEFECTO.items() if _es_valor_numerico(v)}

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
    "prioridad": dict(PESOS),
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


NIVELES_VALIDOS = ("libre", "haiku", "sonnet")


def _es_numero(v):
    # Los pesos admiten int o float (positivos o negativos), nunca bool.
    return _es_valor_numerico(v)


def _validar_prioridad(prioridad):
    if not isinstance(prioridad, dict):
        return ["'prioridad' debe ser un objeto"]
    errores = []
    for k, v in prioridad.items():
        if k not in PESOS:
            errores.append("'prioridad.%s' no es un peso conocido" % k)
        elif not _es_numero(v):
            errores.append("'prioridad.%s' debe ser un número" % k)
    return errores


def _es_lista_niveles(v):
    """Escalera válida: lista no vacía de niveles conocidos."""
    return (
        isinstance(v, list)
        and len(v) > 0
        and all(isinstance(x, str) and x in NIVELES_VALIDOS for x in v)
    )


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
        elif k == "prioridad":
            errores.extend(_validar_prioridad(v))
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
        elif k == "niveles" and not _es_lista_niveles(v):
            errores.append(
                "'escalada.niveles' debe ser una lista no vacía de %s"
                % ", ".join(NIVELES_VALIDOS)
            )
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
            elif k == "niveles":
                if _es_lista_niveles(v):
                    esc[k] = list(v)
                else:
                    avisos.append(
                        "'escalada.niveles' inválido, se usa la escalera por defecto"
                    )
        cfg["escalada"] = esc
    if isinstance(con.get("prioridad"), dict):
        pri = dict(cfg["prioridad"])
        for k, v in con["prioridad"].items():
            if k not in PESOS:
                avisos.append("'prioridad.%s' no es un peso conocido, se descarta" % k)
            elif _es_numero(v):
                pri[k] = v
            else:
                avisos.append("'prioridad.%s' no es un número, se usa %s" % (k, pri[k]))
        cfg["prioridad"] = pri
    return cfg, avisos
