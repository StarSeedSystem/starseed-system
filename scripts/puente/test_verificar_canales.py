# -*- coding: utf-8 -*-
"""Pruebas de `verificar_canales`: la tabla canal × medio y sus lectores (DIR1121, parte 2).

Todo se prueba con inyección (listas, sqlite y jsonl temporales): ningún test envía un
mensaje a Telegram, consulta getUpdates ni escribe en la carpeta real del Chat Director.
"""
import json
import os
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path

AQUI = os.path.dirname(os.path.abspath(__file__))
if AQUI not in sys.path:
    sys.path.insert(0, AQUI)

import director_chat
import verificar_canales as VC


def _jsonl(ruta: Path, registros):
    ruta.parent.mkdir(parents=True, exist_ok=True)
    ruta.write_text(
        "\n".join(json.dumps(r, ensure_ascii=False) for r in registros) + "\n",
        encoding="utf-8",
    )


class TestMensajeYTabla(unittest.TestCase):
    def test_mensaje_de_prueba_lleva_la_marca_y_el_sello(self):
        texto = VC.mensaje_de_prueba("audiovisual", "Audiovisual y diseño", "av-123")
        self.assertTrue(texto.startswith(VC.MARCA))
        self.assertIn("Audiovisual y diseño", texto)
        self.assertIn("av-123", texto)

    def test_sello_es_unico_por_canal(self):
        a = VC.sello("principal", ahora=1000)
        b = VC.sello("principal", ahora=1000)
        self.assertNotEqual(a, b)
        self.assertTrue(a.startswith("pri-"))

    def test_tabla_cubre_cada_canal_por_medio_y_traduce_los_estados(self):
        lecturas = {
            "registro": {
                "principal": {"llega": True, "motivo": "en el registro"},
                "general": {"llega": False, "motivo": "no aparece"},
            },
            "hermes": {
                "principal": {"llega": None, "motivo": "sin sesión"},
            },
        }
        tabla = VC.tabla(VC.CANALES, ("registro", "hermes"), lecturas)
        self.assertEqual(len(tabla), 3 * 2)
        por = {(f["canal"], f["medio"]): f for f in tabla}
        self.assertEqual(por[("principal", "registro")]["estado"], VC.LLEGA)
        self.assertEqual(por[("general", "registro")]["estado"], VC.NO_LLEGA)
        self.assertEqual(por[("principal", "hermes")]["estado"], VC.NO_COMPROBABLE)
        self.assertEqual(por[("audiovisual", "hermes")]["estado"], VC.NO_COMPROBABLE)
        self.assertIn("motivo", por[("audiovisual", "hermes")])

    def test_resumen_cuenta_los_tres_estados(self):
        tabla = [
            {"estado": VC.LLEGA},
            {"estado": VC.LLEGA},
            {"estado": VC.NO_LLEGA},
            {"estado": VC.NO_COMPROBABLE},
        ]
        self.assertEqual(
            VC.resumen(tabla),
            {"llega": 2, "no llega": 1, "no comprobable": 1, "total": 4},
        )


