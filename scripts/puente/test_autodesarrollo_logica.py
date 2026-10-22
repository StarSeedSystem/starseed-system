# -*- coding: utf-8 -*-
"""Pruebas puras de scripts/puente/autodesarrollo_logica.py (IMN1021A · Ola 1021I, §4 imaginación)."""
import os
import sys
import unittest
from copy import deepcopy
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import autodesarrollo_logica as L  # noqa: E402

D = L.AJUSTES_POR_DEFECTO
MADRUGADA = [{"dias": [2], "desde": "02:00", "hasta": "06:00"}]  # solo el miércoles (día 2)
CRUCE = [{"dias": [4], "desde": "23:00", "hasta": "02:00"}]  # cruza el viernes (4)
LLENA = {"huecos_mac": 0, "huecos_a1": 2, "huecos_nube": 1, "proveedores_con_cupo": 1, "presion_mac": 1}

def t(dia: int, h: int, m: int = 0) -> datetime:
    return datetime(2026, 10, dia, h, m)  # 21 = miércoles (día 2), 23 = viernes (4), 24 = sábado (5)

class TestDefectos(unittest.TestCase):
    def test_ajustes_por_defecto_del_sop(self):
        self.assertEqual(D, {"automatico": True, "rango": {"min": 0, "max": 10},
                             "fuentes": {f: True for f in ("diaria", "profunda", "astraura", "directores")},
                             "profunda": {"cada_dias": 7},
                             "horario": {"modo": "inteligente", "repartir": True,
                                         "franjas": [{"dias": [0, 1, 2, 3, 4, 5, 6],
                                                      "desde": "02:00", "hasta": "06:00"}]}})
    def test_validar_con_defectos_no_muta_nada(self):
        copia = deepcopy(D)
        self.assertEqual([L.validar_ajustes(e) for e in ({}, None)], [copia, copia])
        L.validar_ajustes({"rango": {"min": 9, "max": 1}, "horario": {"repartir": False},
                           "profunda": {"cada_dias": 0}})
        self.assertEqual(D, copia)

class TestValidarAjustes(unittest.TestCase):
    def test_automatico_solo_con_bool(self):
        self.assertFalse(L.validar_ajustes({"automatico": False})["automatico"])
        for raro in ("no", None, 1, 0):
            self.assertIs(L.validar_ajustes({"automatico": raro})["automatico"], True)

    # los enteros del rango se rebotan a su borde (clamp) y nunca min > max; lo raro, al defecto
    def test_rango_acotado_a_0_10_y_min_menos_igual_max(self):
        for r, esperado in (({"min": 15, "max": -3}, {"min": 0, "max": 0}),   # rebote a bordes
                            ({"min": 8, "max": 2}, {"min": 2, "max": 2}),    # min ≤ max
                            ({"min": 12, "max": 5}, {"min": 5, "max": 5}),
                            ({"min": "x", "max": True}, {"min": 0, "max": 10}),  # raro: al defecto
                            ({"min": 3, "max": 7.5}, {"min": 3, "max": 10}),
                            ("vago", {"min": 0, "max": 10})):
            self.assertEqual(L.validar_ajustes({"rango": r})["rango"], esperado, r)
    def test_fuentes_una_a_una_y_solo_las_conocidas(self):
        a = L.validar_ajustes({"fuentes": {"astraura": False, "telegram": False, "diaria": "no"}})
        self.assertEqual(a["fuentes"], dict(D["fuentes"], astraura=False))
        self.assertNotIn("telegram", a["fuentes"])
    def test_horario_modo_franjas_repartir(self):
        h = L.validar_ajustes({"horario": {"modo": "franjas", "repartir": False}})["horario"]
        self.assertEqual((h["modo"], h["repartir"]), ("franjas", False))
        self.assertEqual(L.validar_ajustes({"horario": {"modo": "vago"}})["horario"]["modo"], "inteligente")
    def test_franjas_la_valida_sigue_y_la_mala_vuelve_al_defecto(self):
        d = {"franjas": [{"dias": [5, 2, 2], "desde": "23:00", "hasta": "02:00"},  # normaliza
                         {"dias": [7], "desde": "02:00", "hasta": "06:00"},
                         {"desde": "02:00", "hasta": "06:00"},  # sin dias: fuera
                         {"dias": [2], "desde": "25:00", "hasta": "06:00"},  # 25:00: fuera
                         {"dias": [2], "desde": "02:00"}]}  # sin hasta: fuera
        salen = L.validar_ajustes({"horario": d})["horario"]["franjas"]
        self.assertEqual(salen, [{"dias": [2, 5], "desde": "23:00", "hasta": "02:00"}])
        self.assertEqual(L.validar_ajustes({"horario": {"franjas": []}})["horario"]["franjas"],
                         D["horario"]["franjas"])
    def test_profunda_cada_dias_con_0_como_nunca(self):
        cad = lambda x: L.validar_ajustes({"profunda": {"cada_dias": x}})["profunda"]["cada_dias"]  # noqa: E731
        self.assertEqual([cad(x) for x in (0, 365)], [0, 365])
        self.assertEqual({cad(r) for r in (-1, 400, "x", True, 1.5)}, {7})  # lo raro, a 7 días
    def test_la_regla_de_lo_importante_no_es_un_ajuste_ni_se_apaga(self):
        a = L.validar_ajustes({"visto_bueno": False, "importante": "apagado", "automatico": False})
        self.assertEqual(a, dict(D, automatico=False))  # las claves oscuras, fuera
        self.assertTrue(L.importante_trae_visto_bueno())

