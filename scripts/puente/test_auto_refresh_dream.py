# -*- coding: utf-8 -*-
"""Auto-refresh del catálogo de modelos gratuitos antes de soñar (IMG · DR1108-3).

Prueba de comportamiento del guion REAL: se ejecuta `scripts/hermes/starseed-dream.sh`
con un `hermes` de mentira en el PATH y una raíz temporal. Comprueba que el refresco
del catálogo se anota en `logs/logs.md` ANTES de soñar y que, si el refresco falla,
el Dream SIGUE soñando (best-effort) en vez de abortar.
"""
import os
import shutil
import stat
import subprocess
import tempfile
import unittest

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
GUION = os.path.join(DIRECTORIO, "..", "hermes", "starseed-dream.sh")
REPO = os.path.abspath(os.path.join(DIRECTORIO, "..", ".."))
INFORME = "## Top 3 accionables\n1. Revisar la cola\n## Mejoras detectadas\n" + ("detalle " * 80)


class AutoRefreshDreamTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="dream-refresh-")
        self.raiz = os.path.join(self.tmp, "memoria")
        os.makedirs(os.path.join(self.raiz, "dream"))
        os.makedirs(os.path.join(self.raiz, "logs"))
        self.bin = os.path.join(self.tmp, "bin")
        os.makedirs(self.bin)
        os.makedirs(os.path.join(self.tmp, "home"))

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def _hermes_de_mentira(self, falla_refresco):
        ruta = os.path.join(self.bin, "hermes")
        lineas = ["#!/bin/sh", 'case "$1" in', "  model)"]
        lineas.append("    exit %d" % (1 if falla_refresco else 0))
        lineas += ["    ;;", "  -z)", "    cat <<'FIN'", INFORME, "FIN", "    exit 0", "    ;;",
                   "  send)", "    exit 0", "    ;;", "esac", "exit 0", ""]
        with open(ruta, "w", encoding="utf-8") as f:
            f.write("\n".join(lineas))
        os.chmod(ruta, os.stat(ruta).st_mode | stat.S_IEXEC | stat.S_IXGRP | stat.S_IXOTH)

    def _sonar(self, falla_refresco):
        self._hermes_de_mentira(falla_refresco)
        entorno = dict(os.environ)
        entorno["PATH"] = self.bin + os.pathsep + entorno.get("PATH", "")
        entorno["HOME"] = os.path.join(self.tmp, "home")
        entorno["STARSEED_ROOT"] = self.raiz
        entorno["STARSEED_REPO"] = REPO
        r = subprocess.run(["bash", GUION], capture_output=True, text=True, timeout=120, env=entorno)
        log = os.path.join(self.raiz, "logs", "logs.md")
        logs = open(log, encoding="utf-8").read() if os.path.exists(log) else ""
        sugerencias = sorted(n for n in os.listdir(os.path.join(self.raiz, "dream")) if n.endswith(".md"))
        return r, logs, sugerencias

    def test_refresco_ok_anota_en_logs_y_suena(self):
        r, logs, sugerencias = self._sonar(falla_refresco=False)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("catálogo de modelos refrescado", logs)
        self.assertLess(logs.index("catálogo de modelos refrescado"), logs.index("Sugerencias del Dream"),
                        "el refresco debe ir ANTES de soñar")
        self.assertTrue(sugerencias, "el Dream no dejó su informe")
        self.assertIn("Top 3", open(os.path.join(self.raiz, "dream", sugerencias[0]), encoding="utf-8").read())

    def test_if_refresh_falla_el_dream_sigue_soando(self):
        r, logs, sugerencias = self._sonar(falla_refresco=True)
        self.assertEqual(r.returncode, 0, "un refresco fallido no debe tumbar el Dream")
        self.assertIn("hermes model --refresh falló", logs)
        self.assertTrue(sugerencias, "si el refresco falla, el Dream debe seguir soñando")
