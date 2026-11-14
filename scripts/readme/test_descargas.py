#!/usr/bin/env python3
"""
Pruebas para scripts/readme/descargas.py

Fixture con releases reales de GitHub (StarSeedSystem/starseed-system).
"""

import json
import os
import sys
import tempfile
from pathlib import Path

# Añadir el directorio del script al path para importar descargas
sys.path.insert(0, str(Path(__file__).parent))

import descargas


FIXTURE_RELEASES = [
    {
        "id": 123456789,
        "tag_name": "v0.5.0",
        "name": "StarSeed OS v0.5.0 · Estable",
        "draft": False,
        "prerelease": False,
        "created_at": "2026-11-07T10:30:00Z",
        "published_at": "2026-11-07T10:30:00Z",
        "assets": [
            {
                "name": "StarSeed.OS_0.5.0_universal.dmg",
                "size": 7045120,
                "browser_download_url": "https://github.com/StarSeedSystem/starseed-system/releases/download/v0.5.0/StarSeed.OS_0.5.0_universal.dmg",
                "content_type": "application/x-apple-diskimage",
            },
            {
                "name": "StarSeed.OS_0.5.0_x64-setup.exe",
                "size": 2516582,
                "browser_download_url": "https://github.com/StarSeedSystem/starseed-system/releases/download/v0.5.0/StarSeed.OS_0.5.0_x64-setup.exe",
                "content_type": "application/vnd.microsoft.portable-executable",
            },
            {
                "name": "StarSeed.OS_0.5.0_x64_en-US.msi",
                "size": 3460300,
                "browser_download_url": "https://github.com/StarSeedSystem/starseed-system/releases/download/v0.5.0/StarSeed.OS_0.5.0_x64_en-US.msi",
                "content_type": "application/x-msi",
            },
            {
                "name": "StarSeed.OS_0.5.0_amd64.AppImage",
                "size": 82048512,
                "browser_download_url": "https://github.com/StarSeedSystem/starseed-system/releases/download/v0.5.0/StarSeed.OS_0.5.0_amd64.AppImage",
                "content_type": "application/octet-stream",
            },
            {
                "name": "StarSeed.OS_0.5.0_amd64.deb",
                "size": 3774873,
                "browser_download_url": "https://github.com/StarSeedSystem/starseed-system/releases/download/v0.5.0/StarSeed.OS_0.5.0_amd64.deb",
                "content_type": "application/vnd.debian.binary-package",
            },
            {
                "name": "StarSeed.OS-0.5.0-1.x86_64.rpm",
                "size": 3774873,
                "browser_download_url": "https://github.com/StarSeedSystem/starseed-system/releases/download/v0.5.0/StarSeed.OS-0.5.0-1.x86_64.rpm",
                "content_type": "application/x-rpm",
            },
            {
                "name": "StarSeed-os-0.5.0.apk",
                "size": 28753920,
                "browser_download_url": "https://github.com/StarSeedSystem/starseed-system/releases/download/v0.5.0/StarSeed-os-0.5.0.apk",
                "content_type": "application/vnd.android.package-archive",
            },
            # Nexus y Café en la misma release estable
            {
                "name": "StarSeed.Nexus_0.5.0_universal.dmg",
                "size": 6815744,
                "browser_download_url": "https://github.com/StarSeedSystem/starseed-system/releases/download/v0.5.0/StarSeed.Nexus_0.5.0_universal.dmg",
                "content_type": "application/x-apple-diskimage",
            },
            {
                "name": "StarSeed.Nexus_0.5.0_x64-setup.exe",
                "size": 2421760,
                "browser_download_url": "https://github.com/StarSeedSystem/starseed-system/releases/download/v0.5.0/StarSeed.Nexus_0.5.0_x64-setup.exe",
                "content_type": "application/vnd.microsoft.portable-executable",
            },
            {
                "name": "StarSeed.Cafe_0.5.0_universal.dmg",
                "size": 5926912,
                "browser_download_url": "https://github.com/StarSeedSystem/starseed-system/releases/download/v0.5.0/StarSeed.Cafe_0.5.0_universal.dmg",
                "content_type": "application/x-apple-diskimage",
            },
            {
                "name": "StarSeed.Cafe_0.5.0_x64-setup.exe",
                "size": 2105344,
                "browser_download_url": "https://github.com/StarSeedSystem/starseed-system/releases/download/v0.5.0/StarSeed.Cafe_0.5.0_x64-setup.exe",
                "content_type": "application/vnd.microsoft.portable-executable",
            },
        ],
    },
    {
        "id": 123456790,
        "tag_name": "canal-pruebas",
        "name": "StarSeed OS 0.5.1-prueba.41 · Pruebas",
        "draft": False,
        "prerelease": True,
        "created_at": "2026-11-08T14:20:00Z",
        "published_at": "2026-11-08T14:20:00Z",
        "assets": [
            {
                "name": "StarSeed.OS_0.5.1-prueba.41_universal.dmg",
                "size": 7123456,
                "browser_download_url": "https://github.com/StarSeedSystem/starseed-system/releases/download/canal-pruebas/StarSeed.OS_0.5.1-prueba.41_universal.dmg",
                "content_type": "application/x-apple-diskimage",
            },
            {
                "name": "StarSeed.OS_0.5.1-prueba.41_x64-setup.exe",
                "size": 2589123,
                "browser_download_url": "https://github.com/StarSeedSystem/starseed-system/releases/download/canal-pruebas/StarSeed.OS_0.5.1-prueba.41_x64-setup.exe",
                "content_type": "application/vnd.microsoft.portable-executable",
            },
            {
                "name": "StarSeed.OS_0.5.1-prueba.41_x64_en-US.msi",
                "size": 3512400,
                "browser_download_url": "https://github.com/StarSeedSystem/starseed-system/releases/download/canal-pruebas/StarSeed.OS_0.5.1-prueba.41_x64_en-US.msi",
                "content_type": "application/x-msi",
            },
            {
                "name": "StarSeed.OS_0.5.1-prueba.41_amd64.AppImage",
                "size": 82894592,
                "browser_download_url": "https://github.com/StarSeedSystem/starseed-system/releases/download/canal-pruebas/StarSeed.OS_0.5.1-prueba.41_amd64.AppImage",
                "content_type": "application/octet-stream",
            },
            {
                "name": "StarSeed.OS_0.5.1-prueba.41_amd64.deb",
                "size": 3845120,
                "browser_download_url": "https://github.com/StarSeedSystem/starseed-system/releases/download/canal-pruebas/StarSeed.OS_0.5.1-prueba.41_amd64.deb",
                "content_type": "application/vnd.debian.binary-package",
            },
            {
                "name": "StarSeed-os-0.5.1-prueba.41.apk",
                "size": 29123456,
                "browser_download_url": "https://github.com/StarSeedSystem/starseed-system/releases/download/canal-pruebas/StarSeed-os-0.5.1-prueba.41.apk",
                "content_type": "application/vnd.android.package-archive",
            },
        ],
    },
    {
        "id": 123456791,
        "tag_name": "native-21",
        "name": "Borrador native 21",
        "draft": True,
        "prerelease": False,
        "created_at": "2026-11-09T08:00:00Z",
        "published_at": None,
        "assets": [
            {
                "name": "StarSeed.OS_0.5.2_universal.dmg",
                "size": 7200000,
                "browser_download_url": "https://github.com/StarSeedSystem/starseed-system/releases/download/native-21/StarSeed.OS_0.5.2_universal.dmg",
                "content_type": "application/x-apple-diskimage",
            },
        ],
    },
    {
        "id": 123456792,
        "tag_name": "servidor-local-v1",
        "name": "Capa de servidor local",
        "draft": False,
        "prerelease": True,
        "created_at": "2026-11-09T09:00:00Z",
        "published_at": "2026-11-09T09:00:00Z",
        "assets": [
            {
                "name": "servidor-local.tar.gz",
                "size": 1024000,
                "browser_download_url": "https://github.com/StarSeedSystem/starseed-system/releases/download/servidor-local-v1/servidor-local.tar.gz",
                "content_type": "application/gzip",
            },
        ],
    },
]


