"""Pruebas del generador dna.json → DESIGN.md (pytest, sin red)."""
import copy
import json
import os
import subprocess
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from diseno_adn_a_design_md import design_md, main

ADN = {
    "meta": {"nombre": "Contexto de prueba", "slug": "prueba", "fecha": "2026-10-27", "no_copiado": ["logotipo ajeno"]},
    "alma": {"una_linea": "Cálido y claro", "adjetivos": ["sereno", "luminoso"], "linaje": "Prueba"},
    "paleta": [
        {"rol": "fondo", "hex": "#FFF8F0", "nombre": "crema", "cobertura": 60, "prohibido": []},
        {"rol": "primario", "hex": "#C05C3B", "nombre": "terracota", "cobertura": 20, "prohibido": ["saturación sobre texto"]},
    ],
    "tipo": {"familias": [{"rol": "titular", "nombre": "Fraunces", "fallback": "Georgia, serif"}]},
    "firmas": [{"jugada": "cristal cálido", "como": "opacidad 0.9"}],
}
# `espacio` y `superficie` ausentes a propósito: deben salir «Sin datos en el ADN».

TITULOS = [
    "## 1. Visual Theme & Atmosphere",
    "## 2. Color Palette & Roles",
    "## 3. Typography Rules",
    "## 4. Component Stylings",
    "## 5. Layout Principles",
    "## 6. Depth & Elevation",
    "## 7. Do's and Don'ts",
    "## 8. Responsive Behavior",
    "## 9. Agent Prompt Guide",
]


def test_nueve_titulos_en_orden() -> None:
    texto = design_md(ADN)
    posiciones = [texto.index(t) for t in TITULOS]
    assert posiciones == sorted(posiciones)
    assert texto.startswith("# Design System: Contexto de prueba")
    assert "No editar a mano." in texto


def test_hex_de_paleta_y_sin_datos() -> None:
    texto = design_md(ADN)
    assert "`#FFF8F0`" in texto and "`#C05C3B`" in texto
    assert "Prohibido: saturación sobre texto" in texto
    assert texto.count("Sin datos en el ADN") >= 4


def test_adn_real_del_cafe() -> None:
    raiz = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    ruta = os.path.join(raiz, "memory", "diseno", "adn", "cafe", "dna.json")
    with open(ruta, encoding="utf-8") as lector:
        dna = json.load(lector)
    texto = design_md(dna)
    assert "`#FDF7EA`" in texto
    assert "terracota sobre crema" in texto


def test_pura_y_determinista() -> None:
    original = copy.deepcopy(ADN)
    primera = design_md(ADN)
    segunda = design_md(ADN)
    assert primera == segunda
    assert ADN == original


def test_prompt_md_queda_guiado() -> None:
    con_prompt = design_md(ADN, prompt_md="Línea uno\n\nLínea dos")
    sin_prompt = design_md(ADN)
    assert "Línea uno\nLínea dos" in con_prompt
    assert "Línea uno" not in sin_prompt
    assert "Sin PROMPT.md" in sin_prompt


@pytest.fixture
def repo_tmp(tmp_path):
    """Repo mínimo en una carpeta temporal con un solo contexto."""
    contexto = tmp_path / "memory" / "diseno" / "adn" / "prueba"
    contexto.mkdir(parents=True)
    (contexto / "dna.json").write_text(json.dumps(ADN, ensure_ascii=False), encoding="utf-8")
    return tmp_path


def test_main_sin_escribir_no_crea_archivos(repo_tmp, capsys) -> None:
    main(["--slug", "prueba", "--raiz", str(repo_tmp)])
    salida = capsys.readouterr().out
    assert "# Design System: Contexto de prueba" in salida
    assert not (repo_tmp / "memory" / "diseno" / "adn" / "prueba" / "DESIGN.md").exists()


def test_main_con_escribir_crea_el_archivo(repo_tmp) -> None:
    main(["--slug", "prueba", "--raiz", str(repo_tmp), "--escribir"])
    escrito = repo_tmp / "memory" / "diseno" / "adn" / "prueba" / "DESIGN.md"
    contenido = escrito.read_text(encoding="utf-8")
    assert contenido == design_md(ADN)


@pytest.mark.parametrize("slug", ["..", "a/../b", "café/rogada", ""])
def test_slug_peligroso_se_rechaza(repo_tmp, slug) -> None:
    with pytest.raises(SystemExit):
        main(["--slug", slug, "--raiz", str(repo_tmp)])
