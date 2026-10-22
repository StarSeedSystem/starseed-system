#!/usr/bin/env python3
"""Pruebas de autodesarrollo_fuentes (sin red ni disco)."""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import autodesarrollo_fuentes as F
DIARIA = """# Imaginación diaria
## Riesgos
1. **Añadir tiempo límite al fetch** — `src/lib/feed/a.ts:40` · impacto 4 · esfuerzo 1.
## Recomendaciones para las próximas olas
1. **Unificar los clientes de voz** — tocar `src/lib/voz/cliente.ts` e `src/lib/voz/otro.ts`.
2. **Estado del enjambre** — load average 15.67, sin novedad.
## Ideas nuevas
1. **Convertir el árbol en grafo** — sin más.
"""
TOP = {"top": [
    {"titulo": "Añadir límite", "archivo": "src/lib/x.ts", "linea": 12, "impacto": 4,
     "esfuerzo": 2, "confianza": 0.9, "verificacion": "verificado", "detalle": "detalle",
     "propuesta": {"archivos": ["src/lib/x.ts"]}},
    {"titulo": "Cita explícita", "cita": "src/lib/y.ts:7", "impacto": "3", "esfuerzo": "2",
     "confianza": 0.7, "verificacion": "ajustado"},
    {"titulo": "Ya encargada", "ya_encargada": True},
    {"titulo": "No accionable", "accionable": False},
]}
ASTRAURA = {
    "creations": [
        {"id": "c1", "title": "Creación pendiente", "content": "contenido", "importance_level": "high",
         "requires_user_approval": True, "status": "pending_approval"},
        {"id": "c2", "title": "Ya aplicada", "status": "applied"},
    ],
    "branches": [
        {"id": "b1", "theme": "Rama viva", "hypothesis": "hipótesis", "importance_level": "low",
         "requires_user_approval": True, "status": "pending_approval",
         "verification": {"is_verified": True}},
        {"id": "b2", "theme": "Descartada", "status": "discarded"},
        {"id": "b3", "theme": "Aplicada por Alex", "status": "pending_approval", "applied_by": "alex"},
    ],
}
REVISOR = {"necesitan_alex": {
    "T1": {"titulo": "Elegir destino", "pregunta": "¿A qué nube?", "motivo": "hay dos",
           "opciones": ["A", "B"], "desde": "2026-10-21"},
    "T2": {"pregunta": "¿Publicamos ya?"},
}}

class Diaria(unittest.TestCase):
    def test_normaliza_y_lee_todas_las_secciones(self):
        p = F.de_diaria(DIARIA, "2026-10-21")
        self.assertEqual([x["titulo"] for x in p],
                         ["Añadir tiempo límite al fetch", "Unificar los clientes de voz",
                          "Convertir el árbol en grafo"])
        self.assertEqual(set(p[0]), {"id", "fuente", "titulo", "cuerpo", "archivos", "cita",
                                     "verificacion", "impacto", "esfuerzo", "origen"})
        self.assertEqual(p[0]["fuente"], "diaria")
        self.assertEqual(p[0]["archivos"], ["src/lib/feed/a.ts"])
        self.assertEqual(p[0]["cita"], "src/lib/feed/a.ts:40")
        self.assertEqual((p[0]["impacto"], p[0]["esfuerzo"]), (4, 1))
        self.assertEqual(p[0]["verificacion"], "sin_verificar")
        self.assertEqual(p[0]["origen"]["seccion"], "riesgos")
    def test_id_estable_y_quita_lo_encargado(self):
        a = F.de_diaria(DIARIA, "2026-10-21")
        b = F.de_diaria(DIARIA, "2026-11-01")
        self.assertEqual([x["id"] for x in a], [x["id"] for x in b])
        clave = F.D.clave("Añadir tiempo límite al fetch")
        quedan = F.de_diaria(DIARIA, "2026-10-21", ya_encargadas=[clave])
        self.assertNotIn("diaria:%s" % clave, [x["id"] for x in quedan])
    def test_informe_vacio(self):
        self.assertEqual(F.de_diaria("", "2026-10-21"), [])
        self.assertEqual(F.de_diaria(None, "2026-10-21"), [])

class Profunda(unittest.TestCase):
    def test_toma_top_con_cita_y_confianza(self):
        p = F.de_profunda(TOP, "2026-10-21")
        self.assertEqual([x["titulo"] for x in p], ["Añadir límite", "Cita explícita"])
        self.assertEqual(p[0]["cita"], "src/lib/x.ts:12")
        self.assertEqual(p[0]["verificacion"], "verificado")
        self.assertEqual(p[0]["origen"]["confianza"], 0.9)
        self.assertEqual(p[1]["cita"], "src/lib/y.ts:7")
        self.assertEqual(p[1]["archivos"], ["src/lib/y.ts"])
        self.assertEqual((p[1]["impacto"], p[1]["esfuerzo"]), (3, 2))
    def test_acepta_lista_y_quita_encargadas(self):
        self.assertEqual(len(F.de_profunda(TOP["top"], "2026-10-21")), 2)
        clave = F.D.clave("Añadir límite")
        self.assertEqual([x["titulo"] for x in F.de_profunda(TOP, "2026-10-21", [clave])],
                         ["Cita explícita"])
        self.assertEqual(F.de_profunda(None, "2026-10-21"), [])

class Astraura(unittest.TestCase):
    def test_solo_no_aplicadas_y_normaliza(self):
        p = F.de_astraura(ASTRAURA, "2026-10-21")
        self.assertEqual([x["id"] for x in p], ["astraura:c1", "astraura:b1"])
        self.assertEqual(p[0]["fuente"], "astraura")
        self.assertEqual(p[0]["impacto"], 4)
        self.assertTrue(p[0]["origen"]["requires_user_approval"])
        self.assertEqual(p[1]["cita"], "astraura:rama/b1")
        self.assertEqual(p[1]["verificacion"], "verificado")
        self.assertEqual(p[1]["origen"]["tipo"], "rama")
    def test_estado_vacio_y_encargadas(self):
        self.assertEqual(F.de_astraura(None), [])
        self.assertEqual(F.de_astraura({"creations": "no es lista"}), [])
        self.assertEqual([x["id"] for x in F.de_astraura(ASTRAURA, ya_encargadas=["c1"])],
                         ["astraura:b1"])

class Directores(unittest.TestCase):
    def test_preguntas_a_alex(self):
        p = F.de_directores(REVISOR, "2026-10-21")
        self.assertEqual([x["id"] for x in p], ["directores:T1", "directores:T2"])
        self.assertEqual(p[0]["titulo"], "Elegir destino")
        self.assertIn("Opciones: A · B", p[0]["cuerpo"])
        self.assertEqual(p[0]["origen"]["opciones"], ["A", "B"])
        self.assertEqual(p[1]["titulo"], "¿Publicamos ya?")
        self.assertEqual(p[0]["archivos"], [])
    def test_vacio_y_encargadas(self):
        self.assertEqual(F.de_directores(None), [])
        self.assertEqual(F.de_directores({"necesitan_alex": {"T1": {}}}, ya_encargadas=["T1"]), [])


if __name__ == "__main__":
    unittest.main()
