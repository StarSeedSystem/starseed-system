#!/usr/bin/env python3
"""
Pruebas del servicio Chatterbox local (VOZ1024C) — sin red exterior, sin GPU y sin modelo.

Levantan el servidor HTTP DE VERDAD en un puerto libre de 127.0.0.1, en un hilo, y le hablan con
urllib (sin proxy) con el mismo contrato que `src/lib/aurora/tts-oss/chatterbox.ts`: salud sin
paquete, 503, 400 por cuerpo malo, generación con el motor simulado, tiempo máximo, CORS y Host.
Funciones sueltas sin fixtures: valen para pytest y para `run_tests.py`.
"""

import base64
import contextlib
import io
import json
import os
import sys
import threading
import time
import types
import urllib.error
import urllib.request
import wave

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import servidor as S  # noqa: E402

MEMORIA_SOBRADA = {"libre_mb": 64000.0, "presion": 1}


def _memoria(libre=64000.0, presion=1):
    return lambda: {"libre_mb": libre, "presion": presion}


@contextlib.contextmanager
def levantar(servicio):
    """Servidor real en 127.0.0.1:<libre> en un hilo; se para y se cierra al salir."""
    srv = S.crear_servidor(servicio, puerto=0, registrar=False)
    hilo = threading.Thread(target=srv.serve_forever, kwargs={"poll_interval": 0.05}, daemon=True)
    hilo.start()
    try:
        yield f"http://127.0.0.1:{srv.server_address[1]}", srv
    finally:
        srv.shutdown()
        srv.server_close()
        hilo.join(timeout=5)


_SIN_PROXY = urllib.request.build_opener(urllib.request.ProxyHandler({}))


def pedir(base, metodo, ruta, cuerpo=None, cabeceras=None, crudo=None, timeout=10):
    """(código, cabeceras, json|None). `cuerpo` va como JSON; `crudo` tal cual."""
    datos = crudo if crudo is not None else (json.dumps(cuerpo).encode("utf-8") if cuerpo is not None else None)
    h = {"Content-Type": "application/json"} if cuerpo is not None else {}
    h.update(cabeceras or {})
    req = urllib.request.Request(base + ruta, data=datos, method=metodo, headers=h)
    try:
        with _SIN_PROXY.open(req, timeout=timeout) as r:
            texto = r.read()
            codigo, cab = r.status, r.headers
    except urllib.error.HTTPError as e:
        texto = e.read()
        codigo, cab = e.code, e.headers
    try:
        js = json.loads(texto.decode("utf-8")) if texto else None
    except ValueError:
        js = None
    return codigo, cab, js


def _sin_paquete():
    """El motor real, con la búsqueda del paquete diciendo que no está (no depende de esta máquina)."""
    return S.MotorChatterbox(buscar_paquete=lambda nombre: None)


# ── Salud ────────────────────────────────────────────────────────────────────


def test_escucha_solo_en_loopback():
    with levantar(S.ServicioChatterbox(S.MotorSimulado())) as (base, srv):
        assert srv.server_address[0] == "127.0.0.1"
        assert S.HOST == "127.0.0.1"
        assert S.PUERTO_DEFECTO == 4505  # CHATTERBOX_LOCAL_BASE del cliente


def test_salud_sin_paquete_dice_que_no_y_por_que():
    servicio = S.ServicioChatterbox(_sin_paquete(), medir_memoria=_memoria())
    with levantar(servicio) as (base, _):
        codigo, cab, js = pedir(base, "GET", "/salud")
    assert codigo == 503
    assert cab.get("Content-Type", "").startswith("application/json")
    assert js["disponible"] is False
    assert "no está instalado" in js["motivo"]
    assert js["estado"] == "no-disponible"
    assert isinstance(js["dispositivo"], str) and js["dispositivo"] in ("cpu", "mps", "cuda")
    assert js["modelos_cargados"] == []
    assert js["descarga_de_pesos"] == "nunca automática"


def test_salud_con_motor_simulado_cumple_el_contrato_del_cliente():
    with levantar(S.ServicioChatterbox(S.MotorSimulado())) as (base, _):
        codigo, _, js = pedir(base, "GET", "/salud")
    assert codigo == 200
    assert js["disponible"] is True and js["motivo"] is None
    assert isinstance(js["dispositivo"], str)  # lo que mira saludLocalChatterbox
    assert js["motor"] == "simulado" and js["marca_agua_perth"] is False  # nunca se hace pasar por voz
    assert "es" in js["idiomas"] and len(js["idiomas"]) == 23
    assert js["limites"]["texto_max"] == S.TEXTO_MAX


