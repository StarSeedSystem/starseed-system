#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Tests de escalada_motores.py: función PURA siguiente_motor."""

import unittest
from datetime import datetime

import escalada_motores as EM


class TestEscaladaMotores(unittest.TestCase):
    """Pruebas de la función siguiente_motor."""

    def setUp(self):
        self.tarea_ejemplo = {
            "id": "T123",
            "titulo": "Implementar funcionalidad X",
            "archivos": ["src/lib/x.ts"],
            "modelo": None,
        }
        self.hoy = datetime.now().strftime("%Y-%m-%d")

    def test_foto_vacia_devuelve_none(self):
        """Una foto vacía no tiene motor disponible."""
        resultado = EM.siguiente_motor(
            None, 0,
            {"modelos_libres": []},
            {"fecha": self.hoy},
        )
        self.assertIsNone(resultado)

    def test_sin_modelos_libres_ni_disponibles(self):
        """Sin modelos gratuitos ni agy disponible, va a a1 como último recurso."""
        resultado = EM.siguiente_motor(
            self.tarea_ejemplo, 0,
            {"modelos_libres": [], "agy": False},
            {"fecha": self.hoy},
        )
        self.assertIsNotNone(resultado)
        self.assertEqual(resultado["tipo"], "a1")

    def test_primer_intento_modelo_libre(self):
        """Primer intento con modelo gratuito disponible."""
        resultado = EM.siguiente_motor(
            self.tarea_ejemplo, 0,
            {"modelos_libres": ["apinex/free/gemini-flash"]},
            {"fecha": self.hoy, "libre": 0},
        )
        self.assertIsNotNone(resultado)
        self.assertEqual(resultado["tipo"], "gratuito")
        self.assertEqual(resultado["modelo"], "apinex/free/gemini-flash")

    def test_segundo_intento_modelo_libre_distinto(self):
        """Segundo intento con modelo gratuito diferente."""
        resultado = EM.siguiente_motor(
            self.tarea_ejemplo, 1,
            {"modelos_libres": ["openrouter/free/gemma", "apinex/free/gemini-flash"]},
            {"fecha": self.hoy, "libre": 0},
        )
        self.assertIsNotNone(resultado)
        self.assertEqual(resultado["tipo"], "gratuito")

    def test_mismo_modelo_actual_se_excluye(self):
        """El modelo actual se excluye de las opciones."""
        tarea = {**self.tarea_ejemplo, "modelo": "apinex/free/gemini-flash"}
        resultado = EM.siguiente_motor(
            tarea, 0,
            {"modelos_libres": ["apinex/free/gemini-flash", "openrouter/free/gemma"]},
            {"fecha": self.hoy, "libre": 0},
        )
        self.assertIsNotNone(resultado)
        self.assertEqual(resultado["modelo"], "openrouter/free/gemma")

    def test_agy_disponible_escoge_agy(self):
        """Cuando no hay modelos gratuitos, prueba agy."""
        resultado = EM.siguiente_motor(
            self.tarea_ejemplo, 0,
            {"modelos_libres": [], "agy": True},
            {"fecha": self.hoy, "agy_mecanicos": 0, "agy_complejos": 0, "agy_fallback": 0},
        )
        self.assertIsNotNone(resultado)
        self.assertEqual(resultado["tipo"], "agy")
        self.assertIn("gemini", resultado["modelo"])

    def test_agy_mecanicos_para_tarea_sencilla(self):
        """Para tareas simples, usa agy mecanicos (gemini-flash)."""
        tarea_simple = {**self.tarea_ejemplo, "titulo": "corregir typo en config"}
        resultado = EM.siguiente_motor(
            tarea_simple, 0,
            {"modelos_libres": [], "agy": True},
            {"fecha": self.hoy, "agy_mecanicos": 0, "agy_complejos": 0, "agy_fallback": 0},
        )
        self.assertIsNotNone(resultado)
        self.assertEqual(resultado["cuenta"], "agy_mecanicos")

    def test_agy_tope_mecanicos_alcanzado_pasa_a_siguiente(self):
        """Si el tope de agy mecanicos está alcanzado, pasa a siguientes."""
        resultado = EM.siguiente_motor(
            self.tarea_ejemplo, 0,
            {"modelos_libres": [], "agy": True},
            {"fecha": self.hoy, "agy_mecanicos": 40, "agy_complejos": 0, "agy_fallback": 0},
        )
        self.assertIsNotNone(resultado)
        self.assertEqual(resultado["cuenta"], "agy_complejos")

    def test_agy_fallback_disponible(self):
        """Si agy mecanicos y complejos están agotados, usa fallback."""
        resultado = EM.siguiente_motor(
            self.tarea_ejemplo, 0,
            {"modelos_libres": [], "agy": True},
            {"fecha": self.hoy, "agy_mecanicos": 40, "agy_complejos": 20, "agy_fallback": 0},
        )
        self.assertIsNotNone(resultado)
        self.assertEqual(resultado["cuenta"], "agy_fallback")

    def test_claude_mac_disponible_tras_agotar_agy(self):
        """Si agy está agotado, pasa a Claude Mac si está disponible."""
        resultado = EM.siguiente_motor(
            self.tarea_ejemplo, 0,
            {"modelos_libres": [], "agy": True, "claude_mac": True},
            {"fecha": self.hoy, "agy_mecanicos": 40, "agy_complejos": 20, "agy_fallback": 30, "claude_mac_sonnet": 0},
        )
        self.assertIsNotNone(resultado)
        self.assertEqual(resultado["tipo"], "claude_mac")

    def test_codex_disponible_tras_agotar_todos_anteriores(self):
        """Cuando agy y claude mac están agotados, pasa a Codex si tiene cuota."""
        resultado = EM.siguiente_motor(
            self.tarea_ejemplo, 3,
            {"modelos_libres": [], "agy": True, "codex_ok": True, "claude_mac": False},
            {"fecha": self.hoy, "agy_mecanicos": 50, "agy_complejos": 30, "agy_fallback": 30, "codex": 0.1},
        )
        self.assertIsNotNone(resultado)
        self.assertEqual(resultado["tipo"], "codex")

    def test_codex_sin_cupo_vuelve_al_a1(self):
        """Si Codex no tiene cuota, pasa a a1."""
        resultado = EM.siguiente_motor(
            self.tarea_ejemplo, 3,
            {"modelos_libres": [], "agy": True, "codex_ok": False, "claude_mac": False},
            {"fecha": self.hoy, "agy_mecanicos": 50, "agy_complejos": 30, "agy_fallback": 30, "codex": 0.9},
        )
        self.assertIsNotNone(resultado)
        self.assertEqual(resultado["tipo"], "a1")

    def test_claude_mac_para_arquitectura(self):
        """Para tareas de arquitectura, usa Claude Mac Opus."""
        tarea_arch = {**self.tarea_ejemplo, "titulo": "Diseñar arquitectura XYZ"}
        resultado = EM.siguiente_motor(
            tarea_arch, 0,
            {"modelos_libres": [], "agy": True, "claude_mac": True},
            {"fecha": self.hoy, "agy_mecanicos": 40, "agy_complejos": 20, "agy_fallback": 30, "claude_mac_opus": 0},
            es_arquitectura=True,
        )
        self.assertIsNotNone(resultado)
        self.assertEqual(resultado["cuenta"], "claude_mac_opus")

    def test_a1_como_ultimo_recurso(self):
        """Cuando todos los motores agotados, pasa a A1 como último recurso."""
        resultado = EM.siguiente_motor(
            self.tarea_ejemplo, 5,
            {"modelos_libres": [], "agy": True, "codex_ok": False, "claude_mac": False},
            {"fecha": self.hoy, "agy_mecanicos": 40, "agy_complejos": 20, "agy_fallback": 30, "codex": 0.9},
        )
        self.assertIsNotNone(resultado)
        self.assertEqual(resultado["tipo"], "a1")
        self.assertEqual(resultado["motivo"], "todos los motores agotados: requiere decisión de Alex")

    def test_reserva_20_por_ciento(self):
        """El tope diario respeta la reserva del 20%."""
        tope_base = 50
        tope_con_reserva = EM.calcular_tope_diario(tope_base)
        self.assertEqual(tope_con_reserva, 40)


