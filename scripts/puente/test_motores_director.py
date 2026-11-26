# -*- coding: utf-8 -*-
"""Pruebas de motores_director.py (solo lo puro, sin lanzar procesos)."""

import json
import os
import sys
import tempfile
import time
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import motores_director as M


class TestEntornoSinClaves(unittest.TestCase):
    def test_quita_las_dos_claves_y_respeta_el_resto(self):
        env = {
            "ANTHROPIC_API_KEY": "valor",
            "ANTHROPIC_AUTH_TOKEN": "valor",
            "PATH": "/usr/bin",
            "HOME": "/tmp",
        }
        limpio = M.entorno_sin_claves_api(env)
        self.assertNotIn("ANTHROPIC_API_KEY", limpio)
        self.assertNotIn("ANTHROPIC_AUTH_TOKEN", limpio)
        self.assertEqual("/usr/bin", limpio["PATH"])
        self.assertEqual("/tmp", limpio["HOME"])

    def test_no_toca_el_original(self):
        env = {"ANTHROPIC_API_KEY": "valor", "PATH": "/usr/bin"}
        M.entorno_sin_claves_api(env)
        self.assertIn("ANTHROPIC_API_KEY", env)

    def test_sin_claves_no_falla(self):
        self.assertEqual({"PATH": "/x"}, M.entorno_sin_claves_api({"PATH": "/x"}))


class TestOrdenClaude(unittest.TestCase):
    def test_orden_basica(self):
        orden = M.orden_claude("hola")
        self.assertEqual("claude", orden[0])
        self.assertIn("-p", orden)
        self.assertIn("hola", orden)
        self.assertIn("--model", orden)
        self.assertIn("claude-opus-5-5", orden)
        self.assertIn("--output-format", orden)
        self.assertIn("json", orden)
        self.assertIn("--max-turns", orden)
        self.assertIn("12", orden)
        self.assertIn("--allowedTools", orden)
        self.assertIn("Read,Glob,Grep", orden)
        self.assertNotIn("--resume", orden)

    def test_con_sesion_reanuda(self):
        orden = M.orden_claude("sigue", sesion="ses-1")
        self.assertIn("--resume", orden)
        self.assertIn("ses-1", orden)

    def test_las_herramientas_prohibidas_van_en_disallowed(self):
        orden = M.orden_claude("x")
        i = orden.index("--disallowedTools")
        prohibidas = orden[i + 1]
        for nombre in (
            "Edit",
            "Write",
            "NotebookEdit",
            "WebFetch",
            "WebSearch",
            "Task",
        ):
            self.assertIn(nombre, prohibidas)


class TestLeerClaude(unittest.TestCase):
    def _json(self, **campos):
        base = {
            "result": "hecho",
            "is_error": False,
            "session_id": "ses-1",
            "usage": {"input_tokens": 10, "output_tokens": 20},
            "total_cost_usd": 0.03,
        }
        base.update(campos)
        return json.dumps(base)

    def test_exito(self):
        r = M.leer_claude(self._json())
        self.assertEqual("hecho", r["texto"])
        self.assertEqual("ses-1", r["sesion"])
        self.assertEqual(10, r["tokens_entrada"])
        self.assertEqual(20, r["tokens_salida"])
        self.assertAlmostEqual(0.03, r["coste"])
        self.assertIsNone(r["error"])

    def test_is_error(self):
        r = M.leer_claude(self._json(is_error=True, result="falló"))
        self.assertEqual("falló", r["error"])

    def test_basura(self):
        r = M.leer_claude("no es json {")
        self.assertIsNotNone(r["error"])
        self.assertEqual("", r["texto"])
        self.assertIsNone(r["sesion"])


class TestOrdenHermes(unittest.TestCase):
    def test_basica(self):
        self.assertEqual(["hermes", "-z", "hola"], M.orden_hermes("hola"))

    def test_modelo_predeterminado_no_agrega_nada(self):
        self.assertEqual(
            ["hermes", "-z", "hola"], M.orden_hermes("hola", modelo="predeterminado")
        )

    def test_modelo_y_archivo_uso(self):
        orden = M.orden_hermes("hola", modelo="m-1", archivo_uso="/tmp/u.json")
        self.assertIn("-m", orden)
        self.assertIn("m-1", orden)
        self.assertIn("--usage-file", orden)
        self.assertIn("/tmp/u.json", orden)


