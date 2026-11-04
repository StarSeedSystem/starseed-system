# -*- coding: utf-8 -*-
"""Pruebas de la orden `memvid` del A1 (MVD1027I): copia el servidor Rust y lo compila con el
cargo del A1 como starseed. Sin `--aplicar` no se llama a SSH, y nada de claves ni de memvid.com."""
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

SERVICIO = os.path.normpath(os.path.join(
    DIR, "..", "..", "deploy", "oracle", "nodo", "systemd", "starseed-memvid.service"))


class Plan(unittest.TestCase):
    def test_copia_el_servidor_y_compila_como_starseed(self):
        plan = N.plan_memvid()
        self.assertEqual([p["que"] for p in plan], ["copiar", "compilar"])
        copiar, compilar = plan
        self.assertEqual(copiar["origen"], N.MEMVID_FUENTE)
        self.assertEqual(copiar["destino"], N.MEMVID_CARPETA_A1)
        self.assertEqual(compilar["cwd"], N.MEMVID_CARPETA_A1)
        self.assertEqual(compilar["args"], ["/home/starseed/.cargo/bin/cargo", "build", "--release"])

    def test_no_entra_el_sdk_de_node_ni_claves(self):
        plan = N.plan_memvid("/srv/memvid-servidor", "/srv/destino")
        self.assertEqual(plan[0]["origen"], "/srv/memvid-servidor")
        self.assertEqual(plan[1]["cwd"], "/srv/destino")
        texto = json.dumps(plan, ensure_ascii=False).upper()
        self.assertNotIn("NODE", texto)
        self.assertNotIn("MEMVID.COM", texto)
        for prohibido in (r"\bAPI_KEY\b", r"\bSECRET\b", r"\bPASSWORD\b", r"\bTOKEN\b"):
            self.assertIsNone(re.search(prohibido, texto), prohibido)
        self.assertTrue(all(p["porque"] for p in plan))


class SinAplicar(unittest.TestCase):
    def test_no_llama_a_ssh_y_ensena_el_plan(self):
        llamadas = []
        viejo_ssh, viejo_bytes = N.ssh, N._ssh_bytes
        N.ssh = lambda orden, entrada=None, timeout=120: (llamadas.append(orden), (0, ""))[1]
        N._ssh_bytes = lambda orden, datos, timeout=300: (llamadas.append(orden), (0, ""))[1]
        try:
            salida = io.StringIO()
            with contextlib.redirect_stdout(salida):
                rc = N.main(["oracle_nodo.py", "memvid"])
        finally:
            N.ssh, N._ssh_bytes = viejo_ssh, viejo_bytes
        self.assertEqual(rc, 0)
        self.assertEqual(llamadas, [])
        datos = json.loads(salida.getvalue())
        self.assertFalse(datos["aplicado"])
        self.assertEqual([p["que"] for p in datos["pasos"]], ["copiar", "compilar"])
        self.assertIn("native/memvid-servidor", json.dumps(datos, ensure_ascii=False))


class Aplicar(unittest.TestCase):
    def setUp(self):
        self.temporal = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporal.cleanup)
        self.origen = os.path.join(self.temporal.name, "memvid-servidor")
        os.makedirs(self.origen)
        with open(os.path.join(self.origen, "Cargo.toml"), "w", encoding="utf-8") as f:
            f.write("[package]\nname = \"memvid-servidor\"\n")
        self.llamadas = []
        self._ssh, self._bytes = N.ssh, N._ssh_bytes
        N.ssh = lambda orden, entrada=None, timeout=120: (self.llamadas.append(("ssh", orden, timeout)), (0, "[memvid] listo"))[1]
        N._ssh_bytes = lambda orden, datos, timeout=300: (self.llamadas.append(("bytes", orden, len(datos))), (0, ""))[1]

    def tearDown(self):
        N.ssh, N._ssh_bytes = self._ssh, self._bytes

    def test_copia_y_compila_por_ssh_como_starseed(self):
        r = N.memvid(aplicar=True, fuente=self.origen, destino=N.MEMVID_CARPETA_A1)
        self.assertTrue(r["ok"])
        copiar, compilar = self.llamadas
        self.assertEqual(copiar[0], "bytes")
        self.assertIn("sudo -u starseed", copiar[1])
        self.assertIn("tar -xzf -", copiar[1])
        self.assertGreater(copiar[2], 0)
        self.assertEqual(compilar[0], "ssh")
        self.assertIn("sudo -u starseed", compilar[1])
        self.assertIn("/home/starseed/.cargo/bin/cargo build --release", compilar[1])
        self.assertGreaterEqual(compilar[2], 3600)

    def test_sin_fuente_local_no_miente_ni_llama_a_ssh(self):
        r = N.memvid(aplicar=True, fuente=os.path.join(self.temporal.name, "no-existe"))
        self.assertFalse(r["ok"])
        self.assertIn("native/memvid-servidor", str(r.get("motivo") or ""))
        self.assertEqual(self.llamadas, [])


class Servicio(unittest.TestCase):
    def test_escucha_solo_en_local_y_tiene_limites(self):
        with open(SERVICIO, encoding="utf-8") as f:
            texto = f.read()
        self.assertIn("User=starseed", texto)
        self.assertIn("ExecStart=/home/starseed/memvid-servidor/target/release/memvid-servidor", texto)
        self.assertIn("Environment=STARSEED_MEMVID_DIR=/var/lib/starseed/memvid", texto)
        self.assertIn("Restart=on-failure", texto)
        self.assertIn("MemoryMax=512M", texto)
        self.assertIn("Nice=10", texto)
        self.assertIn("# requiere: /home/starseed/memvid-servidor/target/release/memvid-servidor", texto)


if __name__ == "__main__":
    unittest.main()
