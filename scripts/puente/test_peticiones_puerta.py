#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""GEN1113F · pruebas de peticiones_puerta.py: sin red, con puerta y bot de mentira, datos inventados."""
import datetime
import json
import os
import sys
import time
from unittest.mock import patch

sys.path.insert(0, os.path.dirname(__file__))

import peticiones_puerta as pp
import peticiones_telegram as pt
from puerta_datos_cliente import Puerta

DUENO = "11111111-2222-3333-4444-555555555555"
OTRA = "99999999-8888-7777-6666-555555555555"


class PuertaFalsa:
    """Registra lo que el puente manda y sirve las entradas que se le pongan."""

    def __init__(self):
        self.entradas, self.acuses, self.espejo, self.consultas = [], [], [], []
        self.acuse_ok = True

    def __call__(self, metodo, url, cabeceras, cuerpo=None, timeout=8):
        ruta = url.split("example.invalid", 1)[1]
        if ruta.startswith("/v1/genesis/chats/entrada"):
            self.consultas.append(ruta)
            return 200, {"entradas": list(self.entradas)}
        if ruta == "/v1/genesis/chats/acuse":
            if not self.acuse_ok:
                return 503, None
            self.acuses.append(cuerpo)
            return 200, {"ok": True}
        if ruta == "/v1/genesis/chats/espejo":
            self.espejo.extend(cuerpo["registros"])
            return 200, {"ok": True}
        return 404, None

    def finales(self):
        return [(a["id"], a["estado"]) for a in self.acuses if a["estado"] != "entregado"]


def entrada(i, texto="infografía de la última síntesis", cuenta=DUENO, rol="dueño", accion="texto",
            nonce=None, recibido=None, **extra):
    e = {"v": 1, "nonce": nonce or ("n%021d" % i), "t": "2026-11-13T10:00:00Z", "fuente": "puente:peticiones",
         "accion": accion, "id": i, "cuenta": cuenta, "rol": rol, "destino": "a1",
         "recibido": recibido or datetime.datetime.now(datetime.timezone.utc).isoformat()}
    if accion == "texto":
        e["texto"] = texto
    e.update(extra)
    return e


def montar(tmp_path, cuentas=True):
    """Puente con el módulo real del bot apuntando a una carpeta de prueba."""
    d = tmp_path / "peticiones"
    d.mkdir()
    if cuentas:
        (d / "cuentas.json").write_text(json.dumps({"duenos": [DUENO]}))
    (d / "estado.json").write_text(json.dumps({"offset": 77, "notebooklm": {"viva": True, "comprobada": "ayer"}}))
    for k, v in (("DIR", str(d)), ("COLA", str(d / "cola.json")), ("ESTADO", str(d / "estado.json"))):
        patcher = patch.object(pt, k, v)
        patcher.start()
        montar.parches.append(patcher)
    falsa = PuertaFalsa()
    puente = pp.Puente(pt, Puerta(url="https://example.invalid", ficha="ficha-de-prueba", http=falsa),
                       dormir=lambda s: None)
    return puente, falsa, d


montar.parches = []


def teardown_function(_):
    while montar.parches:
        montar.parches.pop().stop()


def vuelta(puente, falsa, *entradas):
    falsa.entradas = list(entradas)
    puente.una_vuelta()


def test_entrada_de_dueno_entra_en_la_cola_con_origen_genesis(tmp_path):
    puente, falsa, d = montar(tmp_path)
    vuelta(puente, falsa, entrada(5))
    cola = json.loads((d / "cola.json").read_text())
    assert len(cola) == 1 and cola[0]["origen"] == "genesis" and cola[0]["estado"] == "nueva"
    assert cola[0]["id"] == "g-5" and cola[0]["texto"] == "infografía de la última síntesis"
    assert falsa.finales() == [(5, "hecho")]
    assert "Recibido" in falsa.espejo[0]["texto"]
    assert puente.estado["desde"] == 5


def test_cuenta_fuera_de_la_lista_se_rechaza_y_no_corre_nada(tmp_path):
    puente, falsa, d = montar(tmp_path)
    vuelta(puente, falsa, entrada(1, cuenta=OTRA), entrada(2, rol="desarrollador"),
           entrada(3, accion="orden", orden={"nombre": "estado", "args": []}, cuenta=OTRA))
    assert falsa.finales() == [(1, "rechazado"), (2, "rechazado"), (3, "rechazado")]
    assert not (d / "cola.json").exists() and falsa.espejo == []


def test_sin_lista_de_cuentas_no_se_ejecuta_nada(tmp_path):
    puente, falsa, d = montar(tmp_path, cuentas=False)
    vuelta(puente, falsa, entrada(1))
    assert falsa.finales() == [(1, "rechazado")]
    assert "lista de cuentas" in falsa.acuses[-1]["detalle"]
    assert not (d / "cola.json").exists()


