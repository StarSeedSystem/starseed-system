# -*- coding: utf-8 -*-
"""Pruebas de modelos_propios.py: sin red, todo inyectado (ola 1023A)."""

import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import modelos_propios as M

CLAVE_FALSA = "clave-de-prueba"


class TestCapacidades(unittest.TestCase):
    def test_alias_y_defecto(self):
        self.assertEqual(M.normalizar_capacidad(None), "texto")
        self.assertEqual(M.normalizar_capacidad("chat"), "texto")
        self.assertEqual(M.normalizar_capacidad("reasoning"), "razon")
        self.assertEqual(M.normalizar_capacidad("code"), "codigo")
        self.assertEqual(M.normalizar_capacidad("visión"), "vision")
    def test_capacidad_no_soportada(self):
        for capacidad in ("imagen", "voz-tts", "embeddings", "3d", "inventada"):
            with self.assertRaises(M.CapacidadNoSoportada):
                M.normalizar_capacidad(capacidad)


class TestLocal(unittest.TestCase):
    def test_local_primero_y_bitnet(self):
        cliente = M.cliente_openai_compatible("texto", entorno={}, catalogo_local=["ollama/llama", "bitnet/bonsai"])
        self.assertEqual(cliente.proveedor, "servidor-propio")
        self.assertEqual(cliente.base_url, M.SERVIDOR_IA)
        self.assertEqual(cliente.modelo, "bitnet/bonsai")
    def test_razon_prefiere_el_motor_profundo(self):
        cliente = M.cliente_openai_compatible("razon", entorno={}, catalogo_local=["bitnet/x", "turbo/gemma"])
        self.assertEqual(cliente.modelo, "turbo/gemma")
    def test_catalogo_inyectado_no_toca_la_red(self):
        def prohibido(*_a, **_k):
            raise AssertionError("no debe sondearse el servidor")
        original = M.modelos_del_servidor
        M.modelos_del_servidor = prohibido
        try:
            cliente = M.cliente_openai_compatible("texto", entorno={}, catalogo_local=["bitnet/x"])
        finally:
            M.modelos_del_servidor = original
        self.assertEqual(cliente.modelo, "bitnet/x")
    def test_modelo_local_forzado_y_url_propia(self):
        entorno = {
            "STARSEED_SERVIDOR_IA_URL": "http://127.0.0.1:9999/v1/",
            "STARSEED_AGENTES_MODELO_LOCAL": "ollama/elegido",
            "STARSEED_SERVIDOR_IA_TOKEN": CLAVE_FALSA,
        }
        cliente = M.cliente_openai_compatible("texto", entorno=entorno, catalogo_local=[])
        self.assertEqual(cliente.base_url, "http://127.0.0.1:9999/v1")
        self.assertEqual(cliente.modelo, "ollama/elegido")
        self.assertNotIn(CLAVE_FALSA, repr(cliente))
    def test_sin_catalogo_cae_al_siguiente(self):
        cliente = M.cliente_openai_compatible("texto", entorno={}, catalogo_local=[])
        self.assertEqual(cliente.proveedor, "openrouter")


class TestPasarela(unittest.TestCase):
    def test_pasarela_elige_por_capacidad(self):
        entorno = {
            M.PASARELA + "_URL": "https://pasarela.example/v1/",
            M.PASARELA + "_KEY": CLAVE_FALSA,
            M.PASARELA + "_MODELOS": "clef-flash, gpt-6-luna-decisions",
        }
        cliente = M.cliente_openai_compatible("decision", entorno=entorno, catalogo_local=[])
        self.assertEqual(cliente.proveedor, "experiential")
        self.assertEqual(cliente.base_url, "https://pasarela.example/v1")
        self.assertEqual(cliente.modelo, "gpt-6-luna-decisions")
        self.assertNotIn(CLAVE_FALSA, repr(cliente))
        self.assertIn("***", repr(cliente))
    def test_modelo_unico_de_pasarela(self):
        entorno = {M.PASARELA + "_URL": "https://p.example/v1", M.PASARELA + "_MODELO": "clef-flash"}
        cliente = M.cliente_openai_compatible("texto", entorno=entorno, catalogo_local=[])
        self.assertEqual(cliente.modelo, "clef-flash")
        self.assertEqual(cliente.api_key, "sin-clave")
    def test_pasarela_sin_modelos_no_se_inventa(self):
        entorno = {M.PASARELA + "_URL": "https://p.example/v1", M.PASARELA + "_KEY": CLAVE_FALSA}
        cliente = M.cliente_openai_compatible("texto", entorno=entorno, catalogo_local=[])
        self.assertEqual(cliente.proveedor, "openrouter")


class TestOpenRouter(unittest.TestCase):
    def test_reserva_gratuita(self):
        cliente = M.cliente_openai_compatible("codigo", entorno={}, catalogo_local=[])
        self.assertEqual(cliente.proveedor, "openrouter")
        self.assertEqual(cliente.base_url, M.OPENROUTER)
        self.assertTrue(cliente.modelo.endswith(":free"))
        self.assertIn("coder", cliente.modelo)
    def test_modelo_forzado(self):
        entorno = {"STARSEED_AGENTES_OPENROUTER_MODELO": "openrouter/free"}
        cliente = M.cliente_openai_compatible("texto", entorno=entorno, catalogo_local=[])
        self.assertEqual(cliente.modelo, "openrouter/free")


class TestEntornoYCliente(unittest.TestCase):
    def test_lee_env_sin_comillas_ni_comentarios(self):
        with tempfile.NamedTemporaryFile("w", delete=False, encoding="utf-8") as f:
            f.write("# comentario\nSTARSEED_PASARELA_EXPLABS_URL='https://x/v1'\nMALA\n")
            ruta = f.name
        try:
            entorno = M.leer_entorno(ruta, base={"PATH": "/bin"})
        finally:
            os.unlink(ruta)
        self.assertEqual(entorno["STARSEED_PASARELA_EXPLABS_URL"], "https://x/v1")
        self.assertEqual(entorno["PATH"], "/bin")
        self.assertNotIn("MALA", entorno)
    def test_iter_entrega_base_y_modelo(self):
        cliente = M.ClienteOpenAI("x", "https://x/v1", "m:free", CLAVE_FALSA)
        base, modelo = cliente
        self.assertEqual((base, modelo), ("https://x/v1", "m:free"))
        self.assertNotIn(CLAVE_FALSA, repr(cliente))


if __name__ == "__main__":
    unittest.main()
