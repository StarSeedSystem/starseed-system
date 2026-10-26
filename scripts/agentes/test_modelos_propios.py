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

    def test_local_primero_y_elige_por_capacidad(self):
        visto = []

        def sonda(base, clave=""):
            visto.append(base)
            return ["qwen/qwen3-coder:free", "gemma3n:12b-vision", "bitnet/bitnet-b1.58"]

        c = M.cliente_openai_compatible("codigo", entorno={}, sonda=sonda)
        self.assertEqual(visto, [M.SERVIDOR_IA])  # el local contesta: no se sondea a expensas de nadie
        self.assertEqual(c.origen, "servidor-propio")
        self.assertEqual(c.base_url, M.SERVIDOR_IA)
        self.assertEqual(c.modelo, "qwen/qwen3-coder:free")
        self.assertEqual(c.clave, "")  # en main la clave es una cadena ("" sin token), no None
        v = M.cliente_openai_compatible("vision", entorno={}, sonda=sonda)
        self.assertEqual(v.origen, "servidor-propio")
        self.assertIn("gemma", v.modelo)

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

    def test_sin_local_usa_experiential_y_no_filtra_la_clave(self):
        env = {
            "STARSEED_PASARELA_EXPLABS_KEY": "xpl_secreta",
            "STARSEED_PASARELA_EXPLABS_MODELOS": "clef-flash, deepseek-x",
            "STARSEED_PASARELA_EXPLABS_URL": "https://pasarela.local/v1/",
        }
        visto = []

        def sonda(base, clave=""):
            visto.append(base)
            return []

        c = M.cliente_openai_compatible("chat", entorno=env, sonda=sonda)
        # Relevo en orden: solo se sondea el local (que no da modelos). La pasarela no se sondea:
        # como el env ya trae MODELOS, se elige de la lista sin gastar la petición de /models.
        self.assertEqual(visto, [M.SERVIDOR_IA])
        self.assertEqual(c.origen, "experiential")
        self.assertEqual(c.base_url, "https://pasarela.local/v1")  # sin la barra final del env
        self.assertEqual(c.modelo, "clef-flash")
        self.assertEqual(c.clave, "xpl_secreta")
        self.assertEqual(c.cabeceras(), {"Authorization": "Bearer xpl_secreta"})  # útil, no oculta
        self.assertNotIn("xpl_secreta", repr(c))
        self.assertNotIn("xpl_secreta", str(visto))

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

    def test_el_entorno_inyectado_manda_sobre_el_archivo(self):
        texto = "STARSEED_PASARELA_EXPLABS_KEY=vieja\nSTARSEED_PASARELA_EXPLABS_MODELOS=m1\n"
        env = {"STARSEED_PASARELA_EXPLABS_KEY": "nueva"}
        c = M.cliente_openai_compatible("texto", entorno=env, leer_env=lambda: texto, sonda=self.sonda)
        self.assertEqual(c.origen, "experiential")
        self.assertEqual(c.clave, "nueva")  # lo ya exportado manda sobre el archivo de claves

    def test_la_clave_nunca_sale_en_el_repr(self):
        c = M.ClienteOpenAI("http://x/v1", "m", "clave-secreta")
        self.assertNotIn("clave-secreta", repr(c))


if __name__ == "__main__":
    unittest.main()
