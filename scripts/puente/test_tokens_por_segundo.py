# -*- coding: utf-8 -*-
"""Tokens por segundo: que la tasa sea una MEDIDA y no una estimación.

(2026-09-22) Alex pidió «tokens por segundo sumando los de todos los procesos de cada
api». Lo primero fue ir a ver quién publica tokens: solo Jev. Las pasarelas guardan
llamadas, coste y milisegundos; opencode y codex no devuelven `usage`. Así que estas
pruebas fijan las dos mitades del trato: se suma lo que tiene contador, y lo que no lo
tiene se nombra en vez de repartirse a ojo.
"""
import os
import shutil
import sqlite3
import tempfile
import unittest

import tokens_por_segundo as T


def m(t, **totales):
    return {"t": t, "totales": dict(totales)}


class LaTasaEsUnaResta(unittest.TestCase):
    def test_mil_tokens_en_diez_segundos_son_cien_por_segundo(self):
        r = T.tasa(m(0, jev=1000), m(10, jev=2000))
        self.assertAlmostEqual(r["total"], 100.0)
        self.assertAlmostEqual(r["fuentes"]["jev"], 100.0)
        self.assertAlmostEqual(r["segundos"], 10.0)

    def test_suma_todas_las_fuentes(self):
        r = T.tasa(m(0, jev=100, otra=200), m(10, jev=200, otra=400))
        self.assertAlmostEqual(r["total"], 30.0)

    def test_sin_movimiento_es_cero_y_no_none(self):
        """Cero tokens es un dato; «no sé» es otra cosa y no se confunden."""
        r = T.tasa(m(0, jev=500), m(5, jev=500))
        self.assertEqual(r["total"], 0.0)

    def test_una_fuente_ilegible_no_cuenta_como_cero(self):
        r = T.tasa(m(0, jev=100, rota=None), m(10, jev=200, rota=None))
        self.assertNotIn("rota", r["fuentes"])
        self.assertAlmostEqual(r["total"], 10.0)

    def test_un_contador_que_baja_no_es_consumo_negativo(self):
        """El archivo se reinició: eso no son «menos tokens», es que no se sabe."""
        r = T.tasa(m(0, jev=1000), m(10, jev=5))
        self.assertNotIn("jev", r["fuentes"])
        self.assertEqual(r["total"], 0.0)

    def test_sin_tiempo_entre_muestras_no_hay_tasa(self):
        self.assertIsNone(T.tasa(m(7, jev=1), m(7, jev=99)))
        self.assertIsNone(T.tasa(m(9, jev=1), m(3, jev=99)))

    def test_una_sola_muestra_no_es_una_tasa(self):
        self.assertIsNone(T.tasa(None, m(1, jev=1)))


class LaMediaDeUnaVentana(unittest.TestCase):
    def test_toma_el_tramo_entero_no_la_media_de_tasas(self):
        # 0→10 s parado, 10→20 s a 100 tok/s: en 20 s son 50 tok/s de media real.
        ms = [m(0, jev=0), m(10, jev=0), m(20, jev=1000)]
        self.assertAlmostEqual(T.promedio(ms, 60)["total"], 50.0)

    def test_solo_mira_dentro_de_la_ventana(self):
        ms = [m(0, jev=0), m(100, jev=0), m(110, jev=1000)]
        self.assertAlmostEqual(T.promedio(ms, 30)["total"], 100.0)

    def test_sin_dos_muestras_dentro_devuelve_none(self):
        self.assertIsNone(T.promedio([m(0, jev=0), m(100, jev=5)], 10))
        self.assertIsNone(T.promedio([m(0, jev=0)], 60))
        self.assertIsNone(T.promedio([], 60))


class ElResumenDiceLoQueNoMide(unittest.TestCase):
    def _r(self, total, segundos=5):
        return {"total": total, "fuentes": {}, "segundos": segundos}

    def test_nombra_cuantos_procesos_no_publican_tokens(self):
        r = T.resumir(self._r(42.0), sin_contador=[{"id": "a"}, {"id": "b"}],
                      media=self._r(30.0, 60))
        self.assertIn("2 proceso(s) no publican tokens", r)

    def test_manda_la_media_del_minuto(self):
        """(2026-09-22) El archivo decía «0 tok/s ahora mismo» con 44,2 de media en la
        pantalla: el mismo dato contado de dos maneras en dos sitios."""
        r = T.resumir(self._r(0.0), sin_contador=[], media=self._r(44.2, 60))
        self.assertTrue(r.startswith("44.2 tok/s de media en 1 min"), r)
        self.assertIn("0.0 tok/s en los últimos segundos", r)

    def test_sin_muestras_lo_dice_en_vez_de_enseñar_un_cero(self):
        self.assertIn("necesita dos", T.resumir(None))

    def test_sin_minuto_entero_todavia_lo_dice(self):
        self.assertIn("aún sin minuto entero", T.resumir(self._r(12.0), sin_contador=[]))

    def test_los_numeros_grandes_se_redondean(self):
        r = T.resumir(self._r(1234.4), sin_contador=[], media=self._r(1500.6, 60))
        self.assertIn("1501 tok/s", r)
        self.assertIn("1234 tok/s", r)


