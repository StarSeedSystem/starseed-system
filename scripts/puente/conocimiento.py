#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Conocimiento propio del Mando (FLU1005E · ola 1005F): bases, documentos y recuperación BM25.

Réplica del subconjunto de Dify que usamos (architecture/puente-propio-flujos.md §4),
sin depender de Dify: crear y listar bases, añadir documentos (texto, markdown, PDF vía
`pypdf` si está instalado, o URL ya descargada e inyectada por el llamante — este módulo
NUNCA sale a la red) y recuperar por BM25.

El troceo y el BM25 son los de `produccion_memoria.py` (PRD1005M): si ese módulo existe
se importan de ahí sus funciones `trocear_texto` / `bm25_puntuar`; si aún no ha caído en
main, aquí vive una implementación compatible con la misma interfaz. Al caer produccion_memoria,
borra el duplicado de abajo y queda solo el import.

Guardado en `starseed_memory_root/conocimiento/<base_id>/`:
  - `base.json`: {"id", "name", "description", "created_at", "document_count", "word_count"}
  - `documentos/<doc_id>.json`: {"id", "name", "created_at", "word_count",
      "trozos": [{"id", "content", "tokens": [...]}]}
Todo es disco local JSON: nada de red, nada de claves (los nombres de variables de entorno
de credenciales los puede guardar el motor de flujos aparte, aquí no).

Uso (cada orden imprime JSON por stdout y sale 0, o imprime {"error": ...} y sale 1):
  crear --nombre N [--descripcion D]
  listar
  documentos --base ID
  agregar-texto --base ID --nombre N [--texto T | --texto - | --pdf RUTA]
  recuperar --base ID --consulta "..." [--top 5]
