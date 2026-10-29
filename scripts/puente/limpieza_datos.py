#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Limpieza nativa de listas sin JVM (INV1025H · architecture/repos-libreria-1025.md §3.4).

Lee el formato exportado por OpenRefine 3.10.1 definido en INV1025F
(`src/lib/datos/receta-limpieza.ts`): `{"datos": "publicos", "operaciones": [...]}`.
Ejecuta naticamente solo lo simple (sin GREL genérico, sin Jython/Clojure ni red):
lo que no soporta lo informa como «no soportada aquí: usa OpenRefine».

- `aplicar(filas, receta)` sobre listas de dict (CSV), sin tocar la entrada.
- Devuelve `{filas, cambios, duplicados, no_soportadas}`; cambio = {fila, columna, antes, despues, op}.
- `huella(texto)`: minúsculas, sin acentos ni signos, palabras ordenadas (la huella de OpenRefine).
- CLI: `limpieza_datos.py --receta r.json entrada.csv > salida.csv`.

Puro y determinista: stdlib, sin red, sin disco, sin reloj.
"""

import csv
import re
import sys
import unicodedata
import urllib.parse

# ═══ Expresiones «grel:» simples implementadas nativamente ═══

EXP_RECORTAR = "grel:value.trim().collapse(' ')"
EXP_MAYUS = "grel:value.toUppercase()"
EXP_MINUS = "grel:value.toLowercase()"
EXP_TITULO = "grel:value.toTitleCase()"
EXP_URL = "grel:value.limpiarUrl()"
EXP_CORREO = "grel:value.validarCorreo()"


def recortar(valor):
    """Recorta y colapsa espacios internos."""
    return " ".join(valor.split())


def titulo(valor):
    """Cada palabra con inicial mayúscula; el resto en minúscula."""
    return " ".join(p[:1].upper() + p[1:].lower() for p in recortar(valor).split(" "))


def huella(texto):
    """Minúsculas, sin acentos ni signos, palabras ordenadas: la huella de OpenRefine."""
    sin_acentos = "".join(
        c for c in unicodedata.normalize("NFD", texto) if not unicodedata.combining(c)
    )
    palabras = re.findall(r"[0-9a-zA-ZáéíóúÁÉÍÓÚñÑüÜ]+", sin_acentos.lower())
    return " ".join(sorted(p.lower() for p in palabras))


# ═══ Normalización de URL y correo (extensiones nativas; nunca inventan datos) ═══

UTM = re.compile(r"^utm_|^fbclid$", re.IGNORECASE)


def limpiar_url(valor):
    """URL en https, host en minúsculas, sin utm_*/fbclid, sin ancla ni barra final."""
    texto = recortar(valor)
    if not texto:
        return valor
    sin_ancla = texto.split("#", 1)[0]
    con_esquema = sin_ancla if "://" in sin_ancla else "https://" + sin_ancla
    partes = urllib.parse.urlsplit(con_esquema)
    if not partes.netloc:
        return valor
    pares = [p for p in urllib.parse.parse_qsl(partes.query, keep_blank_values=True) if not UTM.match(p[0])]
    ruta = partes.path[:-1] if partes.path.endswith("/") and partes.path != "/" else partes.path
    return urllib.parse.urlunsplit(
        ("https", partes.netloc.lower(), ruta, urllib.parse.urlencode(pares), "")
    )


CORREO = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]{2,}$")


def validar_correo(valor):
    """Normaliza el correo si es válido; si no, lo deja tal cual (listo para marcarlo)."""
    texto = recortar(valor)
    valido = CORREO.match(texto) if texto else None
    return (texto.lower() if valido else valor, bool(valido))



# ═══ Aplicación de la receta sobre filas (listas de dict, nunca muta la entrada) ═══


def _canon(op):
    """Acepta «core/text-transform» (formato exportado) y su forma corta."""
    texto = op.strip()
    return texto[5:] if texto.startswith("core/") else texto


def _columnas(filas):
    """Columnas por orden de aparición en todas las filas."""
    vistas = list(dict.fromkeys(c for f in filas for c in f))
    return vistas


def _celda(fila, columna):
    valor = fila.get(columna)
    return valor if isinstance(valor, str) else ("" if valor is None else str(valor))


def _transformar(op, fila, columna, cambios, indice):
    """Una expresión simple sobre una celda; registra el cambio si hay uno."""
    expresion = op.get("expression")
    antes = _celda(fila, columna)
    despues = antes
    marca = ""
    if expresion == EXP_RECORTAR:
        despues = recortar(antes)
    elif expresion == EXP_MAYUS:
        despues = antes.upper()
    elif expresion == EXP_MINUS:
        despues = antes.lower()
    elif expresion == EXP_TITULO:
        despues = titulo(antes)
    elif expresion == EXP_URL:
        despues = limpiar_url(antes)
    elif expresion == EXP_CORREO:
        despues, valido = validar_correo(antes)
        if not valido and recortar(antes):
            marca = "correo-no-valido"
    else:
        return False
    nombre = _canon(str(op.get("op", "")))
    if despues != antes:
        fila[columna] = despues
        cambios.append({"fila": indice, "columna": columna, "antes": antes, "despues": despues, "op": nombre})
    if marca:
        cambios.append({"fila": indice, "columna": columna, "antes": antes, "despues": antes, "op": marca})
    return True


def _primera(op, claves):
    """Primera clave presente en la operación entre las dadas."""
    for c in claves:
        if c in op:
            return op[c]
    return None


def _separar_columna(op, filas):
    """column-split por separador: la primera parte queda, el resto en «col 1», «col 2»…"""
    columna = _primera(op, ["columnName", "column"])
    if not isinstance(columna, str) or op.get("mode", "separator") != "separator":
        return False
    separador = _primera(op, ["separator"])
    if not isinstance(separador, str) or separador == "":
        return False
    trozos = [(f, [_celda(f, columna).split(separador) if _celda(f, columna) else [""]]) for f in filas]
    extra = max(len(t[1]) for _, t in trozos)
    for fila, t in trozos:
        partes = partes_relleno(t, extra)
        fila[columna] = partes[0]
        for i, parte in enumerate(partes[1:]):
            nombre = "%s %d" % (columna, i + 1)
            fila[nombre] = parte
    return True


def partes_relleno(trozos, extra):
    """Trozos de una fila con los que falten rellenados con cadena vacía."""
    return list(trozos) + [""] * (extra - len(trozos))


def _unir_columnas(op, filas, cambios):
    """column-merge: une la segunda columna en la primera y la retira."""
    primera = _primera(op, ["columnName", "column"])
    segunda = _primera(op, ["secondColumnName", "segunda"])
    if not isinstance(primera, str) or not isinstance(segunda, str) or primera == segunda:
        return False
    separador = op.get("separator") if isinstance(op.get("separator"), str) else " "
    for fila in filas:
        valor = separador.join(x for x in (recortar(_celda(fila, primera)), recortar(_celda(fila, segunda))) if x)
        if valor != _celda(fila, primera):
            fila[primera] = valor
    for fila in filas:
        fila.pop(segunda, None)
    return True


def _renombrar(op, filas):
    """column-rename: «oldColumnName» → «newColumnName», conservando el orden."""
    vieja = op.get("oldColumnName") or op.get("column")
    nueva = op.get("newColumnName")
    if not isinstance(vieja, str) or not isinstance(nueva, str):
        return False
    for fila in filas:
        if vieja in fila:
            fila[nueva] = fila.pop(vieja)
    return True


def _quitar_filas(op, vivos):
    """row-removal nativo, solo rancho propio: quita filas vacías.

    La versión de OpenRefine quita filas por facetas de `engineConfig`: eso no
    se reproduce aquí. Soportamos solo el campo propio «quitar» con la lista de
    columnas; la fila se va si todas esas columnas quedan vacías tras recortar.
    """
    quitar = op.get("quitar")
    if not isinstance(quitar, list) or not quitar:
        return None
    columnas = [c for c in quitar if isinstance(c, str)]
    quedan = [(i, f) for (i, f) in vivos if not all(not _celda(f, c) for c in columnas)]
    return quedan


def _mass_edit(op, fila, cambios, indice):
    """mass-edit: mapa de sustituciones exactas sobre una columna."""
    columna = _primera(op, ["columnName", "column"])
    edits = op.get("edits")
    if not isinstance(columna, str) or not isinstance(edits, list):
        return False
    antes = _celda(fila, columna)
    despues = antes
    for edit in edits:
        if not isinstance(edit, dict):
            return False
        desde = edit.get("from")
        if edit.get("fromBlank") or edit.get("fromError"):
            return False
        if isinstance(desde, list) and str(antes) in [str(x) for x in desde]:
            despues = "" if edit.get("to") is None else str(edit.get("to"))
        elif isinstance(desde, str) and antes == desde:
            despues = str(edit.get("to", ""))
    if despues != antes:
        fila[columna] = despues
        cambios.append({
            "fila": indice, "columna": columna,
            "antes": antes, "despues": despues, "op": "mass-edit",
        })
    return True


# ═══ aplicar(filas, receta): la puerta principal; devuelve un dict con todo ═══

NOMBRE = "limpieza_datos"


def extraccion_operaciones(receta):
    """Operaciones de la receta: acepta «operaciones» (INV1025F) y la exportada «operations»."""
    if not isinstance(receta, dict):
        return None, []
    datos = receta.get("datos")
    ops = receta.get("operaciones", receta.get("operations", []) or [])
    return (datos if datos in (None, "publicos") else None), ops


def deduplicar(pares, columna):
    """Deduplica por huella de «columna» (si se da) o de toda la fila.

    Devuelve (quedan, grupos): «quedan» conserva la primera ocurrencia de cada
    grupo y «grupos» son las listas de índices originales con más de una fila.
    """
    grupo, quedan = {}, []
    for i, fila in pares:
        texto = _celda(fila, columna) if columna else fila_unida(fila)
        signo = huella(texto)
        if signo in grupo:
            grupo[signo].append(i)
        else:
            grupo[signo] = [i]
            quedan.append((i, fila))
    duplicados = [lista for lista in grupo.values() if len(lista) > 1]
    return quedan, duplicados


def fila_unida(fila):
    """Toda la fila unida: la base de la huella cuando no se da columna."""
    return "|".join(fila.get(c, "") for c in _columnas([fila]))


def aplicar(filas, receta):
    """Aplica la receta a la lista de filas (dict) sin tocar la entrada.

    Devuelve `{filas, cambios, duplicados, no_soportadas}`: filas limpias,
    cambios por celda (`{fila, columna, antes, despues, op}`, con el índice de
    la fila en la ENTRADA original), grupos de duplicados y las `op` que esta
    versión nativa no ejecuta («no soportada aquí: usa OpenRefine»).
    """
    datos, ops = extraccion_operaciones(receta)
    no_soportadas = [] if datos is not None and isinstance(ops, list) else ["la receta debe declarar datos: \"publicos\" y «operaciones» válidas"]
    if datos is not None:
        vivos = list(enumerate(dict((c, f[c]) for c in f) for f in filas))
        for op in ops:
            vivos = ejecutar_op(op, vivos, no_soportadas)
        dedup = receta.get("deduplicar") if isinstance(receta, dict) else None
        if isinstance(dedup, dict):
            clave = dedup.get("columna")
            if clave is not None and not isinstance(clave, str):
                no_soportadas.append("deduplicar: «columna» debe ser texto")
            elif dedup.get("modo") not in (None, "huella"):
                no_soportadas.append("deduplicar: modo desconocido, no soportado aquí: usa OpenRefine")
            else:
                vivos, duplicados = deduplicar(vivos, clave)
    return {
        "filas": [f for _, f in vivos] if datos is not None else [],
        "cambios": CAMBIOS[:] if datos is not None else [],
        "duplicados": DUPLICADOS[:] if datos is not None else [],
        "no_soportadas": no_soportadas,
    }


CAMBIOS: list = []


def ejecutar_op(op, vivos, no_soportadas):
    """Ejecuta una `op` soportada sobre los pares (índice, fila) vivos."""
    if not isinstance(op, dict) or not isinstance(op.get("op"), str):
        no_soportadas.append("op inválida: cada operación necesita su campo «op»")
        return vivos
    nombre = _canon(op["op"])
    if nombre == "text-transform":
        return _text_transform(op, vivos, no_soportadas)
    if nombre == "mass-edit":
       return _mass_edit_todas(op, vivos, no_soportadas)
    if nombre == "column-split" and _separar_columna(op, [f for _, f in vivos]):
        return vivos
    if nombre == "column-merge" and _unir_columnas(op, [f for _, f in vivos]):
        return vivos
    if nombre == "column-rename" and _renombrar(op, [f for _, f in vivos]):
        return vivos
    if nombre == "row-removal":
        quedan = _quitar_filas(op, vivos)
        if quedan is None:
            no_soportadas.append("row-removal: solo filas vacías con «quitar» (propio); no soportada aquí: usa OpenRefine")
            return vivos
        return quedan
    no_soportadas.append("%s: no soportada aquí: usa OpenRefine" % op["op"])
    return vivos
