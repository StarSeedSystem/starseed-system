# -*- coding: utf-8 -*-
"""Autocuración del enjambre (2026-10-06): los vetos caducan, el director puede borrarlos sin
matar la tanda y una tanda vieja no repite lo que otra ya cerró.

Alex: «los agentes y procesos están detenidos… el puente de mando debería autorrepararse
usando los directores». Esa noche tres trabajadores llevaban 40 min «esperando proveedor»
con apinex, freellmapi y Google respondiendo a la sonda."""
import json
import os
import tempfile
import unittest
from unittest import mock
from test_progreso_irreversible import enjambre


class Reloj:
    def __init__(self, t=1000.0):
        self.t = t

    def __call__(self):
        return self.t


class ConjuntoCaducoTest(unittest.TestCase):
    def test_el_veto_caduca_y_el_modelo_vuelve(self):
        r = Reloj()
        c = enjambre.ConjuntoCaduco(ttl_s=60, reloj=r)
        c.add("google/x")
        self.assertIn("google/x", c)
        r.t += 59
        self.assertIn("google/x", c)
        r.t += 2
        self.assertNotIn("google/x", c)
        self.assertEqual(len(c), 0)

    def test_horas_largas_y_un_veto_nuevo_no_acorta_el_viejo(self):
        r = Reloj()
        c = enjambre.ConjuntoCaduco(ttl_s=60, reloj=r)
        c.add("apinex/y", horas=6)
        c.add("apinex/y")  # el veto corto no pisa el de 6 h
        r.t += 3600
        self.assertIn("apinex/y", c)
        r.t += 5 * 3600 + 1
        self.assertNotIn("apinex/y", c)

    def test_iterar_y_len_solo_ven_lo_vigente(self):
        r = Reloj()
        c = enjambre.ConjuntoCaduco(ttl_s=10, reloj=r)
        c.add("a")
        c.add("b", horas=1)
        r.t += 11
        self.assertEqual(sorted(c), ["b"])
        self.assertEqual(len(c), 1)
        self.assertEqual([m for m in ["a", "b"] if m not in c], ["a"])

    def test_discard_remove_clear(self):
        c = enjambre.ConjuntoCaduco(ttl_s=60)
        c.add("a")
        c.add("b")
        c.discard("a")
        self.assertNotIn("a", c)
        c.remove("b")
        self.assertEqual(len(c), 0)
        c.add("c")
        c.clear()
        self.assertEqual(list(c), [])

    def test_ttl_por_entorno(self):
        with mock.patch.dict(os.environ, {"STARSEED_MUERTOS_TTL_MIN": "5"}):
            self.assertEqual(enjambre.ConjuntoCaduco()._ttl_s, 300)


class RefrescarProveedoresTest(unittest.TestCase):
    def test_borra_vetos_pago_y_memoria_de_la_sonda(self):
        muertos = enjambre.ConjuntoCaduco(ttl_s=3600)
        muertos.add("freellmapi/auto", horas=6)
        muertos.add("google/gemini")
        pago = {"apinex": {"apinex/z"}}
        eventos = []
        with mock.patch.object(enjambre, "MUERTOS", muertos), \
             mock.patch.object(enjambre, "PIDEN_PAGO", pago), \
             mock.patch.object(enjambre, "evento", lambda *a, **k: eventos.append(a)):
            vieja = enjambre._SONDA_MEM
            self.assertEqual(enjambre.refrescar_proveedores("director-autocuracion"), 2)
            self.assertEqual(len(muertos), 0)
            self.assertEqual(pago, {})
            if enjambre._sonda is not None:
                self.assertIsNot(enjambre._SONDA_MEM, vieja)
            self.assertIn("director-autocuracion", eventos[-1][2])

    def test_la_orden_de_flota_se_atiende_aunque_no_sea_de_ninguna_tarea(self):
        with mock.patch.object(enjambre, "consumir_control",
                               return_value={"_flota": {"accion": "refrescar_proveedores", "quien": "mando"}}), \
             mock.patch.object(enjambre, "entregar_mensajes", lambda: None), \
             mock.patch.object(enjambre, "refrescar_proveedores") as refrescar, \
             mock.patch.object(enjambre, "MIAS", set()):
            enjambre.atender_control()
            refrescar.assert_called_once_with("mando")


class CerradasEnDiscoTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.ruta = os.path.join(self.tmp.name, "progreso.json")
        p = mock.patch.dict(enjambre._CERRADAS_DISCO, {"t": 0.0, "ids": frozenset()})
        p.start()
        self.addCleanup(p.stop)

    def escribir(self, datos):
        with open(self.ruta, "w", encoding="utf-8") as f:
            json.dump(datos, f)

    def test_lee_lo_cerrado_por_otros_y_no_lo_abierto(self):
        self.escribir({"LC1007A": {"estado": "commit"}, "MC1007B": {"estado": "sustituida"},
                       "X": {"estado": "descartada"}, "PT1": {"estado": "pendiente"},
                       "PT2": {"estado": "fallo"}})
        ids = enjambre.cerradas_en_disco(cada_s=0, ruta=self.ruta)
        self.assertEqual(sorted(ids), ["LC1007A", "MC1007B", "X"])

    def test_relee_como_mucho_cada_tanto(self):
        self.escribir({"A": {"estado": "commit"}})
        self.assertEqual(set(enjambre.cerradas_en_disco(cada_s=3600, ruta=self.ruta)), {"A"})
        self.escribir({"A": {"estado": "commit"}, "B": {"estado": "commit"}})
        self.assertEqual(set(enjambre.cerradas_en_disco(cada_s=3600, ruta=self.ruta)), {"A"})
        self.assertEqual(set(enjambre.cerradas_en_disco(cada_s=0, ruta=self.ruta)), {"A", "B"})

    def test_archivo_roto_no_lanza_y_conserva_lo_anterior(self):
        self.escribir({"A": {"estado": "commit"}})
        enjambre.cerradas_en_disco(cada_s=0, ruta=self.ruta)
        with open(self.ruta, "w") as f:
            f.write("{roto")
        self.assertEqual(set(enjambre.cerradas_en_disco(cada_s=0, ruta=self.ruta)), {"A"})


if __name__ == "__main__":
    unittest.main()
