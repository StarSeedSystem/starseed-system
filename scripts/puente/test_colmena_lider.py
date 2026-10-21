"""Pruebas del líder de colmena: plan_relevo integrado en nodo_metagenesis."""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import colmena_logica as C

AHORA = 1_800_000_000.0

def latido(t, en_curso=(), periodo=300):
    return {"t": t, "periodo_s": periodo, "en_curso": list(en_curso)}

def nodo(medio, agentes=2, **k):
    base = {"medio": medio, "vivo": True, "modo": "real", "contenedor": {"activo": True, "agentes": agentes}}
    base.update(k)
    return base

class PlanRelevoLider(unittest.TestCase):
    def test_mac_se_desconecta_avisando_y_sus_tareas_siguen(self):
        lat = {"mac-1": latido(AHORA - 30, [{"id": "A1", "fase": "escribiendo", "punto": {"t": AHORA - 200}}]),
               "oracle-a1-1": latido(AHORA - 30)}
        bajas = {"mac-1": {"t": AHORA - 5, "traspaso": True}}
        nodos = {"mac-1": nodo("mac"), "oracle-a1-1": nodo("oracle-a1")}
        plan = C.plan_relevo(lat, bajas, {}, nodos, {}, {}, AHORA)
        self.assertEqual(len(plan), 1)
        self.assertEqual(plan[0]["de"], "mac-1")
        self.assertEqual(plan[0]["a"], "oracle-a1-1")
        self.assertEqual(plan[0]["id"], "A1")

    def test_a1_llama_20_min_y_se_releva(self):
        lat = {"mac-1": latido(AHORA - 1200, [{"id": "B1", "fase": "reparando"}]),
               "oracle-a1-1": latido(AHORA - 10)}
        nodos = {"mac-1": nodo("mac"), "oracle-a1-1": nodo("oracle-a1")}
        plan = C.plan_relevo(lat, {}, {}, nodos, {}, {}, AHORA)
        self.assertTrue(any(p["id"] == "B1" and p["a"] == "oracle-a1-1" for p in plan))

    def test_tarea_privada_no_va_a_nube_compartida(self):
        lat = {"mac-1": latido(AHORA - 30, [{"id": "P1", "fase": "escribiendo"}])}
        bajas = {"mac-1": {"t": AHORA - 5, "traspaso": True}}
        nodos = {"gh-1": nodo("gh-actions", 4), "oracle-a1-1": nodo("oracle-a1", 0)}
        tareas = {"P1": {"privado": True}}
        plan = C.plan_relevo(lat, bajas, {}, nodos, {}, tareas, AHORA)
        p = next(x for x in plan if x["id"] == "P1")
        self.assertIsNone(p["a"])
        self.assertIn("espera", p["espera"])

    def test_sin_punto_control_tarea_vuelve_a_cola(self):
        lat = {"mac-1": latido(AHORA - 30, [{"id": "C1", "fase": "escribiendo"}])}
        bajas = {"mac-1": {"t": AHORA - 5, "traspaso": True}}
        nodos = {"oracle-a1-1": nodo("oracle-a1")}
        plan = C.plan_relevo(lat, bajas, {}, nodos, {}, {}, AHORA)
        self.assertEqual(plan[0]["a"], "oracle-a1-1")
        self.assertIsNone(plan[0]["punto"])

if __name__ == "__main__":
    unittest.main()
