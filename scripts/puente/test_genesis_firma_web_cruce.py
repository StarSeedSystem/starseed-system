#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""GEN1114INT · prueba que CRUZA el límite de lenguajes de las entradas firmadas (contrato GEN1114 §3, §7.8 y §9).

Lo que corre de verdad en cada lado:
  · «la web»: el código REAL de GEN1114E (src/lib/chats-genesis/firma-aparato.ts, emparejar.ts, canon.ts y
    puerta-chats.ts) bajo Node con su WebCrypto (`globalThis.crypto.subtle`, la misma API que la de los
    navegadores: ECDSA P-256 no exportable, firma r‖s de 64 bytes, SPKI sin comprimir). Lo empaqueta en el momento
    `cruce-firma-web.mjs` con esbuild. Lo ÚNICO sustituido es IndexedDB (Node no lo tiene): el almacén en memoria de
    las pruebas de E (`__tests__/idb-falso.ts`), que guarda la CryptoKey como objeto con structuredClone, como el
    navegador. Las peticiones salen con el `fetch` de Node hacia la puerta de la prueba.
  · la puerta: la REAL de GEN1114A (servidor.mjs + chats-genesis*.mjs) en 127.0.0.1 con el arnés de siempre.
  · la Mac: `genesis_chats_puerta.PuenteGenesis` (GEN1113B + GEN1114B) con su cliente HTTP real, el emparejamiento
    real de `genesis_aparatos.emparejar` (con `sudo install` falso, terminal simulada y la lista en una carpeta
    temporal de este usuario) y el registro real de `genesis_canon` (con un Telegram de mentira que solo contesta
    getMe/getChat). Efectos locales falsos: Genesis local, puente.py y director_chat (los de la cruzada de GEN1113).
  · el A1: `peticiones_puerta.Puente` (GEN1113F + GEN1114D) con su `Puerta` real, un bot de mentira y la lista de
    aparatos llevada por `genesis_aparatos.llevar_a1` con un ssh falso que escribe en una carpeta temporal.
