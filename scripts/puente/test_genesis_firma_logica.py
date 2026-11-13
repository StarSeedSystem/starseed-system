#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas sin red de genesis_firma_logica.py (GEN1114B): claves de prueba creadas aquí con `cryptography`,
reloj fijo, el `canon.json` de ejemplo del contrato (§8.3), los vectores del código (§3.3) y la tabla de
riesgo (§3.6). Las clases `Aparato` y `CANON` las usan también test_genesis_aparatos.py."""
import base64
import copy
import hashlib
import json
import os
import re
import sys
import unittest

CARPETA = os.path.dirname(os.path.abspath(__file__))
if CARPETA not in sys.path:
    sys.path.insert(0, CARPETA)

from cryptography.hazmat.primitives import hashes, serialization  # noqa: E402
from cryptography.hazmat.primitives.asymmetric import ec, utils  # noqa: E402

import genesis_chats_logica as L  # noqa: E402
import genesis_firma_logica as F  # noqa: E402

DUENO = "11111111-2222-4333-8444-555555555555"
DESA = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"
OTRO = "99999999-8888-4777-8666-555555555555"
T0 = 1_800_000_000.0

#: §8.3, tal cual (usuarios de bot inventados).
CANON = json.loads("""{"v": 2, "version": 1, "actualizado": "2026-11-13T00:00:00Z", "chats": [
 {"v": 2, "id": "genesis", "nombre": "GENESIS · StarSeed OS", "nombreProvisional": false, "tipo": "direccion", "fuente": "direccion", "alias": ["direccion", "mando"], "medios": [], "version": 1, "actualizado": "2026-11-13T00:00:00Z", "refs": [], "versiones": {}},
 {"v": 2, "id": "genesis.canal.hermes", "nombre": "Hermes", "nombreProvisional": false, "tipo": "canal-director", "padre": "genesis", "fuente": null, "alias": [], "medios": [], "version": 1, "actualizado": "2026-11-13T00:00:00Z", "refs": [], "versiones": {}},
 {"v": 2, "id": "telegram.ejemplo_a_bot", "nombre": "Bot A de ejemplo", "nombreProvisional": false, "tipo": "puente-telegram", "fuente": "puente:hermes-avisos", "alias": ["puente:hermes-avisos", "hermes-avisos", "Hermes y avisos"], "medios": [], "version": 1, "actualizado": "2026-11-13T00:00:00Z", "refs": [], "versiones": {}},
 {"v": 2, "id": "telegram.ejemplo_b_bot", "nombre": "Bot B de ejemplo", "nombreProvisional": false, "tipo": "puente-telegram", "fuente": "puente:peticiones", "alias": ["puente:peticiones", "peticiones", "Peticiones y encargos"], "medios": [], "version": 1, "actualizado": "2026-11-13T00:00:00Z", "refs": [], "versiones": {}},
 {"v": 2, "id": "telegram.ejemplo_c_bot", "nombre": "Bot C de ejemplo", "nombreProvisional": false, "tipo": "puente-telegram", "fuente": "puente:avisos-directores", "alias": ["puente:avisos-directores", "avisos-directores", "Avisos de los directores"], "medios": [], "version": 1, "actualizado": "2026-11-13T00:00:00Z", "refs": [], "versiones": {}}
]}""")

CHAT_A = ("telegram.ejemplo_a_bot", "Bot A de ejemplo")
CHAT_B = ("telegram.ejemplo_b_bot", "Bot B de ejemplo")
CHAT_G = ("genesis", "GENESIS · StarSeed OS")


def b64u(b):
    return base64.urlsafe_b64encode(b).decode().rstrip("=")


def nonce(n):
    return ("n%d" % n).ljust(24, "x")


def texto_a_hermes(n=1, texto="revisa el pulso"):
    return {"v": 1, "nonce": nonce(n), "t": F.iso_utc(T0), "fuente": "puente:hermes-avisos", "accion": "texto",
            "texto": texto}


def decir_al_hilo(n=1, texto="nota al hilo"):
    return {"v": 1, "nonce": nonce(n), "t": F.iso_utc(T0), "fuente": "direccion", "accion": "decir",
            "texto": texto, "canales": ["mando"]}


def orden_a(n=1, nombre="aprobar", args=("T1",)):
    return {"v": 1, "nonce": nonce(n), "t": F.iso_utc(T0), "fuente": "puente:hermes-avisos", "accion": "orden",
            "orden": {"nombre": nombre, "args": list(args)}}


class Aparato:
    """Un aparato de prueba: clave P-256 nueva (como la de WebCrypto) y firma r‖s de 64 bytes."""

    def __init__(self, cuenta=DUENO, nivel="completo", nombre="iPhone de prueba"):
        self.priv = ec.generate_private_key(ec.SECP256R1())
        self.spki = self.priv.public_key().public_bytes(serialization.Encoding.DER,
                                                        serialization.PublicFormat.SubjectPublicKeyInfo)
        self.huella = hashlib.sha256(self.spki).hexdigest()
        self.cuenta, self.nivel, self.nombre = cuenta, nivel, nombre
        self.seq = 0

    def fila(self, **kw):
        f = {"huella": self.huella, "spki": b64u(self.spki), "cuenta": self.cuenta, "nombre": self.nombre,
             "plataforma": "navegador", "nivel": self.nivel, "alta": "2026-11-13T00:00:00Z"}
        f.update(kw)
        return f

    def firmar(self, datos):
        r, s = utils.decode_dss_signature(self.priv.sign(datos, ec.ECDSA(hashes.SHA256())))
        return r.to_bytes(32, "big") + s.to_bytes(32, "big")

    def carga(self, entrada, chat=CHAT_G, destino="mac", t=T0, caduca=None, seq=None, **extra):
        if seq is None:
            self.seq += 1
            seq = self.seq
        c = {"aud": F.AUD, "cuenta": self.cuenta, "aparato": self.huella, "seq": seq, "t": F.iso_utc(t),
             "caduca": F.iso_utc(caduca if caduca is not None else t + 7 * 86400), "destino": destino,
             "chat": chat[0], "chatNombre": chat[1], "entrada": entrada}
        c.update(extra)
        return c

    def sobre(self, carga, ident=1, rol="dueño", recibido=T0, cuenta=None, datos=None, firma=None):
        """La fila que entrega la puerta (EntradaRecibida v2). `datos` = bytes exactos a firmar (por defecto,
        JSON.stringify de la carga, como hace el navegador)."""
        if datos is None:
            datos = json.dumps(carga, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        return {"id": ident, "cuenta": cuenta or self.cuenta, "rol": rol, "destino": carga.get("destino", "mac"),
                "recibido": F.iso_utc(recibido), "v": 2, "carga": b64u(datos),
                "firma": b64u(firma if firma is not None else self.firmar(datos)), "aparato": self.huella}


def altas_de(*aparatos):
    return {"v": 1, "aparatos": [a.fila() for a in aparatos]}


SIN_RETIRADOS = {"v": 1, "retirados": []}


class Codigo(unittest.TestCase):
    def test_vectores_del_contrato(self):
        h1 = "17a3b6ff31fccb5586b758b98e5cfcc2c4c4b68aa103288765360cfd0f64d80c"
        h2 = "c76ee5500e9143562f96ddaf2abbdb08c0676ce7f7a4e36edd644a9ba6cf8164"
        self.assertEqual(F.codigo_de(h1, "00000000-0000-4000-8000-000000000001"), "7ETY-DGGK-DY2F")
        self.assertEqual(F.codigo_de(h1, "00000000-0000-4000-8000-000000000002"), "S7GP-KAWW-7Y5T")
        self.assertEqual(F.codigo_de(h2, "00000000-0000-4000-8000-000000000001"), "VYR2-W7RQ-DW2P")
        # La huella y la cuenta van en minúsculas.
        self.assertEqual(F.codigo_de(h1.upper(), "00000000-0000-4000-8000-000000000001"), "7ETY-DGGK-DY2F")

    def test_normalizar(self):
        self.assertEqual(F.normalizar_codigo("7ety dggk-dy2f"), "7ETYDGGKDY2F")
        self.assertIsNone(F.normalizar_codigo("7ETY-DGGK-DY21"))     # «1» no es base32
        self.assertIsNone(F.normalizar_codigo("7ETY-DGGK-DY2"))      # corto
        self.assertIsNone(F.normalizar_codigo("7ETY.DGGK.DY2F"))
        self.assertIsNone(F.normalizar_codigo(None))
        self.assertTrue(F.codigos_iguales("7ety-dggk-dy2f", "7ETYDGGKDY2F"))
        self.assertFalse(F.codigos_iguales("7ETY-DGGK-DY2E", "7ETY-DGGK-DY2F"))


class Riesgo(unittest.TestCase):
    #: La tabla de §3.6, caso por caso (la misma lista que las pruebas de A y E).
    CASOS = [
        ({"fuente": "direccion", "accion": "decir", "texto": "x", "canales": ["mando"]}, "bajo"),
        ({"fuente": "direccion", "accion": "decir", "texto": "x"}, "bajo"),
        ({"fuente": "direccion", "accion": "decir", "texto": "x", "canales": []}, "bajo"),
        ({"fuente": "direccion", "accion": "decir", "texto": "x", "canales": ["mando"], "modelo": "director-presidente/auto"}, "alto"),
        ({"fuente": "direccion", "accion": "decir", "texto": "x", "canales": ["hermes"]}, "alto"),
        ({"fuente": "direccion", "accion": "decir", "texto": "x", "canales": ["mando", "claude-mac"]}, "alto"),
        ({"fuente": "direccion", "accion": "responder", "respondeA": "md-1762990000000-a1b2"}, "alto"),
        ({"fuente": "direccion", "accion": "reenviar", "reenviar": "md-1762990000000-a1b2", "canales": ["hermes"]}, "alto"),
        ({"fuente": "direccion", "accion": "revocarme"}, "bajo"),
        ({"fuente": "direccion", "accion": "revocar-aparato", "huella": "0" * 64}, "bajo"),
        ({"fuente": "puente:hermes-avisos", "accion": "texto", "texto": "Hermes, ¿cómo va?"}, "alto"),
        ({"fuente": "puente:hermes-avisos", "accion": "texto", "texto": "/estado"}, "alto"),
        ({"fuente": "puente:hermes-avisos", "accion": "orden", "orden": {"nombre": "decir", "args": []}, "texto": "x"}, "alto"),
        ({"fuente": "puente:hermes-avisos", "accion": "orden", "orden": {"nombre": "a", "args": ["claude"]}, "texto": "x"}, "alto"),
        ({"fuente": "puente:peticiones", "accion": "texto", "texto": "haz una infografía"}, "alto"),
        ({"fuente": "puente:avisos-directores", "accion": "texto", "texto": "x"}, "alto"),
        ({"fuente": "otra", "accion": "decir"}, "alto"),
        ({}, "alto"),
        (None, "alto"),
    ]

    def test_tabla(self):
        for nombre in ("estado", "olas", "cola", "puertas", "agentes", "ayuda"):
            self.CASOS.append(({"fuente": "puente:hermes-avisos", "accion": "orden", "orden": {"nombre": nombre, "args": []}}, "bajo"))
        for nombre in ("aprobar", "rechazar", "soltar", "reasignar", "desconocida"):
            self.CASOS.append(({"fuente": "puente:hermes-avisos", "accion": "orden", "orden": {"nombre": nombre, "args": ["T1"]}}, "alto"))
        for nombre, r in (("estado", "bajo"), ("ayuda", "bajo"), ("encargos", "alto"), ("pausa", "alto"),
                          ("sigue", "alto"), ("cancela", "alto")):
            self.CASOS.append(({"fuente": "puente:peticiones", "accion": "orden", "orden": {"nombre": nombre, "args": []}}, r))
        for entrada, esperado in self.CASOS:
            self.assertEqual(F.riesgo_de_entrada(entrada), esperado, entrada)

    def test_texto_a_hermes_caduca_a_los_30_min(self):
        a = Aparato()
        c = a.carga(texto_a_hermes(), chat=CHAT_A, caduca=T0 + 7 * 86400)
        self.assertEqual(F.caduca_efectiva(c, T0, F.riesgo_de_entrada(c["entrada"])), T0 + 1800)
        c2 = a.carga(decir_al_hilo(), caduca=T0 + 30 * 86400)
        self.assertEqual(F.caduca_efectiva(c2, T0 + 10, "bajo"), T0 + 7 * 86400)      # el aparato no la alarga
        self.assertEqual(F.caduca_efectiva(c2, T0 - 3600, "bajo"), T0 - 3600 + 7 * 86400)   # la puerta solo adelanta
        self.assertEqual(F.caduca_efectiva(dict(c2, t="ayer"), T0, "bajo"), 0.0)


def comprobar(sobre, altas, retirados=SIN_RETIRADOS, canon=CANON, vistos=None, ahora=T0, destino="mac"):
    return F.comprobar_entrada_firmada(sobre, altas, retirados, canon, {} if vistos is None else vistos, ahora, destino)


class Motivos(unittest.TestCase):
    """Los quince motivos, uno por uno (§3.5.2), más una carga buena."""

    def setUp(self):
        self.a = Aparato(nivel="completo")
        self.t = Aparato(nivel="texto", nombre="portátil")
        self.altas = altas_de(self.a, self.t)

    def motivo(self, sobre, **kw):
        return comprobar(sobre, kw.pop("altas", self.altas), **kw)[1]

    def test_carga_buena(self):
        c = self.a.carga(orden_a(), chat=CHAT_A)
        ok, motivo, carga = comprobar(self.a.sobre(c), self.altas)
        self.assertEqual((ok, motivo), (True, "ok"))
        self.assertEqual(carga, c)

    def test_sin_firma(self):
        v1 = dict(orden_a(), id=1, cuenta=DUENO, rol="dueño", recibido=F.iso_utc(T0))
        self.assertEqual(self.motivo(v1), "sin-firma")
        s = self.a.sobre(self.a.carga(orden_a(), chat=CHAT_A))
        for quitar in ("carga", "firma", "aparato", "v"):
            self.assertEqual(self.motivo({k: v for k, v in s.items() if k != quitar}), "sin-firma", quitar)
        self.assertEqual(self.motivo(dict(s, v=1)), "sin-firma")
        self.assertEqual(self.motivo(dict(s, aparato=s["aparato"].upper())), "sin-firma")
        self.assertEqual(self.motivo(None), "sin-firma")
        self.assertEqual(self.motivo("v:1"), "sin-firma")

    def test_ninguna_opcion_hace_aceptar_v1(self):
        v1 = dict(orden_a(), id=1, cuenta=DUENO, rol="dueño", recibido=F.iso_utc(T0))
        for extra in ({"firmada": True}, {"aceptar_v1": True}, {"v1": True}, {"modo": "compatible"},
                      {"sin_firma": "permitido"}, {"carga": "e30", "aparato": self.a.huella}):
            self.assertEqual(self.motivo(dict(v1, **extra)), "sin-firma", extra)
        with open(os.path.join(CARPETA, "genesis_firma_logica.py"), encoding="utf-8") as f:
            codigo = f.read()
        for prohibido in ("os.environ", "getenv", "open(", "import os", "sys.argv", "== 1 or", "in (1, 2)"):
            self.assertNotIn(prohibido, codigo, prohibido)
        self.assertEqual(len(re.findall(r'get\("v"\) == 2', codigo)), 1)

    def test_aparato_desconocido_y_revocado(self):
        otro = Aparato()
        self.assertEqual(self.motivo(otro.sobre(otro.carga(orden_a(), chat=CHAT_A))), "aparato-desconocido")
        retirados = {"v": 1, "retirados": [{"huella": self.a.huella, "t": F.iso_utc(T0 - 60), "por": "mac"}]}
        s = self.a.sobre(self.a.carga(orden_a(), chat=CHAT_A))
        self.assertEqual(self.motivo(s, retirados=retirados), "aparato-revocado")

    def test_firma_mala(self):
        c = self.a.carga(orden_a(), chat=CHAT_A)
        datos = bytearray(json.dumps(c, separators=(",", ":")).encode())
        firma = self.a.firmar(bytes(datos))
        datos[datos.index(b"T1")] = ord("X")                       # un byte cambiado
        self.assertEqual(self.motivo(self.a.sobre(c, datos=bytes(datos), firma=firma)), "firma-mala")
        otro = Aparato()
        self.assertEqual(self.motivo(self.a.sobre(c, firma=otro.firmar(b"x"))), "firma-mala")
        self.assertEqual(self.motivo(dict(self.a.sobre(c), firma="no*es*base64")), "firma-mala")
        self.assertEqual(self.motivo(dict(self.a.sobre(c), firma=b64u(b"\0" * 64))), "firma-mala")
        # Firma buena sobre algo que no es un objeto JSON, o con la huella de otro dentro.
        self.assertEqual(self.motivo(self.a.sobre(c, datos=b"[1,2]")), "firma-mala")
        self.assertEqual(self.motivo(self.a.sobre(c, datos=b'{"aud": NaN}')), "firma-mala")
        self.assertEqual(self.motivo(self.a.sobre(dict(c, aparato=self.t.huella))), "firma-mala")
        self.assertEqual(self.motivo(self.a.sobre(dict(c, seq=0))), "firma-mala")

    def test_aud(self):
        self.assertEqual(self.motivo(self.a.sobre(self.a.carga(orden_a(), chat=CHAT_A, aud="otro.uso"))), "aud")

    def test_cuenta_distinta(self):
        c = self.a.carga(orden_a(), chat=CHAT_A, cuenta=OTRO)
        self.assertEqual(self.motivo(self.a.sobre(c, cuenta=OTRO)), "cuenta-distinta")     # no es la del aparato
        c = self.a.carga(orden_a(), chat=CHAT_A)
        self.assertEqual(self.motivo(self.a.sobre(c, cuenta=OTRO)), "cuenta-distinta")     # la puerta dice otra

    def test_destino(self):
        c = self.a.carga(orden_a(), chat=CHAT_A, destino="a1")
        self.assertEqual(self.motivo(self.a.sobre(c)), "destino")

    def test_chat_distinto_caso_h(self):
        c = self.a.carga(texto_a_hermes(), chat=CHAT_B)               # chat del puente B, fuente del A
        self.assertEqual(self.motivo(self.a.sobre(c)), "chat-distinto")

    def test_nombre_distinto_caso_i(self):
        c = self.a.carga(texto_a_hermes(), chat=(CHAT_A[0], CHAT_B[1]))   # nombre del B, chat y fuente del A
        self.assertEqual(self.motivo(self.a.sobre(c)), "nombre-distinto")

    def test_futuro(self):
        c = self.a.carga(decir_al_hilo(), t=T0 + 301)
        self.assertEqual(self.motivo(self.a.sobre(c)), "futuro")
        c = self.a.carga(decir_al_hilo(2), t=T0 + 299)
        self.assertEqual(self.motivo(self.a.sobre(c)), "ok")

    def test_caducada_aprobar_y_texto_a_hermes_casos_f_y_g(self):
        for entrada in (orden_a(1), texto_a_hermes(2)):
            c = self.a.carga(entrada, chat=CHAT_A, t=T0 - 31 * 60)
            self.assertEqual(self.motivo(self.a.sobre(c, recibido=T0 - 31 * 60)), "caducada")
        c = self.a.carga(texto_a_hermes(3), chat=CHAT_A, t=T0 - 29 * 60)
        self.assertEqual(self.motivo(self.a.sobre(c)), "ok")
        c = self.a.carga(decir_al_hilo(4), t=T0 - 6 * 86400)              # bajo: 7 días
        self.assertEqual(self.motivo(self.a.sobre(c)), "ok")

    def test_nivel_caso_j(self):
        c = self.t.carga(texto_a_hermes(), chat=CHAT_A)
        self.assertEqual(self.motivo(self.t.sobre(c)), "nivel")
        for entrada, chat in ((decir_al_hilo(2), CHAT_G), (orden_a(3, "estado", ()), CHAT_A)):
            self.assertEqual(self.motivo(self.t.sobre(self.t.carga(entrada, chat=chat))), "ok")
        # Un nivel desconocido en la lista cuenta como texto.
        altas = {"v": 1, "aparatos": [self.a.fila(nivel="todo")]}
        self.assertEqual(self.motivo(self.a.sobre(self.a.carga(orden_a(4), chat=CHAT_A)), altas=altas), "nivel")

    def test_limite_de_20_altos_por_hora(self):
        vistos = {}
        for n in range(20):
            c = self.a.carga(orden_a(n + 1), chat=CHAT_A)
            self.assertEqual(self.motivo(self.a.sobre(c), vistos=vistos), "ok")
            F.anotar(vistos, c, T0)
        c = self.a.carga(orden_a(99), chat=CHAT_A)
        self.assertEqual(self.motivo(self.a.sobre(c), vistos=vistos), "limite")
        self.assertEqual(self.motivo(self.a.sobre(self.a.carga(decir_al_hilo(98))), vistos=vistos), "ok")
        luego = self.a.carga(orden_a(100), chat=CHAT_A, t=T0 + 3601)
        self.assertEqual(self.motivo(self.a.sobre(luego, recibido=T0 + 3601), vistos=vistos, ahora=T0 + 3601), "ok")

    def test_seq_y_nonce_repetidos(self):
        vistos = {}
        c = self.a.carga(orden_a(1), chat=CHAT_A)
        F.anotar(vistos, c, T0)
        self.assertEqual(self.motivo(self.a.sobre(c, ident=2), vistos=vistos), "seq-repetido")       # caso k
        c2 = self.a.carga(orden_a(1), chat=CHAT_A)                       # seq nuevo, mismo nonce
        self.assertEqual(self.motivo(self.a.sobre(c2), vistos=vistos), "nonce-repetido")

    def test_quince_motivos(self):
        self.assertEqual(len(F.MOTIVOS), 15)
        self.assertEqual(set(F.MOTIVOS), set(F.TEXTOS))


class BytesExactos(unittest.TestCase):
    def test_se_verifican_los_bytes_firmados_y_se_lee_esa_misma_copia(self):
        a = Aparato()
        c = a.carga(orden_a(), chat=CHAT_A)
        # Bytes con otro orden de claves y espacios: lo que importa es lo firmado, no un JSON canónico.
        datos = json.dumps(dict(reversed(list(c.items()))), indent=2, ensure_ascii=False).encode("utf-8")
        ok, motivo, carga = comprobar(a.sobre(c, datos=datos), altas_de(a))
        self.assertEqual((ok, motivo), (True, "ok"))
        self.assertEqual(carga, json.loads(datos))
        # La copia «re-parseada» (compacta) tiene otros bytes: con la firma de los originales no vale.
        compacta = json.dumps(json.loads(datos), separators=(",", ":")).encode()
        self.assertNotEqual(compacta, datos)
        self.assertEqual(comprobar(a.sobre(c, datos=compacta, firma=a.firmar(datos)), altas_de(a))[1], "firma-mala")

    def test_lo_que_pone_la_puerta_fuera_de_la_carga_no_cuenta(self):
        a = Aparato(nivel="texto")
        c = a.carga(decir_al_hilo(texto="lo firmado"))
        s = dict(a.sobre(c), fuente="puente:hermes-avisos", accion="texto", texto="OTRA COSA", destino="mac",
                 entrada={"accion": "orden"}, chat=CHAT_A[0])
        ok, _, carga = comprobar(s, altas_de(a))
        self.assertTrue(ok)
        e = F.entrada_para_gen1113(s, carga)
        self.assertEqual((e["fuente"], e["texto"], e["accion"]), ("direccion", "lo firmado", "decir"))

    def test_entrada_para_gen1113_es_el_objeto_del_paso_8(self):
        a = Aparato()
        c = a.carga(orden_a(), chat=CHAT_A)
        s = a.sobre(c, ident=42, rol="dueño", recibido=T0 - 5)
        e = F.entrada_para_gen1113(s, c)
        self.assertEqual(e, dict(c["entrada"], id=42, cuenta=DUENO, rol="dueño", recibido=F.iso_utc(T0 - 5),
                                 destino="mac"))
        # El rol de la puerta solo puede bajar: «dueño» en la puerta y desarrollador en cuentas.json.
        cuentas = {"duenos": [], "desarrolladores": [DUENO]}
        self.assertEqual(L.rol_efectivo(e, cuentas), "desarrollador")
        ok, motivo = L.validar_entrada(e, cuentas, T0, {})
        self.assertEqual((ok, motivo), (False, L.SOLO_DUENO))
        ok, motivo = L.validar_entrada(e, {"duenos": [DUENO]}, T0, {})
        self.assertEqual((ok, motivo), (True, "ok"))

    def test_carga_demasiado_grande(self):
        a = Aparato()
        c = a.carga(decir_al_hilo(texto="ñ" * 17000))       # 34 KB de UTF-8
        self.assertEqual(comprobar(a.sobre(c), altas_de(a))[1], "firma-mala")
        c = a.carga(decir_al_hilo(2, texto="𝄞" * 7000))     # 28 KB: cabe
        self.assertEqual(comprobar(a.sobre(c), altas_de(a))[1], "ok")


class Repeticiones(unittest.TestCase):
    def test_dos_seq_en_orden_inverso_pasan_y_el_mismo_dos_veces_no(self):
        a = Aparato()
        vistos = {}
        c8 = a.carga(orden_a(8), chat=CHAT_A, seq=8)
        c7 = a.carga(orden_a(7), chat=CHAT_A, seq=7)
        for c in (c8, c7):
            ok, motivo, carga = comprobar(a.sobre(c), altas_de(a), vistos=vistos)
            self.assertEqual(motivo, "ok")
            F.anotar(vistos, carga, T0)
        self.assertEqual(comprobar(a.sobre(c7, ident=9), altas_de(a), vistos=vistos)[1], "seq-repetido")

    def test_vistos_se_podan_a_8_dias_no_a_7(self):
        vistos = {"a": {"t": T0 - 7.5 * 86400}, "b": {"t": T0 - 8.1 * 86400}, "c": {"t": "x"}, "d": 3}
        self.assertEqual(set(F.podar_vistos(vistos, T0)), {"a"})
        self.assertEqual(F.VISTOS_S, 8 * 86400)
        self.assertGreater(F.VISTOS_S, F.LIMITE_MENSAJE_S + F.MAX_ADELANTO_S)

    def test_clave_de_nonce_igual_que_gen1113(self):
        a = Aparato()
        c = a.carga(orden_a(5), chat=CHAT_A)
        self.assertEqual(F.clave_nonce(c), L.clave_nonce(F.entrada_para_gen1113(a.sobre(c), c)))


class Chat(unittest.TestCase):
    def carga(self, entrada, chat):
        return {"entrada": entrada, "chat": chat[0], "chatNombre": chat[1]}

    def test_relacion_fija_con_el_canon_de_ejemplo(self):
        self.assertIsNone(F.chat_cuadra(self.carga(texto_a_hermes(), CHAT_A), CANON))
        self.assertIsNone(F.chat_cuadra(self.carga(texto_a_hermes(), (CHAT_A[0], "Hermes y avisos")), CANON))
        self.assertIsNone(F.chat_cuadra(self.carga(orden_a(1, "estado", ()), ("telegram.ejemplo_a_bot", "hermes-avisos")), CANON))
        self.assertEqual(F.chat_cuadra(self.carga(texto_a_hermes(), CHAT_B), CANON), "chat-distinto")
        self.assertEqual(F.chat_cuadra(self.carga(texto_a_hermes(), (CHAT_A[0], CHAT_B[1])), CANON), "nombre-distinto")
        self.assertIsNone(F.chat_cuadra(self.carga(decir_al_hilo(), CHAT_G), CANON))
        self.assertIsNone(F.chat_cuadra(self.carga(decir_al_hilo(), ("genesis", "mando")), CANON))
        hilo = dict(decir_al_hilo(), canales=["hermes"])
        self.assertIsNone(F.chat_cuadra(self.carga(hilo, ("genesis.canal.hermes", "Hermes")), CANON))
        self.assertEqual(F.chat_cuadra(self.carga(decir_al_hilo(), ("genesis.canal.hermes", "Hermes")), CANON),
                         "chat-distinto")                                       # «hermes» no está en canales
        self.assertEqual(F.chat_cuadra(self.carga(hilo, ("genesis", "Bot A de ejemplo")), CANON), "nombre-distinto")
        self.assertEqual(F.chat_cuadra(self.carga(hilo, ("telegram.ejemplo_a_bot", "Bot A de ejemplo")), CANON),
                         "chat-distinto")

    def test_marcas_bidi_y_controles_se_quitan_antes_de_comparar(self):
        visto = "Bot A‮ de ejemplo‏"
        self.assertIsNone(F.chat_cuadra(self.carga(texto_a_hermes(), (CHAT_A[0], visto)), CANON))
        self.assertEqual(F.limpiar_nombre("a⁦b\x07c‎d  e"), "abcd e")

    def test_un_canon_ambiguo_no_cuadra(self):
        canon = copy.deepcopy(CANON)
        canon["chats"][3]["alias"].append("puente:hermes-avisos")         # el alias del A también en el B
        self.assertEqual(F.chat_cuadra(self.carga(texto_a_hermes(), CHAT_A), canon), "chat-distinto")
        canon = copy.deepcopy(CANON)
        canon["chats"].append(dict(canon["chats"][2], fuente="puente:hermes-avisos", id="telegram.falso"))
        self.assertEqual(F.chat_cuadra(self.carga(texto_a_hermes(), CHAT_A), canon), "chat-distinto")

    def test_sin_canon_solo_valen_los_alias_fijos(self):
        # GEN1114INT: un solo esquema de ids (el provisional de C, `telegram.<clave>`), no la clave suelta.
        self.assertIsNone(F.chat_cuadra(self.carga(texto_a_hermes(), ("telegram.hermes-avisos", "Hermes y avisos")), None))
        self.assertEqual(F.chat_cuadra(self.carga(texto_a_hermes(), ("hermes-avisos", "Hermes y avisos")), None),
                         "chat-distinto")
        self.assertEqual(F.chat_cuadra(self.carga(texto_a_hermes(), CHAT_A), None), "chat-distinto")
        self.assertEqual(F.chat_cuadra(self.carga(texto_a_hermes(), ("telegram.hermes-avisos", "Peticiones y encargos")),
                                       None), "nombre-distinto")
        # Un hilo con un solo canal, sin canon: el nombre que pinta la web (CANALES) es el que vale.
        hilo = dict(decir_al_hilo(), canales=["director-presidente"])
        self.assertIsNone(F.chat_cuadra(self.carga(hilo, ("genesis.canal.director-presidente", "Director presidente")), None))
        self.assertEqual(F.chat_cuadra(self.carga(hilo, ("genesis.canal.director-presidente", "Hermes")), None),
                         "nombre-distinto")
        self.assertIsNone(F.chat_cuadra(self.carga(decir_al_hilo(), ("genesis", "Dirección")), None))
        self.assertIsNone(F.chat_cuadra(self.carga(decir_al_hilo(), ("genesis", "mando")), {"basura": 1}))

    def test_lo_que_depende_del_sobre_de_la_puerta_no_quema_la_entrada(self):
        """GEN1114INT: un rechazo por el sobre (cuenta de la puerta, hora de recepción, límite) no se anota."""
        a = Aparato()
        altas = altas_de(a)
        c = a.carga(texto_a_hermes())
        self.assertFalse(F.rechazo_definitivo("cuenta-distinta", c, altas))           # la cuenta firmada es la suya
        self.assertTrue(F.rechazo_definitivo("cuenta-distinta", dict(c, cuenta=OTRO), altas))
        for m in ("caducada", "limite", "seq-repetido", "nonce-repetido", "ok"):
            self.assertFalse(F.rechazo_definitivo(m, c, altas), m)
        for m in ("aud", "destino", "chat-distinto", "nombre-distinto", "nivel", "futuro", "firma-mala"):
            self.assertTrue(F.rechazo_definitivo(m, c, altas), m)

    def test_nombres_de_canal_iguales_que_en_la_web(self):
        """GEN1114INT: NOMBRES_CANAL es copia de CANALES de chat-director-tipos.ts (la web firma ese nombre)."""
        import re
        ts = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "src", "lib", "mando",
                          "chat-director-tipos.ts")
        with open(ts, encoding="utf-8") as f:
            texto = f.read()
        bloque = texto[texto.index("CANALES"):]
        web = dict(re.findall(r'\{\s*id:\s*"([a-z-]+)",\s*nombre:\s*"([^"]+)"', bloque)[:10])
        self.assertEqual({k: v for k, v in web.items() if k != "mando"}, F.NOMBRES_CANAL)

    def test_retiradas_solo_en_genesis(self):
        r = {"v": 1, "nonce": nonce(1), "t": F.iso_utc(T0), "fuente": "direccion", "accion": "revocarme"}
        self.assertIsNone(F.chat_cuadra(self.carga(r, CHAT_G), CANON))
        self.assertEqual(F.chat_cuadra(self.carga(dict(r, canales=["hermes"]), ("genesis.canal.hermes", "Hermes")),
                                       CANON), "chat-distinto")


class Claves(unittest.TestCase):
    def test_firma_r_s_verifica_y_nunca_lanza(self):
        a = Aparato()
        firma = a.firmar(b"hola")
        self.assertEqual(len(firma), 64)
        self.assertTrue(F.verificar_firma(a.spki, b"hola", firma))
        self.assertFalse(F.verificar_firma(a.spki, b"hola!", firma))
        der = a.priv.sign(b"hola", ec.ECDSA(hashes.SHA256()))          # DER en vez de r‖s
        for basura in (der, b"", b"\0" * 64, b"\xff" * 64, None, "texto", firma + b"\0"):
            self.assertFalse(F.verificar_firma(a.spki, b"hola", basura))
        for spki in (b"", b"\x30\x00", None, b"x" * 300):
            self.assertFalse(F.verificar_firma(spki, b"hola", firma))

    def test_huella_exige_p256_canonica(self):
        a = Aparato()
        self.assertEqual(F.huella_de_spki(a.spki), a.huella)
        p384 = ec.generate_private_key(ec.SECP384R1()).public_key().public_bytes(
            serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo)
        comprimida = a.priv.public_key().public_bytes(serialization.Encoding.DER,
                                                      serialization.PublicFormat.SubjectPublicKeyInfo)
        from cryptography.hazmat.primitives.asymmetric import ed25519
        ed = ed25519.Ed25519PrivateKey.generate().public_key().public_bytes(
            serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo)
        for mala in (p384, ed, b"no es una clave", a.spki + b"\0"):
            with self.assertRaises(ValueError):
                F.huella_de_spki(mala)
        self.assertEqual(comprimida, a.spki)       # la misma codificación que WebCrypto (sin comprimir)

    def test_b64url(self):
        self.assertEqual(F.b64url_dec("aGk"), b"hi")
        for malo in ("aGk=", "a+b/", "a", "ñ", None):
            with self.assertRaises(ValueError):
                F.b64url_dec(malo)
        self.assertEqual(F.b64url_dec(F.b64url_cod(b"\xff\x00")), b"\xff\x00")


class Listas(unittest.TestCase):
    def test_aparatos_validos_es_tolerante(self):
        a, b = Aparato(), Aparato(nivel="texto")
        crudo = {"v": 1, "aparatos": [a.fila(), b.fila(), "basura", {"huella": "x"},
                                      a.fila(huella=b.huella),                  # la SPKI no da esa huella
                                      dict(b.fila(), nivel="completo")]}         # repetida: gana el nivel bajo
        filas = F.aparatos_validos(crudo)["aparatos"]
        self.assertEqual([(f["huella"], f["nivel"]) for f in filas], [(a.huella, "completo"), (b.huella, "texto")])
        self.assertEqual(F.aparatos_validos(None), {"v": 1, "aparatos": []})
        self.assertEqual(F.aparatos_validos({"aparatos": "x"}), {"v": 1, "aparatos": []})

    def test_aparato_valido(self):
        a = Aparato()
        altas = altas_de(a)
        self.assertEqual(F.aparato_valido(a.huella, altas, SIN_RETIRADOS)[1], None)
        self.assertEqual(F.aparato_valido("0" * 64, altas, SIN_RETIRADOS), (None, "aparato-desconocido"))
        ret = {"v": 1, "retirados": [{"huella": a.huella.upper(), "t": "2026-11-13T00:00:00Z"}]}
        self.assertEqual(F.aparato_valido(a.huella, altas, ret), (None, "aparato-revocado"))

    def test_objetivo_de_retirada(self):
        a, b, c = Aparato(), Aparato(), Aparato(cuenta=OTRO)
        altas = altas_de(a, b, c)
        base = {"v": 1, "nonce": nonce(1), "t": F.iso_utc(T0), "fuente": "direccion"}
        yo = a.carga(dict(base, accion="revocarme"))
        self.assertEqual(F.objetivo_de_retirada(yo, altas), (a.huella, None))
        otro = a.carga(dict(base, accion="revocar-aparato", huella=b.huella))
        self.assertEqual(F.objetivo_de_retirada(otro, altas), (b.huella, None))
        ajeno = a.carga(dict(base, accion="revocar-aparato", huella=c.huella))
        self.assertIsNone(F.objetivo_de_retirada(ajeno, altas)[0])
        raro = a.carga(dict(base, accion="revocarme", texto="x"))
        self.assertIsNone(F.objetivo_de_retirada(raro, altas)[0])
        self.assertTrue(F.es_retirada(yo) and not F.es_retirada(a.carga(decir_al_hilo())))


class Textos(unittest.TestCase):
    def test_textos_sin_datos_y_con_fecha(self):
        self.assertEqual(F.texto_de_motivo("firma-mala"),
                         "[firma-mala] La firma no cuadra: la entrada se cambió por el camino; no se ejecutó nada")
        self.assertIn("retirado en la Mac el 13-11 a las 14:02.",
                      F.texto_de_motivo("aparato-revocado", "el 13-11 a las 14:02"))
        for m in F.MOTIVOS:
            t = F.texto_de_motivo(m)
            self.assertTrue(t.startswith("[%s] " % m))
            self.assertIsNone(re.search(r"https?://|/Users/|\d{7,}", t))

    def test_registro_con_firma_sin_carga_ni_texto(self):
        a = Aparato()
        c = a.carga(texto_a_hermes(texto="SECRETO"), chat=CHAT_A)
        e = F.entrada_para_gen1113(a.sobre(c), c)
        fila = L.linea_registro(e, "hecho", "ok", F.iso_utc(T0), firma={"aparato": a.huella, "firma": "ok", "seq": 3})
        crudo = json.dumps(fila)
        self.assertEqual((fila["aparato8"], fila["firma"], fila["seq"]), (a.huella[:8], "ok", 3))
        for prohibido in ("SECRETO", a.huella, DUENO, "carga"):
            self.assertNotIn(prohibido, crudo)
        sin = L.linea_registro(e, "hecho", "ok", F.iso_utc(T0))
        self.assertNotIn("aparato8", sin)                                    # GEN1113 sigue igual sin firma
        fila = L.linea_registro({}, "rechazado", "x", "t", firma={"aparato": "ZZ<script>", "firma": "Mala Firma", "seq": True})
        self.assertEqual((fila["aparato8"], fila["firma"], fila["seq"]), (None, None, None))


if __name__ == "__main__":
    unittest.main()
