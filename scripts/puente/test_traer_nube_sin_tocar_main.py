"""traer_nube comprueba lo que llega de la nube en una carpeta aparte: main solo avanza si pasa (2026-10-12).

Antes: cherry-pick en main + `reset --keep` si no pasaba → main subía y bajaba cada 30 min, el revisor
daba por integradas tareas que no lo estaban y las tareas nuevas nacían con commits sin comprobar.
"""
import os
import shutil
import subprocess
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import traer_nube as T  # noqa: E402


def _git(cwd, *args):
    return subprocess.run(["git", *args], cwd=cwd, capture_output=True, text=True, check=True).stdout.strip()


class Puras(unittest.TestCase):
    def test_fallo_del_medio(self):
        self.assertTrue(T.es_fallo_del_medio("tsc: <--- JS stacktrace ---> FATAL ERROR: heap out of memory"))
        self.assertTrue(T.es_fallo_del_medio("tsc: …ExecutionCallbackInfo const&)>) node::LoadEnvironment"))
        self.assertTrue(T.es_fallo_del_medio("se pasó de 1800 s sin terminar"))
        self.assertFalse(T.es_fallo_del_medio("tsc: src/a.ts(3,1): error TS2304: Cannot find name 'x'."))

    def test_tsc_solo_si_cambia_ts(self):
        self.assertEqual(T.archivos_ts(["scripts/puente/x.py", "architecture/a.md"]), [])
        self.assertEqual(T.archivos_ts(["src/a.tsx", "package.json", "x.py"]), ["src/a.tsx", "package.json"])

    def test_pruebas_python(self):
        hay = {"scripts/puente/test_x.py", "scripts/puente/test_y.py"}.__contains__
        self.assertEqual(T.pruebas_python(["scripts/puente/x.py", "scripts/puente/test_y.py", "scripts/puente/z.py",
                                           "src/a.ts"], hay),
                         ["scripts/puente/test_x.py", "scripts/puente/test_y.py"])


