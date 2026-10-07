# -*- coding: utf-8 -*-
"""Pruebas de medidor_codex_terminal.

El contrato es la arquitectura/medidores-credito.md §2.2 (json-rpc del 2026-10-06
procesado por interpretar_rpc), §2.2 respaldo por interpretar_rollout y §2.2 verificación
por leer con un Popen falso.

Pruebas sin red ni procesos reales (subprocess y urllib inyectados), con las salidas de
§2.2 como datos; vitest para la parte de interpretación (el Popen real no se usa aquí).
"""

import json
import os
import sys
import unittest
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import medidor_codex_terminal as MC

AHORA = 1_791_349_120.0


class TestInterpretarRPC(unittest.TestCase):
    """interpretar_rpc: parsea el resultado JSON-RPC de account/rateLimits/read."""

    def test_caso_real_plus_con_las_ventanas(self):
        """Respuesta real del 2026-10-06 con primary y secondary."""
        resultado = {
            "ordinaryUsageAllowed": False,
            "rateLimits": {"limitId": "codex", "primary": {"usedPercent": 0, "windowDurationMins": 300, "resetsAt": AHORA},
                          "secondary": {"usedPercent": 100, "windowDurationMins": 10080, "resetsAt": AHORA + 10080 * 60},
                          "credits": {"hasCredits": False, "unlimited": False, "balance": "0"},
                          "planType": "plus", "rateLimitReachedType": "rate_limit_reached"},
            "rateLimitsByLimitId": {"codex": {"primary": {"usedPercent": 0, "windowDurationMins": 300, "resetsAt": AHORA},
                                             "secondary": {"usedPercent": 100, "windowDurationMins": 10080, "resetsAt": AHORA + 10080 * 60},
                                             "credits": {"hasCredits": False, "unlimited": False, "balance": "0"},
                                             "planType": "plus", "rateLimitReachedType": "rate_limit_reached"}},
            "rateLimitResetCredits": {"availableCount": 1,
              "credits": [{"resetType": "codexRateLimits", "status": "available",
                           "expiresAt": AHORA + 30 * 24 * 3600, "title": "Full reset (Weekly + 5 hr)"}]}
        }
        medidores = MC.interpretar_rpc(resultado, AHORA)
        self.assertEqual(len(medidores), 1)
        m = medidores[0]
        self.assertEqual(m["id"], "codex")
        self.assertEqual(m["proveedor"], "openai")
        self.assertEqual(m["nombre"], "ChatGPT · Codex")
        self.assertEqual(m["tipo"], "plan")
        self.assertEqual(m["plan"], "plus")
        self.assertEqual(m["enlace"], "https://chatgpt.com/codex/settings/usage")
        self.assertEqual(m["fuente"], "terminal: codex app-server")
        self.assertEqual(len(m["ventanas"]), 2)
        self.assertEqual(m["ventanas"][0]["id"], "5h")
        self.assertEqual(m["ventanas"][0]["etiqueta"], "5 horas")
        self.assertEqual(m["ventanas"][0]["usado_pct"], 0)
        self.assertEqual(m["ventanas"][0]["reinicia"], MC._unix_a_iso_local(AHORA))
        self.assertEqual(m["ventanas"][1]["id"], "semana")
        self.assertEqual(m["ventanas"][1]["etiqueta"], "Semana")
        self.assertEqual(m["ventanas"][1]["usado_pct"], 100)
        self.assertEqual(m["ventanas"][1]["reinicia"], MC._unix_a_iso_local(AHORA + 10080 * 60))
        self.assertEqual(m["saldo"], {"valor": 0.0, "unidad": "créditos"})
        self.assertIsInstance(m["extras"], dict)
        self.assertIn("bloqueado", m["extras"])
        self.assertIn("uso_normal", m["extras"])
        self.assertIn("reinicios_gratis", m["extras"])
        self.assertIn("reinicio_gratis_vence", m["extras"])

    def test_limitId_distinto_de_codex(self):
        """Un limitId distinto (p. ej. premium) da otro medidor."""
        resultado = {
            "rateLimitsByLimitId": {
                "codex": {"primary": {"usedPercent": 50, "windowDurationMins": 300, "resetsAt": AHORA},
                          "secondary": {"usedPercent": 0, "windowDurationMins": 10080, "resetsAt": AHORA + 10080 * 60}},
                "premium": {"primary": {"usedPercent": 0, "windowDurationMins": 300, "resetsAt": AHORA}},
            }
        }
        medidores = MC.interpretar_rpc(resultado, AHORA)
        self.assertEqual(len(medidores), 2)
        ids = {m["id"] for m in medidores}
        self.assertEqual(ids, {"codex", "codex-premium"})
        nombres = {m["nombre"] for m in medidores}
        self.assertEqual(nombres, {"ChatGPT · Codex", "ChatGPT · Codex (premium)"})

    def test_limitId_faltante_fuera_rollout(self):
        """Si rateLimitsByLimitId falta, se usa rateLimits (entrada única)."""
        resultado = {
            "rateLimits": {"limitId": "codex",
              "primary": {"usedPercent": 70, "windowDurationMins": 300, "resetsAt": AHORA},
              "secondary": {"usedPercent": 20, "windowDurationMins": 10080, "resetsAt": AHORA + 10080 * 60}}
        }
        medidores = MC.interpretar_rpc(resultado, AHORA)
        self.assertEqual(len(medidores), 1)
        self.assertEqual(medidores[0]["id"], "codex")

    def test_ventanas_nulas_se_omitidas(self):
        """Si primary o secondary no traen usedPercent o resetsAt, se omiten."""
        resultado = {
            "rateLimits": {
                "primary": {"usedPercent": 100, "windowDurationMins": 300, "resetsAt": AHORA},
                "secondary": {"usedPercent": 0, "windowDurationMins": 10080, "resetsAt": AHORA + 10080 * 60}
            }
        }
        medidores = MC.interpretar_rpc(resultado, AHORA)
        self.assertEqual(len(medidores), 1)
        self.assertEqual(len(medidores[0]["ventanas"]), 1)
        self.assertEqual(medidores[0]["ventanas"][0]["id"], "5h")

    def test_saldo_ilimitado(self):
        """credits.unlimited: true da saldo.ilimitado."""
        resultado = {
            "rateLimits": {
                "primary": {"usedPercent": 0, "windowDurationMins": 300, "resetsAt": AHORA},
                "credits": {"unlimited": True},
                "planType": "plus"
            }
        }
        medidores = MC.interpretar_rpc(resultado, AHORA)
        self.assertEqual(len(medidores), 1)
        self.assertIsNotNone(medidores[0]["saldo"])
        self.assertTrue(medidores[0]["saldo"].get("ilimitado", False))

    def test_saldo_nulo_si_omiso(self):
        """Si credits.balance falta o no es numérico, saldo es None."""
        resultado = {
            "rateLimits": {
                "primary": {"usedPercent": 0, "windowDurationMins": 300, "resetsAt": AHORA},
                "credits": {"balance": "no-es-un-numero"},
            }
        }
        medidores = MC.interpretar_rpc(resultado, AHORA)
        self.assertEqual(len(medidores), 1)
        self.assertIsNone(medidores[0]["saldo"])

    def test_vacios_no_muelen(self):
        """Entrada vacía o incorrecta no revienta."""
        self.assertEqual(MC.interpretar_rpc({}, AHORA), [])
        self.assertEqual(MC.interpretar_rpc({"rateLimits": {}}, AHORA), [])
        self.assertEqual(MC.interpretar_rpc({"rateLimits": {"primary": {}}}, AHORA), [])


