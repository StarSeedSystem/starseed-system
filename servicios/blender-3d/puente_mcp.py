#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Puente MCP opcional de Blender (§1.6 del contrato `architecture/blender-3d.md`).

No es el camino por defecto del OS: lo normal es el trabajo 3D como dato (§4). Esto solo PREPARA,
con tres seguros, lo que una persona decidirá activar en su escritorio. No instala nada, no abre
puertos, no lanza `uvx` y nunca toca la configuración real de un cliente MCP: escribe un candidato
en `~/.starseed/blender-3d/`. Solo biblioteca estándar y un `Sistema` inyectable como en el taller.
"""
import json, os, platform, re, subprocess
from pathlib import Path

HOST, PUERTO = "127.0.0.1", 9876
PERMITIDAS = ("get_scene_info", "look", "get_addon_status")
PROHIBIDAS = ("execute_blender_code", "generate_3d", "search_assets", "import_asset",
              "disable_telemetry", "record_trajectory_feedback")
SEGUROS = {"DISABLE_TELEMETRY": "true", "BLENDER_MCP_SAFE_MODE": "1", "BLENDER_MCP_HOST": HOST}
SECRETAS = re.compile(r"(KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL)", re.I)

class Sistema:
    """Lo que toca la máquina, inyectable para las pruebas (subprocesos simulados)."""
    def __init__(self, ejecutar=subprocess.run, plataforma="", entorno=None):
        self.ejecutar = ejecutar
        self.plataforma = plataforma or platform.system()
        self.entorno = os.environ if entorno is None else entorno
    def salida(self, orden, timeout=5):
        """stdout de una orden corta, o None si no existe o falla."""
        try:
            r = self.ejecutar(orden, capture_output=True, text=True, timeout=timeout)
        except (OSError, subprocess.SubprocessError):
            return None
        return r.stdout if r.returncode == 0 else None

def seguros_de(entorno=None):
    """Entorno obligatorio del servidor: telemetría apagada, modo seguro y solo 127.0.0.1.

    Fuerza los tres valores aunque lleguen al revés y quita variables con pinta de clave: las
    herramientas de terceros quedan fuera, así que el puente no necesita credenciales.
    """
    limpio = {k: v for k, v in (entorno or {}).items() if not SECRETAS.search(str(k))}
    limpio.update(SEGUROS)
    return limpio

def herramientas_para_agentes(lista):
    """Solo lectura; fuera Python arbitrario, servicios de terceros y todo lo desconocido."""
    def nombre(ficha):
        return ficha.get("name", "") if isinstance(ficha, dict) else str(ficha)
    return [ficha for ficha in (lista or []) if nombre(ficha) in PERMITIDAS]

def _anfitriones(texto, puerto):
    """Direcciones locales que aparecen escuchando en ese puerto, según `lsof` o `ss`."""
    vistos, patron = set(), re.compile(r"^\[?([^\]]*?)\]?:(\d+)$")
    for linea in (texto or "").splitlines():
        for trozo in linea.split():
            m = patron.match(trozo)
            if m and int(m.group(2)) == puerto:
                vistos.add(m.group(1) or "*")
    return vistos

def puerto_solo_local(s=None, puerto=PUERTO):
    """Mira si el socket escucha SOLO en la dirección local. Devuelve (ok, motivo), sin abrir nada.

    `lsof -nP -iTCP:<puerto> -sTCP:LISTEN` en macOS y `ss -ltn` en Linux, por lista de argumentos.
    """
    s = s or Sistema()
    orden = (["lsof", "-nP", "-iTCP:%d" % puerto, "-sTCP:LISTEN"] if s.plataforma == "Darwin"
             else ["ss", "-ltn"])
    texto = s.salida(orden, timeout=5)
    if texto is None:
        return False, "no pude mirar el puerto %d (sin escucha o falta %s)" % (puerto, orden[0])
    anfitriones = _anfitriones(texto, puerto)
    if not anfitriones:
        return False, "no hay nada escuchando en el puerto %d: el complemento no está activo" % puerto
    fuera = sorted(h for h in anfitriones if h != "127.0.0.1")
    if fuera:
        return False, "el puerto %d escucha en %s, no solo en 127.0.0.1" % (puerto, ", ".join(fuera))
    return True, "el puerto %d escucha solo en 127.0.0.1" % puerto

def plan_puente(s=None):
    """Plan explicado para la persona: qué es, por qué, cómo y qué avisos tiene. No activa nada."""
    s = s or Sistema()
    ok, motivo = puerto_solo_local(s, PUERTO)
    return {
        "v": 1,
        "titulo": "Puente MCP opcional de Blender (solo con el visto bueno de Alex)",
        "que_es": "Un complemento abre un socket dentro de Blender y un servidor MCP deja a un cliente de IA leer la escena. Es un extra de escritorio, no el camino del OS.",
        "por_que": "El OS ya pide trabajos 3D como DATO validado (§4). Este puente solo sirve para explorar a mano; ningún agente ejecuta código libre por él.",
        "estado": {"activado": False, "aprobacion": "pendiente del visto bueno de Alex",
                   "puerto_ok": ok, "motivo": motivo},
        "como": [
            "1. Descarga `addon.py` del repositorio oficial github.com/ahujasid/blender-mcp, revísalo e instálalo en Blender con Editar → Preferencias → Complementos → Instalar desde disco.",
            "2. Actívalo en Blender y comprueba que el puerto 9876 escucha solo en 127.0.0.1.",
            "3. Arranca el servidor en una terminal con `uvx mcp-for-blender` y las variables de `configuracion_candidata`; sin `DISABLE_TELEMETRY=true` y `BLENDER_MCP_SAFE_MODE=1`, no lo uses.",
            "4. Copia el bloque candidato en la configuración de tu cliente MCP a mano: el OS no escribe ningún archivo de configuración real.",
            "5. Expón a los agentes solo las herramientas de lectura; `execute_blender_code` queda para una persona delante de la pantalla.",
            "No uses el instalador `curl … | sh` del repositorio: aquí no se ejecuta nada de eso.",
        ],
        "configuracion_candidata": {"mcpServers": {"blender": {
            "command": "uvx", "args": ["mcp-for-blender"], "env": seguros_de({})}}},
        "herramientas": list(PERMITIDAS),
        "herramientas_bloqueadas": list(PROHIBIDAS),
        "avisos": {
            "licencia": "El puente es MIT; Blender es GPL y corre como programa aparte, nunca dentro del paquete. Hunyuan3D excluye la UE: no usarlo.",
            "telemetria": "La telemetría viene encendida por defecto; `DISABLE_TELEMETRY=true` la apaga y este plan no la vuelve a encender.",
            "puerto": "El socket no tiene autenticación ni cifrado: si escucha fuera de 127.0.0.1, cualquiera que alcance el puerto ejecuta código en Blender.",
            "terceros": "`generate_3d`, `search_assets` e `import_asset` quedan fuera: no se contacta a nadie.",
        },
        "aceptacion": "Este archivo es un candidato. Una persona lo revisa y lo acepta con la mano; el OS no activa el puente ni toca ningún cliente MCP.",
    }

def escribir_candidato(plan, raiz=None):
    """Guarda el plan como candidato (permisos 600) y NUNCA toca la configuración real de un cliente."""
    destino = Path(raiz) if raiz else Path.home() / ".starseed" / "blender-3d"
    destino.mkdir(parents=True, exist_ok=True)
    ruta = destino / "puente-mcp.candidato.json"
    tmp = ruta.with_name(ruta.name + ".tmp")
    tmp.write_text(json.dumps(plan, ensure_ascii=False, indent=2, sort_keys=True), encoding="utf-8")
    os.chmod(tmp, 0o600)
    os.replace(tmp, ruta)
    return str(ruta)
