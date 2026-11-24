# -*- coding: utf-8 -*-
"""Pruebas unitarias para la sincronización en tiempo real Hermes ↔ MetaGenesis ↔ Telegram dirección."""
import json
import os
import sqlite3
import sys
import tempfile
import time
import unittest
from datetime import datetime, timezone
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
            pares_ss = [
                ("MAGGACORTEX_BOT" + "_TOKEN", "tok-magga"),
                ("MAGGACORTEX_CHAT_ID", "cid-magga"),
                ("SINTESIS_BOT" + "_TOKEN", "tok-design"),
                ("SINTESIS_CHAT_ID", "cid-design"),
            ]
            pares_hm = [
                ("BOT" + "_TOKEN", "tok-general"),
                ("CHAT_ID", "cid-general"),
            ]
            env_starseed.write_text(
                "\n".join(f"TELEGRAM_{k}={v}" for k, v in pares_ss) + "\n",
                encoding="utf-8",
            )
            env_hermes.write_text(
                "\n".join(f"TELEGRAM_{k}={v}" for k, v in pares_hm) + "\n",
                encoding="utf-8",
            )
            archivos = (str(env_starseed), str(env_hermes))
            self.assertEqual(SD.leer_telegram_canal("principal", archivos=archivos), ("tok-magga", "cid-magga"))
            self.assertEqual(SD.leer_telegram_canal("general", archivos=archivos), ("tok-general", "cid-general"))
            self.assertEqual(SD.leer_telegram_canal("audiovisual", archivos=archivos), ("tok-design", "cid-design"))

    def test_espejo_a_telegram_no_desaloja_ids_antiguos_al_azar_tras_400_avisos(self):
        cfg = {"sincronizar_canales": {"telegram": True}}
        msg_antiguo = {
            "id": "md-antiguo-1",
            "t": 1000.0,
            "de": "alex",
            "rol": "alex",
            "tipo": "mensaje",
            "canal": "director-presidente",
            "texto": "Mensaje de Alex de hace horas que no debe repetirse",
        }
        estado = {}
        enviados = []
        SD.espejar_a_telegram_direccion(
            [msg_antiguo], estado, cfg, enviar_fn=lambda et, tx: (enviados.append((et, tx)) or True, "ok")
        )
        self.assertEqual(enviados, [])
        # Añadimos 600 informes de sistema que no son de dirección: md-antiguo-1 jamás debe reenviarse
        ruido = [
            {"id": f"md-ruido-{i}", "t": 1001.0 + i, "de": "director-capacidad", "rol": "director", "tipo": "informe", "canal": "mando", "texto": "ruido"}
            for i in range(600)
        ]
        n = SD.espejar_a_telegram_direccion(
            [msg_antiguo, *ruido], estado, cfg, enviar_fn=lambda et, tx: (enviados.append((et, tx)) or True, "ok")
        )
        self.assertEqual(n, 0)
        self.assertEqual(enviados, [])

    def test_ignora_compactacion_de_contexto_hermes(self):
        self.assertTrue(
            SD.es_eco_interno("[CONTEXT COMPACTION — REFERENCE ONLY] Earlier turns were compacted...")
        )

    def test_espejo_normaliza_epoch_ms_y_segundos(self):
        cfg = {"sincronizar_canales": {"telegram": True}}
        base_s = 1_795_205_303.683
        estado = {
            "telegram_dir_vistos": ["md-previo"],
            "telegram_dir_ultimo_epoch": base_s * 1000.0,
        }
        viejo = {
            "id": "md-viejo-iso",
            "t": datetime.fromtimestamp(base_s - 600.0, timezone.utc).isoformat(),
            "de": "alex",
            "rol": "alex",
            "tipo": "mensaje",
            "canal": "director-presidente",
            "texto": "Mensaje previo a la marca en ms",
        }
        nuevo = {
            "id": "md-nuevo-iso",
            "t": datetime.fromtimestamp(base_s + 30.0, timezone.utc).isoformat(),
            "de": "antigravity",
            "rol": "director",
            "tipo": "respuesta",
            "canal": "antigravity",
            "texto": "Mensaje nuevo tras la marca",
        }
        enviados = []
        n = SD.espejar_a_telegram_direccion(
            [viejo, nuevo],
            estado,
            cfg,
            enviar_fn=lambda et, tx: (enviados.append((et, tx)) or True, "ok"),
        )
        self.assertEqual(n, 1)
        self.assertEqual(enviados, [("Antigravity", "Mensaje nuevo tras la marca")])
        self.assertLess(estado["telegram_dir_ultimo_epoch"], 1e11)
        self.assertAlmostEqual(estado["telegram_dir_ultimo_epoch"], base_s + 30.0, places=2)

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