class TestOrdenCodex(unittest.TestCase):
    def test_orden(self):
        orden = M.orden_codex("gpt-x", "/tmp/raiz")
        self.assertEqual(
            [
                "codex",
                "exec",
                "-m",
                "gpt-x",
                "-s",
                "read-only",
                "--skip-git-repo-check",
                "-C",
                "/tmp/raiz",
                "-",
            ],
            orden,
        )


class TestPromptDirector(unittest.TestCase):
    def test_estructura(self):
        historial = [
            {"rol": "alex", "texto": "¿qué hay?"},
            {"rol": "director", "texto": "tres tareas"},
        ]
        p = M.prompt_director("¿y ahora?", historial, "contexto breve")
        self.assertIn("dirección de Genesis", p)
        self.assertIn("no escribes código", p)
        self.assertIn("Contexto:", p)
        self.assertIn("contexto breve", p)
        self.assertIn("Maggasukha: ¿qué hay?", p)
        self.assertIn("Dirección: tres tareas", p)
        self.assertIn("Pregunta de Maggasukha: ¿y ahora?", p)

    def test_recorta_contexto_y_historial(self):
        historial = [{"rol": "alex", "texto": f"t{i}"} for i in range(20)]
        p = M.prompt_director("p", historial, "x" * 20000)
        self.assertLessEqual(len(p), 20000 + 5000)
        self.assertIn("Maggasukha: t8", p)
        self.assertNotIn("Maggasukha: t7\n", p)


AVISO_PAUSA = (
    "\u23f8 This chat is paused. Hermes couldn't confirm how the last turn ended (usually because it "
    "restarted mid-turn): \"Diriges el enjambre de agentes de StarSeed OS y una tarea est\u00e1 atascada. "
    "Elige \u2026\" Hermes won't re-run it by itself, since it may already have done part of the work. "
    "Your message was not sent. To continue, run `hermes sessions discard 20260909_210504_867626 --yes`, "
    "or resume this session in an interactive chat and /discard the paused turn there; then send it again."
)


class TestPausaHermes(unittest.TestCase):
    """HER1111K: reconocer el aviso de sesi\u00f3n en pausa por el c\u00f3digo y por el texto."""

    def test_el_aviso_real_se_reconoce_con_cualquier_codigo(self):
        for rc in (0, 1, 3):
            self.assertTrue(M.es_pausa_hermes(rc, AVISO_PAUSA), rc)

    def test_apostrofe_tipografico_y_mayusculas(self):
        self.assertTrue(M.es_pausa_hermes(0, AVISO_PAUSA.replace("'", "\u2019").upper()))

    def test_codigo_3_sin_texto_es_pausa_y_con_otro_texto_no(self):
        self.assertTrue(M.es_pausa_hermes(3, ""))
        self.assertFalse(M.es_pausa_hermes(3, "Error: se acab\u00f3 la cuota"))

    def test_redaccion_cambiada_sigue_reconociendose(self):
        self.assertTrue(M.es_pausa_hermes(3, "Session paused. Run: hermes sessions discard abc_123"))
        self.assertTrue(M.es_pausa_hermes(0, "Could not confirm how the last turn ended; /discard the paused turn"))

    def test_una_respuesta_normal_o_larga_no_es_pausa(self):
        self.assertFalse(M.es_pausa_hermes(0, "Hola, todo bien."))
        self.assertFalse(M.es_pausa_hermes(0, "Para reabrir usa hermes sessions discard. " + "x" * 2000))
        self.assertFalse(M.es_pausa_hermes(1, ""))

    def test_id_de_sesion(self):
        self.assertEqual("20260909_210504_867626", M.id_sesion_pausada(AVISO_PAUSA, "otra"))
        self.assertEqual("otra", M.id_sesion_pausada("sin id", "otra"))

    def test_orden_de_reabrir_es_solo_texto(self):
        self.assertEqual("hermes sessions discard s1 --yes", M.orden_reabrir_hermes("s1"))
        self.assertFalse(hasattr(M, "descartar_sesion"))

    def test_errores_de_gateway_cuentan_como_fallo_hermes(self):
        self.assertTrue(M.es_fallo_hermes("Error: Gateway starting: deadline"))
        self.assertTrue(M.es_fallo_hermes("Error: Gateway connection failed; no local fallback"))


