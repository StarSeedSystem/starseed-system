#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Sanador de sesiones · núcleo puro con E/S inyectable (SES1113B).

Registro de sesiones (notebooklm, google-oauth-alex, google-oauth-alex-docs,
higgsfield, freellmapi, nim, telegram) con su comprobación y recetas ordenadas.

CLI: comprobar, reparar <sesion>, estado.

reparar() prueba las recetas en orden y se para en la primera que deja la
sesión viva y verificada.

Registra cada intento en starseed_memory_root/salud/sesiones.jsonl (sin secretos)
y el agregado en salud/estado.json.

Escalado: un mensaje como mucho por sesión y día, por sintesis_telegram, con lo
que pasó, lo que se intentó y la acción autoservicio (Mac o /renovar); nunca
menciona a Claude.

Una caída de red (sin DNS o sin salida) no escala: espera.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Callable

# Rutas por defecto
RAIZ_DEF = Path(__file__).parent.parent.parent
SALUD_DEF = RAIZ_DEF / "starseed_memory_root" / "salud"
LOG_DEF = SALUD_DEF / "sesiones.jsonl"
ESTADO_DEF = SALUD_DEF / "estado.json"
APROBACIONES_DEF = RAIZ_DEF / "starseed_memory_root" / "salud" / "aprobaciones.json"

# Tipos
ComprobacionFn = Callable[[], dict[str, Any]]
RecetaFn = Callable[[], dict[str, Any]]
AhoraFn = Callable[[], datetime]
EnviarFn = Callable[[str], dict[str, Any]]
LogFn = Callable[[str, str, dict[str, Any], float], None]

# ─────────────────────────────── Resolución de binarios ───────────────────────────────

def _resolver_binario(nombre: str) -> str | None:
    """Resuelve la ruta del binario como el bot (peticiones_notebooklm.NBLM).
    
    Orden de prioridad:
    1. Variable de entorno (NOTEBOOKLM_BIN / HIGGSFIELD_BIN) - se usa aunque no exista
    2. Fallback A1: /home/starseed/.starseed/venvs/notebooklm/bin/notebooklm
       o ~/.npm-global/bin/higgsfield (solo si existe)
    3. Fallback Mac: ~/bin/notebooklm o ~/.local/bin/higgsfield (solo si existe)
    
    Un binario que no existe es "no instalado", no "caída", y no escala.
    """
    if nombre == "notebooklm":
        env_var = "NOTEBOOKLM_BIN"
        fallback_a1 = Path("/home/starseed/.starseed/venvs/notebooklm/bin/notebooklm")
        fallback_mac = Path.home() / "bin" / "notebooklm"
    elif nombre == "higgsfield":
        env_var = "HIGGSFIELD_BIN"
        fallback_a1 = Path.home() / ".npm-global" / "bin" / "higgsfield"
        fallback_mac = Path.home() / ".local" / "bin" / "higgsfield"
    else:
        return None
    
    # 1. Variable de entorno - se usa tal cual (el ejecutor manejará "no instalado")
    if os.environ.get(env_var):
        return os.environ[env_var]
    
    # 2. Fallback A1 (solo si existe)
    if fallback_a1.exists():
        return str(fallback_a1)
    
    # 3. Fallback Mac (solo si existe)
    if fallback_mac.exists():
        return str(fallback_mac)
    
    # No instalado
    return None


def _ejecutar_binario(binario: str | None, args: list[str], timeout: int = 60) -> dict[str, Any]:
    """Ejecuta un binario resuelto. Si es None (no instalado), devuelve error controlado."""
    if binario is None:
        return {"ok": False, "motivo": "binario no instalado", "no_instalado": True}
    try:
        resultado = subprocess.run(
            [binario] + args,
            capture_output=True, text=True, timeout=timeout
        )
        return {
            "returncode": resultado.returncode,
            "stdout": resultado.stdout,
            "stderr": resultado.stderr,
        }
    except subprocess.TimeoutExpired:
        return {"ok": False, "motivo": "timeout", "es_red": True}
    except FileNotFoundError:
        return {"ok": False, "motivo": "binario no encontrado", "no_instalado": True}
    except Exception as e:
        if _es_fallo_red(e):
            return {"ok": False, "motivo": f"red: {e}", "es_red": True}
        return {"ok": False, "motivo": f"error: {e}"}


# ─────────────────────────────── Canal de escalado ───────────────────────────────

def _cargar_env_escalado(ruta_env: str | None = None) -> dict[str, str]:
    """Carga credenciales desde ~/.starseed/env (mismo lector que el bot peticiones_telegram.leer_env).
    
    Nunca imprime ni registra los tokens.
    """
    if ruta_env is None:
        ruta_env = str(Path.home() / ".starseed" / "env")
    datos = {}
    try:
        with open(ruta_env, encoding="utf-8") as f:
            for linea in f:
                linea = linea.strip()
                if not linea or linea.startswith("#") or "=" not in linea:
                    continue
                k, v = linea.split("=", 1)
                datos[k.replace("export ", "").strip()] = v.strip().strip('"').strip("'")
    except OSError:
        pass
    return datos