def test_la_carpeta_homonima_no_cuenta_como_paquete():
    # Desde native/astraura-voice, «chatterbox» es ESTA carpeta (espacio de nombres, sin __init__).
    espacio = types.SimpleNamespace(origin=None, submodule_search_locations=[S.CARPETA])
    ok, motivo = S.MotorChatterbox(buscar_paquete=lambda n: espacio).instalado()
    assert ok is False and "no está instalado" in motivo
    propio = types.SimpleNamespace(origin=os.path.join(S.CARPETA, "__init__.py"), submodule_search_locations=[S.CARPETA])
    assert S.MotorChatterbox(buscar_paquete=lambda n: propio).instalado()[0] is False


def test_paquete_instalado_sin_multilingue_lo_dice():
    import tempfile
    with tempfile.TemporaryDirectory() as d:
        carpeta = os.path.join(d, "chatterbox")
        os.makedirs(carpeta)
        open(os.path.join(carpeta, "__init__.py"), "w").close()
        spec = types.SimpleNamespace(origin=os.path.join(carpeta, "__init__.py"), submodule_search_locations=[carpeta])
        motor = S.MotorChatterbox(buscar_paquete=lambda n: spec)
        ok, motivo = motor.instalado()
        assert ok is False and "multilingüe" in motivo
        open(os.path.join(carpeta, "mtl_tts.py"), "w").close()
        assert motor.instalado() == (True, "")


def test_salud_sin_memoria_o_con_presion_no_carga():
    motor = S.MotorSimulado()
    motor.necesita_memoria = True
    sin_ram = S.ServicioChatterbox(motor, medir_memoria=_memoria(libre=300.0), memoria_min_mb=2500)
    codigo, js = sin_ram.salud()
    assert codigo == 503 and "no cabe en memoria" in js["motivo"] and "300 MB" in js["motivo"]
    assert js["memoria"]["necesita_mb"] == 2500
    con_presion = S.ServicioChatterbox(motor, medir_memoria=_memoria(libre=9000.0, presion=2))
    codigo, js = con_presion.salud()
    assert codigo == 503 and "presión 2" in js["motivo"]
    sin_medida = S.ServicioChatterbox(motor, medir_memoria=lambda: {"libre_mb": None, "presion": None})
    assert sin_medida.salud()[0] == 200  # lo que no se pudo medir no bloquea


# ── Generar: 503, 400 y simulado ─────────────────────────────────────────────


def test_generar_sin_paquete_503_sin_colgarse():
    servicio = S.ServicioChatterbox(_sin_paquete(), medir_memoria=_memoria())
    with levantar(servicio) as (base, _):
        t0 = time.monotonic()
        codigo, cab, js = pedir(base, "POST", "/generar", {"texto": "Hola, soy Aurora.", "idioma": "es"})
        tardo = time.monotonic() - t0
    assert codigo == 503 and tardo < 2.0
    assert js["disponible"] is False and "no está instalado" in js["motivo"]
    assert "audio_base64" not in js
    assert cab.get("Retry-After") == "60"


