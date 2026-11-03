# -*- coding: utf-8 -*-
"""Pruebas de la orden `memvid` del A1 (MVD1027I): el plan del servidor de cápsulas y que sin
`--aplicar` no se llama a SSH. Sin red, sin compilar y sin tocar el disco del A1."""
import contextlib
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

SERVICIO = os.path.join(DIR, "..", "..", "deploy", "oracle", "nodo", "systemd",
                        "starseed-memvid.service")
CLAVES = re.compile(r"\bAPI_KEY\b|\bSECRET\b|\bPASSWORD\b|\bTOKEN\b|sk-|ghp_|AIza|Bearer ")


class Plan(unittest.TestCase):
    def test_copia_la_fuente_y_compila_con_el_cargo_del_a1(self):
        copia, compila = N.plan_memvid()[:2]
        self.assertEqual(copia["que"], "copiar")
        self.assertTrue(copia["desde"].replace("\\", "/").endswith("native/memvid-servidor"))
        self.assertEqual(copia["ruta"], "/home/starseed/memvid-servidor")
        self.assertEqual(compila["orden"], ["/home/starseed/.cargo/bin/cargo", "build", "--release"])
        self.assertEqual((compila["usuario"], compila["en"]), ("starseed", "/home/starseed/memvid-servidor"))

    def test_instala_la_unidad_y_la_arranca(self):
        pasos = N.plan_memvid()
        self.assertIn(N.SERVICIO_MEMVID_A1, [p.get("ruta") for p in pasos])
        ordenes = [p.get("orden") for p in pasos]
        self.assertIn("sudo systemctl daemon-reload", ordenes)
        self.assertIn("sudo systemctl enable --now starseed-memvid", ordenes)

class Servicio(unittest.TestCase):
    def setUp(self):
        with open(SERVICIO, encoding="utf-8") as f:
            self.texto = f.read()

    def test_solo_local_con_limites(self):
        self.assertIn("User=starseed", self.texto)
        self.assertIn("ExecStart=/home/starseed/memvid-servidor/target/release/memvid-servidor", self.texto)
        self.assertIn("Environment=STARSEED_MEMVID_DIR=/var/lib/starseed/memvid", self.texto)
        for linea in ("Restart=on-failure", "MemoryMax=512M", "Nice=10", "127.0.0.1:4490",
                      "# requiere: /home/starseed/memvid-servidor/target/release/memvid-servidor"):
            self.assertIn(linea, self.texto)
        self.assertIsNone(CLAVES.search(self.texto))


class SSH(unittest.TestCase):
    def setUp(self):
        self.llamadas = []
        self._previos = (N.ssh, N._ssh_bytes, N._poner_en_a1)

        def falso_ssh(orden, entrada=None, timeout=120):
            self.llamadas.append({"via": "ssh", "orden": orden, "entrada": entrada})
            return (0, "")

        def falso_bytes(orden, datos, timeout=300):
            self.llamadas.append({"via": "ssh-bytes", "orden": orden, "datos": datos})
            return (0, "")

        def falso_poner(contenido, destino, modo=0o644, dueno="root"):
            self.llamadas.append({"via": "poner", "destino": destino, "contenido": contenido})
            return (0, "")

        N.ssh, N._ssh_bytes, N._poner_en_a1 = falso_ssh, falso_bytes, falso_poner

    def tearDown(self):
        N.ssh, N._ssh_bytes, N._poner_en_a1 = self._previos

    def _main(self, *argv):
        salida = io.StringIO()
        with contextlib.redirect_stdout(salida):
            rc = N.main(["oracle_nodo.py", *argv])
        return rc, salida.getvalue()

    def test_sin_aplicar_no_llama_a_ssh_y_ensena_el_plan(self):
        rc, salida = self._main("memvid")
        self.assertEqual(rc, 0)
        self.assertEqual(self.llamadas, [])
        datos = json.loads(salida)
        self.assertTrue(datos["ok"])
        self.assertFalse(datos["aplicado"])
        self.assertEqual(datos["pasos"], N.plan_memvid())

    def test_con_aplicar_copia_compila_e_instala(self):
        with tempfile.TemporaryDirectory() as tmp:
            with open(os.path.join(tmp, "Cargo.toml"), "w", encoding="utf-8") as f:
                f.write('[package]\nname = "memvid-servidor"\n')
            rc, salida = self._main("memvid", "--aplicar", "--desde", tmp)
        self.assertEqual(rc, 0)
        self.assertTrue(json.loads(salida)["ok"])
        self.assertEqual([l["via"] for l in self.llamadas], ["ssh-bytes", "ssh", "poner", "ssh", "ssh"])
        self.assertIn("tar xzf", self.llamadas[0]["orden"])
        self.assertIn("/home/starseed/memvid-servidor", self.llamadas[0]["orden"])
        self.assertGreater(len(self.llamadas[0]["datos"]), 0)
        self.assertIn("/home/starseed/.cargo/bin/cargo build --release", self.llamadas[1]["orden"])
        self.assertEqual(self.llamadas[2]["destino"], N.SERVICIO_MEMVID_A1)
        self.assertIn("STARSEED_MEMVID_DIR=/var/lib/starseed/memvid", self.llamadas[2]["contenido"])
        self.assertEqual(self.llamadas[3]["orden"], "sudo systemctl daemon-reload")
        self.assertEqual(self.llamadas[4]["orden"], "sudo systemctl enable --now starseed-memvid")

    def test_aplicar_sin_fuente_no_llama_a_ssh(self):
        rc, salida = self._main("memvid", "--aplicar", "--desde", "/no/existe/memvid-servidor")
        self.assertEqual(rc, 0)
        self.assertFalse(json.loads(salida)["ok"])
        self.assertEqual(self.llamadas, [])


if __name__ == "__main__":
    unittest.main()
