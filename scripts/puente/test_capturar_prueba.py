# -*- coding: utf-8 -*-
"""Tests puros de la captura de prueba (unittest, sin red ni Chrome)."""

import unittest

from capturar_prueba import (
    hace_falta_captura,
    nombre_captura,
    rutas_de_archivos,
)


class TestRutasDeArchivos(unittest.TestCase):
    def test_pagina_de_grupo_de_ruta(self):
        self.assertEqual(
            rutas_de_archivos(["src/app/(app)/mando/page.tsx"]), ["/mando"]
        )

    def test_pagina_de_otro_grupo(self):
        self.assertEqual(
            rutas_de_archivos(["src/app/(main)/escritorios/page.tsx"]),
            ["/escritorios"],
        )

    def test_pagina_sin_grupo(self):
        self.assertEqual(rutas_de_archivos(["src/app/network/page.tsx"]), ["/network"])

    def test_componente_del_mando(self):
        self.assertEqual(
            rutas_de_archivos(["src/components/mando/chat-orquestacion.tsx"]),
            ["/mando"],
        )

    def test_componente_ajeno_no_da_ruta(self):
        self.assertEqual(rutas_de_archivos(["src/components/common/boton.tsx"]), [])

    def test_no_pagina_no_da_ruta(self):
        self.assertEqual(rutas_de_archivos(["src/lib/mando/colas.ts"]), [])

    def test_dinamica_no_da_ruta_concreta(self):
        self.assertEqual(rutas_de_archivos(["src/app/(app)/post/[id]/page.tsx"]), [])

    def test_sin_duplicados_y_en_orden(self):
        archivos = [
            "src/app/(app)/mando/page.tsx",
            "src/components/mando/asistente-mando.tsx",
            "src/app/(app)/mando/page.tsx",
        ]
        self.assertEqual(rutas_de_archivos(archivos), ["/mando"])

    def test_varias_rutas_distintas(self):
        archivos = [
            "src/app/(app)/mando/page.tsx",
            "src/app/(main)/escritorios/page.tsx",
        ]
        self.assertEqual(rutas_de_archivos(archivos), ["/mando", "/escritorios"])

    def test_none_y_vacio(self):
        self.assertEqual(rutas_de_archivos(None), [])
        self.assertEqual(rutas_de_archivos([]), [])


class TestNombreCaptura(unittest.TestCase):
    def test_sin_barras(self):
        self.assertEqual(nombre_captura("p323E", "/mando"), "p323e-mando")

    def test_sin_acentos(self):
        self.assertEqual(nombre_captura("zW8", "/crear"), "zw8-crear")

    def test_varias_rutas_distintas_de_la_misma_tarea(self):
        self.assertNotEqual(nombre_captura("pA", "/uno"), nombre_captura("pA", "/dos"))

    def test_quita_espacios_y_raro(self):
        self.assertEqual(nombre_captura("p323E", "/red-3d"), "p323e-red-3d")


class TestHaceFaltaCaptura(unittest.TestCase):
    def test_integrada_con_algo_visible(self):
        self.assertTrue(hace_falta_captura("commit", ["src/app/(app)/mando/page.tsx"]))

    def test_integrada_sin_algo_visible(self):
        self.assertFalse(hace_falta_captura("commit", ["src/lib/mando/colas.ts"]))

    def test_no_integrada(self):
        for estado in ("fallo", "en_curso", "pendiente", "esperando_aprobacion"):
            self.assertFalse(
                hace_falta_captura(estado, ["src/app/(app)/mando/page.tsx"])
            )

    def test_sin_archivos(self):
        self.assertFalse(hace_falta_captura("commit", []))

    def test_estado_desconocido(self):
        self.assertFalse(
            hace_falta_captura("otra_cosa", ["src/app/(app)/mando/page.tsx"])
        )


if __name__ == "__main__":
    unittest.main()
