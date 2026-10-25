#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas de autodesarrollo_entregables (Ola 1025S · IMG1025A): puras, sin red; disco solo en tmp."""
import json
import os
import sys
import tempfile
import unittest
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import autodesarrollo_entregables as E
import autodesarrollo_fuentes as AF

AHORA = datetime(2026, 10, 25, 3, 0)
ISO = AHORA.isoformat()


def prop(**cambios):
    p = {"id": "agentes:a--guía de tono", "fuente": "agentes", "tipo": "contenido", "titulo": "Guía de tono",
         "cuerpo": "## Qué\nUna guía de tono.", "referencias": [{"titulo": "W3C", "url": "https://www.w3.org/WAI/"}],
         "estado": "aprobada", "version": 1}
    p.update(cambios)
    return p


def encargada(**cambios):
    p = prop(**cambios)
    return E.marcar_encargada(p, E.tarea(p, AHORA), "cola-suenos-entregables-2026-10-25.json", ISO)


class Tarea(unittest.TestCase):
    def test_analisis_libre_con_su_salida_en_la_carpeta_de_los_agentes(self):
        t = E.tarea(prop(), AHORA)
        self.assertEqual((t["tipo"], t["modo"], t["area"], t["agente"]), ("analisis", "libre", "imaginacion", "entregables"))
        self.assertRegex(t["salida"], r"^starseed_memory_root/imaginacion/agentes/entregable-agentes-a-guia-de-tono-[0-9a-f]{6}-v1\.json$")
        self.assertRegex(t["id"], r"^ENT-agentes-a-guia-de-tono-[0-9a-f]{6}-v1$")
        self.assertEqual((t["rol"], t["capacidad"]), ("diseno", "alta"))  # contenido: el mejor modelo de diseño
        self.assertIn("ENTREGABLE terminado", t["prompt"]); self.assertIn("NO escritura", t["prompt"])
        self.assertIn("No inventes datos", t["prompt"]); self.assertIn("https://www.w3.org/WAI/", t["prompt"])
        self.assertIn(t["salida"], t["prompt"]); self.assertEqual(t["archivos"], [])
        self.assertNotIn("rehacer", t)
        self.assertNotIn("rol", E.tarea(prop(tipo="otro"), AHORA))

    def test_la_salida_la_acepta_el_analista_y_la_fuente_no_la_recoge(self):
        sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "enjambre"))
        import analista as A
        with tempfile.TemporaryDirectory() as raiz:
            os.makedirs(os.path.join(raiz, "starseed_memory_root", "imaginacion", "agentes"))
            self.assertIsNotNone(A.ruta_salida_segura(raiz, E.tarea(prop(), AHORA)["salida"]))
        self.assertEqual(AF.de_agentes({E.nombre_salida(prop()): {"propuestas": [{"titulo": "x", "cuerpo": "y"}]}}), [])

    def test_un_reencargo_es_otra_tarea_y_otra_salida(self):
        p = prop(entregable={"intentos": 1})
        t, t0 = E.tarea(p, AHORA), E.tarea(prop(), AHORA)
        self.assertNotEqual((t["id"], t["salida"]), (t0["id"], t0["salida"]))
        self.assertTrue(t["id"].endswith("-v1-r1") and t["salida"].endswith("-v1-r1.json") and t["rehacer"])


class Revisar(unittest.TestCase):
    def test_marcar_y_contar_en_vuelo(self):
        p = encargada()
        self.assertEqual((p["estado"], p["tarea"], p["entregable"]["cola"]), ("encargada", E.id_tarea(prop()), "cola-suenos-entregables-2026-10-25.json"))
        self.assertEqual(E.en_vuelo([p, prop()]), 1)

    def test_recibido_es_hecha(self):
        p = encargada()
        doc = {"formato": "starseed-imaginacion-entregable", "propuestas": [{"titulo": "Guía de tono terminada", "cuerpo": "## Tono\n…"}]}
        self.assertEqual(E.revisar(p, doc, AHORA, ISO), "recibido")
        self.assertEqual((p["estado"], p["entregable"]["titulo"], p["entregable"]["recibido"]), ("hecha", "Guía de tono terminada", ISO))
        self.assertIn("entregable listo", p["motivo_destino"])
        self.assertEqual(E.en_vuelo([p]), 0)

    def test_espera_reencarga_y_a_la_segunda_vuelve_a_tu_lista(self):
        p = encargada()
        self.assertEqual(E.revisar(p, None, AHORA + timedelta(hours=71), ISO), "esperando")
        self.assertEqual(E.revisar(p, None, AHORA + timedelta(hours=72), ISO), "reencargar")
        self.assertEqual((p["estado"], p["entregable"]["intentos"]), ("aprobada", 1))
        self.assertNotIn("tarea", p)
        E.marcar_encargada(p, E.tarea(p, AHORA), "c.json", ISO)
        self.assertEqual(E.revisar(p, {"propuestas": []}, AHORA, ISO), "a-tu-lista")  # llegó vacío: falla ya
        self.assertEqual(p["estado"], "pregunta"); self.assertIn("2 intento(s)", p["motivo_destino"])

    def test_lo_que_no_es_un_entregable_encargado_no_se_toca(self):
        for p in (prop(), prop(estado="encargada"), dict(encargada(), estado="hecha")):
            antes = json.dumps(p, sort_keys=True)
            self.assertEqual(E.revisar(p, None, AHORA + timedelta(days=9), ISO), "esperando")
            self.assertEqual(json.dumps(p, sort_keys=True), antes)
        self.assertEqual(E.leer_resultado([{"titulo": "x", "cuerpo": "  "}]), (False, ""))


class Encolar(unittest.TestCase):
    def test_su_propia_cola_de_suenos(self):
        with tempfile.TemporaryDirectory() as mem:
            nombre = E.encolar(mem, [E.tarea(prop(), AHORA)], AHORA)
            self.assertEqual(nombre, "cola-suenos-entregables-2026-10-25.json")  # los orquestadores de código no la toman
            with open(os.path.join(mem, "olas", nombre), encoding="utf-8") as f:
                self.assertEqual(json.load(f)[0]["modo"], "libre")


if __name__ == "__main__":
    unittest.main()
