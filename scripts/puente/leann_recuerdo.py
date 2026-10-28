# -*- coding: utf-8 -*-
"""LEANN: lógica del recuerdo semántico, sin HTTP (LNN1028B · contrato §3).

La usa `leann_servidor.py` en el A1 y, por el mismo módulo, Jev y los agentes (§4).
El `from leann import …` se ejecuta DENTRO de `clases_leann()`, nunca al
importar: las pruebas inyectan su LEANN falso en `LEANN_BUILDER`/`LEANN_SEARCHER`.
Sin LEANN, el recuerdo sigue con Memvid y nada falla.
"""

import os
import re
import threading

MODELO_EMBEDDING = "qwen3-embedding:0.6b"
FICHERO_INDICE = "documents.leann"
RE_NOMBRE = re.compile(r"^[a-z0-9-]+$")          # <nombre> del contrato
TOPE_CACHE = 4

LEANN_BUILDER = LEANN_SEARCHER = None  # las pruebas inyectan su LEANN falso aquí
_cerrojo = threading.Lock()
_buscadores = {}
_orden = []
_cerrojos_indice = {}


class PeticionMala(Exception):  # `.estado` lleva un código HTTP y `args[0]`, el motivo
    def __init__(self, estado, mensaje):
        super().__init__(mensaje)
        self.estado = estado


def clases_leann():
    """El `from leann import …` va aquí dentro, nunca arriba (no está en la Mac)."""
    if LEANN_BUILDER is not None:
        return LEANN_BUILDER, LEANN_SEARCHER
    from leann import LeannBuilder, LeannSearcher
    return LeannBuilder, LeannSearcher


def ruta_de_indice(nombre, raiz=None):
    """`<raiz>/<nombre>/documents.leann`; `STARSEED_LEANN_DIR` o la carpeta del A1."""
    raiz = raiz or os.environ.get("STARSEED_LEANN_DIR") or "/var/lib/starseed/leann"
    return os.path.join(raiz, nombre, FICHERO_INDICE)


def indices_disponibles(raiz=None):
    """Nombres (nunca rutas de disco) de las carpetas con forma de <nombre>."""
    raiz = raiz or os.environ.get("STARSEED_LEANN_DIR") or "/var/lib/starseed/leann"
    try:
        nombres = os.listdir(raiz)
    except OSError:
        return []
    return sorted(n for n in nombres if RE_NOMBRE.match(n) and os.path.isdir(os.path.join(raiz, n)))


def buscador_de(nombre):
    """`LeannSearcher` del índice; cachea cuatro y el más viejo sale en la quinta."""
    with _cerrojo:
        if nombre in _buscadores:
            return _buscadores[nombre]
    _, clase_searcher = clases_leann()
    nuevo = clase_searcher(ruta_de_indice(nombre))
    with _cerrojo:
        _buscadores[nombre] = nuevo
        _orden.append(nombre)
        while len(_orden) > TOPE_CACHE:
            _buscadores.pop(_orden.pop(0), None)
    return nuevo


def buscar_indice(nombre, datos):
    """Buscar: filtros LLEGAN TAL CUAL a `metadata_filters`; `k`→`top_k`, `peso_vector`→peso."""
    consulta = datos.get("consulta")
    if not isinstance(consulta, str) or not consulta.strip():
        raise PeticionMala(400, "falta la consulta")
    filtros = datos.get("filtros")
    if filtros is not None and not isinstance(filtros, dict):
        raise PeticionMala(400, "filtros ha de ser un objeto")
    if not os.path.exists(ruta_de_indice(nombre)):
        raise PeticionMala(404, "no existe ese índice")
    llamada = {"top_k": datos.get("k", 5)}
    if filtros is not None:
        llamada["metadata_filters"] = filtros
    if datos.get("peso_vector") is not None:
        llamada["vector_weight"] = datos["peso_vector"]
    resultados = buscador_de(nombre).search(consulta, **llamada)
    return [{"id": getattr(r, "id", ""), "puntuacion": getattr(r, "score", 0.0),
             "texto": getattr(r, "text", ""), "metadatos": getattr(r, "metadata", {}) or {}}
            for r in resultados]


def poner_en_indice(nombre, datos):
    """Un cerrojo por índice: crea (ollama + qwen3) o añade con `update_index`."""
    textos = datos.get("textos")
    if not isinstance(textos, list) or not textos:
        raise PeticionMala(400, "falta la lista de textos")
    for uno in textos:
        if (not isinstance(uno.get("texto"), str) or not uno["texto"].strip()
                or not isinstance(uno.get("metadatos"), dict)
                or not uno["metadatos"].get("alcance")):
            raise PeticionMala(400, "cada texto lleva su texto y los metadatos, su alcance")
    ruta = ruta_de_indice(nombre)
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    with _cerrojo:
        cerrojo = _cerrojos_indice.setdefault(nombre, threading.Lock())
    clase_builder, _ = clases_leann()
    with cerrojo:  # una escritura por índice a la vez
        builder = clase_builder(backend_name="hnsw", embedding_model=MODELO_EMBEDDING,
                                embedding_mode="ollama")
        for uno in textos:
            builder.add_text(uno["texto"], metadata=uno["metadatos"])
        if os.path.exists(ruta):
            builder.update_index(ruta, remove_passage_ids=None)
        else:
            builder.build_index(ruta)
    with _cerrojo:  # tras escribir, el buscador cacheado leería un índice viejo
        if nombre in _buscadores:
            _orden.remove(nombre)
            del _buscadores[nombre]
    return {"nombre": nombre, "anadidos": len(textos)}
