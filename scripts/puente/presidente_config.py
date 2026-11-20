#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Configuración compartida del Director presidente (espejo de `src/lib/mando/presidente-config.ts`).

Vive en `~/.starseed/director-presidente-config.json` y se edita desde la cabecera/Ajustes
de MetaGenesis o desde `starseed-puente`. Nunca guarda claves ni rutas de sesión privadas.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Dict, List, Tuple

PROVEEDORES_VALIDOS = ("claude", "hermes", "agy", "chatgpt")
CLAVES_CANALES_SYNC = ("hermes", "telegram", "astraura", "nube")

RUTA_DEFECTO = os.path.expanduser("~/.starseed/director-presidente-config.json")

DEFAULTS: Dict[str, Any] = {
    "orden_proveedores": ["claude", "hermes", "agy", "chatgpt"],
    "proveedores_activos": {
        "claude": True,
        "hermes": True,
        "agy": True,
        "chatgpt": True,
    },
    "timeouts_reintento_s": [120, 300, 600],
    "respaldo_flota_gratis": True,
    "modelo_flota_gratis": "auto",
    "max_opus_dia": 40,
    "sincronizar_canales": {
        "hermes": True,
        "telegram": True,
        "astraura": True,
        "nube": True,
    },
}


def _copia_defaults() -> Dict[str, Any]:
    return json.loads(json.dumps(DEFAULTS))


def _es_entero_positivo(v: Any, minimo: int, maximo: int) -> bool:
    return isinstance(v, int) and not isinstance(v, bool) and minimo <= v <= maximo


def validar(raw: Any) -> Tuple[bool, List[str]]:
    """Valida una configuración candidata del Director presidente."""
    if not isinstance(raw, dict):
        return False, ["La configuración debe ser un objeto JSON"]
    errores: List[str] = []

    if "orden_proveedores" in raw:
        ord_p = raw["orden_proveedores"]
        if (
            not isinstance(ord_p, list)
            or len(ord_p) == 0
            or not all(isinstance(p, str) and p in PROVEEDORES_VALIDOS for p in ord_p)
        ):
            errores.append("'orden_proveedores' debe listar proveedores válidos")

    if "proveedores_activos" in raw:
        pa = raw["proveedores_activos"]
        if not isinstance(pa, dict):
            errores.append("'proveedores_activos' debe ser un objeto")
        else:
            for k, v in pa.items():
                if k not in PROVEEDORES_VALIDOS:
                    errores.append("Proveedor desconocido en 'proveedores_activos': %s" % k)
                elif not isinstance(v, bool):
                    errores.append("'proveedores_activos.%s' debe ser booleano" % k)

    if "timeouts_reintento_s" in raw:
        ts = raw["timeouts_reintento_s"]
        if (
            not isinstance(ts, list)
            or not (1 <= len(ts) <= 5)
            or not all(_es_entero_positivo(t, 15, 1800) for t in ts)
        ):
            errores.append("'timeouts_reintento_s' debe tener 1..5 enteros entre 15 y 1800 s")

    if "respaldo_flota_gratis" in raw and not isinstance(raw["respaldo_flota_gratis"], bool):
        errores.append("'respaldo_flota_gratis' debe ser booleano")

    if "modelo_flota_gratis" in raw:
        m = raw["modelo_flota_gratis"]
        if not isinstance(m, str) or not m.strip() or len(m) > 120:
            errores.append("'modelo_flota_gratis' debe ser texto no vacío (≤120 chars)")

    if "max_opus_dia" in raw and not _es_entero_positivo(raw["max_opus_dia"], 0, 200):
        errores.append("'max_opus_dia' debe ser entero entre 0 y 200")

    if "sincronizar_canales" in raw:
        sc = raw["sincronizar_canales"]
        if not isinstance(sc, dict):
            errores.append("'sincronizar_canales' debe ser un objeto")
        else:
            for k, v in sc.items():
                if k not in CLAVES_CANALES_SYNC:
                    errores.append("Canal desconocido en 'sincronizar_canales': %s" % k)
                elif not isinstance(v, bool):
                    errores.append("'sincronizar_canales.%s' debe ser booleano" % k)

    return len(errores) == 0, errores