def test_estado_contesta_al_espejo_y_no_a_telegram(tmp_path):
    puente, falsa, d = montar(tmp_path)
    antes = (d / "estado.json").read_bytes()
    with patch.object(pt, "tg", side_effect=AssertionError("Telegram no debe usarse")), \
         patch.object(pt, "decir", side_effect=AssertionError("Telegram no debe usarse")):
        vuelta(puente, falsa, entrada(1, texto="/estado"),
               entrada(2, accion="orden", orden={"nombre": "estado", "args": []}),
               entrada(3, texto="/ayuda"))
    assert falsa.finales() == [(1, "hecho"), (2, "hecho"), (3, "hecho")]
    assert falsa.espejo[0]["texto"].startswith("Estado de MetaGenesis (A1):")
    assert falsa.espejo[2]["texto"] == pt.AYUDA
    assert (d / "estado.json").read_bytes() == antes     # el offset de Telegram no cambia
    assert not (d / "cola.json").exists()


def test_orden_que_cambia_algo_caduca_a_los_30_min(tmp_path):
    puente, falsa, _ = montar(tmp_path)
    vieja = (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(minutes=31)).isoformat()
    reciente = (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(minutes=5)).isoformat()
    vuelta(puente, falsa, entrada(1, accion="orden", orden={"nombre": "pausa", "args": []}, recibido=vieja),
           entrada(2, texto="/cancela", recibido="no es una fecha"),
           entrada(3, accion="orden", orden={"nombre": "sigue", "args": []}, recibido=reciente))
    assert falsa.finales() == [(1, "caducado"), (2, "caducado"), (3, "rechazado")]   # 3: la orden aún no existe aquí
    assert "no existe" in falsa.acuses[-1]["detalle"]


def test_un_mensaje_de_texto_viejo_no_caduca(tmp_path):
    puente, falsa, d = montar(tmp_path)
    vieja = (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(hours=3)).isoformat()
    vuelta(puente, falsa, entrada(1, recibido=vieja))
    assert falsa.finales() == [(1, "hecho")] and len(json.loads((d / "cola.json").read_text())) == 1


def test_forma_y_lista_blanca(tmp_path):
    puente, falsa, d = montar(tmp_path)
    vuelta(puente, falsa,
           entrada(1, destino="mac"), entrada(2, fuente="direccion"), entrada(3, nonce="corto"),
           entrada(4, texto="/borra-todo"), entrada(5, accion="orden", orden={"nombre": "rm", "args": []}),
           entrada(6, accion="orden", orden={"nombre": "estado", "args": ["x"] * 11}),
           entrada(7, texto="x" * 8001), entrada(8, texto="   "))
    assert [e for _, e in falsa.finales()] == ["rechazado"] * 8
    assert not (d / "cola.json").exists() and falsa.espejo == []


def test_nonce_repetido_no_se_ejecuta_dos_veces(tmp_path):
    puente, falsa, d = montar(tmp_path)
    vuelta(puente, falsa, entrada(1, nonce="a" * 22))
    vuelta(puente, falsa, entrada(2, nonce="a" * 22))
    assert len(json.loads((d / "cola.json").read_text())) == 1
    assert falsa.finales() == [(1, "hecho"), (2, "hecho")]
    assert len(falsa.espejo) == 1


def test_misma_entrada_reentregada_no_duplica_la_cola(tmp_path):
    puente, falsa, d = montar(tmp_path)
    vuelta(puente, falsa, entrada(9))
    puente.estado["vistos"].clear()                      # p. ej. se perdió el estado propio
    vuelta(puente, falsa, entrada(9))
    assert len(json.loads((d / "cola.json").read_text())) == 1


def test_si_no_se_puede_acusar_el_cursor_no_avanza(tmp_path):
    puente, falsa, _ = montar(tmp_path)
    falsa.acuse_ok = False
    falsa.entradas = [entrada(4)]
    try:
        puente.una_vuelta()
        assert False, "debía fallar"
    except RuntimeError:
        pass
    assert puente.estado.get("desde", 0) == 0
    falsa.acuse_ok = True
    puente.una_vuelta()                                   # se reintenta: sin duplicar
    assert puente.estado["desde"] == 4 and falsa.finales() == [(4, "hecho")]


def test_la_consulta_va_al_destino_a1_con_el_cursor(tmp_path):
    puente, falsa, _ = montar(tmp_path)
    vuelta(puente, falsa, entrada(12))
    vuelta(puente, falsa)
    assert "destino=a1" in falsa.consultas[0] and "desde=0" in falsa.consultas[0]
    assert "desde=12" in falsa.consultas[1]


