# -*- coding: utf-8 -*-
"""Pruebas sin red del registro de límites del plan de Claude."""
import json
import os
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import limites_claude as L


class LimitesClaude(unittest.TestCase):
    def setUp(self):
        self.temporal = tempfile.TemporaryDirectory()
        self.archivo_anterior = L.ARCHIVO
        L.ARCHIVO = os.path.join(self.temporal.name, "limites.json")
        self.ahora = datetime(2026, 10, 4, 18, tzinfo=timezone.utc)

    def tearDown(self):
        L.ARCHIVO = self.archivo_anterior
        self.temporal.cleanup()

    def lectura(self, pct=10, minutos=-10, reinicio_horas=4):
        reinicio = (self.ahora + timedelta(hours=reinicio_horas)).isoformat()
        return {
            "t": (self.ahora + timedelta(minutes=minutos)).isoformat(),
            "sesion_pct": pct,
            "sesion_reinicio": reinicio,
            "semana_pct": pct,
            "semana_reinicio": (self.ahora + timedelta(days=3)).isoformat(),
            "modelo_nombre": None,
            "modelo_pct": None,
            "modelo_reinicio": None,
            "fuente": "prueba",
        }

    def test_coste_y_cambio_de_ventana(self):
        lecturas = []
        for pct in (10, 14, 20):
            lecturas.append(self.lectura(pct))
        otra = self.lectura(40)
        otra["sesion_reinicio"] = (self.ahora + timedelta(hours=9)).isoformat()
        lecturas.append(otra)
        self.assertEqual(L.coste_por_revision(lecturas, "sesion"), 5)

    def test_disparos_periodicos(self):
        lista = [{"nombre": "revisión", "proxima": (self.ahora + timedelta(minutes=30)).isoformat(),
                  "cada_min": 60}]
        self.assertEqual(L.disparos_antes(lista, self.ahora, self.ahora + timedelta(minutes=150)), 3)

    def test_reinicio_pasado(self):
        resultado = L.estado({"lecturas": [self.lectura(72, reinicio_horas=-1)]}, self.ahora)
        self.assertEqual(resultado["sesion"]["pct"], 0)
        self.assertEqual(resultado["sesion"]["queda"], 100)
        self.assertTrue(resultado["sesion"]["reiniciada"])

    def test_proyeccion_tono_y_recomendacion(self):
        lecturas = []
        for sesion, semana in ((75, 82), (80, 83), (85, 84)):
            lectura = self.lectura(sesion)
            lectura["semana_pct"] = semana
            lecturas.append(lectura)
        lista = [{"nombre": str(i), "proxima": (self.ahora + timedelta(minutes=30 + i)).isoformat(),
                  "cada_min": None} for i in range(4)]
        resultado = L.estado({"lecturas": lecturas, "programadas": {"lista": lista}}, self.ahora)
        self.assertEqual(resultado["sesion"]["proyeccion"], 105)
        self.assertEqual(resultado["sesion"]["tono"], "peligro")
        self.assertEqual(resultado["recomendacion"],
                         "Espacia las revisiones: caben 1 hasta el reinicio de sesión")
        aviso = L.estado({"lecturas": lecturas, "programadas": {"lista": lista[:1]}}, self.ahora)
        self.assertEqual(aviso["sesion"]["tono"], "aviso")

    def test_desactualizada_y_porcentaje_invalido(self):
        vieja = self.lectura(20, minutos=-121)
        resultado = L.estado({"lecturas": [vieja]}, self.ahora)
        self.assertTrue(resultado["desactualizada"])
        self.assertEqual(resultado["sesion"]["tono"], "aviso")
        for valor in (-1, 101):
            with self.assertRaises(ValueError):
                L.anadir_lectura({}, self.lectura(valor))

    def test_cli_declara_programadas_y_recorta(self):
        reinicio = (self.ahora + timedelta(hours=5)).isoformat()
        self.assertEqual(L.main(["declarar", "--sesion", "12", "--sesion-reinicio", reinicio,
                                 "--semana", "23", "--semana-reinicio", reinicio]), 0)
        self.assertEqual(L.leer()["lecturas"][0]["sesion_pct"], 12)
        lista = [{"nombre": "salud", "proxima": reinicio, "cada_min": 60}]
        self.assertEqual(L.main(["programadas", "--json", json.dumps(lista)]), 0)
        self.assertEqual(L.leer()["programadas"]["lista"], lista)
        datos = {}
        for indice in range(205):
            lectura = self.lectura(indice % 100)
            lectura["t"] = (self.ahora + timedelta(seconds=indice)).isoformat()
            datos = L.anadir_lectura(datos, lectura)
        self.assertEqual(len(datos["lecturas"]), 200)


if __name__ == "__main__":
    unittest.main()
