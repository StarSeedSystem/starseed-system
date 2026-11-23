#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas para commit-seguro.py: commit del director sin chocar con el enjambre."""
import json
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from unittest.mock import patch, MagicMock, mock_open

import pytest

# Añadir el directorio al path para importar commit-seguro
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import importlib.util
spec = importlib.util.spec_from_file_location("commit_seguro", os.path.join(os.path.dirname(__file__), "commit-seguro.py"))
CS = importlib.util.module_from_spec(spec)
spec.loader.exec_module(CS)


class TestFasesVivas:
    """Pruebas para la detección de fases vivas."""

    def test_fases_vivas_archivo_no_existe(self, tmp_path):
        """Si no hay archivo de latidos, devuelve dict vacío."""
        with patch.object(CS, "OLAS", str(tmp_path)):
            assert CS.fases_vivas() == {}

    def test_fases_vivas_archivo_viejo(self, tmp_path):
        """Archivos con mtime > 3 min se ignoran."""
        latidos = tmp_path / "latidos-cola-auto-test.json"
        latidos.write_text(json.dumps({"tareas": {"T1": {"fase": "commit"}}}))
        # Simular archivo viejo
        os.utime(latidos, (time.time() - 200, time.time() - 200))

        with patch.object(CS, "OLAS", str(tmp_path)):
            assert CS.fases_vivas() == {}

    def test_fases_vivas_filtrar_fase_hecho(self, tmp_path):
        """Tareas en fase 'hecho' no aparecen."""
        latidos = tmp_path / "latidos-cola-auto-test.json"
        latidos.write_text(json.dumps({"tareas": {"T1": {"fase": "hecho"}}}))
        os.utime(latidos, (time.time() - 10, time.time() - 10))

        with patch.object(CS, "OLAS", str(tmp_path)):
            assert CS.fases_vivas() == {}

    def test_fases_vivas_incluye_fases_git(self, tmp_path):
        """fases_vivas() devuelve TODAS las fases (el filtro git se hace en esperar_momento_seguro)."""
        latidos = tmp_path / "latidos-cola-auto-test.json"
        latidos.write_text(json.dumps({
            "tareas": {
                "T1": {"fase": "commit"},
                "T2": {"fase": "integrando"},
                "T3": {"fase": "integracion"},
                "T4": {"fase": "integración"},
                "T5": {"fase": "completando"},
                "T6": {"fase": "tsc"},
            }
        }))
        os.utime(latidos, (time.time() - 10, time.time() - 10))

        with patch.object(CS, "OLAS", str(tmp_path)):
            vivas = CS.fases_vivas()
            assert vivas["T1"] == "commit"
            assert vivas["T2"] == "integrando"
            assert vivas["T3"] == "integracion"
            assert vivas["T4"] == "integración"
            assert vivas["T5"] == "completando"
            assert vivas["T6"] == "tsc"  # fases_vivas no filtra, devuelve todo


class TestEsperarMomentoSeguro:
    """Pruebas para esperar_momento_seguro."""

    def test_esperar_momento_seguro_sin_tareas(self, tmp_path):
        """Si no hay tareas en fases git, retorna True inmediatamente."""
        with patch.object(CS, "OLAS", str(tmp_path)):
            assert CS.esperar_momento_seguro(tope_s=1) is True

    def test_esperar_momento_seguro_con_tareas_git(self, tmp_path):
        """Si hay tareas en fases git, espera y retorna False tras tope."""
        latidos = tmp_path / "latidos-cola-auto-test.json"
        latidos.write_text(json.dumps({"tareas": {"T1": {"fase": "commit"}}}))
        os.utime(latidos, (time.time() - 10, time.time() - 10))

        with patch.object(CS, "OLAS", str(tmp_path)):
            # tope_s muy corto para test
            assert CS.esperar_momento_seguro(tope_s=0.1) is False


