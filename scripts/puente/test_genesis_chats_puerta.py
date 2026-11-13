#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas sin red de genesis_chats_puerta.py (GEN1113B): puerta y Genesis falsos, reloj falso,
puente.py y director_chat.publicar falsos. Nada toca ~/.starseed, el canal real ni la red."""
import importlib.util
import json
import os
import re
import shutil
import stat
import sys
import tempfile
import types
import unittest

CARPETA = os.path.dirname(os.path.abspath(__file__))
if CARPETA not in sys.path:
    sys.path.insert(0, CARPETA)

import director_chat  # noqa: E402
import genesis_chats_logica as L  # noqa: E402
import genesis_chats_puerta as G  # noqa: E402
import puerta_datos_cliente  # noqa: E402
import genesis_firma_logica as F  # noqa: E402  (GEN1114B)
from test_genesis_firma_logica import CANON, Aparato  # noqa: E402  (GEN1114B)

_spec = importlib.util.spec_from_file_location("telegram_puente_prueba_puerta", os.path.join(CARPETA, "telegram-puente.py"))
TG = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(TG)

DUENO = "11111111-2222-4333-8444-555555555555"
DESA = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"
OTRO = "99999999-8888-4777-8666-555555555555"
URL = "https://puerta.ejemplo.invalid"
FICHA = "pd_" + "F" * 40
T0 = 1_800_000_000.0


class Reloj:
    def __init__(self, t=T0):
        self.t = t

    def __call__(self):
        return self.t


class PuenteFalso:
    def __init__(self):
        self.ordenes, self.dichos, self.rc = [], [], 0

    def orden(self, accion, ids, extra=None):
        self.ordenes.append({"accion": accion, "ids": ids, "extra": extra, "quien": os.environ.get("STARSEED_IDE")})
        print("esto no debe salir por el registro del servicio")
        return self.rc

    def decir(self, texto, quien=None, tipo="mensaje", tarea=None):
        self.dichos.append({"texto": texto, "quien": quien, "tipo": tipo})


class DirectorFalso:
    tachar = staticmethod(director_chat.tachar)

    def __init__(self):
        self.publicados = []

    def publicar(self, texto, de, rol="director", tipo="informe", canal="mando", **kw):
        m = {"id": "md-1800000000000-00%02d" % len(self.publicados), "texto": texto, "de": de, "rol": rol, "canal": canal}
        self.publicados.append(m)
        return m


class Red:
    """La puerta y Genesis local de mentira: guarda cada llamada y contesta según la ruta."""

    def __init__(self):
        self.llamadas, self.entradas, self.feed = [], [], {"mensajes": [], "entregas": {}, "detalles": {}}
        self.codigo_acuse, self.codigo_espejo, self.al_acusar = 200, 200, None
        self.estado_genesis = {"cuentas": {"ola": "1113", "integradas": 1, "enCurso": 0, "esperandoAprobacion": 2, "pendientes": 3}}

    def __call__(self, metodo, url, cab, cuerpo=None, timeout=8):
        self.llamadas.append({"metodo": metodo, "url": url, "cab": dict(cab), "cuerpo": json.loads(json.dumps(cuerpo))})
        if url.startswith(URL + "/v1/genesis/chats/entrada"):
            return 200, {"entradas": list(self.entradas)}
        if url == URL + "/v1/genesis/chats/acuse":
            if self.al_acusar:
                self.al_acusar(cuerpo)
            return self.codigo_acuse, {"ok": True}
        if url == URL + "/v1/genesis/chats/espejo":
            return self.codigo_espejo, {"ok": True, "n": len(cuerpo["registros"]), "cursor": 1}
        if url.startswith("http://127.0.0.1:9002/api/mando/director-chat") and metodo == "GET":
            return 200, self.feed
        if url == "http://127.0.0.1:9002/api/mando/director-chat":
            return 200, {"pendiente": True, "mensaje": {"id": "md-1800000000000-beef"}}
        if url == "http://127.0.0.1:9002/api/mando/estado":
            return 200, self.estado_genesis
        raise AssertionError("ruta inesperada")

    def a(self, prefijo, metodo=None):
        return [c for c in self.llamadas if c["url"].startswith(prefijo) and (metodo is None or c["metodo"] == metodo)]


# GEN1114B · la Mac solo ejecuta entradas firmadas por un aparato emparejado: cada entrada de estas pruebas
# va firmada por un aparato de prueba de su cuenta (todos de nivel «completo» y en la lista de altas), con
# el chat y el nombre del `canon.json` de ejemplo del contrato GEN1114 §8.3.
APARATOS = {c: Aparato(cuenta=c, nivel="completo") for c in (DUENO, DESA, OTRO)}
CHATS = {"direccion": ("genesis", "GENESIS · StarSeed OS"), "puente:hermes-avisos": ("telegram.ejemplo_a_bot", "Bot A de ejemplo")}
CAMPOS_ENTRADA = ("v", "nonce", "t", "fuente", "accion", "orden", "texto", "canales", "modelo", "respondeA", "reenviar")
_SEQ = [0]


def firmada(e):
    """La fila v2 que entregaría la puerta para la entrada de GEN1113 `e` (firmada por su aparato)."""
    _SEQ[0] += 1
    ap = APARATOS[e["cuenta"]]
    ent = {k: e[k] for k in CAMPOS_ENTRADA if e.get(k) is not None}
    rec = F.epoch_de(e["recibido"])
    c = ap.carga(ent, chat=CHATS[e["fuente"]], t=rec, seq=_SEQ[0])
    return ap.sobre(c, ident=e["id"], rol=e["rol"], recibido=rec)


def entrada(ident=1, **kw):
    e = {"v": 1, "id": ident, "nonce": ("n%d" % ident).ljust(24, "x"), "t": "2027-01-15T08:00:00Z",
         "fuente": "puente:hermes-avisos", "accion": "orden", "orden": {"nombre": "aprobar", "args": ["T1"]},
         "cuenta": DUENO, "rol": "dueño", "destino": "mac", "recibido": L.iso_utc(T0 - 60)}
    e.update(kw)
    return firmada(e)
# /GEN1114B


class Base(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp(prefix="genesis-chats-pruebas-")
        self.base = os.path.join(self.dir, "genesis-chats")
        self.raiz = os.path.join(self.dir, "raiz")
        self.red, self.reloj, self.p, self.d = Red(), Reloj(), PuenteFalso(), DirectorFalso()
        self.mtimes = {}
        self.log = []
        self.ide_antes = os.environ.get("STARSEED_IDE")
        tg = types.SimpleNamespace(parsear_orden=TG.parsear_orden, es_repetido=TG.es_repetido, _importa=lambda f: True)
        # GEN1114B: la lista de altas (aquí de este usuario, en una carpeta temporal) y el canon de ejemplo.
        self.ruta_altas = os.path.join(self.dir, "StarSeed", "genesis-aparatos.json")
        os.makedirs(os.path.dirname(self.ruta_altas), mode=0o755)
        G.escribir_json(self.ruta_altas, {"v": 1, "aparatos": [a.fila() for a in APARATOS.values()]})
        os.chmod(self.ruta_altas, 0o644)
        G.escribir_json(os.path.join(self.base, "canon.json"), CANON)
        self.svc = G.PuenteGenesis(URL, FICHA, base=self.base, raiz=self.raiz, mando="http://127.0.0.1:9002",
                                   http=self.red, ahora=self.reloj, stat=self._stat,
                                   modulos={"puente": self.p, "telegram": tg, "director_chat": self.d,
                                            "cliente": puerta_datos_cliente},
                                   salida=self.log.append, ruta_altas=self.ruta_altas, dueno_altas=os.getuid(),
                                   llevar=lambda **kw: (True, "prueba"))

    def tearDown(self):
        shutil.rmtree(self.dir, ignore_errors=True)
        self.assertEqual(os.environ.get("STARSEED_IDE"), self.ide_antes)

    def _stat(self, ruta):
        if ruta not in self.mtimes:
            raise FileNotFoundError(ruta)
        return types.SimpleNamespace(st_mtime_ns=self.mtimes[ruta])

    def cuentas(self, duenos=(DUENO,), desarrolladores=(DESA,)):
        G.escribir_cuentas(os.path.join(self.base, "cuentas.json"), duenos, desarrolladores)

    def acuses(self):
        """Los acuses FINALES (GEN1113INT: antes de ejecutar va además un «entregado» intermedio)."""
        return [c["cuerpo"] for c in self.red.a(URL + "/v1/genesis/chats/acuse") if c["cuerpo"]["estado"] != "entregado"]

    def todos_los_acuses(self):
        return [c["cuerpo"] for c in self.red.a(URL + "/v1/genesis/chats/acuse")]

    def registro(self):
        try:
            with open(os.path.join(self.base, "registro.jsonl"), encoding="utf-8") as f:
                return [json.loads(x) for x in f.read().splitlines()]
        except OSError:
            return []


class Entradas(Base):
    def test_sin_lista_de_cuentas_no_ejecuta_nada(self):
        self.red.entradas = [entrada(1), entrada(2, accion="texto", orden=None, texto="hola")]
        self.assertTrue(self.svc.ciclo_entradas())
        self.assertEqual(self.p.ordenes, [])
        self.assertEqual(self.red.a("http://127.0.0.1:9002", "POST"), [])
        self.assertEqual([(a["id"], a["estado"], a["detalle"]) for a in self.acuses()],
                         [(1, "rechazado", L.SIN_LISTA), (2, "rechazado", L.SIN_LISTA)])
        self.assertEqual([r["resultado"] for r in self.registro()], ["rechazado", "rechazado"])
        self.assertEqual(self.svc.estado["cursor_entradas"], 2)

    def test_lista_con_permisos_abiertos_no_vale(self):
        self.cuentas()
        os.chmod(os.path.join(self.base, "cuentas.json"), 0o644)
        self.red.entradas = [entrada(1)]
        self.svc.ciclo_entradas()
        self.assertEqual(self.p.ordenes, [])
        self.assertEqual(self.acuses()[0]["detalle"], L.SIN_LISTA)

    def test_dueno_de_la_puerta_fuera_de_la_lista_es_lector(self):
        self.cuentas()
        self.red.entradas = [entrada(1, cuenta=OTRO)]
        self.svc.ciclo_entradas()
        self.assertEqual(self.p.ordenes, [])
        self.assertEqual(self.acuses()[0]["estado"], "rechazado")

    def test_desarrollador_con_aprobar_rechazado(self):
        self.cuentas()
        self.red.entradas = [entrada(1, cuenta=DESA, rol="desarrollador")]
        self.svc.ciclo_entradas()
        self.assertEqual(self.p.ordenes, [])
        self.assertEqual((self.acuses()[0]["estado"], self.acuses()[0]["detalle"]), ("rechazado", L.SOLO_DUENO))
        self.assertEqual(self.registro()[0]["resultado"], "rechazado")

    def test_dueno_con_aprobar_llama_a_puente_orden_con_quien(self):
        self.cuentas()
        self.red.entradas = [entrada(1, orden={"nombre": "aprobar", "args": ["zN4", "zN5"]})]
        self.svc.ciclo_entradas()
        self.assertEqual(self.p.ordenes, [{"accion": "aprobar", "ids": ["zN4", "zN5"], "extra": None,
                                           "quien": "genesis-web-11111111"}])
        self.assertEqual(self.acuses()[0]["estado"], "hecho")
        self.assertFalse(any("no debe salir" in x for x in self.log))

    def test_orden_de_31_min_caduca_sin_ejecutarse(self):
        self.cuentas()
        self.red.entradas = [entrada(1, recibido=L.iso_utc(T0 - 31 * 60))]
        self.svc.ciclo_entradas()
        self.assertEqual(self.p.ordenes, [])
        self.assertEqual((self.acuses()[0]["estado"], self.acuses()[0]["detalle"]),
                         ("caducado", F.texto_de_motivo("caducada")))     # GEN1114B: la caducidad firmada
        self.assertEqual(self.registro()[0]["resultado"], "caducado")

    def test_nonce_visto_se_ignora(self):
        self.cuentas()
        self.red.entradas = [entrada(1)]
        self.svc.ciclo_entradas()
        # La puerta la vuelve a entregar (p. ej. tras perder el acuse): no se ejecuta otra vez.
        self.svc.estado["cursor_entradas"] = 0
        self.svc.ciclo_entradas()
        self.assertEqual(len(self.p.ordenes), 1)
        self.assertEqual([a["estado"] for a in self.acuses()], ["hecho", "hecho"])
        # Otro id con el mismo nonce: rechazado y sin ejecutar.
        self.red.entradas = [entrada(5, nonce="n1".ljust(24, "x"))]     # GEN1114B: el nonce va en la carga
        self.svc.ciclo_entradas()
        self.assertEqual(len(self.p.ordenes), 1)
        self.assertEqual((self.acuses()[-1]["estado"], self.acuses()[-1]["detalle"]),
                         ("rechazado", F.texto_de_motivo("nonce-repetido")))     # GEN1114B

    def test_interrumpida_a_medias_no_se_repite(self):
        self.cuentas()
        e = entrada(1)
        G.escribir_json(os.path.join(self.base, "vistos.json"),       # GEN1114B: la clave sale de la carga
                        {"%s:%s" % (DUENO, "n1".ljust(24, "x")): {"t": T0, "id": 1, "estado": "en-curso"}})
        self.red.entradas = [e]
        self.svc.ciclo_entradas()
        self.assertEqual(self.p.ordenes, [])
        self.assertEqual(self.acuses()[0]["estado"], "fallo")

    def test_acuse_solo_despues_de_ejecutar_y_anotar(self):
        self.cuentas()
        vistos_ruta = os.path.join(self.base, "vistos.json")

        def comprobar(cuerpo):
            self.assertEqual(len(self.p.ordenes), 1)
            vistos = G.leer_json(vistos_ruta, {})
            self.assertEqual([v["estado"] for v in vistos.values()], ["hecho", "hecho"])   # GEN1114B: seq y nonce
            self.assertEqual(self.registro()[-1]["resultado"], "hecho")
            comprobar.veces += 1
        comprobar.veces = 0
        self.red.al_acusar = comprobar
        self.red.entradas = [entrada(1)]
        self.svc.ciclo_entradas()
        self.assertEqual(comprobar.veces, 1)

    def test_sin_acuse_no_avanza_el_cursor(self):
        self.cuentas()
        self.red.codigo_acuse = 503
        self.red.entradas = [entrada(1), entrada(2)]
        self.assertFalse(self.svc.ciclo_entradas())
        self.assertEqual(self.svc.estado.get("cursor_entradas", 0), 0)
        self.assertEqual(len(self.p.ordenes), 1)      # la segunda espera a que se confirme la primera
        self.red.codigo_acuse = 200
        self.assertTrue(self.svc.ciclo_entradas())
        self.assertEqual(len(self.p.ordenes), 2)      # la primera NO se repite: solo su acuse
        self.assertEqual(self.svc.estado["cursor_entradas"], 2)


    def test_texto_suelto_del_puente_a_va_a_hermes_por_la_ruta_local(self):
        self.cuentas()
        self.red.entradas = [entrada(1, accion="texto", orden=None, texto="revisa el pulso")]
        self.svc.ciclo_entradas()
        posts = self.red.a("http://127.0.0.1:9002/api/mando/director-chat", "POST")
        self.assertEqual(len(posts), 1)
        self.assertEqual(posts[0]["cuerpo"], {"accion": "decir", "texto": "revisa el pulso",
                                              "modelo": "hermes/predeterminado", "canales": ["hermes"]})
        self.assertNotIn("Authorization", posts[0]["cab"])   # la ficha nunca va a Genesis local
        self.assertEqual(self.acuses()[0]["estado"], "hecho")

    def test_desarrollador_escribe_solo_al_hilo(self):
        self.cuentas()
        self.red.entradas = [entrada(1, fuente="direccion", accion="decir", orden=None, texto="nota", canales=["mando"],
                                     modelo="director-presidente/auto", cuenta=DESA, rol="desarrollador")]
        self.svc.ciclo_entradas()
        self.assertEqual(self.red.a("http://127.0.0.1:9002", "POST"), [])
        self.assertEqual(self.d.publicados[0]["de"], "genesis-web-aaaaaaaa")
        self.assertEqual(self.d.publicados[0]["rol"], "agente")
        self.assertIn("md-1800000000000-0000", self.svc.origen_web)

    def test_lectura_estado_y_su_respuesta_en_el_espejo(self):
        self.cuentas()
        self.red.entradas = [entrada(1, accion="texto", orden=None, texto="/estado")]
        self.svc.ciclo_entradas()
        self.assertEqual(len(self.red.a("http://127.0.0.1:9002/api/mando/estado", "GET")), 1)
        self.assertIn("aprobación 2", self.acuses()[0]["detalle"])
        self.svc.tick_espejo()
        subidas = [c["cuerpo"] for c in self.red.a(URL + "/v1/genesis/chats/espejo")
                   if c["cuerpo"]["fuente"] == "puente:hermes-avisos"]
        self.assertEqual(len(subidas), 1)
        self.assertEqual(subidas[0]["registros"][0]["tipo"], "respuesta")

    def test_el_registro_nunca_lleva_texto(self):
        self.cuentas()
        self.red.entradas = [
            entrada(1, accion="texto", orden=None, texto="SECRETO-UNO"),
            entrada(2, accion="texto", orden=None, texto="/decir SECRETO-DOS"),
            entrada(3, accion="texto", orden=None, texto="/a Claude SECRETO-TRES"),
            entrada(4, fuente="direccion", accion="decir", orden=None, texto="SECRETO-CUATRO", canales=["mando"]),
            entrada(5, accion="orden", orden={"nombre": "SECRETO-CINCO", "args": ["SECRETO-SEIS"]}),
            entrada(6, cuenta=DESA, rol="desarrollador", accion="texto", orden=None, texto="SECRETO-SIETE"),
        ]
        self.svc.ciclo_entradas()
        with open(os.path.join(self.base, "registro.jsonl"), encoding="utf-8") as f:
            crudo = f.read()
        self.assertEqual(len(crudo.splitlines()), 6)
        self.assertNotIn("SECRETO", crudo)
        self.assertNotIn(DUENO, crudo)
        self.assertFalse(any("SECRETO" in x for x in self.log))
        self.assertEqual(stat.S_IMODE(os.stat(os.path.join(self.base, "registro.jsonl")).st_mode), 0o600)


def mensaje(ident, t, texto="hola", **kw):
    m = {"id": ident, "t": t, "de": "alex", "rol": "alex", "tipo": "mensaje", "texto": texto, "canal": "mando"}
    m.update(kw)
    return m


class Espejo(Base):
    def tocar(self, nombre="chat", ns=1):
        self.mtimes[G.rutas_feed(self.raiz)[nombre]] = ns

    def lecturas(self):
        return self.red.a("http://127.0.0.1:9002/api/mando/director-chat", "GET")

    def subidas(self, fuente=None):
        return [c["cuerpo"] for c in self.red.a(URL + "/v1/genesis/chats/espejo")
                if c["cuerpo"]["registros"] and (fuente is None or c["cuerpo"]["fuente"] == fuente)]

    def test_solo_lee_si_cambio_un_mtime(self):
        self.tocar()
        self.red.feed["mensajes"] = [mensaje("md-1800000000000-0001", "2027-01-15T08:00:00Z")]
        self.assertEqual(self.svc.tick_espejo(), "subido")
        self.assertEqual(len(self.lecturas()), 1)
        for _ in range(3):
            self.reloj.t += 1
            self.assertEqual(self.svc.tick_espejo(), "sin-cambios")
        self.assertEqual(len(self.lecturas()), 1)
        self.tocar("eventos", 5)
        self.svc.tick_espejo()
        self.assertEqual(len(self.lecturas()), 2)
        self.assertIn("desde=", self.lecturas()[1]["url"])
        # El mismo mensaje no se sube dos veces.
        self.assertEqual(len(self.subidas("direccion")), 1)

    def test_tacha_otra_vez_antes_de_subir(self):
        self.tocar()
        jwt = "eyJhbGciOiJFUzI1NiJ9.eyJzdWIiOiJ4In0.ZmlybWFmaXJtYQ"
        self.red.feed["mensajes"] = [mensaje("md-1800000000000-0002", "2027-01-15T08:00:00Z",
                                             texto="clave sk-abcdefghijklmnopqrst y %s" % jwt)]
        self.red.feed["entregas"] = {"md-1800000000000-0002": {"hermes": "fallo"}}
        self.red.feed["detalles"] = {"md-1800000000000-0002": {"hermes": "Bearer abcdefghijklmnop"}}
        self.svc.tick_espejo()
        crudo = json.dumps(self.subidas())
        self.assertNotIn("sk-abcdefghijklmnopqrst", crudo)
        self.assertNotIn(jwt, crudo)
        self.assertNotIn("abcdefghijklmnop", crudo)
        self.assertIn("[oculto]", crudo)
        r = self.subidas("direccion")[0]["registros"][0]
        self.assertEqual(r["fuente"], "direccion")
        self.assertEqual(r["entregas"]["hermes"]["estado"], "fallo")

    def test_lotes_de_200_y_fuentes(self):
        self.tocar()
        self.red.feed["mensajes"] = [mensaje("md-18000000%05d-0001" % i, "2027-01-15T08:00:00Z") for i in range(250)]
        self.red.feed["mensajes"].append({"id": "cn-1-vigilante", "t": "2027-01-15 08:00:01", "de": "vigilante",
                                          "rol": "director", "tipo": "aviso", "texto": "repito", "canal": "mando"})
        self.svc.tick_espejo()
        self.assertEqual([len(s["registros"]) for s in self.subidas("direccion")], [200, 51])
        self.assertEqual(len(self.subidas("puente:hermes-avisos")), 1)
        self.assertEqual(len(self.subidas("puente:avisos-directores")), 1)

    def test_si_la_puerta_falla_no_avanza(self):
        self.tocar()
        self.red.feed["mensajes"] = [mensaje("md-1800000000000-0003", "2027-01-15T08:00:00Z")]
        self.red.codigo_espejo = 503
        self.assertEqual(self.svc.tick_espejo(), "fallo")
        self.red.codigo_espejo = 200
        self.assertEqual(self.svc.tick_espejo(), "subido")    # vuelve a leer: el mtime no se dio por visto
        self.assertEqual(len(self.lecturas()), 2)
        self.assertEqual(len(self.subidas("direccion")), 2)

    def test_latido_cada_30_s(self):
        self.svc.tick_espejo()
        self.reloj.t += 10
        self.svc.tick_espejo()
        self.reloj.t += 25
        self.svc.tick_espejo()
        latidos = [c["cuerpo"] for c in self.red.a(URL + "/v1/genesis/chats/espejo") if c["cuerpo"].get("latido")]
        self.assertEqual(len(latidos), 2)
        self.assertEqual(latidos[0], {"fuente": "direccion", "registros": [], "latido": True})
        cab = self.red.a(URL)[0]["cab"]
        self.assertEqual(cab["Authorization"], "Bearer " + FICHA)

    def test_cambio_de_entrega_se_vuelve_a_subir_y_marca_origen(self):
        self.svc.origen_web["md-1800000000000-0004"] = True
        self.tocar()
        self.red.feed["mensajes"] = [mensaje("md-1800000000000-0004", "2027-01-15T08:00:00Z")]
        self.red.feed["entregas"] = {"md-1800000000000-0004": {"hermes": "pendiente"}}
        self.svc.tick_espejo()
        self.red.feed["mensajes"] = []
        self.red.feed["entregas"] = {"md-1800000000000-0004": {"hermes": "respondido"}}
        self.tocar(ns=2)
        self.svc.tick_espejo()
        regs = [s["registros"][0] for s in self.subidas("direccion")]
        self.assertEqual([r["entregas"]["hermes"]["estado"] for r in regs], ["pendiente", "respondido"])
        self.assertEqual(regs[0]["origen"], "genesis-web")


def _otro_hilo_puede_tomar_el_cerrojo():
    import threading
    pudo = []

    def probar():
        ok = G.CERROJO_PROCESO.acquire(blocking=False)
        pudo.append(ok)
        if ok:
            G.CERROJO_PROCESO.release()
    h = threading.Thread(target=probar)
    h.start()
    h.join()
    return pudo[0]


class Integracion1113(Base):
    """GEN1113INT: lo que hacía falta para que los seis paquetes encajen."""

    def tocar(self, nombre="chat", ns=1):
        self.mtimes[G.rutas_feed(self.raiz)[nombre]] = ns

    def subidas(self, fuente="direccion"):
        return [c["cuerpo"] for c in self.red.a(URL + "/v1/genesis/chats/espejo")
                if c["cuerpo"]["registros"] and c["cuerpo"]["fuente"] == fuente]

    def test_decir_y_a_con_el_texto_en_texto_como_los_manda_la_pestana(self):
        self.cuentas()
        self.red.entradas = [
            entrada(1, orden={"nombre": "decir", "args": []}, texto="hola a todos, " + "x" * 300),
            entrada(2, orden={"nombre": "a", "args": ["claude"]}, texto="revisa la ola"),
        ]
        self.svc.ciclo_entradas()
        self.assertEqual([a["estado"] for a in self.acuses()], ["hecho", "hecho"])
        self.assertEqual(self.p.dichos[0]["texto"], "hola a todos, " + "x" * 300)
        self.assertEqual((self.p.dichos[1]["texto"], self.p.dichos[1]["quien"]),
                         ("revisa la ola", "genesis-web-11111111|claude"))

    def test_entregado_antes_del_acuse_final(self):
        self.cuentas()
        self.red.entradas = [entrada(1), entrada(2, cuenta=OTRO)]
        self.svc.ciclo_entradas()
        self.assertEqual([(a["id"], a["estado"]) for a in self.todos_los_acuses()],
                         [(1, "entregado"), (1, "hecho"), (2, "rechazado")])

    def test_puente_orden_corre_con_el_cerrojo_del_proceso(self):
        self.cuentas()
        visto = []
        orden_real = self.p.orden

        def orden(accion, ids, extra=None):
            visto.append((os.environ.get("STARSEED_IDE"), _otro_hilo_puede_tomar_el_cerrojo()))
            return orden_real(accion, ids, extra)
        self.p.orden = orden
        self.red.entradas = [entrada(1)]
        self.svc.ciclo_entradas()
        self.assertEqual(visto, [("genesis-web-11111111", False)])
        self.assertTrue(_otro_hilo_puede_tomar_el_cerrojo())

    def test_el_espejo_clasifica_con_el_cerrojo_del_proceso(self):
        visto = []
        self.svc.mod["telegram"]._importa = lambda fila: visto.append(_otro_hilo_puede_tomar_el_cerrojo()) or True
        self.tocar()
        self.red.feed["mensajes"] = [{"id": "cn-1-vigilante", "t": "2027-01-15 08:00:01", "de": "vigilante",
                                      "rol": "director", "tipo": "aviso", "texto": "aviso", "canal": "mando"}]
        self.svc.tick_espejo()
        self.assertEqual(visto, [False])

    def test_lotes_por_tamano_y_registros_recortados(self):
        self.tocar()
        grande = "ñ" * 30000                        # 60 KB de UTF-8: no cabe en un registro de la puerta
        self.red.feed["mensajes"] = [mensaje("md-1800000000000-%04x" % i, "2027-01-15T08:00:00Z", texto="é" * 12000)
                                     for i in range(5)] + [mensaje("md-1800000000000-ffff", "2027-01-15T08:00:01Z",
                                                                   texto=grande)]
        self.assertEqual(self.svc.tick_espejo(), "subido")
        cuerpos = [len(json.dumps(c, ensure_ascii=False).encode("utf-8")) for c in self.subidas()]
        self.assertTrue(len(cuerpos) >= 2 and max(cuerpos) <= 60 * 1024, cuerpos)
        regs = [r for c in self.subidas() for r in c["registros"]]
        self.assertEqual(len(regs), 6)
        ultimo = regs[-1]
        self.assertLessEqual(len(json.dumps(ultimo, ensure_ascii=False).encode("utf-8")), L.MAX_REGISTRO_BYTES)
        self.assertTrue(ultimo["texto"].endswith(L.RECORTADO))

    def test_un_lote_que_la_puerta_rechaza_se_salta_sin_parar_el_espejo(self):
        self.tocar()
        self.red.feed["mensajes"] = [mensaje("md-1800000000000-0007", "2027-01-15T08:00:00Z")]
        self.red.codigo_espejo = 400
        self.assertNotEqual(self.svc.tick_espejo(), "fallo")
        self.assertEqual(self.svc.estado["espejo"]["saltados"], 1)

    def test_marca_via_genesis_aunque_el_espejo_lo_subiera_antes(self):
        """La ruta local publica el mensaje antes de contestar: el espejo lo sube sin marca y luego con ella."""
        self.cuentas()
        self.tocar()
        self.red.feed["mensajes"] = [mensaje("md-1800000000000-beef", "2027-01-15T08:00:00Z", texto="al presidente")]
        self.red.feed["entregas"] = {"md-1800000000000-beef": {"director-presidente": "pendiente"}}
        self.svc.tick_espejo()
        self.assertNotIn("origen", self.subidas()[0]["registros"][0])
        self.red.entradas = [entrada(1, fuente="direccion", accion="decir", orden=None, texto="al presidente",
                                     modelo="director-presidente/auto", canales=["director-presidente"])]
        self.svc.ciclo_entradas()
        self.assertEqual(self.acuses()[0]["estado"], "hecho")
        self.svc.tick_espejo()                       # sin cambios de mtime: aun así sube la marca
        ultimo = self.subidas()[-1]["registros"][0]
        self.assertEqual((ultimo["id"], ultimo["origen"]), ("md-1800000000000-beef", "genesis-web"))
        self.assertEqual(ultimo["entregas"]["director-presidente"]["estado"], "pendiente")
        n = len(self.subidas())
        self.svc.tick_espejo()
        self.assertEqual(len(self.subidas()), n)     # una sola vez


class Servicio(Base):
    def test_correr_mueve_los_dos_bucles_y_para(self):
        import threading
        self.cuentas()
        self.red.entradas = [entrada(1)]
        parar, vueltas, cerrojo = threading.Event(), [], threading.Lock()

        def dormir(s):
            with cerrojo:
                vueltas.append(s)
                if len(vueltas) >= 8:
                    parar.set()
            parar.wait(0.01)

        self.assertEqual(self.svc.correr(parar=parar, dormir=dormir), 0)
        self.assertEqual(len(self.p.ordenes), 1)
        self.assertTrue(self.red.a(URL + "/v1/genesis/chats/espejo"))
        self.assertFalse(any("error" in x for x in self.log), self.log)


class LineaDeOrdenes(Base):
    def test_cuentas_escribe_600_y_rechaza_lo_que_no_es_uuid(self):
        ruta = os.path.join(self.base, "cuentas.json")
        G.escribir_cuentas(ruta, [DUENO.upper()])
        G.escribir_cuentas(ruta, [], [DESA])
        self.assertEqual(stat.S_IMODE(os.stat(ruta).st_mode), 0o600)
        self.assertEqual(G.leer_cuentas(ruta), ({"duenos": [DUENO], "desarrolladores": [DESA]}, None))
        with self.assertRaises(ValueError):
            G.escribir_cuentas(ruta, ["alex"])
        G.escribir_cuentas(ruta, quitar=[DESA])
        self.assertEqual(G.leer_cuentas(ruta)[0]["desarrolladores"], [])
        self.assertEqual(G.leer_cuentas(os.path.join(self.base, "no-hay.json")), (None, "falta"))

    def test_estado_no_imprime_url_ficha_ni_cuentas(self):
        self.cuentas()
        env = os.path.join(self.dir, "env")
        with open(env, "w", encoding="utf-8") as f:
            f.write("export %s=%s\nexport %s=%s\n" % (G.VAR_URL, URL, G.VAR_FICHA, FICHA))
        G.escribir_json(os.path.join(self.base, "estado.json"),
                        {"espejo": {"ultimo_envio": T0 - 3, "ultimo_latido": T0 - 10, "subidos": 12},
                         "entradas": {"ultima_consulta": T0 - 1, "pendientes": 0,
                                      "ultima": {"t": T0 - 60, "id": 4, "resultado": "hecho"}}})
        texto = G.estado_texto(base=self.base, raiz=self.raiz, env_archivo=env, entorno={}, ahora=T0,
                               leer_env=puerta_datos_cliente.leer_env, plist=os.path.join(self.dir, "no.plist"))
        for prohibido in (URL, "puerta.ejemplo", FICHA, DUENO, DESA, "https://"):
            self.assertNotIn(prohibido, texto)
        self.assertIn("configurada", texto)
        self.assertIn("11111111…", texto)
        self.assertIn("hace 3 s", texto)
        self.assertIn("(hecho)", texto)
        self.assertIn("sin instalar", texto)
        sin = G.estado_texto(base=os.path.join(self.dir, "vacio"), raiz=self.raiz, env_archivo=os.path.join(self.dir, "x"),
                             entorno={}, ahora=T0, leer_env=puerta_datos_cliente.leer_env)
        self.assertIn("falta → no se ejecuta nada", sin)

    def test_url_que_no_es_https_no_vale(self):
        url, ficha = G.leer_config(os.path.join(self.dir, "x"), {G.VAR_URL: "http://1.2.3.4", G.VAR_FICHA: "f"},
                                   puerta_datos_cliente.leer_env)
        self.assertEqual((url, ficha), ("", "f"))


class Instalacion(unittest.TestCase):
    def test_plist_usa_python3_de_homebrew(self):
        import plistlib
        with open(os.path.join(CARPETA, "com.starseed.genesis-chats.plist"), "rb") as f:
            p = plistlib.load(f)
        self.assertEqual(p["Label"], "com.starseed.genesis-chats")
        self.assertEqual(p["ProgramArguments"][0], "/opt/homebrew/bin/python3")
        self.assertTrue(p["ProgramArguments"][-1].endswith("/scripts/puente/genesis_chats_puerta.py"))
        self.assertTrue(p["KeepAlive"])
        self.assertNotIn("ficha", json.dumps(p).lower())

    def test_entrada_de_instalar_servicios(self):
        # Se lee el texto: importar instalar-servicios.py INSTALA (ver su cabecera).
        with open(os.path.join(CARPETA, "instalar-servicios.py"), encoding="utf-8") as f:
            texto = f.read()
        bloque = re.search(r"# GEN1113B.*?# /GEN1113B", texto, re.S)
        self.assertIsNotNone(bloque)
        self.assertIn('SERVICIOS["genesis-chats"]', bloque.group(0))
        self.assertIn('P("genesis_chats_puerta.py")', bloque.group(0))
        self.assertIn("STARSEED_SOLO", bloque.group(0))

    def test_solo_genesis_chats_genera_su_plist_y_nada_mas(self):
        # Mismo arnés que las demás pruebas del instalador: HOME temporal y subprocess.run falso.
        from test_instalar_servicios_produccion import _cargar_con_solo
        import plistlib
        with tempfile.TemporaryDirectory() as tmp:
            _cargar_con_solo(tmp, "genesis-chats")
            ag = os.path.join(tmp, "Library", "LaunchAgents")
            self.assertEqual(os.listdir(ag), ["com.starseed.genesis-chats.plist"])
            with open(os.path.join(ag, "com.starseed.genesis-chats.plist"), "rb") as f:
                p = plistlib.load(f)
            self.assertEqual(p["ProgramArguments"][0], "/opt/homebrew/bin/python3")
            self.assertTrue(p["ProgramArguments"][-1].endswith("scripts/puente/genesis_chats_puerta.py"))
        with tempfile.TemporaryDirectory() as tmp:
            mod = _cargar_con_solo(tmp, "pruebas")
            self.assertNotIn("genesis-chats", mod.SERVICIOS)   # sin ficha en ~/.starseed/env no entra


if __name__ == "__main__":
    unittest.main()
