#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""scripts/puente/comprobar_medidor.py · Comprueba de verdad medidores del Mando.

Comprobación honesta de medidores (listas, bloqueadas, agentes, disco,
memoria, proveedores, sin-publicar) produciendo veredictos y JSON de estado.
"""

from __future__ import annotations

import json
import os
import re
import shlex
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

# Directorio de comprobaciones del Mando
DIR_COMPROBACIONES = Path("starseed_memory_root/mando/comprobaciones")


def _es_proceso_propiatarea(cmd: str) -> bool:
    """Filtra comprobadores y editores para evitar falsos positivos en ps."""
    bajas = cmd.lower()
    for ign in ("comprobar_medidor", "grep", "vim ", "nano ", "emacs ", "test_comprobar"):
        if ign in bajas:
            return True
    return False


def _es_orquestador(p: dict[str, Any]) -> bool:
    cmd = p.get("cmd", "")
    return not _es_proceso_propiatarea(cmd) and "starseed-enjambre.py" in cmd


def _es_vigilante(p: dict[str, Any]) -> bool:
    cmd = p.get("cmd", "")
    if _es_proceso_propiatarea(cmd):
        return False
    return "vigilante-enjambre.py" in cmd or "com.starseed.vigilante" in cmd


def _es_opencode(p: dict[str, Any]) -> bool:
    cmd = p.get("cmd", "")
    if _es_proceso_propiatarea(cmd):
        return False
    args = p.get("args", [])
    if not args:
        return False
    exe = Path(args[0]).name
    return exe == "opencode" or "opencode run" in cmd or "opencode start" in cmd


def _es_codex(p: dict[str, Any]) -> bool:
    cmd = p.get("cmd", "")
    if _es_proceso_propiatarea(cmd):
        return False
    args = p.get("args", [])
    if not args:
        return False
    exe = Path(args[0]).name
    return exe in ("codex", "codex-cli") or "codex run" in cmd


def recoger_procesos() -> list[dict[str, Any]]:
    """Obtiene la lista de procesos activos sin falsos positivos de editores/grep."""
    procesos: list[dict[str, Any]] = []
    try:
        res = subprocess.run(["ps", "-axo", "pid=,args="], capture_output=True, text=True, timeout=5)
        if res.returncode == 0:
            for linea in res.stdout.splitlines():
                partes = linea.strip().split(maxsplit=1)
                if len(partes) == 2 and partes[0].isdigit():
                    pid = int(partes[0])
                    cmd = partes[1]
                    try:
                        args = shlex.split(cmd)
                    except Exception:
                        args = cmd.split()
                    procesos.append({"pid": pid, "cmd": cmd, "args": args})
    except Exception:
        pass
    return procesos


def recoger_memoria() -> dict[str, float | None]:
    """Obtiene memoria y swap libres reales desde /proc/meminfo o vm_stat sin datos fabricados."""
    mem_free_mb: float | None = None
    swap_free_mb: float | None = None
    proc_info = Path("/proc/meminfo")
    if proc_info.exists():
        try:
            texto = proc_info.read_text(encoding="utf-8")
            avail = re.search(r"^MemAvailable:\s+(\d+)\s+kB", texto, re.MULTILINE)
            if avail:
                mem_free_mb = round(int(avail.group(1)) / 1024.0, 2)
            swap = re.search(r"^SwapFree:\s+(\d+)\s+kB", texto, re.MULTILINE)
            if swap:
                swap_free_mb = round(int(swap.group(1)) / 1024.0, 2)
        except Exception:
            pass

    if mem_free_mb is None:
        try:
            res = subprocess.run(["vm_stat"], capture_output=True, text=True, timeout=5)
            if res.returncode == 0:
                p_free = re.search(r"Pages free:\s+(\d+)", res.stdout)
                p_size = re.search(r"page size of (\d+) bytes", res.stdout)
                sz = int(p_size.group(1)) if p_size else 4096
                if p_free:
                    mem_free_mb = round(int(p_free.group(1)) * sz / (1024.0 * 1024.0), 2)
        except Exception:
            pass

    if swap_free_mb is None:
        try:
            res = subprocess.run(["sysctl", "vm.swapusage"], capture_output=True, text=True, timeout=5)
            if res.returncode == 0:
                s_free = re.search(r"free\s*=\s*([\d.]+)([KMGT])", res.stdout, re.IGNORECASE)
                if s_free:
                    cant = float(s_free.group(1))
                    unid = s_free.group(2).upper()
                    f = {"K": 1/1024, "M": 1, "G": 1024, "T": 1024*1024}[unid]
                    swap_free_mb = round(cant * f, 2)
        except Exception:
            pass

    return {"memoria_libre_mb": mem_free_mb, "swap_libre_mb": swap_free_mb}


def recoger_disco() -> dict[str, float | None]:
    """Obtiene el espacio libre real en disco en GB."""
    try:
        u = shutil.disk_usage(".")
        return {"disco_libre_gb": round(u.free / (1024.0 ** 3), 2)}
    except Exception:
        return {"disco_libre_gb": None}


def recoger_proveedores() -> dict[str, Any]:
    """Lee datos reales del informe de pasarelas o proveedores sin constantes."""
    rep_path = Path.home() / ".starseed" / "pasarelas-informe.json"
    salud_path = Path.home() / ".starseed" / "salud-proveedores.json"
    activos: int | None = None
    pasarelas_ok: bool | None = None

    if rep_path.exists():
        try:
            data = json.loads(rep_path.read_text(encoding="utf-8"))
            if isinstance(data, dict):
                if isinstance(data.get("proveedores_activos"), int):
                    activos = data["proveedores_activos"]
                if isinstance(data.get("pasarelas_ok"), bool):
                    pasarelas_ok = data["pasarelas_ok"]
        except Exception:
            pass

    if activos is None or pasarelas_ok is None:
        if salud_path.exists():
            try:
                data = json.loads(salud_path.read_text(encoding="utf-8"))
                if isinstance(data, dict):
                    vivos = 0
                    for info in data.values():
                        if isinstance(info, dict):
                            st = str(info.get("estado", "")).lower()
                            if st in ("vivo", "ok", "activo", "usable") or info.get("ok") is True:
                                vivos += 1
                    if activos is None:
                        activos = vivos
                    if pasarelas_ok is None:
                        pasarelas_ok = vivos > 0
            except Exception:
                pass

    return {"proveedores_activos": activos, "pasarelas_ok": pasarelas_ok}


def recoger_sin_publicar() -> dict[str, Any]:
    """Obtiene el recuento real de commits sin publicar frente a origin/main."""
    try:
        res = subprocess.run(["git", "log", "--oneline", "origin/main..HEAD"], capture_output=True, text=True, timeout=10)
        if res.returncode == 0:
            lineas = [l for l in res.stdout.strip().splitlines() if l.strip()]
            return {"sin_publicar": len(lineas)}
    except Exception:
        pass
    return {"sin_publicar": None}


def veredictos_de(
    medidor: str, procesos: list[dict[str, Any]], hechos: dict[str, Any]
) -> tuple[list[dict[str, str]], str]:
    """Función pura que evalúa hechos y procesos recopilados."""
    med = medidor.replace("_", "-")
    veredictos: list[dict[str, str]] = []

    if med in ("listas", "bloqueadas"):
        hay_orq = any(_es_orquestador(p) for p in procesos) or bool(hechos.get("orquestador_vivo"))
        hay_vig = any(_es_vigilante(p) for p in procesos) or bool(hechos.get("vigilante_vivo"))
        veredictos.append({
            "proceso": "orquestador",
            "estado": "vivo" if hay_orq else "muerto",
            "detalle": "Orquestador starseed-enjambre.py en ejecución" if hay_orq else "Orquestador no encontrado",
        })
        veredictos.append({
            "proceso": "vigilante",
            "estado": "vivo" if hay_vig else "muerto",
            "detalle": "Vigilante vigilante-enjambre.py activo" if hay_vig else "Vigilante no encontrado",
        })

    elif med == "agentes":
        hay_open = any(_es_opencode(p) for p in procesos) or bool(hechos.get("opencode_vivo"))
        hay_codex = any(_es_codex(p) for p in procesos) or bool(hechos.get("codex_vivo"))
        veredictos.append({
            "proceso": "opencode",
            "estado": "vivo" if hay_open else "muerto",
            "detalle": "Proceso opencode activo" if hay_open else "Proceso opencode no encontrado",
        })
        veredictos.append({
            "proceso": "codex",
            "estado": "vivo" if hay_codex else "muerto",
            "detalle": "Proceso codex activo" if hay_codex else "Proceso codex no encontrado",
        })

    elif med == "disco":
        gb = hechos.get("disco_libre_gb")
        if gb is None:
            st, det = "desconocido", "No se pudo medir el espacio en disco"
        elif gb > 1.0:
            st, det = "vivo", f"{gb} GB libres en disco"
        else:
            st, det = "muerto", f"{gb} GB libres (espacio insuficiente)"
        veredictos.append({"proceso": "disco-libre", "estado": st, "detalle": det})

    elif med == "memoria":
        mem = hechos.get("memoria_libre_mb")
        swap = hechos.get("swap_libre_mb")
        if mem is None:
            st_m, det_m = "desconocido", "No se pudo medir la memoria libre"
        elif mem >= 150.0:
            st_m, det_m = "vivo", f"{mem} MB libres"
        else:
            st_m, det_m = "muerto", f"{mem} MB libres (memoria crítica)"

        if swap is None:
            st_s, det_s = "desconocido", "No se pudo medir la swap libre"
        elif swap >= 0.0:
            st_s, det_s = "vivo", f"{swap} MB libres"
        else:
            st_s, det_s = "muerto", f"{swap} MB libres"
        veredictos.append({"proceso": "memoria-libre", "estado": st_m, "detalle": det_m})
        veredictos.append({"proceso": "swap-libre", "estado": st_s, "detalle": det_s})

    elif med == "proveedores":
        act = hechos.get("proveedores_activos")
        pas = hechos.get("pasarelas_ok")
        if act is None:
            st_a, det_a = "desconocido", "Sin datos de proveedores"
        elif act > 0:
            st_a, det_a = "vivo", f"{act} proveedores activos"
        else:
            st_a, det_a = "muerto", "0 proveedores activos"

        if pas is None:
            st_p, det_p = "desconocido", "Sin datos de pasarelas"
        elif pas is True:
            st_p, det_p = "vivo", "Pasarelas respondiendo correctamente"
        else:
            st_p, det_p = "muerto", "Pasarelas no disponibles"
        veredictos.append({"proceso": "proveedores-activos", "estado": st_a, "detalle": det_a})
        veredictos.append({"proceso": "pasarelas-ok", "estado": st_p, "detalle": det_p})

    elif med == "sin-publicar":
        sp = hechos.get("sin_publicar")
        if sp is None:
            st, det = "desconocido", "No se pudo verificar el estado de git"
        elif sp == 0:
            st, det = "vivo", "0 commits pendientes por publicar"
        else:
            st, det = "muerto", f"{sp} commits sin publicar"
        veredictos.append({"proceso": "sin-publicar", "estado": st, "detalle": det})

    vivos = sum(1 for v in veredictos if v["estado"] == "vivo")
    muertos = sum(1 for v in veredictos if v["estado"] == "muerto")
    colgados = sum(1 for v in veredictos if v["estado"] == "colgado")
    desconocidos = sum(1 for v in veredictos if v["estado"] == "desconocido")
    total = len(veredictos)

    if total == 0:
        resumen = f"Comprobación de «{medidor}» terminada sin procesos"
    elif vivos == total:
        resumen = f"Comprobación de «{medidor}» terminada: todos vivos"
    elif muertos == total:
        resumen = f"Comprobación de «{medidor}» terminada: todo muerto ({total})"
    elif desconocidos == total:
        resumen = f"Comprobación de «{medidor}» terminada: estado desconocido ({total})"
    elif colgados > 0:
        resumen = f"Comprobación de «{medidor}» terminada: {colgados} colgado(s), {vivos} vivo(s)"
    else:
        resumen = f"Comprobación de «{medidor}» terminada: {vivos}/{total} vivos, {muertos} muerto(s)"

    return veredictos, resumen


def crear_comprobacion(
    medidor: str, procesos: list[dict[str, Any]], hechos: dict[str, Any]
) -> dict[str, Any]:
    """Genera la estructura de Comprobación según comprobacion-tipos.ts."""
    empezado = datetime.now(timezone.utc).isoformat()
    veredictos, resumen = veredictos_de(medidor, procesos, hechos)
    terminado = datetime.now(timezone.utc).isoformat()
    directores = [v["proceso"] for v in veredictos]
    ts_ms = int(datetime.now(timezone.utc).timestamp() * 1000)

    return {
        "id": f"comp-{medidor}-{ts_ms}",
        "medidor": medidor,
        "empezado": empezado,
        "terminado": terminado,
        "directores": directores,
        "veredictos": veredictos,
        "resumen": resumen,
    }


def recoger_hechos(medidor: str) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Recolecta procesos y hechos del sistema según el medidor solicitado."""
    med = medidor.replace("_", "-")
    procesos = recoger_procesos()
    hechos: dict[str, Any] = {}
    if med == "memoria":
        hechos.update(recoger_memoria())
    elif med == "disco":
        hechos.update(recoger_disco())
    elif med == "proveedores":
        hechos.update(recoger_proveedores())
    elif med == "sin-publicar":
        hechos.update(recoger_sin_publicar())
    return procesos, hechos


def main() -> int:
    """Función principal CLI: recolecta hechos y escribe el JSON de estado."""
    medidor = sys.argv[1].replace("_", "-") if len(sys.argv) > 1 else "disco"
    empezado = datetime.now(timezone.utc).isoformat()
    try:
        procesos, hechos = recoger_hechos(medidor)
    except Exception:
        procesos, hechos = [], {}

    comprobacion = crear_comprobacion(medidor, procesos, hechos)
    comprobacion["empezado"] = empezado
    comprobacion["terminado"] = datetime.now(timezone.utc).isoformat()

    DIR_COMPROBACIONES.mkdir(parents=True, exist_ok=True)
    contenido = json.dumps(comprobacion, ensure_ascii=False, indent=2) + "\n"

    (DIR_COMPROBACIONES / f"{medidor}.json").write_text(contenido, encoding="utf-8")
    (DIR_COMPROBACIONES / f"comprobacion-{medidor}.json").write_text(contenido, encoding="utf-8")

    print(contenido.strip())
    return 0


if __name__ == "__main__":
    sys.exit(main())
