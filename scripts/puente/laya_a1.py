#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Laya en el A1 de Oracle — unidad systemd y órdenes de instalación (LYS1018Gb)."""
from __future__ import annotations

import os
import re
import shlex
import sys
from pathlib import Path

RUTA_A1 = "/home/starseed/laya/servidor-laya.mjs"
RAM_MINIMA_KB = 4 * 1024 * 1024  # 4 GB
FUENTE_LOCAL = "native/laya/servidor-laya.mjs"
_IMPORT_RELATIVO = re.compile(r"""(?:from|import)\s*\(?\s*["'](\.{1,2}/[^"']+)["']""")

try:
    import oracle_nodo as ON  # noqa: E402 — puro, sin efectos colaterales en import
except Exception:  # noqa: BLE001 — puede que no haya contexto de A1
    ON = None  # type: ignore


def unidad_systemd(usuario: str = "starseed", ruta_servicio: str = RUTA_A1) -> str:
    """Devuelve el texto de la unidad systemd para el servidor Laya en 127.0.0.1 con MemoryMax=5G.

    (DIR1127E, medido en el A1 el 27-11) Con 3G el proceso se quedaba en el tope del cgroup al 90 % de CPU y dejaba
    de aceptar conexiones; con 5G usa ~1,9 GB y decide en ~0,7 s. El servidor lee STARSEED_LAYA_PUERTO (no PORT) y
    node vive en /usr/local/bin en el A1."""
    return f"""[Unit]
Description=StarSeed · Servidor Laya Local SystemOne
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User={usuario}
WorkingDirectory={os.path.dirname(ruta_servicio)}
Environment=STARSEED_LAYA_PUERTO=4470
Environment=LAYA_CACHE=/home/{usuario}/.starseed/laya-cache
ExecStart=/usr/local/bin/node {ruta_servicio}
Restart=on-failure
RestartSec=10
MemoryMax=5G
StandardOutput=append:/var/log/starseed/laya.log
StandardError=append:/var/log/starseed/laya.log

[Install]
WantedBy=multi-user.target
"""

def ordenes_instalacion(usuario: str = "starseed") -> list[str]:
    """Lista de órdenes para instalar y activar el servicio en el A1."""
    return [
        f"loginctl enable-linger {usuario}",
        "systemctl daemon-reload",
        "systemctl enable --now starseed-laya",
    ]


def precheck_ram(meminfo_texto: str) -> bool:
    """PURA. True solo si MemAvailable (de /proc/meminfo) es ≥ 4 GB."""
    m = re.search(r"^MemAvailable:\s*(\d+)\s*kB", meminfo_texto or "", re.M)
    return bool(m) and int(m.group(1)) >= RAM_MINIMA_KB


def archivos_necesarios(raiz: str = ".") -> list[str]:
    """Rutas relativas a `raiz` del servidor y de sus import relativos (recursivo)."""
    base, vistos, pila = Path(raiz), [], [FUENTE_LOCAL]
    while pila:
        rel = os.path.normpath(pila.pop(0))
        if rel in vistos or not (base / rel).is_file():
            continue
        vistos.append(rel)
        texto = (base / rel).read_text(encoding="utf-8", errors="replace")
        pila += [os.path.join(os.path.dirname(rel), i) for i in _IMPORT_RELATIVO.findall(texto)]
    return vistos


def ordenes_copia(raiz: str = ".", destino: str = os.path.dirname(RUTA_A1)) -> list[tuple[list[str], str | None]]:
    """Pares (argv remoto, archivo local que va por stdin o None). Sin shell ni IP."""
    ordenes: list[tuple[list[str], str | None]] = [(["mkdir", "-p", destino], None)]
    for rel in archivos_necesarios(raiz):
        nombre = os.path.relpath(rel, os.path.dirname(FUENTE_LOCAL))
        ordenes.append((["tee", os.path.join(destino, nombre)], os.path.join(raiz, rel)))
    return ordenes


def verificar(ssh) -> dict:
    """Comprueba ruta, unidad y GET :4470/ sin activar nada. `ssh(orden) -> (rc, salida)`."""
    ruta = ssh(f"test -f {shlex.quote(RUTA_A1)}")[0] == 0
    activa = ssh("systemctl is-active starseed-laya")[1].strip() == "active"
    rc, http = ssh("curl -s -o /dev/null -w %{http_code} --max-time 5 http://127.0.0.1:4470/")
    return {"ruta": ruta, "unidad_activa": activa, "responde": rc == 0 and http.strip().startswith("2"),
            "cargado": ruta and activa}


def _main_verificar() -> None:
    if ON is None:
        print("⚠️  Sin contexto de A1.")
        return
    r = verificar(lambda o: ON.ssh(o, timeout=30))
    print("cargado" if r["cargado"] else "no cargado", {k: v for k, v in r.items() if k != "cargado"})


def _main_instalar() -> None:
    """Ejecuta la instalación en el A1 por SSH como starseed,_masking IPs."""  # noqa: E501
    if ON is not None:
        rc, mem = ON.ssh("cat /proc/meminfo", timeout=30)
        if rc != 0 or not precheck_ram(mem):
            print("⛔ No instalo: el A1 no tiene 4 GB de RAM disponible (o no se pudo medir).")
            return
        for argv, origen in ordenes_copia("."):
            datos = Path(origen).read_text(encoding="utf-8") if origen else None
            rc, sal = ON.ssh(shlex.join(argv), entrada=datos, timeout=60)
            print(f"▶ {argv[0]} {'ok' if rc == 0 else 'falló'}")
            if rc != 0:
                return
    if ON is None:
        print("⚠️  No hay contexto de A1 (oracle_nodo no disponible).")
        print("📋 Unidades y órdenes a aplicar manualmente:")
        unit = unidad_systemd()
        print(unit)
        for o in ordenes_instalacion():
            print(f"  • {o}")
        return

    import subprocess  # noqa: F401 — usado solo en __main__

    ip_a1 = ON._ip()
    tachado_ip = ON.tachar(ip_a1) if ip_a1 else "<ip-a1>"

    unit = unidad_systemd()
    ordenes = ordenes_instalacion()

    # Escribir unidad systemd en el A1
    rc, salida = ON.ssh(
        f"cat > /etc/systemd/system/starseed-laya.service << 'EOF'\n{unit}\nEOF",
        timeout=60,
    )
    print(f"📦 Unidad systemd {'cargada' if rc == 0 else 'falló'}: {salida.strip()[-100:]}")

    # Ejecutar órdenes de instalación
    for orden in ordenes:
        rc, salida = ON.ssh(f"{orden}", timeout=60)
        tachado = ON.tachar(salida) if ip_a1 else "<ip-a1>"
        print(f"▶ {orden} → {'ok' if rc == 0 else 'falló'}: {tachado.strip()[:80]}")

    # Recargar systemd en la Mac local (opcional, para desarrollador)
    print("✅ Instalación en A1 finalizada. Las IPs en los mensajes están enmascaradas.")


if __name__ == "__main__":
    if "--verificar" in sys.argv:
        _main_verificar()
    elif "--instalar" in sys.argv:
        _main_instalar()
    else:
        unit = unidad_systemd()
        ordenes = ordenes_instalacion()
        print("=== Unidad systemd ===")
        print(unit)
        print("=== Órdenes de instalación ===")
        for o in ordenes:
            print(f"  • {o}")
        print("\nUso: python3 laya_a1.py --instalar  # para instalar en el A1")
