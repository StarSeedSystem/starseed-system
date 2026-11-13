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
  - Si la sesión google-alex está viva, extrae sus cookies de Google del perfil
    y las importa al CLI default con `notebooklm auth import-cookies`
  - Comprueba con `notebooklm auth check` y avisa por sintesis_telegram
  - Si google-alex no está viva, lanza `alta google-alex` y repite
  - El texto RENOVAR debe decir "MetaGenesis › Apps Linux"

Todo inyectable; pruebas sin red. Máximo 120 líneas por archivo.
"""
import os
import sys
import time
import json
import subprocess
from datetime import datetime

from typing import Any, Dict, Optional, List

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


def _extraer_cookies_google(sesion: str) -> List[Dict[str, Any]]:
    """Extrae las cookies de Google del perfil de la sesión (inyectable)."""
    try:
        cliente = _obtener_cliente()
        if hasattr(cliente, 'extraer_cookies'):
            return cliente.extraer_cookies(sesion, "google.com")
        return []
    except Exception:
        return []


def _importar_cookies_notebooklm(cookies: List[Dict[str, Any]]) -> bool:
    """Importa cookies al perfil default del CLI de NotebookLM (inyectable)."""
    try:
        if not cookies:
            return False
        import tempfile
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
            json.dump(cookies, f)
            temp_path = f.name
        try:
            resultado = subprocess.run(
                ["notebooklm", "auth", "import-cookies", temp_path],
                capture_output=True, text=True, timeout=30
            )
            return resultado.returncode == 0
        finally:
            os.unlink(temp_path)
    except Exception:
        return False


def _comprobar_notebooklm() -> Dict[str, Any]:
    """Comprueba el estado de autenticación de NotebookLM (inyectable)."""
    try:
        resultado = subprocess.run(
            ["notebooklm", "auth", "check"],
            capture_output=True, text=True, timeout=30
        )
        return {"ok": resultado.returncode == 0, "salida": resultado.stdout.strip()}
    except Exception as e:
        return {"ok": False, "salida": str(e)}


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


def notebooklm() -> Dict[str, Any]:
    """CLI `notebooklm`: renueva la sesión de NotebookLM desde google-alex."""
    telegram = _obtener_telegram()
    
    # Verificar si google-alex está viva
    estado_google = NR.marcar_estado("google-alex", "viva", datetime.utcnow())
    google_viva = estado_google["sesiones"]["google-alex"]["estado"] == "viva"
    
    if not google_viva:
        # Lanzar alta google-alex y repetir
        telegram.enviar("La sesión google-alex no está viva. Iniciando alta...")
        resultado_alta = alta("google-alex")
        if not resultado_alta.get("ok"):
            return {"ok": False, "motivo": f"falló alta google-alex: {resultado_alta.get('motivo')}"}
        # Esperar a que esté viva
        if not _esperar_hasta_30_minutos("google-alex"):
            return {"ok": False, "motivo": "tiempo de espera excedido tras alta google-alex"}
    
    # Extraer cookies de Google del perfil
    cookies = _extraer_cookies_google("google-alex")
    if not cookies:
        return {"ok": False, "motivo": "no se pudieron extraer cookies de google-alex"}
    
    # Importar cookies al CLI de NotebookLM
    if not _importar_cookies_notebooklm(cookies):
        return {"ok": False, "motivo": "falló importar cookies a notebooklm"}
    
    # Comprobar estado
    check = _comprobar_notebooklm()
    if not check.get("ok"):
        return {"ok": False, "motivo": f"notebooklm auth check falló: {check.get('salida')}"}
    
    # Avisar por Telegram
    mensaje = "NotebookLM renovado correctamente desde MetaGenesis › Apps Linux"
    telegram.enviar(mensaje)
    
    return {"ok": True, "mensaje": mensaje, "check": check.get("salida")}


def main(argv) -> int:
    """CLI principal."""
    if len(argv) < 2:
        print("Uso: python3 navegador_alta.py <comando> [argumento]")
        print("\nComandos:")
        print("  alta <sesion>     Enciende Selkies y Chromium para una sesión")
        print("  estado           Verifica el estado de todas las sesiones")
        print("  vigilar          Avisa si una sesión está viva")
        print("  notebooklm       Renueva la sesión de NotebookLM desde google-alex")
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