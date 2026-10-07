#!/usr/bin/env python3
"""Pruebas unitarias para el adaptador Codex/ChatGPT (MC1007B).

Ejemplo: `python -m unittest discover -s scripts/puente -p "test_medidor_codex_terminal.py"`
"""

from __future__ import annotations

import json
import subprocess
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import MagicMock, patch

import medidor_codex_terminal

interpretar_rpc = medidor_codex_terminal.interpretar_rpc
interpretar_rollout = medidor_codex_terminal.interpretar_rollout
leer = medidor_codex_terminal.leer


class TestMedidorCodexTerminal(unittest.TestCase):
    """Casos de prueba para interpretar_rpc, interpretar_rollout y leer."""

    def test_interpretar_rpc_codex_completo(self) -> None:
        """Interpreta una respuesta completa de Codex (ejemplo §2.2).

        Debe producir un medidor con ambas ventanas, saldo, plan, extras y fuente correcta.
        """
        ahora = datetime(2026, 10, 7, 18, 5, tzinfo=timezone.utc)
        resultado = {
            "rateLimitsByLimitId": {
                "codex": {
                    "primary": {
                        "usedPercent": 0,
                        "windowDurationMins": 300,
                        "resetsAt": 1791349120,
                    },
                    "secondary": {
                        "usedPercent": 100,
                        "windowDurationMins": 10080,
                        "resetsAt": 1791605571,
                    },
                    "credits": {
                        "hasCredits": False,
                        "unlimited": False,
                        "balance": "0",
                    },
                    "planType": "plus",
                    "rateLimitReachedType": "rate_limit_reached",
                    "ordinaryUsageAllowed": False,
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
            }
        }

        medidores = interpretar_rpc(resultado, ahora)

        self.assertEqual(len(medidores), 1)
        med = medidores[0]
        self.assertEqual(med["id"], "codex")
        self.assertEqual(med["proveedor"], "openai")
        self.assertEqual(med["nombre"], "ChatGPT · Codex")
        self.assertEqual(med["tipo"], "plan")
        self.assertEqual(med["plan"], "plus")
        self.assertEqual(med["saldo"]["valor"], 0.0)
        self.assertEqual(med["saldo"]["unidad"], "créditos")
        self.assertEqual(med["extras"]["bloqueado"], "rate_limit_reached")
        self.assertEqual(med["extras"]["uso_normal"], False)
        self.assertEqual(med["extras"]["reinicios_gratis"], 1)
        self.assertTrue(med["extras"]["reinicio_gratis_vence"].startswith("2026-10-29T"))
        self.assertEqual(len(med["ventanas"]), 2)
        self.assertEqual(med["ventanas"][0]["id"], "5h")
        self.assertEqual(med["ventanas"][0]["etiqueta"], "5 horas")
        self.assertEqual(med["ventanas"][0]["usado_pct"], 0)
        self.assertEqual(med["ventanas"][1]["id"], "semana")
        self.assertEqual(med["ventanas"][1]["etiqueta"], "Semana")
        self.assertEqual(med["ventanas"][1]["usado_pct"], 100)
        self.assertEqual(med["fuente"], "terminal: codex app-server")
        self.assertTrue(med["leido"].startswith("2026-10-07T18:05:00"))
        self.assertTrue(med["ok"])
        self.assertFalse(med["obsoleto"])
        self.assertIsNone(med["error"])
        self.assertEqual(med["enlace"], "https://chatgpt.com/codex/settings/usage")

    def test_interpretar_rpc_codex_sin_credits(self) -> None:
        """Maneja una respuesta sin campo credits (caso §2.2)."""
        ahora = datetime(2026, 10, 7, 18, 5, tzinfo=timezone.utc)
        resultado = {
            "rateLimitsByLimitId": {
                "codex": {
                    "primary": {
                        "usedPercent": 50,
                        "windowDurationMins": 300,
                        "resetsAt": 1791349120,
                    }
                }
            }
        }

        medidores = interpretar_rpc(resultado, ahora)

        self.assertEqual(len(medidores), 1)
        med = medidores[0]
        self.assertEqual(med["saldo"], None)
        self.assertEqual(len(med["ventanas"]), 1)
        self.assertEqual(med["ventanas"][0]["usado_pct"], 50)

    def test_interpretar_rpc_limit_id_distinto_de_codex(self) -> None:
        """El limitId distinto de codex se convierte a id codex-<limitId>."""
        ahora = datetime(2026, 10, 7, 18, 5, tzinfo=timezone.utc)
        resultado = {
            "rateLimitsByLimitId": {
                "codex-premium": {
                    "primary": {
                        "usedPercent": 75,
                        "windowDurationMins": 60,
                        "resetsAt": 1791349120,
                    }
                }
            }
        }

        medidores = interpretar_rpc(resultado, ahora)

        self.assertEqual(len(medidores), 1)
        med = medidores[0]
        self.assertEqual(med["id"], "codex-premium")
        self.assertEqual(med["nombre"], "ChatGPT · Codex (codex-premium)")
        self.assertEqual(med["ventanas"][0]["id"], "60min")

    def test_interpretar_rpc_sin_rate_limits(self) -> None:
        """Devuelve lista vacía si falta rateLimitsByLimitId/rateLimits."""
        ahora = datetime(2026, 10, 7, 18, 5, tzinfo=timezone.utc)
        resultado = {"unotengo": "eso"}

        medidores = interpretar_rpc(resultado, ahora)

        self.assertEqual(len(medidores), 0)

    def test_interpretar_rpc_ventana_con_mas_de_24h(self) -> None:
        """La duración de ventana larga usa etiqueta '<n> min'."""
        ahora = datetime(2026, 10, 7, 18, 5, tzinfo=timezone.utc)
        resultado = {
            "rateLimitsByLimitId": {
                "codex": {
                    "primary": {
                        "usedPercent": 25,
                        "windowDurationMins": 1440,  # 24h
                        "resetsAt": 1791349120,
                    }
                }
            }
        }

        medidores = interpretar_rpc(resultado, ahora)

        self.assertEqual(len(medidores), 1)
        med = medidores[0]
        self.assertEqual(med["ventanas"][0]["etiqueta"], "1440 min")
        self.assertEqual(med["ventanas"][0]["id"], "1440min")

    def test_interpretar_rollout_ultimo_evento(self) -> None:
        """Devuelve el ÚLTIMO evento con rate_limits y alguna ventana no nula."""
        ahora = datetime(2026, 10, 7, 18, 5, tzinfo=timezone.utc)

        lineas = [
            json.dumps({"timestamp": 1791000000, "payload": {"rate_limits": {"limit_id": "codex"}}}),
            json.dumps({"timestamp": 1791100000, "payload": {"rate_limits": {"limit_id": "codex-premium"}}}),
            json.dumps({"timestamp": 1791200000, "payload": {"rate_limits": {"limit_id": "codex"}}}),
        ]

        medidores = interpretar_rollout(lineas, ahora)

        self.assertEqual(len(medidores), 0)

    def test_interpretar_rollout_sin_rate_limits(self) -> None:
        """Devuelve lista vacía si no hay rate_limits."""
        ahora = datetime(2026, 10, 7, 18, 5, tzinfo=timezone.utc)
        lineas = [
            json.dumps({"timestamp": 1791000000, "payload": {"otra": "cosa"}}),
            json.dumps({"timestamp": 1791100000}),
        ]

        medidores = interpretar_rollout(lineas, ahora)

        self.assertEqual(len(medidores), 0)

    def test_interpretar_rollout_linea_rotas(self) -> None:
        """Salta líneas rotas que no son JSON válido."""
        ahora = datetime(2026, 10, 7, 18, 5, tzinfo=timezone.utc)
        lineas = [
            "no soy un json",
            "",
            "{",
            json.dumps({"timestamp": 1791000000, "payload": {"rate_limits": {"primary": {"used_percent": 50, "window_minutes": 300, "resets_at": 1791349120}}}}),
            "}\n}\n",
        ]

        medidores = interpretar_rollout(lineas, ahora)

        self.assertEqual(len(medidores), 1)

    def test_interpretar_rollout_no_limit_id_usado_codex(self) -> None:
        """Si falta limit_id, se usa 'codex'."""
        ahora = datetime(2026, 10, 7, 18, 5, tzinfo=timezone.utc)
        lineas = [
            json.dumps({"timestamp": 1791000000, "payload": {"rate_limits": {"limit_id": "premium", "primary": {"used_percent": 50, "window_minutes": 300, "resets_at": 1791349120}}}}),
        ]

        medidores = interpretar_rollout(lineas, ahora)

        self.assertEqual(len(medidores), 1)
        self.assertEqual(medidores[0]["id"], "codex-premium")

    @patch("subprocess.Popen")
    def test_leer_ok(self, mock_popen: MagicMock) -> None:
        """lee exitosa sin respaldo."""
        mock_proc = MagicMock()
        mock_proc.stdout = MagicMock()
        mock_proc.stdin = MagicMock()
        mock_proc.poll.return_value = None
        mock_proc.terminate = MagicMock()
        mock_proc.wait = MagicMock()

        mock_proc.stdout.__iter__.return_value = iter([
            '{"id":1,"result":{"rateLimitsByLimitId":{"codex":{"primary":{"usedPercent":50,"windowDurationMins":300,"resetsAt":1791349120},"credits":{"balance":"10"}}}}}'
        ])

        mock_popen.return_value = mock_proc

        with patch("threading.Thread", lambda *args, **kwargs: None):
            with patch("pathlib.Path.rglob", return_value=[]):
                medidores = leer(
                    abrir=lambda *args, **kwargs: mock_proc,
                    home="/tmp",
                    tope_s=30
                )

        self.assertEqual(len(medidores), 1)
        self.assertEqual(medidores[0]["saldo"]["valor"], 10.0)

    @patch("subprocess.Popen")
    def test_leer_falla_proceso_y_fallback_rollout(self, mock_popen: MagicMock) -> None:
        """lee falla, usa respaldo de rollout-*.jsonl."""
        mock_proc = MagicMock()
        mock_proc.stdout = None
        mock_proc.stdin = None
        mock_proc.poll.return_value = 1

        mock_popen.side_effect = FileNotFoundError("codex no encontrado")

        with tempfile.TemporaryDirectory() as tmp:
            sesion_dir = Path(tmp) / ".codex" / "sessions" / "a" / "b" / "c"
            sesion_dir.mkdir(parents=True, exist_ok=True)

            rollout_path = sesion_path = sesion_dir / "rollout-2026-10-06.jsonl"
            rollout_path.write_text(
                json.dumps({"timestamp": 1791000000, "payload": {"rate_limits": {"limit_id": "codex", "primary": {"used_percent": 33.0, "window_minutes": 300, "resets_at": 1791349120}}}})
                + "\n"
            )

            medidores = leer(
                abrir=lambda *args, **kwargs: mock_proc,
                home=tmp,
                tope_s=30
            )

        self.assertEqual(len(medidores), 1)
        self.assertEqual(medidores[0]["nombre"], "ChatGPT · Codex")

    @patch("subprocess.Popen")
    def test_leer_error_proceso_sin_fallback(self, mock_popen: MagicMock) -> None:
        """Si falla el proceso y no hay rollout, devuelve error."""
        mock_popen.side_effect = FileNotFoundError("codex no encontrado")

        with patch("pathlib.Path.rglob", return_value=[]):
            medidores = leer(
                abrir=lambda *args, **kwargs: MagicMock(),
                home="/tmp",
                tope_s=30
            )

        self.assertEqual(len(medidores), 1)
        self.assertFalse(medidores[0]["ok"])
        self.assertTrue(medidores[0]["obsoleto"])
        self.assertIsInstance(medidores[0]["error"], str)


if __name__ == "__main__":
    unittest.main()
