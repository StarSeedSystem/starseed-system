# -*- coding: utf-8 -*-
"""Tokens por segundo: que la tasa sea una MEDIDA y no una estimación.

(2026-09-22) Alex pidió «tokens por segundo sumando los de todos los procesos de cada
api». Lo primero fue ir a ver quién publica tokens: solo Jev. Las pasarelas guardan
llamadas, coste y milisegundos; opencode y codex no devuelven `usage`. Así que estas
pruebas fijan las dos mitades del trato: se suma lo que tiene contador, y lo que no lo
tiene se nombra en vez de repartirse a ojo.
"""
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
    def test_nombra_cuantos_procesos_no_publican_tokens(self):
        r = T.resumir({"total": 42.0, "fuentes": {}, "segundos": 5},
                      sin_contador=[{"id": "a"}, {"id": "b"}])
        self.assertIn("42.0 tok/s", r)
        self.assertIn("2 proceso(s) no publican tokens", r)

    def test_sin_muestras_lo_dice_en_vez_de_enseñar_un_cero(self):
        self.assertIn("necesita dos", T.resumir(None))

    def test_con_todo_medido_no_sobra_la_coletilla(self):
        self.assertEqual(T.resumir({"total": 0.0, "fuentes": {}, "segundos": 5},
                                   sin_contador=[]), "0 tok/s ahora mismo")

    def test_los_numeros_grandes_se_redondean(self):
        self.assertIn("1234 tok/s", T.resumir({"total": 1234.4, "fuentes": {}, "segundos": 1},
                                              sin_contador=[]))


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
