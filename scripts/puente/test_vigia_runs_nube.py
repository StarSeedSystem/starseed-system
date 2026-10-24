#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas del vigía de runs de la nube (2026-10-13): duplicados, sin máquina, preparación atascada,
pasados de tope y «sin dato del paso» (solo aviso). Lo puro, sin red ni GitHub."""
import json
import os
import sys
import time
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


class Varadas(unittest.TestCase):
    """(OPS1024E) Tareas «reasignada · nube» con su run N terminado y más de 6 h sin cambio.
    Puro, con el resumen de la RUN de la API simulado (los vivos dentro, los muertos fuera)."""

    HACE_TRES_DIAS = AHORA - 3 * 86400
    RESUMEN = {"generado": "2026-10-13 22:10:00", "agentes": 1,
               "runs": [{"run": 111, "estado": "in_progress"}]}

    def tarea(self, **k):
        base = {"estado": "reasignada", "medio": "nube",
                "nota": "movida a nube-gh (run 39588171249) desde Genesis",
                "t": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(self.HACE_TRES_DIAS))}
        base.update(k)
        return base

    def test_run_terminado_y_vieja_vuelve(self):
        self.assertEqual(VR.varadas_a_devolver(
            {"VZF1015Q": self.tarea(), "VZR1011B": self.tarea(nota="movida a nube-gh (run 39576180546) desde Genesis")},
            self.RESUMEN, AHORA), ["VZF1015Q", "VZR1011B"])

    def test_run_vivo_se_queda(self):
        self.assertEqual(VR.varadas_a_devolver(
            {"J": self.tarea(nota="movida a nube-gh (run 111) desde Genesis")}, self.RESUMEN, AHORA), [])

    def test_recien_movida_se_queda(self):
        joven = self.tarea(t=time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(AHORA - 2 * 3600)))
        self.assertEqual(VR.varadas_a_devolver({"N": joven}, self.RESUMEN, AHORA), [])

    def test_otro_medio_se_queda(self):
        self.assertEqual(VR.varadas_a_devolver({"O": self.tarea(medio="oracle")}, self.RESUMEN, AHORA), [])
        self.assertEqual(VR.varadas_a_devolver(
            {"M": self.tarea(medio="mac", nota="reasignada a la mac ahora mismo")}, self.RESUMEN, AHORA), [])

    def test_sin_dato_del_run_se_queda(self):
        """Resumen no consultable y nota de run ajeno a la nube: no se toca nada."""
        self.assertEqual(VR.varadas_a_devolver({"A": self.tarea()}, {"agentes": 0, "runs": []}, AHORA), [])
        self.assertEqual(VR.varadas_a_devolver({"A": self.tarea()}, None, AHORA), [])
        self.assertEqual(VR.varadas_a_devolver(
            {"A": self.tarea(nota="reasignada a la nube 20261021")}, self.RESUMEN, AHORA), [])

    def test_sin_cambio_legible_se_queda(self):
        self.assertEqual(VR.varadas_a_devolver({"A": self.tarea(t="no-es-una-hora")}, self.RESUMEN, AHORA), [])
        self.assertEqual(VR.varadas_a_devolver({"A": self.tarea(t=None)}, self.RESUMEN, AHORA), [])

    def test_t_epoch_tambien_cuenta(self):
        p = {"A": self.tarea(t=self.HACE_TRES_DIAS)}
        self.assertEqual(VR.varadas_a_devolver(p, self.RESUMEN, AHORA), ["A"])

    def test_soltadas_sin_medio_tambien(self):
        p = {"Q": self.tarea(medio=None, nota="movida a nube-gh (run 9) desde Genesis"),
             "S": self.tarea(medio=None, nota="movida a oracle (x) desde Genesis")}
        self.assertEqual(VR.varadas_a_devolver(p, self.RESUMEN, AHORA), ["Q"])

    def test_devolver_varadas_es_la_devolucion_sin_envio(self):
        prog = {"A": self.tarea(), "B": {"estado": "commit"}}
        nuevo, hechas = VR.devolver_varadas(prog, ["A"], "20261024")
        self.assertEqual(hechas, ["A"])
        self.assertEqual(nuevo["A"]["estado"], "pendiente")
        self.assertIsNone(nuevo["A"]["medio"])
        self.assertIn("no cuenta como envío", nuevo["A"]["nota"])
        self.assertIn("run 39588171249", nuevo["A"]["nota"])
        self.assertEqual(nuevo["B"], {"estado": "commit"})
        self.assertEqual(prog["A"]["estado"], "reasignada")  # no muta la entrada

    def test_edad_de(self):
        self.assertEqual(VR.edad_de(1000.0, 3000.0), 2000.0)
        self.assertEqual(VR.edad_de(AHORA, AHORA), 0.0)
        self.assertIsNone(VR.edad_de("ayer", AHORA))


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

    def test_varadas_de_un_run_terminado_devuelve_y_avisa_una_vez(self):
        from unittest import mock

        import repartir_nube as RN

        resumen = {"generado": "x", "runs": [{"run": 111, "estado": "in_progress"}]}
        viejo = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(AHORA - 3 * 86400))
        carpeta = os.path.join(self.dir, "starseed_memory_root", "olas")
        os.makedirs(carpeta, exist_ok=True)
        ruta = os.path.join(carpeta, "progreso.json")
        with open(ruta, "w", encoding="utf-8") as f:
            json.dump({"VZF1015Q": {"estado": "reasignada", "medio": "nube",
                                    "nota": "movida a nube-gh (run 39588171249) desde Genesis",
                                    "t": viejo}}, f, ensure_ascii=False)
        reabiertas = []
        with mock.patch.object(RN, "anotar_reaperturas",
                               side_effect=lambda ids, ts=None, ruta=None: reabiertas.extend(ids)):
            hechos = VR.actuar(resumen, self.dir, ahora=AHORA)
        self.assertEqual(len(hechos), 1)
        self.assertIn("1 tarea(s)", hechos[0])
        with open(ruta, encoding="utf-8") as f:
            self.assertEqual(json.load(f)["VZF1015Q"]["estado"], "pendiente")
        self.assertEqual(reabiertas, ["VZF1015Q"])
        hechos = VR.actuar(resumen, self.dir, ahora=AHORA)
        self.assertEqual(hechos, [])  # ya está en pendiente: no repite el aviso


if __name__ == "__main__":
    unittest.main()
