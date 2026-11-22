#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Medidor de sesiones por medio (Mac, A1, Maggabox, GitHub Actions).

Una función PURA por sesión que clasifica la salida de una llamada inocua en:
ok · sin_sesion · sin_cupo · no_pude_comprobar (con motivo).

No busca archivos ni lee credenciales: USÁ la sesión (llamada inocua).
Nunca imprime tokens, claves ni la dirección del A1.
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import time
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Callable

# ─────────────────────────────── Constantes ───────────────────────────────

INTERVALO_REFRESCO_SEG = 1800  # 30 min

ESTADOS_VALIDOS = {"ok", "sin_sesion", "sin_cupo", "no_pude_comprobar"}

# Patrones para detectar tipo de error (sin look-behind variable-width)
_PAT_SIN_SESION = re.compile(r"(?i)(auth|autenticaci|credential|login|unauthorized|401|sesión|session).*?(requir|fail|invalid|expired|missing)")
_PAT_SIN_CUPO = re.compile(r"(?i)(quota|rate.?limit|429|too many|exceeded|cupo|límite|limit reached)")
_PAT_RED = re.compile(r"(?i)(timeout|timed out|connection|dns|unreachable|network|refused|reset)")

# ─────────────────────────────── Tipos ───────────────────────────────

ComprobacionFn = Callable[[], dict[str, Any]]
AhoraFn = Callable[[], datetime]

# ─────────────────────────────── Utilidades ───────────────────────────────

def _ahora_defecto() -> datetime:
    return datetime.now()


