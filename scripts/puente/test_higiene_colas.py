# -*- coding: utf-8 -*-
"""Puertas de higiene_colas: qué cola se mueve, cuál se queda y cuál se ignora."""

import os
import sys
import tempfile
import time
import unittest

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
if DIRECTORIO not in sys.path:
    sys.path.insert(0, DIRECTORIO)

from higiene_colas import colas_auto_viejas, colas_cerradas, colas_vivas, escribir_indice, indice_de, latidos_de, orquestador_vivo  # noqa: E402

MAIN = ["Ola 315 · zN1: higiene de colas integrada"]


class ColasCerradasTest(unittest.TestCase):
    def test_cola_con_todas_sus_tareas_cerradas_sale(self):
        tareas = [{"id": "zN1"}, {"id": "zN2"}]
        progreso = {"zN1": {"estado": "commit"}, "zN2": {"estado": "rechazada"}}
        self.assertEqual(
            colas_cerradas([("cola-315.json", tareas)], progreso, MAIN),
            ["cola-315.json"],
        )

    def test_una_sola_tarea_viva_la_sostiene(self):
        tareas = [{"id": "zN1"}, {"id": "zN3"}]
        progreso = {"zN1": {"estado": "commit"}, "zN3": {"estado": "pendiente"}}
        self.assertEqual(
            colas_cerradas([("cola-315.json", tareas)], progreso, MAIN), []
        )

    def test_id_ya_en_main_cuenta_como_cerrado(self):
        # zN1 no figura en progreso, pero su id ya vive en un asunto de main.
        self.assertEqual(
            colas_cerradas([("cola-314.json", [{"id": "zN1"}])], {}, MAIN),
            ["cola-314.json"],
        )

    def test_cola_ilegible_se_ignora(self):
        self.assertEqual(colas_cerradas([("cola-315.json", None)], {}, []), [])

    def test_copias_auto_no_cuentan_como_fuente(self):
        # Aunque estén todas cerradas, las copias de ejecución no se mueven aquí.
        self.assertEqual(
            colas_cerradas([("cola-auto-0912.json", [{"id": "zN1"}])], {}, []), []
        )


class ColasAutoViejasTest(unittest.TestCase):
    def setUp(self):
        self.olas = tempfile.mkdtemp()

    def _tocar(self, nombre, hace):
        ruta = os.path.join(self.olas, nombre)
        with open(ruta, "w") as f:
            f.write("{}")
        os.utime(ruta, (hace, hace))  # noqa: days in the past are fine

    def test_auto_vieja_y_orquestador_muerto_sale(self):
        self._tocar("cola-auto-0901.json", time.time() - 30 * 3600)
        self._tocar("cola-auto-hoy.json", time.time() - 3600)
        self.assertEqual(
            colas_auto_viejas(self.olas, vivo=False), ["cola-auto-0901.json"]
        )

    def test_con_orquestador_vivo_ninguna_auto_sale(self):
        self._tocar("cola-auto-0901.json", time.time() - 30 * 3600)
        self.assertEqual(colas_auto_viejas(self.olas, vivo=True), [])

    def test_auto_reciente_no_sale(self):
        self._tocar("cola-auto-hoy.json", time.time() - 3600)
        self.assertEqual(colas_auto_viejas(self.olas, vivo=False), [])


    def test_con_vivas_solo_se_queda_la_viva_y_las_recientes(self):
        # (2026-10-03) 727 copias acumuladas: con el orquestador vivo no salía ninguna.
        self._tocar("cola-auto-0901.json", time.time() - 30 * 3600)
        self._tocar("cola-auto-0902.json", time.time() - 29 * 3600)
        self._tocar("cola-auto-hoy.json", time.time() - 3600)
        self.assertEqual(
            colas_auto_viejas(self.olas, vivas={"cola-auto-0902.json"}),
            ["cola-auto-0901.json"],
        )

    def test_los_latidos_se_van_con_su_cola_pero_no_los_de_la_viva(self):
        self._tocar("latidos-cola-auto-0901.json", time.time() - 30 * 3600)
        self._tocar("latidos-cola-auto-0902.json", time.time() - 30 * 3600)
        self.assertEqual(
            latidos_de(["cola-auto-0901.json", "cola-auto-0902.json", "cola-auto-sin.json"],
                       self.olas, vivas={"cola-auto-0902.json"}),
            ["latidos-cola-auto-0901.json"],
        )


class ColasVivasTest(unittest.TestCase):
    PS = [
        "/opt/homebrew/bin/python3 -u /Users/alex/.local/bin/starseed-enjambre.py "
        "/Users/alex/Documents/starseed-os-main/starseed_memory_root/olas/cola-auto-1003-190915.json --workers 3",
        "/Users/alex/.opencode/bin/opencode run arregla starseed-enjambre.py cola-falsa.json",
        "python3 /x/starseed-enjambre.py cola-suenos-ola1.json",
    ]

    def test_solo_las_que_corre_un_orquestador(self):
        self.assertEqual(colas_vivas(self.PS), {"cola-auto-1003-190915.json", "cola-suenos-ola1.json"})

    def test_el_prompt_de_un_agente_no_es_un_orquestador(self):
        self.assertFalse(orquestador_vivo([self.PS[1]]))
        self.assertTrue(orquestador_vivo([self.PS[0]]))

    def test_vacio(self):
        self.assertEqual(colas_vivas([]), set())
        self.assertEqual(colas_vivas(None), set())



class IndiceTest(unittest.TestCase):
    """(2026-10-03) Al archivar colas, «Integradas» bajó de 467 a 458: el índice lo evita."""

    def test_id_titulo_ola_y_cola_sin_prompt(self):
        i = indice_de([("cola-313.json", [{"id": "L8a", "titulo": "Lab", "ola": "Ola 311", "prompt": "x" * 9000}])])
        self.assertEqual(i["tareas"]["L8a"], {"titulo": "Lab", "cola": "cola-313.json", "ola": "Ola 311"})
        self.assertNotIn("prompt", i["tareas"]["L8a"])

    def test_gana_la_copia_mas_reciente_y_lo_raro_se_ignora(self):
        i = indice_de([
            ("cola-auto-1002-100000.json", [{"id": "A", "titulo": "nuevo"}]),
            ("cola-auto-0930-100000.json", [{"id": "A", "titulo": "viejo"}, {"sin": "id"}, 3]),
            ("cola-rota.json", None),
        ])
        self.assertEqual(i["tareas"]["A"]["titulo"], "nuevo")
        self.assertEqual(len(i["tareas"]), 1)

    def test_escribe_el_indice_en_disco(self):
        import json
        d = tempfile.mkdtemp()
        with open(os.path.join(d, "cola-1.json"), "w") as f:
            json.dump({"tareas": [{"id": "W2", "titulo": "Crónica"}]}, f)
        self.assertEqual(escribir_indice(d), 1)
        with open(os.path.join(d, "indice.json")) as f:
            self.assertEqual(json.load(f)["tareas"]["W2"]["titulo"], "Crónica")


if __name__ == "__main__":
    unittest.main()
