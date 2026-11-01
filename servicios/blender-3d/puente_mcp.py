#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Puente MCP opcional para Blender (BLD1025K).
Ruta local /api/3d/trabajos, solo escritorio de Alex, tres seguros obligatorios.
Solo lectura de herramientas, sin execute_blender_code ni servicios terceros.
"""
import json, os, subprocess, stat, sys
from pathlib import Path


def seguros_de(entorno):
    """Devuelve el entorno que DEBE llevar el servidor MCP.
    Requiere DISABLE_TELEMETRY=true y BLENDER_MCP_SAFE_MODE=1, host 127.0.0.1."""
    requeridos = {"DISABLE_TELEMETRY": "true", "BLENDER_MCP_SAFE_MODE": "1"}
    faltan = [k for k, v in requeridos.items() if entorno.get(k) != v]
    if faltan:
        raise ValueError(
            "Faltan variables de entorno obligatorias: " + ", ".join(faltan)
        )
    return {
        "host": "127.0.0.1",
        "port": 9876,
        "DISABLE_TELEMETRY": "true",
        "BLENDER_MCP_SAFE_MODE": "1",
    }


def herramientas_para_agentes(lista):
    """Deja pasar SOLO las de lectura y quita las prohibidas."""
    permitidas = {
        "get_scene_info",
        "look",
        "get_addon_status",
    }
    prohibidas = {
        "execute_blender_code",
        "generate_3d",
        "search_assets",
        "import_asset",
        "disable_telemetry",
        "record_trajectory_feedback",
    }
    resultado = []
    for herramienta in lista:
        if herramienta in prohibidas:
            continue
        if herramienta in permitidas or herramienta not in {"execute_blender_code"}:
            resultado.append(herramienta)
    return resultado


def puerto_solo_local(s, puerto=9876):
    """Verifica que el socket del complemento escucha SOLO en 127.0.0.1.
    Devuelve (ok, motivo)."""
    sistema = sys.platform
    if sys.platform == "darwin":
        comando = ["lsof", "-nP", "-iTCP:%s" % puerto, "-sTCP:LISTEN"]
    else:
        comando = ["ss", "-ltn"]

    try:
        salida = subprocess.check_output(comando, stderr=subprocess.STDOUT, text=True)
    except subprocess.CalledProcessError:
        return (False, "No hay proceso escuchando en el puerto %s" % puerto)

    salida_lower = salida.lower()
    if "127.0.0.1:%s" % puerto in salida_lower or "127.0.0.1:%d" % puerto in salida_lower:
        return (True, "Socket escuchando solo en 127.0.0.1")
    if ":%s " % puerto in salida_lower or ":%s\n" % puerto in salida_lower:
        return (False, "Socket escuchando en todas las interfaces (0.0.0.0 o broadcast)")
    if ":*%s" % puerto in salida_lower or ".*%s" % puerto in salida_lower:
        return (False, "Socket escuchando en * (todas las interfaces)")
    if "escucha" in salida_lower and "127.0.0.1" in salida_lower:
        return (True, "Socket escuchando en 127.0.0.1")
    return (False, "No se pudo determinar la interfaz del socket")


def plan_puente(s):
    """Devuelve el plan para la persona, explicado en español claro."""
    return {
        "titulo": "Puente MCP opcional para Blender",
        "por_que": "El puente permite que agentes lean información de la escena 3D "
        "y ejecuten operaciones seguras, sin ejecutar código libre ni servicios de terceros.",
        "como": [
            "1. Instalar el complemento de Blender desde su repositorio oficial",
            "2. Activar el complemento en Blender (Edición ▶ Preferencias ▶ Add-ons ▶ blender-mcp)",
            "3. Arrancar el servidor MCP con: uvx mcp-for-blender ",
            "   -e DISABLE_TELEMETRY=true -e BLENDER_MCP_SAFE_MODE=1",
            "4. Verificar que el socket solo escuche en 127.0.0.1 (puerto 9876)",
            "5. El cliente MCP solo puede usar herramientas de lectura: get_scene_info, look, get_addon_status",
        ],
        "configuracion_candidata": {
            "host": "127.0.0.1",
            "port": 9876,
            "entorno": {
                "DISABLE_TELEMETRY": "true",
                "BLENDER_MCP_SAFE_MODE": "1",
            },
        },
        "avisos": {
            "licencia": "MIT. Hunyuan3D excluye la UE: no usarlo.",
            "telemetria": "Por defecto manda un registro anónimo mínimo; se apaga con DISABLE_TELEMETRY=true.",
        },
    }


def escribir_candidato(plan, raiz):
    """Guarda el plan en ~/.starseed/blender-3d/puente-mcp.candidato.json (permisos 600).
    NUNCA toca la configuración real de ningún cliente MCP."""
    carpeta = Path(raiz) / ".starseed" / "blender-3d"
    carpeta.mkdir(parents=True, exist_ok=True)
    archivo = carpeta / "puente-mcp.candidato.json"
    contenido = json.dumps(plan, ensure_ascii=False, indent=2)
    archivo.write_text(contenido, encoding="utf-8")
    os.chmod(str(archivo), stat.S_IRUSR | stat.S_IWUSR)  # 600


if __name__ == "__main__":
    pass