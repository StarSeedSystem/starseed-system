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


def _git(cwd, *args):
    r = subprocess.run(["git", *args], cwd=str(cwd), capture_output=True, text=True)
    assert r.returncode == 0, (args, r.stderr)
    return r.stdout.strip()


class TestSinDelegacion:
    """SUP1125A (25-11): commit-seguro no se va a otra máquina ni cambia de rama el main vivo.

    Con la Mac saturada, la «delegación a GitHub» hacía `git checkout -b director/commit-…` en el
    main vivo, commit y `git push` de esa rama: el main vivo se quedó 17 h fuera de `main` y
    traer_nube no pudo avanzar main («Not possible to fast-forward»)."""

    def test_no_hay_delegacion_a_remoto(self):
        """Ni la función ni órdenes de cambiar de rama, subir o lanzar flujos en el código."""
        assert not hasattr(CS, "delegar_a_remoto")
        ruta = os.path.join(os.path.dirname(os.path.abspath(__file__)), "commit-seguro.py")
        cuerpo = open(ruta, encoding="utf-8").read().split('"""', 2)[2]  # sin el docstring
        for orden in ('"checkout"', '"switch"', '"push"', '"ssh"', '"workflow"', "director/commit-"):
            assert orden not in cuerpo, orden

    @pytest.fixture
    def repo(self, tmp_path, monkeypatch):
        """Un repo de prueba en `main` con un commit; RAIZ, OLAS y el cerrojo, en el temporal."""
        for clave, valor in {
            "GIT_CONFIG_GLOBAL": "/dev/null", "GIT_CONFIG_NOSYSTEM": "1",
            "GIT_AUTHOR_NAME": "prueba", "GIT_AUTHOR_EMAIL": "prueba@starseed.invalid",
            "GIT_COMMITTER_NAME": "prueba", "GIT_COMMITTER_EMAIL": "prueba@starseed.invalid",
        }.items():
            monkeypatch.setenv(clave, valor)
        raiz = tmp_path / "repo"
        raiz.mkdir()
        _git(raiz, "init", "-q", "-b", "main")
        (raiz / "archivo.txt").write_text("uno\n")
        _git(raiz, "add", "archivo.txt")
        _git(raiz, "commit", "-q", "-m", "inicio")
        (tmp_path / "olas").mkdir()
        monkeypatch.setattr(CS, "RAIZ", str(raiz))
        monkeypatch.setattr(CS, "OLAS", str(tmp_path / "olas"))
        monkeypatch.setattr(CS, "CERROJO", str(tmp_path / "cerrojos" / "integrar.lock"))
        return raiz

    def test_mac_saturada_commitea_aqui_en_main_sin_cambiar_de_rama(self, repo, monkeypatch, capsys):
        """Saturada: avisa y commitea en main; solo git, sin cambiar de rama ni subir nada."""
        monkeypatch.setattr(CS, "tiene_recursos_suficientes", lambda: False)
        llamadas = []
        real = subprocess.run

        def espia(cmd, *a, **k):
            llamadas.append(list(cmd))
            if cmd[0] != "git" or {"push", "checkout", "switch"} & set(cmd):
                return subprocess.CompletedProcess(cmd, 1, "", "bloqueado por la prueba")
            return real(cmd, *a, **k)

        monkeypatch.setattr(CS.subprocess, "run", espia)
        (repo / "archivo.txt").write_text("dos\n")
        monkeypatch.setattr(sys, "argv", ["commit-seguro.py", "-m", "cambio de prueba", "--", "archivo.txt"])
        rc = CS.main()
        hechas = list(llamadas)
        monkeypatch.setattr(CS.subprocess, "run", real)
        assert rc == 0
        assert _git(repo, "symbolic-ref", "--short", "HEAD") == "main"
        assert _git(repo, "log", "-1", "--format=%s", "main") == "cambio de prueba"
        assert _git(repo, "for-each-ref", "--format=%(refname:short)", "refs/heads") == "main"
        assert _git(repo, "status", "--porcelain") == ""
        for cmd in hechas:
            assert cmd[0] == "git", cmd
            assert not {"checkout", "switch", "push", "branch"} & set(cmd), cmd
        assert "commiteo aquí" in capsys.readouterr().out

    def test_con_el_arbol_en_otra_rama_no_commitea(self, repo, monkeypatch, capsys):
        """Si el árbol no está en main (p. ej. en una director/commit-…), no commitea y lo dice."""
        monkeypatch.setattr(CS, "tiene_recursos_suficientes", lambda: True)
        _git(repo, "checkout", "-q", "-b", "director/commit-1")
        (repo / "archivo.txt").write_text("tres\n")
        monkeypatch.setattr(sys, "argv", ["commit-seguro.py", "-m", "no debe entrar", "--", "archivo.txt"])
        assert CS.main() == 1
        assert _git(repo, "log", "-1", "--format=%s") == "inicio"
        assert _git(repo, "symbolic-ref", "--short", "HEAD") == "director/commit-1"
        salida = capsys.readouterr().out
        assert "director/commit-1" in salida and "no commiteo" in salida


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