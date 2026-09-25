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
LAYA_URL = os.environ.get("STARSEED_LAYA_URL", "http://127.0.0.1:4470/v1/systemone")
CONCESION = os.path.expanduser(
    os.environ.get("STARSEED_CONVERSACION", "~/.starseed/conversacion.json")
)
CACHE = os.path.expanduser("~/.starseed/jev-cache.json")
USO = os.path.expanduser("~/.starseed/jev-uso.json")
ARCHIVOS_DE_CLAVES = ("~/.hermes/.env", "~/.starseed/env")
TTL_S = 6 * 3600
TIEMPO_S = 12

#: Techo de gasto (2026-09-20, Alex recargó 10 $ en OpenRouter: «usarlos con cuidado»).
#: A $0,00002 por decisión, 0,20 $/día son ~10.000 decisiones; 2 $/mes son ~100.000.
#: Pasado el techo, Jev se calla (None) y mandan las reglas deterministas de siempre.
#:
#: (2026-09-21) Alex sube el techo diario de 0,05 a 0,20: «Jev tiene permitido gastar
#: más ya que nos ahorra bastante». El gasto real acumulado en tres días es de 0,0139 $
#: —571 decisiones hoy por 0,0089 $—, asi que 0,20 es holgura de verdad, no un cheque
#: en blanco: sigue siendo menos de un céntimo por cada cien decisiones. El techo
#: MENSUAL sube a 2 $ para que el diario quepa diez veces sin chocar con él.
PRESUPUESTO_DIA_USD = float(os.environ.get("STARSEED_JEV_DIA_USD", "0.20"))
PRESUPUESTO_MES_USD = float(os.environ.get("STARSEED_JEV_MES_USD", "2.0"))
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


#: Capas intermedias: se salta al que de verdad pregunta (veredictos, telegram…).
_INTERMEDIOS = {"jev", "razonador", "jev_enrutado", "director_jev"}
#: (2026-09-25) Circuito del motor local: tras 3 intentos sin respuesta, se aparta 10 min.
#: Con la Mac saturada cada intento costaba 6 s de espera antes de ir a OpenRouter.
LOCAL_FALLOS_MAX = 3
LOCAL_PAUSA_S = 600


def _quien():
    """Nombre corto del módulo que pregunta a Jev (sin claves ni rutas)."""
    import sys as _sys

    f = _sys._getframe(1)
    visto = None
    while f is not None:
        g = f.f_globals
        nombre = g.get("__name__") or ""
        if nombre == "__main__":
            nombre = os.path.splitext(os.path.basename(g.get("__file__") or "script"))[0]
        corto = nombre.rsplit(".", 1)[-1]
        if corto and corto not in _INTERMEDIOS:
            return corto[:40]
        visto = visto or corto
        f = f.f_back
    return (visto or "desconocido")[:40]


def _sumar(d, clave, n=1):
    d[clave] = int(d.get(clave) or 0) + n


def _anotar_uso(respuesta, segundos, hoy=None, medio="openrouter", ms=0.0, quien=None, tipos=()):
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
    # (2026-09-25) Quién pregunta y qué habilidad usa (sí/no, elección, puntuación): el
    # medidor enseña si Jev de verdad trabaja en todos los medios o solo en uno.
    if quien:
        _sumar(dia.setdefault("por_quien", {}), quien)
        _sumar(uso.setdefault("por_quien", {}), quien)
    for t in tipos or ():
        _sumar(dia.setdefault("por_tipo", {}), t)
        _sumar(uso.setdefault("por_tipo", {}), t)
    if medio in ("local", "laya-local"):
        uso["local_fallos_seguidos"] = 0
    # (2026-09-21) El desglose por medio vivia SOLO al nivel global del archivo, y el
    # medidor del Puente lo busca dentro de cada dia: por eso enseñaba «local 0 ·
    # openrouter 0» llevando 892 decisiones. Se anota tambien por dia, que es la pregunta
    # que de verdad se hace quien mira el medidor: hoy, ¿cuanto fue gratis y cuanto no?
    pm_dia = dia.setdefault("por_medio", {}).setdefault(
        medio, {"llamadas": 0, "coste_usd": 0.0, "ms": []}
    )
    pm_dia["llamadas"] = pm_dia.get("llamadas", 0) + 1
    pm_dia["coste_usd"] = round(pm_dia.get("coste_usd", 0.0) + coste, 8)
    lista_dia = pm_dia.setdefault("ms", [])
    lista_dia.append(round(float(ms) or 0.0, 1))
    if len(lista_dia) > 200:
        del lista_dia[:-200]
    # Y los techos se escriben AQUI, donde se deciden. El medidor los llevaba escritos a
    # mano (0,05 y 1) y siguio enseñandolos despues de subirlos a 0,20 y 2: dos sitios
    # para el mismo numero, otra vez. Quien manda es este archivo.
    uso["topes"] = {"dia": PRESUPUESTO_DIA_USD, "mes": PRESUPUESTO_MES_USD}
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


