# -*- coding: utf-8 -*-
"""test_egm_revision · pruebas de los peces revisores (§2, ola-1104).

Unittest con `llamar` simulado: sin red, sin claves, sin archivos.
Casos del contrato: el pez solo ve el artefacto; JSON roto no es objeción;
un `bloquea` sin resolver para la ola; `revisar` etiqueta el pez y aguanta
un `llamar` que lanza.
"""

import importlib.util
import os
import sys
import unittest

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
if DIRECTORIO not in sys.path:
    sys.path.insert(0, DIRECTORIO)

_ruta_mod = os.path.join(DIRECTORIO, "egm_revision.py")
_spec = importlib.util.spec_from_file_location("egm_revision", _ruta_mod)
_egm = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_egm)

OBJECION = (
    '{"objeciones": [{"titulo": "Primera tarea pegada a otra", '
    '"detalle": "las dos tocan rota.py", "gravedad": "bloquea"}, '
    '{"titulo": "Título sin acento", "detalle": "español", "gravedad": "menor"}]}'
)


class PromptDePezTest(unittest.TestCase):
    def test_lleva_el_artefacto_y_el_tipo(self):
        texto = _egm.prompt_de_pez("Tanda de 3 tareas sobre rota.py", "propuesta")
        self.assertIn("Tanda de 3 tareas sobre rota.py", texto)
        self.assertIn("propuesta", texto)

    def test_pide_gravedad_y_salida_json(self):
        texto = _egm.prompt_de_pez("artefacto", "propuesta")
        self.assertIn("bloquea", texto)
        self.assertIn("objeciones", texto)

    def test_caracteres_raros_no_rompen_nada(self):
        texto = _egm.prompt_de_pez('texto con "comillas" y \n saltos', "respuesta")
        self.assertIsInstance(texto, str)
        self.assertTrue(texto.strip())

    def test_tipo_desconocido_da_prompt_válido(self):
        texto = _egm.prompt_de_pez("artefacto", "planeta")
        self.assertIn("artefacto", texto)


class LeerObjecionesTest(unittest.TestCase):
    def test_json_roto_es_sin_objeciones(self):
        self.assertEqual(_egm.leer_objeciones("esto no es JSON {{{"), [])

    def test_respuesta_vacia_y_no_texto(self):
        self.assertEqual(_egm.leer_objeciones(""), [])
        self.assertEqual(_egm.leer_objeciones(None), [])

    def test_envoltorio_objeciones(self):
        salida = _egm.leer_objeciones(OBJECION)
        self.assertEqual(len(salida), 2)
        self.assertEqual(salida[0]["gravedad"], "bloquea")
        self.assertEqual(salida[0]["titulo"], "Primera tarea pegada a otra")
        self.assertEqual(salida[1]["gravedad"], "menor")
        self.assertFalse(salida[1]["resuelta"])

    def test_array_json_plain_tambien_va(self):
        salida = _egm.leer_objeciones('[{"titulo": "t", "gravedad": "importa"}]')
        self.assertEqual(len(salida), 1)
        self.assertEqual(salida[0]["gravedad"], "importa")

    def test_gravedad_fuera_de_catalogo_y_sin_titulo_descartadas(self):
        malas = ('[{"titulo": "t", "gravedad": "catastrófica"}, '
                 '{"titulo": "  ", "gravedad": "menor"}, '
                 '{"gravedad": "menor"}]')
        self.assertEqual(_egm.leer_objeciones(malas), [])

    def test_envoltorio_no_listado(self):
        self.assertEqual(_egm.leer_objeciones('{"objeciones": "muchas"}'), [])
        self.assertEqual(_egm.leer_objeciones('{"otra": 1}'), [])


class OlaPasaTest(unittest.TestCase):
    def test_sin_objeciones_pasa(self):
        self.assertEqual(_egm.ola_pasa([]), (True, []))

    def test_menor_e_importa_no_para_la_ola(self):
        objeciones = [{"gravedad": "menor"}, {"gravedad": "importa"}]
        pasa, bloqueos = _egm.ola_pasa(objeciones)
        self.assertTrue(pasa)
        self.assertEqual(bloqueos, [])

    def test_bloquea_sin_resolver_para_la_ola(self):
        bloqueo = {"gravedad": "bloquea", "resuelta": False}
        pasa, bloqueos = _egm.ola_pasa([bloqueo])
        self.assertFalse(pasa)
        self.assertEqual(bloqueos, [bloqueo])

    def test_bloquea_resuelta_no_para(self):
        resuelta = [{"gravedad": "bloquea", "resuelta": True}]
        self.assertEqual(_egm.ola_pasa(resuelta), (True, []))


class RevisarTest(unittest.TestCase):
    def test_llama_con_el_prompt_de_pez_y_etiqueta_los_peces(self):
        vistos = []

        def llamar(modelo, prompt):
            vistos.append((modelo, prompt))
            return OBJECION

        salida = _egm.revisar("artefacto de prueba", "propuesta", llamar,
                              ["m1", "m2", "m3"], n=2)
        self.assertEqual([m for m, _ in vistos], ["m1", "m2"])
        for _, prompt in vistos:
            self.assertIn("artefacto de prueba", prompt)
        peces = {o["pez"] for o in salida}
        self.assertEqual(peces, {"m1", "m2"})
        self.assertEqual(len(salida), 4)

    def test_llamar_que_lanza_solo_pierde_a_ese_pez(self):
        def llamar(modelo, prompt):
            if modelo == "m1":
                raise RuntimeError("pasarela colgada")
            return '{"objeciones": []}'
        salida = _egm.revisar("artefacto", "propuesta", llamar,
                              ["m1", "m2"], n=2)
        self.assertEqual(salida, [])

    def test_respuesta_vacia_o_rota_del_pez_sin_objeciones(self):
        def llamar(modelo, prompt):
            return ""
        self.assertEqual(_egm.revisar("artefacto", "propuesta", llamar,
                                      ["m1"]), [])

    def test_n_cero_no_llama_a_nadie(self):
        llamadas = []

        def llamar(modelo, prompt):
            llamadas.append(modelo)
            return ""
        _egm.revisar("arte", "propuesta", llamar, ["m1", "m2"], n=0)
        self.assertEqual(llamadas, [])

    def test_modelos_nulo_es_nadie(self):
        self.assertEqual(_egm.revisar("arte", "propuesta", lambda m, p: "",
                                      None), [])


class FlujoCompletoTest(unittest.TestCase):
    """revisar → leer de nuevo → ola_pasa: el recorrido del contrato §2."""

    def test_revisar_y_decidir(self):
        def llamar(modelo, prompt):
            return OBJECION if modelo == "m2" else '{"objeciones": []}'
        objeciones = _egm.revisar("tanda de tareas", "propuesta", llamar,
                                  ["m1", "m2"], n=2)
        pasa, bloqueos = _egm.ola_pasa(objeciones)
        self.assertFalse(pasa)
        self.assertEqual(len(bloqueos), 1)
        self.assertEqual(bloqueos[0]["pez"], "m2")

    def test_revisar_limpia_y_la_ola_pasa(self):
        def llamar(modelo, prompt):
            return '{"objeciones": [{"titulo": "m", "gravedad": "menor"}]}'
        objeciones = _egm.revisar("tanda limpia", "propuesta", llamar,
                                  ["m1", "m2"], n=2)
        pasa, _ = _egm.ola_pasa(objeciones)
        self.assertTrue(pasa)


if __name__ == "__main__":
    unittest.main()
