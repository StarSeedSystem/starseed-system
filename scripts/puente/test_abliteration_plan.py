# -*- coding: utf-8 -*-
"""Pruebas sin red de los límites del plan gratuito de abliteration.ai (MQA8)."""
import unittest
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from abliteration_creditos import (
    cabe_peticion,
    solo_texto,
    PLAN_RPM,
    PLAN_TPM,
    PLAN_PETICIONES_DIA,
    PLAN_A_LA_VEZ,
    FABRICA_RPM,
    FABRICA_PETICIONES_DIA,
    FABRICA_A_LA_VEZ,
)


class TestCabePeticion(unittest.TestCase):
    def test_justo_bajo_limites(self):
        """Justo por debajo de todos los límites de la fábrica."""
        resultado, motivo = cabe_peticion(
            hechas_hoy=FABRICA_PETICIONES_DIA - 1,
            en_el_ultimo_minuto=FABRICA_RPM - 1,
            en_curso=FABRICA_A_LA_VEZ - 1,
        )
        self.assertTrue(resultado)
        self.assertEqual(motivo, "ok")

    def test_justo_en_limites(self):
        """Justo en los límites (debe fallar por >= para RPM y diario)."""
        resultado, motivo = cabe_peticion(
            hechas_hoy=FABRICA_PETICIONES_DIA,
            en_el_ultimo_minuto=FABRICA_RPM,
            en_curso=FABRICA_A_LA_VEZ,
        )
        self.assertFalse(resultado)
        self.assertIn(motivo, ["límite diario alcanzado", "límite RPM alcanzado"])

    def test_hechas_hoy_none(self):
        """None en hechas_hoy cuenta como NO."""
        resultado, motivo = cabe_peticion(
            hechas_hoy=None,
            en_el_ultimo_minuto=0,
            en_curso=0,
        )
        self.assertFalse(resultado)
        self.assertEqual(motivo, "hechas_hoy es None")

    def test_ultimo_minuto_none(self):
        """None en en_el_ultimo_minuto cuenta como NO."""
        resultado, motivo = cabe_peticion(
            hechas_hoy=0,
            en_el_ultimo_minuto=None,
            en_curso=0,
        )
        self.assertFalse(resultado)
        self.assertEqual(motivo, "en_el_ultimo_minuto es None")

    def test_en_curso_none(self):
        """None en en_curso cuenta como NO."""
        resultado, motivo = cabe_peticion(
            hechas_hoy=0,
            en_el_ultimo_minuto=0,
            en_curso=None,
        )
        self.assertFalse(resultado)
        self.assertEqual(motivo, "en_curso es None")

    def test_excede_rpm(self):
        """Exceso de peticiones por minuto."""
        resultado, motivo = cabe_peticion(
            hechas_hoy=0,
            en_el_ultimo_minuto=FABRICA_RPM,
            en_curso=0,
        )
        self.assertFalse(resultado)
        self.assertEqual(motivo, "límite RPM alcanzado")

    def test_excede_diario(self):
        """Exceso de peticiones diarias."""
        resultado, motivo = cabe_peticion(
            hechas_hoy=FABRICA_PETICIONES_DIA,
            en_el_ultimo_minuto=0,
            en_curso=0,
        )
        self.assertFalse(resultado)
        self.assertEqual(motivo, "límite diario alcanzado")

    def test_mas_peticiones_en_curso_que_permitido(self):
        """Demasiadas peticiones en curso."""
        resultado, motivo = cabe_peticion(
            hechas_hoy=0,
            en_el_ultimo_minuto=0,
            en_curso=FABRICA_A_LA_VEZ + 1,
        )
        self.assertFalse(resultado)
        self.assertEqual(motivo, "más peticiones en curso que lo permitido")


class TestSoloTexto(unittest.TestCase):
    def test_mensaje_vacio(self):
        """Lista vacía o None debería pasar."""
        self.assertTrue(solo_texto([]))
        self.assertTrue(solo_texto(None))
        self.assertTrue(solo_texto({}))

    def test_texto_puro(self):
        """Mensajes sin imágenes pasan."""
        mensajes = [
            {"role": "user", "content": "Hola, qué tal?"},
            {"role": "assistant", "content": "Estoy bien, gracias."},
        ]
        self.assertTrue(solo_texto(mensajes))

    def test_texto_simple(self):
        """Mensajes con estructura simple."""
        mensajes = [
            {"content": "Texto sin imagen"},
            "Texto plano",
        ]
        self.assertTrue(solo_texto(mensajes))

    def test_imagen_data_url_pasa(self):
        """Las imágenes en formato data: (base64 embebidas) pasan."""
        mensajes = [
            {"imagen": "data:image/png;base64,abc123"},
        ]
        self.assertTrue(solo_texto(mensajes))

    def test_imagen_url_http_no_pasa(self):
        """URL http:// no admite el plan gratuito."""
        mensajes = [
            {"imagen": "http://example.com/imagen.png"},
        ]
        self.assertFalse(solo_texto(mensajes))

    def test_imagen_url_https_no_pasa(self):
        """URL https:// tampoco admite el plan gratuito."""
        mensajes = [
            {"imagen": "https://example.com/imagen.png"},
        ]
        self.assertFalse(solo_texto(mensajes))

    def test_imagen_alternativo_image(self):
        """Campo 'image' también se revisa."""
        mensajes = [
            {"image": "https://example.com/foto.jpg"},
        ]
        self.assertFalse(solo_texto(mensajes))

    def test_url_remota_en_campo_url(self):
        """Campo url con URL remota."""
        mensajes = [
            {"url": "https://storage.example.com/image.png"},
        ]
        self.assertFalse(solo_texto(mensajes))

    def test_url_http_en_campo_url(self):
        """Campo url con URL http."""
        mensajes = [
            {"url": "http://example.com/picture.jpg"},
        ]
        self.assertFalse(solo_texto(mensajes))

    def test_texto_mezclado_imagen_data_pasa(self):
        """Mezcla de texto e imagen data: pasa."""
        mensajes = [
            {"role": "user", "content": "Mira esto:"},
            {"imagen": "data:image/jpeg;base64,xyz789"},
        ]
        self.assertTrue(solo_texto(mensajes))

    def test_texto_mezclado_url_no_pasa(self):
        """Mezcla de texto con URL remota falla."""
        mensajes = [
            {"role": "user", "content": "Mira esto:"},
            {"imagen": "https://remote.com/photo.png"},
        ]
        self.assertFalse(solo_texto(mensajes))


if __name__ == "__main__":
    unittest.main()