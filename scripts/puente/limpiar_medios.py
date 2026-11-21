#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""limpiar_medios · deja medios.json solo con los medios reales.

Agrupa codex:mac:mac:<puerto> y opencode:mac:mac:<puerto> por tipo y quita
los inactivos viejos, con copia previa.

Reglas:
- codex:mac:mac:*  →  se conserva solo el de mayor puerto (el más reciente)
- opencode:mac:mac:*  →  se conserva solo el de mayor puerto (el más reciente)
- otros medios (nube, oracle, etc.) se conservan todos
- entradas sin latido fresco (> 10 min) se marcan inactivas y se quitan
- se hace backup automático antes de modificar

Uso:
    python3 scripts/puente/limpiar_medios.py           # limpia y guarda
    python3 scripts/puente/limpiar_medios.py --seco    # solo muestra qué haría
    python3 scripts/puente/limpiar_medios.py --ver     # muestra estado actual
"""
from __future__ import annotations

import json
import os
import shutil
import sys
import time
from collections import defaultdict

RAIZ = os.environ.get("STARSEED_ROOT") or os.path.expanduser("~/Documents/starseed-os-main")
OLAS = os.path.join(RAIZ, "starseed_memory_root", "olas")
MEDIOS_JSON = os.path.join(OLAS, "medios.json")
BACKUP_DIR = os.path.expanduser("~/.starseed/backups/medios")

# Umbral: latido mayor a 10 min = inactivo
LATIDO_MAX_S = 600

# Permite sobrescribir la ruta para tests
_MEDIOS_JSON_OVERRIDE: str | None = None
_BACKUP_DIR_OVERRIDE: str | None = None


def _get_medios_json() -> str:
    return _MEDIOS_JSON_OVERRIDE or MEDIOS_JSON


def _get_backup_dir() -> str:
    return _BACKUP_DIR_OVERRIDE or BACKUP_DIR


def _set_rutas_para_test(medios_json: str | None, backup_dir: str | None) -> tuple[str | None, str | None]:
    """Para tests: cambia las rutas y devuelve las anteriores."""
    global _MEDIOS_JSON_OVERRIDE, _BACKUP_DIR_OVERRIDE
    antes_m, antes_b = _MEDIOS_JSON_OVERRIDE, _BACKUP_DIR_OVERRIDE
    _MEDIOS_JSON_OVERRIDE, _BACKUP_DIR_OVERRIDE = medios_json, backup_dir
    return antes_m, antes_b


def _leer_medios() -> dict | None:
    try:
        with open(_get_medios_json(), encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def _escribir_medios(datos: dict) -> None:
    ruta = _get_medios_json()
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    tmp = ruta + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(datos, f, ensure_ascii=False, indent=1)
    os.replace(tmp, ruta)


def _backup() -> str:
    """Crea backup con timestamp y retorna la ruta."""
    backup_dir = _get_backup_dir()
    medios_json = _get_medios_json()
    os.makedirs(backup_dir, exist_ok=True)
    ts = time.strftime("%Y%m%d-%H%M%S")
    backup_path = os.path.join(backup_dir, f"medios.json.{ts}.bak")
    shutil.copy2(medios_json, backup_path)
    # Mantener solo los últimos 10 backups
    backups = sorted(
        [os.path.join(backup_dir, f) for f in os.listdir(backup_dir) if f.startswith("medios.json.")],
        key=os.path.getmtime,
        reverse=True,
    )
    for viejo in backups[10:]:
        try:
            os.unlink(viejo)
        except OSError:
            pass
    return backup_path


def _parsear_medio_id(medio_id: str) -> tuple[str, str, str, str | None]:
    """Parsea 'codex:mac:mac:30929' → ('codex', 'mac', 'mac', '30929')."""
    partes = medio_id.split(":", 3)
    if len(partes) == 4:
        return partes[0], partes[1], partes[2], partes[3]
    if len(partes) == 3:
        return partes[0], partes[1], partes[2], None
    return medio_id, "", "", None


def _es_tipo_mac(origen: str, servidor: str) -> bool:
    return origen == "mac" and servidor == "mac"


def _filtrar_medios(medios: dict, ahora: float) -> tuple[dict, list[str]]:
    """Filtra y agrupa medios. Devuelve (medios_filtrados, lista_de_acciones)."""
    acciones = []

    # Separar por tipo de medio
    por_tipo: dict[str, list[tuple[str, dict]]] = defaultdict(list)
    for mid, m in medios.items():
        motor, origen, servidor, puerto = _parsear_medio_id(mid)
        tipo = f"{motor}:{origen}:{servidor}"
        por_tipo[tipo].append((mid, m))

    nuevos_medios = {}

    for tipo, entradas in por_tipo.items():
        motor, origen, servidor = tipo.split(":", 2)
        es_mac_local = _es_tipo_mac(origen, servidor)

        # Filtrar: quitar inactivos (latido viejo)
        activas = []
        for mid, m in entradas:
            latido = float(m.get("latido") or 0)
            if latido and ahora - latido < LATIDO_MAX_S:
                activas.append((mid, m))
            else:
                acciones.append(f"  - elimino inactivo: {mid} (latido {int(ahora - latido)}s atrás)")

        if not activas:
            acciones.append(f"  - {tipo}: todas inactivas, se quitan")
            continue

        if es_mac_local and motor in ("codex", "opencode"):
            # Agrupar por motor: conservar solo la de mayor puerto (más reciente)
            activas.sort(key=lambda x: int(_parsear_medio_id(x[0])[3] or 0), reverse=True)
            conservada = activas[0]
            for mid, m in activas[1:]:
                acciones.append(f"  - elimino duplicado antiguo: {mid}")
            nuevos_medios[conservada[0]] = conservada[1]
            acciones.append(f"  + conservo {conservada[0]} (puerto {_parsear_medio_id(conservada[0])[3]})")
        else:
            # Otros tipos: conservar todas las activas
            for mid, m in activas:
                nuevos_medios[mid] = m
                acciones.append(f"  + conservo {mid}")

    return nuevos_medios, acciones


def limpiar(seco: bool = False, ahora: float | None = None) -> dict:
    """Ejecuta la limpieza. Si seco=True, no escribe.

    Args:
        seco: Si True, solo simula y no escribe.
        ahora: Timestamp opcional para tests (por defecto time.time()).
    """
    datos = _leer_medios()
    if not datos:
        return {"hecho": False, "motivo": "no hay medios.json o está vacío"}

    medios = datos.get("medios") or {}
    if not isinstance(medios, dict):
        return {"hecho": False, "motivo": "formato inválido: 'medios' no es dict"}

    ahora = time.time() if ahora is None else ahora
    antes = len(medios)
    nuevos, acciones = _filtrar_medios(medios, ahora)
    despues = len(nuevos)

    resultado = {
        "hecho": True,
        "antes": antes,
        "despues": despues,
        "eliminados": antes - despues,
        "acciones": acciones,
    }

    if seco:
        resultado["seco"] = True
        return resultado

    if antes == despues and not acciones:
        resultado["hecho"] = False
        resultado["motivo"] = "nada que limpiar"
        return resultado

    # Backup antes de escribir
    backup_path = _backup()
    resultado["backup"] = backup_path

    # Escribir nuevo medios.json
    nuevos_datos = {"generado": time.strftime("%Y-%m-%dT%H:%M:%S"), "medios": nuevos}
    _escribir_medios(nuevos_datos)

    return resultado


def ver() -> dict:
    """Muestra el estado actual de medios.json sin modificar."""
    datos = _leer_medios()
    if not datos:
        return {"existe": False}

    medios = datos.get("medios") or {}
    ahora = time.time()

    resumen = {"existe": True, "total": len(medios), "por_tipo": defaultdict(int), "detalle": []}
    for mid, m in medios.items():
        motor, origen, servidor, puerto = _parsear_medio_id(mid)
        tipo = f"{motor}:{origen}:{servidor}"
        resumen["por_tipo"][tipo] += 1
        latido = float(m.get("latido") or 0)
        estado = "activo" if latido and ahora - latido < LATIDO_MAX_S else "inactivo"
        resumen["detalle"].append({
            "id": mid,
            "tipo": tipo,
            "estado": estado,
            "latido_hace_s": int(ahora - latido) if latido else None,
            "capacidad": m.get("capacidad", 0),
            "carga": m.get("carga", 0),
        })

    return resumen


def main(argv: list[str]) -> int:
    if len(argv) > 1 and argv[1] == "--ver":
        r = ver()
        if not r["existe"]:
            print("medios.json no existe o está vacío")
            return 0
        print(f"Total: {r['total']} medios")
        for tipo, count in sorted(r["por_tipo"].items()):
            print(f"  {tipo}: {count}")
        print("\nDetalle:")
        for d in r["detalle"]:
            lat = f"{d['latido_hace_s']}s" if d['latido_hace_s'] is not None else "nunca"
            print(f"  {d['id']:30s}  {d['estado']:8s}  latido: {lat:>6s}  cap={d['capacidad']}  carga={d['carga']}")
        return 0

    seco = "--seco" in argv
    r = limpiar(seco=seco)

    if not r.get("hecho"):
        print(r.get("motivo", "sin cambios"))
        return 0

    if seco:
        print(f"[SECO] Antes: {r['antes']} → Después: {r['despues']} (eliminados: {r['eliminados']})")
        for a in r["acciones"]:
            print(a)
        return 0

    print(f"Limpieza completada: {r['antes']} → {r['despues']} medios (eliminados: {r['eliminados']})")
    print(f"Backup: {r['backup']}")
    for a in r["acciones"]:
        print(a)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))