class TraerSinTocarMain(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        self.raiz = os.path.join(self.dir, "repo")
        os.makedirs(self.raiz)
        _git(self.raiz, "init", "-q", "-b", "main")
        _git(self.raiz, "config", "user.email", "prueba@starseed.local")
        _git(self.raiz, "config", "user.name", "Prueba")
        with open(os.path.join(self.raiz, "a.txt"), "w") as f:
            f.write("uno\n")
        _git(self.raiz, "add", "a.txt")
        _git(self.raiz, "commit", "-q", "-m", "base")
        self.base = _git(self.raiz, "rev-parse", "HEAD")
        _git(self.raiz, "checkout", "-q", "-b", "nube/x")
        with open(os.path.join(self.raiz, "b.txt"), "w") as f:
            f.write("dos\n")
        _git(self.raiz, "add", "b.txt")
        _git(self.raiz, "commit", "-q", "-m", "Ola 1 · X1: algo")
        self.sha = _git(self.raiz, "rev-parse", "HEAD")
        _git(self.raiz, "checkout", "-q", "main")
        self.antes = (T.RAIZ, T.CARPETA_COMPROBAR, T._puertas, T.CERROJOS)
        T.RAIZ = self.raiz
        T.CERROJOS = os.path.join(self.dir, "cerrojos")
        T.CARPETA_COMPROBAR = os.path.join(self.dir, "_traer")
        self.fila = {"tid": "X1", "rama": "nube/x", "commits": [{"sha": self.sha, "tipo": "ola", "nuevo": True, "vacio": False}]}

    def tearDown(self):
        T.RAIZ, T.CARPETA_COMPROBAR, T._puertas, T.CERROJOS = self.antes
        shutil.rmtree(self.dir, ignore_errors=True)

    def test_si_no_pasa_main_no_se_mueve_nunca(self):
        vistos = []

        def puertas(base_sha, shas, cambiados, cwd=None):
            vistos.append(_git(self.raiz, "rev-parse", "main"))  # durante la comprobación
            return False, "tsc: src/a.ts(1,1): error TS2304"

        T._puertas = puertas
        ok, detalle, medio = T._traer(self.fila)
        self.assertFalse(ok)
        self.assertFalse(medio)
        self.assertEqual(vistos, [self.base])  # main quieto MIENTRAS se comprobaba
        self.assertEqual(_git(self.raiz, "rev-parse", "main"), self.base)
        self.assertFalse(os.path.exists(os.path.join(T.CARPETA_COMPROBAR, "X1")))

    def test_si_pasa_main_avanza_por_fast_forward(self):
        T._puertas = lambda base_sha, shas, cambiados, cwd=None: (True, "verde")
        ok, detalle, medio = T._traer(self.fila)
        self.assertTrue(ok, detalle)
        self.assertEqual(_git(self.raiz, "log", "-1", "--format=%s", "main"), "Ola 1 · X1: algo")
        self.assertEqual(_git(self.raiz, "rev-parse", "main~1"), self.base)

    def test_si_main_avanza_con_otra_cosa_se_reaplica_encima(self):
        def puertas(base_sha, shas, cambiados, cwd=None):
            # Mientras se comprueba, el orquestador integra otra tarea en main (otro archivo).
            with open(os.path.join(self.raiz, "c.txt"), "w") as f:
                f.write("tres\n")
            _git(self.raiz, "add", "c.txt")
            _git(self.raiz, "commit", "-q", "-m", "Ola 2 · Y1: otra")
            return True, "verde"

        T._puertas = puertas
        ok, detalle, medio = T._traer(self.fila)
        self.assertTrue(ok, detalle)
        asuntos = _git(self.raiz, "log", "--format=%s", "main").splitlines()
        self.assertEqual(asuntos[:2], ["Ola 1 · X1: algo", "Ola 2 · Y1: otra"])

    def test_si_main_avanza_tocando_lo_mismo_se_reintenta(self):
        def puertas(base_sha, shas, cambiados, cwd=None):
            with open(os.path.join(self.raiz, "b.txt"), "w") as f:
                f.write("otro\n")
            _git(self.raiz, "add", "b.txt")
            _git(self.raiz, "commit", "-q", "-m", "Ola 2 · Y1: lo mismo")
            return True, "verde"

        T._puertas = puertas
        antes = None
        ok, detalle, medio = T._traer(self.fila)
        self.assertFalse(ok)
        self.assertTrue(medio)
        self.assertEqual(_git(self.raiz, "log", "-1", "--format=%s", "main"), "Ola 2 · Y1: lo mismo")
        self.assertIsNone(antes)

    def test_reaplicable(self):
        self.assertTrue(T.reaplicable(["src/a.ts"], ["scripts/puente/x.py"]))
        self.assertFalse(T.reaplicable(["src/a.ts"], ["src/b.ts"]))
        self.assertFalse(T.reaplicable(["scripts/x.py"], ["scripts/x.py"]))
        self.assertTrue(T.reaplicable(["scripts/x.py"], ["scripts/y.py"]))

    def test_main_ocupado_es_del_medio_y_no_lo_toca(self):
        import fcntl

        T._puertas = lambda base_sha, shas, cambiados, cwd=None: (True, "verde")
        os.makedirs(T.CERROJOS, exist_ok=True)
        f = open(os.path.join(T.CERROJOS, "integrar.lock"), "a")
        fcntl.flock(f, fcntl.LOCK_EX)  # otro integra (el orquestador, una publicación)
        try:
            ok, detalle, medio = T._traer(self.fila, espera_integrar_s=1)
        finally:
            fcntl.flock(f, fcntl.LOCK_UN)
            f.close()
        self.assertFalse(ok)
        self.assertTrue(medio)
        self.assertIn("ocupado", detalle)
        self.assertEqual(_git(self.raiz, "rev-parse", "main"), self.base)

    def test_falta_de_memoria_es_del_medio(self):
        T._puertas = lambda base_sha, shas, cambiados, cwd=None: (False, "tsc: FATAL ERROR: Reached heap limit … heap out of memory")
        ok, detalle, medio = T._traer(self.fila)
        self.assertFalse(ok)
        self.assertTrue(medio)
        self.assertEqual(_git(self.raiz, "rev-parse", "main"), self.base)


if __name__ == "__main__":
    unittest.main()