def fusionar(base: Dict[str, Any], parcial: Any) -> Tuple[Dict[str, Any], List[str]]:
    """Fusiona un dict parcial sobre `base` descartando campos inválidos con avisos."""
    cfg = json.loads(json.dumps(base if isinstance(base, dict) else DEFAULTS))
    avisos: List[str] = []
    if not isinstance(parcial, dict):
        return cfg, avisos

    if "orden_proveedores" in parcial:
        raw_ord = parcial["orden_proveedores"]
        if isinstance(raw_ord, list):
            limpio = []
            for p in raw_ord:
                if isinstance(p, str) and p in PROVEEDORES_VALIDOS and p not in limpio:
                    limpio.append(p)
            for p in PROVEEDORES_VALIDOS:
                if p not in limpio:
                    limpio.append(p)
            if limpio:
                cfg["orden_proveedores"] = limpio
        else:
            avisos.append("'orden_proveedores' inválido; se conserva el anterior")

    if "proveedores_activos" in parcial:
        pa = parcial["proveedores_activos"]
        if isinstance(pa, dict):
            for p in PROVEEDORES_VALIDOS:
                if p in pa:
                    if isinstance(pa[p], bool):
                        cfg["proveedores_activos"][p] = pa[p]
                    else:
                        avisos.append("'proveedores_activos.%s' inválido" % p)
        else:
            avisos.append("'proveedores_activos' inválido")

    if "timeouts_reintento_s" in parcial:
        ts = parcial["timeouts_reintento_s"]
        if isinstance(ts, list) and 1 <= len(ts) <= 5 and all(_es_entero_positivo(t, 15, 1800) for t in ts):
            cfg["timeouts_reintento_s"] = list(ts)
        else:
            avisos.append("'timeouts_reintento_s' inválido; se conserva el anterior")

    if "respaldo_flota_gratis" in parcial:
        if isinstance(parcial["respaldo_flota_gratis"], bool):
            cfg["respaldo_flota_gratis"] = parcial["respaldo_flota_gratis"]
        else:
            avisos.append("'respaldo_flota_gratis' inválido")

    if "modelo_flota_gratis" in parcial:
        m = parcial["modelo_flota_gratis"]
        if isinstance(m, str) and m.strip() and len(m.strip()) <= 120:
            cfg["modelo_flota_gratis"] = m.strip()
        else:
            avisos.append("'modelo_flota_gratis' inválido")

    if "max_opus_dia" in parcial:
        if _es_entero_positivo(parcial["max_opus_dia"], 0, 200):
            cfg["max_opus_dia"] = parcial["max_opus_dia"]
        else:
            avisos.append("'max_opus_dia' inválido")

    if "sincronizar_canales" in parcial:
        sc = parcial["sincronizar_canales"]
        if isinstance(sc, dict):
            for k in CLAVES_CANALES_SYNC:
                if k in sc:
                    if isinstance(sc[k], bool):
                        cfg["sincronizar_canales"][k] = sc[k]
                    else:
                        avisos.append("'sincronizar_canales.%s' inválido" % k)
        else:
            avisos.append("'sincronizar_canales' inválido")

    return cfg, avisos


def cargar(ruta: str | None = None) -> Tuple[Dict[str, Any], List[str]]:
    """Carga la configuración desde disco fusionando con DEFAULTS."""
    ruta_real = ruta or RUTA_DEFECTO
    try:
        datos = json.loads(Path(ruta_real).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return _copia_defaults(), []
    return fusionar(_copia_defaults(), datos)


def guardar(cfg: Dict[str, Any], ruta: str | None = None) -> Dict[str, Any]:
    """Valida, normaliza y guarda atómicamente en disco."""
    normalizada, _ = fusionar(_copia_defaults(), cfg)
    ruta_real = Path(ruta or RUTA_DEFECTO)
    ruta_real.parent.mkdir(parents=True, exist_ok=True)
    tmp = ruta_real.with_suffix(".tmp-%d" % os.getpid())
    tmp.write_text(json.dumps(normalizada, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(tmp, ruta_real)
    return normalizada
