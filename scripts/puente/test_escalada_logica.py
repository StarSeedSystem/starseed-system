#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Tests de la escalada de reintentos. Módulo puro sin I/O."""

import unittest
from datetime import datetime
from escalada_logica import (
    siguiente_paso,
    aplicar,
    contar_gasto,
    en_asuntos,
    ESTADOS_RECUPERABLES,
)


class TestEscaladaLogica(unittest.TestCase):
    """Pruebas de la escalera de reintentos automáticos."""

    def setUp(self):
        """Configuración común para cada test."""
        self.config_escalada_activa = {
            "escalada": {
                "activa": True,
                "tope_haiku_dia": 20,
                "tope_sonnet_dia": 5,
            }
        }
        self.config_escalada_inactiva = {
            "escalada": {
                "activa": False,
                "tope_haiku_dia": 20,
                "tope_sonnet_dia": 5,
            }
        }
        self.modelos_anthropic = ["claude-haiku-4-5", "claude-sonnet-4"]
        self.hoy = "2026-09-13"
        self.ahora = "2026-09-13 14:30:00"
        self.gasto_vacío = {"fecha": self.hoy, "haiku": 0, "sonnet": 0}

    def test_estado_no_recuperable_devuelve_none(self):
        """Una tarea en estado commit no se reintenta."""
        entrada = {"estado": "commit", "id": "test1"}
        resultado = siguiente_paso(
            entrada,
            self.gasto_vacío,
            self.config_escalada_activa,
            self.hoy,
            self.modelos_anthropic,
            self.ahora,
        )
        self.assertIsNone(resultado)

    def test_entrada_no_diccionario_devuelve_none(self):
        """Una entrada inválida devuelve None."""
        resultado = siguiente_paso(
            "no es dict",
            self.gasto_vacío,
            self.config_escalada_activa,
            self.hoy,
            self.modelos_anthropic,
            self.ahora,
        )
        self.assertIsNone(resultado)

    def test_primer_reintento_libre(self):
        """El primer reintento automático (n=1) es nivel libre."""
        entrada = {"estado": "sin_cambios", "intentos_auto": 0, "modelo": "apinex/free/sparky"}
        paso = siguiente_paso(
            entrada,
            self.gasto_vacío,
            self.config_escalada_activa,
            self.hoy,
            self.modelos_anthropic,
            self.ahora,
        )
        self.assertEqual(paso["estado"], "pendiente")
        self.assertIsNone(paso["modelo"])
        self.assertIsNone(paso["cuenta"])
        self.assertIn("gratuito", paso["motivo"])

    def test_segundo_reintento_libre(self):
        """El segundo reintento automático (n=2) es nivel libre."""
        entrada = {"estado": "fallo", "intentos_auto": 1, "modelo": "xkiro/qwen"}
        paso = siguiente_paso(
            entrada,
            self.gasto_vacío,
            self.config_escalada_activa,
            self.hoy,
            self.modelos_anthropic,
            self.ahora,
        )
        self.assertEqual(paso["estado"], "pendiente")
        self.assertIsNone(paso["modelo"])
        self.assertIn("gratuito", paso["motivo"])

    def test_tercer_reintento_haiku(self):
        """El tercer reintento automático (n=2 → nivel 2) es haiku."""
        entrada = {"estado": "fallo_tsc", "intentos_auto": 2, "modelo": "aihubmix/free"}
        paso = siguiente_paso(
            entrada,
            self.gasto_vacío,
            self.config_escalada_activa,
            self.hoy,
            self.modelos_anthropic,
            self.ahora,
        )
        self.assertEqual(paso["estado"], "pendiente")
        self.assertEqual(paso["cuenta"], "haiku")
        self.assertIn("haiku", paso["modelo"])

    def test_cuarto_reintento_haiku(self):
        """El cuarto reintento automático (n=3 → nivel 3) es haiku."""
        entrada = {"estado": "conflicto", "intentos_auto": 3, "modelo": "tokenrouter/free"}
        paso = siguiente_paso(
            entrada,
            self.gasto_vacío,
            self.config_escalada_activa,
            self.hoy,
            self.modelos_anthropic,
            self.ahora,
        )
        self.assertEqual(paso["estado"], "pendiente")
        self.assertEqual(paso["cuenta"], "haiku")

    def test_quinto_reintento_sonnet(self):
        """El quinto reintento automático (n=4 → nivel 4) es sonnet."""
        entrada = {"estado": "interrumpida", "intentos_auto": 4, "modelo": "nimapi/deepseek"}
        paso = siguiente_paso(
            entrada,
            self.gasto_vacío,
            self.config_escalada_activa,
            self.hoy,
            self.modelos_anthropic,
            self.ahora,
        )
        self.assertEqual(paso["estado"], "pendiente")
        self.assertEqual(paso["cuenta"], "sonnet")
        self.assertIn("sonnet", paso["modelo"])

    def test_sexto_reintento_bloqueante(self):
        """El sexto intento (n=5 → nivel 5) agota la escalera."""
        entrada = {"estado": "sin_cambios", "intentos_auto": 5, "modelo": "xkiro/qwen"}
        paso = siguiente_paso(
            entrada,
            self.gasto_vacío,
            self.config_escalada_activa,
            self.hoy,
            self.modelos_anthropic,
            self.ahora,
        )
        self.assertEqual(paso["estado"], "bloqueante")
        self.assertIsNone(paso["modelo"])
        self.assertIn("escalada agotada", paso["motivo"])

    def test_escalada_desactivada_devuelve_bloqueante(self):
        """Sin escalada activa, pasa directamente a bloqueante."""
        entrada = {"estado": "fallo", "intentos_auto": 2, "modelo": "free"}
        paso = siguiente_paso(
            entrada,
            self.gasto_vacío,
            self.config_escalada_inactiva,
            self.hoy,
            self.modelos_anthropic,
            self.ahora,
        )
        self.assertEqual(paso["estado"], "bloqueante")
        self.assertIn("desactivada", paso["motivo"])

    def test_sin_modelos_anthropic_bloqueante(self):
        """Sin modelos Anthropic disponibles, resultado bloqueante."""
        entrada = {"estado": "fallo_tests", "intentos_auto": 2, "modelo": "free"}
        paso = siguiente_paso(
            entrada,
            self.gasto_vacío,
            self.config_escalada_activa,
            self.hoy,
            [],  # Sin modelos
            self.ahora,
        )
        self.assertEqual(paso["estado"], "bloqueante")
        self.assertIn("sin proveedor", paso["motivo"])

    def test_tope_haiku_alcanzado_salta_a_sonnet(self):
        """Con cuota de haiku agotada y sonnet disponible, salta a sonnet."""
        gasto = {"fecha": self.hoy, "haiku": 20, "sonnet": 0}  # haiku al tope
        entrada = {"estado": "fallo", "intentos_auto": 2, "modelo": "free"}
        paso = siguiente_paso(
            entrada,
            gasto,
            self.config_escalada_activa,
            self.hoy,
            self.modelos_anthropic,
            self.ahora,
        )
        self.assertEqual(paso["estado"], "pendiente")
        self.assertEqual(paso["cuenta"], "sonnet")

    def test_topes_ambos_bloqueante(self):
        """Con cuotas de haiku Y sonnet agotadas, resultado bloqueante."""
        gasto = {"fecha": self.hoy, "haiku": 20, "sonnet": 5}
        entrada = {"estado": "sin_cambios", "intentos_auto": 2, "modelo": "free"}
        paso = siguiente_paso(
            entrada,
            gasto,
            self.config_escalada_activa,
            self.hoy,
            self.modelos_anthropic,
            self.ahora,
        )
        self.assertEqual(paso["estado"], "bloqueante")
        self.assertIn("tope diario", paso["motivo"])

    def test_sonnet_en_nivel_sonnet(self):
        """Cuando se alcanza el nivel sonnet, lo usa si hay cuota."""
        gasto = {"fecha": self.hoy, "haiku": 25, "sonnet": 2}
        entrada = {"estado": "fallo", "intentos_auto": 4, "modelo": "free"}
        paso = siguiente_paso(
            entrada,
            gasto,
            self.config_escalada_activa,
            self.hoy,
            self.modelos_anthropic,
            self.ahora,
        )
        self.assertEqual(paso["estado"], "pendiente")
        self.assertEqual(paso["cuenta"], "sonnet")

    def test_sonnet_sin_cuota_bloqueante(self):
        """En nivel sonnet sin cuota, devuelve bloqueante."""
        gasto = {"fecha": self.hoy, "haiku": 25, "sonnet": 5}
        entrada = {"estado": "fallo_tsc", "intentos_auto": 4, "modelo": "free"}
        paso = siguiente_paso(
            entrada,
            gasto,
            self.config_escalada_activa,
            self.hoy,
            self.modelos_anthropic,
            self.ahora,
        )
        self.assertEqual(paso["estado"], "bloqueante")
        self.assertIn("sonnet", paso["motivo"])

    def test_aplicar_no_muta_original(self):
        """aplicar() devuelve una copia, no modifica el original."""
        progreso = {"tarea1": {"estado": "sin_cambios", "intentos_auto": 0, "modelo": "free"}}
        paso = {
            "estado": "pendiente",
            "modelo": None,
            "cuenta": None,
            "motivo": "reintento gratuito 1/2",
        }
        nuevo = aplicar(progreso, "tarea1", paso, self.ahora)

        # Original debe estar intacto
        self.assertEqual(progreso["tarea1"]["estado"], "sin_cambios")
        self.assertEqual(progreso["tarea1"]["intentos_auto"], 0)

        # Nuevo debe tener los cambios
        self.assertEqual(nuevo["tarea1"]["estado"], "pendiente")
        self.assertEqual(nuevo["tarea1"]["intentos_auto"], 1)
        self.assertIn("director:", nuevo["tarea1"]["nota"])

    def test_aplicar_modelo_siguiente(self):
        """aplicar() pone modelo_siguiente si el paso tiene modelo."""
        progreso = {"t1": {"estado": "fallo", "intentos_auto": 0}}
        paso = {
            "estado": "pendiente",
            "modelo": "anthropic/claude-haiku-4-5",
            "cuenta": "haiku",
            "motivo": "escalada a haiku",
        }
        nuevo = aplicar(progreso, "t1", paso, self.ahora)
        self.assertEqual(nuevo["t1"]["modelo_siguiente"], "anthropic/claude-haiku-4-5")

    def test_aplicar_sin_modelo_elimina_modelo_siguiente(self):
        """Si paso["modelo"] es None, se quita modelo_siguiente si existe."""
        progreso = {"t1": {"estado": "fallo", "intentos_auto": 0, "modelo_siguiente": "old"}}
        paso = {
            "estado": "pendiente",
            "modelo": None,
            "cuenta": None,
            "motivo": "reintento gratuito",
        }
        nuevo = aplicar(progreso, "t1", paso, self.ahora)
        self.assertNotIn("modelo_siguiente", nuevo["t1"])

    def test_aplicar_bloqueante_no_incrementa_intentos_auto(self):
        """Si paso["estado"] es bloqueante, no incrementar intentos_auto."""
        progreso = {"t1": {"estado": "sin_cambios", "intentos_auto": 5}}
        paso = {
            "estado": "bloqueante",
            "modelo": None,
            "cuenta": None,
            "motivo": "escalada agotada",
        }
        nuevo = aplicar(progreso, "t1", paso, self.ahora)
        # Se incrementaría a 6, pero se decrementa de vuelta a 5
        self.assertEqual(nuevo["t1"]["intentos_auto"], 5)

    def test_contar_gasto_reinicia_con_fecha_nueva(self):
        """contar_gasto reinicia cuando la fecha no coincide."""
        gasto_viejo = {"fecha": "2026-09-12", "haiku": 10, "sonnet": 2}
        paso = {"cuenta": "haiku"}
        nuevo = contar_gasto(gasto_viejo, paso, self.hoy)

        self.assertEqual(nuevo["fecha"], self.hoy)
        self.assertEqual(nuevo["haiku"], 1)
        self.assertEqual(nuevo["sonnet"], 0)

    def test_contar_gasto_suma_en_fecha_igual(self):
        """contar_gasto suma al contador si la fecha coincide."""
        gasto = {"fecha": self.hoy, "haiku": 3, "sonnet": 1}
        paso = {"cuenta": "haiku"}
        nuevo = contar_gasto(gasto, paso, self.hoy)

        self.assertEqual(nuevo["fecha"], self.hoy)
        self.assertEqual(nuevo["haiku"], 4)
        self.assertEqual(nuevo["sonnet"], 1)

    def test_contar_gasto_suma_sonnet(self):
        """contar_gasto suma correctamente a sonnet."""
        gasto = {"fecha": self.hoy, "haiku": 5, "sonnet": 0}
        paso = {"cuenta": "sonnet"}
        nuevo = contar_gasto(gasto, paso, self.hoy)

        self.assertEqual(nuevo["sonnet"], 1)
        self.assertEqual(nuevo["haiku"], 5)

    def test_contar_gasto_sin_cuenta(self):
        """contar_gasto no suma nada si paso sin cuenta."""
        gasto = {"fecha": self.hoy, "haiku": 2, "sonnet": 1}
        paso = {"cuenta": None}
        nuevo = contar_gasto(gasto, paso, self.hoy)

        self.assertEqual(nuevo["haiku"], 2)
        self.assertEqual(nuevo["sonnet"], 1)

    def test_en_asuntos_reconoce_id_completo(self):
        """en_asuntos() reconoce el id como token completo."""
        tid = "p319A"
        asuntos = [
            "Ola 319 · p319A: test",
            "Otro commit sin id",
            "p319B en la descripción",
        ]
        self.assertTrue(en_asuntos(tid, asuntos))

    def test_en_asuntos_no_reconoce_substring(self):
        """en_asuntos() no reconoce id como substring de otro."""
        tid = "p319"
        asuntos = ["Ola 319 · p319A: test", "p319B también"]
        self.assertFalse(en_asuntos(tid, asuntos))

    def test_en_asuntos_lista_vacía(self):
        """en_asuntos() con lista vacía devuelve False."""
        tid = "p319A"
        self.assertFalse(en_asuntos(tid, []))

    def test_en_asuntos_id_con_caracteres_especiales(self):
        """en_asuntos() maneja ids con guiones y números."""
        tid = "p-319-A"
        asuntos = ["integrada p-319-A", "otro"]
        self.assertTrue(en_asuntos(tid, asuntos))


if __name__ == "__main__":
    unittest.main()
