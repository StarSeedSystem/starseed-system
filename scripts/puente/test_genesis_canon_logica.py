#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""GEN1114C · Pruebas de genesis_canon_logica.py (puro: sin red, sin disco, sin reloj)."""
import copy
import json
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import genesis_canon_logica as L  # noqa: E402

AHORA = "2026-11-13T00:00:00Z"
CANALES = ("mando", "director-presidente", "claude-cowork", "claude-mac", "hermes", "telegram", "chatgpt",
           "antigravity", "ide", "terminal")
NOMBRES = {"mando": "Este chat (Genesis)", "director-presidente": "Director presidente",
           "claude-cowork": "Claude Opus 5.5 · dirección (Cowork)", "claude-mac": "Claude Opus 5.5 · Mac (Claude Code)",
           "hermes": "Hermes", "telegram": "Telegram (tu móvil)", "chatgpt": "ChatGPT (Codex)",
           "antigravity": "Antigravity", "ide": "Chat de un IDE", "terminal": "Terminal"}
# chats.json de prueba con la misma forma que el del repo; los ids son inventados.
CHATS_JSON = {
    "_lee_esto_primero": "x", "nombre_canonico": "GENESIS · StarSeed OS", "prefijo_tareas": "GEN", "proyecto": "StarSeed",
    "entornos": {
        "claude": {"producto": "Claude", "proyecto": "p", "como_volver": "c", "id": "sesion-claude-0000000000000001"},
        "codex": {"producto": "Codex", "proyecto": "p", "como_volver": "c", "id": "sesion-codex-0000000000000002"},
        "hermes": {"producto": "Hermes", "proyecto": "p", "como_volver": "c", "id": "20261113_123456_hermes", "fijado": True},
        "antigravity": {"producto": "Antigravity", "proyecto": "p", "como_volver": "c", "id": None},
        "telegram": {"producto": "Telegram", "proyecto": "p", "como_volver": "c", "id": None,
                     "temas": {"GENESIS": "a", "olas": "b", "avisos": "c"}},
    },
}
SAL = b"s" * 32

# El canon.json de ejemplo compartido de §8.3 del contrato, tal cual.
EJEMPLO = json.loads("""{"v": 2, "version": 1, "actualizado": "2026-11-13T00:00:00Z", "chats": [
 {"v": 2, "id": "genesis", "nombre": "GENESIS · StarSeed OS", "nombreProvisional": false, "tipo": "direccion", "fuente": "direccion", "alias": ["direccion", "mando"], "medios": [], "version": 1, "actualizado": "2026-11-13T00:00:00Z", "refs": [], "versiones": {}},
 {"v": 2, "id": "genesis.canal.hermes", "nombre": "Hermes", "nombreProvisional": false, "tipo": "canal-director", "padre": "genesis", "fuente": null, "alias": [], "medios": [], "version": 1, "actualizado": "2026-11-13T00:00:00Z", "refs": [], "versiones": {}},
 {"v": 2, "id": "telegram.ejemplo_a_bot", "nombre": "Bot A de ejemplo", "nombreProvisional": false, "tipo": "puente-telegram", "fuente": "puente:hermes-avisos", "alias": ["puente:hermes-avisos", "hermes-avisos", "Hermes y avisos"], "medios": [], "version": 1, "actualizado": "2026-11-13T00:00:00Z", "refs": [], "versiones": {}},
 {"v": 2, "id": "telegram.ejemplo_b_bot", "nombre": "Bot B de ejemplo", "nombreProvisional": false, "tipo": "puente-telegram", "fuente": "puente:peticiones", "alias": ["puente:peticiones", "peticiones", "Peticiones y encargos"], "medios": [], "version": 1, "actualizado": "2026-11-13T00:00:00Z", "refs": [], "versiones": {}},
 {"v": 2, "id": "telegram.ejemplo_c_bot", "nombre": "Bot C de ejemplo", "nombreProvisional": false, "tipo": "puente-telegram", "fuente": "puente:avisos-directores", "alias": ["puente:avisos-directores", "avisos-directores", "Avisos de los directores"], "medios": [], "version": 1, "actualizado": "2026-11-13T00:00:00Z", "refs": [], "versiones": {}}
]}""")


