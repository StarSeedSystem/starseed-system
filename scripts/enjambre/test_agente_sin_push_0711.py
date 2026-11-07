# -*- coding: utf-8 -*-
"""0711 · Un agente no puede empujar a GitHub desde su worktree.

El 06-11 dos agentes hicieron `git push origin main` desde su worktree: un worktree
compartía las referencias del main vivo y su push publicaba main SIN las puertas de la
autopublicación. Los vetos de bash en la config de opencode se saltan con `bash -c`,
`timeout` o `git -C`; en cambio `GIT_CONFIG_<n> *pushInsteadOf*` es filesystem, llega
igual a todo hijo de cualquier hijo y solo reescribe el PUSH (el fetch no cambia).

Los Popen de `opencode(...)` y de Codex llevan el entorno pasado por
`entorno_sin_push(env)`: dict NUEVO con las suyas y tres entradas de configuración
al final. `entorno_hijo()` y `sh()` NO la llevan: el orquestador empuja él mismo
las ramas `comprobar/…` de la puerta tsc y eso debe seguir igual.
"""
import importlib.util
import inspect
import os
import subprocess
import sys
import tempfile
import unittest


RUTA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "starseed-enjambre.py")
ESPEC = importlib.util.spec_from_file_location("enjambre_sin_push", RUTA)
enjambre = importlib.util.module_from_spec(ESPEC)
sys.modules["enjambre_sin_push"] = enjambre
ESPEC.loader.exec_module(enjambre)

CLAVE_NOPUSH = "url.nopush://bloqueado-por-starseed/.pushInsteadOf"
VALORES_NOPUSH = ("https://github.com/", "git@github.com:", "ssh://git@github.com/")


def entradas_post(e, desde):
    """Las tres claves/valores que añadimos a partir del índice `desde`."""
    return [
        (e["GIT_CONFIG_KEY_%d" % i], e["GIT_CONFIG_VALUE_%d" % i])
        for i in range(desde, desde + len(VALORES_NOPUSH))
    ]


class EntornoSinPushTest(unittest.TestCase):
    def test_env_sin_count_sale_count_3_con_las_tres(self):
        e = enjambre.entorno_sin_push({"PATH": "/bin"})
        self.assertEqual(e["GIT_CONFIG_COUNT"], "3")
        self.assertEqual(entradas_post(e, 0), [(CLAVE_NOPUSH, v) for v in VALORES_NOPUSH])

    def test_env_con_count_2_conserva_las_suyas_y_las_nuevas_van_en_2_3_4(self):
        e = enjambre.entorno_sin_push(
            {
                "GIT_CONFIG_COUNT": "2",
                "GIT_CONFIG_KEY_0": "a.b.c",
                "GIT_CONFIG_VALUE_0": "x",
                "GIT_CONFIG_KEY_1": "d.e.f",
                "GIT_CONFIG_VALUE_1": "y",
            }
        )
        self.assertEqual(e["GIT_CONFIG_COUNT"], "5")
        self.assertEqual(e["GIT_CONFIG_KEY_0"], "a.b.c")
        self.assertEqual(e["GIT_CONFIG_VALUE_0"], "x")
        self.assertEqual(e["GIT_CONFIG_KEY_1"], "d.e.f")
        self.assertEqual(e["GIT_CONFIG_VALUE_1"], "y")
        self.assertEqual(entradas_post(e, 2), [(CLAVE_NOPUSH, v) for v in VALORES_NOPUSH])

    def test_el_env_de_entrada_no_se_toca(self):
        entrada = {"PATH": "/bin"}
        enjambre.entorno_sin_push(entrada)
        self.assertEqual(entrada, {"PATH": "/bin"})
        self.assertNotIn("GIT_CONFIG_COUNT", entrada)

    def test_count_no_numerico_empieza_en_0(self):
        e = enjambre.entorno_sin_push({"GIT_CONFIG_COUNT": "x"})
        self.assertEqual(e["GIT_CONFIG_COUNT"], "3")
        self.assertEqual(entradas_post(e, 0), [(CLAVE_NOPUSH, v) for v in VALORES_NOPUSH])


class GitDeVerdadTest(unittest.TestCase):
    """Repo temporal, sin red: el push debe morir ANTES de salir de la máquina."""

    def preparar_repo(self, tmp):
        def git(*args):
            return subprocess.run(
                ["git"] + list(args),
                cwd=tmp,
                capture_output=True,
                text=True,
                timeout=20,
            )

        self.assertEqual(git("init").returncode, 0)
        git("-c", "user.email=prueba@local", "-c", "user.name=prueba", "commit", "--allow-empty", "-m", "semilla")
        self.assertEqual(git("remote", "add", "origin", "https://github.com/ejemplo/repo.git").returncode, 0)
        return git

    def test_el_push_falla_con_nopush_y_la_url_del_remoto_sigue(self):
        with tempfile.TemporaryDirectory() as tmp:
            git = self.preparar_repo(tmp)
            res = subprocess.run(
                ["git", "push", "origin", "HEAD:main"],
                cwd=tmp,
                env=enjambre.entorno_sin_push(dict(os.environ)),
                capture_output=True,
                text=True,
                timeout=20,
            )
            self.assertNotEqual(res.returncode, 0)
            self.assertIn("nopush", res.stderr + res.stdout)
            url = git("remote", "get-url", "origin")
            self.assertEqual(url.returncode, 0)
            self.assertIn("https://github.com/", url.stdout)


class CableadoTest(unittest.TestCase):
    """La función vive SOLO en los Popen de los motores de escritura, no en sh()."""

    def test_popen_de_opencode_y_de_codex_llevan_el_veto(self):
        self.assertIn("entorno_sin_push(", inspect.getsource(enjambre.opencode))
        self.assertIn("entorno_sin_push(", inspect.getsource(enjambre.escribir_con_codex))

    def test_entorno_hijo_y_sh_no_lo_llevan(self):
        self.assertNotIn("entorno_sin_push(", inspect.getsource(enjambre.entorno_hijo))
        self.assertNotIn("entorno_sin_push(", inspect.getsource(enjambre.sh))
