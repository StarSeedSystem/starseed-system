#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas de mejoras_neurona.py (OPM1010 · 2026-10-10).

Todo con respuestas simuladas: ninguna prueba sale a la red ni toca ~/.starseed (la carpeta se
redirige con STARSEED_MEJORAS_DIR a un temporal). Las formas de las respuestas son las que dieron
las fuentes reales el 2026-10-10 desde la Mac.
"""
import contextlib
import hashlib
import io
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).parent))
import mejoras_neurona as mn  # noqa: E402

SHA64 = "f" * 64
# Centinela que NO tiene forma de clave real (la protección de secretos de GitHub rechaza esas).
CENTINELA = "-".join(["centinela", "no", "imprimir", "1234"])

RESPUESTAS = {
    "https://api.github.com/repos/ollama/ollama/releases/latest": (200, {"tag_name": "v0.40.2", "published_at": "2026-10-08T00:00:00Z", "assets": [{"name": "ollama-darwin", "digest": "sha256:" + SHA64}]}, {}),
    "https://api.github.com/repos/microsoft/BitNet/commits?per_page=1": (200, [{"sha": "abcdef1234567", "commit": {"committer": {"date": "2026-07-27T00:00:00Z"}}}], {}),
    "https://huggingface.co/api/models/facebook/musicgen-small?blobs=true": (200, {"sha": "4c8334b9", "lastModified": "2023-11-17T13:56:10.000Z", "siblings": [{"rfilename": "model.safetensors", "lfs": {"sha256": SHA64, "size": 10}}]}, {}),
    "https://pypi.org/pypi/kokoro/json": (200, {"info": {"version": "0.9.4"}, "urls": [{"upload_time_iso_8601": "2025-04-01T00:00:00Z", "digests": {"sha256": SHA64}}]}, {}),
    "https://registry.npmjs.org/@mlc-ai/web-llm/latest": (200, {"version": "0.2.85", "dist": {"integrity": "sha512-xx"}}, {}),
}


class Simulador:
    """Hace de red: responde de RESPUESTAS y apunta cada petición (url, cabeceras)."""

    def __init__(self, respuestas=None):
        self.respuestas = dict(RESPUESTAS if respuestas is None else respuestas)
        self.pedidas = []

    def __call__(self, url, cabeceras, plazo):
        self.pedidas.append((url, dict(cabeceras)))
        return self.respuestas.get(url, (404, None, {}))


def sistema(sid, tipo, ref):
    return {"id": sid, "fuente": {"tipo": tipo, "ref": ref}}


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.env = mock.patch.dict(os.environ, {"STARSEED_MEJORAS_DIR": self.tmp.name}, clear=False)
        self.env.start()
        for nombre in ("GITHUB_TOKEN", "GH_TOKEN"):
            os.environ.pop(nombre, None)

    def tearDown(self):
        self.env.stop()
        self.tmp.cleanup()


class TestFuentes(Base):
    def test_url_de_cada_tipo(self):
        cat = {"vibeasr-cpp": {"fuente_oficial": "https://huggingface.co/microsoft/VibeVoice-ASR-BitNet"}}
        self.assertEqual(mn.url_de({"tipo": "github-release", "ref": "a/b"}, {}), "https://api.github.com/repos/a/b/releases/latest")
        self.assertEqual(mn.url_de({"tipo": "github-commit", "ref": "a/b"}, {}), "https://api.github.com/repos/a/b/commits?per_page=1")
        self.assertEqual(mn.url_de({"tipo": "huggingface", "ref": "a/b"}, {}), "https://huggingface.co/api/models/a/b?blobs=true")
        self.assertEqual(mn.url_de({"tipo": "npm", "ref": "@ffmpeg/ffmpeg"}, {}), "https://registry.npmjs.org/@ffmpeg/ffmpeg/latest")
        self.assertEqual(mn.url_de({"tipo": "catalogo-capas", "ref": "vibeasr-cpp"}, cat), "https://huggingface.co/api/models/microsoft/VibeVoice-ASR-BitNet?blobs=true")
        self.assertIsNone(mn.url_de({"tipo": "catalogo-capas", "ref": "no-existe"}, cat))
        self.assertIsNone(mn.url_de({"tipo": "ftp", "ref": "x"}, {}))

    def test_leer_version_de_cada_fuente(self):
        rel = mn.leer_version("github-release", RESPUESTAS["https://api.github.com/repos/ollama/ollama/releases/latest"][1])
        self.assertEqual(rel, {"version": "v0.40.2", "fecha": "2026-10-08T00:00:00Z", "verificable": True})
        com = mn.leer_version("github-commit", RESPUESTAS["https://api.github.com/repos/microsoft/BitNet/commits?per_page=1"][1])
        self.assertEqual(com["version"], "abcdef1")
        hf = mn.leer_version("huggingface", RESPUESTAS["https://huggingface.co/api/models/facebook/musicgen-small?blobs=true"][1])
        self.assertEqual((hf["version"], hf["verificable"]), ("4c8334b", True))
        # Sin LFS sha256 no hay huella verificable (no se presume).
        self.assertFalse(mn.leer_version("huggingface", {"sha": "1234567", "siblings": [{"rfilename": "x"}]})["verificable"])
        self.assertEqual(mn.leer_version("pypi", RESPUESTAS["https://pypi.org/pypi/kokoro/json"][1])["version"], "0.9.4")
        self.assertEqual(mn.leer_version("npm", RESPUESTAS["https://registry.npmjs.org/@mlc-ai/web-llm/latest"][1])["version"], "0.2.85")
        self.assertIsNone(mn.leer_version("github-release", {"message": "Not Found"}))
        self.assertIsNone(mn.leer_version("github-commit", []))

    def test_motivos_de_error_honestos(self):
        gh = "https://api.github.com/repos/a/b/releases/latest"
        self.assertIn("GITHUB_TOKEN", mn.motivo_error(403, {"x-ratelimit-remaining": "0"}, gh))
        self.assertIn("proxy", mn.motivo_error(403, {"content-type": "application/json"}, gh))
        self.assertIn("HTTP 403", mn.motivo_error(403, {"x-github-request-id": "abc"}, gh))
        self.assertIn("404", mn.motivo_error(404, {}, gh))
        self.assertIn("sin conexión", mn.motivo_error(0, {}, gh))
        self.assertIn("términos", mn.motivo_error(401, {}, "https://huggingface.co/api/models/x/y"))


class TestCache(Base):
    def test_cache_fresca_no_vuelve_a_pedir(self):
        reg = [sistema("ollama", "github-release", "ollama/ollama")]
        red = Simulador()
        r1 = mn.sondear(reg, {}, red, ahora=1000.0)
        r2 = mn.sondear(reg, {}, red, ahora=1000.0 + 3600)
        self.assertEqual(len(red.pedidas), 1)
        self.assertEqual(r1["fuentes"]["ollama"]["version"], "v0.40.2")
        self.assertEqual(r2["fuentes"]["ollama"]["version"], "v0.40.2")
        self.assertTrue((Path(self.tmp.name) / "cache.json").exists())

    def test_cache_caducada_o_forzada_pide_otra_vez(self):
        reg = [sistema("ollama", "github-release", "ollama/ollama")]
        red = Simulador()
        mn.sondear(reg, {}, red, ahora=1000.0)
        mn.sondear(reg, {}, red, ahora=1000.0 + mn.TTL_OK_S + 1)
        mn.sondear(reg, {}, red, ahora=1000.0 + mn.TTL_OK_S + 2, forzar=True)
        self.assertEqual(len(red.pedidas), 3)

    def test_fuente_caida_sirve_la_ultima_buena_marcada(self):
        reg = [sistema("ollama", "github-release", "ollama/ollama")]
        mn.sondear(reg, {}, Simulador(), ahora=1000.0)
        caida = Simulador({})
        caida.respuestas["https://api.github.com/repos/ollama/ollama/releases/latest"] = (502, None, {})
        r = mn.sondear(reg, {}, caida, ahora=1000.0 + mn.TTL_OK_S + 1)["fuentes"]["ollama"]
        self.assertEqual(r["version"], "v0.40.2")
        self.assertTrue(r["cache_vieja"])
        self.assertIn("502", r["error"])
        # El fallo se recuerda 10 min: no se insiste en cada sondeo.
        r2 = mn.sondear(reg, {}, caida, ahora=1000.0 + mn.TTL_OK_S + 60)["fuentes"]["ollama"]
        self.assertEqual(len(caida.pedidas), 1)
        self.assertEqual(r2["version"], "v0.40.2")

    def test_limite_de_github_corta_el_resto_de_github(self):
        reg = [sistema("a", "github-release", "x/a"), sistema("b", "github-commit", "x/b"), sistema("musica", "huggingface", "facebook/musicgen-small")]
        red = Simulador({"https://api.github.com/repos/x/a/releases/latest": (403, None, {"x-ratelimit-remaining": "0"}),
                         "https://huggingface.co/api/models/facebook/musicgen-small?blobs=true": RESPUESTAS["https://huggingface.co/api/models/facebook/musicgen-small?blobs=true"]})
        r = mn.sondear(reg, {}, red, ahora=1000.0)["fuentes"]
        pedidas = [u for u, _ in red.pedidas]
        self.assertNotIn("https://api.github.com/repos/x/b/commits?per_page=1", pedidas)
        self.assertIn("GITHUB_TOKEN", r["b"]["error"])
        self.assertEqual(r["musica"]["version"], "4c8334b")

    def test_plazo_total_no_deja_colgado_el_sondeo(self):
        reg = [sistema("ollama", "github-release", "ollama/ollama"), sistema("bitnet", "github-commit", "microsoft/BitNet")]
        relojes = iter([0.0, 0.0, mn.PLAZO_TOTAL_S + 1])
        r = mn.sondear(reg, {}, Simulador(), ahora=1000.0, reloj=lambda: next(relojes))["fuentes"]
        self.assertEqual(r["ollama"]["version"], "v0.40.2")
        self.assertIn("sin tiempo", r["bitnet"]["error"])


class TestClaves(Base):
    def test_el_token_se_usa_pero_no_se_imprime_ni_se_guarda(self):
        os.environ["GITHUB_TOKEN"] = CENTINELA
        red = Simulador()
        reg = [sistema("ollama", "github-release", "ollama/ollama"), sistema("kokoro", "pypi", "kokoro")]
        salida = io.StringIO()
        with mock.patch.object(mn, "cargar_registro", return_value=reg), mock.patch.object(mn, "pedir_http", red), contextlib.redirect_stdout(salida), contextlib.redirect_stderr(salida):
            mn.sondear(reg, {}, red, ahora=1.0)
            mn.main(["sondear", "--json", "--forzar"])
        gh = [c for u, c in red.pedidas if u.startswith("https://api.github.com/")]
        self.assertTrue(gh and all(c.get("Authorization") == "Bearer " + CENTINELA for c in gh))
        # A PyPI no se le manda la clave de GitHub.
        self.assertTrue(all("Authorization" not in c for u, c in red.pedidas if not u.startswith("https://api.github.com/")))
        self.assertNotIn(CENTINELA, salida.getvalue())
        for f in Path(self.tmp.name).iterdir():
            self.assertNotIn(CENTINELA, f.read_text(encoding="utf-8"))


class TestHuella(Base):
    def test_mac_apple_silicon(self):
        salidas = {("sysctl", "-n", "hw.memsize"): "17179869184\n", ("sysctl", "-n", "machdep.cpu.brand_string"): "Apple M1\n"}
        h = mn.huella(run=lambda c: salidas.get(tuple(c)), sistema="Darwin", maquina_cpu="arm64", hogar=self.tmp.name, nombre_host="Mac-de-Alex.local")
        self.assertEqual((h["sistema"], h["ram_mb"]), ("macos", 16384))
        self.assertEqual(h["gpu"], {"familia": "apple", "modelo": "Apple M1", "vram_mb": None})
        self.assertEqual(h["aceleraciones"], ["cpu", "metal"])
        self.assertGreater(h["disco_libre_mb"], 0)

    def test_linux_con_nvidia(self):
        smi = "NVIDIA GeForce RTX 3090, 24576\n"
        h = mn.huella(run=lambda c: smi if c[0] == "nvidia-smi" else None, sistema="Linux", maquina_cpu="x86_64",
                      leer=lambda p: "MemTotal:       65780000 kB\n" if p == "/proc/meminfo" else None, hogar=self.tmp.name, nombre_host="pc")
        self.assertEqual(h["ram_mb"], 65780000 // 1024)
        self.assertEqual(h["gpu"], {"familia": "nvidia", "modelo": "NVIDIA GeForce RTX 3090", "vram_mb": 24576})
        self.assertIn("cuda", h["aceleraciones"])

    def test_huella_de_maquina_igual_que_la_del_os(self):
        # src/lib/neurons/maquina-tipos.ts: minúsculas, sin .local y espacios → guiones.
        esperado = hashlib.sha256("starseed-maquina:mac-de-alex".encode()).hexdigest()[:16]
        self.assertEqual(mn.huella_maquina_hash(" Mac de Alex.local "), esperado)
        self.assertIsNone(mn.huella_maquina_hash(""))


class TestInstaladas(Base):
    def test_registro_mas_sondeo_local_y_manda_lo_medido(self):
        (Path(self.tmp.name) / "instaladas.json").write_text(json.dumps({
            "ollama": {"version": "0.39.0", "medio": "servidor"},
            "vibeasr-cpp": {"version": "66e7802", "sha256": SHA64},
            "roto": {"version": 5},
        }), encoding="utf-8")
        red = Simulador({"http://127.0.0.1:11434/api/version": (200, {"version": "0.40.1"}, {})})
        i = mn.instaladas(red)
        self.assertEqual(i["ollama"], {"version": "0.40.1", "medio": "servidor", "origen": "sondeo-local"})
        self.assertEqual(i["vibeasr-cpp"]["origen"], "registro")
        self.assertNotIn("roto", i)
        self.assertNotIn("comfyui", i)


class TestRegistroReal(Base):
    def test_cada_sistema_del_registro_tiene_url_de_consulta(self):
        reg = mn.cargar_registro()
        cat = mn.cargar_catalogo()
        self.assertGreaterEqual(len(reg), 20)
        sin_url = [s["id"] for s in reg if not mn.url_de(s["fuente"], cat)]
        self.assertEqual(sin_url, [])

    def test_estado_escribe_el_archivo_para_genesis(self):
        red = Simulador()
        with mock.patch.object(mn, "huella", return_value={"sistema": "macos"}):
            d = mn.estado(pedir=red)
        guardado = json.loads((Path(self.tmp.name) / "estado.json").read_text(encoding="utf-8"))
        self.assertEqual(guardado["esquema"], 1)
        self.assertEqual(set(guardado), {"esquema", "generado", "huella", "instaladas", "remotas"})
        self.assertEqual(d["remotas"]["ollama"]["version"], "v0.40.2")


if __name__ == "__main__":
    unittest.main()
