#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Puente MCP opcional de Blender (BLD1025K). Contrato: architecture/blender-3d.md §1.6.

NO es el camino por defecto del OS: solo prepara, con tres seguros, lo que una persona activará en
su escritorio: 1) socket del complemento SOLO en 127.0.0.1 · 2) DISABLE_TELEMETRY=true y
BLENDER_MCP_SAFE_MODE=1 · 3) `execute_blender_code` nunca llega a un agente. Nada se instala ni
se abre aquí: solo guarda un candidato que la persona acepta con la mano.
"""
import json
import os
import platform
import re
import subprocess
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple

HOST = "127.0.0.1"
PUERTO = 9876
# Lista blanca: solo herramientas de lectura. Todo lo demás (execute_blender_code, generate_3d,
# search_assets, import_asset, disable_telemetry, record_trajectory_feedback y lo desconocido), fuera.
HERRAMIENTAS_LECTURA = ("get_scene_info", "look", "get_addon_status")


class Sistema:
    """Lo que toca la máquina, inyectable para las pruebas (subprocesos y disco simulados)."""

    def __init__(self, plataforma: str = "", ejecutar: Optional[Callable[..., Any]] = None,
                 home: Optional[Path] = None):
        self.plataforma = plataforma or platform.system()
        self.ejecutar = ejecutar or subprocess.run
        self.home = Path(home) if home else Path.home()

    def escucha(self, puerto: int) -> Optional[str]:
        """Salida de `lsof` (macOS) o `ss` (Linux); None si falla la orden."""
        orden = (["lsof", "-nP", f"-iTCP:{puerto}", "-sTCP:LISTEN"] if self.plataforma == "Darwin"
                 else ["ss", "-ltn"])
        try:
            r = self.ejecutar(orden, capture_output=True, text=True, timeout=10)
        except (OSError, subprocess.SubprocessError):
            return None
        return r.stdout if r.returncode == 0 else None


def seguros_de(entorno: Optional[Dict[str, str]] = None) -> Dict[str, str]:
    """Entorno que DEBE llevar el servidor MCP: sin telemetría, modo seguro y host local."""
    base = dict(entorno) if entorno else os.environ.copy()
    base.update(DISABLE_TELEMETRY="true", BLENDER_MCP_SAFE_MODE="1", BLENDER_MCP_HOST=HOST)
    return base


def herramientas_para_agentes(lista: List[str]) -> List[str]:
    """Deja pasar SOLO las herramientas de lectura de la lista blanca."""
    return [h for h in lista if h in HERRAMIENTAS_LECTURA]


_RE_ESCUCHA = re.compile(r"\b([\w.]+|\*|\[\w+\]):(\d+)\b")


def puerto_solo_local(s: Sistema, puerto: int = PUERTO) -> Tuple[bool, str]:
    """Comprueba que el socket del complemento escucha SOLO en 127.0.0.1. Devuelve (ok, motivo)."""
    salida = s.escucha(puerto)
    if salida is None:
        return False, "No se pudo consultar el estado del puerto (sin lsof ni ss, o fallaron)."
    lineas = [ln for ln in salida.splitlines()
              if not ln.strip().startswith(("Command", "Netid", "State", "command"))]
    if not lineas:
        return False, f"Nadie escucha en el puerto {puerto}: el complemento de Blender no está activo."
    encontrada = False
    for ln in lineas:
        for m in _RE_ESCUCHA.finditer(ln):
            if m.group(2) != str(puerto):
                continue
            host = m.group(1)
            if host not in ("127.0.0.1", "[::1]"):
                return False, (f"El puerto {puerto} está abierto en «{host}», no solo en 127.0.0.1: "
                               "cualquiera en la red podría ejecutar código en Blender.")
            encontrada = True
    if not encontrada:
        return False, f"No se identifica una escucha de 127.0.0.1 en el puerto {puerto}."
    return True, f"El complemento escucha solo en 127.0.0.1:{puerto}. Seguro 1 en verde."


_PASOS = [
    "1 · Instala el complemento desde su repositorio oficial (GitHub ahujasid/blender-mcp, licencia MIT; descarga manual).",
    "2 · En Blender: Edit → Preferencias → Complementos → activa «Blender MCP» y pulsa su botón de servidor.",
    "3 · Arranca el servidor MCP con las variables del apartado «entorno»; solo lo hace una persona en pantalla.",
    "4 · Comprueba con `puerto_solo_local` que el socket escucha SOLO en 127.0.0.1 antes de dar herramientas.",
]

_AVISOS = [
    "Licencia: blender-mcp es MIT; Blender es GPL-3.0 y corre aparte. Hunyuan3D (Tencent) EXCLUYE la UE: no se usa.",
    "Telemetría: el puente manda un registro anónimo por defecto; el candidato ya lleva DISABLE_TELEMETRY=true.",
    "El socket no tiene autenticación ni cifrado: quien alcance el puerto ejecuta código en Blender.",
]


def plan_puente(s: Sistema) -> Dict[str, Any]:
    """Plan explicado para la persona: qué es, por qué y cómo, con los tres seguros ya puestos."""
    seguros = seguros_de()
    blanca = list(HERRAMIENTAS_LECTURA) + ["execute_blender_code", "generate_3d", "import_asset"]
    puerto_ok, motivo = puerto_solo_local(s)
    return {
        "nombre": "puente-mcp-blender", "version": 1, "candidato": True,
        "que_es": ("Servidor MCP que traduce herramientas de agente a la escena de Blender abierta en tu "
                   "escritorio (ahujasid/blender-mcp, MIT). Complemento OPCIONAL: no es el camino del OS, "
                   "que usa trabajos 3D como dato con lista blanca."),
        "entorno": {"DISABLE_TELEMETRY": seguros["DISABLE_TELEMETRY"],
                    "BLENDER_MCP_SAFE_MODE": seguros["BLENDER_MCP_SAFE_MODE"]},
        "puertos": {"complemento": PUERTO, "host": HOST, "en_verde": puerto_ok, "motivo": motivo},
        "herramientas_para_agentes": herramientas_para_agentes(blanca),
        "execute_blender_code": "prohibida para agentes: Python arbitrario dentro de Blender; solo una persona "
                                "delante de la pantalla puede usarla.",
        "pasos": _PASOS, "avisos": _AVISOS,
        "configuracion_cliente": {"command": "uvx", "args": ["mcp-for-blender"], "env": {
            "DISABLE_TELEMETRY": "true", "BLENDER_MCP_SAFE_MODE": "1"}},
    }


def escribir_candidato(plan: Dict[str, Any], s: Optional[Sistema] = None) -> Path:
    """Guarda el plan en ~/.starseed/blender-3d/puente-mcp.candidato.json (permisos 600).

    NUNCA toca la configuración real de ningún cliente MCP: una persona la acepta con la mano;
    el contenido no lleva claves ni rutas absolutas.
    """
    s = s or Sistema()
    destino = s.home / ".starseed" / "blender-3d" / "puente-mcp.candidato.json"
    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.write_text(json.dumps(plan, ensure_ascii=False, indent=2, sort_keys=True), encoding="utf-8")
    os.chmod(destino, 0o600)
    return destino
