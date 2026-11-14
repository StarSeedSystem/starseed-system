#!/usr/bin/env python3
"""
Validador de recursos SVG para la portada del README (RDM1113).

Comprueba:
- SVG seguro para GitHub: sin scripts, sin foreignObject, sin fuentes externas
- role="img" y <title> presentes
- Peso < 150 KB
- Colores pertenecen a tokens.json
- Dimensiones correctas (héroe 1280×400, pilares 200×200, etc.)
"""

import json
import os
import re
import sys
from pathlib import Path
from xml.etree import ElementTree as ET

TOKENS_PATH = Path(__file__).parent.parent.parent / "memory" / "diseno" / "estudio-audiovisual" / "assets" / "tokens.json"
ASSETS_DIR = Path(__file__).parent.parent.parent / "assets" / "readme"

TOKEN_COLORS = set()
TOKEN_GRADIENTS = set()

EXPECTED_SPECS = {
    "heroe-oscuro.svg": {"width": 1280, "height": 400, "max_kb": 150},
    "heroe-claro.svg": {"width": 1280, "height": 400, "max_kb": 150},
    "como-funciona.svg": {"width": 800, "height": 720, "max_kb": 150},
    "pilares-democracia.svg": {"width": 200, "height": 200, "max_kb": 150},
    "pilares-tecnologia.svg": {"width": 200, "height": 200, "max_kb": 150},
    "pilares-procomun.svg": {"width": 200, "height": 200, "max_kb": 150},
}

SECCION_PREFIX = "seccion-"
SECCION_SPEC = {"width": 800, "height": 80, "max_kb": 150}


def load_token_colors():
    """Carga colores válidos desde tokens.json"""
    global TOKEN_COLORS, TOKEN_GRADIENTS
    with open(TOKENS_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)
    tokens = data.get("tokens", {})
    for key, value in tokens.items():
        if isinstance(value, str) and value.startswith("#"):
            TOKEN_COLORS.add(value.upper())
        elif isinstance(value, str) and ("gradient" in key.lower() or "fondo" in key.lower()):
            TOKEN_GRADIENTS.add(key)


def check_file_size(svg_path: Path, max_kb: int) -> tuple[bool, str]:
    """Verifica que el archivo pesa menos de max_kb KB"""
    size_kb = svg_path.stat().st_size / 1024
    if size_kb > max_kb:
        return False, f"Peso {size_kb:.1f} KB > {max_kb} KB"
    return True, f"OK ({size_kb:.1f} KB)"


def check_dimensions(svg_path: Path, expected_w: int, expected_h: int) -> tuple[bool, str]:
    """Verifica viewBox o width/height coinciden con lo esperado"""
    try:
        tree = ET.parse(svg_path)
        root = tree.getroot()
        vb = root.get("viewBox", "")
        w = root.get("width", "")
        h = root.get("height", "")

        if vb:
            parts = vb.split()
            if len(parts) == 4:
                vb_w, vb_h = float(parts[2]), float(parts[3])
                if abs(vb_w - expected_w) > 1 or abs(vb_h - expected_h) > 1:
                    return False, f"viewBox {vb_w}×{vb_h} ≠ {expected_w}×{expected_h}"
        elif w and h:
            if str(expected_w) not in w or str(expected_h) not in h:
                return False, f"width/height {w}×{h} ≠ {expected_w}×{expected_h}"
        return True, "OK"
    except ET.ParseError as e:
        return False, f"XML inválido: {e}"


