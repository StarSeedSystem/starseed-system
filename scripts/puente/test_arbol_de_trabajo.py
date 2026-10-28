"""Pruebas de arbol_de_trabajo: separar lo que ensucia el enjambre de lo ajeno."""

import os
import shutil
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from arbol_de_trabajo import PROPIAS, clasificar, repartir, ruta_de, solo_es_nuestro


class TestRutaDe(unittest.TestCase):
    def test_modificado_en_el_indice(self):
        self.assertEqual(ruta_de("M  memory/aprendizaje-olas.md"), "memory/aprendizaje-olas.md")

    def test_modificado_en_el_arbol(self):
        self.assertEqual(ruta_de(" M src/app/page.tsx"), "src/app/page.tsx")

    def test_sin_seguimiento(self):
        self.assertEqual(ruta_de("?? scripts/puente/nuevo.py"), "scripts/puente/nuevo.py")

    def test_renombrado_se_queda_con_la_nueva(self):
        self.assertEqual(ruta_de("R  viejo.md -> memory/aprendizaje-olas.md"), "memory/aprendizaje-olas.md")

    def test_ruta_entrecomillada(self):
        self.assertEqual(ruta_de('?? "src/con espacio.tsx"'), "src/con espacio.tsx")

    def test_linea_vacia_o_corta(self):
        self.assertEqual(ruta_de(""), "")
        self.assertEqual(ruta_de("M"), "")


class TestRepartir(unittest.TestCase):
    def test_solo_la_memoria_del_enjambre(self):
        mias, ajenas = repartir("M  memory/aprendizaje-olas.md")
        self.assertEqual(mias, ["memory/aprendizaje-olas.md"])
        self.assertEqual(ajenas, [])

    def test_trabajo_ajeno_no_se_toca(self):
        mias, ajenas = repartir(" M src/app/page.tsx\n?? borrador.txt")
        self.assertEqual(mias, [])
        self.assertEqual(ajenas, ["src/app/page.tsx", "borrador.txt"])

    def test_mezcla(self):
        mias, ajenas = repartir("M  memory/aprendizaje-olas.md\n M src/app/page.tsx")
        self.assertEqual(mias, ["memory/aprendizaje-olas.md"])
        self.assertEqual(ajenas, ["src/app/page.tsx"])

    def test_arbol_limpio(self):
        self.assertEqual(repartir(""), ([], []))
        self.assertEqual(repartir("\n  \n"), ([], []))

    def test_conserva_el_orden(self):
        _, ajenas = repartir(" M b.ts\n M a.ts")
        self.assertEqual(ajenas, ["b.ts", "a.ts"])

    def test_una_ruta_parecida_no_cuela(self):
        # Prefijo del nombre propio: es ajena, y por tanto para el arranque.
        _, ajenas = repartir("?? memory/aprendizaje-olas.md.bak")
        self.assertEqual(ajenas, ["memory/aprendizaje-olas.md.bak"])


class TestClasificar(unittest.TestCase):
    """(2026-10-25, ENJ1025A) El guardia del orquestador separa además el ESTORBO: un
    `informe_analisis.md` suelto en la raíz paró el enjambre ~29 h por contarse como «ajeno»."""

    def test_el_informe_suelto_no_es_ajeno(self):
        mias, estorbo, ajenas = clasificar("?? informe_analisis.md")
        self.assertEqual((mias, estorbo, ajenas), ([], ["informe_analisis.md"], []))

    def test_reparte_en_tres_y_conserva_el_orden(self):
        mias, estorbo, ajenas = clasificar(
            " M src/b.ts\nM  memory/aprendizaje-olas.md\n?? informe_dream.md\n?? x.new\n M src/a.ts"
        )
        self.assertEqual(mias, ["memory/aprendizaje-olas.md"])
        self.assertEqual(estorbo, ["informe_dream.md", "x.new"])
        self.assertEqual(ajenas, ["src/b.ts", "src/a.ts"])

    def test_el_trabajo_ajeno_sigue_siendo_ajeno(self):
        _m, estorbo, ajenas = clasificar("?? borrador.txt\n?? docs/informe.md\n M informe_analisis.md")
        self.assertEqual(estorbo, [])
        self.assertEqual(ajenas, ["borrador.txt", "docs/informe.md", "informe_analisis.md"])

    def test_repartir_se_queda_como_estaba(self):
        # `repartir` no sabe de estorbo (lo usan quienes solo quieren separar lo propio).
        self.assertEqual(repartir("?? informe_analisis.md"), ([], ["informe_analisis.md"]))

    def test_arbol_limpio_y_lista_propia(self):
        self.assertEqual(clasificar(""), ([], [], []))
        self.assertEqual(clasificar("\n  \n"), ([], [], []))
        self.assertEqual(clasificar("?? notas/x.md", propias=("notas/x.md",)), (["notas/x.md"], [], []))


