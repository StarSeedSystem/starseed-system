#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Recetas del resto del registro del sanador (SES1113F · §3.2).

Sesiones que no son notebooklm: google-oauth (alex y alex-docs), higgsfield,
freellmapi, nim y telegram. Toda la E/S llega inyectada (ejecutar, avisar,
estado del enrutador, ahora): las pruebas corren sin red y sin subprocess.
La salida de los comandos se redacta: ningún secreto entra en un motivo.
"""
from __future__ import annotations

import json
import re
import subprocess
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Callable

# ─── Contratos de E/S inyectable ───
EjecutarFn = Callable[[list[str]], dict[str, Any]]  # → {"returncode", "stdout", "stderr"}
AvisarFn = Callable[[str], dict[str, Any]]  # → {"ok": bool}
AhoraFn = Callable[[], datetime]

RAIZ_DEF = Path(__file__).parent.parent.parent
ESTADO_PROVEEDORES_DEF = RAIZ_DEF / "starseed_memory_root" / "salud" / "proveedores.json"

#: Proveedor caído en el enrutador de llm(): lo omite 30 min.
VENTANA_CAIDA = timedelta(minutes=30)
#: App OAuth «en prueba»: los tokens caducan a los 7 días; avisar 3 antes.
CADUCA_OAUTH_EN = 7
AVISAR_OAUTH_EN = 3
#: Higgsfield no tiene receta de reparación: solo aviso con este paso.
PASO_MAC_HIGGSFIELD = "en la Mac: higgsfield auth login"

PASOS_PUBLICAR_APP = (
    "Pasos para publicar la app OAuth (SDP1111U), lo hace Maggasukha en Google Cloud:\n"
    "  1. Google Cloud Console → API y servicios → Pantalla de consentimiento OAuth.\n"
    "  2. Estado de publicación: «En prueba» → «Publicar aplicación».\n"
    f"  3. En producción el refresh_token deja de caducar a los {CADUCA_OAUTH_EN} días."
)

_SECRETOS = (
    re.compile(r"\bsk-[A-Za-z0-9_\-]{16,}"),
    re.compile(r"\bgsk_[A-Za-z0-9]{16,}"),
    re.compile(r"\bAIza[0-9A-Za-z_\-]{30,}"),
    re.compile(r"\bnvapi-[A-Za-z0-9_\-]{20,}"),
    re.compile(r"\bhf_[A-Za-z0-9]{20,}"),
    re.compile(r"\beyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{5,}"),
    re.compile(r"(?i)token[\"']?\s*[:=]\s*[\"']?[A-Za-z0-9._\-]{3,}"),
    re.compile(r"(?i)cookie[\"']?\s*[:=]\s*[\"']?[A-Za-z0-9._\-]{3,}"),
)

_MARCAS_RED = (
    "timeout", "timed out", "connection", "dns", "unreachable",
    "network", "urlerror", "httpx", "getaddrinfo", "temporary failure",
)


def _redactar(texto: str) -> str:
    """Redacta secretos del texto antes de guardarlo o mostrarlo."""
    t = texto or ""
    for p in _SECRETOS:
        t = p.sub("[REDACTADO]", t)
    return t


def es_fallo_red(texto: str) -> bool:
    """True si el texto de un fallo habla de red, no de autenticación."""
    t = (texto or "").lower()
    return any(m in t for m in _MARCAS_RED)


def _cmd(comando: list[str], ejecutar: EjecutarFn | None, timeout: int = 30) -> dict[str, Any]:
    """Ejecuta un comando con la E/S inyectada (o subprocess por defecto)."""
    if ejecutar is None:
        r = subprocess.run(comando, capture_output=True, text=True, timeout=timeout)
        return {"returncode": r.returncode, "stdout": r.stdout or "", "stderr": r.stderr or ""}
    r = ejecutar(comando) or {}
    return {
        "returncode": int(r.get("returncode", 1)),
        "stdout": str(r.get("stdout", "")),
        "stderr": str(r.get("stderr", "")),
    }


def _salida(r: dict[str, Any]) -> str:
    """Salida completa de un comando (stdout + stderr)."""
    return (str(r.get("stdout", "")) + str(r.get("stderr", ""))).strip()


def dias_hasta_caducidad(texto: str) -> int | None:
    """PURA. Extrae los días que quedan («caduca en N días», «dias=N») de un texto."""
    for patron in (r"caduca en (\d+)\s+d[ií]as", r"dias=(\d+)"):
        m = re.search(patron, texto, re.IGNORECASE)
        if m:
            return int(m.group(1))
    return None


def texto_aviso_oauth(alias: str, dias: int) -> str:
    """Texto del aviso: 3 días antes del límite de 7 de la app «en prueba»."""
    return (
        f"OAuth {alias}: el token de acceso caduca en {dias} día(s). Con la app "
        f"«en prueba» los tokens caducan a los {CADUCA_OAUTH_EN} días.\n"
        + PASOS_PUBLICAR_APP
    )


def comprobar_google_oauth(
    alias: str, ejecutar: EjecutarFn | None = None, avisar: AvisarFn | None = None
) -> dict[str, Any]:
    """Estado del token de Google OAuth + aviso 3 días antes del límite de 7."""
    r = _cmd(["cuentas_google", "estado", alias], ejecutar)
    salida = _salida(r)
    if r["returncode"] != 0:
        return {"ok": False, "motivo": _redactar(salida)[:200], "es_red": es_fallo_red(salida)}
    dias = dias_hasta_caducidad(salida)
    detalle = f"{alias} ok"
    aviso = False
    if dias is not None:
        detalle += f" · caduca en {dias} día(s)"
        if dias <= AVISAR_OAUTH_EN and avisar is not None:
            resp = avisar(texto_aviso_oauth(alias, dias)) or {}
            aviso = bool(resp.get("ok"))
    return {"ok": True, "detalle": detalle, "dias_restantes": dias, "aviso_7d": aviso}


def receta_google_oauth_refresh(alias: str, ejecutar: EjecutarFn | None = None) -> dict[str, Any]:
    """Refresca el token de acceso con el refresh_token (receta única)."""
    r = _cmd(["cuentas_google", "refresh", alias], ejecutar, timeout=60)
    salida = _redactar(_salida(r))[:200]
    if r["returncode"] == 0:
        return {"ok": True, "detalle": "refresh_token ok"}
    return {"ok": False, "motivo": f"refresh falló: {salida}", "es_red": es_fallo_red(salida)}


def comprobar_higgsfield(ejecutar: EjecutarFn | None = None) -> dict[str, Any]:
    """higgsfield account, en el A1 y en la Mac."""
    r = _cmd(["higgsfield", "account"], ejecutar)
    salida = _redactar(_salida(r))[:200]
    if r["returncode"] == 0:
        return {"ok": True, "detalle": "higgsfield account ok"}
    return {"ok": False, "motivo": f"higgsfield: {salida}", "es_red": es_fallo_red(salida)}


def texto_aviso_higgsfield(motivo: str = "") -> str:
    """Aviso único de higgsfield: el OAuth necesita navegador; se renueva en la Mac."""
    base = (
        "Sesión higgsfield caída. No tiene receta de reparación: el OAuth necesita navegador.\n"
        + PASO_MAC_HIGGSFIELD
    )
    return base + (f"\nMotivo: {motivo}" if motivo else "")


def leer_estado_proveedores(ruta: Path | None = None) -> dict[str, Any]:
    """Estado del enrutador de llm() (proveedores caídos); {} si no existe."""
    ruta = ruta or ESTADO_PROVEEDORES_DEF
    try:
        with open(ruta, encoding="utf-8") as f:
            return json.load(f) or {}
    except (OSError, ValueError):
        return {}


def guardar_estado_proveedores(estado: dict[str, Any], ruta: Path | None = None) -> None:
    """Guarda el estado del enrutador de llm()."""
    ruta = ruta or ESTADO_PROVEEDORES_DEF
    ruta.parent.mkdir(parents=True, exist_ok=True)
    with open(ruta, "w", encoding="utf-8") as f:
        json.dump(estado, f, ensure_ascii=False, indent=1)
        f.write("\n")


def proveedor_caido(estado: dict[str, Any] | None, proveedor: str, ahora: datetime) -> bool:
    """PURA. ¿Está el proveedor dentro de la ventana de caída (30 min)?"""
    d = (estado or {}).get(proveedor)
    h = str(d.get("caido_hasta", "")) if isinstance(d, dict) else ""
    try:
        return datetime.fromisoformat(h) > ahora
    except ValueError:
        return False


def marcar_proveedor_caido(
    estado: dict[str, Any] | None, proveedor: str, ahora: datetime
) -> dict[str, Any]:
    """PURA. Copia del estado con el proveedor caído 30 min (lo omite llm())."""
    nuevo = dict(estado or {})
    nuevo[proveedor] = {"caido_hasta": (ahora + VENTANA_CAIDA).isoformat()}
    return nuevo


def receta_proveedor(
    proveedor: str,
    servicio: str,
    ejecutar: EjecutarFn | None = None,
    ahora: AhoraFn | None = None,
    leer_estado: Callable[[], dict[str, Any]] | None = None,
    guardar_estado: Callable[[dict[str, Any]], None] | None = None,
) -> dict[str, Any]:
    """Marca el proveedor caído 30 min en el enrutador de llm() y reinicia el
    servicio una sola vez por incidente (dentro de la ventana, no reinicia)."""
    ahora = ahora or datetime.now
    leer = leer_estado or leer_estado_proveedores
    guardar = guardar_estado or guardar_estado_proveedores
    est = leer() or {}
    ya = proveedor_caido(est, proveedor, ahora())
    guardar(marcar_proveedor_caido(est, proveedor, ahora()))
    if ya:
        return {"ok": True, "detalle": f"{proveedor} ya marcado caído 30 min; sin reiniciar de nuevo"}
    r = _cmd(["systemctl", "--user", "restart", servicio], ejecutar)
    salida = _redactar(_salida(r))[:200]
    if r["returncode"] == 0:
        return {"ok": True, "detalle": f"{proveedor} caído 30 min y {servicio} reiniciado una vez"}
    return {"ok": False, "motivo": f"reinicio de {servicio} falló: {salida}", "es_red": es_fallo_red(salida)}


def comprobar_ping(proveedor: str, comando: list[str], ejecutar: EjecutarFn | None = None) -> dict[str, Any]:
    """Ping de un modelo del proveedor."""
    r = _cmd(comando, ejecutar, timeout=10)
    salida = _redactar(_salida(r))[:200]
    if r["returncode"] == 0:
        return {"ok": True, "detalle": f"{proveedor} ping ok"}
    return {"ok": False, "motivo": f"{proveedor}: {salida}", "es_red": es_fallo_red(salida)}


def comprobar_freellmapi(ejecutar: EjecutarFn | None = None) -> dict[str, Any]:
    return comprobar_ping("freellmapi", ["freellmapi", "ping"], ejecutar)


def comprobar_nim(ejecutar: EjecutarFn | None = None) -> dict[str, Any]:
    return comprobar_ping("nim", ["nim", "ping"], ejecutar)


def comprobar_telegram(ejecutar: EjecutarFn | None = None) -> dict[str, Any]:
    """getMe. Con la red caída marca es_red y no_avisar: no se avisa por Telegram."""
    r = _cmd(["telegram_bot", "getMe"], ejecutar)
    salida = _redactar(_salida(r))[:200]
    if r["returncode"] == 0:
        return {"ok": True, "detalle": "telegram getMe ok"}
    es_red = es_fallo_red(salida)
    return {"ok": False, "motivo": f"telegram: {salida}", "es_red": es_red, "no_avisar": es_red}


def receta_telegram_reintentar(ejecutar: EjecutarFn | None = None) -> dict[str, Any]:
    """Reintentar getMe; conserva no_avisar si la red sigue caída."""
    return comprobar_telegram(ejecutar)


def no_avisar_si_red(resultado: dict[str, Any]) -> bool:
    """PURA. Un fallo de red no escala aviso: se espera a que vuelva."""
    return bool(resultado.get("es_red")) or bool(resultado.get("no_avisar"))


def registro(
    ejecutar: EjecutarFn | None = None,
    avisar: AvisarFn | None = None,
    ahora: AhoraFn | None = None,
    leer_estado: Callable[[], dict[str, Any]] | None = None,
    guardar_estado: Callable[[dict[str, Any]], None] | None = None,
) -> dict[str, dict[str, Any]]:
    """Arma el registro del resto de sesiones (§3.2) con la E/S inyectada.

    Misma forma que sanador_sesiones.REGISTRO: {"comprobacion": fn, "recetas": [fn]}.
    """
    ahora = ahora or datetime.now

    def receta_freellm() -> dict[str, Any]:
        return receta_proveedor("freellmapi", "starseed-freellmapi", ejecutar, ahora, leer_estado, guardar_estado)

    def receta_nim() -> dict[str, Any]:
        return receta_proveedor("nim", "starseed-freellmapi", ejecutar, ahora, leer_estado, guardar_estado)

    return {
        "google-oauth-alex": {
            "comprobacion": lambda: comprobar_google_oauth("alex", ejecutar, avisar),
            "recetas": [lambda: receta_google_oauth_refresh("alex", ejecutar)],
        },
        "google-oauth-alex-docs": {
            "comprobacion": lambda: comprobar_google_oauth("alex-docs", ejecutar, avisar),
            "recetas": [lambda: receta_google_oauth_refresh("alex-docs", ejecutar)],
        },
        "higgsfield": {
            "comprobacion": lambda: comprobar_higgsfield(ejecutar),
            "recetas": [],  # solo aviso (texto_aviso_higgsfield)
        },
        "freellmapi": {
            "comprobacion": lambda: comprobar_freellmapi(ejecutar),
            "recetas": [receta_freellm],
        },
        "nim": {
            "comprobacion": lambda: comprobar_nim(ejecutar),
            "recetas": [receta_nim],
        },
        "telegram": {
            "comprobacion": lambda: comprobar_telegram(ejecutar),
            "recetas": [lambda: receta_telegram_reintentar(ejecutar)],
        },
    }


#: Registro con la E/S por defecto (subprocess), listo para cargar en el sanador.
REGISTRO_RESTO = registro()
