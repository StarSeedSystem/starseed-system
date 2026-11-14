#!/usr/bin/env python3
"""
scripts/readme/descargas.py

Núcleo puro con E/S inyectable: lee releases de GitHub, elige la última estable
(no prerelease ni draft) y la release canal-pruebas. Genera en español y en inglés
la tabla por sistema con columnas Estable y Prueba, enlaces directos, tamaño legible
y fecha. Reescribe solo el bloque entre <!-- DESCARGAS:INICIO --> y <!-- DESCARGAS:FIN -->
de README.md y README.en.md.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Callable, Optional


@dataclass
class Release:
    tag_name: str
    name: str
    draft: bool
    prerelease: bool
    published_at: Optional[str]
    assets: list[dict[str, Any]]


@dataclass
class PlatformAssets:
    estable: Optional[dict[str, Any]] = None
    prueba: Optional[dict[str, Any]] = None


# Mapeo de patrones de archivo a plataforma
PLATFORM_PATTERNS = [
    (r"StarSeed\.OS.*\.dmg$", "macOS"),
    (r"StarSeed\.OS.*_x64-setup\.exe$", "Windows (instalador)"),
    (r"StarSeed\.OS.*_x64_en-US\.msi$", "Windows (MSI)"),
    (r"StarSeed\.OS.*_amd64\.AppImage$", "Linux (AppImage)"),
    (r"StarSeed\.OS.*_amd64\.deb$", "Linux (deb)"),
    (r"StarSeed\.OS[-_][\d.]+-1\.x86_64\.rpm$", "Linux (rpm)"),
    (r"StarSeed-os.*\.apk$", "Android"),
    (r"StarSeed\.Nexus.*\.dmg$", "StarSeed Nexus"),
    (r"StarSeed\.Nexus.*_x64-setup\.exe$", "StarSeed Nexus"),
    (r"StarSeed\.Cafe.*\.dmg$", "StarSeed Café"),
    (r"StarSeed\.Cafe.*_x64-setup\.exe$", "StarSeed Café"),
]

# Orden de plataformas para la tabla principal
MAIN_PLATFORMS = [
    "macOS",
    "Windows (instalador / MSI)",
    "Linux (AppImage / deb / rpm)",
    "Android",
    "iOS (PWA)",
    "Web",
]

ECOSYSTEM_APPS = ["StarSeed Nexus", "StarSeed Café"]

# Textos por idioma
TEXTS = {
    "es": {
        "table_header": "| Sistema | Estable | Prueba |\n|---|---|---|",
        "test_note": "> 🧪 **Versión de prueba · en desarrollo**: puede fallar; para uso diario, la estable.",
        "details_summary": "<details>\n<summary><strong>Otras apps del ecosistema</strong></summary>\n\n",
        "details_end": "\n</details>",
        "no_test": "—",
        "ios_pwa": "App web instalable",
        "web_url": "https://starseed-os.vercel.app",
        "web_label": "starseed-os.vercel.app",
        "platform_windows": "Windows (instalador / MSI)",
        "platform_linux": "Linux (AppImage / deb / rpm)",
    },
    "en": {
        "table_header": "| System | Stable | Test |\n|---|---|---|",
        "test_note": "> 🧪 **Test version · in development**: may fail; for daily use, choose stable.",
        "details_summary": "<details>\n<summary><strong>Other ecosystem apps</strong></summary>\n\n",
        "details_end": "\n</details>",
        "no_test": "—",
        "ios_pwa": "Installable web app",
        "web_url": "https://starseed-os.vercel.app",
        "web_label": "starseed-os.vercel.app",
        "platform_windows": "Windows (installer / MSI)",
        "platform_linux": "Linux (AppImage / deb / rpm)",
    },
}


def parse_releases(releases_data: list[dict[str, Any]]) -> tuple[Optional[dict[str, Any]], Optional[dict[str, Any]]]:
    """
    Encuentra la última release estable (no draft, no prerelease) y la de canal-pruebas.
    Devuelve (estable, pruebas) donde cada una puede ser None.
    Retorna dicts compatibles con la API de GitHub (con clave 'assets').
    """
    estable: Optional[dict[str, Any]] = None
    pruebas: Optional[dict[str, Any]] = None

    for r in releases_data:
        if r.get("draft", False):
            continue  # Nunca usar drafts

        if r.get("prerelease", False) and r.get("tag_name") == "canal-pruebas":
            if pruebas is None or (r.get("published_at") and pruebas.get("published_at") and r["published_at"] > pruebas["published_at"]):
                pruebas = r
        elif not r.get("prerelease", False):
            if estable is None or (r.get("published_at") and estable.get("published_at") and r["published_at"] > estable["published_at"]):
                estable = r

    return estable, pruebas


def group_assets_by_platform(assets: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    """Agrupa assets por plataforma según patrones de nombre de archivo."""
    grupos: dict[str, list[dict[str, Any]]] = {}

    for asset in assets:
        name = asset.get("name", "")
        matched = False
        for pattern, platform in PLATFORM_PATTERNS:
            if re.search(pattern, name):
                if platform not in grupos:
                    grupos[platform] = []
                grupos[platform].append(asset)
                matched = True
                break
        # Assets que no coinciden se ignoran (p. ej. servidor-local.tar.gz)

    return grupos


def merge_windows_groups(grupos: dict[str, list[dict[str, Any]]]) -> dict[str, list[dict[str, Any]]]:
    """Combina Windows (instalador) y Windows (MSI) en una sola entrada."""
    if "Windows (instalador)" in grupos and "Windows (MSI)" in grupos:
        grupos["Windows (instalador / MSI)"] = (
            grupos.pop("Windows (instalador)") + grupos.pop("Windows (MSI)")
        )
    elif "Windows (instalador)" in grupos:
        grupos["Windows (instalador / MSI)"] = grupos.pop("Windows (instalador)")
    elif "Windows (MSI)" in grupos:
        grupos["Windows (instalador / MSI)"] = grupos.pop("Windows (MSI)")

    # Igual para Linux
    linux_assets = []
    for key in ["Linux (AppImage)", "Linux (deb)", "Linux (rpm)"]:
        if key in grupos:
            linux_assets.extend(grupos.pop(key))
    if linux_assets:
        grupos["Linux (AppImage / deb / rpm)"] = linux_assets

    return grupos


def format_size(size_bytes: int) -> str:
    """Formatea bytes en unidades legibles (KB, MB, GB) con una decimal."""
    if size_bytes == 0:
        return "0 B"
    units = ["B", "KB", "MB", "GB", "TB"]
    i = 0
    size = float(size_bytes)
    while size >= 1024 and i < len(units) - 1:
        size /= 1024
        i += 1
    if i == 0:
        return f"{int(size)} {units[i]}"
    return f"{size:.1f} {units[i]}".replace(".", ",")


def format_date(iso_date: Optional[str], lang: str) -> str:
    """Formatea fecha ISO en español o inglés."""
    if not iso_date:
        return "—"
    try:
        dt = datetime.fromisoformat(iso_date.replace("Z", "+00:00"))
    except ValueError:
        return iso_date[:10] if len(iso_date) >= 10 else iso_date

    if lang == "es":
        months = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]
        return f"{dt.day} {months[dt.month - 1]} {dt.year}"
    else:
        return dt.strftime("%b %d, %Y")


def generate_download_link(asset: dict[str, Any], lang: str, is_stable: bool) -> str:
    """Genera el markdown del enlace de descarga con tamaño y fecha."""
    name = asset.get("name", "")
    size = asset.get("size", 0)
    url = asset.get("browser_download_url", "")
    date = asset.get("updated_at") or asset.get("created_at")

    size_str = format_size(size)
    date_str = format_date(date, lang)

    if is_stable:
        return f"[`{name}`]({url}) · {size_str} · {date_str}"
    else:
        # Extraer versión de prueba del nombre
        test_version = ""
        match = re.search(r"(prueba\.\d+)", name)
        if match:
            test_version = match.group(1)
        else:
            match = re.search(r"([\d.]+-prueba\.\d+)", name)
            if match:
                test_version = match.group(1)
        label = f"🧪 {test_version}" if test_version else "🧪 prueba"
        return f"[`{label}`]({url}) · {size_str} · {date_str}"


def generate_download_row(asset: dict[str, Any], lang: str, is_stable: bool) -> str:
    """Genera una fila de descarga (alias para generate_download_link para compatibilidad con tests)."""
    return generate_download_link(asset, lang, is_stable)


def generate_ios_row(lang: str) -> tuple[str, str]:
    """Genera filas para iOS (PWA) - siempre igual, sin binario."""
    texts = TEXTS[lang]
    stable = texts["ios_pwa"]
    test = texts["no_test"]
    return stable, test


def generate_web_row(lang: str) -> tuple[str, str]:
    """Genera filas para Web - siempre igual."""
    texts = TEXTS[lang]
    stable = f"[{texts['web_label']}]({texts['web_url']})"
    test = texts["no_test"]
    return stable, test


def build_platform_rows(
    estable_grupos: dict[str, list[dict[str, Any]]],
    pruebas_grupos: Optional[dict[str, list[dict[str, Any]]]],
    lang: str,
) -> list[tuple[str, str, str]]:
    """Construye filas (plataforma, estable, prueba) para la tabla principal."""
    rows = []
    texts = TEXTS[lang]

    # Mapeo de clave interna -> nombre mostrado por idioma
    platform_display = {
        "macOS": "macOS",
        "Windows (instalador / MSI)": texts.get("platform_windows", "Windows (installer / MSI)"),
        "Linux (AppImage / deb / rpm)": texts.get("platform_linux", "Linux (AppImage / deb / rpm)"),
        "Android": "Android",
        "iOS (PWA)": "iOS (PWA)",
        "Web": "Web",
    }

    for platform_key in MAIN_PLATFORMS:
        display_name = platform_display.get(platform_key, platform_key)

        if platform_key == "iOS (PWA)":
            stable, test = generate_ios_row(lang)
            rows.append((display_name, stable, test))
        elif platform_key == "Web":
            stable, test = generate_web_row(lang)
            rows.append((display_name, stable, test))
        else:
            # Buscar asset estable
            estable_assets = estable_grupos.get(platform_key, [])
            estable_link = texts["no_test"]
            if estable_assets:
                estable_link = generate_download_link(estable_assets[0], lang, True)

            # Buscar asset de prueba
            test_link = texts["no_test"]
            if pruebas_grupos:
                prueba_assets = pruebas_grupos.get(platform_key, [])
                if prueba_assets:
                    test_link = generate_download_link(prueba_assets[0], lang, False)

            rows.append((display_name, estable_link, test_link))

    return rows


def build_ecosystem_rows(
    estable_grupos: dict[str, list[dict[str, Any]]],
    lang: str,
) -> list[tuple[str, str]]:
    """Construye filas para el <details> de otras apps del ecosistema."""
    rows = []
    for app in ECOSYSTEM_APPS:
        assets = estable_grupos.get(app, [])
        if assets:
            # Mostrar macOS y Windows si existen
            links = [generate_download_link(a, lang, True) for a in assets]
            rows.append((app, " · ".join(links)))
    return rows


def generate_download_block(
    estable: Optional[dict[str, Any]],
    pruebas: Optional[dict[str, Any]],
    lang: str,
) -> str:
    """Genera el bloque completo de descargas en markdown."""
    if not estable:
        return "⚠️ No hay release estable disponible."

    texts = TEXTS[lang]

    # Agrupar assets
    estable_grupos = merge_windows_groups(group_assets_by_platform(estable.get("assets", [])))
    pruebas_grupos = merge_windows_groups(group_assets_by_platform(pruebas.get("assets", []))) if pruebas else None

    # Construir tabla principal
    lines = [texts["table_header"]]
    for platform, stable, test in build_platform_rows(estable_grupos, pruebas_grupos, lang):
        lines.append(f"| {platform} | {stable} | {test} |")

    # Nota de prueba
    lines.append("")
    lines.append(texts["test_note"])

    # Details para apps del ecosistema
    ecosystem_rows = build_ecosystem_rows(estable_grupos, lang)
    if ecosystem_rows:
        lines.append("")
        lines.append(texts["details_summary"])
        for app, links in ecosystem_rows:
            lines.append(f"**{app}**: {links}")
        lines.append(texts["details_end"])

    return "\n".join(lines)


def update_readme_block(readme_content: str, new_block: str) -> str:
    """Reemplaza solo el bloque entre <!-- DESCARGAS:INICIO --> y <!-- DESCARGAS:FIN -->."""
    pattern = r"(<!-- DESCARGAS:INICIO -->\n)(.*?)(\n<!-- DESCARGAS:FIN -->)"
    replacement = rf"\1{new_block}\3"

    new_content, count = re.subn(pattern, replacement, readme_content, flags=re.DOTALL)
    if count == 0:
        raise ValueError("Marcadores DESCARGAS:INICIO / DESCARGAS:FIN no encontrados en el README")
    return new_content


# Funciones de E/S inyectables para testing
def read_json_file(path: Path) -> list[dict[str, Any]]:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def read_text_file(path: Path) -> str:
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def write_text_file(path: Path, content: str) -> None:
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)


def fetch_releases_from_github(owner: str, repo: str, token: Optional[str] = None) -> list[dict[str, Any]]:
    """Obtiene releases de la API de GitHub (no usado en tests, solo en producción)."""
    import urllib.request
    import urllib.error

    url = f"https://api.github.com/repos/{owner}/{repo}/releases?per_page=100"
    headers = {"Accept": "application/vnd.github+json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            return json.load(response)
    except urllib.error.HTTPError as e:
        print(f"Error fetching releases: {e}", file=sys.stderr)
        return []


def main() -> int:
    parser = argparse.ArgumentParser(description="Actualiza bloque de descargas en README")
    parser.add_argument("--fixture", type=Path, help="Archivo JSON con releases (para testing)")
    parser.add_argument("--owner", default="StarSeedSystem", help="Owner del repo GitHub")
    parser.add_argument("--repo", default="starseed-system", help="Nombre del repo GitHub")
    parser.add_argument("--token", help="GitHub token (opcional, para rate limit)")
    parser.add_argument("--readme-es", type=Path, default=Path("README.md"), help="README en español")
    parser.add_argument("--readme-en", type=Path, default=Path("README.en.md"), help="README en inglés")
    parser.add_argument("--dry-run", action="store_true", help="Solo muestra el resultado, no escribe")
    args = parser.parse_args()

    # Obtener releases
    if args.fixture:
        releases_data = read_json_file(args.fixture)
    else:
        releases_data = fetch_releases_from_github(args.owner, args.repo, args.token)

    if not releases_data:
        print("No se obtuvieron releases", file=sys.stderr)
        return 1

    # Parsear y seleccionar
    estable, pruebas = parse_releases(releases_data)

    if not estable:
        print("No se encontró release estable", file=sys.stderr)
        return 1

    # Generar bloques
    block_es = generate_download_block(estable, pruebas, "es")
    block_en = generate_download_block(estable, pruebas, "en")

    if args.dry_run:
        print("=== README.md (español) ===")
        print(block_es)
        print("\n=== README.en.md (inglés) ===")
        print(block_en)
        return 0

    # Leer READMEs actuales
    try:
        readme_es_content = read_text_file(args.readme_es)
        readme_en_content = read_text_file(args.readme_en)
    except FileNotFoundError as e:
        print(f"Archivo no encontrado: {e}", file=sys.stderr)
        return 1

    # Actualizar bloques
    try:
        new_readme_es = update_readme_block(readme_es_content, block_es)
        new_readme_en = update_readme_block(readme_en_content, block_en)
    except ValueError as e:
        print(f"Error actualizando README: {e}", file=sys.stderr)
        return 1

    # Escribir si cambió
    changed = False
    if new_readme_es != readme_es_content:
        write_text_file(args.readme_es, new_readme_es)
        print(f"Actualizado: {args.readme_es}")
        changed = True
    if new_readme_en != readme_en_content:
        write_text_file(args.readme_en, new_readme_en)
        print(f"Actualizado: {args.readme_en}")
        changed = True

    if not changed:
        print("Sin cambios en los bloques de descargas")

    return 0


if __name__ == "__main__":
    sys.exit(main())