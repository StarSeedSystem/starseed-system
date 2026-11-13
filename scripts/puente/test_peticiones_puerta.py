#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""GEN1113F · pruebas de peticiones_puerta.py: sin red, con puerta y bot de mentira, datos inventados.

GEN1114D: las entradas llegan firmadas (v:2) por un aparato emparejado, con claves de prueba creadas aquí. La
verificación es la de `genesis_firma_logica` (GEN1114B); si ese módulo aún no está en el checkout, las pruebas que
firman se saltan y lo dicen (el resto sigue corriendo)."""
import base64
import datetime
import hashlib
import json
import os
import sys
import time
from unittest.mock import patch

import pytest

sys.path.insert(0, os.path.dirname(__file__))

import peticiones_puerta as pp
import peticiones_telegram as pt
from puerta_datos_cliente import Puerta

try:
    import genesis_firma_logica as L
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import ec
    from cryptography.hazmat.primitives.asymmetric.utils import decode_dss_signature
except ImportError:
    L = None

requiere_firma = pytest.mark.skipif(L is None, reason="falta genesis_firma_logica (GEN1114B) o cryptography")

DUENO = "11111111-2222-3333-4444-555555555555"
OTRA = "99999999-8888-7777-6666-555555555555"
# chat-a1.json del puente B, sacado del canon.json de ejemplo de §8.3 (usuarios de bot inventados)
CHAT_B = {"v": 1, "id": "telegram.ejemplo_b_bot", "nombre": "Bot B de ejemplo",
          "alias": ["puente:peticiones", "peticiones", "Peticiones y encargos"]}
CHAT_A = ("telegram.ejemplo_a_bot", "Bot A de ejemplo")


def _b64(b):
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


class Aparato:
    """Una clave P-256 de prueba, como la de WebCrypto: firma r‖s de 64 bytes sobre los bytes de la carga."""

    def __init__(self, cuenta=DUENO, nivel="completo", nombre="Móvil de prueba"):
        self.clave = ec.generate_private_key(ec.SECP256R1())
        self.spki = self.clave.public_key().public_bytes(serialization.Encoding.DER,
                                                         serialization.PublicFormat.SubjectPublicKeyInfo)
        self.huella = hashlib.sha256(self.spki).hexdigest()
        self.cuenta, self.nivel, self.nombre = cuenta, nivel, nombre
        self.seq = 0

    def alta(self):
        return {"huella": self.huella, "spki": _b64(self.spki), "cuenta": self.cuenta, "nombre": self.nombre,
                "plataforma": "navegador", "nivel": self.nivel, "alta": "2026-11-13T00:00:00Z"}

    def firmar(self, datos):
        r, s = decode_dss_signature(self.clave.sign(datos, ec.ECDSA(hashes.SHA256())))
        return _b64(r.to_bytes(32, "big") + s.to_bytes(32, "big"))


def _iso(t):
    return datetime.datetime.fromtimestamp(t, datetime.timezone.utc).isoformat().replace("+00:00", "Z")


def firmada(i, ap, texto="infografía de la última síntesis", accion="texto", nonce=None, seq=None, hace_s=0,
            recibido=None, cuenta_puerta=None, rol="dueño", carga_extra=None, firmante=None, cambiar_byte=False,
            **extra_entrada):
    """EntradaRecibida v2 tal como la entrega la puerta (§5.2): {id, cuenta, rol, destino, recibido, v, carga, …}."""
    ahora = time.time() - hace_s
    if seq is None:
        ap.seq += 1
        seq = ap.seq
    entrada = {"v": 1, "nonce": nonce or ("n%021d" % (i * 1000 + seq)), "t": _iso(ahora),
               "fuente": "puente:peticiones", "accion": accion}
    if accion == "texto":
        entrada["texto"] = texto
    entrada.update(extra_entrada)
    carga = {"aud": "starseed.genesis.chats.v1", "cuenta": ap.cuenta, "aparato": ap.huella, "seq": seq,
             "t": _iso(ahora), "caduca": _iso(ahora + 25 * 60), "destino": "a1", "chat": CHAT_B["id"],
             "chatNombre": CHAT_B["nombre"], "entrada": entrada}
    carga.update(carga_extra or {})
    datos = json.dumps(carga, ensure_ascii=False).encode("utf-8")
    firma = (firmante or ap).firmar(datos)
    if cambiar_byte:
        datos = datos.replace(b'"seq": %d,' % seq, b'"seq": %d,' % (seq + 1000))   # un cambio por el camino
    return {"id": i, "cuenta": cuenta_puerta or ap.cuenta, "rol": rol, "destino": "a1",
            "recibido": recibido or _iso(time.time()), "v": 2, "carga": _b64(datos), "firma": firma,
            "aparato": ap.huella}


def entrada_v1(i, cuenta=DUENO, texto="infografía de la última síntesis"):
    """Una entrada de GEN1113, sin firma."""
    return {"v": 1, "nonce": "n%021d" % i, "t": "2026-11-13T10:00:00Z", "fuente": "puente:peticiones",
            "accion": "texto", "texto": texto, "id": i, "cuenta": cuenta, "rol": "dueño", "destino": "a1",
            "recibido": datetime.datetime.now(datetime.timezone.utc).isoformat()}


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

    def detalles(self):
        return [a.get("detalle", "") for a in self.acuses if a["estado"] != "entregado"]


def _privado(ruta, datos):
    ruta.write_text(json.dumps(datos))
    os.chmod(ruta, 0o600)


def montar(tmp_path, cuentas=True, aparatos=(), retirados=None, chat=True):
    """Puente con el módulo real del bot apuntando a una carpeta de prueba."""
    d = tmp_path / "peticiones"
    d.mkdir()
    if cuentas:
        _privado(d / "cuentas.json", {"duenos": [DUENO]})   # (GEN1113INT) la lista solo vale con permisos 600
    if aparatos is not None:
        _privado(d / "aparatos.json", {"v": 1, "aparatos": [a.alta() for a in aparatos]})
    if retirados:
        _privado(d / "aparatos-retirados.json", {"v": 1, "retirados": [
            {"huella": a.huella, "t": "2026-11-13T00:00:00Z", "por": "mac"} for a in retirados]})
    if chat:
        _privado(d / "chat-a1.json", CHAT_B)
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


def cola_de(d):
    return json.loads((d / "cola.json").read_text()) if (d / "cola.json").exists() else []


# ── GEN1113F (adaptadas a GEN1114D: ahora llegan firmadas) ────────────────────

@requiere_firma
def test_entrada_de_dueno_entra_en_la_cola_con_origen_genesis(tmp_path):
    ap = Aparato()
    puente, falsa, d = montar(tmp_path, aparatos=[ap])
    vuelta(puente, falsa, firmada(5, ap))
    cola = cola_de(d)
    assert len(cola) == 1 and cola[0]["origen"] == "genesis" and cola[0]["estado"] == "nueva"
    assert cola[0]["id"] == "g-5" and cola[0]["texto"] == "infografía de la última síntesis"
    assert falsa.finales() == [(5, "hecho")]
    assert "Recibido" in falsa.espejo[0]["texto"]
    assert puente.estado["desde"] == 5
    # §3.5 paso 9: aparato:seq y cuenta:nonce anotados antes de ejecutar, en un vistos.json 600
    vistos = json.loads((d / "vistos.json").read_text())
    assert len(vistos) == 2 and oct(os.stat(d / "vistos.json").st_mode & 0o777) == "0o600"


@requiere_firma
def test_cuenta_fuera_de_la_lista_se_rechaza_y_no_corre_nada(tmp_path):
    otro = Aparato(cuenta=OTRA)                       # emparejado, pero su cuenta no es dueña en el A1
    ap = Aparato()
    puente, falsa, d = montar(tmp_path, aparatos=[otro, ap])
    vuelta(puente, falsa, firmada(1, otro), firmada(2, ap, rol="desarrollador"),
           firmada(3, otro, accion="orden", orden={"nombre": "estado", "args": []}))
    assert falsa.finales() == [(1, "rechazado"), (2, "rechazado"), (3, "rechazado")]
    assert cola_de(d) == [] and falsa.espejo == []


@requiere_firma
def test_sin_lista_de_cuentas_no_se_ejecuta_nada(tmp_path):
    ap = Aparato()
    puente, falsa, d = montar(tmp_path, cuentas=False, aparatos=[ap])
    vuelta(puente, falsa, firmada(1, ap))
    assert falsa.finales() == [(1, "rechazado")]
    assert "lista de cuentas" in falsa.acuses[-1]["detalle"]
    assert cola_de(d) == []


@requiere_firma
def test_estado_contesta_al_espejo_y_no_a_telegram(tmp_path):
    ap = Aparato(nivel="texto")                       # /estado y /ayuda son «bajo»: valen desde un aparato «texto»
    puente, falsa, d = montar(tmp_path, aparatos=[ap])
    antes = (d / "estado.json").read_bytes()
    with patch.object(pt, "tg", side_effect=AssertionError("Telegram no debe usarse")), \
         patch.object(pt, "decir", side_effect=AssertionError("Telegram no debe usarse")):
        vuelta(puente, falsa, firmada(1, ap, texto="/estado"),
               firmada(2, ap, accion="orden", orden={"nombre": "estado", "args": []}),
               firmada(3, ap, texto="/ayuda"))
    assert falsa.finales() == [(1, "hecho"), (2, "hecho"), (3, "hecho")]
    primera, resto = falsa.espejo[0]["texto"].split("\n", 1)
    assert primera == "Este chat: Bot B de ejemplo · id telegram.ejemplo_b_bot"
    assert resto.startswith("Estado de MetaGenesis (A1):")
    assert falsa.espejo[2]["texto"] == pt.texto_ayuda() and pt.AYUDA in falsa.espejo[2]["texto"]
    assert (d / "estado.json").read_bytes() == antes     # el offset de Telegram no cambia
    assert cola_de(d) == []


@requiere_firma
def test_orden_que_cambia_algo_caduca_a_los_30_min(tmp_path):
    ap = Aparato()
    puente, falsa, _ = montar(tmp_path, aparatos=[ap])
    vieja = _iso(time.time() - 31 * 60)
    reciente = _iso(time.time() - 5 * 60)
    vuelta(puente, falsa, firmada(1, ap, accion="orden", orden={"nombre": "pausa", "args": []}, recibido=vieja),
           firmada(2, ap, texto="/cancela", hace_s=31 * 60),
           firmada(3, ap, accion="orden", orden={"nombre": "sigue", "args": []}, recibido=reciente))
    assert falsa.finales() == [(1, "caducado"), (2, "caducado"), (3, "rechazado")]   # 3: la orden aún no existe aquí
    assert "no existe" in falsa.acuses[-1]["detalle"]


@requiere_firma
def test_peticion_en_texto_tambien_caduca_a_los_30_min(tmp_path):
    """GEN1114D (§3.6): una petición en texto es «alto» (la trabajan agentes): ya no vive 7 días."""
    ap = Aparato()
    puente, falsa, d = montar(tmp_path, aparatos=[ap])
    vuelta(puente, falsa, firmada(1, ap, recibido=_iso(time.time() - 31 * 60)),
           firmada(2, ap, hace_s=3 * 3600))
    assert falsa.finales() == [(1, "caducado"), (2, "caducado")]
    assert cola_de(d) == [] and falsa.espejo == []


@requiere_firma
def test_forma_y_lista_blanca(tmp_path):
    ap = Aparato()
    puente, falsa, d = montar(tmp_path, aparatos=[ap])
    vuelta(puente, falsa,
           firmada(1, ap, carga_extra={"destino": "mac"}), firmada(2, ap, fuente="direccion"),
           firmada(3, ap, nonce="corto"), firmada(4, ap, texto="/borra-todo"),
           firmada(5, ap, accion="orden", orden={"nombre": "rm", "args": []}),
           firmada(6, ap, accion="orden", orden={"nombre": "estado", "args": ["x"] * 11}),
           firmada(7, ap, texto="x" * 8001), firmada(8, ap, texto="   "))
    assert [e for _, e in falsa.finales()] == ["rechazado"] * 8
    assert cola_de(d) == [] and falsa.espejo == []


@requiere_firma
def test_nonce_repetido_no_se_ejecuta_dos_veces(tmp_path):
    ap = Aparato()
    puente, falsa, d = montar(tmp_path, aparatos=[ap])
    vuelta(puente, falsa, firmada(1, ap, nonce="a" * 22))
    vuelta(puente, falsa, firmada(2, ap, nonce="a" * 22))   # otra carga, otro seq, el mismo nonce
    assert len(cola_de(d)) == 1
    assert falsa.finales() == [(1, "hecho"), (2, "rechazado")] and falsa.detalles()[1] == "nonce-repetido"
    assert len(falsa.espejo) == 1


@requiere_firma
def test_misma_entrada_reentregada_no_duplica_la_cola(tmp_path):
    ap = Aparato()
    puente, falsa, d = montar(tmp_path, aparatos=[ap])
    e = firmada(9, ap)
    vuelta(puente, falsa, e)
    puente.estado["vistos"].clear()                      # p. ej. se perdió el estado propio
    vuelta(puente, falsa, e)
    assert len(cola_de(d)) == 1 and falsa.detalles()[-1] == "seq-repetido"


@requiere_firma
def test_si_no_se_puede_acusar_el_cursor_no_avanza(tmp_path):
    ap = Aparato()
    puente, falsa, d = montar(tmp_path, aparatos=[ap])
    falsa.acuse_ok = False
    falsa.entradas = [firmada(4, ap)]
    try:
        puente.una_vuelta()
        assert False, "debía fallar"
    except RuntimeError:
        pass
    assert puente.estado.get("desde", 0) == 0
    falsa.acuse_ok = True
    puente.una_vuelta()                                   # se reintenta: sin duplicar, con el acuse de antes
    assert puente.estado["desde"] == 4 and falsa.finales() == [(4, "hecho")] and len(cola_de(d)) == 1


@requiere_firma
def test_la_consulta_va_al_destino_a1_con_el_cursor(tmp_path):
    ap = Aparato()
    puente, falsa, _ = montar(tmp_path, aparatos=[ap])
    vuelta(puente, falsa, firmada(12, ap))
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


# ── GEN1113INT ───────────────────────────────────────────────────────────────

@requiere_firma
def test_lista_con_permisos_abiertos_no_autoriza_nada(tmp_path):
    ap = Aparato()
    puente, falsa, d = montar(tmp_path, aparatos=[ap])
    os.chmod(d / "cuentas.json", 0o644)
    vuelta(puente, falsa, firmada(1, ap))
    assert falsa.finales() == [(1, "rechazado")]
    assert "600" in falsa.acuses[-1]["detalle"] and cola_de(d) == []


def test_respuestas_largas_van_en_lotes_que_caben_en_la_puerta(tmp_path):
    """La puerta corta el cuerpo en 64 KB y el registro en 48 KB: nada de lo que se sube pasa de ahí."""
    puente, falsa, _ = montar(tmp_path)
    cuerpos = []
    real = falsa.__call__

    def midiendo(metodo, url, cabeceras, cuerpo=None, timeout=8):
        if cuerpo is not None and url.endswith("/espejo"):
            cuerpos.append(len(json.dumps(cuerpo, ensure_ascii=False).encode("utf-8")))
        return real(metodo, url, cabeceras, cuerpo, timeout)
    puente.puerta.http = midiendo
    puente.subir_espejo("é🚀" * 30000)                     # ≈ 180 KB en UTF-8
    while puente.salida:
        puente.vaciar()
    assert cuerpos and max(cuerpos) <= 60 * 1024
    assert all(len(json.dumps(r, ensure_ascii=False).encode("utf-8")) <= 40 * 1024 for r in falsa.espejo)
    assert "".join(r["texto"] for r in falsa.espejo) == "é🚀" * 30000


def test_un_lote_que_la_puerta_rechaza_no_atasca_el_espejo(tmp_path):
    puente, falsa, _ = montar(tmp_path)
    puente.puerta.http = lambda *a, **k: (413, {"error": "grande"})
    puente.subir_espejo("uno")
    assert puente.salida == []


def test_retiro_de_una_peticion_de_genesis_va_al_espejo_sin_su_texto(tmp_path):
    puente, falsa, _ = montar(tmp_path)
    mandados = []

    class Modulo:
        pass
    m = Modulo()
    m.__dict__.update({k: getattr(pt, k) for k in ("leer_json", "escribir_json", "log", "DIR", "TIPOS", "ENV")})
    m.decir = mandados.append
    m.enviar_resultado = lambda *a: None
    m.atender = lambda p: None
    m.main = lambda: None
    cambios = []
    m.actualizar = lambda pid, **c: cambios.append((pid, c))
    puerta = Puerta(url="https://example.invalid", ficha="ficha-de-prueba", http=falsa)
    with patch.object(pp.threading, "Thread"):
        pp.enganchar(m, puerta)
    # Lo mismo que hace `trabajar()` con una petición de más de 24 h:
    m.actualizar("g-9", estado="caducada")
    m.decir("Retiro de la cola tras 24 h sin poder hacerla: «TEXTO-PRIVADO de la petición»")
    assert mandados == [] and cambios == [("g-9", {"estado": "caducada"})]
    assert len(falsa.espejo) == 1 and "TEXTO-PRIVADO" not in falsa.espejo[0]["texto"]
    # Una de Telegram sigue yendo a Telegram, con su texto, como hoy.
    m.actualizar(41, estado="caducada")
    m.decir("Retiro de la cola tras 24 h sin poder hacerla: «otra»")
    assert mandados == ["Retiro de la cola tras 24 h sin poder hacerla: «otra»"]


# ── GEN1114D · entradas firmadas por el aparato (§3.5.3, §3.6, §3.7) ─────────

def _nada_corrio(falsa, d):
    return cola_de(d) == [] and falsa.espejo == []


@requiere_firma
def test_sin_lista_de_aparatos_no_se_atiende_nada_y_telegram_sigue_igual(tmp_path):
    ap = Aparato()
    puente, falsa, d = montar(tmp_path, aparatos=None)
    antes = (d / "estado.json").read_bytes()
    vuelta(puente, falsa, firmada(1, ap), firmada(2, ap, texto="/estado"), entrada_v1(3))
    assert falsa.finales() == [(1, "rechazado"), (2, "rechazado"), (3, "rechazado")]
    assert all("lista de aparatos" in x for x in falsa.detalles())
    assert _nada_corrio(falsa, d) and (d / "estado.json").read_bytes() == antes
    assert not (d / "vistos.json").exists()


@requiere_firma
def test_lista_de_aparatos_con_permisos_abiertos_no_vale(tmp_path):
    ap = Aparato()
    puente, falsa, d = montar(tmp_path, aparatos=[ap])
    os.chmod(d / "aparatos.json", 0o644)
    vuelta(puente, falsa, firmada(1, ap))
    assert falsa.finales() == [(1, "rechazado")] and "lista de aparatos" in falsa.detalles()[0]
    assert _nada_corrio(falsa, d)


@requiere_firma
def test_v1_sin_firma_se_rechaza_aunque_la_cuenta_este_en_la_lista(tmp_path):
    ap = Aparato()
    puente, falsa, d = montar(tmp_path, aparatos=[ap])
    vuelta(puente, falsa, entrada_v1(1), entrada_v1(2, texto="/estado"))
    assert falsa.finales() == [(1, "rechazado"), (2, "rechazado")]
    assert falsa.detalles() == ["sin-firma", "sin-firma"] and _nada_corrio(falsa, d)


@requiere_firma
def test_cada_motivo_se_acusa_y_no_corre_nada(tmp_path):
    ap, texto = Aparato(), Aparato(nivel="texto")
    ajeno = Aparato()                                     # nunca emparejado
    de_otra = Aparato(cuenta=OTRA)                        # emparejado con otra cuenta
    retirado = Aparato()
    puente, falsa, d = montar(tmp_path, aparatos=[ap, texto, de_otra, retirado], retirados=[retirado])
    repetida = firmada(9, ap)
    casos = [
        (firmada(1, ajeno), "aparato-desconocido"),
        (firmada(2, retirado), "aparato-revocado"),
        (firmada(3, ap, cambiar_byte=True), "firma-mala"),
        (firmada(4, ap, firmante=ajeno), "firma-mala"),
        (firmada(5, de_otra, cuenta_puerta=DUENO), "cuenta-distinta"),          # aparato de otra cuenta
        (firmada(6, ap, carga_extra={"cuenta": OTRA}), "cuenta-distinta"),      # carga que dice otra cuenta
        (firmada(7, ap, carga_extra={"destino": "mac"}), "destino"),            # una entrada para la Mac
        (firmada(8, ap, carga_extra={"chat": CHAT_A[0]}), "chat-distinto"),
        (firmada(10, ap, carga_extra={"chatNombre": CHAT_A[1]}), "nombre-distinto"),
        (firmada(11, ap, hace_s=-15 * 60), "futuro"),
        (firmada(12, ap, hace_s=31 * 60), "caducada"),
        (firmada(13, texto), "nivel"),                    # una petición (alto) desde un aparato «texto»
        (firmada(14, ap, carga_extra={"aud": "otra.cosa"}), "aud"),
    ]
    vuelta(puente, falsa, *[e for e, _ in casos])
    assert falsa.detalles() == [m for _, m in casos]
    assert falsa.finales() == [(e["id"], "caducado" if m == "caducada" else "rechazado") for e, m in casos]
    assert _nada_corrio(falsa, d)
    vuelta(puente, falsa, repetida)                       # buena: entra
    vuelta(puente, falsa, dict(repetida, id=15))          # la misma carga con otro id de la puerta (§7.8 k)
    assert falsa.finales()[-2:] == [(9, "hecho"), (15, "rechazado")] and falsa.detalles()[-1] == "seq-repetido"
    assert len(cola_de(d)) == 1


@requiere_firma
def test_dos_cargas_en_orden_inverso_entran_las_dos(tmp_path):
    ap = Aparato()
    puente, falsa, d = montar(tmp_path, aparatos=[ap])
    vuelta(puente, falsa, firmada(1, ap, seq=8, texto="la de seq 8"), firmada(2, ap, seq=7, texto="la de seq 7"))
    assert falsa.finales() == [(1, "hecho"), (2, "hecho")]
    assert [p["texto"] for p in cola_de(d)] == ["la de seq 8", "la de seq 7"]


@requiere_firma
def test_firmada_antes_de_retirar_y_entregada_despues_se_rechaza(tmp_path):
    ap = Aparato()
    puente, falsa, d = montar(tmp_path, aparatos=[ap])
    e = firmada(1, ap)
    _privado(d / "aparatos-retirados.json", {"v": 1, "retirados": [{"huella": ap.huella, "t": "x", "por": "mac"}]})
    vuelta(puente, falsa, e)
    assert falsa.detalles() == ["aparato-revocado"] and _nada_corrio(falsa, d)


@requiere_firma
def test_retirados_o_vistos_que_otro_pudo_tocar_no_valen(tmp_path):
    ap = Aparato()
    puente, falsa, d = montar(tmp_path, aparatos=[ap])
    _privado(d / "aparatos-retirados.json", {"v": 1, "retirados": []})
    os.chmod(d / "aparatos-retirados.json", 0o664)
    vuelta(puente, falsa, firmada(1, ap))
    os.chmod(d / "aparatos-retirados.json", 0o600)
    (d / "vistos.json").write_text("{roto")
    os.chmod(d / "vistos.json", 0o600)
    vuelta(puente, falsa, firmada(2, ap))
    assert falsa.finales() == [(1, "rechazado"), (2, "rechazado")] and _nada_corrio(falsa, d)


@requiere_firma
def test_sin_chat_a1_solo_valen_los_alias_fijos_y_estado_no_inventa_nombre(tmp_path):
    ap = Aparato(nivel="texto")
    puente, falsa, d = montar(tmp_path, aparatos=[ap], chat=False)
    vuelta(puente, falsa, firmada(1, ap, texto="/estado", carga_extra={"chatNombre": "Peticiones y encargos"}),
           firmada(2, ap, texto="/estado", carga_extra={"chatNombre": "Nombre inventado por la puerta"}))
    assert falsa.finales() == [(1, "hecho"), (2, "rechazado")] and falsa.detalles()[1] == "nombre-distinto"
    assert falsa.espejo[0]["texto"].split("\n", 1)[0] == "Este chat: nombre aún no publicado por la Mac"


@requiere_firma
def test_vistos_se_podan_a_8_dias_no_a_7(tmp_path):
    ap = Aparato()
    puente, falsa, d = montar(tmp_path, aparatos=[ap])
    ahora = time.time()
    _privado(d / "vistos.json", {"aparato:%s:100" % ap.huella: {"t": ahora - 7.5 * 86400},
                                 "viejo": {"t": ahora - 8.5 * 86400}})
    vuelta(puente, falsa, firmada(1, ap))
    vistos = json.loads((d / "vistos.json").read_text())
    assert "aparato:%s:100" % ap.huella in vistos and "viejo" not in vistos and len(vistos) == 3


@requiere_firma
def test_sin_el_modulo_de_firmas_no_corre_nada(tmp_path):
    ap = Aparato()
    puente, falsa, d = montar(tmp_path, aparatos=[ap])
    with patch.object(pp, "firma", None):
        vuelta(puente, falsa, firmada(1, ap))
    assert falsa.finales() == [(1, "rechazado")] and "verificación de firmas" in falsa.detalles()[0]
    assert _nada_corrio(falsa, d)


@requiere_firma
def test_registros_y_acuses_sin_texto_tokens_ni_identificadores_enteros(tmp_path):
    ap = Aparato()
    puente, falsa, d = montar(tmp_path, aparatos=[ap])
    lineas = []
    secreto = "TEXTO-PRIVADO de una petición"
    with patch.object(pt, "log", lambda *p: lineas.append(" ".join(str(x) for x in p))):
        vuelta(puente, falsa, firmada(1, ap, texto=secreto), firmada(2, ap, texto=secreto, cambiar_byte=True),
               firmada(3, Aparato(), texto=secreto), entrada_v1(4, texto=secreto))
    todo = "\n".join(lineas) + json.dumps(falsa.acuses, ensure_ascii=False)
    assert len(lineas) == 4
    for prohibido in (secreto, DUENO, ap.huella, "ficha-de-prueba", firmada(5, ap)["carga"][:40]):
        assert prohibido not in todo
    assert "aparato8=%s" % ap.huella[:8] in lineas[0] and "firma=ok" in lineas[0] and "seq=" in lineas[0]
    assert "firma=firma-mala" in lineas[1] and DUENO[:8] in lineas[0]
