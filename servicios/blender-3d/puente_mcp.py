#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Puente MCP opcional entre agentes y Blender (contrato architecture/blender-3d.md §1.6 · BLD1025K).

No es el camino por defecto del OS: el normal es el trabajo 3D como DATO (§4). Esto solo deja preparado,
con tres seguros, lo que una persona decidirá activar en su escritorio. Aquí nunca se arranca `uvx`, ni se
instala nada, ni se abre un puerto, ni se toca la configuración real de ningún cliente MCP.
"""
import json, os, re, subprocess, sys
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "taller-3d"))
import taller as T  # noqa: E402

PUERTO = 9876
NOMBRE_CANDIDATO = "puente-mcp.candidato.json"
LECTURA = ("get_scene_info", "look", "get_addon_status")
RETIRADAS = ("execute_blender_code", "generate_3d", "search_assets", "import_asset", "disable_telemetry", "record_trajectory_feedback")
SEGUROS = {"DISABLE_TELEMETRY": "true", "BLENDER_MCP_SAFE_MODE": "1", "BLENDER_MCP_HOST": "127.0.0.1", "BLENDER_MCP_PORT": str(PUERTO)}
SENSIBLES = ("KEY", "TOKEN", "SECRET", "PASSWORD", "PASSWD", "CREDENTIAL")
NADA_DE_FUERA = ("TELEMETRY", "HOST", "BIND", "ADDR", "PORT")
ADDR_RE = re.compile(r"(\[[0-9a-fA-F:]+\]|\*|[0-9A-Za-z_.:-]*[0-9A-Za-z_]):(\d+)(?=\s|$)")
RUTA_ABS = re.compile(r"^(?:/|[A-Za-z]:[\\/]|~[\\/])")
PASOS = (
    "Instala el complemento desde su repositorio oficial (github.com/ahujasid/blender-mcp): descarga addon.py. No uses su instalador curl | sh.",
    "En Blender: Editar > Preferencias > Complementos > Instalar desde disco, elige addon.py y actívalo.",
    "Arranca el servidor MCP con `uvx mcp-for-blender` en una terminal, con las variables de `entorno`.",
    "Comprueba el puerto con `lsof -nP -iTCP:9876 -sTCP:LISTEN` (macOS) o `ss -ltn` (Linux): solo 127.0.0.1.",
    "Copia `configuracion` en tu cliente MCP solo cuando decidas activarlo; nadie lo hace por ti.",
)
AVISOS = (
    "Licencia del puente: MIT (mcp-for-blender). Blender es GPL y sigue como programa aparte: no se copia en el OS.",
    "No uses Hunyuan3D: su licencia excluye la Unión Europea.",
    "Telemetría apagada con DISABLE_TELEMETRY=true; el contenido es opt-in, pero se apaga igual.",
    "execute_blender_code no se expone a ningún agente: solo una persona delante de la pantalla puede confirmarlo.",
    "El socket no tiene autenticación ni cifrado: por eso solo se acepta si escucha en 127.0.0.1.",
)
QUE = "Un puente OPCIONAL entre agentes y Blender: el complemento abre un socket local dentro de Blender y un servidor MCP traduce las herramientas del agente a mensajes. No es el camino por defecto del OS; el camino normal es el trabajo 3D como dato (§4), que no ejecuta código libre."
POR_QUE = "Deja que un agente consulte y mire la escena con solo tres herramientas de lectura, sin darle Python arbitrario. Sin este puente, el OS sigue haciendo todo lo 3D con el guion por lista blanca."
ACTIVACION = "Nada se activa solo: este archivo es un CANDIDATO. Una persona lo revisa, copia la configuración a su cliente MCP y arranca el servidor; el OS no toca nada real."


def seguros_de(entorno: Optional[Dict[str, str]] = None) -> Dict[str, str]:
    """Entorno que DEBE llevar el servidor MCP: telemetría apagada, modo seguro y socket solo local."""
    salida = {str(n): str(v) for n, v in dict(entorno or {}).items()
              if not any(p in str(n).upper() for p in SENSIBLES + NADA_DE_FUERA)}
    salida.update(SEGUROS)
    return salida


def herramientas_para_agentes(lista: Iterable[Any]) -> List[str]:
    """Solo las herramientas de LECTURA de la lista blanca; el resto (código libre, terceros, telemetría) fuera."""
    nombres = [(e.get("name") if isinstance(e, dict) else e) for e in list(lista or [])]
    return [n for i, n in enumerate(nombres) if n in LECTURA and n not in nombres[:i]]


def _orden_puerto(s: Any, puerto: int) -> List[str]:
    if getattr(s, "plataforma", "") == "Darwin":
        return ["lsof", "-nP", "-iTCP:%d" % puerto, "-sTCP:LISTEN"]
    return ["ss", "-ltn"]


def _hosts_escuchando(texto: str, puerto: int) -> List[str]:
    hosts = {h.strip("[]").lower() for l in (texto or "").splitlines() if "LISTEN" in l.upper()
             for h, p in ADDR_RE.findall(l) if int(p) == puerto}
    return sorted(hosts)


def puerto_solo_local(s: Any = None, puerto: int = PUERTO) -> Tuple[bool, str]:
    """Mira el socket del complemento con lsof (macOS) o ss (Linux): solo vale si escucha en 127.0.0.1."""
    s = s or T.Sistema()
    orden = _orden_puerto(s, puerto)
    try:
        r = s.ejecutar(orden, capture_output=True, text=True, timeout=10)
    except (OSError, subprocess.SubprocessError):
        return False, "No se pudo comprobar el puerto %d: falta %s en esta máquina." % (puerto, orden[0])
    hosts = _hosts_escuchando(getattr(r, "stdout", "") or "", puerto)
    if not hosts:
        return False, "Nadie escucha en el puerto %d: activa el complemento y arranca Blender." % puerto
    fuera = sorted(set(hosts) - {"127.0.0.1", "::1"})
    if fuera:
        return False, "El puerto %d escucha fuera de 127.0.0.1 (%s): átalo a local." % (puerto, ", ".join(fuera))
    return True, "El puerto %d escucha solo en 127.0.0.1: el complemento está atado a esta máquina." % puerto

def plan_puente(s: Any = None) -> Dict[str, Any]:
    """Plan explicado para una persona: qué es, por qué y cómo. No ejecuta nada ni activa nada."""
    s = s or T.Sistema()
    seguro = seguros_de({})
    return {"v": 1, "que": QUE, "por_que": POR_QUE, "pasos": list(PASOS), "entorno": seguro,
            "configuracion": {"mcpServers": {"blender": {"command": "uvx", "args": ["mcp-for-blender"], "env": seguro}}},
            "herramientas_permitidas": list(LECTURA), "herramientas_retiradas": list(RETIRADAS),
            "puerto": PUERTO, "comprobar": _orden_puerto(s, PUERTO), "avisos": list(AVISOS), "activacion": ACTIVACION}

def _problemas(valor: Any, ruta: str = "plan") -> List[str]:
    if isinstance(valor, dict):
        salida = ["clave privada en %s.%s" % (ruta, k) for k in valor if any(p in str(k).upper() for p in SENSIBLES)]
        for clave, sub in valor.items():
            salida += _problemas(sub, "%s.%s" % (ruta, clave))
        return salida
    if isinstance(valor, (list, tuple)):
        return [p for i, sub in enumerate(valor) for p in _problemas(sub, "%s[%d]" % (ruta, i))]
    return ["ruta absoluta en %s" % ruta] if isinstance(valor, str) and RUTA_ABS.match(valor.strip()) else []


def escribir_candidato(plan: Dict[str, Any], raiz: Optional[Any] = None) -> Path:
    """Guarda el plan como candidato con permisos 600. Nunca escribe la configuración real de un cliente."""
    problemas = _problemas(plan)
    if problemas:
        raise ValueError("El candidato no se escribe: " + "; ".join(problemas))
    destino = (Path(raiz) if raiz else Path.home() / ".starseed" / "blender-3d") / NOMBRE_CANDIDATO
    destino.parent.mkdir(parents=True, exist_ok=True)
    tmp = destino.with_name(destino.name + ".tmp")
    fd = os.open(str(tmp), os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as mano:
        json.dump(plan, mano, ensure_ascii=False, indent=2, sort_keys=True)
        mano.write("\n")
    os.replace(str(tmp), str(destino))
    os.chmod(str(destino), 0o600)
    return destino
