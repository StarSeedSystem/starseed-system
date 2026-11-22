# -*- coding: utf-8 -*-
"""Pruebas para guardia_recursos.py (GEST1121B).

Mide memoria libre, intercambio y disco y ajusta el número de agentes locales.
"""

from datetime import date
from unittest.mock import patch, MagicMock

import pytest

from guardia_recursos import (
    EstadoRecursos,
    LeerRecursos,
    CalcularAjuste,
    AjusteAgentes,
    Umbrales,
    ajustar_agentes,
)


class TestEstadoRecursos:
    """Pruebas para el dataclass EstadoRecursos."""

    def test_crea_estado_con_valores(self):
        estado = EstadoRecursos(
            memoria_libre_mb=1024,
            intercambio_mb=512,
            disco_libre_gb=15,
            cpu_percent=45.0,
        )
        assert estado.memoria_libre_mb == 1024
        assert estado.intercambio_mb == 512
        assert estado.disco_libre_gb == 15
        assert estado.cpu_percent == 45.0


class TestLeerRecursos:
    """Pruebas para LeerRecursos - funciones puras de lectura de recursos."""

    def test_leer_memoria_libre_positivo(self):
        with patch("os.statvfs") as mock_statvfs:
            mock_statvfs.return_value = MagicMock(f_bavail=100000, f_bsize=4096)
            with patch("os.sysconf") as mock_sysconf:
                mock_sysconf.return_value = 8192
            resultado = LeerRecursos.memoria_libre_mb()
            assert resultado > 0

    def test_leer_intercambio_positivo(self):
        with patch("pathlib.Path.exists", return_value=True):
            with patch("builtins.open", create=True) as mock_open:
                mock_open.return_value.__enter__.return_value.read.return_value = "1024\n2048\n0\n"
                resultado = LeerRecursos.intercambio_mb()
                assert isinstance(resultado, (int, float))


class TestUmbrales:
    """Pruebas para los umbrales por defecto."""

    def test_umbrales_default(self):
        umbrales = Umbrales()
        assert umbrales.intercambio_max_gb == 10
        assert umbrales.disco_min_gb == 10
        assert umbrales.memoria_libre_mb_min == 100
        assert umbrales.agentes_max == 3
        assert umbrales.agentes_min == 2

    def test_umbrales_personalizados(self):
        umbrales = Umbrales(intercambio_max_gb=5, disco_min_gb=5)
        assert umbrales.intercambio_max_gb == 5
        assert umbrales.disco_min_gb == 5


class TestCalcularAjuste:
    """Pruebas para CalcularAjuste - lógica de cálculo de ajuste de agentes."""

    def test_estado_nomal_no_ajuste(self):
        estado = EstadoRecursos(
            memoria_libre_mb=2000,
            intercambio_mb=500,
            disco_libre_gb=50,
            cpu_percent=30.0,
        )
        umbrales = Umbrales()
        ajuste = CalcularAjuste.ajuste(estado, umbrales)
        assert ajuste.tipo == "mantener"
        assert ajuste.agentes == 3

    def test_intercambio_alto_reduction(self):
        estado = EstadoRecursos(
            memoria_libre_mb=500,
            intercambio_mb=15000,
            disco_libre_gb=50,
            cpu_percent=80.0,
        )
        umbrales = Umbrales()
        ajuste = CalcularAjuste.ajuste(estado, umbrales)
        assert ajuste.tipo == "reducir"
        assert ajuste.agentes <= 2

    def test_disco_bajo_reduction(self):
        estado = EstadoRecursos(
            memoria_libre_mb=2000,
            intercambio_mb=500,
            disco_libre_gb=5,
            cpu_percent=30.0,
        )
        umbrales = Umbrales()
        ajuste = CalcularAjuste.ajuste(estado, umbrales)
        assert ajuste.tipo == "reducir"
        assert ajuste.agentes <= 2

    def test_memoria_critica_reduction(self):
        estado = EstadoRecursos(
            memoria_libre_mb=50,
            intercambio_mb=500,
            disco_libre_gb=50,
            cpu_percent=90.0,
        )
        umbrales = Umbrales()
        ajuste = CalcularAjuste.ajuste(estado, umbrales)
        assert ajuste.tipo == "reducir"
        assert ajuste.agentes >= 2


class TestAjusteAgentes:
    """Pruebas para el dataclass AjusteAgentes."""

    def test_crea_ajuste(self):
        ajuste = AjusteAgentes(
            tipo="reducir",
            agentes=2,
            razon="intercambio > 10 GB",
            umbrales_violados=["intercambio"],
        )
        assert ajuste.tipo == "reducir"
        assert ajuste.agentes == 2
        assert "intercambio" in ajuste.umbrales_violados


class TestAjustarAgentes:
    """Pruebas para la función ajustar_agentes (integración)."""

    @patch("guardia_recursos.obtener_estado_actual")
    @patch("guardia_recursos.leer_contador_agentes")
    @patch("guardia_recursos.guardar_contador_agentes")
    def test_ajusta_en_estado_normal(
        self, mock_guardar, mock_leer, mock_estado
    ):
        mock_estado.return_value = EstadoRecursos(
            memoria_libre_mb=2000,
            intercambio_mb=500,
            disco_libre_gb=50,
            cpu_percent=30.0,
        )
        mock_leer.return_value = 3
        ajuste = ajustar_agentes()
        assert ajuste.tipo == "mantener"
        assert ajuste.agentes == 3

    @patch("guardia_recursos.obtener_estado_actual")
    @patch("guardia_recursos.leer_contador_agentes")
    @patch("guardia_recursos.guardar_contador_agentes")
    def test_ajusta_reduccion_intercambio(
        self, mock_guardar, mock_leer, mock_estado
    ):
        mock_estado.return_value = EstadoRecursos(
            memoria_libre_mb=500,
            intercambio_mb=12000,
            disco_libre_gb=50,
            cpu_percent=80.0,
        )
        mock_leer.return_value = 3
        ajuste = ajustar_agentes()
        assert ajuste.tipo == "reducir"
        assert ajuste.agentes <= 2
        mock_guardar.assert_called_once()


class TestDetectorJavaWorktree:
    """Pruebas para detección de procesos Java en worktrees."""

    def test_java_cuales_devuelve_lista(self):
        """DetectarJavaWorktree.cuales devuelve una lista de objetos JavaProcess."""
        from guardia_recursos import DetectarJavaWorktree
        resultado = DetectarJavaWorktree.cuales()
        assert isinstance(resultado, list)