#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Topes del servidor de Supabase (2026-09-29) — lo que el proyecto mismo puede limitar.

Alex: «en Supabase agrega límites de gastos diarios si es posible para que no vuelva a pasar».
Honestamente: el plan GRATUITO de Supabase no tiene límite de gasto diario ni de tráfico por
día. Lo que SÍ se puede poner en el propio servidor, por la API de gestión, son topes que
cortan los bucles antes de que se coman la cuota:

  · PostgREST `max_rows` = 1000: ninguna consulta devuelve más de 1.000 filas, aunque el
    cliente pida `limit=100000` o se olvide del límite (cada fila de más es salida pagada).
  · Auth: límites por IP de refresco de token, verificación, OTP, anónimos y web3. Un
    bucle de `refreshSession` o de verificación se corta con 429 en vez de sumar miles.
  · Realtime (si la API expone los campos): clientes simultáneos, eventos/s, presencia/s,
    uniones/s y bytes/s. OJO: cambiar la configuración de Realtime desconecta una vez a
    todos los clientes (se reconectan solos). `--sin-realtime` lo omite.

El presupuesto DIARIO lo pone `vigia_consumo.py` (freno remoto en `os_freno`); esto son los
topes duros por petición/segundo. Solo BAJA valores (nunca sube uno que ya esté por debajo),
es idempotente y solo imprime nombres de campo y números: la respuesta de la API trae
secretos (JWT, SMTP) y NUNCA se imprime ni se guarda.

Uso (en la Mac, con SUPABASE_ACCESS_TOKEN y SUPABASE_PROJECT_REF en .env.local):
  python3 scripts/puente/limites_supabase.py --seco         # ver qué cambiaría
  python3 scripts/puente/limites_supabase.py                # aplicarlo
  python3 scripts/puente/limites_supabase.py --sin-realtime
