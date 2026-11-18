# -*- coding: utf-8 -*-
"""Pruebas de maggabit_desarrollo.py (MAG1117).

Herméticas: no tocan /Volumes, la red, ~/.starseed ni el disco real; rsync
nunca se ejecuta de verdad (todo subprocess va inyectado como doble). La
prueba guardiana vigila que la lista única acompañe a cada copia y que las
claves solo aparezcan como exclusión, también de cara a la bóveda.
"""
import importlib.util
import os
import subprocess
import unittest

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(os.path.dirname(AQUI))
LISTA_UNICA = os.path.join(RAIZ, "config", "respaldo-exclusiones.txt")


def _cargar():
    ruta = os.path.join(AQUI, "maggabit_desarrollo.py")
    spec = importlib.util.spec_from_file_location("maggabit_desarrollo_prueba", ruta)
    assert spec is not None and spec.loader is not None
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


TEXTO = """\
# REGENERABLE: se reconstruye con npm install y builds.
node_modules/
.next/
# ARBOLES: worktrees que se regeneran desde main.
/starseed-wt/
/wt-*/
# CLAVES: secretos que nunca salen del origen.
.env
.env.*
!.env.example
*.pem
.credentials.json
"""


class LeerExclusiones(unittest.TestCase):
    def setUp(self):
        self.M = _cargar()

    def test_dict_por_seccion(self):
        d = self.M.leer_exclusiones(TEXTO)
        self.assertEqual(list(d), ["REGENERABLE", "ARBOLES", "CLAVES"])
        self.assertEqual(d["REGENERABLE"], ["node_modules/", ".next/"])
        self.assertEqual(d["ARBOLES"], ["/starseed-wt/", "/wt-*/"])
        self.assertEqual(d["CLAVES"],
                         [".env", ".env.*", "!.env.example", "*.pem", ".credentials.json"])

    def test_comentarios_y_lineas_vacias_no_cuentan(self):
        d = self.M.leer_exclusiones("# CLAVES: cabecera\n\n# nota interna\n.env\n")
        self.assertEqual(d["CLAVES"], [".env"])


class OrdenRsync(unittest.TestCase):
    def setUp(self):
        self.M = _cargar()
        self.d = self.M.leer_exclusiones(TEXTO)

    def test_argv_base(self):
        a = self.M.orden_rsync("/repo", "/disco/repo", self.d)
        self.assertEqual(a[0], "rsync")
        self.assertIn("-a", a)
        self.assertIn("--delete", a)
        self.assertEqual((a[-2], a[-1]), ("/repo", "/disco/repo"))

    def test_excepcion_antes_del_patron_que_la_cubre(self):
        a = self.M.orden_rsync("/repo", "/disco/repo", self.d)
        self.assertIn("--include=.env.example", a)
        self.assertLess(a.index("--include=.env.example"), a.index("--exclude=.env.*"))
        self.assertIn("--exclude=node_modules/", a)

    def test_con_ruta_sale_exclude_from(self):
        a = self.M.orden_rsync("/repo", "/disco/repo", LISTA_UNICA)
        self.assertIn("--exclude-from", a)
        self.assertEqual(a[a.index("--exclude-from") + 1], LISTA_UNICA)

    def test_limite_y_simulacro(self):
        a = self.M.orden_rsync("/repo", "/disco/repo", self.d, limite_kbps=512,
                               simulacro=True)
        self.assertIn("--bwlimit=512", a)
        self.assertIn("--dry-run", a)


class Resumen(unittest.TestCase):
    def setUp(self):
        self.M = _cargar()

    def test_rc_cero_es_ok(self):
        self.assertEqual(self.M.resumen("archivo.txt\n", 0)["estado"], "ok")

    def test_mkstempsock_de_un_socket_no_cuenta_como_fallo(self):
        salida = "rsync: mkstempsock /disco/.s failed: Function not implemented\n"
        r = self.M.resumen(salida, 23)
        self.assertEqual(r["estado"], "ok")
        self.assertEqual(len(r["avisos"]), 1)

    def test_fallo_de_verdad_es_fallo(self):
        self.assertEqual(self.M.resumen("rsync error: permiso\n", 2)["estado"], "fallo")

    def test_sin_respuesta(self):
        self.assertEqual(self.M.resumen("", "sin-respuesta")["estado"], "sin-respuesta")
        self.assertEqual(self.M.resumen("", None)["estado"], "sin-respuesta")


