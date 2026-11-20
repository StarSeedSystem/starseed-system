# -*- coding: utf-8 -*-
"""Pruebas unitarias para la sincronización en tiempo real Hermes ↔ MetaGenesis ↔ Telegram dirección."""
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
import sincronizador_direccion as SD


def _crear_db_hermes(ruta_db: Path):
    con = sqlite3.connect(str(ruta_db))
    con.execute(
        "CREATE TABLE sessions (id TEXT PRIMARY KEY, source TEXT, chat_id TEXT, model TEXT, title TEXT)"
    )
    con.execute(
        "CREATE TABLE messages (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT, role TEXT, content TEXT)"
    )
    con.execute(
        "INSERT INTO sessions VALUES (?, 'local', ?, 'auto', 'Dirección MetaGenesis')",
        ("local-1daf85ca", "local-1daf85ca"),
    )
    con.execute(
        "INSERT INTO sessions VALUES (?, 'telegram', ?, 'auto', 'StarSeed · Telegram')",
        ("tg-main", "8670436815"),
    )
    con.execute(
        "INSERT INTO messages (session_id, role, content) VALUES ('local-1daf85ca', 'user', 'mensaje antiguo')"
    )
    con.commit()
    return con


class TestSincronizadorHermesYTelegram(unittest.TestCase):
    def test_siembra_inicial_no_inunda_y_nuevos_turnos_entran(self):
        with tempfile.TemporaryDirectory() as tmp:
            raiz = Path(tmp) / "repo"
            db_path = Path(tmp) / "state.db"
            con = _crear_db_hermes(db_path)
            estado = {}
            cfg = {"sincronizar_canales": {"hermes": True, "telegram": True}}
            os.environ["STARSEED_CHAT_EN_PRUEBAS"] = "1"
            try:
                n0 = SD.sincronizar_desde_hermes(
                    estado, "local-1daf85ca", cfg, db_path=str(db_path),
                    chat_id_telegram="8670436815", raiz=raiz,
                )
                self.assertEqual(n0, 0)
                self.assertEqual(estado["hermes_sync_ultimo_id"], 1)

                # Turnos nuevos: uno interno (se ignora), uno real de Hermes y uno de Telegram
                con.execute(
                    "INSERT INTO messages (session_id, role, content) VALUES ('local-1daf85ca', 'user', 'Eres el Director presidente de Genesis...')"
                )
                con.execute(
                    "INSERT INTO messages (session_id, role, content) VALUES ('local-1daf85ca', 'assistant', 'Estado de MetaGenesis listo en Hermes.')"
                )
                con.execute(
                    "INSERT INTO messages (session_id, role, content) VALUES ('tg-main', 'user', 'Revisa las colas desde Telegram')"
                )
                con.commit()

                n1 = SD.sincronizar_desde_hermes(
                    estado, "local-1daf85ca", cfg, db_path=str(db_path),
                    chat_id_telegram="8670436815", raiz=raiz,
                )
                self.assertEqual(n1, 2)
                leidos = director_chat.leer(limite=20, raiz=raiz)
                textos = [r.get("texto") for r in leidos if r.get("tipo") != "entrega"]
                self.assertEqual(
                    textos,
                    ["Estado de MetaGenesis listo en Hermes.", "Revisa las colas desde Telegram"],
                )
                self.assertEqual(leidos[0]["canal"], "hermes")
                self.assertEqual(leidos[1]["canal"], "telegram")
                self.assertIn("antigravity", leidos[1]["canales"])
            finally:
                os.environ.pop("STARSEED_CHAT_EN_PRUEBAS", None)
                con.close()

    def test_espejo_a_telegram_sin_bucles_y_con_etiqueta(self):
        cfg = {"sincronizar_canales": {"telegram": True}}
        registros_init = [
            {"id": "md-1", "de": "alex", "rol": "alex", "tipo": "mensaje", "canal": "director-presidente", "texto": "viejo"}
        ]
        estado = {}
        enviados = []
        self.assertEqual(
            SD.espejar_a_telegram_direccion(
                registros_init, estado, cfg, enviar_fn=lambda et, tx: (enviados.append((et, tx)) or True, "ok")
            ),
            0,
        )
        self.assertEqual(enviados, [])

        nuevos = registros_init + [
            {"id": "md-2", "de": "antigravity", "rol": "director", "tipo": "respuesta", "canal": "antigravity", "texto": "Respuesta enlazada a todos los canales"},
            {"id": "md-3", "de": "alex", "rol": "alex", "tipo": "mensaje", "canal": "telegram", "texto": "No debe hacer eco a Telegram"},
            {"id": "md-4", "de": "director-presidente", "rol": "director", "tipo": "respuesta", "canal": "director-presidente", "texto": "Síntesis del presidente"},
        ]
        n = SD.espejar_a_telegram_direccion(
            nuevos, estado, cfg, enviar_fn=lambda et, tx: (enviados.append((et, tx)) or True, "ok")
        )
        self.assertEqual(n, 2)
        self.assertEqual(
            enviados,
            [
                ("Antigravity", "Respuesta enlazada a todos los canales"),
                ("Director presidente", "Síntesis del presidente"),
            ],
        )


