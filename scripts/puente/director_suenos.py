#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""director_suenos · funde los informes de una sesión de sueños profundos en recomendaciones.

    (se usa desde `python3 scripts/puente/suenos.py consolidar [--fecha …] [--tope 15] [--seco]`)

POR QUÉ EXISTE (2026-09-29). Una sesión de sueños deja hasta 84 informes (14 áreas × 6
lentes), cada uno con ≤ 10 hallazgos. Nadie lee 800 hallazgos. Este director hace lo que
haría un jefe de redacción:

  1. Lee los informes (`<área>--<lente>.json`; si solo hay `.md`, lo lee con `dream_a_cola`,
     el mismo lector del Dream) y los veredictos de los supervisores Claude
     (`verificaciones.jsonl`, solo se añade: nadie borra un veredicto).
  2. Aparta lo rechazado; aplica lo ajustado (impacto/esfuerzo/confianza corregidos).
  3. Deduplica entre áreas: misma clave de título (`dream_a_cola.clave`) o misma cita
     (±3 líneas del mismo archivo) → UN hallazgo que recuerda de qué áreas y lentes vino.
  4. Ordena: primero el TRAMO DE CAPACIDAD (`prioridad_logica.es_de_capacidad`: lo que sube el
     techo del sistema va primero, regla de Alex del 2026-09-20), y dentro, por
     verificación × impacto/esfuerzo × confianza (verificado 1 · ajustado 0,8 · sin verificar 0,4).
  5. Escribe `dream/profundo/<fecha>/INFORME.md` y `olas/cola-suenos-propuesta-<fecha>.json`
     (≤ 15 tareas de ≤ 3 archivos, `aprobacion: true`, NO se lanza: la abre una persona en el
     Diseñador de olas) y lo anuncia en el canal; a Telegram solo el resumen final.

Lo ya propuesto otro día (memoria `~/.starseed/dream-encargado.json`, la misma del Dream) no
vuelve a la cola: se marca en el informe como «ya encargada».

JEV DE CONSEJERO (2026-09-29, Alex: «usa todas las habilidades y herramientas del Puente de
Mando y del workflow como Jev»). Para cada hallazgo del ranking (hasta STARSEED_SUENOS_JEV_MAX,
30 por defecto) se le hacen a Jev dos preguntas tipadas con el contrato de
`POST /api/jev/systemone` (`jev.contrato`): ¿es accionable por el enjambre? (sí/no con
probabilidad) y ¿qué prioridad? (alta · media · baja). La pirámide es la de Jev: BitNet LOCAL
primero (gratis), Laya, y OpenRouter solo con su techo diario (`jev.presupuesto_ok`); los
hallazgos PRIVADOS (lente de seguridad) solo se consultan en local, nunca salen de la Mac.
Consejero, nunca oráculo: la regla determinista (`regla_consejo`) decide, y Jev solo VETA lo
accionable con mucha seguridad (p < 0,2) o afina la prioridad cuando su confianza pasa de 0,6.
Sin Jev (apagado, sin red, sin local), manda la regla y queda dicho. Cada consejo queda escrito
en el informe (columna «Jev») y en consolidado.json.

AVISOS. El resumen va al canal común (`puente.decir`), a la bandeja de Reportes del Mando (UN
evento `informe` de `director-suenos` en el bus: poco y grueso, §15) y, solo cuando la sesión
está completa, a Telegram por Hermes (`hermes send -t telegram:Maggasukha`), si Hermes está.

