#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Medidor de consumo de Oracle Cloud (OC1010 · contrato architecture/oracle-consumo.md).

Mide con la CLI `oci` (perfil de ~/.starseed/oracle.json), SOLO LECTURA, y escribe
~/.starseed/oracle-consumo.json (0600, sin ids):

  · gasto del mes y previsión ........ presupuesto (`oci budgets budget budget list`)
  · gasto por día y por SKU .......... API de uso (`oci usage-api … request-summarized-usages`)
  · crédito de la prueba ............. suscripción (`oci organizations subscription get`),
                                       restante = crédito − gasto medido desde que empezó
  · instancias frente a lo gratis .... A1 2 OCPU / 12 GB y 2 micro
  · disco (arranque + bloques) ....... frente a 200 GB
  · Object Storage ................... frente a 20 GB
  · salida de datos del mes .......... frente a 10 TB (SKU «Outbound Data Transfer»)
  · CPU, memoria y red de 7 días ..... frente al umbral de reclamación (20 %)

Cada parte se mide por separado: lo que falla se dice en `errores` (texto legible) y la
parte conserva la última lectura buena marcada `obsoleto`. Nunca se inventa un número.

  python3 scripts/puente/medidor_oracle.py medir [--forzar] [--json]   # mide si toca (30 min)
  python3 scripts/puente/medidor_oracle.py ver [--json]                # lo último, sin llamar a Oracle
  (--salida RUTA escribe en otro archivo: para probar sin tocar ~/.starseed)