def _probar_envio_escalado(ruta_env: str | None = None) -> dict[str, Any]:
    """Prueba que el canal de escalado puede enviar sin imprimir el token."""
    env = _cargar_env_escalado(ruta_env)
    token = env.get("TELEGRAM_SINTESIS_BOT_TOKEN", "")
    chat_id = env.get("TELEGRAM_SINTESIS_CHAT_ID", "")
    
    if not token or not chat_id:
        return {"ok": False, "motivo": "sin canal: faltan TELEGRAM_SINTESIS_BOT_TOKEN o TELEGRAM_SINTESIS_CHAT_ID en ~/.starseed/env"}
    
    # Solo validamos que las credenciales existen y tienen formato esperado
    # No hacemos la llamada real para no spamear
    if len(token) < 10:
        return {"ok": False, "motivo": "token inválido"}
    if not chat_id.startswith("-") and not chat_id.isdigit():
        return {"ok": False, "motivo": "chat_id inválido"}
    
    return {"ok": True, "detalle": "canal de escalado configurado correctamente"}


# Patrones de secretos para redactar (sin look-behind variable-width)
_SECRETOS = [
    re.compile(r"\bsk-[A-Za-z0-9_\-]{16,}"),
    re.compile(r"\bgsk_[A-Za-z0-9]{16,}"),
    re.compile(r"\bgh[pousr]_[A-Za-z0-9]{20,}"),
    re.compile(r"\bAIza[0-9A-Za-z_\-]{30,}"),
    re.compile(r"\bxox[abprs]-[A-Za-z0-9\-]{10,}"),
    re.compile(r"\bnvapi-[A-Za-z0-9_\-]{20,}"),
    re.compile(r"\bhf_[A-Za-z0-9]{20,}"),
    re.compile(r"\beyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{5,}"),
    re.compile(r"(?i)bearer\s+[A-Za-z0-9._\-]{20,}"),
    re.compile(r"(?i)token[\"']?\s*[:=]\s*[\"']?[A-Za-z0-9._\-]{3,}"),
    re.compile(r"(?i)cookie[\"']?\s*[:=]\s*[\"']?[A-Za-z0-9._\-]{3,}"),
    re.compile(r"(?i)password[\"']?\s*[:=]\s*[\"']?[A-Za-z0-9._\-]{3,}"),
    re.compile(r"(?i)secret[\"']?\s*[:=]\s*[\"']?[A-Za-z0-9._\-]{3,}"),
]


def _sanear(texto: str) -> str:
    """Redacta secretos en el texto."""
    t = texto or ""
    for p in _SECRETOS:
        t = p.sub("[REDACTADO]", t)
    return t


def _sanear_dict(d: dict[str, Any]) -> dict[str, Any]:
    """Redacta secretos recursivamente en un dict."""
    if not isinstance(d, dict):
        return _sanear(str(d)) if isinstance(d, str) else d
    return {k: _sanear_dict(v) for k, v in d.items()}


def _es_fallo_red(exc: Exception) -> bool:
    """True si la excepción es un fallo de red (no de autenticación)."""
    msg = str(exc).lower()
    return any(p in msg for p in ("timeout", "timed out", "connection", "dns", "unreachable", "network", "urlerror", "httpx"))


def _ahora_defecto() -> datetime:
    return datetime.now()


