#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""decidir · la puerta de DECISIÓN común de todos los agentes de StarSeed (2026-09-30).

Una sola puerta, por terminal o importada, para el enjambre, los analistas de los sueños,
los supervisores Claude, los subagentes de Claude que corren en la terminal de la Mac, Hermes
y los IDE. Por debajo está Jev (`jev.py`: BitNet local → Laya → OpenRouter, caché de 6 h y
techo diario); por encima, la REGLA de quien pregunta: si Jev calla (sin motor, sin crédito,
sin red, apagado con STARSEED_JEV=0), la respuesta es la regla y se dice («medio: regla»).
Nunca bloquea: Jev es consejero, nunca oráculo (memory/orquestacion-economica.md §9 y §17).

  python3 scripts/puente/decidir.py si-no   --estado '<json|@archivo|@->' --pregunta "…"
                                            [--regla si|no] [--quien <agente>] [--dominio X]
                                            [--codigo] [--json]
  python3 scripts/puente/decidir.py elegir  --estado … --pregunta "…" --opciones a,b,c [--regla b] …
  python3 scripts/puente/decidir.py puntuar --estado … --pregunta "…" --niveles bajo,medio,alto [--regla medio] …
  python3 scripts/puente/decidir.py confirmar <experiencia> --acierto si|no [--nota "…"]
  python3 scripts/puente/decidir.py uso [--json]