"""
from __future__ import annotations

import configparser
import fcntl
import json
import os
import re
import shutil
import subprocess
import sys
import time
from datetime import datetime, timedelta, timezone
from typing import Callable

DIR = os.path.expanduser("~/.starseed")
SALIDA = os.path.join(DIR, "oracle-consumo.json")
ESTADO_ORACLE = os.path.join(DIR, "oracle.json")
CERROJO = os.path.join(DIR, "cerrojos", "oracle-consumo.lock")
CADA_MIN = 30
TOPE_LLAMADA_S = 50
TOPE_TOTAL_S = 170
CONSOLA = "https://cloud.oracle.com/?region=%s"

#: Límites Always Free (architecture/oracle-nube.md §1, comprobados el 2026-10-07).
LIMITES = {"a1_ocpu": 2, "a1_gb": 12, "a1_ocpu_h": 1500, "a1_gb_h": 9000, "micro": 2,
           "disco_gb": 200, "objetos_gb": 20, "salida_gb": 10 * 1024}
#: Regla de reclamación por inactividad (§1): 7 días con todo por debajo del 20 %.
UMBRAL_PCT = 20.0
VENTANA_DIAS = 7
#: Lo mínimo para mandarle trabajo al A1: un agente del enjambre pide 2,5 GB (§3 y §8).
MARGEN_GB = 2.5
MARGEN_CPU_P95 = 70.0

Runner = Callable[..., subprocess.CompletedProcess]
_OCID = re.compile(r"ocid1\.[^\s\"']+", re.I)


# ─────────────────────────── utilidades puras ───────────────────────────

def _num(valor) -> float | None:
    try:
        n = float(valor)
    except (TypeError, ValueError):
        return None
    return n if n == n and n not in (float("inf"), float("-inf")) else None


def _r(n: float | None, d: int = 2) -> float | None:
    return None if n is None else round(n, d)


def _fecha(texto) -> datetime | None:
    if not isinstance(texto, str) or not texto:
        return None
    try:
        f = datetime.fromisoformat(texto.replace("Z", "+00:00"))
    except ValueError:
        return None
    return f if f.tzinfo else f.replace(tzinfo=timezone.utc)


def _iso(f: datetime | None) -> str | None:
    return f.astimezone(timezone.utc).isoformat().replace("+00:00", "Z") if f else None


def _datos(salida) -> object:
    """La respuesta de la CLI: `{"data": …}`; una salida vacía es «nada» (lista vacía)."""
    if isinstance(salida, dict):
        return salida.get("data", [])
    texto = (salida or "").strip()
    if not texto:
        return []
    d = json.loads(texto)
    return d.get("data", []) if isinstance(d, dict) else []


def _p95(valores: list[float]) -> float | None:
    v = sorted(x for x in valores if isinstance(x, (int, float)))
    if not v:
        return None
    return v[min(len(v) - 1, int(round(0.95 * (len(v) - 1))))]


def ocultar(valor):
    """Defensa final: ningún OCID ni clave de id sale nunca de aquí."""
    if isinstance(valor, str):
        return _OCID.sub("[oculto]", valor)
    if isinstance(valor, list):
        return [ocultar(v) for v in valor]
    if isinstance(valor, dict):
        return {k: ocultar(v) for k, v in valor.items()
                if "ocid" not in str(k).lower() and str(k).lower() not in (
                    "id", "tenancy", "user", "fingerprint", "compartment-id", "tenant-id")}
    return valor


def detalle_error(texto: object, parte: str) -> str:
    """Un fallo de la CLI en palabras de persona, sin ids."""
    t = str(texto or "").lower()
    if "notauthenticated" in t or "not authenticated" in t or "401" in t:
        return "%s: Oracle no autenticó el perfil (vuelve a vincular la cuenta)." % parte
    if "notauthorized" in t or "authorization failed" in t or "404" in t:
        return "%s: el perfil no tiene permiso o el servicio no existe en esta cuenta." % parte
    if "toomanyrequests" in t or "429" in t:
        return "%s: Oracle pidió esperar (demasiadas peticiones); se reintenta en la próxima pasada." % parte
    if any(p in t for p in ("timeout", "timed out", "tiempo")):
        return "%s: la CLI de Oracle no respondió a tiempo." % parte
    if any(p in t for p in ("connection", "network", "dns", "resolve")):
        return "%s: no se pudo conectar con Oracle Cloud." % parte
    if "no such command" in t or "no such option" in t:
        return "%s: esta versión de la CLI de Oracle no tiene la orden usada." % parte
    if "json" in t:
        return "%s: la respuesta de Oracle no se pudo leer." % parte
    return "%s: la CLI de Oracle no pudo completar la lectura." % parte


# ─────────────────────────── interpretación (puras) ───────────────────────────

def parsear_presupuesto(salida) -> dict | None:
    """El presupuesto mensual (el de StarSeed si hay varios): gasto real, previsto y tope."""
    filas = [f for f in _datos(salida) if isinstance(f, dict)]
    if not filas:
        return None
    fila = next((f for f in filas if "starseed" in str(f.get("display-name", "")).lower()), filas[0])
    return {"nombre": str(fila.get("display-name") or ""),
            "presupuesto": _num(fila.get("amount")),
            "mes": _num(fila.get("actual-spend")),
            "previsto": _num(fila.get("forecasted-spend")),
            "calculado": _iso(_fecha(fila.get("time-spend-computed"))),
            "periodo": str(fila.get("reset-period") or "")}


def parsear_uso(salida, inicio_mes: datetime, inicio_prueba: datetime | None) -> dict:
    """Uso diario por SKU → gasto del mes, gasto desde la prueba, salida y horas del A1."""
    datos = _datos(salida)
    items = datos.get("items", []) if isinstance(datos, dict) else []
    mes = prueba = 0.0
    salida_gb = ocpu_h = gb_h = 0.0
    unidad_salida = ""
    moneda = ""
    por_dia: dict[str, float] = {}
    for it in items:
        if not isinstance(it, dict) or it.get("is-forecast"):
            continue
        t = _fecha(it.get("time-usage-started"))
        if t is None:
            continue
        coste = _num(it.get("computed-amount")) or 0.0
        cantidad = _num(it.get("computed-quantity")) or 0.0
        moneda = moneda or str(it.get("currency") or "")
        if inicio_prueba and t >= inicio_prueba:
            prueba += coste
        if t < inicio_mes:
            continue
        mes += coste
        dia = t.date().isoformat()
        por_dia[dia] = por_dia.get(dia, 0.0) + coste
        sku = str(it.get("sku-name") or "").lower()
        unidad = str(it.get("unit") or "")
        if "outbound data transfer" in sku:
            salida_gb += cantidad
            unidad_salida = unidad_salida or unidad
        elif "a1" in sku and "memory" in sku:
            gb_h += cantidad
        elif "a1" in sku and "ocpu" in unidad.lower():
            ocpu_h += cantidad
    return {"mes": round(mes, 4), "desde_prueba": round(prueba, 4), "moneda": moneda,
            "por_dia": [{"dia": d, "coste": round(v, 4)} for d, v in sorted(por_dia.items())],
            "salida_gb": round(salida_gb, 4), "unidad_salida": unidad_salida,
            "a1_ocpu_h": round(ocpu_h, 2), "a1_gb_h": round(gb_h, 2), "filas": len(items)}


def parsear_suscripcion(salida, ahora: datetime) -> dict:
    """Crédito de la prueba gratuita (promoción activa): importe, moneda, inicio y fin."""
    d = _datos(salida)
    d = d if isinstance(d, dict) else {}
    promo = [p for p in d.get("promotion") or [] if isinstance(p, dict)]
    activa = next((p for p in promo if str(p.get("status", "")).upper() == "ACTIVE"), None)
    modelo = str(d.get("payment-model") or "")
    fin_sus = _fecha(d.get("end-date"))
    if not activa:
        return {"activa": False, "modelo_pago": modelo, "credito": None, "moneda": str(d.get("cloud-amount-currency") or ""),
                "inicio": None, "fin": _iso(fin_sus), "dias_restantes": None}
    inicio = _fecha(activa.get("time-started"))
    dias = _num(activa.get("duration"))
    # La fecha oficial es la de la suscripción; inicio + duración solo si Oracle no la da.
    fin = fin_sus or ((inicio + timedelta(days=dias)) if inicio and dias and
                      str(activa.get("duration-unit", "DAY")).upper().startswith("DAY") else None)
    restantes = max(0, (fin - ahora).days) if fin else None
    return {"activa": bool(fin is None or fin > ahora), "modelo_pago": modelo,
            "credito": _num(activa.get("amount")),
            "moneda": str(activa.get("currency-unit") or d.get("cloud-amount-currency") or ""),
            "inicio": _iso(inicio), "fin": _iso(fin), "dias_restantes": restantes}


def parsear_instancias(salida) -> list[dict]:
    fuera = []
    for f in _datos(salida):
        if not isinstance(f, dict):
            continue
        cfg = f.get("shape-config") if isinstance(f.get("shape-config"), dict) else {}
        estado = str(f.get("lifecycle-state") or "")
        if estado.upper() == "TERMINATED":
            continue
        fuera.append({"nombre": str(f.get("display-name") or ""), "forma": str(f.get("shape") or ""),
                      "ocpus": _num(cfg.get("ocpus")) or 0, "gb": _num(cfg.get("memory-in-gbs")) or 0,
                      "estado": estado})
    return fuera


def parsear_volumenes(salida) -> float:
    total = 0.0
    for f in _datos(salida):
        if isinstance(f, dict) and str(f.get("lifecycle-state", "")).upper() not in ("TERMINATED", "TERMINATING"):
            total += _num(f.get("size-in-gbs")) or 0.0
    return total


def parsear_cubos(salida) -> list[str]:
    return [str(f.get("name")) for f in _datos(salida) if isinstance(f, dict) and f.get("name")]


def parsear_serie(salida) -> dict[str, list[tuple[str, float]]]:
    """Serie por máquina (por su nombre visible): [(instante, valor)…]."""
    fuera: dict[str, list[tuple[str, float]]] = {}
    for s in _datos(salida):
        if not isinstance(s, dict):
            continue
        nombre = str((s.get("dimensions") or {}).get("resourceDisplayName") or "")
        puntos = [(str(p.get("timestamp")), _num(p.get("value"))) for p in s.get("aggregated-datapoints") or []
                  if isinstance(p, dict)]
        if nombre:
            fuera.setdefault(nombre, []).extend((t, v) for t, v in puntos if v is not None)
    return fuera


def ancho_banda_bps(forma: str, ocpus: float) -> float:
    """Ancho de banda de la forma (documentación de Oracle): A1 1 Gbps por OCPU; micro 480 Mbps."""
    if "micro" in forma.lower():
        return 0.48e9
    return max(1.0, ocpus) * 1e9


def evaluar_reclamacion(inst: dict, cpu, mem, red_in, red_out, ahora: datetime) -> dict:
    """PURA: la regla de Oracle (7 días con CPU p95, red y —solo A1— memoria bajo el 20 %)."""
    es_a1 = "a1" in str(inst.get("forma", "")).lower()
    tiempos = sorted(t for t, _ in cpu)
    if not tiempos:
        return {"nombre": inst["nombre"], "medida": False, "baja": None, "riesgo": None,
                "texto": "sin métricas de CPU (¿agente de Oracle Cloud apagado en la máquina?)"}
    cpu_p95 = _p95([v for _, v in cpu])
    mem_p95 = _p95([v for _, v in mem]) if mem else None
    bw = ancho_banda_bps(str(inst.get("forma", "")), float(inst.get("ocpus") or 1))
    red_b = max(_p95([v for _, v in red_in]) or 0.0, _p95([v for _, v in red_out]) or 0.0)
    red_pct = red_b * 8 / bw * 100 if (red_in or red_out) else None
    desde, hasta = _fecha(tiempos[0]), _fecha(tiempos[-1])
    dias = (hasta - desde).total_seconds() / 86400 if desde and hasta else 0.0
    bajos = [cpu_p95 is not None and cpu_p95 < UMBRAL_PCT,
             red_pct is None or red_pct < UMBRAL_PCT]
    if es_a1:
        bajos.append(mem_p95 is not None and mem_p95 < UMBRAL_PCT)
    baja = all(bajos)
    reclamable = (desde + timedelta(days=VENTANA_DIAS)) if (baja and desde) else None
    nivel = "no" if not baja else ("alto" if dias >= VENTANA_DIAS - 0.05 else "aviso")
    return {"nombre": inst["nombre"], "medida": True, "baja": baja, "riesgo": baja, "nivel": nivel,
            "cpu_p95": _r(cpu_p95), "mem_p95": _r(mem_p95), "red_p95_pct": _r(red_pct, 4),
            "red_p95_bytes_s": _r(red_b, 1), "puntos": len(tiempos), "dias": _r(dias, 1),
            "desde": _iso(desde), "hasta": _iso(hasta), "reclamable_desde": _iso(reclamable)}


def margen_a1(inst: dict | None, recl: dict | None, freno: bool) -> dict:
    """PURA: ¿hay sitio GRATIS en el A1 para mandarle trabajo ahora?"""
    if not inst:
        return {"apto": False, "motivo": "no hay A1 en la cuenta"}
    if str(inst.get("estado", "")).upper() != "RUNNING":
        return {"apto": False, "motivo": "el A1 no está en marcha (%s)" % (inst.get("estado") or "?")}
    if freno:
        return {"apto": False, "motivo": "freno: el gasto del mes pasó de 0"}
    gb = float(inst.get("gb") or 0)
    if not recl or not recl.get("medida"):
        return {"apto": True, "cpu_libre_pct": None, "mem_libre_gb": None,
                "motivo": "A1 en marcha; uso real sin medir (sin métricas)"}
    cpu, mem = recl.get("cpu_p95"), recl.get("mem_p95")
    libre_gb = round(gb * (1 - (mem or 0) / 100), 1)
    libre_cpu = round(100 - (cpu or 0), 1)
    apto = (cpu or 0) < MARGEN_CPU_P95 and libre_gb >= MARGEN_GB
    return {"apto": apto, "cpu_libre_pct": libre_cpu, "mem_libre_gb": libre_gb,
            "motivo": ("hay margen gratis: %s %% de CPU y %s GB libres" % (_n(libre_cpu, 1), _n(libre_gb, 1))) if apto
            else "sin margen: CPU p95 %s %% y %s GB libres" % (_n(cpu, 1), _n(libre_gb, 1))}


# ─────────────────────────── perfil y CLI ───────────────────────────

def perfil_y_cuenta(home: str | None = None) -> dict:
    """Perfil de ~/.starseed/oracle.json y su región/cuenta de ~/.oci/config (sin imprimir nada)."""
    casa = home or os.path.expanduser("~")
    perfil = "DEFAULT"
    try:
        with open(os.path.join(casa, ".starseed", "oracle.json"), encoding="utf-8") as f:
            perfil = str(json.load(f).get("perfil") or "DEFAULT")
    except (OSError, ValueError, AttributeError):
        pass
    parser = configparser.RawConfigParser()
    try:
        with open(os.path.join(casa, ".oci", "config"), encoding="utf-8") as f:
            parser.read_file(f)
        seccion = parser[perfil]
    except (OSError, KeyError, configparser.Error):
        return {"perfil": perfil, "region": "", "tenancy": ""}
    return {"perfil": perfil, "region": seccion.get("region", "").strip(),
            "tenancy": seccion.get("tenancy", "").strip()}


def binario_oci() -> str | None:
    if os.access("/opt/homebrew/bin/oci", os.X_OK):
        return "/opt/homebrew/bin/oci"
    return shutil.which("oci")


def disponible(home: str | None = None) -> bool:
    """¿Se puede medir? (CLI instalada y perfil con cuenta). Lo usa el recolector."""
    return bool(binario_oci()) and bool(perfil_y_cuenta(home).get("tenancy"))


def _correr_real(orden, timeout=TOPE_LLAMADA_S):
    return subprocess.run(orden, capture_output=True, text=True, timeout=timeout, check=False,
                          env=dict(os.environ, OCI_CLI_SUPPRESS_FILE_PERMISSIONS_WARNING="True"))


class _Cli:
    def __init__(self, correr: Runner, base: list[str], tope_total: float):
        self.correr, self.base, self.limite = correr, base, time.monotonic() + tope_total

    def __call__(self, *args: str):
        if time.monotonic() > self.limite:
            raise RuntimeError("tiempo agotado para esta pasada")
        try:
            r = self.correr(self.base + list(args), timeout=TOPE_LLAMADA_S)
        except subprocess.TimeoutExpired as e:
            raise RuntimeError("timeout") from e
        except OSError as e:
            raise RuntimeError("connection: %s" % type(e).__name__) from e
        if r.returncode:
            raise RuntimeError((r.stderr or "") + " " + (r.stdout or "")[:400])
        return r.stdout


# ─────────────────────────── medición ───────────────────────────

def medir(correr: Runner | None = None, ahora: datetime | None = None, previo: dict | None = None,
          home: str | None = None, tope_total: float = TOPE_TOTAL_S) -> dict:
    """Una pasada completa. Cada parte, aislada; lo que falla se dice y conserva lo previo."""
    ahora = (ahora or datetime.now(timezone.utc)).astimezone(timezone.utc)
    previo = previo or {}
    cuenta = perfil_y_cuenta(home)
    region = cuenta.get("region") or str(previo.get("region") or "")
    doc = {"version": 1, "leido": _iso(ahora), "perfil": cuenta.get("perfil"), "region": region,
           "consola": CONSOLA % (region or "mx-queretaro-1"), "limites": dict(LIMITES),
           "umbral_pct": UMBRAL_PCT, "ventana_dias": VENTANA_DIAS, "errores": []}
    oci = binario_oci() if correr is None else "oci"
    if not oci or not cuenta.get("tenancy"):
        doc["ok"] = False
        doc["errores"].append({"parte": "cuenta", "error": "La CLI de Oracle no está instalada o el perfil no tiene cuenta: vincula con `oci setup bootstrap`."})
        return _heredar(doc, previo, ("gasto", "prueba", "uso", "instancias", "disco", "objetos", "reclamacion"))
    t = cuenta["tenancy"]
    cli = _Cli(correr or _correr_real, [oci, "--profile", cuenta["perfil"], "--output", "json"], tope_total)
    partes_ok: dict[str, bool] = {}

    def parte(nombre, fn):
        try:
            valor = fn()
            partes_ok[nombre] = True
            return valor
        except Exception as e:  # noqa: BLE001 — cada parte aislada
            partes_ok[nombre] = False
            texto = e.args[0] if isinstance(e, RuntimeError) and e.args else type(e).__name__
            doc["errores"].append({"parte": nombre, "error": detalle_error(texto, nombre)})
            return None

    presupuesto = parte("presupuesto", lambda: parsear_presupuesto(
        cli("budgets", "budget", "budget", "list", "--compartment-id", t, "--all")))
    sus_prev = previo.get("prueba") if isinstance(previo.get("prueba"), dict) else None
    sus_fresca = sus_prev and (ahora - (_fecha(sus_prev.get("leido")) or ahora - timedelta(days=9))) < timedelta(hours=24)
    if sus_fresca:
        prueba = {k: v for k, v in sus_prev.items() if k not in ("usado", "restante", "obsoleto")}
        partes_ok["prueba"] = True
    else:
        def _sus():
            filas = _datos(cli("organizations", "subscription", "list", "--compartment-id", t))
            filas = filas.get("items", []) if isinstance(filas, dict) else filas
            sid = next((f.get("id") for f in filas if isinstance(f, dict) and f.get("id")), None)
            if not sid:
                return {"activa": False, "modelo_pago": "", "credito": None, "moneda": "", "inicio": None,
                        "fin": None, "dias_restantes": None, "leido": _iso(ahora)}
            p = parsear_suscripcion(cli("organizations", "subscription", "get", "--subscription-id", str(sid)), ahora)
            p["leido"] = _iso(ahora)
            return p
        prueba = parte("prueba", _sus)
    inicio_mes = ahora.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    inicio_prueba = _fecha((prueba or {}).get("inicio")) if (prueba or {}).get("activa") else None
    desde = min(inicio_mes, inicio_prueba.replace(hour=0, minute=0, second=0, microsecond=0)) if inicio_prueba else inicio_mes
    manana = (ahora + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    uso = parte("uso", lambda: parsear_uso(cli(
        "usage-api", "usage-summary", "request-summarized-usages", "--tenant-id", t,
        "--time-usage-started", _iso(desde), "--time-usage-ended", _iso(manana),
        "--granularity", "DAILY", "--query-type", "COST",
        "--group-by", '["service","skuName","unit"]'), inicio_mes, inicio_prueba))
    instancias = parte("instancias", lambda: parsear_instancias(
        cli("compute", "instance", "list", "--compartment-id", t, "--all")))
    arranque = parte("disco", lambda: parsear_volumenes(cli("bv", "boot-volume", "list", "--compartment-id", t, "--all")))
    bloques = parte("disco", lambda: parsear_volumenes(cli("bv", "volume", "list", "--compartment-id", t, "--all"))) \
        if partes_ok.get("disco") else None

    def _objetos():
        cubos = parsear_cubos(cli("os", "bucket", "list", "--compartment-id", t, "--all"))
        total = 0.0
        for nombre in cubos:
            d = _datos(cli("os", "bucket", "get", "--bucket-name", nombre, "--fields", "approximateSize"))
            total += (_num((d or {}).get("approximate-size")) or 0.0) if isinstance(d, dict) else 0.0
        return {"gb": round(total / 1024 ** 3, 3), "cubos": len(cubos)}
    objetos = parte("objetos", _objetos)

    reclamacion = None
    if instancias:
        inicio7 = ahora - timedelta(days=VENTANA_DIAS)

        def serie(consulta):
            return parsear_serie(cli("monitoring", "metric-data", "summarize-metrics-data", "--compartment-id", t,
                                     "--namespace", "oci_computeagent", "--query-text", consulta,
                                     "--start-time", _iso(inicio7), "--end-time", _iso(ahora)))

        def _recl():
            cpu, mem = serie("CpuUtilization[1h].mean()"), serie("MemoryUtilization[1h].mean()")
            rin, rout = serie("NetworksBytesIn[1h].rate()"), serie("NetworksBytesOut[1h].rate()")
            maquinas = [evaluar_reclamacion(i, cpu.get(i["nombre"], []), mem.get(i["nombre"], []),
                                            rin.get(i["nombre"], []), rout.get(i["nombre"], []), ahora)
                        for i in instancias if i["estado"].upper() == "RUNNING"]
            return {"maquinas": maquinas, "riesgo": any(m.get("riesgo") for m in maquinas),
                    "leido": _iso(ahora)}
        reclamacion = parte("reclamacion", _recl)

    # ── montar el documento ──
    if presupuesto is not None or uso is not None:
        mes = presupuesto["mes"] if presupuesto and presupuesto.get("mes") is not None else (uso or {}).get("mes")
        doc["gasto"] = {"mes": mes, "previsto": (presupuesto or {}).get("previsto"),
                        "presupuesto": (presupuesto or {}).get("presupuesto"),
                        "presupuesto_nombre": (presupuesto or {}).get("nombre"),
                        "calculado": (presupuesto or {}).get("calculado"),
                        "segun_uso": (uso or {}).get("mes"),
                        "moneda": (uso or {}).get("moneda") or (prueba or {}).get("moneda") or "",
                        "por_dia": (uso or {}).get("por_dia", []),
                        "fuente": "presupuesto de Oracle" if presupuesto else "API de uso de Oracle",
                        "leido": _iso(ahora)}
    if prueba is not None:
        p = dict(prueba)
        if p.get("activa") and p.get("credito") is not None and uso is not None:
            p["usado"] = round(uso["desde_prueba"], 4)
            p["restante"] = round(p["credito"] - uso["desde_prueba"], 2)
        else:
            p["usado"] = p["restante"] = None
        doc["prueba"] = p
    if uso is not None:
        doc["uso"] = {"salida_gb": uso["salida_gb"], "unidad_salida": uso["unidad_salida"],
                      "a1_ocpu_h": uso["a1_ocpu_h"], "a1_gb_h": uso["a1_gb_h"], "leido": _iso(ahora)}
    if instancias is not None:
        doc["instancias"] = instancias
    if arranque is not None and bloques is not None:
        doc["disco"] = {"gb": round(arranque + bloques, 1), "arranque_gb": round(arranque, 1),
                        "bloques_gb": round(bloques, 1), "leido": _iso(ahora)}
    if objetos is not None:
        doc["objetos"] = dict(objetos, leido=_iso(ahora))
    if reclamacion is not None:
        doc["reclamacion"] = reclamacion
    doc = _heredar(doc, previo, ("gasto", "prueba", "uso", "instancias", "disco", "objetos", "reclamacion"))
    doc["ok"] = not doc["errores"]
    return resumir(doc)


def _heredar(doc: dict, previo: dict, partes) -> dict:
    """Un fallo no borra lo bueno: la parte que falta se toma del previo, marcada obsoleta."""
    for p in partes:
        if p not in doc and p in previo and previo[p] is not None:
            v = previo[p]
            if isinstance(v, dict):
                v = dict(v, obsoleto=True)
            doc[p] = v
            doc.setdefault("obsoletas", []).append(p)
    return doc


def resumir(doc: dict) -> dict:
    """PURA: computo, freno y margen a partir de las partes (también para lo heredado)."""
    insts = doc.get("instancias") or []
    a1s = [i for i in insts if "a1" in str(i.get("forma", "")).lower()]
    micros = [i for i in insts if "micro" in str(i.get("forma", "")).lower()]
    a1 = next((i for i in a1s if str(i.get("estado", "")).upper() == "RUNNING"), a1s[0] if a1s else None)
    doc["computo"] = {"a1_ocpus": sum(float(i.get("ocpus") or 0) for i in a1s),
                      "a1_gb": sum(float(i.get("gb") or 0) for i in a1s),
                      "micro": len(micros), "a1_nombre": (a1 or {}).get("nombre"),
                      "a1_estado": (a1 or {}).get("estado")} if "instancias" in doc else None
    gasto = doc.get("gasto") or {}
    mes, prev = gasto.get("mes"), gasto.get("previsto")
    activo = bool((isinstance(mes, (int, float)) and mes > 0) or (isinstance(prev, (int, float)) and prev > 0))
    doc["freno"] = {"activo": activo,
                    "motivo": ("el gasto del mes es %s %s (previsto %s): no se manda trabajo ni se crea nada en Oracle hasta que Alex lo revise"
                               % (mes, gasto.get("moneda", ""), prev)) if activo else "",
                    "medido": "gasto" in doc}
    recl = next((m for m in (doc.get("reclamacion") or {}).get("maquinas", []) if a1 and m.get("nombre") == a1.get("nombre")), None)
    doc["margen"] = margen_a1(a1, recl, activo)
    return ocultar(doc)


# ─────────────────────────── disco ───────────────────────────

def leer_archivo(ruta: str = SALIDA) -> dict:
    try:
        with open(os.path.expanduser(ruta), encoding="utf-8") as f:
            d = json.load(f)
        return d if isinstance(d, dict) else {}
    except (OSError, ValueError):
        return {}


def guardar(doc: dict, ruta: str = SALIDA) -> None:
    ruta = os.path.expanduser(ruta)
    os.makedirs(os.path.dirname(ruta) or ".", exist_ok=True)
    tmp = ruta + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(ocultar(doc), f, ensure_ascii=False, indent=1)
        f.write("\n")
    os.chmod(tmp, 0o600)
    os.replace(tmp, ruta)


def toca(previo: dict, ahora: datetime, cada_min: float = CADA_MIN) -> bool:
    leido = _fecha(previo.get("leido"))
    return leido is None or (ahora - leido).total_seconds() >= max(15, cada_min) * 60


_ORDEN_NIVEL = {"": 0, "sin-medir": 0, "no": 1, "aviso": 2, "alto": 3}


def _nivel_riesgo(doc: dict) -> tuple[str, dict]:
    maquinas = [m for m in ((doc or {}).get("reclamacion") or {}).get("maquinas", []) if isinstance(m, dict)]
    if not maquinas:
        return "", {}
    peor = max(maquinas, key=lambda m: _ORDEN_NIVEL.get(str(m.get("nivel") or ""), 0))
    return str(peor.get("nivel") or ""), peor


def avisos_de_cambio(previo: dict, doc: dict) -> list[tuple[str, str]]:
    """PURA: un mensaje para el Chat Director por cada CAMBIO de freno o de riesgo de reclamación
    (no en cada pasada). Devuelve [(tipo, texto)]."""
    fuera: list[tuple[str, str]] = []
    previo, doc = previo or {}, doc or {}
    f_ant = bool((previo.get("freno") or {}).get("activo"))
    f_nuevo = bool((doc.get("freno") or {}).get("activo"))
    consola = doc.get("consola") or CONSOLA % "mx-queretaro-1"
    if f_nuevo and not f_ant:
        fuera.append(("aviso", "Oracle: %s. Directores y agentes dejan de mandar trabajo a Oracle y no se crea nada hasta que lo revises: %s"
                      % ((doc.get("freno") or {}).get("motivo") or "el gasto del mes pasó de 0", consola)))
    elif f_ant and not f_nuevo and (doc.get("freno") or {}).get("medido"):
        fuera.append(("hecho", "Oracle: el gasto del mes vuelve a 0; se levanta el freno."))
    n_ant, _ = _nivel_riesgo(previo)
    n_nuevo, m = _nivel_riesgo(doc)
    if n_nuevo != n_ant and n_nuevo in ("aviso", "alto"):
        cuando = ("ya puede reclamarlo" if n_nuevo == "alto"
                  else "puede reclamarlo desde el %s si sigue así" % str(m.get("reclamable_desde") or "?")[:10])
        fuera.append(("aviso", "Oracle: %s está ocioso (CPU p95 %s %%, memoria %s %%; umbral 20 %%) y Oracle %s. Darle trabajo (servicios de compose-a1 o un agente del enjambre) lo evita."
                      % (m.get("nombre") or "el A1", _n(m.get("cpu_p95"), 1), _n(m.get("mem_p95"), 1), cuando)))
    elif n_ant in ("aviso", "alto") and n_nuevo == "no":
        fuera.append(("hecho", "Oracle: el A1 ya trabaja por encima del 20 %: sin riesgo de reclamación."))
    return fuera


def _publicar_real():
    try:
        directorio = os.path.dirname(os.path.abspath(__file__))
        if directorio not in sys.path:
            sys.path.insert(0, directorio)
        from director_chat import publicar
        return publicar
    except Exception:
        return None


def medir_si_toca(cada_min: float = CADA_MIN, forzar: bool = False, ruta: str = SALIDA,
                  correr: Runner | None = None, ahora: datetime | None = None,
                  publicar: Callable[..., object] | None = None) -> dict:
    """Mide si toca (o si se fuerza) bajo cerrojo; si otra pasada está midiendo, devuelve lo último."""
    ahora = (ahora or datetime.now(timezone.utc)).astimezone(timezone.utc)
    previo = leer_archivo(ruta)
    if not forzar and not toca(previo, ahora, cada_min):
        return previo
    cerrojo_ruta = CERROJO if os.path.expanduser(ruta) == SALIDA else os.path.expanduser(ruta) + ".lock"
    os.makedirs(os.path.dirname(cerrojo_ruta) or ".", exist_ok=True)
    with open(cerrojo_ruta, "w") as cerrojo:
        try:
            fcntl.flock(cerrojo, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            return previo
        try:
            doc = medir(correr, ahora, previo)
            guardar(doc, ruta)
            # Los avisos van al Chat Director solo desde el archivo de verdad (no en pruebas ni con --salida).
            if publicar is None and os.path.expanduser(ruta) == SALIDA:
                publicar = _publicar_real()
            for tipo, texto_aviso in (avisos_de_cambio(previo, doc) if publicar else []):
                try:
                    publicar(texto_aviso, de="director-nube", rol="director", tipo=tipo, tarea="OC1010")
                except Exception:  # noqa: BLE001 — un canal caído no tumba el medidor
                    pass
            return doc
        finally:
            fcntl.flock(cerrojo, fcntl.LOCK_UN)


# ─────────────────────────── recolector de medidores (medidores_credito) ───────────────────────────

def _proximo_mes(f: datetime) -> str:
    sig = (f.replace(day=28) + timedelta(days=4)).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    return _iso(sig) or ""


def a_medidor(doc: dict) -> dict:
    """PURA: el documento → la forma de un medidor de crédito (architecture/medidores-credito.md §3)."""
    if not doc:
        return {"id": "oracle", "ok": False, "error": "sin lectura de Oracle todavía"}
    leido = _fecha(doc.get("leido")) or datetime.now(timezone.utc)
    gasto = doc.get("gasto") or {}
    moneda = gasto.get("moneda") or ""
    ventanas = []
    if isinstance(gasto.get("mes"), (int, float)) and isinstance(gasto.get("presupuesto"), (int, float)) and gasto["presupuesto"] > 0:
        ventanas.append({"id": "gasto", "etiqueta": "Gasto del mes (presupuesto %g %s)" % (gasto["presupuesto"], moneda),
                         "usado_pct": round(gasto["mes"] / gasto["presupuesto"] * 100, 1), "reinicia": _proximo_mes(leido)})
    uso, objetos = doc.get("uso") or {}, doc.get("objetos") or {}
    if isinstance(uso.get("salida_gb"), (int, float)):
        ventanas.append({"id": "salida", "etiqueta": "Salida de datos (10 TB/mes gratis)",
                         "usado_pct": round(uso["salida_gb"] / LIMITES["salida_gb"] * 100, 3), "reinicia": _proximo_mes(leido)})
    if isinstance(objetos.get("gb"), (int, float)):
        ventanas.append({"id": "objetos", "etiqueta": "Object Storage (20 GB gratis)",
                         "usado_pct": round(objetos["gb"] / LIMITES["objetos_gb"] * 100, 2), "reinicia": None})
    prueba = doc.get("prueba") or {}
    saldo = ({"valor": prueba["restante"], "unidad": "%s de prueba" % (prueba.get("moneda") or moneda)}
             if prueba.get("activa") and isinstance(prueba.get("restante"), (int, float)) else None)
    recl = doc.get("reclamacion") or {}
    a1 = next((m for m in recl.get("maquinas", []) if "a1" in str(m.get("nombre", "")).lower()), None)
    extras = {"freno": bool((doc.get("freno") or {}).get("activo")),
              "riesgo_reclamacion": bool(recl.get("riesgo")),
              "reclamable_desde": (a1 or {}).get("reclamable_desde"),
              "a1_estado": (doc.get("computo") or {}).get("a1_estado"),
              "margen_apto": bool((doc.get("margen") or {}).get("apto"))}
    errores = doc.get("errores") or []
    return {"id": "oracle", "proveedor": "oracle", "nombre": "Oracle Cloud · Always Free", "tipo": "saldo",
            "plan": "prueba gratuita hasta %s" % str(prueba.get("fin") or "")[:10] if prueba.get("activa") else "Always Free",
            "ventanas": ventanas, "saldo": saldo, "extras": extras, "fuente": "CLI de Oracle (oci)",
            "leido": doc.get("leido"), "ok": bool(ventanas) and not any(e.get("parte") == "cuenta" for e in errores),
            "error": "; ".join(e.get("error", "") for e in errores)[:120] or None, "enlace": doc.get("consola")}


def leer_medidor(cfg: dict, ahora: datetime) -> dict:
    """Adaptador `oracle_cli` del recolector: mide si toca (cada_min ≥ 15) y lo convierte."""
    cada = cfg.get("cada_min") if isinstance(cfg.get("cada_min"), (int, float)) else CADA_MIN
    return a_medidor(medir_si_toca(cada_min=cada, ahora=ahora))


# ─────────────────────────── texto para directores y agentes ───────────────────────────

def _n(v, d=2) -> str:
    if not isinstance(v, (int, float)):
        return "?"
    return ("%.*f" % (d, v)).replace(".", ",")


def resumen_agentes(doc: dict, ahora: datetime | None = None) -> str:
    """PURA: 2-4 líneas para el contexto de directores y agentes (sin ids)."""
    if not doc or not doc.get("leido"):
        return ""
    ahora = (ahora or datetime.now(timezone.utc)).astimezone(timezone.utc)
    leido = _fecha(doc.get("leido"))
    hace = int((ahora - leido).total_seconds() // 60) if leido else None
    g, comp, m = doc.get("gasto") or {}, doc.get("computo") or {}, doc.get("margen") or {}
    lineas = ["## Oracle Cloud (medido hace %s min)" % (hace if hace is not None else "?")]
    a1 = "A1 %s %s" % (comp.get("a1_nombre") or "", comp.get("a1_estado") or "sin máquina")
    lineas.append("- %s · %s · gasto del mes %s %s (presupuesto %s, previsto %s)"
                  % (a1.strip(), m.get("motivo") or "margen sin medir", _n(g.get("mes")), g.get("moneda", ""),
                     _n(g.get("presupuesto")), _n(g.get("previsto"))))
    p = doc.get("prueba") or {}
    if p.get("activa"):
        lineas.append("- Prueba: quedan ≈ %s %s de crédito hasta %s; solo se crea lo Always Free."
                      % (_n(p.get("restante"), 0), p.get("moneda", ""), str(p.get("fin") or "")[:10]))
    if (doc.get("freno") or {}).get("activo"):
        lineas.append("- FRENO: el gasto pasó de 0. No mandes trabajo ni crees nada en Oracle; avisa en el canal.")
    elif m.get("apto"):
        lineas.append("- Regla: el A1 es gratis y tiene margen; lo pesado y lo 24/7 (servicios, un agente del enjambre) va allí.")
    recl = doc.get("reclamacion") or {}
    if recl.get("riesgo"):
        a = next((x for x in recl.get("maquinas", []) if x.get("riesgo")), {})
        lineas.append("- Riesgo de reclamación: %s con CPU p95 %s %% y memoria %s %% (umbral 20 %%); reclamable desde %s. Darle trabajo lo evita."
                      % (a.get("nombre"), _n(a.get("cpu_p95"), 1), _n(a.get("mem_p95"), 1), str(a.get("reclamable_desde") or "?")[:10]))
    return "\n".join(lineas)


def texto(doc: dict) -> str:
    if not doc:
        return "Oracle: sin lectura todavía (python3 scripts/puente/medidor_oracle.py medir)"
    lineas = [resumen_agentes(doc)]
    for e in doc.get("errores") or []:
        lineas.append("- error: %s" % e.get("error"))
    return "\n".join(x for x in lineas if x)


def main(argv=None) -> int:
    args = list(sys.argv[1:] if argv is None else argv)
    accion = args[0] if args and not args[0].startswith("-") else "ver"
    if accion not in ("medir", "ver"):
        print("uso: medidor_oracle.py medir [--forzar] [--json] [--salida RUTA] | ver [--json]", file=sys.stderr)
        return 2
    ruta = SALIDA
    if "--salida" in args and args.index("--salida") + 1 < len(args):
        ruta = os.path.abspath(os.path.expanduser(args[args.index("--salida") + 1]))
    doc = medir_si_toca(forzar="--forzar" in args, ruta=ruta) if accion == "medir" else leer_archivo(ruta)
    print(json.dumps(doc, ensure_ascii=False) if "--json" in args else texto(doc))
    return 0 if doc else 1


if __name__ == "__main__":
    raise SystemExit(main())
