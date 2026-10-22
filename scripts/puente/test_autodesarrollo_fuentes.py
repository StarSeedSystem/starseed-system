"""Pruebas de autodesarrollo_fuentes: las cuatro fuentes y la forma común de §3."""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import autodesarrollo_fuentes as F

DIARIA = """# Imaginación diaria — 2026-10-20

## Mejoras detectadas
1. **Añadir tiempo límite al fetch** — `src/lib/feed/a.ts:40` · sin timeout.
2. **El load average fue 15.67** — solo una observación.

## Ideas nuevas
1. **Unificar el cliente de voz** — tocar `src/lib/voz/cliente.ts`.

## Estado del enjambre
1. **Sin novedad** — nada.
"""

PROFUNDA = {"top": [
    {"titulo": "Unificar el cliente de voz", "archivo": "src/lib/voz/cliente.ts", "linea": 12,
     "impacto": 4, "esfuerzo": 2, "confianza": 0.8, "verificacion": "verificado",
     "area": "voz", "lente": "arquitectura", "propuesta": "Un solo cliente de voz",
     "tarea": "SA09291"},
    {"titulo": "Reducir el sondeo", "archivo": "src/lib/sondeo.ts", "linea": 7,
     "impacto": 3, "esfuerzo": 3, "confianza": 0.5, "verificacion": "sin_verificar",
     "area": "datos", "lente": "coste"},
    {"titulo": "Quitar código muerto", "archivo": "src/lib/muerto.ts", "linea": 1,
     "impacto": 2, "esfuerzo": 1, "confianza": 0.9, "verificacion": "ajustado",
     "ya_encargada": True},
]}

ASTRAURA = {
    "creations": [
        {"id": "c1", "title": "Medir la entropía", "content": "Añadir un medidor",
         "importance_level": "media", "requires_user_approval": False, "status": "new"},
        {"id": "c2", "title": "Ya aplicada", "status": "applied"},
    ],
    "branches": [
        {"id": "b1", "theme": "Explorar la malla", "insights": "Probar LoRa",
         "importance_level": "alta", "requires_user_approval": True,
         "status": "pending_approval", "verification": {"is_verified": True}},
        {"id": "b2", "theme": "Rama descartada", "status": "discarded"},
    ],
}

REVISOR = {"necesitan_alex": {
    "M1": {"pregunta": "¿Rehacer o descartar la tarea M1?", "motivo": "rompe la API",
           "titulo": "Decidir M1", "desde": "revisor-bloqueadas",
           "opciones": ["rehacer", "descartar"]},
    "M2": {"pregunta": "¿Publicar el cambio de cuentas?"},
}}
class TestFormaComun(unittest.TestCase):
    def test_forma_y_id_estable(self):
        a = F.de_diaria(DIARIA, "2026-10-20")
        b = F.de_diaria(DIARIA, "2026-10-20")
        self.assertEqual([p["id"] for p in a], [p["id"] for p in b])
        self.assertEqual(set(a[0]), {"id", "fuente", "titulo", "cuerpo", "archivos",
                                     "cita", "verificacion", "impacto", "esfuerzo", "origen"})
        self.assertTrue(all(p["id"].startswith(p["fuente"] + ":") for p in a))
class TestDiaria(unittest.TestCase):
    def test_accionables_y_citas(self):
        p = F.de_diaria(DIARIA, "2026-10-20")
        self.assertEqual([x["titulo"] for x in p],
                         ["Añadir tiempo límite al fetch", "Unificar el cliente de voz"])
        self.assertEqual(p[0]["cita"], "src/lib/feed/a.ts:40")
        self.assertEqual(p[0]["archivos"], ["src/lib/feed/a.ts"])
        self.assertEqual(p[0]["verificacion"], "sin_verificar")
        self.assertIsNone(p[0]["impacto"])
        self.assertEqual(p[0]["origen"]["informe"], "dream/sugerencias-2026-10-20.md")

    def test_quita_ya_encargadas(self):
        clave = F.D.clave("Añadir tiempo límite al fetch")
        self.assertEqual(len(F.de_diaria(DIARIA, "2026-10-20", [clave])), 1)
class TestProfunda(unittest.TestCase):
    def test_verificacion_metricas_y_cita(self):
        p = F.de_profunda(PROFUNDA, "2026-10-03")
        self.assertEqual([x["titulo"] for x in p],
                         ["Unificar el cliente de voz", "Reducir el sondeo"])
        self.assertEqual(p[0]["verificacion"], "verificado")
        self.assertEqual((p[0]["impacto"], p[0]["esfuerzo"]), (4, 2))
        self.assertEqual(p[0]["cita"], "src/lib/voz/cliente.ts:12")
        self.assertEqual(p[0]["origen"]["confianza"], 0.8)
        self.assertEqual(p[1]["verificacion"], "sin_verificar")

    def test_quita_encargada_por_memoria(self):
        p = F.de_profunda(PROFUNDA, "2026-10-03", [F.D.clave("Reducir el sondeo")])
        self.assertEqual([x["titulo"] for x in p], ["Unificar el cliente de voz"])
class TestAstraura(unittest.TestCase):
    def test_solo_no_aplicadas(self):
        p = F.de_astraura(ASTRAURA)
        self.assertEqual([x["origen"]["id"] for x in p], ["c1", "b1"])
        self.assertEqual(p[0]["origen"]["importancia"], "media")
        self.assertFalse(p[0]["origen"]["requiere_aprobacion"])
        self.assertEqual(p[1]["verificacion"], "verificado")
        self.assertTrue(p[1]["origen"]["requiere_aprobacion"])
        self.assertEqual(F.de_astraura(None), [])

    def test_quita_ya_encargada(self):
        p = F.de_astraura(ASTRAURA, [F.D.clave("Medir la entropía")])
        self.assertEqual([x["origen"]["id"] for x in p], ["b1"])
class TestDirectores(unittest.TestCase):
    def test_preguntas_a_alex(self):
        p = F.de_directores(REVISOR)
        self.assertEqual([x["titulo"] for x in p],
                         ["Decidir M1", "¿Publicar el cambio de cuentas?"])
        self.assertIn("rompe la API", p[0]["cuerpo"])
        self.assertEqual(p[0]["origen"]["opciones"], ["rehacer", "descartar"])
        self.assertEqual(p[0]["id"], "directores:M1")

    def test_quita_ya_encargada(self):
        self.assertEqual(len(F.de_directores(REVISOR, ["M1"])), 1)


if __name__ == "__main__":
    unittest.main()
