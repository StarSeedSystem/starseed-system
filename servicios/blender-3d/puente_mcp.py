#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Puente MCP opcional de Blender (BLD1025K). Contrato: architecture/blender-3d.md §1.6.

NO es el camino por defecto (lo normal es trabajo 3D como dato, §4).
Prepara, con tres seguros obligatorios, lo que una persona activará en su escritorio.

Seguros: 1) Entorno DISABLE_TELEMETRY=true, BLENDER_MCP_SAFE_MODE=1, host 127.0.0.1
         2) Herramientas SOLO lectura (get_scene_info, look, get_addon_status)
         3) Puerto SOLO en 127.0.0.1 (lsof/ss).
"""
import json, os, platform, subprocess
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple

HERRAMIENTAS_PERMITIDAS = ("get_scene_info", "look", "get_addon_status")
PUERTO_POR_DEFECTO = 9876
RUTA_CANDIDATO = Path.home() / ".starseed" / "blender-3d" / "puente-mcp.candidato.json"


class Sistema:
    """Inyectable para pruebas (subprocesos simulados)."""
    def __init__(self, ejecutar: Callable[..., Any] = subprocess.run,
                 plataforma: str = "", leer: Optional[Callable[[str], str]] = None):
        self.ejecutar, self.plataforma = ejecutar, plataforma or platform.system()
        self.leer = leer or (lambda r: Path(r).read_text(encoding="utf-8", errors="replace"))


def seguros_de(entorno: Optional[Dict[str, str]] = None) -> Dict[str, str]:
    base = dict(entorno or os.environ)
    base.update(DISABLE_TELEMETRY="true", BLENDER_MCP_SAFE_MODE="1", BLENDER_MCP_HOST="127.0.0.1")
    return base


def herramientas_para_agentes(lista: List[str]) -> List[str]:
    return [h for h in lista if h in HERRAMIENTAS_PERMITIDAS]


def _salida(s: Sistema, orden: List[str]) -> Optional[str]:
    try:
        r = s.ejecutar(orden, capture_output=True, text=True, timeout=5)
        return r.stdout if r.returncode == 0 else None
    except (OSError, subprocess.SubprocessError):
        return None


def _puerto_ok(salida: str, puerto: int, es_lsof: bool) -> Tuple[bool, str]:
    for linea in salida.splitlines():
        if f":{puerto}" not in linea or "LISTEN" not in linea: continue
        if "127.0.0.1" in linea or "::1" in linea: return True, "Socket escuchando solo en 127.0.0.1"
        if es_lsof or "*:" in linea or "0.0.0.0" in linea or ":::" in linea:
            return False, f"Socket en interfaz no local: {linea.strip()}"
    return False, "No hay socket en escucha en el puerto"


def puerto_solo_local(s: Sistema, puerto: int = PUERTO_POR_DEFECTO) -> Tuple[bool, str]:
    if s.plataforma == "Darwin":
        out = _salida(s, ["lsof", "-nP", f"-iTCP:{puerto}", "-sTCP:LISTEN"])
        if out is not None: return _puerto_ok(out, puerto, True)
    out = _salida(s, ["ss", "-ltn"])
    if out is not None: return _puerto_ok(out, puerto, False)
    return False, "No se pudo comprobar el puerto (falta lsof/ss)"


def plan_puente(s: Sistema) -> Dict[str, Any]:
    return {
        "que_es": "Puente MCP opcional para Blender (ahujasid/blender-mcp). Permite a un agente "
                  "consultar la escena (get_scene_info, look, get_addon_status) SIN código arbitrario "
                  "ni servicios de terceros.",
        "por_que": "El camino por defecto es trabajo 3D como dato (§4). Este puente sirve solo si una "
                   "persona quiere, en su escritorio, consultar la escena con tres seguros obligatorios.",
        "seguros": [
            "Entorno: DISABLE_TELEMETRY=true, BLENDER_MCP_SAFE_MODE=1, host 127.0.0.1",
            "Herramientas: solo lectura (get_scene_info, look, get_addon_status); "
            "execute_blender_code, generate_3d, search_assets, import_asset, disable_telemetry, "
            "record_trajectory_feedback y cualquier otra quedan fuera.",
            "Puerto: el socket DEBE escuchar solo en 127.0.0.1 (comprobado con lsof/ss).",
        ],
        "pasos_manuales": [
            "1. Clona: git clone https://github.com/ahujasid/blender-mcp",
            "2. Blender → Preferencias → Complementos → Instalar → addon.py del repo",
            "3. Activa «MCP for Blender», puerto 9876 (host 127.0.0.1).",
            "4. Arranca servidor: DISABLE_TELEMETRY=true BLENDER_MCP_SAFE_MODE=1 "
            "BLENDER_MCP_HOST=127.0.0.1 uvx mcp-for-blender",
            "5. Verifica: lsof -nP -iTCP:9876 -sTCP:LISTEN (macOS) o ss -ltn (Linux).",
        ],
        "configuracion_candidata_cliente_mcp": {
            "mcpServers": {"blender": {"command": "uvx", "args": ["mcp-for-blender"],
                "env": {"DISABLE_TELEMETRY": "true", "BLENDER_MCP_SAFE_MODE": "1",
                        "BLENDER_MCP_HOST": "127.0.0.1", "BLENDER_MCP_PORT": "9876"}}}
        },
        "avisos_licencia_y_telemetria": [
            "Licencia: MIT (ahujasid/blender-mcp).",
            "Hunyuan3D (Tencent Cloud) EXCLUYE la UE: no usar desde Europa.",
            "Telemetría: id aleatorio, herramienta, éxito, duración, versiones, SO. "
            "Apagada con DISABLE_TELEMETRY=true (incluido en la configuración).",
            "Socket sin auth ni cifrado: SOLO 127.0.0.1 y solo en tu escritorio.",
            "execute_blender_code NO se expone a agentes: solo persona delante confirma.",
        ],
    }


def escribir_candidato(plan: Dict[str, Any], raiz: Optional[Path] = None) -> Path:
    destino = Path(raiz) if raiz else RUTA_CANDIDATO
    destino.parent.mkdir(parents=True, exist_ok=True)
    fd = os.open(str(destino), os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as f: json.dump(plan, f, ensure_ascii=False, indent=2)
    return destino


if __name__ == "__main__":
    s = Sistema()
    print(json.dumps(plan_puente(s), ensure_ascii=False, indent=2))