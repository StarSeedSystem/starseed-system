"""Alcance parcial: lo verde se integra, lo que falta sale como seguimiento.

Anoche (2026-09-20) el desatascador tiró tres ramas con las cuatro puertas en
verde y la revisión sin pegas, solo porque el agente no había tocado todos los
archivos declarados: NE1c (3672 s, faltaba 1 de 3), R6b (2920 s, faltaban 2 de
6) y R7b (2882 s, faltaban 4 de 9). Estas pruebas fijan que eso no vuelve a
pasar, y que lo que SÍ se rechaza se sigue rechazando.
"""

import importlib.util
import os
import sys
import unittest

_spec = importlib.util.spec_from_file_location(
    "desatascar_mod", os.path.join(os.path.dirname(os.path.abspath(__file__)), "desatascar.py")
)
D = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(D)

AHORA = 1_000_000.0


def _parada(minutos, **extra):
    e = {"estado": "esperando_aprobacion", "t": AHORA - minutos * 60}
    e.update(extra)
    return e


class TestClasificarPuertas(unittest.TestCase):
    def test_revision_bloqueante_se_rechaza(self):
        prog = {"X1": _parada(10, revisor="bloqueante")}
        rech, aprob = D.clasificar_puertas(prog, AHORA, {"X1": ["a.ts"]})
        self.assertEqual([t for t, _ in rech], ["X1"])
        self.assertEqual(aprob, [])

    def test_ne1c_falta_uno_de_tres_se_integra(self):
        prog = {
            "NE1c": _parada(
                60, revisor="respondio", faltan=["src/components/mando/centro-mando.tsx"]
            )
        }
        declarados = {
            "NE1c": [
                "src/app/api/mando/neuronas/route.ts",
                "src/app/api/mando/medidores/route.ts",
                "src/components/mando/centro-mando.tsx",
            ]
        }
        rech, aprob = D.clasificar_puertas(prog, AHORA, declarados)
        self.assertEqual(rech, [])
        self.assertEqual([t for t, _, _ in aprob], ["NE1c"])
        self.assertIn("2 de 3", aprob[0][1])

    def test_no_toco_ninguno_se_rechaza(self):
        prog = {"Z9": _parada(10, revisor="respondio", faltan=["a.ts", "b.ts"])}
        rech, aprob = D.clasificar_puertas(prog, AHORA, {"Z9": ["a.ts", "b.ts"]})
        self.assertEqual([t for t, _ in rech], ["Z9"])
        self.assertEqual(aprob, [])

    def test_sin_saber_los_declarados_no_se_tira_el_trabajo(self):
        """Ante la duda, integrar lo verde: rehacerlo cuesta una hora de agente."""
        prog = {"Q1": _parada(10, revisor="respondio", faltan=["a.ts"])}
        rech, aprob = D.clasificar_puertas(prog, AHORA, {})
        self.assertEqual(rech, [])
        self.assertEqual([t for t, _, _ in aprob], ["Q1"])

    def test_verde_y_completa_no_se_toca(self):
        prog = {"V1": _parada(120, revisor="respondio")}
        rech, aprob = D.clasificar_puertas(prog, AHORA, {"V1": ["a.ts"]})
        self.assertEqual((rech, aprob), ([], []))

    def test_antes_del_tope_no_se_toca(self):
        prog = {"T1": _parada(2, revisor="bloqueante")}
        self.assertEqual(D.clasificar_puertas(prog, AHORA, {})[0], [])

    def test_puertas_a_rechazar_sigue_funcionando(self):
        """La firma vieja no se rompe: el vigilante la sigue llamando."""
        prog = {"X1": _parada(10, revisor="bloqueante")}
        self.assertEqual([t for t, _ in D.puertas_a_rechazar(prog, AHORA)], ["X1"])


class TestSeguimiento(unittest.TestCase):
    def test_lleva_solo_los_archivos_que_faltan(self):
        tarea = {
            "id": "R6b",
            "ola": "Ola 227",
            "titulo": "Voz del rito = voz neural",
            "archivos": ["a.ts", "b.ts", "c.tsx", "d.tsx"],
            "prompt": "encargo largo original",
        }
        seg = D.seguimiento_de("R6b", {"sha": "7be3b6b1bf83"}, tarea, ["c.tsx", "d.tsx"])
        self.assertEqual(seg["id"], "R6bs")
        self.assertEqual(seg["archivos"], ["c.tsx", "d.tsx"])
        self.assertIn("SEGUIMIENTO de R6b", seg["prompt"])
        self.assertIn("7be3b6b1bf83", seg["prompt"])
        self.assertIn("encargo largo original", seg["prompt"])
        self.assertEqual(seg["depende_de"], [])
        self.assertEqual(seg["ola"], "Ola 227")

    def test_sin_prompt_original_tambien_sale(self):
        seg = D.seguimiento_de("K1", {}, {"id": "K1", "titulo": "T"}, ["x.ts"])
        self.assertEqual(seg["archivos"], ["x.ts"])
        self.assertIn("x.ts", seg["prompt"])


class TestAprobarConSeguimiento(unittest.TestCase):
    def test_no_encola_si_la_aprobacion_falla(self):
        import tempfile

        with tempfile.TemporaryDirectory() as olas:
            frases = D.aprobar_con_seguimiento(
                [("A1", "alcance parcial", ["x.ts"])],
                progreso={"A1": {}},
                tareas={"A1": {"id": "A1", "archivos": ["x.ts", "y.ts"]}},
                binario="/bin/false",
                olas=olas,
            )
            self.assertTrue(any("no pude aprobar" in f for f in frases))
            self.assertFalse(os.path.exists(os.path.join(olas, "cola-seguimientos.json")))

    def test_encola_cuando_la_aprobacion_sale_bien(self):
        import json
        import tempfile

        with tempfile.TemporaryDirectory() as olas:
            frases = D.aprobar_con_seguimiento(
                [("A1", "alcance parcial", ["y.ts"])],
                progreso={"A1": {"sha": "abc123"}},
                tareas={"A1": {"id": "A1", "titulo": "T", "archivos": ["x.ts", "y.ts"]}},
                binario="/usr/bin/true",
                olas=olas,
            )
            self.assertTrue(any("integro A1" in f for f in frases))
            ruta = os.path.join(olas, "cola-seguimientos.json")
            with open(ruta, encoding="utf-8") as fh:
                datos = json.load(fh)
            self.assertEqual([t["id"] for t in datos], ["A1s"])
            self.assertEqual(datos[0]["archivos"], ["y.ts"])

    def test_no_duplica_un_seguimiento_ya_encolado(self):
        import json
        import tempfile

        with tempfile.TemporaryDirectory() as olas:
            args = dict(
                progreso={"A1": {}},
                tareas={"A1": {"id": "A1", "archivos": ["x.ts", "y.ts"]}},
                binario="/usr/bin/true",
                olas=olas,
            )
            D.aprobar_con_seguimiento([("A1", "m", ["y.ts"])], **args)
            D.aprobar_con_seguimiento([("A1", "m", ["y.ts"])], **args)
            with open(os.path.join(olas, "cola-seguimientos.json"), encoding="utf-8") as fh:
                datos = json.load(fh)
            self.assertEqual(len(datos), 1)


if __name__ == "__main__":
    unittest.main()
