"""Pruebas de modelo_privado_a1.py: puede_cargar, leer_memoria, esta_compilando."""

import unittest

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import modelo_privado_a1 as M


class TestPuedeCargar(unittest.TestCase):
    def test_caso_medido_falla(self):
        r = M.puede_cargar(1024, 112, True)
        self.assertFalse(r[0])
        self.assertIn("memoria disponible", r[1])
        self.assertIn("intercambio libre", r[1])
        self.assertIn("el nodo está compilando", r[1])

    def test_suficiente_memoria_y_intercambio_sin_compilar(self):
        r = M.puede_cargar(8000, 1800, False)
        self.assertTrue(r[0])
        self.assertEqual(r[1], "ok")

    def test_memoria_exacta_limite(self):
        r = M.puede_cargar(5200, 1024, False)
        self.assertTrue(r[0])
        self.assertEqual(r[1], "ok")

    def test_memoria_limite_falla(self):
        r = M.puede_cargar(5199, 1024, False)
        self.assertFalse(r[0])
        self.assertIn("memoria disponible", r[1])

    def test_intercambio_limite_falla(self):
        r = M.puede_cargar(5200, 1023, False)
        self.assertFalse(r[0])
        self.assertIn("intercambio libre", r[1])

    def test_solo_compilando_falla(self):
        r = M.puede_cargar(8000, 1800, True)
        self.assertFalse(r[0])
        self.assertIn("el nodo está compilando", r[1])

    def test_datos_none_memoria(self):
        r = M.puede_cargar(None, 1024, False)
        self.assertFalse(r[0])
        self.assertIn("no se pudo leer la memoria", r[1])

    def test_datos_none_intercambio(self):
        r = M.puede_cargar(8000, None, False)
        self.assertFalse(r[0])
        self.assertIn("no se pudo leer el intercambio libre", r[1])


class TestLeerMemoria(unittest.TestCase):
    def test_leer_meminfo_ejemplo(self):
        texto = """MemTotal:       16284284 kB
MemFree:         1234567 kB
MemAvailable:    10000000 kB
SwapTotal:       4096000 kB
SwapFree:        2000000 kB
"""
        mem_avail, swap_free = M.leer_memoria(texto)
        self.assertEqual(mem_avail, 9765)  # 10000000 // 1024
        self.assertEqual(swap_free, 1953)  # 2000000 // 1024

    def test_leer_meminfo_vacio(self):
        mem_avail, swap_free = M.leer_memoria("")
        self.assertIsNone(mem_avail)
        self.assertIsNone(swap_free)

    def test_leer_meminfo_sin_campos(self):
        texto = "Linea sin MemAvailable o SwapFree"
        mem_avail, swap_free = M.leer_memoria(texto)
        self.assertIsNone(mem_avail)
        self.assertIsNone(swap_free)


class TestEstaCompilando(unittest.TestCase):
    def test_lineas_de_procesos_next_build(self):
        lineas = ["node", "atscript.py", "next", "build"]
        self.assertTrue(M.esta_compilando(lineas))

    def test_lineas_de_procesos_tsc(self):
        lineas = ["tsc", "--noEmit"]
        self.assertTrue(M.esta_compilando(lineas))

    def test_lineas_de_procesos_vitest(self):
        lineas = ["npx", "vitest", "run"]
        self.assertTrue(M.esta_compilando(lineas))

    def test_lineas_de_procesos_python_script(self):
        lineas = ["python3", "ascript.py"]
        self.assertFalse(M.esta_compilando(lineas))

    def test_lineas_de_procesos_vacio(self):
        self.assertFalse(M.esta_compilando([]))

    def test_lineas_de_procesos_contenido_no_compilacion(self):
        lineas = ["node", "server.js"]
        self.assertFalse(M.esta_compilando(lineas))


if __name__ == "__main__":
    unittest.main()