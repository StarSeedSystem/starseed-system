"""Pruebas de probar_modelo.py: decisión pura y medidas con motores inyectados (sin red)."""
import unittest

from probar_modelo import QUEDARSE, VOLVER_ATRAS, decidir, motores_http, probar_modelo


def ok(t, caps=()):
    return {"exitoso": True, "tiempo_segundos": t, "capacidades": list(caps)}


class RelojFalso:
    def __init__(self, *marcas):
        self.marcas = list(marcas)

    def __call__(self):
        return self.marcas.pop(0)


class TestProbar(unittest.TestCase):
    def test_sin_motor(self):
        r = probar_modelo("imagen", {})
        self.assertFalse(r["exitoso"])
        self.assertIn("sin motor", r["error"])

    def test_area_desconocida(self):
        self.assertFalse(probar_modelo("telepatia", {"telepatia": lambda: 1})["exitoso"])

    def test_mide_tiempo_y_pico_de_memoria(self):
        vistos = {}
        motor = lambda **kw: vistos.update(kw) or b"png"
        mems = iter([100.0, 340.5])
        r = probar_modelo("imagen", {"imagen": motor}, lambda: next(mems), RelojFalso(10.0, 12.5))
        self.assertTrue(r["exitoso"])
        self.assertEqual((r["tiempo_segundos"], r["memoria_mb"]), (2.5, 340.5))
        self.assertEqual((vistos["ancho"], vistos["alto"]), (512, 512))

    def test_motor_que_lanza_o_sin_muestra(self):
        def cae(**kw):
            raise RuntimeError("sin memoria")
        r = probar_modelo("voz", {"voz": cae}, lambda: 1.0, RelojFalso(0, 1))
        self.assertFalse(r["exitoso"])
        self.assertEqual(r["error"], "sin memoria")
        self.assertFalse(probar_modelo("oido", {"oido": lambda **k: ""}, lambda: 1.0, RelojFalso(0, 1))["exitoso"])

    def test_motores_http_con_cliente_inyectado(self):
        llamadas = []

        def post(url, cuerpo):
            llamadas.append((url, cuerpo))
            return {"data": [1], "content": "hola"}
        m = motores_http(post)
        self.assertTrue(probar_modelo("imagen", m)["exitoso"])
        self.assertTrue(probar_modelo("palabra", m)["exitoso"])
        self.assertEqual(llamadas[0][1]["size"], "512x512")
        self.assertEqual(llamadas[1][1]["n_predict"], 64)


class TestDecidir(unittest.TestCase):
    def test_falla_vuelve_atras(self):
        self.assertEqual(decidir({"exitoso": False}, None), VOLVER_ATRAS)
        self.assertEqual(decidir({"exitoso": False}, ok(1)), VOLVER_ATRAS)

    def test_sin_actual_se_queda(self):
        self.assertEqual(decidir(ok(9), None), QUEDARSE)
        self.assertEqual(decidir(ok(9), {"exitoso": False}), QUEDARSE)

    def test_margen_del_15_por_ciento(self):
        self.assertEqual(decidir(ok(1.15), ok(1.0)), QUEDARSE)
        self.assertEqual(decidir(ok(1.2), ok(1.0)), VOLVER_ATRAS)
        self.assertEqual(decidir(ok(0.5), ok(1.0)), QUEDARSE)

    def test_capacidad_nueva_compensa_la_lentitud(self):
        self.assertEqual(decidir(ok(3, ["edicion"]), ok(1, ["generar"])), QUEDARSE)
        self.assertEqual(decidir(ok(3, ["generar"]), ok(1, ["generar"])), VOLVER_ATRAS)

    def test_sin_tiempos_no_se_arriesga(self):
        self.assertEqual(decidir({"exitoso": True}, ok(1)), VOLVER_ATRAS)


if __name__ == "__main__":
    unittest.main()
