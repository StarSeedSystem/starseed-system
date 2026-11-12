#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Navegador cliente de solo lectura (NAV1112C).

Conecta por el puerto de depuración local con Playwright y ofrece SOLO:
- abrir(url): pasa por navegador_reglas.permitida
- esperar(): pausa
- desplazar(n): scrollea n veces
- extraer(selector, campos): texto y enlaces
- esqueleto(): estructura SIN textos
- cerrar(): libera sesión

No expone click, fill ni teclado. Corta navegación a dominios no permitidos.
"""
import json
import os
import re
import subprocess
import time
from typing import Any, Dict, List, Optional

try:
    from playwright.sync_api import sync_playwright
    PLAYWRIGHT_AVAILABLE = True
except ImportError:
    PLAYWRIGHT_AVAILABLE = False

CERROJOS = os.path.expanduser("~/.starseed/cerrojos")
ESTADO = os.path.expanduser("~/.starseed/navegador/estado.json")
CONTENEDOR = os.path.expanduser("~/starseed/nodo/navegador/compose-navegador.yml")

_tomado = False
_page: Optional[Any] = None
_browser: Optional[Any] = None
_contenedor_activo = False


def _estado_sesion() -> Dict:
    """Carga el estado de las sesiones desde el archivo."""
    if not os.path.exists(ESTADO):
        return {}
    with open(ESTADO, "r", encoding="utf-8") as f:
        return json.load(f)


def _pid_vivo(pid: int) -> bool:
    """Comprueba si un PID está vivo (funciona en Linux y macOS)."""
    try:
        os.kill(pid, 0)
        return True
    except (ProcessLookupError, OSError):
        return False


def _tomar_cerrojo(caduca_s: int = 600) -> bool:
    """Toma un cerrojo para una sesión a la vez. Devuelve True si se tomó."""
    global _tomado
    lock_file = os.path.join(CERROJOS, "navegador.lock")
    os.makedirs(CERROJOS, exist_ok=True)

    for _ in range(5):
        try:
            fd = os.open(lock_file, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            os.write(fd, f"{os.getpid()}\n".encode("ascii"))
            os.close(fd)
            _tomado = True
            return True
        except FileExistsError:
            try:
                with open(lock_file, "r", encoding="utf-8") as f:
                    contenido = f.read().strip()
                try:
                    pid_anterior = int(contenido) if contenido.isdigit() else 0
                except ValueError:
                    pid_anterior = 0
            except (FileNotFoundError, OSError):
                return False
            if pid_anterior > 0 and _pid_vivo(pid_anterior):
                return False
            try:
                os.unlink(lock_file)
            except FileNotFoundError:
                pass
        except OSError:
            return False
    return False


def _soltar_cerrojo() -> None:
    """Libera el cerrojo."""
    global _tomado
    lock_file = os.path.join(CERROJOS, "navegador.lock")
    try:
        os.unlink(lock_file)
    except FileNotFoundError:
        pass
    _tomado = False


def _iniciar_sesion() -> None:
    """Enciende el contenedor y conecta Playwright."""
    global _browser, _page, _contenedor_activo

    if _page is not None:
        return

    estado = _estado_sesion()
    if not estado.get("viva"):
        raise RuntimeError("No hay sesión activa")

    if not PLAYWRIGHT_AVAILABLE:
        raise RuntimeError("Playwright no disponible")

    puerto = estado.get("puerto_debug", 9222)
    with sync_playwright() as p:
        _browser = p.chromium.connect(f"http://127.0.0.1:{puerto}")
        _page = _browser.new_page()
        _contenedor_activo = True


def _detener_contenedor() -> None:
    """Detiene el contenedor Docker."""
    global _contenedor_activo
    subprocess.run(
        ["docker", "compose", "-f", CONTENEDOR, "stop"],
        capture_output=True, cwd=os.path.dirname(CONTENEDOR)
    )
    _contenedor_activo = False


def abrir(url: str) -> None:
    """Abre una URL si está permitida por navegador_reglas.permitida."""
    if not _tomar_cerrojo():
        raise RuntimeError("Sesión ya en uso por otro proceso")

    try:
        import navegador_reglas as NR
        if not NR.permitida(NR.obtener_estado_actual(ESTADO).get("sesion"), url):
            raise ValueError(f"URL no permitida: {url}")
    except ImportError:
        estado = _estado_sesion()
        dominio = url.split("://", 1)[-1].split("/", 1)[0]
        dominios_permitidos = [
            "www.youtube.com", "google.com", "notebooklm.google.com",
            "www.instagram.com", "myactivity.google.com", "gemini.google.com"
        ]
        if not any(d in dominio for d in dominios_permitidos):
            raise ValueError(f"URL no permitida: {url}")

    _iniciar_sesion()
    _page.goto(url)


def esperar(segundos: float = 1.0) -> None:
    """Espera el tiempo requerido."""
    if _page is not None:
        _page.wait_for_timeout(segundos * 1000)
    else:
        time.sleep(segundos)


def desplazar(n: int = 1) -> None:
    """Scrollea n veces hacia abajo."""
    if _page is None:
        raise RuntimeError("Browser no conectado")
    for _ in range(n):
        _page.evaluate("window.scrollBy(0, document.body.scrollHeight)")
        time.sleep(0.5)


def extraer(selector: str, campos: List[str]) -> List[Dict[str, Any]]:
    """Extrae texto y enlaces del selector. Devuelve lista de dicts con los campos."""
    if _page is None:
        raise RuntimeError("Browser no conectado")

    html_str = _page.content()
    resultados = []

    if selector.startswith('.'):
        clase = selector[1:]
        patron = re.compile(
            r'<a[^>]*class="[^"]*\b' + re.escape(clase) + r'\b[^"]*"[^>]*>',
            re.IGNORECASE
        )
        for m in patron.finditer(html_str):
            pos = m.end()
            href_match = re.search(r'href="([^"]*)"', html_str[m.start():pos])
            if not href_match:
                href_match = re.search(r'href="([^"]*)"', html_str[:pos])
            end_tag = html_str.find('</a>', pos)
            if end_tag == -1:
                end_tag = len(html_str)
            texto = html_str[pos:end_tag]
            fila = {}
            if href_match:
                fila["href"] = href_match.group(1)
            texto_limpio = re.sub(r'<[^>]+>', '', texto).strip()
            if texto_limpio:
                fila["text"] = texto_limpio
            if fila:
                resultados.append(fila)
    elif selector.startswith('#'):
        ident = selector[1:]
        patron = re.compile(
            r'<[^>]*id="' + re.escape(ident) + r'"[^>]*>([^<]*)',
            re.IGNORECASE
        )
        for m in patron.finditer(html_str):
            texto = re.sub(r'<[^>]+>', '', m.group(1)).strip()
            if texto:
                resultados.append({"text": texto})
    else:
        patron = re.compile(
            r'<' + re.escape(selector) + r'([^>]*)>([^<]*)',
            re.IGNORECASE
        )
        for m in patron.finditer(html_str):
            fila = {}
            href_match = re.search(r'href="([^"]*)"', m.group(1) or '')
            if href_match:
                fila["href"] = href_match.group(1)
            texto = re.sub(r'<[^>]+>', '', m.group(2) or '').strip()
            if texto:
                fila["text"] = texto
            if fila:
                resultados.append(fila)

    return resultados


def esqueleto() -> str:
    """Devuelve la estructura de la página SIN textos."""
    if _page is None:
        raise RuntimeError("Browser no conectado")

    html_str = _page.body.inner_html()

    html_str = re.sub(r'<pre[^>]*>.*?</pre>', '', html_str, flags=re.DOTALL)
    html_str = re.sub(r'<script[^>]*>.*?</script>', '', html_str, flags=re.DOTALL)
    html_str = re.sub(r'<style[^>]*>.*?</style>', '', html_str, flags=re.DOTALL)

    html_str = re.sub(r'>[^<]+<', '><', html_str)

    html_str = re.sub(r'>\s{2,}<', '><', html_str)
    html_str = re.sub(r'>\s+<', '><', html_str)

    return html_str


def cerrar() -> None:
    """Libera el cerrojo y detiene el contenedor."""
    global _page, _browser
    _soltar_cerrojo()
    if _browser:
        _browser.close()
        _page = None
        _browser = None
    if _contenedor_activo:
        _detener_contenedor()