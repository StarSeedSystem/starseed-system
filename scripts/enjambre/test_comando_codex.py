# -*- coding: utf-8 -*-
"""La orden de Codex tiene que ser una orden que el `codex` instalado acepte.

EL CASO REAL (zW8, 2026-09-09). `comando_codex()` construía:

    codex exec -m gpt-5.6-sol -s workspace-write --approve-for-me --skip-git-repo-check -C ...

y el CLI la rechazaba antes de arrancar:

    error: the argument '--sandbox <SANDBOX_MODE>' cannot be used with '--approve-for-me'

No es que el modelo escribiera mal: es que la orden ni se ejecutaba. Y no volvió
a verse porque justo después `STARSEED_CODEX_ESCRITOR` dejó a Codex apagado del
todo — una avería tapando la otra durante semanas.

Estas pruebas cierran las dos puertas: la incompatibilidad concreta que nos
mordió, y —cuando hay `codex` en la máquina— que el CLI de verdad acepte los
argumentos que generamos, sea cual sea su versión.
"""

import os
import shutil
import subprocess
import sys
import unittest

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
if DIRECTORIO not in sys.path:
    sys.path.insert(0, DIRECTORIO)

from test_progreso_irreversible import enjambre


class PruebaComandoCodex(unittest.TestCase):
    def setUp(self):
        self.orden = enjambre.comando_codex("codex/gpt-5.6-sol", "/tmp/wt")

    def test_lo_esencial_sigue_estando(self):
        self.assertEqual(self.orden[:2], ["codex", "exec"])
        self.assertIn("-m", self.orden)
        self.assertIn("gpt-5.6-sol", self.orden)  # sin el prefijo «codex/»
        self.assertIn("-C", self.orden)
        self.assertIn("/tmp/wt", self.orden)

    def test_sandbox_y_approve_for_me_no_pueden_ir_juntos(self):
        # Esta es LA prueba: el CLI los declara mutuamente excluyentes.
        juntos = ("-s" in self.orden or "--sandbox" in self.orden) and (
            "--approve-for-me" in self.orden
        )
        self.assertFalse(
            juntos,
            "el CLI responde «the argument '--sandbox' cannot be used with "
            "'--approve-for-me'» y la orden muere antes de arrancar",
        )

    def test_se_declara_hasta_donde_puede_escribir(self):
        # `workspace-write` no es adorno: dice que solo toca su worktree.
        self.assertIn("-s", self.orden)
        self.assertIn("workspace-write", self.orden)

    def test_el_prompt_no_viaja_en_la_linea_de_orden(self):
        # Los enunciados del enjambre pasan de 6.000 caracteres: por argumento
        # darían E2BIG. Van por stdin.
        largo = sum(len(a) for a in self.orden)
        self.assertLess(largo, 400, "la orden lleva algo que debería ir por stdin")


class PruebaContraElCliDeVerdad(unittest.TestCase):
    """Si hay `codex` en esta máquina, que él mismo valide los argumentos.

    Una lista de banderas escrita a mano envejece con el CLI. Esto lo pregunta."""

    def setUp(self):
        self.codex = enjambre.ruta_codex() or shutil.which("codex")
        if not self.codex:
            self.skipTest("no hay codex en esta máquina (la nube, por ejemplo)")

    def test_el_cli_acepta_los_argumentos_que_generamos(self):
        orden = enjambre.comando_codex("codex/gpt-5.6-sol", os.getcwd())
        # `--help` hace que el CLI analice TODAS las banderas y salga sin llamar
        # al modelo: valida la orden sin gastar ni un token de la suscripción.
        r = subprocess.run(
            [self.codex] + orden[1:] + ["--help"],
            capture_output=True,
            text=True,
            timeout=60,
        )
        salida = (r.stdout or "") + (r.stderr or "")
        self.assertNotIn("cannot be used with", salida, salida[:400])
        self.assertEqual(r.returncode, 0, salida[:400])


if __name__ == "__main__":
    unittest.main()
