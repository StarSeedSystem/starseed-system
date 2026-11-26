# -*- coding: utf-8 -*-
"""Autocuración del enjambre (2026-10-06): los vetos caducan, el director puede borrarlos sin
matar la tanda y una tanda vieja no repite lo que otra ya cerró.

Alex: «los agentes y procesos están detenidos… Genesis debería autorrepararse
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

    def test_no_aplica_tambien_esta_cerrada(self):
        self.escribir({"VER1105Db-d3": {"estado": "no_aplica"}, "B": {"estado": "no-aplica"},
                       "C": {"estado": "pendiente"}})
        self.assertEqual(sorted(enjambre.cerradas_en_disco(cada_s=0, ruta=self.ruta)), ["B", "VER1105Db-d3"])

    def test_relee_como_mucho_cada_tanto(self):
        self.escribir({"A": {"estado": "commit"}})
        self.assertEqual(set(enjambre.cerradas_en_disco(cada_s=3600, ruta=self.ruta)), {"A"})
        self.escribir({"A": {"estado": "commit"}, "B": {"estado": "commit"}})
        self.assertEqual(set(enjambre.cerradas_en_disco(cada_s=3600, ruta=self.ruta)), {"A"})
        self.assertEqual(set(enjambre.cerradas_en_disco(cada_s=0, ruta=self.ruta)), {"A", "B"})

    def test_rechazo_mecanico_no_cierra_la_tarea(self):
        """A018C6A91: «rechazada» por no tocar archivos es reparable, no terminal: el
        orquestador debe poder volver a correrla cuando el revisor la reescribe."""
        self.escribir({"A018C6A91": {"estado": "rechazada",
                                     "nota": "no toco NINGUNO de los 1 archivos que declaraba"},
                       "DEC1": {"estado": "rechazada", "nota": "no cumple el contrato"}})
        self.assertEqual(sorted(enjambre.cerradas_en_disco(cada_s=0, ruta=self.ruta)), ["DEC1"])

    def test_archivo_roto_no_lanza_y_conserva_lo_anterior(self):
        self.escribir({"A": {"estado": "commit"}})
        enjambre.cerradas_en_disco(cada_s=0, ruta=self.ruta)
        with open(self.ruta, "w") as f:
            f.write("{roto")
        self.assertEqual(set(enjambre.cerradas_en_disco(cada_s=0, ruta=self.ruta)), {"A"})


class RechazoMecanicoReversibleTest(unittest.TestCase):
    """(PRM1119B-d3) El rechazo por no tocar archivos NO cierra la tarea: la reescritura del
    revisor tiene que poder cogerla, en vez de dar vueltas entre «reabrir» y «no la repito»."""

    NOTA = "no toco NINGUNO de los 1 archivos que declaraba (rama ola/PRM1119B-d3 conservada)"

    def test_reabrir_no_es_sobrescrito_por_rechazo_mecanico_del_disco(self):
        memoria = {"PRM1119B-d3": {"estado": "pendiente",
                                   "nota": "revisor: rechazo mecánico de las puertas"}}
        disco = {"PRM1119B-d3": {"estado": "rechazada", "nota": self.NOTA}}
        fundido = enjambre.fusionar_progreso(memoria, disco, {"PRM1119B-d3"})
        self.assertEqual(fundido["PRM1119B-d3"], memoria["PRM1119B-d3"])

    def test_rechazo_por_decision_sigue_siendo_irreversible(self):
        memoria = {"DEC1": {"estado": "pendiente"}}
        disco = {"DEC1": {"estado": "rechazada", "nota": "Alex prefiere otro enfoque"}}
        self.assertEqual(
            enjambre.fusionar_progreso(memoria, disco, {"DEC1"})["DEC1"], disco["DEC1"]
        )

    def test_la_tanda_no_aparta_una_reescritura_por_rechazo_mecanico(self):
        import json
        import tempfile
        from unittest import mock

        temporal = tempfile.TemporaryDirectory()
        self.addCleanup(temporal.cleanup)
        ruta = os.path.join(temporal.name, "progreso.json")
        with open(ruta, "w", encoding="utf-8") as f:
            json.dump({"MEC1": {"estado": "rechazada", "nota": self.NOTA},
                       "DEC1": {"estado": "rechazada", "nota": "decisión de Alex"}}, f)
        with mock.patch.dict(enjambre._CERRADAS_DISCO, {"t": 0.0, "ids": frozenset()}):
            cerradas = enjambre.cerradas_en_disco(cada_s=0, ruta=ruta)
        self.assertEqual(cerradas, frozenset({"DEC1"}))

    def test_orden_de_reabrir_deja_la_tarea_viva_en_memoria_y_en_disco(self):
        import json
        import tempfile
        from unittest import mock

        tid = "PRM1119B-d3"
        temporal = tempfile.TemporaryDirectory()
        self.addCleanup(temporal.cleanup)
        prog_json = os.path.join(temporal.name, "progreso.json")
        disco = {tid: {"estado": "rechazada", "nota": self.NOTA}}
        with open(prog_json, "w", encoding="utf-8") as f:
            json.dump(disco, f)
        orden = {tid: {"accion": "reabrir",
                       "motivo": "revisor: rechazo mecánico de las puertas: se reescribe como tarea:alcance"}}
        for parche in (
            mock.patch.object(enjambre, "PROG_JSON", prog_json),
            mock.patch.object(enjambre, "PROG_MD", os.path.join(temporal.name, "progreso.md")),
            mock.patch.object(enjambre, "PROG", dict(disco)),
            mock.patch.object(enjambre, "MIAS", {tid}),
            mock.patch.object(enjambre, "consumir_control", return_value=orden),
            mock.patch.object(enjambre, "entregar_mensajes"),
            mock.patch.object(enjambre, "evento"),
        ):
            parche.start()
            self.addCleanup(parche.stop)
        enjambre.atender_control()
        self.assertEqual("pendiente", enjambre.PROG[tid]["estado"])
        with open(prog_json, encoding="utf-8") as f:
            self.assertEqual("pendiente", json.load(f)[tid]["estado"])


if __name__ == "__main__":
    unittest.main()
