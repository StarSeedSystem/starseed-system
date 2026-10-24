#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas del vigía de runs de la nube (2026-10-13): duplicados, sin máquina, preparación atascada,
pasados de tope y «sin dato del paso» (solo aviso); OPS1024E (2026-10-24): con la API simulada,
las «movida a nube-gh (run N)» varadas vuelven, y un run vivo o sin dato se queda."""
import json
import os
import sys
import time
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import vigia_runs_nube as VR  # noqa: E402

AHORA = 1791929400.0  # 2026-10-13 22:10 UTC
FIN = {"status": "completed", "conclusion": "failure"}  # como la API del 2026-10-24
VIVO = {"status": "in_progress"}


def t_hace(horas):
    """Un «t» como lo escribe `set_estado` del orquestador («AAAA-MM-DD HH:MM:SS» local)."""
    return time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(AHORA - horas * 3600))


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


class VaradasMovidas(unittest.TestCase):
    """(OPS1024E) Las «movida a nube-gh (run N)» varadas, con la API simulada: run terminado →
    vuelve (medio «nube» o sin medio, como las soltó Genesis); vivo, sin dato, otro medio o
    cambio reciente → se queda."""

    def _t(self, medio="nube", run="8", t=t_hace(7)):
        v = {"estado": "reasignada", "medio": medio,
             "nota": "movida a nube-gh (run %s) desde Genesis" % run}
        if t is not None:
            v["t"] = t
        return {"X": v}

    def test_run_terminado_vuelve(self):
        self.assertEqual(VR.varadas_a_devolver(self._t(), {"8": FIN}, AHORA), ["X"])
        self.assertEqual(VR.varadas_a_devolver(self._t(medio=None), {"8": FIN}, AHORA), ["X"])
        self.assertEqual(VR._runs_en_notas({"A": {"nota": "movida a nube-gh (run 5) desde Genesis"},
                                            "B": {"nota": "commit · ok"}}), {"5"})

    def test_run_vivo_y_sin_dato_se_quedan(self):
        self.assertEqual(VR.varadas_a_devolver(self._t(), {"8": VIVO}, AHORA), [])
        self.assertEqual(VR.varadas_a_devolver(self._t(), {"8": {"status": "queued"}}, AHORA), [])
        for sin_dato in ({}, {"8": {}}, {"8": None}):
            self.assertEqual(VR.varadas_a_devolver(self._t(), sin_dato, AHORA), [])

    def test_otro_medio_cambio_recente_y_sin_hora_se_quedan(self):
        for caso in ({"medio": "oracle"}, {"t": t_hace(2)}, {"t": None}):
            self.assertEqual(VR.varadas_a_devolver(self._t(**caso), {"8": FIN}, AHORA), [])
        self.assertIsNone(VR._ts_de("ayer quizá"))

    def test_devolver_con_cierre_honesto(self):
        prog = {"Q": {"estado": "reasignada", "medio": None, "nota": "movida a nube-gh (run 9) desde Genesis"}}
        nuevo, hechas = VR.devolver(prog, ["Q"], 9, "ya terminó", "20261024", cierre="nadie lo lleva en marcha")
        self.assertEqual(hechas, ["Q"])
        self.assertIn("el run 9 ya terminó y nadie lo lleva en marcha", nuevo["Q"]["nota"])


class DevolverMovidas(unittest.TestCase):
    """`devolver_varadas` con la API simulada (`estado_de_run`), el disco en un temporal y el
    Chat Director capturado: pregunta a la API solo de los runs que el resumen no trae vivos."""

    def setUp(self):
        import tempfile
        from unittest import mock

        self.raiz = tempfile.mkdtemp()
        olas = os.path.join(self.raiz, "starseed_memory_root", "olas")
        os.makedirs(olas)
        self.ruta_prog = os.path.join(olas, "progreso.json")
        movida = {"estado": "reasignada", "t": t_hace(7)}
        self.tareas = {
            "A": {"medio": "nube", "nota": "movida a nube-gh (run 100) desde Genesis", **movida},
            "B": {"medio": "nube", "nota": "movida a nube-gh (run 200) desde Genesis", **movida},
            "C": {"estado": "reasignada", "medio": None, "nota": "movida a nube-gh (run 300) desde Genesis",
                  "t": t_hace(30)},
            "OR": {"medio": "oracle", "nota": "movida a nube-gh (run 400) y a oracle", **movida},
            "E": {"medio": "nube", "nota": "movida a nube-gh (run 500) desde Genesis", **movida},
            "F": {"medio": "nube", "nota": "movida a nube-gh (run 600) desde Genesis", "t": t_hace(2)},
            "G": {"medio": "nube", "nota": "movida a nube-gh (run 700) desde Genesis", **movida},
            "H": {"estado": "commit", "medio": "nube", "nota": "movida a nube-gh (run 800), integrada"},
        }
        with open(self.ruta_prog, "w", encoding="utf-8") as f:
            json.dump({"generado": "", "tareas": self.tareas}, f, ensure_ascii=False)
        self.api = {"100": FIN, "200": None, "300": FIN, "400": FIN, "600": FIN}
        self.consultados, self.avisos, self.reabiertas = [], [], []
        import repartir_nube
        self.p = [mock.patch.object(VR, "estado_de_run", side_effect=lambda r, *a, **k:
                                    (self.consultados.append(r), self.api.get(r))[1]),
                  mock.patch.object(VR, "_avisar", side_effect=self.avisos.append),
                  mock.patch.object(repartir_nube, "anotar_reaperturas", side_effect=self.reabiertas.append)]
        for x in self.p:
            x.start()

    def tearDown(self):
        for x in self.p:
            x.stop()

    def _ejecutar(self):
        return VR.devolver_varadas({"runs": [{"run": 500, "estado": "in_progress"}]}, self.raiz,
                                   ahora=AHORA)

    def test_terminadas_vuelven_y_las_demas_se_quedan(self):
        hecho = self._ejecutar()
        # Solo piden API los runs que el resumen no trae vivos (500); por orden de run.
        self.assertEqual(self.consultados, ["100", "200", "300", "400", "600", "700", "800"])
        self.assertEqual(self.reabiertas, [["A", "C"]])
        self.assertEqual(len(self.avisos), 1)
        self.assertIn("devolví 2 tarea(s)", self.avisos[0])
        self.assertIn("A", hecho[0])
        self.assertIn("C", hecho[0])
        with open(self.ruta_prog, encoding="utf-8") as f:
            fuera = json.load(f)["tareas"]
        self.assertEqual(fuera["A"]["estado"], "pendiente")
        self.assertIn("el run 100 ya terminó y nadie lo lleva en marcha", fuera["A"]["nota"])
        self.assertIn("no cuenta como envío", fuera["A"]["nota"])
        self.assertEqual(fuera["B"], self.tareas["B"])  # sin dato de la API: se queda
        self.assertEqual(fuera["E"], self.tareas["E"])  # run vivo en el resumen: se queda
        self.assertEqual(fuera["F"], self.tareas["F"])  # cambio reciente: se queda
        self.assertEqual(fuera["G"], self.tareas["G"])  # la API no lo conoce: se queda
        self.assertEqual(fuera["H"], self.tareas["H"])  # ya integrada: no se toca

    def test_nada_que_devolver_no_toca_nada(self):
        self.api.clear()  # la API no conoce ninguno: todas se quedan
        self.assertEqual(self._ejecutar(), [])
        self.assertEqual(self.reabiertas, [])
        self.assertEqual(self.avisos, [])

    def test_segunda_pasada_no_repite(self):
        self._ejecutar()
        self.assertEqual(len(self.avisos), 1)
        self._ejecutar()  # ya están «pendiente»: no hay candidatos ni aviso nuevo
        self.assertEqual(len(self.avisos), 1)


if __name__ == "__main__":
    unittest.main()