import unittest
from unittest.mock import patch
import time
from curacion_logica import colgados_a_matar, clasificar_arbol_sucio, debe_reintentar_ya


class TestCuracionLogica(unittest.TestCase):
    def test_colgados_a_matar(self):
        ahora = time.time()
        procesos = [
            {
                # Justo en el borde: 1800 s no SUPERA el tope, no se mata
                "pid": 5,
                "tarea": "tarea_borde",
                "inicio": ahora - 3600,
                "ultimo_byte": ahora - 1800,
            },
            {
                # Propio: nunca se mata aunque esté colgado
                "pid": 2,
                "tarea": "tarea2",
                "inicio": ahora - 3600,
                "ultimo_byte": ahora - 1801,
                "propio": True,
            },
            # ultimo_byte a 0: se cae a inicio (3600 s > 1800 s)
            {"pid": 3, "tarea": "tarea3", "inicio": ahora - 3600, "ultimo_byte": 0},
            # Claramente colgado: 1801 s superan el tope
            {
                "pid": 4,
                "tarea": "tarea4",
                "inicio": ahora - 3600,
                "ultimo_byte": ahora - 1801,
            },
            # Sin la clave ultimo_byte: también se cae a inicio
            {"pid": 6, "tarea": "tarea6", "inicio": ahora - 3600},
        ]
        self.assertEqual(colgados_a_matar(procesos, ahora, 1800), [3, 4, 6])

    def test_colgados_a_matar_nunca_pid_sistema(self):
        # Los pids 0 y 1 pertenecen al sistema: jamás se devuelven aunque
        # parezcan colgados, porque matarlos tumbaría la máquina
        ahora = time.time()
        procesos = [
            {"pid": 0, "tarea": "kernel", "inicio": ahora - 7200, "ultimo_byte": 0},
            {"pid": 1, "tarea": "init", "inicio": ahora - 7200, "ultimo_byte": 0},
            {"pid": 7, "tarea": "trabajador", "inicio": ahora - 7200, "ultimo_byte": 0},
        ]
        self.assertEqual(colgados_a_matar(procesos, ahora, 1800), [7])

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