class TestTresCanalesEspecializados(unittest.TestCase):
    def test_separacion_de_credenciales_para_los_tres_bots(self):
        with tempfile.TemporaryDirectory() as tmp:
            env_starseed = Path(tmp) / "env"
            env_hermes = Path(tmp) / "hermes.env"
            env_starseed.write_text(
                "TELEGRAM_MAGGACORTEX_BOT_TOKEN=tok-magga\n"
                "TELEGRAM_MAGGACORTEX_CHAT_ID=cid-magga\n"
                "TELEGRAM_SINTESIS_BOT_TOKEN=tok-design\n"
                "TELEGRAM_SINTESIS_CHAT_ID=cid-design\n",
                encoding="utf-8",
            )
            env_hermes.write_text(
                "TELEGRAM_BOT_TOKEN=tok-general\n"
                "TELEGRAM_CHAT_ID=cid-general\n",
                encoding="utf-8",
            )
            archivos = (str(env_starseed), str(env_hermes))
            self.assertEqual(SD.leer_telegram_canal("principal", archivos=archivos), ("tok-magga", "cid-magga"))
            self.assertEqual(SD.leer_telegram_canal("general", archivos=archivos), ("tok-general", "cid-general"))
            self.assertEqual(SD.leer_telegram_canal("audiovisual", archivos=archivos), ("tok-design", "cid-design"))

    def test_recoger_maggacortex_siembra_offset_filtra_chat_y_enruta_a_directores(self):
        with tempfile.TemporaryDirectory() as tmp:
            raiz = Path(tmp) / "repo"
            estado = {}
            cfg = {"sincronizar_canales": {"telegram": True}}
            os.environ["STARSEED_CHAT_EN_PRUEBAS"] = "1"
            try:
                lotes = [
                    [{"update_id": 10, "message": {"chat": {"id": 8670436815}, "text": "Antiguo previo al arranque"}}],
                    [
                        {"update_id": 11, "message": {"chat": {"id": 9999999}, "from": {"is_bot": False}, "text": "Intruso bloqueado"}},
                        {"update_id": 12, "message": {"chat": {"id": 8670436815}, "from": {"is_bot": True}, "text": "Eco de bot"}},
                        {"update_id": 13, "message": {"chat": {"id": 8670436815}, "from": {"is_bot": False}, "text": "Activa Jev en olas pendientes"}},
                    ],
                ]
                idx = {"i": 0}

                def _updates(_offset):
                    res = lotes[idx["i"]]
                    idx["i"] += 1
                    return res

                n0 = SD.recoger_maggacortex_telegram(
                    estado, cfg, get_updates_fn=_updates, raiz=raiz, chat_id_autorizado="8670436815"
                )
                self.assertEqual(n0, 0)
                self.assertEqual(estado["maggacortex_tg_offset"], 11)

                n1 = SD.recoger_maggacortex_telegram(
                    estado, cfg, get_updates_fn=_updates, raiz=raiz, chat_id_autorizado="8670436815"
                )
                self.assertEqual(n1, 1)
                self.assertEqual(estado["maggacortex_tg_offset"], 14)

                leidos = director_chat.leer(limite=20, raiz=raiz)
                msgs = [r for r in leidos if r.get("tipo") == "mensaje"]
                self.assertEqual([m["texto"] for m in msgs], ["Activa Jev en olas pendientes"])
                self.assertIn("antigravity", msgs[0]["canales"])
                self.assertIn("director-presidente", msgs[0]["canales"])
            finally:
                os.environ.pop("STARSEED_CHAT_EN_PRUEBAS", None)

    def test_canal_audiovisual_y_general_sincronizan_sin_duplicados(self):
        with tempfile.TemporaryDirectory() as tmp:
            raiz = Path(tmp) / "repo"
            db_path = Path(tmp) / "state.db"
            con = _crear_db_hermes(db_path)
            con.execute(
                "INSERT INTO sessions VALUES (?, 'oneshot', ?, 'nvidia/kimi-k3', 'Audiovisual')",
                ("local-a1bb", "local-a1bb"),
            )
            con.execute(
                "INSERT INTO messages (session_id, role, content) VALUES ('local-a1bb', 'user', 'mensaje previo audiovisual')"
            )
            con.commit()

            estado = {}
            cfg = {"sincronizar_canales": {"hermes": True, "telegram": True}}
            enviados_av = []
            try:
                n0 = SD.sincronizar_canal_secundario_hermes(
                    "audiovisual", "local-a1bb", estado, cfg=cfg, db_path=str(db_path),
                    raiz=raiz, enviar_tg=True,
                    enviar_fn=lambda t, c, body: (enviados_av.append((t, c, body)) or True, "ok"),
                )
                self.assertEqual(n0, 0)

                con.execute(
                    "INSERT INTO messages (session_id, role, content) VALUES ('local-a1bb', 'assistant', 'Propuesta DESIGN.md + storyboard lista para aprobación')"
                )
                con.commit()

                n1 = SD.sincronizar_canal_secundario_hermes(
                    "audiovisual", "local-a1bb", estado, cfg=cfg, db_path=str(db_path),
                    raiz=raiz, enviar_tg=True,
                    enviar_fn=lambda t, c, body: (enviados_av.append((t, c, body)) or True, "ok"),
                )
                self.assertEqual(n1, 1)
                self.assertEqual(len(enviados_av), 1)
                self.assertIn("Propuesta DESIGN.md", enviados_av[0][2])

                res_pub = SD.publicar_en_canal_especializado(
                    "audiovisual",
                    "Prepara borrador de contactos ALC1113 (con aprobación)",
                    de="alex",
                    origen="metagenesis",
                    enviar_telegram=True,
                    raiz=raiz,
                    enviar_fn=lambda t, c, body: (enviados_av.append((t, c, body)) or True, "ok"),
                )
                self.assertTrue(res_pub["ok"])
                self.assertTrue(res_pub["telegram_ok"])
                self.assertEqual(len(enviados_av), 2)

                ruta_av = director_chat._directorio(raiz) / "audiovisual.jsonl"
                lineas = [json.loads(x) for x in ruta_av.read_text(encoding="utf-8").splitlines() if x.strip()]
                self.assertEqual(len(lineas), 2)
                self.assertEqual(lineas[1]["canal"], "metagenesis")
            finally:
                con.close()


if __name__ == "__main__":
    unittest.main()
