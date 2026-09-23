"""Experiencias: cada decisión de la Trinidad (Needle · Jev · BitNet) queda anotada.

(2026-09-20) Es la materia prima de la conciencia colectiva: qué se preguntó, qué capa
contestó, con qué confianza, cuánto tardó y —cuando se sabe— si acertó. De aquí salen
los JSONL con los que `needle finetune` entrena el adaptador colectivo cada noche y las
curvas de calibración de Jev (¿cuando dice 0,8 acierta el 80 %?).

Formato: una línea JSON por experiencia en ~/.starseed/experiencias.jsonl (append-only)
y copia en starseed_memory_root/aprendizaje/experiencias/<host>.jsonl para que el espejo
de Drive y la mesh la repartan. Nunca lleva claves ni texto completo de prompts largos:
`entrada` se recorta a 400 caracteres.
"""

import hashlib
import json
import os
import socket
import time

RUTA = os.path.expanduser("~/.starseed/experiencias.jsonl")
RAIZ = os.path.abspath(
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")
)
COPIA_DIR = os.path.join(RAIZ, "starseed_memory_root", "aprendizaje", "experiencias")
CAPAS = ("regla", "needle", "jev", "bitnet", "llm", "persona")
MAX_ENTRADA = 400


def _host():
    try:
        return socket.gethostname().split(".")[0]
    except Exception:
        return "nodo"


def _recortar(x, n=MAX_ENTRADA):
    s = x if isinstance(x, str) else json.dumps(x, ensure_ascii=False, sort_keys=True)
    return s if len(s) <= n else s[:n] + "…"


def nueva(
    capa, tipo, entrada, salida, confianza=None, ms=None, opciones=None, dominio=""
):
    """Construye una experiencia (dict) sin escribirla. `tipo`: intencion | eleccion | si_no | puntuacion | texto."""
    if capa not in CAPAS:
        raise ValueError("capa desconocida: %s" % capa)
    e = {
        "id": hashlib.sha256(
            ("%s|%s|%s|%s" % (time.time(), capa, tipo, _recortar(entrada))).encode()
        ).hexdigest()[:12],
        "t": time.strftime("%Y-%m-%d %H:%M:%S"),
        "medio": _host(),
        "capa": capa,
        "tipo": tipo,
        "dominio": dominio,
        "entrada": _recortar(entrada),
        "salida": salida,
        "confianza": None if confianza is None else round(float(confianza), 4),
        "ms": None if ms is None else int(ms),
        "resultado": None,
    }
    if opciones:
        e["opciones"] = list(opciones)
    return e


def anotar(e, ruta=None):
    """Escribe la experiencia (una línea) en el registro y en la copia del memory root."""
    linea = json.dumps(e, ensure_ascii=False) + "\n"
    for destino in (ruta or RUTA, os.path.join(COPIA_DIR, _host() + ".jsonl")):
        try:
            os.makedirs(os.path.dirname(destino), exist_ok=True)
            with open(destino, "a", encoding="utf-8") as f:
                f.write(linea)
        except OSError:
            pass
    return e.get("id") or e.get("ref")


def resultado(id_, acierto, nota="", ruta=None):
    """Cierra una experiencia con lo que pasó de verdad (True/False) — una línea de referencia."""
    return anotar(
        {
            "ref": id_,
            "t": time.strftime("%Y-%m-%d %H:%M:%S"),
            "resultado": bool(acierto),
            "nota": nota[:200],
        },
        ruta,
    )


def leer(ruta=None, ultimas=500):
    """Las últimas experiencias con su resultado aplicado (si llegó)."""
    try:
        with open(ruta or RUTA, encoding="utf-8") as f:
            lineas = f.read().splitlines()[-ultimas * 2 :]
    except OSError:
        return []
    por_id, orden = {}, []
    for l in lineas:
        try:
            d = json.loads(l)
        except Exception:
            continue
        if "ref" in d:
            if d["ref"] in por_id:
                por_id[d["ref"]]["resultado"] = d.get("resultado")
                por_id[d["ref"]]["nota_resultado"] = d.get("nota", "")
        elif d.get("id"):
            por_id[d["id"]] = d
            orden.append(d["id"])
    return [por_id[i] for i in orden[-ultimas:]]


def calibracion(exps, capa="jev"):
    """{tramo: {n, aciertos}} por décimas de confianza, solo con resultado conocido."""
    tramos = {}
    for e in exps:
        if (
            e.get("capa") != capa
            or e.get("resultado") is None
            or e.get("confianza") is None
        ):
            continue
        k = "%.1f" % (int(e["confianza"] * 10) / 10)
        t = tramos.setdefault(k, {"n": 0, "aciertos": 0})
        t["n"] += 1
        t["aciertos"] += 1 if e["resultado"] else 0
    return tramos


def para_needle(exps):
    """Las experiencias de intención con acierto → líneas JSONL que entiende `needle finetune`."""
    fuera = []
    for e in exps:
        if e.get("tipo") != "intencion" or not e.get("resultado"):
            continue
        s = e.get("salida") or {}
        if (
            not isinstance(s, dict)
            or not s.get("herramientas")
            or not s.get("llamadas")
        ):
            continue
        fuera.append(
            {
                "query": e["entrada"],
                "tools": s["herramientas"],
                "answers": [
                    {"name": c["nombre"], "arguments": c.get("argumentos") or {}}
                    for c in s["llamadas"]
                ],
                "reasoning": s.get("razonamiento") or "",
            }
        )
    return fuera
