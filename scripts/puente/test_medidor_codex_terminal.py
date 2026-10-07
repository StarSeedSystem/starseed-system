#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas adaptador Codex terminal (§2.2, §3)."""

import os
import sys
import unittest
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import medidor_codex_terminal as M

SANEADA = {
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
            {"resetType": "codexRateLimits", "status": "available", "grantedAt": 1790705400, "expiresAt": 1793297400, "title": "Full reset (Weekly + 5 hr)", "id": "credit-123"}
        ]
    },
    "accountId": "acc-secret-999",
    "rateLimitUpsell": {"title": "Upgrade to Pro", "description": "Get more usage"},
}


class TestInterpretarRpc(unittest.TestCase):
    def test_saneada_no_aparece_prohibido(self):
        ahora = datetime(2026, 10, 6, 18, 5, tzinfo=ZoneInfo("America/Mexico_City"))
        # Añadimos datos prohibidos a la respuesta
        entrada = dict(SANEADA)
        entrada["rateLimitsByLimitId"]["codex"]["credits"]["id"] = "credit-abc"
        entrada["rateLimits"]["credits"]["id"] = "credit-abc"
        r = M.interpretar_rpc(entrada, ahora=ahora)
        self.assertTrue(len(r) > 0)
        # Lista blanca: comprobar que ninguna clave o valor prohibido aparece
        texto = M.json.dumps(r, ensure_ascii=False)
        for prohibido in ("acc-secret-999", "credit-abc", "Upgrade to Pro", "Get more usage", "rateLimitUpsell", "title", "description"):
            self.assertNotIn(prohibido, texto, f"apareció '{prohibido}' en la salida")

    def test_secundaria_100_pct_reinicio(self):
        ahora = datetime(2026, 10, 9, 16, 12, tzinfo=ZoneInfo("America/Mexico_City"))
        # resetsAt 1791605571 -> 2026-10-09 22:12:51 UTC -> con zona -06:00 = 2026-10-09 16:12:51
        # Según el contrato, la zona local es la del sistema; usamos UTC para predicción, pero el contrato dice -06:00
        # Podemos usar ZoneInfo de la zona del usuario; aquí asumimos que fromtimestamp con astimezone() resolverá a zona local
        entrada = {
            "rateLimitsByLimitId": {
                "codex": {
                    "limitId": "codex",
                    "primary": {"usedPercent": 0, "windowDurationMins": 300, "resetsAt": 1791349120},
                    "secondary": {"usedPercent": 100, "windowDurationMins": 10080, "resetsAt": 1791605571},
                    "credits": {"balance": "0", "unlimited": False},
                    "planType": "plus",
                    "rateLimitReachedType": "rate_limit_reached",
                }
            },
        }
        r = M.interpretar_rpc(entrada, ahora=ahora)
        self.assertTrue(r[0]["ok"])
        ventanas = r[0]["ventanas"]
        secundaria = next((v for v in ventanas if v["id"] == "semana"), None)
        self.assertIsNotNone(secundaria)
        self.assertEqual(secundaria["usado_pct"], 100)
        # El contrato indica reinicio 2026-10-09T22:12:51-06:00 para 1791605571
        self.assertIn("2026-10-09T22:12:51", secundaria["reinicia"])

    def test_premium_todo_nulo_omitido(self):
        entrada = {
            "rateLimitsByLimitId": {
                "premium": {
                    "limitId": "premium",
                    "primary": {"usedPercent": None, "windowDurationMins": None, "resetsAt": None},
                    "secondary": {"usedPercent": None, "windowDurationMins": None, "resetsAt": None},
                    "credits": {"balance": "0", "unlimited": False},
                    "planType": "premium",
                }
            }
        }
        r = M.interpretar_rpc(entrada, ahora=datetime.now())
        # Si todo es nulo, debe omitirse (lista vacía o sin premium)
        ids = {m["id"] for m in r}
        self.assertNotIn("codex-premium", ids)

    def test_ventana_60_min(self):
        # Ventana con 60 minutos -> id "60min", etiqueta "60 min"
        entrada = {
            "rateLimits": {
                "limitId": "codex",
                "primary": {"usedPercent": 12, "windowDurationMins": 60, "resetsAt": 1790000000},
                "secondary": {"usedPercent": 85, "windowDurationMins": 10080, "resetsAt": 1791605571},
                "credits": {"balance": "5", "unlimited": False},
                "planType": "plus",
                "rateLimitReachedType": None,
                "ordinaryUsageAllowed": True,
                "rateLimitResetCredits": {
                    "availableCount": 2,
                    "credits": [
                        {"status": "available", "expiresAt": 1793297400},
                    ],
                },
            }
        }
        ahora = datetime(2026, 10, 6, 18, 5, tzinfo=ZoneInfo("UTC"))
        r = M.interpretar_rpc(entrada, ahora=ahora)
        self.assertTrue(r[0]["ok"])
        ventanas = r[0]["ventanas"]
        primaria = next((v for v in ventanas if v["id"] == "60min"), None)
        self.assertIsNotNone(primaria)
        self.assertEqual(primaria["etiqueta"], "60 min")
        self.assertEqual(primaria["usado_pct"], 12)
        # Extras
        extras = r[0]["extras"]
        self.assertTrue(extras.get("uso_normal"))
        self.assertEqual(extras.get("reinicios_gratis"), 2)
        self.assertIn("2026-10-29", extras.get("reinicio_gratis_vence", ""))


