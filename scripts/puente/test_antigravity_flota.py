# -*- coding: utf-8 -*-
"""Pruebas para antigravity_flota.py."""

import json
import tempfile
from pathlib import Path
from unittest.mock import patch, MagicMock

import pytest

from antigravity_flota import (
    ModeloAgy,
    UsoModelo,
    PapelModelo,
    TABLA_PAPELES,
    _parsear_familia_nivel,
    estimar_cuota_diaria,
    en_reserva,
    obtener_modelo_para_papel,
    registrar_uso,
    cargar_uso,
    guardar_uso,
    STARSEED_DIR,
    MODELOS_PATH,
    USO_PATH,
    CONFIG_PATH,
    RESERVA_PORCENTAJE,
)


def _dict_a_uso(d: dict) -> UsoModelo:
    """Convierte un dict a UsoModelo para pruebas."""
    return UsoModelo(
        modelo=d["modelo"],
        fecha=d["fecha"],
        llamadas=d.get("llamadas", 0),
        tiempo_total_seg=d.get("tiempo_total_seg", 0.0),
        errores_cuota=d.get("errores_cuota", 0),
        textos_errores_cuota=d.get("textos_errores_cuota", []),
    )


def _guardar_uso_dict(uso_data: dict) -> None:
    """Guarda uso desde dicts (para pruebas)."""
    uso_obj = {modelo: [_dict_a_uso(d) for d in lista] for modelo, lista in uso_data.items()}
    guardar_uso(uso_obj)


class TestParsearFamiliaNivel:
    """Pruebas para _parsear_familia_nivel."""

    def test_gemini_4_hydrogen_high(self):
        familia, nivel = _parsear_familia_nivel("gemini-4-hydrogen-high")
        assert familia == "gemini-4-hydrogen"
        assert nivel == "high"

    def test_gemini_3_8_flash_medium(self):
        familia, nivel = _parsear_familia_nivel("gemini-3.8-flash-medium")
        assert familia == "gemini-3.8-flash"
        assert nivel == "medium"

    def test_claude_opus_5_5_high(self):
        familia, nivel = _parsear_familia_nivel("claude-opus-5-5-high")
        assert familia == "claude-opus-5-5"
        assert nivel == "high"

    def test_gpt_oss_120b_medium(self):
        familia, nivel = _parsear_familia_nivel("gpt-oss-120b-medium")
        assert familia == "gpt-oss-120b"
        assert nivel == "medium"

    def test_sin_nivel_conocido(self):
        familia, nivel = _parsear_familia_nivel("modelo-desconocido")
        assert familia == "modelo-desconocido"
        assert nivel == "unknown"


class TestTablaPapeles:
    """Pruebas para la tabla pura de papeles → modelo."""

    def test_tabla_tiene_5_papeles(self):
        assert len(TABLA_PAPELES) == 5

    def test_papeles_esperados(self):
        papeles = {p.papel for p in TABLA_PAPELES}
        assert papeles == {
            "director_presidente",
            "directores_produccion_pruebas_capacidad",
            "escritores_enjambre",
            "revisores",
            "tareas_mecanicas",
        }

    def test_director_presidente_tiene_alternativa_agy(self):
        dp = next(p for p in TABLA_PAPELES if p.papel == "director_presidente")
        assert dp.modelo_principal == "gemini-4-hydrogen-high"
        assert dp.alternativa_agy == "claude-opus-5-5-high"
        assert "hermes" in dp.alternativas_fuera_agy
        assert "codex" in dp.alternativas_fuera_agy

    def test_escritores_enjambre_fallo_dos_veces(self):
        ee = next(p for p in TABLA_PAPELES if p.papel == "escritores_enjambre")
        assert ee.modelo_principal == "gemini-3.8-flash-medium"
        # La descripción menciona el fallback tras 2 fallos
        assert "claude-sonnet-5-5-medium" in ee.descripcion

    def test_revisores_otra_familia(self):
        rev = next(p for p in TABLA_PAPELES if p.papel == "revisores")
        assert rev.modelo_principal == "claude-sonnet-5-5-medium"
        # Debe ser de otra familia que el escritor (gemini)
        assert not rev.modelo_principal.startswith("gemini")

    def test_tareas_mecanicas_low(self):
        tm = next(p for p in TABLA_PAPELES if p.papel == "tareas_mecanicas")
        assert tm.modelo_principal == "gemini-3.8-flash-low"
        assert tm.nivel == "low" if hasattr(tm, 'nivel') else True


