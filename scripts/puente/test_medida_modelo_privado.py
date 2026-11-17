#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas de medida_modelo_privado (MOD1116): solo métricas, datos inyectados."""
import os
import shutil
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import medida_modelo_privado as mmp  # noqa: E402

U = dict(mmp.UMBRALES)


def caso(id_caso, modelo, completado=True, rechazo_base=False, ttfb_s=1.0,
         tps=10.0, rss_mb=100.0, flota_rechazo=False, acuerdo_flota=None):
    return {
        "id": id_caso,
        "huella": "h-" + id_caso,
        "tokens_entrada": 100,
        "modelo": modelo,
        "completado": completado,
        "rechazo_base": rechazo_base,
        "ttfb_s": ttfb_s,
        "tps": tps,
        "rss_mb": rss_mb,
        "flota_rechazo": flota_rechazo,
        "acuerdo_flota": acuerdo_flota,
    }


class TestResumir(unittest.TestCase):
    def test_agrupa_por_modelo_y_calcula_metricas(self):
        datos = [
            caso("1", "privado", ttfb_s=10.0, tps=4.0, rss_mb=300.0, flota_rechazo=True, acuerdo_flota=True),
            caso("2", "privado", ttfb_s=30.0, tps=6.0, rss_mb=500.0, flota_rechazo=False, acuerdo_flota=False),
            caso("3", "privado", completado=False, rechazo_base=True, ttfb_s=20.0, tps=0.0, rss_mb=400.0),
            caso("4", "flota", ttfb_s=1.0, tps=20.0, rss_mb=50.0, rechazo_base=True),
            caso("5", "abliteration", ttfb_s=2.0, tps=15.0, rss_mb=60.0),
        ]
        r = mmp.resumir(datos)
        p = r["privado"]
        self.assertEqual(p["casos"], 3)
        self.assertEqual(p["ttfb_mediana_s"], 20.0)
        self.assertEqual(p["ttfb_p90_s"], 30.0)
        self.assertAlmostEqual(p["tps_mediana"], 4.0)
        self.assertEqual(p["rss_pico_mb"], 500.0)
        self.assertAlmostEqual(p["tasa_rechazos_base"], 1 / 3, places=4)
        self.assertAlmostEqual(p["acuerdo_flota"], 0.5)
        self.assertEqual(r["flota"]["tasa_rechazos_base"], 1.0)
        self.assertEqual(r["abliteration"]["casos"], 1)

    def test_p90_con_pocos_datos(self):
        datos = [caso("1", "privado", ttfb_s=10.0), caso("2", "privado", ttfb_s=20.0)]
        r = mmp.resumir(datos)["privado"]
        self.assertEqual(r["ttfb_mediana_s"], 15.0)
        self.assertEqual(r["ttfb_p90_s"], 20.0)
        datos1 = [caso("1", "privado", ttfb_s=7.0)]
        r1 = mmp.resumir(datos1)["privado"]
        self.assertEqual(r1["ttfb_mediana_s"], 7.0)
        self.assertEqual(r1["ttfb_p90_s"], 7.0)

    def test_sin_mediciones_no_revienta(self):
        r = mmp.resumir([])
        self.assertEqual(r, {})


class TestVeredicto(unittest.TestCase):
    def _resumen_privado(self, casos, completa_rechazos_flota, total_rechazos_flota, mediana):
        # casos totales del privado = casos; de esos, los relevantes son donde flota NO completó con rechazo
        # representamos vía campos que veredicto usa
        return {
            "privado": {
                "casos": casos,
                "ttfb_mediana_s": mediana,
                "completa_rechazos_flota": completa_rechazos_flota,
                "rechazos_flota": total_rechazos_flota,
            }
        }

    def test_faltan_datos(self):
        self.assertEqual(mmp.veredicto(self._resumen_privado(199, 50, 50, 100), U), "faltan datos")
        self.assertEqual(mmp.veredicto({}, U), "faltan datos")

    def test_se_queda(self):
        # 90 % de los casos que la flota NO completó con rechazo, mediana <= 600
        self.assertEqual(mmp.veredicto(self._resumen_privado(200, 90, 100, 600), U), "se queda")
        self.assertEqual(mmp.veredicto(self._resumen_privado(500, 180, 200, 100), U), "se queda")

    def test_se_descarta_por_tasa(self):
        self.assertEqual(mmp.veredicto(self._resumen_privado(200, 89, 100, 100), U), "se descarta")

    def test_se_descarta_por_mediana(self):
        self.assertEqual(mmp.veredicto(self._resumen_privado(200, 100, 100, 601), U), "se descarta")

    def test_sin_rechazos_flota_no_inventa(self):
        # nada que la flota no completara con rechazo => no puede probar mejora; que sea 0/0 no cuente como >=90%
        self.assertEqual(mmp.veredicto(self._resumen_privado(200, 0, 0, 100), U), "se descarta")


class TestSinTextos(Entorno := unittest.TestCase):
    def setUp(self):
        base = tempfile.mkdtemp(prefix="mmp-")
        self.addCleanup(shutil.rmtree, base, True)
        self.dir_m = os.path.join(base, "medida")
        self._env = dict(os.environ)
        os.environ["STARSEED_MEDIDA_PRIVADA_DIR"] = self.dir_m
        self.addCleanup(lambda: (os.environ.clear(), os.environ.update(self._env)))
        self.addCleanup(setattr, mmp, "MEDIDA_DIR", mmp.MEDIDA_DIR)
        mmp.MEDIDA_DIR = self.dir_m

    def test_progreso_no_guarda_textos(self):
        reg = mmp.registro_progreso(
            "c1", "huella-c1", "privado", 120, True, False, 5.0, 3.0, 200.0, False, True
        )
        mmp._anexar_progreso(reg, self.dir_m)
        with open(os.path.join(self.dir_m, "progreso.jsonl"), encoding="utf-8") as f:
            crudo = f.read()
        self.assertIn("c1", crudo)
        self.assertIn("huella-c1", crudo)
        self.assertNotIn("prompt", crudo.lower())
        # solo campos de métrica esperados
        datos = [__import__("json").loads(l) for l in crudo.strip().splitlines()]
        claves = set(datos[0].keys())
        prohibidas = {"prompt", "texto", "entrada_texto", "salida_texto", "respuesta", "content"}
        self.assertTrue(claves.isdisjoint(prohibidas))

    def test_informe_y_resultado_sin_textos(self):
        mediciones = [caso(str(i), "privado", flota_rechazo=True) for i in range(200)]
        r = mmp.analizar(mediciones)
        d = mmp.escribir_salida(r, self.dir_m)
        for nombre in ("resultado.json", "informe.md"):
            with open(os.path.join(d, nombre), encoding="utf-8") as f:
                contenido = f.read()
            self.assertNotIn("prompt", contenido.lower())


if __name__ == "__main__":
    unittest.main()