class Guardiana(unittest.TestCase):
    """La lista única acompaña a la copia y las claves solo salen como exclusión."""

    def setUp(self):
        self.M = _cargar()
        with open(LISTA_UNICA, encoding="utf-8") as f:
            self.d = self.M.leer_exclusiones(f.read())

    def test_secciones_completas_en_la_lista_real(self):
        for nombre in self.M.SECCIONES:
            self.assertTrue(self.d[nombre], "sección vacía: " + nombre)

    def test_todo_patron_de_claves_sale_en_la_orden_sin_cifrar(self):
        argv = " ".join(self.M.orden_rsync("/repo", "/disco/repo", self.d))
        for patron in self.d["CLAVES"]:
            # La excepción «!» es la única que viaja como --include.
            prefijo = "--include=" if patron.startswith("!") else "--exclude="
            self.assertIn(prefijo + patron.lstrip("!"), argv)

    def test_credentials_solo_aparece_como_exclusion(self):
        argv = self.M.orden_rsync("/repo", "/disco/repo", self.d)
        for argumento in argv:
            if ".credentials.json" in argumento:
                self.assertTrue(argumento.startswith("--exclude="), argumento)
        self.assertIn("--exclude=.credentials.json", argv)

    def test_ni_a_la_boveda(self):
        # La bóveda usaría la misma lista única: la credencial queda fuera igual.
        self.assertIn(".credentials.json", self.d["CLAVES"])
        argv = self.M.orden_rsync("/repo", "/disco/boveda", self.d)
        self.assertIn("--exclude=.credentials.json", argv)


class Respaldar(unittest.TestCase):
    def setUp(self):
        self.M = _cargar()
        self.llamadas = []

    def _ejecutar(self, argv, capture_output=False, text=False, timeout=None):
        self.llamadas.append((argv, timeout))

        class Hecho:
            stdout = "archivo.txt\n"
            stderr = ""
            returncode = 0
        return Hecho()

    def test_sin_disco_no_espera_ni_llama_a_rsync(self):
        r = self.M.respaldar("/repo", "/Volumes/Maggabit",
                             existe=lambda r: r != "/Volumes/Maggabit",
                             ejecutar=self._ejecutar)
        self.assertEqual(r["estado"], "sin-disco")
        self.assertEqual(self.llamadas, [])

    def test_sin_lista_no_copia(self):
        r = self.M.respaldar("/repo", "/disco/repo", exclusiones="/no/esta.txt",
                             existe=lambda r: r != "/no/esta.txt",
                             ejecutar=self._ejecutar)
        self.assertEqual(r["estado"], "sin-lista")
        self.assertEqual(self.llamadas, [])

    def test_copia_con_la_lista_unica_y_timeout(self):
        r = self.M.respaldar("/repo", "/disco/repo", exclusiones=LISTA_UNICA,
                             existe=lambda r: True, ejecutar=self._ejecutar)
        self.assertEqual(r["estado"], "ok")
        argv, timeout = self.llamadas[0]
        self.assertIn("--exclude-from", argv)
        self.assertTrue(timeout and timeout > 0)

    def test_volumen_sin_respuesta_no_se_cuelga(self):
        def colgado(argv, capture_output=False, text=False, timeout=0):
            raise subprocess.TimeoutExpired(argv, timeout)
        r = self.M.respaldar("/repo", "/disco/repo", exclusiones=LISTA_UNICA,
                             existe=lambda r: True, ejecutar=colgado)
        self.assertEqual(r["estado"], "sin-respuesta")


if __name__ == "__main__":
    unittest.main(verbosity=2)
