"""Pruebas unitarias de presupuesto.py (unittest puro, sin IO ni terceros)."""

import math
import unittest

from presupuesto import decidir_presupuesto


def ventana(unidad, limite, usado, inicio, reinicio, observado, reservado=0.0):
    return {
        "unidad": unidad,
        "limite": limite,
        "usado": usado,
        "reservado": reservado,
        "inicio": inicio,
        "reinicio": reinicio,
        "observado": observado,
    }


AHORA = 1000.0


class TestPresupuesto(unittest.TestCase):
    def test_idea_feliz_una_ventana(self):
        r = decidir_presupuesto(
            [ventana("h", 100.0, 10.0, 0.0, 3600.0, AHORA)], {"h": 5.0}, AHORA
        )
        self.assertEqual(r, {"permitido": True, "motivos": [], "reintentar_en": None})

    def test_dos_ventanas_unidades_distintas(self):
        # Horaria permite; semanal bloquea por reserva => se deniega.
        r = decidir_presupuesto(
            [
                ventana("h", 100.0, 0.0, 0.0, 3600.0, AHORA),
                ventana(  # semanal: 950 + 10 > 1000 * 0.8
                    "s", 1000.0, 950.0, 0.0, 7 * 3600.0, AHORA
                ),
            ],
            {"h": 1.0, "s": 10.0},
            AHORA,
        )
        self.assertFalse(r["permitido"])
        self.assertIn("reserva_agotada", r["motivos"])
        self.assertEqual(r["reintentar_en"], 7 * 3600.0)

    def test_coste_cero_no_ilimita(self):
        # Coste 0 cabe; coste 0 no habilita costes mayores en otra llamada.
        base = [ventana("h", 100.0, 79.0, 0.0, 3600.0, AHORA)]
        ok = decidir_presupuesto(base, {"h": 0.0}, AHORA)
        no = decidir_presupuesto(base, {"h": 2.0}, AHORA)
        self.assertTrue(ok["permitido"])
        self.assertFalse(no["permitido"])

    def test_falta_coste_o_ventanas_no_verificado(self):
        for v, c in (
            ([ventana("h", 1.0, 0.0, 0.0, 1e9, AHORA)], {}),
            ([], {"h": 1.0}),
            (None, {"h": 1.0}),
        ):
            r = decidir_presupuesto(v, c, AHORA)
            self.assertFalse(r["permitido"])
            self.assertIn("no_verificado", r["motivos"])
            self.assertIsNone(r["reintentar_en"])

    def test_datos_caducados_vencidos_y_futuros(self):
        vieja = ventana("h", 10.0, 0.0, -3000.0, 1e6, AHORA - 2000.0)
        vencida = ventana("h", 10.0, 0.0, 0.0, AHORA, AHORA - 1.0)
        futura = ventana("h", 10.0, 0.0, 0.0, 9e9, AHORA + 1.0)
        r = decidir_presupuesto([vieja, vencida, futura], {"h": 1.0}, AHORA)
        self.assertFalse(r["permitido"])
        self.assertIn("datos_caducados", r["motivos"])
        self.assertIn("ventana_vencida", r["motivos"])
        self.assertIn("datos_invalidos", r["motivos"])

    def test_nan_infinito_bool_rechazados(self):
        for valor in (math.nan, math.inf, -math.inf, True, "5"):
            v = ventana("h", 100.0, 0.0, 0.0, 1e9, AHORA)
            v["usado"] = valor
            r = decidir_presupuesto([v], {"h": 1.0}, AHORA)
            self.assertFalse(r["permitido"])
            self.assertIn("datos_invalidos", r["motivos"])
        self.assertFalse(
            decidir_presupuesto(
                [ventana("h", 1.0, 0.0, 0.0, 1e9, AHORA)], {"h": math.nan}, AHORA
            )["permitido"]
        )
        r = decidir_presupuesto(None, {"h": 1.0}, math.nan)
        self.assertEqual(r["motivos"], ["no_verificado"])

    def test_reservado_en_vuelo_y_sin_clave_reservado(self):
        # reservado cuenta contra el techo aunque usado sea 0.
        base = ventana("h", 100.0, 0.0, 0.0, 3600.0, AHORA)
        lleno = dict(base, reservado=79.0)
        self.assertFalse(decidir_presupuesto([lleno], {"h": 2.0}, AHORA)["permitido"])
        del base["reservado"]  # sin clave: no debe lanzar KeyError
        self.assertTrue(decidir_presupuesto([base], {"h": 5.0}, AHORA)["permitido"])

    def test_rafaga_inicial(self):
        # Al inicio de la ventana cabe limite*(1-reserva)*rafaga.
        v = ventana("h", 100.0, 0.0, AHORA, AHORA + 1000.0, AHORA)
        dentro = {"h": 100.0 * 0.8 * 0.05}  # justo el hueco de ráfaga
        fuera = {"h": 100.0 * 0.8 * 0.05 + 1.0}
        self.assertTrue(decidir_presupuesto([v], dentro, AHORA)["permitido"])
        r = decidir_presupuesto([v], fuera, AHORA)
        self.assertFalse(r["permitido"])
        self.assertIn("ritmo_excedido", r["motivos"])

    def test_ritmo_calcula_instante_exacto(self):
        # total=40, techo=80 => objetivo=0.5-0.05=0.45 => ahora+450.
        v = ventana("h", 100.0, 39.0, AHORA, AHORA + 1000.0, AHORA)
        r = decidir_presupuesto([v], {"h": 1.0}, AHORA)
        self.assertFalse(r["permitido"])
        self.assertAlmostEqual(r["reintentar_en"], AHORA + 450.0)
        del v["reservado"]
        r2 = decidir_presupuesto([v], {"h": 41.0}, math.nan)
        self.assertIsNone(r2["reintentar_en"])  # datos inválidos => None

    def test_limites_exactos(self):
        # total == techo justo en el borde (ritmo saturado): permitido.
        v = ventana("h", 100.0, 80.0, 0.0, 1e9, AHORA)
        self.assertTrue(
            decidir_presupuesto([v], {"h": 0.0}, AHORA, rafaga=1.0)["permitido"]
        )
        # Un ápice más: deniega por reserva y espera al reinicio.
        r = decidir_presupuesto([v], {"h": 1e-9}, AHORA, rafaga=1.0)
        self.assertFalse(r["permitido"])
        self.assertIn("reserva_agotada", r["motivos"])
        self.assertEqual(r["reintentar_en"], 1e9)

    def test_no_muta_entrada(self):
        v = [ventana("h", 100.0, 0.0, 0.0, 3600.0, AHORA)]
        c = {"h": 5.0}
        import copy

        copia = copy.deepcopy(v)
        decidir_presupuesto(v, c, AHORA)
        self.assertEqual(v, copia)

    def test_solo_ritmo_no_reserva(self):
        # Bajo el techo total pero por encima del ritmo: solo ritmo_excedido.
        v = ventana("h", 100.0, 0.0, AHORA, AHORA + 1000.0, AHORA)
        r = decidir_presupuesto([v], {"h": 50.0}, AHORA)
        self.assertEqual(r["motivos"], ["ritmo_excedido"])
        self.assertIsNotNone(r["reintentar_en"])


if __name__ == "__main__":
    unittest.main()
