# -*- coding: utf-8 -*-
"""Director de consumo: que ningún medio desperdicie créditos ni datos.

(2026-09-25) Alex, tras quedarse sin inicio de sesión porque Genesis agotó el tráfico
gratuito de Supabase: «los directores deben supervisar que no haya medios donde se
desperdicien créditos o datos de ningún tipo». El director de orquestación lanza esto
cada 15 min. Mide sin gastar: los registros de Supabase por la API de gestión (cero
tráfico de salida del proyecto) y los contadores locales de Jev. Escribe
`~/.starseed/consumo.json` (lo lee el parte horario y el medidor «Consumo y créditos» de Genesis) y avisa en el canal solo cuando aparece una alerta nueva. Nunca imprime claves:
solo nombres, rutas y números.

(2026-09-29) PRESUPUESTO DIARIO, FRENO Y BUCLES. El proyecto quedó bloqueado otra vez por
salida (egress) el 28-09 22:00 UTC, tres días después de volver a usarse. Alex: «ya no
pueden haber errores de ese tipo que consuman los créditos» y «en Supabase agrega límites
de gastos diarios si es posible». El plan gratuito de Supabase NO tiene límite de gasto
diario: estos límites son NUESTROS, y se aplican así:

  · Por día UTC: peticiones (recuento de edge_logs) y salida ESTIMADA en bytes (suma de
    `content-length` de las respuestas que lo traen + media por ruta × las que no; sin
    ninguna medida, tamaño típico por tipo de ruta) + Realtime ESTIMADO (escrituras ×
    suscriptores × tamaño de evento: los registros de Realtime no cuentan mensajes).
    Historial de 45 días en `~/.starseed/consumo-historial.json`.
  · Presupuestos en `~/.starseed/presupuestos.json` (se crea con los valores del contrato;
    Genesis los edita). Al 70 % → aviso una vez al día. Al 100 % → FRENO REMOTO: una sola
    escritura en `public.os_freno` (id=1) con la clave de servicio; los clientes lo leen y
    frenan sus sondeos hasta las 00:00 UTC. Pasada esa hora (o si ya no se supera) → se
    apaga con otra escritura.
  · Si el proyecto ya responde 402 no se escribe nada: solo `restringido: true`.
  · Detector de BUCLES: una ruta > 1.500 peticiones/h o un agente (user-agent) + ruta
    > 800/h → alerta con la ruta y el agente (sin claves). Es la alarma de «loops erróneos».
  · Nunca reintenta en bucle: un fallo de escritura espera 1 h; «tabla inexistente»
    (migración pendiente) avisa una vez y no se vuelve a intentar ese día; un fallo de la
    API de registros corta la vuelta entera.
"""
import datetime as dt
import json
import os
import re
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request

RAIZ = os.environ.get("STARSEED_ROOT") or "/Users/alex/Documents/starseed-os-main"
DIRECTORIO = os.path.expanduser("~/.starseed")
SALIDA = os.path.join(DIRECTORIO, "consumo.json")
HISTORIAL = os.path.join(DIRECTORIO, "consumo-historial.json")
PRESUPUESTOS = os.path.join(DIRECTORIO, "presupuestos.json")
JEV_USO = os.path.join(DIRECTORIO, "jev-uso.json")
#: Umbrales por hora. El plan gratuito da 5 GB de salida al mes (~7 MB por hora).
UMBRALES = {"total_hora": 4000, "fuente_hora": 1500, "pesadas_hora": 20, "jev_techo": 0.8, "saldo_min": 2.0}

