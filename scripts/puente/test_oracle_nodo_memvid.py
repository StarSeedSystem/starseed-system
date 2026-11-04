# -*- coding: utf-8 -*-
"""Pruebas de la orden `memvid` del A1 (MVD1027I): el plan del servidor de cápsulas, que sin
`--aplicar` no se llama a SSH y la unidad. Sin red y sin tocar el disco del A1."""
import contextlib, io, json, os, re, sys, tarfile, tempfile, unittest  # noqa: E401

DIR = os.path.dirname(os.path.abspath(__file__))
if DIR not in sys.path:
    sys.path.insert(0, DIR)

import oracle_nodo as N  # noqa: E402

SERVICIO = os.path.join(DIR, "..", "..", "deploy", "oracle", "nodo", "systemd", "starseed-memvid.service")
BINARIO = "/home/starseed/memvid-servidor/target/release/memvid-servidor"


class Plan(unittest.TestCase):
    def test_copia_y_compila_con_el_cargo_del_a1_como_starseed(self):
        plan = N.plan_memvid()
        copia = [p for p in plan if p.get("copiar")]
        self.assertEqual(len(copia), 1)
        self.assertEqual(copia[0]["args"][:3], ["sudo", "-u", "starseed"])
        self.assertIn(N.MEMVID_DIR_A1, copia[0]["args"])
        compila = [p["args"] for p in plan if "/home/starseed/.cargo/bin/cargo" in p["args"]]
        self.assertEqual(len(compila), 1)
        self.assertEqual(compila[0][:3], ["sudo", "-u", "starseed"])
        self.assertIn("--release", compila[0])
        self.assertIn(N.MEMVID_DIR_A1 + "/Cargo.toml", compila[0])
        self.assertLess(plan.index(copia[0]), [p["args"] for p in plan].index(compila[0]))
        textos = [" ".join(p["args"]) for p in plan]
        self.assertTrue(any("install -d -o starseed" in t and N.MEMVID_DATOS_A1 in t for t in textos))

    def test_no_arranca_nada_ni_lleva_claves(self):
        plan = N.plan_memvid()
        texto = json.dumps(plan, ensure_ascii=False)
        self.assertNotIn("systemctl", texto)
        for prohibido in (r"\bAPI_KEY\b", r"\bSECRET\b", r"\bPASSWORD\b", r"\bmv2_"):
            self.assertIsNone(re.search(prohibido, texto, re.I), prohibido)
        self.assertTrue(all(p["porque"] and all(isinstance(a, str) for a in p["args"]) for p in plan))

    def test_el_paquete_no_lleva_target(self):
        raiz = N.RAIZ
        with tempfile.TemporaryDirectory() as tmp:
            fuente = os.path.join(tmp, N.MEMVID_FUENTE)
            os.makedirs(os.path.join(fuente, "src"))
            os.makedirs(os.path.join(fuente, "target", "release"))
            for ruta in ("Cargo.toml", "src/main.rs", "target/release/x"):
                open(os.path.join(fuente, ruta), "w").close()
            N.RAIZ = tmp
            try:
                datos = N._tar_memvid()
            finally:
                N.RAIZ = raiz
        nombres = tarfile.open(fileobj=io.BytesIO(datos), mode="r:gz").getnames()
        self.assertIn("./Cargo.toml", nombres)
        self.assertIn("./src/main.rs", nombres)
        self.assertFalse([n for n in nombres if "target" in n])


class SSH(unittest.TestCase):
    def setUp(self):
        self.llamadas = []
        self._ssh, self._bytes, self._tar = N.ssh, N._ssh_bytes, N._tar_memvid
        self._rc = 0

        def falso(tipo):
            return lambda orden, *a, **k: (self.llamadas.append((tipo, orden)), (self._rc, "salida"))[1]

        N.ssh, N._ssh_bytes, N._tar_memvid = falso("ssh"), falso("bytes"), lambda: b"tar"

    def tearDown(self):
        N.ssh, N._ssh_bytes, N._tar_memvid = self._ssh, self._bytes, self._tar

    def _main(self, *argv):
        salida = io.StringIO()
        with contextlib.redirect_stdout(salida):
            rc = N.main(["oracle_nodo.py", *argv])
        return rc, json.loads(salida.getvalue())

    def test_sin_aplicar_no_llama_a_ssh_y_ensena_el_plan(self):
        rc, datos = self._main("memvid")
        self.assertEqual(rc, 0)
        self.assertEqual(self.llamadas, [])
        self.assertFalse(datos["aplicado"])
        self.assertIn("cargo", json.dumps(datos["pasos"]))

    def test_con_aplicar_copia_por_la_entrada_y_compila(self):
        rc, datos = self._main("memvid", "--aplicar")
        self.assertTrue(datos["ok"])
        self.assertEqual(len(self.llamadas), len(N.plan_memvid()))
        self.assertEqual([t for t, _ in self.llamadas].count("bytes"), 1)
        self.assertTrue(any("cargo build --release" in o for _, o in self.llamadas))

    def test_para_al_primer_fallo_y_sin_codigo_ni_llama(self):
        self._rc = 2
        _, datos = self._main("memvid", "--aplicar")
        self.assertFalse(datos["ok"])
        self.assertEqual(len(self.llamadas), 1)
        N._tar_memvid, self.llamadas = (lambda: None), []
        self.assertFalse(self._main("memvid", "--aplicar")[1]["ok"])
        self.assertEqual(self.llamadas, [])


class Servicio(unittest.TestCase):
    def test_binario_usuario_y_limites(self):
        with open(SERVICIO, encoding="utf-8") as f:
            self.texto = f.read()
        self.assertIn("# requiere: " + BINARIO, self.texto)
        self.assertIn("ExecStart=" + BINARIO, self.texto)
        self.assertIn("User=starseed", self.texto)
        self.assertIn("Environment=STARSEED_MEMVID_DIR=" + N.MEMVID_DATOS_A1, self.texto)
        self.assertIn("Restart=on-failure", self.texto)
        self.assertIn("MemoryMax=512M", self.texto)
        self.assertIn("Nice=10", self.texto)
        self.assertIn("starseed-memvid", N.UNIDADES_AJENAS_DIRECCION)


if __name__ == "__main__":
    unittest.main()
