#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""DIS1126A-d1 · el canal de diseño deja de mandar ruido, habla de Maggasukha y
formatea para Telegram. Pruebas sin red."""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import peticiones_telegram as mod  # noqa: E402


def _preparar(monkeypatch, tmp_path):
    for k, v in (
        ("CHAT", "123456"),
        ("DIR", str(tmp_path)),
        ("COLA", str(tmp_path / "cola.json")),
        ("ESTADO", str(tmp_path / "estado.json")),
        ("PREFERENCIAS", str(tmp_path / "preferencias.json")),
        ("RUTINAS", str(tmp_path / "rutinas.json")),
        ("SALIDAS", str(tmp_path / "salidas")),
    ):
        monkeypatch.setattr(mod, k, v)


def test_formatear_para_telegram_quita_markdown_crudo():
    texto = "### Título\n- uno\n* dos\n**negrita** y `código`"
    assert mod.formatear_para_telegram(texto) == "▸ Título\n• uno\n• dos\nnegrita y código"


def test_firmar_pone_la_firma_del_canal_una_sola_vez():
    firmado = mod.firmar("Hola", "modelo-x")
    assert firmado.endswith("— Audiovisual y diseño · modelo-x")
    assert mod.firmar(firmado, "modelo-x") == firmado


def test_decir_envia_texto_sin_markdown_crudo(monkeypatch):
    enviados = []
    monkeypatch.setattr(mod, "tg", lambda m, d=None, timeout=70: enviados.append(d) or {"ok": True})
    monkeypatch.setattr(mod, "_registrar_mensaje_audiovisual", lambda *a, **k: None)
    mod.decir("### Título\n- uno")
    assert enviados[0]["text"] == "▸ Título\n• uno"


def test_drenar_ordenes_mac_solo_deja_registro_sin_ruido(monkeypatch, tmp_path):
    monkeypatch.setattr(mod, "ORDENES_MAC", str(tmp_path / "ordenes-mac.json"))
    mod.escribir_json(mod.ORDENES_MAC, [{"orden": "pausar_enjambre", "argumentos": {}}])
    dichos, registros = [], []
    monkeypatch.setattr(mod, "decir", lambda t, *a, **k: dichos.append(t))
    monkeypatch.setattr(mod, "log", lambda *a: registros.append(" ".join(map(str, a))))
    assert mod.drenar_ordenes_mac(enviar_fn=lambda p: {"ok": True}) == 1
    assert dichos == []
    assert any("Mac de vuelta" in r for r in registros)


def test_las_instrucciones_llaman_maggasukha_no_alex():
    assert "Maggasukha" in mod.INSTRUCCION
    assert "Alex escribe" not in mod.INSTRUCCION


def test_recibir_registra_tambien_los_comandos_en_el_canal(monkeypatch, tmp_path):
    _preparar(monkeypatch, tmp_path)
    monkeypatch.setattr(mod, "decir", lambda t, *a, **k: None)
    monkeypatch.setattr(mod, "texto_estado", lambda *a, **k: "estado")
    mod.recibir({"update_id": 1, "message": {"chat": {"id": "123456"}, "text": "/estado"}})
    log = (tmp_path / "audiovisual-sync.jsonl").read_text(encoding="utf-8")
    assert '"direccion": "entrante"' in log
    assert "/estado" in log
    assert (tmp_path / "mensajes_recibidos.log").exists()


def test_permiso_de_escritura_usa_la_cuenta_alex_docs(monkeypatch):
    alias_vistos = []

    def token_falso(alias="alex"):
        alias_vistos.append(alias)
        return "tok"

    class Respuesta:
        def read(self):
            return json.dumps({"scope": "https://www.googleapis.com/auth/drive.file"}).encode()

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

    monkeypatch.setattr(mod, "token_google", token_falso)
    monkeypatch.setattr(mod.urllib.request, "urlopen", lambda *a, **k: Respuesta())
    ok, _ = mod._permiso_escritura_drive()
    assert ok is True
    assert alias_vistos == ["alex-docs"]


def test_los_clientes_de_encargo_escriben_con_alex_docs(monkeypatch):
    monkeypatch.setattr(mod, "_permiso_escritura_drive", lambda: (True, "ok"))
    clientes = mod._clientes_de_encargo()
    assert clientes is not None
    _, drive_c = clientes
    monkeypatch.setattr(mod, "token_google", lambda alias="alex": "tok-" + alias)
    assert drive_c._token() == "tok-alex-docs"
