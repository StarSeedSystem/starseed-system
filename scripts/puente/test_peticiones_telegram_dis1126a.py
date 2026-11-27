"""DIS1126A: «Sí» tras una pregunta, condición, modo conjunto, sin ruido, nombre, formato y reflejo."""
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import peticiones_telegram as mod  # noqa: E402


def _aislar(monkeypatch, tmp_path):
    dichos, cola = [], []
    for nombre in ("CONVERSACION", "CONDICIONES", "COLA", "DIR"):
        monkeypatch.setattr(mod, nombre, str(tmp_path / nombre.lower()) if nombre != "DIR" else str(tmp_path))
    monkeypatch.setattr(mod, "decir", lambda t, *a, **k: dichos.append(t))
    monkeypatch.setattr(mod, "_hfa_aprobaciones", lambda: {})
    monkeypatch.setattr(mod, "_hfa_propuestas", lambda: [{"id": "a1", "proyecto": "paz"}, {"id": "b2", "proyecto": "os"}])
    return dichos


def test_si_ejecuta_la_pregunta_abierta(monkeypatch, tmp_path):
    dichos = _aislar(monkeypatch, tmp_path)
    mod._recordar_pregunta_abierta("Resumen.\n¿Quieres que despleguemos el primer caso?", "idea")
    assert mod._atender_respuesta_corta("Si", 7) is True
    cola = mod.leer_json(mod.COLA, [])
    assert cola and "despleguemos el primer caso" in cola[-1]["texto"]
    assert cola[-1]["plan"]["tipo"] == "respuesta" and not dichos


def test_si_sin_pregunta_pide_aclarar(monkeypatch, tmp_path):
    dichos = _aislar(monkeypatch, tmp_path)
    assert mod._atender_respuesta_corta("sí", 8) is True
    assert "Maggasukha" in dichos[0] and not mod.leer_json(mod.COLA, [])


def test_no_y_texto_largo(monkeypatch, tmp_path):
    dichos = _aislar(monkeypatch, tmp_path)
    mod._recordar_pregunta_abierta("¿Seguimos?", "x")
    assert mod._atender_respuesta_corta("no", 9) is True and "Lo dejo" in dichos[0]
    assert mod._atender_respuesta_corta("haz un informe de la síntesis", 10) is False


def test_numero_elige_la_opcion(monkeypatch, tmp_path):
    _aislar(monkeypatch, tmp_path)
    mod._recordar_pregunta_abierta("Opciones:\n1. Infografía\n2. Audio\n¿Cuál?", "x")
    mod._atender_respuesta_corta("2", 11)
    assert "Opción elegida: Audio" in mod.leer_json(mod.COLA, [])[-1]["texto"]


def test_condicion_se_guarda_como_condicion(monkeypatch, tmp_path):
    _aislar(monkeypatch, tmp_path)
    texto = "Envíame antes la idea, propósito, visión, misión y storyboards para cada caso"
    assert mod._COND.search(texto)
    assert mod._guardar_condicion(texto) == 2
    assert mod.leer_json(mod.CONDICIONES, [])[0]["texto"].startswith("Envíame antes")


def test_modo_conjunto_un_caso_por_mensaje(monkeypatch, tmp_path):
    dichos = _aislar(monkeypatch, tmp_path)
    assert mod._CONJUNTO.search("Desarrolla todo y envíame todo descriptivamente por este canal para desarrollarlo juntos")
    monkeypatch.setattr(mod, "llm", lambda m, n=0: ("• idea", "modelo-x"))
    monkeypatch.setattr(mod.threading, "Thread",
                        lambda target, args, daemon: type("T", (), {"start": lambda s: target(*args)})())
    mod._iniciar_conjunto("x", 1)
    assert "Caso 1 de 2" in dichos[0] and "Audiovisual y diseño · modelo-x" in dichos[0]
    assert mod._avanzar_conjunto("Aprobado, sigue") is True
    assert "Caso 2 de 2" in dichos[1]
    assert mod._avanzar_conjunto("ok") is True and "Decisiones registradas" in dichos[2]
    assert mod._avanzar_conjunto("hola") is False


def test_sin_ruido_de_mac_de_vuelta(monkeypatch, tmp_path):
    dichos = _aislar(monkeypatch, tmp_path)
    monkeypatch.setattr(mod, "ORDENES_MAC", str(tmp_path / "ordenes.json"))
    mod.escribir_json(mod.ORDENES_MAC, [{"orden": "x"}])
    assert mod.drenar_ordenes_mac(enviar_fn=lambda p: {"ok": True}) == 1
    assert dichos == []


def test_nombre_y_formato_telegram():
    t = mod._para_telegram("### Plan\nAlex, mira **esto**\n* uno\n- dos")
    assert "###" not in t and "**" not in t and "Alex" not in t
    assert t.startswith("Plan") and "Maggasukha" in t and "• uno" in t and "• dos" in t


def test_decir_firma_y_refleja(monkeypatch):
    enviados, reflejados = [], []
    monkeypatch.setattr(mod, "tg", lambda m, d=None, t=0: enviados.append(d["text"]) or {"ok": True})
    monkeypatch.setattr(mod, "_registrar_mensaje_audiovisual", lambda *a, **k: None)
    monkeypatch.setattr(mod, "_reflejar_en_mac", lambda d, t: reflejados.append((d, t)))
    mod.decir("Hola Alex", "gemini")
    assert enviados[0].endswith("— Audiovisual y diseño · gemini") and "Maggasukha" in enviados[0]
    assert reflejados and reflejados[0][0] == "saliente"
    assert time.time() > 0
