"""Pruebas de arbol_de_trabajo: separar lo que ensucia el enjambre de lo ajeno."""

import os
import shutil
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from arbol_de_trabajo import PROPIAS, RAIZ, clasificar, repartir, ruta_de, solo_es_nuestro


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


class TestColasVersionadas(unittest.TestCase):
    """(2026-10-28, DEC1028E) Las colas VERSIONADAS que el enjambre re-apunta al dividir tareas
    (`herencia de depende` a las partes `-dN`) dejan ` M cola-*.json` en `main`. Eso es
    contabilidad propia y el guardia la recoge; una cola rota o ilegible sigue siendo ajena."""

    ART = "starseed_memory_root/olas/cola-artcraft-1025.json"
    BLD = "starseed_memory_root/olas/cola-blender-1025.json"
    INV = "starseed_memory_root/olas/cola-investigacion-1025.json"
    LINEAS = " M %s\n M %s\n M %s" % (ART, BLD, INV)

    def setUp(self):
        self.raiz = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.raiz, ignore_errors=True)
        for ruta, id_ in ((self.ART, "ART1025B-d3"), (self.BLD, "BLD1025B-d3"),
                          (self.INV, "INV1025A-d2")):
            self.escribe(ruta, '[{"id": "%s", "depende": []}]' % id_)

    def escribe(self, ruta, texto):
        destino = os.path.join(self.raiz, ruta)
        os.makedirs(os.path.dirname(destino), exist_ok=True)
        with open(destino, "w", encoding="utf-8") as f:
            f.write(texto)

    def test_las_tres_colas_reales_son_propias(self):
        mias, estorbo, ajenas = clasificar(self.LINEAS, raiz=self.raiz)
        self.assertEqual(mias, [self.ART, self.BLD, self.INV])
        self.assertEqual(estorbo, [])
        self.assertEqual(ajenas, [])

    def test_una_cola_rota_sigue_siendo_ajena(self):
        self.escribe(self.ART, "{esto no es json")
        mias, _estorbo, ajenas = clasificar(" M " + self.ART, raiz=self.raiz)
        self.assertEqual((mias, ajenas), ([], [self.ART]))

    def test_una_cola_que_ya_no_es_lista_de_tareas_es_ajena(self):
        for texto in ('{"id": "X"}', '[{"titulo": "sin id"}]', "[]", "[1, 2]"):
            with self.subTest(texto=texto):
                self.escribe(self.ART, texto)
                _m, _e, ajenas = clasificar(" M " + self.ART, raiz=self.raiz)
                self.assertEqual(ajenas, [self.ART])

    def test_si_el_archivo_no_esta_no_se_inventa(self):
        os.remove(os.path.join(self.raiz, self.ART))
        _m, _e, ajenas = clasificar(" M " + self.ART, raiz=self.raiz)
        self.assertEqual(ajenas, [self.ART])

    def test_un_ts_modificado_sigue_siendo_ajeno(self):
        mias, _estorbo, ajenas = clasificar(self.LINEAS + "\n M src/lib/algo.ts", raiz=self.raiz)
        self.assertEqual(mias, [self.ART, self.BLD, self.INV])
        self.assertEqual(ajenas, ["src/lib/algo.ts"])

    def test_una_cola_sin_seguimiento_no_es_propia(self):
        _m, _e, ajenas = clasificar("?? " + self.ART, raiz=self.raiz)
        self.assertEqual(ajenas, [self.ART])

    def test_una_cola_fuera_de_olas_es_ajena(self):
        # (rama nube/40676438291, adaptado) La contabilidad propia vive en
        # `starseed_memory_root/olas/`: una lista JSON de tareas válida en OTRA
        # carpeta se queda como trabajo ajeno aunque tenga pinta de cola.
        ruta = "starseed_memory_root/cola-x-1028.json"
        self.escribe(ruta, '[{"id": "X1", "depende": []}]')
        mias, _e, ajenas = clasificar(" M " + ruta, raiz=self.raiz)
        self.assertEqual((mias, ajenas), ([], [ruta]))

    def test_una_cola_en_subcarpeta_es_ajena(self):
        ruta = "starseed_memory_root/olas/sub/cola-x-1028.json"
        self.escribe(ruta, '[{"id": "X1", "depende": []}]')
        mias, _e, ajenas = clasificar(" M " + ruta, raiz=self.raiz)
        self.assertEqual((mias, ajenas), ([], [ruta]))

    def test_la_raiz_por_defecto_es_la_del_repo(self):
        self.assertTrue(os.path.isdir(RAIZ))
        if not os.path.isfile(os.path.join(RAIZ, self.ART)):
            self.skipTest("el repo no tiene la cola real")
        mias, _e, ajenas = clasificar(" M " + self.ART)
        self.assertEqual((mias, ajenas), ([self.ART], []))


if __name__ == "__main__":
    unittest.main()
