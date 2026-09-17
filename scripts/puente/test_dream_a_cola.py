"""Pruebas de dream_a_cola, con trozos REALES del informe del 2026-09-15."""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from dream_a_cola import clave, es_accionable, proponer, puntos, resumen, secciones

INFORME = """# 🌙 Dream — Sugerencias 2026-09-15

## Top 3 accionables

1. **Publicar los 2 commits pendientes** — `relevo`: dos commits en main sin deploy.

## Mejoras detectadas

1. **Governor de troncos (CPU contention)** — `load average 15.67 en 8 núcleos` reportado.
2. **Unificar 3 motores de permisos** — `lib/senses` y `request-permission` duplican lógica.

## Riesgos

1. **Token `gho_` incrustado en remoto `astraura`** — rotar y pasar a `gh auth`.

## Ideas nuevas

1. **Topología sináptica como grafo navegable** — convertir a grafo explorable.

## Estado del enjambre

1. **Sin novedad** — todo igual que ayer.
"""


class TestLectura(unittest.TestCase):
    def test_encuentra_las_secciones(self):
        s = secciones(INFORME)
        for n in ("top 3 accionables", "mejoras detectadas", "riesgos", "ideas nuevas"):
            self.assertIn(n, s)

    def test_saca_titulo_y_cuerpo(self):
        p = puntos(secciones(INFORME)["riesgos"])
        self.assertEqual(len(p), 1)
        self.assertIn("gho_", p[0][0])
        self.assertIn("rotar", p[0][1])

    def test_informe_vacio(self):
        self.assertEqual(secciones(""), {})
        self.assertEqual(puntos([]), [])


class TestAccionable(unittest.TestCase):
    def test_con_verbo_si(self):
        self.assertTrue(es_accionable("Unificar 3 motores de permisos", "duplican lógica"))
        self.assertTrue(es_accionable("Token gho_", "rotar y pasar a gh auth"))

    def test_una_observacion_no_es_una_tarea(self):
        # Un hecho medido es información para una persona, no un encargo para un agente.
        self.assertFalse(es_accionable("Governor de troncos", "load average 15.67 en 8 núcleos"))

    def test_el_estado_nunca_es_tarea(self):
        self.assertFalse(es_accionable("Sin novedad", "todo igual que ayer"))

    def test_vacio(self):
        self.assertFalse(es_accionable("", ""))


class TestClave(unittest.TestCase):
    def test_aguanta_el_reescrito_de_cada_mañana(self):
        self.assertEqual(clave("Governor de troncos (CPU contention)"),
                         clave("Governor de troncos"))

    def test_normaliza_adornos(self):
        self.assertEqual(clave("**Token `gho_`**"), clave("Token gho_"))


class TestProponer(unittest.TestCase):
    def test_los_riesgos_van_primero(self):
        p = proponer(INFORME, tope=3)
        self.assertIn("gho_", p[0]["titulo"])

    def test_no_repite_lo_ya_encargado(self):
        primera = proponer(INFORME, tope=3)
        hechas = [x["clave"] for x in primera]
        segunda = proponer(INFORME, ya_encargadas=hechas, tope=3)
        self.assertEqual([x["clave"] for x in segunda if x["clave"] in hechas], [])

    def test_el_tope_se_respeta(self):
        # Veinte encargos cada mañana garantizan que no se hace ninguno.
        self.assertEqual(len(proponer(INFORME, tope=1)), 1)
        self.assertEqual(proponer(INFORME, tope=0), [])

    def test_deja_fuera_las_observaciones(self):
        claves = [x["clave"] for x in proponer(INFORME, tope=9)]
        self.assertNotIn(clave("Governor de troncos"), claves)

    def test_informe_ilegible_no_revienta(self):
        self.assertEqual(proponer("cualquier cosa sin secciones"), [])
        self.assertEqual(proponer(None), [])


class TestResumen(unittest.TestCase):
    def test_dice_qué_encargó(self):
        t = resumen(proponer(INFORME, tope=2), total_leidas=5)
        self.assertIn("encargo 2", t)
        self.assertIn("de 5 leídas", t)

    def test_sin_nada_lo_dice(self):
        self.assertIn("nada accionable", resumen([]))


if __name__ == "__main__":
    unittest.main()
