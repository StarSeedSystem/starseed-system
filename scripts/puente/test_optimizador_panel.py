# -*- coding: utf-8 -*-
"""test_optimizador_panel · pruebas puras del panel de modelos (§7).

Unittest con dobles simples: `llamar` falso inyectado, sin red ni archivos.
Casos del contrato: JSON roto se ignora; dos modelos que proponen lo mismo suman
votos; el tope diario se respeta; los pesos se mueven en el sentido correcto y
no salen del rango [0.05, 1].
"""

import importlib.util
import os
import sys
import unittest

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
if DIRECTORIO not in sys.path:
    sys.path.insert(0, DIRECTORIO)

_ruta_mod = os.path.join(DIRECTORIO, "optimizador_panel.py")
_spec = importlib.util.spec_from_file_location("optimizador_panel", _ruta_mod)
_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_mod)


PROPUESTA_A = (
    '{"propuestas": [{"area": "enrutamiento", "titulo": "Subir peso a m2", '
    '"por_que": "integra el doble", "archivos": ["rotacion.py"], '
    '"prompt": "Sube m2 en la rotación."}]}'
)
PROPUESTA_B = (
    '{"propuestas": [{"area": "habilidades", "titulo": "Pulir skill tests", '
    '"por_que": "fallan dos de cada tres", "archivos": ["skill.md"], '
    '"prompt": "Arregla la skill de tests."}]}'
)


class AzarFijo:
    """Doble de `random`: siempre por debajo o por encima del umbral."""

    def __init__(self, valor=0.99):
        self.valor = valor

    def random(self):
        return self.valor

    def choice(self, seq):
        return seq[0]


class ElegirPanelTest(unittest.TestCase):
    def test_elige_los_de_mejor_peso(self):
        pesos = {"m1": {"peso": 0.9}, "m2": {"peso": 0.8}, "m3": {"peso": 0.2}}
        salida = _mod.elegir_panel(pesos, ["m1", "m2", "m3"], k=2, azar=AzarFijo())
        self.assertEqual(salida, ["m1", "m2"])

    def test_exploracion_elige_al_azar(self):
        pesos = {"m1": {"peso": 0.9}, "m2": {"peso": 0.8}}
        # random() < exploración → elige al azar; nuestro doble devuelve el primero.
        salida = _mod.elegir_panel(pesos, ["m1", "m2", "m3"], k=1, azar=AzarFijo(0.0))
        self.assertEqual(salida, ["m1"])

    def test_k_cero_no_elige_nada(self):
        salida = _mod.elegir_panel({"m1": {"peso": 0.9}}, ["m1"], k=0, azar=AzarFijo())
        self.assertEqual(salida, [])

    def test_no_repite_y_respeta_utiles(self):
        salida = _mod.elegir_panel({}, ["m1", "m2"], k=5, azar=AzarFijo())
        self.assertEqual(sorted(salida), ["m1", "m2"])


class PedirPropuestasTest(unittest.TestCase):
    def test_json_roto_se_ignora(self):
        def llamar(modelo, prompt):
            return "esto no es JSON {{{"
        salida = _mod.pedir_propuestas(["m1"], "resumen", llamar)
        self.assertEqual(salida, [])

    def test_descarta_area_desconocida_muchos_archivos_y_sin_prompt(self):
        def llamar(modelo, prompt):
            return (
                '{"propuestas": ['
                '{"area": "magia", "titulo": X, "archivos": ["a.py"], "prompt": "p"},'
                '{"area": "capacidad", "titulo": "t", "archivos": ["a", "b", "c", "d"], "prompt": "p"},'
                '{"area": "capacidad", "titulo": "t", "archivos": ["a"], "prompt": ""}'
                ']}'
            ).replace("X", '"x"')
        self.assertEqual(_mod.pedir_propuestas(["m1"], "r", llamar), [])

    def test_propuesta_buena_sale_con_su_modelo(self):
        salida = _mod.pedir_propuestas(["m1"], "r", lambda m, p: PROPUESTA_B)
        self.assertEqual(len(salida), 1)
        self.assertEqual(salida[0]["modelos"], ["m1"])
        self.assertEqual(salida[0]["area"], "habilidades")

    def test_llamar_que_lanza_no_tumba_el_panel(self):
        def llamar(modelo, prompt):
            raise RuntimeError("pasarela colgada")
        self.assertEqual(_mod.pedir_propuestas(["m1"], "r", llamar), [])


