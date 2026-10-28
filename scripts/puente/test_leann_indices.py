# -*- coding: utf-8 -*-
"""Pruebas de leann_indices (LNN1028D): troceado, fichas del repo, pendientes y reconstrucción condicionada."""
import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import leann_indices as LI  # noqa: E402


class ConstructorFalso:
    """Lo que el A1 vería como LeannBuilder al reconstruir repo-starseed."""

    def __init__(self):
        self.textos = []

    def add_text(self, texto, metadata=None):
        self.textos.append((texto, metadata))

    def build_index(self, ruta):
        with open(ruta, "w", encoding="utf-8") as fichero:
            fichero.write("índice falso")


class PruebaTroceo(unittest.TestCase):

    def test_bloques_solape_y_metadatos(self):
        lineas = ["L%02d" % i for i in range(130)]
        salida = LI.trozos("src/a.ts", "\n".join(lineas))
        pares = [(t["metadatos"]["desde"], t["metadatos"]["hasta"]) for t in salida]
        self.assertEqual(pares, [(1, 60), (51, 110), (101, 130)])
        self.assertEqual(salida[0]["texto"], "\n".join(lineas[:60]))
        self.assertEqual(salida[1]["texto"].splitlines()[0], "L50")
        self.assertEqual(salida[0]["metadatos"], {
            "alcance": "publica", "ruta": "src/a.ts", "desde": 1, "hasta": 60})
        self.assertEqual(LI.trozos("a", ""), [])
        self.assertEqual(LI.trozos("a", "\n\n\n"), [])

    def test_archivo_corto_es_un_solo_trozo(self):
        salida = LI.trozos("architecture/x.md", "uno\ndos\n\núltima")
        self.assertEqual(len(salida), 1)
        self.assertEqual(salida[0]["metadatos"], {
            "alcance": "publica", "ruta": "architecture/x.md", "desde": 1, "hasta": 4})
        self.assertEqual(salida[0]["texto"], "uno\ndos\n\núltima")


class PruebaRepo(unittest.TestCase):

    def setUp(self):
        self.raiz = tempfile.mkdtemp()
        for relativa in ("src/hola.ts", "src/profunda/todo.tsx", "src/no.txt",
                         "scripts/puente/util.py", "scripts/puente/test_util.py",
                         "architecture/leann-recuerdo-semantico.md"):
            ruta = os.path.join(self.raiz, relativa)
            os.makedirs(os.path.dirname(ruta), exist_ok=True)
            with open(ruta, "w", encoding="utf-8") as fichero:
                fichero.write("contenido\n")

    def test_fichas_y_exclusiones(self):
        self.assertEqual(LI.archivos_del_repo(self.raiz), [
            "architecture/leann-recuerdo-semantico.md",
            "scripts/puente/util.py",
            "src/hola.ts",
            "src/profunda/todo.tsx",
        ])
        self.assertEqual(LI.archivos_del_repo(self.raiz + "_que_no_existe"), [])


