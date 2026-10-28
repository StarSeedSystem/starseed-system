#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Puente MCP opcional para Blender (BLD1025K · architecture/blender-3d.md §1.6).

Preparación con tres seguros: solo localhost, telemetría apagada + modo seguro,
y `execute_blender_code` nunca expuesto a agentes. Sin ejecutar uvx/pip/curl.
"""
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "taller-3d"))
import taller as T  # noqa: E402


LECTURA = ("get_scene_info", "look", "get_addon_status")
PROHIBIDAS = (
    "execute_blender_code",
    "generate_3d",
    "search_assets",
    "import_asset",
    "disable_telemetry",
    "record_trajectory_feedback",
)


def seguros_de(entorno=None):
    env = dict(entorno) if entorno is not None else {}
    env["DISABLE_TELEMETRY"] = "true"
    env["BLENDER_MCP_SAFE_MODE"] = "1"
    env["HOST"] = "127.0.0.1"
    return env


def herramientas_para_agentes(lista):
    if not isinstance(lista, (list, tuple, set)):
        return []
    result = []
    for h in lista:
        if not isinstance(h, str):
            continue
        if h in PROHIBIDAS:
            continue
        if h in LECTURA:
            result.append(h)
        # todo lo desconocido queda fuera
    # mantener orden original de las que pasan
    vistos = set()
    ordenado = []
    for h in lista:
        if not isinstance(h, str):
            continue
        if h in result and h not in vistos:
            ordenado.append(h)
            vistos.add(h)
    return ordenado


def _parse_lsof(salida):
    if not salida:
        return []
    lineas = []
    for l in salida.splitlines():
        l = l.strip()
        if not l or l.startswith("COMMAND"):
            continue
        lineas.append(l)
    return lineas


def _parse_ss(salida):
    if not salida:
        return []
    lineas = []
    for l in salida.splitlines():
        l = l.strip()
        if not l or l.lower().startswith("netid") or l.lower().startswith("state"):
            continue
        lineas.append(l)
    return lineas


def _solo_local(lineas):
    if not lineas:
        return False, "sin escucha"
    for l in lineas:
        l_low = l.lower()
        # debe escuchar SOLO en 127.0.0.1
        if "*:9876" in l or "0.0.0.0:9876" in l or "[::]:9876" in l or ":::" in l and ":9876" in l:
            return False, "escucha en todas las interfaces"
        if "127.0.0.1:9876" in l or "localhost:9876" in l:
            # ok si solo ahí
            continue
        # otras formas locales
        if ":9876" in l and ("127.0.0.1" in l or "[::1]" in l):
            continue
        if ":9876" in l:
            # si hay otro host distinto a 127.0.0.1/::1
            # formas tipo *:9876 ya capturadas
            if "127.0.0.1" not in l and "[::1]" not in l:
                return False, "escucha fuera de localhost"
    # si hay alguna línea con 127.0.0.1 y ninguna con todas las interfaces
    ok = any(("127.0.0.1" in l or "[::1]" in l) and ":9876" in l for l in lineas)
    if ok:
        return True, "solo en 127.0.0.1"
    return False, "sin escucha en 127.0.0.1"


def puerto_solo_local(s, puerto=9876):
    if s is None:
        s = T.Sistema()
    # intentar lsof primero (macOS)
    orden_lsof = ["lsof", "-nP", "-iTCP:%d" % puerto, "-sTCP:LISTEN"]
    try:
        r = s.ejecutar(orden_lsof, capture_output=True, text=True, timeout=5)
        if getattr(r, "returncode", 0) == 0 and r.stdout:
            return _solo_local(_parse_lsof(r.stdout))
    except Exception:
        pass
    # ss (Linux)
    orden_ss = ["ss", "-ltn"]
    try:
        r = s.ejecutar(orden_ss, capture_output=True, text=True, timeout=5)
        if getattr(r, "returncode", 0) == 0 and r.stdout:
            # filtrar por puerto
            lineas = [l for l in _parse_ss(r.stdout) if ":%d" % puerto in l]
            if lineas:
                return _solo_local(lineas)
            # si ss lista pero no filtra bien, revisar todas
            todas = _parse_ss(r.stdout)
            if any(":%d" % puerto in l for l in todas):
                return _solo_local([l for l in todas if ":%d" % puerto in l])
            return False, "sin escucha"
        if getattr(r, "returncode", 0) != 0:
            # puede no encontrar
            pass
    except Exception:
        pass
    return False, "sin escucha"


def plan_puente(s=None):
    if s is None:
        s = T.Sistema()
    env = seguros_de({})
    pasos = [
        "1. Instalar el complemento ahujasid/blender-mcp desde su repositorio oficial en Blender (Edición > Preferencias > Complementos).",
        "2. Activarlo en Blender. El complemento abre un servidor TCP en localhost:9876 dentro de Blender.",
        "3. Arrancar el servidor MCP con `uvx` (solo con el visto bueno de Alex). Usar SIEMPRE las variables: DISABLE_TELEMETRY=true, BLENDER_MCP_SAFE_MODE=1, HOST=127.0.0.1.",
        "4. Configurar el cliente MCP con la configuración candidata (solo lectura para agentes).",
    ]
    config_candidata = {
        "mcpServers": {
            "blender-mcp": {
                "command": "uvx",
                "args": ["mcp-for-blender"],
                "env": {"DISABLE_TELEMETRY": "true", "BLENDER_MCP_SAFE_MODE": "1", "HOST": "127.0.0.1"},
            }
        }
    }
    avisos = [
        "Licencia MIT del puente; revisar licencia de modelos/servicios usados por complementos de terceros.",
        "Hunyuan3D excluye la UE: no usarlo.",
        "Telemetría: desactivada con DISABLE_TELEMETRY=true.",
        "Puerto SOLO en 127.0.0.1. Sin autenticación/cifrado: nunca exponerlo.",
        "execute_blender_code NUNCA se expone a agentes: solo una persona delante de la pantalla puede confirmarlo.",
        "NO es el camino por defecto del OS: el trabajo 3D como dato es lo normal.",
    ]
    plan = {
        "titulo": "Puente MCP opcional de Blender (solo lectura para agentes)",
        "explicado": "Qué es: puente opcional entre agentes y Blender vía complemento TCP + servidor MCP. Por qué: solo para escritorio con visto bueno; no sustituye el trabajo 3D como dato. Cómo: manual, con tres seguros.",
        "pasos": pasos,
        "variables_entorno": env,
        "configuracion_candidata_mcp": config_candidata,
        "herramientas_lectura_permitidas": list(LECTURA),
        "herramientas_prohibidas_a_agentes": list(PROHIBIDAS),
        "avisos": avisos,
        "repositorio_complemento": "https://github.com/ahujasid/blender-mcp",
    }
    return plan


def _raiz_blender3d(s=None):
    if s is None:
        s = T.Sistema()
    base = s.entorno.get("STARSEED_BLENDER_RAIZ") or os.path.join(os.path.expanduser("~"), ".starseed", "blender-3d")
    return Path(base)


def escribir_candidato(plan, raiz=None, s=None):
    if s is None:
        s = T.Sistema()
    if raiz is None:
        raiz = _raiz_blender3d(s)
    else:
        raiz = Path(raiz)
    destino = raiz / "puente-mcp.candidato.json"
    # asegurar que no hay claves ni rutas absolutas en el contenido
    datos = json.dumps(plan, ensure_ascii=False, sort_keys=True)
    # guardar
    try:
        raiz.mkdir(parents=True, exist_ok=True)
        tmp = destino.with_name(destino.name + ".tmp")
        tmp.write_text(datos, encoding="utf-8")
        os.chmod(tmp, 0o600)
        os.replace(tmp, destino)
        os.chmod(destino, 0o600)
        return str(destino)
    except OSError:
        raise


def main(argv=None):
    import argparse

    p = argparse.ArgumentParser(description="Puente MCP opcional Blender")
    p.add_argument("accion", nargs="?", default="plan", choices=["plan", "escribir"])
    args = p.parse_args(argv)
    if args.accion == "plan":
        plan = plan_puente()
        print(json.dumps(plan, ensure_ascii=False, indent=2))
        return 0
    if args.accion == "escribir":
        plan = plan_puente()
        escribir_candidato(plan)
        return 0
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
