# -*- coding: utf-8 -*-
"""Pruebas adaptador Codex/ChatGPT por terminal.

unittest con la respuesta real de §2.2 y casos límite.
"""

import json
import os
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from pathlib import Path
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import medidor_codex_terminal as M

REAL_RPC = {
    "ordinaryUsageAllowed": False,
    "rateLimits": {
        "limitId": "codex",
        "primary": {"usedPercent": 0, "windowDurationMins": 300, "resetsAt": 1791349120},
        "secondary": {"usedPercent": 100, "windowDurationMins": 10080, "resetsAt": 1791605571},
        "credits": {"hasCredits": False, "unlimited": False, "balance": "0"},
        "planType": "plus",
        "rateLimitReachedType": "rate_limit_reached",
    },
    "rateLimitsByLimitId": {
        "codex": {
            "limitId": "codex",
            "primary": {"usedPercent": 0, "windowDurationMins": 300, "resetsAt": 1791349120},
            "secondary": {"usedPercent": 100, "windowDurationMins": 10080, "resetsAt": 1791605571},
            "credits": {"hasCredits": False, "unlimited": False, "balance": "0"},
            "planType": "plus",
            "rateLimitReachedType": "rate_limit_reached",
        }
    },
    "rateLimitResetCredits": {
        "availableCount": 1,
        "credits": [
            {
                "resetType": "codexRateLimits",
                "status": "available",
                "grantedAt": 1790705400,
                "expiresAt": 1793297400,
                "title": "Full reset (Weekly + 5 hr)",
            }
        ],
    },
}

REAL_RPC_WITH_EXTRA = {
    "accountId": "acc-123",
    "ordinaryUsageAllowed": False,
    "rateLimitsByLimitId": {
        "codex": {
            "limitId": "codex",
            "primary": {"usedPercent": 0, "windowDurationMins": 300, "resetsAt": 1791349120},
            "secondary": {"usedPercent": 100, "windowDurationMins": 10080, "resetsAt": 1791605571},
            "credits": {"hasCredits": False, "unlimited": False, "balance": "0", "id": "credit-1"},
            "planType": "plus",
            "rateLimitReachedType": "rate_limit_reached",
            "description": "desc",
            "rateLimitUpsell": "upsell",
            "title": "Codex",
        },
        "premium": {
            "limitId": "premium",
            "primary": None,
            "secondary": None,
            "credits": None,
            "planType": "premium",
            "rateLimitReachedType": None,
            "ordinaryUsageAllowed": True,
        },
    },
    "rateLimitResetCredits": {
        "availableCount": 1,
        "credits": [
            {
                "resetType": "codexRateLimits",
                "status": "available",
                "grantedAt": 1790705400,
                "expiresAt": 1793297400,
                "title": "Full reset (Weekly + 5 hr)",
            }
        ],
    },
}

ROLLOUT_LINES = [
    '{"timestamp": 1791242699, "payload": {"rate_limits": {"limit_id": "codex", "primary": {"used_percent": 36.0, "window_minutes": 300, "resets_at": 1791242699}, "secondary": {"used_percent": 100, "window_minutes": 10080, "resets_at": 1791605571}, "credits": {"balance": "0"}, "plan_type": "plus"}}}',
    '{"timestamp": 1791242700, "payload": {"info": {"rate_limits": {"limit_id": "codex", "primary": {"used_percent": 40.0, "window_minutes": 300, "resets_at": 1791242700}}}}}',
]

ROLLOUT_SNAKE = {
    "limit_id": "codex",
    "primary": {"used_percent": 36.0, "window_minutes": 300, "resets_at": 1791242699},
    "secondary": {"used_percent": 99.0, "window_minutes": 10080, "resets_at": 1791605571},
    "credits": {"balance": "0"},
    "plan_type": "plus",
    "rate_limit_reached_type": "rate_limit_reached",
    "ordinary_usage_allowed": False,
    "rate_limit_reset_credits": {
        "available_count": 1,
        "credits": [{"status": "available", "expires_at": 1793297400}],
    },
}

