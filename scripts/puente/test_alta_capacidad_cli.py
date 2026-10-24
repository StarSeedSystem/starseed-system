# -*- coding: utf-8 -*-
"""Casos rescatados del antiguo CLI `alta-capacidad.py`, adaptados a la API de hoy.

Aquel CLI no llegó a main: la lista de candidatas vive ahora en
`alta_capacidad_nube_logica.candidatas`, que es pura (sin disco, red ni reloj propio). Se
conserva solo el caso que main no cubría todavía: una tarea viva en otro medio (`en_curso`,
`reasignada`, `por_traer`) no vuelve a ser candidata de este carril.
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import alta_capacidad_nube_logica as L  # noqa: E402


class TareaVivaEnOtroMedio(unittest.TestCase):
    def test_no_es_candidata(self):
        """Los estados vivos de la cola y del préstamo no se cogen por segunda vez."""
        colas = [("cola-1021.json", [
            {"id": "ALTA", "archivos": ["a"], "alta_capacidad": True},
            {"id": "TRES", "archivos": ["a", "b", "c"]},
            {"id": "FALLO", "archivos": ["a"], "intentos_auto": 2},
            {"id": "FACIL", "archivos": ["a"]},
            {"id": "HECHA", "archivos": ["a"]},
            {"id": "DEP", "archivos": ["a"], "alta_capacidad": True},
            {"id": "BLOQ", "archivos": ["a"], "alta_capacidad": True},
        ])]
        progreso = {
            "ALTA": {"estado": "en_curso"},
            "TRES": {"estado": "reasignada", "medio": "claude-nube"},
            "FALLO": {"estado": "sin_cambios", "intentos_auto": 2},
            "FACIL": {"estado": "pendiente"},
            "HECHA": {"estado": "commit"},
            "DEP": {"estado": "por_traer"},
            "BLOQ": {"estado": "bloqueada"},
        }
        ids = [t["id"] for t, _ in L.candidatas(colas, progreso, {"sesiones": []})]
        # Solo la pendiente libre: ni las vivas en otro medio ni las cerradas.
        self.assertEqual(ids, ["FACIL"])
        for viva in ("ALTA", "TRES", "DEP"):
            self.assertNotIn(viva, ids)


if __name__ == "__main__":
    unittest.main()
