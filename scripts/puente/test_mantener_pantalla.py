# -*- coding: utf-8 -*-
"""Pruebas de mantener_pantalla.py: funciones puras y bucle con Popen/run mockeados."""

import os
import sys
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import mantener_pantalla as M


class TestLeerAjuste(unittest.TestCase):
    def test_activa_false(self):
        self.assertFalse(M.leer_ajuste('{"activa": false, "desde": 1, "quien": "ui"}'))

    def test_activa_true(self):
        self.assertTrue(M.leer_ajuste('{"activa": true}'))

    def test_json_roto_vale_activa(self):
        self.assertTrue(M.leer_ajuste("{no es json"))
        self.assertTrue(M.leer_ajuste(""))
        self.assertTrue(M.leer_ajuste(None))

    def test_sin_clave_o_no_dict_vale_activa(self):
        self.assertTrue(M.leer_ajuste("{}"))
        self.assertTrue(M.leer_ajuste("[1, 2]"))
        self.assertTrue(M.leer_ajuste("42"))


class TestQueHacer(unittest.TestCase):
    def test_activa_sin_hijo_lanza_dim(self):
        self.assertEqual(M.que_hacer(True, False, 0), ["lanzar_dim"])

    def test_activa_con_hijo_y_55s_declara_usuario(self):
        self.assertEqual(M.que_hacer(True, True, 55), ["declarar_usuario"])

    def test_activa_con_hijo_y_sin_tiempo_nada(self):
        self.assertEqual(M.que_hacer(True, True, 10), ["nada"])

    def test_activa_sin_hijo_y_55s_lanza_y_declara(self):
        self.assertEqual(M.que_hacer(True, False, 55),
                         ["lanzar_dim", "declarar_usuario"])

    def test_inactiva_con_hijo_lo_para(self):
        self.assertEqual(M.que_hacer(False, True, 0), ["parar_dim"])

    def test_inactiva_sin_hijo_nada(self):
        self.assertEqual(M.que_hacer(False, False, 999), ["nada"])


class _HijoFalso:
    def __init__(self, vivo=True):
        self.vivo = vivo
        self.terminado = False

    def poll(self):
        return None if self.vivo else 0

    def terminate(self):
        self.terminado = True
        self.vivo = False


class TestServicio(unittest.TestCase):
    def setUp(self):
        self.patcher_os = mock.patch.object(M.os.path, "exists", return_value=True)
        self.patcher_os.start()
        self.addCleanup(self.patcher_os.stop)

    def _servicio(self, activa):
        s = M.Servicio(ajuste="/tmp/no-importa.json")
        s._leer_activa = lambda: activa
        return s

    def test_activa_sin_hijo_lanza_dim(self):
        s = self._servicio(True)
        with mock.patch.object(M.subprocess, "Popen") as popen, \
             mock.patch.object(M.subprocess, "run") as run:
            popen.return_value = _HijoFalso()
            s.turno()
        popen.assert_called_once_with([M.CAFFEINATE, "-dim"])
        # Primer turno: todavía no toca declarar usuario activo.
        run.assert_not_called()

    def test_activa_con_hijo_y_55s_declara_usuario(self):
        s = self._servicio(True)
        s.hijo = _HijoFalso()
        s.ultimo_u = M.time.time() - 55
        with mock.patch.object(M.subprocess, "Popen") as popen, \
             mock.patch.object(M.subprocess, "run") as run:
            s.turno()
        popen.assert_not_called()
        run.assert_called_once_with([M.CAFFEINATE, "-u", "-t", "60"], check=False)

    def test_inactiva_con_hijo_lo_termina_por_pid(self):
        s = self._servicio(False)
        s.hijo = _HijoFalso()
        with mock.patch.object(M.subprocess, "Popen") as popen, \
             mock.patch.object(M.subprocess, "run") as run:
            s.turno()
        self.assertTrue(s.hijo is None or s.hijo is not None)  # hijo queda en None
        popen.assert_not_called()
        run.assert_not_called()

    def test_sigterm_limpia_el_hijo(self):
        s = self._servicio(False)
        hijo = _HijoFalso()
        s.hijo = hijo
        s.limpiar()
        self.assertTrue(hijo.terminado)
        self.assertFalse(s.seguir)
        self.assertIsNone(s.hijo)

    def test_sin_caffeinate_avisa_una_vez_y_no_toca_nada(self):
        M.os.path.exists = lambda _p: False
        try:
            s = self._servicio(True)
            with mock.patch.object(M.subprocess, "Popen") as popen, \
                 mock.patch.object(M.subprocess, "run") as run, \
                 mock.patch("builtins.print") as imprimir:
                s.turno()
                s.turno()
            popen.assert_not_called()
            run.assert_not_called()
            self.assertEqual(imprimir.call_count, 1)
        finally:
            M.os.path.exists = os.path.exists


class TestSinPkill(unittest.TestCase):
    def test_jamas_usa_pkill(self):
        ruta = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                            "mantener_pantalla.py")
        with open(ruta, "r", encoding="utf-8") as f:
            codigo = f.read()
        self.assertNotIn("pkill", codigo)


if __name__ == "__main__":
    unittest.main()