Una puerta TOMADA se simula escribiendo en su SQLite lo que la puerta honrada rechazaría, o reescribiendo lo que
entrega antes de que lo lea la Mac. Sin red (solo 127.0.0.1) y sin archivos de la carpeta personal.
"""
import base64
import json
import os
import re
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import time

import pytest

CARPETA = os.path.dirname(os.path.abspath(__file__))
if CARPETA not in sys.path:
    sys.path.insert(0, CARPETA)
RAIZ = os.path.normpath(os.path.join(CARPETA, "..", ".."))
WEB = os.path.join(CARPETA, "cruce-firma-web.mjs")
NODE = shutil.which("node")
ESBUILD = os.path.join(RAIZ, "node_modules", "esbuild")

pytestmark = pytest.mark.skipif(not NODE or not os.path.isdir(ESBUILD),
                                reason="hacen falta node y esbuild (node_modules) para correr la web real")

import genesis_aparatos as A  # noqa: E402
import genesis_canon as CN  # noqa: E402
import genesis_firma_logica as F  # noqa: E402
import peticiones_puerta as PP  # noqa: E402
import puerta_datos_cliente as CLIENTE  # noqa: E402
import test_genesis_chats_cruce as C  # noqa: E402

DIRECCION = {"id": "genesis", "nombre": "GENESIS · StarSeed OS"}
#: Vectores del código de emparejar (§3.3).
VECTORES = [
    ("17a3b6ff31fccb5586b758b98e5cfcc2c4c4b68aa103288765360cfd0f64d80c", "00000000-0000-4000-8000-000000000001", "7ETY-DGGK-DY2F"),
    ("17a3b6ff31fccb5586b758b98e5cfcc2c4c4b68aa103288765360cfd0f64d80c", "00000000-0000-4000-8000-000000000002", "S7GP-KAWW-7Y5T"),
    ("c76ee5500e9143562f96ddaf2abbdb08c0676ce7f7a4e36edd644a9ba6cf8164", "00000000-0000-4000-8000-000000000001", "VYR2-W7RQ-DW2P"),
]


# ── la web real (Node) ───────────────────────────────────────────────────────

class Web:
    def __init__(self, puerta):
        entorno = {k: v for k, v in os.environ.items() if k in ("PATH", "TMPDIR", "LANG")}
        entorno.update(NODE_ENV="test", HOME=tempfile.mkdtemp(prefix="cruce-web-home-"))
        self.proc = subprocess.Popen([NODE, WEB], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                     stderr=subprocess.PIPE, text=True, env=entorno, cwd=CARPETA)
        linea = self.proc.stdout.readline()
        if not linea or not json.loads(linea).get("listo"):
            raise RuntimeError("la web no arrancó: %s" % self.proc.stderr.read()[-1500:])
        self.pedir("iniciar", base=puerta.base, sesiones=puerta.sesiones)

    def intentar(self, orden, **kw):
        self.proc.stdin.write(json.dumps(dict(kw, orden=orden)) + "\n")
        self.proc.stdin.flush()
        return json.loads(self.proc.stdout.readline())

    def pedir(self, orden, **kw):
        r = self.intentar(orden, **kw)
        assert r.get("ok") is True, r
        return r

    def cerrar(self):
        try:
            self.proc.stdin.close()
            self.proc.wait(timeout=20)
        finally:
            for f in (self.proc.stdout, self.proc.stderr):
                f.close()


@pytest.fixture(scope="module")
def puerta():
    p = C.PuertaViva()
    yield p
    p.cerrar()


@pytest.fixture(scope="module")
def web(puerta):
    w = Web(puerta)
    yield w
    w.cerrar()


@pytest.fixture(autouse=True)
def _limpio(puerta):
    """Cada prueba empieza con la cola de la Mac vacía y con su propio minuto en la puerta (30 entradas/min)."""
    puerta.avanzar(61_000)
    C._drenar(puerta)
    yield


def b64d(s):
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def b64e(b):
    return base64.urlsafe_b64encode(b).decode().rstrip("=")


# ── la Mac: emparejar de verdad, registro de verdad ──────────────────────────

def _instalar_falso(registro):
    """`sudo install` falso: comprueba los argumentos del alta como root (§3.3) y copia el temporal."""
    def ejecutar(args, **kw):
        registro.append(list(args))
        if list(args[:2]) == [A.SUDO, "-k"]:
            return subprocess.CompletedProcess(args, 0)
        assert args[0] == A.SUDO and A.INSTALL in args
        assert args[args.index("-o") + 1] == "root" and args[args.index("-m") + 1] in ("644", "755")
        if "-d" in args:
            os.makedirs(args[-1], exist_ok=True)
        else:
            shutil.copyfile(args[-2], args[-1])
            os.chmod(args[-1], 0o644)
        return subprocess.CompletedProcess(args, 0)
    return ejecutar


def nueva_mac(puerta, ahora=time.time):
    """La Mac de la cruzada con una lista de altas VACÍA: solo valen los aparatos que se emparejen aquí."""
    m = C.Mac(puerta, ahora=ahora)
    C.G.escribir_json(m.svc.ruta_altas, {"v": 1, "aparatos": []})
    os.chmod(m.svc.ruta_altas, 0o644)
    return m


def otra_mac(mac, puerta, ahora):
    """La MISMA Mac (misma carpeta, lista y registro) con otro reloj."""
    m = C.Mac.__new__(C.Mac)
    m.__dict__.update(mac.__dict__)
    m.svc = C.G.PuenteGenesis(puerta.base, puerta.fichas["mac"], base=mac.base, raiz=mac.raiz, mando=C.MANDO,
                              http=mac.local, ahora=ahora, stat=mac._stat, modulos=mac.svc.mod, salida=mac.log.append,
                              ruta_altas=mac.svc.ruta_altas, dueno_altas=os.getuid(), llevar=lambda **kw: (True, "prueba"))
    return m


def emparejar(puerta, web, mac, aparato, quien, nivel="", cuenta=None):
    """El recorrido entero de §3.3: la web pide (código en pantalla), la Mac lista, se teclea el código que enseña
    la web, se elige el nivel, «sudo install», la Mac avisa a la puerta y la web lo ve. Devuelve el aparato local."""
    cuenta = cuenta or puerta.cuentas[quien]
    r = web.pedir("pedir", aparato=aparato, quien=quien, nombre="Móvil " + aparato, cuenta=cuenta)["resultado"]
    assert r["ok"] is True, r
    codigo_en_pantalla = r["aparato"]["codigo"]
    respuestas, salida, sudo = iter([codigo_en_pantalla.lower().replace("-", " "), nivel]), [], []
    rc = A.emparejar(A.Puerta(url=puerta.base, ficha=puerta.fichas["mac"], http=CLIENTE._http), base=mac.base,
                     ruta_altas=mac.svc.ruta_altas, dueno_altas=os.getuid(), entrada=lambda _t: next(respuestas),
                     salida=salida.append, entorno={}, es_tty=lambda: True, ejecutar=_instalar_falso(sudo),
                     llevar=lambda **kw: (True, "prueba"))
    assert rc == 0, salida
    assert any("Emparejado" in s for s in salida) and [a[:2] for a in sudo][-1] == [A.SUDO, "-k"]
    local = web.pedir("consultar", aparato=aparato, quien=quien)["aparato"]
    assert (local["estado"], local["nivel"]) == ("emparejado", "completo" if nivel == "completo" else "texto")
    return local


class TelegramDeMentira:
    """Solo getMe y getChat (como TelegramSoloLectura exige). Sin red: contesta por el token de la prueba."""

    def __init__(self, bots):
        self.bots = bots
        self.urls = []

    def __call__(self, url, timeout=15):
        self.urls.append(url.split("/bot", 1)[1].split("/", 1)[1].split("?")[0])
        token = url.split("/bot", 1)[1].split("/", 1)[0]
        if token not in self.bots:
            raise ConnectionError("sin red")
        me, chat = self.bots[token]
        return {"ok": True, "result": me if "/getMe" in url else chat}


def registro_de_la_mac(mac, puerta, descubrir):
    """`genesis_canon descubrir --aplicar` y `subir` de verdad. Con `descubrir`, Telegram (de mentira) da los
    nombres de A y B; C queda sin variables (provisional). Sin `descubrir`, sin red: los tres provisionales."""
    home = tempfile.mkdtemp(prefix="cruce-canon-home-")
    os.makedirs(os.path.join(home, ".hermes"))
    os.makedirs(os.path.join(home, ".starseed"))
    with open(os.path.join(home, ".hermes", ".env"), "w") as f:
        f.write("TELEGRAM_BOT_TOKEN=token-a-prueba\nTELEGRAM_CHAT_ID=100200300400\n")
    with open(os.path.join(home, ".starseed", "env"), "w") as f:
        f.write("TELEGRAM_SINTESIS_BOT_TOKEN=token-b-prueba\nTELEGRAM_SINTESIS_CHAT_ID=-100987654321\n")
    bots = {"token-a-prueba": ({"username": "hermes_casa_bot", "first_name": "Hermes de casa"}, {"type": "private"}),
            "token-b-prueba": ({"username": "peticiones1234567890_bot", "first_name": "otro"},
                               {"type": "supergroup", "title": "Peticiones StarSeed"})} if descubrir else {}
    tg = TelegramDeMentira(bots)
    salida = []
    rc, _ = CN.orden_descubrir(aplicar=True, telegram=CN.TelegramSoloLectura(red=tg), base=mac.base, raiz=RAIZ,
                               home=home, salida=salida.append)
    assert rc == 0
    assert not re.search(r"\d{7,}", "\n".join(salida)), "descubrir imprimió algo que parece un id"
    assert set(tg.urls) <= {"getMe", "getChat"}
    subida = []
    entorno = {CN.VAR_URL: puerta.base, CN.VAR_FICHA: puerta.fichas["mac"]}
    assert CN.orden_subir(base=mac.base, raiz=RAIZ, home=home, http=CLIENTE._http, salida=subida.append,
                          entorno=entorno) == 0, subida
    shutil.rmtree(home, ignore_errors=True)
    return A.leer_canon(os.path.join(mac.base, "canon.json"))


def inyectar(puerta, cuenta, destino, firmada=None, datos=None, rol="dueño", hace_ms=120_000):
    """Lo que haría una puerta TOMADA: escribir una fila en su SQLite (la honrada la habría rechazado)."""
    t = int(time.time() * 1000) - hace_ms
    with sqlite3.connect(puerta.sqlite) as db:
        cur = db.execute(
            "INSERT INTO genesis_entradas (cuenta, rol, destino, nonce, datos, cambia, recibido, estado, actualizado,"
            " carga, firma, aparato) VALUES (?, ?, ?, ?, ?, 1, ?, 'en-cola', ?, ?, ?, ?)",
            (cuenta, rol, destino, "iny-%d" % time.time_ns(), json.dumps(datos or {}), t, t,
             (firmada or {}).get("carga"), (firmada or {}).get("firma"), (firmada or {}).get("aparato")))
        return cur.lastrowid


def entrada(fuente, accion, **kw):
    return dict(kw, fuente=fuente, accion=accion)


def entrada_v1(fuente, accion, **kw):
    import secrets
    return dict(kw, v=1, nonce=secrets.token_urlsafe(16), t=F.iso_utc(time.time()), fuente=fuente, accion=accion)


def acuse(puerta, quien, ident):
    return puerta.acuses(quien, ident)[ident]


def motivo(a):
    m = re.match(r"^\[([a-z-]+)\]", a.get("detalle") or "")
    return m.group(1) if m else a.get("detalle")


def altas_y_canon(mac):
    altas, problema = A.leer_altas(mac.svc.ruta_altas, os.getuid())
    assert problema is None
    return altas, A.leer_canon(os.path.join(mac.base, "canon.json"))


# ── 1. el límite de lenguajes, sin red: clave, código, firma y riesgo ────────

def test_webcrypto_firma_y_python_verifica_codigo_spki_y_riesgo_iguales(web):
    cuenta = "11111111-2222-4333-8444-555555555555"
    for huella, c, esperado in VECTORES:
        assert web.pedir("codigo", huella=huella, cuenta=c)["codigo"] == esperado == F.codigo_de(huella, c)
    r = web.pedir("crear", aparato="limite", nombre="Móvil del límite", cuenta=cuenta)
    assert r["extractable"] is False and r["exportable"] is False          # la privada no sale ni en pkcs8 ni en jwk
    spki = b64d(r["spki"])
    assert F.huella_de_spki(spki) == r["aparato"]["huella"]                 # SPKI de WebCrypto = la canónica de Python
    assert F.codigo_de(r["aparato"]["huella"], cuenta) == r["aparato"]["codigo"]
    fila = {"huella": r["aparato"]["huella"], "spki": r["spki"], "cuenta": cuenta, "nombre": "x",
            "plataforma": "navegador", "nivel": "completo", "alta": "2026-11-13T00:00:00Z"}
    altas, retirados = {"v": 1, "aparatos": [fila]}, {"v": 1, "retirados": []}
    ahora = time.time()
    casos = [  # una por riesgo y fuente (§9, GEN1114INT)
        (entrada_v1("direccion", "decir", texto="nota al hilo · ñandú 🌌", canales=["mando"]), DIRECCION, "mac"),
        (entrada_v1("direccion", "decir", texto="¿cómo va?", canales=["director-presidente"],
                    modelo="director-presidente/auto"),
         {"id": "genesis.canal.director-presidente", "nombre": "Director presidente"}, "mac"),
        (entrada_v1("puente:hermes-avisos", "texto", texto="Hermes, revisa el pulso"),
         {"id": "telegram.hermes-avisos", "nombre": "Hermes y avisos"}, "mac"),
        (entrada_v1("puente:hermes-avisos", "orden", orden={"nombre": "estado", "args": []}),
         {"id": "telegram.hermes-avisos", "nombre": "Hermes y avisos"}, "mac"),
        (entrada_v1("puente:peticiones", "texto", texto="haz una infografía " + "€" * 7000),
         {"id": "telegram.peticiones", "nombre": "Peticiones y encargos"}, "a1"),
    ]
    firmadas = []
    for e, chat, destino in casos:
        f = web.pedir("firmar", aparato="limite", entrada=e,
                      ctx={"cuenta": cuenta, "destino": destino, "chat": chat["id"], "chatNombre": chat["nombre"],
                           "ahora": ahora * 1000})["firmada"]
        sobre = dict(f, id=len(firmadas) + 1, cuenta=cuenta, rol="dueño", destino=destino, recibido=F.iso_utc(ahora))
        ok, mot, carga = F.comprobar_entrada_firmada(sobre, altas, retirados, None, {}, ahora, destino)
        assert (ok, mot) == (True, "ok"), (e, mot)
        assert carga["entrada"] == e and carga["chatNombre"] == chat["nombre"]
        assert len(b64d(f["firma"])) == 64                                   # r‖s, no DER
        firmadas.append(sobre)
    # Las seq de dos firmas seguidas son distintas (la Mac las guarda 8 días).
    assert len({F.leer_carga(b64d(s["carga"]))["seq"] for s in firmadas}) == len(firmadas)

    # Un byte cambiado en CUALQUIER sitio de lo firmado, o de la firma, no pasa nunca.
    sobre = firmadas[0]
    datos, firma = b64d(sobre["carga"]), b64d(sobre["firma"])
    for i in range(len(datos)):
        malo = bytearray(datos)
        malo[i] ^= 0x01
        ok, mot, _ = F.comprobar_entrada_firmada(dict(sobre, carga=b64e(bytes(malo))), altas, retirados, None, {},
                                                ahora, "mac")
        assert not ok and mot == "firma-mala", (i, mot)
    for i in range(len(firma)):
        mala = bytearray(firma)
        mala[i] ^= 0x01
        ok, mot, _ = F.comprobar_entrada_firmada(dict(sobre, firma=b64e(bytes(mala))), altas, retirados, None, {},
                                                ahora, "mac")
        assert not ok and mot == "firma-mala", (i, mot)
    # La misma firma en DER (lo que verifica `cryptography` por defecto) no se acepta: solo r‖s.
    from cryptography.hazmat.primitives.asymmetric import utils
    der = utils.encode_dss_signature(int.from_bytes(firma[:32], "big"), int.from_bytes(firma[32:], "big"))
    assert F.comprobar_entrada_firmada(dict(sobre, firma=b64e(der)), altas, retirados, None, {}, ahora, "mac")[1] == "firma-mala"
    # ECDSA es maleable ((r, n−s) también verifica): no sirve para repetir, porque la repetición se mira en lo firmado.
    n = 0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551
    s = int.from_bytes(firma[32:], "big")
    gemela = firma[:32] + (n - s).to_bytes(32, "big")
    assert F.verificar_firma(spki, datos, gemela)
    vistos = {}
    F.anotar(vistos, F.leer_carga(datos), ahora)
    assert F.comprobar_entrada_firmada(dict(sobre, firma=b64e(gemela)), altas, retirados, None, vistos, ahora,
                                       "mac")[1] == "seq-repetido"

    # La tabla de riesgo de la web es la de la Mac (y la de la puerta, que tiene su copia probada aparte).
    tabla = [
        entrada("direccion", "decir", texto="x", canales=["mando"]),
        entrada("direccion", "decir", texto="x"),
        entrada("direccion", "decir", texto="x", canales=[]),
        entrada("direccion", "decir", texto="x", canales=["mando", "hermes"]),
        entrada("direccion", "decir", texto="x", canales=["mando"], modelo="hermes/predeterminado"),
        entrada("direccion", "responder", respondeA="md-1762990000000-a1b2", modelo="hermes/predeterminado"),
        entrada("direccion", "reenviar", reenviar="md-1762990000000-a1b2", canales=["mando"]),
        entrada("direccion", "revocarme"),
        entrada("direccion", "revocar-aparato", huella="0" * 64),
        entrada("puente:hermes-avisos", "texto", texto="/estado"),
        entrada("puente:peticiones", "texto", texto="hola"),
        entrada("puente:avisos-directores", "texto", texto="hola"),
    ] + [entrada("puente:hermes-avisos", "orden", orden={"nombre": n, "args": []})
         for n in ("estado", "olas", "cola", "puertas", "agentes", "ayuda", "aprobar", "decir", "a", "soltar")] \
      + [entrada("puente:peticiones", "orden", orden={"nombre": n, "args": []})
         for n in ("estado", "ayuda", "encargos", "pausa", "sigue", "cancela", "olas")]
    assert web.pedir("riesgo", entradas=tabla)["riesgos"] == [F.riesgo_de_entrada(e) for e in tabla]


# ── 2. sin registro: emparejar, escribir, una sola vez, repetir no sirve ─────

def test_sin_registro_un_aparato_completo_emparejado_escribe_una_vez_y_repetir_no_sirve(puerta, web):
    mac = nueva_mac(puerta)
    try:
        r = web.pedir("canon", quien="dueno", claves=["direccion", "puente:hermes-avisos"],
                      fuentes=["direccion", "puente:hermes-avisos"])
        assert r["catalogo"] is None                                      # la Mac aún no publicó nada
        # Un solo esquema (GEN1114INT): sin registro, el id provisional `telegram.<clave>` y la etiqueta que se ve.
        assert r["nombres"]["puente:hermes-avisos"] == {"nombre": "Hermes y avisos", "id": "telegram.hermes-avisos",
                                                       "provisional": True}
        assert r["paraFirmar"]["direccion"] == {"id": "genesis", "nombre": "GENESIS · StarSeed OS", "provisional": True}
        assert r["paraFirmar"]["puente:hermes-avisos"] == {"id": "telegram.hermes-avisos", "nombre": "Hermes y avisos",
                                                          "provisional": True}
        assert not os.path.exists(os.path.join(mac.base, "canon.json"))
        emparejar(puerta, web, mac, "movil", "dueno", nivel="completo")

        # Al hilo (bajo) y a un director con un solo canal (alto): la cabecera enseña su nombre y ese se firma.
        e1 = web.pedir("enviar", aparato="movil", quien="dueno", catalogoDe="dueno",
                       entrada=entrada("direccion", "decir", texto="Prueba GEN1114 firmada", canales=["mando"]))
        e2 = web.pedir("enviar", aparato="movil", quien="dueno", catalogoDe="dueno", canal="director-presidente",
                       entrada=entrada("direccion", "decir", texto="¿Cómo va la ola?", canales=["director-presidente"],
                                       modelo="director-presidente/auto"))
        assert e2["chat"] == {"id": "genesis.canal.director-presidente", "nombre": "Director presidente"}
        e3 = web.pedir("enviar", aparato="movil", quien="dueno", catalogoDe="dueno",
                       entrada=entrada("puente:hermes-avisos", "texto", texto="Hermes, hola"))
        assert e3["chat"] == {"id": "telegram.hermes-avisos", "nombre": "Hermes y avisos"}
        ids = [e["resultado"]["id"] for e in (e1, e2, e3)]
        mac.vuelta()
        assert [acuse(puerta, "dueno", i)["estado"] for i in ids] == ["hecho", "hecho", "hecho"]
        assert [p["texto"] for p in mac.director.publicados] == ["Prueba GEN1114 firmada"]
        assert mac.local.posts == [{"accion": "decir", "texto": "¿Cómo va la ola?", "modelo": "director-presidente/auto",
                                    "canales": ["director-presidente"]},
                                   {"accion": "decir", "texto": "Hermes, hola", "modelo": "hermes/predeterminado",
                                    "canales": ["hermes"]}]
        assert [x["firma"] for x in mac.registro()[-3:]] == ["ok", "ok", "ok"]
        # Los acuses, leídos con el cliente REAL de la web (lo que pinta el estado de cada envío).
        acs = web.pedir("acuses", quien="dueno", ids=ids)["acuses"]
        assert [acs[str(i)]["estado"] for i in ids] == ["hecho", "hecho", "hecho"]
        # El espejo de la Mac vuelve por `feed` (cliente real de la web) con los campos que pintan las tarjetas.
        yo = "md-1800000009000-0b01"
        mac.local.feed = {"mensajes": [C._mensaje(yo, "2027-01-15T08:00:00Z", "Prueba GEN1114 firmada")],
                          "entregas": {}, "detalles": {}}
        mac.svc._marcar_origen({"id": yo})
        mac.tocar()
        assert mac.svc.tick_espejo() == "subido"
        f = web.pedir("feed", quien="dueno", fuente="direccion")["feed"]
        assert f["ok"] is True and f["latido"]["de"] == "mac"
        visto = {r["id"]: r for r in f["registros"]}[yo]
        assert C.CAMPOS_TARJETA <= set(visto) and visto["origen"] == "genesis-web" and visto["fuente"] == "direccion"

        # Los mismos bytes otra vez: la puerta los para (nonce) y, metidos por una puerta tomada, la Mac también.
        cuerpo = e2["mandado"][0]
        assert puerta.http("POST", "/v1/genesis/chats/entrada", "dueno", cuerpo)[0] == 409
        otra = inyectar(puerta, puerta.cuentas["dueno"], "mac", cuerpo)
        mac.vuelta()
        a = acuse(puerta, "dueno", otra)
        assert (a["estado"], motivo(a)) == ("rechazado", "seq-repetido")
        assert len(mac.local.posts) == 2 and len(mac.director.publicados) == 1
        mac.vuelta()
        assert len(mac.local.posts) == 2
    finally:
        mac.limpiar()


# ── 3. el registro de C viaja a la web y nombra los chats; lo que se ve es lo que se firma ──────

def test_registro_sembrado_y_descubierto_viaja_a_la_web_y_lo_firmado_cuadra_en_la_mac(puerta, web):
    mac = nueva_mac(puerta)
    try:
        emparejar(puerta, web, mac, "movil3", "dueno", nivel="completo")
        claves = ["direccion", "puente:hermes-avisos", "puente:peticiones", "puente:avisos-directores",
                  "genesis.canal.hermes", "Hermes y avisos"]
        fuentes = ["direccion", "puente:hermes-avisos", "puente:peticiones", "puente:avisos-directores"]

        # a) Sembrado, sin descubrir (sin red): ids provisionales `telegram.<clave>`, nombres de GEN1113 marcados.
        canon = registro_de_la_mac(mac, puerta, descubrir=False)
        assert {c["id"] for c in canon["chats"]} >= {"genesis", "telegram.hermes-avisos", "telegram.peticiones"}
        r = web.pedir("canon", quien="dueno", claves=claves, fuentes=fuentes)
        assert r["valido"] and len(r["catalogo"]["chats"]) == 13
        assert r["paraFirmar"]["puente:hermes-avisos"] == {"id": "telegram.hermes-avisos", "nombre": "Hermes y avisos",
                                                          "provisional": True}
        e1 = web.pedir("enviar", aparato="movil3", quien="dueno", catalogoDe="dueno",
                       entrada=entrada("puente:hermes-avisos", "texto", texto="Hermes, primera"))
        assert e1["chat"] == {"id": "telegram.hermes-avisos", "nombre": "Hermes y avisos"}
        mac.vuelta()
        assert acuse(puerta, "dueno", e1["resultado"]["id"])["estado"] == "hecho"

        # Firmado antes de descubrir y entregado después: su id provisional pasa a ser alias del MISMO chat (un solo
        # esquema, GEN1114INT), así que se ejecuta. Lo mismo con el id viejo de GEN1113 (`hermes-avisos`).
        vieja = web.pedir("firmar", aparato="movil3", entrada=entrada_v1("puente:hermes-avisos", "texto", texto="tarde"),
                          ctx={"cuenta": puerta.cuentas["dueno"], "destino": "mac", "chat": "telegram.hermes-avisos",
                               "chatNombre": "Hermes y avisos", "ahora": time.time() * 1000})["firmada"]

        # b) Descubierto: A privado (nombre del bot), B grupo (su título), C sin variables (sigue provisional).
        canon = registro_de_la_mac(mac, puerta, descubrir=True)
        r = web.pedir("canon", quien="dueno", claves=claves, fuentes=fuentes)
        assert r["valido"]
        # Lo que pinta F de cada chat (lista, cabecera, «Información del chat», Conexiones de chat › Telegram).
        for chat in r["catalogo"]["chats"]:
            assert {"id", "nombre", "nombreProvisional", "tipo", "fuente", "alias", "medios"} <= set(chat), chat["id"]
            for m in chat["medios"]:
                assert {"medio", "nombreEnMedio", "estadoNombre", "huella"} <= set(m)
        n = r["nombres"]
        assert n["puente:hermes-avisos"] == {"nombre": "Hermes de casa", "id": "telegram.hermes_casa_bot", "provisional": False}
        assert n["Hermes y avisos"]["id"] == "telegram.hermes_casa_bot"                     # el alias viejo resuelve
        assert n["puente:peticiones"]["nombre"] == "Peticiones StarSeed"
        assert n["puente:peticiones"]["id"] == "telegram.peticiones123456-7890_bot"          # cifras partidas (C) → pasa A y E
        assert n["puente:avisos-directores"] == {"nombre": "Avisos de los directores", "id": "telegram.avisos-directores",
                                                 "provisional": True}
        assert n["direccion"]["nombre"] == "GENESIS · StarSeed OS" and n["genesis.canal.hermes"]["nombre"] == "Hermes"
        assert CN.L.sin_ids(r["catalogo"])         # sin rachas de 7 cifras (salvo huellas de 8 hex y fechas)
        # El desarrollador no recibe los puentes A y B ni el @usuario (filtro de A).
        dev = web.pedir("canon", quien="dev", claves=[], fuentes=[])["catalogo"]
        assert {c["id"] for c in dev["chats"]} & {"telegram.hermes_casa_bot", "telegram.peticiones123456-7890_bot"} == set()
        assert "@" not in json.dumps(dev)

        e2 = web.pedir("enviar", aparato="movil3", quien="dueno", catalogoDe="dueno",
                       entrada=entrada("puente:hermes-avisos", "texto", texto="Hermes, segunda"))
        assert e2["chat"] == {"id": "telegram.hermes_casa_bot", "nombre": "Hermes de casa"}
        estado, j = puerta.http("POST", "/v1/genesis/chats/entrada", "dueno", vieja)
        assert estado == 201
        dueno = puerta.cuentas["dueno"]
        hermes_real = {"id": "telegram.hermes_casa_bot", "nombre": "Hermes de casa"}
        otras = {
            "id-viejo": _firmar(web, "movil3", dueno, {"fuente": "puente:hermes-avisos", "accion": "texto", "texto": "id viejo"},
                                {"id": "hermes-avisos", "nombre": "Hermes de casa"}),
            # El alias de OTRO chat (el id provisional del puente B) no nombra al de Hermes.
            "alias-ajeno": _firmar(web, "movil3", dueno, {"fuente": "puente:hermes-avisos", "accion": "texto", "texto": "ajeno"},
                                   {"id": "telegram.peticiones", "nombre": "Hermes de casa"}),
            # El nombre de otro chat con el id bueno.
            "nombre-ajeno": _firmar(web, "movil3", dueno, {"fuente": "puente:hermes-avisos", "accion": "texto", "texto": "nombre"},
                                    dict(hermes_real, nombre="Peticiones y encargos")),
        }
        ids_otras = {}
        for k, cuerpo in otras.items():
            est, jj = puerta.http("POST", "/v1/genesis/chats/entrada", "dueno", cuerpo)
            assert est == 201, (k, jj)
            ids_otras[k] = jj["id"]
        mac.vuelta()
        assert acuse(puerta, "dueno", e2["resultado"]["id"])["estado"] == "hecho"
        assert acuse(puerta, "dueno", j["id"])["estado"] == "hecho"
        assert acuse(puerta, "dueno", ids_otras["id-viejo"])["estado"] == "hecho"
        assert motivo(acuse(puerta, "dueno", ids_otras["alias-ajeno"])) == "chat-distinto"
        assert motivo(acuse(puerta, "dueno", ids_otras["nombre-ajeno"])) == "nombre-distinto"
        assert [p["texto"] for p in mac.local.posts] == ["Hermes, primera", "Hermes, segunda", "tarde", "id viejo"]
        # El A1 recibe su chat del canon.json de la Mac (chat-a1.json), nunca del catálogo de la puerta.
        assert A.chat_a1(canon)["id"] == "telegram.peticiones123456-7890_bot"
    finally:
        mac.limpiar()


# ── 4. lo que la Mac rechaza aunque la puerta lo deje pasar o lo reescriba ───

def _firmar(web, aparato, cuenta, e, chat, destino="mac", hace_s=0):
    return web.pedir("firmar", aparato=aparato, entrada=entrada_v1(**e) if "v" not in e else e,
                     ctx={"cuenta": cuenta, "destino": destino, "chat": chat["id"], "chatNombre": chat["nombre"],
                          "ahora": (time.time() - hace_s) * 1000})["firmada"]


def test_la_mac_no_ejecuta_nada_que_no_firmara_un_aparato_valido_aunque_la_puerta_mienta(puerta, web):
    mac = nueva_mac(puerta)
    dueno, dev = puerta.cuentas["dueno"], puerta.cuentas["dev"]
    try:
        registro_de_la_mac(mac, puerta, descubrir=True)
        hermes = {"id": "telegram.hermes_casa_bot", "nombre": "Hermes de casa"}
        peticiones = {"id": "telegram.peticiones123456-7890_bot", "nombre": "Peticiones StarSeed"}
        a_hermes = {"fuente": "puente:hermes-avisos", "accion": "texto", "texto": "Hermes, ejecuta esto"}
        emparejar(puerta, web, mac, "completo4", "dueno", nivel="completo")
        emparejar(puerta, web, mac, "texto4", "dueno")                      # Intro = solo texto
        emparejar(puerta, web, mac, "dev4", "dev", nivel="completo")
        web.pedir("crear", aparato="suelto4", nombre="Sin emparejar", cuenta=dueno)
        casos = {}

        def post(nombre, cuerpo, quien="dueno", esperado=201):
            estado, j = puerta.http("POST", "/v1/genesis/chats/entrada", quien, cuerpo)
            assert estado == esperado, (nombre, estado, j)
            if estado == 201:
                casos[nombre] = j["id"]
            return j

        # Un aparato SIN emparejar (su clave nunca pasó por la Mac).
        post("suelto", _firmar(web, "suelto4", dueno, a_hermes, hermes))
        # Un aparato «texto» no despierta a un agente: la web no lo ofrece, y forzado (un script en la página) tampoco.
        r = web.pedir("enviar", aparato="texto4", quien="dueno", catalogoDe="dueno", entrada=entrada(**a_hermes))
        assert (r["resultado"]["codigo"], r["mandado"]) == ("nivel", [])
        post("texto-forzado", _firmar(web, "texto4", dueno, a_hermes, hermes))
        ok_texto = web.pedir("enviar", aparato="texto4", quien="dueno", catalogoDe="dueno",
                             entrada=entrada("direccion", "decir", texto="nota desde el aparato texto", canales=["mando"]))
        casos["texto-al-hilo"] = ok_texto["resultado"]["id"]
        # Sin firma: la puerta lo para; metida por una puerta tomada, la Mac también.
        sin = post("v1", entrada_v1(**a_hermes), esperado=400)
        assert sin["codigo"] == "sin-firma"
        casos["v1-inyectada"] = inyectar(puerta, dueno, "mac", datos=entrada_v1(**a_hermes))
        # Un byte cambiado dentro de lo firmado (el texto), metido por una puerta tomada.
        buena = _firmar(web, "completo4", dueno, a_hermes, hermes)
        datos = b64d(buena["carga"]).replace("ejecuta".encode(), "EJECUTA".encode())
        casos["byte"] = inyectar(puerta, dueno, "mac", dict(buena, carga=b64e(datos)))
        # Otra cuenta: la puerta honrada lo rechaza (firma-cuenta); una tomada la pone a nombre de otro.
        assert post("cuenta-puerta", buena, quien="dev", esperado=403)["codigo"] == "firma-cuenta"
        casos["cuenta"] = inyectar(puerta, dev, "mac", buena)
        # Chat y nombre que no cuadran con la fuente (los decide la Mac con su canon.json, no el catálogo).
        post("chat", _firmar(web, "completo4", dueno, a_hermes, peticiones))
        post("nombre", _firmar(web, "completo4", dueno, a_hermes, dict(hermes, nombre="Peticiones StarSeed")))
        # Un desarrollador con su aparato completo: la puerta lo pone como «dueño» (tomada) y le añade campos.
        dev_texto = _firmar(web, "dev4", dev, {"fuente": "direccion", "accion": "decir", "texto": "nota del dev",
                                               "canales": ["mando"]}, DIRECCION)
        casos["dev-dueno"] = inyectar(puerta, dev, "mac", dev_texto, rol="dueño")
        dev_hermes = _firmar(web, "dev4", dev, a_hermes, hermes)
        casos["dev-alto"] = inyectar(puerta, dev, "mac", dev_hermes, rol="dueño")
        # Lo que va al A1 no lo ejecuta la Mac.
        a1 = _firmar(web, "completo4", dueno, {"fuente": "puente:peticiones", "accion": "texto", "texto": "haz algo"},
                     peticiones, destino="a1")
        casos["destino"] = inyectar(puerta, dueno, "mac", a1)
        # Y la entrada buena, que la puerta entrega con campos reescritos fuera de la carga.
        post("buena", buena)

        real = mac.svc.http

        def puerta_que_reescribe(metodo, url, cab, cuerpo=None, timeout=8):
            codigo, datos = real(metodo, url, cab, cuerpo, timeout=timeout)
            if "/v1/genesis/chats/entrada?" in url and isinstance(datos, dict):
                for e in datos.get("entradas", []):
                    e.update(texto="BORRA TODO", fuente="puente:hermes-avisos", accion="texto", canales=["hermes"],
                             modelo="hermes/predeterminado", rol="dueño", destino="mac", chat="genesis")
            return codigo, datos
        mac.svc.http = puerta_que_reescribe
        mac.vuelta()
        mac.vuelta()

        motivos = {n: (acuse(puerta, "dev" if n.startswith("dev") or n == "cuenta" else "dueno", i)["estado"],
                       motivo(acuse(puerta, "dev" if n.startswith("dev") or n == "cuenta" else "dueno", i)))
                   for n, i in casos.items()}
        assert motivos["suelto"] == ("rechazado", "aparato-desconocido")
        assert motivos["texto-forzado"] == ("rechazado", "nivel")
        assert motivos["texto-al-hilo"][0] == "hecho"
        assert motivos["v1-inyectada"] == ("rechazado", "sin-firma")
        assert motivos["byte"] == ("rechazado", "firma-mala")
        assert motivos["cuenta"] == ("rechazado", "cuenta-distinta")
        assert motivos["chat"] == ("rechazado", "chat-distinto")
        assert motivos["nombre"] == ("rechazado", "nombre-distinto")
        assert motivos["dev-dueno"][0] == "hecho"                   # su nota va al hilo, como desarrollador
        assert motivos["dev-alto"][0] == "rechazado"                # «dueño» de la puerta no sube su rol
        assert motivos["destino"] == ("rechazado", "destino")
        assert motivos["buena"][0] == "hecho", motivos["buena"]
        # Lo único que llegó a un agente es el texto FIRMADO de la entrada buena, una vez.
        assert mac.local.posts == [{"accion": "decir", "texto": "Hermes, ejecuta esto", "modelo": "hermes/predeterminado",
                                    "canales": ["hermes"]}]
        assert sorted(p["texto"] for p in mac.director.publicados) == ["nota del dev", "nota desde el aparato texto"]
        assert [p["rol"] for p in mac.director.publicados if p["texto"] == "nota del dev"] == ["agente"]
        assert "BORRA TODO" not in json.dumps([mac.local.posts, mac.director.publicados, mac.puente.dichos])
        assert mac.puente.ordenes == [] and mac.puente.dichos == []
        assert all("Hermes, ejecuta" not in json.dumps(x) for x in mac.registro())     # el registro no lleva texto
    finally:
        mac.limpiar()


def test_retirado_caducado_y_retirarse_desde_el_aparato(puerta, web):
    mac = nueva_mac(puerta)
    dueno = puerta.cuentas["dueno"]
    try:
        registro_de_la_mac(mac, puerta, descubrir=True)
        hermes = {"id": "telegram.hermes_casa_bot", "nombre": "Hermes de casa"}
        emparejar(puerta, web, mac, "perdido5", "dueno", nivel="completo")
        emparejar(puerta, web, mac, "otro5", "dueno", nivel="completo")
        a_hermes = entrada("puente:hermes-avisos", "texto", texto="Hermes, una más")
        # Firmada ANTES de retirar y entregada después (§7.8 m): se rechaza al procesar.
        antes = _firmar(web, "perdido5", dueno, dict(a_hermes), hermes)
        # El propio aparato pide retirarse (firmado, bajo) por la web real.
        r = web.pedir("enviar", aparato="perdido5", quien="dueno", entrada=entrada("direccion", "revocarme"))
        mac.vuelta()
        assert acuse(puerta, "dueno", r["resultado"]["id"])["estado"] == "hecho"
        retirados = A.leer_retirados(os.path.join(mac.base, "aparatos-retirados.json"))["retirados"]
        assert len(retirados) == 1 and oct(os.stat(os.path.join(mac.base, "aparatos-retirados.json")).st_mode & 0o777) == "0o600"
        assert "Se retiró el aparato" in mac.director.publicados[-1]["texto"]
        assert web.pedir("consultar", aparato="perdido5", quien="dueno")["aparato"]["estado"] == "revocado"
        estado, j = puerta.http("POST", "/v1/genesis/chats/entrada", "dueno", antes)
        assert estado == 201
        mac.vuelta()
        a = acuse(puerta, "dueno", j["id"])
        assert (a["estado"], motivo(a)) == ("rechazado", "aparato-revocado") and "retirado en la Mac el" in a["detalle"]

        # Caducada: un texto a Hermes (alto) que la Mac recoge 31 min después.
        r = web.pedir("enviar", aparato="otro5", quien="dueno", catalogoDe="dueno", entrada=dict(a_hermes))
        tarde = otra_mac(mac, puerta, ahora=lambda: time.time() + 31 * 60)
        tarde.vuelta()
        a = acuse(puerta, "dueno", r["resultado"]["id"])
        assert (a["estado"], motivo(a)) == ("caducado", "caducada")
        assert mac.local.posts == []
    finally:
        mac.limpiar()


# ── 5. lo mismo con el A1 de destino (bucle de GEN1114D) ─────────────────────

def _ssh_falso(carpeta_a1, llamadas):
    """ssh de mentira para `llevar_a1`: escribe cada archivo en la carpeta del A1 de la prueba (600)."""
    def ejecutar(args, input=None, **kw):
        llamadas.append(args[:-1])
        assert args[0] == A.SSH and "BatchMode=yes" in args and args[-3] == "--"
        nombre = re.search(r"\.starseed/peticiones/([a-z0-9.-]+)\.tmp ", args[-1]).group(1)
        ruta = os.path.join(carpeta_a1, nombre)
        with open(ruta, "wb") as f:
            f.write(input)
        os.chmod(ruta, 0o600)
        return subprocess.CompletedProcess(args, 0, b"", b"")
    return ejecutar


def test_peticiones_al_a1_firmadas_por_la_web_y_lo_que_el_a1_rechaza(puerta, web):
    mac = nueva_mac(puerta)
    dueno = puerta.cuentas["dueno"]
    carpeta = tempfile.mkdtemp(prefix="cruce-a1-firma-")
    try:
        canon = registro_de_la_mac(mac, puerta, descubrir=True)
        emparejar(puerta, web, mac, "movil6", "dueno", nivel="completo")
        emparejar(puerta, web, mac, "texto6", "dueno")
        emparejar(puerta, web, mac, "perdido6", "dueno", nivel="completo")
        web.pedir("crear", aparato="suelto6", nombre="Sin emparejar", cuenta=dueno)
        bot = C.BotFalso(carpeta)
        with open(os.path.join(carpeta, "cuentas.json"), "w") as f:
            json.dump({"duenos": [dueno]}, f)
        os.chmod(os.path.join(carpeta, "cuentas.json"), 0o600)

        # La Mac retira un aparato y lleva la lista al A1 (ssh falso): altas tal cual, retirados y chat-a1.json.
        local = web.pedir("local", aparato="perdido6")["aparato"]
        A.anadir_retirado(os.path.join(mac.base, "aparatos-retirados.json"), local["huella"], "mac", time.time())
        ssh = []
        ok, frase = A.llevar_a1(base=mac.base, ruta_altas=mac.svc.ruta_altas, ejecutar=_ssh_falso(carpeta, ssh),
                                entorno={A.VAR_A1: "a1-de-prueba"})
        assert ok, frase
        assert sorted(os.listdir(carpeta)) == ["aparatos-retirados.json", "aparatos.json", "chat-a1.json", "cuentas.json"]
        with open(os.path.join(carpeta, "aparatos.json"), "rb") as f, open(mac.svc.ruta_altas, "rb") as g:
            assert f.read() == g.read()                                            # la lista de root, tal cual
        assert bot.chat_a1()["id"] == A.chat_a1(canon)["id"] == "telegram.peticiones123456-7890_bot"

        peticion = entrada("puente:peticiones", "texto", texto="Haz una infografía de la síntesis")
        chat_b = {"id": "telegram.peticiones123456-7890_bot", "nombre": "Peticiones StarSeed"}
        # Fase 1a: la puerta no deja escribir al A1 (la web lo dice con el texto de §7).
        cerrado = web.pedir("enviar", aparato="movil6", quien="dueno", catalogoDe="dueno", entrada=dict(peticion))
        assert cerrado["resultado"]["codigo"] == "destino-cerrado"
        puerta.abrir_a1(True)
        casos = {}
        r = web.pedir("enviar", aparato="movil6", quien="dueno", catalogoDe="dueno", entrada=dict(peticion))
        assert r["chat"] == chat_b
        casos["buena"] = r["resultado"]["id"]
        buena = r["mandado"][-1]
        e = web.pedir("enviar", aparato="texto6", quien="dueno", catalogoDe="dueno",
                      entrada=entrada("puente:peticiones", "orden", orden={"nombre": "estado", "args": []}))
        casos["estado-desde-texto"] = e["resultado"]["id"]
        assert web.pedir("enviar", aparato="texto6", quien="dueno", catalogoDe="dueno",
                         entrada=dict(peticion))["resultado"]["codigo"] == "nivel"
        firmar = lambda ap, e, chat=chat_b, destino="a1", **kw: _firmar(web, ap, dueno, e, chat, destino, **kw)  # noqa: E731
        for nombre, cuerpo in (("texto-forzado", firmar("texto6", dict(peticion))),
                               ("suelto", firmar("suelto6", dict(peticion))),
                               ("retirado", firmar("perdido6", dict(peticion)))):
            estado, j = puerta.http("POST", "/v1/genesis/chats/entrada", "dueno", cuerpo)
            assert estado == 201, (nombre, j)
            casos[nombre] = j["id"]
        casos["repetida"] = inyectar(puerta, dueno, "a1", buena)
        casos["v1"] = inyectar(puerta, dueno, "a1", datos=dict(entrada_v1(**peticion), destino="a1"))
        mac_firmada = firmar("movil6", {"fuente": "direccion", "accion": "decir", "texto": "al hilo", "canales": ["mando"]},
                             chat=DIRECCION, destino="mac")
        casos["destino"] = inyectar(puerta, dueno, "a1", mac_firmada)
        malo = b64d(buena["carga"]).replace(b"infograf", b"INFOGRAF")
        casos["byte"] = inyectar(puerta, dueno, "a1", dict(buena, carga=b64e(malo)))

        p = PP.Puente(bot, CLIENTE.Puerta(url=puerta.base, ficha=puerta.fichas["a1"]), dormir=lambda s: None)
        p.una_vuelta()                 # una vuelta basta: la puerta entrega todo lo pendiente (otra esperaría 25 s)
        res = {n: (acuse(puerta, "dueno", i)["estado"], motivo(acuse(puerta, "dueno", i))) for n, i in casos.items()}
        assert res["buena"][0] == "hecho", res
        assert res["estado-desde-texto"][0] == "hecho", res
        assert res["texto-forzado"] == ("rechazado", "nivel")
        assert res["suelto"] == ("rechazado", "aparato-desconocido")
        assert res["retirado"] == ("rechazado", "aparato-revocado")
        assert res["repetida"] == ("rechazado", "seq-repetido")
        assert res["v1"] == ("rechazado", "sin-firma")
        assert res["destino"] == ("rechazado", "destino")
        assert res["byte"] == ("rechazado", "firma-mala")
        cola = bot.leer_json(bot.COLA, [])
        assert [(x["id"], x["texto"]) for x in cola] == [("g-%d" % casos["buena"], "Haz una infografía de la síntesis")]
        # Lo que contesta el A1 vuelve por `feed` del puente B, leído con el cliente REAL de la web.
        f = web.pedir("feed", quien="dueno", fuente="puente:peticiones")["feed"]
        assert f["ok"] is True and f["latido"]["de"] == "a1" and f["registros"]
        assert all(C.CAMPOS_TARJETA <= set(x) for x in f["registros"])
        acs = web.pedir("acuses", quien="dueno", ids=[casos["buena"], casos["texto-forzado"]])["acuses"]
        assert acs[str(casos["buena"])]["estado"] == "hecho"
        assert acs[str(casos["texto-forzado"])]["detalle"].startswith("[nivel]")

        # Caducada: una petición (alto) que el A1 recoge 31 min después.
        r = web.pedir("enviar", aparato="movil6", quien="dueno", catalogoDe="dueno",
                      entrada=entrada("puente:peticiones", "texto", texto="otra petición"))
        tarde = PP.Puente(bot, CLIENTE.Puerta(url=puerta.base, ficha=puerta.fichas["a1"]), dormir=lambda s: None,
                          ahora=lambda: time.time() + 31 * 60)
        tarde.una_vuelta()
        a = acuse(puerta, "dueno", r["resultado"]["id"])
        assert (a["estado"], motivo(a)) == ("caducado", "caducada")
        assert len(bot.leer_json(bot.COLA, [])) == 1
        # La Mac no ve nada del A1.
        mac.vuelta()
        assert mac.local.posts == [] and mac.puente.ordenes == []
    finally:
        puerta.abrir_a1(False)
        mac.limpiar()
        shutil.rmtree(carpeta, ignore_errors=True)
