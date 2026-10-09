# -*- coding: utf-8 -*-
"""Pruebas de la medición acotada del vigilante: un worktree solo se acepta si
es `<base>/<id>` real bajo STARSEED_WT, y el recorrido de `_ultimo_byte_de`
siempre termina por tope de tiempo o de entradas."""

import importlib.util
import os
import sys
import tempfile
import unittest

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
if DIRECTORIO not in sys.path:
    sys.path.insert(0, DIRECTORIO)

_spec = importlib.util.spec_from_file_location(
    "vigilante_enjambre_wt", os.path.join(DIRECTORIO, "vigilante-enjambre.py")
)
vig = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(vig)


class TestWorktreeDeArgs(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.wt = self.tmp.name
        os.mkdir(os.path.join(self.wt, "CDX1"))
        self.addCleanup(self.tmp.cleanup)

    def test_acepta_raiz_valida_del_prompt(self):
        args = f"opencode run RAIZ DEL REPOSITORIO: `{self.wt}/CDX1`."
        self.assertEqual(
            vig._worktree_de_args(args, base=self.wt),
            os.path.realpath(os.path.join(self.wt, "CDX1")),
        )

    def test_rechaza_raiz_sola_users_y_el_propio_base(self):
        for args in (
            "opencode run mira / y nada más",
            f"opencode run /Users no es worktree",
            f"opencode run {self.wt} es el base, no un worktree",
        ):
            self.assertEqual(vig._worktree_de_args(args, base=self.wt), "")

    def test_rechaza_enlace_simbolico_que_sale_del_base(self):
        enlace = os.path.join(self.wt, "CDX2")
        try:
            os.symlink("/", enlace)
        except OSError:
            self.skipTest("sin permiso para crear enlaces simbólicos")
        args = f"opencode run RAIZ DEL REPOSITORIO: `{enlace}`."
        self.assertEqual(vig._worktree_de_args(args, base=self.wt), "")


class TestUltimoByteDeAcotado(unittest.TestCase):
    def test_tope_de_entradas_termina_y_devuelve_numero_positivo(self):
        with tempfile.TemporaryDirectory() as carpeta:
            for i in range(10):
                with open(os.path.join(carpeta, f"f{i}.txt"), "w") as f:
                    f.write("x")
            resultado = vig._ultimo_byte_de(carpeta, tope_entradas=3)
        self.assertGreater(resultado, 0)


if __name__ == "__main__":
    unittest.main()


class OrdenReabrirLlevaElPeldano(unittest.TestCase):
    """(2026-10-09) CPA1007Kb repetía «Codex 1/2»: la orden `reabrir` no llevaba ni el
    contador de la escalera ni su modelo, y la copia en memoria del orquestador los pisaba."""

    def test_lleva_contador_y_modelo(self):
        o = vig.orden_reabrir({"estado": "pendiente", "nota": "director: escalada a Codex 1/2",
                               "intentos_auto": 9, "modelo_siguiente": "codex/gpt-5.6-sol"})
        self.assertEqual("reabrir", o["accion"])
        self.assertEqual(9, o["intentos_auto"])
        self.assertEqual("codex/gpt-5.6-sol", o["modelo"])

    def test_sin_peldano_queda_como_antes(self):
        o = vig.orden_reabrir({"estado": "pendiente", "nota": "x", "modelo_siguiente": None})
        self.assertNotIn("modelo", o)
        self.assertNotIn("intentos_auto", o)
