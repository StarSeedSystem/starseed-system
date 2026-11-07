# -*- coding: utf-8 -*-
"""(0711) Un agente no puede empujar a GitHub desde su worktree.

El 06-11 dos agentes hicieron `git push origin main` desde su worktree y otro
corrió `pkill -f starseed-enjambre.py`. Los vetos de bash de opencode se saltan
con `bash -c`, `timeout` o `git -C`. Este test fija `entorno_sin_push(env)`: un
entorno NUEVO donde git reescribe cualquier URL de GitHub a un remoto inexistente,
de forma que `git push` hacia GitHub falla al instante y `git fetch` no cambia.
"""
import importlib.util
import os
import re
import shutil
import subprocess
import sys
import tempfile
import unittest


CLAVE_ENTRADA = "url.nopush://bloqueado-por-starseed/.pushInsteadOf"
VALORES = ("https://github.com/", "git@github.com:", "ssh://git@github.com/")

RUTA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "starseed-enjambre.py")
ESPEC = importlib.util.spec_from_file_location("enjambre_sin_push_0711", RUTA)
enjambre = importlib.util.module_from_spec(ESPEC)
sys.modules["enjambre_sin_push_0711"] = enjambre
ESPEC.loader.exec_module(enjambre)


class EntornoSinPushTest(unittest.TestCase):
    def test_sin_count_salen_tres_entradas_nuevas(self):
        """(a) env sin GIT_CONFIG_COUNT → COUNT=3 y las tres claves/valores."""
        e = {"PATH": "/bin", "HOME": "/tmp"}
        salida = enjambre.entorno_sin_push(e)
        self.assertEqual(salida["GIT_CONFIG_COUNT"], "3")
        for i, valor in enumerate(VALORES):
            self.assertEqual(salida["GIT_CONFIG_KEY_%d" % i], CLAVE_ENTRADA)
            self.assertEqual(salida["GIT_CONFIG_VALUE_%d" % i], valor)

    def test_count_dos_conserva_previas_y_aniade_244(self):
        """(b) COUNT=2 con KEY_0/KEY_1 previas: se conservan y las nuevas van en 2, 3 y 4."""
        e = {
            "GIT_CONFIG_COUNT": "2",
            "GIT_CONFIG_KEY_0": "core.pager",
            "GIT_CONFIG_VALUE_0": "less",
            "GIT_CONFIG_KEY_1": "user.name",
            "GIT_CONFIG_VALUE_1": "Alex",
        }
        salida = enjambre.entorno_sin_push(e)
        self.assertEqual(salida["GIT_CONFIG_COUNT"], "5")
        self.assertEqual(salida["GIT_CONFIG_KEY_0"], "core.pager")
        self.assertEqual(salida["GIT_CONFIG_VALUE_0"], "less")
        self.assertEqual(salida["GIT_CONFIG_KEY_1"], "user.name")
        for i, valor in enumerate(VALORES):
            self.assertEqual(salida["GIT_CONFIG_KEY_%d" % (i + 2)], CLAVE_ENTRADA)
            self.assertEqual(salida["GIT_CONFIG_VALUE_%d" % (i + 2)], valor)

    def test_el_dict_de_entrada_no_cambia(self):
        """(c) función PURA: el env recibido queda intacto."""
        e = {"GIT_CONFIG_COUNT": "2", "GIT_CONFIG_KEY_0": "user.email"}
        copia = dict(e)
        enjambre.entorno_sin_push(e)
        self.assertEqual(e, copia)

    def test_count_no_entero_ko_empieza_en_cero(self):
        """(d) COUNT=«x» o suelto (entero < 0) → se empieza en 0 (COUNT=3)."""
        self.assertEqual(enjambre.entorno_sin_push({"GIT_CONFIG_COUNT": "x"})["GIT_CONFIG_COUNT"], "3")
        self.assertEqual(enjambre.entorno_sin_push({"GIT_CONFIG_COUNT": "-1"})["GIT_CONFIG_COUNT"], "3")

    def test_push_de_verdad_a_github_falla_sin_red(self):
        """(e) git real en repo temporal: push a GitHub falla, fetch/get-url no cambian."""
        if shutil.which("git") is None:
            self.skipTest("sin git en esta máquina")
        temporal = tempfile.mkdtemp(prefix="sinpush0711-")
        try:
            def git(*args, extra_env=None):
                ent = dict(os.environ)
                if extra_env is not None:
                    ent.update(extra_env)
                return subprocess.run(
                    ["git", *args], cwd=temporal, env=ent, timeout=20,
                    stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                )
            git("init")
            git("-c", "user.email=t@t", "-c", "user.name=t",
                "commit", "--allow-empty", "-m", "vacio")
            git("remote", "add", "origin", "https://github.com/ejemplo/repo.git")
            empuje = git("push", "origin", "HEAD:main", extra_env=enjambre.entorno_sin_push(dict(os.environ)))
            self.assertNotEqual(empuje.returncode, 0)
            self.assertIn("nopush", empuje.stdout.decode("utf-8", "replace"))
            url = subprocess.run(
                ["git", "remote", "get-url", "origin"], cwd=temporal,
                stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=20,
            ).stdout.decode("utf-8", "replace")
            self.assertIn("https://github.com/", url.strip())
        finally:
            shutil.rmtree(temporal, ignore_errors=True)

    def test_solo_los_lanzamientos_de_agente_filtran_el_entorno(self):
        """(f) el Popen de `opencode` y el de Codex llevan filtro; `entorno_hijo` y `sh` no."""
        with open(RUTA, encoding="utf-8") as f:
            codigo = f.read()
        trozos = codigo.split("def ")
        opencode = next(t for t in trozos if t.startswith("opencode(prompt"))
        codex = next(t for t in trozos if t.startswith("escribir_con_codex("))
        self.assertIn("entorno_sin_push(", opencode)
        self.assertIn("entorno_sin_push(", codex)
        hijo_y_sh = next(t for t in trozos if t.startswith("entorno_hijo(")) + next(
            t for t in trozos if t.startswith("sh(")
        )
        self.assertNotIn("entorno_sin_push(", hijo_y_sh)


if __name__ == "__main__":
    unittest.main()
