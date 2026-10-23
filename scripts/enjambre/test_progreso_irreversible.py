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


class ReabrirDespuesDeSoltarTest(unittest.TestCase):
    """(2026-10-21) Una tarea prestada a la nube cuyo run murió: `reabrir` la devuelve a
    pendientes y la saca de SOLTADAS, para que el bucle no la vuelva a marcar hecha."""

    def test_una_soltada_reabierta_vuelve_a_la_tanda(self):
        from unittest import mock

        enjambre.MIAS.add("T1")
        enjambre.SOLTADAS.add("T1")
        enjambre.CORTADOS.add("T1")
        enjambre.PROG["T1"] = {"estado": "reasignada", "medio": "nube"}
        orden = {"T1": {"accion": "reabrir", "motivo": "devuelta de la nube: su run terminó"}}
        with mock.patch.object(enjambre, "consumir_control", return_value=orden), \
                mock.patch.object(enjambre, "entregar_mensajes"), \
                mock.patch.object(enjambre, "guardar_prog"), \
                mock.patch.object(enjambre, "evento"), \
                mock.patch.object(enjambre, "asegurar_modelo_opencode", return_value=True):
            enjambre.atender_control()

        self.assertEqual("pendiente", enjambre.PROG["T1"]["estado"])
        self.assertNotIn("T1", enjambre.SOLTADAS)
        self.assertNotIn("T1", enjambre.CORTADOS)

        enjambre.MIAS.discard("T1")
        enjambre.PROG.pop("T1", None)
        enjambre.REABRIR.discard("T1")

    def test_una_tarea_soltada_sin_reabrir_sigue_fuera(self):
        # La otra cara: SOLTADAS solo se vacía con la orden, no por atender el control.
        from unittest import mock

        enjambre.MIAS.add("T2")
        enjambre.SOLTADAS.add("T2")
        enjambre.PROG["T2"] = {"estado": "reasignada", "medio": "nube"}
        orden = {"T2": {"accion": "aprobar"}}
        with mock.patch.object(enjambre, "consumir_control", return_value=orden), \
                mock.patch.object(enjambre, "entregar_mensajes"), \
                mock.patch.object(enjambre, "guardar_prog"), \
                mock.patch.object(enjambre, "evento"):
            enjambre.atender_control()

        self.assertIn("T2", enjambre.SOLTADAS)
        enjambre.MIAS.discard("T2")
        enjambre.PROG.pop("T2", None)
        enjambre.APROBACIONES.pop("T2", None)
        enjambre.QUIEN_DECIDIO.pop("T2", None)
