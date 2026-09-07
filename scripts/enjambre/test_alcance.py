# -*- coding: utf-8 -*-
"""Tests de la puerta de alcance del orquestador (2026-09-06, Ola 259, E2).

Sin red: monta un repo git temporal con `main` y una rama de tarea, y comprueba que
`alcance_tarea` distingue pedidos cumplidos, faltantes y extras. El módulo se importa con
importlib porque el nombre del archivo lleva guiones; el import es seguro (el arranque vive
bajo `if __name__ == "__main__"`). Los casos de carpeta nueva y './' son de la Ola 261 (P8,
2026-09-07): un archivo nuevo en una carpeta nueva sin `git add` contaba como faltante porque
git status listaba la carpeta, no el archivo.
"""
import importlib.util
import os
import subprocess
import sys
import tempfile
import unittest

RUTA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "starseed-enjambre.py")
ESPEC = importlib.util.spec_from_file_location("enjambre", RUTA)
enjambre = importlib.util.module_from_spec(ESPEC)
sys.modules["enjambre"] = enjambre
ESPEC.loader.exec_module(enjambre)


def git(wt, *args):
    subprocess.run(["git"] + list(args), cwd=wt, check=True, capture_output=True, text=True)


class AlcanceTareaTest(unittest.TestCase):
    def setUp(self):
        self.wt = tempfile.mkdtemp(prefix="enj-alcance-")
        git(self.wt, "init", "-q", "-b", "main")
        git(self.wt, "config", "user.email", "test@starseed.local")
        git(self.wt, "config", "user.name", "Test Enjambre")
        for nombre in ("a.ts", "b.ts"):
            with open(os.path.join(self.wt, nombre), "w", encoding="utf-8") as f:
                f.write("// %s\n" % nombre)
        git(self.wt, "add", ".")
        git(self.wt, "commit", "-qm", "base")
        # Rama de la tarea: modifica a.ts (sin commit todavía) y crea el archivo nuevo c.ts.
        git(self.wt, "checkout", "-qb", "ola/TEST")
        with open(os.path.join(self.wt, "a.ts"), "a", encoding="utf-8") as f:
            f.write("// cambio de la tarea\n")
        with open(os.path.join(self.wt, "c.ts"), "w", encoding="utf-8") as f:
            f.write("// archivo nuevo\n")

    def test_faltantes_y_sin_extras(self):
        medida = enjambre.alcance_tarea({"archivos": ["a.ts", "b.ts", "c.ts"]}, self.wt)
        # b.ts se pidió pero la rama no lo tocó: falta. No hay nada tocado fuera de la lista.
        self.assertEqual(medida["faltan"], ["b.ts"])
        self.assertEqual(medida["extra"], [])
        self.assertEqual(medida["pedidos"], ["a.ts", "b.ts", "c.ts"])
        self.assertEqual(medida["tocados"], ["a.ts", "c.ts"])

    def test_extras(self):
        medida = enjambre.alcance_tarea({"archivos": ["a.ts"]}, self.wt)
        # c.ts está tocado y no se pidió: aparece como extra.
        self.assertEqual(medida["extra"], ["c.ts"])
        self.assertEqual(medida["faltan"], [])

    def test_tocados_confirmados_con_commit(self):
        # Lo mismo pero con el cambio ya confirmado en la rama: lo cubre `git diff main...HEAD`.
        git(self.wt, "add", ".")
        git(self.wt, "commit", "-qm", "tarea")
        medida = enjambre.alcance_tarea({"archivos": ["a.ts", "b.ts", "c.ts"]}, self.wt)
        self.assertEqual(medida["faltan"], ["b.ts"])
        self.assertEqual(medida["extra"], [])

    def test_archivo_nuevo_en_carpeta_nueva_sin_add(self):
        # Ola 261 (P8, 2026-09-07): sin `git add`, git status lista la CARPETA sin rastrear,
        # no cada archivo. El archivo pedido dentro debe contar como tocado, no faltante.
        os.makedirs(os.path.join(self.wt, "src", "lib", "nueva"), exist_ok=True)
        destino = os.path.join(self.wt, "src", "lib", "nueva", "manifiesto.ts")
        with open(destino, "w", encoding="utf-8") as f:
            f.write("// nuevo dentro de carpeta nueva\n")
        medida = enjambre.alcance_tarea(
            {"archivos": ["src/lib/nueva/manifiesto.ts"]}, self.wt)
        self.assertEqual(medida["faltan"], [])
        self.assertIn("src/lib/nueva/manifiesto.ts", medida["tocados"])

    def test_pedido_con_prefijo_punto_barra(self):
        # Ola 261 (P8, 2026-09-07): la cola puede pedir './a.ts' pero git nunca escribe
        # rutas con ese prefijo; sin normalizar saldría faltante Y extra a la vez.
        medida = enjambre.alcance_tarea({"archivos": ["./a.ts"]}, self.wt)
        self.assertEqual(medida["faltan"], [])
        self.assertNotIn("a.ts", medida["extra"])


if __name__ == "__main__":
    unittest.main()
