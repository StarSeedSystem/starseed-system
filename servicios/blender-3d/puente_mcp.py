#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Puente MCP opcional de Blender (BLD1025K). Contrato: architecture/blender-3d.md §1.6 y §7.8.

NO es el camino por defecto del OS: lo normal es el trabajo 3D como DATO (§4). Esto solo prepara,
con tres seguros obligatorios, lo que una persona decidirá activar en su escritorio: puerto solo
en 127.0.0.1, telemetría apagada + modo seguro, y NUNCA `execute_blender_code` para agentes. No
instala nada, no abre puertos y no toca la configuración real de ningún cliente MCP: el plan se
guarda como CANDIDATO para que una persona lo acepte con la mano.
"""
import json, os, platform, re, subprocess
from pathlib import Path
HOST = "127.0.0.1"
PUERTO = 9876
LECTURA = ("get_scene_info", "look", "get_addon_status")
PROHIBIDAS = ("execute_blender_code", "generate_3d", "search_assets", "import_asset",
              "disable_telemetry", "record_trajectory_feedback")

class Sistema:
    """Todo lo que toca la máquina, inyectable para las pruebas (subprocesos simulados)."""

    def __init__(self, ejecutar=subprocess.run, plataforma="", entorno=None, raiz=None):
        self.ejecutar, self.plataforma = ejecutar, plataforma or platform.system()
        self.entorno = dict(os.environ if entorno is None else entorno); self.raiz = Path(raiz) if raiz else Path(self.entorno.get("HOME") or Path.home())

    def salida(self, orden, timeout=10):
        """stdout de una orden corta, o None si no existe o falla."""
        try: r = self.ejecutar(orden, capture_output=True, text=True, timeout=timeout)
        except (OSError, subprocess.SubprocessError): return None
        return r.stdout if getattr(r, "returncode", 0) == 0 else None

def seguros_de(entorno=None):
    """Entorno que DEBE llevar el servidor MCP: telemetría apagada, modo seguro y solo local."""
    base = dict(entorno or {})
    for clave in ("DISABLE_TELEMETRY", "BLENDER_MCP_SAFE_MODE", "BLENDER_MCP_HOST", "MCP_HOST"): base.pop(clave, None)
    base.update(DISABLE_TELEMETRY="true", BLENDER_MCP_SAFE_MODE="1", BLENDER_MCP_HOST=HOST, MCP_HOST=HOST)
    return base

def herramientas_para_agentes(lista):
    """Deja pasar SOLO herramientas de lectura; quita código libre, terceros y desconocidas."""
    if not isinstance(lista, (list, tuple)):
        return []
    vistas, salida = set(), []
    for nombre in lista:
        if isinstance(nombre, str) and nombre in LECTURA and nombre not in vistas:
            vistas.add(nombre); salida.append(nombre)
    return salida

def _orden(s, puerto):
    if s.plataforma == "Darwin": return ["lsof", "-nP", "-iTCP:%d" % puerto, "-sTCP:LISTEN"]
    return ["ss", "-ltn"]

def _escuchas(texto, puerto):
    hosts = set()
    for linea in (texto or "").splitlines():
        limpia = linea.strip()
        if not limpia or limpia.startswith(("State", "COMMAND", "Netid")): continue
        for v6, v4, num in re.findall(r"(?:\[([^\]]*)\]|([^\s:]+)):(\d+)", limpia):
            if int(num) == puerto:
                hosts.add((v6 or v4).strip())
    return hosts

def puerto_solo_local(s, puerto=PUERTO):
    """Mira (lsof/ss) que el socket escuche SOLO en 127.0.0.1. Devuelve (ok, motivo)."""
    puerto = int(puerto)
    texto = s.salida(_orden(s, puerto))
    if texto is None:
        return False, "no se pudo comprobar el puerto %d (sin lsof/ss o sin escucha)" % puerto
    hosts = _escuchas(texto, puerto)
    if not hosts:
        return False, "nadie escucha en el puerto %d: arranca el complemento y su servidor" % puerto
    fuera = sorted(h for h in hosts if h != HOST)
    if fuera:
        return False, "el puerto %d escucha en %s; debe escuchar SOLO en %s" % (puerto, ", ".join(fuera), HOST)
    return True, "el puerto %d escucha solo en %s" % (puerto, HOST)

def plan_puente(s=None):
    """Plan explicado para la persona. No instala, no ejecuta y no activa nada."""
    s = s or Sistema()
    seguros, cmd = seguros_de({}), "ss -ltn"
    if s.plataforma == "Darwin":
        cmd = "lsof -nP -iTCP:%d -sTCP:LISTEN" % PUERTO
    return {
        "v": 1, "puerto": PUERTO, "host": HOST,
        "que_es": "Un puente opcional entre un agente MCP y Blender por un socket local. NO es el camino por defecto del OS: lo normal es el trabajo 3D como dato, sin código libre.",
        "por_que": "Da a un agente de escritorio lectura de la escena (get_scene_info, look, get_addon_status) sin exponer Python arbitrario. Se activa solo con el visto bueno de Alex, en su escritorio.",
        "como": ("Pasos manuales: 1) instala el complemento desde su repositorio oficial (github.com/ahujasid/blender-mcp); "
                 "2) actívalo en Preferencias > Complementos; 3) arranca el servidor MCP con uvx mcp-for-blender y el entorno de abajo; "
                 "4) comprueba el puerto con `%s`. La configuración del cliente es un candidato: una persona la acepta con la mano." % cmd),
        "pasos": [
            {"paso": 1, "titulo": "Instalar el complemento", "detalle": "Desde su repositorio oficial, a mano. El OS no descarga ni ejecuta instaladores de terceros."},
            {"paso": 2, "titulo": "Activarlo en Blender", "detalle": "Preferencias > Complementos. No se cargan complementos del usuario con --factory-startup."},
            {"paso": 3, "titulo": "Arrancar el servidor", "detalle": "uvx mcp-for-blender con DISABLE_TELEMETRY=true, BLENDER_MCP_SAFE_MODE=1 y host 127.0.0.1."},
            {"paso": 4, "titulo": "Comprobar el puerto", "detalle": "Solo puede escuchar en 127.0.0.1; si sale *:9876 o 0.0.0.0, se para y no se usa."},
        ],
        "configuracion_cliente": {"mcpServers": {"blender": {"command": "uvx", "args": ["mcp-for-blender"], "env": seguros}}},
        "herramientas_permitidas": list(LECTURA), "herramientas_prohibidas": list(PROHIBIDAS),
        "avisos": {
            "licencia": "El puente es MIT. Blender es GPL: es un programa APARTE, como proceso hijo por lista de argumentos y sin shell; no se enlaza ni se copia al repo.",
            "terceros": "Los servicios de terceros usan tu cuenta y tus datos. Hunyuan3D excluye la UE: no se usa. Tampoco se expone execute_blender_code (Python arbitrario) a ningún agente.",
            "telemetria": "El servidor manda un registro anónimo salvo DISABLE_TELEMETRY=true. El plan la apaga y BLENDER_MCP_SAFE_MODE=1 filtra operaciones peligrosas.",
        },
        "aprobacion": "Requiere el visto bueno de Alex. Este archivo NO activa nada ni toca la configuración real de ningún cliente MCP.",
    }
def escribir_candidato(plan, raiz):
    """Guarda el plan como CANDIDATO (permisos 600). No toca ninguna configuración real."""
    base = Path(raiz)
    if base.name == ".starseed": base = base / "blender-3d"
    elif base.name != "blender-3d": base = base / ".starseed" / "blender-3d"
    destino = base / "puente-mcp.candidato.json"
    destino.parent.mkdir(parents=True, exist_ok=True)
    try:
        os.chmod(destino.parent, 0o700)
    except OSError:
        pass
    tmp = destino.with_name(destino.name + ".tmp")
    tmp.write_text(json.dumps(plan, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    os.chmod(tmp, 0o600)
    os.replace(tmp, destino)
    return destino
