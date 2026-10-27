"""Pruebas de diseno_adn_a_design_md.py (pytest, sin red).

Con un dict de ejemplo: nueve títulos en orden, hex de la paleta y
«Sin datos en el ADN» donde falta algo. Con el ADN del Café real:
#FDF7EA y «terracota sobre crema». Dos llamadas igual texto; main sin
--escribir no crea archivos; un slug con «..» se rechaza.
"""

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from diseno_adn_a_design_md import main, design_md

# scripts/puente/test_*.py → dos niveles arriba queda la raíz del repo.
RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def dna_ejemplo():
    return {
        "meta": {"nombre": "Registro Ejemplo", "slug": "ejemplo",
                 "fuentes": ["memory/diseno/identidades.md"],
                 "fecha": "2026-10-27", "no_copiado": ["logo ficticio"]},
        "alma": {"una_linea": "Lienzo cálido con geometría sagrada",
                 "adjetivos": ["sereno", "armónico", "áureo"], "linaje": "StarSeed"},
        "paleta": [{"rol": "primario", "hex": "#101010", "nombre": "tinta de noche",
                    "cobertura": 70, "prohibido": ["fondo de tarjetas"]},
                   {"rol": "texto", "hex": "#f2f2f2", "nombre": "hueso pulido",
                    "cobertura": 30, "prohibido": []}],
        "tipo": {"familias": [{"rol": "titular", "nombre": "Fraunces",
                               "fallback": "Georgia, serif"}]},
        "firmas": [{"jugada": "cristal base", "como": "16 px por pieza"}],
        "jugada_rara": {"que": "espiral áurea en la pieza protagonista",
                        "como": "1 vez", "por_que": "foco único"},
        "prohibiciones": ["neón", "hex sueltos"],
        "inferido": ["espacio"],
    }


def test_estructura_completa():
    texto = design_md(dna_ejemplo())
    orden = ["1. Visual Theme & Atmosphere", "2. Color Palette & Roles",
             "3. Typography Rules", "4. Component Stylings",
             "5. Layout Principles", "6. Depth & Elevation",
             "7. Do's and Don'ts", "8. Responsive Behavior",
             "9. Agent Prompt Guide"]
    posiciones = [texto.index("## " + t) for t in orden]
    assert posiciones == sorted(posiciones)
    assert texto.startswith("# Design System: Registro Ejemplo")
    assert ("<!-- Generado desde memory/diseno/adn/ejemplo/dna.json "
            "(fecha 2026-10-27). No editar a mano. -->") in texto


def test_datos_de_las_secciones():
    texto = design_md(dna_ejemplo())
    assert "- **tinta de noche** · `#101010`" in texto
    assert "cobertura: 70 %" in texto
    assert "prohibido: fondo de tarjetas" in texto
    assert "**Inferido, no medido:** espacio" in texto
    assert "No copiado: logo ficticio" in texto
    assert "Una vez: espiral áurea" in texto


def test_sin_datos_donde_falta():
    # El ejemplo no tiene espacio, superficie, pesos ni pasos de escala.
    assert design_md(dna_ejemplo()).count("Sin datos en el ADN") >= 4


def test_determinista_y_prompt():
    primer = design_md(dna_ejemplo(), prompt_md="Primera\n\nSegunda")
    assert primer == design_md(dna_ejemplo(), prompt_md="Primera\n\nSegunda")
    # Las líneas no vacías se conservan; las vacías se descartan.
    assert "Primera\nSegunda" in primer
    assert "Sin PROMPT.md" in design_md(dna_ejemplo(), prompt_md="   ")


def test_prompt_14_lineas():
    veinte = "\n\n".join("línea %d" % i for i in range(1, 21))
    texto = design_md(dna_ejemplo(), prompt_md=veinte)
    assert "línea 14" in texto and "línea 15" not in texto


def test_cafe_real():
    ruta = os.path.join(RAIZ, "memory", "diseno", "adn", "cafe", "dna.json")
    with open(ruta, encoding="utf-8") as f:
        dna = json.load(f)
    texto = design_md(dna)
    assert "#FDF7EA" in texto
    assert "terracota sobre crema" in texto


def _adn_temporal(raiz):
    carpeta = os.path.join(raiz, "memory", "diseno", "adn", "prueba")
    os.makedirs(carpeta)
    with open(os.path.join(carpeta, "dna.json"), "w", encoding="utf-8") as f:
        json.dump(dna_ejemplo(), f, ensure_ascii=False)


def test_main_sin_y_con_escribir(tmp_path):
    _adn_temporal(str(tmp_path))
    assert main(["--slug", "prueba", "--raiz", str(tmp_path)]) == 0
    assert not list(tmp_path.glob("**/DESIGN.md"))
    destino = tmp_path / "memory" / "diseno" / "adn" / "prueba" / "DESIGN.md"
    assert main(["--slug", "prueba", "--raiz", str(tmp_path), "--escribir"]) == 0
    assert destino.read_text(encoding="utf-8") == design_md(dna_ejemplo())


def test_main_todos(tmp_path, capsys):
    _adn_temporal(str(tmp_path))
    assert main(["--todos", "--raiz", str(tmp_path)]) == 0
    assert "Design System" in capsys.readouterr().out


def test_slug_peligroso_rechazado(tmp_path):
    assert main(["--slug", "..", "--raiz", str(tmp_path)]) == 1
    assert main(["--slug", "a/b", "--raiz", str(tmp_path)]) == 1
    assert main(["--slug", "", "--raiz", str(tmp_path)]) == 1
