"""Pruebas de alcance_pruebas: que la puerta corra las pruebas que la tarea toca."""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from alcance_pruebas import BASE, GUARDAS_CLIENTE, es_prueba, orden_vitest, pruebas_a_sumar, toca_la_app


def existe_de(conjunto):
    return lambda r: r in conjunto


class TestEsPrueba(unittest.TestCase):
    def test_reconoce_las_convenciones(self):
        for r in ("a/b.test.ts", "a/b.test.tsx", "a/b.spec.ts", "a/b.spec.tsx"):
            self.assertTrue(es_prueba(r), r)

    def test_una_fuente_no_es_prueba(self):
        self.assertFalse(es_prueba("src/lib/network/culture-discovery.ts"))
        self.assertFalse(es_prueba(""))


class TestPruebasASumar(unittest.TestCase):
    def test_el_caso_de_ps8(self):
        # Lo que tocó PS8: la fuente y su prueba hermana, fuera de src/lib/__tests__.
        cambiadas = [
            "src/lib/network/culture-discovery.ts",
            "src/lib/network/culture-discovery.test.ts",
        ]
        hay = existe_de(set(cambiadas))
        self.assertEqual(
            pruebas_a_sumar(cambiadas, hay),
            ["src/lib/network/culture-discovery.test.ts"],
        )

    def test_encuentra_la_hermana_aunque_no_este_en_el_diff(self):
        # Se cambia solo la fuente: su prueba sigue siendo puerta.
        hay = existe_de({"src/lib/network/culture-discovery.test.ts"})
        self.assertEqual(
            pruebas_a_sumar(["src/lib/network/culture-discovery.ts"], hay),
            ["src/lib/network/culture-discovery.test.ts"],
        )

    def test_convencion_de_carpeta___tests__(self):
        hay = existe_de({"src/components/mando/__tests__/publicar-ahora.test.tsx"})
        self.assertEqual(
            pruebas_a_sumar(["src/components/mando/publicar-ahora.tsx"], hay),
            ["src/components/mando/__tests__/publicar-ahora.test.tsx"],
        )

    def test_no_repite_lo_que_ya_cubre_la_base(self):
        ruta = BASE + "/mando-colas.test.ts"
        self.assertEqual(pruebas_a_sumar([ruta], existe_de({ruta})), [])

    def test_no_manda_a_vitest_lo_que_no_existe(self):
        self.assertEqual(
            pruebas_a_sumar(["src/lib/network/sin-prueba.ts"], existe_de(set())), []
        )

    def test_ignora_lo_que_no_es_typescript(self):
        hay = existe_de({"scripts/enjambre/x.test.ts"})
        self.assertEqual(pruebas_a_sumar(["scripts/enjambre/x.py", "README.md"], hay), [])

    def test_sin_repetidos_y_ordenado(self):
        cambiadas = [
            "src/lib/network/b.ts",
            "src/lib/network/b.test.ts",
            "src/lib/network/a.test.ts",
        ]
        hay = existe_de(set(cambiadas))
        self.assertEqual(
            pruebas_a_sumar(cambiadas, hay),
            ["src/lib/network/a.test.ts", "src/lib/network/b.test.ts"],
        )

    def test_aguanta_lineas_vacias_y_none(self):
        self.assertEqual(pruebas_a_sumar(["", "  ", None], existe_de(set())), [])
        self.assertEqual(pruebas_a_sumar(None, existe_de(set())), [])


class TestGuardasDelNavegador(unittest.TestCase):
    """El caso de S1010-MGR3b (2026-10-11): un componente de cliente con un import de valor
    a un módulo con node:child_process entró con tsc y sus pruebas en verde."""

    def test_el_caso_de_mgr3b_corre_las_guardas(self):
        cambiadas = [
            "src/lib/mando/tunel-metagenesis-estado.ts",
            "src/app/api/mando/tunel-metagenesis/route.ts",
            "src/components/mando/tunel-metagenesis-estado.tsx",
        ]
        hay = existe_de(set(GUARDAS_CLIENTE))
        self.assertEqual(pruebas_a_sumar(cambiadas, hay), sorted(GUARDAS_CLIENTE))

    def test_python_o_documentos_no_las_disparan(self):
        hay = existe_de(set(GUARDAS_CLIENTE))
        self.assertEqual(pruebas_a_sumar(["scripts/puente/x.py", "architecture/a.md"], hay), [])

    def test_tocar_solo_pruebas_no_las_dispara(self):
        prueba = "src/lib/network/a.test.ts"
        hay = existe_de(set(GUARDAS_CLIENTE) | {prueba})
        self.assertEqual(pruebas_a_sumar([prueba], hay), [prueba])

    def test_solo_las_que_existen(self):
        hay = existe_de({GUARDAS_CLIENTE[0]})
        self.assertTrue(toca_la_app("src/components/x.tsx"))
        self.assertEqual(pruebas_a_sumar(["src/components/x.tsx"], hay), [GUARDAS_CLIENTE[0]])


class TestOrdenVitest(unittest.TestCase):
    def test_sin_extras_es_el_comando_de_siempre(self):
        self.assertEqual(orden_vitest([]), "npx vitest run " + BASE)

    def test_con_extras_los_suma_detras(self):
        self.assertEqual(
            orden_vitest(["src/lib/network/culture-discovery.test.ts"]),
            "npx vitest run " + BASE + " src/lib/network/culture-discovery.test.ts",
        )


if __name__ == "__main__":
    unittest.main()
