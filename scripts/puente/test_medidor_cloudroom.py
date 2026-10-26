#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas de interpretación Cloudroom: JSON simulado y ninguna llamada externa."""
from __future__ import annotations

import os
import sys
import unittest
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import medidor_cloudroom as M  # noqa: E402

AHORA = datetime(2026, 10, 24, tzinfo=timezone.utc)


class PruebasInterpretar(unittest.TestCase):
    def test_cupo_publicado_y_hilos_nube_del_ciclo(self):
        estado = '{"account":{"name":"cuenta"},"plan":null,"planUsage":null}'
        hilos = [
            {"machine": "cloud", "createdAt": "2026-10-20T00:00:00Z", "harness": "codex", "model": "gpt-x"},
            {"machine": "cloud", "createdAt": "2026-10-22T00:00:00Z", "harness": "claude-code", "model": "sonnet"},
            {"machine": "local", "createdAt": "2026-10-22T00:00:00Z", "harness": "pi", "model": "local"},
            {"machine": "cloud", "createdAt": "2026-09-20T00:00:00Z", "harness": "pi", "model": "old"},
        ]
        medidor = M.interpretar(estado, '{"count":12}', hilos, AHORA)
        self.assertEqual(medidor["id"], "cloudroom")
        self.assertEqual(medidor["plan"], "gratis")
        self.assertEqual(medidor["ventanas"][0]["usado"], 2)
        self.assertEqual(medidor["ventanas"][0]["total"], 100)
        self.assertIn("sin dato de la API", medidor["fuente"])
        self.assertEqual(medidor["ventanas"][1]["etiqueta"], "Agentes locales: sin límite")
        self.assertEqual(medidor["extras"]["agentes"], [
            {"harness": "codex", "modelo": "gpt-x"}, {"harness": "claude-code", "modelo": "sonnet"}])

    def test_uso_de_plan_y_json_envuelto(self):
        medidor = M.interpretar(
            '{"data":{"account":"ok","plan":{"name":"Pro"},"planUsage":{"used":8,"total":500}}}',
            '{"data":{"count":31}}', '{"data":{"threads":[]}}', AHORA)
        self.assertEqual(medidor["plan"], "Pro")
        self.assertEqual(medidor["ventanas"][0]["usado"], 8)
        self.assertEqual(medidor["ventanas"][0]["total"], 500)
        self.assertEqual(medidor["fuente"], "API Cloudroom")
        self.assertEqual(medidor["extras"]["hilos_total"], 31)

    def test_sin_estado_no_inventa_cupo(self):
        medidor = M.interpretar("no es JSON", "{}", "[]", AHORA)
        self.assertIs(medidor["ok"], False)
        self.assertEqual(medidor["ventanas"], [{"id": "local", "etiqueta": "Agentes locales: sin límite",
                                                "usado_pct": 0, "reinicia": None}])
        self.assertTrue(medidor["error"])


class PruebasCRM1024H(unittest.TestCase):
    def test_crm1024h_nube_por_execution_target_en_ms_y_modelos_de_harnesses(self):
        """CRM1024H: hilos reales de room-cli (executionTarget, createdAt en ms) y modelos de cloud status."""
        ms = int(AHORA.timestamp() * 1000)
        hilos = {"threads": [
            {"executionTarget": "cloud", "machine": None, "createdAt": ms - 3600 * 1000},
            {"executionTarget": "cloud", "machine": None, "createdAt": ms - 2 * 86400 * 1000, "archived": True},
            {"executionTarget": "local", "createdAt": ms - 3600 * 1000},
            {"executionTarget": "cloud", "createdAt": ms - 40 * 86400 * 1000},
        ]}
        estado = {"ready": True, "account": {"id": "x"}, "plan": None, "planUsage": None,
                  "harnesses": [{"id": "codex", "model": "gpt-6-astra",
                                 "models": [{"model": "gpt-6-luna"}, {"model": "gpt-5.6-terra"}]}]}
        m = M.interpretar(estado, {"total": 98}, hilos, AHORA)
        self.assertEqual(m["ventanas"][0]["usado"], 2)
        self.assertEqual(m["ventanas"][0]["total"], 100)
        self.assertEqual(m["extras"]["agentes"][0], {"harness": "codex", "modelo": "gpt-6-astra",
                                                     "modelos": ["gpt-6-luna", "gpt-5.6-terra"]})

    def test_crm1024h_ruta_de_la_cli_fuera_del_path(self):
        self.assertEqual(M.ruta_cli({"CLOUDROOM_CLI": "/x/room-cli"}, existe=lambda p: p == "/x/room-cli",
                                    buscar=lambda n: None), "/x/room-cli")
        self.assertIsNone(M.ruta_cli({}, existe=lambda p: False, buscar=lambda n: None))


class PruebasRTCRTC1024H(unittest.TestCase):
    """Rescate RTCRM1024H: fusionar_solo y la lectura de hilos archivados y ocultos."""

    def test_solo_conserva_los_otros_medidores(self):
        """(RTCRM1024H) Con --solo no se borran los demás medidores; main usa fusionar_solo."""
        import medidores_credito as MC
        previo = {"medidores": {"claude": {"id": "claude", "ok": True},
                                "codex": {"id": "codex", "ok": True},
                                "oracle": {"id": "oracle", "ok": True}},
                  "historial": {"claude": [{"t": "x", "v": {}}]}}
        doc = MC.recoger([{"id": "cloudroom", "tipo": "t"}], previo, AHORA,
                         adaptadores={"t": lambda cfg, ahora: {"id": "cloudroom", "ok": True}})
        fusionado = MC.fusionar_solo(previo, doc, {"cloudroom"})
        self.assertEqual(set(fusionado["medidores"]), {"cloudroom", "claude", "codex", "oracle"})
        self.assertIs(fusionado["medidores"]["claude"]["ok"], True)
        self.assertEqual(fusionado["historial"]["claude"], [{"t": "x", "v": {}}])
        self.assertIs(fusionado["medidores"]["cloudroom"]["ok"], True)

    def test_leer_medidor_resuelve_la_ruta_y_consulta_hilos_archivados(self):
        """(RTCRM1024H) Al CLI se le pasa la ruta resuelta (no el nombre suelto) y la lista
        de hilos pide archivados y ocultos, que también gastaron cupo del ciclo."""
        from unittest import mock
        ordenes = []
        with mock.patch.object(M, "ruta_cli", return_value="/opt/falsa/room-cli"), \
                mock.patch.object(M, "_correr", lambda orden: ordenes.append(list(orden)) or "{}"):
            self.assertIs(M.disponible(), True)
            self.assertEqual(M.leer_medidor({}, AHORA)["id"], "cloudroom")
        self.assertEqual(ordenes, [["/opt/falsa/room-cli", "cloud", "status", "--json"],
                                   ["/opt/falsa/room-cli", "thread", "count", "--json"],
                                   ["/opt/falsa/room-cli", "thread", "list", "--json",
                                    "--include-archived", "--include-hidden"]])


if __name__ == "__main__":
    unittest.main()