class TestInterpretarRollout(unittest.TestCase):
    def test_rollout_snake_case(self):
        linea = M.json.dumps({
            "timestamp": "2026-10-06T14:00:00-06:00",
            "payload": {
                "rate_limits": {
                    "limit_id": "codex",
                    "primary": {"used_percent": 36.0, "window_minutes": 300, "resets_at": 1791242699},
                    "secondary": {"used_percent": 99.0, "window_minutes": 10080, "resets_at": 1791605571},
                    "credits": {"balance": "0"},
                    "plan_type": "plus",
                }
            }
        })
        r = M.interpretar_rollout([linea], ahora=datetime(2026, 10, 6, 18, 5, tzinfo=ZoneInfo("America/Mexico_City")))
        self.assertTrue(len(r) > 0)
        self.assertEqual(r[0]["id"], "codex")
        self.assertEqual(r[0]["fuente"], "registro de sesiones de codex")
        ventanas = r[0]["ventanas"]
        secundaria = next((v for v in ventanas if v["id"] == "semana"), None)
        self.assertIsNotNone(secundaria)
        self.assertEqual(secundaria["usado_pct"], 99)


class TestLeer(unittest.TestCase):
    def test_popen_falso_orden_mensajes_y_kill(self):
        import subprocess
        mensajes_recibidos = []
        killed = [False]
        terminated = [False]
        class FakePopen:
            def __init__(self, cmd, stdin, stdout, stderr, text, bufsize, env):
                self.stdin = stdin
                self.stdout = stdout
                self.stderr = stderr
                self.returncode = None
            def write(self, s):
                mensajes_recibidos.append(s)
            def flush(self):
                pass
            def kill(self):
                killed[0] = True
            def wait(self, timeout=None):
                terminated[0] = True
            def close(self):
                pass
            def __del__(self):
                pass
        # Simular respuesta con id 1
        from unittest.mock import patch
        import io
        # Creamos un objeto que simule stdout con línea que contiene id 1
        respuesta_linea = '{"id":1,"result":{"limitId":"codex","primary":{"usedPercent":10,"windowDurationMins":300,"resetsAt":1791349120},"secondary":{"usedPercent":50,"windowDurationMins":10080,"resetsAt":1791605571},"credits":{"balance":"10","unlimited":False},"planType":"plus"}}\n'
        class FakeStdout:
            def readline(self):
                if not hasattr(self, "_done"):
                    self._done = False
                    return respuesta_linea
                return ""
            def __iter__(self):
                return self
            def __next__(self):
                linea = self.readline()
                if linea == "":
                    raise StopIteration
                return linea
        fake_stdout = FakeStdout()
        # Reemplazar abrir (subprocess.Popen)
        def abrir_falso(cmd, stdin, stdout, stderr, text, bufsize, env):
            p = FakePopen(cmd, stdin, stdout, stderr, text, bufsize, env)
            p.stdout = fake_stdout
            # Simular stdin
            class FakeStdin:
                def write(self, s):
                    mensajes_recibidos.append(s)
                def flush(self):
                    pass
                def close(self):
                    pass
            p.stdin = FakeStdin()
            return p
        r = M.leer(ahora=datetime(2026, 10, 6, 18, 5, tzinfo=ZoneInfo("America/Mexico_City")), abrir=abrir_falso, home="/tmp")
        # Debe haber recibido los 3 mensajes
        self.assertEqual(len([l for l in mensajes_recibidos if isinstance(l, str)]), 3)
        # Debe haber llamado kill o terminate
        self.assertTrue(killed[0] or terminated[0], "no se llamó a kill/terminate")
        # Debe devolver un medidor
        self.assertTrue(any(isinstance(x, dict) for x in r))

    def test_popen_file_not_found_respaldo_rollout(self):
        import tempfile, os
        def abrir_fallo(*a, **kw):
            raise FileNotFoundError()
        with tempfile.TemporaryDirectory() as tmpdir:
            # Crear estructura de rollouts
            ruta_sesion = os.path.join(tmpdir, ".codex", "sessions", "2026", "10", "06")
            os.makedirs(ruta_sesion, exist_ok=True)
            ruta_rollout = os.path.join(ruta_sesion, "rollout-001.jsonl")
            linea = '{"timestamp":"2026-10-06T14:00:00-06:00","payload":{"rate_limits":{"limit_id":"codex","primary":{"used_percent":40,"window_minutes":300,"resets_at":1791242699},"secondary":{"used_percent":60,"window_minutes":10080,"resets_at":1791605571},"credits":{"balance":"2"},"plan_type":"plus"}}}'
            with open(ruta_rollout, "w", encoding="utf-8") as f:
                f.write(linea + "\n")
            r = M.leer(ahora=datetime(2026, 10, 6, 14, 0, tzinfo=ZoneInfo("America/Mexico_City")), abrir=abrir_fallo, home=tmpdir)
            # Debe usar respaldo y devolver algo
            self.assertTrue(isinstance(r, list))
            # Si hay respaldo, debe ser un dict con ok o error
            for item in r:
                self.assertIn("id", item)


if __name__ == "__main__":
    unittest.main()