class TestEnFranja(unittest.TestCase):
    def test_de_la_misma_madrugada_con_sus_limites(self):
        for cuando, si in ((t(21, 1, 59), False), (t(21, 2), True), (t(21, 5, 59), True),
                           (t(21, 6), False), (t(21, 12), False), (t(22, 3, 30), False)):
            self.assertIs(L.en_franja(cuando, MADRUGADA), si, cuando)
    def test_la_cruzada_cuenta_tambien_la_cola_del_dia_siguiente(self):
        for cuando, si in ((t(23, 22, 59), False), (t(23, 23), True), (t(24, 0), True),
                           (t(24, 1, 59), True), (t(24, 2), False), (t(23, 12), False),
                           (t(25, 1), False)):  # domingo de madrugada: no es viernes
            self.assertIs(L.en_franja(cuando, CRUCE), si, cuando)
        self.assertFalse(L.en_franja(t(21, 3), []))  # sin franjas, franja rota y sin reloj: nada
        self.assertFalse(L.en_franja(t(21, 3), [{"dias": [2], "desde": "x", "hasta": "06:00"}]))
        self.assertFalse(L.en_franja(None, MADRUGADA))

class TestTocaEjecutar(unittest.TestCase):
    def test_modo_franjas_solo_mira_el_reloj(self):
        h, cruzado = dict(D["horario"], modo="franjas"), dict(D["horario"], modo="franjas", franjas=CRUCE)
        self.assertTrue(L.toca_ejecutar(t(21, 3), h, {})[0])
        self.assertFalse(L.toca_ejecutar(t(21, 12), h, LLENA)[0])
        self.assertTrue(L.toca_ejecutar(t(24, 1), cruzado, {})[0])
        self.assertFalse(L.toca_ejecutar(t(24, 3), cruzado, {})[0])
    def test_inteligente_pide_hueco_cupo_y_mac_sin_presion(self):
        si, motivo = L.toca_ejecutar(t(21, 15), None, LLENA)  # horario roto: modo inteligente
        self.assertTrue(si and "noche" in motivo)  # la preferencia nocturna, anotada
        for sin, parte in ((dict(LLENA, huecos_a1=0, huecos_nube=0), "sin hueco"),
                           (dict(LLENA, proveedores_con_cupo=0), "con cupo"),
                           (dict(LLENA, presion_mac=2), "no estorbo"),
                           ({}, "sin medir"), (dict(LLENA, presion_mac="x"), "sin medir")):
            no, motivo = L.toca_ejecutar(None, D["horario"], sin)
            self.assertFalse(no, sin)
            self.assertIn(parte, motivo)

class TestLotes(unittest.TestCase):
    def test_repartidos_de_golpe_y_sin_tareas_o_franjas(self):
        self.assertEqual(L.lotes(10, [1, 2, 3], True), [4, 3, 3])  # las de más, a la 1.ª
        self.assertEqual(L.lotes(3, [{"dias": [2]}], True), [3])
        self.assertEqual(L.lotes(7, [1, 2, 3], False), [7, 0, 0])  # sin repartir: golpe único
        self.assertEqual(L.lotes(-1, [1, 2], False), [0, 0])
        self.assertEqual(L.lotes(0, [1, 2], True), [0, 0])  # sin tareas: los lotes en cero
        self.assertEqual(L.lotes(4, [], True), [])
        self.assertEqual(sum(L.lotes(9, list(range(4)), True)), 9)

if __name__ == "__main__":
    unittest.main()