Cada respuesta dice la probabilidad, el medio (local · laya-local · openrouter · cache ·
regla), los ms y el id de la EXPERIENCIA que deja anotada (`experiencias.py`): con
`confirmar` se cierra el ciclo (¿acertó?) y de ahí aprende la conciencia colectiva.
Reglas de respaldo cuando Jev calla: sí/no → `--regla` o «no» (formula la pregunta para
que «sí» sea actuar); elegir → `--regla` o la PRIMERA opción (tu orden determinista);
puntuar → `--regla` o el nivel del medio. El estado se recorta (≤ 6000 caracteres) y se
tacha lo que tenga forma de clave antes de salir de la máquina.
"""

import argparse
import json
import os
import re
import sys
import threading
import time

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
if DIRECTORIO not in sys.path:
    sys.path.insert(0, DIRECTORIO)

TIPOS = {"si-no": "noul", "elegir": "choice", "puntuar": "score"}
TIPO_EXPERIENCIA = {"si-no": "si_no", "elegir": "eleccion", "puntuar": "puntuacion"}
MAX_ESTADO = 6000
MAX_PREGUNTA = 600
MAX_PREGUNTAS_LOTE = 24
SI = ("si", "sí", "s", "yes", "y", "1", "true", "verdadero")

#: Módulos sustituibles en las pruebas (nunca red ni ~/.starseed en unittest).
JEV = None
EXP = None

_SECRETOS = [
    re.compile(r"\bsk-[A-Za-z0-9_\-]{16,}"),
    re.compile(r"\bgsk_[A-Za-z0-9]{16,}"),
    re.compile(r"\bgh[pousr]_[A-Za-z0-9]{20,}"),
    re.compile(r"\bAIza[0-9A-Za-z_\-]{30,}"),
    re.compile(r"\bxox[abprs]-[A-Za-z0-9\-]{10,}"),
    re.compile(r"\bnvapi-[A-Za-z0-9_\-]{20,}"),
    re.compile(r"\bhf_[A-Za-z0-9]{20,}"),
    re.compile(r"\beyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{5,}"),
    re.compile(r"(?i)(?<=bearer )[A-Za-z0-9._\-]{20,}"),
]


def _jev():
    global JEV
    if JEV is None:
        try:
            import jev as _j

            JEV = _j
        except Exception:
            JEV = False
    return JEV or None


def _exp():
    global EXP
    if EXP is None:
        try:
            import experiencias as _e

            EXP = _e
        except Exception:
            EXP = False
    return EXP or None


def apagado():
    return os.environ.get("STARSEED_JEV", "1").strip().lower() in ("0", "no", "false", "off")


# ─────────────────────────────── estado ───────────────────────────────

def sanear(texto):
    t = texto or ""
    for p in _SECRETOS:
        t = p.sub("[REDACTADO]", t)
    return t


def leer_estado(valor, entrada=None):
    """El estado de una decisión: JSON, `@archivo`, `@-` (stdin) o texto suelto → dict."""
    if valor is None or str(valor).strip() == "":
        return {}
    texto = str(valor)
    if texto.startswith("@"):
        ruta = texto[1:]
        if ruta == "-":
            texto = (entrada or sys.stdin).read()
        else:
            with open(os.path.expanduser(ruta), encoding="utf-8", errors="replace") as f:
                texto = f.read()
    try:
        d = json.loads(texto)
    except ValueError:
        return {"texto": texto.strip()}
    return d if isinstance(d, dict) else {"estado": d}


def _podar(x, n_texto, n_lista):
    if isinstance(x, str):
        x = sanear(x)
        return x if len(x) <= n_texto else x[:n_texto] + "…"
    if isinstance(x, dict):
        return {str(k)[:80]: _podar(v, n_texto, n_lista) for k, v in list(x.items())[:60]}
    if isinstance(x, (list, tuple)):
        fuera = [_podar(v, n_texto, n_lista) for v in list(x)[:n_lista]]
        if len(x) > n_lista:
            fuera.append("… (%d más)" % (len(x) - n_lista))
        return fuera
    if isinstance(x, (int, float, bool)) or x is None:
        return x
    return _podar(str(x), n_texto, n_lista)


def recortar_estado(estado, max_chars=MAX_ESTADO):
    """El estado, sin claves y cabiendo en `max_chars` (JSON): primero se acortan los textos
    y las listas, nunca se inventa nada. Jev cobra por token: menos estado, menos coste."""
    ultimo = estado
    for n_texto, n_lista in ((10 ** 9, 10 ** 9), (600, 40), (240, 20), (100, 10), (40, 5)):
        ultimo = _podar(estado, n_texto, n_lista)
        if len(json.dumps(ultimo, ensure_ascii=False)) <= max_chars:
            return ultimo
    return {"resumen": json.dumps(ultimo, ensure_ascii=False)[:max_chars]}


# ─────────────────────────────── preguntas y respuestas ───────────────────────────────

def _opciones(opciones):
    """{clave: significado} a partir de una lista, «a,b,c» o un dict."""
    if not opciones:
        return {}
    if isinstance(opciones, dict):
        return {str(k): str(v) for k, v in opciones.items()}
    if isinstance(opciones, str):
        opciones = [o for o in opciones.split(",")]
    return {str(o).strip(): str(o).strip() for o in opciones if str(o).strip()}


def _niveles(niveles):
    if isinstance(niveles, str):
        niveles = niveles.split(",")
    return [str(n).strip() for n in (niveles or []) if str(n).strip()]


def pregunta_jev(tipo, pregunta, opciones=None, niveles=None):
    """La pregunta en el idioma de Jev (noul / choice / score)."""
    q = {"type": TIPOS[tipo], "instructions": sanear(str(pregunta))[:MAX_PREGUNTA]}
    if tipo == "elegir":
        q["criteria"] = _opciones(opciones)
    elif tipo == "puntuar":
        q["criteria"] = _niveles(niveles)
    return q


def interpretar(tipo, a, opciones=None, niveles=None):
    """La respuesta cruda de Jev → {respuesta, p, probs, confianza[, valor]} o None si no
    tiene la forma pedida (una elección fuera de las opciones no es una respuesta)."""
    if not isinstance(a, dict):
        return None
    try:
        if tipo == "si-no":
            v = a["noul"] if "noul" in a else a["probability"]
            p = min(1.0, max(0.0, float(v)))
            return {"respuesta": "sí" if p >= 0.5 else "no", "p": round(p, 4),
                    "probs": {"sí": round(p, 4), "no": round(1 - p, 4)}, "confianza": round(max(p, 1 - p), 4)}
        if tipo == "elegir":
            ops = _opciones(opciones)
            eleccion = str(a["choice"]).strip()
            if eleccion not in ops:
                por_texto = [k for k, v in ops.items() if v.lower() == eleccion.lower() or k.lower() == eleccion.lower()]
                if not por_texto:
                    return None
                eleccion = por_texto[0]
            probs = {str(k): round(float(v), 4) for k, v in (a.get("probabilities") or {}).items()}
            conf = float(a.get("confidence") or probs.get(eleccion) or 0.0)
            return {"respuesta": eleccion, "p": probs.get(eleccion, round(conf, 4)), "probs": probs,
                    "confianza": round(conf, 4)}
        if tipo == "puntuar":
            ns = _niveles(niveles)
            valor = float(a["score"])
            i = min(len(ns) - 1, max(0, int(round(valor))))

            def nombre(k):
                return ns[int(k)] if str(k).isdigit() and int(k) < len(ns) else str(k)

            probs = {nombre(k): round(float(v), 4) for k, v in (a.get("probabilities") or {}).items()}
            conf = float(a.get("confidence") or probs.get(ns[i]) or 0.0)
            return {"respuesta": ns[i], "p": probs.get(ns[i], round(conf, 4)), "probs": probs,
                    "confianza": round(conf, 4), "valor": round(valor, 4)}
    except (KeyError, TypeError, ValueError, IndexError):
        return None
    return None


def respaldo(tipo, regla=None, opciones=None, niveles=None):
    """La regla determinista cuando Jev calla. Siempre devuelve una respuesta."""
    r = str(regla).strip() if regla not in (None, "") else ""
    if tipo == "si-no":
        return {"respuesta": "sí" if r.lower() in SI else "no", "p": None, "probs": {}, "confianza": None}
    if tipo == "elegir":
        ops = list(_opciones(opciones))
        return {"respuesta": r if r in ops else (ops[0] if ops else ""), "p": None, "probs": {}, "confianza": None}
    ns = _niveles(niveles)
    return {"respuesta": r if r in ns else (ns[len(ns) // 2] if ns else ""), "p": None, "probs": {},
            "confianza": None}


#: Una pregunta a Jev a la vez por proceso: el motor local atiende de una en una
#: (--parallel 1) y jev.py lleva su caché y su contabilidad en archivos.
_TURNO = threading.Lock()


class Ocupado(Exception):
    """El turno de Jev no llegó a tiempo (otra pregunta larga en curso en este proceso)."""


def _llamar_jev(j, estado, preguntas, quien, espera=None):
    """Una pregunta a Jev con el turno del proceso. `espera` (s) acota cuánto se aguarda el
    turno: quien está en el camino caliente (elegir modelo antes de una llamada) no se queda
    detrás de un lote de triaje; sin turno a tiempo, `Ocupado` y manda la regla."""
    if espera is None:
        _TURNO.acquire()
    elif not _TURNO.acquire(timeout=max(0.0, float(espera))):
        raise Ocupado()
    try:
        try:
            return j.decidir(estado, preguntas, quien=quien)
        except TypeError:  # un jev.py anterior a `quien`
            return j.decidir(estado, preguntas)
    finally:
        _TURNO.release()


def _medio(r):
    if not isinstance(r, dict):
        return "regla"
    return "cache" if r.get("cache") else str(r.get("medio") or "jev")


def _quien(quien):
    return str(quien or os.environ.get("STARSEED_AGENTE") or "terminal").strip()[:40] or "terminal"


def _anotar(capa, tipo_exp, estado, pregunta, salida, confianza, ms, opciones, dominio, quien):
    e_mod = _exp()
    if e_mod is None:
        return None
    try:
        e = e_mod.nueva(capa, tipo_exp, {"estado": estado, "pregunta": pregunta}, salida, confianza, ms,
                        opciones=opciones or None, dominio=dominio or quien)
        e["quien"] = quien
        return e_mod.anotar(e)
    except Exception:
        return None


def consultar(tipo, estado, pregunta, opciones=None, niveles=None, quien=None, regla=None,
              dominio="", anotar=True, espera_turno=None):
    """UNA decisión tipada. Devuelve {tipo, respuesta, p, probs, confianza, medio, ms, quien,
    regla, experiencia[, valor]}. Nunca lanza por Jev: sin él, responde la regla. Con
    `espera_turno` (s), si otra pregunta ocupa a Jev más de eso, responde la regla sin anotar
    experiencia (`ocupado: True`)."""
    if tipo not in TIPOS:
        raise ValueError("tipo desconocido: %s (si-no | elegir | puntuar)" % tipo)
    if tipo == "elegir" and len(_opciones(opciones)) < 2:
        raise ValueError("elegir necesita al menos dos opciones")
    if tipo == "puntuar" and len(_niveles(niveles)) < 2:
        raise ValueError("puntuar necesita al menos dos niveles")
    quien = _quien(quien)
    estado = recortar_estado(estado if isinstance(estado, dict) else {"estado": estado})
    t0 = time.time()
    r = None
    ocupado = False
    j = None if apagado() else _jev()
    if j is not None:
        try:
            r = _llamar_jev(j, estado, {"q": pregunta_jev(tipo, pregunta, opciones, niveles)}, quien, espera_turno)
        except Ocupado:
            ocupado = True
        except Exception:
            r = None
    ans = interpretar(tipo, (r or {}).get("q"), opciones, niveles) if isinstance(r, dict) else None
    medio = _medio(r) if ans else "regla"
    if ans is None:
        ans = respaldo(tipo, regla, opciones, niveles)
    ms = round((time.time() - t0) * 1000, 1)
    fuera = dict(ans, tipo=tipo, pregunta=sanear(str(pregunta))[:300], medio=medio, ms=ms, quien=quien,
                 regla=(str(regla) if regla not in (None, "") else None), experiencia=None)
    if ocupado:
        fuera["ocupado"] = True
    if anotar and not ocupado:
        salida = {k: fuera.get(k) for k in ("respuesta", "p", "probs", "medio", "valor") if fuera.get(k) is not None}
        fuera["experiencia"] = _anotar("regla" if medio == "regla" else "jev", TIPO_EXPERIENCIA[tipo], estado,
                                       fuera["pregunta"], salida, fuera.get("confianza"), ms,
                                       list(_opciones(opciones)) or _niveles(niveles), dominio, quien)
    return fuera


def consultar_lote(estado, preguntas, quien=None, dominio="", anotar=True):
    """Varias preguntas sobre el MISMO estado en UNA llamada a Jev (el estado se paga una vez).
    `preguntas` = {id: {tipo, pregunta, opciones?, niveles?}}. Devuelve {respuestas: {id: dict},
    medio, ms, experiencia}; una pregunta que Jev no contestó NO aparece (quien llama aplica su
    regla). Como mucho MAX_PREGUNTAS_LOTE por llamada."""
    quien = _quien(quien)
    estado = recortar_estado(estado if isinstance(estado, dict) else {"estado": estado})
    elegidas = {}
    for qid, q in list((preguntas or {}).items())[:MAX_PREGUNTAS_LOTE]:
        if isinstance(q, dict) and q.get("tipo") in TIPOS and q.get("pregunta"):
            elegidas[str(qid)] = q
    t0 = time.time()
    r = None
    j = None if (apagado() or not elegidas) else _jev()
    if j is not None:
        try:
            r = _llamar_jev(j, estado, {qid: pregunta_jev(q["tipo"], q["pregunta"], q.get("opciones"), q.get("niveles"))
                                        for qid, q in elegidas.items()}, quien)
        except Exception:
            r = None
    respuestas = {}
    if isinstance(r, dict):
        for qid, q in elegidas.items():
            a = interpretar(q["tipo"], r.get(qid), q.get("opciones"), q.get("niveles"))
            if a is not None:
                respuestas[qid] = a
    medio = _medio(r) if respuestas else "regla"
    ms = round((time.time() - t0) * 1000, 1)
    fuera = {"respuestas": respuestas, "medio": medio, "ms": ms, "quien": quien, "preguntas": len(elegidas),
             "experiencia": None}
    if anotar and elegidas:
        salida = {"medio": medio, "respuestas": {k: {"r": v["respuesta"], "p": v.get("p")} for k, v in respuestas.items()}}
        fuera["experiencia"] = _anotar("regla" if medio == "regla" else "jev", "lote", estado,
                                       "%d preguntas: %s" % (len(elegidas), sanear(str(next(iter(elegidas.values()))["pregunta"]))[:200]),
                                       salida, None, ms, None, dominio, quien)
    return fuera


def confirmar(experiencia, acierto, nota=""):
    """Cierra el ciclo de una experiencia: ¿la decisión acertó? Sin esto no hay aprendizaje."""
    e_mod = _exp()
    if e_mod is None or not experiencia:
        return None
    try:
        return e_mod.resultado(str(experiencia), bool(acierto), sanear(nota or "")[:200])
    except Exception:
        return None


# ─────────────────────────────── uso ───────────────────────────────

def uso(hoy=None):
    """Lo que Jev lleva hoy: llamadas, caché, coste frente al techo y reparto por medio y agente."""
    hoy = hoy or time.strftime("%Y-%m-%d")
    j = _jev()
    if j is None:
        return {"hoy": hoy, "disponible": False, "apagado": apagado()}
    try:
        u = j._leer(j.USO, {}) or {}
    except Exception:
        u = {}
    dia = (u.get("dias") or {}).get(hoy) or {}
    try:
        d, m = j.gasto(hoy)
    except Exception:
        d, m = 0.0, 0.0
    tope_d = float(getattr(j, "PRESUPUESTO_DIA_USD", 0.0))
    tope_m = float(getattr(j, "PRESUPUESTO_MES_USD", 0.0))
    por_medio = {str(k): int((v or {}).get("llamadas") or 0) for k, v in (dia.get("por_medio") or {}).items()}
    por_quien = dict(sorted((dia.get("por_quien") or {}).items(), key=lambda kv: -int(kv[1] or 0))[:10])

    def _seguro(f, defecto):
        try:
            return bool(f())
        except Exception:
            return defecto

    return {
        "hoy": hoy,
        "disponible": True,
        "apagado": apagado(),
        "llamadas": int(dia.get("llamadas") or 0),
        "cache": int(dia.get("cache") or 0),
        "coste_usd": round(d, 6),
        "tope_dia_usd": tope_d,
        "restante_dia_usd": round(max(0.0, tope_d - d), 6),
        "mes_usd": round(m, 6),
        "tope_mes_usd": tope_m,
        "por_medio": por_medio,
        "por_quien": por_quien,
        "local_sin_respuesta": int(dia.get("local_sin_respuesta") or 0),
        "local_en_pausa": _seguro(getattr(j, "local_en_pausa", lambda: False), False),
        "openrouter_activo": _seguro(getattr(j, "activo", lambda: False), False),
        "presupuesto_ok": _seguro(lambda: j.presupuesto_ok(hoy), True),
    }


def texto_uso(u):
    if not u.get("disponible"):
        return "Jev: no disponible en esta máquina (sin jev.py)%s" % (" · apagado (STARSEED_JEV=0)" if u.get("apagado") else "")
    medios = " · ".join("%s %d" % kv for kv in sorted(u["por_medio"].items())) or "sin llamadas"
    quien = ", ".join("%s %d" % kv for kv in u["por_quien"].items()) or "—"
    return ("Jev hoy (%s): %d decisiones + %d de caché · $%.5f de $%.2f (quedan $%.5f) · mes $%.4f de $%.2f\n"
            "  medios: %s%s%s\n  quién: %s%s" % (
                u["hoy"], u["llamadas"], u["cache"], u["coste_usd"], u["tope_dia_usd"], u["restante_dia_usd"],
                u["mes_usd"], u["tope_mes_usd"], medios,
                " · local sin respuesta %d" % u["local_sin_respuesta"] if u["local_sin_respuesta"] else "",
                " · local en pausa" if u["local_en_pausa"] else "", quien,
                "" if u["presupuesto_ok"] else "\n  ⚠ techo alcanzado: Jev calla y mandan las reglas"))


# ─────────────────────────────── CLI ───────────────────────────────

def texto_decision(d):
    base = "%s · %s" % (d["respuesta"], "regla (Jev en silencio)" if d["medio"] == "regla" else d["medio"])
    if d.get("p") is not None:
        base = "%s · p=%.2f" % (base, d["p"])
    if d.get("confianza") is not None and d["tipo"] != "si-no":
        base += " · confianza %.2f" % d["confianza"]
    base += " · %d ms" % int(d.get("ms") or 0)
    if d.get("experiencia"):
        base += " · exp %s" % d["experiencia"]
    return base


def parser():
    ap = argparse.ArgumentParser(prog="decidir.py", description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="orden", required=True)
    for nombre in TIPOS:
        p = sub.add_parser(nombre)
        p.add_argument("--estado", default="{}", help="JSON, @archivo o @- (stdin)")
        p.add_argument("--pregunta", required=True)
        p.add_argument("--regla", default=None, help="respuesta si Jev calla")
        p.add_argument("--quien", default=None, help="agente que pregunta (por defecto STARSEED_AGENTE o terminal)")
        p.add_argument("--dominio", default="")
        p.add_argument("--json", action="store_true")
        if nombre == "si-no":
            p.add_argument("--codigo", action="store_true", help="código de salida 0 = sí, 1 = no")
        if nombre == "elegir":
            p.add_argument("--opciones", required=True, help="a,b,c")
        if nombre == "puntuar":
            p.add_argument("--niveles", required=True, help="de menor a mayor: bajo,medio,alto")
    p = sub.add_parser("confirmar")
    p.add_argument("experiencia")
    p.add_argument("--acierto", required=True, choices=("si", "sí", "no"))
    p.add_argument("--nota", default="")
    p.add_argument("--json", action="store_true")
    p = sub.add_parser("uso")
    p.add_argument("--json", action="store_true")
    return ap


def main(argv=None, salida=None):
    salida = salida or sys.stdout
    a = parser().parse_args(argv)
    if a.orden == "uso":
        u = uso()
        salida.write((json.dumps(u, ensure_ascii=False, indent=1) if a.json else texto_uso(u)) + "\n")
        return 0
    if a.orden == "confirmar":
        ref = confirmar(a.experiencia, a.acierto != "no", a.nota)
        d = {"ok": bool(ref), "experiencia": a.experiencia, "acierto": a.acierto != "no"}
        salida.write((json.dumps(d, ensure_ascii=False) if a.json else
                      ("✓ experiencia %s cerrada (%s)" % (a.experiencia, "acierto" if d["acierto"] else "fallo")
                       if d["ok"] else "✗ no se pudo anotar (¿experiencias.py?)")) + "\n")
        return 0 if d["ok"] else 1
    try:
        estado = leer_estado(a.estado)
    except OSError as e:
        salida.write("✗ no puedo leer el estado: %s\n" % e)
        return 2
    try:
        d = consultar(a.orden, estado, a.pregunta, opciones=getattr(a, "opciones", None),
                      niveles=getattr(a, "niveles", None), quien=a.quien, regla=a.regla, dominio=a.dominio)
    except ValueError as e:
        salida.write("✗ %s\n" % e)
        return 2
    salida.write((json.dumps(d, ensure_ascii=False) if a.json else texto_decision(d)) + "\n")
    if a.orden == "si-no" and getattr(a, "codigo", False):
        return 0 if d["respuesta"] == "sí" else 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