def semilla():
    return L.semilla(CHATS_JSON, CANALES, NOMBRES, AHORA)


def descubierto(usuario, nombre, tipo="private"):
    return {"usuario": usuario, "nombre": nombre, "tipoChat": tipo}


class TestSemilla(unittest.TestCase):
    def test_trece_chats_con_los_ids_de_2_1(self):
        s = semilla()
        ids = [c["id"] for c in s["chats"]]
        self.assertEqual(len(ids), 13)
        self.assertEqual(ids[0], "genesis")
        self.assertEqual(ids[1:10], ["genesis.canal.%s" % c for c in CANALES if c != "mando"])
        self.assertEqual({c["tipo"] for c in s["chats"][10:]}, {"puente-telegram"})
        self.assertEqual([c["fuente"] for c in s["chats"][10:]],
                         ["puente:hermes-avisos", "puente:peticiones", "puente:avisos-directores"])
        self.assertTrue(all(c["nombreProvisional"] for c in s["chats"][10:]))
        self.assertEqual(s["chats"][0]["nombre"], "GENESIS · StarSeed OS")
        self.assertEqual(s["chats"][4]["nombre"], "Hermes")
        self.assertEqual({c.get("padre") for c in s["chats"][1:10]}, {"genesis"})

    def test_la_semilla_no_lleva_ids_de_sesion(self):
        texto = json.dumps(semilla())
        for e in CHATS_JSON["entornos"].values():
            if e.get("id"):
                self.assertNotIn(e["id"], texto)
        self.assertTrue(L.sin_ids(semilla()))

    def test_misma_forma_que_el_ejemplo_compartido(self):
        s = semilla()
        claves_ejemplo = {c["id"].split(".")[0] + c["tipo"]: set(c) for c in EJEMPLO["chats"]}
        for c in s["chats"]:
            esperadas = set(EJEMPLO["chats"][0])
            if c["tipo"] == "canal-director":
                esperadas = set(EJEMPLO["chats"][1])
            self.assertEqual(set(c), esperadas, c["id"])
        self.assertEqual(set(s), set(EJEMPLO))
        self.assertTrue(claves_ejemplo)
        self.assertEqual(s["chats"][0]["alias"], ["direccion", "mando"])
        a = [c for c in s["chats"] if c["fuente"] == "puente:hermes-avisos"][0]
        self.assertEqual(a["alias"], EJEMPLO["chats"][2]["alias"])

    def test_sin_nombres_de_canal_queda_el_id_provisional(self):
        s = L.semilla(CHATS_JSON, CANALES, {}, AHORA)
        h = [c for c in s["chats"] if c["id"] == "genesis.canal.hermes"][0]
        self.assertEqual(h["nombre"], "hermes")
        self.assertTrue(h["nombreProvisional"])

    def test_completar_no_pierde_lo_que_edito_el_dueno(self):
        s = semilla()
        editado = copy.deepcopy(s)
        h = [c for c in editado["chats"] if c["id"] == "genesis.canal.hermes"][0]
        h["nombre"] = "Hermes de casa"
        h["alias"].append("hermes-casa")
        editado["chats"] = [c for c in editado["chats"] if c["id"] != "genesis.canal.terminal"]
        canon, cambios = L.completar(editado, s, AHORA)
        h2 = [c for c in canon["chats"] if c["id"] == "genesis.canal.hermes"][0]
        self.assertEqual(h2["nombre"], "Hermes de casa")
        self.assertIn("hermes-casa", h2["alias"])
        self.assertIn("genesis.canal.terminal", [c["id"] for c in canon["chats"]])
        self.assertIn("añadido genesis.canal.terminal", cambios)
        # Repetirlo no cambia nada más.
        otra, cambios2 = L.completar(canon, s, AHORA)
        self.assertEqual(otra, canon)
        self.assertEqual(cambios2, [])

    def test_completar_mejora_un_nombre_automatico(self):
        sin = L.semilla(CHATS_JSON, CANALES, {}, AHORA)
        canon, _ = L.completar(sin, semilla(), AHORA)
        h = [c for c in canon["chats"] if c["id"] == "genesis.canal.hermes"][0]
        self.assertEqual((h["nombre"], h["nombreProvisional"]), ("Hermes", False))