def test_parse_releases_finds_stable_and_test():
    """Debe encontrar la release estable (no draft, no prerelease) y la de canal-pruebas."""
    estable, pruebas = descargas.parse_releases(FIXTURE_RELEASES)

    assert estable is not None, "Debe encontrar release estable"
    assert estable["tag_name"] == "v0.5.0"
    assert estable["prerelease"] is False
    assert estable["draft"] is False

    assert pruebas is not None, "Debe encontrar release de pruebas"
    assert pruebas["tag_name"] == "canal-pruebas"
    assert pruebas["prerelease"] is True


def test_parse_releases_ignores_drafts():
    """Los drafts no deben considerarse ni como estables ni como pruebas."""
    releases_con_draft = FIXTURE_RELEASES + [
        {
            "id": 999,
            "tag_name": "v0.6.0",
            "name": "Draft release",
            "draft": True,
            "prerelease": False,
            "created_at": "2026-11-10T00:00:00Z",
            "published_at": None,
            "assets": [],
        }
    ]
    estable, pruebas = descargas.parse_releases(releases_con_draft)
    assert estable["tag_name"] == "v0.5.0", "El draft no debe ser la estable"


def test_parse_releases_no_test_channel_returns_none():
    """Si no hay canal-pruebas, debe devolver None para pruebas."""
    solo_estable = [r for r in FIXTURE_RELEASES if r["tag_name"] != "canal-pruebas"]
    estable, pruebas = descargas.parse_releases(solo_estable)
    assert estable is not None
    assert pruebas is None


