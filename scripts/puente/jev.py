#!/usr/bin/env python3
"""Jev (TypeSafe) por OpenRouter: decisiones tipadas con probabilidad, a precio de nada.

(2026-09-20) Jev NO escribe texto: le das el estado (JSON) y preguntas tipadas y devuelve
respuestas con probabilidad — sí/no (`noul`), una opción (`choice`) o un nivel (`score`).
Medido desde la Mac: 0,56 s y $0,000019 por decisión (448 tokens; la salida es gratis).
Endpoint `POST https://openrouter.ai/api/alpha/decisions`, modelo `~typesafe/jev-latest`.

Reglas de la casa:
- Es CONSEJERO, nunca oráculo: quien lo llama tiene una regla determinista y Jev solo
  afina en la zona de duda o veta con confianza. Sin clave, sin red o con error, todo
  devuelve None y el que llama sigue como si Jev no existiera.
- La clave vive en OPENROUTER_API_KEY (~/.hermes/.env o ~/.starseed/env). Jamás se
  imprime ni se guarda. `STARSEED_JEV=0` lo apaga del todo.
- Cada decisión se anota (llamadas, tokens, coste) en ~/.starseed/jev-uso.json y se
  cachea 6 h por huella del estado+preguntas: la misma pregunta no se paga dos veces.
"""

import hashlib
import json
import os
import re
import time
import urllib.request

URL = "https://openrouter.ai/api/alpha/decisions"
MODELO = "~typesafe/jev-latest"
CACHE = os.path.expanduser("~/.starseed/jev-cache.json")
USO = os.path.expanduser("~/.starseed/jev-uso.json")
ARCHIVOS_DE_CLAVES = ("~/.hermes/.env", "~/.starseed/env")
TTL_S = 6 * 3600
TIEMPO_S = 12

#: Techo de gasto (2026-09-20, Alex recargó 10 $ en OpenRouter: «usarlos con cuidado»).
#: A $0,00002 por decisión, 0,05 $/día son ~2.500 decisiones; 1 $/mes son ~50.000.
#: Pasado el techo, Jev se calla (None) y mandan las reglas deterministas de siempre.
PRESUPUESTO_DIA_USD = float(os.environ.get("STARSEED_JEV_DIA_USD", "0.05"))
PRESUPUESTO_MES_USD = float(os.environ.get("STARSEED_JEV_MES_USD", "1.0"))
URL_SALDO = "https://openrouter.ai/api/v1/credits"
SALDO_TTL_S = 3600

#: Transporte real (se sustituye en las pruebas por una función que no toca la red).
TRANSPORTE = None


def clave():
    """La clave de OpenRouter, del entorno o de los archivos de claves. Nunca se imprime."""
    v = os.environ.get("OPENROUTER_API_KEY")
    if v:
        return v
    for ruta in ARCHIVOS_DE_CLAVES:
        try:
            for linea in open(os.path.expanduser(ruta), encoding="utf-8"):
                m = re.match(r"^\s*(?:export\s+)?OPENROUTER_API_KEY=(.+?)\s*$", linea)
                if m:
                    return m.group(1).strip().strip('"').strip("'")
        except OSError:
            continue
    return None


def activo():
    return os.environ.get("STARSEED_JEV", "1") not in ("0", "no", "false") and bool(
        clave()
    )


def _huella(estado, preguntas):
    return hashlib.sha256(
        json.dumps([estado, preguntas], sort_keys=True, ensure_ascii=False).encode()
    ).hexdigest()[:20]


