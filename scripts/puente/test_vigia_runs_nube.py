#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas del vigía de runs de la nube (2026-10-13): duplicados, sin máquina, preparación atascada,
pasados de tope y «sin dato del paso» (solo aviso). Lo puro, sin red ni GitHub."""
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


class SegundosDesde(unittest.TestCase):
    """OPS1024Eb (de la rama, adaptado): la edad que mide `diagnosticar`, o None si el dato no
    se entiende. Hoy es `_segundos_desde` con hora ISO («Z» de UTC incluida)."""

    def test_de_un_iso_de_github(self):
        self.assertEqual(VR._segundos_desde("2026-10-13T21:40:09Z", AHORA), 1791.0)
        self.assertEqual(VR._segundos_desde("2026-10-13T22:10:00Z", AHORA), 0.0)

    def test_un_dato_que_no_se_entiende_da_none(self):
        self.assertIsNone(VR._segundos_desde(None, AHORA))
        self.assertIsNone(VR._segundos_desde("no-es-una-hora", AHORA))
        self.assertIsNone(VR._segundos_desde(1791929400.0, AHORA))


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


def _local(texto):
    """Epoch local de «AAAA-MM-DD HH:MM:SS», el mismo reloj que `ultimo_cambio`."""
    import time

    return time.mktime(time.strptime(texto, "%Y-%m-%d %H:%M:%S"))


HOY = _local("2026-10-24 12:00:00")
MOVIDA = "movida a nube-gh (run %s) desde Genesis"


class VaradasPuras(unittest.TestCase):
    """OPS1024E: las «reasignada · nube» cuyo run ya terminó, decididas sin red."""

    def test_run_de_la_nota(self):
        self.assertEqual(VR.run_de_la_nota(MOVIDA % 39588171249), "39588171249")
        self.assertIsNone(VR.run_de_la_nota("reasignada a la nube 20261021"))
        self.assertIsNone(VR.run_de_la_nota(None))

    def test_que_es_reasignada_a_la_nube(self):
        self.assertTrue(VR.es_reasignada_a_la_nube({"estado": "reasignada", "medio": "nube", "nota": "x"}))
        self.assertTrue(VR.es_reasignada_a_la_nube({"estado": "reasignada", "nota": MOVIDA % 5}))
        for v in ({"estado": "reasignada", "medio": "oracle"}, {"estado": "reasignada", "medio": "claude-nube"},
                  {"estado": "pendiente", "medio": "nube"}, {"estado": "reasignada", "nota": "movida a nube"}, None):
            self.assertFalse(VR.es_reasignada_a_la_nube(v), v)

    def test_run_vivo_solo_con_el_dato_del_run(self):
        self.assertIs(VR.run_vivo("completed"), False)
        self.assertIs(VR.run_vivo("in_progress"), True)
        self.assertIs(VR.run_vivo("queued"), True)
        self.assertIsNone(VR.run_vivo(None))
        self.assertIsNone(VR.run_vivo("raro"))

    def test_ultimo_cambio_toma_el_mayor(self):
        """`marcar` no reescribe `t`: la fecha de la nota (fin de ese día) manda si es más nueva."""
        v = {"t": "2026-10-20 08:00:00", "nota": "reasignada a la nube 20261023"}
        self.assertEqual(VR.ultimo_cambio(v), _local("2026-10-24 00:00:00"))
        self.assertEqual(VR.ultimo_cambio({"t": "2026-10-22 09:30:00"}), _local("2026-10-22 09:30:00"))
        self.assertIsNone(VR.ultimo_cambio({"nota": "sin fecha"}))

    def test_runs_a_consultar_sin_los_vivos_y_con_tope(self):
        prog = {"A": {"estado": "reasignada", "medio": "nube", "nota": MOVIDA % 10},
                "B": {"estado": "reasignada", "medio": "nube", "nota": MOVIDA % 11},
                "C": {"estado": "reasignada", "medio": "nube", "nota": MOVIDA % 12},
                "D": {"estado": "commit", "nota": MOVIDA % 13}}
        self.assertEqual(VR.runs_a_consultar(prog, {"11"}), ["12", "10"])
        self.assertEqual(VR.runs_a_consultar(prog, set(), maximo=1), ["12"])

    def test_run_terminado_vuelve_vivo_o_sin_dato_se_queda(self):
        prog = {"VZF1015Q": {"estado": "reasignada", "medio": "nube", "nota": MOVIDA % 39588171249},
                "VIVA": {"estado": "reasignada", "medio": "nube", "nota": MOVIDA % 2},
                "ENRESUMEN": {"estado": "reasignada", "medio": "nube", "nota": MOVIDA % 3},
                "SINDATO": {"estado": "reasignada", "medio": "nube", "nota": MOVIDA % 4}}
        estados = {"39588171249": "completed", "2": "in_progress", "3": "completed", "4": None}
        hechas = VR.varadas_tras_su_run(prog, estados, {"3"}, HOY)
        self.assertEqual([h[0] for h in hechas], ["VZF1015Q"])
        self.assertIn("39588171249", hechas[0][2])

    def test_sin_run_solo_pasadas_24_h(self):
        prog = {"VIEJA": {"estado": "reasignada", "medio": "nube", "nota": "reasignada a la nube 20261021"},
                "NUEVA": {"estado": "reasignada", "medio": "nube", "nota": "reasignada a la nube 20261024"},
                "AYER": {"estado": "reasignada", "medio": "nube", "nota": "x", "t": "2026-10-23 13:00:00"},
                "SINFECHA": {"estado": "reasignada", "medio": "nube", "nota": "x"}}
        self.assertEqual([h[0] for h in VR.varadas_tras_su_run(prog, {}, set(), HOY)], ["VIEJA"])

    def test_nunca_las_de_la_cola_de_un_run_vivo(self):
        prog = {"X": {"estado": "reasignada", "medio": "nube", "nota": MOVIDA % 9}}
        self.assertEqual(VR.varadas_tras_su_run(prog, {"9": "completed"}, set(), HOY, ids_vivos={"X"}), [])


class DevolverVaradas(unittest.TestCase):
    """OPS1024E: `devolver_varadas` con la API de GitHub y el Chat Director simulados."""

    def setUp(self):
        import json
        import tempfile
        from unittest import mock

        import repartir_nube as RN

        self.dir = tempfile.mkdtemp()
        os.makedirs(os.path.join(self.dir, "starseed_memory_root", "olas"))
        os.makedirs(os.path.join(self.dir, "enjambre", "colas"))
        self.ruta = os.path.join(self.dir, "starseed_memory_root", "olas", "progreso.json")
        self.prog = {
            "VZF1015Q": {"estado": "reasignada", "medio": "nube", "nota": MOVIDA % 39588171249},
            "DGM1018I": {"estado": "reasignada", "medio": "nube", "nota": MOVIDA % 39576180546},
            "VIVA": {"estado": "reasignada", "medio": "nube", "nota": MOVIDA % 77},
            "SINDATO": {"estado": "reasignada", "medio": "nube", "nota": MOVIDA % 88},
            "OTRA": {"estado": "pendiente"},
        }
        with open(self.ruta, "w", encoding="utf-8") as f:
            json.dump({"tareas": self.prog}, f)
        self.estados = {"39588171249": "completed", "39576180546": "completed", "77": "in_progress", "88": None}
        self.preguntados, self.avisos = [], []
        self.p = [mock.patch.object(VR, "_avisar", side_effect=self.avisos.append),
                  mock.patch.object(RN, "REAPERTURAS_NUBE", os.path.join(self.dir, "reaperturas.json"))]
        for x in self.p:
            x.start()

    def tearDown(self):
        for x in self.p:
            x.stop()

    def _api(self, run):
        self.preguntados.append(run)
        return self.estados.get(run)

    def _leer(self):
        import json

        with open(self.ruta, encoding="utf-8") as f:
            return json.load(f)["tareas"]

    def test_vuelven_las_de_runs_terminados_y_se_dice_cuantas(self):
        texto = VR.devolver_varadas({"runs": []}, self.dir, ahora=HOY, estado_run=self._api)
        t = self._leer()
        self.assertEqual(t["VZF1015Q"]["estado"], "pendiente")
        self.assertEqual(t["DGM1018I"]["estado"], "pendiente")
        self.assertIn("no cuenta como envío", t["VZF1015Q"]["nota"])
        self.assertIsNone(t["VZF1015Q"]["medio"])
        self.assertEqual(t["VIVA"]["estado"], "reasignada")       # run vivo: se queda
        self.assertEqual(t["SINDATO"]["estado"], "reasignada")    # API sin dato: se queda
        self.assertEqual(t["OTRA"], {"estado": "pendiente"})
        self.assertIn("devolví 2 tarea(s)", texto)
        self.assertEqual(self.avisos, [texto])
        import repartir_nube as RN

        self.assertEqual(set(RN.leer_reaperturas(HOY, RN.REAPERTURAS_NUBE)), {"VZF1015Q", "DGM1018I"})

    def test_run_vivo_en_el_resumen_ni_se_pregunta(self):
        self.estados["39588171249"] = "completed"
        VR.devolver_varadas({"runs": [{"run": 39588171249, "cola": "enjambre/colas/no-esta.json"}]},
                            self.dir, ahora=HOY, estado_run=self._api)
        self.assertNotIn("39588171249", self.preguntados)
        self.assertEqual(self._leer()["VZF1015Q"]["estado"], "reasignada")

    def test_api_sin_dato_no_toca_nada_ni_avisa(self):
        self.assertIsNone(VR.devolver_varadas({"runs": []}, self.dir, ahora=HOY, estado_run=lambda r: None))
        self.assertEqual(self._leer(), self.prog)
        self.assertEqual(self.avisos, [])

    def test_progreso_plano_y_no_repite_aviso(self):
        """OPS1024Eb (de la rama, adaptado): el progreso también se lee PLANO (sin la envoltura
        «tareas», la forma con que la rama lo escribía) y una segunda pasada no vuelve a avisar."""
        plano = {"VZF1015Q": {"estado": "reasignada", "medio": "nube", "nota": MOVIDA % 39588171249}}
        import json

        with open(self.ruta, "w", encoding="utf-8") as f:
            json.dump(plano, f)
        texto = VR.devolver_varadas({"runs": []}, self.dir, ahora=HOY, estado_run=self._api)
        self.assertIn("devolví 1 tarea(s)", texto)
        with open(self.ruta, encoding="utf-8") as f:
            self.assertEqual(json.load(f)["VZF1015Q"]["estado"], "pendiente")
        self.assertIsNone(VR.devolver_varadas({"runs": []}, self.dir, ahora=HOY, estado_run=self._api))

    def test_actuar_las_devuelve_en_cada_pasada(self):
        from unittest import mock

        with mock.patch.object(VR, "estado_del_run", side_effect=lambda r, raiz: self._api(r)), \
                mock.patch.object(VR, "MEMORIA", os.path.join(self.dir, "m.json")):
            hecho = VR.actuar({"runs": []}, self.dir, ahora=HOY)
        self.assertEqual(len(hecho), 1)
        self.assertEqual(self._leer()["DGM1018I"]["estado"], "pendiente")


if __name__ == "__main__":
    unittest.main()