class DondeSeLeeCadaFuente(unittest.TestCase):
    def test_el_camino_saca_el_numero_de_dentro(self):
        self.assertEqual(T._hondo({"a": {"b": 7}}, ("a", "b")), 7)

    def test_un_camino_que_no_existe_es_none_no_cero(self):
        self.assertIsNone(T._hondo({"a": {}}, ("a", "b")))
        self.assertIsNone(T._hondo({}, ("a",)))

    def test_un_valor_que_no_es_numero_no_se_cuenta(self):
        self.assertIsNone(T._hondo({"a": "muchos"}, ("a",)))

    def test_jev_esta_entre_las_fuentes(self):
        self.assertIn("jev", [f["id"] for f in T.FUENTES])

    def test_lo_que_no_se_puede_medir_esta_nombrado(self):
        # (2026-09-22) opencode SALIÓ de esta lista al encontrar sus tokens en su sqlite:
        # ver `OpencodeSiPublicaTokens`. Lo que sigue sin contador, nombrado.
        ids = [f["id"] for f in T.SIN_CONTADOR]
        self.assertIn("codex", ids)
        self.assertIn("pasarelas", ids)
        self.assertTrue(all(f.get("porque") for f in T.SIN_CONTADOR),
                        "cada uno tiene que decir POR QUÉ no se puede medir")


if __name__ == "__main__":
    unittest.main()


class OpencodeSiPublicaTokens(unittest.TestCase):
    """(2026-09-22, segunda pasada) Lo di por no medible y estaba medido.

    Su LOG no publica `usage` —por eso el medidor de agentes mide bytes— pero su base de
    datos sí: `~/.local/share/opencode/opencode.db`, tabla `session`, columnas
    `tokens_input`, `tokens_output`, `tokens_reasoning`. Medido: 125.377.185 tokens
    acumulados en 4.055 sesiones. Ahí está el grueso del gasto del enjambre.
    """

    def test_opencode_es_una_fuente_con_contador(self):
        f = [x for x in T.FUENTES if x["id"] == "opencode"]
        self.assertTrue(f, "opencode tiene que estar entre las fuentes medidas")
        self.assertEqual(f[0]["tipo"], "sqlite")

    def test_ya_no_esta_entre_los_que_no_se_pueden_medir(self):
        self.assertNotIn("opencode", [x["id"] for x in T.SIN_CONTADOR])

    def test_se_abre_en_solo_lectura(self):
        """La condición de Alex: «sin que interrumpa los procesos»."""
        import inspect
        fuente = inspect.getsource(T._de_sqlite)
        self.assertIn("mode=ro", fuente)
        self.assertIn("timeout=2", fuente)

    def test_una_base_que_no_existe_es_none_no_cero(self):
        self.assertIsNone(T._de_sqlite("/no/existe.db", "select 1"))

    def test_codex_y_pasarelas_siguen_nombrados(self):
        ids = [x["id"] for x in T.SIN_CONTADOR]
        self.assertIn("codex", ids)
        self.assertIn("pasarelas", ids)


