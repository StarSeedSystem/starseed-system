#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas de salud_directores: firmas, tareas automáticas y resumen, sin red (SES1113E)."""
import json
import os
import sys
import tempfile
import unittest
from datetime import datetime
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import salud_directores as SD


def caida(token="sk-abcdefgh0123456789abcd"):
    return {"ok": False, "motivo": "auth caducada: Authentication expired (token %s)" % token}


def reparacion_ok(receta="receta2"):
    return {"ok": True, "motivo": "", "recetas": ["receta1", receta]}


def reparacion_mal():
    return {"ok": False, "motivo": "todas las recetas fallaron", "recetas": ["receta1", "receta2"]}


class SaludDirectoresTest(unittest.TestCase):
    def setUp(self):
        self.t = tempfile.TemporaryDirectory()
        self.raiz = Path(self.t.name)
        (self.raiz / "starseed_memory_root" / "olas").mkdir(parents=True)
        (self.raiz / "starseed_memory_root" / "salud").mkdir(parents=True)
        self.hora = datetime(2026, 11, 14, 12, 0, 0)

    def tearDown(self):
        self.t.cleanup()

    def _sd(self, minuto=0):
        return SD.SaludDirectores(
            raiz=self.raiz, ahora_fn=lambda: datetime(2026, 11, 14, 12, minuto, 0)
        )

    def _cola(self, fecha="2026-11-14"):
        return self.raiz / "starseed_memory_root" / "olas" / ("cola-auto-salud-%s.json" % fecha)

    def _tareas_cola(self):
        ruta = self._cola()
        if not ruta.exists():
            return []
        with open(ruta, encoding="utf-8") as f:
            d = json.load(f)
        return d.get("tareas") if isinstance(d, dict) else d

    def test_firma_estable_y_distinta_por_mensaje(self):
        a = SD.firma("auth caducada: Authentication expired")
        b = SD.firma("auth caducada: Authentication expired")
        c = SD.firma("timeout en auth refresh")
        self.assertEqual(a, b)
        self.assertNotEqual(a, c)
        self.assertEqual(len(a), 16)

    def test_firma_ignora_secretos_y_numeros(self):
        self.assertEqual(
            SD.firma("auth caducada: Authentication expired (token sk-abcdef0123456789)"),
            SD.firma("auth caducada: Authentication expired (token sk-ffffffffffffffffff)"))
        self.assertEqual(SD.firma("error en /Users/alex/x.py línea 42"),
                         SD.firma("error en /tmp/y.py línea 7"))

    def test_sesion_viva_no_abre_nada(self):
        r = self._sd().evaluar("notebooklm", {"ok": True, "motivo": ""})
        self.assertEqual(r["accion"], "viva")
        self.assertEqual(self._tareas_cola(), [])

    def test_una_caida_con_firma_conocida_no_abre_tarea(self):
        conocida = {SD.firma(caida()["motivo"])}
        sd = SD.SaludDirectores(raiz=self.raiz,
                                ahora_fn=lambda: self.hora, firmas_conocidas=conocida)
        r = sd.evaluar("notebooklm", caida(), reparacion_mal())
        self.assertEqual(r["accion"], "espera")
        self.assertEqual(r["fallos_seguidos"], 1)
        self.assertEqual(self._tareas_cola(), [])

    def test_dos_caidas_con_firma_conocida_abren_tarea(self):
        conocida = {SD.firma(caida()["motivo"])}
        sd = SD.SaludDirectores(raiz=self.raiz,
                                ahora_fn=lambda: self.hora, firmas_conocidas=conocida)
        self.assertEqual(sd.evaluar("notebooklm", caida(), reparacion_mal())["accion"], "espera")
        r = sd.evaluar("notebooklm", caida(), reparacion_mal())
        self.assertEqual(r["accion"], "tarea_abierta")
        self.assertEqual(r["causa"], "dos-seguidas")
        tareas = self._tareas_cola()
        self.assertEqual(len(tareas), 1)
        t = tareas[0]
        self.assertEqual(t["id"], r["id"])
        self.assertEqual(t["archivos"], ["scripts/puente/sanador_sesiones.py",
                                         "scripts/puente/test_sanador_sesiones.py"])
        self.assertEqual(t["depende"], [])
        self.assertIn("notebooklm", t["titulo"])

    def test_segunda_caida_misma_firma_no_duplica_tarea(self):
        sd = self._sd()
        sd.evaluar("notebooklm", caida(), reparacion_mal())
        r = sd.evaluar("notebooklm", caida(), reparacion_mal())
        self.assertEqual(r["accion"], "ya_abierta")
        self.assertEqual(len(self._tareas_cola()), 1)

    def test_firma_nueva_abre_tarea_a_la_primera(self):
        r = self._sd().evaluar("notebooklm", caida(), reparacion_mal())
        self.assertEqual(r["accion"], "tarea_abierta")
        self.assertEqual(r["causa"], "firma-nueva")
        # Segunda firma distinta también abre a la primera.
        otra = {"ok": False, "motivo": "timeout en auth refresh"}
        r2 = self._sd().evaluar("higgsfield", otra, reparacion_mal())
        self.assertEqual(r2["accion"], "tarea_abierta")
        self.assertEqual(len(self._tareas_cola()), 2)

    def test_misma_firma_sesiones_distintas_no_duplica_tarea(self):
        self._sd().evaluar("notebooklm", caida(), reparacion_mal())
        r = self._sd().evaluar("google-oauth-alex", caida(), reparacion_mal())
        self.assertEqual(r["accion"], "ya_abierta")
        self.assertEqual(len(self._tareas_cola()), 1)

    def test_tarea_con_registros_recortados_y_sin_secretos(self):
        registros = [
            "receta1 ok=False motivo=auth caducada: token sk-abcdefgh0123456789abcd duracion=1.2s",
            "x" * 500,
        ]
        r = self._sd().evaluar("notebooklm", caida(), reparacion_mal(), registros=registros)
        t = self._tareas_cola()[0]
        self.assertNotIn("sk-abcdefgh0123456789", t["prompt"])
        self.assertIn("[REDACTADO]", t["prompt"])
        self.assertLess(len(t["prompt"]), 2400)
        self.assertIn("test_sanador_sesiones", t["prompt"])
        self.assertEqual(t["id"], r["id"])
        self.assertNotIn("Claude", t["prompt"] + t["titulo"])

    def test_reparacion_ok_tras_caidas_resetea_y_guarda_servicio(self):
        sd = self._sd()
        sd.evaluar("notebooklm", caida(), reparacion_mal())
        r = sd.evaluar("notebooklm", caida(), reparacion_ok())
        self.assertEqual(r["accion"], "viva")
        e = sd.estado()["sesiones"]["notebooklm"]
        self.assertEqual(e["fallos_seguidos"], 0)
        self.assertEqual(e["receta_efectiva"], "receta2")
        self.assertEqual(e["tiempo_sin_servicio_s"], 0)

    def test_vuelta_tras_caida_cuenta_tiempo_sin_servicio(self):
        sd = self._sd()
        sd.evaluar("notebooklm", caida(), reparacion_mal())  # 12:00
        sd2 = SD.SaludDirectores(raiz=self.raiz,
                                 ahora_fn=lambda: datetime(2026, 11, 14, 12, 15, 0))
        r = sd2.evaluar("notebooklm", {"ok": True, "motivo": ""})
        self.assertEqual(r["accion"], "viva")
        e = sd2.estado()["sesiones"]["notebooklm"]
        self.assertEqual(e["tiempo_sin_servicio_s"], 900)
        self.assertIsNone(e["caida_desde"])

    def test_linea_sintesis_menciona_caida_receta_y_tiempo(self):
        sd = self._sd()
        sd.evaluar("notebooklm", caida(), reparacion_mal())
        sd.evaluar("notebooklm", caida(), reparacion_ok())
        linea = sd.linea_sintesis()
        self.assertIn("notebooklm", linea)
        self.assertIn("receta2", linea)
        self.assertIn("0 s", linea)

    def test_dedup_cruza_instancias_via_estado(self):
        self._sd().evaluar("notebooklm", caida(), reparacion_mal())
        self._sd().evaluar("notebooklm", caida(), reparacion_mal())
        r = self._sd().evaluar("notebooklm", caida(), reparacion_mal())
        self.assertEqual(r["accion"], "ya_abierta")
        self.assertEqual(len(self._tareas_cola()), 1)


if __name__ == "__main__":
    unittest.main()
