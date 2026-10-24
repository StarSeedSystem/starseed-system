"""Pruebas de interpretación Cloudroom: JSON simulado y ninguna llamada externa."""
import json
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


def test_execution_target_cloud_cuenta_y_ms():
    ms = int(datetime(2026, 10, 20, tzinfo=timezone.utc).timestamp() * 1000)
    viejo = int(datetime(2026, 9, 1, tzinfo=timezone.utc).timestamp() * 1000)
    hilos = {"threads": [
        {"executionTarget": "cloud", "machine": None, "machineId": None, "hostId": None,
         "createdAt": ms},
        {"executionTarget": "local", "machine": None, "createdAt": ms},
        {"executionTarget": "cloud", "machine": None, "createdAt": viejo},
    ]}
    medidor = M.interpretar('{"account":"ok","plan":null,"planUsage":null}', '{"count":9}',
                            hilos, AHORA)
    assert medidor["extras"]["agentes_nube_ciclo"] == 1
    assert medidor["ventanas"][0]["usado"] == 1
    assert medidor["extras"]["hilos_total"] == 9


def test_harnesses_aportan_agentes_y_modelos():
    estado = {"account": "ok", "plan": {"name": "Pro"}, "planUsage": {"used": 4, "total": 500},
              "harnesses": [
                  {"id": "codex", "model": "gpt-6-luna", "provider": "openai",
                   "models": [{"model": "gpt-6-luna", "reasoning_levels": ["low"]},
                              {"model": "gpt-5.6-terra"}]},
                  {"id": "claude-code", "provider": "anthropic",
                   "models": [{"model": "sonnet"}, {"model": "opus"}]},
              ]}
    medidor = M.interpretar(json.dumps(estado), '{"count":3}', '{"threads":[]}', AHORA)
    agentes = {a["harness"]: a for a in medidor["extras"]["agentes"]}
    assert agentes["codex"]["modelo"] == "gpt-6-luna"
    assert agentes["codex"]["modelos"] == ["gpt-6-luna", "gpt-5.6-terra"]
    assert agentes["claude-code"]["modelo"] == "sonnet"
    assert agentes["claude-code"]["modelos"] == ["sonnet", "opus"]


def test_lista_incluye_archivados_y_ocultos(monkeypatch):
    llamadas = []

    def falso(argumentos):
        llamadas.append(list(argumentos))
        if argumentos[0] == "cloud":
            return '{"account":"ok","plan":null}'
        if argumentos[:2] == ["thread", "count"]:
            return '{"count":7}'
        return '{"threads":[]}'

    monkeypatch.setattr(M, "disponible", lambda: True)
    monkeypatch.setattr(M, "_correr", falso)
    M.leer_medidor({}, AHORA)
    lista = [a for a in llamadas if a[:2] == ["thread", "list"]][0]
    assert "--include-archived" in lista
    assert "--include-hidden" in lista


def test_solo_conserva_los_otros_medidores():
    import medidores_credito as MC
    previo = {"medidores": {"claude": {"id": "claude"}, "codex": {"id": "codex"},
                            "oracle": {"id": "oracle"}},
              "historial": {"claude": [{"t": "2026-10-24T00:00:00Z", "v": {}}]}}
    doc = {"medidores": {"cloudroom": {"id": "cloudroom"}}, "historial": {}}
    doc = MC.conservar_otros(doc, previo)
    assert sorted(doc["medidores"]) == ["claude", "cloudroom", "codex", "oracle"]
    assert doc["historial"] == previo["historial"]


def test_binario_respeta_cloudroom_cli(tmp_path, monkeypatch):
    guion = tmp_path / "room-cli"
    guion.write_text("#!/bin/sh\nprintf '%s' '{\"ok\":1}'\n", encoding="utf-8")
    guion.chmod(0o755)
    monkeypatch.setenv("CLOUDROOM_CLI", str(guion))
    assert M.disponible() is True
    assert M._correr(["cloud", "status", "--json"]) == '{"ok":1}'