class TestHermesConPausa(unittest.TestCase):
    def ejecutor(self, respuestas):
        llamadas = []

        def ejecutar(prompt, sesion):
            llamadas.append((prompt, sesion))
            return respuestas[len(llamadas) - 1]

        return ejecutar, llamadas

    def test_sin_pausa_una_sola_llamada(self):
        ej, ll = self.ejecutor([(0, "hola", {})])
        r = M.hermes_con_pausa(ej, "p", lambda: "fresco", "s1", registrar=lambda t: None)
        self.assertEqual([("p", "s1")], ll)
        self.assertEqual(("hola", None, False), (r["salida"], r["pausa"], r["fresca"]))

    def test_pausa_y_fresca_ok(self):
        ej, ll = self.ejecutor([(3, AVISO_PAUSA, {}), (0, "respuesta", {"input_tokens": 1})])
        visto = []
        r = M.hermes_con_pausa(ej, "p", lambda: "fresco", "s1", registrar=visto.append)
        self.assertEqual([("p", "s1"), ("fresco", None)], ll)
        self.assertEqual("respuesta", r["salida"])
        self.assertTrue(r["fresca"])
        self.assertEqual("20260909_210504_867626", r["pausa"]["sesion"])
        self.assertIn("hermes sessions discard", visto[0])  # el texto crudo queda en el registro

    def test_pausa_y_fresca_falla(self):
        ej, _ = self.ejecutor([(3, AVISO_PAUSA, {}), (1, "boom", {})])
        r = M.hermes_con_pausa(ej, "p", lambda: "f", "s1", registrar=lambda t: None)
        self.assertFalse(r["fresca"])
        self.assertNotEqual(0, r["rc"])
        self.assertIsNotNone(r["pausa"])

    def test_fresca_que_tambien_avisa_de_pausa_no_se_entrega(self):
        ej, _ = self.ejecutor([(3, AVISO_PAUSA, {}), (0, AVISO_PAUSA, {})])
        r = M.hermes_con_pausa(ej, "p", lambda: "f", "s1", registrar=lambda t: None)
        self.assertEqual("", r["salida"])
        self.assertNotEqual(0, r["rc"])

    def test_sin_sesion_no_hay_segundo_intento(self):
        ej, ll = self.ejecutor([(0, AVISO_PAUSA, {})])
        r = M.hermes_con_pausa(ej, "p", lambda: "f", None, registrar=lambda t: None)
        self.assertEqual(1, len(ll))
        self.assertEqual("", r["salida"])


class TestPasarelaReiniciando(unittest.TestCase):
    """SES1121B: la pasarela de Hermes se reinicia y corta el turno."""

    LINEA = ("Gateway event loop missed 3 consecutive liveness probes; "
             "exiting with code 75")

    def test_la_linea_medida_se_reconoce(self):
        self.assertTrue(M.es_pasarela_reiniciando(self.LINEA, 75))
        self.assertTrue(M.es_pasarela_reiniciando("Gateway starting: esperando sesión"))

    def test_codigo_75_sin_texto_es_reinicio(self):
        self.assertTrue(M.es_pasarela_reiniciando("", 75))

    def test_una_respuesta_normal_no_es_reinicio(self):
        self.assertFalse(M.es_pasarela_reiniciando("Hola, todo bien."))
        self.assertFalse(M.es_pasarela_reiniciando("", 0))

    def test_una_respuesta_larga_que_menciona_gateway_no_es_reinicio(self):
        self.assertFalse(M.es_pasarela_reiniciando("x" * 1000 + " gateway"))

    def test_esperas_cortas_y_techo(self):
        self.assertEqual([2, 3, 5, 8, 8], [M.esperas_pasarela(n) for n in range(1, 6)])
        self.assertEqual(2, M.esperas_pasarela(0))


