# -*- coding: utf-8 -*-
"""CAN1121C · una sola ficha por canal y la MISMA en todos los medios.

La ficha vive en `fichas_canales.py`. Aquí se comprueba que los tres canales la
tienen completa, que los motores van gratis primero y que cada medio (cartero,
Hermes, Antigravity, Codex, Claude, los bots de Telegram y el bot del A1) entrega
el mismo cuerpo, sin recortes ni versiones propias.
"""
import json
import os
import sys
import tempfile
import unittest

AQUI = os.path.dirname(os.path.abspath(__file__))
if AQUI not in sys.path:
    sys.path.insert(0, AQUI)

import cartero_director as C  # noqa: E402
import fichas_canales as F  # noqa: E402
import motores_director as M  # noqa: E402
import peticiones_telegram as P  # noqa: E402
import sincronizador_direccion as S  # noqa: E402

SECCIONES = ("proposito", "especialidad", "decide", "no_decide", "herramientas",
             "motores", "memorias", "sin_alex", "con_alex", "releva")


def _cuerpo(texto):
    return F.cuerpo_de(texto)


class TestFichasCompletas(unittest.TestCase):
    def test_los_tres_canales_tienen_la_ficha_completa(self):
        self.assertEqual(set(F.CANALES), {"principal", "general", "audiovisual"})
        for canal in F.CANALES:
            ficha = F.ficha(canal)
            for clave in SECCIONES:
                self.assertTrue(ficha.get(clave), "%s sin %s" % (canal, clave))
            self.assertEqual([], F.validar(canal))

    def test_los_nombres_salen_del_registro_unico(self):
        self.assertEqual("Principal", F.nombre_canal("principal"))
        self.assertEqual("General", F.nombre_canal("general"))
        self.assertEqual("Audiovisual y diseño", F.nombre_canal("audiovisual"))

    def test_motores_gratis_primero_y_creditos_solo_donde_rinden(self):
        for canal in F.CANALES:
            motores = F.ficha(canal)["motores"]
            costes = [m["coste"] for m in motores]
            self.assertEqual("gratis", costes[0], canal)
            libre = [i for i, c in enumerate(costes) if c == "gratis"]
            credito = [i for i, c in enumerate(costes) if c != "gratis"]
            if libre and credito:
                self.assertLess(max(libre), min(credito),
                                "%s pone un crédito antes que un motor gratis" % canal)


class TestMismaFichaEnTodosLosMedios(unittest.TestCase):
    def test_cada_medio_entrega_el_mismo_cuerpo_sin_recortes(self):
        for canal in F.CANALES:
            esperado = F.texto_ficha(canal)
            for medio in F.MEDIOS:
                texto = F.texto_para_medio(medio, canal)
                self.assertEqual(esperado, _cuerpo(texto), "%s/%s" % (canal, medio))

    def test_el_cartero_da_la_ficha_al_presidente(self):
        with tempfile.TemporaryDirectory() as d:
            contexto = C._contexto(raiz=d, estado={})
        self.assertIn(F.texto_ficha("principal"), contexto)

    def test_motores_llevan_la_ficha_de_su_canal(self):
        for canal in F.CANALES:
            cuerpo = F.texto_ficha(canal)
            prompt = M.prompt_con_permisos("hola", canal=canal)
            self.assertIn(cuerpo, prompt)
            self.assertEqual(prompt, M.prompt_con_permisos(prompt, canal=canal))

    def test_claude_hermes_agy_y_codex_reciben_la_ficha(self):
        cuerpo = F.texto_ficha("principal")
        orden_claude = M.orden_claude("hola")
        self.assertIn(cuerpo, orden_claude[orden_claude.index("--append-system-prompt") + 1])
        orden_hermes = M.orden_hermes("hola", con_permisos=True)
        self.assertIn(cuerpo, orden_hermes[orden_hermes.index("-z") + 1])
        orden_agy = M.orden_agy("hola")
        self.assertIn(cuerpo, orden_agy[orden_agy.index("-p") + 1])
        self.assertIn(cuerpo, M.prompt_con_permisos("hola"))

    def test_los_bots_de_telegram_dan_la_ficha_de_su_canal(self):
        for canal in F.CANALES:
            for orden in ("ayuda", "estado"):
                respuesta = S.atender_orden_director(
                    orden, canal=canal, estado_fn=lambda: "estado vivo",
                )
                self.assertIn(F.texto_ficha(canal), respuesta, "%s/%s" % (canal, orden))

    def test_el_bot_audiovisual_del_a1_da_su_ficha(self):
        cuerpo = F.texto_ficha("audiovisual")
        self.assertIn(cuerpo, P.texto_ayuda())
        self.assertIn(cuerpo, P.texto_estado([], {}))


class TestRegistroDeChats(unittest.TestCase):
    def test_chats_declara_la_ficha_y_cada_entorno_su_canal(self):
        with open(os.path.join(AQUI, "chats.json"), encoding="utf-8") as archivo:
            datos = json.load(archivo)
        ficha = datos.get("ficha_canales") or {}
        self.assertEqual("scripts/puente/fichas_canales.py", ficha.get("fuente"))
        self.assertEqual(set(F.CANALES), set(ficha.get("canales") or []))
        self.assertEqual(set(F.MEDIOS), set(ficha.get("medios") or []))
        for entorno, entrada in (datos.get("entornos") or {}).items():
            self.assertIn(entrada.get("ficha_canal"), F.CANALES, entorno)


if __name__ == "__main__":
    unittest.main()