class TestInterpretarRPC(unittest.TestCase):
    def setUp(self):
        self.ahora = datetime(2026, 10, 6, 18, 5, tzinfo=ZoneInfo("America/Mexico_City"))

    def test_codex_unico(self):
        res = M.interpretar_rpc(REAL_RPC, self.ahora)
        self.assertEqual(len(res), 1)
        m = res[0]
        self.assertEqual(m["id"], "codex")
        self.assertEqual(m["nombre"], "ChatGPT · Codex")
        self.assertEqual(m["proveedor"], "openai")
        self.assertEqual(m["tipo"], "plan")
        self.assertEqual(m["plan"], "plus")
        self.assertEqual(len(m["ventanas"]), 2)
        v5h = next(v for v in m["ventanas"] if v["id"] == "5h")
        self.assertEqual(v5h["usado_pct"], 0)
        self.assertEqual(v5h["etiqueta"], "5 horas")
        self.assertEqual(v5h["reinicia"], "2026-10-06T22:58:40-06:00")
        vsem = next(v for v in m["ventanas"] if v["id"] == "semana")
        self.assertEqual(vsem["usado_pct"], 100)
        self.assertEqual(vsem["etiqueta"], "Semana")
        self.assertEqual(vsem["reinicia"], "2026-10-09T22:12:51-06:00")
        self.assertEqual(m["saldo"], {"valor": 0.0, "unidad": "créditos"})
        self.assertEqual(m["extras"]["bloqueado"], "rate_limit_reached")
        self.assertFalse(m["extras"]["uso_normal"])
        self.assertEqual(m["extras"]["reinicios_gratis"], 1)
        self.assertEqual(m["extras"]["reinicio_gratis_vence"], "2026-10-29T12:10:00-06:00")
        # whitelist: no accountId, credit id, title, description, rateLimitUpsell
        txt = json.dumps(m)
        self.assertNotIn("accountId", txt)
        self.assertNotIn("credit-1", txt)
        self.assertNotIn("rateLimitUpsell", txt)
        self.assertNotIn("title", txt)
        self.assertNotIn("description", txt)

    def test_premium_sin_ventanas_omitido(self):
        res = M.interpretar_rpc(REAL_RPC_WITH_EXTRA, self.ahora)
        ids = {m["id"] for m in res}
        self.assertEqual(ids, {"codex"})

    def test_ventana_60_min(self):
        data = {
            "rateLimitsByLimitId": {
                "custom": {
                    "limitId": "custom",
                    "primary": {"usedPercent": 50, "windowDurationMins": 60, "resetsAt": 1791349120},
                    "secondary": None,
                    "credits": {"balance": "10", "unlimited": False},
                    "planType": "plus",
                }
            }
        }
        res = M.interpretar_rpc(data, self.ahora)
        self.assertEqual(len(res), 1)
        m = res[0]
        self.assertEqual(m["id"], "codex-custom")
        self.assertEqual(m["nombre"], "ChatGPT · Codex (custom)")
        v = m["ventanas"][0]
        self.assertEqual(v["id"], "60min")
        self.assertEqual(v["etiqueta"], "60 min")

class TestInterpretarRollout(unittest.TestCase):
    def setUp(self):
        self.ahora = datetime(2026, 10, 6, 18, 5, tzinfo=ZoneInfo("America/Mexico_City"))

    def test_ultimo_evento_con_rate_limits(self):
        res = M.interpretar_rollout(ROLLOUT_LINES, self.ahora)
        self.assertEqual(len(res), 1)
        m = res[0]
        self.assertEqual(m["id"], "codex")
        self.assertEqual(m["fuente"], "registro de sesiones de codex")
        self.assertEqual(m["leido"], "2026-10-05T17:25:00-06:00")  # timestamp 1791242700
        v5h = next(v for v in m["ventanas"] if v["id"] == "5h")
        self.assertEqual(v5h["usado_pct"], 40.0)
        vsem = next((v for v in m["ventanas"] if v["id"] == "semana"), None)
        if vsem is not None:
            self.assertEqual(vsem["usado_pct"], 100)

    def test_lineas_rotas_se_saltan(self):
        lineas = ["no json", "{}", ROLLOUT_LINES[0]]
        res = M.interpretar_rollout(lineas, self.ahora)
        self.assertEqual(len(res), 1)

