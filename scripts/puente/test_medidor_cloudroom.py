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


def test_nube_por_execution_target_y_created_at_en_milisegundos():
    estado = '{"account":{"name":"cuenta"},"plan":null}'
    creado = int(datetime(2026, 10, 20, tzinfo=timezone.utc).timestamp() * 1000)
    hilos = [
        {"executionTarget": "cloud", "machine": None, "machineId": None, "hostId": None,
         "createdAt": creado, "archived": True},
        {"executionTarget": "cloud", "createdAt": creado + 1, "hidden": True},
        {"executionTarget": "cloud", "createdAt": creado + 2},
        {"executionTarget": "cloud", "createdAt": creado - 31 * 86400 * 1000},
        {"executionTarget": "local", "createdAt": creado},
    ]
    medidor = M.interpretar(estado, "{}", hilos, AHORA)
    assert medidor["extras"]["agentes_nube_ciclo"] == 3
    assert medidor["ventanas"][0]["usado"] == 3
    assert medidor["ventanas"][0]["total"] == 100


def test_harnesses_ensenan_sus_modelos_de_la_nube():
    estado = json.dumps({
        "account": {"name": "cuenta"}, "plan": None,
        "harnesses": [
            {"id": "codex", "model": "gpt-6-luna", "provider": "openai",
             "models": [{"model": "gpt-6-luna", "reasoning_levels": ["high"]},
                        {"model": "gpt-5.6-terra", "reasoning_levels": []}]},
            {"id": "claude-code", "model": "sonnet", "provider": "anthropic",
             "models": [{"model": "sonnet"}, {"model": "opus"}]},
        ]})
    medidor = M.interpretar(estado, "{}", [], AHORA)
    assert medidor["extras"]["agentes"] == [
        {"harness": "codex", "proveedor": "openai", "modelo": "gpt-6-luna",
         "modelos": ["gpt-6-luna", "gpt-5.6-terra"]},
        {"harness": "claude-code", "proveedor": "anthropic", "modelo": "sonnet",
         "modelos": ["sonnet", "opus"]},
    ]


def test_solo_conserva_los_otros_medidores():
    import medidores_credito as MC
    previo = {"medidores": {"claude": {"id": "claude", "ok": True},
                            "codex": {"id": "codex", "ok": True},
                            "oracle": {"id": "oracle", "ok": True}},
              "historial": {"claude": [{"t": "x", "v": {}}]}}
    doc = MC.recoger([{"id": "cloudroom", "tipo": "t"}], previo, AHORA,
                     adaptadores={"t": lambda cfg, ahora: {"id": "cloudroom", "ok": True}})
    MC._conservar_otros(doc, previo, {"cloudroom"})
    assert set(doc["medidores"]) == {"cloudroom", "claude", "codex", "oracle"}
    assert doc["medidores"]["claude"]["ok"] is True
    assert doc["historial"]["claude"] == [{"t": "x", "v": {}}]
    assert doc["medidores"]["cloudroom"]["ok"] is True


def test_lista_hilos_incluye_archivados_y_ocultos(monkeypatch):
    ordenes = []
    monkeypatch.setenv("CLOUDROOM_CLI", "/opt/falsa/room-cli")
    monkeypatch.setattr(M, "_correr", lambda orden: ordenes.append(list(orden)) or "{}")
    M.leer_medidor({}, AHORA)
    assert ["room-cli", "thread", "list", "--json", "--include-archived",
            "--include-hidden"] in ordenes


def test_correr_usa_la_ruta_de_la_cli_no_el_nombre_suelto(monkeypatch):
    llamadas = []

    class Resultado:
        returncode = 0
        stdout = '{"ok":true}'

    def falso_run(orden, **kwargs):
        llamadas.append(list(orden))
        return Resultado()

    monkeypatch.setenv("CLOUDROOM_CLI", "/opt/falsa/room-cli")
    monkeypatch.setattr(M.subprocess, "run", falso_run)
    assert M.disponible() is True
    assert M._correr(["room-cli", "cloud", "status", "--json"]) == '{"ok":true}'
    assert llamadas == [["/opt/falsa/room-cli", "cloud", "status", "--json"]]
