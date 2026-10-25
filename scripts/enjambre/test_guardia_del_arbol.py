# -*- coding: utf-8 -*-
"""El guardia de `main` del orquestador (ENJ1025A · 2026-10-25).

EL CASO REAL. Un `informe_analisis.md` suelto en la raíz del repo paró el enjambre de la Mac unas
29 horas: el orquestador decía «working tree de main con cambios sin commit: 1 archivos — no
arranco» + «ajeno: informe_analisis.md» y nadie lo apartaba, porque el guardia, `desatascar` y el
vigilante tenían cada uno su idea de qué es «estorbo». Ahora lo decide `curacion_logica` y, si TODO
lo ajeno es estorbo, el guardia lo aparta a `olas/_apartado/AAAAMMDD/` (nunca lo borra) y arranca.

Repositorio git real y temporal; `ROOT` y `OLAS` apuntan a él. No toca el repo de verdad.
"""
import contextlib
import io
import os
import shutil
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

from test_progreso_irreversible import enjambre

PUENTE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "puente")
if PUENTE not in sys.path:
    sys.path.insert(0, PUENTE)


class GuardiaDelArbolTest(unittest.TestCase):
    def setUp(self):
        self.raiz = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.raiz, ignore_errors=True)
        self.git("init", "-q", "-b", "main")
        self.git("config", "user.email", "prueba@example.invalid")
        self.git("config", "user.name", "Prueba")
        self.escribe("app.ts", "const a = 1\n")
        self.escribe(".gitignore", "starseed_memory_root/\n")  # como el repo real
        # Carpetas que YA tienen archivos con seguimiento, como en el repo real: git muestra cada
        # archivo nuevo por separado (una carpeta entera sin seguimiento sale como «?? carpeta/»).
        for ruta in ("enjambre/colas/LEEME.md", "memory/README.md", "src/lib/base.ts"):
            self.escribe(ruta, "x\n")
        self.git("add", ".")
        self.git("commit", "-q", "-m", "inicio")
        self.olas = os.path.join(self.raiz, "starseed_memory_root", "olas")
        for nombre, valor in (("ROOT", self.raiz), ("OLAS", self.olas)):
            parche = patch.object(enjambre, nombre, valor)
            parche.start()
            self.addCleanup(parche.stop)
        self.recogidas = []
        self.recoger_real = enjambre._recoger_lo_nuestro  # con rutas vacías devuelve False sin tocar git
        parche = patch.object(
            enjambre, "_recoger_lo_nuestro", side_effect=lambda r: self.recogidas.append(list(r)) or True
        )
        parche.start()
        self.addCleanup(parche.stop)

    def git(self, *args):
        return subprocess.run(["git", *args], cwd=self.raiz, check=True,
                              capture_output=True, text=True).stdout

    def escribe(self, ruta, texto):
        destino = os.path.join(self.raiz, ruta)
        os.makedirs(os.path.dirname(destino), exist_ok=True)
        with open(destino, "w", encoding="utf-8") as f:
            f.write(texto)

    def sucio(self):
        return self.git("status", "--porcelain")

    def guardia(self):
        salida = io.StringIO()
        with contextlib.redirect_stdout(salida):
            codigo = enjambre._guardia_del_arbol(self.sucio())
        return codigo, salida.getvalue()

    def apartado(self, nombre):
        return os.path.join(self.olas, "_apartado", time.strftime("%Y%m%d"), nombre)

    def test_un_informe_suelto_se_aparta_y_el_orquestador_arranca(self):
        self.escribe("informe_analisis.md", "hallazgos del análisis")
        codigo, salida = self.guardia()
        self.assertIsNone(codigo)
        self.assertNotIn("no arranco", salida)
        self.assertIn("aparto 1 estorbo", salida)
        self.assertFalse(os.path.exists(os.path.join(self.raiz, "informe_analisis.md")))
        with open(self.apartado("informe_analisis.md"), encoding="utf-8") as f:
            self.assertEqual(f.read(), "hallazgos del análisis")  # apartado, NUNCA borrado
        self.assertEqual(self.sucio().strip(), "")
        self.assertEqual(self.recogidas, [])  # nada propio que recoger

    def test_todo_estorbo_de_varias_clases(self):
        self.escribe("informe_dream.md", "a")
        self.escribe("nota.new", "b")
        self.escribe("enjambre/colas/cola-nube-1.json.no-lanzada", "[]")
        codigo, _ = self.guardia()
        self.assertIsNone(codigo)
        for nombre in ("informe_dream.md", "nota.new", "cola-nube-1.json.no-lanzada"):
            self.assertTrue(os.path.exists(self.apartado(nombre)), nombre)
        self.assertEqual(self.sucio().strip(), "")

    def test_trabajo_ajeno_sigue_parando_el_arranque_y_no_se_toca_nada(self):
        self.escribe("app.ts", "const a = 2\n")  # tracked y modificado: trabajo de alguien
        self.escribe("informe_analisis.md", "hallazgos")
        codigo, salida = self.guardia()
        self.assertEqual(codigo, 2)
        self.assertIn("working tree de main con cambios sin commit: 1 archivos — no arranco", salida)
        self.assertIn("  ajeno: app.ts", salida)
        # el guardia no mueve NADA cuando hay trabajo ajeno: eso lo hace el vigilante, aparte
        self.assertTrue(os.path.exists(os.path.join(self.raiz, "informe_analisis.md")))
        self.assertTrue(os.path.exists(os.path.join(self.raiz, "app.ts")))
        self.assertFalse(os.path.exists(os.path.join(self.olas, "_apartado")))

    def test_un_archivo_nuevo_de_codigo_es_trabajo_y_para(self):
        self.escribe("src/lib/nuevo.ts", "export {}\n")
        codigo, salida = self.guardia()
        self.assertEqual(codigo, 2)
        self.assertIn("  ajeno: src/lib/nuevo.ts", salida)

    def test_estorbo_mas_contabilidad_propia(self):
        self.escribe("informe_analisis.md", "hallazgos")
        self.escribe("memory/aprendizaje-olas.md", "ola 1")
        codigo, salida = self.guardia()
        self.assertIsNone(codigo)
        self.assertTrue(os.path.exists(self.apartado("informe_analisis.md")))
        self.assertEqual(self.recogidas, [["memory/aprendizaje-olas.md"]])
        self.assertIn("recogí mi propia contabilidad", salida)

    def test_solo_contabilidad_propia_se_recoge_como_siempre(self):
        self.escribe("memory/aprendizaje-olas.md", "ola 1")
        codigo, _ = self.guardia()
        self.assertIsNone(codigo)
        self.assertEqual(self.recogidas, [["memory/aprendizaje-olas.md"]])

    def test_si_no_puede_recoger_lo_propio_no_arranca(self):
        self.escribe("memory/aprendizaje-olas.md", "ola 1")
        with patch.object(enjambre, "_recoger_lo_nuestro", return_value=False):
            codigo, salida = self.guardia()
        self.assertEqual(codigo, 2)
        self.assertIn("no pude commitear mi propia contabilidad", salida)

    def test_si_no_se_puede_apartar_el_estorbo_se_planta_y_lo_dice(self):
        self.escribe("informe_analisis.md", "hallazgos")
        with patch.object(enjambre, "_apartar_estorbo_del_arbol", return_value=[]):
            codigo, salida = self.guardia()
        self.assertEqual(codigo, 2)
        self.assertIn("no arranco", salida)
        self.assertIn("  ajeno: informe_analisis.md", salida)  # el vigilante lo reconoce y lo cura
        self.assertTrue(os.path.exists(os.path.join(self.raiz, "informe_analisis.md")))

    def test_un_arbol_que_no_se_entiende_no_arranca(self):
        # Lado seguro del error: sucio, pero ni propio, ni estorbo, ni ajeno que se pueda nombrar.
        with patch.object(enjambre, "_reparto_del_arbol", return_value=([], [], [])), \
                patch.object(enjambre, "_recoger_lo_nuestro", self.recoger_real):
            salida = io.StringIO()
            with contextlib.redirect_stdout(salida):
                codigo = enjambre._guardia_del_arbol("?? algo raro")
        self.assertEqual(codigo, 2)
        self.assertIn("no pude commitear", salida.getvalue())

    def test_la_salida_del_guardia_la_entiende_el_vigilante(self):
        """El registro que deja la negativa (`__EXIT__`) lleva la frase que el vigilante busca."""
        from vigilante_logica import es_motivo_de_arbol_sucio, motivo_de_salida
        self.escribe("app.ts", "const a = 2\n")
        _, salida = self.guardia()
        registro = salida.splitlines() + ["", "__EXIT__=2"]
        self.assertTrue(es_motivo_de_arbol_sucio(motivo_de_salida(registro)))


if __name__ == "__main__":
    unittest.main()