class TestLectores(unittest.TestCase):
    def setUp(self):
        self.t = tempfile.TemporaryDirectory()
        self.raiz = Path(self.t.name)

    def tearDown(self):
        self.t.cleanup()

    def test_registro_del_canal_encuentra_el_sello(self):
        ruta = director_chat._directorio(self.raiz) / "audiovisual.jsonl"
        _jsonl(ruta, [{"id": "x", "texto": "[prueba de sincronía] av-1"}])
        self.assertEqual(VC.leer_registro("audiovisual", "av-1", self.raiz)["llega"], True)
        self.assertEqual(VC.leer_registro("audiovisual", "av-2", self.raiz)["llega"], False)

    def test_registro_inexistente_no_se_puede_comprobar(self):
        self.assertIsNone(VC.leer_registro("general", "g-1", self.raiz)["llega"])

    def test_bandeja_de_antigravity_y_claude(self):
        bandeja = director_chat._directorio(self.raiz) / "bandeja"
        _jsonl(bandeja / "antigravity.jsonl", [{"texto": "prueba pr-1"}])
        self.assertEqual(VC.leer_bandeja("antigravity", "pr-1", self.raiz)["llega"], True)
        self.assertIsNone(VC.leer_bandeja("claude-cowork", "pr-1", self.raiz)["llega"])

    def test_hermes_lee_la_sesion_fijada(self):
        db = self.raiz / "state.db"
        con = sqlite3.connect(str(db))
        con.execute("CREATE TABLE messages (id INTEGER PRIMARY KEY, session_id TEXT, content TEXT)")
        con.execute("INSERT INTO messages (session_id, content) VALUES ('s1', 'hola md-1')")
        con.commit()
        con.close()
        cfg = {"principal": {"hermes_sesion": "s1"}}
        self.assertEqual(VC.leer_hermes("principal", "md-1", cfg, str(db))["llega"], True)
        self.assertEqual(VC.leer_hermes("principal", "md-2", cfg, str(db))["llega"], False)
        self.assertIsNone(VC.leer_hermes("general", "md-1", {}, str(db))["llega"])

    def test_telegram_por_updates_registro_del_bot_o_resultado_del_envio(self):
        updates = [{"message": {"text": "eco tg-1 al bot"}}]
        self.assertEqual(VC.leer_telegram("principal", "tg-1", updates=updates)["llega"], True)
        self.assertEqual(VC.leer_telegram("principal", "tg-2", updates=updates)["llega"], False)
        log = self.raiz / "audiovisual-sync.jsonl"
        _jsonl(log, [{"id": "a1-1", "texto": "respuesta av-9"}])
        self.assertEqual(VC.leer_telegram("audiovisual", "av-9", log_bot=log)["llega"], True)
        self.assertEqual(
            VC.leer_telegram("principal", "x", envio={"telegram_ok": True})["llega"], True
        )
        self.assertEqual(
            VC.leer_telegram("principal", "x", envio={"telegram_ok": False})["llega"], False
        )
        self.assertIsNone(VC.leer_telegram("general", "g-1")["llega"])

    def test_los_canales_y_los_medios_del_contrato_estan_completos(self):
        self.assertEqual(VC.CANALES, ("principal", "general", "audiovisual"))
        self.assertEqual(
            VC.MEDIOS,
            ("registro", "hermes", "telegram", "antigravity", "codex",
             "claude-cowork", "metagenesis"),
        )

    def test_codex_recorre_las_sesiones_recientes(self):
        carpeta = self.raiz / ".codex" / "sessions" / "2026"
        _jsonl(carpeta / "rollout-1.jsonl", [{"type": "message", "texto": "veo cd-1"}])
        self.assertEqual(VC.leer_codex("cd-1", self.raiz / ".codex" / "sessions")["llega"], True)
        self.assertEqual(VC.leer_codex("cd-2", self.raiz / ".codex" / "sessions")["llega"], False)
        self.assertIsNone(VC.leer_codex("cd-1", self.raiz / "no-existe")["llega"])

    def test_metagenesis_lee_el_canal_comun(self):
        canal = self.raiz / "starseed_memory_root" / "mando" / "canal.jsonl"
        _jsonl(canal, [{"texto": "panel mg-1"}])
        self.assertEqual(VC.leer_metagenesis("principal", "mg-1", self.raiz)["llega"], True)
        self.assertEqual(VC.leer_metagenesis("principal", "mg-2", self.raiz)["llega"], False)


class TestEjecucionEInforme(unittest.TestCase):
    def setUp(self):
        self.t = tempfile.TemporaryDirectory()
        self.raiz = Path(self.t.name)

    def tearDown(self):
        self.t.cleanup()

    def test_ejecutar_publica_uno_por_canal_y_no_se_queda_sin_lectores(self):
        publicados = []
        vistas = []

        def publicar(canal, texto):
            publicados.append((canal, texto))

        def lector(canal, aguja):
            vistas.append((canal, aguja))
            return {"llega": True, "motivo": "ok"}

        tabla = VC.ejecutar(publicar, {"registro": lector, "hermes": lector})
        self.assertEqual([c for c, _ in publicados], list(VC.CANALES))
        self.assertTrue(all(texto.startswith(VC.MARCA) for _, texto in publicados))
        self.assertEqual(len(tabla), len(VC.CANALES) * 2)
        self.assertEqual(len(vistas), len(VC.CANALES) * 2)

    def test_un_lector_que_revienta_es_no_comprobable_sin_filtrar_detalle(self):
        def roto(canal, aguja):
            raise RuntimeError("token sk-abcdef0123456789")

        tabla = VC.ejecutar(lambda c, t: None, {"registro": roto}, canales=("principal",))
        self.assertEqual(tabla[0]["estado"], VC.NO_COMPROBABLE)
        self.assertNotIn("sk-abcdef", json.dumps(tabla))

    def test_guardar_informe_deja_el_json_del_panel(self):
        tabla = [{"canal": "principal", "medio": "registro", "estado": VC.LLEGA, "motivo": "ok"}]
        pruebas = VC.preparar_pruebas(("principal",), sello_fn=lambda c: c + "-1")
        datos = VC.informe(tabla, pruebas)
        ruta = VC.guardar_informe(datos, self.raiz)
        self.assertEqual(ruta, director_chat._directorio(self.raiz) / "verificacion-canales.json")
        leido = json.loads(ruta.read_text(encoding="utf-8"))
        self.assertEqual(leido["marca"], VC.MARCA)
        self.assertEqual(leido["resumen"]["llega"], 1)
        self.assertIn("principal", leido["pruebas"])


if __name__ == "__main__":
    unittest.main()
