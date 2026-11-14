#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Recetas entre nodos: Mac ↔ A1 para reparar sesiones (SES1113C).

- receta_mac_a1_notebooklm: la Mac hace login --browser-cookies chrome,
  envía cookies al A1 por el canal de claves, A1 hace auth import-cookies + check.
- receta_autoservicio_mac: si la Mac está activa y hay escalado pendiente,
  abre la ventana de login (--master-token si aprobado y headless, si no --browser chrome)
  y lleva la sesión al A1.

Toda E/S inyectable para pruebas sin red.
"""
from __future__ import annotations

import json
import os
import subprocess
import tempfile
import time
from pathlib import Path
from typing import Any, Callable

STARSEED_HOME = Path.home() / ".starseed"
CANAL_CLAVES = STARSEED_HOME / "claves" / "sanador_notebooklm.json"
TMP_DIR = Path(tempfile.gettempdir()) / "starseed-sanador"
TMP_DIR.mkdir(parents=True, exist_ok=True)


def _raiz_def() -> Path:
    """Raíz del repo (calculada dinámicamente para permitir patch en tests)."""
    return Path(__file__).parent.parent.parent

# Tipos inyectables
Ejecutar = Callable[[list[str], int], tuple[int, str]]
EnviarCanal = Callable[[dict[str, Any]], dict[str, Any]]
RecibirCanal = Callable[[], dict[str, Any] | None]
AhoraFn = Callable[[], float]
LogFn = Callable[[str], None]


def _ejecutar_defecto(argv: list[str], timeout: int = 30) -> tuple[int, str]:
    try:
        r = subprocess.run(argv, capture_output=True, text=True, timeout=timeout)
        return r.returncode, (r.stdout or "") + (r.stderr or "")
    except subprocess.TimeoutExpired:
        return 124, "timeout"
    except Exception as e:
        return 1, str(e)


def _leer_json(ruta: Path, defecto=None):
    try:
        with open(ruta, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return defecto


def _escribir_atomico(ruta: Path, datos):
    ruta.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=ruta.parent, prefix=".tmp_")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(datos, f, ensure_ascii=False, indent=1)
            f.write("\n")
        os.replace(tmp, ruta)
    except BaseException:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise


def _sanitize_cookies(cookies: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Quita campos sensibles antes de enviar por el canal."""
    campos_permitidos = {"name", "value", "domain", "path", "expires", "httpOnly", "secure", "sameSite"}
    return [{k: v for k, v in c.items() if k in campos_permitidos} for c in cookies]


# ─────────────────────────────── Receta Mac → A1 ───────────────────────────────

def receta_mac_a1_notebooklm(
    *,
    ejecutar: Ejecutar = _ejecutar_defecto,
    enviar_canal: EnviarCanal | None = None,
    ahora: AhoraFn = time.time,
    log: LogFn = print,
    **_ignorados,
) -> dict[str, Any]:
    """Ejecuta en la Mac: login con cookies de Chrome y envía al A1 por el canal de claves.

    1. notebooklm login --browser-cookies chrome --account alexbordongarrigos@gmail.com --storage <tmp>
    2. Lee el storage_state.json generado
    3. Envía por el canal de claves (mismo que usa claves.py)
    4. Borra el tmp siempre

    Devuelve {"ok": True, "detalle": "..."} o {"ok": False, "motivo": "..."}.
    """
    tmp_storage = TMP_DIR / f"storage_state_{int(ahora()*1000)}.json"
    # Crear archivo vacío con permisos 600 antes de que lo escriba notebooklm
    tmp_storage.write_text("{}")
    tmp_storage.chmod(0o600)

    try:
        # 1. Login en la Mac con cookies de Chrome
        log(f"[sanador_nodos] Iniciando login en Mac con cookies de Chrome...")
        rc, salida = ejecutar([
            "notebooklm", "login",
            "--browser-cookies", "chrome",
            "--account", "alexbordongarrigos@gmail.com",
            "--storage", str(tmp_storage)
        ], timeout=120)

        if rc != 0:
            return {"ok": False, "motivo": f"login falló: {salida[:300]}"}

        # 2. Verificar que se generó el storage_state
        if not tmp_storage.exists():
            return {"ok": False, "motivo": "no se generó storage_state.json"}

        # 3. Leer cookies y enviar por canal de claves
        storage = _leer_json(tmp_storage, {})
        cookies = storage.get("cookies", [])
        if not cookies:
            return {"ok": False, "motivo": "storage_state sin cookies"}

        cookies_limpio = _sanitize_cookies(cookies)
        payload = {
            "tipo": "notebooklm_cookies",
            "cuenta": "alexbordongarrigos@gmail.com",
            "cookies": cookies_limpio,
            "ts": ahora(),
        }

        if enviar_canal:
            resp = enviar_canal(payload)
            if not resp.get("ok"):
                return {"ok": False, "motivo": f"canal de claves: {resp.get('motivo', 'error')}"}
        else:
            # Fallback: escribir archivo local que el A1 puede leer por SSH/rsync
            CANAL_CLAVES.parent.mkdir(parents=True, exist_ok=True)
            _escribir_atomico(CANAL_CLAVES, payload)
            log(f"[sanador_nodos] Cookies escritas en {CANAL_CLAVES}")

        log(f"[sanador_nodos] Cookies enviadas al A1 ({len(cookies_limpio)} cookies)")
        return {"ok": True, "detalle": f"cookies enviadas al A1 ({len(cookies_limpio)} cookies)"}

    finally:
        # 4. Borrar tmp siempre
        try:
            if tmp_storage.exists():
                tmp_storage.unlink()
                log(f"[sanador_nodos] Tmp borrado: {tmp_storage}")
        except OSError:
            pass


