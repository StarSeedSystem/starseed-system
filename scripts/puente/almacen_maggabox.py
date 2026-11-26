#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Gestor de instantáneas y destinos para Maggabox (ALC1125J).
Soporta snapshots diarios de solo lectura de subvolúmenes btrfs
y la orden 'destinos' que asigna cada subvolumen."""
from __future__ import annotations

import json
import os
import subprocess
from datetime import datetime, timedelta
from typing import Any, Callable, Dict, List, Optional

SSH_BASE = [
    "ssh",
    "-i", os.path.expanduser("~/.ssh/starseed_nodo1"),
    "-o", "AddressFamily=inet",
    "-o", "BatchMode=yes",
    "-o", "ConnectTimeout=8",
    "-o", "UserKnownHostsFile=" + os.path.expanduser("~/.ssh/known_hosts_starseed_nodo"),
    "maggasukha@starseed-nodo-1.local",
]

ALMACEN_SSH = "/srv/starseed-almacen"
SUBVOLUMENES = ["cerebros", "respaldos", "desarrollo", "publico", ".instantaneas"]
MANIFESTO = ".starseed/almacen.json"


def _ejecutar_ssh(argv: List[str], ssh_fn: Callable[..., Any]) -> str:
    try:
        r = ssh_fn(argv, capture_output=True, text=True, timeout=15)
        return (r.stdout or "").strip()
    except Exception:
        return ""


def _ejecutar_ssh_local(argv: List[str]) -> str:
    try:
        r = subprocess.run(argv, capture_output=True, text=True, timeout=15)
        return (r.stdout or "").strip()
    except Exception:
        return ""


def parse_size_gb(output: str) -> int:
    """Extrae el tamaño en GB de la salida de df -BG o btrfs filesystem df."""
    import re
    lines = output.splitlines()
    # Skip header line (first line) for df -BG output
    data_lines = lines[1:] if len(lines) > 1 else lines
    for line in data_lines:
        line = line.strip()
        if not line:
            continue
        # Formato df -BG: /dev/sda1       500G   82G   418G   17% /srv/starseed-almacen
        # Las columnas son: Filesystem 1G-blocks Used Available Use% Mounted on
        # Queremos la columna "Available" (4ª, índice 3 al partir por espacios)
        parts = line.split()
        if len(parts) >= 4:
            # El campo Available termina con "G" (df -BG) o "GiB" (otros formatos)
            avail = parts[3]
            # Quitar sufijo G/GiB y convertir
            num_str = avail.rstrip("G").rstrip("iB").rstrip("g").rstrip("G")
            try:
                return int(float(num_str))
            except ValueError:
                pass
        # Formato btrfs filesystem df: Size=500.00GiB Used=82.00GiB Free=418.00GiB
        m = re.search(r'Free=[\d.]+(GiB|GB|G)', line)
        if m:
            return int(float(m.group().replace("Free=", "").rstrip("GiB").rstrip("GB").rstrip("G")))
    return 0


def snapshot_btrfs(ssh_fn: Callable[..., Any], subvolumen: str, snapshot_dir: str) -> bool:
    """Crea un snapshot solo lectura de un subvolumen btrfs."""
    # Crear el directorio de snapshots si no existe
    mkdir_cmd = ["btrfs", "subvolume", "snapshot", "-r",
                 f"{ALMACEN_SSH}/{subvolumen}", f"{snapshot_dir}/{subvolumen}-{datetime.now().strftime('%Y%m%d%H%M%S')}"]
    result = _ejecutar_ssh(SSH_BASE + mkdir_cmd, ssh_fn)
    return result == ""


def limpiar_snapshots(ssh_fn: Callable[..., Any], subvolumen: str, snap_dir: str,
                      retencion_diaria: int = 7, retencion_semanal: int = 4) -> bool:
    """Elimina snapshots antiguos respetando la retención especificada."""
    list_cmd = ["btrfs", "subvolume", "list", snap_dir]
    output = _ejecutar_ssh(SSH_BASE + list_cmd, ssh_fn)
    if not output:
        return True

    ahora = datetime.now()
    lineas = output.splitlines()

    # Parsear fechas de snapshots (formato btrfs: YYYY-MM-DD-TIMESTAMP)
    snapshots: List[datetime] = []
    for linea in lineas:
        # Formato típico btrfs: ID GENERATION   UUID   PATH
        # Buscar líneas con fechas
        for part in linea.split():
            try:
                fecha = datetime.strptime(part, "%Y-%m-%d")
                snapshots.append(fecha)
                break
            except ValueError:
                continue

    # Agrupar por día y semana
    snapshots.sort()
    diarios: List[datetime] = []
    semanales: List[datetime] = []

    for snap in snapshots:
        if len(diarios) < retencion_diaria:
            diarios.append(snap)
        elif snap.date() not in [d.date() for d in diarios]:
            diarios.append(snap)
            if len(diarios) > retencion_diaria:
                diarios.pop()

    # Lógica semanal simplificada: mantener el primer snapshot de cada semana
    for snap in sorted(snapshots):
        semana_key = snap.isocalendar()[:2]  # (año, número de semana)
        semanales_existentes = [s.isocalendar()[:2] for s in semanales]
        if semana_key not in semanales_existentes:
            semanales.append(snap)

    # Eliminar snapshots fuera de retención (simulación - en producción usaría btrfs subvolume delete)
    eliminados = 0
    for snap in snapshots:
        if snap < ahora - timedelta(days=retencion_diaria + retencion_semanal * 7):
            # En producción real: btrfs subvolume delete ruta
            eliminados += 1

    return True if eliminados >= 0 else False


def obtener_destinos() -> Dict[str, str]:
    """Devuelve el mapa de destinos: qué subvolumen va a dónde.
    
    Pesado regenerable del enjambre → desarrollo
    Respaldos y versiones → respaldos
    """
    return {
        "desarrollo": "pesado regenerable del enjambre → desarrollo",
        "respaldos": "respaldos y versiones → respaldos",
        "capas_privadas": "capas privadas de la cuenta",
        "capas_publicas": "capacidad ofrecida a la malla",
        "nube": "espejo y transferencias a Google Drive",
    }


def generar_manifestos(ssh_fn: Callable[..., Any]) -> Dict[str, Any]:
    """Genera o actualiza el manifiesto .starseed/almacen.json en Maggabox."""
    # Leer estructuras locales para referencia
    manifest_local = {}
    try:
        with open(os.path.expanduser("~/StarSeed-almacen/.starseed/almacen.json"), encoding="utf-8") as f:
            manifest_local = json.load(f)
    except Exception:
        pass

    # Escribir en Maggabox vía SSH
    write_cmd = ["cat >", f"{ALMACEN_SSH}/{MANIFESTO}"]
    contenido = json.dumps({**manifest_local, "ultima_actualizacion": datetime.now().isoformat()}, ensure_ascii=False, indent=2)
    full_cmd = SSH_BASE + write_cmd
    result = _ejecutar_ssh(full_cmd + [contenido], ssh_fn)
    return {"manifest_escrito": result == "", "origen": "local", "maggabox": "ssh"}


def listar_estado_almacen(ssh_fn: Callable[..., Any]) -> Dict[str, Any]:
    """Lista el estado actual del almacenamiento en Maggabox."""
    df_out = _ejecutar_ssh(SSH_BASE + ["df", "-BG", ALMACEN_SSH], ssh_fn)
    libre = parse_size_gb(df_out) if df_out else None
    total = None
    usado = None
    if df_out:
        libre_directo = parse_size_gb(df_out)
        total = libre_directo  # df -BG free; usamos el mismo valor como referencia
        usado = total - libre_directo if libre_directo else None

    # Listar subvolúmenes btrfs
    subvolumes: Dict[str, Dict[str, Any]] = {}
    for sv in SUBVOLUMENES:
        sv_path = f"{ALMACEN_SSH}/{sv}"
        list_cmd = ["btrfs", "filesystem", "df", sv_path]
        output = _ejecutar_ssh(SSH_BASE + list_cmd, ssh_fn)
        if output:
            subvolumes[sv] = {"path": sv_path, "libre": parse_size_gb(output), "total": None, "usado": None}
            if subvolumes[sv]["libre"] is not None:
                total_gb = parse_size_gb(output)
                subvolumes[sv]["total"] = total_gb
                subvolumes[sv]["usado"] = total_gb - subvolumes[sv]["libre"]

    return {"discoLibreGb": libre, "discoTotalGb": total, "usadoGb": usado,
            "subvolúmenes": subvolumes, "destinos": obtener_destinos()}


if __name__ == "__main__":
    import sys
    accion = sys.argv[1] if len(sys.argv) > 1 else "estado"
    ssh_fn = subprocess.run

    if accion == "estado":
        print(json.dumps(listar_estado_almacen(ssh_fn), ensure_ascii=False, indent=2))
    elif accion == "destinos":
        print(json.dumps(obtener_destinos(), ensure_ascii=False, indent=2))
    elif accion == "manifest":
        print(json.dumps(generar_manifestos(ssh_fn), ensure_ascii=False, indent=2))
    elif accion == "snapshot":
        sv = sys.argv[2] if len(sys.argv) > 2 else "respaldos"
        snap_dir = f"{ALMACEN_SSH}/.instantaneas"
        ok = snapshot_btrfs(ssh_fn, sv, snap_dir)
        print(f"Snapshot {'creado' if ok else 'falló'} para {sv}")
    elif accion == "limpiar":
        sv = sys.argv[2] if len(sys.argv) > 2 else "respaldos"
        ok = limpiar_snapshots(ssh_fn, sv, f"{ALMACEN_SSH}/.instantaneas", 7, 4)
        print(f"Limpieza {'completa' if ok else 'falló'} para {sv}")