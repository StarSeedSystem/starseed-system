#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""GEN1114C · Pruebas de genesis_canon.py, del bloque GEN1114C de sincronizar-ides.py y del de instalar-servicios.py.

Sin red: Telegram es una red falsa inyectada y la puerta un `http` falso. Todo vive en una HOME temporal; los
valores de prueba (tokens, ids de chat y de sesión) son inventados y se buscan en todo lo que sale.
"""
import importlib.util
import io
import json
import os
import plistlib
import stat
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
import genesis_canon as G  # noqa: E402
import genesis_canon_logica as L  # noqa: E402

RAIZ_REPO = os.path.dirname(os.path.dirname(AQUI))
TOKENS = {"A": "111111111:AAFalsoTokenDeHermesParaPruebas_x", "B": "222222222:BBFalsoTokenDeSintesisParaPruebas",
          "C": "333333333:CCFalsoTokenDeAvisosParaPruebas_z"}
CHATS = {"A": "-1001111111111", "B": "424242424", "C": "-1003333333333"}
SESIONES = {"claude": "sesion-claude-prueba-0000000000000001", "codex": "sesion-codex-prueba-0000000000000002",
            "hermes": "20261113_999999_prueba"}
BOTS = {TOKENS["A"]: ({"id": 111111111, "first_name": "Hermes Casa", "username": "Hermes_Casa_Bot"},
                      {"id": int(CHATS["A"]), "type": "private", "first_name": "Alex"}),
        TOKENS["B"]: ({"id": 222222222, "first_name": "StarSeed Design", "username": "StarSeed_Design_bot"},
                      {"id": int(CHATS["B"]), "type": "supergroup", "title": "Peticiones StarSeed"}),
        TOKENS["C"]: ({"id": 333333333, "first_name": "Avisos", "username": "starseed_avisos_bot"},
                      {"id": int(CHATS["C"]), "type": "private", "first_name": "Alex"})}
SECRETOS = list(TOKENS.values()) + list(CHATS.values()) + [c.lstrip("-") for c in CHATS.values()] + list(SESIONES.values()) \
    + [t.split(":")[0] for t in TOKENS.values()] + [t.split(":")[1] for t in TOKENS.values()]


class RedFalsa:
    """Responde como la API de Telegram para getMe/getChat; getUpdates (o cualquier otra) hace fallar la prueba."""

    def __init__(self, bots=None, sin_red=False):
        self.bots = BOTS if bots is None else bots
        self.urls = []
        self.sin_red = sin_red

    def __call__(self, url):
        self.urls.append(url)
        assert "getUpdates" not in url, "¡getUpdates! consumiría los mensajes del gateway de Hermes"
        if self.sin_red:
            raise ConnectionError("sin red hacia Telegram (URLError)")
        token, metodo = url.split("/bot", 1)[1].split("/", 1)
        metodo = metodo.split("?")[0]
        assert metodo in ("getMe", "getChat"), metodo
        if token not in self.bots:
            return {"ok": False, "description": "Unauthorized"}
        me, chat = self.bots[token]
        return {"ok": True, "result": me if metodo == "getMe" else chat}


def preparar_home(tmp, puentes=("A", "B", "C")):
    """HOME de prueba con los archivos de entorno donde los busca el registro y un repo con chats.json."""
    os.makedirs(os.path.join(tmp, ".hermes"))
    os.makedirs(os.path.join(tmp, ".starseed"))
    hermes, starseed = [], []
    if "A" in puentes:
        hermes += ["TELEGRAM_BOT_TOKEN=%s" % TOKENS["A"], "TELEGRAM_CHAT_ID=%s" % CHATS["A"]]
    if "B" in puentes:
        starseed += ["export TELEGRAM_SINTESIS_BOT_TOKEN='%s'" % TOKENS["B"], "TELEGRAM_SINTESIS_CHAT_ID=%s" % CHATS["B"]]
    if "C" in puentes:
        starseed += ["TELEGRAM_BOT_TOKEN=\"%s\"" % TOKENS["C"], "TELEGRAM_CHAT_ID=%s" % CHATS["C"]]
    starseed += ["PUERTA_DATOS_URL=https://puerta.prueba.invalid", "STARSEED_PUERTA_FICHA_GENESIS_MAC=pd_fichaDePruebaNoReal0000000000"]
    with open(os.path.join(tmp, ".hermes", ".env"), "w") as f:
        f.write("\n".join(hermes) + "\n")
    with open(os.path.join(tmp, ".starseed", "env"), "w") as f:
        f.write("\n".join(starseed) + "\n")
    raiz = os.path.join(tmp, "repo")
    os.makedirs(os.path.join(raiz, "scripts", "puente"))
    os.makedirs(os.path.join(raiz, "src", "lib", "mando"))
    for rel in (("scripts", "puente", "director_chat.py"), ("src", "lib", "mando", "chat-director-tipos.ts")):
        with open(os.path.join(RAIZ_REPO, *rel), encoding="utf-8") as f, \
                open(os.path.join(raiz, *rel), "w", encoding="utf-8") as g:
            g.write(f.read())
    chats = {"nombre_canonico": "GENESIS · StarSeed OS",
             "entornos": {k: {"producto": k, "id": v} for k, v in SESIONES.items()}}
    chats["entornos"]["antigravity"] = {"producto": "a", "id": None}
    chats["entornos"]["telegram"] = {"producto": "t", "id": None, "temas": {"GENESIS": "x"}}
    with open(os.path.join(raiz, "scripts", "puente", "chats.json"), "w", encoding="utf-8") as f:
        json.dump(chats, f)
    return raiz


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="gen1114c-")
        self.raiz = preparar_home(self.tmp)
        self.base = os.path.join(self.tmp, ".starseed", "genesis-chats")
        self.salida = []

    def tearDown(self):
        import shutil
        shutil.rmtree(self.tmp, ignore_errors=True)

    def descubrir(self, aplicar=True, red=None, ahora="2026-11-13T01:00:00Z"):
        red = red or RedFalsa()
        r = G.orden_descubrir(aplicar=aplicar, telegram=G.TelegramSoloLectura(red), base=self.base, raiz=self.raiz,
                              home=self.tmp, salida=self.salida.append, ahora=ahora)
        return r, red

    def texto_salida(self):
        return "\n".join(self.salida)

    def canon(self):
        with open(os.path.join(self.base, "canon.json"), encoding="utf-8") as f:
            return json.load(f)

    def sin_secretos(self, texto):
        for s in SECRETOS:
            self.assertNotIn(s, texto)
        self.assertIsNone(L.RE_DIGITOS.search(texto), texto)


class TestDescubrir(Base):
    def test_solo_getme_y_getchat_y_salida_sin_ids(self):
        (codigo, res), red = self.descubrir(aplicar=False)
        self.assertEqual(codigo, 0)
        metodos = sorted({u.split("/")[-1].split("?")[0] for u in red.urls})
        self.assertEqual(metodos, ["getChat", "getMe"])
        texto = self.texto_salida()
        self.sin_secretos(texto)
        self.assertIn("«Hermes Casa» · @Hermes_Casa_Bot · id propuesto telegram.hermes_casa_bot", texto)
        self.assertIn("supergrupo · nombre «Peticiones StarSeed»", texto)
        self.assertIn("TELEGRAM_SINTESIS_CHAT_ID", texto)
        self.assertFalse(os.path.exists(self.base), "sin --aplicar no se escribe nada")

    def test_la_interfaz_se_niega_a_getupdates_sin_tocar_la_red(self):
        red = RedFalsa()
        tg = G.TelegramSoloLectura(red)
        for metodo in ("getUpdates", "sendMessage", "setMyName", "deleteWebhook"):
            with self.assertRaises(PermissionError):
                tg._llamar(TOKENS["A"], metodo)
        self.assertEqual(red.urls, [])
        with open(os.path.join(AQUI, "genesis_canon.py"), encoding="utf-8") as f:
            codigo = f.read()
        self.assertNotIn('"getUpdates"', codigo)

    def test_aplicar_siembra_13_chats_en_600_con_nombres_reales(self):
        self.descubrir()
        c = self.canon()
        self.assertEqual(len(c["chats"]), 13)
        ids = [x["id"] for x in c["chats"]]
        self.assertIn("telegram.hermes_casa_bot", ids)
        self.assertIn("telegram.starseed_design_bot", ids)
        self.assertIn("telegram.starseed_avisos_bot", ids)
        self.assertEqual(L.chat_de_fuente(c, "puente:peticiones")["nombre"], "Peticiones StarSeed")
        self.assertEqual(L.chat_de_fuente(c, "puente:hermes-avisos")["nombre"], "Hermes Casa")
        self.assertEqual(stat.S_IMODE(os.stat(os.path.join(self.base, "canon.json")).st_mode), 0o600)
        with open(os.path.join(self.base, "canon.json"), encoding="utf-8") as f:
            self.sin_secretos(f.read())
        salida = io.StringIO()
        self.assertEqual(G.orden_estado(base=self.base, salida=lambda t: salida.write(t + "\n")), 0)
        self.assertIn("13 chats", salida.getvalue())
        self.assertIn("permisos 600", salida.getvalue())
        self.sin_secretos(salida.getvalue())

    def test_sin_red_quedan_provisionales_con_su_motivo(self):
        self.descubrir(red=RedFalsa(sin_red=True))
        texto = self.texto_salida()
        self.assertIn("sin red hacia Telegram", texto)
        self.assertIn("nombre provisional", texto)
        c = self.canon()
        for fuente in ("puente:hermes-avisos", "puente:peticiones", "puente:avisos-directores"):
            ch = L.chat_de_fuente(c, fuente)
            self.assertTrue(ch["nombreProvisional"])
            tg = [m for m in ch["medios"] if m["medio"] == "telegram"][0]
            self.assertEqual(tg["estadoNombre"], "no-se-puede")
        self.sin_secretos(texto)

    def test_sin_variable_lo_dice(self):
        import shutil
        shutil.rmtree(self.tmp)
        os.makedirs(self.tmp)
        self.raiz = preparar_home(self.tmp, puentes=("A", "B"))
        self.descubrir()
        texto = self.texto_salida()
        self.assertIn("falta TELEGRAM_BOT_TOKEN y TELEGRAM_CHAT_ID en ~/.starseed/env", texto)
        self.assertTrue(L.chat_de_fuente(self.canon(), "puente:avisos-directores")["nombreProvisional"])

    def test_id_congelado_aunque_el_bot_cambie_de_usuario_y_copias_rotadas(self):
        self.descubrir()
        bots = dict(BOTS)
        me, chat = bots[TOKENS["A"]]
        bots[TOKENS["A"]] = (dict(me, username="Otro_Usuario_Bot", first_name="Hermes Nuevo"), chat)
        for i in range(6):
            self.descubrir(red=RedFalsa(bots=bots), ahora="2026-11-13T0%d:30:00Z" % i)
        a = L.chat_de_fuente(self.canon(), "puente:hermes-avisos")
        self.assertEqual(a["id"], "telegram.hermes_casa_bot")
        self.assertEqual(a["nombre"], "Hermes Casa")
        tg = [m for m in a["medios"] if m["medio"] == "telegram"][0]
        self.assertEqual((tg["estadoNombre"], tg["nombreEnMedio"], tg["usuario"]),
                         ("distinto", "Hermes Nuevo", "@Otro_Usuario_Bot"))
        for i in range(1, 6):
            ruta = os.path.join(self.base, "canon.json.%d" % i)
            self.assertTrue(os.path.exists(ruta), ruta)
            self.assertEqual(stat.S_IMODE(os.stat(ruta).st_mode), 0o600)
        self.assertFalse(os.path.exists(os.path.join(self.base, "canon.json.6")))
        self.assertEqual([n for n in os.listdir(self.base) if n.endswith(".tmp")], [])

    def test_repetir_la_siembra_no_pierde_lo_que_edito_el_dueno(self):
        self.descubrir()
        c = self.canon()
        for ch in c["chats"]:
            if ch["id"] == "genesis.canal.hermes":
                ch["nombre"] = "Hermes (casa)"
                ch["alias"].append("hermes-casa")
        c["chats"].append({"v": 2, "id": "astraura.mi-chat", "nombre": "Mi chat", "nombreProvisional": False,
                           "tipo": "astraura", "fuente": None, "alias": [], "medios": [], "version": 1,
                           "actualizado": "x", "refs": [], "versiones": {}})
        with open(os.path.join(self.base, "canon.json"), "w", encoding="utf-8") as f:
            json.dump(c, f)
        self.descubrir(ahora="2026-11-13T05:00:00Z")
        c2 = self.canon()
        h = [x for x in c2["chats"] if x["id"] == "genesis.canal.hermes"][0]
        self.assertEqual(h["nombre"], "Hermes (casa)")
        self.assertIn("hermes-casa", h["alias"])
        self.assertIn("astraura.mi-chat", [x["id"] for x in c2["chats"]])
        self.assertEqual(len(c2["chats"]), 14)

    def test_registro_ilegible_se_guarda_aparte_antes_de_resembrar(self):
        os.makedirs(self.base)
        with open(os.path.join(self.base, "canon.json"), "w") as f:
            f.write("{esto no es json")
        self.descubrir()
        apartados = [n for n in os.listdir(self.base) if ".descartado-" in n]
        self.assertEqual(len(apartados), 1)
        with open(os.path.join(self.base, apartados[0])) as f:
            self.assertEqual(f.read(), "{esto no es json")
        self.assertEqual(len(self.canon()["chats"]), 13)


class TestSubir(Base):
    def test_el_catalogo_no_lleva_ningun_valor_de_las_variables(self):
        self.descubrir()
        enviado = []

        def http(metodo, url, cab, cuerpo, timeout=8):
            enviado.append((metodo, url, cab, cuerpo))
            return 200, {"ok": True, "version": cuerpo["catalogo"]["version"]}

        codigo = G.orden_subir(base=self.base, raiz=self.raiz, home=self.tmp, http=http, salida=self.salida.append, entorno={})
        self.assertEqual(codigo, 0)
        self.assertEqual(len(enviado), 1)
        metodo, url, cab, cuerpo = enviado[0]
        self.assertEqual(metodo, "POST")
        self.assertTrue(url.endswith("/v1/genesis/chats/canon"))
        texto = json.dumps(cuerpo, ensure_ascii=False)
        for s in SECRETOS:
            self.assertNotIn(s, texto)
        for prohibido in ('"refs"', '"versiones"', "TELEGRAM_", "chats.json:", ".env"):
            self.assertNotIn(prohibido, texto)
        self.assertTrue(L.sin_ids(cuerpo))
        cat = cuerpo["catalogo"]
        self.assertEqual(len(cat["chats"]), 13)
        a = L.chat_de_fuente(cat, "puente:hermes-avisos")
        tg = [m for m in a["medios"] if m["medio"] == "telegram"][0]
        self.assertRegex(tg["huella"], r"^[0-9a-f]{8}$")
        g = [x for x in cat["chats"] if x["id"] == "genesis"][0]
        self.assertTrue(all(m["huella"] for m in g["medios"] if m["medio"] in ("claude", "codex", "hermes")))
        self.assertEqual(stat.S_IMODE(os.stat(os.path.join(self.base, "sal-medios")).st_mode), 0o600)
        self.sin_secretos(self.texto_salida())
        antes = os.stat(os.path.join(self.base, "canon.json")).st_mtime_ns
        G.orden_subir(base=self.base, raiz=self.raiz, home=self.tmp, http=http, salida=self.salida.append, entorno={})
        self.assertEqual(os.stat(os.path.join(self.base, "canon.json")).st_mtime_ns, antes, "subir no escribe canon.json")
        self.assertEqual(enviado[0][3]["catalogo"]["chats"], enviado[1][3]["catalogo"]["chats"], "huellas estables")

    def test_un_titulo_con_telefono_no_rompe_subir(self):
        bots = dict(BOTS)
        me, chat = bots[TOKENS["B"]]
        bots[TOKENS["B"]] = (me, dict(chat, title="Grupo 600123456"))
        self.descubrir(red=RedFalsa(bots=bots))
        enviado = []
        codigo = G.orden_subir(base=self.base, raiz=self.raiz, home=self.tmp, salida=self.salida.append, entorno={},
                               http=lambda m, u, c, cuerpo, timeout=8: (enviado.append(cuerpo), (200, {"ok": True}))[1])
        self.assertEqual(codigo, 0)
        b = L.chat_de_fuente(enviado[0]["catalogo"], "puente:peticiones")
        self.assertTrue(b["nombreProvisional"])
        self.assertTrue(L.sin_ids(enviado[0]))
        self.assertIn("número largo", self.texto_salida())
        self.sin_secretos(self.texto_salida())

    def test_sin_registro_o_sin_ficha_no_sube(self):
        llamadas = []
        http = lambda *a, **k: llamadas.append(a) or (200, {})  # noqa: E731
        self.assertEqual(G.orden_subir(base=self.base, raiz=self.raiz, home=self.tmp, http=http,
                                       salida=self.salida.append, entorno={}), 0)
        self.assertFalse(os.path.exists(self.base))
        self.descubrir()
        with open(os.path.join(self.tmp, ".starseed", "env"), "w") as f:
            f.write("")
        G.orden_subir(base=self.base, raiz=self.raiz, home=self.tmp, http=http, salida=self.salida.append, entorno={})
        self.assertEqual(llamadas, [])
        self.assertIn("no se sube", self.texto_salida())

    def test_aplicar_nombres_fase_1_no_cambia_nada(self):
        self.descubrir()
        antes = self.canon()
        self.assertEqual(G.orden_aplicar_nombres(base=self.base, salida=self.salida.append), 0)
        self.assertEqual(self.canon(), antes)
        self.assertIn("Fase 1", self.texto_salida())


class TestPunteros(Base):
    def cargar_sincronizar(self):
        espec = importlib.util.spec_from_file_location("sincronizar_ides_prueba", os.path.join(AQUI, "sincronizar-ides.py"))
        mod = importlib.util.module_from_spec(espec)
        with mock.patch.dict(os.environ, {"STARSEED_ROOT": self.raiz, "HOME": self.tmp,
                                          "STARSEED_GENESIS_CHATS_DIR": self.base}):
            espec.loader.exec_module(mod)
        return mod

    def test_la_seccion_es_identica_en_los_tres_ides(self):
        self.descubrir()
        mod = self.cargar_sincronizar()
        with mock.patch.dict(os.environ, {"HOME": self.tmp, "STARSEED_GENESIS_CHATS_DIR": self.base}):
            destinos = mod.repartir("x")
        self.assertFalse([d for d in destinos if "FALLÓ" in d], destinos)
        secciones = []
        for rel in (".codex/AGENTS.md", ".hermes/PUENTE-DE-MANDO.md", ".gemini/antigravity/PUENTE-DE-MANDO.md"):
            with open(os.path.join(self.tmp, rel), encoding="utf-8") as f:
                texto = f.read()
            secciones.append(texto[texto.index("## Chats de Genesis"):])
        self.assertEqual(secciones[0], secciones[1])
        self.assertEqual(secciones[1], secciones[2])
        self.assertEqual(secciones[0], L.seccion_punteros(self.canon()))
        self.assertEqual(len([l for l in secciones[0].splitlines() if l.startswith("| ") and "`" in l]), 13)
        self.assertIn("`telegram.hermes_casa_bot`", secciones[0])
        self.sin_secretos(secciones[0])

    def test_sin_registro_usa_la_semilla_sin_escribir_nada(self):
        mod = self.cargar_sincronizar()
        with mock.patch.dict(os.environ, {"STARSEED_GENESIS_CHATS_DIR": self.base}):
            seccion = mod.seccion_chats_genesis()
        self.assertIn("`genesis`", seccion)
        self.assertIn("(nombre provisional)", seccion)
        self.assertFalse(os.path.exists(self.base))


class TestInstalador(unittest.TestCase):
    """Bloque GEN1114C de instalar-servicios.py, con HOME temporal y `subprocess.run` falso (nada toca launchd)."""

    def cargar(self, solo="", extra=None, cargados=()):
        self.tmp = tempfile.mkdtemp(prefix="gen1114c-inst-")
        os.makedirs(os.path.join(self.tmp, "Library", "LaunchAgents"))
        self.llamadas = []

        def falso_run(orden, **kw):
            self.llamadas.append(list(orden))
            m = mock.Mock()
            m.stdout, m.stderr = "", ""
            m.returncode = 0
            if orden[:2] == ["launchctl", "list"]:
                m.returncode = 0 if orden[2] in cargados else 113
            return m

        entorno = {"HOME": self.tmp, "STARSEED_SOLO": solo, "STARSEED_RAIZ": RAIZ_REPO,
                   "STARSEED_PY3": "/opt/homebrew/bin/python3", "STARSEED_TUNEL_MANDO": "", "STARSEED_TUNEL_METAGENESIS": ""}
        entorno.update(extra or {})
        espec = importlib.util.spec_from_file_location("instalar_servicios_gen1114c", os.path.join(AQUI, "instalar-servicios.py"))
        mod = importlib.util.module_from_spec(espec)
        salida = io.StringIO()
        with mock.patch.object(subprocess, "run", falso_run), mock.patch.dict(os.environ, entorno), \
                mock.patch("sys.stdout", salida):
            try:
                espec.loader.exec_module(mod)
            except SystemExit:
                pass
        self.salida = salida.getvalue()
        self.ag = os.path.join(self.tmp, "Library", "LaunchAgents")
        return mod

    def tearDown(self):
        import shutil
        shutil.rmtree(getattr(self, "tmp", ""), ignore_errors=True)

    def tocados(self, etiqueta):
        return [c for c in self.llamadas if c[:1] == ["launchctl"] and c[1] in ("load", "unload")
                and os.path.basename(c[-1]) == etiqueta + ".plist"]

    def test_una_ejecucion_normal_no_carga_los_tuneles(self):
        mod = self.cargar(solo="")
        for etiqueta in ("com.starseed.mando.tunel", "com.starseed.tunel-metagenesis"):
            self.assertEqual(self.tocados(etiqueta), [], etiqueta)
            self.assertFalse(os.path.exists(os.path.join(self.ag, etiqueta + ".plist")), etiqueta)
        self.assertNotIn("tunel-metagenesis", mod.SERVICIOS)
        self.assertTrue(os.path.exists(os.path.join(self.ag, "com.starseed.cartero.plist")), "el resto sí se instala")
        self.assertIn("mando-tunel OMITIDO", self.salida)
        self.assertNotIn("genesis-canon", mod.PERIODICOS)

    def test_si_ya_esta_cargado_lo_dice_y_no_lo_toca(self):
        self.cargar(solo="", cargados=("com.starseed.mando.tunel", "com.starseed.tunel-metagenesis"))
        self.assertIn("AVISO · sigue cargado", self.salida)
        self.assertEqual(self.tocados("com.starseed.mando.tunel"), [])
        self.assertEqual(self.tocados("com.starseed.tunel-metagenesis"), [])

    def test_con_starseed_solo_mando_tunel_si(self):
        self.cargar(solo="mando-tunel")
        self.assertEqual(os.listdir(self.ag), ["com.starseed.mando.tunel.plist"])
        self.assertEqual([c[1] for c in self.tocados("com.starseed.mando.tunel")], ["unload", "load"])

    def test_con_la_variable_explicita_si(self):
        self.cargar(solo="", extra={"STARSEED_TUNEL_MANDO": "1"})
        self.assertIn("load", [c[1] for c in self.tocados("com.starseed.mando.tunel")])
        self.assertEqual(self.tocados("com.starseed.tunel-metagenesis"), [])

    def test_tunel_metagenesis_solo_si_se_nombra(self):
        self.cargar(solo="tunel-metagenesis")
        self.assertEqual(os.listdir(self.ag), ["com.starseed.tunel-metagenesis.plist"])

    def test_otro_solo_no_toca_tuneles_ni_mira_launchd(self):
        self.cargar(solo="pruebas")
        self.assertEqual(os.listdir(self.ag), ["com.starseed.pruebas.plist"])
        self.assertFalse([c for c in self.llamadas if c[:2] == ["launchctl", "list"]])

    def test_genesis_canon_con_su_plist_adaptado(self):
        mod = self.cargar(solo="genesis-canon")
        self.assertEqual(os.listdir(self.ag), ["com.starseed.genesis-canon.plist"])
        with open(os.path.join(self.ag, "com.starseed.genesis-canon.plist"), "rb") as f:
            p = plistlib.load(f)
        self.assertEqual(p["Label"], "com.starseed.genesis-canon")
        self.assertEqual(p["StartInterval"], 600)
        self.assertEqual(p["WatchPaths"], [os.path.join(self.tmp, ".starseed", "genesis-chats", "canon.json")])
        # (adaptar_plist cambia «/Users/alex/» por la HOME de prueba también dentro de la raíz: solo se mira el final)
        self.assertTrue(p["ProgramArguments"][-2].endswith("/scripts/puente/genesis_canon.py"))
        self.assertEqual(p["ProgramArguments"][-1], "subir")
        self.assertEqual(p["ProgramArguments"][0], "/opt/homebrew/bin/python3")
        self.assertIn("genesis-canon", mod.PERIODICOS)


if __name__ == "__main__":
    unittest.main()
