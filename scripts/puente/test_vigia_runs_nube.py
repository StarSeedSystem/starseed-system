#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas del vigía de runs de la nube (2026-10-13): duplicados, sin máquina, preparación atascada,
pasados de tope y «sin dato del paso» (solo aviso). Lo puro, sin red ni GitHub.
(OPS1024E, 2026-10-24) Las «reasignada · nube (run N)» varadas: con el run N ya terminado y más
de 6 h desde su último cambio vuelven a «pendiente» sin gastar envío; run vivo o sin dato, se quedan."""
import json
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import vigia_runs_nube as VR  # noqa: E402

AHORA = 1791929400.0  # 2026-10-13 22:10 UTC


def fila(**k):
    base = {"run": 1, "estado": "in_progress", "cola": "enjambre/colas/c.json", "minutos": 5}
    base.update(k)
    return base


class Diagnosticar(unittest.TestCase):
    def test_escribiendo_no_es_atasco(self):
        f = fila(paso="Enjambre", paso_desde="2026-10-13T21:40:09Z", minutos=30, minutos_tope="45")
        self.assertIsNone(VR.diagnosticar(f, [f], AHORA))

    def test_preparacion_larga_solo_avisa_nunca_cancela(self):
        f = fila(paso="Dependencias y orquestador", paso_estado="in_progress", paso_desde="2026-10-13T21:39:25Z", minutos=31)
        a = VR.diagnosticar(f, [f], AHORA)
        self.assertEqual(a["tipo"], "preparacion-larga")
        self.assertFalse(a["cancelar"] or a["devolver"])
        self.assertIn("30 min", a["motivo"])

    def test_el_caso_que_corto_dos_runs_buenos(self):
        """16:21: el paso más avanzado de una lista incompleta era «Claves», HECHO hace 35 min."""
        f = fila(paso="Claves (solo las presentes; nunca se imprimen)", paso_estado="completed",
                 paso_desde="2026-10-13T21:45:20Z", minutos=37, minutos_tope="60")
        self.assertIsNone(VR.diagnosticar(f, [f], AHORA))
        g = fila(paso="Set up job", paso_estado="in_progress", paso_desde="2026-10-13T21:39:19Z", minutos=31)
        self.assertIsNone(VR.diagnosticar(g, [g], AHORA))
        h = fila(paso="Dependencias y orquestador", paso_estado="in_progress", paso_de_antes=True,
                 paso_desde="2026-10-13T21:39:25Z", minutos=31)
        self.assertIsNone(VR.diagnosticar(h, [h], AHORA))

    def test_ni_una_lista_coherente_corta(self):
        """22:41: «setup-node» 10 min con todo lo de detrás sin empezar… y estaba escribiendo."""
        f = fila(paso="Run actions/setup-node@v4", paso_estado="in_progress", pasos_coherentes=True,
                 paso_desde="2026-10-13T21:55:00Z", minutos=16)
        a = VR.diagnosticar(f, [f], AHORA)
        self.assertEqual(a["tipo"], "preparacion-larga")
        self.assertFalse(a["cancelar"])

    def test_preparacion_reciente_no(self):
        f = fila(paso="Dependencias y orquestador", paso_estado="in_progress", paso_desde="2026-10-13T22:08:00Z")
        self.assertIsNone(VR.diagnosticar(f, [f], AHORA))

    def test_duplicado_de_una_cola_en_marcha(self):
        vivo = fila(run=1)
        dup = fila(run=2, estado="pending", minutos=2)
        a = VR.diagnosticar(dup, [vivo, dup], AHORA)
        self.assertEqual(a["tipo"], "duplicado")
        self.assertTrue(a["cancelar"])
        self.assertFalse(a["devolver"])
        self.assertIsNone(VR.diagnosticar(vivo, [vivo, dup], AHORA))

    def test_sin_maquina_media_hora(self):
        f = fila(estado="queued", minutos=35, cola="otra.json")
        self.assertEqual(VR.diagnosticar(f, [f], AHORA)["tipo"], "sin-maquina")
        self.assertIsNone(VR.diagnosticar(fila(estado="queued", minutos=10), [], AHORA))

    def test_pasado_de_su_tope_solo_avisa(self):
        f = fila(paso="Enjambre", minutos=70, minutos_tope="45")
        a = VR.diagnosticar(f, [f], AHORA)
        self.assertEqual(a["tipo"], "pasado-de-tope")
        self.assertFalse(a["cancelar"])

    def test_sin_dato_del_paso_solo_avisa(self):
        f = fila(paso="sin dato del paso", minutos=26)
        a = VR.diagnosticar(f, [f], AHORA)
        self.assertEqual(a["tipo"], "sin-pasos")
        self.assertFalse(a["cancelar"])
        self.assertIsNone(VR.diagnosticar(fila(paso="sin dato del paso", minutos=10), [], AHORA))

    def test_que_es_preparacion(self):
        self.assertTrue(VR.es_preparacion("Run actions/setup-node@v4"))
        self.assertTrue(VR.es_preparacion("Set up job"))
        for p in ("Enjambre", "Entregar (rama nube/<run>, nunca main)", "Post Run actions/checkout@v4",
                  "sin dato del paso", "esperando máquina", "", None):
            self.assertFalse(VR.es_preparacion(p), p)


class Devolver(unittest.TestCase):
    def test_solo_las_que_siguen_en_la_nube(self):
        prog = {"A": {"estado": "reasignada", "medio": "nube"}, "B": {"estado": "commit"},
                "C": {"estado": "reasignada", "medio": "oracle"}}
        nuevo, hechas = VR.devolver(prog, ["A", "B", "C", "D"], 9, "se atascó", "20261013")
        self.assertEqual(hechas, ["A"])
        self.assertEqual(nuevo["A"]["estado"], "pendiente")
        self.assertIn("no cuenta como envío", nuevo["A"]["nota"])
        self.assertEqual(nuevo["B"], {"estado": "commit"})
        self.assertEqual(prog["A"]["estado"], "reasignada")  # no muta la entrada

    def test_las_soltadas_sin_medio_de_ese_run_tambien_vuelven(self):
        prog = {"Q": {"estado": "reasignada", "medio": None, "nota": "movida a nube-gh (run 9) desde Genesis"},
                "R": {"estado": "reasignada", "medio": None, "nota": "movida a nube-gh (run 8) desde Genesis"}}
        _nuevo, hechas = VR.devolver(prog, ["Q", "R"], 9, "se atascó", "20261013")
        self.assertEqual(hechas, ["Q"])

    def test_ids_de_cola(self):
        self.assertEqual(VR.ids_de_cola({"tareas": [{"id": "X"}, {"id": "Y"}, {}]}), ["X", "Y"])
        self.assertEqual(VR.ids_de_cola([{"id": "Z"}]), ["Z"])
        self.assertEqual(VR.ids_de_cola(None), [])


class Actuar(unittest.TestCase):
    """`actuar` con GitHub y el Chat Director simulados: confirma antes de cancelar y avisa una vez."""

    def setUp(self):
        import tempfile
        from unittest import mock

        self.dir = tempfile.mkdtemp()
        self.cancelados, self.avisos = [], []
        ok = mock.Mock(returncode=0, stderr="")
        self.p = [mock.patch.object(VR, "MEMORIA", os.path.join(self.dir, "m.json")),
                  mock.patch.object(VR.subprocess, "run", side_effect=lambda o, **k: (self.cancelados.append(o[-1]), ok)[1]),
                  mock.patch.object(VR, "_avisar", side_effect=self.avisos.append)]
        for x in self.p:
            x.start()

    def tearDown(self):
        for x in self.p:
            x.stop()

    def test_confirma_en_una_segunda_pasada_y_no_repite(self):
        a = {"tipo": "preparacion-atascada", "cancelar": True, "devolver": False, "confirmar": True, "motivo": "m"}
        resumen = {"runs": [{"run": 7, "cola": "c.json", "atasco": a}]}
        self.assertEqual(VR.actuar(resumen, self.dir, ahora=1000.0), [])
        self.assertEqual(VR.actuar(resumen, self.dir, ahora=1100.0), [])  # aún no: < CONFIRMAR_S
        self.assertEqual(len(VR.actuar(resumen, self.dir, ahora=1300.0)), 1)
        self.assertEqual(self.cancelados, ["7"])
        self.assertEqual(VR.actuar(resumen, self.dir, ahora=1600.0), [])  # ya hecho: no repite

    def test_un_aviso_no_corta_y_no_se_repite(self):
        a = {"tipo": "sin-pasos", "cancelar": False, "devolver": False, "motivo": "m"}
        resumen = {"runs": [{"run": 8, "cola": "c.json", "atasco": a}]}
        self.assertEqual(len(VR.actuar(resumen, self.dir, ahora=1000.0)), 1)
        self.assertEqual(VR.actuar(resumen, self.dir, ahora=1300.0), [])
        self.assertEqual(self.cancelados, [])
        self.assertEqual(len(self.avisos), 1)


class Varadas(unittest.TestCase):
    """(OPS1024E, 2026-10-24) Varadas: run N terminado y más de 6 h del último cambio vuelven; run vivo, otro medio o sin dato, no."""

    VIEJA = "2026-10-13T10:00:00Z"  # ~12 h antes de AHORA
    JOVEN = "2026-10-13T20:00:00Z"  # ~2 h antes de AHORA
    NOTA = "movida a nube-gh (run 9) desde Genesis"

    def v(self, t=VIEJA, **k):
        d = {"estado": "reasignada", "medio": "nube", "nota": self.NOTA, "t": t}
        d.update(k); return d

    def test_run_terminado_vuelve(self):
        t = {"VZF": self.v(), "Bien": {"estado": "commit"}}
        self.assertEqual(VR.varadas(t, {"9": "completed"}, AHORA), [("VZF", "9")])

    def test_run_vivo_se_queda(self):
        t = {"VZF": self.v()}
        for estado in ("in_progress", "queued", "pending", "waiting"):
            self.assertEqual(VR.varadas(t, {"9": estado}, AHORA), [])

    def test_sin_dato_del_run_se_queda(self):
        t = {"VZF": self.v()}
        for estados in (None, {}, {"8": "completed"}):
            self.assertEqual(VR.varadas(t, estados, AHORA), [])

    def test_otro_medio_o_otra_nota_se_quedan(self):
        t = {"VZR": self.v(medio="oracle"),
             "DGM": {"estado": "reasignada", "medio": None, "nota": "movida a oracle desde Genesis", "t": self.VIEJA}}
        self.assertEqual(VR.varadas(t, {"9": "completed"}, AHORA), [])

    def test_estado_no_reasignada_o_cambio_reciente_o_sin_t_no(self):
        t = {"A": self.v(estado="pendiente"), "B": self.v(t=self.JOVEN), "C": self.v(t=None)}
        self.assertEqual(VR.varadas(t, {"9": "completed"}, AHORA), [])

    def test_sin_medio_pero_nota_nube_gh_cuenta(self):
        """Como `reclamar_varadas`: las soltadas a nube-gh pueden quedar sin medio."""
        t = {"Q": self.v(medio=None)}
        self.assertEqual(VR.varadas(t, {"9": "completed"}, AHORA), [("Q", "9")])

    def test_devolucion_varadas_es_la_misma_del_vigia(self):
        prog = {"VZF": self.v(), "DGM": {"estado": "commit"}}
        nuevo, hechas = VR.devolver_varadas(prog, [("VZF", "9"), ("DGM", "9")], "20261024")
        self.assertEqual(hechas, ["VZF"])
        e = nuevo["VZF"]
        self.assertEqual((e["estado"], e["medio"]), ("pendiente", None))
        self.assertIn("no cuenta como envío", e["nota"])
        self.assertIn("run 9", e["nota"])
        self.assertEqual(prog["VZF"]["estado"], "reasignada")  # no muta lo recibido


class VaradasActuar(unittest.TestCase):
    """`actuar` con la API del RUN simulada (sin red): devuelve y avisa UNA línea con cuántas."""

    def setUp(self):
        import tempfile
        from unittest import mock

        self.dir = tempfile.mkdtemp()
        olas = os.path.join(self.dir, "starseed_memory_root", "olas")
        os.makedirs(olas)
        self.progreso = os.path.join(olas, "progreso.json")
        v = Varadas()
        self._guardar({"VZF": v.v(), "DGM": v.v(t=v.JOVEN), "ORA": {"estado": "reasignada", "medio": "oracle", "nota": v.NOTA, "t": v.VIEJA}})
        self.hechas, self.avisos, self.estado = [], [], "completed"

        def gh(orden, **k):  # la API del RUN simulada: lo que diría GitHub, sin red
            r = mock.Mock(returncode=0, stderr=""); r.stdout = self.estado; return r

        self.p = [
            mock.patch.object(VR, "MEMORIA", os.path.join(self.dir, "m.json")),
            mock.patch.object(VR.subprocess, "run", side_effect=gh),
            mock.patch.object(VR, "_avisar", side_effect=self.avisos.append),
            mock.patch("repartir_nube.anotar_reaperturas", side_effect=lambda ids, _t: self.hechas.append(ids)),
        ]
        for x in self.p:
            x.start()

    def tearDown(self):
        for x in self.p:
            x.stop()

    def _guardar(self, datos):
        with open(self.progreso, "w", encoding="utf-8") as f:
            json.dump(datos, f, ensure_ascii=False)

    def _leer(self):
        with open(self.progreso, encoding="utf-8") as f:
            return json.load(f)

    def test_run_terminado_devuelve_y_avisa_una_vez(self):
        hecho = VR.actuar({"runs": []}, self.dir, ahora=AHORA)
        self.assertEqual(len(hecho), 1)
        self.assertIn("1 tarea(s)", hecho[0])
        self.assertEqual(self.hechas, [["VZF"]])  # reapertura anotada: no cuenta envío
        prog = self._leer()
        self.assertEqual(prog["VZF"]["estado"], "pendiente")
        self.assertIsNone(prog["VZF"]["medio"])
        self.assertIn("no cuenta como envío", prog["VZF"]["nota"])
        self.assertEqual(prog["DGM"]["estado"], "reasignada")  # vieja SOLO de 2 h
        self.assertEqual(prog["ORA"]["estado"], "reasignada")  # medio oracle: se queda
        self.assertEqual(self.avisos, hecho)  # UNA línea con cuántas
        self.assertEqual(len(VR.actuar({"runs": []}, self.dir, ahora=AHORA)), 0)  # ya no hay varadas

    def test_run_vivo_o_sin_dato_no_toca_nada(self):
        for self.estado in ("in_progress", ""):
            self.assertEqual(VR.actuar({"runs": []}, self.dir, ahora=AHORA), [])
            self.assertEqual(self._leer()["VZF"]["estado"], "reasignada")
        self.assertEqual(self.avisos, [])

    def test_progreso_con_clave_tareas_tambien(self):
        self._guardar({"tareas": {"VZF": Varadas().v()}})
        hecho = VR.actuar({"runs": []}, self.dir, ahora=AHORA)
        self.assertEqual(len(hecho), 1)
        self.assertEqual(self._leer()["tareas"]["VZF"]["estado"], "pendiente")


if __name__ == "__main__":
    unittest.main()
