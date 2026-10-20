# -*- coding: utf-8 -*-
"""Servidor FALSO para las pruebas de los vigías 3D (no es una prueba: lo importan test_vigias_3d*.py).

Qué es real y qué es sintético, para que nadie confunda una cosa con la otra:

REAL (respuestas grabadas el 2026-10-20 en `grabaciones_vigias_3d/`, recortadas pero sin tocar su contenido):
  · README y LICENSE de Friedrich-M/UniMate (raw.githubusercontent.com)
  · api/models/Linzhan/UniMate, api/papers/2609.05415 (con githubRepo y linkedModels) y api/models?filter=arxiv:2609.05415
  · api/papers/2609.34900 y 2609.39709: el 404 «Paper not found» de Filigree3D y BTC3D; sus filtros de modelos: `[]`
  · el Atom de arXiv de 2609.34900 y 2609.39709 (el grabado NO trae a UniMate: el vigía tiene que tolerarlo)
  · el 429 «Rate exceeded.» que arXiv devolvió al volver a pedirlo el mismo día
  · el estado (206) de la sonda unimate/inference/sample.py; su CUERPO aquí es un texto corto inventado

SINTÉTICO (construido en este archivo, marcado «SINTÉTICO» donde se usa): UniMate tal como lo daba por sabido el
contrato el 2026-10-11 (sin código), un Filigree3D con código publicado y cualquier fallo de red.
"""
from __future__ import annotations

import json
from pathlib import Path

GRABACIONES = Path(__file__).resolve().parent / "grabaciones_vigias_3d"
RAW = "https://raw.githubusercontent.com"
HF = "https://huggingface.co"
ARXIV = "https://export.arxiv.org/api/query"
IDS_ARXIV = "2609.05415,2609.34900,2609.39709"  # el orden de VIGIAS: unimate, filigree3d, btc3d


def grabacion(nombre: str) -> str:
    return (GRABACIONES / nombre).read_text("utf-8")


class Falso:
    """Servidor simulado por URL exacta. Una URL que nadie preparó FALLA la prueba: así un test no depende de
    una llamada que no sabía que se hacía. Cuenta y recuerda cada petición (URL y cabeceras)."""

    def __init__(self, respuestas: dict[str, tuple[int, dict, str]], defecto: tuple[int, dict, str] | None = None):
        self.r = dict(respuestas)
        self.defecto = defecto
        self.vistas: list[tuple[str, dict]] = []

    def __call__(self, url, cabeceras=None, plazo=30):
        self.vistas.append((url, dict(cabeceras or {})))
        if url in self.r:
            return self.r[url]
        if self.defecto is not None:
            return self.defecto
        raise AssertionError(f"URL no preparada en el servidor falso: {url}")

    def urls(self) -> list[str]:
        return [u for u, _ in self.vistas]


def ok(cuerpo: str, codigo: int = 200) -> tuple[int, dict, str]:
    return codigo, {}, cuerpo


def red_caida() -> Falso:
    """SINTÉTICO: ni un servidor contesta (lo que devuelve `http_get` cuando no hay red)."""
    return Falso({}, defecto=(0, {}, ""))


def mundo_real() -> dict[str, tuple[int, dict, str]]:
    """La red del 2026-10-20 según las grabaciones."""
    u = "Friedrich-M/UniMate"
    return {
        f"{RAW}/{u}/main/README.md": ok(grabacion("unimate-readme.md")),
        f"{RAW}/{u}/main/LICENSE": ok(grabacion("unimate-license-codigo.txt")),
        f"{RAW}/{u}/main/unimate/inference/sample.py": ok("# sample.py (cuerpo recortado en la prueba)", 206),
        f"{HF}/api/models/Linzhan/UniMate": ok(grabacion("hf-unimate-modelo.json")),
        f"{HF}/api/papers/2609.05415": ok(grabacion("hf-papers-unimate.json")),
        f"{HF}/api/papers/2609.34900": (404, {}, grabacion("hf-papers-no-encontrado.json")),
        f"{HF}/api/papers/2609.39709": (404, {}, grabacion("hf-papers-no-encontrado.json")),
        f"{HF}/api/models?filter=arxiv:2609.05415": ok(grabacion("hf-modelos-arxiv-unimate.json")),
        f"{HF}/api/models?filter=arxiv:2609.34900": ok(grabacion("hf-modelos-arxiv-vacio.json")),
        f"{HF}/api/models?filter=arxiv:2609.39709": ok(grabacion("hf-modelos-arxiv-vacio.json")),
        f"{ARXIV}?id_list={IDS_ARXIV}": ok(grabacion("arxiv-atom.xml")),
    }


def mundo_linea_base() -> dict[str, tuple[int, dict, str]]:
    """SINTÉTICO: UniMate como lo daba por sabido el contrato el 2026-10-11. Código anunciado pero sin publicar
    (README con «coming soon», sin sonda), pesos sin licencia declarada, artículo sin indexar en Hugging Face."""
    m = mundo_real()
    u = "Friedrich-M/UniMate"
    modelo = json.loads(grabacion("hf-unimate-modelo.json"))
    modelo["cardData"].pop("license", None)
    modelo["tags"] = [t for t in modelo["tags"] if not t.startswith("license:")]
    m.update({
        f"{RAW}/{u}/main/README.md": ok("# UniMate\n\n- **[2026-09-27]** Preview checkpoints are released at HuggingFace.\n- Inference code coming soon.\n"),
        f"{RAW}/{u}/main/unimate/inference/sample.py": (404, {}, "404: Not Found"),
        f"{HF}/api/models/Linzhan/UniMate": ok(json.dumps(modelo)),
        f"{HF}/api/papers/2609.05415": (404, {}, grabacion("hf-papers-no-encontrado.json")),
        f"{HF}/api/models?filter=arxiv:2609.05415": ok("[]"),
    })
    return m


def mundo_filigree_con_codigo(licencia_pesos: str | None = "apache-2.0") -> dict[str, tuple[int, dict, str]]:
    """SINTÉTICO: el mundo real más un Filigree3D que ya publicó repo (ejemplo/filigree3d), README con comando de
    inferencia, LICENSE Apache-2.0 y, si se pide, un modelo oficial con esa licencia."""
    m = mundo_real()
    r = "ejemplo/filigree3d"
    papel = {"id": "2609.34900", "githubRepo": "https://github.com/ejemplo/filigree3d",
             "linkedModels": [{"id": "ejemplo/filigree3d-pesos"}] if licencia_pesos else []}
    m.update({
        f"{HF}/api/papers/2609.34900": ok(json.dumps(papel)),
        f"{HF}/api/models?filter=arxiv:2609.34900": ok(json.dumps([{"id": "ejemplo/filigree3d-pesos"}]) if licencia_pesos else "[]"),
        f"{RAW}/{r}/main/README.md": ok("# Filigree3D\n\n## Inferencia\n\n```bash\npython infer.py --image foto.png --out malla.glb\n```\n"),
        f"{RAW}/{r}/main/LICENSE": ok("Apache License\nVersion 2.0, January 2004\nhttp://www.apache.org/licenses/\n"),
    })
    if licencia_pesos:
        m[f"{HF}/api/models/ejemplo/filigree3d-pesos"] = ok(json.dumps({"id": "ejemplo/filigree3d-pesos", "cardData": {"license": licencia_pesos}, "tags": []}))
    return m
