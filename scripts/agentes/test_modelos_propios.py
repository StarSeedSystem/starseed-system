# -*- coding: utf-8 -*-
"""modelos_propios: el enrutador propio, gratis primero y sin red en las pruebas."""
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import modelos_propios as M  # noqa: E402

ENTORNO = {
    "STARSEED_SERVIDOR_IA_URL": "http://127.0.0.1:4480/v1/",
    "STARSEED_PASARELA_EXPLABS_KEY": "xpl_de_prueba",
    "STARSEED_PASARELA_EXPLABS_MODELOS": "clef-flash, clef",
    "OPENROUTER_API_KEY": "sk_de_prueba",
}

def sin_local(nombre, base):
    return nombre != "servidor-ia"

def sin_explabs(env):
    return {k: v for k, v in env.items() if not k.startswith("STARSEED_PASARELA_EXPLABS")}

class Orden(unittest.TestCase):
    def test_local_primero(self):
        c = M.cliente_openai_compatible("chat", entorno=ENTORNO, disponible=lambda *_: True)
        self.assertEqual(c["proveedor"], "servidor-ia")
        self.assertEqual(c["base_url"], "http://127.0.0.1:4480/v1")
        self.assertEqual(c["modelo"], "bitnet/bitnet-b1.58-2b-4t")
        self.assertIsNone(c["clave_env"])

    def test_sin_local_va_a_explabs(self):
        c = M.cliente_openai_compatible("chat", entorno=ENTORNO, disponible=sin_local)
        self.assertEqual(c["proveedor"], "explabs")
        self.assertEqual(c["base_url"], "https://api.experientiallabs.ai/v1")
        self.assertEqual(c["modelo"], "clef-flash")
        self.assertEqual(c["clave_env"], "STARSEED_PASARELA_EXPLABS_KEY")

    def test_sin_explabs_va_a_openrouter(self):
        c = M.cliente_openai_compatible("chat", entorno=sin_explabs(ENTORNO), disponible=sin_local)
        self.assertEqual(c["proveedor"], "openrouter")
        self.assertEqual(c["base_url"], "https://openrouter.ai/api/v1")
        self.assertTrue(c["modelo"].endswith(":free"))

    def test_local_se_puede_apagar(self):
        env = dict(ENTORNO, STARSEED_SERVIDOR_IA="0")
        c = M.cliente_openai_compatible("chat", entorno=env, disponible=lambda *_: True)
        self.assertEqual(c["proveedor"], "explabs")

    def test_sin_nada_devuelve_none(self):
        self.assertEqual(M.candidatos("chat", entorno={}, disponible=lambda *_: False), [])
        self.assertIsNone(M.cliente_openai_compatible("chat", entorno={}, disponible=lambda *_: False))

class Modelos(unittest.TestCase):
    def test_capacidad_elige_modelo(self):
        env = dict(ENTORNO, STARSEED_SERVIDOR_IA_MODELO_VISION="bitnet/vision")
        c = M.cliente_openai_compatible("vision", entorno=env, disponible=lambda *_: True)
        self.assertEqual(c["modelo"], "bitnet/vision")

    def test_openrouter_nunca_de_pago(self):
        env = dict(sin_explabs(ENTORNO), STARSEED_OPENROUTER_MODELO="anthropic/claude-opus-5.5")
        c = M.cliente_openai_compatible("chat", entorno=env, disponible=sin_local)
        self.assertEqual(c["proveedor"], "openrouter")
        self.assertTrue(c["modelo"].endswith(":free"))

    def test_override_de_explabs_debe_estar_en_la_lista(self):
        env = dict(ENTORNO, STARSEED_PASARELA_EXPLABS_MODELO_CHAT="no-existe")
        c = M.cliente_openai_compatible("chat", entorno=env, disponible=sin_local)
        self.assertEqual(c["modelo"], "clef-flash")

class Relevo(unittest.TestCase):
    def test_cadena_y_fin(self):
        a = M.cliente_openai_compatible("chat", entorno=ENTORNO, disponible=lambda *_: True)
        b = M.relevar(a, entorno=ENTORNO, disponible=lambda *_: True)
        c = M.relevar(b, entorno=ENTORNO, disponible=lambda *_: True)
        self.assertEqual([a["proveedor"], b["proveedor"], c["proveedor"]],
                         ["servidor-ia", "explabs", "openrouter"])
        self.assertIsNone(M.relevar(c, entorno=ENTORNO, disponible=lambda *_: True))

class Claves(unittest.TestCase):
    def test_cabeceras_leen_la_clave_del_entorno(self):
        c = M.cliente_openai_compatible("chat", entorno=ENTORNO, disponible=sin_local)
        h = M.cabeceras(c, entorno=ENTORNO)
        self.assertEqual(h["Authorization"], "Bearer xpl_de_prueba")
        self.assertNotIn("HTTP-Referer", h)

    def test_openrouter_lleva_atribucion(self):
        env = sin_explabs(ENTORNO)
        c = M.cliente_openai_compatible("chat", entorno=env, disponible=sin_local)
        h = M.cabeceras(c, entorno=env)
        self.assertIn("HTTP-Referer", h)
        self.assertEqual(h["Authorization"], "Bearer sk_de_prueba")

    def test_el_cliente_no_lleva_el_valor_de_la_clave(self):
        c = M.cliente_openai_compatible("chat", entorno=ENTORNO, disponible=sin_local)
        self.assertNotIn("xpl_de_prueba", repr(c))
        self.assertNotIn("xpl_de_prueba", str(c))

    def test_archivo_de_claves_solo_nombres(self):
        d = tempfile.mkdtemp()
        ruta = os.path.join(d, "env")
        with open(ruta, "w", encoding="utf-8") as f:
            f.write('# comentario\nexport STARSEED_PRUEBA_MODELOS="m1, m2"\n')
        antes = M.ARCHIVOS_DE_CLAVES
        M.ARCHIVOS_DE_CLAVES = (ruta,)
        try:
            self.assertEqual(M._entorno()["STARSEED_PRUEBA_MODELOS"], "m1, m2")
        finally:
            M.ARCHIVOS_DE_CLAVES = antes

if __name__ == "__main__":
    unittest.main()