#: Valores del contrato «consumo» (2026-09-29). 5 GB / 30 días ≈ 166 MB: 150 deja margen.
PRESUPUESTOS_POR_DEFECTO = {
    "supabase_peticiones_dia": 25000,
    "supabase_mb_dia": 150,
    "supabase_mb_ciclo": 5120,
    "ciclo_inicio": None,
    "jev_usd_dia": 0.05,
    "openrouter_usd_min_saldo": 2.0,
}
AVISO_PCT = 0.70
FRENO_PCT = 1.00
BUCLE_RUTA_HORA = 1500
BUCLE_UA_RUTA_HORA = 800
#: Un mismo bucle se vuelve a avisar como mucho cada 3 h (no a cada vuelta de 15 min).
BUCLE_REAVISO_S = 3 * 3600
#: Tras un fallo al escribir el freno, la siguiente escritura espera 1 h.
REINTENTO_FRENO_S = 3600
DIAS_HISTORIAL = 45
MB = 1024 * 1024
#: Estimación de Realtime (documentada): cada escritura por REST en una tabla publicada se
#: reenvía a cada suscriptor. 3 = pestañas típicas abiertas a la vez; 800 B por evento.
REALTIME_SUSCRIPTORES = 3
REALTIME_BYTES_EVENTO = 800
#: Una respuesta de error (4xx/5xx) sin tamaño: cuerpo JSON corto.
BYTES_ERROR = 250
#: Tamaño típico de respuesta por tipo de ruta, para cuando no hay NINGUNA medida de la ruta.
TAMANO_POR_DEFECTO = (
    ("/auth/v1/token", 1800),
    ("/auth/v1/user", 1200),
    ("/auth/v1/", 800),
    ("/rest/v1/rpc/", 1500),
    ("/rest/v1/", 2000),
    ("/storage/v1/object", 60000),
    ("/realtime/v1/", 500),
    ("/functions/v1/", 2000),
)
TAMANO_OTRO = 1000
AGENTE = "starseed-vigia-consumo/1.0"
LIMITE_FILAS = 1000

SQL = (
    "select log_attributes['request.path'] as ruta, log_attributes['request.headers.user_agent'] as ua, "
    "log_attributes['response.status_code'] as st, count() as n, "
    "countIf(match(log_attributes['request.search'], 'limit=([5-9][0-9]{2}|[0-9]{4,})') "
    "and position(log_attributes['request.search'], 'id=gt') = 0) as pesadas "
    "from logs where source='edge_logs' group by ruta, ua, st order by n desc limit 200"
)
#: El día entero (UTC) por ruta, método y estado, con los bytes que SÍ vienen medidos.
#: `realtime_logs` va en la misma consulta: si la fuente no existe, simplemente no hay filas.
SQL_DIA = (
    "select source as fuente, log_attributes['request.path'] as ruta, "
    "log_attributes['request.method'] as metodo, "
    "toInt32OrZero(log_attributes['response.status_code']) as st, count() as n, "
    "sum(toInt64OrZero(log_attributes['response.headers.content_length'])) as bytes, "
    "countIf(toInt64OrZero(log_attributes['response.headers.content_length']) > 0) as con_tamano "
    "from logs where source in ('edge_logs', 'realtime_logs') "
    "group by fuente, ruta, metodo, st order by n desc limit %d" % LIMITE_FILAS
)
#: Respaldo si la consulta con tamaños falla: solo recuentos (los bytes quedan estimados).
SQL_DIA_SIMPLE = (
    "select 'edge_logs' as fuente, log_attributes['request.path'] as ruta, "
    "log_attributes['request.method'] as metodo, "
    "toInt32OrZero(log_attributes['response.status_code']) as st, count() as n "
    "from logs where source = 'edge_logs' group by ruta, metodo, st order by n desc limit %d" % LIMITE_FILAS
)


# ─── entrada y salida ────────────────────────────────────────────────────────────────


def _env(nombre):
    try:
        for l in open(os.path.join(RAIZ, ".env.local"), encoding="utf-8"):
            if l.startswith(nombre + "="):
                return l.split("=", 1)[1].strip().strip('"').strip("'")
    except OSError:
        pass
    return os.environ.get(nombre, "")


def _http(metodo, url, cabeceras, cuerpo=None, timeout=30):
    """(estado, texto). Un error HTTP devuelve su código; uno de red, lanza."""
    datos = json.dumps(cuerpo).encode("utf-8") if cuerpo is not None else None
    req = urllib.request.Request(url, data=datos, method=metodo, headers=dict(cabeceras, **{"User-Agent": AGENTE}))
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        try:
            texto = e.read().decode("utf-8", "replace")
        except Exception:
            texto = ""
        return e.code, texto


def _leer_json(ruta, por_defecto):
    try:
        with open(ruta, encoding="utf-8") as f:
            d = json.load(f)
        return d if isinstance(d, type(por_defecto)) else por_defecto
    except (OSError, ValueError):
        return por_defecto


def _guardar_json(ruta, datos):
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(ruta), suffix=".tmp")
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        json.dump(datos, f, ensure_ascii=False, indent=1)
    os.replace(tmp, ruta)


