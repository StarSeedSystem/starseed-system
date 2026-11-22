#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Guardia de recursos del Mac para StarSeed OS.

Mide memoria libre, intercambio y disco y ajusta el número de agentes locales.
Los agentes en la nube se gestionan por separado. Los agentes locales pesados
como BitNet y la voz se pausan cuando los recursos son críticos.

Umbrales por defecto:
- Intercambio > 10 GB → reducir a 2 agentes locales pesados
- Disco < 10 GB → reducir a 2 agentes locales pesados  
- Memoria libre < 100 MB → urgencia máxima, pero nunca menos de 2 agentes

Los avisos van al canal General cuando cambian, nunca mata nada.
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import time
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Optional


@dataclass
class EstadoRecursos:
    """Estado actual de los recursos del sistema."""
    memoria_libre_mb: float
    intercambio_mb: float
    disco_libre_gb: float
    cpu_percent: float


@dataclass
class Umbrales:
    """Umbrales para decidir ajustes de agentes."""
    intercambio_max_gb: float = 10.0
    disco_min_gb: float = 10.0
    memoria_libre_mb_min: float = 100.0
    agentes_max: int = 3
    agentes_min: int = 2


@dataclass
class AjusteAgentes:
    """Resultado de un ajuste de agentes."""
    tipo: str  # "mantener", "reducir", "aumentar"
    agentes: int
    razon: str
    umbrales_violados: list[str] = field(default_factory=list)


@dataclass
class JavaProcess:
    """Proceso Java detectado en un worktree."""
    pid: int
    memoria_mb: float
    ruta: str
    comando: str


def _convertir_bytes_a_mb(bytes_val: int) -> float:
    """Convierte bytes a megabytes."""
    return bytes_val / (1024 * 1024)


def _convertir_bytes_a_gb(bytes_val: int) -> float:
    """Convierte bytes a gigabytes."""
    return bytes_val / (1024 * 1024 * 1024)


class LeerRecursos:
    """Funciones puras para leer recursos del sistema."""

    @staticmethod
    def memoria_libre_mb() -> float:
        """Devuelve memoria RAM libre en MB."""
        try:
            with open("/proc/meminfo", "r") as f:
                lines = f.readlines()
            meminfo = {}
            for line in lines:
                parts = line.split()
                if len(parts) >= 2:
                    key = parts[0].rstrip(":")
                    value = int(parts[1])
                    meminfo[key] = value

            mem_free = meminfo.get("MemAvailable", meminfo.get("MemFree", 0))
            buffers = meminfo.get("Buffers", 0)
            cached = meminfo.get("Cached", 0)
            total_libre = mem_free + buffers + cached
            return _convertir_bytes_a_mb(total_libre)
        except (FileNotFoundError, ValueError, KeyError):
            result = subprocess.run(
                ["vm_stat"],
                capture_output=True,
                text=True,
            )
            if result.returncode == 0:
                lines = result.stdout.splitlines()
                free_mb = 0.0
                for line in lines:
                    if "free:" in line or "Pages free:" in line:
                        parts = line.split(":")
                        if len(parts) >= 2:
                            pages = int(parts[-1].strip().rstrip("."))
                            free_mb = _convertir_bytes_a_mb(pages * 4096)
                    elif "inactive:" in line or "Pages inactive:" in line:
                        parts = line.split(":")
                        if len(parts) >= 2:
                            pages = int(parts[-1].strip().rstrip("."))
                            free_mb += _convertir_bytes_a_mb(pages * 4096)
                return free_mb
            return 0.0

    @staticmethod
    def intercambio_mb() -> float:
        """Devuelve memoria de intercambio usada en MB."""
        try:
            result = subprocess.run(
                ["sysctl", "-n", "vm.swapusage"],
                capture_output=True,
                text=True,
            )
            if result.returncode == 0:
                output = result.stdout
                if "used" in output:
                    parts = output.split("used=")
                    if len(parts) >= 2:
                        value_part = parts[1].split()[0]
                        if "M" in value_part:
                            return float(value_part.rstrip("M"))
                        elif "G" in value_part:
                            return float(value_part.rstrip("G")) * 1024
            return 0.0
        except Exception:
            return 0.0

    @staticmethod
    def disco_libre_gb() -> float:
        """Devuelve espacio disco libre en GB para la raíz."""
        total, used, free = shutil.disk_usage("/")
        return _convertir_bytes_a_gb(free)

    @staticmethod
    def cpu_percent() -> float:
        """Devuelve porcentaje de uso de CPU."""
        try:
            with open("/proc/stat", "r") as f:
                line = f.readline()
            parts = line.split()[1:8]
            times = [int(x) for x in parts]
            idle = times[3]
            total = sum(times)
            return 0.0
        except (FileNotFoundError, ValueError):
            result = subprocess.run(
                ["top", "-l", "1", "-n", "0"],
                capture_output=True,
                text=True,
            )
            if result.returncode == 0:
                for line in result.stdout.splitlines():
                    if "CPU usage:" in line or "CPU:" in line:
                        parts = line.split()
                        for i, p in enumerate(parts):
                            if p.endswith("%") and "user" in line.lower():
                                return float(p.rstrip("%"))
            return 0.0


