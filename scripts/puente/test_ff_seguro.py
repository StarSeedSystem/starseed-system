"""SUP0811B · ff_seguro: un `git merge --ff-only` que muere en el cerrojo de la referencia no deja main
a medias (07-11, 18:10: el del orquestador con CTR1107D-d3 paró el enjambre, el reconstructor y
traer_nube unas 5 h). Repos de git de verdad en un temporal; nada de la Mac."""
import os
import subprocess
import tempfile
import unittest
from unittest.mock import patch

import ff_seguro as F

ENTORNO = {"GIT_CONFIG_NOSYSTEM": "1", "GIT_CONFIG_GLOBAL": os.devnull, "GIT_TERMINAL_PROMPT": "0"}


def g(raiz, *args):
    r = subprocess.run(["git", *args], cwd=raiz, capture_output=True, text=True)
    if r.returncode:
        raise AssertionError("git %s: %s" % (" ".join(args), r.stdout + r.stderr))
    return r.stdout


class Repo:
    """main con a.txt, c.txt y z.txt; la rama ola/T cambia a.txt, añade n.txt y quita c.txt."""

    def __init__(self, raiz):
        self.raiz = raiz
        g(raiz, "init", "-q", "-b", "main")
        for clave, valor in (("user.email", "prueba@starseed.invalid"), ("user.name", "prueba"),
                             ("core.hooksPath", os.devnull), ("gc.auto", "0")):
            g(raiz, "config", clave, valor)
        self.escribir("a.txt", "uno\n")
        self.escribir("c.txt", "ce\n")
        self.escribir("z.txt", "zeta\n")
        g(raiz, "add", "-A")
        g(raiz, "commit", "-q", "-m", "base")
        self.base = self.cabeza()
        g(raiz, "checkout", "-q", "-b", "ola/T")
        self.escribir("a.txt", "dos\n")
        self.escribir("n.txt", "nuevo\n")
        os.remove(os.path.join(raiz, "c.txt"))
        g(raiz, "add", "-A")
        g(raiz, "commit", "-q", "-m", "tarea T")
        self.rama = self.cabeza()
        g(raiz, "checkout", "-q", "main")

    def escribir(self, ruta, texto):
        with open(os.path.join(self.raiz, ruta), "w", encoding="utf-8") as f:
            f.write(texto)

    def leer(self, ruta):
        completa = os.path.join(self.raiz, ruta)
        if not os.path.exists(completa):
            return None
        with open(completa, encoding="utf-8") as f:
            return f.read()

    def estado(self):
        return g(self.raiz, "status", "--porcelain").splitlines()

    def cabeza(self):
        return g(self.raiz, "rev-parse", "HEAD").strip()

    def cerrojo_de_main(self):
        """Lo que deja el `pack-refs` de un `gc --auto` (u otro `update-ref`) mientras escribe la referencia."""
        ruta = os.path.join(self.raiz, ".git", "refs", "heads", "main.lock")
        open(ruta, "w").close()
        return ruta


