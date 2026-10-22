"""Pruebas de las cuatro fuentes de Imaginación, con datos de ejemplo de cada una."""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import dream_a_cola as D
from autodesarrollo_fuentes import de_astraura, de_diaria, de_directores, de_profunda

CAMPOS = {"id", "fuente", "titulo", "cuerpo", "archivos", "cita", "verificacion", "impacto", "esfuerzo", "origen"}

DIARIA = """# Imaginación diaria — 2026-10-21
## Riesgos
1. **Rotar la clave filtrada** — tocar `scripts/puente/publicar.py` y avisar en el canal.
## Mejoras detectadas
1. **Governor de troncos** — load average 15.67 en 8 núcleos.
2. **Unificar los permisos** — `src/lib/permisos.ts` y `src/lib/acceso.ts` duplican lógica.
"""


class Diaria(unittest.TestCase):
    def test_solo_accionables_archivos_forma_e_id_estable(self):
        p = de_diaria(DIARIA, "2026-10-21")
        self.assertEqual([x["titulo"] for x in p],
                         ["Rotar la clave filtrada", "Unificar los permisos"])
        self.assertEqual(p[0]["archivos"], ["scripts/puente/publicar.py"])
        self.assertIn("sugerencias-2026-10-21.md", p[0]["cita"])
        self.assertEqual(set(p[0]), CAMPOS)
        self.assertEqual(p[0]["id"], de_diaria(DIARIA, "2026-10-25")[0]["id"])
        self.assertTrue(p[0]["id"].startswith("diaria:"))

    def test_quita_lo_ya_encargado_y_aguanta_vacio(self):
        p = de_diaria(DIARIA, "2026-10-21", [D.clave("Rotar la clave filtrada")])
        self.assertEqual([x["titulo"] for x in p], ["Unificar los permisos"])
        self.assertEqual(de_diaria("", "2026-10-21"), [])


class Profunda(unittest.TestCase):
    CONSOLIDADO = {"top": [
        {"titulo": "Unificar el cliente de voz", "area": "voz", "lente": "arquitectura",
         "archivo": "src/lib/voz.ts", "linea": 42, "impacto": 4, "esfuerzo": 2,
         "confianza": 0.8, "verificacion": "verificado", "tarea": "SA09291",
         "propuesta": "Extraer el cliente común", "accionable": True},
        {"titulo": "Ya encargada", "archivo": "src/lib/x.ts", "linea": 1, "ya_encargada": True},
    ]}

    def test_toma_el_top_con_cita_verificacion_y_confianza(self):
        p = de_profunda(self.CONSOLIDADO, "2026-09-29")
        self.assertEqual(len(p), 1)
        u = p[0]
        self.assertEqual((u["fuente"], u["cita"], u["archivos"]),
                         ("profunda", "src/lib/voz.ts:42", ["src/lib/voz.ts"]))
        self.assertEqual((u["verificacion"], u["impacto"], u["esfuerzo"]),
                         ("verificado", 4.0, 2.0))
        self.assertEqual(u["origen"]["confianza"], 0.8)
        self.assertEqual(u["origen"]["tarea"], "SA09291")

    def test_quita_lo_ya_encargado_por_clave_y_aguanta_vacio(self):
        p = de_profunda(self.CONSOLIDADO, "2026-09-29",
                        [D.clave("Unificar el cliente de voz")])
        self.assertEqual(p, [])
        self.assertEqual(de_profunda(None, "2026-09-29"), [])


class Astraura(unittest.TestCase):
    STATUS = {
        "creations": [
            {"id": "c1", "title": "Ideas de voz", "content": "Probar `src/lib/voz.ts`.",
             "importance_level": "alta", "requires_user_approval": True,
             "status": "pending_approval"},
            {"id": "c2", "title": "Ya aplicada", "status": "applied"}],
        "branches": [
            {"id": "b1", "theme": "Rama de pruebas", "hypothesis": "menos ruido",
             "insights": "revisar `src/lib/ruido.ts`", "importance_level": "media",
             "requires_user_approval": True, "status": "pending_approval", "verification": {"is_verified": True}},
            {"id": "b2", "theme": "Descartada", "status": "discarded"}],
    }

    def test_creaciones_y_ramas_no_aplicadas(self):
        p = de_astraura(self.STATUS)
        self.assertEqual([x["origen"]["clave"] for x in p], ["c1", "b1"])
        self.assertEqual((p[0]["fuente"], p[0]["origen"]["importance_level"]),
                         ("astraura", "alta"))
        self.assertTrue(p[0]["origen"]["requires_user_approval"])
        self.assertIn("voz.ts", p[0]["cuerpo"])
        self.assertEqual((p[1]["titulo"], p[1]["verificacion"]),
                         ("Rama de pruebas", "verificado"))

    def test_quita_lo_ya_encargado_por_id_de_item_y_aguanta_vacio(self):
        self.assertEqual(de_astraura(self.STATUS, ["c1", "b1"]), [])
        self.assertEqual(de_astraura(None), [])


class Directores(unittest.TestCase):
    REVISOR = {"necesitan_alex": {
        "TG1": {"pregunta": "¿Publico el cambio en el canal?", "opciones": ["sí", "no"],
                "motivo": "toca Telegram", "desde": "2026-10-21T10:00:00",
                "titulo": "Publicar en Telegram"},
        "TG2": {"pregunta": "¿Qué orden prefieres?", "opciones": ["a", "b"]},
    }}

    def test_toma_las_preguntas_y_sus_opciones(self):
        p = de_directores(self.REVISOR)
        self.assertEqual([x["origen"]["tid"] for x in p], ["TG1", "TG2"])
        self.assertEqual(p[0]["titulo"], "Publicar en Telegram")
        self.assertIn("¿Publico el cambio", p[0]["cuerpo"])
        self.assertIn("Opciones: sí · no", p[0]["cuerpo"])
        self.assertIn("revisor-bloqueadas.json", p[0]["cita"])
        self.assertEqual(p[1]["titulo"], "¿Qué orden prefieres?")

    def test_quita_lo_ya_encargado_y_aguanta_vacio(self):
        p = de_directores(self.REVISOR, ["TG1"])
        self.assertEqual([x["origen"]["tid"] for x in p], ["TG2"])
        self.assertEqual(de_directores(None), [])


if __name__ == "__main__":
    unittest.main()