class TestEscaladaMotoresTareasEspeciales(unittest.TestCase):
    """Pruebas para tareas especiales: publicación y descartar."""

    def setUp(self):
        self.hoy = datetime.now().strftime("%Y-%m-%d")

    def test_tarea_publicacion_existente_cierra_solas(self):
        """Las tareas 'Desbloquear la publicación (<sha>)' se cierran solas si el sha está en main."""
        tarea = {
            "id": "PUB-123",
            "titulo": "Desbloquear la publicación a1b2c3d4",
            "archivos": [],
        }
        asuntos = ["Ola 123 · PUB-123: se publicó a1b2c3d4"]
        from escalada_motores import es_tarea_publicacion
        self.assertTrue(es_tarea_publicacion(tarea, asuntos))

    def test_tarea_publicacion_sin_sha_en_main_no_cierra(self):
        """Si el sha no está en main, la tarea no se cierra sola."""
        tarea = {
            "id": "PUB-124",
            "titulo": "Desbloquear la publicación a1b2c3d4",
            "archivos": [],
        }
        asuntos = ["Ola 123 · otro commit sin sha"]
        from escalada_motores import es_tarea_publicacion
        self.assertFalse(es_tarea_publicacion(tarea, asuntos))

    def test_tarea_publicacion_con_sha_entre_parentesis(self):
        """A018C6A91: el título real es «URGENTE · Desbloquear la publicación (70f48b3c2)»."""
        tarea = {
            "id": "A018C6A91",
            "titulo": "URGENTE · Desbloquear la publicación (70f48b3c2)",
            "archivos": ["scripts/puente/x.py"],
        }
        asuntos = ["Ola A-desbloqueo · publicacion-70f48b3c2 · A018C6A91: se publicó"]
        from escalada_motores import es_tarea_publicacion
        self.assertTrue(es_tarea_publicacion(tarea, asuntos))


