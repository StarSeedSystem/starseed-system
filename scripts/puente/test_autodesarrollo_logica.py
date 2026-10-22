#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas de autodesarrollo_logica: ajustes, franjas, capacidad y reparto de lotes (§4)."""

import unittest
from datetime import datetime
from autodesarrollo_logica import (AJUSTES_POR_DEFECTO as D, VISTO_BUENO_IMPORTANTES,
                                   en_franja, lotes, toca_ejecutar, validar_ajustes)

NOCTURNA = {"dias": list(range(7)), "desde": "02:00", "hasta": "06:00"}
CAPACIDAD_OK = {"huecos_mac": 1, "huecos_a1": 0, "huecos_nube": 0, "proveedores_con_cupo": 3, "presion_mac": 1}
NOCHE = datetime(2026, 10, 23, 3, 0)  # viernes: noche preferente
DIA = datetime(2026, 10, 21, 12, 0)  # miércoles: fuera de la franja nocturna
INTELIGENTE = {"modo": "inteligente", "franjas": [NOCTURNA]}


class AjustesTest(unittest.TestCase):
    """Defaults del §4 y validar_ajustes: lo inválido vuelve al defecto."""

    def test_defectos_del_contrato(self):
        self.assertEqual([D["automatico"], D["profunda"], D["horario"]["modo"], D["horario"]["repartir"]],
                         [True, {"cada_dias": 7}, "inteligente", True])
        self.assertEqual([D["rango"], D["fuentes"]],
                         [{"min": 0, "max": 10}, {"diaria": True, "profunda": True, "astraura": True, "directores": True}])
        self.assertEqual(D["horario"]["franjas"], [{"dias": [0, 1, 2, 3, 4, 5, 6], "desde": "02:00", "hasta": "06:00"}])

    def test_defecto_sin_nada_y_visto_bueno_fijo(self):
        # Alex (§4): la regla «lo importante siempre con visto bueno» es fija, no editable.
        a = validar_ajustes(None)
        self.assertEqual([a["automatico"], a["rango"], a["horario"]["modo"]], [True, {"min": 0, "max": 10}, "inteligente"])
        self.assertEqual(a["importantes_visto_bueno"], VISTO_BUENO_IMPORTANTES)  # siempre True

    def test_valores_validos_se_respetan(self):
        a = validar_ajustes({"automatico": False, "rango": {"min": 2, "max": 5}, "fuentes": {"diaria": False},
                             "horario": {"modo": "franjas", "repartir": False}, "profunda": {"cada_dias": 14}})
        self.assertEqual(a["fuentes"], dict(D["fuentes"], diaria=False))  # las demás siguen encendidas
        self.assertEqual([a["automatico"], a["profunda"]["cada_dias"], a["horario"]["modo"],
                          a["horario"]["repartir"], a["rango"]],
                         [False, 14, "franjas", False, {"min": 2, "max": 5}])

    def test_lo_invalido_vuelve_al_defecto(self):
        self.assertEqual([validar_ajustes({"rango": r})["rango"] for r in
                          [{"min": -3, "max": 99}, {"min": 7, "max": 3}, "cero"]],
                         [{"min": 0, "max": 10}, {"min": 3, "max": 7}, {"min": 0, "max": 10}])
        self.assertEqual(validar_ajustes({"automatico": "sí"})["automatico"], True)
        b = validar_ajustes({"horario": {"modo": "cuando sea", "franjas": []}})
        self.assertEqual([b["horario"]["modo"], b["horario"]["franjas"]], ["inteligente", D["horario"]["franjas"]])
        c = validar_ajustes({"horario": {"repartir": "no"}, "profunda": {"cada_dias": -1}})
        self.assertEqual([c["horario"]["repartir"], c["profunda"]["cada_dias"]], [True, 7])
        self.assertEqual(validar_ajustes({"profunda": {"cada_dias": 0}})["profunda"]["cada_dias"], 0)  # 0 = nunca
        self.assertEqual(validar_ajustes({"importantes_visto_bueno": False})["importantes_visto_bueno"], True)

    def test_franjas_inservibles_se_descartan_y_dias_se_filtran(self):
        a = validar_ajustes({"horario": {"franjas": ["mediodía", {"dias": [99], "desde": "12:00", "hasta": "13:00"},
                                                     {"dias": [1], "desde": "25:00", "hasta": "13:00"},
                                                     {"dias": [0, "x", 7, 2], "desde": "09:00", "hasta": "10:00"}]}})
        self.assertEqual(a["horario"]["franjas"], [{"dias": [0, 2], "desde": "09:00", "hasta": "10:00"}])


