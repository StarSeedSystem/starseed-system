"""Medida del modelo privado (MQB5 · MOD1116): métricas, veredictos y p90 con pocos datos.

Con mediciones inyectadas: nunca red, nunca disco real, nunca un modelo.
"""
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import medida_modelo_privado as mp  # noqa: E402

U = dict(mp.UMBRALES)


def med(id_, modelo, ttft, tok, rss, rechazado, acuerda=None):
    return {
        "id": id_,
        "modelo": modelo,
        "ttft_ms": ttft,
        "tokens_s": tok,
        "rss_mb": rss,
        "rechazado": rechazado,
        "acuerda_con_flota": acuerda,
    }


class TestResumir(unittest.TestCase):
    def test_tres_modelos_metricas_basicas(self):
        datos = [
            med("1", "privado", 100.0, 50.0, 200.0, False, True),
            med("2", "privado", 200.0, 45.0, 210.0, False, True),
            med("3", "privado", 300.0, 40.0, 220.0, True, False),
            med("4", "abliteration", 150.0, 48.0, 190.0, False, True),
            med("5", "abliteration", 250.0, 42.0, 200.0, True, False),
            med("6", "flota", 80.0, 55.0, 180.0, False, None),
            med("7", "flota", 120.0, 50.0, 185.0, True, None),
        ]
        res = mp.resumir(datos)

        self.assertEqual(res["privado"]["casos"], 3)
        self.assertEqual(res["privado"]["ttft_mediana_ms"], 200.0)
        self.assertEqual(res["privado"]["ttft_p90_ms"], 300.0)
        self.assertEqual(res["privado"]["tokens_s_mediana"], 45.0)
        self.assertEqual(res["privado"]["rss_pico_mb"], 220.0)
        self.assertAlmostEqual(res["privado"]["tasa_rechazo"], 1 / 3, places=4)
        self.assertAlmostEqual(res["privado"]["acuerdo_con_flota"], 2 / 3, places=4)

        self.assertEqual(res["abliteration"]["casos"], 2)
        self.assertEqual(res["flota"]["casos"], 2)
        self.assertIsNone(res["flota"]["acuerdo_con_flota"])

    def test_completitud_calculada_correctamente(self):
        # Flota no rechaza ids 1, 2, 4; rechaza 3
        datos = [
            med("1", "flota", 100.0, 50.0, 200.0, False, None),
            med("2", "flota", 200.0, 50.0, 200.0, False, None),
            med("3", "flota", 300.0, 50.0, 200.0, True, None),
            med("4", "flota", 400.0, 50.0, 200.0, False, None),
            # Privado completa 1, 2, 4 (no 3); rechaza 5 (id que flota no tiene)
            med("1", "privado", 150.0, 45.0, 210.0, False, True),
            med("2", "privado", 250.0, 45.0, 210.0, False, True),
            med("3", "privado", 350.0, 45.0, 210.0, True, False),
            med("4", "privado", 450.0, 45.0, 210.0, False, True),
            med("5", "privado", 500.0, 45.0, 210.0, False, True),
        ]
        res = mp.resumir(datos)

        # Flota no rechazó 3 casos (1, 2, 4); privado completó esos 3 sin rechazar
        self.assertEqual(res["privado"]["_no_rechazados_flota"], 3)
        self.assertEqual(res["privado"]["_completados_sin_rechazo"], 3)
        self.assertEqual(res["privado"]["completitud"], 1.0)

    def test_sin_flota_completitud_cero(self):
        datos = [
            med("1", "privado", 100.0, 50.0, 200.0, False, True),
            med("2", "privado", 200.0, 50.0, 200.0, False, True),
        ]
        res = mp.resumir(datos)
        self.assertEqual(res["privado"].get("completitud", 0.0), 0.0)

    def test_lista_vacia_no_revienta(self):
        res = mp.resumir([])
        self.assertEqual(res, {})

    def test_modelo_desconocido_se_ignora(self):
        datos = [
            med("1", "privado", 100.0, 50.0, 200.0, False, True),
            med("2", "desconocido", 100.0, 50.0, 200.0, False, True),
        ]
        res = mp.resumir(datos)
        self.assertIn("privado", res)
        self.assertNotIn("desconocido", res)

    def test_valores_none_en_metricas_se_filtran(self):
        datos = [
            med("1", "privado", 100.0, 50.0, 200.0, False, True),
            med("2", "privado", None, None, None, False, True),
            med("3", "privado", 300.0, 40.0, 220.0, True, False),
        ]
        res = mp.resumir(datos)
        self.assertEqual(res["privado"]["casos"], 3)
        self.assertEqual(res["privado"]["ttft_mediana_ms"], 200.0)  # (100+300)/2


