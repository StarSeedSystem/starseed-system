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


class ReabrirUnaSoltadaTest(unittest.TestCase):
    """(2026-10-21) Soltada a la nube y devuelta: vuelve a pendientes y NO se marca hecha.

    Caso medido (03:20 UTC): Claude devolvió a `pendiente` en progreso.json 43 tareas
    prestadas a la nube cuyo run había muerto; minutos después volvían a «reasignada»,
    porque la copia en memoria del orquestador manda sobre el disco para sus propias
    tareas (MIAS). Y la orden `reabrir` tampoco servía: el bucle hace
    `if tid in SOLTADAS: pendientes.pop(tid); hechas.add(tid)` y SOLTADAS nunca se vacía.
    El `reabrir` tiene que quitar la tarea de SOLTADAS (y de CORTADOS) antes de nada.
    """

    def test_reabrir_saca_la_tarea_de_soltadas_y_de_cortados(self):
        from unittest import mock

        enjambre.MIAS.add("T8")
        enjambre.SOLTADAS.add("T8")
        enjambre.CORTADOS.add("T8")
        enjambre.REABRIR.discard("T8")
        enjambre.PROG["T8"] = {"estado": "reasignada", "medio": "nube", "nota": "prestada"}
        orden = {"T8": {"accion": "reabrir", "quien": "director-nube",
                        "motivo": "devuelta de la nube: su run terminó"}}
        with mock.patch.object(enjambre, "consumir_control", return_value=orden), \
                mock.patch.object(enjambre, "entregar_mensajes"), \
                mock.patch.object(enjambre, "guardar_prog"), \
                mock.patch.object(enjambre, "evento"), \
                mock.patch.object(enjambre, "asegurar_modelo_opencode", return_value=True):
            enjambre.atender_control()
        # Vuelve a pendiente para el orquestador que la tiene en memoria…
        self.assertEqual("pendiente", enjambre.PROG["T8"]["estado"])
        # …y ya no la soltará de la tanda: el bucle no la marca hecha.
        self.assertNotIn("T8", enjambre.SOLTADAS)
        self.assertNotIn("T8", enjambre.CORTADOS)
        enjambre.MIAS.discard("T8")
        enjambre.SOLTADAS.discard("T8")
        enjambre.CORTADOS.discard("T8")
        enjambre.PROG.pop("T8", None)
        enjambre.REABRIR.discard("T8")