class FusionarTest(unittest.TestCase):
    def test_dos_modelos_proponiendo_lo_mismo_suman_votos(self):
        def llamar(modelo, prompt):
            return PROPUESTA_A
        propuestas = _mod.pedir_propuestas(["m1", "m2"], "r", llamar)
        fusionadas = _mod.fusionar(propuestas)
        self.assertEqual(len(fusionadas), 1)
        self.assertEqual(fusionadas[0]["votos"], 2)
        self.assertEqual(fusionadas[0]["modelos"], ["m1", "m2"])

    def test_vacia_devuelve_vacia(self):
        self.assertEqual(_mod.fusionar([]), [])

    def test_distintas_no_se_fusionan(self):
        def llamar(modelo, prompt):
            return PROPUESTA_A if modelo == "m1" else PROPUESTA_B
        fusionadas = _mod.fusionar(_mod.pedir_propuestas(["m1", "m2"], "r", llamar))
        self.assertEqual(len(fusionadas), 2)


class ATareasTest(unittest.TestCase):
    def _propuestas(self, n):
        return [{
            "area": "capacidad",
            "titulo": f"Propuesta {i}",
            "por_que": "p",
            "archivos": ["a.py"],
            "prompt": "Haz la mejora.",
        } for i in range(n)]

    def test_ids_ola_y_reglas_de_la_casa(self):
        tareas = _mod.a_tareas(self._propuestas(2), "20261005", ya_hoy=0)
        self.assertEqual([t["id"] for t in tareas], ["OPZ1005-1", "OPZ1005-2"])
        self.assertTrue(all(t["ola"] == "Optimizador 20261005" for t in tareas))
        self.assertTrue(all(t["estado"] == "pendiente" for t in tareas))
        self.assertIn("el silencio no es aprobación", tareas[0]["prompt"])
        self.assertTrue(tareas[0]["prompt"].startswith("Haz la mejora."))

    def test_tope_diario_se_respeta(self):
        tareas = _mod.a_tareas(self._propuestas(10), "20261005", ya_hoy=4, max_tareas_dia=6)
        self.assertEqual(len(tareas), 2)
        self.assertEqual(tareas[0]["id"], "OPZ1005-5")

    def test_dia_completo_no_propone_nada(self):
        self.assertEqual(_mod.a_tareas(self._propuestas(3), "20261005", ya_hoy=6), [])


class ActualizarPesosTest(unittest.TestCase):
    def test_integrada_y_confirmada_suben_rechazada_baja(self):
        pesos = {"m1": {"peso": 0.5}, "m2": {"peso": 0.5}, "m3": {"peso": 0.5}}
        salida = _mod.actualizar_pesos(pesos, [
            {"modelos": ["m1"], "resultado": "integrada"},
            {"modelos": ["m2"], "resultado": "confirmada"},
            {"modelos": ["m3"], "resultado": "rechazada"},
        ])
        self.assertGreater(salida["m1"]["peso"], 0.5)
        self.assertGreater(salida["m2"]["peso"], 0.5)
        self.assertLess(salida["m3"]["peso"], 0.5)
        self.assertEqual(salida["m1"]["integradas"], 1)
        self.assertEqual(salida["m2"]["confirmadas"], 1)

    def test_no_sale_del_rango(self):
        pesos = {"m1": {"peso": 0.99}, "m2": {"peso": 0.06}}
        salida = _mod.actualizar_pesos(pesos, [
            {"modelos": ["m1"], "resultado": "integrada"},
            {"modelos": ["m2"], "resultado": "rechazada"},
        ])
        self.assertLessEqual(salida["m1"]["peso"], 1.0)
        self.assertGreaterEqual(salida["m2"]["peso"], 0.05)

    def test_no_muta_la_entrada_y_crea_modelo_nuevo(self):
        pesos = {}
        salida = _mod.actualizar_pesos(pesos, [
            {"modelos": ["nuevo"], "resultado": "integrada"},
        ])
        self.assertEqual(pesos, {})
        self.assertEqual(salida["nuevo"]["peso"], 0.6)


class LlamarModeloRealTest(unittest.TestCase):
    def test_sin_clave_no_llama_a_la_red(self):
        entorno_viejo = os.environ.pop("OPTIMIZADOR_API_KEY", None)
        os.environ.pop("OPENROUTER_API_KEY", None)
        try:
            self.assertIsNone(_mod.llamar_modelo_real("m1", "hola"))
        finally:
            if entorno_viejo is not None:
                os.environ["OPTIMIZADOR_API_KEY"] = entorno_viejo


if __name__ == "__main__":
    unittest.main(verbosity=2)
