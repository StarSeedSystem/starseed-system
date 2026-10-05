"""Pruebas de mantener_pantalla: lógica pura y ciclo con lanzadores inyectados."""

import json
import unittest
from unittest.mock import MagicMock

import mantener_pantalla as mp


def ajuste(activa: bool) -> str:
    return json.dumps({"activa": activa, "desde": None, "quien": "prueba"})


class LeerAjusteTests(unittest.TestCase):
    def test_activa_true(self):
        self.assertTrue(mp.leer_ajuste(ajuste(True)))

    def test_activa_false(self):
        self.assertFalse(mp.leer_ajuste(ajuste(False)))

    def test_json_roto_activa_por_defecto(self):
        self.assertTrue(mp.leer_ajuste("{roto"))

    def test_vacio_activa_por_defecto(self):
        self.assertTrue(mp.leer_ajuste(""))

    def test_no_dict_activa_por_defecto(self):
        self.assertTrue(mp.leer_ajuste("[1]"))


class QueHacerTests(unittest.TestCase):
    def test_activa_sin_hijo_lanza_y_declara(self):
        acciones = mp.que_hacer(True, False, 999)
        self.assertEqual(acciones, ["lanzar_dim", "declarar_usuario"])

    def test_activa_con_hijo_y_55s_declara(self):
        self.assertEqual(mp.que_hacer(True, True, 55), ["declarar_usuario"])

    def test_activa_con_hijo_reciente_nada(self):
        self.assertEqual(mp.que_hacer(True, True, 5), ["nada"])

    def test_inactiva_con_hijo_para(self):
        self.assertEqual(mp.que_hacer(False, True, 0), ["parar_dim"])

    def test_inactiva_sin_hijo_nada(self):
        self.assertEqual(mp.que_hacer(False, False, 0), ["nada"])


def servicio_simulado():
    popen = MagicMock()
    run = MagicMock()
    reloj = [1000.0]
    popen.return_value.poll.return_value = None
    servicio = mp.ServicioPantalla(popen, run, ahora=lambda: reloj[0])
    return servicio, popen, run, reloj


class CicloTests(unittest.TestCase):
    def test_activa_sin_hijo_lanza_caffeinate_dim(self):
        servicio, popen, run, _ = servicio_simulado()
        servicio.ciclo(ajuste(True))
        args = popen.call_args[0][0]
        self.assertIn("-dim", args)
        self.assertIn("-w", args)
        run.assert_called_once_with([mp.CAFFEINATE, "-u", "-t", "60"], timeout=10)

    def test_activa_con_hijo_a_los_55s_declara_usuario(self):
        servicio, popen, run, reloj = servicio_simulado()
        servicio.ciclo(ajuste(True))
        run.reset_mock()
        reloj[0] += 55
        servicio.ciclo(ajuste(True))
        run.assert_called_once_with([mp.CAFFEINATE, "-u", "-t", "60"], timeout=10)

    def test_inactiva_con_hijo_lo_termina(self):
        servicio, popen, _, _ = servicio_simulado()
        servicio.ciclo(ajuste(True))
        hijo = popen.return_value
        servicio.ciclo(ajuste(False))
        hijo.terminate.assert_called_once()
        self.assertFalse(servicio.hijo_vivo())

    def test_json_roto_en_ciclo_activa(self):
        servicio, popen, _, _ = servicio_simulado()
        acciones = servicio.ciclo("{roto")
        self.assertIn("lanzar_dim", acciones)
        popen.assert_called_once()

    def test_nunca_usa_pkill(self):
        servicio, popen, run, reloj = servicio_simulado()
        servicio.ciclo(ajuste(True))
        reloj[0] += 60
        servicio.ciclo(ajuste(True))
        servicio.ciclo(ajuste(False))
        for llamada in popen.call_args_list + run.call_args_list:
            for cadena in llamada[0][0] if llamada[0] else []:
                self.assertNotIn("pkill", cadena)


if __name__ == "__main__":
    unittest.main()
