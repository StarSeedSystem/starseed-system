#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Puertas de limite_proveedor: los números salen de los logs de la ola 323, no de la cabeza."""
import os, sys, unittest

sys.path.insert(0, os.path.dirname(__file__))
from limite_proveedor import (
    CARACTERES_POR_TOKEN,
    TOPE_POR_DEFECTO,
    cabe,
    estimar_tokens,
    filtrar_por_tamano,
    proveedor_de,
    tope_de,
)

GROQ = "groq/openai/gpt-oss-120b"
NIM = "nvidia/moonshotai/kimi-k3"
XKIRO = "xkiro/qwen/qwen3-coder-plus:free"


class Proveedor(unittest.TestCase):
    def test_parte_por_la_primera_barra(self):
        self.assertEqual(proveedor_de(GROQ), "groq")
        self.assertEqual(proveedor_de("suelto"), "suelto")

    def test_groq_tiene_tope_bajo_y_los_demas_el_de_por_defecto(self):
        self.assertEqual(tope_de(GROQ), 7000)
        self.assertEqual(tope_de(NIM), TOPE_POR_DEFECTO)


class Estimacion(unittest.TestCase):
    def test_texto_vacio_son_cero_tokens(self):
        self.assertEqual(estimar_tokens(""), 0)
        self.assertEqual(estimar_tokens(None), 0)

    def test_la_estimacion_es_pesimista_no_optimista(self):
        """Mejor apartar un modelo de más que recibir «Request too large»."""
        texto = "x" * 30000
        self.assertGreaterEqual(estimar_tokens(texto), 30000 // 4)
        self.assertEqual(estimar_tokens(texto), 30000 // CARACTERES_POR_TOKEN + 1)


class Cabe(unittest.TestCase):
    def test_el_caso_real_de_p323A_no_cabe_en_groq(self):
        """Del log: «Limit 8000, Requested 19596». Con 19596 tokens, groq queda fuera."""
        self.assertFalse(cabe(GROQ, 19596))

    def test_el_mismo_prompt_si_cabe_en_las_demas(self):
        self.assertTrue(cabe(NIM, 19596))
        self.assertTrue(cabe(XKIRO, 22381))

    def test_un_prompt_pequeno_cabe_en_groq(self):
        self.assertTrue(cabe(GROQ, 3000))


class Filtrado(unittest.TestCase):
    def test_aparta_groq_y_deja_el_resto(self):
        viables, apartados = filtrar_por_tamano([GROQ, NIM, XKIRO], 19596)
        self.assertEqual(viables, [NIM, XKIRO])
        self.assertEqual([m for m, _ in apartados], [GROQ])

    def test_el_motivo_dice_los_dos_numeros(self):
        _, apartados = filtrar_por_tamano([GROQ], 19596)
        # Con un solo modelo entra la salvaguarda, así que se prueba con otro al lado.
        _, apartados = filtrar_por_tamano([GROQ, NIM], 19596)
        motivo = apartados[0][1]
        self.assertIn("7000", motivo)
        self.assertIn("19596", motivo)

    def test_con_prompt_pequeno_no_aparta_a_nadie(self):
        viables, apartados = filtrar_por_tamano([GROQ, NIM], 2000)
        self.assertEqual(viables, [GROQ, NIM])
        self.assertEqual(apartados, [])

    def test_si_no_cabe_en_ninguno_se_devuelven_todos(self):
        """Quedarse sin rotación es peor que un rechazo del proveedor: que lo intente."""
        viables, apartados = filtrar_por_tamano([GROQ], 19596)
        self.assertEqual(viables, [GROQ])
        self.assertEqual(apartados, [])

    def test_lista_vacia_no_revienta(self):
        self.assertEqual(filtrar_por_tamano([], 5000), ([], []))

    def test_se_conserva_el_orden_de_la_rotacion(self):
        viables, _ = filtrar_por_tamano([XKIRO, GROQ, NIM], 19596)
        self.assertEqual(viables, [XKIRO, NIM])


if __name__ == "__main__":
    unittest.main()