class FFSeguro(unittest.TestCase):
    def setUp(self):
        self._entorno = patch.dict(os.environ, ENTORNO)
        self._entorno.start()
        self._tmp = tempfile.TemporaryDirectory()
        self.r = Repo(self._tmp.name)

    def tearDown(self):
        self._tmp.cleanup()
        self._entorno.stop()

    def test_git_deja_main_a_medias_si_muere_en_el_cerrojo_de_la_referencia(self):
        """La causa: el merge de siempre escribe el árbol y el índice y luego no puede mover la cabeza."""
        self.r.cerrojo_de_main()
        rc, _ = F.git_simple(self.r.raiz, ["merge", "--ff-only", "ola/T"])
        self.assertNotEqual(rc, 0)
        self.assertEqual(self.r.cabeza(), self.r.base)
        self.assertEqual(self.r.leer("a.txt"), "dos\n")
        self.assertTrue(self.r.estado(), "git dejó main sucio con lo de la rama")

    def test_devuelve_a_la_cabeza_lo_que_el_merge_dejo_escrito(self):
        self.r.cerrojo_de_main()
        esperas = []
        rc, salida = F.avanzar_ff(self.r.raiz, "ola/T", reintentos=1, dormir=esperas.append)
        self.assertNotEqual(rc, 0)
        self.assertEqual(self.r.cabeza(), self.r.base)
        self.assertEqual(self.r.estado(), [], "main limpio: nada ajeno para el orquestador ni el reconstructor")
        self.assertEqual((self.r.leer("a.txt"), self.r.leer("c.txt"), self.r.leer("n.txt")), ("uno\n", "ce\n", None))
        self.assertIn("[ff_seguro] devueltos a la cabeza 3 archivo(s)", salida)
        self.assertEqual(len(esperas), 1, "un cerrojo se repite una vez con reintentos=1")

    def test_repite_cuando_se_suelta_el_cerrojo_y_entra(self):
        cerrojo = self.r.cerrojo_de_main()
        rc, salida = F.avanzar_ff(self.r.raiz, "ola/T", reintentos=2, dormir=lambda _s: os.remove(cerrojo))
        self.assertEqual(rc, 0, salida)
        self.assertEqual(self.r.cabeza(), self.r.rama)
        self.assertEqual(self.r.estado(), [])
        self.assertIn("repito el merge (1 de 2)", salida)

    def test_no_toca_lo_que_no_escribio_el_merge(self):
        """Un cambio sin commit de otro archivo sigue igual tras devolver lo del merge."""
        self.r.escribir("z.txt", "de otro\n")
        self.r.cerrojo_de_main()
        rc, _ = F.avanzar_ff(self.r.raiz, "ola/T", reintentos=0, dormir=lambda _s: None)
        self.assertNotEqual(rc, 0)
        self.assertEqual(self.r.estado(), [" M z.txt"])
        self.assertEqual(self.r.leer("z.txt"), "de otro\n")

    def test_un_tercer_contenido_en_una_ruta_de_la_rama_no_se_toca(self):
        """Si a.txt tiene un cambio de otro, git ni empieza y avanzar_ff no lo pisa."""
        self.r.escribir("a.txt", "de otro\n")
        rc, salida = F.avanzar_ff(self.r.raiz, "ola/T", reintentos=2, dormir=lambda _s: self.fail("no es cerrojo"))
        self.assertNotEqual(rc, 0)
        self.assertEqual(self.r.cabeza(), self.r.base)
        self.assertEqual(self.r.leer("a.txt"), "de otro\n")
        self.assertIn("[ff_seguro] 1 ruta(s) con contenido de otro, sin tocar: a.txt", salida)

    def test_sin_fallo_es_el_merge_de_siempre(self):
        rc, salida = F.avanzar_ff(self.r.raiz, "ola/T", extra=("-q",))
        self.assertEqual(rc, 0, salida)
        self.assertEqual(self.r.cabeza(), self.r.rama)
        self.assertNotIn("[ff_seguro]", salida)

    def test_si_la_cabeza_se_movio_no_toca_nada(self):
        cabezas = iter(["aaa\n", "bbb\n"])
        llamadas = []

        def git_falso(_raiz, args, timeout=120):
            llamadas.append(args[0])
            if args[:2] == ["rev-parse", "HEAD"]:
                return 0, next(cabezas)
            if args[0] == "merge":
                return 128, "fatal: update_ref failed for ref 'HEAD': cannot lock ref 'HEAD'"
            raise AssertionError("no debía llamar a git %s" % args)

        rc, salida = F.avanzar_ff("/no/existe", "ola/T", git=git_falso, dormir=lambda _s: self.fail("no repite"))
        self.assertEqual(rc, 128)
        self.assertIn("la cabeza se movió", salida)
        self.assertNotIn("restore", llamadas)

    def test_es_fallo_de_cerrojo(self):
        self.assertTrue(F.es_fallo_de_cerrojo(
            "fatal: update_ref failed for ref 'HEAD': cannot lock ref 'HEAD': Unable to create "
            "'/r/.git/refs/heads/main.lock': File exists."))
        self.assertTrue(F.es_fallo_de_cerrojo("fatal: Unable to create '/r/.git/index.lock': File exists."))
        self.assertFalse(F.es_fallo_de_cerrojo(
            "error: Your local changes to the following files would be overwritten by merge:"))
        self.assertFalse(F.es_fallo_de_cerrojo("fatal: Not possible to fast-forward, aborting."))
        self.assertFalse(F.es_fallo_de_cerrojo(""))


class Cableado(unittest.TestCase):
    """El orquestador y traer_nube avanzan main con ff_seguro (los dos merges --ff-only que corren siempre)."""

    def test_traer_nube_avanza_main_con_ff_seguro(self):
        import traer_nube
        with patch.object(F, "avanzar_ff", return_value=(0, "ok")) as avanzar:
            self.assertEqual(traer_nube._avanzar_main_ff("abc123"), (0, "ok"))
        self.assertEqual(avanzar.call_args.args[1], "abc123")
        self.assertEqual(avanzar.call_args.kwargs["extra"], ("-q",))

    def test_el_orquestador_integra_con_ff_seguro(self):
        import importlib.util
        import sys
        raiz = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        ruta = os.path.join(raiz, "scripts", "enjambre", "starseed-enjambre.py")
        with open(ruta, encoding="utf-8") as f:
            fuente = f.read()
        self.assertNotIn('["git", "merge", "--ff-only", "ola/" + tid], cwd=ROOT', fuente,
                         "el merge de la integración va por merge_ff_en_main")
        with patch.dict(os.environ, {"STARSEED_ROOT": raiz}):
            if os.path.join(raiz, "scripts", "enjambre") not in sys.path:
                sys.path.insert(0, os.path.join(raiz, "scripts", "enjambre"))
            spec = importlib.util.spec_from_file_location("starseed_enjambre_ff", ruta)
            enjambre = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(enjambre)
        with patch.object(F, "avanzar_ff", return_value=(0, "ok")) as avanzar:
            self.assertEqual(enjambre.merge_ff_en_main("ola/X"), (0, "ok"))
        self.assertEqual(avanzar.call_args.args[1], "ola/X")


if __name__ == "__main__":
    unittest.main()
