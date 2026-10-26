# -*- coding: utf-8 -*-
"""modelos_propios: orden de proveedores y relevo sin red ni claves reales."""
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import modelos_propios as M  # noqa: E402

LOCAL = ["bitnet/bitnet-2b", "qwen/qwen3-coder", "google/gemma-4-31b-it"]


class Orden(unittest.TestCase):
    def test_local_primero_y_elige_por_capacidad(self):
        visto = []

        def sonda(base):
            visto.append(base)
            return LOCAL

        c = M.cliente_openai_compatible("código", entorno={}, sonda_local=sonda)
        self.assertEqual(visto, [M.SERVIDOR_IA])
        self.assertEqual(c.proveedor, "servidor-propio")
        self.assertEqual(c.base_url, "http://127.0.0.1:4480/v1")
        self.assertEqual(c.modelo, "qwen/qwen3-coder")
        self.assertIsNone(c.clave)
        v = M.cliente_openai_compatible("visión", entorno={}, sonda_local=sonda)
        self.assertIn("gemma", v.modelo)

    def test_sin_local_usa_experiential_y_no_filtra_la_clave(self):
        env = {
            "STARSEED_PASARELA_EXPLABS_KEY": "xpl_secreta",
            "STARSEED_PASARELA_EXPLABS_MODELOS": "clef-flash, deepseek-x",
            "STARSEED_PASARELA_EXPLABS_BASE_URL": "https://pasarela.local/v1/",
        }
        c = M.cliente_openai_compatible("chat", entorno=env, sonda_local=lambda b: [])
        self.assertEqual(c.proveedor, "experiential")
        self.assertEqual(c.base_url, "https://pasarela.local/v1")
        self.assertEqual(c.modelo, "clef-flash")
        self.assertEqual(c.clave, "xpl_secreta")
        self.assertNotIn("xpl_secreta", repr(c))
        self.assertIn("***", repr(c))

    def test_sin_local_ni_clave_usa_openrouter_free(self):
        c = M.cliente_openai_compatible("razonamiento", entorno={}, sonda_local=lambda b: [])
        self.assertEqual(c.proveedor, "openrouter")
        self.assertEqual(c.base_url, "https://openrouter.ai/api/v1")
        self.assertTrue(c.modelo.endswith(":free"))
        self.assertIn("nemotron", c.modelo)
        self.assertIsNone(c.clave)

    def test_un_modelo_de_pago_no_se_cuela_por_entorno(self):
        env = {"STARSEED_OPENROUTER_MODELO": "anthropic/claude-opus-5.5"}
        c = M.cliente_openai_compatible("chat", entorno=env, sonda_local=lambda b: [])
        self.assertTrue(c.modelo.endswith(":free"))
        self.assertEqual(c.modelo, M.MODELOS_OPENROUTER["chat"])


class Cadena(unittest.TestCase):
    def test_relevo_completo_en_orden(self):
        env = {"STARSEED_PASARELA_EXPLABS_KEY": "xpl_x",
               "STARSEED_PASARELA_EXPLABS_MODELOS": "clef-flash"}
        cadena = M.cadena_openai_compatible("chat", entorno=env, sonda_local=lambda b: LOCAL)
        self.assertEqual([c.proveedor for c in cadena],
                         ["servidor-propio", "experiential", "openrouter"])
        self.assertTrue(all(c.modelo for c in cadena))

    def test_un_solo_openrouter_sin_entorno(self):
        cadena = M.cadena_openai_compatible(entorno={}, sonda_local=lambda b: [])
        self.assertEqual(len(cadena), 1)
        self.assertEqual(cadena[0].proveedor, "openrouter")

    def test_capacidad_desconocida_cae_a_chat(self):
        c = M.cliente_openai_compatible("inventada", entorno={}, sonda_local=lambda b: [])
        self.assertEqual(c.modelo, M.MODELOS_OPENROUTER["chat"])


class Entorno(unittest.TestCase):
    def test_lee_archivo_inyectado_sin_tocar_el_real(self):
        ruta = os.path.join(tempfile.mkdtemp(), "env")
        with open(ruta, "w", encoding="utf-8") as f:
            f.write('export STARSEED_PASARELA_EXPLABS_KEY="xpl_fichero"\n')
            f.write("STARSEED_PASARELA_EXPLABS_MODELO=m1\n")
        cadena = M.cadena_openai_compatible(entorno={}, archivo_env=ruta,
                                            sonda_local=lambda b: [])
        self.assertEqual(cadena[0].proveedor, "experiential")
        self.assertEqual(cadena[0].clave, "xpl_fichero")

    def test_el_entorno_inyectado_manda_sobre_el_archivo(self):
        ruta = os.path.join(tempfile.mkdtemp(), "env")
        with open(ruta, "w", encoding="utf-8") as f:
            f.write("STARSEED_PASARELA_EXPLABS_KEY=vieja\n")
            f.write("STARSEED_PASARELA_EXPLABS_MODELO=m1\n")
        env = {"STARSEED_PASARELA_EXPLABS_KEY": "nueva"}
        c = M.cliente_openai_compatible(entorno=env, archivo_env=ruta,
                                        sonda_local=lambda b: [])
        self.assertEqual(c.clave, "nueva")


if __name__ == "__main__":
    unittest.main()
