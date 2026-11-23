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


class TestSincronizadorA1Bot(unittest.TestCase):
    """Pruebas para la sincronización del bot del A1 (@StarSeed_Design_bot) hacia audiovisual.jsonl."""

    def test_sincronizar_desde_a1_bot_siembra_inicial_y_nuevos_entran(self):
        """Primera pasada siembra cursor (0 importados); mensajes nuevos entran en la siguiente."""
        with tempfile.TemporaryDirectory() as tmp:
            raiz = Path(tmp) / "repo"
            estado = {}
            cfg = {"sincronizar_canales": {"hermes": True, "telegram": True}}

            # Primera pasada: mensajes "antiguos" - solo siembra cursor
            latidos_puerta_inicial = [
                {
                    "id": "chat.md-1001",
                    "datos": {
                        "id": "md-1001",
                        "t": "2026-11-21T10:00:00+00:00",
                        "de": "alex",
                        "rol": "alex",
                        "tipo": "mensaje",
                        "canal": "telegram",
                        "texto": "Mensaje antiguo para siembra",
                    }
                },
            ]

            def pedir_puerta_inicial():
                return latidos_puerta_inicial

            n0 = SD.sincronizar_desde_a1_bot(
                estado, cfg, raiz=raiz, pedir_puerta=pedir_puerta_inicial
            )
            self.assertEqual(n0, 0)  # Siembra inicial: no importa

            # Segunda pasada: mensajes nuevos
            latidos_puerta_nuevos = [
                {
                    "id": "chat.md-1002",
                    "datos": {
                        "id": "md-1002",
                        "t": "2026-11-21T10:01:00+00:00",
                        "de": "alex",
                        "rol": "alex",
                        "tipo": "mensaje",
                        "canal": "telegram",
                        "texto": "Hola desde Telegram al bot de diseño",
                    }
                },
                {
                    "id": "chat.md-1003",
                    "datos": {
                        "id": "md-1003",
                        "t": "2026-11-21T10:02:00+00:00",
                        "de": "peticiones-a1",
                        "rol": "sistema",
                        "tipo": "respuesta",
                        "canal": "mando",
                        "texto": "Recibido ✓ Lo atiende MetaGenesis en el A1",
                    }
                },
            ]

            def pedir_puerta_nuevos():
                return latidos_puerta_nuevos

            n1 = SD.sincronizar_desde_a1_bot(
                estado, cfg, raiz=raiz, pedir_puerta=pedir_puerta_nuevos
            )
            self.assertEqual(n1, 2)

            # Verificar que se escribió en audiovisual.jsonl
            ruta_av = director_chat._directorio(raiz) / "audiovisual.jsonl"
            self.assertTrue(ruta_av.exists())
            lineas = [json.loads(x) for x in ruta_av.read_text(encoding="utf-8").splitlines() if x.strip()]
            self.assertEqual(len(lineas), 2)
            self.assertEqual(lineas[0]["id"], "md-1002")
            self.assertEqual(lineas[0]["de"], "alex")
            self.assertEqual(lineas[0]["canal"], "telegram")
            self.assertEqual(lineas[1]["id"], "md-1003")
            self.assertEqual(lineas[1]["de"], "peticiones-a1")
            self.assertEqual(lineas[1]["canal"], "mando")
            # Marca de origen para dedupe
            self.assertEqual(lineas[0].get("origen_sync"), "a1")
            self.assertEqual(lineas[1].get("origen_sync"), "a1")

    def test_sincronizar_desde_a1_bot_dedupe_por_id_y_origen(self):
        """No duplica mensajes ya presentes (dedupe por id y marca de origen)."""
        with tempfile.TemporaryDirectory() as tmp:
            raiz = Path(tmp) / "repo"
            estado = {}
            cfg = {"sincronizar_canales": {"hermes": True, "telegram": True}}

            # Primera pasada: siembra
            latidos_puerta_siembra = [
                {
                    "id": "chat.md-2001",
                    "datos": {
                        "id": "md-2001",
                        "t": "2026-11-21T10:00:00+00:00",
                        "de": "alex",
                        "rol": "alex",
                        "tipo": "mensaje",
                        "canal": "telegram",
                        "texto": "Mensaje para siembra",
                    }
                },
            ]

            def pedir_puerta_siembra():
                return latidos_puerta_siembra

            n0 = SD.sincronizar_desde_a1_bot(
                estado, cfg, raiz=raiz, pedir_puerta=pedir_puerta_siembra
            )
            self.assertEqual(n0, 0)

            # Segunda pasada: dos mensajes nuevos
            latidos_puerta_1 = [
                {
                    "id": "chat.md-2002",
                    "datos": {
                        "id": "md-2002",
                        "t": "2026-11-21T10:01:00+00:00",
                        "de": "alex",
                        "rol": "alex",
                        "tipo": "mensaje",
                        "canal": "telegram",
                        "texto": "Mensaje 1",
                    }
                },
                {
                    "id": "chat.md-2003",
                    "datos": {
                        "id": "md-2003",
                        "t": "2026-11-21T10:02:00+00:00",
                        "de": "peticiones-a1",
                        "rol": "sistema",
                        "tipo": "respuesta",
                        "canal": "mando",
                        "texto": "Respuesta 1",
                    }
                },
            ]

            def pedir_puerta_1():
                return latidos_puerta_1

            n1 = SD.sincronizar_desde_a1_bot(
                estado, cfg, raiz=raiz, pedir_puerta=pedir_puerta_1
            )
            self.assertEqual(n1, 2)

            # Tercera pasada: mismo mensaje + uno nuevo (simula reenvío por la puerta)
            latidos_puerta_2 = [
                {
                    "id": "chat.md-2002",
                    "datos": {
                        "id": "md-2002",
                        "t": "2026-11-21T10:01:00+00:00",
                        "de": "alex",
                        "rol": "alex",
                        "tipo": "mensaje",
                        "canal": "telegram",
                        "texto": "Mensaje 1",
                    }
                },
                {
                    "id": "chat.md-2004",
                    "datos": {
                        "id": "md-2004",
                        "t": "2026-11-21T10:03:00+00:00",
                        "de": "alex",
                        "rol": "alex",
                        "tipo": "mensaje",
                        "canal": "telegram",
                        "texto": "Mensaje 3 (nuevo)",
                    }
                },
            ]

            def pedir_puerta_2():
                return latidos_puerta_2

            n2 = SD.sincronizar_desde_a1_bot(
                estado, cfg, raiz=raiz, pedir_puerta=pedir_puerta_2
            )
            self.assertEqual(n2, 1)  # Solo el nuevo

            # Verificar que solo hay 3 mensajes en total (2002, 2003, 2004)
            ruta_av = director_chat._directorio(raiz) / "audiovisual.jsonl"
            lineas = [json.loads(x) for x in ruta_av.read_text(encoding="utf-8").splitlines() if x.strip()]
            self.assertEqual(len(lineas), 3)
            ids = [l["id"] for l in lineas]
            self.assertEqual(ids, ["md-2002", "md-2003", "md-2004"])

    def test_sincronizar_desde_a1_bot_filtra_solo_relevantes_audiovisual(self):
        """Solo sincroniza mensajes relevantes para el canal audiovisual."""
        with tempfile.TemporaryDirectory() as tmp:
            raiz = Path(tmp) / "repo"
            estado = {}
            cfg = {"sincronizar_canales": {"hermes": True, "telegram": True}}

            # Siembra
            latidos_siembra = [
                {"id": "chat.md-3000", "datos": {"id": "md-3000", "t": "2026-11-21T09:00:00+00:00", "de": "alex", "rol": "alex", "tipo": "mensaje", "canal": "telegram", "texto": "siembra"}}
            ]
            def pedir_siembra(): return latidos_siembra
            SD.sincronizar_desde_a1_bot(estado, cfg, raiz=raiz, pedir_puerta=pedir_siembra)

            # Mensajes mixtos: algunos relevantes, otros no
            latidos_puerta = [
                {
                    "id": "chat.md-3001",
                    "datos": {
                        "id": "md-3001",
                        "t": "2026-11-21T10:00:00+00:00",
                        "de": "alex",
                        "rol": "alex",
                        "tipo": "mensaje",
                        "canal": "telegram",
                        "texto": "Desde Alex al bot (relevante)",
                    }
                },
                {
                    "id": "chat.md-3002",
                    "datos": {
                        "id": "md-3002",
                        "t": "2026-11-21T10:01:00+00:00",
                        "de": "peticiones-a1",
                        "rol": "sistema",
                        "tipo": "respuesta",
                        "canal": "mando",
                        "texto": "Respuesta del bot A1 (relevante)",
                    }
                },
                {
                    "id": "chat.md-3003",
                    "datos": {
                        "id": "md-3003",
                        "t": "2026-11-21T10:02:00+00:00",
                        "de": "director-capacidad",
                        "rol": "director",
                        "tipo": "informe",
                        "canal": "mando",
                        "texto": "Informe de capacidad (NO relevante para audiovisual)",
                    }
                },
                {
                    "id": "chat.md-3004",
                    "datos": {
                        "id": "md-3004",
                        "t": "2026-11-21T10:03:00+00:00",
                        "de": "alex",
                        "rol": "alex",
                        "tipo": "mensaje",
                        "canal": "director-presidente",
                        "texto": "Mensaje en canal principal (NO relevante para audiovisual)",
                    }
                },
            ]

            def pedir_puerta():
                return latidos_puerta

            n = SD.sincronizar_desde_a1_bot(
                estado, cfg, raiz=raiz, pedir_puerta=pedir_puerta
            )
            self.assertEqual(n, 2)  # Solo los 2 relevantes

            ruta_av = director_chat._directorio(raiz) / "audiovisual.jsonl"
            lineas = [json.loads(x) for x in ruta_av.read_text(encoding="utf-8").splitlines() if x.strip()]
            self.assertEqual(len(lineas), 2)
            textos = [l["texto"] for l in lineas]
            self.assertIn("Desde Alex al bot (relevante)", textos)
            self.assertIn("Respuesta del bot A1 (relevante)", textos)
            for l in lineas:
                self.assertEqual(l.get("origen_sync"), "a1")


