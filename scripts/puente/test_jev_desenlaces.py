"""Pruebas de jev_desenlaces: desenlace_de y etiqueta_de.

- Una prueba por cada fuente de verdad.
- Opinión de Jev sola → "debil".
- Fila vacía → "sin_dato".
"""

import sys
import unittest

sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__file__)))

import jev_desenlaces as desenlaces


class TestDesenlaceDe(unittest.TestCase):
    """desenlace_de(fila) -> {"verdad": True|False|None, "fuente": str}"""

    def test_correccion_alex_verdadera(self):
        fila = {"corregida_por": "alex", "resultado_alex": "si"}
        self.assertEqual(desenlaces.desenlace_de(fila), {"verdad": True, "fuente": "correccion_alex"})

    def test_correccion_alex_falsa(self):
        fila = {"corregida_por": "alex", "verdad": "no"}
        self.assertEqual(desenlaces.desenlace_de(fila), {"verdad": False, "fuente": "correccion_alex"})

    def test_publicacion_despliegue_verde(self):
        fila = {"despliegue": "verde"}
        self.assertEqual(desenlaces.desenlace_de(fila), {"verdad": True, "fuente": "publicacion"})

    def test_publicacion_despliegue_rojo(self):
        fila = {"deployment": "rojo"}
        self.assertEqual(desenlaces.desenlace_de(fila), {"verdad": False, "fuente": "publicacion"})

    def test_aprobacion_sha_integrado(self):
        fila = {"aprobacion_sha": "abc123"}
        self.assertEqual(desenlaces.desenlace_de(fila), {"verdad": True, "fuente": "aprobacion"})

    def test_aprobacion_sha_revertido(self):
        fila = {"sha_revertido": "def456"}
        self.assertEqual(desenlaces.desenlace_de(fila), {"verdad": False, "fuente": "aprobacion"})

    def test_tarea_integrada(self):
        fila = {"estado_tarea": "integrada"}
        self.assertEqual(desenlaces.desenlace_de(fila), {"verdad": True, "fuente": "tarea_integrada"})

    def test_tarea_revertida(self):
        fila = {"progreso_estado": "revertida"}
        self.assertEqual(desenlaces.desenlace_de(fila), {"verdad": False, "fuente": "tarea_revertida"})

    def test_veredicto_bloqueada_acierto(self):
        fila = {"veredicto": "reintentar", "resultado_veredicto": "acierto"}
        self.assertEqual(desenlaces.desenlace_de(fila), {"verdad": True, "fuente": "veredicto_bloqueada"})

    def test_veredicto_bloqueada_fallo(self):
        fila = {"bloqueada_resultado": "fallo"}
        self.assertEqual(desenlaces.desenlace_de(fila), {"verdad": False, "fuente": "veredicto_bloqueada"})

    def test_sin_dato_devuelve_none(self):
        fila = {}
        self.assertEqual(desenlaces.desenlace_de(fila), {"verdad": None, "fuente": ""})

    def test_fila_none_devuelve_none(self):
        self.assertEqual(desenlaces.desenlace_de(None), {"verdad": None, "fuente": ""})

    def test_fila_no_dict_devuelve_none(self):
        self.assertEqual(desenlaces.desenlace_de("no es dict"), {"verdad": None, "fuente": ""})

    def test_opinion_jev_no_es_desenlace(self):
        fila = {"capa": "jev", "confianza": 0.8, "respuesta": "si"}
        self.assertEqual(desenlaces.desenlace_de(fila), {"verdad": None, "fuente": ""})


class TestEtiquetaDe(unittest.TestCase):
    """etiqueta_de(exp, desenlace) -> "verdad" | "debil" | "sin_dato\""""

    def test_con_desenlace_real_verdad(self):
        exp = {"capa": "jev", "id": "exp1"}
        des = {"verdad": True, "fuente": "publicacion"}
        self.assertEqual(desenlaces.etiqueta_de(exp, des), "verdad")

    def test_con_desenlace_real_falso(self):
        exp = {"capa": "regla", "id": "exp2"}
        des = {"verdad": False, "fuente": "tarea_revertida"}
        self.assertEqual(desenlaces.etiqueta_de(exp, des), "verdad")

    def test_opinion_jev_sola_debil(self):
        exp = {"capa": "jev", "confianza": 0.75, "respuesta": "si"}
        des = {"verdad": None, "fuente": ""}
        self.assertEqual(desenlaces.etiqueta_de(exp, des), "debil")

    def test_otra_capa_sin_desenlace_sin_dato(self):
        exp = {"capa": "regla", "id": "exp3"}
        des = {"verdad": None, "fuente": ""}
        self.assertEqual(desenlaces.etiqueta_de(exp, des), "sin_dato")

    def test_experiencia_vacia_sin_dato(self):
        exp = {}
        des = {"verdad": None, "fuente": ""}
        self.assertEqual(desenlaces.etiqueta_de(exp, des), "sin_dato")

    def test_experiencia_none_sin_dato(self):
        exp = None
        des = {"verdad": None, "fuente": ""}
        self.assertEqual(desenlaces.etiqueta_de(exp, des), "sin_dato")

    def test_desenlace_none_como_sin_fuente(self):
        exp = {"capa": "jev"}
        des = None
        self.assertEqual(desenlaces.etiqueta_de(exp, des), "sin_dato")


if __name__ == "__main__":
    unittest.main()