class TestNombresCanales(unittest.TestCase):
    def test_nombre_de_canal_lee_registro_y_cae_en_canonicos(self):
        self.assertEqual(SD.nombre_de_canal("principal", {}), "Principal")
        self.assertEqual(SD.nombre_de_canal("general", {"general": {"nombre": "  "}}), "General")
        self.assertEqual(
            SD.nombre_de_canal("audiovisual", {"audiovisual": {"nombre": "  Estudio "}}),
            "Estudio",
        )

    def test_evaluar_nombres_marca_el_que_no_coincide(self):
        cfg = {
            "principal": {"nombre": "Principal"},
            "general": {"nombre": "General"},
            "audiovisual": {"nombre": "Audiovisual y diseño"},
        }
        medios = {
            "registro": {
                "principal": "Principal",
                "general": "General",
                "audiovisual": "Audiovisual y diseño",
            },
            "telegram": {
                "principal": "Maggacortex",
                "general": "General",
                "audiovisual": "Audiovisual y diseño",
            },
            "hermes": {"principal": "Principal"},
        }
        filas = SD.evaluar_nombres(cfg, medios)
        por = {(f["canal"], f["medio"]): f for f in filas}
        self.assertEqual(por[("principal", "registro")]["estado"], "igual")
        self.assertEqual(por[("principal", "telegram")]["estado"], "distinto")
        self.assertEqual(por[("general", "hermes")]["estado"], "sin-comprobar")
        self.assertEqual(por[("audiovisual", "mac")]["estado"], "sin-comprobar")
        self.assertEqual(len(filas), 3 * len(SD.MEDIOS_NOMBRES))
        # `_nombres_por_medio` es quien rellena la Mac con los canónicos y Hermes con el título real.
        completos = SD._nombres_por_medio(
            cfg,
            {},
            [{"id": "s1", "title": "Principal", "source": "local", "fijada": True}],
        )
        self.assertEqual(completos["mac"]["audiovisual"], "Audiovisual y diseño")
        self.assertEqual(completos["registro"]["principal"], "Principal")

    def test_nombres_por_medio_desde_canon_extrae_solo_medios_con_nombre(self):
        canon = {
            "chats": [
                {"id": "genesis", "nombre": "Principal"},
                {
                    "id": "genesis.canal.general",
                    "medios": [
                        {"medio": "telegram", "nombreEnMedio": "General"},
                        {"medio": "hermes", "nombreEnMedio": "  General "},
                        {"medio": "telegram", "nombreEnMedio": ""},
                    ],
                },
            ]
        }
        self.assertEqual(
            SD.nombres_por_medio_desde_canon(canon, "general"),
            {"telegram": "General", "hermes": "General"},
        )
        self.assertEqual(SD.nombres_por_medio_desde_canon(canon, "audiovisual"), {})

    def test_comprobar_sesiones_fijadas_detecta_oneshot_y_faltantes(self):
        cfg = {
            "principal": {"hermes_sesion": "s-principal"},
            "general": {"hermes_sesion": "s-general"},
            "audiovisual": {"hermes_sesion": "s-av"},
        }
        sesiones = [
            {"id": "s-principal", "title": "Principal", "source": "local", "fijada": True},
            {"id": "s-general", "title": "General", "source": "telegram", "fijada": True},
            {"id": "s-av", "title": "Audiovisual y diseño", "source": "oneshot", "fijada": True},
            {"id": "vieja", "title": "Archivo", "source": "local", "fijada": True},
        ]
        por, resumen = SD.comprobar_sesiones_fijadas(cfg, sesiones)
        self.assertTrue(por["principal"]["ok"])
        self.assertTrue(por["general"]["ok"])
        self.assertFalse(por["audiovisual"]["ok"])
        self.assertIn("hermes -z", " ".join(por["audiovisual"]["problemas"]))
        self.assertEqual(resumen["fijadas"], 4)
        self.assertEqual(resumen["canales"], 3)
        self.assertFalse(resumen["ok"])

        por2, res2 = SD.comprobar_sesiones_fijadas({"principal": {}}, [])
        self.assertFalse(por2["principal"]["ok"])
        self.assertEqual(res2["canales"], 0)
        self.assertFalse(res2["ok"])

    def test_leer_sesiones_hermes_lee_la_marca_de_fijada(self):
        with tempfile.TemporaryDirectory() as tmp:
            ruta = Path(tmp) / "state.db"
            con = sqlite3.connect(str(ruta))
            con.execute(
                "CREATE TABLE sessions (id TEXT PRIMARY KEY, title TEXT, source TEXT, pinned INTEGER)"
            )
            con.execute("INSERT INTO sessions VALUES ('s1', 'Principal', 'local', 1)")
            con.execute("INSERT INTO sessions VALUES ('s2', 'Otra', 'local', 0)")
            con.commit()
            con.close()
            sesiones = SD.leer_sesiones_hermes(str(ruta))
            self.assertEqual(
                [(s["id"], s["fijada"]) for s in sesiones],
                [("s1", True), ("s2", False)],
            )
            self.assertEqual(SD.leer_sesiones_hermes(str(Path(tmp) / "no-existe.db")), [])

    def test_chats_y_sincronizador_sin_nombres_viejos_ni_id_a_mano(self):
        aqui = Path(AQUI)
        chats = (aqui / "chats.json").read_text(encoding="utf-8")
        sincro = (aqui / "sincronizador_direccion.py").read_text(encoding="utf-8")
        viejos = [
            "Dirección principal",
            "Dirección general",
            "Dirección MetaGenesis",
            "Producción audiovisual, diseño y promoción",
            "Síntesis de producción",
            "Puente de Mando",
            "GENESIS · StarSeed OS",
        ]
        for texto in (chats, sincro):
            for viejo in viejos:
                self.assertNotIn(viejo, texto)
        self.assertNotIn("20260909_210504_867626", chats)
        self.assertNotIn("20260909_210504_867626", sincro)
        self.assertIn("20260828_130104_dc6d43f0", chats)

    def test_chats_declara_los_tres_canales_en_cada_entorno(self):
        d = json.loads((Path(AQUI) / "chats.json").read_text(encoding="utf-8"))
        for entorno in ("claude", "codex", "hermes", "antigravity", "telegram"):
            canales = d["entornos"][entorno]["canales"]
            self.assertEqual(set(canales), {"principal", "general", "audiovisual"})
        self.assertEqual(
            d["entornos"]["hermes"]["canales"]["general"]["hermes_sesion"],
            "20260828_130104_dc6d43f0",
        )


