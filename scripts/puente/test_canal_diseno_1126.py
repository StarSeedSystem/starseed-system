# -*- coding: utf-8 -*-
"""Canal de diseño (@StarSeed_Design_bot), 26-11: el «Sí» ejecuta la pregunta abierta, las
condiciones se guardan como condiciones, el modo conjunto se reconoce, y el nombre, el formato y el
reflejo salen bien (DIS1126A)."""
import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import conversacion_canal as C  # noqa: E402

ACCION = {"tipo": "dossier", "caso": 1}
PREGUNTA = "¿Quieres que despleguemos completo y paso a paso el primer caso?"


class _Base(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.abiertas = os.path.join(self.tmp.name, "abiertas.json")
        self.condiciones = os.path.join(self.tmp.name, "condiciones.json")
        self.reflejo = os.path.join(self.tmp.name, "audiovisual.jsonl")


class RespuestaCorta(_Base):
    def test_si_tras_pregunta_ejecuta_su_accion(self):
        C.guardar_abierta("42", PREGUNTA, ACCION, ruta=self.abiertas)
        r = C.resolver("42", "Si", ruta=self.abiertas)
        self.assertEqual(r["resultado"], "ejecutar")
        self.assertEqual(r["accion"], ACCION)

    def test_la_pregunta_se_cierra_tras_ejecutarse(self):
        C.guardar_abierta("42", PREGUNTA, ACCION, ruta=self.abiertas)
        C.resolver("42", "dale", ruta=self.abiertas)
        self.assertEqual(C.resolver("42", "sí", ruta=self.abiertas)["resultado"], "aclarar")

    def test_si_sin_pregunta_abierta_pregunta_que_quiere_decir(self):
        r = C.resolver("42", "ok", ruta=self.abiertas)
        self.assertEqual(r["resultado"], "aclarar")
        self.assertIn("Maggasukha", r["mensaje"])

    def test_pregunta_caducada_no_se_ejecuta(self):
        C.guardar_abierta("42", PREGUNTA, ACCION, ruta=self.abiertas)
        r = C.resolver("42", "si", ruta=self.abiertas, ahora=C.time.time() + C.CADUCA_S + 5)
        self.assertEqual(r["resultado"], "aclarar")

    def test_no_descarta(self):
        C.guardar_abierta("42", PREGUNTA, ACCION, ruta=self.abiertas)
        self.assertEqual(C.resolver("42", "no", ruta=self.abiertas)["resultado"], "descartar")

    def test_numero_elige_opcion(self):
        C.guardar_abierta("42", "¿Cuál?", ACCION, opciones=["a", "b"], ruta=self.abiertas)
        r = C.resolver("42", "2", ruta=self.abiertas)
        self.assertEqual(r["accion"]["opcion"], "b")

    def test_opcion_fuera_de_rango_aclara_y_deja_la_pregunta(self):
        C.guardar_abierta("42", "¿Cuál?", ACCION, opciones=["a", "b"], ruta=self.abiertas)
        self.assertEqual(C.resolver("42", "7", ruta=self.abiertas)["resultado"], "aclarar")
        self.assertEqual(C.resolver("42", "1", ruta=self.abiertas)["resultado"], "ejecutar")

    def test_un_mensaje_largo_no_es_respuesta_corta(self):
        C.guardar_abierta("42", PREGUNTA, ACCION, ruta=self.abiertas)
        self.assertIsNone(C.resolver("42", "Hazme un informe de la semana", ruta=self.abiertas))

    def test_cada_chat_tiene_su_pregunta(self):
        C.guardar_abierta("1", PREGUNTA, ACCION, ruta=self.abiertas)
        self.assertEqual(C.resolver("2", "si", ruta=self.abiertas)["resultado"], "aclarar")


class Condiciones(_Base):
    def test_reconoce_condicion_de_aprobacion(self):
        txt = "Envíame antes la idea, propósito, visión, misión, storyboards para cada caso"
        self.assertTrue(C.es_condicion(txt))
        self.assertFalse(C.es_condicion("Hola, ¿qué tal?"))

    def test_se_guarda_como_condicion_pendiente(self):
        lista = C.guardar_condicion("Envíame antes el guion", ruta=self.condiciones)
        self.assertEqual(len(lista), 1)
        self.assertFalse(lista[0]["cumplida"])
        with open(self.condiciones, encoding="utf-8") as f:
            self.assertEqual(len(json.load(f)["condiciones"]), 1)

    def test_las_condiciones_se_acumulan(self):
        C.guardar_condicion("Envíame antes A", ruta=self.condiciones)
        self.assertEqual(len(C.guardar_condicion("Envíame antes B", ruta=self.condiciones)), 2)

    def test_modo_conjunto(self):
        txt = "Desarrolla todo y envíame todo descriptivamente por este canal para desarrollarlo juntos"
        self.assertTrue(C.es_modo_conjunto(txt))
        self.assertFalse(C.es_modo_conjunto("Genera un informe"))


class NombreFormatoReflejo(_Base):
    def test_nunca_alex(self):
        self.assertEqual(C.nombrar("Alex, aquí tienes. Alexandra no cambia."), "Maggasukha, aquí tienes. Alexandra no cambia.")

    def test_formato_sin_markdown_crudo_y_con_firma(self):
        s = C.formato_telegram("### Caso 1\n- idea\n* visión\n**clave** de Alex", "kimi-k3")
        self.assertNotIn("###", s)
        self.assertIn("<b>Caso 1</b>", s)
        self.assertIn("• idea", s)
        self.assertIn("• visión", s)
        self.assertIn("<b>clave</b>", s)
        self.assertNotIn("Alex", s)
        self.assertTrue(s.endswith("— Audiovisual y diseño · kimi-k3"))

    def test_firma_sin_modelo(self):
        self.assertTrue(C.formato_telegram("hola").endswith("— Audiovisual y diseño"))

    def test_reflejo_entrante_y_saliente(self):
        C.reflejar("entrante", "42", "Si", ruta=self.reflejo)
        C.reflejar("saliente", "42", "Listo", ruta=self.reflejo)
        with open(self.reflejo, encoding="utf-8") as f:
            filas = [json.loads(x) for x in f]
        self.assertEqual([x["sentido"] for x in filas], ["entrante", "saliente"])
        self.assertEqual(filas[0]["chat"], "42")


if __name__ == "__main__":
    unittest.main()