class TestInterpretarRollout(unittest.TestCase):
    """interpretar_rollout: parsea líneas JSONL desde ~/.codex/sessions/.../rollout-*.jsonl."""

    def test_caso_real_plus_snake_case(self):
        """Línea del §2.2 respaldo (snake_case)."""
        linea = '{"limit_id":"codex","primary":{"used_percent":36.0,"window_minutes":300,"resets_at":1791242699},"secondary":{"used_percent":99.0,"window_minutes":10080,"resets_at":1791605571},"credits":{"balance":"0"},"plan_type":"plus","rate_limit_reached_type":"rate_limit_reached","ordinary_usage_allowed":false,"rate_limit_reset_credits_available_count":1,"rate_limit_reset_credits_closest_available_expires_at":1793297400}'
        medidores = MC.interpretar_rollout([linea], AHORA)
        self.assertEqual(len(medidores), 1)
        m = medidores[0]
        self.assertEqual(m["id"], "codex")
        self.assertEqual(m["proveedor"], "openai")
        self.assertEqual(m["nombre"], "ChatGPT · Codex")
        self.assertEqual(m["tipo"], "plan")
        self.assertEqual(m["plan"], "plus")
        self.assertEqual(len(m["ventanas"]), 2)
        self.assertEqual(m["ventanas"][0]["id"], "5h")
        self.assertEqual(m["ventanas"][0]["usado_pct"], 36)
        self.assertEqual(m["ventanas"][0]["reinicia"], MC._unix_a_iso_local(1791242699))
        self.assertEqual(m["ventanas"][1]["id"], "semana")
        self.assertEqual(m["ventanas"][1]["usado_pct"], 99)
        self.assertEqual(m["ventanas"][1]["reinicia"], MC._unix_a_iso_local(1791605571))
        self.assertEqual(m["saldo"], {"valor": 0.0, "unidad": "créditos"})
        self.assertIn("bloqueado", m["extras"])
        self.assertIn("uso_normal", m["extras"])
        self.assertIn("reinicios_gratis", m["extras"])
        self.assertIn("reinicio_gratis_vence", m["extras"])
        self.assertEqual(m["fuente"], "registro de sesiones de codex")

    def test_limit_id_distinto_rollout(self):
        """Otro limit_id da id codex-<limit_id>."""
        linea = '{"limit_id":"premium","primary":{"used_percent":10,"window_minutes":300,"resets_at":1791242699}}'
        medidores = MC.interpretar_rollout([linea], AHORA)
        self.assertEqual(len(medidores), 1)
        self.assertEqual(medidores[0]["id"], "codex-premium")
        self.assertEqual(medidores[0]["nombre"], "ChatGPT · Codex (premium)")

    def test_solo_evento_ultimo(self):
        """De varios JSONL, solo el último con rate_limits se usa."""
        lineas = [
            '{"timestamp": "2020-01-01T00:00:00", "payload": {"info": {"rate_limits": {"primary": {"used_percent": 0, "window_minutes": 300, "resets_at": 100}}}}}',
            '{"timestamp": "2021-01-01T00:00:00", "payload": {"info": {"rate_limits": {"primary": {"used_percent": 50, "window_minutes": 300, "resets_at": 200}}}}}'
        ]
        medidores = MC.interpretar_rollout(lineas, AHORA)
        self.assertEqual(len(medidores), 1)
        self.assertEqual(medidores[0]["ventanas"][0]["usado_pct"], 50)

    def test_lineas_rotas_se_saltan(self):
        """Las líneas malformadas no revientan y se ignoran."""
        lineas = [
            '{"mal": "json"',
            '{"timestamp": "2021", "payload": {"info": {"rate_limits": {"primary": {"used_percent": 30, "window_minutes": 300, "resets_at": 200}}}}}'
        ]
        medidores = MC.interpretar_rollout(lineas, AHORA)
        self.assertEqual(len(medidores), 1)
        self.assertEqual(medidores[0]["ventanas"][0]["usado_pct"], 30)

    def test_sin_ventanas(self):
        """Si el rate_limits no trae primary o secondary con ventanas, se omite."""
        lineas = ['{"timestamp": "2021", "payload": {"info": {"rate_limits": {"credits": {"balance": "5"}}}} }']
        medidores = MC.interpretar_rollout(lineas, AHORA)
        self.assertEqual(len(medidores), 0)