class PruebaPendientes(unittest.TestCase):
    """registros, grupos y recoger_pendientes con la escritura inyectada."""

    REGISTRO = {"texto": "planes del café", "indice": "perfil-alex-perfil",
                "metadatos": {"alcance": "perfil", "sujeto": "perfil:alex"}}

    def setUp(self):
        self.temporal = tempfile.mkdtemp()
        self.dir_indices = os.path.join(self.temporal, "leann")
        self.dir_pendientes = os.path.join(self.temporal, "pendientes")
        os.makedirs(self.dir_indices)
        os.makedirs(self.dir_pendientes)

    def crear_pendiente(self, nombre, lineas):
        ruta = os.path.join(self.dir_pendientes, nombre)
        with open(ruta, "w", encoding="utf-8") as fichero:
            fichero.write("\n".join(lineas) + "\n")
        return ruta

    def test_registros_y_grupos_puros(self):
        validos, malas = LI.registros_de_pendientes([
            json.dumps(self.REGISTRO), "   ", "no es json", json.dumps({"texto": "sin índice"}),
            json.dumps(dict(self.REGISTRO, indice="c2")),
        ])
        self.assertEqual(len(validos), 2)
        self.assertEqual(validos[1]["indice"], "c2")
        self.assertEqual(malas, ["no es json", json.dumps({"texto": "sin índice"})])
        grupos = LI.grupos_de_registros(validos)
        self.assertEqual(sorted(grupos), ["c2", "perfil-alex-perfil"])
        self.assertEqual(grupos["perfil-alex-perfil"][0]["texto"], "planes del café")

    def test_recoger_pone_borra_y_guarda_las_malas(self):
        ruta = self.crear_pendiente("dia.jsonl", [
            json.dumps(self.REGISTRO), "rota {{{",
            json.dumps(dict(self.REGISTRO, indice="borrador"), ensure_ascii=False),
        ])
        puestas = []
        resumen = LI.recoger_pendientes(self.dir_indices, self.dir_pendientes,
                                        poner=lambda d, n, t: puestas.append((d, n, t)))
        self.assertEqual(resumen, [{"archivo": "dia.jsonl", "registros": 2, "malas": 1,
                                    "indices": ["borrador", "perfil-alex-perfil"]}])
        self.assertEqual([(p[0], p[1]) for p in puestas],
                         [(self.dir_indices, "borrador"), (self.dir_indices, "perfil-alex-perfil")])
        self.assertEqual(puestas[1][2],
                         [{"texto": "planes del café", "metadatos": self.REGISTRO["metadatos"]}])
        with open(ruta, encoding="utf-8") as fichero:
            self.assertEqual(fichero.read(), "rota {{{\n")

    def test_sin_carpeta_no_da_nada_y_todo_bueno_borra_el_archivo(self):
        self.assertEqual(LI.recoger_pendientes(self.dir_indices, self.dir_pendientes + "_nada"), [])
        ruta = self.crear_pendiente("bueno.jsonl", [json.dumps(self.REGISTRO)])
        resumen = LI.recoger_pendientes(self.dir_indices, self.dir_pendientes, poner=lambda *a: None)
        self.assertEqual(resumen[0]["malas"], 0)
        self.assertFalse(os.path.exists(ruta))


class PruebaIndiceRepo(unittest.TestCase):
    """Solo se reconstruye si cambió la cabeza, que queda al lado del índice."""

    def setUp(self):
        self.temporal = tempfile.mkdtemp()
        self.dir_indices = os.path.join(self.temporal, "leann")
        self.raiz = tempfile.mkdtemp()
        for relativa in ("src/d.ts", "architecture/d.md"):
            ruta = os.path.join(self.raiz, relativa)
            os.makedirs(os.path.dirname(ruta), exist_ok=True)
            with open(ruta, "w", encoding="utf-8") as fichero:
                fichero.write("L1\nL2\n")
        self.constructores = []

        def fabrica():
            constructor = ConstructorFalso()
            self.constructores.append(constructor)
            return constructor

        self.fabrica = fabrica

    def test_reconstruye_guarda_cabeza_y_no_repite(self):
        self.assertTrue(LI.construir_indice_repo(self.dir_indices, self.raiz, "cabeza-1", self.fabrica))
        self.assertEqual(len(self.constructores), 1)
        trozos = self.constructores[0].textos
        self.assertEqual(trozos[0][1], {"alcance": "publica", "ruta": "architecture/d.md",
                                        "desde": 1, "hasta": 2})
        self.assertEqual(os.path.basename(trozos[1][1]["ruta"]), "d.ts")
        with open(os.path.join(self.dir_indices, "repo-starseed", "cabeza.txt"), encoding="utf-8") as fichero:
            self.assertEqual(fichero.read().strip(), "cabeza-1")
        self.assertFalse(LI.construir_indice_repo(self.dir_indices, self.raiz, "cabeza-1", self.fabrica))
        self.assertEqual(len(self.constructores), 1)
        self.assertTrue(LI.construir_indice_repo(self.dir_indices, self.raiz, "cabeza-2", self.fabrica))
        self.assertEqual(len(self.constructores), 2)


if __name__ == "__main__":
    unittest.main()
