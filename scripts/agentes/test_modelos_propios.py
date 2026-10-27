# -*- coding: utf-8 -*-
"""modelos_propios: el enrutador propio en orden, sin red y sin claves reales."""
import json
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import modelos_propios as M  # noqa: E402


class Elegir(unittest.TestCase):
    def test_capacidad_elige_la_pista_correcta(self):
        modelos = ["ollama/qwen2.5-coder:7b", "ollama/llava-vision", "experiential/jev-latest"]
        self.assertEqual(M.elegir_modelo(modelos, "codigo"), "ollama/qwen2.5-coder:7b")
        self.assertEqual(M.elegir_modelo(modelos, "visión"), "ollama/llava-vision")
        self.assertEqual(M.elegir_modelo(modelos, "decisiones"), "experiential/jev-latest")

    def test_sin_pistas_o_vacio(self):
        self.assertEqual(M.elegir_modelo(["a", "b"], "capacidad-rara"), "a")
        self.assertIsNone(M.elegir_modelo([], "texto"))
        self.assertIsNone(M.elegir_modelo(["", None, 3], "texto"))

    def test_alias_y_preferencias_de_capacidad(self):
        modelos = ["chat/x", "reason/r1", "code/coder"]
        self.assertEqual(M.elegir_modelo(modelos, "chat"), "chat/x")
        self.assertEqual(M.elegir_modelo(modelos, "reasoning"), "reason/r1")
        self.assertEqual(M.elegir_modelo(modelos, "code"), "code/coder")
        self.assertEqual(M.elegir_modelo(["ollama/llama", "bitnet/bonsai"]), "bitnet/bonsai")
        self.assertEqual(M.elegir_modelo(["bitnet/x", "deepseek/r1"], "razon"), "deepseek/r1")


class Env(unittest.TestCase):
    def test_parsea_export_comillas_y_comentarios(self):
        texto = (
            "# claves\n"
            'export STARSEED_PASARELA_EXPLABS_KEY="secreto"\n'
            "OPENROUTER_API_KEY='otro=con=iguales'\n"
            "linea rota\n"
            "9MAL=no\n"
        )
        self.assertEqual(M.parsear_env(texto), {
            "STARSEED_PASARELA_EXPLABS_KEY": "secreto",
            "OPENROUTER_API_KEY": "otro=con=iguales",
        })

    def test_catalogos_con_formas_distintas(self):
        self.assertEqual(M.modelos_gratuitos([{"id": "a"}, "b", None]), ["a", "b"])
        self.assertEqual(M.modelos_gratuitos({"modelos": ["c"]}), ["c"])
        self.assertEqual(M.modelos_gratuitos({"data": [{"id": "d"}]}), ["d"])
        self.assertEqual(M.modelos_gratuitos(None), [])