class TestHermesConReinicio(unittest.TestCase):
    def test_reintenta_la_misma_sesion_y_no_abre_una_nueva(self):
        llamadas, esperas = [], []
        respuestas = [
            (75, "Gateway event loop missed liveness probes", {}),
            (75, "exiting with code 75", {}),
            (0, "respuesta con contexto", {}),
        ]

        def ejecutar(prompt, sesion):
            llamadas.append((prompt, sesion))
            return respuestas[len(llamadas) - 1]

        r = M.hermes_con_reinicio(
            ejecutar, "p", "s1", esperar=esperas.append, registrar=lambda t: None
        )
        self.assertEqual([("p", "s1"), ("p", "s1"), ("p", "s1")], llamadas)
        self.assertEqual([2, 3], esperas)
        self.assertEqual("respuesta con contexto", r["salida"])
        self.assertFalse(r["reinicio"])

    def test_agota_los_intentos_y_marca_reinicio(self):
        llamadas, esperas = [], []

        def ejecutar(prompt, sesion):
            llamadas.append((prompt, sesion))
            return 75, "Gateway starting: reinicio", {}

        r = M.hermes_con_reinicio(
            ejecutar, "p", "s1", esperar=esperas.append, registrar=lambda t: None, intentos=3
        )
        self.assertEqual([("p", "s1")] * 3, llamadas)
        self.assertEqual([2, 3], esperas)
        self.assertTrue(r["reinicio"])
        self.assertEqual(3, r["intentos"])

    def test_una_pausa_no_se_reintenta_aqui(self):
        aviso = "This chat is paused. Run `hermes sessions discard s1 --yes`."
        llamadas = []

        def ejecutar(prompt, sesion):
            llamadas.append((prompt, sesion))
            return 3, aviso, {}

        r = M.hermes_con_reinicio(
            ejecutar, "p", "s1", esperar=lambda s: None, registrar=lambda t: None
        )
        self.assertEqual(1, len(llamadas))
        self.assertFalse(r["reinicio"])


class TestHermesConPausaDescartada(unittest.TestCase):
    AVISO = (
        "This chat is paused. Hermes couldn't confirm how the last turn ended "
        "(usually because it restarted mid-turn). Run `hermes sessions discard s1 --yes`."
    )

    def test_resolver_verdadero_reintenta_la_misma_sesion_con_contexto(self):
        llamadas = []
        respuestas = [(3, self.AVISO, {}), (0, "de la misma sesión", {})]

        def ejecutar(prompt, sesion):
            llamadas.append((prompt, sesion))
            return respuestas[len(llamadas) - 1]

        r = M.hermes_con_pausa(
            ejecutar, "p", lambda: "fresco", "s1",
            registrar=lambda t: None, resolver=lambda p: True,
        )
        self.assertEqual([("p", "s1"), ("p", "s1")], llamadas)
        self.assertTrue(r["descartada"])
        self.assertTrue(r["recuperada"])
        self.assertFalse(r["fresca"])
        self.assertEqual("de la misma sesión", r["salida"])

    def test_resolver_falso_sigue_con_la_sesion_nueva(self):
        llamadas = []
        respuestas = [(3, self.AVISO, {}), (0, "fresca", {})]

        def ejecutar(prompt, sesion):
            llamadas.append((prompt, sesion))
            return respuestas[len(llamadas) - 1]

        r = M.hermes_con_pausa(
            ejecutar, "p", lambda: "fresco", "s1",
            registrar=lambda t: None, resolver=lambda p: False,
        )
        self.assertEqual([("p", "s1"), ("fresco", None)], llamadas)
        self.assertFalse(r["descartada"])
        self.assertTrue(r["fresca"])


class TestDecidirPausa(unittest.TestCase):
    def _pausa(self, texto="Hermes restarted mid-turn"):
        return {"sesion": "s1", "crudo": texto}

    def test_reinicio_y_solo_lectura_se_descarta(self):
        d = M.decidir_pausa(self._pausa(), True)
        self.assertEqual("descartar", d["accion"])
        self.assertIn("solo lectura", d["motivo"])

    def test_reinicio_y_turno_que_pudo_escribir_se_pide(self):
        self.assertEqual("pedir_a_alex", M.decidir_pausa(self._pausa(), False)["accion"])

    def test_pausa_sin_reinicio_se_pide(self):
        pausa = self._pausa("Hermes no pudo confirmar el turno")
        self.assertEqual("pedir_a_alex", M.decidir_pausa(pausa, True)["accion"])

    def test_sin_sesion_se_pide(self):
        self.assertEqual("pedir_a_alex", M.decidir_pausa({"crudo": "restarted"}, True)["accion"])


