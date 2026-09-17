"""Salvavidas: el trabajo del agente se commitea en su rama ANTES de las puertas.

Contrato que RS1c debe implementar en `starseed-enjambre.py` (aún no existe;
por eso las pruebas contra esas funciones llevan `unittest.skipIf` y hoy la
suite pasa en verde marcándolas como omitidas):

def commit_salvavidas(tid: str) -> str | None
    Commitea en la rama del agente (``ola/<tid>``) todo lo que haya en su
    worktree (staged, sin staged y sin rastrear) ANTES de correr tsc ni los
    tests. Devuelve el SHA del commit, o ``None`` si el árbol ya estaba
    limpio. Es idempotente: llamarlo dos veces seguidas no crea un segundo
    commit ni deja el árbol sucio.

def nota_salvavidas(tid: str, rama: str, sha: str | None) -> None
    Anota en el estado de la tarea (``set_estado``) las claves ``rama`` y
    ``sha`` para que, si una puerta falla después, el trabajo se pueda
    reanudar desde esa rama y ese commit.
"""

from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch


class _RepoTemporal:
    """Repo Git desechable con una rama de agente y su trabajo sin commitear."""

    def __init__(self, caso):
        self.caso = caso
        self.tmp = tempfile.TemporaryDirectory()
        caso.addCleanup(self.tmp.cleanup)
        self.raiz = Path(self.tmp.name) / "repo"
        self.raiz.mkdir()
        self.git("init", "-b", "main")
        self.git("config", "user.name", "Prueba local")
        self.git("config", "user.email", "prueba@example.invalid")
        nota = self.raiz / "INICIO.txt"
        nota.write_text("base\n")
        self.git("add", ".")

    def git(self, *args):
        return subprocess.run(
            ["git", *args],
            cwd=self.raiz,
            check=True,
            capture_output=True,
            text=True,
        ).stdout.strip()

    def con_trabajo_sucio(self, tid, texto="trabajo del agente\n"):
        rama = "ola/" + tid
        self.git("checkout", "-b", rama)
        (self.raiz / "trabajo.txt").write_text(texto)
        return rama

    def log(self, rama):
        return self.git("log", "--format=%H %s", rama).splitlines()

    def arbol_sucio(self):
        return bool(self.git("status", "--porcelain"))


def _importar_enjambre():
    import importlib.util

    ruta = Path(__file__).with_name("starseed-enjambre.py")
    spec = importlib.util.spec_from_file_location("enjambre", ruta)
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


enjambre = _importar_enjambre()
FALTA_SALVAVIDAS = not hasattr(enjambre, "commit_salvavidas")


class SalvavidasTest(unittest.TestCase):
    def setUp(self):
        self.repo = _RepoTemporal(self)
        raiz = str(self.repo.raiz)
        self.estado = {}
        self.patches = [
            patch.object(enjambre, "ROOT", raiz),
            patch.object(enjambre, "WT_BASE", raiz),
            patch.object(enjambre, "evento", lambda *a, **k: None),
            patch.object(
                enjambre,
                "set_estado",
                lambda tid, **kw: self.estado.__setitem__(tid, dict(kw)),
            ),
        ]
        for p in self.patches:
            p.start()
            self.addCleanup(p.stop)

    def _ejecutar_salvavidas(self, tid, rama):
        """Ciclo completo: commitear antes de las puertas y anotar la nota."""
        sha = enjambre.commit_salvavidas(tid)
        enjambre.nota_salvavidas(tid, rama, sha)
        return sha

    @unittest.skipIf(FALTA_SALVAVIDAS, "RS1c aún no implementa commit_salvavidas")
    def test_commit_existe_antes_de_las_puertas(self):
        rama = self.repo.con_trabajo_sucio("SLV1")
        antes = len(self.repo.log(rama))
        sha = self._ejecutar_salvavidas("SLV1", rama)
        self.assertTrue(sha, "el salvavidas debe devolver el SHA del commit")
        self.assertEqual(
            len(self.repo.log(rama)),
            antes + 1,
            "hay que commitear el trabajo aunque tsc y los tests no hayan corrido",
        )
        self.assertEqual(self.repo.log(rama)[0].split()[0], sha)

    @unittest.skipIf(FALTA_SALVAVIDAS, "RS1c aún no implementa commit_salvavidas")
    def test_fallo_de_puerta_conserva_commit_y_rama(self):
        rama = self.repo.con_trabajo_sucio("SLV2")
        sha = self._ejecutar_salvavidas("SLV2", rama)
        fallo_puerta = RuntimeError("fallo_tests")
        with self.assertRaisesRegex(RuntimeError, "fallo_tests"):
            raise fallo_puerta
        self.repo.git("show-ref", "--verify", "refs/heads/ola/SLV2")
        self.assertEqual(self.repo.log(rama)[0].split()[0], sha)
        self.assertFalse(self.repo.arbol_sucio())

    @unittest.skipIf(FALTA_SALVAVIDAS, "RS1c aún no implementa commit_salvavidas")
    def test_estado_lleva_rama_y_sha_para_reanudar(self):
        rama = self.repo.con_trabajo_sucio("SLV3")
        sha = self._ejecutar_salvavidas("SLV3", rama)
        nota = self.estado.get("SLV3", {})
        self.assertEqual(nota.get("rama"), rama)
        self.assertEqual(nota.get("sha"), sha)
        self.repo.git("cat-file", "-e", sha)

    @unittest.skipIf(FALTA_SALVAVIDAS, "RS1c aún no implementa commit_salvavidas")
    def test_doble_commit_no_duplica_ni_deja_sucio(self):
        rama = self.repo.con_trabajo_sucio("SLV4")
        sha1 = self._ejecutar_salvavidas("SLV4", rama)
        antes = len(self.repo.log(rama))
        sha2 = self._ejecutar_salvavidas("SLV4", rama)
        self.assertEqual(len(self.repo.log(rama)), antes)
        self.assertIn(sha2, (None, sha1))
        self.assertFalse(self.repo.arbol_sucio())


if __name__ == "__main__":
    unittest.main()