class TestRecursosMac:
    """Pruebas para la comprobación de recursos de la Mac."""

    def test_tiene_recursos_suficientes_memoria(self):
        """Con memoria suficiente, retorna True."""
        with patch.object(CS.CalcularAjuste, "estado_actual") as mock_estado:
            mock_estado.return_value = CS.EstadoRecursos(
                memoria_libre_mb=500,
                intercambio_mb=100,
                disco_libre_gb=20,
                cpu_percent=10,
            )
            with patch.object(CS.CalcularAjuste, "ajuste") as mock_ajuste:
                mock_ajuste.return_value = CS.AjusteAgentes(
                    tipo="mantener", agentes=3, razon="ok", umbrales_violados=[]
                )
                assert CS.tiene_recursos_suficientes() is True

    def test_no_tiene_recursos_memoria_baja(self):
        """Con memoria baja, retorna False."""
        with patch.object(CS.CalcularAjuste, "estado_actual") as mock_estado:
            mock_estado.return_value = CS.EstadoRecursos(
                memoria_libre_mb=50,
                intercambio_mb=100,
                disco_libre_gb=20,
                cpu_percent=10,
            )
            with patch.object(CS.CalcularAjuste, "ajuste") as mock_ajuste:
                mock_ajuste.return_value = CS.AjusteAgentes(
                    tipo="reducir", agentes=2, razon="memoria", umbrales_violados=["memoria"]
                )
                assert CS.tiene_recursos_suficientes() is False

    def test_no_tiene_recursos_disco_lleno(self):
        """Con disco lleno, retorna False."""
        with patch.object(CS.CalcularAjuste, "estado_actual") as mock_estado:
            mock_estado.return_value = CS.EstadoRecursos(
                memoria_libre_mb=500,
                intercambio_mb=100,
                disco_libre_gb=5,
                cpu_percent=10,
            )
            with patch.object(CS.CalcularAjuste, "ajuste") as mock_ajuste:
                mock_ajuste.return_value = CS.AjusteAgentes(
                    tipo="reducir", agentes=2, razon="disco", umbrales_violados=["disco"]
                )
                assert CS.tiene_recursos_suficientes() is False


class TestArchivosNativos:
    """Pruebas para detección de archivos nativos/capabilities/permisos."""

    def test_es_cambio_nativo_archivo_capability(self):
        """Archivos en capabilities/ detectan cambio nativo."""
        assert CS.es_cambio_nativo(["native/src-tauri/capabilities/acceso-equipo.json"]) is True

    def test_es_cambio_nativo_archivo_permisos(self):
        """Archivos de permisos detectan cambio nativo."""
        assert CS.es_cambio_nativo(["architecture/permisos-y-control-del-dispositivo.md"]) is True

    def test_es_cambio_nativo_carpeta_native(self):
        """Cualquier archivo en native/ detecta cambio nativo."""
        assert CS.es_cambio_nativo(["native/src-tauri/src/lib.rs"]) is True

    def test_no_es_cambio_nativo_otros(self):
        """Archivos fuera de native/ no detectan cambio nativo."""
        assert CS.es_cambio_nativo(["src/lib/algo.ts"]) is False
        assert CS.es_cambio_nativo(["scripts/puente/algo.py"]) is False


class TestEjecutarPruebasNativas:
    """Pruebas para la ejecución de pruebas nativas obligatorias."""

    def test_ejecutar_pruebas_nativas_pasa(self, tmp_path):
        """Si las pruebas pasan, retorna (True, '')."""
        with patch("subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(returncode=0, stdout="", stderr="")
            ok, detalle = CS.ejecutar_pruebas_nativas()
            assert ok is True
            assert detalle == ""

    def test_ejecutar_pruebas_nativas_falla(self, tmp_path):
        """Si las pruebas fallan, retorna (False, detalle)."""
        with patch("subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(
                returncode=1, stdout="FAIL", stderr="Error en inventario"
            )
            ok, detalle = CS.ejecutar_pruebas_nativas()
            assert ok is False
            assert "inventario" in detalle.lower()


class TestDelegarARemoto:
    """Pruebas para delegación a remoto (A1/GitHub Actions)."""

    def test_delegar_a_a1_exitoso(self):
        """Delegación exitosa a A1 retorna (True, sha)."""
        with patch("subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(
                returncode=0, stdout="abc1234\n", stderr=""
            )
            ok, sha = CS.delegar_a_remoto("mensaje", ["archivo.txt"], destino="a1")
            assert ok is True
            assert sha == "abc1234"

    def test_delegar_a_github_actions_exitoso(self):
        """Delegación exitosa a GitHub Actions retorna (True, rama)."""
        with patch("subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(returncode=0, stdout="", stderr="")
            ok, sha = CS.delegar_a_remoto("mensaje", ["archivo.txt"], destino="github")
            assert ok is True
            assert sha.startswith("director/commit-")

    def test_delegar_falla(self):
        """Si la delegación falla, retorna (False, error)."""
        with patch("subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(
                returncode=1, stdout="", stderr="conexión rechazada"
            )
            ok, sha = CS.delegar_a_remoto("mensaje", ["archivo.txt"])
            assert ok is False
            assert "conexión" in sha.lower()


class TestMain:
    """Pruebas de integración del main()."""

    def test_main_sin_argumentos(self, capsys):
        """Sin argumentos muestra ayuda y retorna 2."""
        with patch.object(sys, "argv", ["commit-seguro.py"]):
            assert CS.main() == 2
        captured = capsys.readouterr()
        assert "mensaje" in captured.out.lower()

    def test_main_sin_mensaje(self, capsys):
        """Sin -m muestra ayuda y retorna 2."""
        with patch.object(sys, "argv", ["commit-seguro.py", "archivo.txt"]):
            assert CS.main() == 2


if __name__ == "__main__":
    pytest.main([__file__, "-v"])