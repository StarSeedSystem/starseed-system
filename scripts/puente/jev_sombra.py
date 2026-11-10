#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Prueba en sombra de Jev (MGM1110B · fase 1 de memory/orquestacion-economica.md §22).

QUÉ HACE
--------
Repite las decisiones capturadas por `jev_captura.py` con los peldaños locales que YA existen
y anota qué habrían contestado, para que Alex mida ANTES de instalar nada (regla suya: medir
primero y quedarse solo con lo que mejora de verdad):

    needle  Needle 3 (121 M) por `POST /api/needle/decidir` del backend de Astraura (:8000)
    laya    Laya / Colibri por `POST /v1/systemone` (:4470 / :4480), el mismo contrato que Jev
    bitnet  BitNet por `jev_local` (:8790), solo si ya está encendido

Un peldaño que no está disponible en esta máquina se SALTA y se dice. No se instala ni se
descarga nada. NINGÚN modelo local decide nada de verdad: esto solo lee la captura y registra.

MÉTRICAS (§7 de modelos-propios-metagenesis.md)
-----------------------------------------------
acuerdo con el proveedor (misma opción, o probabilidad del mismo lado de 0,5) · acuerdo cuando
la confianza local es ≥ 0,7 y qué parte de las decisiones cubre · mediana y p90 de latencia ·
memoria pico del proceso del peldaño (muestreada tras cada llamada) · acierto frente al
desenlace real cuando se conoce (experiencias.jsonl, por el enlace captura↔experiencia).

VEREDICTO por peldaño (los umbrales están en UMBRALES, un solo sitio; Alex los cambia ahí)
    «faltan datos»  menos de 1.000 llamadas repetidas o falta un estrato de la captura
    «se queda»      acuerdo ≥ 90 % en los casos confiables, que cubran ≥ 40 % de las
                    decisiones, con latencia mediana ≤ 3 s
    «se descarta»   en cualquier otro caso

Todo desacuerdo en el que alguien dijo «descartar» o «rechazar» (o la pregunta iba de descartar)
se lista aparte para revisarlo a mano: descartar trabajo bueno es el error caro. La lista lleva
ids y las dos respuestas; los textos se quedan en la captura.

BUEN VECINO
-----------
Prioridad baja (nice 10); solo arranca con la máquina libre (carga, turno `pesado.lock`,
conversación en vivo) y se detiene al instante si deja de estarlo; reanuda donde lo dejó
(`~/.starseed/jev-sombra/progreso.jsonl`). Nunca toma `pesado.lock` ni cambia lo que decide un director.

SALIDA (solo métricas): `~/.starseed/jev-sombra/AAAA-MM-DD/informe.md` y `resultado.json`.

    python3 scripts/puente/jev_sombra.py [ejecutar] [--max-seg 600] [--max-unidades N] [--peldanos laya,needle]
    python3 scripts/puente/jev_sombra.py informe      # rehace el informe sin repetir nada
    python3 scripts/puente/jev_sombra.py auto         # lo que usa el director: solo si toca