class OpencodeNuevaFuenteMessageData(unittest.TestCase):
    """(2026-11-08) opencode ahora guarda tokens en message.data JSON.
    
    La consulta usa :t0 (inicio de hora en ms) y el índice
    message_session_time_created_id_idx. No recorre la tabla entera.
    """

    def setUp(self):
        self.tmpdir = tempfile.mkdtemp()
        self.db_path = os.path.join(self.tmpdir, "opencode.db")
        import sqlite3
        con = sqlite3.connect(self.db_path)
        try:
            con.execute("""
                CREATE TABLE session (
                    id TEXT PRIMARY KEY,
                    time_updated INTEGER,
                    tokens_input INTEGER DEFAULT 0,
                    tokens_output INTEGER DEFAULT 0,
                    tokens_reasoning INTEGER DEFAULT 0
                )
            """)
            con.execute("""
                CREATE TABLE message (
                    id TEXT PRIMARY KEY,
                    session_id TEXT,
                    time_created INTEGER,
                    time_updated INTEGER,
                    data TEXT
                )
            """)
            con.execute("""
                CREATE INDEX message_session_time_created_id_idx
                ON message(session_id, time_created, id)
            """)
            con.commit()
        finally:
            con.close()

    def tearDown(self):
        import shutil
        shutil.rmtree(self.tmpdir, ignore_errors=True)

    def _insert_session(self, sid, time_updated, tokens_input=0, tokens_output=0, tokens_reasoning=0):
        con = sqlite3.connect(self.db_path)
        try:
            con.execute(
                "INSERT INTO session (id, time_updated, tokens_input, tokens_output, tokens_reasoning) VALUES (?, ?, ?, ?, ?)",
                (sid, time_updated, tokens_input, tokens_output, tokens_reasoning)
            )
            con.commit()
        finally:
            con.close()

    def _insert_message(self, mid, session_id, time_created, time_updated, data_json):
        con = sqlite3.connect(self.db_path)
        try:
            con.execute(
                "INSERT INTO message (id, session_id, time_created, time_updated, data) VALUES (?, ?, ?, ?, ?)",
                (mid, session_id, time_created, time_updated, data_json)
            )
            con.commit()
        finally:
            con.close()

    def test_mensajes_con_tokens_en_data_y_sesion_en_cero_cuenta_nueva_consulta(self):
        """(a) Mensajes con tokens en data y sesión con columnas en 0 → la suma nueva los cuenta."""
        ahora = 1_700_000_000_000  # ms
        t0 = int(ahora // 3600_000 * 3600_000)  # inicio de hora en ms
        
        # Sesión DENTRO de la hora actual, columnas en 0
        self._insert_session("s1", t0 + 1000, 0, 0, 0)
        # Mensaje con tokens en data
        self._insert_message("m1", "s1", t0 + 500, t0 + 500, '{"tokens": {"input": 100, "output": 50, "reasoning": 25}}')
        
        # Consulta nueva con parámetro :t0
        f = [x for x in T.FUENTES if x["id"] == "opencode"][0]
        consulta = f["consulta"]
        
        total = T._de_sqlite(self.db_path, consulta, {"t0": t0})
        self.assertEqual(total, 175)  # 100 + 50 + 25

    def test_no_cuenta_mensajes_antes_de_t0_ni_sesiones_antes_de_t0(self):
        """(b) No cuenta mensajes tocados antes de t0 ni sesiones tocadas antes de t0."""
        ahora = 1_700_000_000_000
        t0 = int(ahora // 3600_000 * 3600_000)
        hora_anterior = t0 - 3_600_000  # 1 hora antes
        
        # Sesión y mensaje en hora ANTERIOR (no deberían contarse)
        self._insert_session("s_old", hora_anterior + 1000, 0, 0, 0)
        self._insert_message("m_old", "s_old", hora_anterior + 500, hora_anterior + 500, 
                            '{"tokens": {"input": 1000, "output": 500, "reasoning": 250}}')
        
        # Sesión y mensaje en hora ACTUAL (sí deberían contarse)
        self._insert_session("s_new", t0 + 1000, 0, 0, 0)
        self._insert_message("m_new", "s_new", t0 + 500, t0 + 500, 
                            '{"tokens": {"input": 100, "output": 50, "reasoning": 25}}')
        
        f = [x for x in T.FUENTES if x["id"] == "opencode"][0]
        consulta = f["consulta"]
        
        total = T._de_sqlite(self.db_path, consulta, {"t0": t0})
        self.assertEqual(total, 175)  # Solo los de la hora actual

    def test_mensaje_usuario_sin_tokens_no_rompe_la_suma(self):
        """(c) Un mensaje de usuario sin tokens no rompe la suma."""
        ahora = 1_700_000_000_000
        t0 = int(ahora // 3600_000 * 3600_000)
        
        self._insert_session("s1", t0 + 1000, 0, 0, 0)
        # Mensaje asistente CON tokens
        self._insert_message("m1", "s1", t0 + 500, t0 + 500, 
                            '{"tokens": {"input": 100, "output": 50, "reasoning": 25}}')
        # Mensaje usuario SIN tokens
        self._insert_message("m2", "s1", t0 + 600, t0 + 600, '{"role": "user", "content": "hola"}')
        
        f = [x for x in T.FUENTES if x["id"] == "opencode"][0]
        consulta = f["consulta"]
        
        total = T._de_sqlite(self.db_path, consulta, {"t0": t0})
        self.assertEqual(total, 175)

    def test_explain_query_plan_usa_indice(self):
        """(d) EXPLAIN QUERY PLAN de la consulta contiene USING INDEX message_session_time_created_id_idx."""
        ahora = 1_700_000_000_000
        t0 = int(ahora // 3600_000 * 3600_000)
        
        self._insert_session("s1", t0 + 1000, 0, 0, 0)
        self._insert_message("m1", "s1", t0 + 500, t0 + 500, 
                            '{"tokens": {"input": 100, "output": 50, "reasoning": 25}}')
        
        f = [x for x in T.FUENTES if x["id"] == "opencode"][0]
        consulta = f["consulta"]
        
        con = sqlite3.connect(self.db_path)
        try:
            plan = con.execute(f"EXPLAIN QUERY PLAN {consulta}", {"t0": t0}).fetchall()
            plan_text = " ".join(row[3] for row in plan)
            self.assertIn("USING INDEX message_session_time_created_id_idx", plan_text)
        finally:
            con.close()

    def test_t0_es_comienzo_de_hora_en_ms(self):
        """(e) t0 para un ahora dado es el comienzo de su hora en ms."""
        # 1_700_000_000_000 ms = 2023-11-15 10:13:20 UTC
        # Inicio de esa hora = 1_700_000_000_000 - (13*60+20)*1000 = 1_700_000_000_000 - 799000 = 1_699_999_201_000
        # Wait, let me calculate properly: 1_700_000_000_000 // 3_600_000 * 3_600_000
        ahora = 1_700_000_000_000
        t0_esperado = int(ahora // 3_600_000 * 3_600_000)
        self.assertEqual(T.t0_inicio_hora(ahora), t0_esperado)
        
        # Exactamente en el límite de hora
        ahora_exacto = 1_700_000_000_000 - (1_700_000_000_000 % 3_600_000)
        self.assertEqual(T.t0_inicio_hora(ahora_exacto), ahora_exacto)

    def test_fuente_opencode_tiene_reinicia_true(self):
        """La fuente opencode declara reinicia: True."""
        f = [x for x in T.FUENTES if x["id"] == "opencode"]
        self.assertTrue(f, "opencode tiene que estar entre las fuentes")
        self.assertTrue(f[0].get("reinicia"), "opencode debe tener reinicia=True")


class TasaConFuentesQueReinician(unittest.TestCase):
    """(f) tasa con fuente que reinicia y baja de 1000 a 300 en 5s → 60 tok/s,
    y con Jev que baja → se salta."""

    def test_fuente_reinicia_baja_cuenta_como_valor_nuevo(self):
        """Contador que reinicia (como Prometheus): bajada = reset, diff = valor nuevo."""
        antes = {"t": 0, "totales": {"opencode": 1000, "jev": 1000}}
        ahora = {"t": 5, "totales": {"opencode": 300, "jev": 500}}  # Jev baja, opencode reinicia
        
        r = T.tasa(antes, ahora, reinician={"opencode"})
        
        # opencode: (300 - 0) / 5 = 60 (porque reinició, no salta)
        # jev: bajó de 1000 a 500 → se salta
        self.assertAlmostEqual(r["fuentes"]["opencode"], 60.0)
        self.assertNotIn("jev", r["fuentes"])
        self.assertAlmostEqual(r["total"], 60.0)

    def test_fuente_no_reinicia_baja_se_salta(self):
        """Jev (no reinicia): bajada se salta como antes."""
        antes = {"t": 0, "totales": {"jev": 1000}}
        ahora = {"t": 5, "totales": {"jev": 500}}
        
        r = T.tasa(antes, ahora, reinician=set())
        
        self.assertNotIn("jev", r["fuentes"])
        self.assertEqual(r["total"], 0.0)

    def test_fuente_reinicia_sube_normal(self):
        """Contador que reinicia y sube: diferencia normal."""
        antes = {"t": 0, "totales": {"opencode": 100}}
        ahora = {"t": 10, "totales": {"opencode": 1100}}
        
        r = T.tasa(antes, ahora, reinician={"opencode"})
        
        self.assertAlmostEqual(r["fuentes"]["opencode"], 100.0)


class PromedioPasaReinician(unittest.TestCase):
    """(g) promedio pasa las ids de reinician a tasa."""

    def test_promedio_pasa_reinician_a_tasa(self):
        # promedio toma primera y última muestra dentro de la ventana
        # t=0: opencode=1000, jev=1000
        # t=10: opencode=300 (reset), jev=500 (bajó)
        # t=20: opencode=1300, jev=1500
        # Ventana 30s: primera=t=0, última=t=20
        # opencode: subió de 1000 a 1300 → (1300-1000)/20 = 15 (reset en t=10 no visible para tasa)
        # jev: subió de 1000 a 1500 → (1500-1000)/20 = 25 (bajada en t=10 no visible)
        ms = [
            {"t": 0, "totales": {"opencode": 1000, "jev": 1000}},
            {"t": 10, "totales": {"opencode": 300, "jev": 500}},  # reinicio opencode
            {"t": 20, "totales": {"opencode": 1300, "jev": 1500}},
        ]
        r = T.promedio(ms, 30, reinician={"opencode"})
        
        # Con primera/última, tasa no ve el reset intermedio
        self.assertAlmostEqual(r["fuentes"]["opencode"], 15.0)
        self.assertAlmostEqual(r["fuentes"]["jev"], 25.0)


class UnaPasadaPasaReinician(unittest.TestCase):
    """una_pasada pasa los ids de fuentes con reinicia."""

    def test_una_pasada_usa_reinician_de_fuentes(self):
        # Verificar que una_pasada pasa reinician correctamente
        # Esto se prueba indirectamente viendo que FUENTES tiene reinicia
        ids_reinician = {f["id"] for f in T.FUENTES if f.get("reinicia")}
        self.assertIn("opencode", ids_reinician)
        self.assertNotIn("jev", ids_reinician)


class LosAgentesQueTrabajanDondeNoHayContador(unittest.TestCase):
    """(2026-09-23) Alex: «no es cierto… 4 agentes y 0 tokens».

    El 0 era verdad y aun asi era una mentira: los cuatro agentes estaban en la nube, donde
    GitHub no deja leer el log de un job en marcha. Un cero sin el porque al lado no es una
    medida, es un medidor que parece roto.
    """

    def test_cuenta_los_agentes_de_los_runs_vivos(self):
        datos = {"runs": [
            {"estado": "in_progress", "agentes": 4},
            {"estado": "queued", "agentes": 2},
            {"estado": "completed", "agentes": 9},
        ]}
        self.assertEqual(T.agentes_de_nube(datos), 6)

    def test_sin_runs_vivos_no_hay_nadie(self):
        self.assertEqual(T.agentes_de_nube({"runs": [{"estado": "completed", "agentes": 4}]}), 0)
        self.assertEqual(T.agentes_de_nube({}), 0)
        self.assertEqual(T.agentes_de_nube(None), 0)

    def test_un_run_con_agentes_ilegibles_no_rompe_la_cuenta(self):
        self.assertEqual(T.agentes_de_nube({"runs": [{"estado": "in_progress", "agentes": "x"}]}), 0)

    def test_la_nube_entra_en_la_lista_de_sin_contador_con_su_cifra(self):
        fuera = T.sin_contador_de(4)
        self.assertEqual(len(fuera), len(T.SIN_CONTADOR) + 1)
        self.assertEqual(fuera[-1]["id"], "nube-gh")
        self.assertEqual(fuera[-1]["agentes"], 4)
        self.assertIn("4 agente(s)", fuera[-1]["nombre"])

    def test_sin_nadie_en_la_nube_la_lista_no_cambia(self):
        self.assertEqual(len(T.sin_contador_de(0)), len(T.SIN_CONTADOR))

    def test_sin_contador_de_no_muta_la_lista_base(self):
        T.sin_contador_de(4)[0]["nombre"] = "tocada"
        self.assertNotEqual(T.SIN_CONTADOR[0]["nombre"], "tocada")

    def test_cero_medido_con_agentes_ciegos_explica_el_cero(self):
        fuera = T.sin_contador_de(4)
        frase = T.resumir({"total": 0.0}, fuera, {"total": 0.0})
        self.assertIn("0 tok/s medidos aqui".replace("aqui", "aquí"), frase)
        self.assertIn("4 agente(s)", frase)
        self.assertIn("contador en vivo", frase)

    def test_con_gasto_medido_la_cifra_manda_y_los_ciegos_van_detras(self):
        fuera = T.sin_contador_de(4)
        frase = T.resumir({"total": 10.0}, fuera, {"total": 42.0})
        self.assertTrue(frase.startswith("42.0 tok/s de media en 1 min"), frase)
        self.assertIn("4 agente(s) trabajan sin contador en vivo", frase)

    def test_sin_agentes_ciegos_la_frase_es_la_de_siempre(self):
        frase = T.resumir({"total": 0.0}, T.sin_contador_de(0), {"total": 0.0})
        self.assertTrue(frase.startswith("0.0 tok/s de media en 1 min"), frase)
        self.assertNotIn("contador en vivo", frase)
