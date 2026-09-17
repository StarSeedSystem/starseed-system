"""Pruebas de cableado_ts: el caso PR2, que pasó todas las puertas sin servir para nada."""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from cableado_ts import aviso, es_prueba, exportados_nuevos, sin_cablear

DIFF_PR2 = """--- a/src/lib/mando/medidores.ts
+++ b/src/lib/mando/medidores.ts
@@
+const ETAPAS_CAMINO = ["escribiendo", "verificando"] as const;
+export function avanceCombinado(datos: DatosAvance): number {
+  return 0;
+}
"""


class TestExportadosNuevos(unittest.TestCase):
    def test_el_caso_pr2(self):
        self.assertEqual(exportados_nuevos(DIFF_PR2), ["avanceCombinado"])

    def test_no_cuenta_lo_que_no_se_exporta(self):
        # ETAPAS_CAMINO es const sin export: no es superficie pública.
        self.assertNotIn("ETAPAS_CAMINO", exportados_nuevos(DIFF_PR2))

    def test_varias_formas_de_exportar(self):
        d = ("+export const a = 1\n+export class B {}\n"
             "+export async function c() {}\n+export enum D {}\n")
        self.assertEqual(exportados_nuevos(d), ["a", "B", "c", "D"])

    def test_los_tipos_se_dejan_fuera_por_defecto(self):
        d = "+export type Salud = { puntos: number }\n+export function f() {}\n"
        self.assertEqual(exportados_nuevos(d), ["f"])
        self.assertIn("Salud", exportados_nuevos(d, incluir_tipos=True))

    def test_ignora_la_cabecera_del_diff(self):
        self.assertEqual(exportados_nuevos("+++ b/export function trampa.ts\n"), [])

    def test_sin_repetidos(self):
        self.assertEqual(exportados_nuevos("+export const a = 1\n+export const a = 2\n"), ["a"])

    def test_diff_vacio(self):
        self.assertEqual(exportados_nuevos(""), [])
        self.assertEqual(exportados_nuevos(None), [])


class TestEsPrueba(unittest.TestCase):
    def test_las_convenciones_del_repo(self):
        for r in ("src/lib/__tests__/x.ts", "src/a/b.test.ts", "src/a/b.test.tsx",
                  "src/a/b.spec.ts"):
            self.assertTrue(es_prueba(r), r)

    def test_una_fuente_no_lo_es(self):
        self.assertFalse(es_prueba("src/lib/mando/medidores.ts"))


class TestSinCablear(unittest.TestCase):
    def test_el_caso_pr2_lo_pilla(self):
        # avanceCombinado solo aparece en su propio archivo y en su prueba.
        usos = {"avanceCombinado": ["src/lib/mando/medidores.ts",
                                    "src/lib/mando/__tests__/medidores-avance.test.ts"]}
        self.assertEqual(
            sin_cablear(["avanceCombinado"], usos, propias=["src/lib/mando/medidores.ts"]),
            ["avanceCombinado"])

    def test_cuando_si_se_usa_no_se_queja(self):
        usos = {"avanceCombinado": ["src/lib/mando/medidores.ts",
                                    "src/app/api/mando/medidores/route.ts"]}
        self.assertEqual(
            sin_cablear(["avanceCombinado"], usos, propias=["src/lib/mando/medidores.ts"]), [])

    def test_usarse_solo_en_pruebas_no_vale(self):
        usos = {"f": ["src/lib/__tests__/f.test.ts"]}
        self.assertEqual(sin_cablear(["f"], usos), ["f"])

    def test_sin_usos_conocidos_es_huerfano(self):
        self.assertEqual(sin_cablear(["f"], {}), ["f"])

    def test_entradas_vacias(self):
        self.assertEqual(sin_cablear([], {}), [])
        self.assertEqual(sin_cablear(None, None), [])


class TestAviso(unittest.TestCase):
    def test_dice_integrado_pero_no_aplicado(self):
        t = aviso(["avanceCombinado"])
        self.assertIn("avanceCombinado", t)
        self.assertIn("no aplicado", t.lower().replace("NO", "no"))

    def test_sin_huerfanos_no_hay_aviso(self):
        self.assertEqual(aviso([]), "")


if __name__ == "__main__":
    unittest.main()