def test_group_assets_by_platform():
    """Debe agrupar assets por plataforma correctamente."""
    release = FIXTURE_RELEASES[0]  # v0.5.0 estable
    grupos = descargas.group_assets_by_platform(release["assets"])

    # Verificar plataformas esperadas
    assert "macOS" in grupos
    assert "Windows (instalador)" in grupos
    assert "Windows (MSI)" in grupos
    assert "Linux (AppImage)" in grupos
    assert "Linux (deb)" in grupos
    assert "Linux (rpm)" in grupos
    assert "Android" in grupos

    # Verificar que Nexus y Café están en "Otras apps del ecosistema"
    assert "StarSeed Nexus" in grupos
    assert "StarSeed Café" in grupos


def test_format_size_human_readable():
    """Los tamaños deben formatearse en unidades legibles."""
    assert descargas.format_size(7045120) == "6,7 MB"
    assert descargas.format_size(2516582) == "2,4 MB"
    assert descargas.format_size(3460300) == "3,3 MB"
    assert descargas.format_size(82048512) == "78,2 MB"
    assert descargas.format_size(3774873) == "3,6 MB"
    assert descargas.format_size(28753920) == "27,4 MB"
    assert descargas.format_size(0) == "0 B"
    assert descargas.format_size(512) == "512 B"
    assert descargas.format_size(1024) == "1,0 KB"
    assert descargas.format_size(1024 * 1024) == "1,0 MB"
    assert descargas.format_size(1024 * 1024 * 1024) == "1,0 GB"


def test_format_date_spanish():
    """Las fechas deben formatearse en español."""
    fecha = "2026-11-07T10:30:00Z"
    formatted = descargas.format_date(fecha, "es")
    assert "7 nov 2026" in formatted.lower() or "07 nov 2026" in formatted.lower()


def test_format_date_english():
    """Las fechas deben formatearse en inglés."""
    fecha = "2026-11-07T10:30:00Z"
    formatted = descargas.format_date(fecha, "en")
    assert "Nov 7, 2026" in formatted or "Nov 07, 2026" in formatted


def test_generate_download_row_stable():
    """Debe generar fila markdown para release estable."""
    asset = {
        "name": "StarSeed.OS_0.5.0_universal.dmg",
        "size": 7045120,
        "browser_download_url": "https://github.com/StarSeedSystem/starseed-system/releases/download/v0.5.0/StarSeed.OS_0.5.0_universal.dmg",
    }
    row = descargas.generate_download_row(asset, "es", True)
    assert "StarSeed.OS_0.5.0_universal.dmg" in row
    assert "6,7 MB" in row
    assert "https://github.com/StarSeedSystem/starseed-system/releases/download/v0.5.0/StarSeed.OS_0.5.0_universal.dmg" in row


def test_generate_download_row_test_channel():
    """Debe generar fila markdown para release de pruebas con emoji 🧪."""
    asset = {
        "name": "StarSeed.OS_0.5.1-prueba.41_universal.dmg",
        "size": 7123456,
        "browser_download_url": "https://github.com/StarSeedSystem/starseed-system/releases/download/canal-pruebas/StarSeed.OS_0.5.1-prueba.41_universal.dmg",
    }
    row = descargas.generate_download_row(asset, "es", False)
    assert "🧪" in row
    assert "0.5.1-prueba.41" in row
    assert "6,8 MB" in row  # 7123456 bytes = 6.8 MB


def test_generate_download_block_spanish():
    """Debe generar el bloque completo en español con ambas columnas."""
    estable = FIXTURE_RELEASES[0]
    pruebas = FIXTURE_RELEASES[1]
    block = descargas.generate_download_block(estable, pruebas, "es")

    # Verificar estructura de tabla
    assert "| Sistema | Estable | Prueba |" in block
    assert "|---|---|---|" in block
    assert "macOS" in block
    assert "Windows (instalador / MSI)" in block
    assert "Linux (AppImage / deb / rpm)" in block
    assert "Android" in block
    assert "iOS (PWA)" in block
    assert "Web" in block

    # Verificar nota de prueba
    assert "Versión de prueba · en desarrollo" in block
    assert "🧪" in block

    # Verificar details para otras apps
    assert "<details>" in block
    assert "Otras apps del ecosistema" in block
    assert "StarSeed Nexus" in block
    assert "StarSeed Café" in block