def test_generar_400_por_cuerpo_malo():
    with levantar(S.ServicioChatterbox(S.MotorSimulado())) as (base, _):
        malos = [
            dict(crudo=b"{no es json", cabeceras={"Content-Type": "application/json"}),
            dict(crudo=b"\xff\xfe\x00", cabeceras={"Content-Type": "application/json"}),
            dict(cuerpo=["texto"]),
            dict(cuerpo={}),
            dict(cuerpo={"texto": "   "}),
            dict(cuerpo={"texto": 42}),
            dict(cuerpo={"texto": "Hola", "idioma": "xx"}),
            dict(cuerpo={"texto": "Hola", "idioma": 5}),
            dict(cuerpo={"texto": "Hola", "exageracion": "alta"}),
            dict(cuerpo={"texto": "Hola", "exageracion": True}),
            dict(cuerpo={"texto": "Hola", "exageracion": 3.5}),
            dict(cuerpo={"texto": "Hola", "cfg_weight": -0.1}),
            dict(cuerpo={"texto": "Hola", "referencia_voz": "voz.wav"}),
        ]
        for caso in malos:
            codigo, _, js = pedir(base, "POST", "/generar", **caso)
            assert codigo == 400, (caso, codigo, js)
            assert js["error"] == "peticion" and js["motivo"]
        codigo, _, js = pedir(base, "POST", "/generar", crudo=b'{"texto":"Hola"}', cabeceras={"Content-Type": "text/plain"})
        assert codigo == 415
        codigo, _, js = pedir(base, "POST", "/generar", {"texto": "a" * (S.TEXTO_MAX + 1)})
        assert codigo == 413 and str(S.TEXTO_MAX) in js["motivo"]
        codigo, _, _ = pedir(base, "POST", "/generar", crudo=b"x" * (S.CUERPO_MAX_BYTES + 1),
                             cabeceras={"Content-Type": "application/json"})
        assert codigo == 413
        # El servicio sigue vivo tras todo eso.
        assert pedir(base, "GET", "/salud")[0] == 200


def test_generar_con_motor_simulado_devuelve_wav_riff():
    motor = S.MotorSimulado()
    with levantar(S.ServicioChatterbox(motor)) as (base, _):
        # El cuerpo EXACTO que manda sintetizarLocal (texto, idioma, exageracion, cfg_weight).
        codigo, cab, js = pedir(base, "POST", "/generar",
                                {"texto": "Hola, soy Aurora.", "idioma": "es", "exageracion": 0.65, "cfg_weight": 0.3})
    assert codigo == 200, js
    assert cab.get("Content-Type", "").startswith("application/json")
    audio = base64.b64decode(js["audio_base64"])
    assert audio[:4] == b"RIFF" and audio[8:12] == b"WAVE" and len(audio) > 44
    with wave.open(io.BytesIO(audio)) as w:
        assert w.getnchannels() == 1 and w.getsampwidth() == 2
        assert w.getframerate() == js["frecuencia_hz"] == 16000
        assert w.getnframes() > 0
        assert abs(w.getnframes() / w.getframerate() - js["duracion_s"]) < 0.01
    assert isinstance(js["factor_tiempo_real"], (int, float)) and js["factor_tiempo_real"] >= 0
    assert js["marca_agua_perth"] is False and js["motor"] == "simulado"
    assert motor.llamadas == [{"texto": "Hola, soy Aurora.", "idioma": "es", "exageracion": 0.65, "cfg_weight": 0.3}]
    assert motor.cargado() is True  # carga perezosa en la primera petición


def test_generar_normaliza_idioma_y_usa_valores_por_defecto():
    motor = S.MotorSimulado()
    with levantar(S.ServicioChatterbox(motor)) as (base, _):
        codigo, _, js = pedir(base, "POST", "/generar", {"texto": "  Hello world  ", "idioma": "en-US"})
        assert codigo == 200 and js["idioma"] == "en"
        codigo, _, js = pedir(base, "POST", "/generar", {"texto": "Hola mundo"})
        assert codigo == 200 and js["idioma"] == "es"
    assert motor.llamadas[0] == {"texto": "Hello world", "idioma": "en", "exageracion": 0.5, "cfg_weight": 0.5}


def test_factor_tiempo_real_es_proceso_entre_audio():
    tic = {"t": 100.0}

    class MotorLento(S.MotorSimulado):
        def generar(self, *a):
            tic["t"] += 0.5  # medio segundo de proceso
            return [0.0] * 16000, 16000  # un segundo de audio

    servicio = S.ServicioChatterbox(MotorLento(), reloj=lambda: tic["t"])
    codigo, js = servicio.generar(b'{"texto":"Hola"}', "application/json")
    assert codigo == 200
    assert js["duracion_s"] == 1.0 and js["factor_tiempo_real"] == 0.5


def test_audio_vacio_nunca_es_un_200():
    class MotorMudo(S.MotorSimulado):
        def generar(self, *a):
            return [], 16000

    codigo, js = S.ServicioChatterbox(MotorMudo()).generar(b'{"texto":"Hola"}', "application/json")
    assert codigo == 500 and "vacío" in js["motivo"]