def test_espejo_tacha_claves_y_manda_latido(tmp_path):
    puente, falsa, _ = montar(tmp_path)
    puente.subir_espejo("la clave sk-abcdefgh12345678 no debe salir")
    assert "sk-abcdefgh" not in falsa.espejo[0]["texto"] and falsa.espejo[0]["canal"] == "mando"
    llamadas = []
    puente._post = lambda ruta, cuerpo: llamadas.append(cuerpo) or True
    puente.vaciar(latido=True)
    assert llamadas[0]["latido"] is True and llamadas[0]["fuente"] == "puente:peticiones"


def test_respuestas_que_no_pudieron_subir_se_reintentan(tmp_path):
    puente, falsa, _ = montar(tmp_path)
    ok = puente._post
    puente._post = lambda ruta, cuerpo: False
    puente.subir_espejo("uno")
    assert len(puente.salida) == 1
    puente._post = ok
    puente.vaciar()
    assert puente.salida == [] and falsa.espejo[0]["texto"] == "uno"


def test_enganchar_manda_al_espejo_solo_lo_de_genesis(tmp_path):
    puente, falsa, _ = montar(tmp_path)
    mandados, archivos = [], []

    class Modulo:
        pass
    m = Modulo()
    m.__dict__.update({k: getattr(pt, k) for k in ("leer_json", "escribir_json", "log", "DIR", "TIPOS", "ENV")})
    m.decir = mandados.append
    m.enviar_resultado = lambda *a: archivos.append(a)
    m.atender = lambda p: (m.decir("respuesta"), m.enviar_resultado("audio", "/x/g-1-audio.m4a", "t"))
    m.main = lambda: None
    puerta = Puerta(url="https://example.invalid", ficha="ficha-de-prueba", http=falsa)
    with patch.object(pp.threading, "Thread"):
        pp.enganchar(m, puerta)
        m.main()
    m.atender({"id": "g-1", "origen": "genesis"})
    assert mandados == [] and archivos == []
    assert [r["texto"] for r in falsa.espejo] == ["respuesta", "Resumen en audio (podcast) listo en el A1: g-1-audio.m4a"]
    m.atender({"id": 7})                                  # una petición de Telegram sigue yendo a Telegram
    assert mandados == ["respuesta"] and len(archivos) == 1
    m.decir("aviso suelto")
    assert mandados[-1] == "aviso suelto"


def test_sin_ficha_el_bot_queda_como_hoy():
    assert os.environ.get(pp.VAR_FICHA) is None and pt.ENV.get(pp.VAR_FICHA) is None
    assert pt.main.__closure__ is None and pt.decir.__closure__ is None and pt.atender.__closure__ is None
    assert pt.enviar_resultado.__module__ == "peticiones_notebooklm"

    class Modulo:
        pass
    m, avisos = Modulo(), []
    m.log, m.ENV, m.decir = avisos.append, {}, "intacto"
    with patch.dict(os.environ, {pp.VAR_FICHA: "ficha-de-prueba"}, clear=False), \
         patch.object(pp.Puerta, "desde_entorno", return_value=Puerta(url="")):
        assert pp.enganchar(m) is None                    # ficha sin URL: no engancha nada
    assert m.decir == "intacto" and len(avisos) == 1 and "ficha" not in avisos[0]


def test_bucle_reintenta_con_espera_creciente(tmp_path):
    puente, _, _ = montar(tmp_path)
    esperas = []
    puente.dormir = esperas.append
    puente.una_vuelta = lambda: (_ for _ in ()).throw(RuntimeError("caída"))
    puente.vaciar = lambda latido=False: None
    parar = type("P", (), {"n": 0, "is_set": lambda s: (setattr(s, "n", s.n + 1) or s.n) > 6})()
    puente.bucle(parar)
    assert esperas == [2, 5, 15, 60, 60, 60]


def test_arranque_con_ficha_en_subproceso_no_toca_telegram(tmp_path):
    """Con la ficha puesta (sin URL), importar el bot no rompe y no engancha nada."""
    import subprocess
    env = dict(os.environ, HOME=str(tmp_path), STARSEED_PUERTA_FICHA_GENESIS_A1="ficha-de-prueba")
    env.pop("PUERTA_DATOS_URL", None)
    r = subprocess.run([sys.executable, "-c", "import peticiones_telegram as t; print(t.main.__closure__ is None)"],
                       cwd=os.path.dirname(__file__), env=env, capture_output=True, text=True, timeout=30)
    assert r.returncode == 0 and r.stdout.strip().endswith("True"), r.stderr[-300:]
    assert "ficha-de-prueba" not in r.stdout + r.stderr
