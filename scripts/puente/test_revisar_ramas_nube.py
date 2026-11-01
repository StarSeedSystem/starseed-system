# -*- coding: utf-8 -*-
"""Revisión de ramas de la nube: decisiones puras y, con repositorios Git temporales (un
«origin» desnudo y su clon), archivar → verificar → borrar sin perder nada."""
import os
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import revisar_ramas_nube as R  # noqa: E402
import traer_nube as T  # noqa: E402

TS_MAIN = '''import { describe, it, expect } from "vitest";
describe("x", () => {
  it("suma dos números", () => {
    expect(1 + 1).toBe(2);
  });
});
'''
TS_RAMA = '''import { describe, it, expect } from "vitest";
describe("x", () => {
  it("suma dos numeros enteros", () => {
    expect(1 + 1).toBe(2);
  });
  it("con la pestaña oculta no avanza", () => {
    expect(avanza(oculta)).toBe(false);
  });
  it('en pausa no acumula pulsos', () => {
    expect(pulsos()).toBe(0);
  });
});
'''
PY = '''class X(unittest.TestCase):
    def test_uno(self):
        self.assertTrue(True)

    def test_dos_nuevo(self):
        self.assertEqual(1, 1)
'''


class Puras(unittest.TestCase):
    def test_titulos_ts_y_py(self):
        self.assertEqual(R.titulos(TS_RAMA, "a.test.ts"),
                         ["suma dos numeros enteros", "con la pestaña oculta no avanza", "en pausa no acumula pulsos"])
        self.assertEqual(R.titulos(PY, "test_a.py"), ["test_uno", "test_dos_nuevo"])

    def test_bloques_cortan_por_sangria(self):
        b = R.bloques(TS_RAMA, "a.test.ts")
        self.assertTrue(b["en pausa no acumula pulsos"].endswith("});"))
        self.assertIn("pulsos()", b["en pausa no acumula pulsos"])
        self.assertNotIn("pulsos()", b["con la pestaña oculta no avanza"])
        self.assertIn("assertEqual", R.bloques(PY, "test_a.py")["test_dos_nuevo"])

    def test_casos_nuevos_salta_iguales_y_parecidos(self):
        nuevos = R.casos_nuevos(TS_RAMA, TS_MAIN, "a.test.ts")
        self.assertEqual([t for t, _ in nuevos], ["con la pestaña oculta no avanza", "en pausa no acumula pulsos"])
        self.assertEqual(len(R.casos_nuevos(TS_RAMA, "", "a.test.ts")), 3)

    def test_es_prueba(self):
        for r in ("src/a/__tests__/b.test.ts", "c.test.tsx", "scripts/puente/test_x.py", "test_y.py"):
            self.assertTrue(R.es_prueba(r), r)
        for r in ("src/a/b.ts", "scripts/puente/x_test.md", "contest_x.py"):
            self.assertFalse(R.es_prueba(r), r)

    def test_regla(self):
        self.assertEqual(R.regla(3), "rescatar")
        self.assertEqual(R.regla(2), "archivar")

    def test_jev_veta_perder_y_no_da_permiso(self):
        self.assertEqual(R.con_jev("archivar", {"respuesta": "rescatar", "p": 0.85, "medio": "openrouter"})[0], "rescatar")
        self.assertEqual(R.con_jev("archivar", {"respuesta": "rescatar", "p": 0.66, "medio": "openrouter"})[0], "archivar")
        self.assertEqual(R.con_jev("rescatar", {"respuesta": "archivar", "p": 0.99, "medio": "openrouter"})[0], "rescatar")
        self.assertEqual(R.con_jev("rescatar", {"respuesta": "archivar", "p": 0.9, "medio": "regla"})[0], "rescatar")
        self.assertEqual(R.con_jev("rescatar", {})[1], "regla (Jev calló)")

    def test_tarea_rescate_autosuficiente_y_acotada(self):
        casos = {"b.test.ts": [("t%d" % i, "it('t%d', () => {})" % i) for i in range(5)],
                 "a.test.ts": [("grande", "x" * 20000)], "c.test.ts": [("c", "it('c')")], "d.test.ts": [("d", "")]}
        t = R.tarea_rescate("RTX1", "X1", "nube/1/ola/X1", "Algo", casos, "regla y Jev coinciden")
        self.assertEqual(t["archivos"], ["a.test.ts", "b.test.ts", "c.test.ts"])
        self.assertIn("it('t4', () => {})", t["prompt"])
        self.assertIn("a.test.ts :: grande", t["prompt"])  # no cabe: solo el título
        self.assertIn("NO APLICA", t["prompt"])
        self.assertIn("refs/archivo/nube/1/ola/X1", t["prompt"])
        self.assertIn("vi.mock", t["prompt"])

    def test_cadena_viva(self):
        p = {"RSC1006Q": {"estado": "sustituida"}, "RSC1006Qd": {"estado": "sustituida"},
             "RSC1006Qe": {"estado": "reasignada"}, "OTRA1": {"estado": "pendiente"}}
        self.assertEqual(R.cadena_viva("RSC1006Qd", p), ["RSC1006Qe"])
        p["RSC1006Qe"]["estado"] = "commit"
        self.assertEqual(R.cadena_viva("RSC1006Qd", p), [])
        self.assertEqual(R.cadena_viva("", p), [])

    def test_profundidad_rescate(self):
        self.assertEqual(R.profundidad_rescate("OPT1004C"), 0)
        self.assertEqual(R.profundidad_rescate("RTOPT1004C"), 1)
        self.assertEqual(R.profundidad_rescate("RTRTRTCOL1012Bdsb"), 3)
        self.assertEqual(R.profundidad_rescate(""), 0)
        self.assertGreaterEqual(R.profundidad_rescate(R.id_rescate("OPT1004C", set())), R.TOPE_RESCATE)

    def test_id_rescate(self):
        self.assertEqual(R.id_rescate("OPT1004C", set()), "RTOPT1004C")
        self.assertEqual(R.id_rescate("LC1004Bd", set()), "RTLC1004B")
        self.assertEqual(R.id_rescate("OPT1004C", {"RTOPT1004C"}), "RTOPT1004Cb")

    def test_id_en_rama(self):
        self.assertEqual(R.id_en_rama("nube/3/ola/LC1004B"), "LC1004B")
        self.assertEqual(R.id_en_rama("nube/1/ola/X1"), "X1")
        self.assertEqual(R.id_en_rama("nube/a1-20261012-114650-RSC1031A"), "RSC1031A")
        self.assertEqual(R.id_en_rama("nube/1/ola/X1-2"), "")
        for r in ("nube/2", "nube/a1-20261012-114650", "nube/40000000001|MED1", ""):
            self.assertEqual(R.id_en_rama(r), "", r)

    def test_rescatable_exige_archivos_de_la_tarea(self):
        d, motivo = R.rescatable(["src/f.ts", "a.test.ts"], ["a.test.ts"], "nube/1/ola/X1", "X1")
        self.assertEqual(d, "rescatar")
        self.assertIn("a.test.ts", motivo)
        d, motivo = R.rescatable(["otro.ts"], ["a.test.ts"], "nube/2", "X1")
        self.assertEqual(d, "archivar")
        self.assertIn("los archivos de la tarea", motivo)
        self.assertEqual(R.rescatable([], ["a.test.ts"], "", "X1")[0], "archivar")

    def test_rescatable_nunca_rescata_rama_de_otra_tarea(self):
        d, motivo = R.rescatable(["a.test.ts"], ["a.test.ts"], "nube/1/ola/RTX1", "X1")
        self.assertEqual(d, "archivar")
        self.assertIn("otra tarea", motivo)
        self.assertEqual(R.rescatable(["a.test.ts"], ["a.test.ts"], "LC1004B", "LC1004B")[0], "rescatar")
        # Misma cadena (sucesores por letra) no es «otra tarea»: mandan los archivos.
        self.assertEqual(R.rescatable(["a.test.ts"], ["a.test.ts"], "nube/1/ola/LC1004Bd", "LC1004B")[0], "rescatar")

    def test_informe(self):
        self.assertEqual(R.texto_informe([]), "")
        n = [R.nota("nube/1", "X1", "t", "en main", "rescatar", "m", 4, "RTX1"),
             R.nota("nube/2", "X2", "t", "en main", "archivar", "m", 0)]
        texto = R.texto_informe(n)
        self.assertIn("Revisadas 2", texto)
        self.assertIn("RTX1 (X1, 4 casos)", texto)


