#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Puente MCP opcional de Blender (contrato `architecture/blender-3d.md` §1.6).

NO es el camino por defecto del OS: lo normal es el trabajo 3D como DATO (§4).
Esto solo prepara, con tres seguros, lo que una persona decidirá activar en su
escritorio. No instala nada, no abre puertos, no ejecuta uvx/pip/curl y nunca
escribe la configuración real de un cliente MCP: deja un candidato y una persona
lo acepta con la mano.
"""
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "taller-3d"))
import taller as T  # noqa: E402

PUERTO = 9876
HOST = "127.0.0.1"
LECTURA = ("get_scene_info", "look", "get_addon_status")
PROHIBIDAS = ("execute_blender_code", "generate_3d", "search_assets", "import_asset", "disable_telemetry", "record_trajectory_feedback")


def seguros_de(entorno=None):
    """Entorno que DEBE llevar el servidor MCP; sobrescribe cualquier valor peligroso.

    Nunca conserva variables con forma de credencial: el puente no necesita claves.
    """
    seguros = {k: v for k, v in dict(entorno or {}).items()
               if not any(p in str(k).upper() for p in ("KEY", "TOKEN", "SECRET", "PASSWORD"))}
    seguros.update(DISABLE_TELEMETRY="true", BLENDER_MCP_SAFE_MODE="1",
                   BLENDER_HOST=HOST, BLENDER_PORT=str(PUERTO))
    return seguros


def herramientas_para_agentes(lista):
    """Solo las herramientas de lectura; código libre, terceros y desconocidas quedan fuera."""
    vistas, permitidas = set(), []
    for nombre in lista or []:
        if isinstance(nombre, str) and nombre in LECTURA and nombre not in PROHIBIDAS and nombre not in vistas:
            vistas.add(nombre)
            permitidas.append(nombre)
    return permitidas


def _direcciones(texto, puerto):
    """Direcciones locales que escuchan en el puerto, según la salida de lsof o ss."""
    sufijo = ":" + str(puerto)
    return [campo.rsplit(":", 1)[0] for linea in (texto or "").splitlines()
            for campo in linea.split() if campo.endswith(sufijo)]


def puerto_solo_local(s=None, puerto=PUERTO):
    """(ok, motivo): el complemento escucha SOLO en 127.0.0.1 y en ese puerto."""
    s = s or T.Sistema()
    orden = (["lsof", "-nP", "-iTCP:%d" % puerto, "-sTCP:LISTEN"]
             if s.plataforma == "Darwin" else ["ss", "-ltn"])
    direcciones = _direcciones(s.salida(orden) or "", puerto)
    if not direcciones:
        return False, ("no hay nadie escuchando en el puerto %d: activa el complemento dentro de Blender" % puerto)
    fuera = sorted({d for d in direcciones if d != HOST})
    if fuera:
        return False, ("el puerto %d escucha en %s: ciérralo y ábrelo solo en %s" % (puerto, ", ".join(fuera), HOST))
    return True, ("el puerto %d escucha solo en %s: nadie de fuera puede alcanzarlo" % (puerto, HOST))


def plan_puente(s=None):
    """Plan explicado para una persona: qué es, por qué, cómo y qué avisos tiene.

    No ejecuta nada: solo mira el puerto y prepara la configuración candidata.
    """
    ok, motivo = puerto_solo_local(s)
    configuracion = {"mcpServers": {"blender": {
        "command": "uvx", "args": ["mcp-for-blender"], "env": seguros_de({})}}}
    return {
        "que_es": ("Qué es: un puente opcional entre un agente y Blender. El agente pide "
                   "cosas del puente y este las traduce a Blender; el OS normal no lo necesita."),
        "por_que": ("Por qué es opcional: el camino por defecto es el trabajo 3D como dato, "
                    "sin código libre. Este puente se queda en el escritorio de su dueño y "
                    "solo se activa con su visto bueno."),
        "como": [
            ("1. Instala el complemento desde su repositorio oficial de GitHub y comprueba su "
             "versión; no lo copies de un sitio cualquiera."),
            ("2. Actívalo en Blender (Editar → Preferencias → Complementos) y comprueba que el "
             "puerto %d escucha solo en %s." % (PUERTO, HOST)),
            ("3. Arranca el servidor MCP con `uvx mcp-for-blender` y el entorno de abajo; no lo "
             "dejes escuchando en ninguna otra dirección."),
            ("4. Copia la configuración candidata en tu cliente MCP y acéptala con la mano; "
             "este archivo no modifica ninguna configuración real."),
        ],
        "configuracion": configuracion,
        "herramientas": list(LECTURA),
        "avisos": [
            "Licencia MIT del puente; Blender es GPL y corre como programa aparte, nunca dentro del OS.",
            "Hunyuan3D (Tencent) excluye la UE: no usarlo desde este puente.",
            "Telemetría apagada con DISABLE_TELEMETRY=true y modo seguro con BLENDER_MCP_SAFE_MODE=1.",
            ("execute_blender_code no se expone a ningún agente: solo una persona delante de la "
             "pantalla puede confirmar código libre."),
        ],
        "estado_puerto": {"ok": ok, "motivo": motivo},
    }


def raiz_por_defecto():
    return Path(os.environ.get("STARSEED_BLENDER_RAIZ") or (Path.home() / ".starseed" / "blender-3d"))


def escribir_candidato(plan, raiz=None):
    """Guarda el plan como candidato con permisos 600. No toca ningún cliente MCP real."""
    destino = Path(raiz) if raiz else raiz_por_defecto()
    destino.mkdir(parents=True, exist_ok=True)
    ruta = destino / "puente-mcp.candidato.json"
    tmp = ruta.with_name(ruta.name + ".tmp")
    tmp.write_text(json.dumps(plan, ensure_ascii=False, indent=2, sort_keys=True), encoding="utf-8")
    os.chmod(tmp, 0o600)
    os.replace(tmp, ruta)
    return ruta


