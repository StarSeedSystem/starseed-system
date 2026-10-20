#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Vigías de la Biblioteca (AV1011G) · lectura de fuentes PÚBLICAS y de lo que dicen.

Sin claves y sin la API REST de GitHub (que da 403 sin credencial): solo
  · raw.githubusercontent.com  (README, LICENSE y sondas con `Range: bytes=0-0`)
  · huggingface.co/api         (`models/<id>`, `papers/<arxiv>` y `models?filter=arxiv:<id>`)
  · export.arxiv.org/api/query (Atom, un único lote para todos los artículos)

Toda respuesta se clasifica en tres estados y NUNCA se inventa un dato:
  ok         el servidor contestó y el dato es legible
  no-existe  el servidor dice con claridad que no está (404): es una respuesta, no un fallo
  sin-datos  no se pudo saber (red caída, 403, 429, 5xx, JSON ilegible): el vigía no compara nada con eso

La red es inyectable (`get=` igual que `actualizar_catalogo.http_get`) para probar con respuestas grabadas.
"""
from __future__ import annotations

import json
import re
import sys
import time
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any, Callable

sys.path.insert(0, str(Path(__file__).resolve().parent))
from actualizar_catalogo import http_get  # noqa: E402  (la misma puerta de red que el catálogo)

OK, NO_EXISTE, SIN_DATOS = "ok", "no-existe", "sin-datos"
RAMAS = ("main", "master")
RAW = "https://raw.githubusercontent.com"
HF = "https://huggingface.co"
ARXIV = "https://export.arxiv.org/api/query"
NS_ATOM = {"a": "http://www.w3.org/2005/Atom", "x": "http://arxiv.org/schemas/atom"}


def estado_http(codigo: int) -> str:
    """200/206 → ok · 404 → no-existe · todo lo demás (0, 401, 403, 429, 5xx…) → sin-datos."""
    if codigo in (200, 206):
        return OK
    if codigo == 404:
        return NO_EXISTE
    return SIN_DATOS


# ───────────────────────────── red ─────────────────────────────
class Fuentes:
    def __init__(self, get: Callable[..., tuple[int, dict, str]] = http_get, dormir: Callable[[float], None] = time.sleep,
                 pausa: float = 0.4, plazo: int = 25):
        self.get = get
        self.dormir = dormir
        self.pausa = pausa
        self.plazo = plazo
        self.llamadas = 0

    def _pedir(self, url: str, cabeceras: dict[str, str] | None = None) -> tuple[int, str]:
        if self.llamadas:
            self.dormir(self.pausa)
        self.llamadas += 1
        try:
            codigo, _, cuerpo = self.get(url, cabeceras or {}, self.plazo)
        except (OSError, ValueError):  # una red que lanza en vez de devolver 0 tampoco tumba la pasada
            return 0, ""
        return codigo, cuerpo

    def texto_raw(self, repo: str, ruta: str, rama: str | None = None, rango: bool = False) -> tuple[str, str | None, str]:
        """(estado, texto, rama). Sin rama prueba main y master; un fallo de red corta sin afirmar que no existe."""
        resultado = NO_EXISTE
        for r in (rama,) if rama else RAMAS:
            codigo, cuerpo = self._pedir(f"{RAW}/{repo}/{r}/{ruta}", {"Range": "bytes=0-0"} if rango else None)
            e = estado_http(codigo)
            if e == OK:
                return OK, cuerpo, r
            if e == SIN_DATOS:
                return SIN_DATOS, None, ""
        return resultado, None, ""

    def _json_hf(self, ruta: str) -> tuple[str, Any]:
        codigo, cuerpo = self._pedir(f"{HF}{ruta}")
        e = estado_http(codigo)
        if e != OK:
            return e, None
        try:
            return OK, json.loads(cuerpo)
        except ValueError:
            return SIN_DATOS, None

    def modelo_hf(self, id_modelo: str) -> tuple[str, dict | None]:
        return self._json_hf(f"/api/models/{id_modelo}")

    def articulo_hf(self, arxiv: str) -> tuple[str, dict | None]:
        """404 aquí es «no indexado en Hugging Face» (nadie lo ha citado aún en un README), no un error."""
        return self._json_hf(f"/api/papers/{arxiv}")

    def modelos_de_arxiv(self, arxiv: str) -> tuple[str, list]:
        e, datos = self._json_hf(f"/api/models?filter=arxiv:{arxiv}")
        if e == OK and not isinstance(datos, list):
            return SIN_DATOS, []
        return e, datos if e == OK else []

    def atom(self, ids: list[str]) -> tuple[str, dict[str, dict]]:
        codigo, cuerpo = self._pedir(f"{ARXIV}?id_list={','.join(ids)}")
        e = estado_http(codigo)
        if e != OK:
            return e, {}
        try:
            return OK, parsear_atom(cuerpo)
        except (ET.ParseError, ValueError):
            return SIN_DATOS, {}


# ───────────────────────────── lectura de lo recibido (puro) ─────────────────────────────
def parsear_atom(xml: str) -> dict[str, dict]:
    """{id sin versión: {titulo, resumen, comentario, actualizado, repos}} del Atom de arXiv."""
    if re.search(r"<!\s*(DOCTYPE|ENTITY)", xml, re.IGNORECASE):
        raise ValueError("el Atom trae una DTD: no se lee")
    salida: dict[str, dict] = {}
    for e in ET.fromstring(xml).findall("a:entry", NS_ATOM):
        url = (e.findtext("a:id", "", NS_ATOM) or "").strip()
        m = re.search(r"/abs/(.+?)(?:v\d+)?$", url)
        if not m:  # el aviso de error de arXiv también es una «entry»: no es un artículo
            continue
        resumen = " ".join((e.findtext("a:summary", "", NS_ATOM) or "").split())
        comentario = " ".join((e.findtext("x:comment", "", NS_ATOM) or "").split())
        enlaces = [l.get("href", "") for l in e.findall("a:link", NS_ATOM)]
        salida[m.group(1)] = {
            "titulo": " ".join((e.findtext("a:title", "", NS_ATOM) or "").split()),
            "resumen": resumen,
            "comentario": comentario,
            "actualizado": (e.findtext("a:updated", "", NS_ATOM) or "")[:10] or None,
            "repos": enlaces_github(" ".join([resumen, comentario, *enlaces])),
        }
    return salida


_RE_GITHUB = re.compile(r"https?://(?:www\.)?github\.com/([A-Za-z0-9][A-Za-z0-9-]{0,38})/([A-Za-z0-9._-]+)")


def repo_de_url(url: str | None) -> str | None:
    """«https://github.com/dueño/nombre(.git)(/…)» → «dueño/nombre»."""
    m = _RE_GITHUB.search(url or "")
    if not m:
        return None
    nombre = re.sub(r"\.git$", "", m.group(2)).rstrip(".")
    return f"{m.group(1)}/{nombre}" if nombre else None


