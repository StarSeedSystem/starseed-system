#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Puente MCP opcional de Blender (BLD1025K · contrato `architecture/blender-3d.md` §1.6).

NO es el camino por defecto del OS: lo normal es el trabajo 3D como DATO (§4). Este módulo solo PREPARA,
con tres seguros obligatorios, lo que una persona decidirá activar en su escritorio: puerto solo en
127.0.0.1, telemetría apagada + modo seguro, y `execute_blender_code` fuera del alcance de los agentes.
No instala nada, no abre puertos, no ejecuta `uvx`/`pip`/`curl` y NUNCA escribe la configuración real de
un cliente MCP: deja un candidato con permisos 600 para que una persona lo acepte con la mano.
Solo biblioteca estándar; Blender es GPL y corre como programa aparte, nunca se importa `bpy` aquí.
"""
import json, os, platform, re, subprocess
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

VERSION = 1
PUERTO = 9876
HOST = "127.0.0.1"
# Lista blanca de lectura; todo lo demás (execute_blender_code, generate_3d, search_assets,
# import_asset, disable_telemetry, record_trajectory_feedback y lo desconocido) se queda fuera.
LECTURA = ("get_scene_info", "look", "get_addon_status")
RE_PUERTO = re.compile(r"(\[[^\]]+\]|\*|[0-9A-Za-z_.:%-]+):(\d+)(?=\s|$)")


class Sistema:
    """Lo que toca la máquina, inyectable en las pruebas (nunca abre puertos ni lanza el servidor)."""

    def __init__(self, plataforma: str = "", ejecutar=subprocess.run,
                 entorno: Optional[Dict[str, str]] = None):
        self.plataforma = plataforma or platform.system()
        self.ejecutar = ejecutar
        self.entorno = os.environ if entorno is None else entorno

    def salida(self, orden: List[str], timeout: float = 5) -> Optional[str]:
        """stdout de una orden corta, o None si no existe o falla."""
        try:
            r = self.ejecutar(orden, capture_output=True, text=True, timeout=timeout)
        except (OSError, subprocess.SubprocessError):
            return None
        return r.stdout if getattr(r, "returncode", 0) == 0 else None


def seguros_de(entorno: Optional[Dict[str, str]] = None) -> Dict[str, str]:
    """Entorno OBLIGATORIO del servidor MCP: no admite telemetría encendida ni host público."""
    return {
        "DISABLE_TELEMETRY": "true",
        "BLENDER_MCP_SAFE_MODE": "1",
        "BLENDER_MCP_HOST": HOST,
        "BLENDER_MCP_PORT": str(PUERTO),
    }


def herramientas_para_agentes(herramientas: List[Any]) -> List[Any]:
    """Deja SOLO las de lectura; quita ejecución arbitraria, servicios de terceros y desconocidas."""
    salida: List[Any] = []
    for h in herramientas or []:
        nombre = h if isinstance(h, str) else (h.get("name") if isinstance(h, dict) else None)
        if nombre in LECTURA:
            salida.append(h)
    return salida


def puerto_solo_local(s: Sistema, puerto: int = PUERTO) -> Tuple[bool, str]:
    """Comprueba que el socket del complemento escucha SOLO en 127.0.0.1 (no abre nada)."""
    orden = (["lsof", "-nP", "-iTCP:%d" % puerto, "-sTCP:LISTEN"]
             if s.plataforma == "Darwin" else ["ss", "-ltn"])
    salida = s.salida(orden)
    if salida is None:
        return False, "no se pudo comprobar el puerto %d: falta lsof/ss o falló la orden" % puerto
    hosts = [m.group(1) for linea in salida.splitlines()
             for m in RE_PUERTO.finditer(linea) if int(m.group(2)) == puerto]
    if not hosts:
        return False, "el complemento no escucha en el puerto %d" % puerto
    ajenos = sorted({h for h in hosts if h != HOST})
    if ajenos:
        return False, "escucha fuera de 127.0.0.1: %s" % ", ".join(ajenos)
    return True, "escucha solo en 127.0.0.1:%d" % puerto


def plan_puente(s: Optional[Sistema] = None) -> Dict[str, Any]:
    """Plan explicado para una persona: qué es, por qué, cómo y qué avisos tiene. No activa nada."""
    s = s or Sistema()
    ok, motivo = puerto_solo_local(s)
    entorno = seguros_de()
    pasos = [
        "1. Instala el complemento desde su repositorio (github.com/ahujasid/blender-mcp) y actívalo en Blender.",
        "2. Arranca el servidor con `uvx mcp-for-blender` y las variables de `entorno`.",
        "3. Comprueba que escucha solo en 127.0.0.1:9876; no lo expongas a la red.",
    ]
    avisos = [
        "Licencia del puente: MIT. Blender sigue siendo GPL y se usa como programa aparte.",
        "Hunyuan3D (Tencent) excluye la Unión Europea: no se usa.",
        "Telemetría apagada (DISABLE_TELEMETRY=true) y modo seguro (BLENDER_MCP_SAFE_MODE=1).",
        "execute_blender_code no se expone a ningún agente: solo una persona delante de la pantalla.",
    ]
    return {
        "v": VERSION,
        "titulo": "Puente MCP opcional de Blender (solo su escritorio, solo con su visto bueno)",
        "que_es": "Un servidor MCP local que traduce herramientas de un cliente MCP a un socket dentro de Blender.",
        "por_que": "Es opcional: el camino por defecto del OS es el trabajo 3D como dato; esto solo ayuda a una persona en su escritorio.",
        "como": pasos,
        "entorno": entorno,
        "configuracion_cliente": {"mcpServers": {"blender": {"command": "uvx", "args": ["mcp-for-blender"], "env": entorno}}},
        "puerto": {"puerto": PUERTO, "comprobado": ok, "motivo": motivo},
        "avisos": avisos,
        "aprobacion": "Nada se activa solo: una persona revisa este candidato y lo acepta con la mano.",
        "toca_configuracion_real": False,
    }


def escribir_candidato(plan: Dict[str, Any], raiz: Any) -> Path:
    """Guarda el candidato con permisos 600. NUNCA toca la configuración real de ningún cliente MCP."""
    destino = Path(raiz) / "puente-mcp.candidato.json"
    destino.parent.mkdir(parents=True, exist_ok=True)
    tmp = destino.with_name(destino.name + ".tmp")
    tmp.write_text(json.dumps(plan, ensure_ascii=False, indent=2, sort_keys=True), encoding="utf-8")
    os.chmod(tmp, 0o600)
    os.replace(tmp, destino)
    os.chmod(destino, 0o600)
    return destino