class ArchivarYBorrar(unittest.TestCase):
    """Un origin desnudo con dos ramas nube/*: se archivan, se verifican y solo entonces se borran."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        base = self.tmp.name
        self.origen = os.path.join(base, "origen.git")
        self.repo = os.path.join(base, "repo")
        self.g(["init", "-q", "--bare", "-b", "main", self.origen], base)
        self.g(["init", "-q", "-b", "main", self.repo], base)
        for k, v in (("user.name", "Prueba"), ("user.email", "p@example.invalid")):
            self.g(["config", k, v])
        self.g(["remote", "add", "origin", self.origen])
        self.commit("a.txt", "base\n")
        self.g(["push", "-q", "origin", "main"])
        self.shas = {}
        for rama in ("nube/1/ola/X1", "nube/2"):
            self.g(["checkout", "-q", "-b", rama, "main"])
            self.commit("t-%s.txt" % rama.replace("/", "-"), "trabajo\n")
            self.g(["push", "-q", "origin", rama])
            self.shas[rama] = self.g(["rev-parse", "HEAD"]).strip()
            self.g(["checkout", "-q", "main"])
            self.g(["branch", "-q", "-D", rama])
        self.archivo = os.path.join(base, "archivo")
        for obj, nombre, valor in ((T, "RAIZ", self.repo), (R, "ARCHIVO", self.archivo)):
            p = mock.patch.object(obj, nombre, valor)
            p.start()
            self.addCleanup(p.stop)

    def g(self, args, cwd=None):
        return subprocess.run(["git", *args], cwd=cwd or self.repo, check=True, capture_output=True, text=True).stdout

    def commit(self, archivo, texto):
        with open(os.path.join(self.repo, archivo), "w") as f:
            f.write(texto)
        self.g(["add", archivo])
        self.g(["commit", "-q", "-m", "c " + archivo])

    def remotas(self):
        return self.g(["for-each-ref", "--format=%(refname)", "refs/heads/nube/"], cwd=self.origen).split()

    def test_archiva_verifica_empaqueta_y_borra(self):
        a = R.archivar(["nube/1/ola/X1", "nube/2", "otra/rama"], fecha="2026-10-06")
        self.assertEqual(a["archivadas"], self.shas)
        self.assertEqual(a["fallidas"], [])
        self.assertTrue(os.path.isfile(a["paquete"]))
        self.assertIn(self.shas["nube/2"], self.g(["bundle", "list-heads", a["paquete"]]))
        b = R.borrar_archivadas(a["archivadas"])
        self.assertEqual(sorted(b["borradas"]), sorted(self.shas))
        self.assertEqual(self.remotas(), [])
        # Nada se pierde: el archivo local sigue apuntando al trabajo.
        self.assertEqual(self.g(["rev-parse", "refs/archivo/nube/2"]).strip(), self.shas["nube/2"])

    def test_no_borra_si_la_rama_cambio_despues_de_archivar(self):
        a = R.archivar(["nube/2"])
        self.g(["checkout", "-q", "-b", "tmp", self.shas["nube/2"]])
        self.commit("mas.txt", "nuevo trabajo de la nube\n")
        self.g(["push", "-q", "origin", "tmp:nube/2"])
        b = R.borrar_archivadas(a["archivadas"])
        self.assertEqual(b["borradas"], [])
        self.assertEqual(self.remotas(), ["refs/heads/nube/1/ola/X1", "refs/heads/nube/2"])

    def test_el_paquete_es_acumulado_entre_pasadas_del_mismo_dia(self):
        R.archivar(["nube/1/ola/X1"], fecha="2026-10-06")
        a = R.archivar(["nube/2"], fecha="2026-10-06")
        cabezas = self.g(["bundle", "list-heads", a["paquete"]])
        self.assertIn(self.shas["nube/1/ola/X1"], cabezas)
        self.assertIn(self.shas["nube/2"], cabezas)

    def test_un_paquete_vacio_no_impide_archivar(self):
        # Una rama que ya está entera en main: la ref archiva, el paquete saldría vacío.
        self.g(["push", "-q", "origin", "main:nube/3"])
        a = R.archivar(["nube/3"])
        self.assertIn("nube/3", a["archivadas"])
        self.assertEqual(a["fallidas"], [])

    def test_rama_inexistente_no_se_archiva_ni_se_borra(self):
        a = R.archivar(["nube/9/ola/NADA"])
        self.assertEqual(a["archivadas"], {})
        self.assertEqual(a["fallidas"], ["nube/9/ola/NADA"])
        self.assertIsNone(a["paquete"])


class Filtro(unittest.TestCase):
    """RESC1031B (2026-11-01): `_revisar` solo rescata la rama si su diff toca los archivos de la
    tarea y la rama no es de otra tarea; lo demás se archiva con motivo."""

    def test_revisar_solo_rescata_ramas_de_la_tarea(self):
        estado = {"superadas": [
            {"tid": "X1", "rama": "nube/1/ola/X1", "motivo": "en main"},
            {"tid": "X2", "rama": "nube/2-Y2", "motivo": "en main"},
            {"tid": "X3", "rama": "nube/3/ola/X3", "motivo": "en main"},
        ]}
        colas = {"X1": ("cola-a.json", {"id": "X1", "titulo": "A", "archivos": ["a.test.ts"]}),
                 "X2": ("cola-a.json", {"id": "X2", "titulo": "B", "archivos": ["a.test.ts"]}),
                 "X3": ("cola-a.json", {"id": "X3", "titulo": "C", "archivos": ["a.test.ts"]})}
        progreso = {"X1": {"estado": "sustituida"}, "X2": {"estado": "sustituida"},
                    "X3": {"estado": "sustituida"}}
        casos = {
            "refs/remotes/origin/nube/1/ola/X1": ({"b.test.ts": [("t1", "c")]}, ["b.test.ts"]),
            "refs/remotes/origin/nube/2-Y2": ({"a.test.ts": [("n%d" % i, "c") for i in range(3)]},
                                              ["a.test.ts"]),
            "refs/remotes/origin/nube/3/ola/X3": ({"a.test.ts": [("n%d" % i, "c") for i in range(3)]},
                                                  ["a.test.ts"]),
        }

        def leer(ruta, defecto=None):
            return estado if ruta == T.ESTADO else {"ola": "x", "tareas": []}

        with mock.patch.object(T, "_leer_json", side_effect=leer), \
             mock.patch.object(T, "_colas_por_id", return_value=colas), \
             mock.patch.object(T, "_progreso", return_value=progreso), \
             mock.patch.object(R, "_casos_de", side_effect=lambda r: casos[r]):
            r = R._revisar(False, False)
        por_tid = {n["tarea"]: n for n in r["notas"]}
        self.assertEqual(por_tid["X1"]["decision"], "archivar")
        self.assertIn("los archivos de la tarea", por_tid["X1"]["motivo"])
        self.assertEqual(por_tid["X2"]["decision"], "archivar")
        self.assertIn("otra tarea", por_tid["X2"]["motivo"])
        self.assertEqual(por_tid["X3"]["decision"], "rescatar")
        self.assertEqual(r["tareas"], ["RTX3"])


if __name__ == "__main__":
    unittest.main()
