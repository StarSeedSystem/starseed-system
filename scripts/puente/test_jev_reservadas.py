"""Pruebas de las decisiones reservadas a una persona."""

import os
import sys
import unittest

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
if DIRECTORIO not in sys.path:
    sys.path.insert(0, DIRECTORIO)

import jev_reservadas as JR  # noqa: E402

ESPERADAS = (
    "integrar-main",
    "publicar",
    "push",
    "desplegar",
    "borrar-datos",
    "bajar-privacidad",
    "gasto-sobre-techo",
    "claves-permisos",
    "migraciones",
    "funciona-verificacion",
    "informe-veraz",
    "cambiar-umbrales-propios",
)

DOMINIO_NORMAL = "ordenar-tareas"


class DecisionesReservadas(unittest.TestCase):
    def test_cada_reservada_exige_humano(self):
        self.assertIsInstance(JR.RESERVADAS, tuple)
        self.assertEqual(set(JR.RESERVADAS), set(ESPERADAS))
        for dominio in JR.RESERVADAS:
            with self.subTest(dominio=dominio):
                self.assertTrue(JR.exige_humano(dominio))

    def test_un_dominio_normal_no_exige_humano(self):
        self.assertFalse(JR.exige_humano(DOMINIO_NORMAL))

    def test_normaliza_mayusculas_guiones_y_espacios(self):
        variantes = (
            "INTEGRAR-MAIN",
            "Integrar-Main",
            "integrar main",
            "Integrar Main",
            "  integrar   main  ",
        )
        for dominio in variantes:
            with self.subTest(dominio=dominio):
                self.assertTrue(JR.exige_humano(dominio))

    def test_un_dominio_desconocido_no_exige_humano(self):
        self.assertFalse(JR.exige_humano("dominio-inventado"))

    def test_la_lista_no_tiene_duplicados(self):
        self.assertEqual(len(JR.RESERVADAS), len(set(JR.RESERVADAS)))

    def test_solo_puede_vetar_es_alias_de_exige_humano(self):
        for dominio in JR.RESERVADAS:
            with self.subTest(dominio=dominio):
                self.assertTrue(JR.solo_puede_vetar(dominio))
        self.assertFalse(JR.solo_puede_vetar(DOMINIO_NORMAL))


if __name__ == "__main__":
    unittest.main()
