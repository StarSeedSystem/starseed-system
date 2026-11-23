#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Configuración y prueba de Cloudroom para StarSeed OS.

Gestiona la configuración del proyecto Cloudroom, valida ajustes y expone
funciones puras para pruebas sin depender de room-cli ni red.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Dict, List, Tuple

#: Ruta por defecto del archivo de configuración
RUTA_DEFECTO = os.path.expanduser("~/.starseed/cloudroom-config.json")

#: Proveedores válidos que puede listar la nube de Cloudroom
PROVEEDORES_VALIDOS = (
    "nvidia", "xkiro", "groq", "llm7", "aihubmix", "tokenrouter", "apinex",
    "openai", "anthropic", "google", "mistral", "deepseek", "z-ai"
)

#: Harnesses válidos conocidos
HARNESSES_VALIDOS = ("opencode", "pi", "codex", "claude-code", "cursor", "hermes", "devin", "fx", "openclaw")

#: Límites por defecto del plan gratuito
CUPO_GRATIS_HILOS = 100
CICLO_DIAS = 30

DEFAULTS: Dict[str, Any] = {
    "proyecto_id": "",
    "modelo_preferido": "",
    "tope_dia": 6,
    "max_vivos": 3,
    "repetir_tras_h": 24,
    "max_por_tarea": 2,
    "gracia_h": 12,
    "gracia_sin_empezar_h": 2,
    "min_parche_s": 600,
    "proveedores_apartados": [],
    "modelos_fijados": {},
    "simultaneos_por_proveedor": {
        "nvidia": 2,
        "xkiro": 1,
        "groq": 2,
        "llm7": 2,
        "aihubmix": 2,
        "tokenrouter": 2,
        "apinex": 1,
    },
    "pausado": False,
}


def _es_entero_no_negativo(v: Any, minimo: int = 0, maximo: int | None = None) -> bool:
    if not isinstance(v, int) or isinstance(v, bool):
        return False
    if v < minimo:
        return False
    if maximo is not None and v > maximo:
        return False
    return True


def _es_lista_str(v: Any) -> bool:
    return isinstance(v, list) and all(isinstance(x, str) for x in v)


def _es_dict_str_str(v: Any) -> bool:
    return isinstance(v, dict) and all(isinstance(k, str) and isinstance(val, str) for k, val in v.items())


def _es_dict_str_int(v: Any) -> bool:
    return isinstance(v, dict) and all(isinstance(k, str) and isinstance(val, int) and not isinstance(val, bool) for k, val in v.items())


def validar(raw: Any) -> Tuple[bool, List[str]]:
    """Valida una configuración candidata de Cloudroom."""
    if not isinstance(raw, dict):
        return False, ["La configuración debe ser un objeto JSON"]
    errores: List[str] = []

    if "proyecto_id" in raw:
        pid = raw["proyecto_id"]
        if not isinstance(pid, str) or len(pid) > 120:
            errores.append("'proyecto_id' debe ser string ≤ 120 chars")

    if "modelo_preferido" in raw:
        mp = raw["modelo_preferido"]
        if not isinstance(mp, str) or len(mp) > 120:
            errores.append("'modelo_preferido' debe ser string ≤ 120 chars")

    for k, min_v, max_v in [
        ("tope_dia", 0, 50),
        ("max_vivos", 1, 20),
        ("repetir_tras_h", 1, 168),
        ("max_por_tarea", 1, 10),
        ("gracia_h", 1, 72),
        ("gracia_sin_empezar_h", 1, 24),
        ("min_parche_s", 60, 3600),
    ]:
        if k in raw and not _es_entero_no_negativo(raw[k], min_v, max_v):
            errores.append(f"'{k}' debe ser entero entre {min_v} y {max_v}")

    if "proveedores_apartados" in raw and not _es_lista_str(raw["proveedores_apartados"]):
        errores.append("'proveedores_apartados' debe ser lista de strings")
    elif "proveedores_apartados" in raw:
        for p in raw["proveedores_apartados"]:
            if p.lower() not in PROVEEDORES_VALIDOS:
                errores.append(f"Proveedor desconocido en 'proveedores_apartados': {p}")

    if "modelos_fijados" in raw and not _es_dict_str_str(raw["modelos_fijados"]):
        errores.append("'modelos_fijados' debe ser dict[str, str]")

    if "simultaneos_por_proveedor" in raw and not _es_dict_str_int(raw["simultaneos_por_proveedor"]):
        errores.append("'simultaneos_por_proveedor' debe ser dict[str, int]")
    elif "simultaneos_por_proveedor" in raw:
        for prov, val in raw["simultaneos_por_proveedor"].items():
            if prov.lower() not in PROVEEDORES_VALIDOS:
                errores.append(f"Proveedor desconocido en 'simultaneos_por_proveedor': {prov}")
            elif val < 0 or val > 10:
                errores.append(f"Valor inválido para '{prov}' en 'simultaneos_por_proveedor': {val} (0-10)")

    if "pausado" in raw and not isinstance(raw["pausado"], bool):
        errores.append("'pausado' debe ser booleano")

    return len(errores) == 0, errores


def _copia_defaults() -> Dict[str, Any]:
    return json.loads(json.dumps(DEFAULTS))


