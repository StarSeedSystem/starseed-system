#!/usr/bin/env python3
"""Resumen diario de actividad por temas con Laya y LEANN (SDP1111K · §3.4 y §4).
Reúne las fichas del día de ~/.starseed/actividad/fichas/, las clasifica con Laya
(relevante y tema de TEMAS), pide a LEANN lo ya conocido del tema y escribe
~/.starseed/actividad/resumen-AAAA-MM-DD.json: títulos, enlaces y una línea por
tema, tope 12000 caracteres, privado: true y sin cuerpos de correo. No sale a
Supabase, ni al parte diario, ni a Drive. Uso: actividad_resumen.py [AAAA-MM-DD]
"""
import json, os, sys
from datetime import datetime, timezone
from typing import cast

DIR_FICHAS = os.path.expanduser("~/.starseed/actividad/fichas")
DIR_RESUMEN = os.path.expanduser("~/.starseed/actividad")
TOPE = 12000
TEMAS = ("mesh", "ia-abierta", "democracia-directa", "economia-ecologica",
         "comunidades", "solarpunk", "diseno", "programacion")


def fichas_del_dia(dir_fichas, fecha):
    """Las fichas de los archivos AAAA-MM-DD-* de ese día; vacía si no hay nada legible."""
    fichas = []
    for nombre in sorted(os.listdir(dir_fichas)) if os.path.isdir(dir_fichas) else []:
        if not nombre.startswith(fecha + "-") or not nombre.endswith(".json"):
            continue
        try:
            with open(os.path.join(dir_fichas, nombre), encoding="utf-8") as fichero:
                datos = json.load(fichero)
        except (OSError, ValueError):
            continue  # un archivo roto no tumba el resumen
        fichas += [f for f in datos if isinstance(f, dict)
                   and (f.get("titulo") or f.get("enlace"))] if isinstance(datos, list) else []
    return fichas


def agrupar(fichas, clasificar):
    """Clasifica con Laya y agrupa por tema las relevantes: {tema: [{titulo, enlace}]}."""
    temas = {}
    for ficha in fichas:
        veredicto = clasificar(ficha) or {}
        tema = veredicto.get("tema")
        if not veredicto.get("relevante") or tema not in TEMAS:
            continue  # irrelevante o tema desconocido: fuera
        entrada = {"titulo": ficha.get("titulo") or "", "enlace": ficha.get("enlace") or ""}
        temas.setdefault(tema, []).append(entrada)
    return temas


def recuerdo_defecto(tema):
    """LEANN: lo ya conocido del tema en el repo y la memoria (costura inyectable)."""
    import leann_cliente
    aciertos = leann_cliente.buscar(leann_cliente.INDICE_REPO, tema, k=4) or []
    return "; ".join(str(a.get("texto") or "")[:120] for a in aciertos[:3])


def linea_de(entradas):
    """La línea del tema: cuántas fichas y los títulos, sin cuerpos ni enlaces."""
    titulos = [e["titulo"] for e in entradas if e["titulo"]]
    texto = "%d ficha%s: %s" % (len(entradas), "" if len(entradas) == 1 else "s",
                                " y ".join(titulos[:3]))
    texto += " y %d más" % (len(titulos) - 3) if len(titulos) > 3 else ""
    return texto[:400]


def construir(fecha, fichas, clasificar, recordar):
    """El resumen del día: {fecha, privado, temas: {tema: {linea, fichas, ya_sabido}}}."""
    temas = {tema: {"linea": linea_de(entradas), "fichas": entradas,
                    "ya_sabido": (recordar(tema) or "")[:600]}
             for tema, entradas in agrupar(fichas, clasificar).items()}
    return {"fecha": fecha, "privado": True, "temas": temas}


def recortar(resumen):
    """Encaja el resumen en TOPE: primero pierde fichas (de atrás), luego temas vacíos."""
    while len(json.dumps(resumen, ensure_ascii=False)) > TOPE and resumen["temas"]:
        tema = max(resumen["temas"], key=lambda t: len(resumen["temas"][t]["fichas"]))
        fichas = resumen["temas"][tema]["fichas"]
        if fichas:
            fichas.pop()
            resumen["temas"][tema]["linea"] = linea_de(fichas)
        else:
            del resumen["temas"][tema]
    return resumen


def escribir(dir_resumen, resumen):
    """Escribe resumen-AAAA-MM-DD.json con el tope de caracteres; devuelve la ruta."""
    copia = json.loads(json.dumps(resumen))  # copia profunda: recortar no muta al llamante
    contenido = json.dumps(recortar(copia), ensure_ascii=False)
    os.makedirs(dir_resumen, exist_ok=True)
    ruta = os.path.join(dir_resumen, "resumen-%s.json" % resumen["fecha"])
    with open(ruta, "w", encoding="utf-8") as fichero:
        fichero.write(contenido)
    return ruta


def clasificador_defecto(ficha):
    """Laya (Sistema 1) clasifica: ¿relevante y de qué tema? Sin Laya, nada entra."""
    import jev
    estado = {"titulo": ficha.get("titulo") or "", "enlace": ficha.get("enlace") or "", "temas": list(TEMAS)}
    respuestas = cast("dict[str, object] | None", jev.decidir_con_laya(estado, ["relevante", "tema"]))
    if not isinstance(respuestas, dict):
        return {"relevante": False, "tema": ""}
    tema = str(respuestas.get("tema") or "")
    relevante = respuestas.get("relevante") in (True, "sí", "si", "true", "1", 1)
    return {"relevante": relevante and tema in TEMAS, "tema": tema if tema in TEMAS else ""}


def main(argv):
    """Por defecto Laya clasifica y LEANN recuerda; fecha de hoy si no se da."""
    fecha = (argv[1] if len(argv) > 1 else datetime.now(timezone.utc).strftime("%Y-%m-%d")).strip()
    fichas = fichas_del_dia(DIR_FICHAS, fecha)
    resumen = construir(fecha, fichas, clasificador_defecto, recuerdo_defecto)
    ruta = escribir(DIR_RESUMEN, resumen)
    print("%s: %d fichas, %d temas -> %s" % (fecha, len(fichas), len(resumen["temas"]), ruta))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
