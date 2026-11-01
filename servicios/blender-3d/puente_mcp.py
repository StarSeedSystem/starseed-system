#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Puente MCP opcional de Blender (BLD1025K). Contrato: `architecture/blender-3d.md` §1.6.

NO es el camino por defecto: lo normal es el trabajo 3D como DATO (§4). Esto solo PREPARA, con
tres seguros, lo que una persona activará en su escritorio: no instala, no abre puertos ni toca la
configuración real de ningún cliente MCP. Seguros: puerto solo en 127.0.0.1,
`DISABLE_TELEMETRY=true` + `BLENDER_MCP_SAFE_MODE=1`, y `execute_blender_code` nunca a un agente.
"""
import json, os, re, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "taller-3d"))
import taller as T  # noqa: E402

Sistema = T.Sistema
HOST = "127.0.0.1"
PUERTO = 9876
LECTURA = ("get_scene_info", "look", "get_addon_status")
RETIRADAS = {
    "execute_blender_code": "código Python arbitrario dentro de Blender; solo lo confirma una persona",
    "generate_3d": "servicio de terceros (generación)", "search_assets": "servicio de terceros (búsqueda)",
    "import_asset": "servicio de terceros (importación)", "disable_telemetry": "se apaga al arrancar",
    "record_trajectory_feedback": "envía trayectorias a un tercero",
}
SEGUROS = {"DISABLE_TELEMETRY": "true", "BLENDER_MCP_SAFE_MODE": "1", "BLENDER_MCP_HOST": HOST}
CREDENCIALES = ("KEY", "TOKEN", "SECRET", "PROXY", "PASSWORD")
RE_PUERTO = re.compile(r"(?P<host>\[[0-9a-fA-F:]+\]|[^\s:,]+):(?P<puerto>\d+)")
LOOPBACK = ("127.0.0.1", "[::1]", "::1")

def seguros_de(entorno=None):
    """Entorno que DEBE llevar el servidor: los tres seguros mandan; credenciales y proxy fuera."""
    limpio = {k: v for k, v in (entorno or {}).items() if not any(p in k.upper() for p in CREDENCIALES)}
    limpio.update(SEGUROS)
    return limpio

def herramientas_para_agentes(lista):
    """Solo herramientas de LECTURA conocidas; todo lo demás, incluido lo desconocido, fuera."""
    nombres = []
    for elemento in lista or ():
        nombre = elemento.get("name") if isinstance(elemento, dict) else elemento
        if isinstance(nombre, str) and nombre in LECTURA and nombre not in nombres:
            nombres.append(nombre)
    return nombres

def _hosts_de(salida, puerto):
    hosts = set()
    for linea in (salida or "").splitlines():
        for m in RE_PUERTO.finditer(linea):
            if int(m.group("puerto")) == puerto:
                hosts.add(m.group("host"))
    return hosts

def puerto_solo_local(s, puerto=PUERTO):
    """(ok, motivo): con lsof (macOS) o ss (Linux), el socket escucha SOLO en el loopback o no escucha."""
    lsof = ["lsof", "-nP", f"-iTCP:{puerto}", "-sTCP:LISTEN"]
    ordenes = [lsof, ["ss", "-ltn"]] if s.plataforma == "Darwin" else [["ss", "-ltn"], lsof]
    salidas = [x for x in (s.salida(orden) for orden in ordenes) if x is not None]
    if not salidas:
        return False, f"no pude comprobar el puerto {puerto}: lsof y ss no dieron salida (o no están)"
    hosts = set().union(*(_hosts_de(salida, puerto) for salida in salidas))
    if not hosts:
        return False, f"nadie escucha en el puerto {puerto}: arranca Blender con el complemento activo"
    fuera = sorted(h for h in hosts if h not in LOOPBACK)
    if fuera:
        return False, f"el puerto {puerto} escucha fuera del loopback ({', '.join(fuera)}): ciérralo ya"
    return True, f"el puerto {puerto} escucha solo en {HOST}"

def plan_puente(s=None):
    """Plan para una PERSONA: qué es, por qué, cómo, configuración candidata y avisos."""
    s = s or Sistema()
    escucha, motivo = puerto_solo_local(s)
    entorno = seguros_de()
    cliente = {"mcpServers": {"blender": {"command": "uvx", "args": ["mcp-for-blender"], "env": entorno}}}
    pasos = [
        "1. Instala el complemento addon.py del repositorio público blender-mcp de ahujasid en Blender (Edit > Preferences > Add-ons > Install). Nada de curl | sh.",
        "2. Actívalo y deja que abra su servidor de sockets solo en 127.0.0.1:9876 (panel lateral).",
        "3. Arranca el servidor MCP con uvx mcp-for-blender y el entorno de más abajo.",
        "4. Comprueba el puerto con lsof -nP -iTCP:9876 -sTCP:LISTEN (macOS) o ss -ltn (Linux): solo 127.0.0.1.",
        "5. Copia la configuración candidata a tu cliente MCP a mano. Nadie la aplica por ti.",
    ]
    avisos = [
        "El puente es MIT; Blender es GPL y sigue siendo un programa APARTE, sin enlazarlo ni copiar su código.",
        "Hunyuan3D (Tencent Cloud) excluye la Unión Europea en su licencia: no se usa desde aquí.",
        "La telemetría se apaga con DISABLE_TELEMETRY=true; sin eso manda un registro anónimo mínimo.",
        "El socket no tiene autenticación ni cifrado: fuera de 127.0.0.1, cualquiera ejecuta código en Blender.",
        "execute_blender_code (Python arbitrario) y los servicios de terceros no se ofrecen a ningún agente.",
    ]
    return {
        "v": 1,
        "que_es": "Puente MCP opcional: deja que un agente LEA la escena de Blender (qué hay, una captura y si el complemento está activo). No es el camino normal del OS.",
        "por_que": "El camino por defecto es el trabajo 3D como DATO: el OS arma un guion desde una lista blanca y no ejecuta código libre. Esto solo prepara el atajo para tu escritorio.",
        "como": "Tres seguros: puerto solo en 127.0.0.1, telemetría apagada y modo seguro, y execute_blender_code nunca expuesta a un agente (solo la confirma una persona).",
        "pasos": pasos, "avisos": avisos,
        "servidor": {"comando": "uvx", "argumentos": ["mcp-for-blender"], "entorno": entorno},
        "configuracion_candidata": cliente,
        "herramientas_permitidas": list(LECTURA), "herramientas_retiradas": dict(RETIRADAS),
        "puerto": {"numero": PUERTO, "host": HOST, "escucha_solo_local": escucha, "motivo": motivo},
        "no_hace": "Este candidato no instala nada, no abre puertos y no toca la configuración real de "
                   "ningún cliente MCP: una persona lo acepta con la mano.",
    }

def raiz_por_defecto():
    return Path(os.environ.get("STARSEED_BLENDER_RAIZ") or Path.home() / ".starseed" / "blender-3d")

def escribir_candidato(plan, raiz=None):
    """Guarda el plan como CANDIDATO (permisos 600); nunca toca la configuración real."""
    destino = Path(raiz or raiz_por_defecto()) / "puente-mcp.candidato.json"
    try:
        destino.parent.mkdir(parents=True, exist_ok=True)
        tmp = destino.with_name(destino.name + ".tmp")
        tmp.write_text(json.dumps(plan, ensure_ascii=False, sort_keys=True, indent=2), encoding="utf-8")
        os.chmod(tmp, 0o600)
        os.replace(tmp, destino)
    except OSError:
        return None
    return destino
