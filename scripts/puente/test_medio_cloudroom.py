# -*- coding: utf-8 -*-
"""Pruebas puras de la sonda Cloudroom (CRM1024D): salidas simuladas, sin room-cli, sin red."""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import medio_cloudroom as M


class Localizar(unittest.TestCase):
    def test_env_gana_sobre_defecto(self):
        ruta, motivo = M.localizar("/opt/room-cli", hay_defecto=True)
        self.assertEqual(ruta, "/opt/room-cli")
        self.assertEqual(motivo, "")

    def test_ruta_por_defecto(self):
        ruta, motivo = M.localizar(None, True)
        self.assertEqual(ruta, "~/.local/bin/room-cli")
        self.assertEqual(motivo, "")

    def test_sin_nada_declara_app_sin_instalar(self):
        ruta, motivo = M.localizar(None, False)
        self.assertIsNone(ruta)
        self.assertIn("app sin instalar", motivo)


class LeerJson(unittest.TestCase):
    def test_objeto_valido(self):
        self.assertEqual(M.leer_json('{"count": 2}'), {"count": 2})

    def test_vacia_rota_o_no_objeto_devuelve_vacio(self):
        self.assertEqual(M.leer_json(None), {})
        self.assertEqual(M.leer_json("   "), {})
        self.assertEqual(M.leer_json("no es json"), {})
        self.assertEqual(M.leer_json("[1, 2]"), {})
        self.assertEqual(M.leer_json('"3"'), {})


class LeerHilos(unittest.TestCase):
    def test_campos_conocidos(self):
        self.assertEqual(M.leer_hilos({"count": 3}), 3)
        self.assertEqual(M.leer_hilos({"hilos": "7"}), 7)
        self.assertEqual(M.leer_hilos({"threads": 0}), 0)

    def test_sin_dato_honesto(self):
        self.assertIsNone(M.leer_hilos({}))
        self.assertIsNone(M.leer_hilos({"count": True}))
        self.assertIsNone(M.leer_hilos({"count": [1]}))
        self.assertIsNone(M.leer_hilos({"count": "ab"}))


class SesionCloud(unittest.TestCase):
    def test_autenticado(self):
        ok, motivo = M.sesion_cloud({"authenticated": True})
        self.assertTrue(ok)
        self.assertEqual(motivo, "")

    def test_sin_iniciar_sesion(self):
        ok, motivo = M.sesion_cloud({"authenticated": False})
        self.assertFalse(ok)
        self.assertIn("sin iniciar sesión en Cloudroom", motivo)

    def test_sin_datos_no_inventa_sesion(self):
        ok, motivo = M.sesion_cloud({})
        self.assertFalse(ok)
        self.assertIn("Cloudroom", motivo)
        ok, motivo = M.sesion_cloud({"version": "119.0"})
        self.assertFalse(ok)
        self.assertIn("Cloudroom", motivo)

    def test_con_cuenta_a_la_vista_se_da_por_bueno(self):
        self.assertTrue(M.sesion_cloud({"email": "alguien@example.com"})[0])
        self.assertTrue(M.sesion_cloud({"user": {"id": "u1"}})[0])
        self.assertTrue(M.sesion_cloud({"signed_in": True})[0])


class Clasificar(unittest.TestCase):
    def forma(self, medio: dict) -> dict:
        self.assertEqual(medio["id"], "cloudroom")
        self.assertEqual(set(medio), {"id", "nombre", "estado", "capacidad", "detalle", "siguiente_paso"})
        self.assertIn(medio["estado"], ("listo", "usable", "requiere_alex", "no_disponible"))
        return medio

    def test_app_sin_instalar(self):
        m = self.forma(M.clasificar(None, "app sin instalar", {}, "", False, "", None))
        self.assertEqual(m["estado"], "requiere_alex")
        self.assertIn("app sin instalar", m["detalle"])
        self.assertTrue(m["siguiente_paso"])

    def test_cli_no_responde(self):
        m = self.forma(M.clasificar("cli", "", {}, "TimeoutExpired: sin salida", False, "", None))
        self.assertEqual(m["estado"], "no_disponible")
        self.assertIn("no responde", m["detalle"])
        self.assertIn("TimeoutExpired", m["detalle"])

    def test_cli_viva_pero_sin_sesion(self):
        m = self.forma(M.clasificar("cli", "", {"servidor": "127.0.0.1:7717"}, "",
                                     False, "sin iniciar sesión en Cloudroom", None))
        self.assertEqual(m["estado"], "no_disponible")
        self.assertIn("sin iniciar sesión", m["detalle"])
        self.assertIn("iniciar sesión en cloudroom.dev", m["siguiente_paso"])

    def test_usable_con_cupo_gratis_y_hilos(self):
        m = self.forma(M.clasificar("cli", "", {"servidor": "127.0.0.1:7717"}, "", True, "", 2))
        self.assertEqual(m["estado"], "listo")
        self.assertIn("100", m["capacidad"])
        self.assertIn("30 días", m["capacidad"])
        self.assertIn("2 hilo(s)", m["detalle"])

    def test_usable_sin_dato_de_hilos(self):
        m = self.forma(M.clasificar("cli", "", {"servidor": "127.0.0.1:7717"}, "", True, "", None))
        self.assertEqual(m["estado"], "usable")
        self.assertIn("hilo", m["detalle"])
        self.assertIn("30 días", m["capacidad"])


if __name__ == "__main__":
    unittest.main()
