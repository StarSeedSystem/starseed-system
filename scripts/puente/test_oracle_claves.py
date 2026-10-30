#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas sin red ni ssh real para oracle_claves."""
from __future__ import annotations

import hashlib
import io
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import oracle_claves as oc  # noqa: E402


class NodoFalso:
    def __init__(self, rc=0, salida="OK ORACLE_VAR\n"):
        self.rc, self.salida, self.llamadas = rc, salida, []

    def ssh(self, orden, entrada=None, timeout=120):
        self.llamadas.append((orden, entrada, timeout))
        return self.rc, self.salida


class PruebasOracleClaves(unittest.TestCase):
    def setUp(self):
        self.temporal = tempfile.TemporaryDirectory()
        self.home = Path(self.temporal.name)
        self.env_path = self.home / ".starseed" / "env"
        self.env_path.parent.mkdir(parents=True, exist_ok=True)

    def tearDown(self):
        self.temporal.cleanup()

    def configurar_env(self, datos: dict[str, str]):
        self.env_path.write_text("".join(f"{k}={v}\n" for k, v in datos.items()), encoding="utf-8")

    def test_nombres_invalidos_rechazados(self):
        errores = oc.validar_nombres(["ASTRA_CLOUD_URL", "clave_mal", "123_BAD", "VA_OK"])
        self.assertIn("clave_mal (no coincide con [A-Z][A-Z0-9_]+)", errores)
        self.assertIn("123_BAD (no coincide con [A-Z][A-Z0-9_]+)", errores)
        self.assertNotIn("ASTRA_CLOUD_URL", errores)
        self.assertNotIn("VA_OK", errores)

    def test_huella_es_sha256_de_8_y_no_es_el_valor(self):
        valor = "valor-de-prueba"
        esperada = hashlib.sha256(valor.encode("utf-8")).hexdigest()[:8]
        self.assertEqual(oc.huella(valor), esperada)
        self.assertEqual(len(oc.huella(valor)), 8)
        self.assertNotIn(valor, oc.huella(valor))

    def test_orden_remota_fusiona_solo_las_variables_pedidas(self):
        orden = oc.orden_remota("/etc/starseed/direccion.env", ["A_VAR", "B_VAR"])
        self.assertIn("/etc/starseed/direccion.env", orden)
        self.assertIn("grep -vE '^(export )?(A_VAR|B_VAR)='", orden)
        self.assertIn("install -m 600 -o root -g root", orden)
        self.assertIn("cat \"$nuevo\" >> \"$fus\"", orden)
        self.assertNotIn("/dev/stdin", orden)
        self.assertNotIn("OTRA_VAR", orden)
        self.assertNotIn("> /etc/starseed/direccion.env", orden)

    def test_orden_remota_cita_el_destino_e_ignora_nombres_invalidos(self):
        orden = oc.orden_remota("/tmp/con espacio.env", ["BUENA", "mala; rm -rf /"])
        self.assertIn("'/tmp/con espacio.env'", orden)
        self.assertNotIn("rm -rf", orden)

    def test_entregar_usa_ssh_de_oracle_nodo_y_devuelve_huella(self):
        nodo = NodoFalso()
        with mock.patch.object(oc, "_importar_nodo", return_value=nodo):
            rc, res = oc.entregar({"ORACLE_VAR": "valor_prueba"}, ["ORACLE_VAR"],
                                  destino="/tmp/prueba.env")
        self.assertEqual(rc, 0)
        self.assertTrue(res["ORACLE_VAR"]["quedo"])
        self.assertEqual(res["ORACLE_VAR"]["huella"], oc.huella("valor_prueba"))
        self.assertNotIn("valor_prueba", repr(res))
        orden, entrada, timeout = nodo.llamadas[0]
        self.assertIn("ORACLE_VAR=valor_prueba", entrada)
        self.assertIn("/tmp/prueba.env", orden)
        self.assertEqual(timeout, 120)

    def test_entregar_con_ssh_roto_no_marca_quedo(self):
        nodo = NodoFalso(rc=1, salida="sin conexión")
        with mock.patch.object(oc, "_importar_nodo", return_value=nodo):
            with mock.patch("sys.stderr", io.StringIO()):
                rc, res = oc.entregar({"ORACLE_VAR": "valor_prueba"}, ["ORACLE_VAR"])
        self.assertEqual(rc, 1)
        self.assertFalse(res["ORACLE_VAR"]["quedo"])
        self.assertEqual(res["ORACLE_VAR"]["huella"], oc.huella("valor_prueba"))

    def test_simular_no_imprime_el_valor(self):
        salida = io.StringIO()
        with mock.patch("oracle_claves.ENV_LOCAL", self.env_path):
            self.configurar_env({"ASTRA_CLOUD_URL": "https://ejemplo.com/secreto"})
            with mock.patch("sys.stdout", salida):
                resultado = oc.main(["maquina", "ASTRA_CLOUD_URL", "--simular"])
        self.assertEqual(resultado, 0)
        texto = salida.getvalue()
        self.assertNotIn("https://", texto)
        self.assertNotIn("secreto", texto)
        self.assertIn("ASTRA_CLOUD_URL ✓", texto)
        self.assertIn(oc.huella("https://ejemplo.com/secreto"), texto)

    def test_main_pasa_por_oracle_nodo_y_no_imprime_el_valor(self):
        nodo = NodoFalso()
        salida = io.StringIO()
        with mock.patch("oracle_claves.ENV_LOCAL", self.env_path):
            self.configurar_env({"ORACLE_VAR": "valor_prueba"})
            with mock.patch.object(oc, "_importar_nodo", return_value=nodo):
                with mock.patch("sys.stdout", salida):
                    resultado = oc.main(["starseed-a1", "ORACLE_VAR"])
        self.assertEqual(resultado, 0)
        self.assertEqual(len(nodo.llamadas), 1)
        texto = salida.getvalue()
        self.assertNotIn("valor_prueba", texto)
        self.assertIn("ORACLE_VAR ✓", texto)
        self.assertTrue(texto.startswith("ORACLE_VAR"))


if __name__ == "__main__":
    unittest.main()
