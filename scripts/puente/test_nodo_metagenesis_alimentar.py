# -*- coding: utf-8 -*-
"""Pruebas de «alimentar la cola viva» (CAP1018Ab-d1b, parte 1): lógica pura, sin red ni disco.

Un medio con orquestador vivo y trabajadores libres no se queda parado 40 min: se le añaden tareas a
SU cola (UN orquestador por medio), nunca se lanza una segunda cola.
"""
import os
import sys
import unittest

DIR = os.path.dirname(os.path.abspath(__file__))
if DIR not in sys.path:
    sys.path.insert(0, DIR)

import nodo_metagenesis_logica as L  # noqa: E402


def medio(libres=2, quieta=900, orquestadores=True, cola_viva=True, **extra):
    salud = {"repo": True, "orquestador": True,
             "orquestadores": [{"pid": 7, "cola": "cola-mg-1"}] if orquestadores else []}
    if cola_viva:
        salud["cola_viva"] = {"trabajando": 1, "esperando": 1, "libres": libres, "sin_nuevas_s": quieta}
    salud.update(extra)
    return {"modo": "real", "secreto": True, "salud": salud}


def mac(listas=8):
    return {"trabajo": {"listas": listas}}


class Alimentable(unittest.TestCase):
    def test_libre(self):
        self.assertEqual(L.medio_alimentable("a1", medio()), (True, ""))

    def test_ocupado_sin_libres(self):
        ok, motivo = L.medio_alimentable("a1", medio(libres=0))
        self.assertFalse(ok)
        self.assertIn("libres", motivo)

    def test_cola_con_tareas_nuevas_recientes(self):
        self.assertFalse(L.medio_alimentable("a1", medio(quieta=599))[0])
        self.assertTrue(L.medio_alimentable("a1", medio(quieta=600))[0])

    def test_nunca_sin_orquestador_vivo(self):
        # sin orquestador no se alimenta (se le lanzaría una cola: es el caso de medio_ocioso)
        ok, motivo = L.medio_alimentable("a1", medio(orquestadores=False))
        self.assertFalse(ok)
        self.assertIn("orquestador", motivo)

    def test_compatibilidad_sin_campo_nuevo(self):
        # un latido de un medio con el código viejo no trae cola_viva: no se alimenta, no revienta
        self.assertFalse(L.medio_alimentable("a1", medio(cola_viva=False))[0])
        self.assertFalse(L.medio_alimentable("a1", {})[0])
        malo = medio()
        malo["salud"]["cola_viva"]["libres"] = True
        self.assertFalse(L.medio_alimentable("a1", malo)[0])

    def test_sin_secreto_o_seco_o_autoritativo(self):
        sin = medio()
        sin["secreto"] = False
        self.assertFalse(L.medio_alimentable("a1", sin)[0])
        seco = medio()
        seco["modo"] = "seco"
        self.assertFalse(L.medio_alimentable("a1", seco)[0])
        self.assertFalse(L.medio_alimentable("a1", medio(autoritativo=True))[0])


class Plan(unittest.TestCase):
    def plan(self, nodos, listas=8, **s):
        return L.planificar_resultados("mac", dict(mac(listas), **s), nodos, "mac", 1e9)

    def repartos(self, plan):
        return [a for a in plan if a["accion"] == "repartir"]

    def test_alimenta_con_tope_libres_por_dos(self):
        (a,) = self.repartos(self.plan({"a1": medio(libres=3)}))
        self.assertEqual(a["args"], {"destino": "a1", "tope": 6, "modo": "alimentar"})
        self.assertEqual(a["nodo"], "mac")

    def test_tope_nunca_pasa_de_8(self):
        (a,) = self.repartos(self.plan({"a1": medio(libres=9)}))
        self.assertEqual(a["args"]["tope"], 8)
        self.assertIsNone(L.args_validos("repartir", a["args"]))

    def test_elige_el_de_mas_libres(self):
        (a,) = self.repartos(self.plan({"a1": medio(libres=1), "nube": medio(libres=3)}))
        self.assertEqual(a["args"]["destino"], "nube")

    def test_ocupado_no_recibe(self):
        self.assertEqual(self.repartos(self.plan({"a1": medio(libres=0)})), [])

    def test_ocioso_sigue_con_el_reparto_de_siempre(self):
        # sin orquestador vivo y libre: cola prestada normal, SIN modo (compatibilidad)
        ocioso = medio(orquestadores=False, cola_viva=False)
        (a,) = self.repartos(self.plan({"a1": ocioso}))
        self.assertEqual(a["args"], {"destino": "a1", "tope": L.REPARTO_TOPE})

    def test_nunca_dos_orquestadores(self):
        # un medio con orquestador vivo jamás recibe una cola nueva, solo alimentación
        for a in self.repartos(self.plan({"a1": medio()})):
            self.assertEqual(a["args"].get("modo"), "alimentar")

    def test_pocas_listas_o_pausado_no_alimenta(self):
        self.assertEqual(self.repartos(self.plan({"a1": medio()}, listas=2)), [])
        self.assertEqual(self.repartos(self.plan({"a1": medio()}, pausado=True)), [])

    def test_modo_validado(self):
        self.assertIsNotNone(L.args_validos("repartir", {"destino": "a1", "modo": "otro"}))
        self.assertIsNone(L.args_validos("repartir", {"destino": "a1"}))


if __name__ == "__main__":
    unittest.main()
