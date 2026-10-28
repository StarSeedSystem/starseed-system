#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""(2026-10-27) Pruebas de colibri_nodo.py: qué modelos caben por neurona y el plan de instalación.

Escenarios pedidos: A1 (12 GB, 18,5 GB libres) → Laya y GLiNER sí, Qwen3-Coder no; Mac (8 GB con
presión) → ninguno. El plan se comprueba sin ejecutar nada.
"""
import io
import json
import sys
import unittest
from contextlib import redirect_stdout
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import colibri_nodo as CN  # noqa: E402

CONFIG = Path(__file__).resolve().parents[2] / "config" / "capas-colibri-1027.json"
with CONFIG.open(encoding="utf-8") as _f:
    ENTRADAS = json.load(_f)["entradas"]


def por_id(ram, disco, presion=False):
    return {fila["id"]: fila for fila in CN.caben(ENTRADAS, ram, disco, presion)}


class TestCaben(unittest.TestCase):
    def test_a1_laya_y_gliner_si_y_qwen3_coder_no(self):
        v = por_id(12, 18.5)
        self.assertEqual(v["colibri-laya"]["veredicto"], CN.CABE)
        self.assertEqual(v["colibri-gliner-decide"]["veredicto"], CN.CABE)
        self.assertEqual(v["colibri-qwen3-coder-30b"]["veredicto"], CN.NO_CABE)
        self.assertIn("disco", v["colibri-qwen3-coder-30b"]["motivo"])

    def test_mac_con_presion_no_cabe_ninguno(self):
        v = por_id(8, 5, True)
        self.assertEqual(len(v), len(ENTRADAS))
        for fila in v.values():
            self.assertEqual(fila["veredicto"], CN.NO_CABE)
            self.assertIn("presión", fila["motivo"])

    def test_sin_presion_manda_la_ram_minima(self):
        v = por_id(18, 500)
        self.assertEqual(v["colibri-clef"]["veredicto"], CN.NO_CABE)
        self.assertIn("RAM", v["colibri-clef"]["motivo"])
        self.assertEqual(v["colibri-laya"]["veredicto"], CN.CABE)

    def test_streaming_cuando_hay_disco_pero_falta_ram_recomendada(self):
        v = por_id(20, 900)
        self.assertEqual(v["colibri-deepseek-v4-flash-reap"]["veredicto"], CN.STREAMING)
        self.assertEqual(v["colibri-glm-5.2"]["veredicto"], CN.STREAMING)
        self.assertIn("disco", v["colibri-deepseek-v4-flash-reap"]["motivo"])
        self.assertEqual(v["colibri-qwen38-flash-next"]["veredicto"], CN.NO_CABE)

    def test_usa_la_descarga_si_es_mayor_que_el_modelo(self):
        olmoe = next(e for e in ENTRADAS if e["id"] == "colibri-olmoe-7b")
        self.assertGreater(olmoe["descarga_gb"], olmoe["disco_gb"])
        v = por_id(12, 10)
        self.assertEqual(v["colibri-olmoe-7b"]["veredicto"], CN.NO_CABE)
        self.assertIn("14", v["colibri-olmoe-7b"]["motivo"])

    def test_no_muta_las_entradas_y_da_id_veredicto_motivo(self):
        antes = json.loads(json.dumps(ENTRADAS))
        filas = CN.caben(ENTRADAS, 12, 18.5)
        self.assertEqual(ENTRADAS, antes)
        for fila in filas:
            self.assertEqual(set(fila), {"id", "veredicto", "motivo"})


class TestPlan(unittest.TestCase):
    def test_tres_pasos_con_listas_de_argumentos(self):
        plan = CN.plan_instalacion("colibri-laya", "/tmp/colibri")
        self.assertEqual([o["paso"] for o in plan], ["clonar", "instalar", "servir"])
        for orden in plan:
            self.assertIsInstance(orden["cmd"], list)
            self.assertTrue(all(isinstance(a, str) for a in orden["cmd"]))

    def test_clona_la_etiqueta_v2(self):
        clon = CN.plan_instalacion("colibri-laya", "/tmp/colibri")[0]["cmd"]
        self.assertEqual(clon[:2], ["git", "clone"])
        self.assertIn("v2.0.0", clon)
        self.assertIn("https://github.com/JustVugg/colibri.git", clon)

    def test_instala_con_start_here_y_sirve_solo_en_4480(self):
        plan = CN.plan_instalacion("colibri-gliner-decide", "/tmp/colibri")
        self.assertEqual(plan[1]["cmd"][1:], ["./start-here.sh", "--model", "colibri-gliner-decide",
                                               "--dir", "/tmp/colibri", "--yes", "--no-gpu"])
        servir = plan[2]["cmd"]
        self.assertEqual(servir[servir.index("--host") + 1], "127.0.0.1")
        self.assertEqual(servir[servir.index("--port") + 1], "4480")
        self.assertNotIn("0.0.0.0", servir)

    def test_exige_id_y_carpeta(self):
        with self.assertRaises(ValueError):
            CN.plan_instalacion("", "/tmp/colibri")
        with self.assertRaises(ValueError):
            CN.plan_instalacion("colibri-laya", "")

    def test_main_plan_imprime_y_no_ejecuta(self):
        salida = io.StringIO()
        with redirect_stdout(salida):
            CN.main(["--plan", "--ram", "12", "--disco", "18.5"])
        texto = salida.getvalue()
        self.assertIn("Plan de colibri-laya", texto)
        self.assertIn("127.0.0.1", texto)
        self.assertIn("Nada se ha ejecutado ni descargado", texto)


if __name__ == "__main__":
    unittest.main()
