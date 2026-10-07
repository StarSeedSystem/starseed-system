#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas sin red ni OCI real para oracle_nube."""
from __future__ import annotations

import contextlib
import io
import json
import os
import stat
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import oracle_nube as oracle  # noqa: E402

OCID_T = "ocid1.tenancy.oc1..falso"
OCID_I = "ocid1.instance.oc1..falso"


def respuesta(dato: dict, error: str = "", codigo: int = 0):
    return subprocess.CompletedProcess([], codigo, json.dumps(dato), error)


class PruebasOracleNube(unittest.TestCase):
    def setUp(self):
        self.temporal = tempfile.TemporaryDirectory()
        self.home = Path(self.temporal.name)

    def tearDown(self):
        self.temporal.cleanup()

    def configurar(self, con_llave: bool = True):
        carpeta = self.home / ".oci"
        carpeta.mkdir()
        llave = carpeta / "api.pem"
        if con_llave:
            llave.write_text("NO SE DEBE LEER", encoding="utf-8")
        (carpeta / "config").write_text(
            "[DEFAULT]\ntenancy=%s\nregion=mx-queretaro-1\nkey_file=~/.oci/api.pem\n" % OCID_T,
            encoding="utf-8")

    def test_vinculada_exige_llave_legible(self):
        self.configurar(False)
        self.assertFalse(oracle.vinculada(self.home))
        (self.home / ".oci" / "api.pem").write_text("secreto", encoding="utf-8")
        self.assertTrue(oracle.vinculada(self.home))

    def test_parsers_puros_no_devuelven_ids(self):
        limites = {"data": [{"name": "standard-a1-core-count", "value": 2},
                              {"name": "standard-a1-memory-count", "value": 12},
                              {"name": "standard-e2-micro-core-count", "value": 2}]}
        instancias = {"data": [{"id": OCID_I, "display-name": "astraura-a1",
                                  "shape": "VM.Standard.A1.Flex",
                                  "shape-config": {"ocpus": 2, "memory-in-gbs": 12},
                                  "lifecycle-state": "RUNNING"}]}
        vnics = {OCID_I: {"data": [{"id": "ocid1.vnic.oc1..falso", "public-ip": "203.0.113.8"}]}}
        self.assertEqual(oracle.parsear_limites(limites), {"a1_ocpu": 2, "a1_gb": 12, "micro": 2})
        parsed = oracle.parsear_instancias(instancias, vnics)
        self.assertEqual(parsed[0]["ip_publica"], "203.0.113.8")
        self.assertEqual(parsed[0]["gb"], 12)
        self.assertNotIn("ocid1.", json.dumps(parsed))

    def test_comprobar_llama_oci_con_timeout_y_sin_persistir_tenancy(self):
        self.configurar()
        llamadas = []
        def correr(orden, timeout):
            llamadas.append((orden, timeout))
            if "availability-domain" in orden:
                return respuesta({"data": [{"name": "AD-1", "id": "ocid1.ad.oc1..falso"}]})
            if "limits" in orden:
                return respuesta({"data": [{"name": "standard-a1-core-count", "value": 2},
                                             {"name": "standard-a1-memory-count", "value": 12},
                                             {"name": "standard-e2-micro-core-count", "value": 2}]})
            if "list-vnics" in orden:
                return respuesta({"data": [{"public-ip": "203.0.113.8"}]})
            return respuesta({"data": [{"id": OCID_I, "display-name": "a1", "shape": "A1",
                                         "shape-config": {"ocpus": 2, "memory-in-gbs": 12},
                                         "lifecycle-state": "RUNNING"}]})
        estado = oracle.comprobar(correr, self.home)
        self.assertTrue(estado["vinculada"])
        self.assertEqual(estado["limites"]["a1_gb"], 12)
        self.assertTrue(all(timeout == 60 for _, timeout in llamadas))
        self.assertIn(OCID_T, " ".join(llamadas[0][0]))
        self.assertNotIn("ocid1.", json.dumps(estado))

        fallo = oracle.comprobar(
            lambda orden, timeout: respuesta({}, "NotAuthenticated: " + OCID_T, 1), self.home)
        self.assertEqual(fallo["detalle"], "Oracle no autenticó el perfil; vuelve a vincular la cuenta.")
        self.assertNotIn("ocid1.", fallo["detalle"])

    def test_estado_atomico_0600_y_cli_no_imprimen_ocids(self):
        self.configurar()
        ruta = self.home / ".starseed" / "oracle.json"
        base = {"vinculada": True, "perfil": "DEFAULT", "region": "mx-queretaro-1",
                "comprobado": "2026-10-07T00:00:00+00:00", "limites": {},
                "instancias": [{"id": OCID_I, "nombre": OCID_I, "forma": "A1", "ocpus": 2,
                                 "gb": 12, "estado": "RUNNING", "ip_publica": "203.0.113.8"}],
                "servicios": [], "tenancy": OCID_T, "detalle": OCID_T}
        doc = oracle.escribir_estado(ruta, base)
        self.assertEqual(set(doc), {"vinculada", "perfil", "region", "comprobado", "limites",
                                    "instancias", "servicios"})
        self.assertEqual(stat.S_IMODE(ruta.stat().st_mode), 0o600)
        self.assertFalse(Path(str(ruta) + ".tmp").exists())
        self.assertNotIn("ocid1.", ruta.read_text(encoding="utf-8"))

        publicados = []
        def correr(orden, timeout):
            if "limits" in orden:
                return respuesta({"data": []})
            if "compute" in orden and "instance" in orden:
                return respuesta({"data": []})
            return respuesta({"data": []})
        ruta.unlink()
        salida = io.StringIO()
        with mock.patch.dict(os.environ, {"HOME": str(self.home)}, clear=False), contextlib.redirect_stdout(salida):
            oracle.main(["comprobar", "--json"], correr=correr,
                        publicar=lambda *a, **k: publicados.append((a, k)))
        self.assertNotIn("ocid1.", salida.getvalue())
        self.assertNotIn("ocid1.", ruta.read_text(encoding="utf-8"))
        self.assertEqual(publicados[0][1]["de"], "director-nube")


if __name__ == "__main__":
    unittest.main()
