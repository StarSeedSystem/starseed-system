# -*- coding: utf-8 -*-
"""Pruebas de la orden `memvid` (MVD1027I): plan, unidad systemd y que sin --aplicar no hay SSH."""
import contextlib
import gzip
import io
import json
import os
import re
import sys
import tempfile
import unittest

DIR = os.path.dirname(os.path.abspath(__file__))
if DIR not in sys.path:
    sys.path.insert(0, DIR)

import oracle_nodo as N  # noqa: E402

SERVICIO = os.path.join(DIR, "..", "..", "deploy", "oracle", "nodo", "systemd", "starseed-memvid.service")
TEXTO_PLAN = lambda: json.dumps(N.plan_memvid(), ensure_ascii=False)  # noqa: E731


class Plan(unittest.TestCase):
    def test_copia_compila_como_starseed_y_deja_la_unidad_viva(self):
        texto = TEXTO_PLAN()
        self.assertIn("/".join(N.MEMVID_ORIGEN_REL), texto)
        self.assertIn("%s build --release" % N.MEMVID_CARGO_A1, texto)
        self.assertIn(N.MEMVID_BINARIO_A1, texto)
        self.assertIn("como starseed", texto)
        self.assertIn(N.MEMVID_SERVICIO_A1, texto)
        self.assertIn("enable --now starseed-memvid", texto)
        self.assertIn("/srv/memvid-servidor", json.dumps(N.plan_memvid("/srv/memvid-servidor")))

    def test_sin_claves_ni_ips_publicas(self):
        texto = TEXTO_PLAN().upper()
        self.assertIsNone(re.search(r"API_KEY|SECRET|PASSWORD|TOKEN", texto), "claves en el plan")
        ips = re.findall(r"\b\d{1,3}(?:\.\d{1,3}){3}\b", texto)
        self.assertEqual(ips, ["127.0.0.1"])  # SOLO local: el 4490 no se comparte


class SSH(unittest.TestCase):
    def setUp(self):
        self.ssh_calls, self.bytes_calls = [], []
        self._respuesta, self._bytes_respuesta = (0, "[memvid] ok"), (0, "subido")
        self._ssh, self._bytes = N.ssh, N._ssh_bytes

        def falso_ssh(orden, entrada=None, timeout=120):
            self.ssh_calls.append({"orden": orden, "timeout": timeout})
            return self._respuesta

        def falsos_bytes(orden, datos, timeout=300):
            self.bytes_calls.append({"orden": orden, "datos": datos})
            return self._bytes_respuesta

        N.ssh, N._ssh_bytes = falso_ssh, falsos_bytes
        self.origen = tempfile.mkdtemp(prefix="memvid-origen-")
        with open(os.path.join(self.origen, "Cargo.toml"), "w", encoding="utf-8") as f:
            f.write("[package]\nname = \"memvid-servidor\"\n")

    def tearDown(self):
        N.ssh, N._ssh_bytes = self._ssh, self._bytes

    def test_sin_aplicar_no_llama_a_ssh_y_ensena_el_plan(self):
        salida = io.StringIO()
        with contextlib.redirect_stdout(salida):
            rc = N.main(["oracle_nodo.py", "memvid"])
        datos = json.loads(salida.getvalue())
        self.assertEqual((rc, datos["aplicado"]), (0, False))
        self.assertEqual(self.ssh_calls, [])
        self.assertEqual(self.bytes_calls, [])

    def test_con_aplicar_compila_como_starseed_e_instala(self):
        rc = N.memvid(aplicar=True, origen=self.origen)
        self.assertTrue(rc["ok"])
        ordenes = [c["orden"] for c in self.ssh_calls]
        self.assertEqual(len(self.bytes_calls), 1)
        self.assertIn(b"Cargo.toml", gzip.decompress(self.bytes_calls[0]["datos"]))
        self.assertIn("tar xzf /tmp/memvid.tgz -C /home/starseed", self.bytes_calls[0]["orden"])
        self.assertTrue(any("sudo -u starseed bash -lc" in o and "cargo build --release" in o for o in ordenes))
        self.assertIn(N.MEMVID_SERVICIO_A1, json.dumps(ordenes))
        self.assertTrue(any("starseed-memvid" in o and "enable --now" in o for o in ordenes))
        self.assertEqual([h["que"] for h in rc["hecho"]],
                         ["subir código", "compilar", "instalar unidad", "arrancar"])

    def test_aplicar_sin_codigo_ni_unidad_no_miente_y_no_llama_a_ssh(self):
        unidad = N.UNIDAD_MEMVID
        N.UNIDAD_MEMVID = "/no/existe/starseed-memvid.service"
        try:
            for rc in (N.memvid(aplicar=True, origen="/no/existe/memvid-servidor"),
                       N.memvid(aplicar=True, origen=self.origen)):
                self.assertFalse(rc["ok"])
                self.assertIn("falta", rc["motivo"])
                self.assertEqual(self.ssh_calls, [])
        finally:
            N.UNIDAD_MEMVID = unidad

    def test_aplicar_con_fallo_en_ssh_para_y_lo_digo(self):
        self._bytes_respuesta = (1, "fallo de subida")
        rc = N.memvid(aplicar=True, origen=self.origen)
        self.assertFalse(rc["ok"])
        self.assertEqual([h["que"] for h in rc["hecho"]], ["subir código"])


class Servicio(unittest.TestCase):
    def test_solo_local_con_limites_y_sin_claves(self):
        with open(SERVICIO, encoding="utf-8") as f:
            texto = f.read()
        self.assertIn("User=starseed", texto)
        self.assertIn("Environment=STARSEED_MEMVID_DIR=/var/lib/starseed/memvid", texto)
        self.assertIn("ExecStart=/home/starseed/memvid-servidor/target/release/memvid-servidor", texto)
        self.assertIn("Restart=on-failure", texto)
        self.assertIn("MemoryMax=512M", texto)
        self.assertIn("Nice=10", texto)
        self.assertNotIn("--port", texto)
        self.assertIn("# requiere: /home/starseed/memvid-servidor/target/release/memvid-servidor", texto)
        self.assertIsNone(re.search(r"KEY|SECRET|TOKEN|PASSWORD", re.sub(r"^#.*$", "", texto, flags=re.M)))


if __name__ == "__main__":
    unittest.main()
