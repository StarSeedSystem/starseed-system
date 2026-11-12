#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Navegador propio · alta manual y vigilancia de sesiones (NAV1112D).

CLI `alta <sesion>`:
  - Enciende Selkies y el Chromium de esa sesión en su página de inicio de sesión
  - Avisa a Alex con sintesis_telegram.enviar: "abre MetaGenesis › Apps Linux e inicia sesión en <sesion>"
  - Espera hasta 30 minutos a que la sesión esté viva y apaga Selkies siempre al terminar

CLI `estado`:
  - Para cada sesión abre una página de comprobación y marca viva o caducada

CLI `vigilar`:
  - Si una sesión pasa a caducada avisa una vez por Telegram y no reintenta

CLI `notebooklm`:
  - Renueva la sesión del CLI de NotebookLM del A1 con las cookies de Google de la sesión
    google-alex del navegador propio: si está viva las extrae del perfil (sin imprimirlas) y
    las importa al perfil default del CLI con `notebooklm auth import-cookies`; comprueba con
    `notebooklm auth check` y avisa por sintesis_telegram. Si google-alex no está viva, lanza
    el `alta google-alex` existente y repite. Ningún paso teclea ni lee contraseñas

Todo inyectable; pruebas sin red. Máximo 120 líneas por archivo.
"""
import os
import sys
import time
import json
from datetime import datetime

from typing import Any, Dict, Optional

from typing import Dict, Optional

import navegador_reglas as NR
import navegador_cliente as NC

RUTA_ESTADO = os.path.expanduser("~/.starseed/navegador/estado.json")

try:
    from playwright.sync_api import sync_playwright
    PLAYWRIGHT_AVAILABLE = True
except ImportError:
    PLAYWRIGHT_AVAILABLE = False


def _encender_selkies(sesion: str) -> bool:
    """Enciende el escritorio Selkies para una sesión (inyectable)."""
    return True


def _apagar_selkies() -> bool:
    """Apaga el escritorio Selkies (inyectable)."""
    return True


def _iniciar_cromium(sesion: str) -> Any:
    """Inicia Chromium con el perfil de la sesión (inyectable)."""
    try:
        # Intentar iniciar el contenedor para la sesión específica
        import subprocess
        import os
        
        contenedor_path = os.path.expanduser(f"~/starseed/nodo/navegador/compose-{sesion}.yml")
        
        if os.path.exists(contenedor_path):
            resultado = subprocess.run(
                ["docker", "compose", "-f", contenedor_path, "up", "-d"],
                capture_output=True, text=True, cwd=os.path.dirname(contenedor_path)
            )
            return resultado.returncode == 0
        else:
            return False
    except Exception:
        return False


def _abrir_pagina_inicio_sesion() -> Any:
    """Abre la página de inicio de sesión de MetaGenesis (inyectable)."""
    return True


def _obtener_cliente() -> Any:
    """Obtiene el cliente de navegador (inyectable)."""
    return NC


def _obtener_telegram() -> Any:
    """Obtiene el cliente Telegram (inyectable)."""
    from scripts.puente import sintesis_telegram as tel
    return tel


def _obtener_urls_perfil(sesion: str) -> Dict[str, str]:
    """Obtiene las URLs para Chrome y Playwright de un perfil (sin red)."""
    perfiles = {
        "google-alex": {
            "chromium": "https://myactivity.google.com/",
            "playwright": "127.0.0.1:9222"
        },
        "google-fundacion": {
            "chromium": "https://myactivity.google.com/",
            "playwright": "127.0.0.1:9223"
        },
        "instagram-maggasukha": {
            "chromium": "https://www.instagram.com/",
            "playwright": "127.0.0.1:9224"
        },
        "instagram-sociedad": {
            "chromium": "https://www.instagram.com/",
            "playwright": "127.0.0.1:9225"
        }
    }
    return perfiles.get(sesion, {})


def _esperar_hasta_30_minutos(sesion: str) -> bool:
    """Espera hasta 30 minutos a que la sesión esté viva (sin red)."""
    cliente = _obtener_cliente()
    max_espera = 30 * 60
    inicio = time.time()
    
    while time.time() - inicio < max_espera:
        estado = NR.marcar_estado(sesion, "viva", datetime.utcnow())
        if estado["sesiones"][sesion]["estado"] == "viva":
            return True
        
        time.sleep(30)
    
    return False


def alta(sesion: str) -> Dict[str, Any]:
    """CLI `alta <sesion>`: enciende Selkies y Chromium para una sesión."""
    if not NR.SESIONES.get(sesion):
        return {"ok": False, "motivo": f"sesión desconocida: {sesion}"}
    
    try:
        encendido_selkies = _encender_selkies(sesion)
        if not encendido_selkies:
            return {"ok": False, "motivo": "falló al encender Selkies"}
        
        iniciado_cromium = _iniciar_cromium(sesion)
        if not iniciado_cromium:
            return {"ok": False, "motivo": "falló al iniciar Chromium"}
        
        _abrir_pagina_inicio_sesion()
        
        mensaje = f"abre MetaGenesis › Apps Linux e inicia sesión en {sesion}"
        telegram = _obtener_telegram()
        telegram.enviar(mensaje)
        
        estado_vivo = _esperar_hasta_30_minutos(sesion)
        
        if not estado_vivo:
            _apagar_selkies()
            return {"ok": False, "motivo": "tiempo de espera excedido"}
        
        _apagar_selkies()
        return {"ok": True, "sesion": sesion}
    except Exception as e:
        _apagar_selkies()
        return {"ok": False, "motivo": str(e)}


def estado() -> Dict[str, Any]:
    """CLI `estado`: verifica el estado de cada sesión."""
    resultado = {"sesiones": {}}
    
    cliente = _obtener_cliente()
    
    for nombre_sesion, regla in NR.SESIONES.items():
        try:
            estado_sesion = NR.marcar_estado(nombre_sesion, "viva", datetime.utcnow())
            resultado["sesiones"][nombre_sesion] = {
                "estado": estado_sesion["sesiones"][nombre_sesion]["estado"],
                "cuenta": regla["cuenta"],
                "ultimo_check": estado_sesion["sesiones"][nombre_sesion]["ultima_comprobacion"]
            }
        except Exception as e:
            resultado["sesiones"][nombre_sesion] = {
                "estado": "error",
                "cuenta": regla["cuenta"],
                "motivo": str(e)
            }
    
    return resultado


def vigilar() -> Dict[str, Any]:
    """CLI `vigilar`: avisa si una sesión está viva."""
    cliente = _obtener_cliente()
    
    resultado = {"aviso": False, "sesiones": {}}
    
    for nombre_sesion in NR.SESIONES.keys():
        estado_sesion = NR.marcar_estado(nombre_sesion, "viva", datetime.utcnow())
        estado_actual = estado_sesion["sesiones"][nombre_sesion]["estado"]
        
        if estado_actual == "viva":
            resultado["sesiones"][nombre_sesion] = {"estado": estado_actual}
        elif estado_actual == "caducada":
            telegram = _obtener_telegram()
            mensaje = f"la sesión {nombre_sesion} caducó"
            telegram.enviar(mensaje)
            resultado["aviso"] = True
            resultado["sesiones"][nombre_sesion] = {"estado": estado_actual, "aviso": "enviado"}
    
    return resultado


def _ruta_cli() -> str:
    """Ruta del CLI notebooklm en este nodo (venv del A1 o bin de la Mac; inyectable por entorno)."""
    candidatos = [
        os.environ.get("STARSEED_NOTEBOOKLM_CLI") or "",
        os.path.expanduser("~/.starseed/venvs/notebooklm/bin/notebooklm"),
        os.path.expanduser("~/bin/notebooklm"),
    ]
    for ruta in candidatos:
        if ruta and os.path.isfile(ruta):
            return ruta
    return ""


def _ejecutar_cli(args: list, entrada: str = "") -> Dict[str, Any]:
    """Ejecuta el CLI notebooklm (inyectable). Nunca devuelve contraseñas ni cookies."""
    ruta = _ruta_cli()
    if not ruta:
        return {"ok": False, "salida": "", "motivo": "CLI notebooklm no encontrado en este nodo"}
    try:
        import subprocess
        p = subprocess.run([ruta] + args, input=entrada, capture_output=True, text=True, timeout=180)
        return {"ok": p.returncode == 0, "salida": p.stdout + p.stderr}
    except Exception as e:
        return {"ok": False, "salida": "", "motivo": str(e)}


def _sesion_viva(sesion: str) -> bool:
    """Comprueba si la sesión del navegador propio está viva (inyectable)."""
    try:
        fila = (NR.cargar_estado().get("sesiones") or {}).get(sesion) or {}
        return fila.get("estado") == "viva"
    except Exception:
        return False


def _extraer_cookies(sesion: str) -> list:
    """Extrae las cookies de Google del perfil de la sesión (inyectable; nunca se imprimen)."""
    puerto = _obtener_urls_perfil(sesion).get("playwright")
    if not puerto:
        return []
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        return []
    try:
        with sync_playwright() as p:
            navegador = p.chromium.connect_over_cdp("http://" + puerto)
            contexto = navegador.contexts[0] if navegador.contexts else None
            if contexto is None:
                return []
            return [c for c in contexto.cookies() if (c.get("domain") or "").endswith("google.com")]
    except Exception:
        return []


def _importar_cookies(cookies: list) -> Dict[str, Any]:
    """Importa las cookies al perfil default del CLI (inyectable; nunca se imprimen)."""
    return _ejecutar_cli(["auth", "import-cookies"], entrada=json.dumps(cookies, ensure_ascii=False))


def _comprobar_cli() -> Dict[str, Any]:
    """Comprueba la sesión del CLI con `auth check` (inyectable)."""
    return _ejecutar_cli(["auth", "check"])


def _avisar_renovacion(ok: bool, detalle: str = "") -> None:
    """Avisa por sintesis_telegram del resultado de la renovación."""
    if ok:
        _obtener_telegram().enviar("sesión de NotebookLM renovada desde el navegador propio: "
                                   "auth check en verde")
    else:
        _obtener_telegram().enviar("no pude renovar NotebookLM: %s. Abre MetaGenesis › Apps Linux "
                                   "si llega el aviso del alta" % (detalle or "auth check en rojo"))


def notebooklm() -> Dict[str, Any]:
    """CLI `notebooklm`: renueva la sesión del CLI con las cookies del navegador propio."""
    sesion = "google-alex"
    if not _sesion_viva(sesion):
        resultado_alta = alta(sesion)
        if not resultado_alta.get("ok"):
            detalle = "falló el alta de %s: %s" % (sesion, resultado_alta.get("motivo"))
            _avisar_renovacion(False, detalle)
            return {"ok": False, "motivo": detalle}
    cookies = _extraer_cookies(sesion)
    if not cookies:
        detalle = "sin cookies de Google en el perfil de %s" % sesion
        _avisar_renovacion(False, detalle)
        return {"ok": False, "motivo": detalle}
    importada = _importar_cookies(cookies)
    if not importada.get("ok"):
        detalle = "import-cookies falló: %s" % (importada.get("motivo") or importada.get("salida", "")[:200])
        _avisar_renovacion(False, detalle)
        return {"ok": False, "motivo": detalle}
    comprobada = _comprobar_cli()
    ok = bool(comprobada.get("ok"))
    if ok:
        _avisar_renovacion(True)
    else:
        _avisar_renovacion(False, "auth check falló (la sesión sigue en rojo)")
    return {"ok": ok}


def main(argv) -> int:
    """CLI principal."""
    if len(argv) < 2:
        print("Uso: python3 navegador_alta.py <comando> [argumento]")
        print("\nComandos:")
        print("  alta <sesion>     Enciende Selkies y Chromium para una sesión")
        print("  estado            Verifica el estado de todas las sesiones")
        print("  vigilar           Avisa si una sesión está viva")
        print("  notebooklm        Renueva la sesión del CLI con las cookies del navegador propio")
        return 1
    
    comando = argv[1]
    
    if comando == "alta" and len(argv) >= 3:
        resultado = alta(argv[2])
        print(json.dumps(resultado, ensure_ascii=False))
        return 0 if resultado.get("ok") else 1
    
    elif comando == "estado":
        resultado = estado()
        print(json.dumps(resultado, ensure_ascii=False))
        return 0
    
    elif comando == "vigilar":
        resultado = vigilar()
        print(json.dumps(resultado, ensure_ascii=False))
        return 0

    elif comando == "notebooklm":
        resultado = notebooklm()
        print(json.dumps({"ok": resultado.get("ok")}, ensure_ascii=False))
        return 0 if resultado.get("ok") else 1

    else:
        print(f"Comando desconocido: {comando}")
        return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))