def _leer(ruta, por_defecto):
    try:
        with open(ruta, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return por_defecto


def _escribir(ruta, datos):
    try:
        os.makedirs(os.path.dirname(ruta) or ".", exist_ok=True)
        tmp = ruta + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(datos, f, ensure_ascii=False)
        os.replace(tmp, ruta)
    except OSError:
        pass


def _cabeceras():
    base = {"Authorization": "Bearer " + clave(), "Content-Type": "application/json"}
    try:
        import openrouter as _orr

        return _orr.cabeceras(URL, base)  # atribución de app (HTTP-Referer, X-Title)
    except Exception:
        return base


def _transporte_real(cuerpo):
    req = urllib.request.Request(
        URL, data=json.dumps(cuerpo).encode("utf-8"), headers=_cabeceras()
    )
    return json.load(urllib.request.urlopen(req, timeout=TIEMPO_S))


def _anotar_uso(respuesta, segundos, hoy=None, medio="openrouter", ms=0.0):
    uso = _leer(USO, {"llamadas": 0, "tokens": 0, "coste_usd": 0.0})
    u = (respuesta or {}).get("usage") or {}
    coste = float(u.get("cost") or 0.0) if medio == "openrouter" else 0.0
    uso["llamadas"] = uso.get("llamadas", 0) + 1
    uso["tokens"] = (
        uso.get("tokens", 0)
        + int(u.get("input_tokens") or 0)
        + int(u.get("output_tokens") or 0)
    )
    uso["coste_usd"] = round(uso.get("coste_usd", 0.0) + coste, 8)
    dia = uso.setdefault("dias", {}).setdefault(
        hoy or time.strftime("%Y-%m-%d"), {"llamadas": 0, "coste_usd": 0.0}
    )
    dia["llamadas"] += 1
    dia["coste_usd"] = round(dia["coste_usd"] + coste, 8)
    pm = uso.setdefault("por_medio", {}).setdefault(
        medio, {"llamadas": 0, "coste_usd": 0.0, "ms": []}
    )
    pm["llamadas"] = pm.get("llamadas", 0) + 1
    pm["coste_usd"] = round(pm.get("coste_usd", 0.0) + coste, 8)
    lista = pm.setdefault("ms", [])
    lista.append(round(float(ms) or 0.0, 1))
    if len(lista) > 200:
        del lista[:-200]
    uso["ultima"] = {
        "t": time.strftime("%Y-%m-%d %H:%M:%S"),
        "segundos": round(segundos, 2),
        "modelo": (respuesta or {}).get("model"),
        "medio": medio,
        "ms": round(float(ms) or 0.0, 1),
    }
    _escribir(USO, uso)


def _anotar_local_sin_respuesta():
    """El local estaba disponible pero no dio decisión: que se vea en el uso."""
    uso = _leer(USO, {})
    uso["local_sin_respuesta"] = int(uso.get("local_sin_respuesta") or 0) + 1
    _escribir(USO, uso)


def _p50(lista):
    """Mediana (p50) de una lista de números; 0.0 si está vacía."""
    s = sorted(float(x) for x in lista if isinstance(x, (int, float)))
    n = len(s)
    if not n:
        return 0.0
    return s[n // 2] if n % 2 else (s[n // 2 - 1] + s[n // 2]) / 2


def gasto(hoy=None):
    """(hoy_usd, mes_usd) según lo anotado en jev-uso.json."""
    hoy = hoy or time.strftime("%Y-%m-%d")
    dias = _leer(USO, {}).get("dias") or {}
    d = float((dias.get(hoy) or {}).get("coste_usd") or 0.0)
    m = sum(
        float((v or {}).get("coste_usd") or 0.0)
        for k, v in dias.items()
        if k[:7] == hoy[:7]
    )
    return d, m


def presupuesto_ok(hoy=None):
    """False cuando el gasto anotado de hoy o del mes ya tocó su techo."""
    d, m = gasto(hoy)
    return d < PRESUPUESTO_DIA_USD and m < PRESUPUESTO_MES_USD


def saldo(refrescar=False):
    """{'creditos', 'gastado', 'restante', 't'} de la cuenta de OpenRouter, cacheado 1 h; None sin red."""
    uso = _leer(USO, {})
    s = uso.get("saldo") or {}
    if s and not refrescar and time.time() - float(s.get("epoch") or 0) < SALDO_TTL_S:
        return s
    if not clave():
        return s or None
    try:
        req = urllib.request.Request(
            URL_SALDO, headers={"Authorization": "Bearer " + clave()}
        )
        d = (json.load(urllib.request.urlopen(req, timeout=TIEMPO_S)) or {}).get(
            "data"
        ) or {}
        s = {
            "creditos": float(d.get("total_credits") or 0),
            "gastado": float(d.get("total_usage") or 0),
            "t": time.strftime("%Y-%m-%d %H:%M:%S"),
            "epoch": time.time(),
        }
        s["restante"] = round(s["creditos"] - s["gastado"], 4)
        uso["saldo"] = s
        _escribir(USO, uso)
        return s
    except Exception:
        return s or None


def _local():
    """Importación perezosa y tolerante de jev_local; None si el módulo no está."""
    try:
        import jev_local

        return jev_local
    except Exception:
        return None


def _intenta_local(jl, estado, preguntas):
    """Decisión del motor local; None si no responde (y queda anotado)."""
    try:
        r = jl.decidir(estado, preguntas)
    except Exception:
        r = None
    if isinstance(r, dict) and r:
        return r
    _anotar_local_sin_respuesta()
    return None


def _intenta_openrouter(estado, preguntas, t0):
    """Decisión de pago vía OpenRouter, con su techo de presupuesto intacto."""
    transporte = TRANSPORTE or (_transporte_real if activo() else None)
    if transporte is None:
        return None, None
    if transporte is _transporte_real and not presupuesto_ok():
        return None, None
    try:
        r = transporte({"model": MODELO, "state": estado, "questions": preguntas})
    except Exception:
        return None, None
    respuestas = (r or {}).get("answers")
    if not isinstance(respuestas, dict) or not respuestas:
        return None, None
    if transporte is _transporte_real:
        _anotar_uso(
            r, time.time() - t0, medio="openrouter", ms=(time.time() - t0) * 1000
        )
    return respuestas, r


def decidir(estado, preguntas, usar_cache=True, medio=None):
    """{nombre: respuesta, 'medio', 'ms'} de Jev, o None si ningún medio responde.

    Local y OpenRouter son dos intentos en secuencia, no un si/sino: si el local está
    disponible se intenta; si devuelve None o lanza, se sigue a OpenRouter igual que si
    no hubiera local. `medio='local'` o `medio='openrouter'` fuerza uno solo.
    """
    if not preguntas:
        return None
    h = _huella(estado, preguntas)
    cache = _leer(CACHE, {}) if usar_cache else {}
    entrada = cache.get(h)
    if entrada and time.time() - entrada.get("t", 0) < TTL_S:
        if medio is None or entrada.get("medio") == medio:
            respuestas = entrada.get("respuestas") or {}
            res = dict(respuestas)
            res["medio"] = entrada.get("medio")
            res["ms"] = entrada.get("ms")
            return res
    t0 = time.time()
    jl = _local()
    respuestas = None
    medio_usado = None
    # Pirámide: local primero si corresponde; si falla (None o excepción), escalada.
    intenta_local = medio in (None, "local")
    intenta_open = medio in (None, "openrouter")
    local_disponible = False
    if intenta_local and jl is not None and hasattr(jl, "disponible"):
        try:
            local_disponible = bool(jl.disponible())
        except Exception:
            local_disponible = False
    if intenta_local and local_disponible:
        respuestas = _intenta_local(jl, estado, preguntas)
        if respuestas is not None:
            medio_usado = "local"
    # Escalada obligatoria: si no hay respuesta y no se forzó solo local.
    if respuestas is None and intenta_open:
        respuestas, _cruda = _intenta_openrouter(estado, preguntas, t0)
        if respuestas is not None:
            medio_usado = "openrouter"
    if respuestas is None:
        return None
    ms = round((time.time() - t0) * 1000, 1)
    res = dict(respuestas)
    res["medio"] = medio_usado
    res["ms"] = ms
    if medio_usado == "local":
        _anotar_uso({}, time.time() - t0, medio="local", ms=ms)
    if usar_cache:
        # Cache separa respuestas de metadatos (evita mezclar 'medio'/'ms' con claves de pregunta).
        cache[h] = {
            "t": time.time(),
            "respuestas": respuestas,
            "medio": medio_usado,
            "ms": ms,
        }
        if len(cache) > 2000:
            cache = dict(
                sorted(cache.items(), key=lambda kv: kv[1].get("t", 0))[-1000:]
            )
        _escribir(CACHE, cache)
    return res


# ── atajos tipados ────────────────────────────────────────────────────────────
def si_no(estado, pregunta, nombre="q"):
    """P(sí) en [0, 1], o None. `noul` en el idioma de Jev."""
    r = decidir(estado, {nombre: {"type": "noul", "instructions": pregunta}})
    # Medido 2026-09-20: la respuesta es {"type": "noul", "noul": 0.44}.
    try:
        a = r[nombre]
        v = a["noul"] if "noul" in a else a["probability"]
        return float(v)
    except (KeyError, TypeError, ValueError):
        return None


def elegir(estado, pregunta, opciones, nombre="q"):
    """(opcion, probabilidades, confianza) o None. `opciones` = {clave: qué significa}."""
    r = decidir(
        estado,
        {
            nombre: {
                "type": "choice",
                "instructions": pregunta,
                "criteria": dict(opciones),
            }
        },
    )
    try:
        a = r[nombre]
        return (
            a["choice"],
            dict(a.get("probabilities") or {}),
            float(a.get("confidence") or 0.0),
        )
    except (KeyError, TypeError, ValueError):
        return None


def puntuar(estado, pregunta, niveles, nombre="q"):
    """(puntuacion, probabilidades, confianza) o None. `niveles` ordenados de menor a mayor."""
    r = decidir(
        estado,
        {
            nombre: {
                "type": "score",
                "instructions": pregunta,
                "criteria": list(niveles),
            }
        },
    )
    try:
        a = r[nombre]
        return (
            float(a["score"]),
            dict(a.get("probabilities") or {}),
            float(a.get("confidence") or 0.0),
        )
    except (KeyError, TypeError, ValueError):
        return None


def zona(p, alto=0.9, bajo=0.6):
    """«si» / «duda» / «no» a partir de una probabilidad, con umbrales explícitos."""
    if p is None:
        return "duda"
    return "si" if p >= alto else ("no" if p < bajo else "duda")


def resumen_uso():
    """Lo que Jev nos ha costado, para el informe de gasto."""
    u = _leer(USO, {})
    if not u:
        return "Jev: sin uso"
    d, m = gasto()
    s = u.get("saldo") or {}
    cola = (
        (" · OpenRouter restante $%.2f" % s["restante"])
        if s.get("restante") is not None
        else ""
    )
    return (
        "Jev: %d decisiones · %d tokens · $%.5f (hoy $%.4f de $%.2f · mes $%.4f de $%.2f)%s"
        % (
            u.get("llamadas", 0),
            u.get("tokens", 0),
            u.get("coste_usd", 0.0),
            d,
            PRESUPUESTO_DIA_USD,
            m,
            PRESUPUESTO_MES_USD,
            cola,
        )
    )


if __name__ == "__main__":
    import sys

    print("activo" if activo() else "apagado (sin OPENROUTER_API_KEY o STARSEED_JEV=0)")
    print(resumen_uso())
    if "--sonda" in sys.argv:
        print(
            si_no(
                {"texto": "publicado 7 commits, verificados uno a uno"},
                "¿Es un aviso importante para el dueño del proyecto?",
            )
        )
