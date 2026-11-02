# -*- coding: utf-8 -*-
"""Pruebas PURAS de la tapa cerrada (KAL1101D).

Todo entra por argumentos: el ajuste del dueño, la corriente y la batería, si hay trabajo vivo y
si `disablesleep` está puesto. VERDAD a respetar: en un portátil Mac cerrar la tapa duerme el
sistema aunque haya aserciones; solo sigue despierto en clamshell o con `pmset -a disablesleep 1`.
Nunca se activa sin permiso explícito, sin corriente, con batería ≤ 50 % o sin trabajo.
"""
import os
import sys
import unittest

DIR = os.path.dirname(os.path.abspath(__file__))
if DIR not in sys.path:
    sys.path.insert(0, DIR)

import tapa_cerrada as T  # noqa: E402


class TestLeerAjuste(unittest.TestCase):
    def test_solo_el_booleano_true_permite(self):
        self.assertTrue(T.leer_ajuste('{"permitir": true}'))

    def test_todo_lo_demas_es_no(self):
        for texto in ('{"permitir": false}', "{}", "", "{roto", "null", "[1]", None,
                      '{"permitir": 0}', '{"permitir": "no"}'):
            self.assertFalse(T.leer_ajuste(texto), texto)


class TestDecidir(unittest.TestCase):
    def _d(self, **cambios):
        base = dict(pedido=True, enchufada=True, bateria=92, trabajo=True, activo=False)
        base.update(cambios)
        return T.decidir(**base)

    def test_activa_con_todas_las_condiciones(self):
        r = self._d()
        self.assertEqual((r["accion"], r["motivo"]), ("activar", "trabajo-y-corriente"))

    def test_nunca_sin_permiso_del_dueno(self):
        self.assertEqual(self._d(pedido=False)["accion"], "nada")
        r = self._d(pedido=False, activo=True)
        self.assertEqual((r["accion"], r["motivo"]), ("desactivar", "sin-permiso"))

    def test_nunca_sin_corriente_ni_sin_trabajo(self):
        for cambio in ({"enchufada": False}, {"trabajo": False}):
            self.assertEqual(self._d(**cambio)["accion"], "nada")
            self.assertEqual(self._d(activo=True, **cambio)["accion"], "desactivar")

    def test_bateria_debe_superar_el_umbral(self):
        self.assertEqual(self._d(bateria=50)["accion"], "nada")
        self.assertEqual(self._d(bateria=50, activo=True)["accion"], "desactivar")
        self.assertEqual(self._d(bateria=51)["accion"], "activar")

    def test_bateria_desconocida_no_activa(self):
        self.assertEqual(self._d(bateria=None)["accion"], "nada")
        self.assertEqual(self._d(bateria=None, activo=True)["accion"], "desactivar")

    def test_ya_activa_no_repite(self):
        self.assertEqual(self._d(activo=True), {"accion": "nada", "motivo": "ya-activa"})


class TestComando(unittest.TestCase):
    def test_activar_lleva_sudo_sin_password(self):
        self.assertEqual(
            T.comando("activar"),
            ["/usr/bin/sudo", "-n", "/usr/bin/pmset", "-a", "disablesleep", "1"],
        )

    def test_desactivar_es_el_contrario_y_nada_no_tiene_comando(self):
        self.assertEqual(T.comando("desactivar"), ["/usr/bin/sudo", "-n", "/usr/bin/pmset",
                                                   "-a", "disablesleep", "0"])
        self.assertIsNone(T.comando("nada"))


class Corredor:
    def __init__(self, codigo=0, falla=None):
        self.codigo, self.falla, self.llamadas = codigo, falla, []

    def __call__(self, argv, **kwargs):
        self.llamadas.append((argv, kwargs))

        class Resultado:
            returncode = self.codigo

        if self.falla is not None:
            raise self.falla
        return Resultado()


class TestAplicar(unittest.TestCase):
    def test_aplica_y_dice_hecho(self):
        correr = Corredor()
        r = T.aplicar("activar", correr=correr)
        self.assertEqual((r["hecho"], r["motivo"]), (True, "ok"))
        self.assertEqual(correr.llamadas[0][0][-1], "1")

    def test_negacion_y_error_no_revientan(self):
        r = T.aplicar("desactivar", correr=Corredor(codigo=1))
        self.assertEqual((r["hecho"], r["motivo"]), (False, "sudo-o-pmset"))
        r = T.aplicar("activar", correr=Corredor(falla=OSError("sin sudo")))
        self.assertEqual((r["hecho"], r["motivo"]), (False, "no-ejecutado"))

    def test_nada_no_lanza_procesos(self):
        correr = Corredor()
        self.assertEqual(T.aplicar("nada", correr=correr)["motivo"], "nada-que-hacer")
        self.assertEqual(correr.llamadas, [])


class TestDecidirYAplicar(unittest.TestCase):
    def test_una_puerta_y_deshacer_al_salir(self):
        r = T.decidir_y_aplicar(pedido=True, enchufada=True, bateria=80, trabajo=True,
                                activo=False, correr=Corredor())
        self.assertEqual((r["accion"], r["hecho"]), ("activar", True))
        correr = Corredor()
        r = T.decidir_y_aplicar(pedido=False, enchufada=True, bateria=90, trabajo=True,
                                activo=True, correr=correr)
        self.assertEqual((r["accion"], correr.llamadas[0][0][-1]), ("desactivar", "0"))


if __name__ == "__main__":
    unittest.main()