def fusionar(base: Dict[str, Any], parcial: Any) -> Tuple[Dict[str, Any], List[str]]:
    """Fusiona un dict parcial sobre `base` descartando campos inválidos con avisos."""
    cfg = _copia_defaults() if base is None else json.loads(json.dumps(base))
    avisos: List[str] = []
    if not isinstance(parcial, dict):
        return cfg, avisos

    if "proyecto_id" in parcial:
        pid = parcial["proyecto_id"]
        if isinstance(pid, str) and len(pid) <= 120:
            cfg["proyecto_id"] = pid
        else:
            avisos.append("'proyecto_id' inválido; se conserva el anterior")

    if "modelo_preferido" in parcial:
        mp = parcial["modelo_preferido"]
        if isinstance(mp, str) and len(mp) <= 120:
            cfg["modelo_preferido"] = mp
        else:
            avisos.append("'modelo_preferido' inválido; se conserva el anterior")

    for k, min_v, max_v in [
        ("tope_dia", 0, 50),
        ("max_vivos", 1, 20),
        ("repetir_tras_h", 1, 168),
        ("max_por_tarea", 1, 10),
        ("gracia_h", 1, 72),
        ("gracia_sin_empezar_h", 1, 24),
        ("min_parche_s", 60, 3600),
    ]:
        if k in parcial:
            v = parcial[k]
            if _es_entero_no_negativo(v, min_v, max_v):
                cfg[k] = v
            else:
                avisos.append(f"'{k}' inválido; se conserva {cfg[k]}")

    if "proveedores_apartados" in parcial:
        pa = parcial["proveedores_apartados"]
        if _es_lista_str(pa):
            validos = [p for p in pa if p.lower() in PROVEEDORES_VALIDOS]
            if len(validos) != len(pa):
                avisos.append("Algunos proveedores en 'proveedores_apartados' son desconocidos y se descartaron")
            cfg["proveedores_apartados"] = validos
        else:
            avisos.append("'proveedores_apartados' inválido; se conserva el anterior")

    if "modelos_fijados" in parcial:
        mf = parcial["modelos_fijados"]
        if _es_dict_str_str(mf):
            cfg["modelos_fijados"] = mf
        else:
            avisos.append("'modelos_fijados' inválido; se conserva el anterior")

    if "simultaneos_por_proveedor" in parcial:
        sp = parcial["simultaneos_por_proveedor"]
        if _es_dict_str_int(sp):
            valido = dict(cfg["simultaneos_por_proveedor"])
            for prov, val in sp.items():
                if prov.lower() in PROVEEDORES_VALIDOS and 0 <= val <= 10:
                    valido[prov.lower()] = val
                else:
                    avisos.append(f"Entrada inválida en 'simultaneos_por_proveedor': {prov}={val}")
            cfg["simultaneos_por_proveedor"] = valido
        else:
            avisos.append("'simultaneos_por_proveedor' inválido; se conserva el anterior")

    if "pausado" in parcial:
        if isinstance(parcial["pausado"], bool):
            cfg["pausado"] = parcial["pausado"]
        else:
            avisos.append("'pausado' inválido; se conserva el anterior")

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
    tmp = ruta_real.with_suffix(f".tmp-{os.getpid()}")
    tmp.write_text(json.dumps(normalizada, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(tmp, ruta_real)
    return normalizada


def probar_configuracion(cfg: Dict[str, Any], ahora: float | None = None) -> Dict[str, Any]:
    """Prueba la configuración: verifica CLI, proyecto, y límites.

    Función pura para tests: no ejecuta room-cli, solo valida lógica.
    """
    import time
    ahora = ahora or time.time()

    resultado = {
        "ok": True,
        "cli_disponible": False,
        "proyecto_valido": bool(cfg.get("proyecto_id")),
        "modelo_preferido_valido": bool(cfg.get("modelo_preferido")),
        "tope_dia": cfg.get("tope_dia", DEFAULTS["tope_dia"]),
        "max_vivos": cfg.get("max_vivos", DEFAULTS["max_vivos"]),
        "avisos": [],
        "errores": [],
    }

    # Verificar CLI (simulado en tests)
    cli_path = os.environ.get("CLOUDROOM_CLI") or os.path.expanduser("~/.local/bin/room-cli")
    resultado["cli_disponible"] = os.path.isfile(cli_path) or False
    if not resultado["cli_disponible"]:
        resultado["avisos"].append("room-cli no encontrado en PATH ni ~/.local/bin/room-cli")

    # Validar rangos
    if cfg.get("tope_dia", 0) > 50:
        resultado["errores"].append("tope_dia excede máximo razonable (50)")
        resultado["ok"] = False

    if cfg.get("max_vivos", 0) > 20:
        resultado["errores"].append("max_vivos excede máximo razonable (20)")
        resultado["ok"] = False

    return resultado


if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == "validar":
        cfg, avisos = cargar()
        ok, errores = validar(cfg)
        print(json.dumps({"ok": ok, "config": cfg, "avisos": avisos, "errores": errores}, ensure_ascii=False, indent=2))
    else:
        print(json.dumps(cargar()[0], ensure_ascii=False, indent=2))