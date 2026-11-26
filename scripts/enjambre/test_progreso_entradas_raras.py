# -*- coding: utf-8 -*-
"""Prueba que cargar/fundir/guardar el progreso ignoren entradas que no sean diccionario."""
import importlib.util
import os
import sys
import unittest


RUTA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "starseed-enjambre.py")
ESPEC = importlib.util.spec_from_file_location("enjambre_progreso", RUTA)
enjambre = importlib.util.module_from_spec(ESPEC)
sys.modules["enjambre_progreso"] = enjambre
ESPEC.loader.exec_module(enjambre)


class ProgresoEntradasRarasTest(unittest.TestCase):
    def test_cargar_prog_con_lista_no_tumba(self):
        """cargar_prog debe ignorar una lista en disco y retornar {} para esa entrada."""
        import json
        from unittest import mock

        dir_t = __import__("tempfile").mkdtemp()
        json_path = os.path.join(dir_t, "progreso.json")
        with open(json_path, "w", encoding="utf-8") as f:
            json.dump({"T1": ["lista", "no", "dict"]}, f)

        with mock.patch.object(enjambre, "PROG_JSON", json_path), \
             mock.patch.object(enjambre, "PROG_MD", os.path.join(dir_t, "progreso.md")):
            resultado = enjambre.cargar_prog()
            self.assertEqual({}, resultado)

    def test_cargar_prog_con_numero_no_tumba(self):
        """cargar_prog debe ignorar un número en disco y retornar {} para esa entrada."""
        import json
        from unittest import mock

        dir_t = __import__("tempfile").mkdtemp()
        json_path = os.path.join(dir_t, "progreso.json")
        with open(json_path, "w", encoding="utf-8") as f:
            json.dump({"T1": 42}, f)

        with mock.patch.object(enjambre, "PROG_JSON", json_path), \
             mock.patch.object(enjambre, "PROG_MD", os.path.join(dir_t, "progreso.md")):
            resultado = enjambre.cargar_prog()
            self.assertEqual({}, resultado)

    def test_fusionar_progreso_ignora_no_dict(self):
        """fusionar_progreso debe saltar entradas no-dict del disco."""
        memoria = {"T1": {"estado": "en_curso"}}
        disco = {"T1": {"estado": "commit"}, "T2": "lista_no_diccionario"}
        fundido = enjambre.fusionar_progreso(memoria, disco, set())
        self.assertEqual(fundido["T1"], {"estado": "commit"})
        self.assertNotIn("T2", fundido)

    def test_guardar_prog_con_lista_ignora_entrada(self):
        """guardar_prog debe ignorar (no romper) cuando prog tiene una lista."""
        import json
        from unittest import mock

        dir_t = __import__("tempfile").mkdtemp()
        json_path = os.path.join(dir_t, "progreso.json")
        md_path = os.path.join(dir_t, "progreso.md")
        with open(json_path, "w", encoding="utf-8") as f:
            json.dump({"T1": {"estado": "en_curso"}, "T2": ["lista"]}, f)

        with mock.patch.object(enjambre, "PROG_JSON", json_path), \
             mock.patch.object(enjambre, "PROG_MD", md_path), \
             mock.patch.object(enjambre, "MIAS", set()):
            # Esto no debe lanzar AttributeError
            resultado = enjambre.guardar_prog({"T1": {"estado": "revisando"}, "T2": ["lista"]})
            self.assertTrue(resultado)
            with open(json_path, encoding="utf-8") as f:
                datos = json.load(f)
            self.assertEqual(datos, {"T1": {"estado": "revisando"}})
            self.assertNotIn("T2", datos)

    def test_guardar_prog_con_numero_ignora_entrada(self):
        """guardar_prog debe ignorar (no romper) cuando prog tiene un número."""
        import json
        from unittest import mock

        dir_t = __import__("tempfile").mkdtemp()
        json_path = os.path.join(dir_t, "progreso.json")
        md_path = os.path.join(dir_t, "progreso.md")
        with open(json_path, "w", encoding="utf-8") as f:
            json.dump({"T1": {"estado": "en_curso"}, "T2": 42}, f)

        with mock.patch.object(enjambre, "PROG_JSON", json_path), \
             mock.patch.object(enjambre, "PROG_MD", md_path), \
             mock.patch.object(enjambre, "MIAS", set()):
            # Esto no debe lanzar AttributeError
            resultado = enjambre.guardar_prog({"T1": {"estado": "revisando"}, "T2": 42})
            self.assertTrue(resultado)
            with open(json_path, encoding="utf-8") as f:
                datos = json.load(f)
            self.assertEqual(datos, {"T1": {"estado": "revisando"}})


if __name__ == "__main__":
    unittest.main()