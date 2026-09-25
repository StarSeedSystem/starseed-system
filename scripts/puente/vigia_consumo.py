# -*- coding: utf-8 -*-
"""Director de consumo: que ningún medio desperdicie créditos ni datos.

(2026-09-25) Alex, tras quedarse sin inicio de sesión porque el Mando agotó el tráfico
gratuito de Supabase: «los directores deben supervisar que no haya medios donde se
desperdicien créditos o datos de ningún tipo». El director de orquestación lanza esto
cada 15 min. Mide sin gastar: los registros de Supabase por la API de gestión (cero
tráfico de salida del proyecto) y los contadores locales de Jev. Escribe
`~/.starseed/consumo.json` (lo lee el parte horario) y avisa en el canal solo cuando
aparece una alerta nueva. Nunca imprime claves: solo nombres, rutas y números.
"""
import datetime as dt
import json
import os
import sys
import urllib.parse
import urllib.request

RAIZ = os.environ.get("STARSEED_ROOT") or "/Users/alex/Documents/starseed-os-main"
SALIDA = os.path.expanduser("~/.starseed/consumo.json")
JEV_USO = os.path.expanduser("~/.starseed/jev-uso.json")
#: Umbrales por hora. El plan gratuito da 5 GB de salida al mes (~7 MB por hora).
UMBRALES = {"total_hora": 4000, "fuente_hora": 1500, "pesadas_hora": 20, "jev_techo": 0.8, "saldo_min": 2.0}
SQL = (
    "select log_attributes['request.path'] as ruta, log_attributes['request.headers.user_agent'] as ua, "
    "log_attributes['response.status_code'] as st, count(*) as n, "
    "countIf(match(log_attributes['request.search'], 'limit=([5-9][0-9]{2}|[0-9]{4,})') "
    "and position(log_attributes['request.search'], 'id=gt') = 0) as pesadas "
    "from logs where source='edge_logs' group by ruta, ua, st order by n desc limit 50"
)


def _env(nombre):
    try:
        for l in open(os.path.join(RAIZ, ".env.local"), encoding="utf-8"):
            if l.startswith(nombre + "="):
                return l.split("=", 1)[1].strip().strip('"').strip("'")
    except OSError:
        pass
    return os.environ.get(nombre, "")


def filas_supabase(horas=1):
    """[{ruta, ua, st, n, pesadas}] de la última hora, o None si no se pudo medir."""
    ref, token = _env("SUPABASE_PROJECT_REF"), _env("SUPABASE_ACCESS_TOKEN")
    if not ref or not token:
        return None
    fin = dt.datetime.now(dt.timezone.utc)
    q = urllib.parse.urlencode({
        "sql": SQL,
        "iso_timestamp_start": (fin - dt.timedelta(hours=horas)).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "iso_timestamp_end": fin.strftime("%Y-%m-%dT%H:%M:%SZ"),
    })
    url = "https://api.supabase.com/v1/projects/%s/analytics/endpoints/logs?%s" % (ref, q)
    try:
        req = urllib.request.Request(url, headers={"Authorization": "Bearer " + token})
        return json.load(urllib.request.urlopen(req, timeout=30)).get("result") or []
    except Exception:
        return None


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


def main():
    filas = filas_supabase()
    jev = estado_jev()
    alertas = evaluar(filas, jev)
    try:
        previas = json.load(open(SALIDA, encoding="utf-8")).get("alertas") or []
    except (OSError, ValueError):
        previas = []
    datos = {
        "t": dt.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "supabase": None if filas is None else {
            "peticiones_hora": sum(int(f.get("n") or 0) for f in filas),
            "pesadas_hora": sum(int(f.get("pesadas") or 0) for f in filas),
            "top": [{k: f.get(k) for k in ("ruta", "ua", "st", "n")} for f in filas[:5]],
        },
        "jev": jev,
        "alertas": alertas,
    }
    os.makedirs(os.path.dirname(SALIDA), exist_ok=True)
    json.dump(datos, open(SALIDA, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    nuevas = [a for a in alertas if a not in previas]
    if nuevas:
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        try:
            import puente
            puente.decir("CONSUMO · " + " · ".join(nuevas), "director-consumo", "aviso")
        except Exception:
            pass
    print(resumen(datos))


def resumen(datos):
    s = datos.get("supabase")
    base = "Supabase %s pet/h" % (s["peticiones_hora"] if s else "sin medir")
    return "%s · alertas: %s" % (base, " · ".join(datos.get("alertas") or []) or "ninguna")


if __name__ == "__main__":
    main()