def enlaces_github(texto: str) -> list[str]:
    vistos: list[str] = []
    for m in _RE_GITHUB.finditer(texto or ""):
        repo = repo_de_url(m.group(0))
        if repo and repo not in vistos:
            vistos.append(repo)
    return vistos


def clasificar_licencia(texto: str | None) -> str | None:
    """Identifica por su TEXTO la licencia de un LICENSE. None si no hay texto; «otra» si no la reconoce."""
    if not texto or not texto.strip():
        return None
    t = " ".join(texto.split())
    bajo = t.lower()
    if "mit license" in bajo or "permission is hereby granted, free of charge" in bajo:
        return "MIT"
    if "apache license" in bajo and "version 2.0" in bajo:
        return "Apache-2.0"
    if "gnu affero general public license" in bajo:
        return "AGPL-3.0"
    if "gnu lesser general public license" in bajo:
        return "LGPL-3.0" if "version 3" in bajo else "LGPL-2.1"
    if "gnu general public license" in bajo:
        return "GPL-3.0" if "version 3" in bajo else "GPL-2.0"
    if "mozilla public license" in bajo:
        return "MPL-2.0"
    if "creative commons" in bajo:
        nc = "noncommercial" in bajo or "non-commercial" in bajo
        sa = "sharealike" in bajo or "share-alike" in bajo
        nd = "noderivatives" in bajo or "no derivatives" in bajo
        version = "4.0" if "4.0" in bajo else "3.0" if "3.0" in bajo else ""
        partes = ["CC", "BY"] + (["NC"] if nc else []) + (["ND"] if nd else []) + (["SA"] if sa else [])
        return "-".join(partes + ([version] if version else []))
    if "redistribution and use in source and binary forms" in bajo:
        return "BSD-3-Clause" if "neither the name" in bajo else "BSD-2-Clause"
    if "free and unencumbered software released into the public domain" in bajo:
        return "Unlicense"
    if bajo.startswith("isc license") or "isc license" in bajo[:40]:
        return "ISC"
    return "otra"


