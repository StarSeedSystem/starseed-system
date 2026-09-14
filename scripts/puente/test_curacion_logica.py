import unittest
from unittest.mock import patch
import time
from curacion_logica import colgados_a_matar, clasificar_arbol_sucio, debe_reintentar_ya


class TestCuracionLogica(unittest.TestCase):
    def test_colgados_a_matar(self):
        ahora = time.time()
        procesos = [
            {
                "pid": 1,
                "tarea": "tarea1",
                "inicio": ahora - 3600,
                "ultimo_byte": ahora - 1800,
            },
            {
                "pid": 2,
                "tarea": "tarea2",
                "inicio": ahora - 3600,
                "ultimo_byte": ahora - 1800,
                "propio": True,
            },
            {"pid": 3, "tarea": "tarea3", "inicio": ahora - 3600, "ultimo_byte": 0},
            {
                "pid": 4,
                "tarea": "tarea4",
                "inicio": ahora - 3600,
                "ultimo_byte": ahora - 1800,
            },
        ]
        self.assertEqual(colgados_a_matar(procesos, ahora, 1800), [3, 4])

    def test_clasificar_arbol_sucio(self):
        lineas_porcelain = [
            "?? scripts/puente/test_x.py.new",
            "?? src/lib/nuevo.ts",
            " M src/lib/algo.ts",
            "UU x",
            "?? .DS_Store",
        ]
        resultado = clasificar_arbol_sucio(lineas_porcelain)
        self.assertEqual(
            resultado["estorbo"], ["scripts/puente/test_x.py.new", ".DS_Store"]
        )
        self.assertEqual(
            resultado["trabajo"], ["src/lib/nuevo.ts", "src/lib/algo.ts", "x"]
        )

    def test_debe_reintentar_ya(self):
        self.assertTrue(debe_reintentar_ya("", True, 0))
        self.assertTrue(debe_reintentar_ya("fallo", False, 0))
        self.assertFalse(debe_reintentar_ya("fallo", True, 30))
        self.assertTrue(debe_reintentar_ya("fallo", True, 700))


if __name__ == "__main__":
    unittest.main()
