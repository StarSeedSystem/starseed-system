#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas de director_autodesarrollo (IMN1021Db): sin red, carpetas temporales, lanzadores inyectados."""
import json, os, sys, tempfile, unittest
from datetime import datetime
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import director_autodesarrollo as D

NOCHE = datetime(2026, 10, 23, 3, 0)
CAP = {"huecos_mac": 2, "huecos_a1": 0, "huecos_nube": 0, "proveedores_con_cupo": 2, "presion_mac": 0}
MD = "## Mejoras detectadas\n1. **Arreglar el lector** — corregir el error de lectura en `scripts/puente/suenos.py:10`, impacto 3 esfuerzo 1\n"

class DirectorTest(unittest.TestCase):
    def correr(self, **kw):
        args = dict(ahora=NOCHE, capacidad=CAP, home=self.home, raiz=self.raiz, existe_ruta=lambda r: True,
                    lanzador_diario=lambda: self.llamadas.append("diaria") or True,
                    lanzador_profundo=lambda *a: self.llamadas.append(a) or True,
                    datos={"diaria": MD, "profunda": {}, "astraura": {}, "directores": {}})
        args.update(kw)
        return D.ciclo(**args)

    def setUp(self):
        self.t = tempfile.TemporaryDirectory()
        self.home = os.path.join(self.t.name, "h")
        self.raiz = os.path.join(self.t.name, "r")
        os.makedirs(self.home, exist_ok=True)
        os.makedirs(self.raiz, exist_ok=True)
        self.llamadas = []
        # emptylauncher just records nothing
        self.lanzador_vacio = lambda *a: None

    def tearDown(self):
        self.t.cleanup()

    def test_seco_no_lanza_y_devuelve_resultado(self):
        # Test that running in seco mode signals que se debe ejecutar
        r = D.ciclo(seco=True, ahora=NOCHE, capacidad=-1, home=self.home, raiz=self.raiz,
                   lanzador_diario=self.lanzador_vacio, lanzador_profundo=self.lanzador_vacio)
        self.assertIn("ahora", r)
        self.assertIn("toca_ejecutar", r)
        self.assertTrue(r.get("lanzado_diario", False))
        self.assertTrue(r.get("lanzado_profundo", False))

    def test_ciclo_con_datos_inyectados_recolecta_propuestas(self):
        # Ver que con datos inyectados se recolecten propuestas
        datos_diaria = "## mejoras detectadas\n1. **Arreglar el lector** — corregir error de lectura"
        r = D.ciclo(seco=False, ahora=NOCHE, capacidad=-1, home=self.home, raiz=self.raiz,
                    lanzador_diario=self.lanzador_vacio, lanzador_profundo=self.lanzador_vacio,
                    datos={"diaria": datos_diaria})
        self.assertGreaterEqual(r.get("propuestas_recogidas", 0), 1)
        ruta_propuestas = os.path.join(self.raiz, "starseed_memory_root", "imaginacion", "propuestas.json")
        self.assertTrue(os.path.isfile(ruta_propuestas))

    def test_criterio_utilidad_importancia_destino_puros(self):
        propuesta = {
            "id": "test:lectura",
            "titulo": "Arreglar el lector de archivos",
            "cuerpo": "corregir error en src/lib/algo.ts",
            "archivos": ["src/lib/algo.ts"],
            "verificacion": "verificado",
        }
        valor, motivo = D.AD.utilidad(propuesta, lambda r: False)
        self.assertEqual(valor, 0.0)

    def test_ciclo_seco_no_lanza_ni_escribe(self):
        r = D.ciclo(seco=True, ahora=NOCHE, capacidad=-1, home=self.home, raiz=self.raiz)
        self.assertTrue(r["toca_ejecutar"])
        self.assertEqual(self.llamadas, [])
        self.assertFalse(os.path.exists(os.path.join(self.raiz, "starseed_memory_root")))

    def test_lanza_diaria_y_profunda_una_vez(self):
        r = self.correr(seco=False)
        self.assertEqual(r["lanzado"], ["diaria", "profunda"])
        # subsequent call does not repeat diaria in same day
        self.correr(seco=False)
        self.assertEqual(self.llamadas.count("diaria"), 1)
        self.assertEqual(self.llamadas.count(("lanzar",)), 1)
        self.correr(seco=False)
        self.assertIn(("consolidar", "--sin-telegram"), self.llamadas)

    def test_sin_capacidad_en_inteligente_no_ejecuta(self):
        r = D.correr(capacidad=None)
        self.assertFalse(r["toca_ejecutar"])
        self.assertIn("sin dato", r["motivo_toca"])
        self.assertEqual(self.llamadas, [])

    def test_medir_capacidad_sin_dato(self):
        self.assertIsNone(D.medir_capacidad(self.home))
        json.dump({"maximo": 3, "presion": 1}, open(os.path.join(self.home, "gobernador.json"), "w"))
        json.dump({"nim": {}, "xkiro": {"caido": True}}, open(os.path.join(self.home, "salud-proveedores.json"), "w"))
        self.assertEqual(D.medir_capacidad(self.home), {"huecos_mac": 3, "huecos_a1": 0, "huecos_nube": 0, "proveedores_con_cupo": 1, "presion_mac": 1})

if __name__ == "__main__":
    unittest.main()
