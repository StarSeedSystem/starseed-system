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
    def setUp(self):
        self.t = tempfile.TemporaryDirectory(); self.home = os.path.join(self.t.name, "h"); self.raiz = os.path.join(self.t.name, "r")
        os.makedirs(self.home); os.makedirs(self.raiz)
        self.llamadas = []

    def tearDown(self):
        self.t.cleanup()

    def correr(self, **kw):
        args = dict(ahora=NOCHE, capacidad=CAP, home=self.home, raiz=self.raiz, existe_ruta=lambda r: True,
                    lanzador_diario=lambda: self.llamadas.append("diaria") or True,
                    lanzador_profundo=lambda *a: self.llamadas.append(a) or True,
                    datos={"diaria": MD, "profunda": {}, "astraura": {}, "directores": {}})
        args.update(kw); return D.ciclo(**args)

    def leer(self, *ruta):
        return json.load(open(os.path.join(*ruta), encoding="utf-8"))

    def test_seco_no_lanza_ni_escribe(self):
        r = self.correr(seco=True)
        self.assertTrue(r["toca_ejecutar"]); self.assertEqual(self.llamadas, [])
        self.assertFalse(os.path.exists(os.path.join(self.raiz, "starseed_memory_root")))

    def test_lanza_diaria_y_profunda_una_vez(self):
        r = self.correr(); self.assertEqual(r["lanzado"], ["diaria", "profunda"])
        self.correr(); self.assertEqual(self.llamadas.count("diaria"), 1)  # no repite el mismo día
        self.assertEqual(self.llamadas.count(("lanzar",)), 1)
        self.correr(); self.assertIn(("consolidar", "--sin-telegram"), self.llamadas)

    def test_sin_capacidad_en_inteligente_no_ejecuta(self):
        r = self.correr(capacidad=None); self.assertFalse(r["toca_ejecutar"]); self.assertIn("sin dato", r["motivo_toca"])
        self.assertEqual(self.llamadas, [])

    def test_escribe_cola_y_propuestas_y_no_repite(self):
        r = self.correr(); self.assertEqual(r["autodesarrolladas"], 1)
        cola = self.leer(self.raiz, "starseed_memory_root", "olas", r["cola"])
        self.assertTrue(cola[0]["prompt"].startswith("Comprueba si sigue haciendo falta; si ya está hecho, responde NO APLICA"))
        self.assertLessEqual(len(cola[0]["archivos"]), 3)
        props = self.leer(self.raiz, "starseed_memory_root", "imaginacion", "propuestas.json")["propuestas"]
        self.assertEqual(props[0]["estado"], "encargada")
        self.assertTrue(os.path.isfile(os.path.join(self.home, "dream-encargado.json")))
        self.assertEqual(self.correr(ahora=datetime(2026, 10, 23, 3, 15))["autodesarrolladas"], 0)

    def test_conserva_estado_de_alex_y_encarga_lo_aprobado(self):
        self.correr(capacidad=None)  # registra la propuesta sin encargarla
        ruta = os.path.join(self.raiz, "starseed_memory_root", "imaginacion", "propuestas.json")
        d = self.leer(ruta); d["propuestas"][0]["estado"] = "aprobada"; d["propuestas"][0]["aprobacion_diff"] = True
        json.dump(d, open(ruta, "w", encoding="utf-8"))
        r = self.correr(); cola = self.leer(self.raiz, "starseed_memory_root", "olas", r["cola"])
        self.assertTrue(cola[0]["aprobacion"])

    def test_automatico_apagado_todo_espera_y_avisa(self):
        json.dump({"automatico": False}, open(os.path.join(self.home, "autodesarrollo.json"), "w"))
        avisos = []; r = self.correr(avisar=lambda t, tg: avisos.append((t, tg)))
        self.assertEqual(r["autodesarrolladas"], 0); self.assertEqual(r["esperando_aprobacion"], 1)
        self.assertTrue(avisos[0][1])

    def test_cerrojo_ocupado(self):
        with D.cerrojo(os.path.join(self.home, "cerrojos", "autodesarrollo.lock")) as uno:
            self.assertTrue(uno); r = self.correr()
        self.assertEqual(r["motivo_toca"], "otro ciclo en marcha")

    def test_medir_capacidad_sin_dato(self):
        self.assertIsNone(D.medir_capacidad(self.home))
        json.dump({"maximo": 3, "presion": 1}, open(os.path.join(self.home, "gobernador.json"), "w"))
        json.dump({"nim": {}, "xkiro": {"caido": True}}, open(os.path.join(self.home, "salud-proveedores.json"), "w"))
        self.assertEqual(D.medir_capacidad(self.home), {"huecos_mac": 3, "huecos_a1": 0, "huecos_nube": 0, "proveedores_con_cupo": 1, "presion_mac": 1})


if __name__ == "__main__":
    unittest.main()
