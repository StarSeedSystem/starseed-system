#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Actividad · resumen diario por temas (SDP1111K · §3.4 y §4 de sintesis-diaria-autonoma).

Reúne las fichas del día de ~/.starseed/actividad/fichas/, las clasifica con Laya
(relevante o no para StarSeed y para qué tema), pide a LEANN lo ya conocido de cada
tema y escribe ~/.starseed/actividad/resumen-AAAA-MM-DD.json: por tema, títulos,
enlaces y una línea, tope 12000 caracteres. Privado: este resumen no sale a
Supabase, ni al parte diario, ni a Drive; nunca incluye cuerpos de correo completos.
Clasificador (`clasificar`) y recuerdo (`recordar`) inyectables: sin Laya ni
servidor LEANN las pruebas corren puras y nada falla.
"""
import datetime, json, os, re, sys, urllib.request

TEMAS = ("mesh", "ia-abierta", "democracia-directa", "economia-ecologica", "comunidades", "solarpunk", "diseno", "programacion")
DIR_ACTIVIDAD = os.path.expanduser("~/.starseed/actividad")
DIR_FICHAS = os.path.join(DIR_ACTIVIDAD, "fichas")
INDICE_LEANN = "repo-starseed"
TOPE, TOPE_LINEA, TOPE_CONOCIDO = 12000, 160, 600
LAYA_URL = "http://127.0.0.1:4470/clasificar"

def fichas_del_dia(fecha, dir_fichas=DIR_FICHAS):
    """Las fichas de los archivos del día (lista bajo «fichas», o lista plana)."""
    if not os.path.isdir(dir_fichas):
        return []
    salida = []
    prefijo = fecha + "-"
    for nombre in sorted(n for n in os.listdir(dir_fichas) if n.startswith(prefijo) and n.endswith(".json")):
        try:
            with open(os.path.join(dir_fichas, nombre), encoding="utf-8") as fichero:
                datos = json.load(fichero)
        except (OSError, ValueError):
            continue  # una ficha de mentira no tumba al resumen
        crudo = datos.get("fichas", []) if isinstance(datos, dict) else datos
        salida.extend(f for f in crudo if isinstance(f, dict) and f.get("privado") is not False)
    return salida

def una_linea(texto):
    """Una sola línea, recortada: nunca el cuerpo completo de un correo."""
    return re.sub(r"\s+", " ", str(texto or "")).strip()[:TOPE_LINEA]

def entrada_de(ficha):
    """Lo que llega al resumen de una ficha: título, enlace y una línea."""
    return {"titulo": una_linea(ficha.get("titulo"))[:200],
            "enlace": str(ficha.get("enlace") or ficha.get("url") or ""),
            "linea": una_linea(ficha.get("texto") or ficha.get("resumen"))}

def laya_clasificar(ficha):
    """Clasificador por defecto: Laya (Sistema 1) en 127.0.0.1:4470. Si no responde,
    None: la ficha se queda fuera en vez de adivinar."""
    try:
        consulta = urllib.request.Request(LAYA_URL, method="POST", headers={"Content-Type": "application/json"},
            data=json.dumps({"consulta": "%s %s" % (ficha.get("titulo", ""), una_linea(ficha.get("texto")))}).encode("utf-8"))
        with urllib.request.urlopen(consulta, timeout=4) as respuesta:
            veredicto = json.loads(respuesta.read().decode("utf-8"))
        return veredicto if isinstance(veredicto, dict) else None
    except Exception:
        return None

def clasificar_ficha(ficha, clasificar=None):
    """El tema de la ficha si el clasificador la da por relevante; si no, None."""
    veredicto = clasificar(ficha) if clasificar else laya_clasificar(ficha)
    if not isinstance(veredicto, dict):
        return None
    tema = veredicto.get("tema")
    return tema if veredicto.get("relevante") is True and tema in TEMAS else None

def recuerdo_leann(tema):
    """Lo que ya se sabe del tema, por LEANN; sin servidor, cadena vacía."""
    try:
        import leann_cliente
        aciertos = leann_cliente.buscar(INDICE_LEANN, "tema %s" % tema, k=3) or []
        texto = " ".join(a.get("texto", "") for a in aciertos if isinstance(a, dict))
        return una_linea(texto)[:TOPE_CONOCIDO]
    except Exception:
        return ""

def encoger(temas, tope=TOPE):
    """El diccionario por temas dentro del tope: va soltando la última ficha del
    tema con más, luego el recuerdo, y nunca deja de ser JSON válido."""
    while len(json.dumps({"temas": temas}, ensure_ascii=False)) > tope:
        victima = max(temas, key=lambda t: len(temas[t]["fichas"]), default=None)
        if victima is None: break
        if temas[victima]["fichas"]:
            temas[victima]["fichas"].pop()
        elif temas[victima]["conocido"]:
            temas[victima]["conocido"] = temas[victima]["conocido"][:len(temas[victima]["conocido"]) // 2]
        else:
            del temas[victima]
    return temas

def armar(fecha, agrupadas, recordar=None):
    """El resumen completo, privado, con lo ya conocido de cada tema inyectado."""
    temas, recordar = {}, recordar or recuerdo_leann
    for tema, fichas in sorted(agrupadas.items()):
        temas[tema] = {"fichas": fichas, "conocido": str(recordar(tema) or "")[:TOPE_CONOCIDO]}
    return {"fecha": fecha, "privado": True, "temas": encoger(temas)}

def guardar(resumen, dir_actividad=DIR_ACTIVIDAD):
    """Escribe resumen-<fecha>.json con 0600, atómico (tmp + os.replace)."""
    os.makedirs(dir_actividad, exist_ok=True)
    destino = os.path.join(dir_actividad, "resumen-%s.json" % resumen["fecha"])
    with open(destino + ".tmp", "w", encoding="utf-8") as fichero:
        json.dump(resumen, fichero, ensure_ascii=False, indent=1)
    os.chmod(destino + ".tmp", 0o600); os.replace(destino + ".tmp", destino)
    return destino

def reunir(fecha=None, dir_fichas=DIR_FICHAS, clasificar=None, recordar=None, dir_actividad: str | None = DIR_ACTIVIDAD):
    """Todo el día: fichas → Laya → LEANN → resumen en disco (si hay destino)."""
    fecha = fecha or datetime.date.today().isoformat()
    agrupadas = {}
    for ficha in fichas_del_dia(fecha, dir_fichas):
        tema = clasificar_ficha(ficha, clasificar)
        if tema: agrupadas.setdefault(tema, []).append(entrada_de(ficha))
    resumen = armar(fecha, agrupadas, recordar)
    if dir_actividad: guardar(resumen, dir_actividad)
    return resumen

if __name__ == "__main__":
    print(json.dumps(reunir(sys.argv[1] if len(sys.argv) > 1 else None), ensure_ascii=False, indent=1))