def _anotar_local_sin_respuesta(ahora=None):
    """El local estaba disponible pero no dio decisión: que se vea en el uso.

    Tras LOCAL_FALLOS_MAX seguidos, el local se aparta LOCAL_PAUSA_S: así una Mac
    saturada no le suma 6 s de espera a cada decisión antes de ir a OpenRouter.
    """
    ahora = ahora or time.time()
    uso = _leer(USO, {})
    uso["local_sin_respuesta"] = int(uso.get("local_sin_respuesta") or 0) + 1
    dia = uso.setdefault("dias", {}).setdefault(time.strftime("%Y-%m-%d"), {"llamadas": 0, "coste_usd": 0.0})
    _sumar(dia, "local_sin_respuesta")
    uso["local_fallos_seguidos"] = int(uso.get("local_fallos_seguidos") or 0) + 1
    if uso["local_fallos_seguidos"] >= LOCAL_FALLOS_MAX:
        uso["local_pausa_hasta"] = ahora + LOCAL_PAUSA_S
        uso["local_fallos_seguidos"] = 0
    _escribir(USO, uso)


def local_en_pausa(ahora=None):
    return float(_leer(USO, {}).get("local_pausa_hasta") or 0) > (ahora or time.time())


def _anotar_cache(quien=None):
    """Una respuesta servida de la caché: gratis e instantánea; también cuenta."""
    uso = _leer(USO, {})
    dia = uso.setdefault("dias", {}).setdefault(time.strftime("%Y-%m-%d"), {"llamadas": 0, "coste_usd": 0.0})
    _sumar(dia, "cache")
    _sumar(uso, "cache")
    if quien:
        _sumar(dia.setdefault("por_quien_cache", {}), quien)
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


def conversando(ruta=None, ahora=None):
    """True si hay una conversación en vivo con Astraura ahora mismo."""
    try:
        with open(ruta or CONCESION, encoding="utf-8") as f:
            hasta = float((json.load(f) or {}).get("hasta") or 0)
    except (OSError, ValueError, TypeError, AttributeError):
        return False
    return hasta > (time.time() if ahora is None else ahora)


