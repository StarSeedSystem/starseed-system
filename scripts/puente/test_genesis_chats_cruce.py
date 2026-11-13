#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""GEN1113INT · prueba que CRUZA los paquetes de los chats de Genesis.

La puerta de datos es la REAL (GEN1113A: servidor.mjs + chats-genesis.mjs), arrancada en 127.0.0.1 con un
puerto efímero por `servicios/puerta-datos/test/cruce-genesis-arnes.mjs` (claves, fichas y Supabase de
mentira, SQLite en una carpeta temporal). La recorren:
  · «la web»: peticiones HTTP como las que hace el cliente de GEN1113C (sesión en Authorization, nonce de
    128 bits, la forma de EntradaChat que manda la pestaña de GEN1113D);
  · la Mac: `genesis_chats_puerta.PuenteGenesis` de GEN1113B, con su cliente HTTP real
    (`puerta_datos_cliente._http`) y su lógica real; solo son falsos Genesis local (la ruta
    /api/mando/*), `puente.orden`/`puente.decir` y `director_chat.publicar`;
  · el A1: `peticiones_puerta.Puente` de GEN1113F, con `Puerta` real y un bot de mentira.
Sin red (solo 127.0.0.1) y sin tocar la carpeta personal: todo vive en carpetas temporales.
Contrato: architecture/astraura-chats-genesis.md §4, §5.2, §6 y §7.

GEN1114INT · desde GEN1114 la puerta solo admite entradas FIRMADAS (v:2) y la Mac y el A1 solo ejecutan lo que
firmó un aparato emparejado. Aquí cada cuenta tiene un aparato de prueba «completo» (clave P-256 de Python, firma
r‖s como WebCrypto) dado de alta en una lista temporal; las entradas van al chat de cada fuente con el id y el
nombre que valen sin registro canónico (el esquema común de GEN1114INT). La prueba con el código REAL de la web
(WebCrypto de Node) es test_genesis_firma_web_cruce.py.
"""
import json
import os
import secrets
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import types
import urllib.error
import urllib.request

import pytest

CARPETA = os.path.dirname(os.path.abspath(__file__))
if CARPETA not in sys.path:
    sys.path.insert(0, CARPETA)

import director_chat  # noqa: E402
import genesis_firma_logica as F  # noqa: E402  (GEN1114INT)
import genesis_chats_logica as L  # noqa: E402
import genesis_chats_puerta as G  # noqa: E402
import peticiones_puerta as PP  # noqa: E402
import puerta_datos_cliente as CLIENTE  # noqa: E402

ARNES = os.path.normpath(os.path.join(CARPETA, "..", "..", "servicios", "puerta-datos", "test", "cruce-genesis-arnes.mjs"))
MANDO = "http://mando.invalid"     # Genesis local de mentira: nunca sale a la red (lo atiende `GenesisLocal`)
NODE = shutil.which("node")

pytestmark = pytest.mark.skipif(not NODE or not os.path.exists(ARNES), reason="hace falta node y el arnés de la puerta")


# ── la puerta real ───────────────────────────────────────────────────────────

class PuertaViva:
    def __init__(self):
        entorno = {k: v for k, v in os.environ.items() if k in ("PATH", "TMPDIR", "LANG", "SYSTEMROOT")}
        entorno["NODE_ENV"] = "test"
        entorno["HOME"] = tempfile.mkdtemp(prefix="cruce-home-")   # ni la puerta mira la carpeta personal
        self.proc = subprocess.Popen([NODE, "--disable-warning=ExperimentalWarning", ARNES], stdin=subprocess.PIPE,
                                     stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, env=entorno,
                                     cwd=os.path.dirname(ARNES))
        linea = self.proc.stdout.readline()
        if not linea:
            raise RuntimeError("el arnés no arrancó: %s" % self.proc.stderr.read()[-800:])
        datos = json.loads(linea)
        self.base, self.fichas, self.sesiones, self.cuentas = datos["base"], datos["fichas"], datos["sesiones"], datos["cuentas"]
        # GEN1114INT: la base de la puerta (para simular una puerta tomada) y un aparato «completo» por cuenta.
        self.sqlite = datos.get("sqlite")
        from test_genesis_firma_logica import Aparato
        self.aparatos = {n: Aparato(cuenta=c, nivel="completo", nombre="aparato de %s" % n) for n, c in self.cuentas.items()}

    def abrir_a1(self, abierta=True):
        """GEN1114INT: abre o cierra la escritura a `destino: "a1"` (PUERTA_GENESIS_A1_ESCRITURA, fase 1b)."""
        self.proc.stdin.write(json.dumps({"a1": bool(abierta)}) + "\n")
        self.proc.stdin.flush()
        assert json.loads(self.proc.stdout.readline())["ok"] is True

    def avanzar(self, ms):
        self.proc.stdin.write(json.dumps({"avanzar": ms}) + "\n")
        self.proc.stdin.flush()
        assert json.loads(self.proc.stdout.readline())["ok"] is True

    def cerrar(self):
        try:
            self.proc.stdin.close()
            self.proc.wait(timeout=10)
        finally:
            for f in (self.proc.stdout, self.proc.stderr):
                f.close()

    # «La web»: lo que hace el cliente de GEN1113C (Bearer de la sesión, sin cookies).
    def http(self, metodo, ruta, quien=None, cuerpo=None, ficha=None):
        cab = {"Accept": "application/json"}
        if quien:
            cab["Authorization"] = "Bearer " + self.sesiones[quien]
        if ficha:
            cab["Authorization"] = "Bearer " + self.fichas[ficha]
        datos = None
        if cuerpo is not None:
            cab["Content-Type"] = "application/json"
            datos = json.dumps(cuerpo).encode("utf-8")
        req = urllib.request.Request(self.base + ruta, data=datos, method=metodo, headers=cab)
        try:
            with urllib.request.urlopen(req, timeout=15) as r:
                return r.status, json.loads(r.read().decode("utf-8") or "null")
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read().decode("utf-8") or "null")

    def enviar(self, quien, **entrada):
        """Una EntradaChat como la arma `crearClienteChatsGenesis().enviar` (v, nonce de 128 bits, t), FIRMADA
        (GEN1114INT) por el aparato de esa cuenta: EntradaFirmada v2 con la carga de §3.4."""
        cuerpo = {"v": 1, "nonce": secrets.token_urlsafe(16), "t": L.iso_utc(time.time())}
        cuerpo.update(entrada)
        fijo = F.ALIAS_GEN1113.get(cuerpo.get("fuente"), F.ALIAS_GEN1113["direccion"])
        ahora = time.time()
        alto = F.riesgo_de_entrada(cuerpo) == "alto"
        ap = self.aparatos[quien]
        carga = ap.carga(cuerpo, chat=(fijo["chat"], fijo["nombres"][-1]),
                         destino="a1" if cuerpo.get("fuente") == "puente:peticiones" else "mac",
                         t=ahora, caduca=ahora + (F.LIMITE_CAMBIA_S if alto else F.LIMITE_MENSAJE_S))
        s = ap.sobre(carga)
        return self.http("POST", "/v1/genesis/chats/entrada", quien,
                         {"v": 2, "carga": s["carga"], "firma": s["firma"], "aparato": s["aparato"]})

    def acuses(self, quien, *ids):
        estado, j = self.http("GET", "/v1/genesis/chats/acuses?ids=" + ",".join(str(i) for i in ids), quien)
        assert estado == 200, j
        return {a["id"]: a for a in j["acuses"]}

    def feed(self, quien, fuente, **q):
        ruta = "/v1/genesis/chats/feed?fuente=" + fuente + "".join("&%s=%s" % kv for kv in q.items())
        return self.http("GET", ruta, quien)


@pytest.fixture(scope="module")
def puerta():
    p = PuertaViva()
    yield p
    p.cerrar()


# ── la Mac (GEN1113B) con Genesis local y puente.py de mentira ───────────────

class GenesisLocal:
    """Lo que en la Mac atiende 127.0.0.1:9002 (/api/mando/*). Todo lo demás va a la puerta REAL."""

    def __init__(self):
        self.feed = {"mensajes": [], "entregas": {}, "detalles": {}}
        self.posts = []
        self.siguiente = 0

    def __call__(self, metodo, url, cab, cuerpo=None, timeout=8):
        if not url.startswith(MANDO):
            return CLIENTE._http(metodo, url, cab, cuerpo, timeout=timeout)
        ruta = url[len(MANDO):]
        if ruta.startswith("/api/mando/director-chat") and metodo == "GET":
            return 200, json.loads(json.dumps(self.feed))
        if ruta == "/api/mando/director-chat" and metodo == "POST":
            self.posts.append(cuerpo)
            self.siguiente += 1
            return 200, {"pendiente": True, "mensaje": {"id": "md-1800000000%03d-c0de" % self.siguiente}}
        if ruta == "/api/mando/estado":
            return 200, {"cuentas": {"ola": "1113", "integradas": 4, "enCurso": 1, "esperandoAprobacion": 2, "pendientes": 3}}
        raise AssertionError("ruta local inesperada")


class PuenteFalso:
    def __init__(self):
        self.ordenes, self.dichos = [], []

    def orden(self, accion, ids, extra=None):
        self.ordenes.append({"accion": accion, "ids": list(ids), "extra": extra, "quien": os.environ.get("STARSEED_IDE")})
        return 0

    def decir(self, texto, quien=None, tipo="mensaje", tarea=None):
        self.dichos.append({"texto": texto, "quien": quien})


class DirectorFalso:
    tachar = staticmethod(director_chat.tachar)

    def __init__(self):
        self.publicados = []

    def publicar(self, texto, de, rol="director", tipo="informe", canal="mando", **kw):
        m = {"id": "md-1800000001%03d-0abc" % len(self.publicados), "texto": texto, "de": de, "rol": rol,
             "canal": canal, "canales": kw.get("canales")}
        self.publicados.append(m)
        return m


class Mac:
    def __init__(self, puerta, lista=True, ahora=time.time):
        self.dir = tempfile.mkdtemp(prefix="cruce-mac-")
        self.base = os.path.join(self.dir, "genesis-chats")
        self.raiz = os.path.join(self.dir, "raiz")
        self.local, self.puente, self.director = GenesisLocal(), PuenteFalso(), DirectorFalso()
        self.mtimes = {}
        self.log = []
        # telegram-puente.py no se carga (lee su entorno al importarse): la pestaña manda las órdenes ya
        # analizadas (`accion: "orden"`), así que `parsear_orden` no hace falta aquí.
        tg = types.SimpleNamespace(parsear_orden=lambda texto: None,
                                   es_repetido=lambda fila, ultimo: False, _importa=lambda fila: True)
        self.svc = G.PuenteGenesis(puerta.base, puerta.fichas["mac"], base=self.base, raiz=self.raiz, mando=MANDO,
                                   http=self.local, ahora=ahora, stat=self._stat,
                                   modulos={"puente": self.puente, "telegram": tg, "director_chat": self.director,
                                            "cliente": CLIENTE},
                                   salida=self.log.append)
        # GEN1114INT: la lista de altas (de este usuario en la prueba; de root en la Mac) con un aparato por cuenta.
        ruta = os.path.join(self.dir, "StarSeed", "genesis-aparatos.json")
        os.makedirs(os.path.dirname(ruta), mode=0o755)
        G.escribir_json(ruta, {"v": 1, "aparatos": [a.fila() for a in puerta.aparatos.values()]})
        os.chmod(ruta, 0o644)
        self.svc.ruta_altas, self.svc.dueno_altas = ruta, os.getuid()
        self.svc.llevar = lambda **kw: (True, "prueba")
        if lista:
            G.escribir_cuentas(os.path.join(self.base, "cuentas.json"), [puerta.cuentas["dueno"]], [puerta.cuentas["dev"]])

    def _stat(self, ruta):
        if ruta not in self.mtimes:
            raise FileNotFoundError(ruta)
        return types.SimpleNamespace(st_mtime_ns=self.mtimes[ruta])

    def tocar(self):
        r = G.rutas_feed(self.raiz)["chat"]
        self.mtimes[r] = self.mtimes.get(r, 0) + 1

    def vuelta(self):
        assert self.svc.ciclo_entradas(esperar=0) is True

    def registro(self):
        try:
            with open(os.path.join(self.base, "registro.jsonl"), encoding="utf-8") as f:
                return [json.loads(x) for x in f.read().splitlines()]
        except OSError:
            return []

    def limpiar(self):
        shutil.rmtree(self.dir, ignore_errors=True)


@pytest.fixture
def mac(puerta):
    m = Mac(puerta)
    yield m
    m.limpiar()


def _drenar(puerta):
    """Cierra lo que quede en la cola de la Mac (una prueba no hereda lo de la anterior)."""
    m = Mac(puerta, lista=False)
    try:
        m.vuelta()
    finally:
        m.limpiar()


# ── 1. web → puerta → Mac: una orden de un dueño, una sola vez, con su acuse ─────

def test_orden_de_un_dueno_llega_a_la_mac_se_ejecuta_una_vez_y_acuses_dice_hecho(puerta, mac):
    ide_antes = os.environ.get("STARSEED_IDE")
    estado, r = puerta.enviar("dueno", fuente="puente:hermes-avisos", accion="orden",
                              orden={"nombre": "aprobar", "args": ["T-1113"]})
    assert (estado, r["destino"], r["estado"]) == (201, "mac", "en-cola")
    ident = r["id"]
    assert puerta.acuses("dueno", ident)[ident]["estado"] == "en-cola"

    # El acuse final se pierde la primera vez: la puerta la vuelve a entregar y la Mac NO la repite.
    real, perdidos = mac.svc.acusar, []

    def acusar(i, estado, detalle):
        if estado != "entregado" and not perdidos:
            perdidos.append(i)
            return 503
        return real(i, estado, detalle)
    mac.svc.acusar = acusar
    assert mac.svc.ciclo_entradas(esperar=0) is False
    assert puerta.acuses("dueno", ident)[ident]["estado"] == "entregado"      # la Mac la recogió
    mac.vuelta()
    assert mac.puente.ordenes == [{"accion": "aprobar", "ids": ["T-1113"], "extra": None,
                                   "quien": "genesis-web-11111111"}]
    a = puerta.acuses("dueno", ident)[ident]
    assert a["estado"] == "hecho" and "T-1113" not in json.dumps(mac.registro())
    # `acuses` solo da las entradas de quien pregunta.
    assert puerta.acuses("dev", ident) == {} and puerta.acuses("dueno2", ident) == {}
    mac.vuelta()
    assert len(mac.puente.ordenes) == 1
    assert os.environ.get("STARSEED_IDE") == ide_antes      # el «quién» no se queda en el entorno


def test_decir_y_texto_a_hermes_tal_como_los_manda_la_pestana(puerta, mac):
    largo = "Hola directores, " + "texto largo " * 30           # > 120: no cabría en `args`
    e1 = puerta.enviar("dueno", fuente="puente:hermes-avisos", accion="orden",
                       orden={"nombre": "decir", "args": []}, texto=largo)
    e2 = puerta.enviar("dueno", fuente="puente:hermes-avisos", accion="orden",
                       orden={"nombre": "a", "args": ["claude"]}, texto="revisa la ola")
    e3 = puerta.enviar("dueno", fuente="puente:hermes-avisos", accion="texto", texto="Hermes, ¿cómo va?")
    assert [e[0] for e in (e1, e2, e3)] == [201, 201, 201]
    mac.vuelta()
    assert [d["texto"] for d in mac.puente.dichos] == [largo.strip(), "revisa la ola"]
    assert mac.local.posts == [{"accion": "decir", "texto": "Hermes, ¿cómo va?", "modelo": "hermes/predeterminado",
                                "canales": ["hermes"]}]
    acuses = puerta.acuses("dueno", e1[1]["id"], e2[1]["id"], e3[1]["id"])
    assert [a["estado"] for a in acuses.values()] == ["hecho", "hecho", "hecho"]


# ── 2. lo que la puerta no deja pasar ────────────────────────────────────────

def test_desarrollador_la_puerta_rechaza_sus_ordenes_y_su_texto_solo_va_al_hilo(puerta, mac):
    for entrada in (
        dict(fuente="puente:hermes-avisos", accion="orden", orden={"nombre": "aprobar", "args": ["T1"]}),
        dict(fuente="puente:hermes-avisos", accion="texto", texto="Hermes, borra todo"),
        dict(fuente="direccion", accion="decir", texto="hola", canales=["hermes"]),
        dict(fuente="direccion", accion="decir", texto="hola", modelo="director-presidente/auto"),
        dict(fuente="direccion", accion="responder", respondeA="md-1762990000000-a1b2", modelo="hermes/predeterminado"),
        dict(fuente="direccion", accion="reenviar", reenviar="md-1762990000000-a1b2", canales=["claude-mac"]),
        dict(fuente="puente:peticiones", accion="texto", texto="haz algo"),
    ):
        estado, j = puerta.enviar("dev", **entrada)
        assert (estado, j["codigo"]) == (403, "solo-dueno"), entrada
    assert puerta.enviar("nadie", fuente="direccion", accion="decir", texto="hola")[0] == 403
    assert puerta.http("POST", "/v1/genesis/chats/entrada", None, {"v": 1})[0] == 401
    # Lo que SÍ puede: escribir al hilo. La Mac lo publica en `mando` sin despertar a ningún agente.
    estado, j = puerta.enviar("dev", fuente="direccion", accion="decir", texto="nota del desarrollador", canales=["mando"])
    assert estado == 201
    mac.vuelta()
    assert mac.local.posts == [] and mac.puente.ordenes == [] and mac.puente.dichos == []
    assert [(p["de"], p["rol"], p["canal"], p["canales"]) for p in mac.director.publicados] == \
        [("genesis-web-aaaaaaaa", "agente", "mando", None)]
    assert puerta.acuses("dev", j["id"])[j["id"]]["estado"] == "hecho"


def test_un_dueno_que_falta_en_la_lista_de_la_mac_es_rechazado_en_la_mac(puerta, mac):
    estado, j = puerta.enviar("dueno2", fuente="puente:hermes-avisos", accion="orden",
                              orden={"nombre": "soltar", "args": ["T7"]})
    assert estado == 201                                   # para la puerta es dueño…
    mac.vuelta()
    assert mac.puente.ordenes == []                        # …para la Mac, no
    a = puerta.acuses("dueno2", j["id"])[j["id"]]
    assert (a["estado"], a["detalle"]) == ("rechazado", L.FUERA_DE_LISTA)
    assert mac.registro()[-1]["resultado"] == "rechazado"


def test_sin_la_lista_de_cuentas_la_mac_no_ejecuta_nada(puerta):
    m = Mac(puerta, lista=False)
    try:
        estado, j = puerta.enviar("dueno", fuente="puente:hermes-avisos", accion="orden",
                                  orden={"nombre": "aprobar", "args": ["T2"]})
        assert estado == 201
        m.vuelta()
        assert m.puente.ordenes == []
        assert puerta.acuses("dueno", j["id"])[j["id"]]["detalle"] == L.SIN_LISTA
    finally:
        m.limpiar()


# ── 3. caducidad (30 min) ────────────────────────────────────────────────────

def test_una_orden_que_la_mac_recoge_pasados_30_min_caduca_sin_ejecutarse(puerta):
    m = Mac(puerta, ahora=lambda: time.time() + 31 * 60)     # la Mac despierta 31 min después
    try:
        estado, j = puerta.enviar("dueno", fuente="puente:hermes-avisos", accion="orden",
                                  orden={"nombre": "aprobar", "args": ["T3"]})
        assert estado == 201
        m.vuelta()
        assert m.puente.ordenes == []
        a = puerta.acuses("dueno", j["id"])[j["id"]]
        # GEN1114INT: la caducidad la pone ahora la firma (§3.5 paso 5), con su detalle «[caducada] …».
        assert a["estado"] == "caducado" and a["detalle"].startswith("[caducada]")
    finally:
        m.limpiar()


# ── 4. Mac → puerta → web: el espejo vuelve por `feed` con lo que pinta la pestaña ────

CAMPOS_TARJETA = {"id", "t", "de", "rol", "tipo", "texto", "canal"}     # TarjetaDireccion / TarjetaPuente


def _mensaje(ident, t, texto, **kw):
    m = {"id": ident, "t": t, "de": "alex", "rol": "alex", "tipo": "mensaje", "texto": texto, "canal": "mando"}
    m.update(kw)
    return m


def test_el_espejo_de_la_mac_vuelve_por_feed_con_los_campos_que_pinta_la_pestana(puerta, mac):
    _drenar(puerta)
    yo, respuesta, aviso = "md-1800000002000-0a01", "md-1800000002001-0a02", "cn-1800000002-vigilante"
    mac.local.feed = {
        "mensajes": [
            _mensaje(yo, "2027-01-15T08:00:00Z", "Prueba GEN1113 desde el móvil", canales=["director-presidente"],
                     modelo="director-presidente/auto"),
            _mensaje(respuesta, "2027-01-15T08:00:05Z", "Recibido, clave sk-abcdefghijklmnopqrst fuera",
                     de="director-presidente", rol="director", tipo="respuesta", canal="director-presidente",
                     respondeA=yo, sintesis=True),
            {"id": aviso, "t": "2027-01-15 08:00:06", "de": "vigilante", "rol": "director", "tipo": "aviso",
             "texto": "Cola parada", "canal": "mando"},
            {"id": aviso + "-2", "t": "2027-01-15 08:00:07", "de": "guardia", "rol": "director", "tipo": "aviso",
             "texto": "Freno puesto", "canal": "mando"},
        ],
        "entregas": {yo: {"director-presidente": "pendiente"}},
        "detalles": {},
    }
    mac.svc._marcar_origen({"id": yo})            # lo escribió la web (lo hace la Mac al ejecutar la entrada)
    mac.tocar()
    assert mac.svc.tick_espejo() == "subido"

    estado, j = puerta.feed("dueno", "direccion", limite=500)
    assert estado == 200 and j["latido"]["de"] == "mac"
    por_id = {r["id"]: r for r in j["registros"]}
    assert CAMPOS_TARJETA <= set(por_id[yo]) and CAMPOS_TARJETA <= set(por_id[respuesta])
    assert por_id[yo]["origen"] == "genesis-web"                       # «vía Genesis en Astraura»
    assert por_id[yo]["entregas"] == {"director-presidente": {"estado": "pendiente"}}
    assert por_id[respuesta]["respondeA"] == yo and por_id[respuesta]["sintesis"] is True
    assert "sk-abcdefghijklmnopqrst" not in json.dumps(j)                # tachado otra vez antes de salir
    assert all(r["fuente"] == "direccion" and isinstance(r["cursor"], int) for r in j["registros"])
    # Los puentes A y C reciben su parte; el desarrollador lee la dirección y los avisos, no el puente A.
    assert [r["id"] for r in puerta.feed("dueno", "puente:hermes-avisos")[1]["registros"]][-2:] == [aviso, aviso + "-2"]
    assert [r["texto"] for r in puerta.feed("dev", "puente:avisos-directores")[1]["registros"]][-2:] == \
        ["Cola parada", "Freno puesto"]
    assert puerta.feed("dev", "direccion")[0] == 200
    assert puerta.feed("dev", "puente:hermes-avisos")[0] == 403
    assert puerta.feed("nadie", "direccion")[0] == 403
    assert puerta.http("GET", "/v1/genesis/chats/feed?fuente=direccion")[0] == 401
    # Lo que lee «Conexiones de chat» (GEN1113E): sin cursor y con límite 1, el ÚLTIMO registro.
    assert [r["id"] for r in puerta.feed("dueno", "puente:hermes-avisos", limite=1)[1]["registros"]] == [aviso + "-2"]

    # La entrega cambia en la Mac (pendiente → respondido): vuelve UNA vez, reemplazando por id.
    cursor = j["cursor"]
    mac.local.feed["entregas"] = {yo: {"director-presidente": "respondido"}}
    mac.tocar()
    assert mac.svc.tick_espejo() == "subido"
    nuevo = puerta.feed("dueno", "direccion", desde=cursor, esperar=1)[1]["registros"]
    assert [(r["id"], r["entregas"]["director-presidente"]["estado"], r["origen"]) for r in nuevo] == \
        [(yo, "respondido", "genesis-web")]
    todos = puerta.feed("dueno", "direccion", limite=500)[1]["registros"]
    assert [r["id"] for r in todos].count(yo) == 1


# ── 5. web → puerta → A1 (GEN1113F, destino a1) ──────────────────────────────

class BotFalso:
    """Lo que `peticiones_puerta.Puente` usa del módulo del bot del A1, en una carpeta temporal."""

    def __init__(self, carpeta):
        self.DIR = carpeta
        self.COLA = os.path.join(carpeta, "cola.json")
        self.ESTADO = os.path.join(carpeta, "estado.json")
        self.AYUDA = "Escribe tu petición. Órdenes: /estado /ayuda"
        self.bloqueo = threading.Lock()
        self.hay_trabajo = threading.Event()
        self.lineas = []

    @staticmethod
    def leer_json(ruta, defecto):
        try:
            with open(ruta, encoding="utf-8") as f:
                return json.load(f)
        except (OSError, ValueError):
            return defecto

    @staticmethod
    def escribir_json(ruta, datos):
        with open(ruta, "w", encoding="utf-8") as f:
            json.dump(datos, f, ensure_ascii=False)

    @staticmethod
    def texto_estado(cola, nb):
        return "Peticiones en cola: %d" % len(cola)

    def log(self, *partes):
        self.lineas.append(" ".join(str(p) for p in partes))

    # GEN1114INT · lo que GEN1114D usa del módulo del bot (en peticiones_telegram.py, leídos de esta carpeta).
    def leer_privado(self, ruta, defecto=None):
        try:
            st = os.stat(ruta)
        except OSError:
            return defecto
        return defecto if st.st_uid != os.getuid() or st.st_mode & 0o077 else self.leer_json(ruta, defecto)

    def chat_a1(self):
        d = self.leer_privado(os.path.join(self.DIR, "chat-a1.json"))
        return {"id": d["id"], "nombre": d["nombre"], "alias": d.get("alias") or []} if isinstance(d, dict) else None

    def texto_ayuda(self):
        return self.AYUDA


@pytest.fixture
def a1(puerta):
    carpeta = tempfile.mkdtemp(prefix="cruce-a1-")
    bot = BotFalso(carpeta)
    ruta = os.path.join(carpeta, "cuentas.json")
    with open(ruta, "w", encoding="utf-8") as f:
        json.dump({"duenos": [puerta.cuentas["dueno"]]}, f)
    os.chmod(ruta, 0o600)
    # GEN1114INT: la lista de aparatos que lleva la Mac (600); sin chat-a1.json vale el id provisional común.
    ruta = os.path.join(carpeta, "aparatos.json")
    with open(ruta, "w", encoding="utf-8") as f:
        json.dump({"v": 1, "aparatos": [a.fila() for a in puerta.aparatos.values()]}, f)
    os.chmod(ruta, 0o600)
    puerta.abrir_a1(True)
    p = PP.Puente(bot, CLIENTE.Puerta(url=puerta.base, ficha=puerta.fichas["a1"]), dormir=lambda s: None)
    yield p, bot
    puerta.abrir_a1(False)
    shutil.rmtree(carpeta, ignore_errors=True)


def test_peticiones_por_el_a1_entran_en_su_cola_y_contestan_al_espejo(puerta, a1):
    p, bot = a1
    e1 = puerta.enviar("dueno", fuente="puente:peticiones", accion="texto", texto="Haz una infografía de la síntesis")
    e2 = puerta.enviar("dueno", fuente="puente:peticiones", accion="orden", orden={"nombre": "estado", "args": []})
    e3 = puerta.enviar("dueno", fuente="puente:peticiones", accion="orden", orden={"nombre": "pausa", "args": []})
    e4 = puerta.enviar("dueno2", fuente="puente:peticiones", accion="texto", texto="no estoy en la lista del A1")
    assert [(e[0], e[1]["destino"]) for e in (e1, e2, e3, e4)] == [(201, "a1")] * 4
    # La Mac no ve nada del A1.
    mac = Mac(puerta)
    try:
        mac.vuelta()
        assert mac.puente.ordenes == [] and mac.local.posts == []
    finally:
        mac.limpiar()
    p.una_vuelta()
    a = puerta.acuses("dueno", e1[1]["id"], e2[1]["id"], e3[1]["id"])
    assert [a[e[1]["id"]]["estado"] for e in (e1, e2, e3)] == ["hecho", "hecho", "rechazado"]
    assert "aún no existe" in a[e3[1]["id"]]["detalle"]
    assert puerta.acuses("dueno2", e4[1]["id"])[e4[1]["id"]]["estado"] == "rechazado"
    cola = bot.leer_json(bot.COLA, [])
    assert [(x["id"], x["origen"], x["texto"]) for x in cola] == \
        [("g-%d" % e1[1]["id"], "genesis", "Haz una infografía de la síntesis")]
    # Las respuestas vuelven por `feed` del puente B, con los campos que pinta la pestaña, y el latido es del A1.
    estado, j = puerta.feed("dueno", "puente:peticiones", limite=500)
    assert estado == 200 and j["latido"]["de"] == "a1"
    textos = [r["texto"] for r in j["registros"]]
    assert any(t.startswith("Recibido") for t in textos) and "Peticiones en cola: 1" in textos
    for r in j["registros"]:
        assert CAMPOS_TARJETA <= set(r) and (r["de"], r["rol"], r["tipo"], r["canal"]) == \
            ("peticiones-a1", "sistema", "respuesta", "mando")
    assert puerta.feed("dev", "puente:peticiones")[0] == 403
    # Las fichas solo ven y escriben lo suyo.
    assert puerta.http("GET", "/v1/genesis/chats/entrada?destino=mac", ficha="a1")[0] == 403
    assert puerta.http("GET", "/v1/genesis/chats/entrada?destino=a1", ficha="mac")[0] == 403
    assert puerta.http("POST", "/v1/genesis/chats/espejo", cuerpo={"fuente": "puente:peticiones", "registros": []},
                       ficha="mac")[0] == 403
    assert puerta.http("POST", "/v1/genesis/chats/espejo", cuerpo={"fuente": "direccion", "registros": []},
                       ficha="a1")[0] == 403


# ── 6. la puerta caduca lo que nadie recogió en 30 min (va al final: adelanta su reloj) ────

def test_la_puerta_no_entrega_una_orden_que_nadie_recogio_en_30_min(puerta, mac):
    _drenar(puerta)
    estado, j = puerta.enviar("dueno", fuente="puente:hermes-avisos", accion="orden",
                              orden={"nombre": "rechazar", "args": ["T9"]})
    # GEN1114INT: un texto a Hermes ya es «alto» (caduca a los 30 min); lo que no caduca es una nota al hilo.
    texto = puerta.enviar("dueno", fuente="direccion", accion="decir", texto="esto no caduca", canales=["mando"])
    assert estado == 201 and texto[0] == 201
    puerta.avanzar(31 * 60 * 1000)
    mac.vuelta()
    assert mac.puente.ordenes == []
    a = puerta.acuses("dueno", j["id"], texto[1]["id"])
    assert a[j["id"]]["estado"] == "caducado"
    assert a[texto[1]["id"]]["estado"] == "hecho"      # un mensaje no caduca: se entrega tarde
