"""Pruebas de interpretación Cloudroom: JSON simulado y ninguna llamada externa."""
import json
import os
import sys
import unittest
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import medidor_cloudroom as M  # noqa: E402
import medidores_credito as mc  # noqa: E402

AHORA = datetime(2026, 10, 24, tzinfo=timezone.utc)


class PruebasMedidorCloudroom(unittest.TestCase):
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
        self.assertFalse(medidor["ok"])
        self.assertEqual(medidor["ventanas"], [
            {"id": "local", "etiqueta": "Agentes locales: sin límite",
             "usado_pct": 0, "reinicia": None}])
        self.assertTrue(medidor["error"])

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
        self.assertEqual(m["extras"]["agentes"][0], {
            "harness": "codex", "modelo": "gpt-6-astra",
            "modelos": ["gpt-6-luna", "gpt-5.6-terra"]})

    def test_crm1024h_ruta_de_la_cli_fuera_del_path(self):
        self.assertEqual(M.ruta_cli({"CLOUDROOM_CLI": "/x/room-cli"},
                                    existe=lambda p: p == "/x/room-cli",
                                    buscar=lambda n: None), "/x/room-cli")
        self.assertIsNone(M.ruta_cli({}, existe=lambda p: False, buscar=lambda n: None))

    def test_crm1024h_ruta_de_launchd_cuando_la_cli_no_esta_en_el_path(self):
        """RTCRM1024Hb: launchd no trae room-cli en el PATH; se busca en ~/.local/bin."""
        local = os.path.expanduser("~/.local/bin/room-cli")
        self.assertEqual(M.ruta_cli({}, existe=lambda p: p == local, buscar=lambda n: None), local)

    def test_crm1024h_leer_medidor_pide_archivados_y_ocultos_en_milisegundos(self):
        """RTCRM1024Hb: el listado incluye archivados/ocultos y cuenta hilos de 30 días en ms."""
        ordenes = []
        ms = int(AHORA.timestamp() * 1000)
        original = (M.disponible, M.ruta_cli, M._correr)

        def correr(orden):
            ordenes.append(list(orden))
            if "cloud" in orden and "status" in orden:
                return json.dumps({"account": {"id": "x"}, "plan": None, "planUsage": None})
            if "thread" in orden and "list" in orden:
                return json.dumps({"threads": [
                    {"executionTarget": "cloud", "createdAt": ms - 3600 * 1000},
                    {"executionTarget": "cloud", "createdAt": ms - 31 * 86400 * 1000},
                    {"executionTarget": "local", "createdAt": ms - 3600 * 1000},
                ]})
            return json.dumps({"count": 3})

        M.disponible, M.ruta_cli, M._correr = (lambda: True), (lambda: "fake-room-cli"), correr
        try:
            medidor = M.leer_medidor({}, AHORA)
        finally:
            M.disponible, M.ruta_cli, M._correr = original
        lista = [o for o in ordenes if "thread" in o and "list" in o][0]
        self.assertIn("--include-archived", lista)
        self.assertIn("--include-hidden", lista)
        self.assertEqual(medidor["ventanas"][0]["usado"], 1)

    def test_crm1024h_fusionar_solo_conserva_los_otros_medidores(self):
        """RTCRM1024Hb: `--solo` solo pisa los elegidos; los demás medidores e historial quedan."""
        previo = {"medidores": {"cloudroom": {"v": 1}, "claude": {"v": 2}},
                  "historial": {"claude": [{"v": 2}]}}
        nuevo = {"medidores": {"cloudroom": {"v": 3}}, "historial": previo["historial"]}
        doc = mc.fusionar_solo(previo, nuevo, {"cloudroom"})
        self.assertEqual(doc["medidores"], {"cloudroom": {"v": 3}, "claude": {"v": 2}})
        self.assertEqual(doc["historial"], previo["historial"])


if __name__ == "__main__":
    unittest.main()
