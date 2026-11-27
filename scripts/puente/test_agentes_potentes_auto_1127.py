# -*- coding: utf-8 -*-
"""Pruebas de auto_lanzar para agentes potentes (CAP1127C): lógica pura, sin red ni lanzamiento real.

Cubre: tope diario, cupo 0, prioridad baja, interruptor apagado, coste de pago rechazado,
archivos protegidos, modo de la sugerencia, y que el registro se escribe.
"""
import json
import os
import sys
import tempfile
import time
import types
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import buscar_capacidad as BC  # noqa: E402


AHORA = time.mktime((2026, 11, 27, 10, 0, 0, 0, 0, -1))
HOY = "2026-11-27"


def _sugerencia(tid, prioridad=100, tipo="ui_typescript", modelo="gemini-4-neon-high",
                coste="sin clave API (Antigravity, cuenta de Google de Alex)",
                modo="plan", agente="Antigravity"):
    return {
        "id": tid,
        "titulo": f"Tarea {tid}",
        "tipo": tipo,
        "agente": agente,
        "modelo": modelo,
        "motivo": "prueba",
        "coste_estimado": coste,
        "cupo_queda": "10 llamada(s) hoy disponibles",
        "modo": modo,
        "prioridad": prioridad,
        "visto": "2026-11-27T10:00:00+00:00",
    }


def _cupos(**kw):
    base = {
        "gemini-4-neon-high": {"disponible": True, "disponible_hoy": 10},
        "claude-opus-5-5-high": {"disponible": True, "disponible_hoy": 5},
        "gemini-4-hydrogen-xhigh": {"disponible": True, "disponible_hoy": 8},
        "gemini-3.8-flash": {"disponible": True, "disponible_hoy": 20},
    }
    base.update(kw)
    return base


