#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas del auto-refresh del catálogo de modelos en el Dream (IMG-diaria-auto-refresh-del-catalogo-de-modeb).

Verifica que si `hermes model --refresh` falla, el Dream sigue sonando (no se detiene).
"""
import os
import subprocess
import sys
import tempfile
import textwrap

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(DIRECTORIO, "..", ".."))
DREAM_SH = os.path.join(REPO, "scripts", "hermes", "starseed-dream.sh")


def test_script_sintaxis_valida():
    """El script bash debe ser sintácticamente válido."""
    r = subprocess.run(["bash", "-n", DREAM_SH], capture_output=True, text=True, timeout=10)
    assert r.returncode == 0, f"Error de sintaxis en starseed-dream.sh: {r.stderr}"


def test_contiene_hermes_model_refresh():
    """El script debe contener la llamada a hermes model --refresh."""
    with open(DREAM_SH, encoding="utf-8") as f:
        contenido = f.read()
    assert "hermes model --refresh" in contenido


def test_refresh_falla_el_dream_sigue_soando():
    """Si hermes model --refresh falla, el script no debe salir con error (continúa)."""
    # Creamos un hermes falso que falla en 'model --refresh' pero funciona en otros comandos
    with tempfile.TemporaryDirectory() as tmpdir:
        hermes_falso = os.path.join(tmpdir, "hermes")
        with open(hermes_falso, "w", encoding="utf-8") as f:
            f.write(textwrap.dedent("""\
                #!/bin/bash
                if [[ "$1" == "model" && "$2" == "--refresh" ]]; then
                    echo "Error: sin conexión" >&2
                    exit 1
                fi
                # Para otros comandos, devolvemos éxito con salida mínima
                if [[ "$1" == "-z" ]]; then
                    echo "Top 3 accionables: prueba"
                    echo "## Mejoras detectadas"
                    echo "1. **Prueba** — ok"
                    echo "## Riesgos"
                    echo "## Ideas nuevas"
                    echo "## Estado del enjambre"
                    exit 0
                fi
                exit 0
                """))
        os.chmod(hermes_falso, 0o755)

        # Copia del script con PATH modificado para usar nuestro hermes falso
        with open(DREAM_SH, encoding="utf-8") as f:
            script_original = f.read()

        # Modificamos el script para:
        # 1. Usar nuestro hermes falso
        # 2. Saltar la parte que requiere starseed-contexto-vivo y archivos reales
        # 3. Solo probar la sección de refresh y el bucle de modelos
        script_test = script_original.replace(
            'ROOT="/Users/alex/Documents/starseed-os-main/starseed_memory_root"',
            f'ROOT="{tmpdir}/starseed_memory_root"'
        ).replace(
            'REPO="/Users/alex/Documents/starseed-os-main"',
            f'REPO="{REPO}"'
        ).replace(
            'MODELS=(',
            'MODELS=(\n  "falso|test-model"'
        )

        # Inyectamos PATH al principio
        script_test = f'export PATH="{tmpdir}:$PATH"\n' + script_test

        # Escribimos el script de prueba
        script_test_path = os.path.join(tmpdir, "starseed-dream-test.sh")
        with open(script_test_path, "w", encoding="utf-8") as f:
            f.write(script_test)
        os.chmod(script_test_path, 0o755)

        # Creamos directorios y archivos mínimos necesarios
        os.makedirs(os.path.join(tmpdir, "starseed_memory_root", "dream"), exist_ok=True)
        os.makedirs(os.path.join(tmpdir, "starseed_memory_root", "logs"), exist_ok=True)
        os.makedirs(os.path.join(tmpdir, "starseed_memory_root", "relevo"), exist_ok=True)
        os.makedirs(os.path.join(tmpdir, "starseed_memory_root", "tasks"), exist_ok=True)
        with open(os.path.join(tmpdir, "starseed_memory_root", "current-status.md"), "w") as f:
            f.write("Estado actual\n")
        with open(os.path.join(tmpdir, "starseed_memory_root", "metodologia-ia.md"), "w") as f:
            f.write("Metodología\n")
        with open(os.path.join(tmpdir, "starseed_memory_root", "tasks", "tasks.md"), "w") as f:
            f.write("- [ ] Tarea 1\n")
        with open(os.path.join(tmpdir, "starseed_memory_root", "logs", "logs.md"), "w") as f:
            f.write("Logs\n")

        # Ejecutamos el script - debería completar aunque refresh falle
        # (el script intenta varios modelos; el nuestro "falso|test-model" responderá OK)
        env = os.environ.copy()
        env["HOME"] = tmpdir
        env["REPO"] = REPO
        r = subprocess.run(
            ["bash", script_test_path],
            capture_output=True,
            text=True,
            timeout=60,
            env=env,
            cwd=REPO,
        )

        # El script debe terminar con código 0 (éxito) aunque refresh falle
        # porque el modelo "falso|test-model" responde correctamente
        assert r.returncode == 0, f"El script falló (código {r.returncode}):\nSTDOUT:\n{r.stdout}\nSTDERR:\n{r.stderr}"

        # Debe haber generado el archivo de sugerencias
        sugerencias = [f for f in os.listdir(os.path.join(tmpdir, "starseed_memory_root", "dream"))
                        if f.startswith("sugerencias-") and f.endswith(".md")]
        assert len(sugerencias) >= 1, "No se generó archivo de sugerencias"

        # El log debe mostrar el warning del refresh
        with open(os.path.join(tmpdir, "starseed_memory_root", "logs", "logs.md"), encoding="utf-8") as f:
            logs = f.read()
        assert "Error al refrescar catálogo" in logs or "⚠️" in logs


def test_refresh_falla_modelos_tambien_fallan():
    """Si refresh falla Y todos los modelos fallan, el script sale con código 1."""
    with tempfile.TemporaryDirectory() as tmpdir:
        hermes_falso = os.path.join(tmpdir, "hermes")
        with open(hermes_falso, "w", encoding="utf-8") as f:
            f.write(textwrap.dedent("""\
                #!/bin/bash
                if [[ "$1" == "model" && "$2" == "--refresh" ]]; then
                    echo "Error: sin conexión" >&2
                    exit 1
                fi
                # Todos los modelos fallan
                exit 1
                """))
        os.chmod(hermes_falso, 0o755)

        with open(DREAM_SH, encoding="utf-8") as f:
            script_original = f.read()

        script_test = script_original.replace(
            'ROOT="/Users/alex/Documents/starseed-os-main/starseed_memory_root"',
            f'ROOT="{tmpdir}/starseed_memory_root"'
        ).replace(
            'REPO="/Users/alex/Documents/starseed-os-main"',
            f'REPO="{REPO}"'
        ).replace(
            'MODELS=(',
            'MODELS=(\n  "falso|test-model"'
        )

        script_test = f'export PATH="{tmpdir}:$PATH"\n' + script_test

        script_test_path = os.path.join(tmpdir, "starseed-dream-test.sh")
        with open(script_test_path, "w", encoding="utf-8") as f:
            f.write(script_test)
        os.chmod(script_test_path, 0o755)

        os.makedirs(os.path.join(tmpdir, "starseed_memory_root", "dream"), exist_ok=True)
        os.makedirs(os.path.join(tmpdir, "starseed_memory_root", "logs"), exist_ok=True)
        os.makedirs(os.path.join(tmpdir, "starseed_memory_root", "relevo"), exist_ok=True)
        os.makedirs(os.path.join(tmpdir, "starseed_memory_root", "tasks"), exist_ok=True)
        with open(os.path.join(tmpdir, "starseed_memory_root", "current-status.md"), "w") as f:
            f.write("Estado actual\n")
        with open(os.path.join(tmpdir, "starseed_memory_root", "metodologia-ia.md"), "w") as f:
            f.write("Metodología\n")
        with open(os.path.join(tmpdir, "starseed_memory_root", "tasks", "tasks.md"), "w") as f:
            f.write("- [ ] Tarea 1\n")
        with open(os.path.join(tmpdir, "starseed_memory_root", "logs", "logs.md"), "w") as f:
            f.write("Logs\n")

        env = os.environ.copy()
        env["HOME"] = tmpdir
        env["REPO"] = REPO
        r = subprocess.run(
            ["bash", script_test_path],
            capture_output=True,
            text=True,
            timeout=60,
            env=env,
            cwd=REPO,
        )

        # Debe fallar (código 1) porque ningún modelo respondió
        assert r.returncode == 1, f"Se esperaba código 1, got {r.returncode}"

        # Pero el log debe mostrar que intentó refrescar
        with open(os.path.join(tmpdir, "starseed_memory_root", "logs", "logs.md"), encoding="utf-8") as f:
            logs = f.read()
        assert "Error al refrescar catálogo" in logs or "⚠️" in logs
        assert "ningún modelo gratuito respondio" in logs or "Dream sin respuesta" in logs


if __name__ == "__main__":
    # Ejecutar pruebas manualmente
    print("Ejecutando test_script_sintaxis_valida...")
    test_script_sintaxis_valida()
    print("  ✓")

    print("Ejecutando test_contiene_hermes_model_refresh...")
    test_contiene_hermes_model_refresh()
    print("  ✓")

    print("Ejecutando test_refresh_falla_el_dream_sigue_soando...")
    test_refresh_falla_el_dream_sigue_soando()
    print("  ✓")

    print("Ejecutando test_refresh_falla_modelos_tambien_fallan...")
    test_refresh_falla_modelos_tambien_fallan()
    print("  ✓")

    print("\n✅ Todas las pruebas pasaron")