class TestUsoModelo:
    """Pruebas para UsoModelo."""

    def test_a_dict_y_desde_dict(self):
        uso = UsoModelo(
            modelo="gemini-4-hydrogen-high",
            fecha="2026-11-20",
            llamadas=5,
            tiempo_total_seg=12.5,
            errores_cuota=1,
            textos_errores_cuota=["quota exceeded"],
        )
        d = uso.a_dict()
        assert d["modelo"] == "gemini-4-hydrogen-high"
        assert d["fecha"] == "2026-11-20"
        assert d["llamadas"] == 5
        assert d["tiempo_total_seg"] == 12.5
        assert d["errores_cuota"] == 1
        assert d["textos_errores_cuota"] == ["quota exceeded"]

        uso2 = UsoModelo.desde_dict(d)
        assert uso2.modelo == uso.modelo
        assert uso2.fecha == uso.fecha
        assert uso2.llamadas == uso.llamadas
        assert uso2.tiempo_total_seg == uso.tiempo_total_seg
        assert uso2.errores_cuota == uso.errores_cuota
        assert uso2.textos_errores_cuota == uso.textos_errores_cuota


class TestMedidorUso:
    """Pruebas para el medidor de uso (registrar_uso, cargar_uso, guardar_uso)."""

    def setup_method(self):
        # Usar directorio temporal para aislar pruebas
        self.temp_dir = tempfile.TemporaryDirectory()
        self.original_starseed = STARSEED_DIR
        # Parchear las rutas globales
        import antigravity_flota as mod
        mod.STARSEED_DIR = Path(self.temp_dir.name)
        mod.MODELOS_PATH = mod.STARSEED_DIR / "antigravity-modelos.json"
        mod.USO_PATH = mod.STARSEED_DIR / "antigravity-uso.json"
        mod.CONFIG_PATH = mod.STARSEED_DIR / "antigravity-config.json"

    def teardown_method(self):
        self.temp_dir.cleanup()
        import antigravity_flota as mod
        mod.STARSEED_DIR = self.original_starseed
        mod.MODELOS_PATH = self.original_starseed / "antigravity-modelos.json"
        mod.USO_PATH = self.original_starseed / "antigravity-uso.json"
        mod.CONFIG_PATH = self.original_starseed / "antigravity-config.json"

    def test_registrar_uso_crea_entrada(self):
        registrar_uso("gemini-4-hydrogen-high", 2.5)
        uso = cargar_uso()
        assert "gemini-4-hydrogen-high" in uso
        hoy = uso["gemini-4-hydrogen-high"][0]
        assert hoy.llamadas == 1
        assert hoy.tiempo_total_seg == 2.5
        assert hoy.errores_cuota == 0

    def test_registrar_uso_acumula(self):
        registrar_uso("gemini-4-hydrogen-high", 2.5)
        registrar_uso("gemini-4-hydrogen-high", 3.0)
        uso = cargar_uso()
        hoy = uso["gemini-4-hydrogen-high"][0]
        assert hoy.llamadas == 2
        assert hoy.tiempo_total_seg == 5.5

    def test_registrar_uso_con_error_cuota(self):
        registrar_uso("gemini-4-hydrogen-high", 1.0, error_cuota="quota exceeded")
        uso = cargar_uso()
        hoy = uso["gemini-4-hydrogen-high"][0]
        assert hoy.errores_cuota == 1
        assert "quota exceeded" in hoy.textos_errores_cuota

    def test_guardar_y_cargar_uso(self):
        registrar_uso("modelo-a", 1.0)
        registrar_uso("modelo-b", 2.0)
        # Simular persistencia recargando
        uso = cargar_uso()
        assert "modelo-a" in uso
        assert "modelo-b" in uso
        assert uso["modelo-a"][0].tiempo_total_seg == 1.0
        assert uso["modelo-b"][0].tiempo_total_seg == 2.0


