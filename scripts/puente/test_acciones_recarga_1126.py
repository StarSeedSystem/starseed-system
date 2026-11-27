# -*- coding: utf-8 -*-
"""ACC1126A · «Te toca a ti» enseña las pasarelas que piden recarga de pago como DECISIÓN (recargar o retirar).

Respuestas simuladas, copiadas de lo medido el 26-11: apinex (402 «single top-up»), DeepSeek (402 «Insufficient
Balance») y xAI (403 «used all available credits»). Ninguna prueba sale a la red ni paga nada.
"""
import importlib.util
import json
import os
import tempfile
import unittest

_ruta = os.path.join(os.path.dirname(os.path.abspath(__file__)), "acciones-de-alex.py")
_spec = importlib.util.spec_from_file_location("acciones_de_alex_acc1126a", _ruta)
A = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(A)

APINEX = {"clave": "apinex", "modelo": "free/glm-5.3-flash", "http": "402", "estado": "sin_cupo",
          "mensaje": "Make a single top-up of $5 or more to unlock 25M free tokens daily for life. "
                     "Top up at https://apinex.bond/billing"}
DEEPSEEK = {"clave": "deepseek", "modelo": "deepseek-v4-pro", "http": "402", "estado": "sin_cupo",
            "mensaje": "Insufficient Balance (request_id: 353688e3-837f-4ac3-afdb-9527d2883c63)"}
XAI = {"clave": "xai", "modelo": "grok-4.6", "http": "403", "estado": "sin_cupo",
       "mensaje": "Your team 57448b5a-d437-43bc-aa7f-45482615ff1d has either used all available credits or reached "
                  "its monthly spending limit."}
XKIRO = {"clave": "xkiro", "modelo": "qwen/qwen3-coder-plus:free", "http": "429", "estado": "sin_cupo",
         "mensaje": "You've reached today's free-model token quota."}


def _ids(acciones):
    return [a["id"] for a in acciones]


class TestRecargaComoDecision(unittest.TestCase):
    def construir(self, pasarelas, **kw):
        return A.construir_acciones(pasarelas, sorted(A.CLAVES_DEL_ENJAMBRE), **kw)

    def test_apinex_deepseek_y_xai_salen_como_decision_de_pago(self):
        acciones = self.construir([APINEX, DEEPSEEK, XAI], uso={"apinex": 12})
        for clave in ("apinex", "deepseek", "xai"):
            self.assertIn("pasarela-%s-recarga" % clave, _ids(acciones))
        apinex = next(a for a in acciones if a["id"] == "pasarela-apinex-recarga")
        self.assertEqual(apinex["categoria"], "pago")
        self.assertTrue(apinex["aprobable"] and apinex["rechazable"])
        self.assertEqual((apinex["etiqueta_aprobar"], apinex["etiqueta_rechazar"]), ("Ya recargué", "Retirar"))
        # Lo que pide, literal; el enlace exacto de pago que da su propia respuesta; qué desbloquea y cuánto se usaba.
        self.assertIn("single top-up of $5", apinex["por_que"])
        self.assertEqual(apinex["enlace"], "https://apinex.bond/billing")
        self.assertIn("25 M de tokens", apinex["detalle"])
        self.assertIn("tareas hechas antes con ella: 12", apinex["detalle"])
        self.assertIn("nunca paga", apinex["por_que_no_lo_hago_yo"])

    def test_enlace_de_pago_conocido_cuando_la_respuesta_no_trae_uno(self):
        acciones = self.construir([DEEPSEEK])
        deepseek = next(a for a in acciones if a["id"] == "pasarela-deepseek-recarga")
        self.assertEqual(deepseek["enlace"], "https://platform.deepseek.com/top_up")

    def test_cupo_diario_que_se_repone_solo_no_pide_nada(self):
        self.assertNotIn("pasarela-xkiro-recarga", _ids(self.construir([XKIRO])))

    def test_no_se_pide_fichaje_a_quien_ya_no_lo_tiene(self):
        ids = _ids(self.construir([APINEX]))
        self.assertNotIn("pasarela-apinex-fichaje", ids)

    def test_retirada_con_la_misma_respuesta_no_se_vuelve_a_preguntar(self):
        firma = A.firma_respuesta(DEEPSEEK["mensaje"])
        # El id de petición cambia en cada llamada: la firma no.
        otra = dict(DEEPSEEK, mensaje="Insufficient Balance (request_id: 11111111-2222-3333-4444-555555555555)")
        self.assertEqual(A.firma_respuesta(otra["mensaje"]), firma)
        retiradas = {"deepseek": {"cuando": "2026-11-26 22:00", "por": "Alex", "firma": firma}}
        self.assertNotIn("pasarela-deepseek-recarga", _ids(self.construir([otra], retiradas=retiradas)))

    def test_si_cambia_la_respuesta_vuelve_a_preguntar(self):
        retiradas = {"apinex": {"firma": "Make a single top-up of $10 or more"}}
        self.assertIn("pasarela-apinex-recarga", _ids(self.construir([APINEX], retiradas=retiradas)))

    def test_retirar_anota_sin_borrar_lo_demas(self):
        with tempfile.TemporaryDirectory() as d:
            ruta = os.path.join(d, "retiradas.json")
            with open(ruta, "w", encoding="utf-8") as f:
                json.dump({"xai": {"firma": "x"}}, f)
            A.retirar_pasarela("apinex", "firma-apinex", ruta=ruta)
            datos = A.leer_retiradas(ruta)
            self.assertEqual(set(datos), {"xai", "apinex"})
            self.assertEqual(datos["apinex"]["firma"], "firma-apinex")

    def test_ya_recargue_mide_otra_vez_y_no_se_cree_el_boton(self):
        self.assertTrue(A.es_id_de_recarga("pasarela-apinex-recarga"))
        self.assertFalse(A.es_id_de_recarga("pasarela-apinex-fichaje"))
        self.assertEqual(A.clave_de_accion("pasarela-apinex-recarga"), "apinex")
        # Con la medida nueva «escribe», la decisión desaparece de la lista; con «sin cupo» sigue.
        self.assertNotIn("pasarela-apinex-recarga", _ids(self.construir([dict(APINEX, estado="escribe", mensaje="")])))
        self.assertIn("pasarela-apinex-recarga", _ids(self.construir([APINEX])))


if __name__ == "__main__":
    unittest.main()