def credenciales():
    return {
        "ref": _env("SUPABASE_PROJECT_REF"),
        "token": _env("SUPABASE_ACCESS_TOKEN"),
        "url": _env("NEXT_PUBLIC_SUPABASE_URL").rstrip("/"),
        "clave": _env("SUPABASE_SERVICE_ROLE_KEY"),
    }


def _iso(t):
    return t.strftime("%Y-%m-%dT%H:%M:%SZ")


def consulta_registros(sql, inicio, fin, http=None, cred=None):
    """Filas de la API de registros (ClickHouse) entre dos instantes UTC, o None."""
    cred = cred if cred is not None else credenciales()
    if not cred.get("ref") or not cred.get("token"):
        return None
    q = urllib.parse.urlencode({"sql": sql, "iso_timestamp_start": _iso(inicio), "iso_timestamp_end": _iso(fin)})
    url = "https://api.supabase.com/v1/projects/%s/analytics/endpoints/logs?%s" % (cred["ref"], q)
    try:
        estado, texto = (http or _http)("GET", url, {"Authorization": "Bearer " + cred["token"]})
        if estado != 200:
            return None
        cuerpo = json.loads(texto or "{}")
        if not isinstance(cuerpo, dict) or cuerpo.get("error"):
            return None
        return cuerpo.get("result") or []
    except Exception:
        return None


def filas_supabase(horas=1, http=None, ahora=None, cred=None):
    """[{ruta, ua, st, n, pesadas}] de la última hora, o None si no se pudo medir."""
    fin = ahora or dt.datetime.now(dt.timezone.utc)
    return consulta_registros(SQL, fin - dt.timedelta(hours=horas), fin, http, cred)