class Cliente(unittest.TestCase):
    def setUp(self):
        self.mundos = {}

        def sonda(base, clave=""):
            return self.mundos.get(base)

        self.sonda = sonda

    def test_servidor_propio_primero(self):
        self.mundos[M.SERVIDOR_IA] = ["ollama/qwen2.5-coder:7b", "bitnet/bitnet-b1.58"]
        c = M.cliente_openai_compatible("codigo", entorno={}, sonda=self.sonda)
        self.assertEqual(c.origen, "servidor-propio")
        self.assertEqual(c.base_url, M.SERVIDOR_IA)
        self.assertEqual(c.modelo, "ollama/qwen2.5-coder:7b")
        base, modelo = c
        self.assertEqual((base, modelo), (M.SERVIDOR_IA, c.modelo))

    def test_servidor_propio_prefiere_bitnet_en_texto(self):
        """Con capacidad por defecto, el servidor propio gana y BitNet va antes que Llama."""
        self.mundos[M.SERVIDOR_IA] = ["ollama/llama", "bitnet/bonsai"]
        c = M.cliente_openai_compatible("texto", entorno={}, sonda=self.sonda)
        self.assertEqual(
            (c.origen, c.base_url, c.modelo),
            ("servidor-propio", M.SERVIDOR_IA, "bitnet/bonsai"),
        )

    def test_relevo_a_experiential(self):
        entorno = {
            "STARSEED_PASARELA_EXPLABS_KEY": "clave-experiential",
            "STARSEED_PASARELA_EXPLABS_MODELOS": "clef-flash,jev-latest",
        }
        c = M.cliente_openai_compatible("texto", entorno=entorno, sonda=self.sonda)
        self.assertEqual(c.origen, "experiential")
        self.assertEqual(c.base_url, M.EXPLABS)
        self.assertEqual(c.modelo, "clef-flash")
        self.assertEqual(c.cabeceras(), {"Authorization": "Bearer clave-experiential"})

    def test_openrouter_solo_gratis_aunque_el_de_pago_encaje_mejor(self):
        entorno = {"OPENROUTER_API_KEY": "clave-openrouter"}
        self.mundos[M.OPENROUTER] = ["openai/gpt-5-coder", "meta/llama:free"]
        c = M.cliente_openai_compatible("codigo", entorno=entorno, sonda=self.sonda)
        self.assertEqual(c.origen, "openrouter:free")
        self.assertEqual(c.modelo, "meta/llama:free")

    def test_un_modelo_de_pago_configurado_no_se_usa(self):
        entorno = {"OPENROUTER_API_KEY": "k", "STARSEED_OPENROUTER_MODELO": "openai/gpt-5"}
        self.assertIsNone(M.cliente_openai_compatible("texto", entorno=entorno, sonda=self.sonda))

    def test_sin_fuentes_devuelve_none(self):
        self.assertIsNone(M.cliente_openai_compatible("texto", entorno={}, sonda=self.sonda))

    def test_lista_de_gratuitos_desde_archivo_inyectado(self):
        entorno = {"OPENROUTER_API_KEY": "k", "STARSEED_OPENROUTER_GRATUITOS": "/tmp/x.json"}
        datos = json.dumps({"modelos": ["meta/llama:free"]})
        c = M.cliente_openai_compatible(
            "texto", entorno=entorno, sonda=self.sonda, leer_archivo=lambda ruta: datos)
        self.assertEqual(c.modelo, "meta/llama:free")

    def test_lee_el_archivo_de_claves_inyectado(self):
        texto = 'export STARSEED_PASARELA_EXPLABS_KEY="clave"\nSTARSEED_PASARELA_EXPLABS_MODELOS=clef-flash\n'
        c = M.cliente_openai_compatible("texto", leer_env=lambda: texto, sonda=self.sonda)
        self.assertEqual(c.origen, "experiential")

    def test_la_clave_nunca_sale_en_el_repr(self):
        c = M.ClienteOpenAI("http://x/v1", "m", "clave-secreta")
        self.assertNotIn("clave-secreta", repr(c))

    def test_modelo_y_url_del_servidor_forzados(self):
        entorno = {
            "STARSEED_SERVIDOR_IA_URL": "http://127.0.0.1:9999/v1/",
            "STARSEED_SERVIDOR_IA_MODELO": "ollama/elegido",
            "STARSEED_SERVIDOR_IA_TOKEN": "clave-falsa",
        }
        self.mundos["http://127.0.0.1:9999/v1"] = []
        c = M.cliente_openai_compatible("texto", entorno=entorno, sonda=self.sonda)
        self.assertEqual(c.base_url, "http://127.0.0.1:9999/v1")
        self.assertEqual(c.modelo, "ollama/elegido")
        self.assertNotIn("clave-falsa", repr(c))

    def test_pasarela_elige_por_capacidad(self):
        entorno = {
            "STARSEED_PASARELA_EXPLABS_KEY": "clave-falsa",
            "STARSEED_PASARELA_EXPLABS_MODELOS": "clef-flash, jev-latest",
        }
        c = M.cliente_openai_compatible("decision", entorno=entorno, sonda=self.sonda)
        self.assertEqual(c.origen, "experiential")
        self.assertEqual(c.modelo, "jev-latest")
        self.assertNotIn("clave-falsa", repr(c))

    def test_pasarela_sin_modelos_cae_a_openrouter(self):
        entorno = {
            "STARSEED_PASARELA_EXPLABS_KEY": "clave-falsa",
            "OPENROUTER_API_KEY": "k",
        }
        self.mundos[M.OPENROUTER] = ["meta/llama:free"]
        c = M.cliente_openai_compatible("texto", entorno=entorno, sonda=self.sonda)
        self.assertEqual(c.origen, "openrouter:free")
        self.assertEqual(c.modelo, "meta/llama:free")

    def test_openrouter_gratis_prefiere_la_capacidad(self):
        self.mundos[M.OPENROUTER] = ["openai/gpt-5-coder", "meta/llama:free", "qwen/coder:free"]
        c = M.cliente_openai_compatible(
            "codigo", entorno={"OPENROUTER_API_KEY": "k"}, sonda=self.sonda)
        self.assertEqual(c.base_url, M.OPENROUTER)
        self.assertEqual(c.modelo, "qwen/coder:free")

    def test_modelo_gratuito_forzado(self):
        entorno = {"OPENROUTER_API_KEY": "k", "STARSEED_OPENROUTER_MODELO": "meta/llama:free"}
        c = M.cliente_openai_compatible("texto", entorno=entorno, sonda=self.sonda)
        self.assertEqual(c.modelo, "meta/llama:free")


if __name__ == "__main__":
    unittest.main()