class TestNombresEIds(unittest.TestCase):
    def test_privado_nombre_del_bot_grupo_titulo(self):
        me = {"first_name": "StarSeed Puente", "username": "x_bot"}
        self.assertEqual(L.nombre_de_puente(me, {"type": "private"}), ("StarSeed Puente", "private"))
        for tipo in ("group", "supergroup", "channel"):
            self.assertEqual(L.nombre_de_puente(me, {"type": tipo, "title": "Sala GENESIS"}), ("Sala GENESIS", tipo))
        with self.assertRaises(ValueError):
            L.nombre_de_puente({}, {"type": "private"})

    def test_id_telegram(self):
        self.assertEqual(L.id_telegram("@StarSeed_Design_Bot"), "telegram.starseed_design_bot")
        ident = L.id_telegram("bot12345678901_bot")
        self.assertTrue(L.RE_ID.match(ident))
        self.assertIsNone(L.RE_DIGITOS.search(ident))
        with self.assertRaises(ValueError):
            L.id_telegram("@")

    def test_limpiar_nombre_quita_bidi_y_controles(self):
        sucio = "‮Grupo⁦ de‏ Alex\x00\x07\n\t ok‬"
        self.assertEqual(L.limpiar_nombre(sucio), "Grupo de Alex ok")
        self.assertEqual(len(L.limpiar_nombre("a" * 200)), 80)
        self.assertEqual(L.limpiar_nombre(None), "")

    def test_unicidad(self):
        s = semilla()
        self.assertEqual(L.problemas_de_unicidad(s["chats"]), [])
        mal = copy.deepcopy(s["chats"])
        mal[1]["alias"].append("Hermes y avisos")       # alias de otro chat
        self.assertTrue(L.problemas_de_unicidad(mal))
        mal = copy.deepcopy(s["chats"])
        mal[2]["id"] = mal[1]["id"]                      # id repetido
        self.assertTrue(L.problemas_de_unicidad(mal))
        mal = copy.deepcopy(s["chats"])
        mal[3]["alias"].append("Hermes")                 # alias = nombre de otro
        self.assertTrue(L.problemas_de_unicidad(mal))
        with self.assertRaises(ValueError):
            L.catalogo_publico({"chats": mal, "version": 1}, SAL, {})


