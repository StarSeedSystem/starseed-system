"""Pruebas de probar_modelo.py: sin red, con motor y medidas inyectados."""
import unittest

from probar_modelo import decidir, probar_modelo


def _reloj(*marcas):
    it = iter(marcas)
    return lambda: next(it)


class TestProbarModelo(unittest.TestCase):
    def test_sin_motor(self):
        r = probar_modelo("imagen", {})
        self.assertFalse(r["exitoso"])
        self.assertIn("motor", r["error"])

    def test_area_desconocida(self):
        r = probar_modelo("telepatia", {}, motor_local=lambda a, m: "x")
        self.assertFalse(r["exitoso"])

    def test_mide_tiempo_y_memoria_por_area(self):
        vistas = []

        def motor(area, muestra):
            vistas.append((area, muestra))
            return b"datos"

        for area in ("imagen", "oido", "voz", "palabra"):
            r = probar_modelo(area, {"id": "m"}, motor, lambda: 321.5, _reloj(10.0, 12.5))
            self.assertTrue(r["exitoso"], area)
            self.assertEqual(r["tiempo_segundos"], 2.5)
            self.assertEqual(r["memoria_mb"], 321.5)
        self.assertEqual(vistas[0][1]["ancho"], 512)
        self.assertEqual(vistas[3][1]["max_tokens"], 64)

    def test_motor_que_falla(self):
        def motor(area, muestra):
            raise RuntimeError("sin memoria")

        r = probar_modelo("voz", {}, motor, lambda: 0.0, _reloj(0.0, 1.0))
        self.assertFalse(r["exitoso"])
        self.assertEqual(r["error"], "sin memoria")

    def test_salida_vacia_no_es_exito(self):
        r = probar_modelo("palabra", {}, lambda a, m: "", lambda: 0.0, _reloj(0.0, 1.0))
        self.assertFalse(r["exitoso"])


class TestDecidir(unittest.TestCase):
    def test_fallida_vuelve_atras(self):
        self.assertEqual(decidir({"exitoso": False}, None), "volver_atras")

    def test_sin_actual_se_queda(self):
        self.assertEqual(decidir({"exitoso": True, "tiempo_segundos": 5}, None), "quedarse")

    def test_actual_rota_se_queda(self):
        self.assertEqual(decidir({"exitoso": True, "tiempo_segundos": 5},
                                 {"exitoso": False}), "quedarse")

    def test_limite_del_15_por_ciento(self):
        actual = {"exitoso": True, "tiempo_segundos": 10.0}
        self.assertEqual(decidir({"exitoso": True, "tiempo_segundos": 11.5}, actual), "quedarse")
        self.assertEqual(decidir({"exitoso": True, "tiempo_segundos": 11.6}, actual), "volver_atras")

    def test_mas_rapida_se_queda(self):
        self.assertEqual(decidir({"exitoso": True, "tiempo_segundos": 1.0},
                                 {"exitoso": True, "tiempo_segundos": 2.0}), "quedarse")

    def test_capacidad_nueva_compensa_lentitud(self):
        self.assertEqual(decidir({"exitoso": True, "tiempo_segundos": 30, "capacidad_nueva": True},
                                 {"exitoso": True, "tiempo_segundos": 1.0}), "quedarse")

    def test_sin_tiempos_no_arriesga(self):
        self.assertEqual(decidir({"exitoso": True}, {"exitoso": True, "tiempo_segundos": 1}),
                         "volver_atras")


if __name__ == "__main__":
    unittest.main()
