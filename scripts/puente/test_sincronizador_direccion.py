# -*- coding: utf-8 -*-
"""Pruebas unitarias para la sincronización en tiempo real Hermes ↔ MetaGenesis ↔ Telegram dirección."""
import json
import os
import sqlite3
import sys
import tempfile
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


class TestSincronizacionA1BotLog(unittest.TestCase):
    """Pruebas para la sincronización del log del bot del A1 (@StarSeed_Design_bot)."""

    def test_leer_log_bot_a1_siembra_cursor_y_trae_nuevos(self):
        """Primera llamada siembra cursor, siguientes traen solo nuevos."""
        with tempfile.TemporaryDirectory() as tmp:
            raiz = Path(tmp) / "repo"
            estado = {}
            cfg = {"sincronizar_canales": {"a1_bot_log": True}}

            # Simular latidos de la puerta con mensajes del bot
            latidos_1 = [
                {"id": "bot-in-1000-abc123", "t": "2024-01-01T10:00:00", "direccion": "entrada", "texto": "Hola bot", "origen": "telegram"},
                {"id": "bot-out-1001-def456", "t": "2024-01-01T10:00:01", "direccion": "salida", "texto": "Hola Alex", "origen": "peticiones_telegram"},
            ]
            latidos_2 = latidos_1 + [
                {"id": "bot-in-1002-ghi789", "t": "2024-01-01T10:01:00", "direccion": "entrada", "texto": "¿Cómo estás?", "origen": "telegram"},
                {"id": "bot-out-1003-jkl012", "t": "2024-01-01T10:01:01", "direccion": "salida", "texto": "Bien, gracias", "origen": "peticiones_telegram"},
            ]

            def puerta_fn_1():
                return latidos_1

            def puerta_fn_2():
                return latidos_2

            # Primera llamada: siembra cursor, no importa nada
            n0 = SD._leer_log_bot_a1(estado, cfg, raiz=raiz, puerta_fn=puerta_fn_1)
            self.assertEqual(n0, [])
            self.assertIn("a1_bot_log_ultimo_ts", estado)

            # Segunda llamada: trae los 2 nuevos
            n1 = SD._leer_log_bot_a1(estado, cfg, raiz=raiz, puerta_fn=puerta_fn_2)
            self.assertEqual(len(n1), 2)
            self.assertEqual(n1[0]["id"], "bot-in-1002-ghi789")
            self.assertEqual(n1[1]["id"], "bot-out-1003-jkl012")

    def test_escribir_log_bot_local_dedupe_por_id_y_origen(self):
        """Escribe en audiovisual.jsonl con dedupe por (id, origen='a1-bot')."""
        with tempfile.TemporaryDirectory() as tmp:
            raiz = Path(tmp) / "repo"
            mensajes = [
                {"id": "msg-1", "t": 1000.0, "direccion": "entrada", "texto": "Mensaje 1", "origen": "telegram"},
                {"id": "msg-2", "t": 1001.0, "direccion": "salida", "texto": "Respuesta 1", "origen": "peticiones_telegram"},
                {"id": "msg-1", "t": 1000.0, "direccion": "entrada", "texto": "Mensaje 1 duplicado", "origen": "telegram"},  # mismo id
                {"id": "msg-3", "t": 1002.0, "direccion": "entrada", "texto": "Mensaje 3", "origen": "telegram"},
            ]

            n = SD._escribir_log_bot_local(mensajes, raiz=raiz)
            self.assertEqual(n, 3)  # msg-1 duplicado no se escribe

            ruta = director_chat._directorio(raiz) / "audiovisual.jsonl"
            lineas = [json.loads(x) for x in ruta.read_text(encoding="utf-8").splitlines() if x.strip()]
            self.assertEqual(len(lineas), 3)
            self.assertEqual(lineas[0]["id"], "msg-1")
            self.assertEqual(lineas[0]["origen"], "a1-bot")
            self.assertEqual(lineas[0]["rol"], "alex")
            self.assertEqual(lineas[1]["id"], "msg-2")
            self.assertEqual(lineas[1]["origen"], "a1-bot")
            self.assertEqual(lineas[1]["rol"], "director")
            self.assertEqual(lineas[2]["id"], "msg-3")

            # Segunda escritura con los mismos mensajes: no debe duplicar
            n2 = SD._escribir_log_bot_local(mensajes, raiz=raiz)
            self.assertEqual(n2, 0)
            lineas2 = [json.loads(x) for x in ruta.read_text(encoding="utf-8").splitlines() if x.strip()]
            self.assertEqual(len(lineas2), 3)

    def test_escribir_log_bot_local_ignora_direccion_invalida(self):
        """Ignora mensajes con direccion no reconocida."""
        with tempfile.TemporaryDirectory() as tmp:
            raiz = Path(tmp) / "repo"
            mensajes = [
                {"id": "msg-1", "t": 1000.0, "direccion": "entrada", "texto": "Válido", "origen": "telegram"},
                {"id": "msg-2", "t": 1001.0, "direccion": "invalida", "texto": "Ignorado", "origen": "telegram"},
                {"id": "msg-3", "t": 1002.0, "direccion": "salida", "texto": "Válido 2", "origen": "peticiones_telegram"},
            ]

            n = SD._escribir_log_bot_local(mensajes, raiz=raiz)
            self.assertEqual(n, 2)

            ruta = director_chat._directorio(raiz) / "audiovisual.jsonl"
            lineas = [json.loads(x) for x in ruta.read_text(encoding="utf-8").splitlines() if x.strip()]
            self.assertEqual(len(lineas), 2)

    def test_sincronizar_desde_a1_bot_integra_flujo_completo(self):
        """Prueba de integración: leer de puerta -> escribir en audiovisual.jsonl."""
        with tempfile.TemporaryDirectory() as tmp:
            raiz = Path(tmp) / "repo"
            estado = {}
            cfg = {"sincronizar_canales": {"a1_bot_log": True}}

            # Primera llamada: puerta devuelve mensajes antiguos
            latidos_1 = [
                {"id": "bot-in-1", "t": "2024-01-01T10:00:00", "direccion": "entrada", "texto": "Alex dice hola", "origen": "telegram"},
                {"id": "bot-out-1", "t": "2024-01-01T10:00:01", "direccion": "salida", "texto": "Bot responde", "origen": "peticiones_telegram"},
            ]
            # Segunda llamada: puerta devuelve los mismos + nuevos
            latidos_2 = latidos_1 + [
                {"id": "bot-in-2", "t": "2024-01-01T10:01:00", "direccion": "entrada", "texto": "Otro mensaje", "origen": "telegram"},
                {"id": "bot-out-2", "t": "2024-01-01T10:01:01", "direccion": "salida", "texto": "Otra respuesta", "origen": "peticiones_telegram"},
            ]

            llamada = {"n": 0}

            def puerta_fn():
                llamada["n"] += 1
                return latidos_1 if llamada["n"] == 1 else latidos_2

            # Primera pasada: siembra cursor
            n0 = SD.sincronizar_desde_a1_bot(estado, cfg, raiz=raiz, puerta_fn=puerta_fn)
            self.assertEqual(n0, 0)

            # Segunda pasada: importa los 2 nuevos
            n1 = SD.sincronizar_desde_a1_bot(estado, cfg, raiz=raiz, puerta_fn=puerta_fn)
            self.assertEqual(n1, 2)

            ruta = director_chat._directorio(raiz) / "audiovisual.jsonl"
            lineas = [json.loads(x) for x in ruta.read_text(encoding="utf-8").splitlines() if x.strip()]
            self.assertEqual(len(lineas), 2)
            self.assertEqual(lineas[0]["texto"], "Otro mensaje")
            self.assertEqual(lineas[0]["rol"], "alex")
            self.assertEqual(lineas[1]["texto"], "Otra respuesta")
            self.assertEqual(lineas[1]["rol"], "director")
            self.assertEqual(lineas[0]["origen"], "a1-bot")
            self.assertEqual(lineas[1]["origen"], "a1-bot")

            # Tercera pasada: no debe duplicar
            n2 = SD.sincronizar_desde_a1_bot(estado, cfg, raiz=raiz, puerta_fn=puerta_fn)
            self.assertEqual(n2, 0)

    def test_sincronizar_todos_los_canales_incluye_a1_bot_log(self):
        """La función principal incluye la sincronización del bot del A1."""
        with tempfile.TemporaryDirectory() as tmp:
            raiz = Path(tmp) / "repo"
            db_path = Path(tmp) / "state.db"
            con = _crear_db_hermes(db_path)
            con.execute(
                "INSERT INTO sessions VALUES (?, 'local', ?, 'auto', 'Audiovisual')",
                ("local-av", "local-av"),
            )
            con.commit()

            estado = {}
            cfg = {"sincronizar_canales": {"hermes": True, "telegram": True, "a1_bot_log": True}}

            latidos_bot_1 = [
                {"id": "bot-in-old", "t": "2024-01-01T09:00:00", "direccion": "entrada", "texto": "Antiguo", "origen": "telegram"},
            ]
            latidos_bot_2 = latidos_bot_1 + [
                {"id": "bot-in-x", "t": "2024-01-01T10:00:00", "direccion": "entrada", "texto": "Desde bot A1", "origen": "telegram"},
            ]

            llamada = {"n": 0}

            def puerta_fn():
                llamada["n"] += 1
                return latidos_bot_1 if llamada["n"] == 1 else latidos_bot_2

            # Primera pasada: siembra cursor
            n0 = SD.sincronizar_desde_a1_bot(estado, cfg, raiz=raiz, puerta_fn=puerta_fn)
            self.assertEqual(n0, 0)

            # Segunda pasada: importa el mensaje nuevo
            n1 = SD.sincronizar_desde_a1_bot(estado, cfg, raiz=raiz, puerta_fn=puerta_fn)
            self.assertEqual(n1, 1)

            ruta = director_chat._directorio(raiz) / "audiovisual.jsonl"
            lineas = [json.loads(x) for x in ruta.read_text(encoding="utf-8").splitlines() if x.strip()]
            self.assertEqual(len(lineas), 1)
            self.assertEqual(lineas[0]["texto"], "Desde bot A1")
            self.assertEqual(lineas[0]["origen"], "a1-bot")
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


if __name__ == "__main__":
    unittest.main()
