# -*- coding: utf-8 -*-
"""Pruebas de director_dream.py: el que convierte la imaginación diaria en encargos."""

import io
import json
import os
import sys
import tempfile
import types
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import director_dream as DD
import dream_a_cola as DC

#: La forma real de una propuesta, tal como la devuelve `dream_a_cola.puntos`.
P = {"titulo": "Algo que hacer", "seccion": "top 3 accionables", "cuerpo": "detalle"}


class TestIdsUnicosPorDia(unittest.TestCase):
    """Un id repetido hacía que el mecanismo sirviera UNA SOLA VEZ.

    (2026-09-17) Los ids eran «DR1», «DR2»… así que el segundo informe reusaba
    los del primero, el orquestador los encontraba en progreso.json como ya
    hechos o bloqueados, y no los cogía nunca. El «DR1» de hoy chocaba con el
    «DR1» del día 15, que estaba en «bloqueante». Alex pidió que los Dream se
    procesaran CADA VEZ que ocurren; con ids repetidos solo se procesaba el
    primero de todos, y nadie se enteraba porque las demás parecían «ya hechas».
    """

    def test_el_id_lleva_el_dia(self):
        self.assertEqual(DD.tarea_de(P, "2026-09-17", 0)["id"], "DR0917-1")

    def test_dos_dias_no_chocan(self):
        a = DD.tarea_de(P, "2026-09-15", 0)["id"]
        b = DD.tarea_de(P, "2026-09-17", 0)["id"]
        self.assertNotEqual(a, b)

    def test_dentro_del_mismo_dia_se_numeran(self):
        ids = [DD.tarea_de(P, "2026-09-17", i)["id"] for i in range(3)]
        self.assertEqual(ids, ["DR0917-1", "DR0917-2", "DR0917-3"])
        self.assertEqual(len(set(ids)), 3)

    def test_no_choca_con_los_ids_viejos_de_dos_digitos(self):
        # Los DR1..DR3 del día 15 siguen en progreso.json: ninguno puede repetirse.
        nuevos = {DD.tarea_de(P, "2026-09-17", i)["id"] for i in range(3)}
        self.assertFalse(nuevos & {"DR1", "DR2", "DR3"})


class TestFormaDelEncargo(unittest.TestCase):
    def test_lleva_el_titulo_del_dream(self):
        self.assertEqual(DD.tarea_de(P, "2026-09-17", 0)["titulo"], P["titulo"])

    def test_el_prompt_dice_de_donde_sale(self):
        # Un agente que no sabe de dónde viene el encargo se inventa el alcance.
        prompt = DD.tarea_de(P, "2026-09-17", 0)["prompt"]
        self.assertIn("sugerencias-2026-09-17.md", prompt)
        self.assertIn(P["seccion"], prompt)

    def test_deja_salida_si_ya_no_aplica(self):
        # La imaginación diaria la escriben modelos gratuitos leyendo registros: a veces
        # proponen algo ya hecho. El encargo tiene que permitir decirlo.
        self.assertIn("NO APLICA", DD.tarea_de(P, "2026-09-17", 0)["prompt"])

    def test_sin_dependencias_ni_alcance_impuesto(self):
        t = DD.tarea_de(P, "2026-09-17", 0)
        self.assertEqual(t["depende"], [])
        self.assertEqual(t["archivos"], [])


class TestTextosDeImaginacion(unittest.TestCase):
    """Lo que lee una persona dice «Imaginación», no «Dream» (Ola 1021I, §2).

    Los identificadores no cambian: el id sigue siendo `DR…` y la cola se
    sigue llamando `cola-dream-…`; solo cambian los textos.
    """

    def test_el_titulo_de_la_ola_dice_imaginacion(self):
        self.assertEqual(
            DD.tarea_de(P, "2026-09-17", 0)["ola"],
            "Ola Imaginación 2026-09-17 · lo que el análisis nocturno encontró",
        )

    def test_el_resumen_dice_imaginacion_diaria(self):
        t = DC.resumen([P], total_leidas=5)
        self.assertTrue(t.startswith("Imaginación diaria leída: encargo 1"), t)
        self.assertNotIn("Dream", t)

    def test_el_resumen_vacio_tambien_dice_imaginacion_diaria(self):
        t = DC.resumen([])
        self.assertTrue(t.startswith("Imaginación diaria leída: nada accionable"), t)
        self.assertNotIn("Dream", t)