class TestEspejoHermesYAntigravityBidireccional(unittest.TestCase):
    def test_espejar_hacia_hermes_es_idempotente_reactiva_sesion_y_evita_eco(self):
        with tempfile.TemporaryDirectory() as tmp:
            raiz = Path(tmp) / "repo"
            db_path = Path(tmp) / "state.db"
            con = sqlite3.connect(str(db_path))
            con.execute(
                "CREATE TABLE sessions (id TEXT PRIMARY KEY, source TEXT, chat_id TEXT, model TEXT, "
                "title TEXT, ended_at REAL, message_count INTEGER DEFAULT 0, last_activity_at REAL, "
                "transcript_revision INTEGER DEFAULT 0)"
            )
            con.execute(
                "CREATE TABLE messages (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT, role TEXT, "
                "content TEXT, timestamp REAL, platform_message_id TEXT, observed INTEGER DEFAULT 0, "
                "active INTEGER DEFAULT 1)"
            )
            con.execute(
                "INSERT INTO sessions VALUES ('ses-prin', 'local', 'ses-prin', 'auto', 'Principal', NULL, 0, 100.0, 0)"
            )
            con.execute(
                "INSERT INTO sessions VALUES ('ses-av', 'local', 'ses-av', 'auto', 'Audiovisual y diseño', 500.0, 1, 500.0, 0)"
            )
            con.commit()
            con.close()

            canales_cfg = {
                "principal": {"nombre": "Principal", "hermes_sesion": "ses-prin"},
                "general": {"nombre": "General", "hermes_sesion": ""},
                "audiovisual": {"nombre": "Audiovisual y diseño", "hermes_sesion": "ses-av"},
            }
            estado = {}
            regs_prin = [
                {
                    "id": "md-ag-1",
                    "t": "2026-11-23T17:00:00-06:00",
                    "de": "alex",
                    "rol": "alex",
                    "tipo": "mensaje",
                    "canal": "antigravity",
                    "texto": "Asegura todos los mensajes completos en Hermes.",
                },
                {
                    "id": "md-ag-2",
                    "t": "2026-11-23T17:00:05-06:00",
                    "de": "antigravity",
                    "rol": "director",
                    "tipo": "respuesta",
                    "canal": "antigravity",
                    "texto": "Enlace bidireccional activado sin eco " + ("detalle " * 40),
                },
                {
                    "id": "md-sis-1",
                    "t": "2026-11-23T17:00:06-06:00",
                    "de": "director-autocuracion",
                    "rol": "director",
                    "tipo": "aviso",
                    "canal": "mando",
                    "texto": "Ruido rutinario de sistema",
                },
            ]
            os.environ["STARSEED_CHAT_EN_PRUEBAS"] = "1"
            try:
                n = SD.espejar_hacia_hermes(
                    "principal", regs_prin, estado, db_path=str(db_path), canales_cfg=canales_cfg
                )
                self.assertEqual(n, 2)
                # Segunda llamada incluso con estado vacío NO duplica por platform_message_id mg-sync:*
                n_dup = SD.espejar_hacia_hermes(
                    "principal", regs_prin, {}, db_path=str(db_path), canales_cfg=canales_cfg
                )
                self.assertEqual(n_dup, 0)

                # Sembramos lector de Hermes y verificamos que lo espejado NO rebota de vuelta
                estado["hermes_sync_ultimo_id"] = 0
                n_eco = SD.sincronizar_desde_hermes(
                    estado, "ses-prin", db_path=str(db_path), chat_id_telegram="", raiz=raiz
                )
                self.assertEqual(n_eco, 0)

                # Canal audiovisual reactiva ended_at -> NULL y guarda texto completo
                n_av = SD.espejar_hacia_hermes(
                    "audiovisual",
                    [{"id": "aud-1", "t": 1795470000.0, "de": "telegram", "rol": "alex", "tipo": "mensaje", "canal": "telegram", "texto": "Pieza audiovisual lista"}],
                    estado,
                    db_path=str(db_path),
                    canales_cfg=canales_cfg,
                )
                self.assertEqual(n_av, 1)
                con_ro = sqlite3.connect(str(db_path))
                ses_av = con_ro.execute("SELECT ended_at, message_count, transcript_revision FROM sessions WHERE id='ses-av'").fetchone()
                msg_prin = con_ro.execute("SELECT content, platform_message_id FROM messages WHERE session_id='ses-prin' ORDER BY id ASC").fetchall()
                con_ro.close()
                self.assertIsNone(ses_av[0])
                self.assertGreaterEqual(ses_av[1], 1)
                self.assertGreaterEqual(ses_av[2], 1)
                self.assertIn("detalle detalle", msg_prin[1][0])
                self.assertTrue(msg_prin[0][1].startswith("mg-sync:principal:"))
            finally:
                os.environ.pop("STARSEED_CHAT_EN_PRUEBAS", None)

    def test_sincronizar_desde_antigravity_recupera_texto_completo_de_transcript_full(self):
        with tempfile.TemporaryDirectory() as tmp:
            raiz = Path(tmp) / "repo"
            brain = Path(tmp) / "brain"
            logs = brain / "chat-demo" / ".system_generated" / "logs"
            logs.mkdir(parents=True)

            compact_rows = [
                {
                    "step_index": 1,
                    "type": "USER_INPUT",
                    "source": "USER_EXPLICIT",
                    "content": "<CONTEXT_SUMMARY>viejo</CONTEXT_SUMMARY>\n<USER_REQUEST>\nMensaje truncado...",
                    "truncated_fields": ["content"],
                },
                {
                    "step_index": 2,
                    "type": "PLANNER_RESPONSE",
                    "content": "",
                    "tool_calls": [{"name": "read_file"}],
                },
                {
                    "step_index": 3,
                    "type": "GENERIC",
                    "content": "salida de comando",
                },
                {
                    "step_index": 4,
                    "type": "PLANNER_RESPONSE",
                    "model": "gemini-4",
                    "content": "Respuesta trunc...",
                    "truncated_fields": ["content"],
                },
            ]
            full_rows = [
                {
                    "step_index": 1,
                    "type": "USER_INPUT",
                    "source": "USER_EXPLICIT",
                    "content": "<CONTEXT_SUMMARY>viejo</CONTEXT_SUMMARY>\n<USER_REQUEST>\nMensaje completo desde Antigravity hasta el final.</USER_REQUEST>",
                },
                compact_rows[1],
                compact_rows[2],
                {
                    "step_index": 4,
                    "type": "PLANNER_RESPONSE",
                    "model": "gemini-4",
                    "content": "Respuesta completa de dirección sin recorte ninguno.",
                },
            ]
            (logs / "transcript.jsonl").write_text("\n".join(json.dumps(r) for r in compact_rows) + "\n", encoding="utf-8")
            (logs / "transcript_full.jsonl").write_text("\n".join(json.dumps(r) for r in full_rows) + "\n", encoding="utf-8")

            canales_cfg = {"principal": {"antigravity_chat_id": "chat-demo"}}
            estado = {}
            os.environ["STARSEED_CHAT_EN_PRUEBAS"] = "1"
            try:
                n = SD.sincronizar_desde_antigravity(
                    estado, canales_cfg=canales_cfg, raiz=raiz, brain_dir=str(brain)
                )
                self.assertEqual(n, 2)
                leidos = director_chat.leer(limite=10, raiz=raiz)
                textos = [r["texto"] for r in leidos if r.get("tipo") != "entrega"]
                self.assertEqual(
                    textos,
                    [
                        "Mensaje completo desde Antigravity hasta el final.",
                        "Respuesta completa de dirección sin recorte ninguno.",
                    ],
                )
                # Segunda pasada sin cambios no duplica
                self.assertEqual(
                    SD.sincronizar_desde_antigravity(
                        estado, canales_cfg=canales_cfg, raiz=raiz, brain_dir=str(brain)
                    ),
                    0,
                )
            finally:
                os.environ.pop("STARSEED_CHAT_EN_PRUEBAS", None)

    def test_espejar_sin_db_path_con_raiz_aislada_no_falla_ni_escribe_hermes_real(self):
        with tempfile.TemporaryDirectory() as tmp:
            raiz = Path(tmp)
            prev = os.environ.pop("STARSEED_CHAT_EN_PRUEBAS", None)
            try:
                res = SD.publicar_en_canal_especializado(
                    "principal",
                    "Prueba segura sin db_path y con raiz aislada",
                    de="antigravity",
                    origen="antigravity",
                    enviar_telegram=False,
                    raiz=raiz,
                    db_path=None,
                    espejar_hermes=True,
                )
                self.assertTrue(res["ok"])
                self.assertFalse(res["hermes_ok"])
            finally:
                if prev is not None:
                    os.environ["STARSEED_CHAT_EN_PRUEBAS"] = prev


