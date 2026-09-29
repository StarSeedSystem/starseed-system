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


def consolidar(informes, veredictos, encargadas=()):
    """El ranking de la sesión. PURA. Devuelve {ranking, por_area, riesgos, cuentas}."""
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
    por_area = {}
    for u in unicos:
        por_area.setdefault(u["area"], []).append(u)
    riesgos = [u for u in unicos if u.get("seccion") == "riesgo"]
    cuentas["unicos"] = len(unicos)
    return {"ranking": unicos, "por_area": por_area, "riesgos": riesgos, "cuentas": cuentas}


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
    riesgos_priv = sum(1 for u in c["riesgos"] if u["privado"])
    lin.append("- **Riesgos:** %d (%d privados, solo en esta Mac)." % (len(c["riesgos"]), riesgos_priv))
    if cola_nombre:
        lin.append("- **Cola propuesta:** `starseed_memory_root/olas/%s` · %d tareas con visto bueno humano (`aprobacion: true`). "
                   "**No se ha lanzado**: ábrela en el Diseñador de olas." % (cola_nombre, n_cola))
    lin += ["", "## Top %d recomendaciones" % tope, "",
            "| # | Recomendación | Área × lente | Cita | I | E | Conf. | Verificación | Tarea |",
            "|---|---|---|---|---|---|---|---|---|"]
    for i, u in enumerate(rk[:tope], 1):
        marcas = ("⚡ " if u["capacidad"] else "") + ("🔒 " if u["privado"] else "") + ("↺ " if u["ya_encargada"] else "")
        lin.append("| %d | %s%s | %s × %s%s | `%s:%s` | %s | %s | %.2f | %s | %s |" % (
            i, marcas, _celda(u["titulo"]), u["area"], u["lente"],
            (" (+%d)" % (u["apariciones"] - 1)) if u["apariciones"] > 1 else "",
            _celda(u.get("archivo"), 60), u.get("linea", 0), int(_num(u.get("impacto"), 0)),
            int(_num(u.get("esfuerzo"), 0)), _num(u.get("confianza"), 0), _texto_verif(u),
            _celda((u.get("propuesta") or {}).get("titulo"), 60)))
    if not rk:
        lin.append("| — | Nada que recomendar todavía | | | | | | | |")
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


def cola_propuesta(c, sesion, tope=TOPE_PROPUESTA):
    """Tareas para el enjambre: las primeras `tope` del ranking que no estén ya encargadas,
    ≤ 3 archivos, con visto bueno humano. PURA."""
    mmdd = sesion.replace("-", "")[4:8]
    fuera = []
    for u in c["ranking"]:
        if len(fuera) >= tope:
            break
        if u["ya_encargada"]:
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
            "PROPUESTA: %s\n\n"
            "ANTES DE ESCRIBIR NADA: abre la cita y comprueba que sigue siendo cierto. Si ya está "
            "resuelto o no aplica, no inventes trabajo: responde `NO APLICA: <motivo>` y para.\n\n"
            "Si aplica: toca SOLO %s, máximo 120 líneas por archivo; si no cabe, haz el primer paso "
            "y dilo en el commit. Reglas de la casa en `memory/workflow-actual.md`: si una prueba "
            "falla se arregla el código, no la prueba; integrado no es aplicado."
        ) % (
            u["tarea"], u["area"], u["lente"], sesion, verif, sesion, u["area"], u["lente"],
            u["titulo"], u.get("detalle") or "", u.get("archivo"), u.get("linea", 0),
            int(_num(u.get("impacto"), 0)), int(_num(u.get("esfuerzo"), 0)), _num(u.get("confianza"), 0),
            prop.get("cambio") or prop.get("titulo") or u["titulo"], ", ".join(archivos),
        )
        t = {
            "id": "SP%s%d" % (mmdd, len(fuera) + 1),
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


def anunciar(texto, telegram=False, decir=None):
    """Canal común siempre; Hermes → Telegram solo si se pide (el resumen final)."""
    hecho = {"canal": False, "telegram": False}
    try:
        if decir is None:
            import puente  # noqa: E402
            decir = puente.decir
        decir(texto, "suenos", "hecho")
        hecho["canal"] = True
    except Exception:
        pass
    if telegram:
        h = _hermes()
        if h:
            try:
                r = subprocess.run([h, "send", "-q", texto[:1200]], timeout=40, capture_output=True)
                hecho["telegram"] = r.returncode == 0
            except Exception:
                pass
    return hecho


def ejecutar(dir_sesion, dir_olas, sesion, tope=TOPE_PROPUESTA, seco=False, memoria=MEMORIA_ENCARGADAS,
             planificadas=None, telegram=False, decir=None):
    """Consolida una sesión y escribe INFORME.md + la cola propuesta. Devuelve un resumen."""
    informes = leer_informes(dir_sesion)
    veredictos = leer_veredictos(dir_sesion)
    c = consolidar(informes, veredictos, ya_encargadas(memoria))
    cola = cola_propuesta(c, sesion, tope)
    nombre_cola = "cola-suenos-propuesta-%s.json" % sesion
    texto = render_informe(c, sesion, planificadas, nombre_cola if cola else None, len(cola), tope)
    resumen = resumen_corto(c, sesion, len(cola))
    fuera = {"sesion": sesion, "cuentas": c["cuentas"], "propuestas": len(cola), "resumen": resumen,
             "informe": os.path.join(dir_sesion, "INFORME.md"), "cola": os.path.join(dir_olas, nombre_cola) if cola else "",
             "top": [{k: u.get(k) for k in ("titulo", "area", "lente", "archivo", "linea", "impacto", "esfuerzo",
                                              "confianza", "verificacion", "capacidad", "privado", "puntuacion", "tarea")}
                     for u in c["ranking"][:tope]]}
    if seco:
        fuera["seco"] = True
        return fuera
    _escribir(os.path.join(dir_sesion, "INFORME.md"), texto)
    if cola:
        _escribir(os.path.join(dir_olas, nombre_cola), json.dumps(cola, ensure_ascii=False, indent=2) + "\n")
        anotar_encargadas([t["origen"]["clave"] for t in cola], memoria)
    fuera["anuncio"] = anunciar(resumen, telegram=telegram, decir=decir)
    return fuera