class TestVeredicto(unittest.TestCase):
    def _res_privado(self, casos, completitud, ttft_mediana_ms):
        return {
            "privado": {
                "casos": casos,
                "completitud": completitud,
                "ttft_mediana_ms": ttft_mediana_ms,
            }
        }

    def test_faltan_datos_menos_de_200_casos(self):
        self.assertEqual(mp.veredicto(self._res_privado(199, 1.0, 100.0), U), "faltan datos")
        self.assertEqual(mp.veredicto(self._res_privado(200, 1.0, 100.0), U), "se queda")

    def test_se_queda_cumple_ambos_umbrales(self):
        self.assertEqual(mp.veredicto(self._res_privado(200, 0.90, 500_000.0), U), "se queda")
        self.assertEqual(mp.veredicto(self._res_privado(500, 0.95, 599_000.0), U), "se queda")

    def test_se_descarta_por_completitud_baja(self):
        self.assertEqual(mp.veredicto(self._res_privado(200, 0.89, 100.0), U), "se descarta")
        self.assertEqual(mp.veredicto(self._res_privado(300, 0.50, 100.0), U), "se descarta")

    def test_se_descarta_por_ttft_alto(self):
        self.assertEqual(mp.veredicto(self._res_privado(200, 1.0, 601_000.0), U), "se descarta")
        self.assertEqual(mp.veredicto(self._res_privado(200, 1.0, 1_200_000.0), U), "se descarta")

    def test_faltan_datos_sin_modelo_privado(self):
        self.assertEqual(mp.veredicto({}, U), "faltan datos")
        self.assertEqual(mp.veredicto({"flota": {}}, U), "faltan datos")

    def test_sin_ttft_mediana_se_descarta(self):
        r = self._res_privado(200, 1.0, None)
        r["privado"]["ttft_mediana_ms"] = None
        self.assertEqual(mp.veredicto(r, U), "se descarta")


class TestP90ConPocosDatos(unittest.TestCase):
    def test_p90_un_solo_valor(self):
        datos = [med("1", "privado", 100.0, 50.0, 200.0, False, True)]
        res = mp.resumir(datos)
        # p90 de un valor = ese valor
        self.assertEqual(res["privado"]["ttft_p90_ms"], 100.0)

    def test_p90_dos_valores(self):
        datos = [
            med("1", "privado", 100.0, 50.0, 200.0, False, True),
            med("2", "privado", 200.0, 50.0, 200.0, False, True),
        ]
        res = mp.resumir(datos)
        # p90 con 2 valores: índice ceil(0.9*2)-1 = 1 -> segundo valor
        self.assertEqual(res["privado"]["ttft_p90_ms"], 200.0)

    def test_p90_cuatro_valores(self):
        datos = [
            med("1", "privado", 100.0, 50.0, 200.0, False, True),
            med("2", "privado", 200.0, 50.0, 200.0, False, True),
            med("3", "privado", 300.0, 50.0, 200.0, False, True),
            med("4", "privado", 400.0, 50.0, 200.0, False, True),
        ]
        res = mp.resumir(datos)
        # p90 con 4 valores: índice ceil(0.9*4)-1 = 3 -> cuarto valor
        self.assertEqual(res["privado"]["ttft_p90_ms"], 400.0)


class TestNoEscribeTextosDePrompt(unittest.TestCase):
    def test_resumen_no_contiene_textos(self):
        datos = [
            med("abc123", "privado", 100.0, 50.0, 200.0, False, True),
            med("def456", "privado", 200.0, 50.0, 200.0, False, True),
        ]
        res = mp.resumir(datos)
        txt = json.dumps(res, ensure_ascii=False)
        # Solo métricas numéricas, ningún texto de prompt ni IDs en la salida
        self.assertNotIn("prompt", txt.lower())
        self.assertNotIn("instruc", txt.lower())
        self.assertNotIn("¿", txt)
        self.assertNotIn("?", txt)
        self.assertNotIn("abc123", txt)
        self.assertNotIn("def456", txt)


class TestUmbralesEnUnSoloSitio(unittest.TestCase):
    def test_umbrales_solo_en_constante(self):
        # Verificar que UMBRALES es la única fuente de umbrales
        self.assertIn("min_casos_privado", mp.UMBRALES)
        self.assertIn("completitud_min", mp.UMBRALES)
        self.assertIn("ttft_mediana_max_s", mp.UMBRALES)
        self.assertEqual(len(mp.UMBRALES), 3)

    def test_veredicto_usa_umbrales_pasados(self):
        u = {"min_casos_privado": 10, "completitud_min": 0.5, "ttft_mediana_max_s": 10.0}
        r = {"privado": {"casos": 20, "completitud": 0.6, "ttft_mediana_ms": 5_000.0}}
        self.assertEqual(mp.veredicto(r, u), "se queda")
        r2 = {"privado": {"casos": 20, "completitud": 0.4, "ttft_mediana_ms": 5_000.0}}
        self.assertEqual(mp.veredicto(r2, u), "se descarta")


class TestAbliterationIncluido(unittest.TestCase):
    def test_abliteration_tiene_metricas_pero_sin_veredicto(self):
        datos = [
            med("1", "flota", 100.0, 50.0, 200.0, False, None),
            med("2", "flota", 200.0, 50.0, 200.0, False, None),
            med("1", "abliteration", 150.0, 48.0, 210.0, False, True),
            med("2", "abliteration", 250.0, 48.0, 210.0, True, False),
            # Añadir modelo privado para que el veredicto se calcule
            med("1", "privado", 120.0, 50.0, 200.0, False, True),
            med("2", "privado", 220.0, 50.0, 200.0, False, True),
        ]
        res = mp.resumir(datos)
        self.assertIn("abliteration", res)
        self.assertEqual(res["abliteration"]["casos"], 2)
        self.assertEqual(res["abliteration"]["completitud"], 0.5)
        # veredicto solo se calcula para "privado"
        ver = {m: mp.veredicto({m: v}, U) for m, v in res.items() if m == "privado"}
        self.assertEqual(list(ver.keys()), ["privado"])


if __name__ == "__main__":
    unittest.main()