class TestDescubrir(unittest.TestCase):
    def test_primera_vez_congela_el_id_y_el_provisional_pasa_a_alias(self):
        c = L.fusionar_descubierto(semilla(), "hermes-avisos", descubierto("Hermes_Casa_Bot", "Hermes Casa"), AHORA)
        a = L.chat_de_fuente(c, "puente:hermes-avisos")
        self.assertEqual(a["id"], "telegram.hermes_casa_bot")
        self.assertEqual(a["nombre"], "Hermes Casa")
        self.assertFalse(a["nombreProvisional"])
        self.assertIn("telegram.hermes-avisos", a["alias"])
        self.assertIn("Hermes y avisos", a["alias"])
        tg = [m for m in a["medios"] if m["medio"] == "telegram"][0]
        self.assertEqual((tg["estadoNombre"], tg["usuario"]), ("igual", "@Hermes_Casa_Bot"))
        self.assertGreater(c["version"], 1)

    def test_un_bot_renombrado_conserva_su_id(self):
        c = L.fusionar_descubierto(semilla(), "peticiones", descubierto("design_bot", "Diseño"), AHORA)
        c2 = L.fusionar_descubierto(c, "peticiones", descubierto("otro_nombre_bot", "Diseño"), "2026-11-14T00:00:00Z")
        b = L.chat_de_fuente(c2, "puente:peticiones")
        self.assertEqual(b["id"], "telegram.design_bot")
        tg = [m for m in b["medios"] if m["medio"] == "telegram"][0]
        self.assertEqual(tg["usuario"], "@otro_nombre_bot")

    def test_nombre_cambiado_en_telegram_queda_distinto_y_el_canonico_no_cambia(self):
        c = L.fusionar_descubierto(semilla(), "avisos-directores", descubierto("c_bot", "Avisos"), AHORA)
        c2 = L.fusionar_descubierto(c, "avisos-directores", descubierto("c_bot", "Avisos nuevos", "group"), AHORA)
        ch = L.chat_de_fuente(c2, "puente:avisos-directores")
        self.assertEqual(ch["nombre"], "Avisos")
        tg = [m for m in ch["medios"] if m["medio"] == "telegram"][0]
        self.assertEqual((tg["estadoNombre"], tg["nombreEnMedio"]), ("distinto", "Avisos nuevos"))

    def test_error_no_cambia_nada_y_repetir_es_estable(self):
        s = semilla()
        self.assertEqual(L.fusionar_descubierto(s, "hermes-avisos", {"error": "sin red"}, AHORA), s)
        c = L.fusionar_descubierto(s, "hermes-avisos", descubierto("a_bot", "A"), AHORA)
        c2 = L.fusionar_descubierto(c, "hermes-avisos", descubierto("a_bot", "A"), AHORA)
        self.assertEqual(c2, c)
        nsp = L.marcar_no_se_puede(s, "avisos-directores", AHORA)
        tg = [m for m in L.chat_de_fuente(nsp, "puente:avisos-directores")["medios"] if m["medio"] == "telegram"][0]
        self.assertEqual(tg["estadoNombre"], "no-se-puede")

    def test_dos_puentes_con_el_mismo_bot_no_comparten_id(self):
        c = L.fusionar_descubierto(semilla(), "hermes-avisos", descubierto("mismo_bot", "Uno"), AHORA)
        c = L.fusionar_descubierto(c, "avisos-directores", descubierto("mismo_bot", "Dos"), AHORA)
        ids = [x["id"] for x in c["chats"]]
        self.assertEqual(len(ids), len(set(ids)))

    def test_nombre_que_choca_no_se_aplica(self):
        with self.assertRaises(ValueError):
            L.fusionar_descubierto(semilla(), "hermes-avisos", descubierto("x_bot", "Peticiones y encargos"), AHORA)

    def test_chat_de_fuente_con_el_ejemplo(self):
        self.assertEqual(L.chat_de_fuente(EJEMPLO, "puente:peticiones")["id"], "telegram.ejemplo_b_bot")
        self.assertEqual(L.chat_de_fuente(EJEMPLO, "direccion")["id"], "genesis")
        mal = copy.deepcopy(EJEMPLO)
        mal["chats"][3]["alias"].remove("puente:peticiones")
        self.assertIsNone(L.chat_de_fuente(mal, "puente:peticiones"))
        self.assertIsNone(L.chat_de_fuente(EJEMPLO, "puente:otro"))