def decidir_con_laya(estado, preguntas, timeout=1.5, url=None):
    """Consulta a Laya local (SystemOne en 127.0.0.1:4470/v1/systemone).

    Devuelve un diccionario con las respuestas y motor: "laya-local",
    o None si no responde, responde 503/error o hay conversación en curso.
    """
    if conversando():
        return None
    endpoint = url or os.environ.get("STARSEED_LAYA_URL", LAYA_URL)
    cuerpo = {"state": estado, "questions": preguntas}
    try:
        req = urllib.request.Request(
            endpoint,
            data=json.dumps(cuerpo, ensure_ascii=False).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            if resp.status != 200:
                return None
            res_data = json.loads(resp.read().decode("utf-8"))
            if not isinstance(res_data, dict):
                return None
            respuestas = dict(
                res_data.get("answers")
                if "answers" in res_data and isinstance(res_data["answers"], dict)
                else res_data
            )
            respuestas["motor"] = "laya-local"
            return respuestas
    except Exception:
        return None


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


def _intenta_openrouter(estado, preguntas, t0, quien=None):
    """Decisión de pago vía OpenRouter, con su techo de presupuesto intacto.

    (2026-09-25) La latencia se mide desde que empieza ESTA llamada: antes contaba
    desde el principio de `decidir`, con los 6 s del intento local dentro, y el
    medidor enseñaba p50 de 6,5 s cuando OpenRouter tarda ~2,5 s.
    """
    t0 = time.time()
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
            r, time.time() - t0, medio="openrouter", ms=(time.time() - t0) * 1000,
            quien=quien, tipos=[(q or {}).get("type") for q in preguntas.values() if isinstance(q, dict)],
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
    quien = _quien()
    tipos = [(q or {}).get("type") for q in preguntas.values() if isinstance(q, dict)]
    h = _huella(estado, preguntas)
    cache = _leer(CACHE, {}) if usar_cache else {}
    entrada = cache.get(h)
    if entrada and time.time() - entrada.get("t", 0) < TTL_S:
        if medio is None or entrada.get("medio") == medio:
            _anotar_cache(quien)
            respuestas = entrada.get("respuestas") or {}
            res = dict(respuestas)
            res["medio"] = entrada.get("medio")
            res["ms"] = entrada.get("ms")
            return res
    t0 = time.time()
    jl = _local()
    respuestas = None
    medio_usado = None
    # Pirámide: BitNet local -> Laya local -> OpenRouter remoto.
    intenta_local = medio in (None, "local")
    intenta_laya = medio in (None, "laya", "laya-local")
    intenta_open = medio in (None, "openrouter")
    local_disponible = False
    if intenta_local and medio is None and local_en_pausa():
        intenta_local = False  # circuito abierto: el local no contestó las últimas veces
    if intenta_local and jl is not None and hasattr(jl, "disponible"):
        try:
            local_disponible = bool(jl.disponible())
        except Exception:
            local_disponible = False
    if intenta_local and local_disponible:
        respuestas = _intenta_local(jl, estado, preguntas)
        if respuestas is not None:
            medio_usado = "local"
    # Capa local Laya (SystemOne) antes del Jev remoto
    if respuestas is None and intenta_laya:
        resp_laya = decidir_con_laya(estado, preguntas)
        if resp_laya is not None:
            respuestas = resp_laya
            medio_usado = "laya-local"
    # Escalada obligatoria: si no hay respuesta y no se forzó solo local.
    if respuestas is None and intenta_open:
        respuestas, _cruda = _intenta_openrouter(estado, preguntas, t0, quien=quien)
        if respuestas is not None:
            medio_usado = "openrouter"
    if respuestas is None:
        return None
    ms = round((time.time() - t0) * 1000, 1)
    res = dict(respuestas)
    res["medio"] = medio_usado
    res["ms"] = ms
    if medio_usado in ("local", "laya-local"):
        _anotar_uso({}, time.time() - t0, medio=medio_usado, ms=ms, quien=quien, tipos=tipos)
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


def reiniciar_limite(dia=True, mes=False):
    """Pone a cero el gasto contado de hoy (y opcionalmente del mes). Devuelve el nuevo estado.

    (2026-09-21, pedido por Alex) El techo existe para que Jev no se lleve el crédito
    de OpenRouter por sorpresa, no para dejar al enjambre sin consejero a media tarde.
    Cuando el techo se agota y el trabajo lo merece, esto lo libera sin tocar ningún
    archivo de claves ni subir el techo de forma permanente: el techo sigue siendo el
    mismo, lo que se reinicia es el CONTADOR.

    No se borra el histórico: `llamadas`, `tokens` y `coste_usd` acumulados se
    conservan, y el día reiniciado queda anotado en `reinicios` con su hora y lo que
    llevaba gastado. Un botón que borra la contabilidad sin dejar rastro es justo lo
    que no queremos: el gasto real tiene que poder auditarse después.
    """
    u = _leer(USO, {})
    hoy = time.strftime("%Y-%m-%d")
    mes_actual = hoy[:7]
    reinicios = list(u.get("reinicios") or [])
    dias = dict(u.get("dias") or {})
    borrado = {}
    if dia and hoy in dias:
        borrado["dia"] = dias[hoy].get("coste_usd", 0.0)
        dias[hoy] = {"llamadas": 0, "coste_usd": 0.0}
    if mes:
        for k in list(dias):
            if k.startswith(mes_actual):
                borrado["mes"] = borrado.get("mes", 0.0) + dias[k].get("coste_usd", 0.0)
                dias[k] = {"llamadas": 0, "coste_usd": 0.0}
    if borrado:
        reinicios.append(
            {
                "t": time.strftime("%Y-%m-%d %H:%M:%S"),
                "alcance": "mes" if mes else "dia",
                "gastado": borrado,
            }
        )
        u["dias"] = dias
        u["reinicios"] = reinicios[-50:]
        _escribir(USO, u)
    d, m = gasto()
    return {
        "reiniciado": bool(borrado),
        "gastado_antes": borrado,
        "hoy_usd": d,
        "mes_usd": m,
        "tope_dia_usd": PRESUPUESTO_DIA_USD,
        "tope_mes_usd": PRESUPUESTO_MES_USD,
        "reinicios": len(reinicios),
    }


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


def contrato(peticion):
    """Contrato openjev de /api/jev/systemone: lista de preguntas → lista de respuestas.

    (2026-09-25) La ruta lanzaba `python3 jev.py` y le pasaba la petición por stdin,
    pero jev.py no la leía: imprimía su resumen y la ruta contestaba «respuesta
    ilegible» siempre. Ahora `--contrato` lee {state, questions:[{id,type,question,
    options,levels}], medio?} y devuelve {answers:[{id, answer, probs, confidence}]}.
    """
    preguntas, orden = {}, []
    for q in (peticion or {}).get("questions") or []:
        if not isinstance(q, dict) or not q.get("id"):
            continue
        t = q.get("type")
        # openjev escribe la pregunta en «instructions»; el contrato del OS, en «question».
        jq = {"type": t, "instructions": str(q.get("question") or q.get("instructions") or "")}
        if t == "choice":
            jq["criteria"] = {str(o): str(o) for o in (q.get("options") or [])}
        elif t == "score":
            jq["criteria"] = [str(n) for n in (q.get("levels") or [])]
        preguntas[str(q["id"])] = jq
        orden.append(q)
    estado = (peticion or {}).get("state")
    medio = (peticion or {}).get("medio")
    r = decidir(estado if isinstance(estado, dict) else {"estado": estado}, preguntas,
                medio=medio if medio in ("local", "laya", "openrouter") else None) if preguntas else None
    answers = []
    for q in orden:
        a = (r or {}).get(str(q["id"])) or {}
        t = q.get("type")
        if t == "noul" and "noul" in a:
            p = float(a["noul"])
            answers.append({"id": q["id"], "answer": "sí" if p >= 0.5 else "no",
                            "probs": {"sí": p, "no": 1 - p}, "confidence": max(p, 1 - p)})
        elif t == "choice" and "choice" in a:
            answers.append({"id": q["id"], "answer": str(a["choice"]),
                            "probs": dict(a.get("probabilities") or {}),
                            "confidence": float(a.get("confidence") or 0)})
        elif t == "score" and "score" in a:
            niveles = [str(n) for n in (q.get("levels") or [])]
            # (2026-09-25) «score» es el valor ESPERADO (2.89 con el 91 % en el nivel 3):
            # truncarlo daba «bastante» cuando Jev decía «total». Se redondea, y las
            # probabilidades salen con el nombre de cada nivel, no con su índice.
            i = int(round(float(a["score"])))
            nombre = lambda k: niveles[int(k)] if str(k).isdigit() and int(k) < len(niveles) else str(k)
            answers.append({"id": q["id"], "answer": niveles[i] if 0 <= i < len(niveles) else str(i),
                            "probs": {nombre(k): v for k, v in (a.get("probabilities") or {}).items()},
                            "confidence": float(a.get("confidence") or 0)})
    return {"answers": answers, "medio": (r or {}).get("medio"), "ms": (r or {}).get("ms")}


if __name__ == "__main__":
    import sys

    if "--contrato" in sys.argv:
        try:
            peticion = json.loads(sys.stdin.read() or "{}")
        except ValueError:
            peticion = {}
        print(json.dumps(contrato(peticion), ensure_ascii=False))
        sys.exit(0)
    print("activo" if activo() else "apagado (sin OPENROUTER_API_KEY o STARSEED_JEV=0)")
    print(resumen_uso())
    if "--sonda" in sys.argv:
        print(
            si_no(
                {"texto": "publicado 7 commits, verificados uno a uno"},
                "¿Es un aviso importante para el dueño del proyecto?",
            )
        )
