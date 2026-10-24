# -*- coding: utf-8 -*-
"""Una corrida vieja no puede reabrir trabajo ya cerrado desde Genesis."""
import importlib.util
import os
import sys
import unittest


RUTA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "starseed-enjambre.py")
ESPEC = importlib.util.spec_from_file_location("enjambre_progreso", RUTA)
enjambre = importlib.util.module_from_spec(ESPEC)
sys.modules["enjambre_progreso"] = enjambre
ESPEC.loader.exec_module(enjambre)


class ProgresoIrreversibleTest(unittest.TestCase):
    def test_commit_persistido_no_vuelve_a_en_curso(self):
        memoria = {"T1": {"estado": "en_curso", "nota": "copia vieja"}}
        disco = {"T1": {"estado": "commit", "sha": "abc1234"}}
        fundido = enjambre.fusionar_progreso(memoria, disco, {"T1"})
        self.assertEqual(fundido["T1"], disco["T1"])

    def test_rechazo_persistido_tampoco_se_reabre(self):
        memoria = {"T1": {"estado": "en_curso"}}
        disco = {"T1": {"estado": "rechazada"}}
        self.assertEqual(enjambre.fusionar_progreso(memoria, disco, {"T1"})["T1"], disco["T1"])

    def test_tarea_propia_no_cerrada_conserva_el_avance_nuevo(self):
        memoria = {"T1": {"estado": "revisando"}}
        disco = {"T1": {"estado": "en_curso"}}
        self.assertEqual(enjambre.fusionar_progreso(memoria, disco, {"T1"})["T1"], memoria["T1"])

    def test_tarea_ajena_siempre_toma_la_foto_del_disco(self):
        memoria = {"T2": {"estado": "en_curso"}}
        disco = {"T2": {"estado": "fallo"}}
        self.assertEqual(enjambre.fusionar_progreso(memoria, disco, {"T1"})["T2"], disco["T2"])

    def test_una_propia_prestada_a_otro_medio_toma_lo_del_disco(self):
        memoria = {"AV1": {"estado": "reasignada", "medio": "claude-nube", "nota": "prestada"}}
        disco = {"AV1": {"estado": "pendiente", "medio": "", "nota": "devuelta del carril"}}
        self.assertEqual(enjambre.fusionar_progreso(memoria, disco, {"AV1"})["AV1"], disco["AV1"])


if __name__ == "__main__":
    unittest.main()


class ReabrirConPeldanoTest(unittest.TestCase):
    """(2026-10-09) `reabrir` respeta el contador y el modelo que manda la escalera."""

    def test_reabrir_aplica_contador_y_modelo(self):
        from unittest import mock

        enjambre.MIAS.add("T9")
        enjambre.PROG["T9"] = {"estado": "fallo_tests", "intentos_auto": 8}
        orden = {"T9": {"accion": "reabrir", "motivo": "escalada a Codex", "intentos_auto": 9,
                        "modelo": "codex/gpt-5.6-sol"}}
        with mock.patch.object(enjambre, "consumir_control", return_value=orden), \
                mock.patch.object(enjambre, "entregar_mensajes"), \
                mock.patch.object(enjambre, "guardar_prog"), \
                mock.patch.object(enjambre, "evento"), \
                mock.patch.object(enjambre, "asegurar_modelo_opencode", return_value=True):
            enjambre.atender_control()
        self.assertEqual("pendiente", enjambre.PROG["T9"]["estado"])
        self.assertEqual(9, enjambre.PROG["T9"]["intentos_auto"])
        self.assertEqual("codex/gpt-5.6-sol", enjambre.REASIGNADOS.pop("T9"))
        enjambre.MIAS.discard("T9")
        enjambre.PROG.pop("T9", None)
        enjambre.REABRIR.discard("T9")

    def test_tarea_soltada_reabierta_se_quita_de_los_cierres_en_memoria(self):
        from unittest import mock

        tid = "PRESTADA"
        enjambre.MIAS.add(tid)
        enjambre.SOLTADAS.add(tid)
        enjambre.CORTADOS.add(tid)
        enjambre.PROG[tid] = {"estado": "pendiente"}
        orden = {tid: {"accion": "reabrir", "motivo": "devuelta de la nube"}}
        try:
            with mock.patch.object(enjambre, "consumir_control", return_value=orden), \
                    mock.patch.object(enjambre, "entregar_mensajes"), \
                    mock.patch.object(enjambre, "guardar_prog"), \
                    mock.patch.object(enjambre, "evento"):
                enjambre.atender_control()
            self.assertNotIn(tid, enjambre.SOLTADAS)
            self.assertNotIn(tid, enjambre.CORTADOS)
            self.assertEqual("pendiente", enjambre.PROG[tid]["estado"])
        finally:
            enjambre.MIAS.discard(tid)
            enjambre.SOLTADAS.discard(tid)
            enjambre.CORTADOS.discard(tid)
            enjambre.REABRIR.discard(tid)
            enjambre.PROG.pop(tid, None)


class ReaperturaDevolucionNubeTest(unittest.TestCase):
    def test_pide_reabrir_en_la_cola_viva_y_fusiona_control(self):
        from unittest import mock

        import importlib.util
        import json
        import tempfile
        import shutil

        ruta = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "puente", "director-nube.py")
        spec = importlib.util.spec_from_file_location("director_nube_reapertura", ruta)
        director = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(director)
        raiz_antes = director.RAIZ
        temporal = tempfile.mkdtemp()
        director.RAIZ = temporal
        self.addCleanup(setattr, director, "RAIZ", raiz_antes)
        self.addCleanup(shutil.rmtree, temporal, True)
        olas = os.path.join(temporal, "starseed_memory_root", "olas")
        os.makedirs(olas)
        with open(os.path.join(olas, "cola-auto-viva.json"), "w", encoding="utf-8") as f:
            json.dump({"tareas": [{"id": "T1"}]}, f)
        control = os.path.join(olas, "control-cola-auto-viva.json")
        with open(control, "w", encoding="utf-8") as f:
            json.dump({"T0": {"accion": "soltar"}}, f)
        medio = type("Medio", (), {"colas_vivas": staticmethod(lambda: ["cola-auto-viva.json"])})
        with mock.patch.dict(sys.modules, {"nodo_metagenesis_medio": medio}):
            director.ordenar_reapertura_en_colas_vivas(["T1"])
        with open(control, encoding="utf-8") as f:
            ordenes = json.load(f)
        self.assertEqual({"accion": "soltar"}, ordenes["T0"])
        self.assertEqual("reabrir", ordenes["T1"]["accion"])
        self.assertEqual("director-nube", ordenes["T1"]["quien"])
        self.assertEqual("devuelta de la nube: su run terminó", ordenes["T1"]["motivo"])
