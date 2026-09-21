# -*- coding: utf-8 -*-
"""«¿Hizo la tarea que se le pidio?» — la comprobacion mas barata que tenemos.

Nace de NE1b (2026-09-20): su encargo decia «NO reescribas el modulo, CABLEALO» y
nombraba tres archivos; entrego una reescritura del modulo que ya existia y se integro
con «revision ok». La revision lee el diff que le dan; no sabe que se habia pedido.
"""
import importlib.util
import os
import unittest

_ruta = os.path.join(os.path.dirname(os.path.abspath(__file__)), "starseed-enjambre.py")
_spec = importlib.util.spec_from_file_location("starseed_enjambre", _ruta)
E = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(E)
f = E.archivos_declarados_sin_tocar


class ArchivosDeclarados(unittest.TestCase):
    def test_sin_declarados_no_se_exige_nada(self):
        self.assertEqual([], f([], ["lo/que/sea.ts"]))
        self.assertEqual([], f(None, []))

    def test_todos_tocados(self):
        self.assertEqual([], f(["a/b.ts", "c/d.ts"], ["a/b.ts", "c/d.ts", "extra.ts"]))

    def test_el_caso_NE1b_ninguno_tocado(self):
        declarados = [
            "src/app/api/mando/neuronas/route.ts",
            "src/components/mando/centro-mando.tsx",
            "src/lib/mando/__tests__/neuronas-ruta.test.ts",
        ]
        tocados = ["src/lib/mando/neuronas.ts", "src/lib/mando/__tests__/neuronas.test.ts"]
        self.assertEqual(declarados, f(declarados, tocados))

    def test_uno_de_tres_basta_para_no_bloquear(self):
        # La puerta solo tumba cuando no toco NINGUNO: un agente puede resolverlo en
        # menos archivos de los previstos y eso no es motivo para rechazarlo.
        declarados = ["a.ts", "b.ts", "c.ts"]
        self.assertEqual(["b.ts", "c.ts"], f(declarados, ["a.ts"]))

    def test_rutas_con_punto_barra_y_espacios(self):
        self.assertEqual([], f([" ./a/b.ts "], ["a/b.ts"]))

    def test_no_confunde_un_prefijo_con_el_archivo(self):
        self.assertEqual(["src/lib/mando/neuronas-ruta.ts"],
                         f(["src/lib/mando/neuronas-ruta.ts"], ["src/lib/mando/neuronas.ts"]))


if __name__ == "__main__":
    unittest.main()