# ─────────────────────────────── Receta A1: importar cookies ───────────────────────────────

def receta_a1_importar_cookies(
    *,
    ejecutar: Ejecutar = _ejecutar_defecto,
    recibir_canal: RecibirCanal | None = None,
    log: LogFn = print,
    **_ignorados,
) -> dict[str, Any]:
    """Ejecuta en el A1: recibe cookies del canal de claves e importa a notebooklm.

    1. Lee payload del canal de claves
    2. Escribe storage_state.json temporal
    3. notebooklm auth import-cookies <tmp>
    4. notebooklm auth check
    5. Borra tmp

    Devuelve {"ok": True, "detalle": "..."} o {"ok": False, "motivo": "..."}.
    """
    payload = None

    if recibir_canal:
        payload = recibir_canal()
    else:
        # Fallback: leer archivo local
        if CANAL_CLAVES.exists():
            payload = _leer_json(CANAL_CLAVES)

    if not payload or payload.get("tipo") != "notebooklm_cookies":
        return {"ok": False, "motivo": "sin payload válido en canal de claves"}

    cookies = payload.get("cookies", [])
    if not cookies:
        return {"ok": False, "motivo": "payload sin cookies"}

    # Escribir storage_state temporal para import-cookies
    tmp_import = TMP_DIR / f"import_{int(time.time()*1000)}.json"
    try:
        _escribir_atomico(tmp_import, {"cookies": cookies})
        tmp_import.chmod(0o600)

        log(f"[sanador_nodos] Importando cookies en A1...")

        # import-cookies
        rc, salida = ejecutar(["notebooklm", "auth", "import-cookies", str(tmp_import)], timeout=60)
        if rc != 0:
            return {"ok": False, "motivo": f"import-cookies falló: {salida[:300]}"}

        # auth check
        rc, salida = ejecutar(["notebooklm", "auth", "check"], timeout=30)
        if rc != 0:
            return {"ok": False, "motivo": f"auth check falló tras import: {salida[:300]}"}

        log(f"[sanador_nodos] Cookies importadas y sesión verificada en A1")
        return {"ok": True, "detalle": "cookies importadas y sesión verificada en A1"}

    finally:
        try:
            if tmp_import.exists():
                tmp_import.unlink()
        except OSError:
            pass


# ─────────────────────────────── Receta autoservicio Mac ───────────────────────────────

def receta_autoservicio_mac(
    *,
    ejecutar: Ejecutar = _ejecutar_defecto,
    log: LogFn = print,
    **_ignorados,
) -> dict[str, Any]:
    """Ejecuta en la Mac cuando está activa y hay escalado pendiente.

    Abre la ventana de login:
    - Si hay token maestro aprobado (aprobaciones.json): notebooklm login --master-token ...
    - Si no: notebooklm login --browser chrome --account alexbordongarrigos@gmail.com

    Luego lleva la sesión al A1 (llama a receta_mac_a1_notebooklm internamente).

    Devuelve {"ok": True, "detalle": "..."} o {"ok": False, "motivo": "..."}.
    """
    # Verificar si hay token maestro aprobado
    aprobaciones = _leer_json(_raiz_def() / "starseed_memory_root" / "salud" / "aprobaciones.json", {})
    tiene_master = aprobaciones.get("notebooklm_master_token", False)

    if tiene_master:
        log("[sanador_nodos] Token maestro aprobado: usando --master-token")
        rc, salida = ejecutar([
            "notebooklm", "login",
            "--master-token",
            "--account", "alexbordongarrigos@gmail.com",
        ], timeout=120)
    else:
        log("[sanador_nodos] Sin token maestro: usando --browser chrome")
        rc, salida = ejecutar([
            "notebooklm", "login",
            "--browser", "chrome",
            "--account", "alexbordongarrigos@gmail.com",
        ], timeout=120)

    if rc != 0:
        return {"ok": False, "motivo": f"login autoservicio falló: {salida[:300]}"}

    # Tras login exitoso, enviar cookies al A1
    return receta_mac_a1_notebooklm(ejecutar=ejecutar, log=log)


# ─────────────────────────────── CLI ───────────────────────────────

def main(argv: list[str] | None = None, salida=None, **deps) -> int:
    """CLI para pruebas y uso manual.

    Comandos:
      mac-a1        Ejecuta receta Mac→A1 (en la Mac)
      a1-import     Ejecuta receta A1 import (en el A1)
      autoservicio  Ejecuta receta autoservicio (en la Mac)
    """
    import sys
    argv = list(argv) if argv is not None else sys.argv[1:]
    salida = salida or sys.stdout

    if not argv:
        salida.write(
            "Uso: python3 sanador_nodos.py <comando>\n"
            "Comandos:\n"
            "  mac-a1        Login en Mac con cookies Chrome y envía al A1\n"
            "  a1-import     Importa cookies en A1 desde canal de claves\n"
            "  autoservicio  Login autoservicio en Mac (master-token o browser) y envía al A1\n"
        )
        return 0

    cmd = argv[0]

    if cmd == "mac-a1":
        r = receta_mac_a1_notebooklm(**deps)
    elif cmd == "a1-import":
        r = receta_a1_importar_cookies(**deps)
    elif cmd == "autoservicio":
        r = receta_autoservicio_mac(**deps)
    else:
        salida.write(f"Comando desconocido: {cmd}\n")
        return 2

    if r.get("ok"):
        salida.write(f"✓ {r.get('detalle', 'ok')}\n")
        return 0
    else:
        salida.write(f"✗ {r.get('motivo', 'error')}\n")
        return 1


if __name__ == "__main__":
    import sys
    sys.exit(main())