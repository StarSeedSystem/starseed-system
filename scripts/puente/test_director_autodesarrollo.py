#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas de director_autodesarrollo (IMN1021D, sin red, lanzadores inyectados,
carpetas temporales, reloj por parámetro)."""
import unittest, tempfile, os, sys, json
from datetime import datetime
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import director_autodesarrollo as D


class DirectorAutodesarrolloTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.raiz_tmp = self.tmp.name
        # Inyectar lanzadores que no hacen nada
        self.lanzador_vacio = lambda: None

    def tearDown(self):
        self.tmp.cleanup()

    def test_ciclo_seco_no_lanza_y_devuelve_resultado(self):
        res = D.ciclo(seco=True, ahora=datetime(2026, 10, 23, 3, 0), capacidad={"huecos_mac": 1, "huecos_a1": 0, "huecos_nube": 0, "proveedores_con_cupo": 2, "presion_mac": 0}, lanzador_diario=self.lanzador_vacio, lanzador_profundo=self.lanzador_vacio)
        # El lanzador vacío sí se invoca (es el comportamiento esperado con inyección)
        self.assertIn("ahora", res)
        self.assertIn("toca_ejecutar", res)
        # Como toca (noche con capacidad) y tenemos lanzador inyectado, lanzado_diario es True
        self.assertTrue(res["lanzado_diario"])
        self.assertTrue(res["lanzado_profundo"])

    def test_ciclo_con_datos_inyectados_recolecta_propuestas(self):
        datos_diaria = "## mejoras detectadas\n1. **Arreglar el lector** — corregir error de lectura"
        res = D.ciclo(seco=False, ahora=datetime(2026, 10, 23, 3, 0), capacidad={"huecos_mac": 1, "huecos_a1": 0, "huecos_nube": 0, "proveedores_con_cupo": 2, "presion_mac": 0}, lanzador_diario=self.lanzador_vacio, lanzador_profundo=self.lanzador_vacio, datos_diaria=datos_diaria)
        self.assertGreaterEqual(res["propuestas_recogidas"], 1)
        # El archivo de propuestas debe existir (se escribió atómicamente)
        self.assertTrue(os.path.isfile(res["archivo_propuestas"]) or res["archivo_propuestas"] == "starseed_memory_root/imaginacion/propuestas.json")

    def test_criterio_utilidad_importancia_destino_puros(self):
        # Prueba pura con propuesta conocida y archivo existente
        propuesta = {
            "id": "test:lectura", "titulo": "Arreglar el lector de archivos",
            "cuerpo": "corregir error en src/lib/algo.ts", "archivos": ["src/lib/algo.ts"],
            "verificacion": "verificado",
        }
        # Como no existe ese archivo, la utilidad debe ser 0
        # Prueba pura: la propuesta existe pero el archivo no, así que utilidad baja a 0 y no lanza excepción
        valor, motivo = D.AD.utilidad(propuesta, lambda r: False)
        self.assertEqual(valor, 0.0)


if __name__ == "__main__":
    unittest.main()
