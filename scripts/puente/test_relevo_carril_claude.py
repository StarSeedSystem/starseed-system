"""Pruebas del relevo del carril de Claude (REL1026A)."""
import json
import os
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import relevo_carril_claude as R  # noqa: E402
import relevo_carril_claude_logica as L  # noqa: E402

T0 = datetime(2026, 10, 26, 2, 0, tzinfo=timezone.utc)


def tarea(i, **k):
    return {"id": i, "titulo": "Tarea " + i, "prompt": "Haz " + i, "archivos": ["src/" + i + ".ts"], **k}


class Decidir(unittest.TestCase):
    def test_sin_tareas_no_releva(self):
        self.assertEqual(L.debe_relevar({"latido": T0.isoformat()}, T0)[0], False)

    def test_latido_fresco_no_releva(self):
        reg = L.registrar({}, [tarea("P1")], T0)
        self.assertFalse(L.debe_relevar(reg, T0 + timedelta(minutes=10))[0])

    def test_latido_viejo_releva(self):
        reg = L.registrar({}, [tarea("P1")], T0)
        toca, motivo = L.debe_relevar(reg, T0 + timedelta(minutes=50))
        self.assertTrue(toca)
        self.assertIn("sin latido", motivo)

    def test_limite_agotado_releva_aunque_el_latido_sea_fresco(self):
        reg = L.registrar({}, [tarea("P1")], T0)
        lim = {"sesion": {"pct": 100, "reinicio": "2026-10-26T02:50:00+00:00", "reiniciada": False}}
        toca, motivo = L.debe_relevar(reg, T0 + timedelta(minutes=1), lim)
        self.assertTrue(toca)
        self.assertIn("la sesión al 100", motivo)

    def test_limite_ya_reiniciado_no_cuenta(self):
        lim = {"sesion": {"pct": 100, "reiniciada": True}, "semana": {"pct": 40}}
        self.assertIsNone(L.limite_agotado(lim))

    def test_tareas_cerradas_no_cuentan(self):
        reg = L.cerrar(L.registrar({}, [tarea("P1"), tarea("P2")], T0), ["P1", "P2"])
        self.assertFalse(L.debe_relevar(reg, T0 + timedelta(hours=3))[0])


class Planificar(unittest.TestCase):
    def test_lo_que_ya_esta_en_main_se_cierra_y_el_resto_va_a_la_cola(self):
        reg = L.registrar({}, [tarea("P1"), tarea("P2", depende=["P1", "X9"], capacidad="alta")], T0)
        plan = L.planificar_relevo(reg, ["Ola 1026P · Ventana · P1: hecha"], T0)
        self.assertEqual(plan["hechas"], ["P1"])
        self.assertEqual([t["id"] for t in plan["cola"]], ["P2-rc"])
        p2 = plan["cola"][0]
        self.assertEqual(p2["depende"], ["P1", "X9"])  # P1 ya está en main: no se renombra
        self.assertEqual(p2["capacidad"], "alta")
        self.assertIn("RELEVO DEL CARRIL CLAUDE", p2["prompt"])
        self.assertTrue(p2["prompt"].endswith("Haz P2"))

    def test_dependencia_entre_relevadas_apunta_a_su_rc(self):
        reg = L.registrar({}, [tarea("P1"), tarea("P2", depende=["P1"])], T0)
        plan = L.planificar_relevo(reg, [], T0)
        self.assertEqual(plan["cola"][1]["depende"], ["P1-rc"])

    def test_registrar_exige_prompt(self):
        with self.assertRaises(ValueError):
            L.registrar({}, [{"id": "P1"}], T0)

    def test_aplicar_plan_no_muta_y_anota(self):
        reg = L.registrar({}, [tarea("P1"), tarea("P2")], T0)
        plan = L.planificar_relevo(reg, ["· P1: x"], T0)
        nuevo = L.aplicar_plan(reg, plan, T0, "prueba")
        self.assertEqual(reg["tareas"][0]["estado"], "en_curso")
        estados = {t["id"]: t["estado"] for t in nuevo["tareas"]}
        self.assertEqual(estados, {"P1": "hecha", "P2": "relevada"})
        self.assertEqual(nuevo["relevos"][-1]["relevadas"], ["P2"])


class DeExtremoAExtremo(unittest.TestCase):
    def test_revisar_escribe_la_cola_y_no_repite(self):
        with tempfile.TemporaryDirectory() as d:
            ruta, olas = os.path.join(d, "carril", "registro.json"), os.path.join(d, "olas")
            R.guardar(L.registrar({}, [tarea("P1"), tarea("P2")], T0), ruta)
            r = R.revisar(ruta=ruta, olas=olas, limites={}, asuntos=[], momento=T0 + timedelta(hours=1))
            self.assertTrue(r["relevado"])
            with open(os.path.join(olas, r["cola"]), encoding="utf-8") as f:
                cola = json.load(f)
            self.assertEqual([t["id"] for t in cola], ["P1-rc", "P2-rc"])
            r2 = R.revisar(ruta=ruta, olas=olas, limites={}, asuntos=[], momento=T0 + timedelta(hours=2))
            self.assertFalse(r2["relevado"])
            self.assertEqual(len(os.listdir(olas)), 1)

    def test_sin_registro_no_hace_nada(self):
        with tempfile.TemporaryDirectory() as d:
            r = R.revisar(ruta=os.path.join(d, "no.json"), olas=d, limites={}, asuntos=[], momento=T0)
            self.assertFalse(r["relevado"])


if __name__ == "__main__":
    unittest.main()
