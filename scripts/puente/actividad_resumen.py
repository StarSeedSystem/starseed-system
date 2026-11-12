#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Resumen diario de actividad por temas con Laya y LEANN (SDP1111K · §3.4 y §4).

Reúne las fichas del día de ~/.starseed/actividad/fichas/, clasifica con Laya por
tema, pide a LEANN lo ya conocido y escribe ~/.starseed/actividad/resumen-AAAA-MM-
DD.json (títulos, enlaces y una línea, tope 12000). Privado: true y sin cuerpos.
"""
import json, os, sys, unicodedata  # noqa: E401
from datetime import date

DIR_ACTIVIDAD = os.path.expanduser("~/.starseed/actividad")
DIR_FICHAS = os.path.join(DIR_ACTIVIDAD, "fichas")
TOPE, INDICE = 12000, "repo-starseed"
CAMPOS = ("fuente", "cuenta", "tipo", "titulo", "enlace", "fecha")
# Los temas de la tarea, con variantes de palabra para leer la respuesta de Laya.
TEMAS = (("mesh", ("mesh",)), ("ia-abierta", ("ia abierta",)), ("democracia-directa", ("democracia",)),
         ("economia-ecologica", ("economia",)), ("comunidades", ("comunidad",)), ("solarpunk", ("solarpunk",)),
         ("diseno", ("diseno",)), ("programacion", ("programacion",)))

def veredicto_laya(respuestas, ficha):
    """PURA. La respuesta de Laya (o None) → {'relevante': bool, 'tema': id o None}."""
    crudo = " ".join(str(v) for k, v in (respuestas or {}).items() if k != "motor").lower()
    texto = unicodedata.normalize("NFC", "".join(c for c in unicodedata.normalize("NFD", crudo)
                                                 if unicodedata.category(c) != "Mn"))
    hallados = [(texto.find(v), i) for i, variantes in TEMAS for v in variantes if texto.find(v) >= 0]
    return {"relevante": bool(hallados), "tema": min(hallados)[1] if hallados else None}

def _laya(ficha):
    """El clasificador real: pregunta a Laya (Sistema 1) por la ficha; None sin respuesta."""
    try:
        import jev
        return jev.decidir_con_laya(
            {c: ficha.get(c, "") for c in ("titulo", "fuente", "cuenta")},
            ["¿Es relevante para StarSeed? Si lo es, di el tema: %s. Si no, responde no." % ", ".join(t[0].replace("-", " ") for t in TEMAS)])
    except Exception:
        return None

def clasificar(fichas, clasificador=None):
    """Con Laya (o el inyectado): {'temas': {id: [fichas]}, 'descartadas': n}."""
    juez = clasificador or (lambda f: veredicto_laya(_laya(f), f))
    temas, descartadas = {}, 0
    for ficha in fichas:
        veredicto = juez(ficha) or {}
        if veredicto.get("relevante") and veredicto.get("tema"):
            temas.setdefault(veredicto["tema"], []).append(ficha)
        else:
            descartadas += 1
    return {"temas": temas, "descartadas": descartadas}

def cargar_fichas(dir_fichas, fecha):
    """Las fichas del día de los ficheros AAAA-MM-DD-*.json, podadas: nunca cuerpos."""
    salida = []
    for nombre in sorted(os.listdir(dir_fichas)) if os.path.isdir(dir_fichas) else []:
        if not nombre.startswith(fecha + "-") or not nombre.endswith(".json"):
            continue
        try:
            contenido = json.load(open(os.path.join(dir_fichas, nombre), encoding="utf-8"))
        except (OSError, ValueError):
            continue
        salida += [{c: f[c] for c in CAMPOS if f.get(c)}
                   for f in (contenido or {}).get("fichas") or [] if isinstance(f, dict)]
    return salida

def recordar(tema, buscar=None):
    """Lo que LEANN ya sabe del tema (una línea); None si no hay recuerdo."""
    try:
        import leann_cliente
        aciertos = (buscar or leann_cliente.buscar)(INDICE, tema, k=3)
    except Exception:
        return None
    textos = [a.get("texto", "") for a in (aciertos or []) if isinstance(a, dict)]
    return " | ".join(t.strip().replace("\n", " ") for t in textos if t.strip())[:300] or None

def _linea(elementos):
    """La línea del tema: cuántas novedades y los primeros títulos (tope 250)."""
    linea, coma = "%d novedades: " % len(elementos), ""
    for e in elementos:
        trozo = (e.get("titulo", "") or "").replace("\n", " ").strip()
        if not trozo or (len(linea) + len(coma) + len(trozo) > 250 and coma):
            break
        linea += coma + trozo; coma = "; "
    return linea

def _recortado(salida, tope):
    """Suelta elementos del tema con más hasta que el resumen entero cabe en el tope."""
    while len(json.dumps(salida, ensure_ascii=False)) > tope and salida["temas"]:
        tema = max(salida["temas"], key=lambda t: len(salida["temas"][t]["elementos"]))
        salida["temas"][tema]["elementos"].pop()
        if not salida["temas"][tema]["elementos"]:
            del salida["temas"][tema]
        else:
            salida["temas"][tema]["linea"] = _linea(salida["temas"][tema]["elementos"])
    return salida

def resumen(fichas, clasificador=None, recuerdo=None, tope=TOPE):
    """El resumen completo: privado, por tema con elementos, una línea y recuerdo, dentro del tope."""
    reparto = clasificar(fichas, clasificador)
    temas = {}
    for tema, propias in reparto["temas"].items():
        elementos = [{"titulo": f.get("titulo", ""), "enlace": f.get("enlace", "")} for f in propias]
        temas[tema] = {"elementos": elementos, "linea": _linea(elementos), "recuerdo": (recuerdo or recordar)(tema)}
    return _recortado({"privado": True, "temas": temas, "descartadas": reparto["descartadas"]}, tope)

def escribir(datos, fecha, dir_actividad=DIR_ACTIVIDAD):
    """Escribe resumen-AAAA-MM-DD.json y devuelve la ruta; privado, solo local."""
    os.makedirs(dir_actividad, exist_ok=True)
    ruta = os.path.join(dir_actividad, "resumen-%s.json" % fecha)
    with open(ruta, "w", encoding="utf-8") as fichero:
        json.dump(dict(datos, fecha=fecha), fichero, ensure_ascii=False, indent=1)
    return ruta

def main(fecha=None):
    """Uso: python3 scripts/puente/actividad_resumen.py [AAAA-MM-DD]"""
    fecha = fecha or date.today().isoformat()
    fichas = cargar_fichas(DIR_FICHAS, fecha)
    print("resumen %s: %d fichas → %s" % (fecha, len(fichas), escribir(resumen(fichas), fecha)))

if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else None)
