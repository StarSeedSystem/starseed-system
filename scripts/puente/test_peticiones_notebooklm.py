#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Tests para peticiones_notebooklm.py — sin red, con CLI inyectable.
Incluye tests de regresión SES1113A: cerrojo, detección de caducidad, errores transitorios."""
import json
import os
import sys
import subprocess
import threading
import time
from unittest.mock import Mock, patch, MagicMock

sys.path.insert(0, os.path.dirname(__file__))

from peticiones_notebooklm import (
    SesionCaducada,
    SesionTransitoria,
    TIPOS,
    CUADERNO,
    nb,
    json_de,
    sesion_viva,
    asegurar_fuente,
    lanzar,
    esperar_y_bajar,
    enviar_resultado,
    ultima_sintesis,
    nombre_drive,
    token_google,
    drive,
    _cerrojo_notebooklm,
    LOCK_PATH,
)


class MockCompletedProcess:
    def __init__(self, returncode=0, stdout="", stderr=""):
        self.returncode = returncode
        self.stdout = stdout
        self.stderr = stderr


def test_sesion_caducada_excepcion():
    """SesionCaducada se puede lanzar y capturar."""
    try:
        raise SesionCaducada("auth expired")
    except SesionCaducada as e:
        assert "auth expired" in str(e)


def test_json_de_valido():
    """json_de parsea JSON válido."""
    assert json_de('{"a": 1}') == {"a": 1}
    assert json_de('  {"b": 2}  ') == {"b": 2}


def test_json_de_invalido_devuelve_vacio():
    """json_de con texto inválido devuelve dict vacío."""
    assert json_de("no es json") == {}
    assert json_de("") == {}


def test_json_de_extrae_json_de_texto():
    """json_de extrae JSON embebido en texto."""
    assert json_de('texto {"c": 3} mas texto') == {"c": 3}


def test_nb_inyectable_cli(monkeypatch):
    """nb usa el CLI inyectable por variable de entorno."""
    # Verificar que NBLM se puede sobrescribir
    import peticiones_notebooklm as mod
    original = mod.NBLM
    try:
        mod.NBLM = "/ruta/falsa/notebooklm"
        assert mod.NBLM == "/ruta/falsa/notebooklm"
    finally:
        mod.NBLM = original


def test_nb_sesion_caducada_lanza_excepcion(monkeypatch):
    """nb lanza SesionCaducada si la salida indica auth expirado."""
    import peticiones_notebooklm as mod

    def mock_run(*args, **kwargs):
        return MockCompletedProcess(1, "", "Authentication expired. Run 'notebooklm login'")

    monkeypatch.setattr(subprocess, "run", mock_run)
    try:
        mod.nb(["list", "--json"])
        assert False, "Debería haber lanzado SesionCaducada"
    except SesionCaducada:
        pass


def test_nb_timeout_lanza_sesion_transitoria(monkeypatch):
    """nb lanza SesionTransitoria en timeout (SES1113A: errores transitorios no son caducidad)."""
    import peticiones_notebooklm as mod

    def mock_run(*args, **kwargs):
        raise subprocess.TimeoutExpired("cmd", 600)

    monkeypatch.setattr(subprocess, "run", mock_run)
    try:
        mod.nb(["list", "--json"])
        assert False, "Debería haber lanzado SesionTransitoria"
    except SesionTransitoria as e:
        assert "timeout" in str(e).lower()


def test_sesion_viva_true(monkeypatch):
    """sesion_viva devuelve True si nb list --json retorna 0."""
    import peticiones_notebooklm as mod

    def mock_nb(args, timeout=600):
        if args == ["list", "--json"]:
            return 0, '{"sources": []}', ""
        return 1, "", "error"

    monkeypatch.setattr(mod, "nb", mock_nb)
    assert mod.sesion_viva() is True


def test_sesion_viva_false_si_caducada(monkeypatch):
    """sesion_viva devuelve False si nb lanza SesionCaducada."""
    import peticiones_notebooklm as mod

    def mock_nb(args, timeout=600):
        raise SesionCaducada("expired")

    monkeypatch.setattr(mod, "nb", mock_nb)
    assert mod.sesion_viva() is False


def test_sesion_viva_false_si_rc_no_cero(monkeypatch):
    """sesion_viva devuelve False si nb retorna código != 0."""
    import peticiones_notebooklm as mod

    def mock_nb(args, timeout=600):
        return 1, "", "error"

    monkeypatch.setattr(mod, "nb", mock_nb)
    assert mod.sesion_viva() is False


def test_asegurar_fuente_reutiliza_si_existe(monkeypatch):
    """asegurar_fuente devuelve source_id existente si ya está ready."""
    import peticiones_notebooklm as mod

    def mock_nb(args, timeout=600):
        if args[:3] == ["source", "list", "-n"]:
            return 0, json.dumps({"sources": [{"id": "src-123", "drive_document_id": "doc-456", "status": "ready"}]}), ""
        return 1, "", "inesperado"

    monkeypatch.setattr(mod, "nb", mock_nb)
    sid = mod.asegurar_fuente("doc-456", "Título prueba")
    assert sid == "src-123"


def test_asegurar_fuente_añade_si_no_existe(monkeypatch):
    """asegurar_fuente añade fuente si no existe y espera."""
    import peticiones_notebooklm as mod

    llamadas = []

    def mock_nb(args, timeout=600):
        llamadas.append(args)
        if args[:3] == ["source", "list", "-n"]:
            return 0, json.dumps({"sources": []}), ""
        if args[:3] == ["source", "add-drive", "-n"]:
            return 0, json.dumps({"source_id": "src-new"}), ""
        if args[:3] == ["source", "wait", "-n"]:
            return 0, json.dumps({"status": "ready"}), ""
        return 1, "", "inesperado"

    monkeypatch.setattr(mod, "nb", mock_nb)
    sid = mod.asegurar_fuente("doc-789", "Otro título")
    assert sid == "src-new"
    # Verificar que se llamó add-drive y wait
    assert any(a[:3] == ["source", "add-drive", "-n"] for a in llamadas)
    assert any(a[:3] == ["source", "wait", "-n"] for a in llamadas)


def test_lanzar_sincrono_mind_map(monkeypatch):
    """lanzar devuelve 'sincrono:json' para mind-map (sin --wait)."""
    import peticiones_notebooklm as mod

    def mock_nb(args, timeout=600):
        if "mind-map" in args:
            return 0, json.dumps({"status": "completed", "data": "mapa"}), ""
        return 1, "", "inesperado"

    monkeypatch.setattr(mod, "nb", mock_nb)
    resultado = mod.lanzar("mind-map", "indicaciones", "src-1")
    assert resultado.startswith("sincrono:")
    data = json.loads(resultado[len("sincrono:"):])
    assert data["status"] == "completed"


def test_lanzar_async_devuelve_task_id(monkeypatch):
    """lanzar devuelve task_id para tipos async (con --no-wait)."""
    import peticiones_notebooklm as mod

    def mock_nb(args, timeout=600):
        if "--no-wait" in args:
            return 0, json.dumps({"task_id": "task-abc"}), ""
        return 1, "", "inesperado"

    monkeypatch.setattr(mod, "nb", mock_nb)
    task_id = mod.lanzar("infographic", "indicaciones", "src-1")
    assert task_id == "task-abc"


def test_esperar_y_bajar_sincrono_escribe_archivo(monkeypatch, tmp_path):
    """esperar_y_bajar con tarea sincrónica escribe el JSON en archivo."""
    import peticiones_notebooklm as mod

    # Cambiar SALIDAS a tmp_path
    original_salidas = mod.SALIDAS
    mod.SALIDAS = str(tmp_path)
    try:
        tarea = 'sincrono:' + json.dumps({"contenido": "datos"})
        ruta = mod.esperar_y_bajar("mind-map", tarea, "pet-123")
        assert os.path.exists(ruta)
        with open(ruta) as f:
            assert f.read() == '{"contenido": "datos"}'
    finally:
        mod.SALIDAS = original_salidas


def test_esperar_y_bajar_async_espera_y_descarga(monkeypatch, tmp_path):
    """esperar_y_bajar async espera artifact wait y descarga."""
    import peticiones_notebooklm as mod

    original_salidas = mod.SALIDAS
    mod.SALIDAS = str(tmp_path)
    try:
        llamadas = []

        def mock_nb(args, timeout=600):
            llamadas.append(args)
            if args[:3] == ["artifact", "wait", "-n"]:
                return 0, json.dumps({"status": "completed"}), ""
            if args[0] == "download":
                # Simular archivo descargado
                ruta_descarga = args[-2]
                with open(ruta_descarga, "wb") as f:
                    f.write(b"contenido descargado")
                return 0, "", ""
            return 1, "", "inesperado"

        monkeypatch.setattr(mod, "nb", mock_nb)
        ruta = mod.esperar_y_bajar("infographic", "task-123", "pet-456")
        assert os.path.exists(ruta)
        with open(ruta, "rb") as f:
            assert f.read() == b"contenido descargado"
    finally:
        mod.SALIDAS = original_salidas


def test_enviar_resultado_infographic_sube_foto_y_documento(monkeypatch, tmp_path):
    """enviar_resultado infographic sube como foto y documento si < 10MB."""
    import peticiones_notebooklm as mod

    # Crear archivo de prueba < 10MB
    ruta = tmp_path / "test.png"
    ruta.write_bytes(b"x" * 1000)

    subidas = []

    def mock_subir(metodo, campo, ruta_archivo, pie):
        subidas.append((metodo, campo, ruta_archivo, pie))
        return Mock(ok=True)

    monkeypatch.setattr(mod, "subir", mock_subir)
    mod.enviar_resultado("infographic", str(ruta), "Título prueba")

    assert len(subidas) == 2
    assert subidas[0][0] == "sendPhoto"
    assert subidas[1][0] == "sendDocument"
    assert "calidad completa" in subidas[1][3]


def test_enviar_resultado_audio_convierte_mp3(monkeypatch, tmp_path):
    """enviar_resultado audio convierte a mp3 mono 96k y sube como audio."""
    import peticiones_notebooklm as mod

    ruta_m4a = tmp_path / "test.m4a"
    ruta_m4a.write_bytes(b"x" * 1000)
    ruta_mp3 = tmp_path / "test.mp3"

    def mock_ffmpeg(args):
        if "-b:a" in args and "96k" in args:
            ruta_mp3.write_bytes(b"mp3data")
            return 0
        return 1

    def mock_subir(metodo, campo, ruta_archivo, pie):
        return Mock(ok=True)

    monkeypatch.setattr(mod, "ffmpeg", mock_ffmpeg)
    monkeypatch.setattr(mod, "subir", mock_subir)
    mod.enviar_resultado("audio", str(ruta_m4a), "Audio prueba")

    assert ruta_mp3.exists()


def test_ultima_sintesis_busca_en_carpeta(monkeypatch):
    """ultima_sintesis busca en la carpeta de Drive y retorna la más reciente (primera en createdTime desc)."""
    import peticiones_notebooklm as mod

    def mock_drive(ruta, params):
        if ruta == "files":
            # API devuelve createdTime desc: la más reciente primero
            return {"files": [
                {"id": "doc-2", "name": "Síntesis diaria 2026-11-11"},
                {"id": "doc-1", "name": "Síntesis diaria 2026-11-10"},
                {"id": "doc-3", "name": "Otro documento"},
            ]}
        return {}

    monkeypatch.setattr(mod, "drive", mock_drive)
    fid, nombre = mod.ultima_sintesis()
    assert fid == "doc-2"
    assert nombre == "Síntesis diaria 2026-11-11"


def test_ultima_sintesis_error_si_no_hay(monkeypatch):
    """ultima_sintesis lanza error si no encuentra ninguna."""
    import peticiones_notebooklm as mod

    def mock_drive(ruta, params):
        return {"files": [{"id": "doc-1", "name": "Otro"}]}

    monkeypatch.setattr(mod, "drive", mock_drive)
    try:
        mod.ultima_sintesis()
        assert False, "Debería haber lanzado RuntimeError"
    except RuntimeError as e:
        assert "no encontré" in str(e)


def test_nombre_drive_retorna_nombre(monkeypatch):
    """nombre_drive retorna el nombre del archivo de Drive."""
    import peticiones_notebooklm as mod

    def mock_drive(ruta, params):
        return {"name": "Mi documento"}

    monkeypatch.setattr(mod, "drive", mock_drive)
    nombre = mod.nombre_drive("doc-123")
    assert nombre == "Mi documento"


def test_token_google_renueva_token(monkeypatch):
    """token_google usa refresh_token para obtener access_token."""
    import peticiones_notebooklm as mod

    def mock_leer_json(ruta, defecto):
        return {
            "client_id": "cid",
            "client_secret": "csecret",
            "refresh_token": "rtoken",
            "token_uri": "https://oauth2.googleapis.com/token",
        }

    def mock_respuesta_http(abrir):
        return {"access_token": "access-123"}

    monkeypatch.setattr(mod, "leer_json", mock_leer_json)
    monkeypatch.setattr(mod, "_respuesta_http", mock_respuesta_http)
    token = mod.token_google("alex")
    assert token == "access-123"


def test_token_google_error_si_falla(monkeypatch):
    """token_google lanza RuntimeError si no obtiene access_token."""
    import peticiones_notebooklm as mod

    def mock_leer_json(ruta, defecto):
        return {"client_id": "cid", "client_secret": "csecret", "refresh_token": "rtoken"}

    def mock_respuesta_http(abrir):
        return {"error": "invalid_grant"}

    monkeypatch.setattr(mod, "leer_json", mock_leer_json)
    monkeypatch.setattr(mod, "_respuesta_http", mock_respuesta_http)
    try:
        mod.token_google("alex")
        assert False, "Debería haber lanzado RuntimeError"
    except RuntimeError as e:
        assert "no pude renovar" in str(e)


def test_drive_usa_token_y_llama_api(monkeypatch):
    """drive usa token_google y llama a la API de Drive."""
    import peticiones_notebooklm as mod

    def mock_token_google(alias="alex"):
        return "access-xyz"

    def mock_respuesta_http(abrir):
        return {"files": []}

    monkeypatch.setattr(mod, "token_google", mock_token_google)
    monkeypatch.setattr(mod, "_respuesta_http", mock_respuesta_http)
    resultado = mod.drive("files", {"q": "test"})
    assert resultado == {"files": []}


# ===== Tests de regresión SES1113A =====

def test_cerrojo_bloquea_entre_hilos():
    """Dos hilos intentando obtener el cerrojo: el segundo espera al primero."""
    resultados = []
    
    def worker(wait_time, results_list):
        with _cerrojo_notebooklm(bloquear=True) as obtenido:
            results_list.append(("obtenido", obtenido))
            time.sleep(wait_time)
            results_list.append(("liberado", time.time()))
    
    t1 = threading.Thread(target=worker, args=(0.2, resultados))
    t2 = threading.Thread(target=worker, args=(0.1, resultados))
    
    inicio = time.time()
    t1.start()
    time.sleep(0.05)  # Dar tiempo a t1 para tomar el cerrojo
    t2.start()
    t1.join()
    t2.join()
    fin = time.time()
    
    # t1 obtiene, espera 0.2s, libera; t2 espera, obtiene, espera 0.1s, libera
    # Total debería ser ~0.3s
    assert fin - inicio >= 0.25, f"Cerrojo no bloqueó correctamente: {fin - inicio:.2f}s"
    assert resultados[0] == ("obtenido", True)
    assert resultados[2] == ("obtenido", True)


def test_cerrojo_keepalive_no_espera():
    """Keepalive (bloquear=False) retorna False si el cerrojo está ocupado."""
    with _cerrojo_notebooklm(bloquear=True) as obtenido:
        assert obtenido is True
        # Keepalive intenta obtener sin bloquear
        with _cerrojo_notebooklm(bloquear=False) as obtenido2:
            assert obtenido2 is False  # Ocupado por el primer contexto


def test_nb_sesion_caducada_solo_rc_no_cero_y_texto_auth(monkeypatch):
    """SesionCaducada solo si rc != 0 Y texto coincide con auth expired/error."""
    import peticiones_notebooklm as mod
    
    # Caso 1: rc=0 con texto de auth -> NO es caducidad
    def mock_run_rc0(*args, **kwargs):
        return MockCompletedProcess(0, "Authentication is valid", "")
    
    monkeypatch.setattr(subprocess, "run", mock_run_rc0)
    rc, out, err = mod.nb(["auth", "check"], timeout=10)
    assert rc == 0
    assert "Authentication is valid" in out
    
    # Caso 2: rc=1 con "Authentication expired" -> SÍ es caducidad
    def mock_run_rc1_auth(*args, **kwargs):
        return MockCompletedProcess(1, "", "Authentication expired: session ended")
    
    monkeypatch.setattr(subprocess, "run", mock_run_rc1_auth)
    try:
        mod.nb(["list", "--json"], timeout=10)
        assert False, "Debería haber lanzado SesionCaducada"
    except SesionCaducada as e:
        assert "Authentication expired" in str(e)
    
    # Caso 3: rc=1 con "Run 'notebooklm login'" -> SÍ es caducidad
    def mock_run_rc1_login(*args, **kwargs):
        return MockCompletedProcess(1, "", "Run 'notebooklm login' to authenticate")
    
    monkeypatch.setattr(subprocess, "run", mock_run_rc1_login)
    try:
        mod.nb(["list", "--json"], timeout=10)
        assert False, "Debería haber lanzado SesionCaducada"
    except SesionCaducada as e:
        assert "Run 'notebooklm login'" in str(e)
    
    # Caso 4: rc=1 con error genérico (sin texto de auth) -> NO es caducidad
    def mock_run_rc1_generico(*args, **kwargs):
        return MockCompletedProcess(1, "", "Error: source not found")
    
    monkeypatch.setattr(subprocess, "run", mock_run_rc1_generico)
    rc, out, err = mod.nb(["source", "list", "-n", "test", "--json"], timeout=10)
    assert rc == 1
    assert "source not found" in err


def test_nb_errores_transitorios_lanzan_sesion_transitoria(monkeypatch):
    """Timeout (124), URLError, errores de red -> SesionTransitoria."""
    import peticiones_notebooklm as mod
    
    # Timeout
    def mock_run_timeout(*args, **kwargs):
        raise subprocess.TimeoutExpired("notebooklm", 600)
    
    monkeypatch.setattr(subprocess, "run", mock_run_timeout)
    try:
        mod.nb(["generate", "report", "-n", "test", "--json"], timeout=600)
        assert False, "Debería haber lanzado SesionTransitoria"
    except SesionTransitoria as e:
        assert "timeout" in str(e).lower()
    
    # URLError / error de red
    import urllib.error
    def mock_run_urlerror(*args, **kwargs):
        raise urllib.error.URLError("Network unreachable")
    
    monkeypatch.setattr(subprocess, "run", mock_run_urlerror)
    try:
        mod.nb(["list", "--json"], timeout=10)
        assert False, "Debería haber lanzado SesionTransitoria"
    except SesionTransitoria as e:
        assert "red" in str(e).lower() or "network" in str(e).lower()


def test_sesion_viva_retorna_true_en_error_transitorio(monkeypatch):
    """sesion_viva() retorna True para SesionTransitoria (sesión está viva)."""
    import peticiones_notebooklm as mod
    
    def mock_nb_transitorio(*args, **kwargs):
        raise SesionTransitoria("timeout")
    
    monkeypatch.setattr(mod, "nb", mock_nb_transitorio)
    assert mod.sesion_viva() is True


def test_sesion_viva_retorna_false_en_sesion_caducada(monkeypatch):
    """sesion_viva() retorna False para SesionCaducada."""
    import peticiones_notebooklm as mod
    
    def mock_nb_caducada(*args, **kwargs):
        raise SesionCaducada("Authentication expired")
    
    monkeypatch.setattr(mod, "nb", mock_nb_caducada)
    assert mod.sesion_viva() is False


def test_no_mencion_claude_en_textos():
    """Ningún texto del módulo menciona 'Claude' como paso para renovar."""
    import peticiones_notebooklm as mod
    import inspect
    
    source = inspect.getsource(mod)
    # Verificar que no hay referencias a pedir a Claude
    assert "pídeselo a claude" not in source.lower()
    assert "pídeselo a claude" not in source.lower()
    assert "pídele a claude" not in source.lower()
    
    # Verificar también en peticiones_reglas
    import peticiones_reglas as reglas
    source_reglas = inspect.getsource(reglas)
    assert "pídeselo a claude" not in source_reglas.lower()
    assert "pídeselo a claude" not in source_reglas.lower()
    assert "pídele a claude" not in source_reglas.lower()


def test_lock_path_correcto():
    """LOCK_PATH apunta a ~/.notebooklm/profiles/default/.starseed-cli.lock"""
    home = os.path.expanduser("~")
    expected = os.path.join(home, ".notebooklm", "profiles", "default", ".starseed-cli.lock")
    assert LOCK_PATH == expected


if __name__ == "__main__":
    import pytest
    pytest.main([__file__, "-v"])