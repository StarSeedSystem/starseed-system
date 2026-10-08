# -*- coding: utf-8 -*-
"""El orquestador tiene que poder ARRENDAR una tarea con trabajadores libres (2026-10-08).

JF2b cambió `repartir` por `ordenar_medios` sobre el registro crudo de `medios.json` (sin
`estado` ni `libres`): `reservar_tarea` devolvía None SIEMPRE y la tanda se quedó latiendo
«sin tareas activas» con 3 listas y 3 trabajadores libres. Esta prueba monta un registro con
los medios de ESTA instancia en una carpeta temporal y exige el arriendo.
"""
import importlib.util
import json
import os
import sys
import tempfile
import time
import unittest

RUTA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "starseed-enjambre.py")
ESPEC = importlib.util.spec_from_file_location("enjambre", RUTA)
enjambre = importlib.util.module_from_spec(ESPEC)
sys.modules["enjambre"] = enjambre
ESPEC.loader.exec_module(enjambre)


class ReservarTareaTest(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp(prefix="enj-reservar-")
        self.antes = (enjambre.OLAS, enjambre.MEDIOS_JSON, list(sys.argv))
        enjambre.OLAS = self.dir
        enjambre.MEDIOS_JSON = os.path.join(self.dir, "medios.json")
        sys.argv = ["starseed-enjambre.py", os.path.join(self.dir, "cola-prueba.json")]
        ahora = time.time()
        medios = {}
        for tipo, capacidad in (("opencode", 3), ("codex", 1)):
            mid = enjambre.MEDIOS_LOCALES[tipo]
            medios[mid] = {
                "id": mid, "tipo": tipo, "motor": tipo, "origen": "mac", "entorno": "mac",
                "activo": True, "perfil": "%s:mac:mac" % tipo, "cola": "cola-prueba",
                "prioridad": 15.0 if tipo == "codex" else 0.0, "capacidad": capacidad, "carga": 0,
                "tareas": [], "firmas": {}, "bytes": 0, "latido": ahora, "avance": ahora, "areas": ["*"],
            }
        # Un medio de OTRA cola, vivo, no debe llevarse la tarea de esta.
        medios["opencode:mac:mac:1"] = dict(medios[enjambre.MEDIOS_LOCALES["opencode"]], id="opencode:mac:mac:1",
                                            cola="cola-otra")
        with open(enjambre.MEDIOS_JSON, "w", encoding="utf-8") as f:
            json.dump({"version": 1, "medios": medios, "arriendos": {}, "historial": {}}, f)

    def tearDown(self):
        enjambre.OLAS, enjambre.MEDIOS_JSON, sys.argv[:] = self.antes[0], self.antes[1], self.antes[2]

    def test_con_trabajadores_libres_la_tarea_consigue_arriendo(self):
        arriendo = enjambre.reservar_tarea({"id": "CAMR1005Db", "titulo": "t", "archivos": ["src/a.ts"]})
        self.assertIsNotNone(arriendo, "sin arriendo no empieza ninguna tarea")
        self.assertIn(arriendo["medio"], enjambre.MEDIOS_LOCALES.values())
        with open(enjambre.MEDIOS_JSON, encoding="utf-8") as f:
            self.assertIn("CAMR1005Db", json.load(f)["arriendos"])

    def test_tres_tareas_seguidas_se_reparten_sin_pasar_de_la_capacidad(self):
        ids = ["A1", "A2", "A3", "A4", "A5"]
        arriendos = [enjambre.reservar_tarea({"id": i, "titulo": i, "archivos": ["x"]}) for i in ids]
        conseguidos = [a for a in arriendos if a]
        self.assertEqual(len(conseguidos), 4)  # opencode 3 + codex 1
        self.assertIsNone(arriendos[-1])


if __name__ == "__main__":
    unittest.main()