class CalcularAjuste:
    """Lógica pura para calcular ajuste de agentes."""

    @staticmethod
    def estado_actual() -> EstadoRecursos:
        """Obtiene el estado actual de los recursos."""
        return EstadoRecursos(
            memoria_libre_mb=LeerRecursos.memoria_libre_mb(),
            intercambio_mb=LeerRecursos.intercambio_mb(),
            disco_libre_gb=LeerRecursos.disco_libre_gb(),
            cpu_percent=LeerRecursos.cpu_percent(),
        )

    @staticmethod
    def ajuste(estado: EstadoRecursos, umbrales: Umbrales) -> AjusteAgentes:
        """Calcula el ajuste necesario según estado y umbrales."""
        umbrales_violados = []
        razon = ""

        intercambio_gb = estado.intercambio_mb / 1024
        disco_gb = estado.disco_libre_gb
        memoria_mb = estado.memoria_libre_mb

        if intercambio_gb > umbrales.intercambio_max_gb:
            umbrales_violados.append("intercambio")
            razon = f"intercambio {intercambio_gb:.1f} GB > {umbrales.intercambio_max_gb} GB"
        if disco_gb < umbrales.disco_min_gb:
            umbrales_violados.append("disco")
            if razon:
                razon += f", disco {disco_gb:.1f} GB < {umbrales.disco_min_gb} GB"
            else:
                razon = f"disco {disco_gb:.1f} GB < {umbrales.disco_min_gb} GB"
        if memoria_mb < umbrales.memoria_libre_mb_min:
            umbrales_violados.append("memoria")
            if razon:
                razon += f", memoria libre {memoria_mb:.0f} MB < {umbrales.memoria_libre_mb_min} MB"
            else:
                razon = f"memoria libre {memoria_mb:.0f} MB < {umbrales.memoria_libre_mb_min} MB"

        if umbrales_violados:
            nuevos_agentes = max(umbrales.agentes_min, umbrales.agentes_max - 1)
            return AjusteAgentes(
                tipo="reducir",
                agentes=nuevos_agentes,
                razon=razon,
                umbrales_violados=umbrales_violados,
            )

        return AjusteAgentes(
            tipo="mantener",
            agentes=umbrales.agentes_max,
            razon="recursos en nivel normal",
        )


