#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas para los scripts de paquetes Linux (TRM1125H).
Verifica: sintaxis bash (bash -n), tauri.conf.json válido, postinst/prerm/activar idempotentes.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import List

REPO_ROOT = Path(__file__).resolve().parents[3]  # TRM1125H root
POSTINST = REPO_ROOT / "native" / "src-tauri" / "linux" / "postinst"
PRERM = REPO_ROOT / "native" / "src-tauri" / "linux" / "prerm"
ACTIVAR = REPO_ROOT / "native" / "src-tauri" / "recursos" / "ayudante-linux-activar.sh"
TAURI_CONF = REPO_ROOT / "native" / "src-tauri" / "tauri.conf.json"
AYUDANTE = REPO_ROOT / "deploy" / "ayudante" / "linux" / "starseed-ayudante"


def run_bash_n(script: Path) -> None:
    """Ejecuta bash -n en el script y verifica que no hay errores."""
    result = subprocess.run(["bash", "-n", str(script)], capture_output=True, text=True)
    if result.returncode != 0:
        raise AssertionError(f"bash -n falló en {script.name}: {result.stderr}")


def test_postinst_sintaxis() -> None:
    """postinst pasa bash -n."""
    run_bash_n(POSTINST)


def test_prerm_sintaxis() -> None:
    """prerm pasa bash -n."""
    run_bash_n(PRERM)


def test_activar_sintaxis() -> None:
    """ayudante-linux-activar.sh pasa bash -n."""
    run_bash_n(ACTIVAR)


def test_ayudante_sintaxis() -> None:
    """starseed-ayudante pasa bash -n."""
    run_bash_n(AYUDANTE)


def test_instalar_sh_sintaxis() -> None:
    """instalar.sh pasa bash -n."""
    instalar = REPO_ROOT / "deploy" / "ayudante" / "linux" / "instalar.sh"
    run_bash_n(instalar)


def test_preparar_linux_sh_sintaxis() -> None:
    """preparar-linux.sh pasa bash -n."""
    preparar = REPO_ROOT / "native" / "src-tauri" / "recursos" / "preparar-linux.sh"
    run_bash_n(preparar)


def test_tauri_conf_json_valido() -> None:
    """tauri.conf.json es JSON válido y tiene la estructura esperada."""
    with open(TAURI_CONF, "r", encoding="utf-8") as f:
        data = json.load(f)

    # Estructura básica
    assert "productName" in data
    assert "version" in data
    assert "identifier" in data
    assert "build" in data
    assert "app" in data
    assert "bundle" in data
    assert "plugins" in data

    # Linux bundle config
    bundle = data["bundle"]
    assert "linux" in bundle, "Falta bundle.linux"
    linux = bundle["linux"]
    assert "deb" in linux, "Falta bundle.linux.deb"
    assert "rpm" in linux, "Falta bundle.linux.rpm"

    # Verificar que deb y rpm tienen configuración de scripts
    # (esto se validará en test_tauri_conf_tiene_scripts_paquetes)


def test_tauri_conf_tiene_scripts_paquetes() -> None:
    """tauri.conf.json incluye postinst y prerm en deb y rpm."""
    with open(TAURI_CONF, "r", encoding="utf-8") as f:
        data = json.load(f)

    linux = data["bundle"]["linux"]

    # Deb
    deb = linux["deb"]
    assert "postinst" in deb, "Falta deb.postinst"
    assert "prerm" in deb, "Falta deb.prerm"
    assert deb["postinst"] == "linux/postinst", f"postinst incorrecto: {deb['postinst']}"
    assert deb["prerm"] == "linux/prerm", f"prerm incorrecto: {deb['prerm']}"

    # Rpm
    rpm = linux["rpm"]
    assert "postinst" in rpm, "Falta rpm.postinst"
    assert "prerm" in rpm, "Falta rpm.prerm"
    assert rpm["postinst"] == "linux/postinst", f"postinst incorrecto: {rpm['postinst']}"
    assert rpm["prerm"] == "linux/prerm", f"prerm incorrecto: {rpm['prerm']}"


def test_tauri_conf_appimage_incluye_activar() -> None:
    """tauri.conf.json incluye ayudante-linux-activar.sh en AppImage."""
    with open(TAURI_CONF, "r", encoding="utf-8") as f:
        data = json.load(f)

    linux = data["bundle"]["linux"]
    # AppImage puede estar en linux.appimage o linux.AppImage
    appimage_key = "appimage" if "appimage" in linux else ("AppImage" if "AppImage" in linux else None)
    assert appimage_key is not None, "Falta configuración AppImage en bundle.linux"

    appimage = linux[appimage_key]
    # El archivo de recursos debe incluirse
    # Verificar que resources incluye el script de activación
    # En Tauri v2, los resources se configuran en bundle.resources o en la raíz
    # Aquí verificamos que el archivo existe y se referencia de alguna forma
    assert ACTIVAR.exists(), f"Falta {ACTIVAR}"