class TestCatalogo(unittest.TestCase):
    def canon_con_nativos(self):
        c = L.fusionar_descubierto(semilla(), "hermes-avisos", descubierto("a_bot", "Bot A"), AHORA)
        a = L.chat_de_fuente(c, "puente:hermes-avisos")
        nativos = {"genesis": {"claude": CHATS_JSON["entornos"]["claude"]["id"], "hermes": CHATS_JSON["entornos"]["hermes"]["id"]},
                   a["id"]: {"telegram": "-1009876543210"}}
        return c, nativos

    def test_sin_refs_ni_versiones_ni_ids_nativos(self):
        c, nativos = self.canon_con_nativos()
        c["chats"][0]["contexto"] = {"instrucciones": "secreto"}
        cat = L.catalogo_publico(c, SAL, nativos, AHORA)
        texto = json.dumps(cat, ensure_ascii=False)
        for prohibido in ('"refs"', '"versiones"', "contexto", "secreto", "TELEGRAM_", "chats.json:", "-1009876543210",
                          CHATS_JSON["entornos"]["claude"]["id"], CHATS_JSON["entornos"]["hermes"]["id"]):
            self.assertNotIn(prohibido, texto)
        self.assertTrue(L.sin_ids(cat))
        a = [x for x in cat["chats"] if x["fuente"] == "puente:hermes-avisos"][0]
        tg = [m for m in a["medios"] if m["medio"] == "telegram"][0]
        self.assertRegex(tg["huella"], r"^[0-9a-f]{8}$")
        self.assertEqual(tg["huella"], L.huella_de(SAL, "-1009876543210"))
        self.assertEqual(set(cat), {"v", "chats", "version", "t"})
        self.assertEqual(cat["v"], 2)

    def test_un_titulo_con_un_telefono_no_rompe_el_catalogo(self):
        c = L.fusionar_descubierto(semilla(), "peticiones", descubierto("b_bot", "Grupo 600123456", "group"), AHORA)
        avisos = []
        cat = L.catalogo_publico(c, SAL, {}, AHORA, avisos)
        b = [x for x in cat["chats"] if x["fuente"] == "puente:peticiones"][0]
        self.assertEqual(b["nombre"], b["id"])
        self.assertTrue(b["nombreProvisional"])
        self.assertTrue(avisos)
        self.assertTrue(L.sin_ids(cat))

    def test_huella_hex_toda_de_cifras_no_cuenta(self):
        nativo = next(str(i) for i in range(100000) if L.huella_de(SAL, str(i)).isdigit())
        c = semilla()
        cat = L.catalogo_publico(c, SAL, {"genesis": {"claude": nativo}}, AHORA)
        self.assertTrue(cat["chats"][0]["medios"][1]["huella"].isdigit())
        self.assertTrue(L.sin_ids({"huella": "12345678", "version": 12345678}))
        self.assertFalse(L.sin_ids({"nombre": "chat 1234567"}))
        self.assertFalse(L.sin_ids({"x": [-1001234567890]}))

    def test_ejemplo_compartido_pasa(self):
        canon, avisos = L.migrar_canon(EJEMPLO)
        self.assertEqual(avisos, [])
        self.assertEqual(canon, EJEMPLO)
        cat = L.catalogo_publico(canon, SAL, {}, AHORA)
        self.assertEqual([c["id"] for c in cat["chats"]], [c["id"] for c in EJEMPLO["chats"]])


class TestMigrarYPunteros(unittest.TestCase):
    def test_migrar_tolera_basura(self):
        for basura in (None, 3, "x", [], {"chats": "no"}, {"v": 9, "chats": [1, {"id": "MAL ID"}]}):
            canon, _ = L.migrar_canon(basura)
            self.assertEqual(canon["v"], 2)
            self.assertIsInstance(canon["chats"], list)

    def test_migrar_quita_refs_que_parecen_valores(self):
        c = copy.deepcopy(EJEMPLO)
        c["chats"][2]["refs"] = [{"medio": "telegram", "clave": "~/.hermes/.env:TELEGRAM_CHAT_ID"},
                                 {"medio": "telegram", "clave": "-1001234567890"},
                                 {"medio": "telegram", "clave": "123456:ABC-token con espacios"}]
        canon, avisos = L.migrar_canon(c)
        self.assertEqual(canon["chats"][2]["refs"], [{"medio": "telegram", "clave": "~/.hermes/.env:TELEGRAM_CHAT_ID"}])
        self.assertEqual(len(avisos), 2)

    def test_seccion_de_punteros_estable_y_sin_cifras(self):
        s = semilla()
        t1, t2 = L.seccion_punteros(s), L.seccion_punteros(copy.deepcopy(s))
        self.assertEqual(t1, t2)
        self.assertTrue(t1.startswith("## Chats de Genesis"))
        for c in s["chats"]:
            self.assertIn("`%s`" % c["id"], t1)
        self.assertIsNone(L.RE_DIGITOS.search(t1))
        self.assertIn("descubrir --aplicar", L.seccion_punteros({"chats": [], "version": 0}))


if __name__ == "__main__":
    unittest.main()
