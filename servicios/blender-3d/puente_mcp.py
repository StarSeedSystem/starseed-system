#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Puente MCP opcional de Blender (contrato `architecture/blender-3d.md` §1.6, tarea BLD1025K).

No es el camino por defecto (el normal es el trabajo 3D como dato, §4): SOLO PREPARA lo que
una persona activa con la mano en su escritorio, con tres seguros obligatorios —telemetría
apagada, modo seguro y socket SOLO en 127.0.0.1— y con `execute_blender_code` jamás expuesta
a un agente. No ejecuta `uvx`, `pip` ni `curl`, no abre puertos y nunca toca la configuración
real de ningún cliente MCP: deja el plan como CANDIDATO (permisos 600) y la persona decide.
"""
import json, os, platform, re, subprocess
from pathlib import Path

VERSION = 1
PUERTO = 9876
HOST_SOLO_LOCAL = "127.0.0.1"
HERRAMIENTAS_LECTURA = ("get_scene_info", "look", "get_addon_status")
PROHIBIDAS = ("execute_blender_code", "generate_3d", "search_assets", "import_asset",
              "disable_telemetry", "record_trajectory_feedback")
SEGUROS = {"DISABLE_TELEMETRY": "true", "BLENDER_MCP_SAFE_MODE": "1",
           "BLENDER_MCP_HOST": HOST_SOLO_LOCAL, "BLENDER_MCP_PORT": str(PUERTO)}
RE_DIRECCION = re.compile(r"(?P<host>\*|\d{1,3}(?:\.\d{1,3}){3}|\[[0-9a-fA-F:]+\]):(?P<puerto>\d+)")

class Sistema:
    """Lo que toca la máquina, inyectable para las pruebas (subprocesos simulados)."""

    def __init__(self, plataforma="", ejecutar=None, entorno=None):
        self.plataforma = plataforma or platform.system()
        self.ejecutar = ejecutar if ejecutar is not None else subprocess.run
        self.entorno = os.environ if entorno is None else entorno

    def salida(self, orden, plazo=5):
        """stdout de una orden corta, o None si falla. Solo inspección; nunca instala nada."""
        try:
            r = self.ejecutar(orden, capture_output=True, text=True, timeout=plazo)
        except Exception:
            return None
        return r.stdout if getattr(r, "returncode", 1) == 0 else None

def seguros_de(entorno):
    """El entorno que DEBE llevar el servidor MCP: los tres seguros van FORZADOS."""
    resultado = dict(entorno or {})
    resultado.update(SEGUROS)
    return resultado

def herramientas_para_agentes(lista):
    """Solo herramientas de lectura; ni código libre ni servicios de terceros ni lo desconocido."""
    presentes = set(lista or [])
    return [h for h in HERRAMIENTAS_LECTURA if h in presentes]

def puerto_solo_local(s, puerto=PUERTO):
    """(ok, motivo): el socket del complemento debe escuchar SOLO en 127.0.0.1."""
    orden = (["lsof", "-nP", "-iTCP:%d" % puerto, "-sTCP:LISTEN"] if s.plataforma == "Darwin"
             else ["ss", "-ltn"])
    salida = s.salida(orden) or ""
    hallados = [m.group("host") for m in RE_DIRECCION.finditer(salida)
                if int(m.group("puerto")) == puerto]
    if not hallados:
        return False, ("sin escucha en el puerto %d: el complemento no está activo en Blender"
                       % puerto)
    abiertos = sorted({h for h in hallados if h != HOST_SOLO_LOCAL})
    if abiertos:
        return False, ("el complemento escucha abiertamente en %s y el socket no lleva "
                       "autenticación ni cifrado: cualquiera que alcance el puerto ejecutaría "
                       "código en Blender" % ", ".join(abiertos))
    return True, "escucha solo en 127.0.0.1"

def _config_cliente():
    """Candidato de configuración para el cliente MCP de la persona (no se aplica sola)."""
    return {"mcpServers": {"blender": {"command": "uvx", "args": ["mcp-for-blender"], "env": dict(SEGUROS)}}}

def plan_puente(s=None):
    """El plan para la persona: qué es, por qué hace falta y cómo se activa, explicado."""
    s = s or Sistema()
    comprobacion = puerto_solo_local(s)
    return {
        "que": ("Puente opcional entre un agente y Blender en TU escritorio, con el complemento "
                "ahujasid/blender-mcp (MIT): Blender abre un socket local y un servidor MCP traduce las herramientas del agente a mensajes JSON."),
        "porque": ("El trabajo 3D del OS ya es un DATO (contrato §4) y no necesita esto: este puente añade solo una "
                   "edición interactiva directa en TU máquina, con tu visto bueno y los tres seguros obligatorios."),
        "seguros": dict(SEGUROS),
        "comprobacion_socket": {"ok": comprobacion[0], "motivo": comprobacion[1]},
        "herramientas_para_agentes": herramientas_para_agentes(PROHIBIDAS + HERRAMIENTAS_LECTURA),
        "pasos": [
            {"paso": "Instalar el complemento en tu Blender",
             "como": "Descarga `addon.py` del repositorio oficial ▹github.com/ahujasid/blender-mcp◃ y en Blender: Editar › Preferencias › Complementos › Instalar…, y actívalo."},
            {"paso": "Arrancar el servidor MCP con las variables de los seguros",
             "como": "En tu terminal: " + ", ".join("%s=%s" % kv for kv in SEGUROS.items())
                     + "; el servidor se arranca con `uvx mcp-for-blender`. El comando es solo de "
                       "ejemplo: ESTE repositorio no lo ejecuta nunca."},
            {"paso": "Comprobar el seguro 3: el socket solo en 127.0.0.1",
             "como": "Con Blender y el servidor vivos, `lsof -nP -iTCP:9876 -sTCP:LISTEN` (Mac) o "
                     "`ss -ltn` (Linux) deben enseñar SOLO 127.0.0.1:9876; si miran `0.0.0.0` o `*`, no sigas: el socket no lleva autenticación ni cifrado."},
            {"paso": "Aceptar la configuración del cliente MCP con la mano",
             "como": "Edita tú la configuración de tu cliente MCP poniendo el candidato de "
                     "`config_cliente`; el OS nunca la toca y este módulo solo deja el candidato "
                     "escrito en el disco."},
        ],
        "config_cliente": _config_cliente(),
        "avisos": [
            "Licencia del puente: MIT; la de Blender: GPL-3.0 (programa aparte, nunca enlazado).",
            "Hunyuan3D excluye la UE: no se usa; por eso `generate_3d` y los activos de terceros (Poly Haven, Sketchfab…) quedan bloqueados para los agentes.",
            "Telemetría: `DISABLE_TELEMETRY=true` va forzado; sin él el puente manda un registro anónimo de uso. El modo seguro `BLENDER_MCP_SAFE_MODE=1` filtra operaciones peligrosas.",
            "`execute_blender_code` ejecuta Python ARBITRARIO dentro de Blender: jamás se expone a un agente; solo una persona delante de la pantalla puede usarlo.",
            "El socket no lleva autenticación ni cifrado: si el seguro 3 falla, cualquier proceso local podría ejecutar código en Blender.",
        ],
    }

def escribir_candidato(plan, raiz=None):
    """Guarda el plan como CANDIDATO (permisos 600) en ~/.starseed/blender-3d; nada real."""
    base = Path(raiz).expanduser() if raiz is not None else Path("~/.starseed/blender-3d").expanduser()
    base.mkdir(parents=True, exist_ok=True)
    os.chmod(base, 0o700)
    ruta = base / "puente-mcp.candidato.json"
    tmp = base / "puente-mcp.candidato.json.tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(dict(plan or {}, version=VERSION), f, ensure_ascii=False, indent=2)
    os.chmod(tmp, 0o600)
    os.replace(tmp, ruta)
    return ruta