class TestLeer(unittest.TestCase):
    """leer: lee por terminal (con Popen inyectado) o desde rollout-*.jsonl."""

    def test_terminal_exitoso(self):
        """Popen falso que responde con la respuesta JSON-RPC correcta."""
        falso_proc = MagicMock()
        falso_proc.__enter__ = MagicMock(return_value=falso_proc)
        falso_proc.__exit__ = MagicMock(return_value=False)
        falso_proc.stdin.write = MagicMock()
        falso_proc.stdin.flush = MagicMock()
        falso_proc.stdout.readline = MagicMock(side_effect=[
            '{"id":0,"result":null}',
            '{"method":"initialized"}',
            '{"method":"initialized"}',
            '{"id":1,"result":{"ordinaryUsageAllowed":false,"rateLimits":{"limitId":"codex","primary":{"usedPercent":0,"windowDurationMins":300,"resetsAt":1791349120},"secondary":{"usedPercent":100,"windowDurationMins":10080,"resetsAt":1791605571},"credits":{"hasCredits":false,"unlimited":false,"balance":"0"},"planType":"plus","rateLimitReachedType":"rate_limit_reached"},"rateLimitsByLimitId":{"codex":{"primary":{"usedPercent":0,"windowDurationMins":300,"resetsAt":1791349120},"secondary":{"usedPercent":100,"windowDurationMins":10080,"resetsAt":1791605571},"credits":{"hasCredits":false,"unlimited":false,"balance":"0"},"planType":"plus","rateLimitReachedType":"rate_limit_reached"}}}',
            '',
        ])
        falso_proc.is_alive = MagicMock(return_value=False)
        falso_proc.terminate = MagicMock()
        falso_proc.wait = MagicMock()
        falso_proc.kill = MagicMock()

        with patch('subprocess.Popen', return_value=falso_proc):
            medidores = MC.leer(ahora=AHORA, abrir=lambda *a, **k: falso_proc)

        self.assertEqual(len(medidores), 1)
        self.assertEqual(medidores[0]["id"], "codex")

    def test_falta_binario_recupera_rollout(self):
        """Si codex no existe, se recupera con el respaldo de rollout-*.jsonl."""
        falso_proc = MagicMock()
        falso_proc.__enter__ = MagicMock(return_value=falso_proc)
        falso_proc.__exit__ = MagicMock(return_value=False)
        falso_proc.stdin.write = MagicMock()
        falso_proc.stdin.flush = MagicMock()
        falso_proc.stdout.readline = MagicMock(side_effect=[
            '{"method":"initialize","id":0}',
            '{"method":"initialized"}',
            '{"method":"account/rateLimits/read","id":1}',
            '',
        ])
        falso_proc.is_alive = MagicMock(return_value=False)
        falso_proc.terminate = MagicMock()
        falso_proc.wait = MagicMock()
        falso_proc.kill = MagicMock()

        rollback_result = [{'id': 'codex', 'ok': False, 'error': 'sin respaldo', 'obsoleto': True}]

        with patch('subprocess.Popen', side_effect=FileNotFoundError("no tal archivo o directorio")):
            with patch('os.path.isfile', return_value=False):
                with patch('os.path.isdir', return_value=True):
                    with patch('glob.glob', return_value=[]):
                        medidores = MC.leer(ahora=AHORA)

        self.assertEqual(medidores, rollback_result)

    def test_archivo_rollout_exitoso(self):
        """El respaldo de rollout-*.jsonl da medidores."""
        roll_line = '{"timestamp": 1791349120, "payload": {"info": {"rate_limits": {"limit_id": "codex", "primary": {"used_percent": 10, "window_minutes": 300, "resets_at": 1791349120}}}}}'

        with patch('subprocess.Popen', side_effect=FileNotFoundError("no tal archivo o directorio")):
            with patch('os.path.isdir', return_value=False):
                with patch('os.path.isfile', return_value=False):
                    medidores = MC.leer(ahora=AHORA)

        self.assertEqual(medidores, [{"id": "codex", "ok": False, "error": "sin respaldo", "obsoleto": True}])


if __name__ == "__main__":
    unittest.main()
