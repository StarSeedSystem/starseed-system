#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Puente MCP opcional de Blender (BLD1025K; contrato `architecture/blender-3d.md` §1.6).

NO es el camino por defecto del OS: el camino normal es el trabajo 3D como DATO (§4). Esto solo
prepara, con tres seguros, lo que una persona decidirá activar en su escritorio. No instala nada,
no abre puertos y no toca la configuración real de ningún cliente MCP.
"""
import json
import os
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

SERVIDOR = "mcp-for-blender"
HOST = "127.0.0.1"
PUERTO_MCP = 9876
VARIABLES_PERMITIDAS = ("PATH", "HOME", "TMPDIR", "TMP", "TEMP", "LANG", "LC_ALL")
SEGUROS = {"DISABLE_TELEMETRY": "true", "BLENDER_MCP_SAFE_MODE": "1", "BLENDER_MCP_HOST": HOST}
LECTURA = ("get_scene_info", "look", "get_addon_status")
PELIGROSAS = ("execute_blender_code", "generate_3d", "search_assets", "import_asset",
              "disable_telemetry", "record_trajectory_feedback")

def seguros_de(entorno: Optional[Dict[str, str]] = None) -> Dict[str, str]:
    """Entorno que DEBE llevar el servidor MCP: sin telemetría, modo seguro y solo en local."""
    base = entorno if isinstance(entorno, dict) else {}
    limpio = {k: v for k, v in base.items() if k in VARIABLES_PERMITIDAS and isinstance(v, str)}
    limpio.update(SEGUROS)
    return limpio

def herramientas_para_agentes(herramientas: Any) -> List[str]:
    """Solo las de lectura, en el orden recibido; todo lo demás (y lo desconocido) se queda fuera."""
    if not isinstance(herramientas, (list, tuple)):
        return []
    salida: List[str] = []
    for nombre in herramientas:
        if isinstance(nombre, str) and nombre in LECTURA and nombre not in salida:
            salida.append(nombre)
    return salida

def _partir(direccion: str) -> Tuple[str, str]:
    """Separa «host:puerto» de `lsof`/`ss`; admite los corchetes de IPv6."""
    texto = (direccion or "").strip()
    if texto.startswith("["):
        host, _, resto = texto.partition("]")
        return host.lstrip("["), resto.lstrip(":")
    host, _, puerto = texto.rpartition(":")
    return (host, puerto) if puerto else (texto, "")

def _escuchas(s: Any, puerto: int) -> List[str]:
    """Direcciones que escuchan en ese puerto, según `lsof` (macOS) o `ss` (Linux)."""
    if getattr(s, "plataforma", "") == "Darwin":
        salida = s.salida(["lsof", "-nP", "-iTCP:%d" % puerto, "-sTCP:LISTEN"]) or ""
        direcciones = []
        for linea in salida.splitlines():
            campos = linea.split()
            if not campos or campos[0] == "COMMAND":
                continue
            ultimo = campos[-1]
            direcciones.append(campos[-2] if ultimo.startswith("(") and len(campos) >= 2 else ultimo)
    else:
        salida = s.salida(["ss", "-ltn"]) or ""
        direcciones = [c[3] for c in (l.split() for l in salida.splitlines())
                       if len(c) >= 4 and c[0] == "LISTEN"]
    return [d for d in direcciones if d and _partir(d)[1] == str(puerto)]

def puerto_solo_local(s: Any, puerto: int = PUERTO_MCP) -> Tuple[bool, str]:
    """(ok, motivo): el complemento debe escuchar SOLO en 127.0.0.1, nunca en * ni 0.0.0.0."""
    hosts = [_partir(d)[0] for d in _escuchas(s, puerto)]
    if not hosts:
        return False, "nadie escucha en el puerto %d: arranca el complemento dentro de Blender y repite" % puerto
    ajenos = sorted({h for h in hosts if h != HOST})
    if ajenos:
        return False, "el puerto %d escucha en %s, no solo en 127.0.0.1" % (puerto, ", ".join(ajenos))
    return True, "escucha solo en 127.0.0.1:%d" % puerto

def plan_puente(s: Any) -> Dict[str, Any]:
    """Plan para una persona: qué es, por qué, cómo, configuración candidata y avisos."""
    puerto = PUERTO_MCP
    ok, motivo = puerto_solo_local(s, puerto)
    return {
        "v": 1,
        "que_es": "Un puente opcional que deja a un agente leer la escena de Blender por MCP.",
        "por_que": "El camino normal del OS es el trabajo 3D como dato; esto solo sirve si tú, delante "
                   "de tu escritorio, quieres además que un agente mire la escena que tienes abierta.",
        "como": [
            "Instala el complemento desde su repositorio (github.com/ahujasid/blender-mcp); nosotros no lo instalamos.",
            "Actívalo en Blender, en Preferencias › Complementos.",
            "Arranca el servidor con `uvx mcp-for-blender` y estas variables de entorno: "
            + ", ".join("%s=%s" % (k, v) for k, v in sorted(SEGUROS.items())) + ".",
            "Comprueba que el puerto %d escucha solo en 127.0.0.1 antes de conectar ningún cliente." % puerto,
        ],
        "puerto": {"numero": puerto, "comprobado": ok, "motivo": motivo},
        "herramientas_para_agentes": list(LECTURA),
        "herramientas_retiradas": list(PELIGROSAS),
        "configuracion_candidata": {
            "mcpServers": {SERVIDOR: {"command": "uvx", "args": [SERVIDOR], "env": seguros_de()}}
        },
        "avisos": [
            "El puente es MIT; Blender es GPL y sigue siendo un programa aparte.",
            "Hunyuan3D (Tencent) excluye la UE: no se usa. Nada de servicios de terceros.",
            "La telemetría va apagada (DISABLE_TELEMETRY=true) y el modo seguro encendido.",
            "execute_blender_code queda fuera: solo una persona delante de la pantalla puede confirmarla.",
        ],
    }

def escribir_candidato(plan: Dict[str, Any], raiz: Any) -> Path:
    """Guarda el plan con permisos 600; NUNCA toca la configuración real de un cliente MCP."""
    carpeta = Path(raiz) / "blender-3d"
    carpeta.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(carpeta, 0o700)
    destino = carpeta / "puente-mcp.candidato.json"
    datos = json.dumps(plan, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    descriptor = os.open(str(destino), os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8") as archivo:
        archivo.write(datos)
    os.chmod(destino, 0o600)
    return destino
