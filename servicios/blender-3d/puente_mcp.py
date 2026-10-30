#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Puente MCP opcional de Blender (BLD1025K · `architecture/blender-3d.md` §1.6).

NO es el camino por defecto del OS: lo normal es el trabajo 3D como DATO (§4), que da a los
agentes lo que necesitan sin ejecutar código libre. Esto solo PREPARA, con tres seguros
obligatorios, lo que una persona decidirá activar en su escritorio. No instala nada, no abre
puertos y no toca la configuración real de ningún cliente MCP: escribe un candidato y espera
aprobación humana.
"""
import json, os, platform, re, subprocess
from pathlib import Path

HOST, PUERTO = "127.0.0.1", 9876
SEGUROS = {"DISABLE_TELEMETRY": "true", "BLENDER_MCP_SAFE_MODE": "1", "BLENDER_MCP_HOST": HOST}
LECTURA = ("get_scene_info", "look", "get_addon_status")
RE_HOST = re.compile(r"(\[[0-9a-fA-F:]+\]|[^\s:]+):(\d+)\b")
CANDIDATO = "puente-mcp.candidato.json"

class Sistema:
    def __init__(self, plataforma: str = "", ejecutar=subprocess.run, entorno: dict | None = None):
        self.plataforma = plataforma or platform.system()
        self.ejecutar = ejecutar
        self.entorno = os.environ if entorno is None else entorno

    def salida(self, orden: list[str], timeout: float = 10) -> str | None:
        try:
            r = self.ejecutar(orden, capture_output=True, text=True, timeout=timeout)
        except (OSError, subprocess.SubprocessError):
            return None
        return r.stdout if r.returncode == 0 else None

def _clave_secreta(nombre: str) -> bool:
    return any(p in str(nombre).upper() for p in ("KEY", "TOKEN", "SECRET", "PASSWORD", "CLAVE", "CONTRASE"))
def seguros_de(entorno: dict | None = None) -> dict[str, str]:
    """Entorno que DEBE llevar el servidor MCP: telemetría apagada, modo seguro y solo local."""
    limpio = {k: str(v) for k, v in (entorno or {}).items() if not _clave_secreta(k)}
    for nombre in SEGUROS:
        for existente in [k for k in limpio if k.upper() == nombre.upper()]:
            del limpio[existente]
    limpio.update(SEGUROS)
    return limpio

def herramientas_para_agentes(nombres) -> list[str]:
    """Solo las herramientas de lectura de la lista blanca; todo lo demás se queda fuera."""
    permitidas: list[str] = []
    for nombre in nombres or ():
        if isinstance(nombre, str) and nombre.strip() in LECTURA and nombre.strip() not in permitidas:
            permitidas.append(nombre.strip())
    return permitidas

def _hosts_de(texto: str, puerto: int) -> set:
    hosts = set()
    for linea in (texto or "").splitlines():
        for m in RE_HOST.finditer(linea):
            if m.group(2) == str(puerto):
                hosts.add(m.group(1).strip("[]"))
    return hosts

def puerto_solo_local(s: Sistema, puerto: int = PUERTO) -> tuple[bool, str]:
    """Comprueba que el socket del complemento escucha SOLO en 127.0.0.1."""
    if getattr(s, "plataforma", "") == "Darwin":
        orden = ["lsof", "-nP", "-iTCP:%d" % puerto, "-sTCP:LISTEN"]
    else:
        orden = ["ss", "-ltn"]
    salida = s.salida(orden) if hasattr(s, "salida") else None
    if salida is None:
        return False, "no se pudo consultar el puerto %d (¿lsof/ss no disponible?)" % puerto
    hosts = _hosts_de(salida, puerto)
    if not hosts:
        return False, "el complemento no escucha en el puerto %d" % puerto
    malos = sorted(h for h in hosts if h != HOST)
    if malos:
        return False, "el puerto %d escucha fuera de %s: %s" % (puerto, HOST, ", ".join(malos))
    return True, "el puerto %d escucha solo en %s" % (puerto, HOST)

def plan_puente(s: Sistema) -> dict[str, object]:
    """Plan explicado para una persona: qué es, por qué, cómo, configuración y avisos."""
    seguro = seguros_de(getattr(s, "entorno", {}) or {})
    return {
        "titulo": "Puente MCP opcional de Blender",
        "que_es": "Un servidor MCP que deja a un agente mirar la escena abierta en Blender. No es el camino por defecto del OS.",
        "por_que": "Solo hace falta si una persona quiere que un agente acompañe una sesión abierta en su escritorio; el trabajo 3D normal va como DATO validado, sin código libre.",
        "como": [
            "1. Instala el complemento de Blender desde su repositorio (ahujasid/blender-mcp) y actívalo dentro de Blender.",
            "2. Arranca el servidor MCP con uvx mcp-for-blender y las variables de «entorno»; no uses su instalador curl | sh.",
            "3. Deja el socket en 127.0.0.1, nunca en 0.0.0.0, y comprueba el puerto 9876 antes de conectar un agente.",
            "4. Revisa la configuración candidata y acéptala a mano en tu cliente MCP; nadie la escribe por ti.",
        ],
        "entorno": seguro,
        "configuracion": {"mcpServers": {"blender": {"command": "uvx", "args": ["mcp-for-blender"], "env": seguro}}},
        "avisos": [
            "El complemento es MIT; respeta su licencia y cita el proyecto. Hunyuan3D (Tencent) excluye la Unión Europea: no lo uses.",
            "La telemetría va apagada con DISABLE_TELEMETRY=true y el modo seguro filtra operaciones peligrosas con BLENDER_MCP_SAFE_MODE=1.",
            "execute_blender_code no se expone a ningún agente: solo una persona delante de la pantalla puede confirmarla.",
        ],
        "requiere_aprobacion": True,
    }

def _sin_absolutas(valor):
    if isinstance(valor, dict):
        return {k: _sin_absolutas(v) for k, v in valor.items() if not _clave_secreta(str(k))}
    if isinstance(valor, list):
        return [_sin_absolutas(v) for v in valor]
    if isinstance(valor, str) and (valor.startswith("/") or re.match(r"^[A-Za-z]:[\\/]", valor)):
        return Path(valor).name
    return valor

def escribir_candidato(plan: dict[str, object], raiz) -> Path | None:
    """Guarda el plan como candidato (permisos 600); nunca toca la configuración real."""
    destino = Path(raiz).expanduser() / CANDIDATO
    try:
        destino.parent.mkdir(parents=True, exist_ok=True)
        tmp = destino.with_name(destino.name + ".tmp")
        tmp.write_text(json.dumps(_sin_absolutas(plan), ensure_ascii=False, indent=2, sort_keys=True), encoding="utf-8")
        os.chmod(tmp, 0o600)
        os.replace(tmp, destino)
        return destino
    except OSError:
        return None