class TestBotLogA1(unittest.TestCase):
    """Pruebas para el log local del bot del A1 (jsonl 600, id estable)."""

    def test_registrar_mensaje_entrante_y_saliente_escribe_jsonl(self):
        """Entradas y salidas se registran en bot-log.jsonl con id estable."""
        with tempfile.TemporaryDirectory() as tmp:
            # Redirigir DIR a directorio temporal
            import scripts.puente.peticiones_telegram as PT
            original_dir = PT.DIR
            PT.DIR = tmp
            PT.BOT_LOG = os.path.join(tmp, "bot-log.jsonl")
            try:
                # Registrar mensaje entrante
                PT.registrar_mensaje_entrante(12345, "Hola bot", {"id": 123, "username": "alex"})
                # Registrar mensaje saliente
                PT.registrar_mensaje_saliente("Recibido ✓", origen="bot")

                # Leer y verificar
                with open(PT.BOT_LOG, "r", encoding="utf-8") as f:
                    lineas = [json.loads(l) for l in f if l.strip()]
                self.assertEqual(len(lineas), 2)
                # Entrada
                self.assertEqual(lineas[0]["direccion"], "entrante")
                self.assertEqual(lineas[0]["update_id"], 12345)
                self.assertEqual(lineas[0]["texto"], "Hola bot")
                self.assertEqual(lineas[0]["from"], "123")
                self.assertTrue(lineas[0]["id"].startswith("bl-"))
                # Salida
                self.assertEqual(lineas[1]["direccion"], "saliente")
                self.assertEqual(lineas[1]["origen"], "bot")
                self.assertEqual(lineas[1]["texto"], "Recibido ✓")
                self.assertTrue(lineas[1]["id"].startswith("bl-"))
            finally:
                PT.DIR = original_dir
                PT.BOT_LOG = os.path.join(original_dir, "bot-log.jsonl")

    def test_bot_log_max_600_entradas(self):
        """El log mantiene máximo 600 entradas (rotación)."""
        with tempfile.TemporaryDirectory() as tmp:
            import scripts.puente.peticiones_telegram as PT
            original_dir = PT.DIR
            PT.DIR = tmp
            PT.BOT_LOG = os.path.join(tmp, "bot-log.jsonl")
            PT.BOT_LOG_MAX_ENTRIES = 10  # Reducir para prueba
            try:
                for i in range(15):
                    PT.registrar_mensaje_entrante(i, f"msg{i}", {"id": i})

                with open(PT.BOT_LOG, "r", encoding="utf-8") as f:
                    lineas = [json.loads(l) for l in f if l.strip()]
                self.assertEqual(len(lineas), 10)  # Solo las últimas 10
                # Verificar que son las últimas 10 (5 a 14)
                self.assertEqual(lineas[0]["update_id"], 5)
                self.assertEqual(lineas[-1]["update_id"], 14)
            finally:
                PT.DIR = original_dir
                PT.BOT_LOG = os.path.join(original_dir, "bot-log.jsonl")
                PT.BOT_LOG_MAX_ENTRIES = 600

    def test_bot_log_permisos_600(self):
        """El archivo de log tiene permisos 600."""
        with tempfile.TemporaryDirectory() as tmp:
            import scripts.puente.peticiones_telegram as PT
            original_dir = PT.DIR
            PT.DIR = tmp
            PT.BOT_LOG = os.path.join(tmp, "bot-log.jsonl")
            try:
                PT.registrar_mensaje_entrante(1, "test", {})
                import stat
                st = os.stat(PT.BOT_LOG)
                self.assertEqual(stat.S_IMODE(st.st_mode), 0o600)
            finally:
                PT.DIR = original_dir
                PT.BOT_LOG = os.path.join(original_dir, "bot-log.jsonl")


if __name__ == "__main__":
    unittest.main()