class TestA1AudiovisualSync(unittest.TestCase):
    """DIR1121B: Sincronización del bot A1 (@StarSeed_Design_bot) con canal Audiovisual."""

    def test_peticiones_telegram_escribe_log_audiovisual_con_id_estable(self):
        """El bot A1 escribe cada mensaje entrante y respuesta saliente en jsonl con id estable."""
        import peticiones_telegram as PT
        with tempfile.TemporaryDirectory() as tmp:
            # Monkeypatch the log path
            original_casa = PT.CASA
            PT.CASA = tmp
            PT.DIR = os.path.join(tmp, ".starseed", "peticiones")
            os.makedirs(PT.DIR, exist_ok=True)
            log_path = Path(PT.DIR) / "audiovisual-sync.jsonl"
            try:
                # Simular mensaje entrante
                msg_in = {"id": "tg-msg-1", "from": {"id": 123, "is_bot": False}, "chat": {"id": PT.CHAT}, "text": "Hola desde Telegram", "date": int(time.time())}
                PT._registrar_mensaje_audiovisual("entrante", msg_in, "Hola desde Telegram")
                # Simular respuesta saliente
                PT._registrar_mensaje_audiovisual("saliente", {"texto": "Respuesta del bot"}, "Respuesta del bot")
                
                lineas = log_path.read_text(encoding="utf-8").splitlines()
                self.assertEqual(len(lineas), 2)
                reg1 = json.loads(lineas[0])
                reg2 = json.loads(lineas[1])
                self.assertEqual(reg1["direccion"], "entrante")
                self.assertEqual(reg1["texto"], "Hola desde Telegram")
                self.assertIn("id", reg1)
                self.assertEqual(reg2["direccion"], "saliente")
                self.assertEqual(reg2["texto"], "Respuesta del bot")
                self.assertIn("id", reg2)
                # IDs deben ser estables (basados en contenido + timestamp)
                self.assertNotEqual(reg1["id"], reg2["id"])
            finally:
                PT.CASA = original_casa

    def test_sincronizador_lee_log_a1_y_escribe_en_audiovisual_jsonl(self):
        """El sincronizador lee el log del A1 y vuelca mensajes nuevos a audiovisual.jsonl."""
        with tempfile.TemporaryDirectory() as tmp:
            raiz = Path(tmp) / "repo"
            raiz.mkdir(parents=True)
            # Crear log simulado del A1 (como si viniera por el túnel)
            log_a1 = Path(tmp) / "a1-audiovisual-sync.jsonl"
            log_a1.write_text(
                '{"id": "a1-1", "t": 1700000000.0, "direccion": "entrante", "de": "alex", "texto": "Mensaje de Alex al bot"}\n'
                '{"id": "a1-2", "t": 1700000001.0, "direccion": "saliente", "de": "bot", "texto": "Respuesta del bot"}\n',
                encoding="utf-8"
            )
            
            estado = {}
            importados = SD.sincronizar_desde_a1_audiovisual(
                estado, log_a1_path=str(log_a1), raiz=raiz
            )
            self.assertEqual(importados, 2)
            
            # Verificar en audiovisual.jsonl
            audiovisual_path = director_chat._directorio(raiz) / "audiovisual.jsonl"
            lineas = audiovisual_path.read_text(encoding="utf-8").splitlines()
            self.assertEqual(len(lineas), 2)
            reg1 = json.loads(lineas[0])
            reg2 = json.loads(lineas[1])
            self.assertEqual(reg1["texto"], "Mensaje de Alex al bot")
            self.assertEqual(reg2["texto"], "Respuesta del bot")
            self.assertEqual(reg1["canal"], "telegram-a1")
            self.assertEqual(reg2["canal"], "telegram-a1")
            self.assertIn("id", reg1)
            self.assertIn("id", reg2)

    def test_sincronizador_no_duplica_mensajes_ya_importados(self):
        """Segunda pasada no reimporta mensajes ya vistos (id estable)."""
        with tempfile.TemporaryDirectory() as tmp:
            raiz = Path(tmp) / "repo"
            raiz.mkdir(parents=True)
            log_a1 = Path(tmp) / "a1-audiovisual-sync.jsonl"
            log_a1.write_text(
                '{"id": "a1-1", "t": 1700000000.0, "direccion": "entrante", "de": "alex", "texto": "Mensaje único"}\n',
                encoding="utf-8"
            )
            
            estado = {}
            n1 = SD.sincronizar_desde_a1_audiovisual(estado, log_a1_path=str(log_a1), raiz=raiz)
            self.assertEqual(n1, 1)
            
            # Añadir mensaje nuevo al log
            log_a1.write_text(
                '{"id": "a1-1", "t": 1700000000.0, "direccion": "entrante", "de": "alex", "texto": "Mensaje único"}\n'
                '{"id": "a1-2", "t": 1700000001.0, "direccion": "saliente", "de": "bot", "texto": "Nuevo mensaje"}\n',
                encoding="utf-8"
            )
            n2 = SD.sincronizar_desde_a1_audiovisual(estado, log_a1_path=str(log_a1), raiz=raiz)
            self.assertEqual(n2, 1)  # Solo el nuevo
            
            audiovisual_path = director_chat._directorio(raiz) / "audiovisual.jsonl"
            lineas = audiovisual_path.read_text(encoding="utf-8").splitlines()
            self.assertEqual(len(lineas), 2)

    def test_publicar_en_audiovisual_desde_otro_medio_sale_por_bot_sin_eco(self):
        """Mensaje publicado en canal Audiovisual desde otro medio (Metagenesis) se envía por el bot sin eco."""
        with tempfile.TemporaryDirectory() as tmp:
            raiz = Path(tmp) / "repo"
            raiz.mkdir(parents=True)
            
            # Simular log del A1 ya teniendo el mensaje (como si hubiera venido del bot)
            log_a1 = Path(tmp) / "a1-audiovisual-sync.jsonl"
            msg_id = "a1-msg-123"
            log_a1.write_text(
                f'{{"id": "{msg_id}", "t": 1700000000.0, "direccion": "saliente", "de": "bot", "texto": "Mensaje desde Metagenesis"}}\n',
                encoding="utf-8"
            )
            estado = {}
            SD.sincronizar_desde_a1_audiovisual(estado, log_a1_path=str(log_a1), raiz=raiz)
            
            # Ahora publicar desde Metagenesis el mismo mensaje
            enviados = []
            res = SD.publicar_en_canal_especializado(
                "audiovisual",
                "Mensaje desde Metagenesis",
                de="metagenesis",
                origen="metagenesis",
                enviar_telegram=True,
                raiz=raiz,
                enviar_fn=lambda t, c, body: (enviados.append((t, c, body)) or True, "ok"),
            )
            # No debe enviar por Telegram porque ya existe en el log del A1 (dedupe por id/origen)
            self.assertEqual(len(enviados), 0)
            self.assertTrue(res["ok"])

    def test_log_a1_mantiene_máximo_600_entradas(self):
        """El log del A1 rota manteniendo solo las últimas 600 entradas."""
        import peticiones_telegram as PT
        with tempfile.TemporaryDirectory() as tmp:
            original_casa = PT.CASA
            PT.CASA = tmp
            PT.DIR = os.path.join(tmp, ".starseed", "peticiones")
            os.makedirs(PT.DIR, exist_ok=True)
            try:
                for i in range(650):
                    PT._registrar_mensaje_audiovisual("entrante", {"id": f"msg-{i}"}, f"Mensaje {i}")
                
                log_path = Path(PT.DIR) / "audiovisual-sync.jsonl"
                lineas = log_path.read_text(encoding="utf-8").splitlines()
                self.assertEqual(len(lineas), 600)
                # Debe contener los últimos 600 (50-649)
                primera = json.loads(lineas[0])
                self.assertEqual(primera["texto"], "Mensaje 50")
                ultima = json.loads(lineas[-1])
                self.assertEqual(ultima["texto"], "Mensaje 649")
            finally:
                PT.CASA = original_casa


if __name__ == "__main__":
    unittest.main()