Núcleo PURO (`consolidar`, `render_informe`, `cola_propuesta`, `resumen_corto`); lo que toca
disco o red está en funciones pequeñas con la ruta por parámetro.
"""

import json
import os
import re
import shutil
import subprocess
import sys
import time

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
if DIRECTORIO not in sys.path:
    sys.path.insert(0, DIRECTORIO)

import dream_a_cola as D  # noqa: E402

try:
    import prioridad_logica as _prio  # noqa: E402
except Exception:  # pragma: no cover
    _prio = None

MEMORIA_ENCARGADAS = os.path.expanduser("~/.starseed/dream-encargado.json")
PESO_VERIFICACION = {"verificado": 1.0, "ajustado": 0.8, "sin_verificar": 0.4}
ESTADOS_VEREDICTO = ("verificado", "ajustado", "rechazado")
TOPE_PROPUESTA = 15
JEV_MAX = int(os.environ.get("STARSEED_SUENOS_JEV_MAX", "30"))
PRIORIDADES = ("alta", "media", "baja")
FACTOR_PRIORIDAD = {"alta": 1.2, "media": 1.0, "baja": 0.85}
VETO_JEV = 0.2
CONFIANZA_JEV = 0.6
DESTINO_TELEGRAM = os.environ.get("STARSEED_TELEGRAM_DESTINO", "telegram:Maggasukha")
_CITA = re.compile(r"`([^`:\s]+):(\d+)`")
_NUM = {
    "impacto": re.compile(r"impacto\s+(\d)"),
    "esfuerzo": re.compile(r"esfuerzo\s+(\d)"),
    "confianza": re.compile(r"confianza\s+([01](?:[.,]\d+)?)"),
}


# ─────────────────────────────── lectura (impura, con ruta) ───────────────────────────────

def _hallazgos_de_md(texto):
    """Plan B: hallazgos de un informe que solo existe en .md (formato del Dream)."""
    fuera, vistas = [], set()
    for nombre, lineas in D.secciones(texto).items():
        seccion = "riesgo" if "riesgo" in nombre else "idea" if "idea" in nombre else "mejora"
        for titulo, cuerpo in D.puntos(lineas):
            k = D.clave(titulo)
            if not k or k in vistas:
                continue
            vistas.add(k)
            cita = _CITA.search(cuerpo)
            h = {"clave": k, "titulo": titulo, "seccion": seccion, "detalle": cuerpo[:600],
                 "archivo": cita.group(1) if cita else "", "linea": int(cita.group(2)) if cita else 0,
                 "impacto": 2, "esfuerzo": 3, "confianza": 0.5, "propuesta": {"titulo": titulo, "archivos": [], "cambio": ""}}
            for campo, patron in _NUM.items():
                m = patron.search(cuerpo)
                if m:
                    h[campo] = float(m.group(1).replace(",", ".")) if campo == "confianza" else int(m.group(1))
            if cita:
                h["propuesta"]["archivos"] = [cita.group(1)]
            fuera.append(h)
    return fuera


def leer_informes(dir_sesion):
    """Informes de la sesión: los .json del analista y, si alguno solo existe en .md, ese."""
    fuera, vistos = [], set()
    try:
        nombres = sorted(os.listdir(dir_sesion))
    except OSError:
        return []
    for n in nombres:
        if not n.endswith(".json") or "--" not in n:
            continue
        try:
            with open(os.path.join(dir_sesion, n), encoding="utf-8") as f:
                d = json.load(f)
        except (OSError, ValueError):
            continue
        if isinstance(d, dict) and d.get("id") and isinstance(d.get("hallazgos"), list):
            fuera.append(d)
            vistos.add(n[:-5])
    for n in nombres:
        if not n.endswith(".md") or "--" not in n or n[:-3] in vistos:
            continue
        area, _, lente = n[:-3].partition("--")
        try:
            texto = open(os.path.join(dir_sesion, n), encoding="utf-8").read()
        except OSError:
            continue
        m = re.search(r"Tarea\s+([A-Za-z][A-Za-z0-9]{0,8})", texto)
        fuera.append({"id": m.group(1) if m else n[:-3], "area": area, "lente": lente,
                      "privado": "PRIVADO" in texto[:2000], "hallazgos": _hallazgos_de_md(texto), "desde_md": True})
    return fuera


def leer_veredictos(dir_sesion):
    """{tarea: veredicto fundido} de `verificaciones.jsonl`, en orden: el último estado manda,
    los ajustes se acumulan (el último valor de cada campo gana) y los rechazos se suman."""
    fuera = {}
    try:
        lineas = open(os.path.join(dir_sesion, "verificaciones.jsonl"), encoding="utf-8").read().splitlines()
    except OSError:
        return fuera
    for l in lineas:
        try:
            d = json.loads(l)
        except ValueError:
            continue
        tid = str(d.get("tarea") or "")
        estado = str(d.get("estado") or "")
        if not tid or estado not in ESTADOS_VEREDICTO:
            continue
        v = fuera.setdefault(tid, {"estado": estado, "ajustes": {}, "rechazados": set(), "notas": []})
        v["estado"] = estado
        v["por"] = d.get("por") or v.get("por") or ""
        v["t"] = d.get("t") or ""
        if d.get("nota"):
            v["notas"].append(str(d["nota"])[:400])
        for k, cambios in (d.get("ajustes") or {}).items():
            try:
                i = int(k)
            except (TypeError, ValueError):
                continue
            if isinstance(cambios, dict):
                v["ajustes"].setdefault(i, {}).update(
                    {c: cambios[c] for c in ("impacto", "esfuerzo", "confianza") if c in cambios})
        for i in d.get("rechazados") or []:
            try:
                v["rechazados"].add(int(i))
            except (TypeError, ValueError):
                continue
    return fuera


def ya_encargadas(ruta=MEMORIA_ENCARGADAS):
    try:
        with open(ruta, encoding="utf-8") as f:
            return set(json.load(f).get("claves", []))
    except (OSError, ValueError, AttributeError):
        return set()


def anotar_encargadas(claves, ruta=MEMORIA_ENCARGADAS):
    """La misma memoria que el Dream: lo propuesto hoy no se vuelve a proponer mañana."""
    try:
        os.makedirs(os.path.dirname(ruta), exist_ok=True)
        todas = ya_encargadas(ruta) | set(claves or [])
        tmp = ruta + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump({"claves": sorted(todas), "t": time.strftime("%Y-%m-%d %H:%M:%S")}, f, ensure_ascii=False, indent=2)
        os.replace(tmp, ruta)
    except OSError:
        pass


# ─────────────────────────────── núcleo puro ───────────────────────────────

def _num(v, defecto):
    try:
        return float(v)
    except (TypeError, ValueError):
        return defecto


def es_de_capacidad(h):
    if _prio is None:
        return False
    try:
        return bool(_prio.es_de_capacidad({"archivos": (h.get("propuesta") or {}).get("archivos") or [h.get("archivo")]}))
    except Exception:
        return False


def puntuar(h):
    """verificación × impacto/esfuerzo × confianza."""
    peso = PESO_VERIFICACION.get(h.get("verificacion"), PESO_VERIFICACION["sin_verificar"])
    return round(peso * _num(h.get("impacto"), 1) / max(1.0, _num(h.get("esfuerzo"), 5)) * _num(h.get("confianza"), 0), 4)


def _mismo(a, b):
    if a.get("clave") and a.get("clave") == b.get("clave"):
        return True
    return bool(a.get("archivo")) and a.get("archivo") == b.get("archivo") and \
        abs(int(_num(a.get("linea"), 0)) - int(_num(b.get("linea"), 0))) <= 3


def consolidar(informes, veredictos, encargadas=(), consejero=None, tope_jev=JEV_MAX):
    """El ranking de la sesión. PURA (el consejero entra por parámetro; None = solo la regla).
    Devuelve {ranking, por_area, riesgos, cuentas}."""
    encargadas = set(encargadas or ())
    cuentas = {"informes": len(informes), "hallazgos": 0, "rechazados": 0, "duplicados": 0,
               "verificados": 0, "ajustados": 0, "rechazados_informe": 0, "sin_verificar": 0}
    items = []
    for inf in informes:
        v = veredictos.get(inf.get("id")) or {}
        est_inf = v.get("estado") or "sin_verificar"
        clave_cuenta = {"verificado": "verificados", "ajustado": "ajustados", "rechazado": "rechazados_informe"}.get(est_inf, "sin_verificar")
        cuentas[clave_cuenta] += 1
        for i, h in enumerate(inf.get("hallazgos") or [], 1):
            cuentas["hallazgos"] += 1
            if est_inf == "rechazado" or i in (v.get("rechazados") or set()):
                cuentas["rechazados"] += 1
                continue
            x = dict(h)
            x["propuesta"] = dict(h.get("propuesta") or {})
            ajuste = (v.get("ajustes") or {}).get(i)
            if ajuste:
                x.update(ajuste)
                x["verificacion"] = "ajustado"
            elif est_inf in ("verificado", "ajustado"):
                x["verificacion"] = est_inf
            else:
                x["verificacion"] = "sin_verificar"
            x.update({
                "tarea": inf.get("id"), "indice": i, "area": inf.get("area"), "lente": inf.get("lente"),
                "privado": bool(inf.get("privado")), "por": v.get("por") or "",
                "clave": x.get("clave") or D.clave(x.get("titulo")),
            })
            x["areas"] = [x["area"]]
            x["lentes"] = [x["lente"]]
            x["apariciones"] = 1
            items.append(x)
    # Deduplicar: se queda el de más puntuación y recuerda de dónde vino cada copia.
    for x in items:
        x["puntuacion"] = puntuar(x)
    items.sort(key=lambda x: -x["puntuacion"])
    unicos = []
    for x in items:
        igual = next((u for u in unicos if _mismo(u, x)), None)
        if igual is None:
            unicos.append(x)
            continue
        cuentas["duplicados"] += 1
        igual["apariciones"] += 1
        for campo, valor in (("areas", x["area"]), ("lentes", x["lente"])):
            if valor not in igual[campo]:
                igual[campo].append(valor)
        igual["privado"] = igual["privado"] or x["privado"]
        igual["confianza"] = round(min(1.0, _num(igual.get("confianza"), 0) + 0.05), 2)
    for u in unicos:
        u["capacidad"] = es_de_capacidad(u)
        u["ya_encargada"] = u["clave"] in encargadas
        u["puntuacion"] = puntuar(u)
    unicos.sort(key=lambda u: (not u["capacidad"], -u["puntuacion"], u["tarea"] or "", u["indice"]))
    cuentas["jev"] = aconsejar(unicos, consejero, tope_jev)
    unicos.sort(key=lambda u: (not u["capacidad"], not u["accionable"], -u["puntuacion"], u["tarea"] or "", u["indice"]))
    por_area = {}
    for u in unicos:
        por_area.setdefault(u["area"], []).append(u)
    riesgos = [u for u in unicos if u.get("seccion") == "riesgo"]
    cuentas["unicos"] = len(unicos)
    return {"ranking": unicos, "por_area": por_area, "riesgos": riesgos, "cuentas": cuentas}


# ─────────────────────────────── Jev de consejero ───────────────────────────────

def regla_consejo(u):
    """La regla determinista de siempre: accionable si trae archivos donde hacerlo y su cita
    no es inventada; una IDEA, además, tiene que decir qué hacer (verbo de acción, el mismo
    criterio que el Dream: una idea sin verbo es una observación, no un encargo). Prioridad
    por puntuación (la capacidad siempre alta)."""
    prop = u.get("propuesta") or {}
    dice_que_hacer = u.get("seccion") != "idea" or bool(
        D.es_accionable(u.get("titulo"), "%s %s" % (u.get("detalle") or "", prop.get("titulo") or "")))
    accionable = dice_que_hacer and bool(prop.get("archivos") or u.get("archivo")) \
        and u.get("cita_valida", True) is not False
    p = _num(u.get("puntuacion"), 0)
    prioridad = "alta" if (u.get("capacidad") or p >= 1.5) else ("media" if p >= 0.6 else "baja")
    return {"accionable": accionable, "prioridad": prioridad}


def estado_para_jev(u):
    """Lo que Jev ve de un hallazgo: sin rutas absolutas ni nada que no esté ya en el informe."""
    prop = u.get("propuesta") or {}
    return {
        "que": "hallazgo de un sueño profundo (análisis de código) de StarSeed OS",
        "reglas": "una tarea del enjambre toca como mucho 3 archivos y 120 líneas por archivo, pasa tsc y "
                  "vitest, y no se encarga lo que ya está hecho ni lo que no se puede comprobar",
        "hallazgo": {
            "titulo": u.get("titulo"), "seccion": u.get("seccion"), "detalle": str(u.get("detalle") or "")[:400],
            "cita": "%s:%s" % (u.get("archivo"), u.get("linea")), "area": u.get("area"), "lente": u.get("lente"),
            "impacto": u.get("impacto"), "esfuerzo": u.get("esfuerzo"), "confianza": u.get("confianza"),
            "verificacion": u.get("verificacion"), "repetido_en_areas": len(u.get("areas") or []),
            "propuesta": {"titulo": prop.get("titulo"), "archivos": list(prop.get("archivos") or [])[:3]},
        },
    }


PREGUNTAS_JEV = [
    {"id": "accionable", "type": "noul",
     "question": "¿Puede el enjambre convertir este hallazgo en una tarea concreta y verificable de ≤3 archivos "
                 "que mejore StarSeed OS, sin que sea trabajo inventado o ya hecho?"},
    {"id": "prioridad", "type": "choice",
     "question": "¿Qué prioridad tiene para las próximas olas, pensando en impacto real por esfuerzo?",
     "options": list(PRIORIDADES)},
]


def leer_respuesta_jev(r):
    """{p_accionable, prioridad, confianza, medio} de una respuesta del contrato openjev, o None."""
    if not isinstance(r, dict):
        return None
    fuera = {"medio": r.get("medio") or "jev"}
    for a in r.get("answers") or []:
        if not isinstance(a, dict):
            continue
        if a.get("id") == "accionable":
            probs = a.get("probs") or {}
            p = probs.get("sí", probs.get("si"))
            if p is not None:
                fuera["p_accionable"] = round(_num(p, 0), 3)
        elif a.get("id") == "prioridad" and str(a.get("answer")) in PRIORIDADES:
            fuera["prioridad"] = str(a["answer"])
            fuera["confianza"] = round(_num(a.get("confidence"), 0), 3)
    return fuera if ("p_accionable" in fuera or "prioridad" in fuera) else None


def consejero_jev():
    """El consejero de verdad: `jev.contrato` (el contrato de POST /api/jev/systemone), con la
    pirámide local → Laya → OpenRouter de Jev. None si Jev está apagado o no se puede importar.
    Lo privado va solo a local; sin presupuesto de OpenRouter para hoy, todo a local."""
    if os.environ.get("STARSEED_JEV", "1").strip().lower() in ("0", "no", "false"):
        return None
    try:
        import jev  # noqa: E402
    except Exception:
        return None
    try:
        solo_local = not jev.presupuesto_ok()
    except Exception:
        solo_local = True

    def consejo(estado, privado):
        peticion = {"state": estado, "questions": PREGUNTAS_JEV}
        if privado or solo_local:
            peticion["medio"] = "local"
        try:
            return leer_respuesta_jev(jev.contrato(peticion))
        except Exception:
            return None

    return consejo


def aconsejar(ranking, consejero, tope=JEV_MAX):
    """Aplica la regla y, a los `tope` primeros, el consejo de Jev. Marca cada hallazgo con
    `accionable`, `prioridad` y `jev` (qué dijo quién). Devuelve el recuento por medio."""
    cuenta = {"consultas": 0, "regla": 0, "vetados": 0, "por_medio": {}}
    for i, u in enumerate(ranking):
        base = regla_consejo(u)
        c = None
        if consejero is not None and i < max(0, int(tope or 0)):
            try:
                c = consejero(estado_para_jev(u), bool(u.get("privado")))
            except Exception:
                c = None
        accionable, prioridad = base["accionable"], base["prioridad"]
        if c:
            cuenta["consultas"] += 1
            medio = str(c.get("medio") or "jev")
            cuenta["por_medio"][medio] = cuenta["por_medio"].get(medio, 0) + 1
            p = c.get("p_accionable")
            veto = accionable and p is not None and p < VETO_JEV
            if veto:
                accionable = False
                cuenta["vetados"] += 1
            if c.get("prioridad") in PRIORIDADES and _num(c.get("confianza"), 0) >= CONFIANZA_JEV:
                prioridad = c["prioridad"]
                u["puntuacion"] = round(_num(u.get("puntuacion"), 0) * FACTOR_PRIORIDAD[prioridad], 4)
            u["jev"] = {"p_accionable": p, "prioridad": c.get("prioridad"), "confianza": c.get("confianza"),
                        "medio": medio, "veto": veto, "regla": base}
        else:
            cuenta["regla"] += 1
            u["jev"] = {"medio": "regla", "regla": base}
        u["accionable"] = accionable
        u["prioridad"] = prioridad
    return cuenta


def _texto_jev(u):
    j = u.get("jev") or {}
    if j.get("medio") == "regla" or not j:
        return "regla: %s%s" % (u.get("prioridad", "—"), "" if u.get("accionable", True) else " · no accionable")
    p = j.get("p_accionable")
    return "%s%s (%s)%s" % (u.get("prioridad", "—"), (" · %.2f" % p) if p is not None else "", j.get("medio"),
                            " · VETO" if j.get("veto") else "")


def _celda(s, n=90):
    s = " ".join(str(s or "").split()).replace("|", "/")
    return s if len(s) <= n else s[: n - 1] + "…"


def _texto_verif(u):
    if u["verificacion"] == "sin_verificar":
        return "sin verificar"
    return "%s por %s" % (u["verificacion"], u.get("por") or "claude")


def render_informe(c, sesion, planificadas=None, cola_nombre=None, n_cola=0, tope=15):
    """INFORME.md de la sesión. PURA."""
    k = c["cuentas"]
    rk = c["ranking"]
    total = planificadas if planificadas is not None else k["informes"]
    verificados = k["verificados"] + k["ajustados"] + k["rechazados_informe"]
    lin = [
        "# 🌌 Sueños profundos — INFORME (%s)" % sesion, "",
        "> %d informes de %d planificados · %d revisados por un supervisor Claude (%d verificados, %d ajustados, "
        "%d rechazados) · %d hallazgos únicos (%d duplicados fundidos, %d rechazados) · generado %s"
        % (k["informes"], total, verificados, k["verificados"], k["ajustados"], k["rechazados_informe"],
           k["unicos"], k["duplicados"], k["rechazados"], time.strftime("%Y-%m-%d %H:%M")),
        "", "## Resumen ejecutivo", "",
    ]
    areas = sorted(c["por_area"])
    lentes = sorted({l for u in rk for l in u["lentes"]})
    lin.append("- **Áreas soñadas:** %s. **Lentes:** %s." % (", ".join(areas) or "—", ", ".join(lentes) or "—"))
    if rk:
        lin.append("- **Lo que más pesa:** " + "; ".join(
            "%s (%s)" % (_celda(u["titulo"], 70), u["area"]) for u in rk[:3]))
    cap = [u for u in rk if u["capacidad"]]
    lin.append("- **Tramo de capacidad** (sube el techo: más agentes o mejores modelos): %d recomendación(es), van primero." % len(cap))
    lin.append("- **Verificación:** %d de %d informes revisados por Claude; lo no verificado pesa 0,4 frente a 1 en el orden."
               % (verificados, k["informes"]))
    jv = k.get("jev") or {}
    medios = ", ".join("%s %d" % (m, n) for m, n in sorted((jv.get("por_medio") or {}).items())) or "ninguno"
    lin.append("- **Consejero Jev:** %d consultas (%s), %d vetadas por no accionables; %d por la regla determinista."
               % (jv.get("consultas", 0), medios, jv.get("vetados", 0), jv.get("regla", 0)))
    riesgos_priv = sum(1 for u in c["riesgos"] if u["privado"])
    lin.append("- **Riesgos:** %d (%d privados, solo en esta Mac)." % (len(c["riesgos"]), riesgos_priv))
    if cola_nombre:
        lin.append("- **Cola propuesta:** `starseed_memory_root/olas/%s` · %d tareas con visto bueno humano (`aprobacion: true`). "
                   "**No se ha lanzado**: ábrela en el Diseñador de olas." % (cola_nombre, n_cola))
    lin += ["", "## Top %d recomendaciones" % tope, "",
            "| # | Recomendación | Área × lente | Cita | I | E | Conf. | Verificación | Jev | Tarea |",
            "|---|---|---|---|---|---|---|---|---|---|"]
    for i, u in enumerate(rk[:tope], 1):
        marcas = ("⚡ " if u["capacidad"] else "") + ("🔒 " if u["privado"] else "") + ("↺ " if u["ya_encargada"] else "")
        lin.append("| %d | %s%s | %s × %s%s | `%s:%s` | %s | %s | %.2f | %s | %s | %s |" % (
            i, marcas, _celda(u["titulo"]), u["area"], u["lente"],
            (" (+%d)" % (u["apariciones"] - 1)) if u["apariciones"] > 1 else "",
            _celda(u.get("archivo"), 60), u.get("linea", 0), int(_num(u.get("impacto"), 0)),
            int(_num(u.get("esfuerzo"), 0)), _num(u.get("confianza"), 0), _texto_verif(u), _texto_jev(u),
            _celda((u.get("propuesta") or {}).get("titulo"), 60) if u.get("accionable", True) else "— (no accionable)"))
    if not rk:
        lin.append("| — | Nada que recomendar todavía | | | | | | | | |")
    lin += ["", "⚡ capacidad · 🔒 privado (solo en esta Mac) · ↺ ya propuesta en otra sesión · (+n) repetida en otras áreas/lentes", "",
            "## Por área", ""]
    for area in areas:
        lin += ["### %s" % area, ""]
        for i, u in enumerate(c["por_area"][area][:5], 1):
            lin.append("%d. **%s** — `%s:%s` · %s · impacto %s · esfuerzo %s · confianza %.2f · %s. %s" % (
                i, u["titulo"], u.get("archivo"), u.get("linea", 0), u["lente"], int(_num(u.get("impacto"), 0)),
                int(_num(u.get("esfuerzo"), 0)), _num(u.get("confianza"), 0), _texto_verif(u),
                _celda(u.get("detalle"), 240)))
        lin.append("")
    lin += ["## Riesgos", ""]
    lin += ["%d. %s**%s** — `%s:%s` · %s × %s · %s" % (
        i, "🔒 " if u["privado"] else "", u["titulo"], u.get("archivo"), u.get("linea", 0), u["area"], u["lente"],
        _celda(u.get("detalle"), 240)) for i, u in enumerate(c["riesgos"], 1)] or ["_Ninguno._"]
    lin += ["", "## Cómo seguir", "",
            "- Estado y verificación: `python3 scripts/puente/suenos.py estado` · `python3 scripts/puente/suenos.py por-verificar`.",
            "- Veredicto de un informe: `python3 scripts/puente/suenos.py veredicto <tarea> --estado verificado|ajustado|rechazado --nota \"…\" --por claude-<modelo>`.",
            "- La cola propuesta se abre en el Mando (Procesos → Sueños profundos → «Abrir en Diseñador»); se lanza a mano y cada tarea espera tu visto bueno antes de integrarse.",
            ""]
    return "\n".join(lin)


def cola_propuesta(c, sesion, tope=TOPE_PROPUESTA, ocupados=()):
    """Tareas para el enjambre: las primeras `tope` del ranking que no estén ya encargadas,
    ≤ 3 archivos, con visto bueno humano. PURA.

    (2026-10-03) `ocupados`: ids que ya existen (colas y progreso). La segunda consolidación
    de la misma sesión volvía a numerar desde SP09291 y chocaba con la ola1 YA integrada: el
    vigilante las habría saltado («ids que otra ola ya integró») y `id_en_asuntos` las habría
    dado por hechas al ver «SP09292» en un commit. Ahora la numeración sigue donde quedó."""
    mmdd = sesion.replace("-", "")[4:8]
    ocupados = set(ocupados or ())
    fuera = []
    siguiente = [0]

    def nuevo_id():
        while True:
            siguiente[0] += 1
            tid = "SP%s%d" % (mmdd, siguiente[0])
            if tid not in ocupados:
                ocupados.add(tid)
                return tid
    for u in c["ranking"]:
        if len(fuera) >= tope:
            break
        if u["ya_encargada"] or not u.get("accionable", True):
            continue
        prop = u.get("propuesta") or {}
        archivos = [a for a in (prop.get("archivos") or [u.get("archivo")]) if a][:3]
        if not archivos:
            continue
        verif = _texto_verif(u)
        prompt = (
            ("🔒 PRIVADO · solo en la Mac: no lo repartas a la nube ni lo cuentes fuera.\n\n" if u["privado"] else "")
            + "ORIGEN: sueño profundo %s (%s × %s) del %s, %s. Informe: "
            "`starseed_memory_root/dream/profundo/%s/%s--%s.md`.\n\n"
            "HALLAZGO: %s — %s\nCITA: %s:%s · impacto %s · esfuerzo %s · confianza %.2f\n"
            "PROPUESTA: %s\n"
            "CONSEJO DE JEV: %s\n\n"
            "ANTES DE ESCRIBIR NADA: abre la cita y comprueba que sigue siendo cierto. Si ya está "
            "resuelto o no aplica, no inventes trabajo: responde `NO APLICA: <motivo>` y para.\n\n"
            "Si aplica: toca SOLO %s, máximo 120 líneas por archivo; si no cabe, haz el primer paso "
            "y dilo en el commit. Reglas de la casa en `memory/workflow-actual.md`: si una prueba "
            "falla se arregla el código, no la prueba; integrado no es aplicado."
        ) % (
            u["tarea"], u["area"], u["lente"], sesion, verif, sesion, u["area"], u["lente"],
            u["titulo"], u.get("detalle") or "", u.get("archivo"), u.get("linea", 0),
            int(_num(u.get("impacto"), 0)), int(_num(u.get("esfuerzo"), 0)), _num(u.get("confianza"), 0),
            prop.get("cambio") or prop.get("titulo") or u["titulo"], _texto_jev(u), ", ".join(archivos),
        )
        t = {
            "id": nuevo_id(),
            "ola": "Sueños profundos %s · propuesta" % sesion,
            "titulo": _celda(prop.get("titulo") or u["titulo"], 200),
            "archivos": archivos,
            "depende": [],
            "prompt": prompt[:11500],
            "aprobacion": True,
            "origen": {"sueno": u["tarea"], "area": u["area"], "lente": u["lente"], "clave": u["clave"]},
        }
        if u["capacidad"]:
            t["importancia"] = "capacidad"
        if u["privado"]:
            t["privado"] = True
        fuera.append(t)
    return fuera


def resumen_corto(c, sesion, n_cola=0):
    """Una frase para el canal y Telegram. Nunca el texto de un hallazgo privado."""
    k = c["cuentas"]
    publicos = [u for u in c["ranking"] if not u["privado"]][:3]
    top = "; ".join("%s (%s)" % (_celda(u["titulo"], 60), u["area"]) for u in publicos)
    return ("Sueños profundos %s: %d informes, %d hallazgos únicos (%d verificados/ajustados por Claude), "
            "%d riesgos, %d propuestas en cola (sin lanzar).%s"
            % (sesion, k["informes"], k["unicos"], k["verificados"] + k["ajustados"], len(c["riesgos"]), n_cola,
               (" Primero: " + top) if top else ""))


# ─────────────────────────────── escribir y anunciar ───────────────────────────────

def _escribir(ruta, texto):
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    tmp = ruta + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(texto)
    os.replace(tmp, ruta)


def _hermes():
    for c in (shutil.which("hermes"), os.path.expanduser("~/.local/bin/hermes"),
              os.path.expanduser("~/.hermes/bin/hermes"), "/opt/homebrew/bin/hermes"):
        if c and os.path.exists(c):
            return c
    return None


def _leer_env(clave, rutas=(".env.local", "~/.starseed/env", "~/.hermes/.env")):
    """Valor de una variable del entorno o de los archivos de entorno. Nunca se imprime."""
    if os.environ.get(clave):
        return os.environ[clave]
    raiz = os.environ.get("STARSEED_ROOT") or os.path.dirname(os.path.dirname(DIRECTORIO))
    for r in rutas:
        ruta = os.path.expanduser(r if r.startswith("~") else os.path.join(raiz, r))
        try:
            for linea in open(ruta, encoding="utf-8"):
                m = re.match(r"^\s*(?:export\s+)?%s=(.+?)\s*$" % re.escape(clave), linea)
                if m:
                    return m.group(1).strip().strip('"').strip("'")
        except OSError:
            continue
    return ""


def publicar_en_bus(texto, datos, tipo="informe"):
    """UN evento al bus (relevo_eventos): es lo que lee la bandeja de Reportes del Mando
    (quien «director-…» → «sugerencia»). Poco y grueso: uno por consolidación."""
    url = (_leer_env("NEXT_PUBLIC_SUPABASE_URL") or "").rstrip("/")
    clave = _leer_env("NEXT_PUBLIC_SUPABASE_ANON_KEY")
    if not url or not clave:
        return False
    import urllib.request  # noqa: E402
    cuerpo = json.dumps({"quien": "director-suenos", "tipo": tipo, "tarea": "", "texto": texto[:1500],
                         "datos": dict(datos or {}, categoria="ola", donde="mac", medio="suenos")},
                        ensure_ascii=False).encode()
    req = urllib.request.Request(url + "/rest/v1/relevo_eventos", data=cuerpo, method="POST", headers={
        "apikey": clave, "Authorization": "Bearer " + clave, "Content-Type": "application/json",
        "Prefer": "return=minimal"})
    try:
        urllib.request.urlopen(req, timeout=10).read()
        return True
    except Exception:
        return False


def anunciar(texto, telegram=False, decir=None, bus=None, datos_bus=None):
    """Canal común siempre; la bandeja de Reportes del Mando si se le pasa `bus`; Hermes →
    Telegram solo si se pide (el resumen final de una sesión completa)."""
    hecho = {"canal": False, "telegram": False, "reportes": False}
    try:
        if decir is None:
            import puente  # noqa: E402
            decir = puente.decir
        decir(texto, "suenos", "hecho")
        hecho["canal"] = True
    except Exception:
        pass
    if bus is not None:
        try:
            hecho["reportes"] = bool(bus(texto, datos_bus or {}))
        except Exception:
            pass
    if telegram:
        h = _hermes()
        if h:
            try:
                # La forma comprobada el 2026-09-20 (CLAUDE.md): destino, asunto y cuerpo.
                r = subprocess.run([h, "send", "-t", DESTINO_TELEGRAM, "-s", "Sueños profundos · StarSeed OS",
                                    texto[:1200]], timeout=40, capture_output=True)
                hecho["telegram"] = r.returncode == 0
            except Exception:
                pass
    return hecho


_POR_DEFECTO = object()


def ids_existentes(dir_olas):
    """Ids de tarea que ya existen en las colas de `dir_olas` y en su progreso.json."""
    ids = set()
    try:
        nombres = os.listdir(dir_olas)
    except OSError:
        return ids
    for n in nombres:
        if not n.endswith(".json"):
            continue
        try:
            with open(os.path.join(dir_olas, n), encoding="utf-8") as f:
                d = json.load(f)
        except (OSError, ValueError):
            continue
        if n == "progreso.json" and isinstance(d, dict):
            ids.update(str(k) for k in d)
            continue
        tareas = d.get("tareas", []) if isinstance(d, dict) else d
        if isinstance(tareas, list):
            ids.update(str(t["id"]) for t in tareas if isinstance(t, dict) and t.get("id"))
    return ids


def ejecutar(dir_sesion, dir_olas, sesion, tope=TOPE_PROPUESTA, seco=False, memoria=None,
             planificadas=None, telegram=False, decir=None, consejero=_POR_DEFECTO, bus=_POR_DEFECTO):
    """Consolida una sesión y escribe INFORME.md + la cola propuesta. Devuelve un resumen.
    `consejero` y `bus` se pueden inyectar (pruebas); por defecto, Jev y el bus de verdad.
    `memoria` se resuelve al llamar (MEMORIA_ENCARGADAS), no al importar: así se puede cambiar."""
    memoria = memoria or MEMORIA_ENCARGADAS
    informes = leer_informes(dir_sesion)
    veredictos = leer_veredictos(dir_sesion)
    if consejero is _POR_DEFECTO:
        consejero = consejero_jev() if not seco else None
    if bus is _POR_DEFECTO:
        bus = publicar_en_bus
    c = consolidar(informes, veredictos, ya_encargadas(memoria), consejero)
    cola = cola_propuesta(c, sesion, tope, ids_existentes(dir_olas))
    nombre_cola = "cola-suenos-propuesta-%s.json" % sesion
    texto = render_informe(c, sesion, planificadas, nombre_cola if cola else None, len(cola), tope)
    resumen = resumen_corto(c, sesion, len(cola))
    # Rutas RELATIVAS al repositorio: esto lo enseña el Mando, que nunca devuelve rutas del disco.
    fuera = {"sesion": sesion, "cuentas": c["cuentas"], "propuestas": len(cola), "resumen": resumen,
             "informe": "starseed_memory_root/dream/profundo/%s/INFORME.md" % sesion,
             "cola": ("starseed_memory_root/olas/%s" % nombre_cola) if cola else "",
             "generado": time.strftime("%Y-%m-%d %H:%M:%S"),
             "top": [dict({k: u.get(k) for k in ("titulo", "area", "lente", "archivo", "linea", "impacto", "esfuerzo",
                                                  "confianza", "verificacion", "por", "capacidad", "privado", "puntuacion",
                                                  "tarea", "apariciones", "ya_encargada", "seccion", "accionable",
                                                  "prioridad")},
                          propuesta=(u.get("propuesta") or {}).get("titulo") or "", jev=_texto_jev(u))
                     for u in c["ranking"][:max(tope, 30)]]}
    if seco:
        fuera["seco"] = True
        return fuera
    _escribir(os.path.join(dir_sesion, "INFORME.md"), texto)
    # Lo que lee el panel del Mando (Procesos → Sueños profundos): el ranking ya hecho.
    _escribir(os.path.join(dir_sesion, "consolidado.json"), json.dumps(fuera, ensure_ascii=False, indent=1))
    if cola:
        _escribir(os.path.join(dir_olas, nombre_cola), json.dumps(cola, ensure_ascii=False, indent=2) + "\n")
        anotar_encargadas([t["origen"]["clave"] for t in cola], memoria)
    fuera["anuncio"] = anunciar(resumen, telegram=telegram, decir=decir, bus=bus,
                                datos_bus={"sesion": sesion, "propuestas": len(cola), "cola": nombre_cola if cola else ""})
    return fuera
