"""Pruebas de probar_modelo.py (VGM1016Kb): sin red ni modelos; motores y medidas inyectados."""
import unittest

from probar_modelo import decidir, motor_imagen_http, probar_modelo


class MotorFalso:
    """Un motor por área con un método que devuelve algo (o lanza)."""
    def __init__(self, salida=b"x", falla=None):
        self.salida, self.falla, self.llamadas = salida, falla, []

    def _hacer(self, nombre, **kw):
        self.llamadas.append((nombre, kw))
        if self.falla:
            raise RuntimeError(self.falla)
        return self.salida

    def generar(self, **kw): return self._hacer("generar", **kw)
    def transcribir(self, **kw): return self._hacer("transcribir", **kw)
    def hablar(self, **kw): return self._hacer("hablar", **kw)
    def completar(self, **kw): return self._hacer("completar", **kw)


def _reloj(*marcas):
    it = iter(marcas)
    return lambda: next(it)


class TestProbar(unittest.TestCase):
    def test_sin_motor(self):
        r = probar_modelo("imagen", {})
        self.assertFalse(r["exitoso"])
        self.assertEqual(r["error"], "No local motor provided")

    def test_area_no_soportada(self):
        self.assertIn("Unsupported", probar_modelo("video", {}, MotorFalso())["error"])

    def test_motor_sin_el_metodo(self):
        self.assertIn("lacks", probar_modelo("imagen", {}, object())["error"])

    def test_imagen_mide_tiempo_y_memoria(self):
        motor = MotorFalso()
        r = probar_modelo("imagen", {}, motor, medir_memoria=lambda: 321.5, reloj=_reloj(10.0, 12.5))
        self.assertTrue(r["exitoso"])
        self.assertEqual(r["tiempo_segundos"], 2.5)
        self.assertEqual(r["memoria_mb"], 321.5)
        self.assertEqual(motor.llamadas[0][1]["ancho"], 512)
        self.assertEqual(motor.llamadas[0][1]["alto"], 512)

    def test_palabra_pide_64_tokens_y_oido_voz_funcionan(self):
        motor = MotorFalso("texto")
        self.assertTrue(probar_modelo("palabra", {}, motor)["exitoso"])
        self.assertEqual(motor.llamadas[0][1]["max_tokens"], 64)
        self.assertTrue(probar_modelo("oido", {}, motor)["exitoso"])
        self.assertTrue(probar_modelo("voz", {}, motor)["exitoso"])

    def test_el_pico_es_el_mayor_de_antes_y_despues(self):
        mems = iter([100.0, 400.0, 400.0])
        r = probar_modelo("voz", {}, MotorFalso(), medir_memoria=lambda: next(mems))
        self.assertEqual(r["memoria_mb"], 400.0)

    def test_excepcion_del_motor_es_fallo_no_crash(self):
        r = probar_modelo("imagen", {}, MotorFalso(falla="sin VRAM"))
        self.assertFalse(r["exitoso"])
        self.assertEqual(r["error"], "sin VRAM")

    def test_muestra_vacia_es_fallo(self):
        r = probar_modelo("palabra", {}, MotorFalso(salida=b""))
        self.assertFalse(r["exitoso"])
        self.assertEqual(r["error"], "Muestra vacía")

    def test_motor_http_sin_red(self):
        visto = {}

        class Resp:
            def __enter__(self): return self
            def __exit__(self, *a): return False
            def read(self): return b"PNG"

        def abrir(peticion, timeout):
            visto["url"], visto["cuerpo"] = peticion.full_url, peticion.data
            return Resp()

        motor = motor_imagen_http("http://127.0.0.1:7860/txt2img", abrir=abrir)
        self.assertTrue(probar_modelo("imagen", {}, motor)["exitoso"])
        self.assertEqual(visto["url"], "http://127.0.0.1:7860/txt2img")
        self.assertIn(b"512", visto["cuerpo"])


class TestDecidir(unittest.TestCase):
    def test_fallida_vuelve_atras(self):
        self.assertEqual(decidir({"exitoso": False}, None), "volver_atras")
        self.assertEqual(decidir({"exitoso": False, "capacidad_nueva": True}, None), "volver_atras")

    def test_sin_actual_se_queda(self):
        self.assertEqual(decidir({"exitoso": True, "tiempo_segundos": 1.0}, None), "quedarse")

    def test_actual_que_no_funciona_se_queda(self):
        self.assertEqual(decidir({"exitoso": True, "tiempo_segundos": 9.0},
                                 {"exitoso": False}), "quedarse")

    def test_mas_de_un_15_por_ciento_peor_vuelve_atras(self):
        act = {"exitoso": True, "tiempo_segundos": 1.0}
        self.assertEqual(decidir({"exitoso": True, "tiempo_segundos": 1.2}, act), "volver_atras")

    def test_justo_en_el_limite_o_mejor_se_queda(self):
        act = {"exitoso": True, "tiempo_segundos": 2.0}
        self.assertEqual(decidir({"exitoso": True, "tiempo_segundos": 2.3}, act), "quedarse")
        self.assertEqual(decidir({"exitoso": True, "tiempo_segundos": 1.0}, act), "quedarse")

    def test_capacidad_nueva_se_queda_aunque_sea_lenta(self):
        self.assertEqual(decidir({"exitoso": True, "tiempo_segundos": 50.0, "capacidad_nueva": True},
                                 {"exitoso": True, "tiempo_segundos": 1.0}), "quedarse")


if __name__ == "__main__":
    unittest.main()
