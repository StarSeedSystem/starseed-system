#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Recetas del resto del registro de sesiones (SES1113F).

Google OAuth alex y alex-docs, Higgsfield, FreeLLMAPI/NIM y Telegram. Toda la
E/S es inyectable (`registro(deps)`) para probar sin red. `cargar_en(sanador)`
las registra en `sanador_sesiones`. Nunca imprime tokens ni cookies.
"""
from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Callable

SESIONES = ("google-oauth-alex", "google-oauth-alex-docs", "higgsfield",
            "freellmapi", "nim", "telegram")
DIAS_PRUEBA, DIAS_AVISO = 7, 3
SALUD = Path(os.path.expanduser("~/.starseed/salud-proveedores.json"))
SERVICIO = "starseed-freellmapi"
PASO_HIGGSFIELD = "En la Mac: `higgsfield auth login` (necesita navegador)."
PASOS_PUBLICAR = (
    "Publica la app OAuth «StarSeed actividad» (lo hace Maggasukha en Google Cloud; SDP1111U):\n"
    "1) Google Cloud › APIs y servicios › Pantalla de consentimiento OAuth › Información de la marca: "
    "página principal https://starseed-os.vercel.app · privacidad https://starseed-os.vercel.app/privacidad · "
    "términos https://starseed-os.vercel.app/terminos · dominio autorizado starseed-os.vercel.app.\n"
    "2) Público › Publicar app.\n"
    "3) Rehacer el alta una vez: ~/.starseed/herramientas/alta-cuentas-google.py {alias}."
)

Ejecutar = Callable[[list[str], int], tuple[int, str]]
Ping = Callable[[str], dict[str, Any]]


def _es_red(texto: Any) -> bool:
    """Distingue una caída de red de un fallo de autenticación."""
    t = str(texto).lower()
    return any(p in t for p in ("timeout", "timed out", "connection", "dns",
                                "unreachable", "network", "urlerror", "httpx"))


def _ejecutar(argv: list[str], timeout: int = 30) -> tuple[int, str]:
    try:
        r = subprocess.run(argv, capture_output=True, text=True, timeout=timeout)
        return r.returncode, (r.stdout or "") + (r.stderr or "")
    except subprocess.TimeoutExpired:
        return 124, "timeout"
    except Exception as e:
        return 1, str(e)


def _leer_json(ruta: Path, defecto: Any) -> Any:
    try:
        with open(ruta, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return defecto


def _escribir_json(ruta: Path, datos: Any) -> None:
    ruta.parent.mkdir(parents=True, exist_ok=True)
    tmp = ruta.with_suffix(".tmp")
    tmp.write_text(json.dumps(datos, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    os.replace(tmp, ruta)


def _leer_ficha(alias: str) -> dict[str, Any] | None:
    return _leer_json(Path(os.path.expanduser(f"~/.starseed/cuentas/{alias}.json")), None)


def _clave(nombre: str) -> str:
    """Lee una clave del entorno o de ~/.starseed/env; nunca la imprime ni la registra."""
    if os.environ.get(nombre):
        return os.environ[nombre]
    ruta = Path(os.path.expanduser("~/.starseed/env"))
    try:
        for linea in ruta.read_text(encoding="utf-8").splitlines():
            linea = linea.strip()
            if linea.startswith("export "):
                linea = linea[7:]
            if linea.startswith(nombre + "="):
                return linea.split("=", 1)[1].strip().strip('"').strip("'")
    except OSError:
        pass
    return ""


def _renovar_google(alias: str) -> dict[str, Any]:
    """Renueva con el refresh_token de la ficha; nunca devuelve el token."""
    sys.path.insert(0, str(Path(__file__).parent))
    try:
        import cuentas_google
        from cuentas_google_env import pedir_http

        vivo = cuentas_google.token(alias, pedir_http)
        return {"ok": bool(vivo), "motivo": "" if vivo else "sin token renovado"}
    except Exception as e:
        return {"ok": False, "motivo": "red" if _es_red(e) else "refresh falló",
                "es_red": _es_red(e)}


def _avisar(texto: str) -> dict[str, Any]:
    """Envía el aviso una sola vez al día (misma frase = mismo aviso)."""
    ruta = Path(os.path.expanduser("~/.starseed/salud/avisos.json"))
    marca = hashlib.sha1(texto.encode("utf-8")).hexdigest()[:16]
    hoy = datetime.now().strftime("%Y-%m-%d")
    enviados = _leer_json(ruta, {})
    if enviados.get(marca) == hoy:
        return {"ok": True, "omitido": "ya_avisado_hoy"}
    try:
        import sintesis_telegram

        r = sintesis_telegram.enviar(texto)
    except Exception as e:
        return {"ok": False, "motivo": "sin canal: " + ("red" if _es_red(e) else "error")}
    if r.get("ok"):
        enviados[marca] = hoy
        _escribir_json(ruta, enviados)
    return r


def _ping_proveedor(nombre: str) -> dict[str, Any]:
    """Ping ligero del catálogo del modelo (sin gastar una inferencia)."""
    if nombre == "freellmapi":
        url = os.environ.get("STARSEED_FREELLMAPI_URL", "http://127.0.0.1:3001/v1/models")
        clave = _clave("FREELLMAPI_KEY")
    else:
        url = os.environ.get("STARSEED_NIM_URL", "https://integrate.api.nvidia.com/v1/models")
        clave = _clave("NVIDIA_API_KEY")
        if not clave:
            return {"ok": False, "motivo": "sin NVIDIA_API_KEY"}
    peticion = urllib.request.Request(url, headers=({"Authorization": "Bearer " + clave} if clave else {}))
    try:
        with urllib.request.urlopen(peticion, timeout=10) as r:
            return {"ok": 200 <= getattr(r, "status", 200) < 300}
    except Exception as e:
        return {"ok": False, "motivo": "red" if _es_red(e) else "sin respuesta",
                "es_red": _es_red(e)}


def _marcar_proveedor(nombre: str, minutos: int, ahora: datetime) -> dict[str, Any]:
    """Marca el proveedor caído en el enrutador y dice si toca reiniciar una vez."""
    datos = _leer_json(SALUD, {})
    entrada = datos.get(nombre) if isinstance(datos.get(nombre), dict) else {}
    ya = _futuro(entrada.get("sin_cupo_hasta"), ahora)
    # Solo una ventana con hora: un `estado: caido` dejaría al proveedor fuera para siempre.
    entrada.update({
        "sin_cupo_hasta": (ahora + timedelta(minutes=minutos)).strftime("%Y-%m-%d %H:%M:%S"),
        "motivo": "ping caído (sanador SES1113)",
    })
    datos[nombre] = entrada
    _escribir_json(SALUD, datos)
    return {"ok": True, "reiniciar": not ya}


def _futuro(valor: Any, ahora: datetime) -> bool:
    try:
        return datetime.strptime(str(valor), "%Y-%m-%d %H:%M:%S") > ahora
    except (ValueError, TypeError):
        return False


def _reiniciar_servicio(servicio: str) -> dict[str, Any]:
    rc, salida = _ejecutar(["systemctl", "--user", "restart", servicio], 60)
    return {"ok": rc == 0, "motivo": "" if rc == 0 else salida.strip()[:160]}


def dias_para_caducar(ficha: Any, ahora: datetime) -> int | None:
    """Días que le quedan al token de una app OAuth «en prueba» (7 desde el alta)."""
    if not isinstance(ficha, dict):
        return None
    desde = ficha.get("emitido") or ficha.get("creado") or ficha.get("alta")
    if not desde:
        return None
    try:
        t = datetime.fromisoformat(str(desde))
        if t.tzinfo:
            t = t.replace(tzinfo=None)
        return DIAS_PRUEBA - (ahora.replace(tzinfo=None) - t).days
    except (ValueError, TypeError):
        return None


def comprobar_google_oauth(alias: str, ejecutar: Ejecutar = _ejecutar) -> dict[str, Any]:
    orden = [sys.executable, str(Path(__file__).with_name("cuentas_google.py")), "estado"]
    rc, salida = ejecutar(orden, 60)
    vivo = rc == 0 and any(linea.split()[:1] == [alias] and linea.rstrip().endswith("vivo")
                           for linea in salida.splitlines())
    if vivo:
        return {"ok": True, "detalle": f"{alias} vivo"}
    return {"ok": False, "motivo": f"{alias}: {salida.strip()[:160]}"}


def receta_google_oauth(alias: str, renovar: Callable[[str], dict[str, Any]],
                        leer_ficha: Callable[[str], Any], avisar: Callable[[str], Any] | None,
                        ahora: Callable[[], datetime]) -> dict[str, Any]:
    r = renovar(alias)
    if not r.get("ok"):
        salida = {"ok": False, "motivo": str(r.get("motivo") or "refresh falló")}
        if r.get("es_red"):
            salida["es_red"] = True
        elif avisar:  # el refresh_token de 7 días murió: pasos para publicar la app
            avisar(PASOS_PUBLICAR.format(alias=alias))
        return salida
    dias = dias_para_caducar(leer_ficha(alias), ahora())
    if dias is not None and dias <= DIAS_AVISO and avisar:
        avisar(PASOS_PUBLICAR.format(alias=alias))
        return {"ok": True, "detalle": f"refresh ok; aviso de publicación ({max(dias, 0)} días)"}
    return {"ok": True, "detalle": "refresh ok"}


def comprobar_higgsfield(ejecutar: Ejecutar = _ejecutar) -> dict[str, Any]:
    rc, salida = ejecutar(["higgsfield", "account"], 30)
    if rc == 0:
        return {"ok": True, "detalle": "higgsfield ok"}
    return {"ok": False, "motivo": f"higgsfield: {salida.strip()[:160]} · {PASO_HIGGSFIELD}"}


def receta_higgsfield_aviso(avisar: Callable[[str], Any] | None) -> dict[str, Any]:
    """Higgsfield no se repara solo: el OAuth necesita la Mac. Solo se avisa."""
    if avisar:
        avisar("Higgsfield cayó en el A1. " + PASO_HIGGSFIELD)
    return {"ok": False, "motivo": PASO_HIGGSFIELD, "solo_aviso": True, "no_reparar": True}


def comprobar_proveedor(nombre: str, ping: Ping) -> dict[str, Any]:
    r = ping(nombre)
    if r.get("ok"):
        return {"ok": True, "detalle": f"{nombre} responde"}
    salida = {"ok": False, "motivo": f"{nombre}: {str(r.get('motivo') or 'sin respuesta')[:160]}"}
    if r.get("es_red"):
        salida["es_red"] = True
    return salida


def receta_proveedor_caido(nombre: str, marcar: Callable[..., dict[str, Any]],
                           reiniciar: Callable[[str], dict[str, Any]],
                           ahora: Callable[[], datetime], minutos: int = 30,
                           servicio: str = SERVICIO) -> dict[str, Any]:
    m = marcar(nombre, minutos, ahora())
    if not m.get("ok"):
        return {"ok": False, "motivo": f"no se pudo marcar {nombre} caído"}
    detalle = f"{nombre} marcado caído {minutos} min (el enrutador usa otro)"
    if m.get("reiniciar"):
        r = reiniciar(servicio)
        detalle += "; servicio reiniciado" if r.get("ok") else "; reinicio falló"
    return {"ok": True, "detalle": detalle}


def _getme() -> dict[str, Any]:
    token = _clave("TELEGRAM_BOT_TOKEN")
    if not token:
        return {"ok": False, "motivo": "sin TELEGRAM_BOT_TOKEN"}
    try:
        urllib.request.urlopen("https://api.telegram.org/bot%s/getMe" % token, timeout=10)
        return {"ok": True}
    except urllib.error.HTTPError:
        return {"ok": False, "motivo": "getMe rechazado"}
    except Exception:
        return {"ok": False, "motivo": "red", "es_red": True}


def receta_telegram(getme: Callable[[], dict[str, Any]],
                    avisar: Callable[[str], Any] | None) -> dict[str, Any]:
    r = getme()
    if r.get("ok"):
        return {"ok": True, "detalle": "telegram responde"}
    if r.get("es_red"):
        return {"ok": False, "motivo": "red caída: no se avisa por Telegram",
                "es_red": True, "no_avisar": True}
    if avisar:
        avisar("Telegram no responde a getMe; se reintenta en el próximo ciclo.")
    return {"ok": False, "motivo": "telegram no responde"}


def registro(deps: dict[str, Any] | None = None) -> dict[str, dict[str, Any]]:
    """Construye el registro con E/S inyectable (sin red en las pruebas)."""
    d = deps or {}
    ej = d.get("ejecutar", _ejecutar)
    ahora = d.get("ahora", datetime.now)
    renovar = d.get("renovar_google", _renovar_google)
    leer = d.get("leer_ficha", _leer_ficha)
    avisar = d.get("avisar", _avisar)
    ping = d.get("ping_proveedor", _ping_proveedor)
    marcar = d.get("marcar_proveedor", _marcar_proveedor)
    reiniciar = d.get("reiniciar_servicio", _reiniciar_servicio)
    getme = d.get("getme", _getme)
    oauth = lambda alias: {
        "comprobacion": lambda: comprobar_google_oauth(alias, ej),
        "recetas": [lambda: receta_google_oauth(alias, renovar, leer, avisar, ahora)],
    }
    proveedor = lambda nombre: {
        "comprobacion": lambda: comprobar_proveedor(nombre, ping),
        "recetas": [lambda: receta_proveedor_caido(nombre, marcar, reiniciar, ahora)],
    }
    return {
        "google-oauth-alex": oauth("alex"),
        "google-oauth-alex-docs": oauth("alex-docs"),
        "higgsfield": {"comprobacion": lambda: comprobar_higgsfield(ej),
                       "recetas": [lambda: receta_higgsfield_aviso(avisar)]},
        "freellmapi": proveedor("freellmapi"),
        "nim": proveedor("nim"),
        "telegram": {"comprobacion": lambda: comprobar_telegram(getme),
                     "recetas": [lambda: receta_telegram(getme, avisar)]},
    }


def comprobar_telegram(getme: Callable[[], dict[str, Any]]) -> dict[str, Any]:
    return comprobar_proveedor("telegram", lambda _nombre: getme())


def cargar_en(sanador: Any, deps: dict[str, Any] | None = None) -> int:
    """Registra estas sesiones en un `sanador_sesiones.SanadorSesiones`."""
    todo = registro(deps)
    for nombre, config in todo.items():
        sanador.registrar(nombre, config["comprobacion"], config["recetas"])
    return len(todo)