def check_github_safety(svg_path: Path) -> tuple[bool, list[str]]:
    """Verifica que el SVG es seguro para GitHub"""
    errors = []
    try:
        tree = ET.parse(svg_path)
        root = tree.getroot()

        for elem in root.iter():
            tag = elem.tag.split("}")[-1].lower()

            if tag == "script":
                errors.append("Contiene <script> (prohibido en GitHub)")
            elif tag == "foreignobject":
                errors.append("Contiene <foreignObject> (prohibido en GitHub)")
            elif tag == "style":
                text = elem.text or ""
                if "@font-face" in text or "font-family:" in text:
                    if not re.search(r"font-family:\s*['\"]?(system-ui|sans-serif|serif|monospace|cursive|fantasy)", text):
                        errors.append("Posible fuente externa en <style>")

            href = elem.get("{http://www.w3.org/1999/xlink}href") or elem.get("href") or ""
            if href and (href.startswith("http://") or href.startswith("https://")):
                if not href.startswith("data:"):
                    errors.append(f"Recurso externo: {href[:80]}")

        role = root.get("role", "")
        if role != "img":
            errors.append(f'Falta role="img" (tiene: {role or "nada"})')

        title_elem = root.find(".//{http://www.w3.org/2000/svg}title")
        if title_elem is None or not title_elem.text:
            errors.append("Falta <title> descriptivo")

    except ET.ParseError as e:
        errors.append(f"XML inválido: {e}")

    return len(errors) == 0, errors


def extract_colors_from_svg(svg_path: Path) -> set[str]:
    """Extrae todos los colores hex del SVG"""
    colors = set()
    try:
        tree = ET.parse(svg_path)
        for elem in tree.getroot().iter():
            for attr, value in elem.attrib.items():
                for match in re.finditer(r"#[0-9A-Fa-f]{6}(?:[0-9A-Fa-f]{2})?", value):
                    colors.add(match.group().upper())
    except ET.ParseError:
        pass
    return colors


def check_colors_valid(colors: set[str]) -> tuple[bool, list[str]]:
    """Verifica que todos los colores están en tokens.json"""
    invalid = []
    for color in colors:
        if color not in TOKEN_COLORS:
            invalid.append(color)
    return len(invalid) == 0, invalid


def validate_svg(svg_path: Path, spec: dict) -> tuple[bool, list[str]]:
    """Valida un SVG completo según su especificación"""
    all_errors = []

    ok, msg = check_file_size(svg_path, spec["max_kb"])
    if not ok:
        all_errors.append(msg)

    ok, msg = check_dimensions(svg_path, spec["width"], spec["height"])
    if not ok:
        all_errors.append(msg)

    ok, errors = check_github_safety(svg_path)
    all_errors.extend(errors)

    colors = extract_colors_from_svg(svg_path)
    ok, invalid = check_colors_valid(colors)
    if not ok:
        all_errors.append(f"Colores no tokenizados: {', '.join(invalid)}")

    return len(all_errors) == 0, all_errors


def main():
    load_token_colors()
    print(f"Colores tokenizados cargados: {len(TOKEN_COLORS)}")
    print(f"Tokens de gradiente/fondo: {len(TOKEN_GRADIENTS)}")
    print()

    all_ok = True
    results = []

    for filename, spec in EXPECTED_SPECS.items():
        svg_path = ASSETS_DIR / filename
        if not svg_path.exists():
            results.append((filename, False, [f"Archivo no encontrado: {svg_path}"]))
            all_ok = False
            continue

        ok, errors = validate_svg(svg_path, spec)
        results.append((filename, ok, errors))
        if not ok:
            all_ok = False

    seccion_dir = ASSETS_DIR / "secciones"
    if seccion_dir.exists():
        for svg_path in sorted(seccion_dir.glob("*.svg")):
            ok, errors = validate_svg(svg_path, SECCION_SPEC)
            results.append((svg_path.name, ok, errors))
            if not ok:
                all_ok = False

    print("=" * 70)
    for filename, ok, errors in results:
        status = "✅ PASS" if ok else "❌ FAIL"
        print(f"{status}  {filename}")
        for err in errors:
            print(f"       → {err}")

    print("=" * 70)
    if all_ok:
        print("TODOS LOS RECURSOS VALIDADOS CORRECTAMENTE")
        return 0
    else:
        print("ALGUNOS RECURSOS TIENEN ERRORES")
        return 1


if __name__ == "__main__":
    sys.exit(main())