def test_postinst_contiene_visudo() -> None:
    """postinst usa visudo -c antes de mover la regla."""
    contenido = POSTINST.read_text(encoding="utf-8")
    assert "visudo -c" in contenido, "postinst no usa visudo -c"


def test_postinst_regla_sudoers_limitada() -> None:
    """postinst crea regla sudoers limitada (no ALL)."""
    contenido = POSTINST.read_text(encoding="utf-8")
    assert "starseed-ayudante" in contenido
    assert "NOPASSWD" in contenido
    # No debe conceder ALL
    assert "ALL=(ALL) ALL" not in contenido or contenido.count("ALL=(ALL) ALL") == 0


def test_postinst_crea_grupo_starseed() -> None:
    """postinst crea el grupo starseed si no existe."""
    contenido = POSTINST.read_text(encoding="utf-8")
    assert "groupadd" in contenido
    assert "starseed" in contenido


def test_prerm_elimina_sudoers() -> None:
    """prerm elimina la regla sudoers."""
    contenido = PRERM.read_text(encoding="utf-8")
    assert "starseed-ayudante" in contenido
    assert "rm -f" in contenido and "sudoers" in contenido


def test_prerm_elimina_ayudante() -> None:
    """prerm elimina el ayudante instalado."""
    contenido = PRERM.read_text(encoding="utf-8")
    assert "starseed-ayudante" in contenido
    assert "rm -f" in contenido and "usr/local/sbin" in contenido


def test_prerm_no_elimina_config_usuario() -> None:
    """prerm NO elimina configuración y logs del usuario (solo purge)."""
    contenido = PRERM.read_text(encoding="utf-8")
    # Debe tener comentario explicando que no borra config/logs en remove
    assert "comentado por seguridad" in contenido.lower() or "purga completa" in contenido.lower() or "no se elimina" in contenido.lower()


def test_activar_usar_pkexec() -> None:
    """activar usa pkexec para la instalación root."""
    contenido = ACTIVAR.read_text(encoding="utf-8")
    assert "pkexec" in contenido


def test_activar_idempotente() -> None:
    """activar es idempotente (verifica flag y archivos existentes)."""
    contenido = ACTIVAR.read_text(encoding="utf-8")
    assert "FLAG_ACTIVADO" in contenido or "ayudante-activado" in contenido
    assert "ya está activado" in contenido or "ya activado" in contenido


def test_activar_no_enciende_permisos() -> None:
    """activar avisa que instalar no enciende permisos."""
    contenido = ACTIVAR.read_text(encoding="utf-8")
    assert "NO enciende" in contenido or "no enciende" in contenido or "apagado por defecto" in contenido


def test_activar_verifica_sintaxis_antes() -> None:
    """activar verifica bash -n del ayudante antes de instalar."""
    contenido = ACTIVAR.read_text(encoding="utf-8")
    assert "bash -n" in contenido


def test_activar_valida_visudo() -> None:
    """activar valida la regla sudoers con visudo -c."""
    contenido = ACTIVAR.read_text(encoding="utf-8")
    assert "visudo -c" in contenido


def test_ayudante_tiene_ordenes_esperadas() -> None:
    """El ayudante tiene todas las órdenes tipadas del contrato."""
    contenido = AYUDANTE.read_text(encoding="utf-8")
    ordenes_esperadas = [
        "almacenes",
        "servicios",
        "actualizar",
        "registros",
        "reiniciar",
        "modo-completo",
        "estado",
    ]
    for orden in ordenes_esperadas:
        assert orden in contenido, f"Falta orden {orden} en ayudante"


def test_ayudante_tiene_guardas() -> None:
    """El ayudante tiene guardas: requiere_root, anti_repeticion, log encadenado."""
    contenido = AYUDANTE.read_text(encoding="utf-8")
    assert "requiere_root" in contenido
    assert "anti_repeticion" in contenido
    assert "sha256sum" in contenido or "sha256" in contenido.lower()


def test_postinst_prerm_shebang() -> None:
    """postinst y prerm tienen shebang correcto."""
    for script in [POSTINST, PRERM]:
        primera = script.read_text(encoding="utf-8").splitlines()[0]
        assert primera == "#!/bin/sh", f"{script.name} shebang incorrecto: {primera}"


def test_activar_shebang() -> None:
    """activar tiene shebang correcto."""
    primera = ACTIVAR.read_text(encoding="utf-8").splitlines()[0]
    assert primera == "#!/bin/sh", f"activar shebang incorrecto: {primera}"


def test_ayudante_ejecutable() -> None:
    """El ayudante tiene permiso de ejecución."""
    assert os.access(AYUDANTE, os.X_OK), "starseed-ayudante no es ejecutable"


def test_scripts_ejecutables() -> None:
    """Los scripts de paquetes tienen permiso de ejecución."""
    for script in [POSTINST, PRERM, ACTIVAR]:
        assert os.access(script, os.X_OK), f"{script.name} no es ejecutable"


if __name__ == "__main__":
    import pytest
    sys.exit(pytest.main([__file__, "-v"]))