class TestAutoLanzarPuro(unittest.TestCase):
    """Pruebas de la función PURA `auto_lanzar` (sin I/O real)."""

    def setUp(self):
        # Aislar rutas de configuración y log
        self.tempdir = tempfile.TemporaryDirectory()
        self.config_path = os.path.join(self.tempdir.name, "agentes-potentes.json")
        self.log_path = os.path.join(self.tempdir.name, "agentes-potentes-lanzados.jsonl")
        self.sug_path = os.path.join(self.tempdir.name, "capacidad-sugerencias.json")

        # Parchear las constantes del módulo
        self._orig_config = BC.RUTA_AUTO_CONFIG
        self._orig_log = BC.RUTA_AUTO_LANZADOS
        self._orig_sug = BC.RUTA_SUGERENCIAS
        BC.RUTA_AUTO_CONFIG = self.config_path
        BC.RUTA_AUTO_LANZADOS = self.log_path
        BC.RUTA_SUGERENCIAS = self.sug_path

    def tearDown(self):
        BC.RUTA_AUTO_CONFIG = self._orig_config
        BC.RUTA_AUTO_LANZADOS = self._orig_log
        BC.RUTA_SUGERENCIAS = self._orig_sug
        self.tempdir.cleanup()

    def _escribir_config(self, auto=True, max_por_dia=4):
        with open(self.config_path, "w", encoding="utf-8") as f:
            json.dump({"auto": auto, "max_por_dia": max_por_dia}, f)

    def _escribir_log_hoy(self, n):
        with open(self.log_path, "w", encoding="utf-8") as f:
            for i in range(n):
                f.write(json.dumps({"fecha": HOY, "hora": "10:00:00", "id": f"T{i}"}) + "\n")

    def test_interruptor_apagado_no_lanza_solo_prepara(self):
        """Con auto=false, no lanza nada pero devuelve la lista ordenada para aprobación manual."""
        self._escribir_config(auto=False, max_por_dia=4)
        sugs = [_sugerencia("A"), _sugerencia("B", prioridad=95), _sugerencia("C", prioridad=90)]
        res = BC.auto_lanzar(sugs, _cupos(), {"auto": False, "max_por_dia": 4}, AHORA)
        self.assertEqual(res["lanzar"], [])
        self.assertEqual(len(res["omitidas"]), 3)
        self.assertTrue(all("interruptor auto=false" in o["motivo"] for o in res["omitidas"]))
        self.assertFalse(res["config"]["auto"])

    def test_tope_diario_alcanzado_no_lanza(self):
        """Si ya se lanzaron max_por_dia hoy, no lanza más."""
        self._escribir_config(auto=True, max_por_dia=2)
        self._escribir_log_hoy(2)
        sugs = [_sugerencia("A"), _sugerencia("B")]
        res = BC.auto_lanzar(sugs, _cupos(), {"auto": True, "max_por_dia": 2}, AHORA)
        self.assertEqual(res["lanzar"], [])
        self.assertEqual(len(res["omitidas"]), 2)
        self.assertTrue(all("tope diario alcanzado" in o["motivo"] for o in res["omitidas"]))
        self.assertEqual(res["config"]["ya_hoy"], 2)

    def test_cupo_cero_modelo_no_lanza(self):
        """Si el modelo tiene disponible_hoy = 0, omite esa sugerencia."""
        self._escribir_config(auto=True, max_por_dia=4)
        cupos = _cupos(**{"gemini-4-neon-high": {"disponible": False, "disponible_hoy": 0}})
        sugs = [_sugerencia("A")]
        res = BC.auto_lanzar(sugs, cupos, {"auto": True, "max_por_dia": 4}, AHORA)
        self.assertEqual(res["lanzar"], [])
        self.assertEqual(len(res["omitidas"]), 1)
        self.assertIn("cupo 0", res["omitidas"][0]["motivo"])

    def test_prioridad_baja_no_lanza(self):
        """Sugerencias con prioridad < 90 se omiten."""
        self._escribir_config(auto=True, max_por_dia=4)
        sugs = [_sugerencia("A", prioridad=100), _sugerencia("B", prioridad=89)]
        res = BC.auto_lanzar(sugs, _cupos(), {"auto": True, "max_por_dia": 4}, AHORA)
        self.assertEqual(len(res["lanzar"]), 1)
        self.assertEqual(res["lanzar"][0]["id"], "A")
        self.assertEqual(len(res["omitidas"]), 1)
        self.assertIn("prioridad < 90", res["omitidas"][0]["motivo"])

    def test_coste_pago_rechazado(self):
        """Sugerencias con coste de pago (no gratis) se rechazan."""
        self._escribir_config(auto=True, max_por_dia=4)
        sugs = [
            _sugerencia("A", coste="sin clave API (Antigravity)"),
            _sugerencia("B", coste="$/token (pago: xai)"),
            _sugerencia("C", coste="crédito de sesión de Claude"),
        ]
        res = BC.auto_lanzar(sugs, _cupos(), {"auto": True, "max_por_dia": 4}, AHORA)
        self.assertEqual(len(res["lanzar"]), 1)
        self.assertEqual(res["lanzar"][0]["id"], "A")
        self.assertEqual(len([o for o in res["omitidas"] if "coste de pago" in o["motivo"]]), 2)

    def test_max_por_dia_limita_lanzamientos(self):
        """Solo lanza hasta max_por_dia - ya_hoy sugerencias."""
        self._escribir_config(auto=True, max_por_dia=3)
        self._escribir_log_hoy(1)
        sugs = [_sugerencia("A"), _sugerencia("B"), _sugerencia("C"), _sugerencia("D")]
        res = BC.auto_lanzar(sugs, _cupos(), {"auto": True, "max_por_dia": 3}, AHORA)
        self.assertEqual(len(res["lanzar"]), 2)  # 3 - 1 = 2
        self.assertEqual(len([o for o in res["omitidas"] if "tope diario: no cabe" in o["motivo"]]), 2)

    def test_orden_prioridad_descendente(self):
        """Las lanzadas se ordenan por prioridad descendente."""
        self._escribir_config(auto=True, max_por_dia=2)
        sugs = [
            _sugerencia("B", prioridad=95),
            _sugerencia("A", prioridad=100),
            _sugerencia("C", prioridad=90),
        ]
        res = BC.auto_lanzar(sugs, _cupos(), {"auto": True, "max_por_dia": 2}, AHORA)
        self.assertEqual([s["id"] for s in res["lanzar"]], ["A", "B"])

    def test_modo_de_la_sugerencia_se_respeta(self):
        """El modo de la sugerencia (plan/escribir) se mantiene en la selección."""
        self._escribir_config(auto=True, max_por_dia=4)
        sugs = [
            _sugerencia("A", modo="plan"),
            _sugerencia("B", modo="escribir"),
        ]
        res = BC.auto_lanzar(sugs, _cupos(), {"auto": True, "max_por_dia": 4}, AHORA)
        self.assertEqual(len(res["lanzar"]), 2)
        modos = {s["id"]: s["modo"] for s in res["lanzar"]}
        self.assertEqual(modos["A"], "plan")
        self.assertEqual(modos["B"], "escribir")


