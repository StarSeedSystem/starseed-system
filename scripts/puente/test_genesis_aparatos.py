#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas sin red de genesis_aparatos.py y del bloque GEN1114B de genesis_chats_puerta.py.

Todo es falso y vive en carpetas temporales: la puerta, sudo/install (un `ejecutar` que copia el archivo
como haría root), ssh, launchctl, el reloj, la terminal y las claves (creadas aquí). La lista «de root» es
de este usuario y se lee con `dueno_altas = os.getuid()`. Nada toca ~/.starseed, /Library ni la red."""
import copy
import importlib.util
import json
import os
import re
import shutil
import stat
import subprocess
import sys
import tempfile
import types
import unittest

CARPETA = os.path.dirname(os.path.abspath(__file__))
if CARPETA not in sys.path:
    sys.path.insert(0, CARPETA)

import director_chat  # noqa: E402
import genesis_aparatos as A  # noqa: E402
import genesis_chats_logica as L  # noqa: E402
import genesis_chats_puerta as G  # noqa: E402
import genesis_firma_logica as F  # noqa: E402
import puerta_datos_cliente  # noqa: E402
from test_genesis_firma_logica import (CANON, CHAT_A, CHAT_B, CHAT_G, DESA, DUENO, OTRO, T0, Aparato,  # noqa: E402
                                       b64u, decir_al_hilo, nonce, orden_a, texto_a_hermes)

_spec = importlib.util.spec_from_file_location("telegram_puente_prueba_aparatos", os.path.join(CARPETA, "telegram-puente.py"))
TG = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(TG)

URL = "https://puerta.ejemplo.invalid"
FICHA = "pd_" + "F" * 40
ALIAS = "a1-alias-de-prueba"
YO = os.getuid()


class Reloj:
    def __init__(self, t=T0):
        self.t = t

    def __call__(self):
        return self.t


class Respuestas:
    """Lo que «teclea» Alex: una respuesta por pregunta; sin más respuestas, EOF."""

    def __init__(self, *r):
        self.r, self.preguntas = list(r), []

    def __call__(self, pregunta):
        self.preguntas.append(pregunta)
        if not self.r:
            raise EOFError
        return self.r.pop(0)


class Ejecutor:
    """sudo, install, ssh y launchctl de mentira. `install` copia el temporal a su destino (lo que haría
    root); `rc` decide si sudo acepta. Guarda cada llamada (sin ejecutar nada de verdad)."""

    def __init__(self, rc_sudo=0, rc_ssh=0, launchctl=""):
        self.llamadas, self.rc_sudo, self.rc_ssh, self.launchctl = [], rc_sudo, rc_ssh, launchctl
        self.copiados = {}

    def __call__(self, args, **kw):
        self.llamadas.append({"args": list(args), "input": kw.get("input")})
        if args[0] == A.SUDO:
            if args[1:] == ["-k"]:
                return types.SimpleNamespace(returncode=0)
            if self.rc_sudo:
                return types.SimpleNamespace(returncode=self.rc_sudo)
            resto = args[3:]
            assert resto[0] == A.INSTALL
            if "-d" in resto:
                os.makedirs(resto[-1], mode=0o755, exist_ok=True)
                os.chmod(resto[-1], 0o755)
            else:
                shutil.copyfile(resto[-2], resto[-1])
                os.chmod(resto[-1], 0o644)
            return types.SimpleNamespace(returncode=0)
        if args[0] == A.SSH:
            self.copiados[args[-1].split("&& mv -f ")[-1].split()[-1]] = kw.get("input")
            return types.SimpleNamespace(returncode=self.rc_ssh, stdout=b"10.0.0.9 " + ALIAS.encode(), stderr=b"")
        if args[0] == A.LAUNCHCTL:
            return types.SimpleNamespace(returncode=0, stdout=self.launchctl, stderr="")
        raise AssertionError("orden inesperada")

    def de(self, programa):
        return [c for c in self.llamadas if c["args"][0] == programa]


class PuertaFalsa:
    def __init__(self, solicitudes=()):
        self.lista, self.resultados, self.caida, self.consultas = list(solicitudes), [], False, 0

    def configurada(self):
        return True

    def solicitudes(self):
        self.consultas += 1
        return None if self.caida else copy.deepcopy(self.lista)

    def resultado(self, huella, estado, solicitud=None, nivel=None):
        self.resultados.append((huella, estado, solicitud, nivel))
        return True


def solicitud(aparato, ident=1, cuenta=None, caduca=T0 + 900, nombre="iPhone de Alex", spki=None):
    return {"id": ident, "cuenta": cuenta or aparato.cuenta, "spki": spki or b64u(aparato.spki), "nombre": nombre,
            "plataforma": "navegador", "t": F.iso_utc(T0 - 60), "caduca": F.iso_utc(caduca)}


class Base(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp(prefix="genesis-aparatos-pruebas-")
        self.base = os.path.join(self.dir, "genesis-chats")
        self.ruta_altas = os.path.join(self.dir, "StarSeed", "genesis-aparatos.json")
        self.salida, self.ej, self.reloj = [], Ejecutor(), Reloj()
        self.llevados = []
        G.escribir_cuentas(os.path.join(self.base, "cuentas.json"), [DUENO], [DESA])

    def tearDown(self):
        shutil.rmtree(self.dir, ignore_errors=True)

    def llevar(self, **kw):
        self.llevados.append(kw)
        return True, "lista llegada (prueba)"

    def poner_altas(self, *aparatos, modo=0o644):
        os.makedirs(os.path.dirname(self.ruta_altas), exist_ok=True)
        os.chmod(os.path.dirname(self.ruta_altas), 0o755)
        with open(self.ruta_altas, "w", encoding="utf-8") as f:
            json.dump({"v": 1, "aparatos": [a.fila() for a in aparatos]}, f)
        os.chmod(self.ruta_altas, modo)

    def emparejar(self, puerta, *teclas, entorno=None, tty=True):
        return A.emparejar(puerta, base=self.base, ruta_altas=self.ruta_altas, dueno_altas=YO,
                           entrada=Respuestas(*teclas), salida=self.salida.append, entorno=entorno or {},
                           es_tty=lambda: tty, ahora=self.reloj, ejecutar=self.ej, llevar=self.llevar)

    def texto(self):
        return "\n".join(self.salida)

    def log(self):
        return A.leer_log(A.rutas(self.base)["log"])


class Emparejar(Base):
    def test_sin_terminal_o_por_ssh_se_niega_sin_tocar_nada(self):
        a = Aparato()
        p = PuertaFalsa([solicitud(a)])
        codigo = F.codigo_de(a.huella, a.cuenta)
        self.assertEqual(self.emparejar(p, codigo, "", tty=False), 1)
        for var in ("SSH_CONNECTION", "SSH_TTY", "SSH_CLIENT"):
            self.assertEqual(self.emparejar(p, codigo, "", entorno={var: "x"}), 1)
        self.assertEqual(p.consultas, 0)
        self.assertEqual(self.ej.llamadas, [])
        self.assertFalse(os.path.exists(self.ruta_altas))
        self.assertIn("sentado delante de la Mac", self.texto())

    def test_codigo_mal_tecleado_no_escribe_nada(self):
        a = Aparato()
        p = PuertaFalsa([solicitud(a)])
        codigo = F.codigo_de(a.huella, a.cuenta)
        cambiado = ("A" if codigo[0] != "A" else "B") + codigo[1:]
        self.assertEqual(self.emparejar(p, cambiado, ""), 1)
        self.assertEqual(self.ej.llamadas, [])
        self.assertFalse(os.path.exists(self.ruta_altas))
        self.assertEqual(p.resultados, [])
        self.assertIn("no coincide con ninguna solicitud", self.texto())
        self.assertEqual([x["evento"] for x in self.log()], ["codigo-distinto"])
        self.assertEqual(self.emparejar(p, "1234-5678-9ABC", ""), 1)          # caracteres fuera de base32
        self.assertIn("Código no válido", self.texto())

    def test_el_codigo_nunca_se_imprime(self):
        a = Aparato()
        p = PuertaFalsa([solicitud(a)])
        self.emparejar(p, "AAAA-AAAA-AAAA")
        codigo = F.codigo_de(a.huella, a.cuenta)
        for prohibido in (codigo, codigo.replace("-", ""), a.huella, a.cuenta):
            self.assertNotIn(prohibido, self.texto())
        self.assertIn(a.cuenta[:8], self.texto())

    def test_la_puerta_que_cambia_la_cuenta_hace_que_el_codigo_no_cuadre(self):
        dev = Aparato(cuenta=DESA)
        p = PuertaFalsa([solicitud(dev, cuenta=DUENO)])          # la puerta la presenta como de Alex
        self.assertEqual(self.emparejar(p, F.codigo_de(dev.huella, DESA), ""), 1)
        self.assertFalse(os.path.exists(self.ruta_altas))

    def test_cuenta_fuera_de_la_lista_no_empareja(self):
        a = Aparato(cuenta=OTRO)
        p = PuertaFalsa([solicitud(a)])
        self.assertEqual(self.emparejar(p, F.codigo_de(a.huella, OTRO), ""), 1)
        self.assertIn("no está en la lista de la Mac", self.texto())
        self.assertFalse(os.path.exists(self.ruta_altas))

    def test_una_huella_retirada_no_se_vuelve_a_dar_de_alta(self):
        a = Aparato()
        A.anadir_retirado(A.rutas(self.base)["retirados"], a.huella, "mac", T0 - 100)
        p = PuertaFalsa([solicitud(a)])
        self.assertEqual(self.emparejar(p, F.codigo_de(a.huella, a.cuenta), ""), 1)
        self.assertIn("se retiró", self.texto())
        self.assertFalse(os.path.exists(self.ruta_altas))

    def test_una_spki_que_no_es_p256_se_descarta(self):
        from cryptography.hazmat.primitives import serialization
        from cryptography.hazmat.primitives.asymmetric import ec
        p384 = ec.generate_private_key(ec.SECP384R1()).public_key().public_bytes(
            serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo)
        falso = Aparato()
        import hashlib
        h = hashlib.sha256(p384).hexdigest()
        p = PuertaFalsa([solicitud(falso, spki=b64u(p384)), solicitud(falso, ident=2, caduca=T0 - 1)])
        self.assertEqual(self.emparejar(p, F.codigo_de(h, falso.cuenta), ""), 1)
        self.assertIn("2 solicitud(es) descartada(s)", self.texto())
        self.assertFalse(os.path.exists(self.ruta_altas))

    def test_alta_con_sudo_install_y_nivel_texto_por_defecto(self):
        a, b = Aparato(), Aparato(nombre="otro")
        p = PuertaFalsa([solicitud(b, ident=7, nombre="Otro móvil"), solicitud(a, ident=8)])
        self.assertEqual(self.emparejar(p, F.codigo_de(a.huella, a.cuenta).lower().replace("-", " "), ""), 0)
        instalar = [c["args"] for c in self.ej.de(A.SUDO) if c["args"][1:] != ["-k"]]
        self.assertEqual(instalar[0][:3], [A.SUDO, "-p", instalar[0][2]])
        self.assertEqual(instalar[0][3:-1], [A.INSTALL, "-d", "-o", "root", "-g", "wheel", "-m", "755"])
        self.assertEqual(instalar[1][3:-2], [A.INSTALL, "-S", "-o", "root", "-g", "wheel", "-m", "644"])
        self.assertEqual(instalar[1][-1], self.ruta_altas)
        self.assertFalse(os.path.exists(instalar[1][-2]))                     # el temporal ya no está
        self.assertEqual(self.ej.llamadas[-1]["args"], [A.SUDO, "-k"])        # se olvida la contraseña
        altas, problema = A.leer_altas(self.ruta_altas, YO)
        self.assertIsNone(problema)
        self.assertEqual([(f["huella"], f["nivel"], f["cuenta"]) for f in altas["aparatos"]], [(a.huella, "texto", DUENO)])
        self.assertEqual(stat.S_IMODE(os.stat(self.ruta_altas).st_mode), 0o644)
        self.assertEqual(p.resultados, [(a.huella, "emparejado", 8, "texto")])
        self.assertEqual(len(self.llevados), 1)
        self.assertEqual([(x["evento"], x["aparato8"], x["cuenta8"]) for x in self.log()], [("emparejado", a.huella[:8], DUENO[:8])])
        self.assertNotIn(a.huella, json.dumps(self.log()))

    def test_completo_solo_si_se_escribe_completo(self):
        a, b = Aparato(), Aparato()
        self.assertEqual(self.emparejar(PuertaFalsa([solicitud(a)]), F.codigo_de(a.huella, a.cuenta), "Completo"), 0)
        self.assertEqual(self.emparejar(PuertaFalsa([solicitud(b)]), F.codigo_de(b.huella, b.cuenta), "sí"), 0)
        altas, _ = A.leer_altas(self.ruta_altas, YO)
        self.assertEqual([f["nivel"] for f in altas["aparatos"]], ["completo", "texto"])
        self.assertIn("queda como solo texto", self.texto())

    def test_si_sudo_falla_no_queda_nada_escrito(self):
        a = Aparato()
        self.ej.rc_sudo = 1
        self.assertEqual(self.emparejar(PuertaFalsa([solicitud(a)]), F.codigo_de(a.huella, a.cuenta), "completo"), 1)
        self.assertFalse(os.path.exists(self.ruta_altas))
        self.assertEqual(self.ej.llamadas[-1]["args"], [A.SUDO, "-k"])
        self.assertEqual(self.log(), [])
        self.assertEqual(self.llevados, [])
        self.assertIn("No se ha emparejado nada", self.texto())

    def test_una_lista_que_no_es_de_root_no_se_toca(self):
        a = Aparato()
        self.poner_altas(Aparato())
        r = A.emparejar(PuertaFalsa([solicitud(a)]), base=self.base, ruta_altas=self.ruta_altas, dueno_altas=0,
                        entrada=Respuestas(F.codigo_de(a.huella, a.cuenta), ""), salida=self.salida.append,
                        entorno={}, es_tty=lambda: True, ahora=self.reloj, ejecutar=self.ej, llevar=self.llevar)
        self.assertEqual(r, 1)
        self.assertEqual(self.ej.llamadas, [])

    def test_rechazar_solo_avisa_a_la_puerta(self):
        a = Aparato()
        p = PuertaFalsa([solicitud(a, ident=4)])
        self.assertEqual(A.rechazar(p, 1, salida=self.salida.append, ahora=self.reloj), 0)
        self.assertEqual(p.resultados, [(a.huella, "rechazado", 4, None)])
        self.assertEqual(A.rechazar(p, 3, salida=self.salida.append, ahora=self.reloj), 1)


class ListaDeRoot(Base):
    def test_solo_vale_si_es_del_dueno_y_nadie_mas_escribe(self):
        a = Aparato()
        self.poner_altas(a)
        self.assertEqual((len(A.leer_altas(self.ruta_altas, YO)[0]["aparatos"]), A.leer_altas(self.ruta_altas, YO)[1]), (1, None))
        self.assertEqual(A.leer_altas(self.ruta_altas, 0)[0]["aparatos"], [])              # no es de root
        self.assertIsNotNone(A.leer_altas(self.ruta_altas, 0)[1])
        os.chmod(self.ruta_altas, 0o664)
        self.assertEqual(A.leer_altas(self.ruta_altas, YO), ({"v": 1, "aparatos": []}, "no es de root o la puede escribir otro"))
        os.chmod(self.ruta_altas, 0o644)
        os.chmod(os.path.dirname(self.ruta_altas), 0o777)
        self.assertEqual(A.leer_altas(self.ruta_altas, YO)[1], "su carpeta no es de root o la puede escribir otro")
        os.chmod(os.path.dirname(self.ruta_altas), 0o755)
        enlace = os.path.join(os.path.dirname(self.ruta_altas), "enlace.json")
        os.symlink(self.ruta_altas, enlace)
        self.assertEqual(A.leer_altas(enlace, YO)[0]["aparatos"], [])
        self.assertEqual(A.leer_altas(os.path.join(self.dir, "no", "hay.json"), YO)[1], "falta")


class Revocar(Base):
    def revocar(self, objetivo, *teclas, puerta=None):
        return A.revocar(objetivo, puerta or self.p, base=self.base, ruta_altas=self.ruta_altas, dueno_altas=YO,
                         entrada=Respuestas(*teclas), salida=self.salida.append, ahora=self.reloj,
                         ejecutar=self.ej, llevar=self.llevar)

    def setUp(self):
        super().setUp()
        self.a, self.b = Aparato(nombre="iPhone"), Aparato(nombre="iPad")
        self.poner_altas(self.a, self.b)
        with open(self.ruta_altas, "rb") as f:
            self.antes = f.read()
        self.p = PuertaFalsa()

    def test_revocar_no_toca_la_lista_de_altas_y_anade_a_retirados_600(self):
        self.assertEqual(self.revocar(self.a.huella[:8], F.codigo_de(self.a.huella, self.a.cuenta)), 0)
        with open(self.ruta_altas, "rb") as f:
            self.assertEqual(f.read(), self.antes)
        ruta = A.rutas(self.base)["retirados"]
        self.assertEqual(stat.S_IMODE(os.stat(ruta).st_mode), 0o600)
        self.assertEqual([r["huella"] for r in A.leer_retirados(ruta)["retirados"]], [self.a.huella])
        self.assertEqual(self.p.resultados, [(self.a.huella, "revocado", None, None)])
        self.assertEqual(len(self.llevados), 1)
        self.assertEqual([x["evento"] for x in self.log()], ["revocado"])
        # Ya no está activo: no se puede retirar otra vez y el servicio lo rechaza.
        self.assertEqual(self.revocar(self.a.huella[:8], "x"), 1)
        self.assertEqual(F.aparato_valido(self.a.huella, A.leer_altas(self.ruta_altas, YO)[0],
                                          A.leer_retirados(ruta))[1], "aparato-revocado")

    def test_por_codigo_por_nombre_o_eligiendo(self):
        self.assertEqual(self.revocar(F.codigo_de(self.b.huella, self.b.cuenta), F.codigo_de(self.b.huella, self.b.cuenta)), 0)
        self.assertEqual(self.revocar("", "1", F.codigo_de(self.a.huella, self.a.cuenta)), 0)
        self.assertEqual(len(A.leer_retirados(A.rutas(self.base)["retirados"])["retirados"]), 2)

    def test_sin_confirmar_el_codigo_no_se_retira_nada(self):
        self.assertEqual(self.revocar("iPhone", "AAAA-AAAA-AAAA"), 1)
        self.assertEqual(self.revocar("iPhone"), 1)                 # EOF
        self.assertEqual(self.revocar("nadie", "x"), 1)
        self.assertFalse(os.path.exists(A.rutas(self.base)["retirados"]))
        self.assertEqual(self.p.resultados, [])

    def test_listar_sin_huellas_ni_cuentas_enteras(self):
        A.listar(base=self.base, ruta_altas=self.ruta_altas, dueno_altas=YO, salida=self.salida.append)
        for prohibido in (self.a.huella, self.b.huella, DUENO):
            self.assertNotIn(prohibido, self.texto())
        self.assertIn(self.a.huella[:8], self.texto())


class LlevarAlA1(Base):
    def setUp(self):
        super().setUp()
        self.a = Aparato()
        self.poner_altas(self.a)
        G.escribir_json(A.rutas(self.base)["canon"], CANON)
        self.env = os.path.join(self.dir, "env-vacio")

    def llevar_a1(self, entorno):
        return A.llevar_a1(base=self.base, ruta_altas=self.ruta_altas, ahora=self.reloj, ejecutar=self.ej,
                           entorno=entorno, env_archivo=self.env)

    def test_copia_los_tres_archivos_por_ssh_sin_imprimir_el_alias_ni_la_direccion(self):
        ok, texto = self.llevar_a1({A.VAR_A1: ALIAS})
        self.assertTrue(ok)
        for prohibido in (ALIAS, "10.0.0.9"):
            self.assertNotIn(prohibido, texto)
            self.assertNotIn(prohibido, json.dumps(self.log()))
        for c in self.ej.de(A.SSH):
            self.assertEqual(c["args"][:7], [A.SSH, "-o", "BatchMode=yes", "-o", "ConnectTimeout=15", "--", ALIAS])
            self.assertIn("umask 077", c["args"][7])
        with open(self.ruta_altas, "rb") as f:
            self.assertEqual(self.ej.copiados[".starseed/peticiones/aparatos.json"], f.read())     # tal cual
        self.assertEqual(json.loads(self.ej.copiados[".starseed/peticiones/aparatos-retirados.json"]),
                         {"v": 1, "retirados": []})
        chat = json.loads(self.ej.copiados[".starseed/peticiones/chat-a1.json"])
        self.assertEqual((chat["id"], chat["nombre"]), ("telegram.ejemplo_b_bot", "Bot B de ejemplo"))
        self.assertIn("puente:peticiones", chat["alias"])
        datos = G.leer_json(A.rutas(self.base)["llevar"], {})
        self.assertFalse(datos["pendiente"])
        self.assertTrue(datos["llegada"])

    def test_si_falla_o_falta_el_alias_queda_pendiente(self):
        self.ej.rc_ssh = 255
        self.assertFalse(self.llevar_a1({A.VAR_A1: ALIAS})[0])
        self.assertTrue(G.leer_json(A.rutas(self.base)["llevar"], {})["pendiente"])
        for malo in ({}, {A.VAR_A1: "-oProxyCommand=sh"}, {A.VAR_A1: "a1; rm"}):
            n = len(self.ej.de(A.SSH))
            ok, texto = self.llevar_a1(malo)
            self.assertFalse(ok)
            self.assertIn("sin configurar", texto)
            self.assertEqual(len(self.ej.de(A.SSH)), n)

    def test_el_servicio_reintenta_cada_5_min(self):
        A.marcar_llevar(self.base, True, T0 - 60)
        llamadas = []
        llevar = lambda **kw: llamadas.append(kw) or (False, "x")  # noqa: E731
        self.assertIsNone(A.llevar_si_toca(self.base, self.reloj, llevar=llevar))
        self.reloj.t = T0 + 241
        self.assertEqual(A.llevar_si_toca(self.base, self.reloj, llevar=llevar), (False, "x"))
        A.marcar_llevar(self.base, False, T0)
        self.reloj.t = T0 + 9999
        self.assertIsNone(A.llevar_si_toca(self.base, self.reloj, llevar=llevar))
        self.assertEqual(len(llamadas), 1)


class EstadoYEscritorio(Base):
    def test_estado_avisa_del_tunel_sin_huellas_enteras(self):
        a = Aparato(nombre="iPhone")
        self.poner_altas(a)
        self.ej.launchctl = "PID\tStatus\tLabel\n123\t0\tcom.starseed.mando.tunel\n-\t0\tcom.starseed.genesis-chats\n"
        texto = A.estado_texto(base=self.base, ruta_altas=self.ruta_altas, dueno_altas=YO, ahora=T0, ejecutar=self.ej,
                               entorno={A.VAR_A1: ALIAS}, env_archivo=os.path.join(self.dir, "x"))
        self.assertIn("Hay un túnel abierto a la Mac (com.starseed.mando.tunel): la firma no lo cubre", texto)
        self.assertIn(a.huella[:8], texto)
        for prohibido in (a.huella, DUENO, ALIAS, "123"):
            self.assertNotIn(prohibido, texto)
        self.ej.launchctl = "PID\tStatus\tLabel\n"
        texto = A.estado_texto(base=self.base, ruta_altas=self.ruta_altas, dueno_altas=0, ahora=T0, ejecutar=self.ej,
                               entorno={}, env_archivo=os.path.join(self.dir, "x"))
        self.assertIn("no se ejecuta nada", texto)
        self.assertIn("ninguno cargado", texto)

    def test_acceso_escritorio_y_lanzadores(self):
        escritorio = os.path.join(self.dir, "Desktop")
        os.makedirs(escritorio)
        self.assertEqual(A.acceso_escritorio(raiz="/ruta/del/repo", escritorio=escritorio, salida=self.salida.append), 0)
        for nombre, orden in zip(A.LANZADORES, ("emparejar", "revocar")):
            original = os.path.join(CARPETA, nombre)
            self.assertTrue(os.access(original, os.X_OK), nombre)
            copia = os.path.join(escritorio, nombre)
            self.assertEqual(stat.S_IMODE(os.stat(copia).st_mode), 0o755)
            with open(copia, encoding="utf-8") as f:
                texto = f.read()
            self.assertIn('RAIZ_POR_DEFECTO="/ruta/del/repo"', texto)
            self.assertIn("scripts/puente/genesis_aparatos.py %s" % orden, texto)
            self.assertTrue(texto.startswith("#!/bin/zsh"))
            if shutil.which("zsh"):
                self.assertEqual(subprocess.run(["zsh", "-n", copia]).returncode, 0)


# ── el servicio de la Mac con entradas firmadas (bloque GEN1114B de genesis_chats_puerta.py) ──

class PuenteFalso:
    def __init__(self):
        self.ordenes, self.dichos = [], []

    def orden(self, accion, ids, extra=None):
        self.ordenes.append({"accion": accion, "ids": list(ids), "quien": os.environ.get("STARSEED_IDE")})
        return 0

    def decir(self, texto, quien=None, tipo="mensaje", tarea=None):
        self.dichos.append({"texto": texto, "quien": quien})


class DirectorFalso:
    tachar = staticmethod(director_chat.tachar)

    def __init__(self):
        self.publicados = []

    def publicar(self, texto, de, rol="director", tipo="informe", canal="mando", **kw):
        m = {"id": "md-1800000000000-%04d" % len(self.publicados), "texto": texto, "de": de, "rol": rol, "tipo": tipo}
        self.publicados.append(m)
        return m


class Red:
    def __init__(self):
        self.llamadas, self.entradas = [], []

    def __call__(self, metodo, url, cab, cuerpo=None, timeout=8):
        self.llamadas.append({"metodo": metodo, "url": url, "cuerpo": json.loads(json.dumps(cuerpo))})
        if url.startswith(URL + "/v1/genesis/chats/entrada"):
            return 200, {"entradas": copy.deepcopy(self.entradas)}
        if url in (URL + "/v1/genesis/chats/acuse", URL + "/v1/genesis/aparatos/resultado"):
            return 200, {"ok": True}
        if url == "http://127.0.0.1:9002/api/mando/director-chat":
            return 200, {"pendiente": True, "mensaje": {"id": "md-1800000000000-beef"}}
        if url == "http://127.0.0.1:9002/api/mando/estado":
            return 200, {"cuentas": {"ola": "1114", "integradas": 1, "enCurso": 0, "esperandoAprobacion": 0, "pendientes": 0}}
        raise AssertionError("ruta inesperada")

    def a(self, prefijo):
        return [c for c in self.llamadas if c["url"].startswith(prefijo)]


class Servicio(Base):
    def setUp(self):
        super().setUp()
        self.red, self.p, self.d, self.logsvc = Red(), PuenteFalso(), DirectorFalso(), []
        self.completo = Aparato(nivel="completo", nombre="iPhone")
        self.texto_ = Aparato(nivel="texto", nombre="portátil")
        self.dev = Aparato(cuenta=DESA, nivel="completo", nombre="del desarrollador")
        self.poner_altas(self.completo, self.texto_, self.dev)
        G.escribir_json(os.path.join(self.base, "canon.json"), CANON)
        self.svc = self.servicio()

    def servicio(self, dueno=YO):
        tg = types.SimpleNamespace(parsear_orden=TG.parsear_orden, es_repetido=TG.es_repetido, _importa=lambda f: True)
        return G.PuenteGenesis(URL, FICHA, base=self.base, raiz=os.path.join(self.dir, "raiz"),
                               mando="http://127.0.0.1:9002", http=self.red, ahora=self.reloj,
                               stat=lambda r: (_ for _ in ()).throw(FileNotFoundError(r)),
                               modulos={"puente": self.p, "telegram": tg, "director_chat": self.d,
                                        "cliente": puerta_datos_cliente},
                               salida=self.logsvc.append, ruta_altas=self.ruta_altas, dueno_altas=dueno,
                               llevar=self.llevar)

    def acuses(self):
        return [(c["cuerpo"]["id"], c["cuerpo"]["estado"], c["cuerpo"].get("detalle", ""))
                for c in self.red.a(URL + "/v1/genesis/chats/acuse") if c["cuerpo"]["estado"] != "entregado"]

    def motivos(self):
        """El código del acuse: «[motivo] …» si lo puso la firma; si no, el estado."""
        salida = []
        for _, estado, detalle in self.acuses():
            m = re.match(r"^\[([a-z-]+)\]", detalle)
            salida.append(m.group(1) if m else estado)
        return salida

    def registro(self):
        try:
            with open(os.path.join(self.base, "registro.jsonl"), encoding="utf-8") as f:
                return [json.loads(x) for x in f.read().splitlines()]
        except OSError:
            return []

    def vuelta(self, *entradas):
        self.red.entradas = list(entradas)
        self.svc.estado["cursor_entradas"] = 0
        self.assertTrue(self.svc.ciclo_entradas())

    # ── sin firma, nada ──
    def test_v1_se_rechaza_exista_o_no_cuentas_json(self):
        v1 = dict(orden_a(), id=1, cuenta=DUENO, rol="dueño", destino="mac", recibido=F.iso_utc(T0 - 5))
        self.vuelta(v1, dict(texto_a_hermes(2), id=2, cuenta=DUENO, rol="dueño", destino="mac", recibido=F.iso_utc(T0)))
        os.remove(os.path.join(self.base, "cuentas.json"))
        self.vuelta(dict(v1, id=3, nonce=nonce(3)))
        self.assertEqual(self.motivos(), ["sin-firma"] * 3)
        self.assertEqual((self.p.ordenes, self.p.dichos, self.d.publicados), ([], [], []))
        self.assertEqual(self.red.a("http://127.0.0.1:9002"), [])
        self.assertEqual([r["firma"] for r in self.registro()], ["sin-firma"] * 3)

    def test_lista_de_altas_que_no_es_de_root_no_vale(self):
        self.svc = self.servicio(dueno=0)
        c = self.completo.carga(orden_a(), chat=CHAT_A)
        self.vuelta(self.completo.sobre(c))
        self.assertEqual(self.motivos(), ["aparato-desconocido"])
        self.assertEqual(self.p.ordenes, [])


    # ── con firma ──
    def test_texto_al_hilo_desde_un_aparato_texto(self):
        c = self.texto_.carga(decir_al_hilo(texto="Prueba GEN1114 firmada"))
        self.vuelta(self.texto_.sobre(c, ident=5))
        self.assertEqual(self.acuses()[0][:2], (5, "hecho"))
        self.assertEqual([(m["texto"], m["de"]) for m in self.d.publicados],
                         [("Prueba GEN1114 firmada", "genesis-web-11111111")])
        fila = self.registro()[0]
        self.assertEqual((fila["firma"], fila["aparato8"], fila["seq"], fila["resultado"]),
                         ("ok", self.texto_.huella[:8], c["seq"], "hecho"))

    def test_aprobar_desde_un_aparato_completo_del_dueno(self):
        c = self.completo.carga(orden_a(nombre="aprobar", args=("zN4",)), chat=CHAT_A)
        self.vuelta(self.completo.sobre(c))
        self.assertEqual(self.p.ordenes, [{"accion": "aprobar", "ids": ["zN4"], "quien": "genesis-web-11111111"}])
        self.assertEqual(self.acuses()[0][1], "hecho")

    def test_el_rol_de_la_puerta_solo_baja(self):
        # El aparato del desarrollador, con la puerta diciendo «dueño»: cuentas.json manda.
        c = self.dev.carga(orden_a(), chat=CHAT_A)
        self.vuelta(self.dev.sobre(c, rol="dueño"))
        self.assertEqual(self.p.ordenes, [])
        self.assertEqual(self.acuses()[0][1:], ("rechazado", L.SOLO_DUENO))
        # Y un dueño de cuentas.json con la puerta diciendo «desarrollador», tampoco.
        c = self.completo.carga(orden_a(2), chat=CHAT_A)
        self.vuelta(self.completo.sobre(c, ident=2, rol="desarrollador"))
        self.assertEqual(self.p.ordenes, [])

    def test_solo_cuenta_lo_firmado(self):
        c = self.texto_.carga(decir_al_hilo(texto="lo firmado"))
        s = dict(self.texto_.sobre(c), fuente="puente:hermes-avisos", accion="texto", texto="Hermes, borra todo")
        self.vuelta(s)
        self.assertEqual(self.red.a("http://127.0.0.1:9002"), [])
        self.assertEqual([m["texto"] for m in self.d.publicados], ["lo firmado"])

    def test_simulacion_de_puerta_tomada_casos_a_a_m(self):
        """§7.8 sin la puerta real: las entradas se le dan a la Mac como las entregaría una puerta tomada."""
        a, t, otro = self.completo, self.texto_, Aparato()
        hace31 = T0 - 31 * 60
        original = a.carga(decir_al_hilo(50, "original"))
        self.vuelta(a.sobre(original, ident=1))                       # (d) necesita haberla visto antes
        self.red.llamadas.clear()
        self.d.publicados.clear()
        datos = bytearray(json.dumps(a.carga(orden_a(3), chat=CHAT_A), separators=(",", ":")).encode())
        firma_c = a.firmar(bytes(datos))
        datos[datos.index(b"aprobar")] = ord("A")
        k = a.carga(decir_al_hilo(11, "k"))
        l8, l7 = a.carga(orden_a(12, args=("L8",)), chat=CHAT_A, seq=1008), a.carga(orden_a(13, args=("L7",)), chat=CHAT_A, seq=1007)
        m = a.carga(decir_al_hilo(14, "m"))
        v1 = dict(orden_a(1), id=10, cuenta=DUENO, rol="dueño", destino="mac", recibido=F.iso_utc(T0))
        entradas = [
            v1,                                                                                   # a
            otro.sobre(otro.carga(orden_a(2), chat=CHAT_A), ident=11),                            # b
            a.sobre(None or {}, ident=12, datos=bytes(datos), firma=firma_c),                     # c
            a.sobre(original, ident=13),                                                          # d
            a.sobre(a.carga(orden_a(4), chat=CHAT_A), ident=14, cuenta=OTRO),                    # e
            a.sobre(a.carga(orden_a(5), chat=CHAT_A, t=hace31), ident=15, recibido=hace31),       # f
            a.sobre(a.carga(texto_a_hermes(6), chat=CHAT_A, t=hace31), ident=16, recibido=hace31),  # g
            a.sobre(a.carga(texto_a_hermes(7), chat=CHAT_B), ident=17),                          # h
            a.sobre(a.carga(texto_a_hermes(8), chat=(CHAT_A[0], CHAT_B[1])), ident=18),          # i
            t.sobre(t.carga(texto_a_hermes(9), chat=CHAT_A), ident=19),                          # j
            a.sobre(k, ident=20), a.sobre(k, ident=21),                                          # k
            a.sobre(l8, ident=22), a.sobre(l7, ident=23),                                        # l
        ]
        self.vuelta(*entradas)
        A.anadir_retirado(A.rutas(self.base)["retirados"], a.huella, "mac", T0)
        self.vuelta(a.sobre(m, ident=24))                                                        # m
        self.assertEqual(self.motivos(), ["sin-firma", "aparato-desconocido", "firma-mala", "seq-repetido",
                                          "cuenta-distinta", "caducada", "caducada", "chat-distinto",
                                          "nombre-distinto", "nivel", "hecho", "seq-repetido", "hecho", "hecho",
                                          "aparato-revocado"])
        # Solo (k) escribe al hilo y solo (l) toca la cola (puente.orden), en el orden en que llegaron.
        self.assertEqual([x["ids"] for x in self.p.ordenes], [["L8"], ["L7"]])
        self.assertEqual([x["texto"] for x in self.d.publicados], ["k"])
        self.assertEqual((self.p.dichos, self.red.a("http://127.0.0.1:9002")), ([], []))
        self.assertIn("retirado en la Mac el ", self.acuses()[-1][2])


    def test_la_misma_entrada_entregada_otra_vez_repite_el_acuse_sin_ejecutar(self):
        c = self.completo.carga(orden_a(), chat=CHAT_A)
        self.vuelta(self.completo.sobre(c, ident=7))
        self.vuelta(self.completo.sobre(c, ident=7))         # la puerta perdió el acuse y la vuelve a dar
        self.assertEqual([x[:2] for x in self.acuses()], [(7, "hecho"), (7, "hecho")])
        self.assertEqual(len(self.p.ordenes), 1)

    def test_revocarme_retira_avisa_publica_y_lleva_al_a1(self):
        r = {"v": 1, "nonce": nonce(30), "t": F.iso_utc(T0), "fuente": "direccion", "accion": "revocarme"}
        self.vuelta(self.texto_.sobre(self.texto_.carga(r), ident=30))
        self.assertEqual(self.acuses()[0][1], "hecho")
        self.assertIn("Retirado en la Mac", self.acuses()[0][2])
        ret = A.leer_retirados(A.rutas(self.base)["retirados"])["retirados"]
        self.assertEqual([(x["huella"], x["por"]) for x in ret], [(self.texto_.huella, "aparato:" + self.texto_.huella[:8])])
        self.assertEqual(self.red.a(URL + "/v1/genesis/aparatos/resultado")[0]["cuerpo"],
                         {"huella": self.texto_.huella, "estado": "revocado"})
        self.assertEqual([m["texto"] for m in self.d.publicados], ["Se retiró el aparato «portátil» desde «portátil»."])
        self.assertEqual(len(self.llevados), 1)
        self.assertEqual([x["evento"] for x in self.log()], ["revocarme"])
        # Lo siguiente que firme ese aparato se rechaza, aunque lo firmara antes.
        self.vuelta(self.texto_.sobre(self.texto_.carga(decir_al_hilo(31)), ident=31))
        self.assertEqual(self.motivos()[-1], "aparato-revocado")

    def test_revocar_aparato_solo_de_la_misma_cuenta_y_siendo_dueno(self):
        base = {"v": 1, "t": F.iso_utc(T0), "fuente": "direccion", "accion": "revocar-aparato"}
        ajeno = self.completo.carga(dict(base, nonce=nonce(40), huella=self.dev.huella))
        self.vuelta(self.completo.sobre(ajeno, ident=40))
        desde_dev = self.dev.carga(dict(base, nonce=nonce(41), huella=self.dev.huella))
        self.vuelta(self.dev.sobre(desde_dev, ident=41, rol="desarrollador"))
        self.assertEqual([x[1] for x in self.acuses()], ["rechazado", "rechazado"])
        self.assertFalse(os.path.exists(A.rutas(self.base)["retirados"]))
        propio = self.completo.carga(dict(base, nonce=nonce(42), huella=self.texto_.huella))
        self.vuelta(self.completo.sobre(propio, ident=42))
        self.assertEqual(self.acuses()[-1][1], "hecho")
        self.assertEqual([x["huella"] for x in A.leer_retirados(A.rutas(self.base)["retirados"])["retirados"]],
                         [self.texto_.huella])
        self.assertEqual(self.d.publicados[-1]["texto"], "Se retiró el aparato «portátil» desde «iPhone».")

    def test_si_no_llega_al_a1_el_servicio_reintenta(self):
        intentos = []
        self.svc.llevar = lambda **kw: intentos.append(1) or A.marcar_llevar(self.base, True, self.reloj()) and (False, "no")
        r = {"v": 1, "nonce": nonce(50), "t": F.iso_utc(T0), "fuente": "direccion", "accion": "revocarme"}
        self.vuelta(self.texto_.sobre(self.texto_.carga(r), ident=50))
        self.assertIn("aún no en el A1", self.acuses()[0][2])
        self.vuelta()
        self.assertEqual(len(intentos), 1)
        self.reloj.t += 301
        self.vuelta()
        self.assertEqual(len(intentos), 2)

    def test_registro_y_acuses_sin_texto_rutas_ni_identificadores_enteros(self):
        secreto = "SECRETO https://x.invalid/a /Users/alex/x"
        entradas = [self.completo.sobre(self.completo.carga(texto_a_hermes(60, secreto), chat=CHAT_A), ident=60),
                    self.texto_.sobre(self.texto_.carga(texto_a_hermes(61, secreto), chat=CHAT_A), ident=61),
                    self.texto_.sobre(self.texto_.carga(decir_al_hilo(62, secreto), chat=CHAT_B), ident=62),
                    Aparato().sobre(Aparato().carga(decir_al_hilo(63, secreto)), ident=63)]
        self.vuelta(*entradas)
        with open(os.path.join(self.base, "registro.jsonl"), encoding="utf-8") as f:
            crudo = f.read()
        todo = crudo + json.dumps(self.acuses()) + "\n".join(self.logsvc) + json.dumps(G.leer_json(
            os.path.join(self.base, "vistos.json"), {})).replace(self.completo.huella, "").replace(self.texto_.huella, "")
        for prohibido in ("SECRETO", "x.invalid", "/Users/", DUENO, self.completo.huella, self.texto_.huella,
                          entradas[0]["carga"][:40], entradas[0]["firma"][:40]):
            self.assertNotIn(prohibido, crudo + json.dumps(self.acuses()) + "\n".join(self.logsvc))
        self.assertNotIn("SECRETO", todo)
        self.assertEqual(stat.S_IMODE(os.stat(os.path.join(self.base, "vistos.json")).st_mode), 0o600)

    def test_el_bloque_de_la_puerta_no_tiene_ninguna_via_para_v1(self):
        with open(os.path.join(CARPETA, "genesis_chats_puerta.py"), encoding="utf-8") as f:
            texto = f.read()
        bloques = re.findall(r"^[ \t]*# GEN1114B.*?^[ \t]*# /GEN1114B", texto, re.S | re.M)
        self.assertGreaterEqual(len(bloques), 3)
        for b in bloques:
            for prohibido in ("environ", "getenv", '"v") == 1', "sin_firma", "aceptar"):
                self.assertNotIn(prohibido, b)
            self.assertIsNone(re.search(r"(?<!/)\bv1\b|\bv ?: ?1\b", b))
        procesar = texto[texto.index("    def procesar(self, crudo):"):texto.index("    def ejecutar(self, plan, e):")]
        self.assertLess(procesar.index("comprobar_entrada_firmada"), procesar.index("validar_entrada"))
        self.assertLess(procesar.index("comprobar_entrada_firmada"), procesar.index("leer_cuentas"))
        self.assertNotIn("normalizar_entrada(crudo", procesar)


if __name__ == "__main__":
    unittest.main()
