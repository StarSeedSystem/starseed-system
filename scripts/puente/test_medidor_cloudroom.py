"""Pruebas de interpretación Cloudroom: JSON simulado y ninguna llamada externa."""
from datetime import datetime, timezone

import medidor_cloudroom as M

AHORA = datetime(2026, 10, 24, tzinfo=timezone.utc)


def test_cupo_publicado_y_hilos_nube_del_ciclo():
    estado = '{"account":{"name":"cuenta"},"plan":null,"planUsage":null}'
    hilos = [
        {"machine": "cloud", "createdAt": "2026-10-20T00:00:00Z", "harness": "codex", "model": "gpt-x"},
        {"machine": "cloud", "createdAt": "2026-10-22T00:00:00Z", "harness": "claude-code", "model": "sonnet"},
        {"machine": "local", "createdAt": "2026-10-22T00:00:00Z", "harness": "pi", "model": "local"},
        {"machine": "cloud", "createdAt": "2026-09-20T00:00:00Z", "harness": "pi", "model": "old"},
    ]
    medidor = M.interpretar(estado, '{"count":12}', hilos, AHORA)
    assert medidor["id"] == "cloudroom"
    assert medidor["plan"] == "gratis"
    assert medidor["ventanas"][0]["usado"] == 2
    assert medidor["ventanas"][0]["total"] == 100
    assert "sin dato de la API" in medidor["fuente"]
    assert medidor["ventanas"][1]["etiqueta"] == "Agentes locales: sin límite"
    assert medidor["extras"]["agentes"] == [
        {"harness": "codex", "modelo": "gpt-x"}, {"harness": "claude-code", "modelo": "sonnet"}]


def test_uso_de_plan_y_json_envuelto():
    medidor = M.interpretar(
        '{"data":{"account":"ok","plan":{"name":"Pro"},"planUsage":{"used":8,"total":500}}}',
        '{"data":{"count":31}}', '{"data":{"threads":[]}}', AHORA)
    assert medidor["plan"] == "Pro"
    assert medidor["ventanas"][0]["usado"] == 8
    assert medidor["ventanas"][0]["total"] == 500
    assert medidor["fuente"] == "API Cloudroom"
    assert medidor["extras"]["hilos_total"] == 31


def test_sin_estado_no_inventa_cupo():
    medidor = M.interpretar("no es JSON", "{}", "[]", AHORA)
    assert medidor["ok"] is False
    assert medidor["ventanas"] == [{"id": "local", "etiqueta": "Agentes locales: sin límite",
                                    "usado_pct": 0, "reinicia": None}]
    assert medidor["error"]


def test_crm1024h_nube_por_execution_target_en_ms_y_modelos_de_harnesses():
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
    assert m["ventanas"][0]["usado"] == 2 and m["ventanas"][0]["total"] == 100
    assert m["extras"]["agentes"][0] == {"harness": "codex", "modelo": "gpt-6-astra",
                                          "modelos": ["gpt-6-luna", "gpt-5.6-terra"]}


def test_crm1024h_ruta_de_la_cli_fuera_del_path():
    assert M.ruta_cli({"CLOUDROOM_CLI": "/x/room-cli"}, existe=lambda p: p == "/x/room-cli",
                      buscar=lambda n: None) == "/x/room-cli"
    assert M.ruta_cli({}, existe=lambda p: False, buscar=lambda n: None) is None
