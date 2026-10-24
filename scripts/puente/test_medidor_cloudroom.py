"""Pruebas de interpretación Cloudroom: JSON simulado y ninguna llamada externa."""
import json
import os
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


def test_crm1024h_ruta_de_launchd_cuando_la_cli_no_esta_en_el_path():
    """RTCRM1024Hb: launchd no trae room-cli en el PATH; se busca en ~/.local/bin."""
    local = os.path.expanduser("~/.local/bin/room-cli")
    assert M.ruta_cli({}, existe=lambda p: p == local, buscar=lambda n: None) == local


def test_harnesses_ensenan_sus_modelos_de_la_nube():
    """RTCRM1024H: varios harnesses a la vez, cada uno lista sus modelos disponibles."""
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
    # (RTCRM1024H) la rama archivada pedía también "proveedor" por agente; main no lo emite y
    # el proveedor del medidor queda en la estructura de medidores_credito (§4.1), no por agente.
    assert medidor["extras"]["agentes"] == [
        {"harness": "codex", "modelo": "gpt-6-luna", "modelos": ["gpt-6-luna", "gpt-5.6-terra"]},
        {"harness": "claude-code", "modelo": "sonnet", "modelos": ["sonnet", "opus"]},
    ]


def test_solo_conserva_los_otros_medidores():
    """RTCRM1024H: con --solo los medidores que no se volvieron a leer no se pierden."""
    import medidores_credito as MC
    previo = {"version": 1, "t": "antes",
              "medidores": {"claude": {"id": "claude", "ok": True},
                            "codex": {"id": "codex", "ok": True},
                            "oracle": {"id": "oracle", "ok": True}},
              "historial": {"claude": [{"t": "x", "v": {}}]}}
    doc = MC.recoger([{"id": "cloudroom", "tipo": "t"}], previo, AHORA,
                     adaptadores={"t": lambda cfg, ahora: {"id": "cloudroom", "ok": True}})
    resultado = MC.fusionar_solo(previo, doc, {"cloudroom"})
    assert set(resultado["medidores"]) == {"cloudroom", "claude", "codex", "oracle"}
    assert resultado["medidores"]["claude"] == {"id": "claude", "ok": True}
    assert resultado["historial"]["claude"] == [{"t": "x", "v": {}}]
    assert resultado["medidores"]["cloudroom"]["ok"] is True


def test_lista_hilos_incluye_archivados_y_ocultos(monkeypatch):
    """RTCRM1024H: leer_medidor pide hilos archivados y ocultos (también gastaron ciclo)."""
    ordenes = []
    monkeypatch.setenv("CLOUDROOM_CLI", "/opt/falsa/room-cli")
    monkeypatch.setattr(M, "ruta_cli", lambda: "/opt/falsa/room-cli")
    monkeypatch.setattr(M, "_correr", lambda orden: ordenes.append(list(orden)) or "{}")
    M.leer_medidor({}, AHORA)
    assert ["/opt/falsa/room-cli", "thread", "list", "--json",
            "--include-archived", "--include-hidden"] in ordenes
    assert ["/opt/falsa/room-cli", "cloud", "status", "--json"] in ordenes


def test_correr_usa_la_ruta_de_la_cli_no_el_nombre_suelto(monkeypatch):
    """RTCRM1024H: disponible() honra CLOUDROOM_CLI y _correr pasa la orden verbatim."""
    llamadas = []

    class Resultado:
        returncode = 0
        stdout = '{"ok":true}'

    def falso_run(orden, **kwargs):
        llamadas.append(list(orden))
        return Resultado()

    import os
    monkeypatch.setenv("CLOUDROOM_CLI", "/opt/falsa/room-cli")
    # (medidor_cloudroom importa `os` dentro de ruta_cli; el parche va al módulo `os` real)
    monkeypatch.setattr("os.path.exists", lambda p: p == "/opt/falsa/room-cli")
    monkeypatch.setattr(M.subprocess, "run", falso_run)
    assert M.disponible() is True
    assert M._correr(["/opt/falsa/room-cli", "cloud", "status", "--json"]) == '{"ok":true}'
    assert llamadas == [["/opt/falsa/room-cli", "cloud", "status", "--json"]]