def test_fallo_de_carga_503_sin_descargar_y_salud_lo_recuerda():
    assert os.environ.get("HF_HUB_OFFLINE") == "1"  # nunca descarga pesos por su cuenta

    class LocalEntryNotFoundError(Exception):
        pass

    class MotorSinPesos(S.MotorSimulado):
        def cargar(self):
            raise LocalEntryNotFoundError("Cannot find the requested files in the local cache")

    servicio = S.ServicioChatterbox(MotorSinPesos())
    codigo, js = servicio.generar(b'{"texto":"Hola"}', "application/json")
    assert codigo == 503 and js["disponible"] is False and "caché local" in js["motivo"]
    codigo, salud = servicio.salud()
    assert codigo == 503 and "caché local" in salud["motivo"]


def test_error_del_motor_500_sin_rutas_personales():
    casa = os.path.expanduser("~")

    class MotorRoto(S.MotorSimulado):
        def generar(self, *a):
            raise RuntimeError(f"fallo leyendo {casa}/modelos/x.bin")

    codigo, js = S.ServicioChatterbox(MotorRoto()).generar(b'{"texto":"Hola"}', "application/json")
    assert codigo == 500 and "RuntimeError" in js["motivo"]
    assert casa not in js["motivo"] and "~/modelos" in js["motivo"]


def test_tiempo_maximo_504_y_ocupado_503_sin_colgarse():
    soltar = threading.Event()

    class MotorAtascado(S.MotorSimulado):
        def generar(self, *a):
            soltar.wait(10)
            return [0.0] * 1600, 16000

    servicio = S.ServicioChatterbox(MotorAtascado(), tiempo_max_s=0.4, espera_turno_s=0.2)
    try:
        with levantar(servicio) as (base, _):
            t0 = time.monotonic()
            codigo, _, js = pedir(base, "POST", "/generar", {"texto": "Hola"})
            assert codigo == 504 and js["error"] == "tiempo" and time.monotonic() - t0 < 3
            t1 = time.monotonic()
            codigo, cab, js = pedir(base, "POST", "/generar", {"texto": "Otra"})
            assert codigo == 503 and js["error"] == "ocupado" and time.monotonic() - t1 < 3
            assert cab.get("Retry-After") == "5"
            codigo, _, salud = pedir(base, "GET", "/salud")
            assert codigo == 200 and salud["ocupado"] is True  # la salud responde aunque sintetice
            soltar.set()
            for _ in range(50):  # el hilo atascado termina y devuelve el turno
                if not pedir(base, "GET", "/salud")[2]["ocupado"]:
                    break
                time.sleep(0.05)
            codigo, _, js = pedir(base, "POST", "/generar", {"texto": "Ya"})
            assert codigo == 200 and base64.b64decode(js["audio_base64"])[:4] == b"RIFF"
    finally:
        soltar.set()


# ── CORS, Host y rutas ───────────────────────────────────────────────────────


def test_cors_preflight_de_origen_permitido():
    with levantar(S.ServicioChatterbox(S.MotorSimulado())) as (base, _):
        for origen in ("http://localhost:9002", "https://starseed-os.vercel.app"):
            codigo, cab, _ = pedir(base, "OPTIONS", "/generar", cabeceras={
                "Origin": origen,
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type",
                "Access-Control-Request-Private-Network": "true",
            })
            assert codigo == 204
            assert cab.get("Access-Control-Allow-Origin") == origen
            assert "Content-Type" in cab.get("Access-Control-Allow-Headers", "")
            assert "POST" in cab.get("Access-Control-Allow-Methods", "")
            assert cab.get("Access-Control-Allow-Private-Network") == "true"
            assert cab.get("Access-Control-Allow-Credentials") is None
        codigo, cab, js = pedir(base, "GET", "/salud", cabeceras={"Origin": "http://127.0.0.1:9002"})
        assert codigo == 200 and cab.get("Access-Control-Allow-Origin") == "http://127.0.0.1:9002"


def test_origen_ajeno_y_host_ajeno_403():
    with levantar(S.ServicioChatterbox(S.MotorSimulado())) as (base, _):
        for origen in ("https://evil.example", "https://starseed-os.vercel.app.evil.com", "http://starseed-os.vercel.app"):
            codigo, cab, js = pedir(base, "POST", "/generar", {"texto": "Hola"}, cabeceras={"Origin": origen})
            assert codigo == 403 and js is None and cab.get("Access-Control-Allow-Origin") is None
        # «DNS rebinding»: la página ajena llega con su propio Host.
        codigo, _, _ = pedir(base, "GET", "/salud", cabeceras={"Host": "evil.example:4505"})
        assert codigo == 403
        assert pedir(base, "GET", "/salud", cabeceras={"Host": "localhost:4505"})[0] == 200