def licencia_hf(modelo: dict | None) -> str | None:
    """Licencia declarada por el modelo en Hugging Face: `cardData.license` o la etiqueta `license:…`."""
    if not isinstance(modelo, dict):
        return None
    carta = modelo.get("cardData")
    declarada = carta.get("license") if isinstance(carta, dict) else None
    if isinstance(declarada, list):
        declarada = declarada[0] if declarada else None
    if isinstance(declarada, str) and declarada.strip():
        return declarada.strip().lower()
    for etiqueta in modelo.get("tags") or []:
        if isinstance(etiqueta, str) and etiqueta.startswith("license:"):
            return etiqueta[len("license:"):].strip().lower() or None
    return None


_LIBRES = ("mit", "apache-2.0", "bsd-2-clause", "bsd-3-clause", "isc", "cc0-1.0", "unlicense", "zlib", "bsl-1.0", "wtfpl")


def uso_de_licencia(licencia: str | None) -> str | None:
    """Vocabulario del núcleo TS (`USOS_LICENCIA`). None si no se sabe: no se adivina.
    «restringido-region» nunca se deduce de una etiqueta (hay que leer el texto): lo decide una persona."""
    if not licencia:
        return None
    lic = licencia.strip().lower()
    if re.search(r"(^|[-_ ])nc([-_ ]|$)|non-?commercial|research|academic", lic):
        return "no-comercial"
    if lic in _LIBRES:
        return "libre"
    if re.fullmatch(r"cc-by-\d(\.\d)?", lic):
        return "atribucion"
    return "condicionado"  # sa, copyleft, openrail, «other»… exigen condiciones: nunca «libre» por defecto


_RE_NOTICIA = re.compile(r"^\s*[-*]\s*\**\[(\d{4}-\d{2}-\d{2})\]\**\s*(.+)$")
_RE_CODIGO_SALIDO = re.compile(r"\bcode\b.*\b(?:is|are|has been|have been)?\s*(?:now\s+)?(?:released|available|open[- ]sourced|out)\b", re.IGNORECASE)
_RE_FUTURO = re.compile(r"coming soon|will be (?:released|available|made|open)|to be released|stay tuned|\bTODO\b|not yet (?:released|available)", re.IGNORECASE)
_RE_CASILLA = re.compile(r"^\s*[-*]\s*\[( |x|X)\]\s*(.*)$")
# Qué dice una línea de lo pendiente: de INFERENCIA (lo que la vigilancia busca), de ENTRENAMIENTO/datos (no impide usar el
# código) o del código en general. Una línea que no habla de código (p. ej. «TODO: añadir la cita») no cuenta para nada.
_RE_INFERENCIA = re.compile(r"infer|sampl(?:e|ing|er)\b|\bdemo|predict", re.IGNORECASE)
_RE_ENTRENAMIENTO = re.compile(r"train|fine-?tun|dataset|\bdata\b|benchmark|\beval|metric|preprocess", re.IGNORECASE)
_RE_CODIGO_GENERAL = re.compile(r"\bcode\b|source|implementation|\bscripts?\b", re.IGNORECASE)
# Comando de inferencia: un lanzador, quizá con variables delante (`CUDA_VISIBLE_DEVICES=0 python …`), y un script o módulo
# cuyo nombre diga que infiere. Se exige un verbo de inferencia (nada de `run` o `test`: `python -m pytest` o `run_training.py`
# no lo son) y se descartan los nombres de entrenamiento, datos, evaluación, instalación o pruebas.
_RE_COMANDO = re.compile(
    r"^\s*(?:[$>]\s*)?(?:[A-Za-z_][A-Za-z0-9_]*=\S+\s+)*"
    r"((?:python3?|torchrun|accelerate launch|uv run)\s+(?:-m\s+)?(\S*(?:infer|sample|demo|predict|generate)\S*)(?:\s.*?)?)\s*\\?\s*$",
    re.IGNORECASE,
)
_RE_NO_INFERENCIA = re.compile(r"train|data|preprocess|prepare|eval|bench|metric|convert|download|setup|install|build|test", re.IGNORECASE)


