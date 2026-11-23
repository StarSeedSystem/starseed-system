# -*- coding: utf-8 -*-
"""CAN1121C · Los tres canales entregan la MISMA ficha en todos los medios.

La ficha vive en UNA sola fuente (`scripts/puente/fichas_canales.py`) y el nombre visible
sale del registro (`~/.starseed/canales-direccion.json`). Aquí se compara que motores,
cartero y el registro de chats entreguen exactamente el mismo texto para cada canal.
"""
import json
import os
import sys
import tempfile
import unittest

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(os.path.dirname(AQUI))
if AQUI not in sys.path:
    sys.path.insert(0, AQUI)

import fichas_canales as F  # noqa: E402
import motores_director as M  # noqa: E402
import cartero_director as C  # noqa: E402

CANALES = ("principal", "general", "audiovisual")
CAMPOS = (
    "proposito", "especialidad", "decide", "no_decide", "herramientas",
    "habilidades", "motores", "memorias", "sin_alex", "con_alex", "releva",
)
NOMBRES = {
    "principal": "Principal",
    "general": "General",
    "audiovisual": "Audiovisual y diseño",
}


def _config(nombre_principal="Principal"):
    return {
        "principal": {"nombre": nombre_principal},
        "general": {"nombre": "General"},
        "audiovisual": {"nombre": "Audiovisual y diseño"},
    }


class TestFuenteUnica(unittest.TestCase):
    def test_los_tres_canales_tienen_ficha_completa(self):
        self.assertEqual(F.CANALES, CANALES)
        for canal in CANALES:
            ficha = F.ficha_de_canal(canal)
            self.assertEqual(ficha["clave"], canal)
            for campo in CAMPOS:
                self.assertTrue(str(ficha.get(campo) or "").strip(), "%s/%s vacío" % (canal, campo))

    def test_el_nombre_sale_del_registro_no_se_escribe_a_mano(self):
        cfg = _config("Presidencia de prueba")
        texto = F.texto_ficha("principal", canales_cfg=cfg)
        self.assertIn("Presidencia de prueba", texto)
        self.assertNotEqual(F.huella_ficha("principal"), F.huella_ficha("principal", canales_cfg=cfg))

    def test_cada_canal_es_distinto_y_no_se_mezcla(self):
        textos = {canal: F.texto_ficha(canal, canales_cfg=_config()) for canal in CANALES}
        self.assertEqual(len(set(textos.values())), len(CANALES))
        for canal, texto in textos.items():
            self.assertIn(NOMBRES[canal], texto)

    def test_canal_desconocido_no_inventa_ficha(self):
        with self.assertRaises(ValueError):
            F.ficha_de_canal("otro")


class TestMismaFichaEnLosMotores(unittest.TestCase):
    def test_motores_publican_la_misma_ficha_que_la_fuente(self):
        for canal in CANALES:
            esperado = F.texto_ficha(canal)
            self.assertEqual(M.ficha_canal(canal), esperado)
            self.assertIn(esperado, M.prompt_con_permisos("hola", canal=canal))
            self.assertIn(esperado, M.prompt_director("p", [], "", canal=canal))

    def test_hermes_agy_y_codex_reciben_la_ficha(self):
        esperado = F.texto_ficha("principal")
        orden = M.orden_hermes("hola", con_permisos=True)
        self.assertIn(esperado, orden[orden.index("-z") + 1])
        orden = M.orden_agy("pregunta")
        self.assertIn(esperado, orden[orden.index("-p") + 1])
        self.assertIn(esperado, M.prompt_con_permisos("tarea", canal="principal"))

    def test_la_ficha_no_amplia_los_permisos_vetados(self):
        texto = M.prompt_con_permisos("hola")
        self.assertIn("Vetado", texto)
        self.assertIn("produccion_reanudar", texto)


class TestMismaFichaEnElCartero(unittest.TestCase):
    AHORA = 1_700_000_000.0

    def test_el_contexto_del_presidente_lleva_la_ficha_principal(self):
        with tempfile.TemporaryDirectory() as d:
            contexto = C._contexto(raiz=d, ahora=self.AHORA)
        self.assertIn(F.texto_ficha("principal"), contexto)

    def test_el_contexto_puede_llevar_la_ficha_de_otro_canal(self):
        with tempfile.TemporaryDirectory() as d:
            contexto = C._contexto(raiz=d, ahora=self.AHORA, canal="general")
        self.assertIn(F.texto_ficha("general"), contexto)


class TestMismaFichaEnElRegistroDeChats(unittest.TestCase):
    def _chats(self):
        with open(os.path.join(AQUI, "chats.json"), encoding="utf-8") as archivo:
            return json.load(archivo)

    def test_chats_declara_la_fuente_y_la_ficha_de_cada_canal(self):
        datos = self._chats()
        self.assertEqual(datos["_fichas_fuente"], "scripts/puente/fichas_canales.py")
        for entorno, entrada in datos["entornos"].items():
            for canal in CANALES:
                self.assertEqual(entrada["canales"][canal]["ficha"], canal, entorno)

    def test_la_ficha_declarada_es_la_misma_que_entrega_la_fuente(self):
        datos = self._chats()
        for entrada in datos["entornos"].values():
            for canal in CANALES:
                self.assertEqual(F.texto_ficha(entrada["canales"][canal]["ficha"]), F.texto_ficha(canal))


if __name__ == "__main__":
    unittest.main()