Interruptor: `STARSEED_JEV_SOMBRA=0`.
"""
from __future__ import annotations

import json
import math
import os
import re
import socket
import statistics
import subprocess
import sys
import time
import urllib.request
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import jev_captura as captura  # noqa: E402

SOMBRA_DIR = os.environ.get("STARSEED_JEV_SOMBRA_DIR") or os.path.expanduser("~/.starseed/jev-sombra")
EXPERIENCIAS = os.path.expanduser("~/.starseed/experiencias.jsonl")

#: Todos los umbrales juntos: Alex cambia SOLO esto.
UMBRALES = {
    "confianza": 0.7,            # confianza local mínima para contar un caso como «confiable»
    "acuerdo_confiable": 0.90,   # acuerdo mínimo con el proveedor en los casos confiables
    "cobertura": 0.40,           # parte mínima de las decisiones que deben ser confiables
    "mediana_s": 3.0,            # latencia mediana máxima (segundos)
    "minimo_llamadas": captura.OBJETIVO_LLAMADAS,   # llamadas distintas repetidas
    "estratos": captura.ESTRATOS_OBJETIVO,          # estratos que deben estar representados
    "carga_max": 3.0,            # carga (1 min) por encima de la cual la máquina no está libre
}
DESCARTA = ("descartar", "rechazar")
TIPOS = ("noul", "choice", "score")

LAYA_URL = os.environ.get("STARSEED_LAYA_URL", "http://127.0.0.1:4470/v1/systemone")
ASTRAURA = os.environ.get("STARSEED_ASTRAURA_URL", "http://127.0.0.1:8000")
PUERTOS = {"needle": 8000, "laya": 4470, "bitnet": 8790}
TIEMPO_S = 20
FALLOS_SEGUIDOS_MAX = 5
LOCK_VIEJO_S = 3 * 3600


# ── utilidades puras ─────────────────────────────────────────────────────────
def _num(x):
    try:
        v = float(x)
        return v if math.isfinite(v) else None
    except (TypeError, ValueError):
        return None


def normalizar(tipo, ans):
    """(valor_comparable, p_o_None, confianza_o_None) de una respuesta tipada, o None."""
    if not isinstance(ans, dict):
        return None
    conf = _num(ans.get("confidence"))
    if tipo == "noul":
        p = _num(ans.get("noul", ans.get("probability")))
        if p is None:
            return None
        if conf is None:
            conf = abs(p - 0.5) * 2  # sin confianza declarada: lo lejos que está del 0,5
        return ("si" if p >= 0.5 else "no"), p, conf
    if tipo == "choice":
        c = ans.get("choice")
        if c is None:
            return None
        return str(c), None, conf
    if tipo == "score":
        s = ans.get("score")
        if s is None:
            return None
        v = _num(s)
        return (("%g" % v) if v is not None else str(s)), None, conf
    return None


def _p(valores, q):
    """Percentil por rango más cercano (q en 0..1)."""
    if not valores:
        return None
    v = sorted(valores)
    return v[min(len(v) - 1, max(0, int(math.ceil(q * len(v))) - 1))]


def es_sensible(pregunta, ref, local):
    """¿Esta decisión toca «descartar»/«rechazar»? (la respuesta de cualquiera, o la pregunta)."""
    for x in (ref, local):
        if x is not None and str(x).strip().lower() in DESCARTA:
            return True
    txt = json.dumps(pregunta, ensure_ascii=False).lower() if pregunta else ""
    return any(k[:-2] in txt for k in DESCARTA)  # «descart», «rechaz»


def metricas(registros, umbrales=None, desenlaces=None):
    """Métricas de UN peldaño a partir de sus registros (dicts de progreso.jsonl). Puro."""
    u = umbrales or UMBRALES
    pedidas = len(registros)
    resp = [r for r in registros if r.get("local") is not None]
    ok = [r for r in resp if r.get("local") == r.get("ref")]
    conf = [r for r in resp if (r.get("conf") or 0) >= u["confianza"]]
    conf_ok = [r for r in conf if r.get("local") == r.get("ref")]
    ms = [r["ms"] for r in resp if r.get("ms") is not None]
    rss = [r["rss_mb"] for r in registros if r.get("rss_mb") is not None]
    por_tipo, por_estrato = {}, {}
    for r in resp:
        for dic, k in ((por_tipo, r.get("tipo")), (por_estrato, r.get("estrato"))):
            a = dic.setdefault(k, {"n": 0, "acuerdo": 0})
            a["n"] += 1
            a["acuerdo"] += 1 if r.get("local") == r.get("ref") else 0
    for dic in (por_tipo, por_estrato):
        for a in dic.values():
            a["acuerdo"] = round(a["acuerdo"] / a["n"], 4) if a["n"] else None
    med = statistics.median(ms) if ms else None
    m = {
        "decisiones": pedidas,
        "llamadas": len({r.get("id") for r in registros}),
        "respondidas": len(resp),
        "sin_respuesta": pedidas - len(resp),
        "acuerdo": round(len(ok) / len(resp), 4) if resp else None,
        "confiables": len(conf),
        "acuerdo_confiable": round(len(conf_ok) / len(conf), 4) if conf else None,
        "cobertura_confiable": round(len(conf) / pedidas, 4) if pedidas else 0.0,
        "mediana_ms": None if med is None else round(med, 1),
        "p90_ms": None if not ms else round(_p(ms, 0.9), 1),
        "rss_pico_mb": None if not rss else round(max(rss), 1),
        "estratos": sorted({e for r in registros for e in (r.get("estratos") or [])}),
        "por_tipo": por_tipo,
        "por_estrato": por_estrato,
    }
    # Frente al desenlace real: solo donde se conoce y se puede decidir cuál era la opción buena.
    des = desenlaces or {}
    n = prov_ok = loc_n = loc_ok = 0
    for r in registros:
        res = des.get(r.get("id"))
        if res is None:
            continue
        n += 1
        prov_ok += 1 if res else 0
        if r.get("local") is None:
            continue
        binaria = r.get("tipo") == "noul"
        if res or binaria:
            buena = r.get("ref") if res else ("no" if r.get("ref") == "si" else "si")
            loc_n += 1
            loc_ok += 1 if r.get("local") == buena else 0
    m["desenlace"] = {
        "conocidos": n,
        "proveedor_acierta": round(prov_ok / n, 4) if n else None,
        "comparables": loc_n,
        "local_acierta": round(loc_ok / loc_n, 4) if loc_n else None,
    }
    return m


def lista_revision(registros):
    """Desacuerdos donde alguien dijo (o iba de) descartar/rechazar: ids y las dos respuestas."""
    return [
        {"id": r["id"], "pregunta": r.get("q"), "peldano": r.get("peldano"),
         "proveedor": r.get("ref"), "local": r.get("local")}
        for r in registros
        if r.get("local") is not None and r.get("local") != r.get("ref") and r.get("sensible")
    ]


def veredicto(m, umbrales=None):
    """«faltan datos» · «se queda» · «se descarta» para un peldaño."""
    u = umbrales or UMBRALES
    if m["llamadas"] < u["minimo_llamadas"] or any(e not in m["estratos"] for e in u["estratos"]):
        return "faltan datos"
    if m["acuerdo_confiable"] is None or m["mediana_ms"] is None:
        return "se descarta"
    if (m["acuerdo_confiable"] >= u["acuerdo_confiable"] and m["cobertura_confiable"] >= u["cobertura"]
            and m["mediana_ms"] / 1000.0 <= u["mediana_s"]):
        return "se queda"
    return "se descarta"


# ── máquina libre ────────────────────────────────────────────────────────────
def maquina_libre(umbrales=None, cerrojos=None):
    """(True, "") si se puede trabajar; si no, (False, motivo). Nunca toma `pesado.lock`."""
    u = umbrales or UMBRALES
    if os.environ.get("STARSEED_JEV_SOMBRA", "1").strip().lower() in ("0", "no", "false", "off"):
        return False, "apagada (STARSEED_JEV_SOMBRA=0)"
    try:
        carga = os.getloadavg()[0]
        if carga > float(os.environ.get("STARSEED_JEV_SOMBRA_CARGA") or u["carga_max"]):
            return False, "carga %.1f" % carga
    except (OSError, ValueError):
        pass
    try:
        import turno_pesado as tp

        ruta = os.path.join(cerrojos or tp.CERROJOS, tp.NOMBRE)
        if os.path.isdir(ruta) and not tp.es_huerfano(tp._leer_dueno(ruta), tp._pids_vivos(), time.time()):
            return False, "turno de lo pesado ocupado"
    except Exception:
        pass
    try:
        import jev

        if jev.conversando():
            return False, "conversación en vivo"
    except Exception:
        pass
    return True, ""


# ── peldaños ─────────────────────────────────────────────────────────────────
_pids = {}


def rss_puerto_mb(puerto):
    """RSS (MB) del proceso que escucha en `puerto`, o None. Solo `lsof` y `ps` (lectura)."""
    try:
        pid, t = _pids.get(puerto, (None, 0))
        if pid is None or time.time() - t > 60:
            out = subprocess.run(["lsof", "-nP", "-iTCP:%d" % puerto, "-sTCP:LISTEN", "-t"],
                                 capture_output=True, text=True, timeout=5).stdout.split()
            pid = int(out[0]) if out else None
            _pids[puerto] = (pid, time.time())
        if pid is None:
            return None
        kb = subprocess.run(["ps", "-o", "rss=", "-p", str(pid)], capture_output=True, text=True, timeout=5).stdout.strip()
        return round(int(kb) / 1024.0, 1) if kb else None
    except Exception:
        return None


def puerto_abierto(puerto, host="127.0.0.1"):
    try:
        with socket.create_connection((host, puerto), timeout=1.0):
            return True
    except OSError:
        return False


def _post_json(url, cuerpo, timeout=TIEMPO_S):
    req = urllib.request.Request(url, data=json.dumps(cuerpo, ensure_ascii=False).encode("utf-8"),
                                 headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))


#: Transporte sustituible en pruebas: (url, cuerpo) -> dict. None = red local de verdad.
TRANSPORTE = None


def _enviar(url, cuerpo):
    return (TRANSPORTE or _post_json)(url, cuerpo)


class Peldano:
    """Un peldaño local: `consultar(estado, nombre, pregunta)` -> {"ans", "rss_mb"} o None."""

    def __init__(self, nombre, puerto, consultar, disponible=None):
        self.nombre, self.puerto = nombre, puerto
        self._consultar = consultar
        self._disponible = disponible or (lambda: puerto_abierto(puerto))

    def disponible(self):
        try:
            return bool(self._disponible())
        except Exception:
            return False

    def consultar(self, estado, nombre, pregunta):
        return self._consultar(estado, nombre, pregunta)


def _laya(estado, nombre, pregunta):
    r = _enviar(LAYA_URL, {"state": estado, "questions": {nombre: pregunta}})
    datos = r.get("answers") if isinstance(r, dict) and isinstance(r.get("answers"), dict) else r
    ans = (datos or {}).get(nombre) if isinstance(datos, dict) else None
    return {"ans": ans, "rss_mb": rss_puerto_mb(PUERTOS["laya"])} if ans else None


def herramientas_de(pregunta):
    """({nombre_seguro: valor}, [esquemas de herramienta]) para que Needle elija una opción."""
    tipo = (pregunta or {}).get("type")
    if tipo == "noul":
        pares = [("si", "La respuesta a la pregunta es sí."), ("no", "La respuesta a la pregunta es no.")]
    elif tipo == "choice":
        crit = (pregunta or {}).get("criteria") or {}
        pares = [(str(k), str(v)) for k, v in (crit.items() if isinstance(crit, dict) else [])]
    else:
        pares = [(str(n), "Nivel %s." % n) for n in ((pregunta or {}).get("criteria") or [])]
    mapa, esquemas = {}, []
    for k, d in pares:
        seguro = re.sub(r"\W", "_", k) or "op"
        if seguro[0].isdigit():
            seguro = "op_" + seguro
        mapa[seguro] = k
        esquemas.append({"name": seguro, "description": d[:300], "parameters": {"type": "object", "properties": {}}})
    return mapa, esquemas


def _needle(estado, nombre, pregunta):
    mapa, esquemas = herramientas_de(pregunta)
    if len(esquemas) < 2:
        return None
    consulta = "%s\n\nContexto: %s" % ((pregunta or {}).get("instructions") or "", json.dumps(estado, ensure_ascii=False)[:3000])
    r = _enviar(ASTRAURA + "/api/needle/decidir", {"consulta": consulta, "herramientas": esquemas, "sistema": None})
    if not isinstance(r, dict) or not r.get("ok") or not r.get("llamadas"):
        return None
    valor = mapa.get(str(r["llamadas"][0].get("nombre")))
    if valor is None:
        return None
    conf = _num(r.get("confianza"))
    tipo = pregunta.get("type")
    if tipo == "noul":
        c = 0.0 if conf is None else conf
        ans = {"noul": 0.5 + c / 2 if valor == "si" else 0.5 - c / 2}
    elif tipo == "choice":
        ans = {"choice": valor}
    else:
        ans = {"score": valor}
    if conf is not None:
        ans["confidence"] = conf
    ram = _num(r.get("ram_pico_mb"))
    return {"ans": ans, "rss_mb": ram if ram is not None else rss_puerto_mb(PUERTOS["needle"])}


_SONDA = {"type": "noul", "instructions": "Pregunta de prueba: ¿es 2 mayor que 1?"}


def _sondear(consultar, puerto):
    """Un peldaño está disponible solo si CONTESTA una pregunta de prueba (que el puerto esté
    abierto no basta: el 10-11 Laya daba 503 y Needle no tenía pesos, con los puertos abiertos)."""
    if not puerto_abierto(puerto):
        return False
    try:
        r = consultar({"prueba": True}, "q", _SONDA)
        return bool(r and normalizar("noul", r.get("ans")))
    except Exception:
        return False


def _laya_disponible():
    return _sondear(_laya, PUERTOS["laya"])


def _needle_disponible():
    return _sondear(_needle, PUERTOS["needle"])


def _bitnet(estado, nombre, pregunta):
    import jev_local

    r = jev_local.decidir(estado, {nombre: pregunta}, tiempo_s=30)
    ans = (r or {}).get(nombre)
    return {"ans": ans, "rss_mb": rss_puerto_mb(PUERTOS["bitnet"])} if ans else None


def _bitnet_disponible():
    try:
        import jev_local

        return bool(jev_local.disponible())
    except Exception:
        return False


def peldanos_por_defecto():
    return [
        Peldano("needle", PUERTOS["needle"], _needle, _needle_disponible),
        Peldano("laya", PUERTOS["laya"], _laya, _laya_disponible),
        Peldano("bitnet", PUERTOS["bitnet"], _bitnet, _bitnet_disponible),
    ]


# ── progreso (reanudable) ────────────────────────────────────────────────────
def _ruta(*partes):
    return os.path.join(SOMBRA_DIR, *partes)


def cargar_progreso(sombra=None):
    ruta = os.path.join(sombra or SOMBRA_DIR, "progreso.jsonl")
    fuera = []
    try:
        with open(ruta, encoding="utf-8", errors="replace") as f:
            for linea in f:
                try:
                    r = json.loads(linea)
                except ValueError:
                    continue
                if isinstance(r, dict) and r.get("id") and r.get("peldano"):
                    fuera.append(r)
    except OSError:
        pass
    return fuera


def _anexar_progreso(r, sombra=None):
    d = sombra or SOMBRA_DIR
    os.makedirs(d, mode=0o700, exist_ok=True)
    fd = os.open(os.path.join(d, "progreso.jsonl"), os.O_WRONLY | os.O_APPEND | os.O_CREAT, 0o600)
    try:
        os.write(fd, (json.dumps(r, ensure_ascii=False) + "\n").encode("utf-8"))
    finally:
        os.close(fd)


def unidades(entradas):
    """(entrada, nombre_pregunta, tipo, ref_normalizada) por cada pregunta repetible."""
    for _dia, e in entradas:
        for nombre, preg in (e.get("preguntas") or {}).items():
            tipo = (preg or {}).get("type")
            if tipo not in TIPOS:
                continue
            ref = normalizar(tipo, (e.get("respuestas") or {}).get(nombre))
            if ref is None:
                continue
            yield e, nombre, tipo, ref


def repetir(peldano, e, nombre, tipo, ref):
    """Una decisión por un peldaño -> registro de progreso (sin textos)."""
    preg = e["preguntas"][nombre]
    dominio = e.get("dominio") or e.get("quien") or "desconocido"
    base = {"id": e["id"], "q": nombre, "peldano": peldano.nombre, "tipo": tipo,
            "estrato": "%s:%s" % (tipo, dominio), "estratos": e.get("estratos") or [],
            "ref": ref[0], "ref_conf": ref[2], "medio_ref": e.get("medio")}
    t0 = time.time()
    try:
        r = peldano.consultar(e.get("estado") or {}, nombre, preg)
        ms = round((time.time() - t0) * 1000, 1)
    except Exception as ex:  # noqa: BLE001
        return dict(base, local=None, conf=None, ms=None, rss_mb=None, error=type(ex).__name__, sensible=es_sensible(preg, ref[0], None)), True
    loc = normalizar(tipo, (r or {}).get("ans")) if r else None
    if loc is None:
        return dict(base, local=None, conf=None, ms=ms, rss_mb=(r or {}).get("rss_mb"), sensible=es_sensible(preg, ref[0], None)), False
    return dict(base, local=loc[0], conf=loc[2], ms=ms, rss_mb=r.get("rss_mb"), sensible=es_sensible(preg, ref[0], loc[0])), False


# ── ejecución ────────────────────────────────────────────────────────────────
def ejecutar(peldanos, max_seg=600, max_unidades=None, libre=None, pausa_s=0.3, sombra=None, dir_captura=None, reloj=time.time):
    """Repite lo pendiente hasta acabar, agotar el tiempo o dejar de estar la máquina libre.

    Devuelve {hechas, pendientes_restantes, parada, saltados}. Reanuda: lo ya repetido no se repite.
    """
    libre = libre or maquina_libre
    try:
        os.nice(10)
    except (OSError, AttributeError):
        pass
    saltados = {p.nombre: "no disponible en esta máquina" for p in peldanos if not p.disponible()}
    activos = [p for p in peldanos if p.nombre not in saltados]
    hechos = {(r["id"], r["q"], r["peldano"]) for r in cargar_progreso(sombra)}
    pendientes = []
    for e, nombre, tipo, ref in unidades(captura.leer(dir_captura)):
        for p in activos:
            if (e["id"], nombre, p.nombre) not in hechos:
                pendientes.append((p, e, nombre, tipo, ref))
    total_pend = len(pendientes)
    t_ini, n, parada = reloj(), 0, "completo"
    seguidos = {p.nombre: 0 for p in activos}
    caidos = set()
    for p, e, nombre, tipo, ref in pendientes:
        if p.nombre in caidos:
            continue
        ok, motivo = libre()
        if not ok:
            parada = "máquina ocupada: " + motivo
            break
        if reloj() - t_ini >= max_seg:
            parada = "tiempo agotado"
            break
        if max_unidades is not None and n >= max_unidades:
            parada = "tope de unidades"
            break
        reg, fallo_duro = repetir(p, e, nombre, tipo, ref)
        if fallo_duro:  # el peldaño dio error: no se anota (se reintenta otro día) y tras varios se aparta
            seguidos[p.nombre] += 1
            if seguidos[p.nombre] >= FALLOS_SEGUIDOS_MAX:
                caidos.add(p.nombre)
                saltados[p.nombre] = "dejó de responder durante la ejecución"
            continue
        seguidos[p.nombre] = 0
        _anexar_progreso(reg, sombra)
        n += 1
        if pausa_s:
            time.sleep(pausa_s)
    return {"hechas": n, "pendientes_restantes": total_pend - n, "parada": parada, "saltados": saltados}


# ── desenlaces reales y salida ───────────────────────────────────────────────
def desenlaces_reales(dir_captura=None, ruta_experiencias=None):
    """{id_captura: True/False} donde se conoce si la decisión acertó (sin imprimir nada)."""
    enl = captura.enlaces(dir_captura)
    if not enl:
        return {}
    quiero = set(enl.values())
    res = {}
    try:
        with open(ruta_experiencias or EXPERIENCIAS, encoding="utf-8", errors="replace") as f:
            for linea in f:
                if '"ref"' not in linea:
                    continue
                try:
                    d = json.loads(linea)
                except ValueError:
                    continue
                if isinstance(d, dict) and d.get("ref") in quiero and d.get("resultado") is not None:
                    res[d["ref"]] = bool(d["resultado"])
    except OSError:
        return {}
    return {cid: res[eid] for cid, eid in enl.items() if eid in res}


def analizar(peldanos_nombres=None, sombra=None, dir_captura=None, ruta_experiencias=None, umbrales=None, saltados=None):
    """Métricas, veredictos y lista de revisión de todo lo repetido hasta ahora."""
    u = umbrales or UMBRALES
    regs = cargar_progreso(sombra)
    nombres = peldanos_nombres or sorted({r["peldano"] for r in regs})
    des = desenlaces_reales(dir_captura, ruta_experiencias)
    res, ver, rev = {}, {}, []
    for nom in nombres:
        propios = [r for r in regs if r["peldano"] == nom]
        m = metricas(propios, u, des)
        res[nom] = m
        ver[nom] = veredicto(m, u)
        rev.extend(lista_revision(propios))
    cap = captura.resumen(dir_captura)
    return {
        "fecha": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "captura": {k: cap[k] for k in ("llamadas", "objetivo", "estratos_presentes", "estratos_faltan", "objetivo_alcanzado", "por_estrato")},
        "umbrales": {k: (list(v) if isinstance(v, tuple) else v) for k, v in u.items()},
        "peldanos": res,
        "veredictos": ver,
        "saltados": saltados or {},
        "revision_manual": rev,
        "nota": "Ningún modelo local decide nada todavía: esto solo repite la captura y registra.",
    }


def _pc(x):
    return "—" if x is None else "%.1f %%" % (x * 100)


def informe_md(r):
    u = r["umbrales"]
    L = ["# Prueba en sombra de Jev · %s" % r["fecha"], "",
         "Solo métricas. Los textos de las decisiones se quedan en la captura local. **Ningún modelo local decide nada todavía.**", "",
         "Captura: %d de %d llamadas · estratos %d de %d%s" % (
             r["captura"]["llamadas"], r["captura"]["objetivo"], r["captura"]["estratos_presentes"],
             len(u["estratos"]), (" · faltan: " + ", ".join(r["captura"]["estratos_faltan"])) if r["captura"]["estratos_faltan"] else ""), "",
         "Umbral de «se queda»: acuerdo ≥ %s con confianza ≥ %s, cubriendo ≥ %s de las decisiones, mediana ≤ %s s; mínimo %d llamadas y todos los estratos." % (
             _pc(u["acuerdo_confiable"]), u["confianza"], _pc(u["cobertura"]), u["mediana_s"], u["minimo_llamadas"]), ""]
    for nom, m in r["peldanos"].items():
        L += ["## %s · %s" % (nom, r["veredictos"][nom].upper()), "",
              "- Decisiones repetidas: %d (de %d llamadas) · respondidas %d · sin respuesta %d" % (m["decisiones"], m["llamadas"], m["respondidas"], m["sin_respuesta"]),
              "- Acuerdo con el proveedor: %s" % _pc(m["acuerdo"]),
              "- Con confianza ≥ %s: acuerdo %s, cubre %s (%d casos)" % (u["confianza"], _pc(m["acuerdo_confiable"]), _pc(m["cobertura_confiable"]), m["confiables"]),
              "- Latencia: mediana %s ms · p90 %s ms" % (m["mediana_ms"], m["p90_ms"]),
              "- Memoria pico del proceso (muestreada): %s MB" % m["rss_pico_mb"],
              "- Frente al desenlace real: %d conocidos · proveedor acierta %s · local acierta %s (en %d comparables)" % (
                  m["desenlace"]["conocidos"], _pc(m["desenlace"]["proveedor_acierta"]), _pc(m["desenlace"]["local_acierta"]), m["desenlace"]["comparables"]),
              "- Por tipo: " + (", ".join("%s %s (%d)" % (k, _pc(v["acuerdo"]), v["n"]) for k, v in sorted(m["por_tipo"].items())) or "—"), ""]
    for nom, motivo in r["saltados"].items():
        L.append("- **%s** saltado: %s." % (nom, motivo))
    L += ["", "## Revisión manual (desacuerdos con «descartar»/«rechazar»): %d" % len(r["revision_manual"]), ""]
    L += ["- `%s` · %s · %s · proveedor=%s · local=%s" % (x["id"], x["peldano"], x["pregunta"], x["proveedor"], x["local"]) for x in r["revision_manual"][:200]]
    if len(r["revision_manual"]) > 200:
        L.append("- … y %d más en resultado.json" % (len(r["revision_manual"]) - 200))
    return "\n".join(L) + "\n"


def escribir_salida(r, sombra=None):
    base = sombra or SOMBRA_DIR
    d = os.path.join(base, r["fecha"])
    os.makedirs(d, mode=0o700, exist_ok=True)
    for nombre, texto in (("resultado.json", json.dumps(r, ensure_ascii=False, indent=2)), ("informe.md", informe_md(r))):
        with open(os.path.join(d, nombre), "w", encoding="utf-8") as f:
            f.write(texto)
        os.chmod(os.path.join(d, nombre), 0o600)
    # Lo que ve `jev_captura.py resumen` y el Mando: solo el veredicto.
    with open(os.path.join(base, "ultimo.json"), "w", encoding="utf-8") as f:
        json.dump({"fecha": r["fecha"], "veredictos": r["veredictos"], "saltados": r["saltados"]}, f, ensure_ascii=False)
    return d


# ── cerrojo de ejecución (solo entre ejecuciones de esta prueba) ─────────────
def _tomar_cerrojo(sombra=None):
    d = sombra or SOMBRA_DIR
    os.makedirs(d, mode=0o700, exist_ok=True)
    ruta = os.path.join(d, "ejecucion.lock")
    for _ in range(2):
        try:
            fd = os.open(ruta, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            os.write(fd, ("%d %d" % (os.getpid(), time.time())).encode())
            os.close(fd)
            return ruta
        except FileExistsError:
            try:
                with open(ruta) as f:
                    pid, t = f.read().split()[:2]
                vivo = True
                try:
                    os.kill(int(pid), 0)
                except OSError:
                    vivo = False
                if vivo and time.time() - float(t) < LOCK_VIEJO_S:
                    return None
            except Exception:
                pass
            try:
                os.remove(ruta)
            except OSError:
                return None
    return None


def correr(nombres=None, max_seg=600, max_unidades=None, libre=None, peldanos=None, sombra=None, dir_captura=None, pausa_s=0.3):
    """Ejecuta, analiza y escribe la salida. Devuelve (resultado, ejecucion)."""
    todos = peldanos if peldanos is not None else peldanos_por_defecto()
    if nombres:
        todos = [p for p in todos if p.nombre in nombres]
    cerrojo = _tomar_cerrojo(sombra)
    if cerrojo is None:
        return None, {"parada": "ya hay otra ejecución en marcha", "hechas": 0, "pendientes_restantes": 0, "saltados": {}}
    try:
        ej = ejecutar(todos, max_seg, max_unidades, libre, pausa_s, sombra, dir_captura)
    finally:
        try:
            os.remove(cerrojo)
        except OSError:
            pass
    res = analizar([p.nombre for p in todos if p.nombre not in ej["saltados"]] or None, sombra, dir_captura, saltados=ej["saltados"])
    escribir_salida(res, sombra)
    return res, ej


def auto(sombra=None, dir_captura=None, **kw):
    """Para el director: solo corre si la captura llegó a la meta y aún queda algo por repetir hoy."""
    if os.environ.get("STARSEED_JEV_SOMBRA", "1").strip().lower() in ("0", "no", "false", "off"):
        return "apagada"
    if not captura.resumen(dir_captura)["objetivo_alcanzado"]:
        return "la captura aún no llegó a la meta"
    ok, motivo = (kw.get("libre") or maquina_libre)()
    if not ok:
        return "máquina ocupada: " + motivo
    res, ej = correr(sombra=sombra, dir_captura=dir_captura, **kw)
    return "hechas %d · quedan %d · %s" % (ej["hechas"], ej["pendientes_restantes"], ej["parada"])


def main(argv=None):
    import argparse

    p = argparse.ArgumentParser(description="Prueba en sombra de Jev (no instala nada, no decide nada)")
    sub = p.add_subparsers(dest="orden")
    e = sub.add_parser("ejecutar")
    e.add_argument("--max-seg", type=int, default=600)
    e.add_argument("--max-unidades", type=int, default=None)
    e.add_argument("--peldanos", default="", help="needle,laya,bitnet (por defecto, los disponibles)")
    sub.add_parser("informe")
    sub.add_parser("auto")
    a = p.parse_args(argv)
    orden = a.orden or "ejecutar"
    if orden == "auto":
        print(auto())
        return 0
    if orden == "informe":
        r = analizar()
        print("informe en " + escribir_salida(r))
        print("veredictos: " + (", ".join("%s=%s" % kv for kv in r["veredictos"].items()) or "ninguno"))
        return 0
    nombres = [x for x in (getattr(a, "peldanos", "") or "").split(",") if x]
    res, ej = correr(nombres, getattr(a, "max_seg", 600), getattr(a, "max_unidades", None))
    print("hechas %d · quedan %d · %s" % (ej["hechas"], ej["pendientes_restantes"], ej["parada"]))
    for k, v in ej["saltados"].items():
        print("saltado %s: %s" % (k, v))
    if res:
        print("veredictos: " + (", ".join("%s=%s" % kv for kv in res["veredictos"].items()) or "ninguno"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