class DetectarJavaWorktree:
    """Detecta procesos Java en worktrees del enjambre."""

    @staticmethod
    def cuales() -> list[JavaProcess]:
        """Devuelve lista de procesos Java en worktrees."""
        resultados = []
        try:
            result = subprocess.run(
                ["ps", "aux"],
                capture_output=True,
                text=True,
            )
            if result.returncode == 0:
                for line in result.stdout.splitlines():
                    if "java" in line.lower() and "antigravity" not in line:
                        parts = line.split(None, 10)
                        if len(parts) >= 11:
                            pid = int(parts[1])
                            mem_rss = int(parts[5])
                            comando = parts[10]

                            if any(p in comand for p in ["--add-dir", "worktree", "starseed"]):
                                mem_mb = _convertir_bytes_a_mb(mem_rss * 1024)
                                resultados.append(JavaProcess(
                                    pid=pid,
                                    memoria_mb=mem_mb,
                                    ruta=comando,
                                    comando=line,
                                ))
        except Exception:
            pass
        return resultados


RUTA_CONTADOR = Path.home() / ".starseed" / "guardia-agentes.json"


def leer_contador_agentes() -> int:
    """Lee el contador de agentes locales desde disco."""
    try:
        with open(RUTA_CONTADOR, "r") as f:
            data = json.load(f)
            return data.get("agentes_locales", 3)
    except (FileNotFoundError, json.JSONDecodeError, KeyError):
        return 3


def guardar_contador_agentes(agentes: int) -> None:
    """Guarda el contador de agentes locales en disco."""
    RUTA_CONTADOR.parent.mkdir(parents=True, exist_ok=True)
    data = {
        "agentes_locales": agentes,
        "actualizado": datetime.now().isoformat(),
    }
    tmp = RUTA_CONTADOR.with_suffix(".tmp")
    with open(tmp, "w") as f:
        json.dump(data, f, indent=2)
    tmp.replace(RUTA_CONTADOR)


def obtener_estado_actual() -> EstadoRecursos:
    """Obtiene estado actual (wrapper para testing)."""
    return CalcularAjuste.estado_actual()


def ajustar_agentes(
    umbrales: Optional[Umbrales] = None,
    contar: bool = True,
) -> AjusteAgentes:
    """Ajusta el número de agentes locales según recursos.

    Este es el punto de entrada principal. Lee los umbrales por defecto,
    calcula el ajuste necesario y actualiza el contador si corresponde.
    """
    umbrales = umbrales or Umbrales()
    estado = obtener_estado_actual()
    ajuste = CalcularAjuste.ajuste(estado, umbrales)

    if ajuste.tipo != "mantener" and contar:
        actual = leer_contador_agentes()
        if ajuste.agentes != actual:
            guardar_contador_agentes(ajuste.agentes)

    return ajuste


def main() -> int:
    """CLI principal del guardia de recursos."""
    import sys

    if len(sys.argv) < 2:
        print("Uso: guardia_recursos.py <estado|ajustar|java>")
        return 1

    cmd = sys.argv[1]

    if cmd == "estado":
        estado = obtener_estado_actual()
        print(json.dumps({
            "memoria_libre_mb": round(estado.memoria_libre_mb, 1),
            "intercambio_mb": round(estado.intercambio_mb, 1),
            "disco_libre_gb": round(estado.disco_libre_gb, 1),
            "cpu_percent": round(estado.cpu_percent, 1),
        }, indent=2))
        return 0

    elif cmd == "ajustar":
        ajuste = ajustar_agentes()
        print(json.dumps({
            "tipo": ajuste.tipo,
            "agentes": ajuste.agentes,
            "razon": ajuste.razon,
            "umbrales_violados": ajuste.umbrales_violados,
        }, indent=2, ensure_ascii=False))
        return 0

    elif cmd == "java":
        jvas = DetectarJavaWorktree.cuales()
        print(json.dumps([
            {
                "pid": j.pid,
                "memoria_mb": round(j.memoria_mb, 1),
                "ruta": j.ruta,
            }
            for j in jvas
        ], indent=2, ensure_ascii=False))
        return 0

    else:
        print(f"Comando desconocido: {cmd}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    exit(main())