"""
import json
import math
import os
import re
import sys
import time
import unicodedata
import uuid

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
if DIRECTORIO not in sys.path:
    sys.path.insert(0, DIRECTORIO)

try:
    from produccion_memoria import trocear_texto as _trocear_pm, bm25_puntuar as _bm25_pm
except ImportError:
    _trocear_pm = None
    _bm25_pm = None

RAIZ = os.environ.get("STARSEED_ROOT") or os.path.dirname(os.path.dirname(DIRECTORIO))
CONOCIMIENTO = os.path.join(RAIZ, "starseed_memory_root", "conocimiento")

TAM_TROZO = 500
SOLAPE_TROZO = 80

_TOKEN = re.compile(r"[a-z0-9]+")


def _sin_acentos(texto):
    return "".join(c for c in unicodedata.normalize("NFKD", texto) if not unicodedata.combining(c))


def tokenizar(texto):
    """Minúsculas sin acentos -> lista de términos. BM25 y troceo la comparten."""
    return _TOKEN.findall(_sin_acentos(texto.lower()))


def _trocear_local(texto, tam=TAM_TROZO, solape=SOLAPE_TROZO):
    """Ventanas de ~`tam` caracteres cortadas en fin de frase o espacio, con solape."""
    texto = re.sub(r"\s+", " ", (texto or "")).strip()
    if not texto:
        return []
    trozos = []
    i = 0
    while i < len(texto):
        limite = min(len(texto), i + tam)
        corte = limite
        if limite < len(texto):
            bueno = max(texto.rfind(". ", i, limite + 1), texto.rfind(" ", i, limite))
            if bueno > i + tam // 2:
                corte = bueno + 1
        trozos.append(texto[i:corte].strip())
        i = max(i + 1, corte - solape)
    return [t for t in trozos if t]


def trocear(texto):
    if _trocear_pm is not None:
        return _trocear_pm(texto, TAM_TROZO, SOLAPE_TROZO)
    return _trocear_local(texto)


def bm25_puntuar(trozos_tokens, consulta_tokens, k1=1.5, b=0.75):
    """BM25 clásico: `trozos_tokens` es una lista de listas de tokens."""
    if _bm25_pm is not None:
        return _bm25_pm(trozos_tokens, consulta_tokens)
    return _bm25_local(trozos_tokens, consulta_tokens, k1, b)


def _bm25_local(trozos_tokens, consulta_tokens, k1, b):
    n = len(trozos_tokens)
    if n == 0 or not consulta_tokens:
        return [0.0] * n
    largos = [len(t) for t in trozos_tokens]
    media = sum(largos) / n or 1.0
    frec_doc = {}
    for tokens in trozos_tokens:
        for termino in set(tokens):
            frec_doc[termino] = frec_doc.get(termino, 0) + 1
    puntos = []
    for tokens, largo in zip(trozos_tokens, largos):
        frecs = {}
        for t in tokens:
            frecs[t] = frecs.get(t, 0) + 1
        total = 0.0
        for termino in consulta_tokens:
            f = frecs.get(termino, 0)
            if f == 0:
                continue
            idf = math.log(1 + (n - frec_doc[termino] + 0.5) / (frec_doc[termino] + 0.5))
            total += idf * (f * (k1 + 1)) / (f + k1 * (1 - b + b * largo / media))
        puntos.append(round(total, 6))
    return puntos


# ---------- guardado (único punto con disco; inyectable en pruebas vía `raiz`) ----------

_SLUG = re.compile(r"[^a-z0-9]+")


def id_de_nombre(nombre):
    """Slug seguro para usar como carpeta: solo [a-z0-9-], sin `..` ni separadores."""
    base = _SLUG.sub("-", _sin_acentos(nombre or "").lower()).strip("-")
    return base[:60] or uuid.uuid4().hex[:12]


def _dir_base(base_id, raiz=None):
    return os.path.join(raiz or CONOCIMIENTO, base_id)


def _leer_json(ruta, por_defecto):
    try:
        with open(ruta, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return por_defecto


def _escribir_json(ruta, datos):
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    tmp = ruta + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(datos, f, ensure_ascii=False, indent=2)
    os.replace(tmp, ruta)


def crear_base(nombre, descripcion="", raiz=None):
    base_id = id_de_nombre(nombre)
    dirb = _dir_base(base_id, raiz)
    if os.path.exists(os.path.join(dirb, "base.json")):
        suf = 2
        while os.path.exists(os.path.join(_dir_base(f"{base_id}-{suf}", raiz), "base.json")):
            suf += 1
        base_id = f"{base_id}-{suf}"
        dirb = _dir_base(base_id, raiz)
    base = {
        "id": base_id,
        "name": nombre,
        "description": descripcion,
        "created_at": int(time.time()),
        "document_count": 0,
        "word_count": 0,
    }
    _escribir_json(os.path.join(dirb, "base.json"), base)
    os.makedirs(os.path.join(dirb, "documentos"), exist_ok=True)
    return base


def listar_bases(raiz=None):
    dirr = raiz or CONOCIMIENTO
    bases = []
    if os.path.isdir(dirr):
        for nombre in sorted(os.listdir(dirr)):
            base = _leer_json(os.path.join(dirr, nombre, "base.json"), None)
            if base:
                bases.append(base)
    return bases


def _cargar_base(base_id, raiz=None):
    base = _leer_json(os.path.join(_dir_base(base_id, raiz), "base.json"), None)
    if base is None:
        raise KeyError(f"Base no encontrada: {base_id}")
    return base


def _texto_de_pdf(ruta):
    """PDF con la herramienta Python del repo: `pypdf` si está instalada; si no, error claro."""
    try:
        from pypdf import PdfReader
    except ImportError:
        raise RuntimeError("Falta pypdf para leer PDF: pip install pypdf")
    texto = []
    for pagina in PdfReader(ruta).pages:
        texto.append(pagina.extract_text() or "")
    return "\n\n".join(texto)


def agregar_documento(base_id, nombre, texto, raiz=None):
    base = _cargar_base(base_id, raiz)
    doc_id = uuid.uuid4().hex[:12]
    trozos = [
        {"id": f"{doc_id}-{i}", "content": t, "tokens": tokenizar(t)}
        for i, t in enumerate(trocear(texto))
    ]
    palabras = sum(len(t["tokens"]) for t in trozos)
    doc = {
        "id": doc_id,
        "name": nombre,
        "created_at": int(time.time()),
        "word_count": palabras,
        "tokens_totales": palabras,
    }
    dirb = _dir_base(base_id, raiz)
    _escribir_json(os.path.join(dirb, "documentos", f"{doc_id}.json"), dict(doc, trozos=trozos))
    base["document_count"] = base.get("document_count", 0) + 1
    base["word_count"] = base.get("word_count", 0) + palabras
    _escribir_json(os.path.join(dirb, "base.json"), base)
    return doc


def listar_documentos(base_id, raiz=None):
    _cargar_base(base_id, raiz)
    docs = []
    dir_docs = os.path.join(_dir_base(base_id, raiz), "documentos")
    if os.path.isdir(dir_docs):
        for nombre in sorted(os.listdir(dir_docs)):
            doc = _leer_json(os.path.join(dir_docs, nombre), None)
            if doc:
                docs.append({k: v for k, v in doc.items() if k != "trozos"})
    return docs


def recuperar(base_id, consulta, top=5, raiz=None):
    """BM25 sobre los trozos de la base: devuelve {"query": {"content": ...}, "records": [...]}."""
    _cargar_base(base_id, raiz)
    dir_docs = os.path.join(_dir_base(base_id, raiz), "documentos")
    trozos, docs = [], []
    if os.path.isdir(dir_docs):
        for nombre in sorted(os.listdir(dir_docs)):
            doc = _leer_json(os.path.join(dir_docs, nombre), None)
            if doc:
                docs.append(doc)
                trozos.extend(doc.get("trozos", []))
    if not trozos:
        return {"query": {"content": consulta}, "records": []}
    puntos = bm25_puntuar([t["tokens"] for t in trozos], tokenizar(consulta))
    mejores = sorted(zip(puntos, trozos), key=lambda p: p[0], reverse=True)[:top]
    records = [
        {
            "segment": {"id": t["id"], "document_id": t["id"].split("-")[0], "content": t["content"]},
            "score": p,
        }
        for p, t in mejores
        if p > 0
    ]
    return {"query": {"content": consulta}, "records": records}


# ---------- CLI (proceso corto: lo invocan la API del Mando y la terminal) ----------


def _opcion(argv, nombre, por_defecto=""):
    if nombre in argv and argv.index(nombre) + 1 < len(argv):
        return argv[argv.index(nombre) + 1]
    return por_defecto


def main(argv):
    orden = argv[1] if len(argv) > 1 else ""
    try:
        if orden == "crear":
            salida = crear_base(_opcion(argv, "--nombre"), _opcion(argv, "--descripcion"))
        elif orden == "listar":
            salida = listar_bases()
        elif orden == "documentos":
            salida = listar_documentos(_opcion(argv, "--base"))
        elif orden == "agregar-texto":
            texto, pdf = _opcion(argv, "--texto"), _opcion(argv, "--pdf")
            if texto == "-":
                texto = sys.stdin.read()
            elif pdf:
                texto = _texto_de_pdf(pdf)
            salida = agregar_documento(_opcion(argv, "--base"), _opcion(argv, "--nombre"), texto)
        elif orden == "recuperar":
            top = _opcion(argv, "--top", "5")
            salida = recuperar(_opcion(argv, "--base"), _opcion(argv, "--consulta"), int(top or 5))
        else:
            salida = {"error": "Orden desconocida: " + (orden or "(vacía)")}
            print(json.dumps(salida, ensure_ascii=False))
            return 1
    except KeyError as e:
        print(json.dumps({"error": str(e).strip("'")}, ensure_ascii=False))
        return 1
    print(json.dumps(salida, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