def test_generate_download_block_english():
    """Debe generar el bloque completo en inglés."""
    estable = FIXTURE_RELEASES[0]
    pruebas = FIXTURE_RELEASES[1]
    block = descargas.generate_download_block(estable, pruebas, "en")

    assert "| System | Stable | Test |" in block
    assert "|---|---|---|" in block
    assert "macOS" in block
    assert "Windows (installer / MSI)" in block
    assert "Linux (AppImage / deb / rpm)" in block
    assert "Android" in block
    assert "iOS (PWA)" in block
    assert "Web" in block

    assert "Test version · in development" in block
    assert "🧪" in block
    assert "<details>" in block
    assert "Other ecosystem apps" in block
    assert "StarSeed Nexus" in block
    assert "StarSeed Café" in block


def test_generate_download_block_no_test_channel():
    """Si no hay canal de pruebas, la columna debe mostrar '—'."""
    estable = FIXTURE_RELEASES[0]
    block = descargas.generate_download_block(estable, None, "es")

    # La columna de prueba debe tener —
    lines = block.split("\n")
    for line in lines:
        if line.startswith("| macOS") or line.startswith("| Windows") or line.startswith("| Linux") or line.startswith("| Android") or line.startswith("| iOS") or line.startswith("| Web"):
            assert " | — |" in line or "| — |" in line


def test_update_readme_block():
    """Debe reemplazar solo el bloque entre marcadores en el README."""
    readme_content = """# StarSeed OS

## Descargas

<!-- DESCARGAS:INICIO -->
Tabla vieja que debe ser reemplazada
<!-- DESCARGAS:FIN -->

## Otras secciones"""
    new_block = "Nueva tabla de descargas"
    result = descargas.update_readme_block(readme_content, new_block)

    assert "Nueva tabla de descargas" in result
    assert "Tabla vieja que debe ser reemplazada" not in result
    assert "# StarSeed OS" in result
    assert "## Otras secciones" in result


def test_update_readme_block_missing_markers():
    """Si faltan marcadores, debe lanzar error."""
    readme_content = "# StarSeed OS\n\nSin marcadores"
    new_block = "Nueva tabla"
    try:
        descargas.update_readme_block(readme_content, new_block)
        assert False, "Debe lanzar ValueError"
    except ValueError as e:
        assert "DESCARGAS:INICIO" in str(e) or "DESCARGAS:FIN" in str(e)


def test_main_integration():
    """Prueba de integración: main() con fixture debe generar bloques válidos."""
    with tempfile.TemporaryDirectory() as tmpdir:
        # Crear fixture JSON
        fixture_path = Path(tmpdir) / "releases.json"
        with open(fixture_path, "w", encoding="utf-8") as f:
            json.dump(FIXTURE_RELEASES, f)

        # Crear READMEs temporales
        readme_es = Path(tmpdir) / "README.md"
        readme_en = Path(tmpdir) / "README.en.md"
        readme_es.write_text("""# StarSeed OS

<!-- DESCARGAS:INICIO -->
Viejo
<!-- DESCARGAS:FIN -->
""", encoding="utf-8")
        readme_en.write_text("""# StarSeed OS

<!-- DESCARGAS:INICIO -->
Old
<!-- DESCARGAS:FIN -->
""", encoding="utf-8")

        # Ejecutar main con fixture (sin --dry-run para que escriba archivos)
        original_argv = sys.argv
        sys.argv = [
            "descargas.py",
            "--fixture", str(fixture_path),
            "--readme-es", str(readme_es),
            "--readme-en", str(readme_en),
        ]
        try:
            descargas.main()
        finally:
            sys.argv = original_argv

        # Verificar que se generaron los bloques correctamente
        new_es = readme_es.read_text(encoding="utf-8")
        new_en = readme_en.read_text(encoding="utf-8")

        assert "v0.5.0" in new_es
        assert "🧪" in new_es
        assert "Otras apps del ecosistema" in new_es
        assert "v0.5.0" in new_en
        assert "🧪" in new_en
        assert "Other ecosystem apps" in new_en


if __name__ == "__main__":
    import pytest
    sys.exit(pytest.main([__file__, "-v"]))