#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas de modelo_privado_a1 (MQB6): verificación de memoria y estado de compilación.

Valida que el modelo no se carga sin memoria ni mientras el nodo compila.
"""
import unittest
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from modelo_privado_a1 import leer_memoria, esta_compilando, puede_cargar


class TestModeloPrivadoA1(unittest.TestCase):
    """Modelo privado del A1: verificación de memoria e integración.

    Valida que el modelo no se carga sin memoria ni mientras el nodo compila.
    """

    def test_caso_medida(self):
        """Caso medido: memoria insuficiente, intercambio suficiente, compilando.

        Medido en el A1 el 16-11 (dirección): el modelo privado (Ollama, `huihui_ai/qwen3.5-abliterated:4b`,
        tope de 5200 MB) se cargó mientras el nodo compilando (`next build`, 4,0 GB),
        con 1024 MB de memoria disponible y 112 MB de intercambio libre.

        Resultado: memoria insuficiente, intercambio suficiente, pero está compilando.
        """
        mem_disponible = 1024
        intercambio_libre = 112
        compilando = True

        puede, motivo = puede_cargar(mem_disponible, intercambio_libre, compilando)

        self.assertFalse(puede)
        self.assertIn("el nodo está compilando", motivo)

    def test_suficiente_memoria_intercambio_no_compilando(self):
        """Suficiente memoria (8000 MB) y suficiente intercambio (1800 MB), sin compilar.
        """
        mem_disponible = 8000
        intercambio_libre = 1800
        compilando = False

        puede, motivo = puede_cargar(mem_disponible, intercambio_libre, compilando)

        self.assertTrue(puede)
        self.assertEqual(motivo, "ok")

    def test_memoria_justa_no_suficiente(self):
        """Justo 5200 MB, pero intercambio no suficiente (1023 MB).
        """
        mem_disponible = 5200
        intercambio_libre = 1023
        compilando = False

        puede, motivo = puede_cargar(mem_disponible, intercambio_libre, compilando)

        self.assertFalse(puede)
        self.assertIn("intercambio libre 1023 MB, hace falta 1024", motivo)

    def test_intercambio_justo_no_suficiente(self):
        """Suficiente memoria (5200 MB), pero intercambio justo 1023 MB.
        """
        mem_disponible = 5200
        intercambio_libre = 1023
        compilando = False

        puede, motivo = puede_cargar(mem_disponible, intercambio_libre, compilando)

        self.assertFalse(puede)
        self.assertIn("intercambio libre 1023 MB, hace falta 1024", motivo)

    def test_memoria_justa_suficiente(self):
        """Justo 5200 MB, intercambio suficiente 1024 MB.
        """
        mem_disponible = 5200
        intercambio_libre = 1024
        compilando = False

        puede, motivo = puede_cargar(mem_disponible, intercambio_libre, compilando)

        self.assertTrue(puede)
        self.assertEqual(motivo, "ok")

    def test_intercambio_justo_suficiente(self):
        """Suficiente memoria 5200 MB, intercambio justo 1024 MB.
        """
        mem_disponible = 5200
        intercambio_libre = 1024
        compilando = False

        puede, motivo = puede_cargar(mem_disponible, intercambio_libre, compilando)

        self.assertTrue(puede)
        self.assertEqual(motivo, "ok")

    def test_memoria_insuficiente_no_suficiente(self):
        """Insuficiente memoria (5199 MB), suficiente intercambio (2000 MB).
        """
        mem_disponible = 5199
        intercambio_libre = 2000
        compilando = False

        puede, motivo = puede_cargar(mem_disponible, intercambio_libre, compilando)

        self.assertFalse(puede)
        self.assertIn("memoria disponible 5199 MB, hacen falta 5200", motivo)

    def test_nada_compilando(self):
        """Cualquier dato en None indica que no se pudo leer -> False.
        """
        self.assertFalse(puede_cargar(None, 1024, False)[0])
        self.assertFalse(puede_cargar(5200, None, False)[0])
        self.assertFalse(puede_cargar(None, None, False)[0])
        self.assertFalse(puede_cargar(None, None, True)[0])

    def test_leer_memoria_con_texto_de_ejemplo(self):
        """Leer memoria desde un texto de /proc/meminfo de ejemplo.
        """
        texto_meminfo = """MemTotal:        16284156 kB
MemAvailable:    8589936 kB
SwapTotal:       2097152 kB
SwapFree:        1572864 kB
"""
        resultado = leer_memoria(texto_meminfo)

        self.assertIsNotNone(resultado)
        memoria_disponible, intercambio_libre = resultado
        self.assertEqual(memoria_disponible, 8388)  # 8589936 // 1024
        self.assertEqual(intercambio_libre, 1536)  # 1572864 // 1024

    def test_leer_memoria_con_texto_vacio(self):
        """Leer memoria desde un texto vacío.
        """
        texto_meminfo = ""
        resultado = leer_memoria(texto_meminfo)

        self.assertIsNone(resultado)

    def test_esta_compilando_con_next_build(self):
        """Identificar compilación por next build.
        """
        lineas = ["node /x/node_modules/.bin/next build", "comando regular"]
        self.assertTrue(esta_compilando(lineas))

    def test_esta_compilando_con_tsc(self):
        """Identificar compilación por tsc.
        """
        lineas = ["tsc --noEmit", "otro comando"]
        self.assertTrue(esta_compilando(lineas))

    def test_esta_compilando_con_vitest(self):
        """Identificar compilación por vitest.
        """
        lineas = ["npx vitest run", "node script.js"]
        self.assertTrue(esta_compilando(lineas))

    def test_esta_compilando_sin_comandos_de_compilacion(self):
        """No identificar compilación sin comandos de compilación.
        """
        lineas = ["node /x/node_modules/.bin/next dev", "python script.py"]
        self.assertFalse(esta_compilando(lineas))


if __name__ == "__main__":
    unittest.main()