class TestTurnoSoloLectura(unittest.TestCase):
    def test_uso_y_resumen_si(self):
        self.assertTrue(M.es_turno_solo_lectura({"tipo": "uso"}))
        self.assertTrue(M.es_turno_solo_lectura(
            {"tipo": "mensaje", "texto": "Resumen periódico de la ola"}))

    def test_pregunta_que_pudo_escribir_no(self):
        self.assertFalse(M.es_turno_solo_lectura(
            {"tipo": "mensaje", "texto": "Escribe el parche del cartero"}))

    def test_turno_perdido_usa_lo_anotado(self):
        self.assertTrue(M.turno_perdido_solo_lectura(
            [], "m2", {"id": "m1", "solo_lectura": True}))
        self.assertFalse(M.turno_perdido_solo_lectura(
            [], "m2", {"id": "m1", "solo_lectura": False}))

    def test_turno_perdido_sin_anotacion_mira_el_ultimo_registro(self):
        registros = [{"id": "m1", "tipo": "uso", "texto": "informe de uso"}]
        self.assertTrue(M.turno_perdido_solo_lectura(registros, "m2"))
        self.assertFalse(M.turno_perdido_solo_lectura(
            [{"id": "m1", "tipo": "mensaje", "texto": "hola"}], "m2"))


class TestDescartarSesion(unittest.TestCase):
    def test_orden_correcta(self):
        vistas = []

        def correr(orden, **k):
            vistas.append(orden)
            return 0, ""

        self.assertTrue(M.descartar_sesion_hermes("s1", ejecutar_orden=correr))
        self.assertEqual(["hermes", "sessions", "discard", "s1", "--yes"], vistas[0])

    def test_sin_sesion_no_llama(self):
        vistas = []
        self.assertFalse(M.descartar_sesion_hermes(None, ejecutar_orden=lambda o, **k: vistas.append(o)))
        self.assertEqual([], vistas)

    def test_fallo_devuelve_false(self):
        self.assertFalse(M.descartar_sesion_hermes("s1", ejecutar_orden=lambda o, **k: (1, "boom")))


class TestMotoresPresidente(unittest.TestCase):
    def test_sonnet_por_defecto_y_opus_solo_decision(self):
        self.assertEqual("claude-sonnet-5-5", M.modelo_presidente(False))
        self.assertEqual("claude-opus-5-5", M.modelo_presidente(True))

    def test_es_decision(self):
        self.assertTrue(M.es_decision("Decide el rumbo de la ola"))
        self.assertTrue(M.es_decision("¿Qué hacemos con la pasarela?"))
        self.assertFalse(M.es_decision("¿Cómo está el enjambre?"))

    def test_orden_explicito(self):
        modelos = [m["modelo"] for m in M.ORDEN_MOTORES_PRESIDENTE]
        self.assertEqual(
            ["hermes/predeterminado", "claude/claude-sonnet-5-5", "claude/claude-opus-5-5"],
            modelos,
        )

    def test_orden_de_proveedores_sin_duplicados(self):
        self.assertEqual(
            ["hermes", "claude", "agy", "chatgpt"],
            M.orden_proveedores_presidente(),
        )

    def test_texto_orden_visible(self):
        texto = M.texto_orden_motores()
        self.assertIn("Hermes con sesión y herramientas", texto)
        self.assertIn("Sonnet", texto)
        self.assertIn("Opus solo para decisiones", texto)
        self.assertLessEqual(len(texto), 200)

    def test_tabla_medio_sesion(self):
        texto = M.texto_tabla_medio_sesion()
        self.assertIn("Hermes con sesión", texto)
        self.assertIn("Sonnet", texto)
        self.assertLessEqual(len(texto), 200)

    def test_recomendaciones_nombran_aut_y_alm(self):
        recomendaciones = M.recomendaciones_carga_mac()
        texto = " ".join(recomendaciones)
        self.assertIn("AUT1121E", texto)
        self.assertIn("ALM1121B", texto)
        for linea in recomendaciones:
            self.assertLessEqual(len(linea), 200)