class FranjasTest(unittest.TestCase):
    CRUZA = {"dias": [5], "desde": "22:00", "hasta": "04:00"}

    def test_nocturna_del_defecto(self):
        momentos = [(2, 0), (4, 0), (6, 0), (6, 1)]
        self.assertEqual([en_franja(datetime(2026, 10, 21, h, m), [NOCTURNA]) for h, m in momentos],
                         [True, True, True, False])

    def test_el_dia_manda(self):
        f = {"dias": [2], "desde": "20:00", "hasta": "22:00"}  # miércoles: 21-10-2026
        self.assertTrue(en_franja(datetime(2026, 10, 21, 21, 0), [f]))
        self.assertFalse(en_franja(datetime(2026, 10, 22, 21, 0), [f]))

    def test_cruza_medianoche_tarde_y_madrugada(self):
        momentos = [(24, 18), (24, 23), (25, 4), (25, 5)]  # sábado 24 y domingo 25
        self.assertEqual([en_franja(datetime(2026, 10, d, h), [self.CRUZA]) for d, h in momentos],
                         [False, True, True, False])
        vacios = [[], [{"dias": [2], "desde": None, "hasta": "06:00"}]]
        self.assertEqual([en_franja(DIA, f) for f in vacios], [False, False])


class TocaTest(unittest.TestCase):
    def test_ejecuta_con_capacidad_libre_y_prefiere_la_noche(self):
        ok, motivo = toca_ejecutar(NOCHE, INTELIGENTE, CAPACIDAD_OK)
        self.assertEqual((ok, "noche" in motivo), (True, True))
        nube = dict(CAPACIDAD_OK, huecos_mac=0, huecos_a1=0, huecos_nube=2)
        self.assertTrue(toca_ejecutar(NOCHE, INTELIGENTE, nube)[0])  # hueco en nube basta
        dia_ok, motivo = toca_ejecutar(DIA, INTELIGENTE, CAPACIDAD_OK)
        self.assertEqual((dia_ok, "noche" in motivo), (True, True))  # de día también, prefiere noche

    def test_no_ejecuta_sin_hueco_o_cupo_o_con_presion(self):
        for cap, esperado in [(dict(CAPACIDAD_OK, huecos_mac=0, huecos_a1=0, huecos_nube=0), "sin hueco"),
                              (dict(CAPACIDAD_OK, proveedores_con_cupo=0), "proveedores"),
                              (dict(CAPACIDAD_OK, presion_mac=2), "alta"),
                              (dict(CAPACIDAD_OK, presion_mac=None), "desconocida")]:
            ok, motivo = toca_ejecutar(NOCHE, INTELIGENTE, cap)
            self.assertEqual((ok, esperado in motivo), (False, True))

    def test_modo_franjas_solo_dentro_e_invalido_no_ejecuta(self):
        horario = {"modo": "franjas", "franjas": [NOCTURNA]}
        self.assertTrue(toca_ejecutar(datetime(2026, 10, 21, 3, 0), horario, {})[0])
        fuera = toca_ejecutar(DIA, horario, CAPACIDAD_OK)
        self.assertEqual((fuera[0], "fuera de las franjas" in fuera[1]), (False, True))
        maga = toca_ejecutar(NOCHE, {"modo": "maga"}, CAPACIDAD_OK)
        self.assertEqual((maga[0], "inválido" in maga[1]), (False, True))
        h = validar_ajustes({"horario": {"modo": "franjas",
                                         "franjas": [{"dias": [0], "desde": "10:00", "hasta": "12:00"}]}})["horario"]
        lunes = toca_ejecutar(datetime(2026, 10, 26, 10, 30), h, {})
        self.assertEqual((lunes[0], toca_ejecutar(DIA, h, CAPACIDAD_OK)[0]), (True, False))  # lun dentro, miér fuera


class LotesTest(unittest.TestCase):
    def test_repartos(self):
        t = [NOCTURNA] * 3
        self.assertEqual([lotes(7, t, True), lotes(2, t, True), lotes(4, t, False), lotes(5, [NOCTURNA], True)],
                         [[3, 2, 2], [1, 1, 0], [4, 0, 0], [5]])
        self.assertEqual([lotes(0, t, True), lotes(None, t, True), lotes(3, [], True)], [[], [], []])


if __name__ == "__main__":
    unittest.main()
