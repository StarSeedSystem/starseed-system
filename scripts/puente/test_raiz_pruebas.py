# -*- coding: utf-8 -*-
"""TMP1113B · cada corrida de pruebas deja su carpeta temporal vacía al salir (pase, falle o se interrumpa)."""
import os
import signal
import subprocess
import sys
import tempfile
import textwrap
import unittest

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
if DIRECTORIO not in sys.path:
    sys.path.insert(0, DIRECTORIO)
import raiz_pruebas as RP  # noqa: E402

# Un hijo que abre la raíz, ensucia el temporal como lo hacen las pruebas (tempfile, mkdtemp, subcarpetas con
# permisos raros) y termina como se le pida.
HIJO = textwrap.dedent('''
    import os, sys, tempfile, signal
    sys.path.insert(0, %r)
    import raiz_pruebas as RP
    RP.abrir()
    assert tempfile.gettempdir() == os.environ["TMPDIR"], (tempfile.gettempdir(), os.environ["TMPDIR"])
    d = tempfile.mkdtemp(prefix="potenciar-pruebas-")
    os.makedirs(os.path.join(d, "a", "b"))
    open(os.path.join(d, "a", "b", "f.txt"), "w").write("x")
    os.chmod(os.path.join(d, "a"), 0o500)          # una prueba que deja una carpeta sin permiso de escritura
    with tempfile.NamedTemporaryFile(delete=False): pass
    modo = sys.argv[1]
    if modo == "ok":
        sys.exit(0)
    if modo == "fallo":
        raise RuntimeError("una prueba rota")
    if modo == "ctrl-c":
        raise KeyboardInterrupt
    if modo == "sigterm":
        os.kill(os.getpid(), signal.SIGTERM)
        import time; time.sleep(30)
''' % DIRECTORIO)


def _borrar(ruta):
    subprocess.run(["chmod", "-R", "u+rwx", ruta])
    subprocess.run(["rm", "-rf", ruta])


def _hijo(base, modo):
    env = dict(os.environ, TMPDIR=base)
    env.pop(RP.VAR_RAIZ, None)
    return subprocess.run([sys.executable, "-I", "-c", HIJO, modo], env=env, capture_output=True, text=True, timeout=60)