INFORME_1108 = """# Imaginación — Sugerencias 2026-11-08

## Top 3 accionables

1. **Pila de publicación atascada** — arreglar la cola de publicación, que no avanza.
2. **Tres motores de permisos duplicados** — unificar `lib/senses` y `request-permission`.
3. **discovery/scan sin paginación** — paginar la respuesta, que devuelve todo de golpe.
"""


class TestPrimerIndice(unittest.TestCase):
    def test_solo_cuenta_los_del_mismo_dia(self):
        usados = {"DR1108-1", "DR1108-7", "DR1107-9", "DR1", "SUP0811F", "DR1108-x"}
        self.assertEqual(DD.primer_indice("2026-11-08", usados), 7)

    def test_sin_nada_empieza_en_cero(self):
        self.assertEqual(DD.primer_indice("2026-11-08", set()), 0)


class TestVariasPasadasElMismoDia(unittest.TestCase):
    """(SUP0811F) El director corre al cerrar CADA ola. El 08-11 corrió tres veces (00:22, 01:12 y
    01:31) y cada pasada numeraba desde 1: el orquestador encontró los ids nuevos ya en «commit» y
    tres propuestas se perdieron sin que nadie se enterara (y el enjambre se quedó sin trabajo)."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        raiz = self.tmp.name
        self.dream = os.path.join(raiz, "starseed_memory_root", "dream")
        self.olas = os.path.join(raiz, "starseed_memory_root", "olas")
        os.makedirs(self.dream)
        os.makedirs(self.olas)
        with open(os.path.join(self.dream, "sugerencias-2026-11-08.md"), "w", encoding="utf-8") as f:
            f.write(INFORME_1108)
        self.parches = [
            mock.patch.object(DD, "DREAM", self.dream),
            mock.patch.object(DD, "OLAS", self.olas),
            mock.patch.object(DD, "MEMORIA", os.path.join(raiz, "dream-encargado.json")),
            # Nada de escribir en el canal de verdad.
            mock.patch.dict(sys.modules, {"puente": types.SimpleNamespace(decir=lambda *a, **k: None)}),
            mock.patch.object(sys, "argv", ["director_dream.py", "--tope", "2"]),
        ]
        for p in self.parches:
            p.start()

    def tearDown(self):
        for p in reversed(self.parches):
            p.stop()
        self.tmp.cleanup()

    def _pasada(self):
        with mock.patch("sys.stdout", new=io.StringIO()):
            DD.main()
        with open(os.path.join(self.olas, "cola-dream-2026-11-08.json"), encoding="utf-8") as f:
            return json.load(f)

    def _hechas(self, *ids):
        ruta = os.path.join(self.olas, "progreso.json")
        prog = {}
        if os.path.exists(ruta):
            with open(ruta, encoding="utf-8") as f:
                prog = json.load(f)
        for i in ids:
            prog[i] = {"estado": "commit"}
        with open(ruta, "w", encoding="utf-8") as f:
            json.dump(prog, f)

    def test_la_segunda_pasada_del_dia_no_reusa_ids(self):
        primera = self._pasada()
        self.assertEqual([t["id"] for t in primera], ["DR1108-1", "DR1108-2"])
        self._hechas("DR1108-1", "DR1108-2")
        segunda = self._pasada()
        nuevas = [t for t in segunda if t["titulo"].startswith("discovery")]
        self.assertEqual([t["id"] for t in nuevas], ["DR1108-3"])

    def test_lo_pendiente_de_la_pasada_anterior_conserva_su_enunciado(self):
        primera = self._pasada()
        self._hechas("DR1108-1")  # DR1108-2 sigue en reintentos
        por_id = {t["id"]: t for t in self._pasada()}
        self.assertEqual(por_id["DR1108-2"]["titulo"], primera[1]["titulo"])
        self.assertIn("DR1108-3", por_id)

    def test_cuenta_la_cola_que_la_higiene_movio_a_colas_fuente(self):
        self._pasada()
        fuente = os.path.join(os.path.dirname(self.olas), "colas-fuente")
        os.makedirs(fuente)
        nombre = "cola-dream-2026-11-08.json"
        os.replace(os.path.join(self.olas, nombre), os.path.join(fuente, nombre))
        self.assertEqual([t["id"] for t in self._pasada()], ["DR1108-3"])


if __name__ == "__main__":
    unittest.main()
