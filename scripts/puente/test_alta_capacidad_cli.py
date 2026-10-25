# -*- coding: utf-8 -*-
"""Pruebas rescatadas del carril de alta capacidad (RTVAR1021C).

El CLI `alta-capacidad.py` de la rama nube/40112116347 no se integró en main; la
decisión vive hoy en `alta_capacidad_nube_logica.py`. De los casos de la rama solo
se rescata el que main no cubría: una tarea ya cogida por otro medio no es candidata.
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import alta_capacidad_nube_logica as L  # noqa: E402


class TareaVivaEnOtroMedio(unittest.TestCase):
    def test_no_es_candidata(self):
        """`en_curso` y `reasignada` son préstamos vivos: el carril no los vuelve a coger.

        `por_traer` ya no es un estado del progreso: hoy lo deriva `buscar_capacidad`
        (`por_traer_de_la_nube`) y su prueba vive en `test_buscar_capacidad.py`.
        """
        colas = [("cola-1021.json", [
            {"id": "EN_CURSO", "alta_capacidad": True},
            {"id": "PRESTADA", "archivos": ["a.ts", "b.ts", "c.ts"]},
            {"id": "LIBRE", "archivos": ["a.ts"]},
        ])]
        progreso = {
            "EN_CURSO": {"estado": "en_curso"},
            "PRESTADA": {"estado": "reasignada", "medio": "claude-nube"},
        }
        ids = [t["id"] for t, _ in L.candidatas(colas, progreso, {"sesiones": []})]
        self.assertEqual(ids, ["LIBRE"])


if __name__ == "__main__":
    unittest.main()