class RaizPorProceso(unittest.TestCase):
    def setUp(self):
        self.base = tempfile.mkdtemp(prefix="base-prueba-raiz-")
        self.addCleanup(_borrar, self.base)

    def _restos(self):
        return sorted(os.listdir(self.base))

    def test_si_pasa_no_deja_nada(self):
        r = _hijo(self.base, "ok")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(self._restos(), [])

    def test_si_falla_no_deja_nada(self):
        r = _hijo(self.base, "fallo")
        self.assertNotEqual(r.returncode, 0)
        self.assertEqual(self._restos(), [])

    def test_si_se_interrumpe_con_ctrl_c_no_deja_nada(self):
        r = _hijo(self.base, "ctrl-c")
        self.assertNotEqual(r.returncode, 0)
        self.assertEqual(self._restos(), [])

    def test_si_lo_matan_con_sigterm_no_deja_nada(self):
        r = _hijo(self.base, "sigterm")
        self.assertEqual(r.returncode, 128 + signal.SIGTERM, r.stderr)
        self.assertEqual(self._restos(), [])

    def test_una_corrida_muerta_a_la_fuerza_se_barre_en_la_siguiente(self):
        # SIGKILL no se puede atrapar: la raíz queda, con el pid del muerto; la siguiente corrida la quita.
        huerfana = os.path.join(self.base, "%s%d-abcd" % (RP.PREFIJO, 2 ** 22 + 12345))
        os.makedirs(os.path.join(huerfana, "x"))
        viva = os.path.join(self.base, "%s%d-beef" % (RP.PREFIJO, os.getpid()))
        os.makedirs(viva)
        ajena = os.path.join(self.base, "tmpAJENA123")   # lo que no es nuestro no se toca nunca
        os.makedirs(ajena)
        n = RP.barrer_huerfanas(self.base, vivo=lambda pid: pid == os.getpid())
        self.assertEqual(n, 1)
        self.assertEqual(self._restos(), sorted(["tmpAJENA123", os.path.basename(viva)]))

    def test_quitar_solo_borra_raices_propias(self):
        ajena = os.path.join(self.base, "datos-de-alguien")
        os.makedirs(ajena)
        self.assertFalse(RP.quitar(ajena))
        self.assertTrue(os.path.isdir(ajena))
        enlace = os.path.join(self.base, RP.PREFIJO + "1-enlace")
        os.symlink(ajena, enlace)
        self.assertFalse(RP.quitar(enlace))       # un enlace nunca se sigue
        self.assertTrue(os.path.isdir(ajena))

    def test_una_ruta_fuera_de_la_raiz_sigue_funcionando(self):
        fuera = tempfile.mkdtemp(prefix="fuera-", dir=self.base)   # un test que pide su propio `dir=`
        hijo = ("import sys; sys.path.insert(0, %r); import raiz_pruebas as RP; RP.abrir(); import os; "
                "assert os.path.isdir(%r)" % (DIRECTORIO, fuera))
        env = dict(os.environ, TMPDIR=self.base)
        r = subprocess.run([sys.executable, "-I", "-c", hijo], env=env, capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertTrue(os.path.isdir(fuera))


class NombreCortoParaLosSockets(unittest.TestCase):
    """En macOS un socket UNIX admite 103 caracteres de ruta y el temporal del usuario ya ocupa ~47-49."""
    BASE_MAC = 49          # largo de `/var/folders/xx/<28>/T`, con margen
    PID5 = 99999

    def test_el_nombre_de_la_raiz_no_pasa_de_14_caracteres_con_pid_de_5_cifras(self):
        raiz = RP.crear(tempfile.mkdtemp(prefix="b-"))
        self.addCleanup(_borrar, os.path.dirname(raiz))
        nombre = os.path.basename(raiz)
        self.assertRegex(nombre, r"^ssp-\d+-[0-9a-f]{4}$")
        self.assertLessEqual(len("%s%d-%s" % (RP.PREFIJO, self.PID5, "abcd")), 14)
        self.assertLessEqual(len(nombre) - len(str(os.getpid())) + 5, 14, "alargaste el nombre de la raíz")

    def test_un_socket_a_la_profundidad_de_automejora_dentro_cabe_en_103(self):
        import socket
        # Base de 49 caracteres como en macOS, raíz con pid de 5 cifras, tmpXXXXXXXX y pasarela-falsa.sock.
        base = tempfile.mkdtemp(prefix="b-", dir="/tmp" if os.path.isdir("/tmp") else None)   # corta, fuera de la raíz
        self.addCleanup(_borrar, base)
        if len(base) > self.BASE_MAC - 2:
            self.skipTest("no hay una carpeta base corta para simular los 49 caracteres de macOS")
        largo = os.path.join(base, "x" * (self.BASE_MAC - len(base) - 1))
        self.assertEqual(len(largo), self.BASE_MAC)
        os.makedirs(largo)
        raiz = os.path.join(largo, "%s%d-abcd" % (RP.PREFIJO, self.PID5))
        carpeta = os.path.join(raiz, "tmpab12cd34")
        os.makedirs(carpeta)
        ruta = os.path.join(carpeta, "pasarela-falsa.sock")
        self.assertLessEqual(len(ruta), 103 - 7, len(ruta))      # con 7 de margen: pymp/listener pesa lo mismo
        try:
            s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        except (AttributeError, OSError):
            self.skipTest("sin sockets UNIX")
        self.addCleanup(s.close)
        if len(ruta) > 103:
            self.skipTest("la carpeta de pruebas de Linux ya es más larga que la de macOS")
        s.bind(ruta)

    def test_el_listener_de_multiprocessing_cabe(self):
        raiz = os.path.join("x" * (self.BASE_MAC - 1), "%s%d-abcd" % (RP.PREFIJO, self.PID5))
        listener = os.path.join(raiz, "pymp-abcd1234", "listener-abcd1234")
        self.assertLessEqual(len(listener), 103 - 7, len(listener))


class RaizAlrededorDeUnHijo(unittest.TestCase):
    def setUp(self):
        self.base = tempfile.mkdtemp(prefix="base-prueba-hijo-")
        self.addCleanup(_borrar, self.base)
        self.env = dict(os.environ, TMPDIR=self.base)
        self.env.pop(RP.VAR_RAIZ, None)

    def test_el_hijo_escribe_en_la_raiz_y_se_va_con_ella(self):
        codigo = "import tempfile,os; d=tempfile.mkdtemp(); open(os.path.join(d,'f'),'w').write('x'); print(d)"
        r = RP.correr_con_raiz([sys.executable, "-I", "-c", codigo], env=self.env, capture_output=True, text=True)
        self.assertEqual(r.returncode, 0)
        self.assertTrue(os.path.basename(os.path.dirname(r.stdout.strip())).startswith(RP.PREFIJO), r.stdout)
        self.assertEqual(os.listdir(self.base), [])

    def test_si_el_hijo_falla_tambien_se_quita(self):
        r = RP.correr_con_raiz([sys.executable, "-I", "-c", "import tempfile,sys; tempfile.mkdtemp(); sys.exit(3)"],
                               env=self.env, capture_output=True, text=True)
        self.assertEqual(r.returncode, 3)
        self.assertEqual(os.listdir(self.base), [])

    def test_si_se_interrumpe_o_se_pasa_del_tiempo_tambien_se_quita(self):
        for excepcion in (KeyboardInterrupt(), subprocess.TimeoutExpired(["x"], 1)):
            def correr(orden, env=None, **_k):
                with open(os.path.join(env["TMPDIR"], "resto"), "w") as f:
                    f.write("x")
                raise excepcion
            with self.assertRaises(type(excepcion)):
                RP.correr_con_raiz(["x"], env=self.env, correr=correr)
            self.assertEqual(os.listdir(self.base), [])

    def test_unittest_y_vitest_de_verdad_comparten_el_mecanismo(self):
        # Un `python -m unittest` corrido por el lanzador deja el temporal vacío aunque su prueba no limpie.
        carpeta = tempfile.mkdtemp(prefix="proy-", dir=self.base)
        with open(os.path.join(carpeta, "test_sucia.py"), "w") as f:
            f.write("import tempfile, unittest\nclass T(unittest.TestCase):\n"
                    "    def test_x(self):\n        tempfile.mkdtemp(prefix='cupo-codex-')\n")
        r = RP.correr_con_raiz([sys.executable, "-m", "unittest", "discover", "-s", carpeta], env=self.env,
                               capture_output=True, text=True, cwd=carpeta)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(os.listdir(self.base), [os.path.basename(carpeta)])

    def test_si_ya_hay_raiz_del_padre_no_abre_otra(self):
        padre = RP.crear(self.base)
        env = RP.entorno_con_raiz(self.env, padre)
        vistas = []
        RP.correr_con_raiz(["x"], env=env, correr=lambda o, env=None, **k: vistas.append(env[RP.VAR_RAIZ]))
        self.assertEqual(vistas, [padre])
        self.assertTrue(os.path.isdir(padre))
        RP.quitar(padre)

    def test_el_lanzador_de_linea_de_ordenes(self):
        r = subprocess.run([sys.executable, os.path.join(DIRECTORIO, "raiz_pruebas.py"), "--", sys.executable, "-I",
                            "-c", "import tempfile; tempfile.mkdtemp(); tempfile.mkstemp()"],
                           env=self.env, capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(os.listdir(self.base), [])


class RaizConPytestDeVerdad(unittest.TestCase):
    """Un `pytest` escrito a mano con el conftest del patrón (los de scripts/puente y scripts/enjambre) limpia."""

    def test_pytest_con_una_prueba_que_falla_deja_el_temporal_vacio(self):
        try:
            import pytest  # noqa: F401
        except ImportError:
            self.skipTest("pytest no está instalado")
        base = tempfile.mkdtemp(prefix="base-pytest-")
        self.addCleanup(_borrar, base)
        proy = tempfile.mkdtemp(prefix="proy-", dir=base)
        with open(os.path.join(proy, "conftest.py"), "w") as f:
            f.write("import sys\nsys.path.insert(0, %r)\nimport raiz_pruebas\nraiz_pruebas.abrir()\n" % DIRECTORIO)
        with open(os.path.join(proy, "test_x.py"), "w") as f:
            f.write("import tempfile\n\ndef test_ensucia(tmp_path):\n    tempfile.mkdtemp(prefix='enj-alcance-')\n"
                    "    (tmp_path / 'a').write_text('x')\n\ndef test_rota():\n    tempfile.mkdtemp()\n    assert False\n")
        env = dict(os.environ, TMPDIR=base)
        env.pop(RP.VAR_RAIZ, None)
        r = subprocess.run([sys.executable, "-m", "pytest", "-q", "-p", "no:cacheprovider", proy], env=env,
                           capture_output=True, text=True, cwd=proy, timeout=120)
        self.assertEqual(r.returncode, 1, r.stdout[-400:])    # una falla de verdad
        self.assertEqual(os.listdir(base), [os.path.basename(proy)], os.listdir(base))


if __name__ == "__main__":
    unittest.main()
