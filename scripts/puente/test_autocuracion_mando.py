# -*- coding: utf-8 -*-
"""Autocuración del Mando (2026-10-05): reiniciar si no responde y hacer sitio si falta disco."""
import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import autocuracion_mando as A  # noqa: E402


class DecidirReinicio(unittest.TestCase):
    def test_si_responde_no_se_toca(self):
        self.assertEqual(A.decidir_reinicio([True], 1000, None)[0], False)
        self.assertEqual(A.decidir_reinicio([False, True], 1000, None)[0], False)

    def test_tres_sondas_fallidas_reinician(self):
        si, porque = A.decidir_reinicio([False, False, False], 10_000, None)
        self.assertTrue(si)
        self.assertIn("3 sondas", porque)

    def test_no_reinicia_dos_veces_en_diez_minutos(self):
        si, porque = A.decidir_reinicio([False] * 3, 10_000, 10_000 - 120)
        self.assertFalse(si)
        self.assertIn("espero", porque)

    def test_no_pisa_a_una_publicacion_que_lo_esta_compilando(self):
        self.assertFalse(A.decidir_reinicio([False] * 3, 10_000, None, publicacion_en_marcha=True)[0])


class Disco(unittest.TestCase):
    def test_con_sitio_no_limpia(self):
        self.assertEqual(A.ids_a_limpiar(7.5), [])
        self.assertEqual(A.ids_a_limpiar(None), [])

    def test_por_debajo_del_aviso_limpia_lo_regenerable_pero_no_la_cache_de_next(self):
        ids = A.ids_a_limpiar(4.4)
        self.assertIn("npm-cache", ids)
        self.assertNotIn("next-cache", ids)

    def test_en_disco_critico_tambien_la_cache_de_next(self):
        self.assertIn("next-cache", A.ids_a_limpiar(2.0))


class Llenado(unittest.TestCase):
    def test_huecos_libres_con_tareas_desatascables_se_llenan(self):
        si, porque = A.decidir_llenado({"puede": True, "huecos": 2, "meter": ["PA1005D", "FLU1005E"]}, 1000, None)
        self.assertTrue(si)
        self.assertIn("PA1005D", porque)

    def test_sin_huecos_o_sin_nada_que_meter_no_toca(self):
        self.assertFalse(A.decidir_llenado({"puede": True, "huecos": 0, "meter": ["X"]}, 1000, None)[0])
        self.assertFalse(A.decidir_llenado({"puede": True, "huecos": 2, "meter": []}, 1000, None)[0])
        self.assertFalse(A.decidir_llenado({"puede": False, "huecos": 2, "meter": ["X"]}, 1000, None)[0])
        self.assertFalse(A.decidir_llenado(None, 1000, None)[0])

    def test_como_mucho_cada_cinco_minutos(self):
        self.assertFalse(A.decidir_llenado({"puede": True, "huecos": 1, "meter": ["X"]}, 1000, 1000 - 60)[0])


class PublicacionEnMarcha(unittest.TestCase):
    def test_solo_cuenta_si_compila_o_empuja(self):
        corriendo_build = {"estado": "corriendo", "pasos": [{"clave": "build", "estado": "corriendo"}]}
        corriendo_vitest = {"estado": "corriendo", "pasos": [{"clave": "vitest", "estado": "corriendo"}]}
        self.assertTrue(A.publicacion_en_marcha(corriendo_build))
        self.assertFalse(A.publicacion_en_marcha(corriendo_vitest))
        self.assertFalse(A.publicacion_en_marcha({"estado": "fallo"}))
        self.assertFalse(A.publicacion_en_marcha(None))


class Revisar(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self._estado, self._pub = A.ESTADO, A.PUBLICACION
        A.ESTADO = os.path.join(self.tmp, "autocuracion.json")
        A.PUBLICACION = os.path.join(self.tmp, "publicacion.json")
        self.avisos, self.reinicios, self.limpiezas = [], [], []

    def tearDown(self):
        A.ESTADO, A.PUBLICACION = self._estado, self._pub

    def _revisar(self, sondas, libre, ahora=100_000, decision=None):
        it = iter(sondas)
        self.aplicadas = getattr(self, "aplicadas", [])
        decision = decision or {"puede": False}
        return A.revisar(
            asignar_fn=lambda: (decision, lambda: self.aplicadas.append(1) or ["cola viva actualizada"]),
            ahora=ahora, sondear_fn=lambda: next(it), reiniciar_fn=lambda: self.reinicios.append(1),
            limpiar_fn=lambda ids: (self.limpiezas.append(ids) or {"ok": True, "limpiados": list(ids)}),
            libre_fn=lambda: libre, avisar_fn=self.avisos.append, dormir=lambda s: None)

    def test_mando_caido_se_reinicia_solo_y_lo_dice(self):
        e = self._revisar([False, False, False], 20.0)
        self.assertEqual(len(self.reinicios), 1)
        self.assertTrue(any("reiniciado" in a for a in self.avisos))
        self.assertFalse(e["responde"])
        with open(A.ESTADO, encoding="utf-8") as f:
            self.assertEqual(json.load(f)["ultimo_reinicio"], 100_000)

    def test_mando_sano_no_se_reinicia_y_solo_sondea_una_vez(self):
        self._revisar([True], 20.0)
        self.assertEqual(self.reinicios, [])

    def test_disco_corto_limpia_una_vez_por_hora(self):
        self._revisar([True], 4.0, ahora=100_000)
        self._revisar([True], 4.0, ahora=100_000 + 600)
        self.assertEqual(len(self.limpiezas), 1)
        self._revisar([True], 4.0, ahora=100_000 + 3700)
        self.assertEqual(len(self.limpiezas), 2)


class RevisarLlenado(Revisar):
    def test_mete_trabajo_en_los_huecos_libres_y_lo_dice(self):
        e = self._revisar([True], 20.0, decision={"puede": True, "huecos": 2, "meter": ["PA1005D"]})
        self.assertEqual(self.aplicadas, [1])
        self.assertTrue(any("capacidad" in h for h in e["hechos"]))
        self.assertTrue(any("PA1005D" in a for a in self.avisos))

    def test_con_el_mando_caido_no_toca_la_cola(self):
        self._revisar([False, False, False], 20.0, decision={"puede": True, "huecos": 2, "meter": ["PA1005D"]})
        self.assertEqual(self.aplicadas, [])


if __name__ == "__main__":
    unittest.main()