class TestEsCosteGratis(unittest.TestCase):
    """Pruebas de la función PURA `_es_coste_gratis`."""

    def test_antigravity_es_gratis(self):
        self.assertTrue(BC._es_coste_gratis("sin clave API (Antigravity, cuenta de Google de Alex)"))

    def test_sin_clave_api_es_gratis(self):
        self.assertTrue(BC._es_coste_gratis("sin clave API"))

    def test_gratis_es_gratis(self):
        self.assertTrue(BC._es_coste_gratis("gratis"))

    def test_cuenta_google_es_gratis(self):
        self.assertTrue(BC._es_coste_gratis("cuenta de Google de Alex"))

    def test_cupo_semanal_claude_no_es_gratis_para_auto(self):
        # Los créditos de Claude son de Alex, no "sin clave API" → no válidos para auto-lanzar
        self.assertFalse(BC._es_coste_gratis("crédito de sesión/semanal de Claude (límite 85 % semana)"))

    def test_suscripcion_codex_es_gratis(self):
        self.assertTrue(BC._es_coste_gratis("suscripción de Codex/ChatGPT"))

    def test_pago_token_rechazado(self):
        self.assertFalse(BC._es_coste_gratis("$/token (pago: xai)"))

    def test_pago_anthropic_rechazado(self):
        self.assertFalse(BC._es_coste_gratis("pago: anthropic"))

    def test_coste_vacio_rechazado(self):
        self.assertFalse(BC._es_coste_gratis(""))


class TestTareaTocaProtegidos(unittest.TestCase):
    """Pruebas de la función PURA `_tarea_toca_protegidos`."""

    def test_env_es_protegido(self):
        self.assertTrue(BC._tarea_toca_protegidos([".env", "src/app.ts"]))

    def test_git_es_protegido(self):
        self.assertTrue(BC._tarea_toca_protegidos([".git/config", "src/app.ts"]))

    def test_starseed_memory_root_es_protegido(self):
        self.assertTrue(BC._tarea_toca_protegidos(["starseed_memory_root/olas/cola.json"]))

    def test_archivos_normales_no_protegidos(self):
        self.assertFalse(BC._tarea_toca_protegidos(["src/app.ts", "components/ui.tsx"]))

    def test_lista_vacia_no_protegida(self):
        self.assertFalse(BC._tarea_toca_protegidos([]))


class TestContarLanzadosHoy(unittest.TestCase):
    """Pruebas de `_contar_lanzados_hoy` (con I/O de disco aislado)."""

    def setUp(self):
        self.tempdir = tempfile.TemporaryDirectory()
        self._orig_log = BC.RUTA_AUTO_LANZADOS
        BC.RUTA_AUTO_LANZADOS = os.path.join(self.tempdir.name, "lanzados.jsonl")

    def tearDown(self):
        BC.RUTA_AUTO_LANZADOS = self._orig_log
        self.tempdir.cleanup()

    def test_sin_archivo_cero(self):
        self.assertEqual(BC._contar_lanzados_hoy(AHORA), 0)

    def test_solo_hoy_cuenta(self):
        with open(BC.RUTA_AUTO_LANZADOS, "w", encoding="utf-8") as f:
            f.write(json.dumps({"fecha": HOY, "id": "A"}) + "\n")
            f.write(json.dumps({"fecha": "2026-11-26", "id": "B"}) + "\n")
        self.assertEqual(BC._contar_lanzados_hoy(AHORA), 1)

    def test_lineas_invalidas_se_ignoran(self):
        with open(BC.RUTA_AUTO_LANZADOS, "w", encoding="utf-8") as f:
            f.write("no es json\n")
            f.write(json.dumps({"fecha": HOY, "id": "A"}) + "\n")
        self.assertEqual(BC._contar_lanzados_hoy(AHORA), 1)


class TestRegistrarLanzado(unittest.TestCase):
    """Pruebas de `_registrar_lanzado` (con I/O de disco aislado)."""

    def setUp(self):
        self.tempdir = tempfile.TemporaryDirectory()
        self._orig_log = BC.RUTA_AUTO_LANZADOS
        BC.RUTA_AUTO_LANZADOS = os.path.join(self.tempdir.name, "lanzados.jsonl")

    def tearDown(self):
        BC.RUTA_AUTO_LANZADOS = self._orig_log
        self.tempdir.cleanup()

    def test_escribe_linea_jsonl(self):
        sug = _sugerencia("A")
        BC._registrar_lanzado(sug, AHORA)
        with open(BC.RUTA_AUTO_LANZADOS, encoding="utf-8") as f:
            linea = f.readline().strip()
        reg = json.loads(linea)
        self.assertEqual(reg["id"], "A")
        self.assertEqual(reg["modelo"], "gemini-4-neon-high")
        self.assertEqual(reg["modo"], "plan")
        self.assertEqual(reg["fecha"], HOY)


if __name__ == "__main__":
    unittest.main()