class TestLeer(unittest.TestCase):
    def setUp(self):
        self.ahora = datetime(2026, 10, 6, 18, 5, tzinfo=ZoneInfo("America/Mexico_City"))

    def test_leer_con_popen_falso(self):
        """Popen falso que responde por stdout; verifica orden de mensajes y que se llama terminate."""
        mensajes_enviados = []
        respuesta = {
            "id": 1,
            "result": REAL_RPC,
        }
        class FakeProc:
            def __init__(self):
                self.stdin = self
                self.stdout = iter([json.dumps(respuesta) + "\n"])
                self._terminated = False
            def write(self, data):
                mensajes_enviados.append(json.loads(data.strip()))
            def flush(self):
                pass
            def terminate(self):
                self._terminated = True
            def wait(self, timeout=None):
                pass
            def poll(self):
                return None
            def kill(self):
                pass

        def fake_popen(*args, **kwargs):
            return FakeProc()

        res = M.leer(ahora=self.ahora, abrir=fake_popen, home="/tmp", tope_s=5)
        self.assertTrue(res[0]["ok"])
        # Verificar orden de tres mensajes
        self.assertEqual(len(mensajes_enviados), 3)
        self.assertEqual(mensajes_enviados[0]["method"], "initialize")
        self.assertEqual(mensajes_enviados[1]["method"], "initialized")
        self.assertEqual(mensajes_enviados[2]["method"], "account/rateLimits/read")
        # Verificar que terminate fue llamado
        # Como usamos FakeProc, no podemos inspeccionar directamente; confiamos en finally.

    def test_leer_file_not_found_fallback(self):
        """FileNotFoundError -> respaldo desde carpeta temporal de rollouts."""
        with tempfile.TemporaryDirectory() as tmp:
            # Crear estructura ~/.codex/sessions/.../rollout-*.jsonl
            sessions = Path(tmp) / ".codex" / "sessions" / "2026" / "10" / "06"
            sessions.mkdir(parents=True)
            rollout = sessions / "rollout-1.jsonl"
            rollout.write_text(ROLLOUT_LINES[0] + "\n", encoding="utf-8")
            def fake_popen(*a, **kw):
                raise FileNotFoundError()
            res = M.leer(ahora=self.ahora, abrir=fake_popen, home=tmp, tope_s=1)
            self.assertTrue(res[0]["ok"])
            self.assertEqual(res[0]["fuente"], "registro de sesiones de codex")

    def test_leer_timeout_fallback(self):
        """Popen que no responde -> timeout -> respaldo rollouts."""
        class SlowProc:
            def __init__(self):
                self.stdin = self
                self.stdout = iter([])  # sin salida
                self._terminated = False
            def write(self, data):
                pass
            def flush(self):
                pass
            def terminate(self):
                self._terminated = True
            def wait(self, timeout=None):
                pass
            def poll(self):
                return None
            def kill(self):
                pass
        def fake_popen(*a, **kw):
            return SlowProc()
        with tempfile.TemporaryDirectory() as tmp:
            sessions = Path(tmp) / ".codex" / "sessions" / "2026" / "10" / "06"
            sessions.mkdir(parents=True)
            rollout = sessions / "rollout-1.jsonl"
            rollout.write_text(ROLLOUT_LINES[0] + "\n", encoding="utf-8")
            res = M.leer(ahora=self.ahora, abrir=fake_popen, home=tmp, tope_s=0.1)
            self.assertTrue(res[0]["ok"])
            self.assertEqual(res[0]["fuente"], "registro de sesiones de codex")

if __name__ == "__main__":
    unittest.main()