class TestColasVersionadas(unittest.TestCase):
    """(2026-10-28, DEC1028E) El revisor de Bloqueadas re-apunta `depende` dentro de las
    colas versionadas al dividir tareas en partes `-dN`. El orquestador de la Mac no
    arrancaba desde el 27-10 a las 22:26 por tres de esas modificaciones."""

    REALES = (
        "starseed_memory_root/olas/cola-artcraft-1025.json",
        "starseed_memory_root/olas/cola-blender-1025.json",
        "starseed_memory_root/olas/cola-investigacion-1025.json",
    )
    LINEAS = "\n".join(" M " + ruta for ruta in REALES)

    def setUp(self):
        self.raiz = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.raiz, ignore_errors=True)

    def escribe(self, ruta, texto):
        destino = os.path.join(self.raiz, ruta)
        os.makedirs(os.path.dirname(destino), exist_ok=True)
        with open(destino, "w", encoding="utf-8") as f:
            f.write(texto)

    def test_las_tres_colas_reales_son_propias(self):
        for ruta in self.REALES:
            self.escribe(ruta, '[{"id": "ART1025B", "depende": ["ART1025B-d3"]}]')
        mias, estorbo, ajenas = clasificar(self.LINEAS, raiz=self.raiz)
        self.assertEqual(mias, list(self.REALES))
        self.assertEqual(estorbo, [])
        self.assertEqual(ajenas, [])

    def test_una_cola_rota_sigue_siendo_ajena(self):
        self.escribe(self.REALES[0], '[{"id": "ART1025B"}]')
        self.escribe(self.REALES[1], "{esto no es json")
        self.escribe(self.REALES[2], '[{"sin_id": 1}]')
        mias, _estorbo, ajenas = clasificar(self.LINEAS, raiz=self.raiz)
        self.assertEqual(mias, [self.REALES[0]])
        self.assertEqual(ajenas, list(self.REALES[1:]))

    def test_una_cola_que_no_se_puede_leer_es_ajena(self):
        self.escribe(self.REALES[0], '[{"id": "ART1025B"}]')
        mias, _estorbo, ajenas = clasificar(self.LINEAS, raiz=self.raiz)
        self.assertEqual(mias, [self.REALES[0]])
        self.assertEqual(ajenas, list(self.REALES[1:]))

    def test_un_ts_modificado_sigue_siendo_ajeno(self):
        self.escribe(self.REALES[0], '[{"id": "ART1025B"}]')
        mias, _estorbo, ajenas = clasificar(
            " M %s\n M src/lib/algo.ts" % self.REALES[0], raiz=self.raiz
        )
        self.assertEqual(mias, [self.REALES[0]])
        self.assertEqual(ajenas, ["src/lib/algo.ts"])


class TestSoloEsNuestro(unittest.TestCase):
    def test_si_cuando_solo_hay_memoria(self):
        self.assertTrue(solo_es_nuestro("M  memory/aprendizaje-olas.md"))

    def test_no_cuando_hay_algo_ajeno(self):
        self.assertFalse(solo_es_nuestro("M  memory/aprendizaje-olas.md\n M src/x.ts"))

    def test_no_con_el_arbol_limpio(self):
        # Sin nada que recoger no es «nuestro»: es que no hay nada.
        self.assertFalse(solo_es_nuestro(""))

    def test_la_lista_es_un_parametro(self):
        self.assertTrue(solo_es_nuestro("?? notas/x.md", propias=("notas/x.md",)))

    def test_la_lista_por_defecto_incluye_la_memoria(self):
        self.assertIn("memory/aprendizaje-olas.md", PROPIAS)


if __name__ == "__main__":
    unittest.main()