"""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request

RAIZ = os.environ.get("STARSEED_ROOT") or "/Users/alex/Documents/starseed-os-main"
API = "https://api.supabase.com"
AGENTE = "starseed-limites-supabase/1.0"

#: Rutas de la API de gestión (verificadas en supabase.com/docs/reference/api, 2026-09-29).
RUTAS = {
    "postgrest": "/v1/projects/{ref}/postgrest",
    "auth": "/v1/projects/{ref}/config/auth",
    "realtime": "/v1/projects/{ref}/config/realtime",
}

#: Topes para un proyecto de desarrollo con 3 personas. Solo se aplican si BAJAN el valor.
#: Auth: `token_refresh` y `verify` son por IP cada 5 min (por defecto 150 y 30); `otp`,
#: `anonymous_users` y `web3` por hora (por defecto 30). 60 refrescos / 5 min por IP sobran
#: para varias pestañas (cada una refresca ~1 vez por hora); un bucle, no.
OBJETIVOS: dict[str, dict[str, int]] = {
    "postgrest": {"max_rows": 1000},
    "auth": {
        "rate_limit_token_refresh": 60,
        "rate_limit_verify": 15,
        "rate_limit_otp": 10,
        "rate_limit_anonymous_users": 10,
        "rate_limit_web3": 10,
    },
    "realtime": {
        "max_concurrent_users": 60,
        "max_events_per_second": 50,
        "max_presence_events_per_second": 10,
        "max_joins_per_second": 20,
        "max_bytes_per_second": 50000,
    },
}


def _env(nombre: str) -> str:
    try:
        with open(os.path.join(RAIZ, ".env.local"), encoding="utf-8") as f:
            for l in f:
                if l.startswith(nombre + "="):
                    return l.split("=", 1)[1].strip().strip('"').strip("'")
    except OSError:
        pass
    return os.environ.get(nombre, "")


def _http(metodo: str, url: str, token: str, cuerpo: dict | None = None, timeout: int = 30) -> tuple[int, str]:
    datos = json.dumps(cuerpo).encode("utf-8") if cuerpo is not None else None
    cab = {"Authorization": "Bearer " + token, "User-Agent": AGENTE}
    if datos is not None:
        cab["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=datos, method=metodo, headers=cab)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, ""


def _numero(v) -> float | None:
    if isinstance(v, bool) or not isinstance(v, (int, float)):
        return None
    return float(v)


def plan(actual: dict, objetivos: dict[str, int]) -> dict[str, tuple[float, int]]:
    """PURA: {campo: (viejo, nuevo)} solo para campos que EXISTEN, son números y bajan."""
    cambios = {}
    for campo, meta in objetivos.items():
        v = _numero(actual.get(campo)) if isinstance(actual, dict) else None
        if v is not None and v > meta:
            cambios[campo] = (v, meta)
    return cambios


def _n(v: float) -> str:
    return str(int(v)) if float(v).is_integer() else str(v)


def aplicar(servicio: str, ref: str, token: str, http=None, seco: bool = False) -> tuple[list[str], bool]:
    """Lee, decide y (si no es en seco) aplica. Devuelve (líneas para imprimir, ok)."""
    http = http or _http
    url = API + RUTAS[servicio].format(ref=ref)
    objetivos = OBJETIVOS[servicio]
    try:
        estado, texto = http("GET", url, token)
    except Exception as e:
        return ["%s: no se pudo leer (%s)" % (servicio, type(e).__name__)], False
    if estado != 200:
        return ["%s: no se pudo leer (HTTP %d)" % (servicio, estado)], False
    try:
        actual = json.loads(texto or "{}")
    except ValueError:
        return ["%s: respuesta ilegible" % servicio], False
    if not isinstance(actual, dict):
        return ["%s: respuesta inesperada" % servicio], False

    cambios = plan(actual, objetivos)
    lineas = []
    for campo in objetivos:
        if campo not in actual:
            lineas.append("%s.%s: no existe en esta API (se omite)" % (servicio, campo))
        elif campo in cambios:
            viejo, nuevo = cambios[campo]
            lineas.append("%s.%s: %s → %d%s" % (servicio, campo, _n(viejo), nuevo, " (en seco)" if seco else ""))
        elif _numero(actual.get(campo)) is None:
            lineas.append("%s.%s: sin valor numérico (se omite)" % (servicio, campo))
        else:
            lineas.append("%s.%s: %s (ya está en su tope o por debajo)" % (servicio, campo, _n(actual[campo])))
    if not cambios or seco:
        return lineas, True

    cuerpo = {c: nuevo for c, (_v, nuevo) in cambios.items()}
    try:
        estado, _ = http("PATCH", url, token, cuerpo)
    except Exception:
        estado = 0
    if 200 <= estado < 300:
        lineas.append("%s: aplicado (%d campo%s)" % (servicio, len(cuerpo), "" if len(cuerpo) == 1 else "s"))
        return lineas, True
    # Un campo que la API rechaza no debe impedir los demás: UN intento por campo, sin más.
    fallidos = []
    if len(cuerpo) > 1:
        for campo, nuevo in cuerpo.items():
            try:
                e2, _ = http("PATCH", url, token, {campo: nuevo})
            except Exception:
                e2 = 0
            if not 200 <= e2 < 300:
                fallidos.append("%s (HTTP %d)" % (campo, e2))
    else:
        fallidos = ["%s (HTTP %d)" % (next(iter(cuerpo)), estado)]
    if fallidos:
        lineas.append("%s: NO aplicado → %s" % (servicio, ", ".join(fallidos)))
        return lineas, False
    lineas.append("%s: aplicado campo a campo (%d)" % (servicio, len(cuerpo)))
    return lineas, True


def main(argv: list[str] | None = None, http=None, cred: dict | None = None) -> int:
    argv = sys.argv[1:] if argv is None else argv
    seco = "--seco" in argv
    servicios = [s for s in ("postgrest", "auth", "realtime") if not (s == "realtime" and "--sin-realtime" in argv)]
    cred = cred if cred is not None else {"ref": _env("SUPABASE_PROJECT_REF"), "token": _env("SUPABASE_ACCESS_TOKEN")}
    if not cred.get("ref") or not cred.get("token"):
        print("Faltan SUPABASE_PROJECT_REF o SUPABASE_ACCESS_TOKEN en .env.local (sus valores nunca se imprimen).")
        return 2
    todo_ok = True
    realtime_cambio = False
    for s in servicios:
        lineas, ok = aplicar(s, cred["ref"], cred["token"], http, seco)
        todo_ok = todo_ok and ok
        realtime_cambio = realtime_cambio or any(l.startswith("realtime: aplicado") for l in lineas)
        for l in lineas:
            print(l)
    if realtime_cambio:
        print("nota: Realtime cambió; sus clientes se desconectaron una vez y se reconectan solos.")
    return 0 if todo_ok else 1


if __name__ == "__main__":
    sys.exit(main())
