# -*- coding: utf-8 -*-
"""Pruebas de las órdenes de COL1012A: desconectar y contenedor.

Se prueban las órdenes firmadas y la validación de argumentos.
"""
import json
import os
import sys
import unittest

DIR = os.path.dirname(os.path.abspath(__file__))
if DIR not in sys.path:
    sys.path.insert(0, DIR)

import nodo_metagenesis_logica as L  # noqa: E402
import nodo_metagenesis_bus as B  # noqa: E402

SECRETO = "s" * 48  # secreto de PRUEBA
T0 = 1_791_640_000.0  # 2026-10-10 ~11:46 UTC


def orden_firmada(accion, para="lider", t=T0, args=None, nonce="nonce-prueba-0001", secreto=SECRETO):
    """Crea una orden firmada para pruebas."""
    o = {"v": "1", "accion": accion, "para": para, "t": B.iso(t), "nonce": nonce, "por": "prueba", "args": args or {}}
    o["firma"] = L.firmar(o, secreto)
    return o


class TestColmenaOrders(unittest.TestCase):
    def test_desconectar_valida(self):
        """Orden válida de desconectar a un nodo concreto."""
        nodo_id = "mac-aaaaaa"
        o = orden_firmada("desconectar", para=nodo_id, args={})
        válido, motivo = L.validar_orden(o, SECRETO, T0, {})
        self.assertTrue(válido, motivo)

    def test_contenedor_valida_activo_true(self):
        """Orden válida de contenedor con activo=True y trabajadores=2."""
        nodo_id = "mac-aaaaaa"
        o = orden_firmada("contenedor", para=nodo_id, args={"activo": True, "trabajadores": 2})
        válido, motivo = L.validar_orden(o, SECRETO, T0, {})
        self.assertTrue(válido, motivo)

    def test_contenedor_valida_activo_false(self):
        """Orden válida de contenedor con activo=False (sin trabajadores)."""
        nodo_id = "mac-aaaaaa"
        o = orden_firmada("contenedor", para=nodo_id, args={"activo": False})
        válido, motivo = L.validar_orden(o, SECRETO, T0, {})
        self.assertTrue(válido, motivo)

    def test_contenedor_sin_activo(self):
        """contenedor sin el argumento activo debe fallar."""
        nodo_id = "mac-aaaaaa"
        o = orden_firmada("contenedor", para=nodo_id, args={"trabajadores": 2})
        válido, motivo = L.validar_orden(o, SECRETO, T0, {})
        self.assertFalse(válido)
        self.assertIn("falta argumento: activo", motivo)

    def test_contenedor_trabajadores_con_activo_false(self):
        """contenedor con activos=False y trabajadores debe fallar."""
        nodo_id = "mac-aaaaaa"
        o = orden_firmada("contenedor", para=nodo_id, args={"activo": False, "trabajadores": 2})
        válido, motivo = L.validar_orden(o, SECRETO, T0, {})
        self.assertFalse(válido)
        self.assertIn("trabajadores solo se permite si activo es True", motivo)

    def test_contenedor_trabajadores_5(self):
        """contenedor con trabajadores=5 debe fallar."""
        nodo_id = "mac-aaaaaa"
        o = orden_firmada("contenedor", para=nodo_id, args={"activo": True, "trabajadores": 5})
        válido, motivo = L.validar_orden(o, SECRETO, T0, {})
        self.assertFalse(válido)
        self.assertIn("trabajadores fuera de 1–4", motivo)

    def test_desconectar_a_todos(self):
        """desconectar a «todos» debe fallar."""
        o = orden_firmada("desconectar", para="todos", args={})
        válido, motivo = L.validar_orden(o, SECRETO, T0, {})
        self.assertFalse(válido)
        self.assertIn("destino no válido: no se puede mandar a lider, todos o un medio genérico", motivo)

    def test_desconectar_a_lider(self):
        """desconectar a «lider» debe fallar."""
        o = orden_firmada("desconectar", para="lider", args={})
        válido, motivo = L.validar_orden(o, SECRETO, T0, {})
        self.assertFalse(válido)
        self.assertIn("destino no válido: no se puede mandar a lider, todos o un medio genérico", motivo)

    def test_desconectar_a_medio_generico(self):
        """desconectar a un medio genérico (ej. mac) debe fallar."""
        o = orden_firmada("desconectar", para="mac", args={})
        válido, motivo = L.validar_orden(o, SECRETO, T0, {})
        self.assertFalse(válido)
        self.assertIn("destino no válido: no se puede mandar a lider, todos o un medio genérico", motivo)

    def test_contenedor_sin_trabajadores_con_activo_true(self):
        """contenedor con activos=True pero sin trabajadores debe fallar."""
        nodo_id = "mac-aaaaaa"
        o = orden_firmada("contenedor", para=nodo_id, args={"activo": True})
        válido, motivo = L.validar_orden(o, SECRETO, T0, {})
        self.assertFalse(válido)
        self.assertIn("falta argumento: trabajadores", motivo)

    def test_trabajadores_valor_0(self):
        """contenedor con trabajadores=0 debe fallar."""
        nodo_id = "mac-aaaaaa"
        o = orden_firmada("contenedor", para=nodo_id, args={"activo": True, "trabajadores": 0})
        válido, motivo = L.validar_orden(o, SECRETO, T0, {})
        self.assertFalse(válido)
        self.assertIn("trabajadores fuera de 1–4", motivo)

    def test_trabajadores_valor_negativo(self):
        """contenedor con trabajadores=-1 debe fallar."""
        nodo_id = "mac-aaaaaa"
        o = orden_firmada("contenedor", para=nodo_id, args={"activo": True, "trabajadores": -1})
        válido, motivo = L.validar_orden(o, SECRETO, T0, {})
        self.assertFalse(válido)
        self.assertIn("trabajadores fuera de 1–4", motivo)

    def test_trabajadores_valor_maximo_ok(self):
        """contenedor con trabajadores=4 debe ser válido."""
        nodo_id = "mac-aaaaaa"
        o = orden_firmada("contenedor", para=nodo_id, args={"activo": True, "trabajadores": 4})
        válido, motivo = L.validar_orden(o, SECRETO, T0, {})
        self.assertTrue(válido, motivo)

    def test_trabajadores_valor_6(self):
        """contenedor con trabajadores=6 debe fallar."""
        nodo_id = "mac-aaaaaa"
        o = orden_firmada("contenedor", para=nodo_id, args={"activo": True, "trabajadores": 6})
        válido, motivo = L.validar_orden(o, SECRETO, T0, {})
        self.assertFalse(válido)
        self.assertIn("trabajadores fuera de 1–4", motivo)


if __name__ == "__main__":
    unittest.main()