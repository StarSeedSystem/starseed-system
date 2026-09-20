import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import mensajes_agente as ma  # noqa: E402


class Mensajes(unittest.TestCase):
    def setUp(self):
        self.d = tempfile.mkdtemp()
        self.olas = os.path.join(self.d, "olas")
        self.wt = os.path.join(self.d, "wt")
        os.makedirs(self.wt)

    def test_anotar_y_leer_conservan_orden_y_saltan_basura(self):
        ma.anotar(self.olas, "AG-1", "usa el token de color del Mando")
        ma.anotar(self.olas, "AG-1", "no toques la ramificación")
        with open(ma.ruta_mensajes(self.olas, "AG-1"), "a", encoding="utf-8") as f:
            f.write("{basura\n\n")
        ms = ma.leer(self.olas, "AG-1")
        self.assertEqual([m["texto"] for m in ms], ["usa el token de color del Mando", "no toques la ramificación"])
        self.assertEqual(ms[0]["de"], "alex")

    def test_vacio_se_rechaza_y_se_recorta(self):
        with self.assertRaises(ValueError):
            ma.anotar(self.olas, "AG-1", "   ")
        m = ma.anotar(self.olas, "AG-1", "x" * 3000)
        self.assertEqual(len(m["texto"]), 2000)

    def test_id_raro_no_escapa_del_directorio(self):
        r = ma.ruta_mensajes(self.olas, "../../etc/passwd")
        self.assertTrue(r.startswith(os.path.join(self.olas, "mensajes")))
        self.assertNotIn("..", os.path.basename(r))

    def test_entregar_escribe_el_archivo_y_marca_una_sola_vez(self):
        ma.anotar(self.olas, "AG-1", "prioriza la prueba del botón")
        self.assertEqual(ma.entregar(self.olas, "AG-1", self.wt), 1)
        ruta = os.path.join(self.wt, ma.ARCHIVO_WORKTREE)
        self.assertTrue(os.path.exists(ruta))
        self.assertIn("prioriza la prueba del botón", open(ruta, encoding="utf-8").read())
        self.assertEqual(ma.entregar(self.olas, "AG-1", self.wt), 0)
        self.assertTrue(ma.leer(self.olas, "AG-1")[0]["entregado"])

    def test_entregar_sin_worktree_o_sin_mensajes_no_falla(self):
        self.assertEqual(ma.entregar(self.olas, "NADIE", self.wt), 0)
        ma.anotar(self.olas, "AG-2", "hola")
        self.assertEqual(ma.entregar(self.olas, "AG-2", None), 0)
        self.assertEqual(ma.entregar(self.olas, "AG-2", os.path.join(self.d, "no-existe")), 0)

    def test_para_prompt_marca_leidos_y_devuelve_bloque(self):
        self.assertEqual(ma.para_prompt(self.olas, "AG-1"), "")
        ma.anotar(self.olas, "AG-1", "usa vitest, no jest")
        bloque = ma.para_prompt(self.olas, "AG-1")
        self.assertIn("MENSAJES DEL DIRECTOR", bloque)
        self.assertIn("- usa vitest, no jest", bloque)
        self.assertTrue(ma.leer(self.olas, "AG-1")[0]["leido"])
        self.assertEqual(ma.pendientes(ma.leer(self.olas, "AG-1"), "leido"), [])

    def test_instruccion_nombra_el_archivo(self):
        self.assertIn(ma.ARCHIVO_WORKTREE, ma.INSTRUCCION)


if __name__ == "__main__":
    unittest.main()