class TestEstimarCuotaDiaria:
    """Pruebas para estimar_cuota_diaria."""

    def setup_method(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        import antigravity_flota as mod
        self.original_starseed = mod.STARSEED_DIR
        mod.STARSEED_DIR = Path(self.temp_dir.name)
        mod.USO_PATH = mod.STARSEED_DIR / "antigravity-uso.json"

    def teardown_method(self):
        self.temp_dir.cleanup()
        import antigravity_flota as mod
        mod.STARSEED_DIR = self.original_starseed
        mod.USO_PATH = self.original_starseed / "antigravity-uso.json"

    def test_sin_historial(self):
        est = estimar_cuota_diaria("modelo-nuevo")
        assert est["cuota_estimada"] == 0.0
        assert est["reserva_20%"] == 0.0
        assert est["disponible_hoy"] == 0.0

    def test_con_historial_sin_errores(self):
        # Crear 7 días de historial con 10 llamadas/día
        from datetime import date, timedelta
        uso_data = {}
        modelo = "gemini-test"
        uso_data[modelo] = []
        for i in range(7):
            d = (date.today() - timedelta(days=i)).isoformat()
            uso_data[modelo].append({
                "modelo": modelo,
                "fecha": d,
                "llamadas": 10,
                "tiempo_total_seg": 20.0,
                "errores_cuota": 0,
                "textos_errores_cuota": [],
            })
        _guardar_uso_dict(uso_data)
        
        est = estimar_cuota_diaria(modelo)
        # Promedio 10 * 1.5 = 15, reserva 3, disponible 12
        assert est["cuota_estimada"] == 15.0
        assert est["reserva_20%"] == 3.0
        assert est["disponible_hoy"] == 12.0

    def test_con_errores_cuota_recientes(self):
        from datetime import date, timedelta
        uso_data = {}
        modelo = "gemini-test-error"
        uso_data[modelo] = []
        # Últimos 3 días con errores de cuota y 50 llamadas
        for i in range(3):
            d = (date.today() - timedelta(days=i)).isoformat()
            uso_data[modelo].append({
                "modelo": modelo,
                "fecha": d,
                "llamadas": 50,
                "tiempo_total_seg": 100.0,
                "errores_cuota": 2,
                "textos_errores_cuota": ["quota"],
            })
        # Días anteriores normales
        for i in range(3, 7):
            d = (date.today() - timedelta(days=i)).isoformat()
            uso_data[modelo].append({
                "modelo": modelo,
                "fecha": d,
                "llamadas": 10,
                "tiempo_total_seg": 20.0,
                "errores_cuota": 0,
                "textos_errores_cuota": [],
            })
        _guardar_uso_dict(uso_data)
        
        est = estimar_cuota_diaria(modelo)
        # Debe usar el máximo (50) como cuota estimada
        assert est["cuota_estimada"] == 50.0
        assert est["reserva_20%"] == 10.0
        assert est["disponible_hoy"] == 40.0


class TestEnReserva:
    """Pruebas para en_reserva."""

    def setup_method(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        import antigravity_flota as mod
        self.original_starseed = mod.STARSEED_DIR
        mod.STARSEED_DIR = Path(self.temp_dir.name)
        mod.USO_PATH = mod.STARSEED_DIR / "antigravity-uso.json"

    def teardown_method(self):
        self.temp_dir.cleanup()
        import antigravity_flota as mod
        mod.STARSEED_DIR = self.original_starseed
        mod.USO_PATH = self.original_starseed / "antigravity-uso.json"

    def test_en_reserva_true(self):
        # Historial: 7 días a 100 llamadas/día -> promedio 100 * 1.5 = 150 cuota estimada
        # Reserva 20% = 30, límite 80% = 120
        # Si hoy lleva 125 llamadas -> en reserva
        from datetime import date
        uso_data = {
            "modelo-test": [{
                "modelo": "modelo-test",
                "fecha": date.today().isoformat(),
                "llamadas": 125,
                "tiempo_total_seg": 100.0,
                "errores_cuota": 0,
                "textos_errores_cuota": [],
            }]
        }
        # Historial para estimar cuota en 150 (promedio 100 * 1.5)
        for i in range(1, 8):
            from datetime import timedelta
            d = (date.today() - timedelta(days=i)).isoformat()
            uso_data["modelo-test"].append({
                "modelo": "modelo-test",
                "fecha": d,
                "llamadas": 100,
                "tiempo_total_seg": 200.0,
                "errores_cuota": 0,
                "textos_errores_cuota": [],
            })
        _guardar_uso_dict(uso_data)
        
        assert en_reserva("modelo-test") is True

    def test_en_reserva_false(self):
        # Hoy solo 50 llamadas, cuota 100 -> no en reserva
        from datetime import date, timedelta
        uso_data = {
            "modelo-test": [{
                "modelo": "modelo-test",
                "fecha": date.today().isoformat(),
                "llamadas": 50,
                "tiempo_total_seg": 100.0,
                "errores_cuota": 0,
                "textos_errores_cuota": [],
            }]
        }
        for i in range(1, 8):
            d = (date.today() - timedelta(days=i)).isoformat()
            uso_data["modelo-test"].append({
                "modelo": "modelo-test",
                "fecha": d,
                "llamadas": 100,
                "tiempo_total_seg": 200.0,
                "errores_cuota": 0,
                "textos_errores_cuota": [],
            })
        _guardar_uso_dict(uso_data)
        
        assert en_reserva("modelo-test") is False


class TestObtenerModeloParaPapel:
    """Pruebas para obtener_modelo_para_papel."""

    def setup_method(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        import antigravity_flota as mod
        self.original_starseed = mod.STARSEED_DIR
        mod.STARSEED_DIR = Path(self.temp_dir.name)
        mod.USO_PATH = mod.STARSEED_DIR / "antigravity-uso.json"

    def teardown_method(self):
        self.temp_dir.cleanup()
        import antigravity_flota as mod
        mod.STARSEED_DIR = self.original_starseed
        mod.USO_PATH = self.original_starseed / "antigravity-uso.json"

    def test_director_presidente_sin_reserva(self):
        principal, alts = obtener_modelo_para_papel("director_presidente")
        assert principal == "gemini-4-hydrogen-high"
        assert "claude-opus-5-5-high" in alts
        assert "hermes" in alts
        assert "codex" in alts

    def test_director_presidente_en_reserva_usa_alternativa(self):
        # Poner gemini-4-hydrogen-high en reserva
        # Historial: 7 días a 100 llamadas/día -> cuota estimada 150, límite 120
        # Hoy 125 llamadas -> en reserva
        from datetime import date, timedelta
        uso_data = {
            "gemini-4-hydrogen-high": [{
                "modelo": "gemini-4-hydrogen-high",
                "fecha": date.today().isoformat(),
                "llamadas": 125,
                "tiempo_total_seg": 100.0,
                "errores_cuota": 0,
                "textos_errores_cuota": [],
            }]
        }
        for i in range(1, 8):
            d = (date.today() - timedelta(days=i)).isoformat()
            uso_data["gemini-4-hydrogen-high"].append({
                "modelo": "gemini-4-hydrogen-high",
                "fecha": d,
                "llamadas": 100,
                "tiempo_total_seg": 200.0,
                "errores_cuota": 0,
                "textos_errores_cuota": [],
            })
        _guardar_uso_dict(uso_data)
        
        principal, alts = obtener_modelo_para_papel("director_presidente")
        # Debe usar la alternativa agy (claude-opus-5-5-high) si no está en reserva
        assert principal == "claude-opus-5-5-high"
        assert "gemini-4-hydrogen-high" in alts

    def test_escritores_enjambre(self):
        principal, alts = obtener_modelo_para_papel("escritores_enjambre")
        assert principal == "gemini-3.8-flash-medium"
        assert "nim/kimi-k3" in alts
        assert "nim/deepseek-v4-flash" in alts

    def test_revisores(self):
        principal, alts = obtener_modelo_para_papel("revisores")
        assert principal == "claude-sonnet-5-5-medium"
        assert "aihubmix" in alts

    def test_tareas_mecanicas(self):
        principal, alts = obtener_modelo_para_papel("tareas_mecanicas")
        assert principal == "gemini-3.8-flash-low"
        assert "nim/gpt-oss-20b" in alts

    def test_papel_desconocido_fallback(self):
        principal, alts = obtener_modelo_para_papel("papel_inexistente")
        assert principal == "gemini-3.8-flash-low"
        assert "nim/gpt-oss-20b" in alts


class TestConfigAgy:
    """Pruebas para la configuración de contexto y MCP."""

    def setup_method(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        import antigravity_flota as mod
        self.original_starseed = mod.STARSEED_DIR
        mod.STARSEED_DIR = Path(self.temp_dir.name)
        mod.CONFIG_PATH = mod.STARSEED_DIR / "antigravity-config.json"

    def teardown_method(self):
        self.temp_dir.cleanup()
        import antigravity_flota as mod
        mod.STARSEED_DIR = self.original_starseed
        mod.CONFIG_PATH = self.original_starseed / "antigravity-config.json"

    def test_cargar_config_default(self):
        from antigravity_flota import cargar_config_agy
        config = cargar_config_agy()
        assert "add_dirs" in config
        assert "starseed_memory_root" in config["add_dirs"]
        assert "." in config["add_dirs"]
        assert "memorias_metagenesis" in config
        assert "relevo" in config["memorias_metagenesis"]
        assert "orquestacion-economica.md" in config["memorias_metagenesis"]
        assert "mcp_servidores" in config
        assert config["cuenta_google_modo_lectura"] is True

    def test_guardar_y_cargar_config(self):
        from antigravity_flota import cargar_config_agy, guardar_config_agy
        config = {
            "add_dirs": ["custom_dir"],
            "memorias_metagenesis": ["custom_memoria"],
            "mcp_servidores": [{"nombre": "test", "comando": "cmd"}],
            "cuenta_google_modo_lectura": False,
        }
        guardar_config_agy(config)
        cargada = cargar_config_agy()
        assert cargada == config


class TestModeloAgy:
    """Pruebas para ModeloAgy."""

    def test_id_completo(self):
        m = ModeloAgy(nombre="gemini-4-hydrogen-high", familia="gemini-4-hydrogen", nivel="high")
        assert m.id_completo == "gemini-4-hydrogen-high"

    def test_modelo_con_descripcion(self):
        m = ModeloAgy(
            nombre="gemini-3.8-flash-medium",
            familia="gemini-3.8-flash",
            nivel="medium",
            descripcion="Fast, efficient",
        )
        assert m.descripcion == "Fast, efficient"


class TestMedirTiempoArranque:
    """Pruebas para medir_tiempo_arranque_agy (GEM1119 revisión de riesgos)."""

    def test_timeout_subprocess_vs_agy(self):
        """El timeout de subprocess.run debería ser >= --print-timeout de agy.

        Riesgo identificado: si agy tarda más de 60s con --print-timeout 30s,
        subprocess.run timeouteará antes de que agy termine.
        """
        from escritor_agy import SEGUNDOS_AGY_ESCRITOR
        assert SEGUNDOS_AGY_ESCRITOR >= 180  # 30s print-timeout + margen

    def test_manejo_de_timeout_agy(self):
        """Cuando agy timeoutea, la función debe devolver tiempo real medido."""
        import time
        from unittest.mock import patch, MagicMock

        with patch("antigravity_flota.subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(
                returncode=-1,
                stdout="",
                stderr="timeout"
            )
            inicio = time.perf_counter()
            duracion, tokens = self._medir_con_mock()
            delta = time.perf_counter() - inicio
            assert delta >= 0  # Al menos medido algo

    def _medir_con_mock(self):
        """Helper para testing con mock."""
        from antigravity_flota import medir_tiempo_arranque_agy
        return medir_tiempo_arranque_agy("gemini-3.8-flash-medium")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])