def _nombre_del_guion(token: str) -> str:
    """`scripts/data_tools/infer.py` → `infer` · `unimate.inference.sample` → `sample` (el nombre propio, sin carpetas)."""
    return re.sub(r"\.py$", "", re.split(r"[/\\]", token)[-1]).split(".")[-1]


def comando_de_inferencia(linea: str) -> str | None:
    m = _RE_COMANDO.match(linea)
    if not m or _RE_NO_INFERENCIA.search(_nombre_del_guion(m.group(2))):
        return None
    return m.group(1).strip()[:160]


_RE_DEMO_ALOJADA = re.compile(r"\bdemo.*(hugging ?face|\bspaces?\b|gradio|colab|online|\bweb\b)|"
                              r"(hugging ?face|\bspaces?\b|gradio|colab|online|\bweb\b).*\bdemo", re.IGNORECASE)
_RE_INFERENCIA_O_CODIGO = re.compile(r"infer|sampl|predict|\bcode\b|c[oó]digo", re.IGNORECASE)


def pendiente_de_codigo(linea: str) -> bool:
    """¿La línea anuncia como PENDIENTE algo que impide usar el código: la inferencia, una demo o el código sin más?
    El entrenamiento, los datos o los pesos solos no cuentan, ni una línea que no hable de código."""
    casilla = _RE_CASILLA.match(linea)
    if not (_RE_FUTURO.search(linea) or (casilla and casilla.group(1) == " ")):
        return False
    if _RE_DEMO_ALOJADA.search(linea) and not _RE_INFERENCIA_O_CODIGO.search(linea):
        return False  # «- [ ] Hugging Face demo»: una demo en la web pendiente no impide usar el código en local
    if _RE_INFERENCIA.search(linea):
        return True
    return not _RE_ENTRENAMIENTO.search(linea) and bool(_RE_CODIGO_GENERAL.search(linea))


def senales_readme(texto: str | None) -> dict:
    """Lo que el README AFIRMA, sin interpretarlo más: comando de inferencia, fecha en que anuncia el código como
    publicado, casilla MARCADA que nombra la inferencia y si anuncia como pendiente la inferencia o el código
    (con la línea que lo dice, para citarla). Lo que está en un bloque de código no se lee como pendiente."""
    vacio = {"comando_inferencia": None, "fecha_codigo": None, "anuncia_pendiente": False, "pendiente": None, "inferencia_marcada": False}
    if not texto:
        return vacio
    comando = None
    fechas: list[str] = []
    pendiente: str | None = None
    marcada = False
    en_bloque = False
    for linea in texto.split("\n"):
        if linea.lstrip().startswith("```"):
            en_bloque = not en_bloque
            continue
        if comando is None:
            comando = comando_de_inferencia(linea)
        noticia = _RE_NOTICIA.match(linea)
        if noticia and _RE_CODIGO_SALIDO.search(noticia.group(2)) and not _RE_FUTURO.search(noticia.group(2)):
            fechas.append(noticia.group(1))
        if en_bloque:
            continue
        casilla = _RE_CASILLA.match(linea)
        if casilla and casilla.group(1) in "xX" and _RE_INFERENCIA.search(casilla.group(2)):
            marcada = True
        if pendiente is None and pendiente_de_codigo(linea):
            pendiente = " ".join(linea.split())[:160]
    return {"comando_inferencia": comando, "fecha_codigo": min(fechas) if fechas else None, "anuncia_pendiente": pendiente is not None,
            "pendiente": pendiente, "inferencia_marcada": marcada}