def estado_jev(hoy=None):
    try:
        uso = json.load(open(JEV_USO, encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    dia = (uso.get("dias") or {}).get(hoy or dt.date.today().isoformat()) or {}
    techo = float((uso.get("topes") or {}).get("dia") or 0.2)
    saldo = (uso.get("saldo") or {}).get("restante")
    return {"coste_hoy": float(dia.get("coste_usd") or 0), "techo_dia": techo,
            "saldo": float(saldo) if saldo is not None else None}


# ─── lógica pura ─────────────────────────────────────────────────────────────────────


def evaluar(filas, jev, u=UMBRALES):
    """PURA: lista de alertas (texto llano) a partir de lo medido."""
    alertas = []
    if filas is not None:
        total = sum(int(f.get("n") or 0) for f in filas)
        if any(str(f.get("st")) == "402" for f in filas):
            alertas.append("CRÍTICO · Supabase responde 402: el proyecto está restringido por cuota")
        if total > u["total_hora"]:
            alertas.append("Supabase: %d peticiones en la última hora (tope %d)" % (total, u["total_hora"]))
        for f in filas:
            if int(f.get("n") or 0) > u["fuente_hora"]:
                alertas.append("Supabase: %s desde «%s» · %s peticiones/h"
                               % (f.get("ruta"), (f.get("ua") or "?")[:40], f.get("n")))
        pesadas = sum(int(f.get("pesadas") or 0) for f in filas)
        if pesadas > u["pesadas_hora"]:
            alertas.append("Supabase: %d consultas pesadas (limit ≥ 500 sin id=gt) en 1 h" % pesadas)
    if jev.get("techo_dia") and jev.get("coste_hoy", 0) > u["jev_techo"] * jev["techo_dia"]:
        alertas.append("Jev: $%.4f hoy, más del %d %% del techo diario" % (jev["coste_hoy"], u["jev_techo"] * 100))
    if jev.get("saldo") is not None and jev["saldo"] < u["saldo_min"]:
        alertas.append("OpenRouter: quedan $%.2f de saldo" % jev["saldo"])
    return alertas


def miles(n):
    """12345 → «12.345» (como se escribe en español)."""
    return "{:,}".format(int(round(n))).replace(",", ".")


_UUID = re.compile(r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}")
_LARGO = re.compile(r"[A-Za-z0-9_\-+=]{24,}")
_JWT = re.compile(r"eyJ[A-Za-z0-9_\-]+(\.[A-Za-z0-9_\-]+)*")
_CLAVE = re.compile(r"sb_(secret|publishable)_[A-Za-z0-9_\-]+")


def sanitizar_ruta(ruta):
    """Sin consulta, sin identificadores ni fichas: «/rest/v1/posts», «/storage/v1/object/:id»."""
    r = str(ruta or "").split("?", 1)[0]
    r = _JWT.sub(":id", r)
    r = _CLAVE.sub(":id", r)
    r = _UUID.sub(":id", r)
    r = "/".join(":id" if _LARGO.fullmatch(p or "") else p for p in r.split("/"))
    return (r or "?")[:90]


def sanitizar_ua(ua):
    """El agente sin nada que parezca una clave, recortado."""
    t = str(ua or "?")
    t = _JWT.sub("…", t)
    t = _CLAVE.sub("…", t)
    t = _LARGO.sub("…", t)
    return t[:60]


def tamano_tipico(ruta):
    for prefijo, bytes_ in TAMANO_POR_DEFECTO:
        if ruta.startswith(prefijo):
            return bytes_
    return TAMANO_OTRO


def resumen_dia(filas):
    """PURA: filas de SQL_DIA (o SQL_DIA_SIMPLE) → el día resumido.

    Bytes: lo medido (content-length) + para lo que no trae tamaño, la media de lo medido de
    ESA ruta; sin ninguna medida de la ruta, su tamaño típico; los errores, 250 B. Realtime
    se estima aparte (escrituras × suscriptores × tamaño de evento) y se suma marcado."""
    rutas = {}
    registros_realtime = 0
    for f in filas or []:
        n = int(f.get("n") or 0)
        if str(f.get("fuente") or "edge_logs") == "realtime_logs":
            registros_realtime += n
            continue
        ruta = sanitizar_ruta(f.get("ruta"))
        c = rutas.setdefault(ruta, {"n": 0, "bytes_medidos": 0, "con_tamano": 0, "sin_ok": 0, "sin_error": 0,
                                    "escrituras": 0, "c402": 0})
        st = int(f.get("st") or 0)
        con = int(f.get("con_tamano") or 0)
        c["n"] += n
        c["bytes_medidos"] += int(f.get("bytes") or 0)
        c["con_tamano"] += con
        sin = max(0, n - con)
        if st >= 400:
            c["sin_error"] += sin
        else:
            c["sin_ok"] += sin
        if st == 402:
            c["c402"] += n
        metodo = str(f.get("metodo") or "").upper()
        if metodo in ("POST", "PATCH", "PUT", "DELETE") and ruta.startswith("/rest/v1/") and 200 <= st < 300:
            c["escrituras"] += n
    peticiones = bytes_medidos = bytes_est = medidas = escrituras = c402 = 0
    top = []
    for ruta, c in rutas.items():
        media = c["bytes_medidos"] / c["con_tamano"] if c["con_tamano"] else tamano_tipico(ruta)
        est = c["bytes_medidos"] + c["sin_ok"] * media + c["sin_error"] * BYTES_ERROR
        peticiones += c["n"]
        bytes_medidos += c["bytes_medidos"]
        bytes_est += est
        medidas += c["con_tamano"]
        escrituras += c["escrituras"]
        c402 += c["c402"]
        top.append({"ruta": ruta, "n": c["n"], "bytes_est": int(est)})
    top.sort(key=lambda x: (-x["n"], x["ruta"]))
    realtime_est = escrituras * REALTIME_SUSCRIPTORES * REALTIME_BYTES_EVENTO
    return {
        "peticiones": peticiones,
        "bytes_rest_est": int(bytes_est),
        "bytes_medidos": int(bytes_medidos),
        "fraccion_medida": round(medidas / peticiones, 3) if peticiones else None,
        "realtime": {"bytes_est": int(realtime_est), "escrituras": escrituras,
                     "registros": registros_realtime, "estimado": True},
        "bytes_est": int(bytes_est + realtime_est),
        "c402": c402,
        "top": top[:5],
        "truncado": len(filas or []) >= LIMITE_FILAS,
    }


def normalizar_presupuestos(crudo):
    """PURA: une lo guardado con los valores por defecto; lo inválido vuelve al defecto."""
    p = dict(PRESUPUESTOS_POR_DEFECTO)
    if not isinstance(crudo, dict):
        return p
    for k in ("supabase_peticiones_dia", "supabase_mb_dia", "supabase_mb_ciclo", "jev_usd_dia", "openrouter_usd_min_saldo"):
        try:
            v = float(crudo.get(k))
            if v > 0 or (k == "openrouter_usd_min_saldo" and v >= 0):
                p[k] = v
        except (TypeError, ValueError):
            pass
    ci = crudo.get("ciclo_inicio")
    if isinstance(ci, str) and re.fullmatch(r"\d{4}-\d{2}-\d{2}", ci):
        try:
            dt.date.fromisoformat(ci)
            p["ciclo_inicio"] = ci
        except ValueError:
            pass
    return p


def cargar_presupuestos(ruta=None):
    """Lee `presupuestos.json`; si no existe, lo crea con los valores del contrato."""
    ruta = ruta or PRESUPUESTOS
    if not os.path.exists(ruta):
        try:
            _guardar_json(ruta, dict(PRESUPUESTOS_POR_DEFECTO))
        except OSError:
            pass
        return dict(PRESUPUESTOS_POR_DEFECTO)
    return normalizar_presupuestos(_leer_json(ruta, {}))


def _sumar_meses(d, meses):
    m = d.month - 1 + meses
    anio, mes = d.year + m // 12, m % 12 + 1
    ultimo = [31, 29 if anio % 4 == 0 and (anio % 100 != 0 or anio % 400 == 0) else 28,
              31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mes - 1]
    return dt.date(anio, mes, min(d.day, ultimo))


def ciclo_actual(ciclo_inicio, hoy, primer_dia):
    """PURA: (inicio del ciclo vigente, días que le quedan o None, supuesto).

    Con `ciclo_inicio` conocido, los ciclos son mensuales desde esa fecha. Sin él, se supone
    que el ciclo empezó el primer día del historial (y no se sabe cuánto le queda)."""
    if ciclo_inicio:
        base = dt.date.fromisoformat(ciclo_inicio)
        if base > hoy:
            return base, (base - hoy).days, False
        k = 0
        while _sumar_meses(base, k + 1) <= hoy:
            k += 1
        inicio = _sumar_meses(base, k)
        return inicio, (_sumar_meses(base, k + 1) - hoy).days, False
    return (primer_dia or hoy), None, True


def mb_del_ciclo(dias, inicio, hoy):
    total = 0
    for d, v in (dias or {}).items():
        try:
            fecha = dt.date.fromisoformat(d)
        except ValueError:
            continue
        if inicio <= fecha <= hoy:
            total += int((v or {}).get("bytes_est") or 0)
    return total / MB


def evaluar_presupuesto(hoy, mb_ciclo, p, restringido=False):
    """PURA: nivel del día (ok · aviso · freno · restringido) con sus porcentajes y el motivo."""
    pct_pet = hoy["peticiones"] / p["supabase_peticiones_dia"]
    pct_mb = hoy["bytes_est"] / MB / p["supabase_mb_dia"]
    pct_ciclo = mb_ciclo / p["supabase_mb_ciclo"]
    pct = max(pct_pet, pct_mb, pct_ciclo)
    if pct == pct_pet:
        motivo = "%s peticiones de %s" % (miles(hoy["peticiones"]), miles(p["supabase_peticiones_dia"]))
    elif pct == pct_mb:
        motivo = "%.0f MB estimados de %s MB" % (hoy["bytes_est"] / MB, miles(p["supabase_mb_dia"]))
    else:
        motivo = "%.0f MB del ciclo de %s MB" % (mb_ciclo, miles(p["supabase_mb_ciclo"]))
    if restringido:
        nivel = "restringido"
    elif pct >= FRENO_PCT:
        nivel = "freno"
    elif pct >= AVISO_PCT:
        nivel = "aviso"
    else:
        nivel = "ok"
    return {"nivel": nivel, "pct": round(pct, 4), "pct_peticiones": round(pct_pet, 4),
            "pct_mb": round(pct_mb, 4), "pct_ciclo": round(pct_ciclo, 4), "motivo": motivo}


def proxima_medianoche(ahora):
    return dt.datetime.combine(ahora.date() + dt.timedelta(days=1), dt.time(0, 0), tzinfo=dt.timezone.utc)


def decidir_freno(nivel, freno, ahora_epoch):
    """PURA: «activar» · «apagar» · None.

    Solo se escribe en un cambio: activo y ya no hace falta (pasó la medianoche UTC o el día
    ya no supera el presupuesto) → apagar; inactivo y el día lo supera → activar; activo,
    vencido y el día SIGUE superándolo → activar otra vez (renovar el «hasta»). Con 402 o
    sin medida no se toca nada."""
    if nivel in (None, "restringido"):
        return None
    activo = bool((freno or {}).get("activo"))
    vencido = ahora_epoch >= float((freno or {}).get("hasta_epoch") or 0)
    if activo:
        if nivel != "freno":
            return "apagar"
        return "activar" if vencido else None
    return "activar" if nivel == "freno" else None


def puede_intentar(freno, ahora_epoch, dia):
    """PURA: ¿se puede escribir el freno ahora? Nunca en bucle tras un fallo."""
    f = freno or {}
    if f.get("no_disponible_dia") == dia:
        return False
    return ahora_epoch >= float(f.get("reintento_epoch") or 0)


def detectar_bucles(filas, ruta_hora=BUCLE_RUTA_HORA, ua_ruta_hora=BUCLE_UA_RUTA_HORA):
    """PURA: bucles de la última hora, de mayor a menor. Nunca devuelve claves."""
    por_ruta, por_par = {}, {}
    for f in filas or []:
        n = int(f.get("n") or 0)
        ruta, ua = sanitizar_ruta(f.get("ruta")), sanitizar_ua(f.get("ua"))
        por_ruta[ruta] = por_ruta.get(ruta, 0) + n
        por_par[(ruta, ua)] = por_par.get((ruta, ua), 0) + n
    bucles = []
    vistos = set()
    for (ruta, ua), n in sorted(por_par.items(), key=lambda kv: -kv[1]):
        if n > ua_ruta_hora:
            bucles.append({"tipo": "agente+ruta", "ruta": ruta, "ua": ua, "n": n})
            vistos.add(ruta)
    for ruta, n in sorted(por_ruta.items(), key=lambda kv: -kv[1]):
        if n > ruta_hora and ruta not in vistos:
            ua = max(((u, m) for (r, u), m in por_par.items() if r == ruta), key=lambda x: x[1])[0]
            bucles.append({"tipo": "ruta", "ruta": ruta, "ua": ua, "n": n})
    bucles.sort(key=lambda b: -b["n"])
    return bucles


def texto_bucle(b):
    return "BUCLE · %s · %s peticiones/h desde «%s»: algo la sondea sin parar" % (b["ruta"], miles(b["n"]), b["ua"])


# ─── efectos (una escritura por decisión, nunca en bucle) ────────────────────────────


def escribir_freno(activo, motivo, hasta, ahora, http=None, cred=None):
    """UNA petición a PostgREST. → ok · no_disponible · restringido · sin_credenciales · error."""
    cred = cred if cred is not None else credenciales()
    if not cred.get("url") or not cred.get("clave"):
        return "sin_credenciales"
    cab = {"apikey": cred["clave"], "Content-Type": "application/json",
           "Prefer": "resolution=merge-duplicates,return=minimal"}
    if cred["clave"].startswith("eyJ"):
        # Las claves nuevas (sb_secret_…) no son JWT: la pasarela las toma de `apikey`.
        cab["Authorization"] = "Bearer " + cred["clave"]
    fila = {"id": 1, "activo": bool(activo), "motivo": motivo, "hasta": hasta, "actualizado": _iso(ahora)}
    try:
        estado, texto = (http or _http)("POST", cred["url"] + "/rest/v1/os_freno?on_conflict=id", cab, [fila])
    except Exception:
        return "error"
    if 200 <= estado < 300:
        return "ok"
    if estado == 402:
        return "restringido"
    if estado == 404 or "PGRST205" in (texto or "") or "42P01" in (texto or ""):
        return "no_disponible"
    return "error"


def _avisar(texto, tipo="aviso"):
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    try:
        import puente
        puente.decir(texto, "director-consumo", tipo)
    except Exception:
        pass


def _cerrar_ayer(hist, hoy, http, cred):
    """El día anterior se relee ENTERO una vez (la última vuelta no vio sus últimos minutos)."""
    ayer = (hoy - dt.timedelta(days=1)).isoformat()
    d = hist["dias"].get(ayer)
    if not d or d.get("cerrado"):
        return 0
    inicio = dt.datetime.combine(hoy - dt.timedelta(days=1), dt.time(0, 0), tzinfo=dt.timezone.utc)
    filas = consulta_registros(SQL_DIA, inicio, inicio + dt.timedelta(days=1), http, cred)
    if filas is not None:
        nuevo = resumen_dia(filas)
        hist["dias"][ayer] = dict(nuevo, cerrado=True, cierre="completo", actualizado=_iso(inicio + dt.timedelta(days=1)))
    else:
        d["cerrado"] = True
        d["cierre"] = "parcial"
    return 1


def ejecutar(ahora=None, http=None, avisar=None, rutas=None, seco=False, cred=None, jev=None):
    """Una vuelta completa. Devuelve lo escrito en consumo.json. Nunca lanza."""
    ahora = ahora or dt.datetime.now(dt.timezone.utc)
    http = http or _http
    avisar = avisar or _avisar
    rutas = dict({"salida": SALIDA, "historial": HISTORIAL, "presupuestos": PRESUPUESTOS}, **(rutas or {}))
    cred = cred if cred is not None else credenciales()
    epoch = ahora.timestamp()
    dia = ahora.date().isoformat()

    previo = _leer_json(rutas["salida"], {})
    presup = cargar_presupuestos(rutas["presupuestos"])
    hist = _leer_json(rutas["historial"], {})
    hist.setdefault("version", 1)
    if not isinstance(hist.get("dias"), dict):
        hist["dias"] = {}

    filas = filas_supabase(http=http, ahora=ahora, cred=cred)
    jev = jev if jev is not None else estado_jev()
    alertas = evaluar(filas, jev)

    hoy = None
    if filas is not None:
        inicio_dia = dt.datetime.combine(ahora.date(), dt.time(0, 0), tzinfo=dt.timezone.utc)
        dia_filas = consulta_registros(SQL_DIA, inicio_dia, ahora, http, cred)
        if dia_filas is None:
            dia_filas = consulta_registros(SQL_DIA_SIMPLE, inicio_dia, ahora, http, cred)
        if dia_filas is not None:
            hoy = resumen_dia(dia_filas)
            hist["dias"][dia] = dict(hoy, cerrado=False, actualizado=_iso(ahora))
        _cerrar_ayer(hist, ahora.date(), http, cred)
    for d in sorted(hist["dias"])[:-DIAS_HISTORIAL]:
        del hist["dias"][d]

    restringido = filas is not None and any(str(f.get("st")) == "402" for f in filas)
    avisos = previo.get("avisos") if isinstance(previo.get("avisos"), dict) else {}
    if avisos.get("dia") != dia:
        avisos = {"dia": dia, "enviados": []}

    def una_vez(clave, texto, tipo="aviso"):
        if clave in avisos["enviados"]:
            return
        avisos["enviados"].append(clave)
        if not seco:
            avisar(texto, tipo)

    # Ciclo y presupuesto.
    primer = min(hist["dias"]) if hist["dias"] else dia
    inicio_c, quedan, supuesto = ciclo_actual(presup["ciclo_inicio"], ahora.date(), dt.date.fromisoformat(primer))
    mb_ciclo = mb_del_ciclo(hist["dias"], inicio_c, ahora.date())
    presupuesto = evaluar_presupuesto(hoy, mb_ciclo, presup, restringido) if hoy else (
        {"nivel": "restringido", "motivo": "el proyecto responde 402"} if restringido else None)
    nivel = presupuesto["nivel"] if presupuesto else None

    # Freno remoto.
    freno = dict(previo.get("freno") or {"activo": False})
    accion = decidir_freno(nivel, freno, epoch)
    if accion and not seco and puede_intentar(freno, epoch, dia):
        if accion == "activar":
            hasta = proxima_medianoche(ahora)
            motivo = "Presupuesto diario de Supabase agotado: %s. Frenado hasta las 00:00 UTC." % presupuesto["motivo"]
            resultado = escribir_freno(True, motivo, _iso(hasta), ahora, http, cred)
        else:
            hasta, motivo = None, "Presupuesto diario renovado: sondeos normales."
            resultado = escribir_freno(False, None, None, ahora, http, cred)
        freno["ultimo_intento"] = _iso(ahora)
        if resultado == "ok":
            freno.update(activo=accion == "activar", motivo=motivo if accion == "activar" else None,
                         hasta=_iso(hasta) if hasta else None, hasta_epoch=hasta.timestamp() if hasta else 0,
                         dia=dia, remoto="ok", reintento_epoch=0)
            if accion == "activar":
                avisar("FRENO · " + motivo, "error")
            else:
                avisar("FRENO apagado · el presupuesto diario de Supabase se renovó.", "hecho")
        elif resultado == "restringido":
            restringido = True
            presupuesto = dict(presupuesto, nivel="restringido")
        elif resultado == "no_disponible":
            freno.update(remoto="no_disponible", no_disponible_dia=dia)
            una_vez("no_disponible", "Freno remoto no disponible: falta la tabla os_freno (migración "
                    "20260929090000 sin aplicar). No se reintenta hasta mañana.", "error")
        else:
            freno.update(remoto=resultado, reintento_epoch=epoch + REINTENTO_FRENO_S)
            una_vez("freno_error", "No se pudo escribir el freno remoto (%s): se reintenta dentro de 1 h."
                    % resultado.replace("_", " "), "error")
    if presupuesto and presupuesto["nivel"] == "aviso":
        una_vez("aviso", "CONSUMO · Supabase al %d %% del presupuesto diario: %s."
                % (presupuesto["pct"] * 100, presupuesto["motivo"]))
    if presupuesto and presupuesto["nivel"] == "freno":
        una_vez("freno", "CONSUMO · presupuesto diario de Supabase agotado (%s)." % presupuesto["motivo"], "error")

    # Bucles.
    bucles = detectar_bucles(filas) if filas else []
    avisados = previo.get("bucles_avisados") if isinstance(previo.get("bucles_avisados"), dict) else {}
    avisados = {k: v for k, v in avisados.items() if epoch - float(v or 0) < BUCLE_REAVISO_S}
    ultimo_bucle = previo.get("ultimo_bucle")
    for b in bucles:
        clave = b["ruta"] + "|" + b["ua"]
        if clave not in avisados:
            avisados[clave] = epoch
            if not seco:
                avisar(texto_bucle(b), "aviso")
    if bucles:
        ultimo_bucle = dict(bucles[0], t=_iso(ahora))

    datos = {
        "t": dt.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "t_utc": _iso(ahora),
        "supabase": None if filas is None else {
            "peticiones_hora": sum(int(f.get("n") or 0) for f in filas),
            "pesadas_hora": sum(int(f.get("pesadas") or 0) for f in filas),
            "top": [{"ruta": sanitizar_ruta(f.get("ruta")), "ua": sanitizar_ua(f.get("ua")),
                     "st": f.get("st"), "n": f.get("n")} for f in filas[:5]],
        },
        "hoy": dict(hoy, dia=dia) if hoy else None,
        "presupuesto": presupuesto,
        "ciclo": {"inicio": inicio_c.isoformat(), "dias_restantes": quedan, "supuesto": supuesto,
                  "mb": round(mb_ciclo, 2), "mb_presupuesto": presup["supabase_mb_ciclo"]},
        "restringido": restringido,
        "freno": freno,
        "bucles": bucles[:5],
        "ultimo_bucle": ultimo_bucle,
        "bucles_avisados": avisados,
        "avisos": avisos,
        "jev": jev,
        "alertas": alertas,
    }
    try:
        _guardar_json(rutas["salida"], datos)
        _guardar_json(rutas["historial"], hist)
    except OSError:
        pass
    previas = previo.get("alertas") or []
    nuevas = [a for a in alertas if a not in previas]
    if nuevas and not seco:
        avisar("CONSUMO · " + " · ".join(nuevas), "aviso")
    return datos


def resumen(datos):
    s = datos.get("supabase")
    base = "Supabase %s pet/h" % (s["peticiones_hora"] if s else "sin medir")
    p = datos.get("presupuesto")
    if p and "pct" in p:
        base += " · hoy %d %% del presupuesto (%s)" % (p["pct"] * 100, p["nivel"])
    return "%s · alertas: %s" % (base, " · ".join(datos.get("alertas") or []) or "ninguna")


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    try:
        datos = ejecutar(seco="--seco" in argv)
    except Exception as e:  # la vigía nunca tumba al director que la lanza
        print("vigía de consumo: fallo inesperado (%s)" % type(e).__name__)
        return 1
    print(resumen(datos))
    return 0


if __name__ == "__main__":
    sys.exit(main())
