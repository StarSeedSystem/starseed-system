"""(1106 · ORQ1106A) El director de orquestación no cuenta como pendientes las cerradas sin código."""
import importlib.util, json, os, sys, tempfile, unittest

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
_spec = importlib.util.spec_from_file_location("director_orquestacion_1106", os.path.join(AQUI, "director-orquestacion.py"))
D = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(D)


class CerradasNoSonPendientes(unittest.TestCase):
    def setUp(self):
        self.prog = {"A": {"estado": "descartada"}, "B": {"estado": "no_aplica"}, "C": {"estado": "informe"},
                     "E": {"estado": "commit"}, "F": {"estado": "no-aplica"}}
        self.colas = {k: {"id": k, "titulo": k} for k in ("A", "B", "C", "D", "E", "F")}
        self.antes = (D.progreso, D._tareas_de_colas, D.prioridad_logica.ordenar, D.OLAS)
        D.progreso = lambda: self.prog
        D._tareas_de_colas = lambda: self.colas
        D.prioridad_logica.ordenar = lambda pend, p, ahora: ([t["id"] for t in pend], [])

    def tearDown(self):
        D.progreso, D._tareas_de_colas, D.prioridad_logica.ordenar, D.OLAS = self.antes

    def test_calcular_orden_deja_solo_lo_pendiente(self):
        listas, _ = D.calcular_orden()
        self.assertEqual(listas, ["D"])

    def test_pendientes_totales_no_cuenta_cerradas(self):
        with tempfile.TemporaryDirectory() as tmp:
            with open(os.path.join(tmp, "cola-x.json"), "w", encoding="utf-8") as fh:
                json.dump(list(self.colas.values()), fh)
            D.OLAS = tmp
            self.assertEqual(D.pendientes_totales(), 1)


if __name__ == "__main__":
    unittest.main()
