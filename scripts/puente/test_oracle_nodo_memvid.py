# -*- coding: utf-8 -*-
"""Pruebas del servidor de cápsulas Memvid en el A1 (MVD1027I).

Contrato: `architecture/memvid-capsulas.md` §4. El núcleo en Rust (`native/memvid-servidor`)
se compila en el A1 con su propio cargo y corre como `starseed-memvid.service` en
127.0.0.1:4490, con las cápsulas en /var/lib/starseed/memvid. En seco y sin red: aquí no se
copia, no se compila y no se enciende nada.
"""
import contextlib
import io
import json
import os
import re
import sys
import unittest
from unittest import mock

DIR = os.path.dirname(os.path.abspath(__file__))
if DIR not in sys.path:
    sys.path.insert(0, DIR)
import oracle_nodo as N  # noqa: E402

UNIDAD = os.path.join(os.path.dirname(os.path.dirname(DIR)), "deploy", "oracle", "nodo",
                      "systemd", "starseed-memvid.service")
CLAVES = re.compile(r"sk-|ghp_|AIza|BEGIN OPENSSH|xoxb-|Bearer ")


class PlanMemvid(unittest.TestCase):
    def test_copia_el_servidor_y_compila_con_el_cargo_de_starseed(self):
        texto = " ".join(str(p) for p in N.plan_memvid())
        self.assertIn("native/memvid-servidor", texto)
        self.assertIn("/home/starseed/memvid-servidor", texto)
        self.assertIn("/home/starseed/.cargo/bin/cargo build --release", texto)

    def test_el_plan_lleva_la_unidad_y_la_arranca(self):
        pasos = N.plan_memvid()
        texto = " ".join(str(p) for p in pasos)
        self.assertIn("starseed-memvid", texto)
        self.assertIn("systemctl enable --now starseed-memvid", texto)
        self.assertEqual([p["que"] for p in pasos],
                         ["copiar", "compilar", "instalar", "arrancar"])

    def test_el_plan_no_lleva_claves(self):
        self.assertFalse(CLAVES.search(" ".join(str(p) for p in N.plan_memvid())))

    def test_sin_aplicar_no_se_toca_la_red(self):
        with mock.patch.object(N, "ssh", side_effect=AssertionError("no hay red en seco")), \
                mock.patch.object(N, "_ssh_bytes", side_effect=AssertionError("no hay red en seco")):
            salida = io.StringIO()
            with contextlib.redirect_stdout(salida):
                self.assertEqual(N.main(["oracle_nodo.py", "memvid"]), 0)
        r = json.loads(salida.getvalue())
        self.assertTrue(r["ok"])
        self.assertFalse(r["aplicado"])
        self.assertEqual(len(r["pasos"]), 4)


class UnidadMemvid(unittest.TestCase):
    def setUp(self):
        with open(UNIDAD, encoding="utf-8") as f:
            self.unidad = f.read()

    def test_corre_como_starseed_con_su_carpeta_y_sus_limites(self):
        self.assertIn("User=starseed", self.unidad)
        self.assertIn("ExecStart=/home/starseed/memvid-servidor/target/release/memvid-servidor",
                      self.unidad)
        self.assertIn("Environment=STARSEED_MEMVID_DIR=/var/lib/starseed/memvid", self.unidad)
        self.assertIn("Restart=on-failure", self.unidad)
        self.assertIn("MemoryMax=512M", self.unidad)
        self.assertIn("Nice=10", self.unidad)

    def test_no_se_instala_sin_el_binario(self):
        self.assertIn("# requiere: /home/starseed/memvid-servidor/target/release/memvid-servidor",
                      self.unidad)

    def test_no_abre_el_puerto_fuera_ni_lleva_claves(self):
        self.assertNotIn("0.0.0.0", self.unidad)
        self.assertFalse(CLAVES.search(self.unidad))


if __name__ == "__main__":
    unittest.main()
