#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Laya en el A1 de Oracle — unidad systemd y órdenes de instalación (LYS1018Gb)."""
from __future__ import annotations

import os

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
Environment=HOST=127.0.0.1
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