def _ejecutar_comando(
    argv: list[str],
    timeout: int = 30,
    cwd: Path | None = None,
    env: dict[str, str] | None = None,
) -> dict[str, Any]:
    """Ejecuta un comando y devuelve dict con returncode, stdout, stderr.
    
    No lanza excepciones: devuelve dict con ok=False y motivo.
    """
    try:
        resultado = subprocess.run(
            argv,
            capture_output=True,
            text=True,
            timeout=timeout,
            cwd=str(cwd) if cwd else None,
            env={**os.environ, **(env or {})},
            stdin=subprocess.DEVNULL,
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


def _es_fallo_red(exc: Exception) -> bool:
    msg = str(exc).lower()
    return any(p in msg for p in ("timeout", "timed out", "connection", "dns", "unreachable", "network"))


def _sanear_salida(texto: str) -> str:
    """Redacta tokens, claves y direcciones sensibles."""
    if not texto:
        return ""
    # Patrones de secretos (mismos que sanador_sesiones.py)
    patrones = [
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
        # Dirección IP del A1 (patrón genérico para no exponerla)
        re.compile(r"\b(?:10\.|172\.(?:1[6-9]|2[0-9]|3[0-1])\.|192\.168\.)\d{1,3}\.\d{1,3}\.\d{1,3}\b"),
    ]
    t = texto
    for p in patrones:
        t = p.sub("[REDACTADO]", t)
    return t


def _clasificar_resultado(resultado: dict[str, Any]) -> dict[str, Any]:
    """Clasifica el resultado de un comando inocuo en estado + motivo."""
    rc = resultado.get("returncode", 1)
    stdout = resultado.get("stdout", "")
    stderr = resultado.get("stderr", "")
    salida = (stdout + " " + stderr).strip()
    salida_saneada = _sanear_salida(salida)

    if rc == 0:
        return {"estado": "ok", "motivo": "comprobación exitosa"}

    # Si ya viene clasificado (timeout, binario no encontrado)
    if resultado.get("es_red"):
        return {"estado": "no_pude_comprobar", "motivo": f"red: {resultado.get('motivo', 'desconocido')}"}
    if resultado.get("no_instalado"):
        return {"estado": "no_pude_comprobar", "motivo": f"no instalado: {resultado.get('motivo', 'binario no encontrado')}"}

    # Clasificar por contenido de salida
    if _PAT_SIN_SESION.search(salida):
        return {"estado": "sin_sesion", "motivo": salida_saneada[:200] or "autenticación requerida"}
    if _PAT_SIN_CUPO.search(salida):
        return {"estado": "sin_cupo", "motivo": salida_saneada[:200] or "cuota agotada"}
    if _PAT_RED.search(salida):
        return {"estado": "no_pude_comprobar", "motivo": f"red: {salida_saneada[:200]}"}

    return {"estado": "no_pude_comprobar", "motivo": salida_saneada[:200] or f"código de salida {rc}"}


# ─────────────────────────────── Comandos por sesión ───────────────────────────────

# Cada entrada: (argv_func, timeout_seg)
# argv_func(medio) -> list[str]  |  None si no aplica en ese medio

def _cmd_claude(medio: str) -> list[str] | None:
    if medio in ("mac", "a1", "maggabox"):
        return ["claude", "--version"]  # llamada inocua
    if medio == "github-actions":
        return ["gh", "auth", "status"]  # verifica auth de GitHub CLI
    return None


def _cmd_antigravity(medio: str) -> list[str] | None:
    # agy models usa la sesión de Google de Alex; llamada inocua
    if medio in ("mac", "a1", "maggabox"):
        return ["agy", "models"]
    return None


def _cmd_codex(medio: str) -> list[str] | None:
    if medio in ("mac", "a1", "maggabox"):
        return ["codex", "--version"]
    return None


def _cmd_github(medio: str) -> list[str] | None:
    if medio in ("mac", "a1", "maggabox", "github-actions"):
        return ["gh", "auth", "status"]
    return None


def _cmd_google_cloud(medio: str) -> list[str] | None:
    if medio in ("mac", "a1", "maggabox"):
        return ["gcloud", "auth", "list", "--filter=status:ACTIVE", "--format=value(account)"]
    return None


def _cmd_vercel(medio: str) -> list[str] | None:
    if medio in ("mac", "a1", "maggabox"):
        return ["vercel", "whoami"]
    return None


def _cmd_google_drive(medio: str) -> list[str] | None:
    # Fichas de Google Drive: usar cuentas_google estado
    if medio in ("mac", "a1", "maggabox"):
        return ["cuentas_google", "estado", "alex-docs"]
    return None


def _cmd_notebooklm(medio: str) -> list[str] | None:
    # NotebookLM solo vive en el A1
    if medio == "a1":
        # auth check es llamada inocua con cerrojo (como en sanador_sesiones)
        return ["notebooklm", "auth", "check"]
    return None


def _cmd_telegram_bots(medio: str) -> list[str] | None:
    # 3 bots: síntesis, puente, diseño
    if medio in ("mac", "a1", "maggabox"):
        return ["telegram_bot", "getMe"]
    return None


def _cmd_opencode(medio: str) -> list[str] | None:
    if medio in ("mac", "a1", "maggabox"):
        return ["opencode", "--version"]
    return None


def _cmd_hermes(medio: str) -> list[str] | None:
    if medio in ("mac", "a1", "maggabox"):
        return ["hermes", "models"]  # lista modelos = verifica gateway
    return None


def _cmd_repo_secrets(medio: str) -> list[str] | None:
    # Verificar que los secretos del repo están accesibles (GitHub CLI)
    if medio in ("mac", "a1", "maggabox", "github-actions"):
        return ["gh", "secret", "list", "--repo", "StarSeedSystem/starseed-system"]
    return None


def _cmd_proveedores(medio: str) -> list[str] | None:
    # Cada proveedor: ping barato
    proveedores = {
        "nim": ["nim", "ping"],
        "freellmapi": ["freellmapi", "ping"],
        "xkiro": ["xkiro", "ping"],
        "aihubmix": ["aihubmix", "ping"],
        "openrouter": ["openrouter", "ping"],
        "gemini": ["gemini", "ping"],
    }
    # Se expande dinámicamente en _construir_sesiones_medio
    return None


def _cmd_ollama(medio: str) -> list[str] | None:
    # Ollama en A1: NO necesita clave API, usa modelo local
    if medio == "a1":
        return ["ollama", "list"]
    return None


# Mapa de nombre de sesión -> función constructora de argv
SESIONES_BASE: dict[str, Callable[[str], list[str] | None]] = {
    "claude": _cmd_claude,
    "antigravity": _cmd_antigravity,
    "codex": _cmd_codex,
    "github": _cmd_github,
    "google-cloud": _cmd_google_cloud,
    "vercel": _cmd_vercel,
    "google-drive": _cmd_google_drive,
    "notebooklm": _cmd_notebooklm,
    "telegram-bots": _cmd_telegram_bots,
    "opencode": _cmd_opencode,
    "hermes": _cmd_hermes,
    "repo-secrets": _cmd_repo_secrets,
    "ollama": _cmd_ollama,
}

# Proveedores dinámicos (se añaden por medio)
PROVEEDORES_PING: dict[str, list[str]] = {
    "nim": ["nim", "ping"],
    "freellmapi": ["freellmapi", "ping"],
    "xkiro": ["xkiro", "ping"],
    "aihubmix": ["aihubmix", "ping"],
    "openrouter": ["openrouter", "ping"],
    "gemini": ["gemini", "ping"],
}


# ─────────────────────────────── Configuración de medios ───────────────────────────────

@dataclass
class ConfigMedio:
    nombre: str
    sesiones: list[str]  # nombres base + proveedores
    env_extra: dict[str, str] = field(default_factory=dict)


def _construir_sesiones_medio(medio: str) -> list[str]:
    """Devuelve la lista de sesiones a comprobar para un medio."""
    base = [
        "claude", "antigravity", "codex", "github", "google-cloud",
        "vercel", "google-drive", "telegram-bots", "opencode",
        "hermes", "repo-secrets",
    ]
    if medio == "a1":
        base += ["notebooklm", "ollama"]
    # Añadir proveedores
    base += [f"proveedor-{p}" for p in PROVEEDORES_PING.keys()]
    return base


MEDIOS: dict[str, ConfigMedio] = {
    "mac": ConfigMedio("mac", _construir_sesiones_medio("mac")),
    "a1": ConfigMedio("a1", _construir_sesiones_medio("a1")),
    "maggabox": ConfigMedio("maggabox", _construir_sesiones_medio("maggabox")),
    "github-actions": ConfigMedio("github-actions", _construir_sesiones_medio("github-actions")),
}


# ─────────────────────────────── Comprobación pura por sesión ───────────────────────────────

def _construir_argv(sesion: str, medio: str) -> list[str] | None:
    """Construye el argv para una sesión en un medio."""
    # Proveedores
    if sesion.startswith("proveedor-"):
        proveedor = sesion[len("proveedor-"):]
        argv = PROVEEDORES_PING.get(proveedor)
        if argv:
            return argv
        return None

    fn = SESIONES_BASE.get(sesion)
    if fn:
        return fn(medio)
    return None


def comprobar_sesion(
    medio: str,
    sesion: str,
    *,
    ejecutar_fn: Callable[[list[str]], dict[str, Any]] | None = None,
    ahora_fn: AhoraFn | None = None,
) -> dict[str, Any]:
    """Comprueba UNA sesión en UN medio usando una llamada inocua.

    Args:
        medio: "mac" | "a1" | "maggabox" | "github-actions"
        sesion: nombre de la sesión (clave de SESIONES_BASE o "proveedor-<nombre>")
        ejecutar_fn: función inyectable para tests (recibe argv, devuelve dict como _ejecutar_comando)
        ahora_fn: función inyectable para timestamp (tests)

    Returns:
        dict con: estado (ok|sin_sesion|sin_cupo|no_pude_comprobar), motivo, sesion, medio, timestamp
    """
    argv = _construir_argv(sesion, medio)
    if argv is None:
        return {
            "estado": "no_pude_comprobar",
            "motivo": f"sesión '{sesion}' no definida para medio '{medio}'",
            "sesion": sesion,
            "medio": medio,
            "timestamp": (ahora_fn or _ahora_defecto)().isoformat(),
        }

    ejecutar = ejecutar_fn or _ejecutar_comando
    resultado = ejecutar(argv)
    clasificacion = _clasificar_resultado(resultado)

    return {
        "estado": clasificacion["estado"],
        "motivo": clasificacion["motivo"],
        "sesion": sesion,
        "medio": medio,
        "timestamp": (ahora_fn or _ahora_defecto)().isoformat(),
    }


# ─────────────────────────────── Comprobación por medio ───────────────────────────────

def comprobar_medio(
    medio: str,
    *,
    ejecutar_fn: Callable[[list[str]], dict[str, Any]] | None = None,
    ahora_fn: AhoraFn | None = None,
) -> dict[str, Any]:
    """Comprueba TODAS las sesiones de un medio."""
    if medio not in MEDIOS:
        return {
            "medio": medio,
            "sesiones": {},
            "error": f"medio desconocido: {medio}",
            "timestamp": (ahora_fn or _ahora_defecto)().isoformat(),
        }

    config = MEDIOS[medio]
    sesiones_resultado: dict[str, dict[str, Any]] = {}

    for sesion in config.sesiones:
        sesiones_resultado[sesion] = comprobar_sesion(
            medio, sesion, ejecutar_fn=ejecutar_fn, ahora_fn=ahora_fn
        )

    return {
        "medio": medio,
        "sesiones": sesiones_resultado,
        "timestamp": (ahora_fn or _ahora_defecto)().isoformat(),
    }


# ─────────────────────────────── Comprobación completa (tabla) ───────────────────────────────

def comprobar_todos(
    *,
    ejecutar_fn: Callable[[list[str]], dict[str, Any]] | None = None,
    ahora_fn: AhoraFn | None = None,
) -> dict[str, Any]:
    """Comprueba todos los medios y devuelve tabla medio × sesión con timestamp."""
    tabla: dict[str, dict[str, dict[str, Any]]] = {}
    for medio in MEDIOS:
        resultado_medio = comprobar_medio(medio, ejecutar_fn=ejecutar_fn, ahora_fn=ahora_fn)
        tabla[medio] = resultado_medio["sesiones"]

    return {
        "tabla": tabla,
        "timestamp": (ahora_fn or _ahora_defecto)().isoformat(),
    }


# ─────────────────────────────── Acciones para Alex ───────────────────────────────

# Mapeo de sesión -> acción concreta (enlace o comando exacto)
ACCIONES_ALEX: dict[str, dict[str, str]] = {
    "claude": {
        "mac": "Ejecutar en la Mac: `claude auth login`",
        "a1": "En el A1: `claude auth login` (o añadir a fuentes de sesión en claude.ai/code)",
        "maggabox": "En Maggabox: `claude auth login`",
        "github-actions": "Añadir `ANTHROPIC_API_KEY` a secrets del repo en GitHub",
    },
    "antigravity": {
        "mac": "En la Mac: `agy auth login --browser-cookies chrome --account alexbordongarrigos@gmail.com`",
        "a1": "En el A1: `agy auth login --browser-cookies chrome --account alexbordongarrigos@gmail.com`",
        "maggabox": "En Maggabox: `agy auth login --browser-cookies chrome --account alexbordongarrigos@gmail.com`",
    },
    "codex": {
        "mac": "En la Mac: `codex auth login`",
        "a1": "En el A1: `codex auth login`",
        "maggabox": "En Maggabox: `codex auth login`",
    },
    "github": {
        "mac": "En la Mac: `gh auth login`",
        "a1": "En el A1: `gh auth login`",
        "maggabox": "En Maggabox: `gh auth login`",
        "github-actions": "Workflow ya tiene GITHUB_TOKEN; verificar permisos del token",
    },
    "google-cloud": {
        "mac": "En la Mac: `gcloud auth login`",
        "a1": "En el A1: `gcloud auth login`",
        "maggabox": "En Maggabox: `gcloud auth login`",
    },
    "vercel": {
        "mac": "En la Mac: `vercel login`",
        "a1": "En el A1: `vercel login`",
        "maggabox": "En Maggabox: `vercel login`",
    },
    "google-drive": {
        "mac": "En la Mac: `cuentas_google login alex-docs`",
        "a1": "En el A1: `cuentas_google login alex-docs`",
        "maggabox": "En Maggabox: `cuentas_google login alex-docs`",
    },
    "notebooklm": {
        "a1": "En el A1: `notebooklm auth login --browser-cookies chrome --account alexbordongarrigos@gmail.com`",
    },
    "telegram-bots": {
        "mac": "En la Mac: verificar `TELEGRAM_*_BOT_TOKEN` en `~/.starseed/env` y reiniciar bots",
        "a1": "En el A1: verificar `TELEGRAM_*_BOT_TOKEN` en `~/.starseed/env` y reiniciar bots",
        "maggabox": "En Maggabox: verificar `TELEGRAM_*_BOT_TOKEN` en `~/.starseed/env` y reiniciar bots",
    },
    "opencode": {
        "mac": "En la Mac: `opencode auth login` (si usa auth) o verificar config en `~/.config/opencode/opencode.json`",
        "a1": "En el A1: verificar config en `~/.config/opencode/opencode.json`",
        "maggabox": "En Maggabox: verificar config en `~/.config/opencode/opencode.json`",
    },
    "hermes": {
        "mac": "En la Mac: verificar `~/.hermes/.env` tiene claves y `hermes models` responde",
        "a1": "En el A1: verificar `~/.hermes/.env` tiene claves y `hermes models` responde",
        "maggabox": "En Maggabox: verificar `~/.hermes/.env` tiene claves y `hermes models` responde",
    },
    "repo-secrets": {
        "mac": "En la Mac: `gh secret list --repo StarSeedSystem/starseed-system` y añadir faltantes",
        "a1": "En el A1: `gh secret list --repo StarSeedSystem/starseed-system` y añadir faltantes",
        "maggabox": "En Maggabox: `gh secret list --repo StarSeedSystem/starseed-system` y añadir faltantes",
        "github-actions": "En GitHub: Settings → Secrets → Actions → New repository secret",
    },
    "ollama": {
        "a1": "En el A1: `ollama serve` debe estar corriendo; `ollama pull <modelo>` si falta modelo",
    },
}

# Acciones para proveedores
for prov in PROVEEDORES_PING:
    ACCIONES_ALEX[f"proveedor-{prov}"] = {
        "mac": f"En la Mac: verificar que `{prov}` está instalado y `~/.starseed/env` tiene su clave",
        "a1": f"En el A1: verificar que `{prov}` está instalado y `~/.starseed/env` tiene su clave",
        "maggabox": f"En Maggabox: verificar que `{prov}` está instalado y `~/.starseed/env` tiene su clave",
        "github-actions": f"En GitHub: añadir `{prov.upper()}_API_KEY` a secrets del repo",
    }


def acciones_para_alex(tabla: dict[str, dict[str, dict[str, Any]]]) -> list[dict[str, Any]]:
    """Devuelve UNA acción por sesión que requiera intervención de Alex.

    Args:
        tabla: resultado de comprobar_todos()["tabla"]

    Returns:
        Lista de dicts con: sesion, medio, estado, motivo, accion (enlace/comando exacto)
    """
    acciones: list[dict[str, Any]] = []

    for medio, sesiones in tabla.items():
        for sesion, datos in sesiones.items():
            estado = datos.get("estado")
            if estado in ("sin_sesion", "sin_cupo"):
                motivo = datos.get("motivo", "")
                accion_texto = ACCIONES_ALEX.get(sesion, {}).get(medio)
                if accion_texto:
                    acciones.append({
                        "sesion": sesion,
                        "medio": medio,
                        "estado": estado,
                        "motivo": _sanear_salida(motivo),
                        "accion": accion_texto,
                    })

    return acciones


# ─────────────────────────────── CLI ───────────────────────────────

def _imprimir_tabla(tabla: dict[str, dict[str, dict[str, Any]]]) -> None:
    """Imprime la tabla medio × sesión de forma legible."""
    print(f"\n{'MEDIO':<18} {'SESIÓN':<22} {'ESTADO':<18} MOTIVO")
    print("-" * 100)
    for medio, sesiones in tabla.items():
        for sesion, datos in sesiones.items():
            estado = datos.get("estado", "?")
            motivo = datos.get("motivo", "")[:60]
            print(f"{medio:<18} {sesion:<22} {estado:<18} {motivo}")


def _imprimir_acciones(acciones: list[dict[str, Any]]) -> None:
    """Imprime las acciones para Alex."""
    if not acciones:
        print("\n✓ Todas las sesiones OK — no se necesita acción de Alex")
        return
    print(f"\n⚠ ACCIONES REQUERIDAS DE ALEX ({len(acciones)}):")
    print("-" * 80)
    for a in acciones:
        print(f"  [{a['medio']}] {a['sesion']} ({a['estado']}): {a['accion']}")


def main(argv: list[str] | None = None) -> int:
    """CLI: comprobar [medio], tabla, acciones."""
    argv = list(argv) if argv is not None else sys.argv[1:]

    if not argv or argv[0] in ("-h", "--help", "ayuda"):
        print(
            "Uso: python3 sesiones_medios.py <comando>\n"
            "Comandos:\n"
            "  comprobar [medio]   Comprueba sesiones (sin args: todos los medios)\n"
            "  tabla               Muestra tabla medio × sesión\n"
            "  acciones            Muestra acciones requeridas de Alex\n"
            "  ayuda               Esta ayuda"
        )
        return 0

    cmd = argv[0]

    if cmd == "comprobar":
        if len(argv) > 1:
            medio = argv[1]
            resultado = comprobar_medio(medio)
            _imprimir_tabla({medio: resultado["sesiones"]})
        else:
            resultado = comprobar_todos()
            _imprimir_tabla(resultado["tabla"])
        return 0

    if cmd == "tabla":
        resultado = comprobar_todos()
        _imprimir_tabla(resultado["tabla"])
        return 0

    if cmd == "acciones":
        resultado = comprobar_todos()
        acciones = acciones_para_alex(resultado["tabla"])
        _imprimir_acciones(acciones)
        return 0

    print(f"Comando desconocido: {cmd}")
    return 2


if __name__ == "__main__":
    sys.exit(main())