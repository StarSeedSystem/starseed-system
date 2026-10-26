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

    def test_el_entorno_manda_sobre_el_archivo_de_claves(self):
        def leer_archivo():
            return 'export STARSEED_PASARELA_EXPLABS_KEY="vieja"\nSTARSEED_PASARELA_EXPLABS_MODELOS=m-viejo\n'

        c = M.cliente_openai_compatible(
            "texto",
            entorno={
                "STARSEED_PASARELA_EXPLABS_KEY": "nueva",
                "STARSEED_PASARELA_EXPLABS_MODELOS": "m-nuevo",
            },
            leer_env=leer_archivo,
            sonda=self.sonda,
        )
        self.assertEqual(c.origen, "experiential")
        self.assertEqual(c.clave, "nueva")
        self.assertEqual(c.modelo, "m-nuevo")
        self.assertEqual(c.cabeceras(), {"Authorization": "Bearer nueva"})

    def test_la_url_inyectada_de_pasarela_queda_sin_barra_final(self):
        c = M.cliente_openai_compatible(
            "texto",
            entorno={
                "STARSEED_PASARELA_EXPLABS_URL": "https://pasarela.local/v1/",
                "STARSEED_PASARELA_EXPLABS_KEY": "xpl_secreta",
                "STARSEED_PASARELA_EXPLABS_MODELOS": "clef-flash",
            },
            sonda=self.sonda,
        )
        self.assertEqual(c.origen, "experiential")
        self.assertEqual(c.base_url, "https://pasarela.local/v1")
        self.assertNotIn("xpl_secreta", repr(c))

    def test_la_clave_nunca_sale_en_el_repr(self):
        c = M.ClienteOpenAI("http://x/v1", "m", "clave-secreta")
        self.assertNotIn("clave-secreta", repr(c))


class Relevo(unittest.TestCase):
    """El orden de la casa completo (propio → Experiential → OpenRouter) con la API de hoy."""

    @staticmethod
    def _sonda_vacia(base, clave=""):
        return None

    def test_con_todas_las_fuentes_vivas_gana_la_primera_del_orden(self):
        def solo_propio(base, clave=""):
            return ["ollama/qwen2.5-coder:7b"] if base == M.SERVIDOR_IA else None

        entorno = {
            "STARSEED_PASARELA_EXPLABS_KEY": "k1",
            "STARSEED_PASARELA_EXPLABS_MODELOS": "clef-flash",
            "OPENROUTER_API_KEY": "k2",
        }
        c = M.cliente_openai_compatible("texto", entorno=entorno, sonda=solo_propio)
        self.assertEqual(c.origen, "servidor-propio")

        c2 = M.cliente_openai_compatible("texto", entorno=entorno, sonda=self._sonda_vacia)
        self.assertEqual(c2.origen, "experiential")
        self.assertEqual(c2.modelo, "clef-flash")

        def solo_openrouter(base, clave=""):
            return ["z/prueba:free"] if base == M.OPENROUTER else None

        c3 = M.cliente_openai_compatible(
            "texto", entorno={"OPENROUTER_API_KEY": "k2"}, sonda=solo_openrouter)
        self.assertEqual(c3.origen, "openrouter:free")
        self.assertEqual(c3.modelo, "z/prueba:free")


if __name__ == "__main__":
    unittest.main()
