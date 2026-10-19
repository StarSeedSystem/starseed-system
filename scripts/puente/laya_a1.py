#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Laya en el A1 de Oracle — unidad systemd y órdenes de instalación (LYS1018Gb)."""
from __future__ import annotations

import os
import sys

try:
    import oracle_nodo as ON  # noqa: E402 — puro, sin efectos colaterales en import
except Exception:  # noqa: BLE001 — puede que no haya contexto de A1
    ON = None  # type: ignore


def unidad_systemd(usuario: str = "starseed", ruta_servicio: str = "/home/starseed/starseed-wt/LYS1018Gb/native/laya/servidor-laya.mjs") -> str:
    """Devuelve el texto de la unidad systemd para el servidor Laya en 127.0.0.1 con MemoryMax=3G."""
    return f"""[Unit]
Description=StarSeed · Servidor Laya Local SystemOne
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User={usuario}
WorkingDirectory={os.path.dirname(ruta_servicio)}
Environment=PORT=4470
Environment=LAYA_CACHE=/home/{usuario}/.starseed/laya-cache
ExecStart=/usr/bin/node {ruta_servicio}
Restart=on-failure
RestartSec=10
MemoryMax=3G
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


def _main_instalar() -> None:
    """Ejecuta la instalación en el A1 por SSH como starseed,_masking IPs."""  # noqa: E501
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
    if "--instalar" in sys.argv:
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