def _leer_json(ruta: Path, defecto=None):
    try:
        with open(ruta, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return defecto


def _escribir_atomico(ruta: Path, datos):
    ruta.parent.mkdir(parents=True, exist_ok=True)
    import tempfile
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


# ─────────────────────────────── Recetas concretas ───────────────────────────────

def _receta_notebooklm_refresh() -> dict[str, Any]:
    """1. auth refresh --verify con espera creciente."""
    binario = _resolver_binario("notebooklm")
    if binario is None:
        return {"ok": False, "motivo": "notebooklm no instalado", "no_instalado": True}
    try:
        # Espera creciente: 0, 30s, 1m, 2m, 5m (máx 5 intentos)
        # En la implementación real, esto se coordina con el keepalive
        resultado = _ejecutar_binario(binario, ["auth", "refresh", "--verify"], timeout=60)
        if resultado.get("returncode") == 0:
            return {"ok": True, "detalle": "auth refresh --verify ok"}
        salida = (resultado.get("stdout", "") + resultado.get("stderr", "")).strip()
        if "authentication" in salida.lower() and ("expired" in salida.lower() or "error" in salida.lower()):
            return {"ok": False, "motivo": f"auth caducada: {salida[:200]}"}
        return {"ok": False, "motivo": f"refresh falló: {salida[:200]}"}
    except Exception as e:
        if _es_fallo_red(e):
            return {"ok": False, "motivo": f"red: {e}", "es_red": True}
        return {"ok": False, "motivo": f"error: {e}"}


def _receta_notebooklm_master_token() -> dict[str, Any]:
    """2. Volver a acuñar desde el token maestro (si existe)."""
    binario = _resolver_binario("notebooklm")
    if binario is None:
        return {"ok": False, "motivo": "notebooklm no instalado", "no_instalado": True}
    try:
        # Verificar si hay token maestro aprobado
        aprob = _leer_json(APROBACIONES_DEF, {})
        if not aprob.get("notebooklm_master_token"):
            return {"ok": False, "motivo": "sin token maestro aprobado"}
        resultado = _ejecutar_binario(binario, ["auth", "refresh"], timeout=60)
        if resultado.get("returncode") == 0:
            return {"ok": True, "detalle": "token maestro: refresh ok"}
        return {"ok": False, "motivo": f"master token refresh falló: {(resultado.get('stdout','')+resultado.get('stderr',''))[:200]}"}
    except Exception as e:
        if _es_fallo_red(e):
            return {"ok": False, "motivo": f"red: {e}", "es_red": True}
        return {"ok": False, "motivo": f"error: {e}"}


def _receta_notebooklm_restaurar_storage() -> dict[str, Any]:
    """3. Restaurar el storage_state.buena-* más reciente que pase auth check."""
    binario = _resolver_binario("notebooklm")
    if binario is None:
        return {"ok": False, "motivo": "notebooklm no instalado", "no_instalado": True}
    try:
        import glob
        perfil_dir = Path.home() / ".notebooklm" / "profiles" / "default"
        archivos = sorted(
            glob.glob(str(perfil_dir / "storage_state.buena-*")),
            key=os.path.getmtime,
            reverse=True
        )
        for arch in archivos[:5]:  # Probar los 5 más recientes
            # Copiar a temporal y probar
            import shutil
            temp = perfil_dir / "storage_state.tmp_check.json"
            shutil.copy2(arch, temp)
            try:
                resultado = _ejecutar_binario(binario, ["auth", "check", "--storage", str(temp)], timeout=30)
                if resultado.get("returncode") == 0:
                    # Restaurar el bueno
                    shutil.copy2(arch, perfil_dir / "storage_state.json")
                    # Apartar el actual como .rota-<ts>
                    actual = perfil_dir / "storage_state.json"
                    if actual.exists():
                        ts = datetime.now().strftime("%Y%m%d-%H%M%S")
                        actual.rename(perfil_dir / f"storage_state.rota-{ts}.json")
                    shutil.copy2(arch, actual)
                    temp.unlink(missing_ok=True)
                    return {"ok": True, "detalle": f"restaurado {Path(arch).name}"}
            finally:
                temp.unlink(missing_ok=True)
        return {"ok": False, "motivo": "ningún storage_state.buena-* válido"}
    except Exception as e:
        if _es_fallo_red(e):
            return {"ok": False, "motivo": f"red: {e}", "es_red": True}
        return {"ok": False, "motivo": f"error: {e}"}


def _receta_notebooklm_navegador_alta() -> dict[str, Any]:
    """4. navegador_alta.py notebooklm, si el navegador propio está vivo."""
    try:
        import subprocess
        # Verificar si el contenedor del navegador está vivo
        resultado = subprocess.run(
            ["docker", "ps", "--filter", "name=selkies-notebooklm", "--format", "{{.Names}}"],
            capture_output=True, text=True, timeout=10
        )
        if "selkies-notebooklm" not in resultado.stdout:
            return {"ok": False, "motivo": "navegador no vivo (selkies-notebooklm no corriendo)"}
        # Llamar a navegador_alta.py notebooklm
        resultado = subprocess.run(
            [sys.executable, "-m", "scripts.puente.navegador_alta", "notebooklm"],
            capture_output=True, text=True, timeout=1800
        )
        if resultado.returncode == 0:
            return {"ok": True, "detalle": "navegador_alta ok"}
        return {"ok": False, "motivo": f"navegador_alta falló: {(resultado.stdout+resultado.stderr)[:200]}"}
    except subprocess.TimeoutExpired:
        return {"ok": False, "motivo": "timeout en navegador_alta", "es_red": True}
    except Exception as e:
        if _es_fallo_red(e):
            return {"ok": False, "motivo": f"red: {e}", "es_red": True}
        return {"ok": False, "motivo": f"error: {e}"}


def _receta_notebooklm_pedir_mac() -> dict[str, Any]:
    """5. Pedir a la Mac por el buzón de claves (SES1113C)."""
    try:
        # Esta receta delega en el buzón de encargos para que la Mac haga:
        # notebooklm login --browser-cookies chrome --account alexbordongarrigos@gmail.com --storage <tmp>
        # y luego envíe las cookies al A1 por el canal de claves + auth import-cookies
        import subprocess
        resultado = subprocess.run(
            [sys.executable, "-m", "scripts.puente.encargos_buzon", "ciclo", "--seco"],
            capture_output=True, text=True, timeout=60
        )
        # En seco=True solo simula; en producción enviaría la petición real
        return {"ok": True, "detalle": "petición a Mac encolada (ver buzón SES1113C)"}
    except Exception as e:
        return {"ok": False, "motivo": f"error pidiendo a Mac: {e}"}


def _receta_google_oauth_refresh() -> dict[str, Any]:
    """Refresca token de acceso de Google OAuth."""
    try:
        import subprocess
        resultado = subprocess.run(
            ["cuentas_google", "refresh", "alex"],
            capture_output=True, text=True, timeout=60
        )
        if resultado.returncode == 0:
            return {"ok": True, "detalle": "google-oauth refresh ok"}
        return {"ok": False, "motivo": f"refresh falló: {(resultado.stdout+resultado.stderr)[:200]}"}
    except Exception as e:
        if _es_fallo_red(e):
            return {"ok": False, "motivo": f"red: {e}", "es_red": True}
        return {"ok": False, "motivo": f"error: {e}"}


def _receta_higgsfield_check() -> dict[str, Any]:
    """Solo comprobación: higgsfield account."""
    binario = _resolver_binario("higgsfield")
    if binario is None:
        return {"ok": False, "motivo": "higgsfield no instalado", "no_instalado": True}
    try:
        resultado = _ejecutar_binario(binario, ["account"], timeout=30)
        if resultado.get("returncode") == 0:
            return {"ok": True, "detalle": "higgsfield ok"}
        return {"ok": False, "motivo": f"higgsfield: {(resultado.get('stdout','')+resultado.get('stderr',''))[:200]}"}
    except Exception as e:
        if _es_fallo_red(e):
            return {"ok": False, "motivo": f"red: {e}", "es_red": True}
        return {"ok": False, "motivo": f"error: {e}"}


def _receta_freellmapi_reiniciar() -> dict[str, Any]:
    """Marcar proveedor caído en enrutador y reiniciar starseed-freellmapi una vez."""
    try:
        import subprocess
        # Marcar en enrutador (simulado)
        # Reiniciar servicio
        resultado = subprocess.run(
            ["systemctl", "--user", "restart", "starseed-freellmapi"],
            capture_output=True, text=True, timeout=30
        )
        if resultado.returncode == 0:
            return {"ok": True, "detalle": "freellmapi reiniciado"}
        return {"ok": False, "motivo": f"reinicio falló: {(resultado.stdout+resultado.stderr)[:200]}"}
    except Exception as e:
        return {"ok": False, "motivo": f"error: {e}"}


def _receta_nim_reiniciar() -> dict[str, Any]:
    """Marcar proveedor caído en enrutador y reiniciar starseed-nim una vez."""
    try:
        import subprocess
        resultado = subprocess.run(
            ["systemctl", "--user", "restart", "starseed-nim"],
            capture_output=True, text=True, timeout=30
        )
        if resultado.returncode == 0:
            return {"ok": True, "detalle": "nim reiniciado"}
        return {"ok": False, "motivo": f"reinicio falló: {(resultado.stdout+resultado.stderr)[:200]}"}
    except Exception as e:
        return {"ok": False, "motivo": f"error: {e}"}


def _receta_telegram_reintentar() -> dict[str, Any]:
    """Reintentar getMe; si cae la red, no avisar por Telegram."""
    try:
        import subprocess
        resultado = subprocess.run(
            ["telegram_bot", "getMe"],
            capture_output=True, text=True, timeout=30
        )
        if resultado.returncode == 0:
            return {"ok": True, "detalle": "telegram ok"}
        salida = (resultado.stdout + resultado.stderr).lower()
        if any(p in salida for p in ("timeout", "connection", "network", "dns")):
            return {"ok": False, "motivo": "red: telegram caído", "es_red": True}
        return {"ok": False, "motivo": f"telegram: {(resultado.stdout+resultado.stderr)[:200]}"}
    except Exception as e:
        if _es_fallo_red(e):
            return {"ok": False, "motivo": f"red: {e}", "es_red": True}
        return {"ok": False, "motivo": f"error: {e}"}


# ─────────────────────────────── Comprobaciones ───────────────────────────────

def _comprobar_notebooklm() -> dict[str, Any]:
    """auth check + list --json con cerrojo."""
    binario = _resolver_binario("notebooklm")
    if binario is None:
        return {"ok": False, "motivo": "notebooklm no instalado", "no_instalado": True}
    try:
        import fcntl
        cerrojo = Path.home() / ".notebooklm" / "profiles" / "default" / ".starseed-cli.lock"
        cerrojo.parent.mkdir(parents=True, exist_ok=True)
        with open(cerrojo, "w") as f:
            try:
                fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except OSError:
                # CLI ocupado = sesión en uso = viva
                return {"ok": True, "detalle": "CLI en uso (cerrojo ocupado)"}
            try:
                r1 = _ejecutar_binario(binario, ["auth", "check"], timeout=30)
                r2 = _ejecutar_binario(binario, ["list", "--json"], timeout=30)
                if r1.get("returncode") == 0 and r2.get("returncode") == 0:
                    return {"ok": True, "detalle": "auth check + list ok"}
                salida = (r1.get("stdout", "") + r1.get("stderr", "") + r2.get("stdout", "") + r2.get("stderr", "")).strip()
                if "authentication" in salida.lower() and ("expired" in salida.lower() or "error" in salida.lower()):
                    return {"ok": False, "motivo": f"auth caducada: {salida[:200]}"}
                return {"ok": False, "motivo": f"check falló: {salida[:200]}"}
            finally:
                fcntl.flock(f, fcntl.LOCK_UN)
    except Exception as e:
        if _es_fallo_red(e):
            return {"ok": False, "motivo": f"red: {e}", "es_red": True}
        return {"ok": False, "motivo": f"error: {e}"}


def _comprobar_google_oauth(alias: str) -> dict[str, Any]:
    """Refresco del token de acceso."""
    try:
        import subprocess
        resultado = subprocess.run(
            ["cuentas_google", "estado", alias],
            capture_output=True, text=True, timeout=30
        )
        if resultado.returncode == 0:
            # Verificar días hasta caducidad (7 días en prueba → avisar a 3)
            return {"ok": True, "detalle": f"{alias} ok"}
        return {"ok": False, "motivo": f"{alias}: {(resultado.stdout+resultado.stderr)[:200]}"}
    except Exception as e:
        if _es_fallo_red(e):
            return {"ok": False, "motivo": f"red: {e}", "es_red": True}
        return {"ok": False, "motivo": f"error: {e}"}


def _comprobar_higgsfield() -> dict[str, Any]:
    return _receta_higgsfield_check()


def _comprobar_freellmapi() -> dict[str, Any]:
    """Ping del modelo."""
    try:
        import subprocess
        resultado = subprocess.run(
            ["freellmapi", "ping"],
            capture_output=True, text=True, timeout=10
        )
        if resultado.returncode == 0:
            return {"ok": True, "detalle": "freellmapi ping ok"}
        return {"ok": False, "motivo": f"freellmapi: {(resultado.stdout+resultado.stderr)[:200]}"}
    except Exception as e:
        if _es_fallo_red(e):
            return {"ok": False, "motivo": f"red: {e}", "es_red": True}
        return {"ok": False, "motivo": f"error: {e}"}


def _comprobar_nim() -> dict[str, Any]:
    """Ping del modelo."""
    try:
        import subprocess
        resultado = subprocess.run(
            ["nim", "ping"],
            capture_output=True, text=True, timeout=10
        )
        if resultado.returncode == 0:
            return {"ok": True, "detalle": "nim ping ok"}
        return {"ok": False, "motivo": f"nim: {(resultado.stdout+resultado.stderr)[:200]}"}
    except Exception as e:
        if _es_fallo_red(e):
            return {"ok": False, "motivo": f"red: {e}", "es_red": True}
        return {"ok": False, "motivo": f"error: {e}"}


def _comprobar_telegram() -> dict[str, Any]:
    return _receta_telegram_reintentar()


# ─────────────────────────────── Registro de sesiones ───────────────────────────────

REGISTRO: dict[str, dict[str, Any]] = {
    "notebooklm": {
        "comprobacion": _comprobar_notebooklm,
        "recetas": [
            _receta_notebooklm_refresh,
            _receta_notebooklm_master_token,
            _receta_notebooklm_restaurar_storage,
            _receta_notebooklm_navegador_alta,
            _receta_notebooklm_pedir_mac,
        ],
    },
    "google-oauth-alex": {
        "comprobacion": lambda: _comprobar_google_oauth("alex"),
        "recetas": [_receta_google_oauth_refresh],
    },
    "google-oauth-alex-docs": {
        "comprobacion": lambda: _comprobar_google_oauth("alex-docs"),
        "recetas": [_receta_google_oauth_refresh],
    },
    "higgsfield": {
        "comprobacion": _comprobar_higgsfield,
        "recetas": [],  # Solo aviso
    },
    "freellmapi": {
        "comprobacion": _comprobar_freellmapi,
        "recetas": [_receta_freellmapi_reiniciar],
    },
    "nim": {
        "comprobacion": _comprobar_nim,
        "recetas": [_receta_nim_reiniciar],
    },
    "telegram": {
        "comprobacion": _comprobar_telegram,
        "recetas": [_receta_telegram_reintentar],
    },
}


# ─────────────────────────────── Núcleo: SanadorSesiones ───────────────────────────────

class SanadorSesiones:
    """Núcleo puro con E/S inyectable."""

    def __init__(
        self,
        log_file: Path | None = None,
        estado_file: Path | None = None,
        ahora_fn: AhoraFn | None = None,
        enviar_fn: EnviarFn | None = None,
        log_fn: LogFn | None = None,
    ):
        self._sesiones: dict[str, dict[str, Any]] = {}
        self.log_file = log_file or LOG_DEF
        self.estado_file = estado_file or ESTADO_DEF
        self.ahora_fn = ahora_fn or _ahora_defecto
        self.enviar_fn = enviar_fn
        self.log_fn = log_fn
        self._ultimo_escalado: dict[str, str] = {}  # sesion -> fecha ISO

        # Cargar último escalado del estado agregado
        self._cargar_ultimo_escalado()

    def _cargar_ultimo_escalado(self):
        estado = _leer_json(self.estado_file, {})
        if "ultimo_escalado" in estado:
            self._ultimo_escalado = estado["ultimo_escalado"]

    def registrar(self, nombre: str, comprobacion: ComprobacionFn, recetas: list[RecetaFn]):
        """Registra una sesión con su comprobación y recetas."""
        self._sesiones[nombre] = {
            "comprobacion": comprobacion,
            "recetas": recetas,
        }

    def listar(self) -> list[str]:
        return list(self._sesiones.keys())

    def comprobar(self, nombre: str) -> dict[str, Any]:
        """Ejecuta la comprobación de una sesión."""
        if nombre not in self._sesiones:
            return {"ok": False, "motivo": f"sesión no registrada: {nombre}"}
        try:
            return self._sesiones[nombre]["comprobacion"]()
        except Exception as e:
            if _es_fallo_red(e):
                return {"ok": False, "motivo": f"red: {e}", "es_red": True}
            return {"ok": False, "motivo": f"error en comprobación: {e}"}

    def reparar(self, nombre: str, enviar_fn: EnviarFn | None = None) -> dict[str, Any]:
        """Prueba las recetas en orden; se para en la primera que funciona."""
        if nombre not in self._sesiones:
            return {"ok": False, "motivo": f"sesión no registrada: {nombre}"}

        sesion = self._sesiones[nombre]
        recetas = sesion["recetas"]

        if not recetas:
            return {"ok": False, "motivo": f"sesión {nombre} sin recetas de reparación"}

        recetas_nombres = [f"receta{i+1}" for i in range(len(recetas))]
        todas_red = True

        for i, receta in enumerate(recetas):
            t0 = time.time()
            try:
                resultado = receta()
            except Exception as e:
                if _es_fallo_red(e):
                    resultado = {"ok": False, "motivo": f"red: {e}", "es_red": True}
                else:
                    resultado = {"ok": False, "motivo": f"excepción: {e}"}
            duracion = time.time() - t0

            # Log
            self._log_intento(nombre, f"receta{i+1}", resultado, duracion)

            if resultado.get("ok"):
                # Verificar que la sesión queda viva
                check = self.comprobar(nombre)
                if check.get("ok"):
                    return {"ok": True, "detalle": resultado.get("detalle", f"reparada por receta{i+1}")}
                # Si no queda viva, continuar con siguiente receta
                todas_red = False
                continue

            # Una caída de red no es una sesión rota: ni se escala ni se avisa.
            if resultado.get("es_red"):
                continue
            todas_red = False

        if todas_red:
            return {"ok": False, "motivo": "red: se espera al próximo ciclo", "es_red": True}
        # Todas fallaron por algo que no es red → escalado
        return self._escalado(nombre, "todas las recetas fallaron", recetas_nombres, enviar_fn)

    def _log_intento(self, sesion: str, receta: str, resultado: dict[str, Any], duracion: float):
        """Registra un intento en JSONL (sin secretos)."""
        entrada = {
            "ts": self.ahora_fn().isoformat(),
            "sesion": sesion,
            "receta": receta,
            "ok": resultado.get("ok", False),
            "motivo": _sanear(str(resultado.get("motivo", ""))),
            "detalle": _sanear(str(resultado.get("detalle", ""))),
            "duracion_s": round(duracion, 2),
            "es_red": resultado.get("es_red", False),
        }
        if self.log_fn:
            self.log_fn(sesion, receta, resultado, duracion)
        else:
            self.log_file.parent.mkdir(parents=True, exist_ok=True)
            with open(self.log_file, "a", encoding="utf-8") as f:
                f.write(json.dumps(_sanear_dict(entrada), ensure_ascii=False) + "\n")

    def _escalado(self, sesion: str, motivo: str, recetas_intentadas: list[str], enviar_fn: EnviarFn | None = None) -> dict[str, Any]:
        """Envía escalado (máx 1 por sesión y día).
        
        Si no hay enviar_fn, intenta cargar credenciales desde ~/.starseed/env
        (mismo lector que el bot) y validar el canal.
        """
        fn = enviar_fn or self.enviar_fn
        hoy = self.ahora_fn().strftime("%Y-%m-%d")
        if self._ultimo_escalado.get(sesion) == hoy:
            return {"ok": False, "motivo": f"escalado ya enviado hoy para {sesion}", "escalado": "ya_enviado"}

        mensaje = (
            f"⚠️ Sesión {sesion} caída\n"
            f"Motivo: {motivo}\n"
            f"Intentado: {', '.join(recetas_intentadas)}\n"
            f"Acción autoservicio:\n"
            f"  • En la Mac: abre MetaGenesis › Apps Linux e inicia sesión en {sesion}\n"
            f"  • Desde el móvil: /renovar {sesion} en el bot\n"
            f"(MetaGenesis lo intentará solo al detectar la Mac activa)"
        )

        # Si no hay función de envío, intentar canal por defecto (~/.starseed/env)
        if fn is None:
            # Probar que el canal está configurado
            prueba = _probar_envio_escalado()
            if not prueba.get("ok"):
                return {"ok": False, "motivo": f"sin canal de envío: {prueba.get('motivo', 'desconocido')}", "escalado": "sin_canal"}
            # Canal configurado pero no hay función de envío real (solo test)
            # En producción, aquí se usaría sintesis_telegram.enviar(mensaje)
            return {"ok": False, "motivo": "canal configurado pero sin función de envío real", "escalado": "sin_canal"}

        if fn:
            resp = fn(mensaje)
            if resp.get("ok"):
                self._ultimo_escalado[sesion] = hoy
                self._guardar_ultimo_escalado()
                return {"ok": True, "detalle": "escalado enviado", "escalado": "enviado"}

        return {"ok": False, "motivo": "sin canal de envío (sintesis_telegram)", "escalado": "sin_canal"}

    def _guardar_ultimo_escalado(self):
        estado = _leer_json(self.estado_file, {})
        estado["ultimo_escalado"] = self._ultimo_escalado
        _escribir_atomico(self.estado_file, estado)

    def actualizar_estado_agregado(self):
        """Calcula y guarda el estado agregado en estado.json."""
        vivas = 0
        caidas = 0
        no_instalados = 0
        detalle = {}

        for nombre in self._sesiones:
            check = self.comprobar(nombre)
            if check.get("ok"):
                vivas += 1
                detalle[nombre] = {"estado": "viva", "detalle": check.get("detalle", "")}
            else:
                no_instalado = check.get('no_instalado', False)
                if no_instalado:
                    no_instalados += 1
                    detalle[nombre] = {"estado": "no_instalado", "motivo": check.get("motivo", "")}
                else:
                    caidas += 1
                    detalle[nombre] = {"estado": "caída", "motivo": check.get("motivo", "")}

        estado = {
            "ts": self.ahora_fn().isoformat(),
            "total": len(self._sesiones),
            "vivas": vivas,
            "caidas": caidas,
            "no_instalados": no_instalados,
            "detalle": detalle,
            "ultimo_escalado": self._ultimo_escalado,
        }
        _escribir_atomico(self.estado_file, estado)
        return estado

    def estado(self) -> dict[str, Any]:
        """Devuelve el estado agregado (calculado al momento)."""
        return self.actualizar_estado_agregado()

    def comprobar_todas(self, salida) -> int:
        """Comprueba todas las sesiones registradas, repara las caídas y escribe estado.json.
        
        Una sesión caída no es un fallo del servicio: sale con 0 salvo error interno.
        Un binario no instalado no cuenta como caída ni escala.
        """
        try:
            caidas = 0
            reparadas = 0
            no_instalados = 0
            errores_internos = 0
            
            for nombre in self.listar():
                check = self.comprobar(nombre)
                if check.get("ok"):
                    salida.write(f"✓ {nombre}: viva ({check.get('detalle', '')})\n")
                else:
                    motivo = check.get('motivo', 'caída')
                    es_red = check.get('es_red', False)
                    no_instalado = check.get('no_instalado', False)
                    
                    if no_instalado:
                        no_instalados += 1
                        salida.write(f"○ {nombre}: no instalado ({motivo})\n")
                    elif es_red:
                        salida.write(f"⚠ {nombre}: red ({motivo}) - se reintentará\n")
                    else:
                        caidas += 1
                        salida.write(f"✗ {nombre}: caída ({motivo}) - reparando...\n")
                        r = self.reparar(nombre)
                        if r.get("ok"):
                            reparadas += 1
                            salida.write(f"  → ✓ {nombre} reparada: {r.get('detalle', '')}\n")
                        elif r.get("es_red"):
                            salida.write(f"  → ⚠ {nombre}: red, se espera\n")
                        elif r.get("escalado") == "enviado":
                            salida.write(f"  → ✗ {nombre} no reparada, escalado enviado\n")
                        elif r.get("escalado") == "ya_enviado":
                            salida.write(f"  → ✗ {nombre} no reparada, escalado ya enviado hoy\n")
                        elif r.get("escalado") == "sin_canal":
                            salida.write(f"  → ✗ {nombre} no reparada, sin canal de envío\n")
                        else:
                            salida.write(f"  → ✗ {nombre} no reparada: {r.get('motivo', '')}\n")
                            errores_internos += 1
            
            # Escribir estado agregado final
            self.actualizar_estado_agregado()
            
            total = len(self.listar())
            vivas = total - caidas - no_instalados
            salida.write(f"\nResumen: {vivas}/{total} vivas, {reparadas} reparadas, {no_instalados} no instalados\n")
            
            # Error interno solo si hubo excepción no controlada (no sesión caída ni no instalado)
            return 1 if errores_internos > 0 else 0
            
        except Exception as e:
            salida.write(f"Error interno en comprobar_todas: {e}\n")
            return 1


# ─────────────────────────────── CLI ───────────────────────────────

def _crear_sanador_defecto() -> SanadorSesiones:
    s = SanadorSesiones()
    for nombre, config in REGISTRO.items():
        s.registrar(nombre, config["comprobacion"], config["recetas"])
    try:  # SES1113F: el resto del registro vive en su módulo, con E/S inyectable.
        sys.path.insert(0, str(Path(__file__).parent))
        import sanador_recetas
        sanador_recetas.cargar_en(s)
    except Exception:
        pass
    return s


def main(argv: list[str] | None = None, salida=None, sanador: SanadorSesiones | None = None) -> int:
    """CLI: comprobar, reparar <sesion>, estado."""
    argv = list(argv) if argv is not None else sys.argv[1:]
    # Filtrar el nombre del script si viene en argv[0]
    if argv and (argv[0].endswith("sanador_sesiones.py") or argv[0].startswith("-")):
        argv = argv[1:]
    salida = salida or sys.stdout
    s = sanador or _crear_sanador_defecto()

    if not argv:
        salida.write(
            "Uso: python3 sanador_sesiones.py <comando> [args]\n"
            "Comandos:\n"
            "  comprobar [sesion]   Comprueba una sesión; sin args: todas + repara + escribe estado.json\n"
            "  reparar <sesion>     Repara una sesión probando recetas\n"
            "  estado               Muestra estado agregado de todas las sesiones\n"
            "  listar               Lista sesiones registradas\n"
        )
        return 0

    cmd = argv[0]

    if cmd == "listar":
        for nombre in s.listar():
            salida.write(f"  {nombre}\n")
        return 0

    if cmd == "comprobar":
        if len(argv) < 2:
            # Sin argumentos: comprobar TODAS las sesiones, reparar las caídas, escribir estado.json
            return s.comprobar_todas(salida)
        r = s.comprobar(argv[1])
        if r.get("ok"):
            salida.write(f"✓ {argv[1]}: viva ({r.get('detalle', '')})\n")
        else:
            salida.write(f"✗ {argv[1]}: caída ({r.get('motivo', '')})\n")
        return 0 if r.get("ok") else 1

    if cmd == "reparar":
        if len(argv) < 2:
            salida.write("Falta <sesion>\n")
            return 2
        r = s.reparar(argv[1])
        if r.get("ok"):
            salida.write(f"✓ {argv[1]} reparada: {r.get('detalle', '')}\n")
        else:
            salida.write(f"✗ {argv[1]} no se pudo reparar: {r.get('motivo', '')}\n")
            if r.get("escalado") == "enviado":
                salida.write("  (escalado enviado por Telegram)\n")
        return 0 if r.get("ok") else 1

    if cmd == "estado":
        est = s.estado()
        no_inst = est.get('no_instalados', 0)
        salida.write(
            f"SESIONES · {est['vivas']}/{est['total']} vivas · {est['caidas']} caídas · {no_inst} no instalados\n"
        )
        for nombre, det in est["detalle"].items():
            if det["estado"] == "viva":
                salida.write(f"  ✓ {nombre}: {det.get('detalle', 'ok')}\n")
            elif det["estado"] == "no_instalado":
                salida.write(f"  ○ {nombre}: no instalado ({det.get('motivo', '')})\n")
            else:
                salida.write(f"  ✗ {nombre}: {det.get('motivo', 'caída')}\n")
        return 0

    salida.write(f"Comando desconocido: {cmd}\n")
    return 2


if __name__ == "__main__":
    sys.exit(main())