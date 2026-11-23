# -*- coding: utf-8 -*-
"""DIR1121 · La misma ficha de canal en todos los medios.

Falla si un medio (Hermes, Antigravity, Codex, Claude, cartero, Telegram,
Astraura/Genesis o el panel de MetaGenesis) entrega una ficha distinta, si falta
un campo, si los nombres no salen del registro único o si un motor caro va antes
que uno gratuito donde no rinde.
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
import sincronizador_direccion as SD  # noqa: E402

CANONICOS = {"principal": "Principal", "general": "General", "audiovisual": "Audiovisual y diseño"}
CAMPOS = ("proposito", "especialidad", "decide", "no_decide", "herramientas",
          "motores", "memorias", "sin_alex", "con_alex", "releva")


def _texto(relativo):
    with open(os.path.join(RAIZ, relativo), encoding="utf-8") as archivo:
        return archivo.read()


class TestFichaUnica(unittest.TestCase):
    def test_todos_los_medios_entregan_exactamente_la_misma_ficha(self):
        for canal in F.CANALES:
            textos = {F.entregar(medio, canal) for medio in F.MEDIOS}
            self.assertEqual(1, len(textos), "medios con fichas distintas en %s" % canal)
            self.assertIn(F.MARCA, textos.pop())

    def test_cada_canal_declara_todos_los_campos_y_su_nombre_canonico(self):
        self.assertEqual(set(F.CANALES), set(SD.CANALES_ESPECIALIZADOS))
        for canal in F.CANALES:
            ficha = F.ficha_de(canal)
            for campo in CAMPOS:
                self.assertTrue(ficha.get(campo), "%s sin %s" % (canal, campo))
            self.assertEqual(CANONICOS[canal], ficha["nombre"])
            self.assertEqual(SD.NOMBRES_CANALES_POR_DEFECTO[canal], ficha["nombre"])

    def test_ayuda_y_estado_de_telegram_llevan_la_misma_ficha(self):
        for canal in F.CANALES:
            ficha = F.texto_ficha(canal)
            self.assertIn(ficha, F.para_ayuda(canal))
            self.assertIn(ficha, F.para_estado(canal))

    def test_motores_gratuitos_primero_y_claude_solo_donde_rinde(self):
        for canal in ("principal", "general"):
            primero = F.ficha_de(canal)["motores"][0]
            self.assertEqual("hermes", primero[0], canal)
        principal = [m[0] for m in F.ficha_de("principal")["motores"]]
        self.assertLess(principal.index("hermes"), principal.index("claude"))
        self.assertEqual("antigravity", F.ficha_de("audiovisual")["motores"][0][0])

    def test_chats_json_apunta_a_la_fuente_unica_y_a_los_mismos_canales(self):
        datos = json.loads(_texto("scripts/puente/chats.json"))
        fichas = datos["fichas"]
        self.assertEqual("scripts/puente/fichas_canales.py", fichas["fuente"])
        self.assertEqual(set(F.CANALES), set(fichas["canales"]))
        self.assertEqual(set(F.MEDIOS), set(fichas["medios"]))


class TestMediosCarganLaFicha(unittest.TestCase):
    def test_hermes_y_agy_la_llevan_en_el_prompt(self):
        for constructor in (M.orden_hermes, M.orden_agy):
            orden = constructor("hola", canal="principal")
            bandera = "-z" if constructor is M.orden_hermes else "-p"
            prompt = orden[orden.index(bandera) + 1]
            self.assertIn(F.texto_ficha("principal"), prompt)
            self.assertIn("hola", prompt)

    def test_prompt_con_ficha_no_se_duplica(self):
        una = M.prompt_con_ficha("principal", "hola")
        dos = M.prompt_con_ficha("principal", una)
        self.assertEqual(una, dos)
        self.assertEqual(1, una.count(F.MARCA))

    def test_cartero_da_la_ficha_al_presidente(self):
        with tempfile.TemporaryDirectory() as d:
            ctx = C._contexto(raiz=d, ahora=1000.0, estado={})
        self.assertIn(F.texto_ficha("principal"), ctx)

    def test_codex_recibe_la_ficha_en_la_entrada(self):
        self.assertIn(F.MARCA, M.prompt_con_ficha("principal",
                                                  M.prompt_con_permisos("hola")))


if __name__ == "__main__":
    unittest.main()
