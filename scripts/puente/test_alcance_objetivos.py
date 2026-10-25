#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas de alcance_objetivos (INV1025J): privado, prohibidos, cuotas y pausas.

Solo stdlib; se carga el módulo por ruta, sin importar nada del paquete.
"""

import importlib.util
import os
import shutil
import stat
import tempfile
import unittest

_ruta = os.path.join(os.path.dirname(os.path.abspath(__file__)), "alcance_objetivos.py")
_espec = importlib.util.spec_from_file_location("alcance_objetivos_mod", _ruta)
A = importlib.util.module_from_spec(_espec)
_espec.loader.exec_module(A)

T = 1_500_000_000.0  # un instante fijo, más allá del reloj (el reloj es inyectable)

FICHA_BASE = dict(
    nombre_publico="Ejemplo Público", tipo="proyecto", categoria="proyecto-afin",
    urls_oficiales=["https://ejemplo.org"],
    canal_contacto={"medio": "formulario", "valor": "https://ejemplo.org/contacto",
                    "fuente_url": "https://ejemplo.org/contacto"},
)


def _ficha(**extra):
    ficha = dict(FICHA_BASE)
    ficha.update(extra)
    return ficha


class AlcanceObjetivos(unittest.TestCase):
    def setUp(self):
        self.home = tempfile.mkdtemp(prefix="alcance-")

    def tearDown(self):
        shutil.rmtree(self.home, ignore_errors=True)

    def objetos(self):
        return os.path.join(A.ruta_carpeta(self.home), "supresion.json")


class TestPrivacidad(AlcanceObjetivos):
    def test_carpeta_700_y_archivos_600(self):
        A.preparar_carpeta(self.home)
        self.assertEqual(stat.S_IMODE(os.stat(A.ruta_carpeta(self.home)).st_mode), 0o700)
        ficha = A.guardar_objetivo(self.home, _ficha(), ahora=T)
        ruta_reg = os.path.join(A.ruta_carpeta(self.home), "registro-%s.json" % ficha["id"])
        A.anotar(self.home, ficha["id"], "envio", ahora=T)
        ruta_obj = os.path.join(A.ruta_carpeta(self.home), "objetivo-%s.json" % ficha["id"])
        self.assertEqual(stat.S_IMODE(os.stat(ruta_obj).st_mode), 0o600)
        self.assertEqual(stat.S_IMODE(os.stat(ruta_reg).st_mode), 0o600)

    def test_supresion_guarda_solo_el_hash(self):
        huella = A.suprimir(self.home, "Alguien@Ejemplo.ORG ", ahora=T)
        self.assertEqual(huella, A.huella_supresion("alguien@ejemplo.org"))
        with open(self.objetos(), "r", encoding="utf-8") as destino:
            contenido = destino.read()
        self.assertNotIn("alguien", contenido.lower())
        self.assertIn(huella, contenido)
        # dominio+nombre y correo caen en la MISMA huella (no se deduce dirección)
        self.assertEqual(A.huella_supresion("susana", "ejemplo.org"),
                         A.huella_supresion("susana@ejemplo.org"))
        A.suprimir(self.home, "susana", "ejemplo.org", ahora=T)
        self.assertTrue(A.suprimido(self.home, "susana@ejemplo.org"))


class TestValidacion(AlcanceObjetivos):
    def test_campos_prohibidos(self):
        for campo in ("salud", "religion", "orientacion", "politica", "familia",
                      "domicilio", "ingresos", "telefono"):
            self.assertEqual(A.validar_objetivo(_ficha(**{campo: "x"})), "campo-ajeno")

    def test_textos_sensibles_y_calle_libre(self):
        self.assertEqual(A.validar_objetivo(_ficha(nombre_publico="Hijos del viento")),
                         "dato-prohibido:hijos")
        self.assertEqual(A.validar_objetivo(_ficha(nombre_publico="Repartido justo")), None)

    def test_direccion_sin_fuente_url_publica(self):
        canal = dict(FICHA_BASE["canal_contacto"], valor="alguien@ejemplo.org", fuente_url="")
        self.assertEqual(A.validar_objetivo(_ficha(canal_contacto=canal)), "direccion-sin-fuente-url")
        canal["fuente_url"] = "http://ejemplo.org/contacto"
        self.assertEqual(A.validar_objetivo(_ficha(canal_contacto=canal)), "fuente-url-no-https")

    def test_telefono_y_urls_no_https(self):
        canal = dict(FICHA_BASE["canal_contacto"], valor="+34 600 123 456")
        self.assertEqual(A.validar_objetivo(_ficha(canal_contacto=canal)), "telefono-personal")
        self.assertEqual(A.validar_objetivo(_ficha(urls_oficiales=["http://ejemplo.org"])),
                         "urls-no-https")

    def test_objetivo_sin_nivel_es_alto(self):
        ficha = A.guardar_objetivo(self.home, _ficha(), ahora=T)
        self.assertEqual(ficha["nivel"], "alto")


class TestCuotasYPausas(AlcanceObjetivos):
    def test_suprimido_no_contacta(self):
        permitido, motivo = A.puede_contactar(_ficha(), {"suprimido": True}, T)
        self.assertFalse(permitido)
        self.assertEqual(motivo, "suprimido")

    def test_mensaje_y_recordatorio_a_los_14_dias_como_maximo(self):
        permitido, _ = A.puede_contactar(_ficha(), {"envio": [T]}, T + 5 * 86400)
        self.assertFalse(permitido)
        permitido, _ = A.puede_contactar(_ficha(), {"envio": [T]}, T + 14 * 86400)
        self.assertTrue(permitido)
        registro = {"envio": [T], "recordatorio": [T + 14 * 86400]}
        permitido, motivo = A.puede_contactar(_ficha(), registro, T + 15 * 86400)
        self.assertFalse(permitido)
        self.assertEqual(motivo, "sin-mas-turnos")

    def test_pausa_de_90_tras_rechazo_de_alex(self):
        registro = {"rechazo_alex": [T]}
        permitido, motivo = A.puede_contactar(_ficha(), registro, T + (90 * 86400) - 1)
        self.assertEqual(motivo, "pausa-rechazo-alex")
        permitido, _ = A.puede_contactar(_ficha(), registro, T + 90 * 86400 + 1)
        self.assertTrue(permitido)

    def test_pausa_de_180_tras_un_no(self):
        registro = {"no_destinatario": [T]}
        permitido, motivo = A.puede_contactar(_ficha(), registro, T + (180 * 86400) - 1)
        self.assertEqual(motivo, "pausa-no-destinatario")
        permitido, _ = A.puede_contactar(_ficha(), registro, T + 180 * 86400 + 1)
        self.assertTrue(permitido)

    def test_tope_diario_de_cinco(self):
        permitido, motivo = A.puede_contactar(_ficha(), {"envios_hoy": 5}, T)
        self.assertEqual(motivo, "tope-diario")
        permitido, _ = A.puede_contactar(_ficha(), {"envios_hoy": 4}, T)
        self.assertTrue(permitido)

    def test_alto_perfil_nunca_automatico(self):
        permitido, motivo = A.puede_contactar(_ficha(nivel="alto"), {}, T, automatico=True)
        self.assertEqual(motivo, "nivel-alto-solo-manual")
        permitido, _ = A.puede_contactar(_ficha(nivel="medio"), {}, T, automatico=False)
        self.assertTrue(permitido)


if __name__ == "__main__":
    unittest.main()
