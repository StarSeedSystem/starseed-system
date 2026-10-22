#!/usr/bin/env python3
"""Pruebas de autodesarrollo_logica (sin red ni disco)."""
import os, sys, unittest
from datetime import datetime
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import autodesarrollo_logica as L

CAP = {"huecos_mac": 1, "huecos_a1": 0, "huecos_nube": 0, "proveedores_con_cupo": 2, "presion_mac": 0}


def a(dia, h, m=0):
    return datetime(2026, 10, 19 + dia, h, m)


class Ajustes(unittest.TestCase):
    def test_defecto(self):
        self.assertEqual(L.validar_ajustes(None), L.AJUSTES_POR_DEFECTO)
        self.assertEqual(L.validar_ajustes({"x": 1}), L.AJUSTES_POR_DEFECTO)

    def test_rango_acotado(self):
        self.assertEqual(L.validar_ajustes({"rango": {"min": -5, "max": 99}})["rango"], {"min": 0, "max": 10})
        self.assertEqual(L.validar_ajustes({"rango": {"min": 8, "max": 3}})["rango"], {"min": 3, "max": 3})
        self.assertEqual(L.validar_ajustes({"rango": {"min": "a", "max": True}})["rango"], {"min": 0, "max": 10})

    def test_invalido_vuelve_al_defecto(self):
        r = L.validar_ajustes({"automatico": "si", "fuentes": {"diaria": 0, "astraura": False},
                               "horario": {"modo": "raro", "repartir": 1}, "profunda": {"cada_dias": -1}})
        self.assertTrue(r["automatico"] and r["fuentes"]["diaria"] and r["horario"]["repartir"])
        self.assertFalse(r["fuentes"]["astraura"])
        self.assertEqual(r["horario"]["modo"], "inteligente")
        self.assertEqual(r["profunda"]["cada_dias"], 0)

    def test_franjas(self):
        r = L.validar_ajustes({"horario": {"franjas": [
            {"dias": [1, 1, 9, "x"], "desde": "22:00", "hasta": "03:00"},
            {"dias": [0], "desde": "25:00", "hasta": "03:00"}, {"dias": [], "desde": "01:00", "hasta": "02:00"}]}})
        self.assertEqual(r["horario"]["franjas"], [{"dias": [1], "desde": "22:00", "hasta": "03:00"}])
        self.assertEqual(L.validar_ajustes({"horario": {"franjas": [{"dias": [9]}]}})["horario"]["franjas"],
                         L.AJUSTES_POR_DEFECTO["horario"]["franjas"])
        self.assertEqual(L.validar_ajustes({"horario": {"franjas": []}})["horario"]["franjas"], [])

    def test_regla_importantes_no_es_ajuste(self):
        r = L.validar_ajustes({"importantes_con_visto_bueno": False, "visto_bueno": False})
        self.assertEqual(set(r), set(L.AJUSTES_POR_DEFECTO))


class Franjas(unittest.TestCase):
    F = [{"dias": [0], "desde": "02:00", "hasta": "06:00"}]
    N = [{"dias": [4], "desde": "22:00", "hasta": "02:00"}]  # viernes noche

    def test_simple(self):
        self.assertTrue(L.en_franja(a(0, 2), self.F))
        self.assertTrue(L.en_franja(a(0, 5, 59), self.F))
        self.assertFalse(L.en_franja(a(0, 6), self.F))
        self.assertFalse(L.en_franja(a(1, 3), self.F))

    def test_cruza_medianoche(self):
        self.assertTrue(L.en_franja(a(4, 23), self.N))
        self.assertTrue(L.en_franja(a(5, 1, 59), self.N))
        self.assertFalse(L.en_franja(a(5, 2), self.N))
        self.assertFalse(L.en_franja(a(4, 1), self.N))  # viernes de madrugada: es la del jueves
        self.assertFalse(L.en_franja(a(5, 23), self.N))

    def test_vacias_e_invalidas(self):
        self.assertFalse(L.en_franja(a(0, 3), []))
        self.assertFalse(L.en_franja(a(0, 3), [{"dias": [0], "desde": "x", "hasta": "06:00"}]))


class TocaEjecutar(unittest.TestCase):
    def inte(self, ahora, **kw):
        return L.toca_ejecutar(ahora, {"modo": "inteligente"}, {**CAP, **kw})

    def test_noche_con_un_hueco(self):
        self.assertTrue(self.inte(a(0, 3))[0])
        self.assertTrue(self.inte(a(0, 23))[0])

    def test_dia_pide_dos_huecos(self):
        self.assertFalse(self.inte(a(0, 12))[0])
        self.assertTrue(self.inte(a(0, 12), huecos_nube=1)[0])

    def test_sin_huecos(self):
        ok, m = self.inte(a(0, 3), huecos_mac=0)
        self.assertFalse(ok); self.assertIn("huecos", m)

    def test_sin_cupo(self):
        ok, m = self.inte(a(0, 3), proveedores_con_cupo=0)
        self.assertFalse(ok); self.assertIn("cupo", m)

    def test_presion(self):
        self.assertFalse(self.inte(a(0, 3), presion_mac=2)[0])
        self.assertTrue(self.inte(a(0, 3), presion_mac=1)[0])

    def test_franjas(self):
        h = {"modo": "franjas", "franjas": [{"dias": [0], "desde": "02:00", "hasta": "06:00"}]}
        self.assertTrue(L.toca_ejecutar(a(0, 3), h, {})[0])
        ok, m = L.toca_ejecutar(a(0, 12), h, CAP)
        self.assertFalse(ok); self.assertIn("franjas", m)


class Lotes(unittest.TestCase):
    def test_reparte(self):
        self.assertEqual(L.lotes(10, 3), [4, 3, 3])
        self.assertEqual(L.lotes(2, 4), [1, 1, 0, 0])
        self.assertEqual(sum(L.lotes(7, 3)), 7)

    def test_sin_repartir(self):
        self.assertEqual(L.lotes(5, 3, False), [5, 0, 0])

    def test_sin_franjas_o_tareas(self):
        self.assertEqual(L.lotes(5, 0), [])
        self.assertEqual(L.lotes(-3, 2), [0, 0])


if __name__ == "__main__":
    unittest.main()
