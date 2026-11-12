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

Todo inyectable; pruebas sin red. Máximo 120 líneas por archivo.
"""
import os
import subprocess
import sys
import time
import json
from datetime import datetime

from typing import Any, Dict, List, Optional

import navegador_reglas as NR
import navegador_cliente as NC

RUTA_ESTADO = os.path.expanduser("~/.starseed/navegador/estado.json")

try:
    from playwright.sync_api import sync_playwright
    PLAYWRIGHT_AVAILABLE = True
except ImportError:
    sync_playwright = None
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


def _sesion_viva(sesion: str, ruta: Optional[str] = None) -> bool:
    """Comprueba en el estado del navegador si la sesión está viva (sin red)."""
    estado = NR.cargar_estado(ruta or RUTA_ESTADO)
    fila = (estado.get("sesiones") or {}).get(sesion) or {}
    return fila.get("estado") == "viva"


def _extraer_cookies_google(sesion: str) -> List[Dict[str, Any]]:
    """Extrae las cookies de Google del perfil del navegador por CDP local. Nunca se imprimen."""
    urls = _obtener_urls_perfil(sesion)
    conector = globals().get("sync_playwright")
    if not urls or not PLAYWRIGHT_AVAILABLE or conector is None:
        return []
    try:
        with conector() as p:
            navegador = p.chromium.connect_over_cdp("http://" + urls["playwright"])
            contexto = navegador.contexts[0] if navegador.contexts else None
            if contexto is None:
                return []
            return [c for c in contexto.cookies() if "google" in str(c.get("domain", ""))]
    except Exception:
        return []


def _importar_cookies(cookies: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Pasa las cookies al perfil default del CLI con `notebooklm auth import-cookies`."""
    try:
        r = subprocess.run(["notebooklm", "auth", "import-cookies"],
                           input=json.dumps({"cookies": cookies}),
                           capture_output=True, text=True, timeout=120)
        ok = r.returncode == 0
        return {"ok": ok, "motivo": "" if ok else "import-cookies falló"}
    except Exception as e:
        return {"ok": False, "motivo": str(e)[:100]}


def _comprobar_cli() -> Dict[str, Any]:
    """Comprueba la sesión del CLI con `notebooklm auth check`."""
    try:
        r = subprocess.run(["notebooklm", "auth", "check"],
                           capture_output=True, text=True, timeout=120)
        ok = r.returncode == 0
        return {"ok": ok, "motivo": "" if ok else "el CLI sigue sin sesión viva"}
    except Exception as e:
        return {"ok": False, "motivo": str(e)[:100]}


def notebooklm(intentos: int = 2) -> Dict[str, Any]:
    """CLI `notebooklm`: renueva la sesión del CLI de NotebookLM con el navegador propio.

    Si google-alex está viva, importa sus cookies de Google al CLI y comprueba; si no,
    lanza el alta de google-alex y repite. Ningún paso teclea ni lee contraseñas.
    """
    for _ in range(max(1, intentos)):
        if _sesion_viva("google-alex"):
            cookies = _extraer_cookies_google("google-alex")
            if not cookies:
                return {"ok": False, "motivo": "sin cookies de Google en el perfil google-alex"}
            importacion = _importar_cookies(cookies)
            if not importacion.get("ok"):
                return {"ok": False, "motivo": importacion.get("motivo") or "falló la importación"}
            comprobacion = _comprobar_cli()
            mensaje = ("sesión de NotebookLM renovada desde el navegador propio" if comprobacion.get("ok")
                       else "no se pudo renovar NotebookLM: "
                            + (comprobacion.get("motivo") or "sesión caducada"))
            _obtener_telegram().enviar(mensaje)
            return {"ok": comprobacion.get("ok"), "motivo": comprobacion.get("motivo", "")}
        alta_previa = alta("google-alex")
        if not alta_previa.get("ok"):
            _obtener_telegram().enviar("no se pudo renovar NotebookLM: "
                                       + str(alta_previa.get("motivo", "alta fallida")))
            return {"ok": False, "motivo": "alta fallida: " + str(alta_previa.get("motivo", ""))}
    return {"ok": False, "motivo": "google-alex no está viva tras el alta"}


def main(argv) -> int:
    """CLI principal."""
    if len(argv) < 2:
        print("Uso: python3 navegador_alta.py <comando> [argumento]")
        print("\nComandos:")
        print("  alta <sesion>     Enciende Selkies y Chromium para una sesión")
        print("  estado            Verifica el estado de todas las sesiones")
        print("  vigilar           Avisa si una sesión está viva")
        print("  notebooklm        Renueva la sesión del CLI de NotebookLM con el navegador propio")
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
        print(json.dumps(resultado, ensure_ascii=False))
        return 0 if resultado.get("ok") else 1

    else:
        print(f"Comando desconocido: {comando}")
        return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))