class TestCarteroPasarelaReiniciando(unittest.TestCase):
    """SES1121B: el cartero no abre una sesión nueva si la pasarela se reinicia."""

    def test_deja_pendiente_y_reintenta_la_misma_sesion(self):
        import cartero_director as C
        import director_chat as dc

        with tempfile.TemporaryDirectory() as raiz:
            msg = dc.publicar("¿estado?", de="alex", rol="alex", tipo="mensaje",
                              canales=["hermes"], raiz=raiz)
            estado = C.cargar_estado(raiz=raiz)
            ordenes = []

            def correr(orden, **k):
                ordenes.append(list(orden))
                return 75, "Gateway event loop missed liveness probes; exiting with code 75"

            with mock.patch.object(C.motores_director, "direccion_motor",
                                   return_value={"motor": "hermes", "sesion": "s1"}), \
                    mock.patch.object(C.motores_director, "correr", side_effect=correr), \
                    mock.patch.object(M.time, "sleep", lambda s: None), \
                    mock.patch.object(M, "_registrar_pausa", lambda t: None):
                C.atender(msg, "hermes", estado, raiz=raiz)

            self.assertNotIn("%s|hermes" % msg["id"], estado["atendidos"])
            self.assertGreater(estado["hermes_pasarela_hasta"], time.time())
            self.assertEqual(M.INTENTOS_PASARELA, len(ordenes))
            self.assertTrue(all("--resume" in o for o in ordenes))
            self.assertTrue(all(o[o.index("--resume") + 1] == "s1" for o in ordenes))
            chat = dc.leer(limite=500, raiz=raiz)
            self.assertFalse(any(r.get("tipo") in ("respuesta", "fallo") for r in chat))


class TestCarteroDescartaSoloTurnoDeLectura(unittest.TestCase):
    """SES1121B: una pausa por reinicio de la pasarela y un turno de lectura se descarta solo."""

    AVISO = (
        "This chat is paused. Hermes couldn't confirm how the last turn ended "
        "(usually because it restarted mid-turn). Run `hermes sessions discard s1 --yes`."
    )

    def test_descarta_y_reintenta_la_misma_sesion(self):
        import cartero_director as C
        import director_chat as dc

        with tempfile.TemporaryDirectory() as raiz:
            msg = dc.publicar("¿estado?", de="alex", rol="alex", tipo="mensaje",
                              canales=["hermes"], raiz=raiz)
            estado = C.cargar_estado(raiz=raiz)
            estado["hermes_ultimo_turno"] = {"id": "prev", "solo_lectura": True}
            ordenes, avisos = [], []

            def correr(orden, **k):
                ordenes.append(list(orden))
                if "sessions" in orden:
                    return 0, ""
                if sum(1 for o in ordenes if "--resume" in o) == 1:
                    return 3, self.AVISO
                return 0, "respuesta con su contexto"

            with mock.patch.object(C.motores_director, "direccion_motor",
                                   return_value={"motor": "hermes", "sesion": "s1"}), \
                    mock.patch.object(C.motores_director, "correr", side_effect=correr), \
                    mock.patch.object(M, "_registrar_pausa", lambda t: None), \
                    mock.patch.object(C.director_presidente, "avisar_pausa_hermes",
                                      side_effect=lambda *a, **k: avisos.append(a)):
                C.atender(msg, "hermes", estado, raiz=raiz)

            self.assertIn(["hermes", "sessions", "discard", "s1", "--yes"], ordenes)
            resumen = [o for o in ordenes if "--resume" in o]
            self.assertEqual(2, len(resumen))
            self.assertTrue(all(o[o.index("--resume") + 1] == "s1" for o in resumen))
            self.assertEqual([], avisos)  # no se le pide nada a Alex
            self.assertIn("%s|hermes" % msg["id"], estado["atendidos"])
            self.assertIn("s1", estado["hermes_descartes"])
            chat = dc.leer(limite=500, raiz=raiz)
            self.assertTrue(any("descartado solo" in (r.get("texto") or "") for r in chat))
            self.assertTrue(any(r.get("tipo") == "respuesta"
                                and "respuesta con su contexto" in (r.get("texto") or "") for r in chat))


if __name__ == "__main__":
    unittest.main()
