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


class Busqueda(unittest.TestCase):
    def test_primera_vez_toca(self):
        self.assertTrue(A.decidir_busqueda(1000, None)[0])

    def test_como_mucho_cada_media_hora(self):
        self.assertFalse(A.decidir_busqueda(10_000, 10_000 - 600)[0])
        self.assertTrue(A.decidir_busqueda(10_000, 10_000 - A.BUSQUEDA_MINIMA_S)[0])


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
        self.resultado_busqueda = {"sumados": 0, "hechas": []}

    def tearDown(self):
        A.ESTADO, A.PUBLICACION = self._estado, self._pub

    def _revisar(self, sondas, libre, ahora=100_000, decision=None):
        it = iter(sondas)
        self.aplicadas = getattr(self, "aplicadas", [])
        decision = decision or {"puede": False}
        self.busquedas = getattr(self, "busquedas", [])
        self.traidas = getattr(self, "traidas", [])
        return A.revisar(
            asignar_fn=lambda: (decision, lambda: self.aplicadas.append(1) or ["cola viva actualizada"]),
            buscar_fn=lambda: self.busquedas.append(ahora) or self.resultado_busqueda,
            traer_fn=lambda: self.traidas.append(ahora) or True,
            ahora=ahora, sondear_fn=lambda: next(it), reiniciar_fn=lambda: self.reinicios.append(1),
            limpiar_fn=lambda ids: (self.limpiezas.append(ids) or {"ok": True, "limpiados": list(ids)}),
            libre_fn=lambda: libre, avisar_fn=self.avisos.append, dormir=lambda s: None,
            # El punto 6 (enjambre atascado) mira procesos reales: aquí se aísla.
            curar_fn=lambda estado, ahora, forzar: "",
            servicios_fn=lambda: {"estado": "ok", "detalle": ""},
            medidores_fn=lambda ahora: getattr(self, "levantados_medidor", []))

    def test_medidor_que_ve_cupo_levanta_y_lo_dice(self):
        self.levantados_medidor = ["codex"]
        estado = self._revisar([True], 20.0)
        self.assertTrue(any("codex" in h and "medidor" in h for h in estado["hechos"]))
        self.assertTrue(any("codex" in a for a in self.avisos))

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


class RevisarBusqueda(Revisar):
    def test_busca_capacidad_cada_media_hora_con_el_mando_vivo(self):
        self._revisar([True], 20.0, ahora=100_000)
        self._revisar([True], 20.0, ahora=100_000 + 600)
        self.assertEqual(self.busquedas, [100_000])
        self._revisar([True], 20.0, ahora=100_000 + A.BUSQUEDA_MINIMA_S)
        self.assertEqual(len(self.busquedas), 2)

    def test_con_el_mando_caido_no_busca(self):
        self._revisar([False, False, False], 20.0)
        self.assertEqual(self.busquedas, [])

    def test_lo_que_suma_queda_en_los_hechos(self):
        self.resultado_busqueda = {"sumados": 3, "hechas": ["lanzando 1 job(s) de 3 agente(s)"]}
        e = self._revisar([True], 20.0)
        self.assertTrue(any("capacidad fuera de la Mac" in h for h in e["hechos"]))

    def test_trae_la_nube_cada_media_hora_y_no_con_el_mando_caido(self):
        self._revisar([False, False, False], 20.0, ahora=100_000)
        self.assertEqual(self.traidas, [])
        self._revisar([True], 20.0, ahora=100_000)
        self._revisar([True], 20.0, ahora=100_000 + 600)
        self.assertEqual(self.traidas, [100_000])
        e = self._revisar([True], 20.0, ahora=100_000 + A.TRAER_MINIMO_S)
        self.assertEqual(len(self.traidas), 2)
        self.assertTrue(any("traer la nube" in h for h in e["hechos"]))

    def test_un_fallo_buscando_no_tumba_la_pasada(self):
        self.resultado_busqueda = None
        e = A.revisar(ahora=1, sondear_fn=lambda: True, reiniciar_fn=lambda: None, limpiar_fn=lambda ids: {},
                      libre_fn=lambda: 20.0, avisar_fn=self.avisos.append, dormir=lambda s: None,
                      asignar_fn=lambda: ({"puede": False}, lambda: []),
                      buscar_fn=lambda: (_ for _ in ()).throw(RuntimeError("gh caído")),
                      traer_fn=lambda: True)
        self.assertTrue(any("no pude buscar capacidad" in h for h in e["hechos"]))


if __name__ == "__main__":
    unittest.main()