class TestEscaleraMotores(unittest.TestCase):
    """Pruebas de la función escalera_motores."""

    def test_es_constructed_correcta(self):
        """La escalera tiene los tipos correctos en el orden correcto."""
        tarea = {"id": "T1"}
        escalera = EM.escalera_motores(tarea, False, False)

        tipos = [p["tipo"] for p in escalera]
        self.assertEqual(tipos[0], "gratuito")
        self.assertEqual(tipos[1], "agy")
        self.assertEqual(tipos[-1], "a1")

    def test_opus_para_diseño(self):
        """Para diseño, incluye opus de Claude Mac."""
        tarea = {"id": "T1", "titulo": "Diseñar interfaz nuevo"}
        escalera = EM.escalera_motores(tarea, False, True)

        opus_encontrado = False
        for p in escalera:
            if p["cuenta"] == "claude_mac_opus":
                opus_encontrado = True
                break
        self.assertTrue(opus_encontrado)

    def test_opus_para_arquitectura(self):
        """Para arquitectura, incluye opus de Claude Mac."""
        tarea = {"id": "T1", "titulo": "Diseñar arquitectura del sistema"}
        escalera = EM.escalera_motores(tarea, True, False)

        opus_encontrado = False
        for p in escalera:
            if p["cuenta"] == "claude_mac_opus":
                opus_encontrado = True
                break
        self.assertTrue(opus_encontrado)

    def test_primera_posicion_es_gratuito(self):
        """La primera posición de la escalera es gratuito."""
        tarea = {"id": "T1"}
        escalera = EM.escalera_motores(tarea, False, False)
        self.assertEqual(escalera[0]["tipo"], "gratuito")

    def test_ultima_posicion_es_a1(self):
        """La última posición de la escalera es a1."""
        tarea = {"id": "T1"}
        escalera = EM.escalera_motores(tarea, False, False)
        self.assertEqual(escalera[-1]["tipo"], "a1")


if __name__ == "__main__":
    unittest.main()