def test_rutas_y_metodos():
    with levantar(S.ServicioChatterbox(S.MotorSimulado())) as (base, _):
        assert pedir(base, "GET", "/nada")[0] == 404
        assert pedir(base, "GET", "/generar")[0] == 405
        assert pedir(base, "POST", "/salud", {"texto": "x"})[0] == 405
        assert pedir(base, "POST", "/generar/stream", {"texto": "x"})[0] == 404
        assert pedir(base, "DELETE", "/salud")[0] == 405
        assert pedir(base, "GET", "/salud/")[0] == 200


def test_origen_permitido_misma_lista_que_el_demonio():
    si = ["http://localhost:3000", "http://127.0.0.1:9002", "http://[::1]:9002", "https://starseed-os.vercel.app",
          "https://starseed-os.com", "https://app.starseed-os.com", "https://x-alexbordongarrigos-projects.vercel.app"]
    no = [None, "", "null", "https://evil.example", "http://starseed-os.com", "https://starseed-os.com.evil.io",
          "http://localhost:abc", "ftp://localhost"]
    assert all(S.origen_permitido(o) for o in si)
    assert not any(S.origen_permitido(o) for o in no)


# ── Inactividad, audio y argumentos ──────────────────────────────────────────


def test_descarga_por_inactividad_y_nunca_a_mitad():
    tic = {"t": 0.0}
    motor = S.MotorSimulado()
    servicio = S.ServicioChatterbox(motor, inactividad_s=300, reloj=lambda: tic["t"])
    assert servicio.generar(b'{"texto":"Hola"}', "application/json")[0] == 200
    assert motor.cargado() and servicio.salud()[1]["modelos_cargados"] == ["simulado"]
    tic["t"] += 299
    assert servicio.descargar_si_inactivo() is False and motor.cargado()
    tic["t"] += 2
    servicio._turno.acquire()  # una síntesis en curso: no se descarga
    try:
        assert servicio.descargar_si_inactivo() is False and motor.cargado()
    finally:
        servicio._turno.release()
    assert servicio.descargar_si_inactivo() is True and not motor.cargado()
    assert servicio.salud()[1]["modelos_cargados"] == []


def test_pcm16_acota_y_limpia():
    pcm = S.pcm16_desde([[0.0, 1.0], [-1.0, 2.0, float("nan")]])
    from array import array
    a = array("h")
    a.frombytes(pcm)
    if sys.byteorder == "big":
        a.byteswap()
    assert list(a) == [0, 32767, -32767, 32767, 0]
    wav = S.wav_desde_pcm16(pcm, 24000)
    assert wav[:4] == b"RIFF" and len(wav) == 44 + len(pcm)


def test_dispositivo_previsto_sin_torch():
    assert S.detectar_dispositivo() in ("cpu", "mps", "cuda")
    assert S.MotorChatterbox(buscar_paquete=lambda n: None).dispositivo()[1] is False  # previsto, no medido


def test_argumentos_puerto_por_argumento_o_4505():
    previo = os.environ.pop("CHATTERBOX_PORT", None)
    try:
        assert S.analizar_argumentos([]).puerto == 4505
        assert S.analizar_argumentos(["4600"]).puerto == 4600
        assert S.analizar_argumentos(["--puerto", "4601"]).puerto == 4601
        a = S.analizar_argumentos(["--simulado", "--texto-max", "200", "--tiempo-max", "20"])
        assert a.simulado and a.texto_max == 200 and a.tiempo_max == 20.0
        os.environ["CHATTERBOX_PORT"] = "4602"
        assert S.analizar_argumentos([]).puerto == 4602
    finally:
        os.environ.pop("CHATTERBOX_PORT", None)
        if previo is not None:
            os.environ["CHATTERBOX_PORT"] = previo


def test_main_con_puerto_ocupado_sale_con_1():
    with levantar(S.ServicioChatterbox(S.MotorSimulado())) as (base, srv):
        puerto = srv.server_address[1]
        assert S.main([str(puerto), "--simulado"]) == 1
