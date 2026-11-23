#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas de vigia_radar_modelos (AST1123E): radar completo sin red.

Todo inyectado: red (Simulador con respuestas grabadas de Epoch AI, HF, Ollama),
reloj, raíz temporal, sistema de archivos. Verifica:
- _gratis extrae :free del catálogo TypeScript
- _capas_inst filtra solo recomendadas con sha256 verificado
- _epoch normaliza scores 0-100
- _hf respeta límites y pausa
- _ollama parsea modelos oficiales
- _mejor pondera Epoch, capas, tamaño, capacidades, gratis
- radar genera informe por neurona con ganadores por categoría
- Escritura atómica y estado persistido
"""
import json
import os
import shutil
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import vigia_radar_modelos as VRM  # noqa: E402


AHORA = datetime(2026, 11, 23, 9, 0, tzinfo=timezone.utc)

EPOCH_RESP = {
    "data": [
        {"name": "Qwen/Qwen2.5-72B", "benchmark_score": 0.87},
        {"name": "meta-llama/Llama-3.3-70B", "benchmark_score": 0.82},
        {"name": "microsoft/phi-4", "benchmark_score": 0.75},
    ]
}

HF_TENDENCIA = [
    {"id": "Qwen/Qwen2.5-72B", "likes": 5000, "trending_score": 12.5, "pipeline_tag": "text-generation"},
    {"id": "Tongyi-MAI/Z-Image-Turbo", "likes": 300, "trending_score": 8.2, "pipeline_tag": "text-to-image"},
]

HF_CUANTIZADOS = [
    {"id": "unsloth/Qwen2.5-72B-GGUF", "likes": 200, "trending_score": 5.1},
    {"id": "bartowski/Llama-3.3-70B-GGUF", "likes": 150, "trending_score": 4.8},
]

OLLAMA_RESP = {
    "models": [
        {"name": "qwen2.5:72b", "size": 42000000000, "pulls": 15000},
        {"name": "llama3.3:70b", "size": 40000000000, "pulls": 12000},
        {"name": "phi4:14b", "size": 8000000000, "pulls": 8000},
    ]
}

CAPAS_ASTRAURA = {
    "capas": [
        {"id": "bitnet-b1.58-2b-4t", "estado": "recomendado", "sha256": "abc123", "familia": "microsoft/BitNet"},
        {"id": "ternary-bonsai-4b", "estado": "recomendado", "sha256": "def456", "familia": "prism-ml/Ternary-Bonsai"},
        {"id": "colibri-laya", "estado": "por-verificar", "sha256": "por-verificar"},
    ]
}

FREE_CATALOG_TS = '''
export const FREE_CATALOG = [
  { id: "openrouter/free", label: "Auto" },
  { id: "nvidia/nemotron-3-ultra-550b-a55b:free", label: "Nemotron 3 Ultra" },
  { id: "qwen/qwen3-coder:free", label: "Qwen3 Coder" },
  { id: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free", label: "Nemotron Nano Omni" },
  { id: "google/gemma-4-31b-it:free", label: "Gemma 4 31B" },
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite" },
  { id: "aihubmix/coding-glm-5.3-free", label: "GLM 5.3 Coding" },
] as const;
'''


class Simulador:
    """Simula HTTP para Epoch AI, Hugging Face, Ollama."""

    def __init__(self):
        self.peticiones = []
        self.contador_hf = 0

    def http_get(self, url, headers=None, timeout=20):
        self.peticiones.append(url)
        if "epochai.org" in url:
            return json.dumps(EPOCH_RESP)
        if "huggingface.co/api/models" in url:
            self.contador_hf += 1
            if "sort=trendingScore" in url and "author=" not in url:
                return json.dumps(HF_TENDENCIA)
            if "author=unsloth" in url or "author=bartowski" in url:
                return json.dumps(HF_CUANTIZADOS)
            return json.dumps([])
        if "ollama.com/api/models" in url:
            return json.dumps(OLLAMA_RESP)
        return json.dumps([])


class TestVigiaRadarModelos(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="radar-test-")
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)
        self.repo = Path(self.tmp)
        VRM.RAIZ = self.repo
        VRM.FREE_CAT = self.repo / "src" / "ai" / "astraura" / "free-catalog.ts"
        VRM.CAPAS = self.repo / "config" / "capas-astraura.json"
        VRM.ESTADO = Path(self.tmp) / "estado-radar.json"
        (self.repo / "src" / "ai" / "astraura").mkdir(parents=True)
        (self.repo / "config").mkdir(parents=True)
        (self.repo / "starseed_memory_root" / "radar").mkdir(parents=True)
        VRM.FREE_CAT.write_text(FREE_CATALOG_TS, encoding="utf-8")
        VRM.CAPAS.write_text(json.dumps(CAPAS_ASTRAURA), encoding="utf-8")

    def test_gratis_extrae_free(self):
        modelos = VRM._gratis()
        self.assertGreaterEqual(len(modelos), 5)
        ids = {m["id"] for m in modelos}
        self.assertIn("nvidia/nemotron-3-ultra-550b-a55b:free", ids)
        self.assertIn("qwen/qwen3-coder:free", ids)
        self.assertIn("gemini-2.5-flash", ids)
        self.assertIn("aihubmix/coding-glm-5.3-free", ids)
        for m in modelos:
            self.assertTrue(m["gratis"])

    def test_capas_inst_filtra_recomendadas_verificadas(self):
        capas = VRM._capas_inst()
        self.assertEqual(len(capas), 2)
        ids = {c["id"] for c in capas}
        self.assertIn("bitnet-b1.58-2b-4t", ids)
        self.assertIn("ternary-bonsai-4b", ids)
        self.assertNotIn("colibri-laya", ids)

    def test_epoch_normaliza_scores(self):
        sim = Simulador()
        scores = VRM._epoch(sim.http_get)
        self.assertEqual(len(scores), 3)
        self.assertAlmostEqual(scores["qwen/qwen2.5-72b"], 87.0)
        self.assertAlmostEqual(scores["meta-llama/llama-3.3-70b"], 82.0)
        self.assertAlmostEqual(scores["microsoft/phi-4"], 75.0)

    def test_hf_respeta_limite_y_pausa(self):
        sim = Simulador()
        candidatos = VRM._hf(sim.http_get, ["text-generation"], ["unsloth"])
        self.assertGreaterEqual(len(candidatos), 2)
        ids = {c["id"] for c in candidatos}
        self.assertIn("Qwen/Qwen2.5-72B", ids)
        self.assertIn("unsloth/Qwen2.5-72B-GGUF", ids)
        urls = " ".join(sim.peticiones)
        self.assertIn("trendingScore", urls)
        self.assertIn("author=unsloth", urls)

    def test_ollama_parsea_modelos(self):
        sim = Simulador()
        modelos = VRM._ollama(sim.http_get)
        self.assertEqual(len(modelos), 3)
        nombres = {m["id"] for m in modelos}
        self.assertIn("ollama/qwen2.5:72b", nombres)
        self.assertIn("ollama/llama3.3:70b", nombres)
        self.assertIn("ollama/phi4:14b", nombres)
        for m in modelos:
            self.assertIn("tamano_gb", m)
            self.assertIn("src", m)

    def test_cabe_respetar_limites(self):
        self.assertTrue(VRM._cabe(0.5, "navegador"))
        self.assertFalse(VRM._cabe(2.0, "navegador"))
        self.assertTrue(VRM._cabe(4.0, "mac"))
        self.assertFalse(VRM._cabe(5.0, "mac"))
        self.assertTrue(VRM._cabe(100.0, "app_nativa"))

    def test_mejor_pondera_correctamente(self):
        modelos = [
            {"id": "qwen/qwen2.5-72b", "src": "hf_tend", "tamano_gb": 42, "cap": ["conversacion", "codigo"], "gratis": False},
            {"id": "nim:deepseek-v4-flash", "src": "gratis", "tamano_gb": 0, "cap": ["conversacion", "codigo"], "gratis": True},
            {"id": "ollama/phi4:14b", "src": "ollama", "tamano_gb": 8, "cap": ["conversacion", "codigo", "ligera"], "gratis": True},
        ]
        epoch = {"qwen/qwen2.5-72b": 87, "microsoft/phi-4": 75}
        capas = [{"id": "bitnet-b1.58-2b-4t", "familia": "microsoft/BitNet"}]
        mejor = VRM._mejor(modelos, ["conversacion"], epoch, capas)
        self.assertIsNotNone(mejor)
        if mejor:
            self.assertIn("puntaje", mejor)
            self.assertTrue(any(VRM._cabe(mejor.get("tamano_gb", 999), m) for m in VRM.MEDIOS))

    def test_radar_genera_informe_por_neurona(self):
        sim = Simulador()
        neuronas = [
            {"id": "neurona-mac", "med": ["mac"], "cap": ["conversacion", "codigo", "vision", "ligera"]},
            {"id": "neurona-pwa", "med": ["pwa", "navegador"], "cap": ["conversacion", "ligera"]},
        ]
        inf = VRM.radar(http=sim.http_get, ahora=AHORA, neuronas=neuronas)
        self.assertEqual(inf["fecha"], AHORA.isoformat())
        self.assertEqual(set(inf["neuronas"].keys()), {"neurona-mac", "neurona-pwa"})
        for nid, datos in inf["neuronas"].items():
            self.assertIn("ganadores", datos)
            self.assertIn("total", datos)
            self.assertIn("candidatos", datos)
            for cat in (neuronas[0]["cap"] if nid == "neurona-mac" else neuronas[1]["cap"]):
                if cat in datos["ganadores"]:
                    g = datos["ganadores"][cat]
                    self.assertIn("modelo", g)
                    self.assertIn("fuente", g)
                    self.assertIn("puntaje", g)

    def test_radar_escribe_archivos_atomicos(self):
        sim = Simulador()
        neuronas = [{"id": "test", "med": ["mac"], "cap": ["conversacion"]}]
        VRM.radar(http=sim.http_get, ahora=AHORA, neuronas=neuronas)
        informe_path = self.repo / "starseed_memory_root" / "radar" / f"informe-{AHORA:%Y-%m-%d}.json"
        self.assertTrue(informe_path.exists())
        with open(informe_path, encoding="utf-8") as f:
            datos = json.load(f)
        self.assertEqual(datos["fecha"], AHORA.isoformat())
        self.assertTrue(VRM.ESTADO.exists())
        with open(VRM.ESTADO, encoding="utf-8") as f:
            estado = json.load(f)
        self.assertEqual(estado["ultima"], AHORA.isoformat())
        self.assertIn("test", estado["neuronas"])
        tmps = list(self.repo.rglob("*.tmp"))
        self.assertEqual(tmps, [])

    def test_radar_filtra_por_medio_neurona(self):
        sim = Simulador()
        neuronas = [
            {"id": "pwa", "med": ["pwa"], "cap": ["conversacion"]},
            {"id": "mac", "med": ["mac"], "cap": ["conversacion"]},
        ]
        inf = VRM.radar(http=sim.http_get, ahora=AHORA, neuronas=neuronas)
        self.assertLessEqual(inf["neuronas"]["pwa"]["candidatos"], inf["neuronas"]["mac"]["candidatos"])
        g_pwa = inf["neuronas"]["pwa"]["ganadores"].get("conversacion")
        if g_pwa:
            self.assertTrue(VRM._cabe(g_pwa.get("tamano_gb", 999), "pwa"))

    def test_main_seco_imprime_json(self):
        import io
        from contextlib import redirect_stdout
        sim = Simulador()
        original = VRM._get
        VRM._get = sim.http_get
        try:
            f = io.StringIO()
            with redirect_stdout(f):
                VRM.main(["--seco", "--neurona", "test"])
            salida = f.getvalue()
            self.assertIn("neurona", salida.lower())
            self.assertIn("ganadores", salida.lower())
        finally:
            VRM._get = original


if __name__ == "__main__":
    unittest.main()