# -*- coding: utf-8 -*-
"""Pruebas del descubridor del vigía (VGM1016B): sin red, con respuestas grabadas de Hugging Face."""
import json, os, sys, unittest
from datetime import datetime, timezone
from unittest import mock
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import vigia_descubrir as V

AHORA = datetime(2026, 10, 16, 12, tzinfo=timezone.utc)
SHA = "a" * 64
AREA = {"id": "imagen", "pipeline_tags": ["text-to-image"], "autores": ["Qwen"], "cuantizadores": ["unsloth"]}
CATALOGO = {"Qwen/Qwen-Image-2.1"}
def _m(ref, creado, likes=0, licencia=None, gated=False):
    m = {"id": ref, "likes": likes, "createdAt": creado, "lastModified": creado, "gated": gated}
    return dict(m, tags=[f"license:{licencia}"]) if licencia else m
TURBO = _m("Qwen/Qwen-Image-2.1-Turbo", "2026-10-09T14:55:00Z", 12458, "qwen-research", "manual")
GGUF = _m("unsloth/Qwen-Image-2.1-Turbo-GGUF", "2026-10-10T08:30:00Z", 8920)
EDIT = _m("Qwen/Qwen-Image-2.1-Edit", "2026-10-01T06:00:00Z", 1234, "qwen-research")
OLD = _m("Qwen/Qwen-Image-Old", "2026-01-01T00:00:00Z", 10)
UNC = _m("abenzerps/Qwen-Image-2.1-Turbo-Uncensored", "2026-10-12T00:00:00Z", 400)
UNC_GGUF = _m("AtomicChat/Qwen-Image-2.1-Turbo-Uncensored-GGUF", "2026-10-12T00:00:00Z", 300)
HERE = _m("pottokao/Qwen-Image-2.1-Text-Encoder-Heretic-GGUF", "2026-10-12T00:00:00Z", 200)
AJENO = _m("otro/Qwen-Image-Edit", "2026-10-12T00:00:00Z", 50)
RESPUESTAS = [
    ("pipeline_tag=text-to-image&sort=trendingScore", [TURBO, GGUF, UNC, UNC_GGUF, HERE]),
    ("author=Qwen&sort=createdAt", [TURBO, EDIT, OLD]),
    ("search=Qwen-Image-2.1&limit=30", [TURBO, EDIT, AJENO]),
    ("search=Qwen-Image-2.1-Turbo&author=unsloth", [GGUF]),
    ("models/Qwen/Qwen-Image-2.1-Turbo?blobs=true",
     {"siblings": [{"rfilename": "model.safetensors", "size": 2470000000, "lfs": {"sha256": SHA}}]}),
    ("models/unsloth/Qwen-Image-2.1-Turbo-GGUF?blobs=true",
     {"siblings": [{"rfilename": "Qwen-Image-2.1-Turbo-Q2_K.gguf", "size": 2470000000,
                    "lfs": {"sha256": SHA, "size": 2470000000}}],
      "cardData": {"license": "other", "license_name": "qwen-research"}}),
]
class HttpFalso:
    def __init__(self, respuestas=None):
        self.respuestas, self.llamadas = RESPUESTAS if respuestas is None else respuestas, []

    def __call__(self, url, headers=None, timeout=30):
        self.llamadas.append({"url": url, "headers": dict(headers or {})})
        return next((v if isinstance(v, str) else json.dumps(v) for k, v in self.respuestas if k in url), None)


def correr(area=None, catalogo=None, http=None):
    http, pausas = http or HttpFalso(), []
    candidatos = V.descubrir(area or AREA, CATALOGO if catalogo is None else catalogo, http, AHORA, dormir=pausas.append)
    return candidatos, http, pausas

class DescubrirDelVigia(unittest.TestCase):
    def test_turbo_real_primero_y_re_subidas_fuera(self):
        ids = [c["id"] for c in correr()[0]]
        self.assertEqual(ids[0], "Qwen/Qwen-Image-2.1-Turbo")
        self.assertIn("unsloth/Qwen-Image-2.1-Turbo-GGUF", ids)
        self.assertNotIn("abenzerps/Qwen-Image-2.1-Turbo-Uncensored", ids)
        self.assertNotIn("AtomicChat/Qwen-Image-2.1-Turbo-Uncensored-GGUF", ids)
        self.assertNotIn("pottokao/Qwen-Image-2.1-Text-Encoder-Heretic-GGUF", ids)
    def test_familia_solo_ultimos_60_dias(self):
        ids = [c["id"] for c in correr()[0]]
        self.assertIn("Qwen/Qwen-Image-2.1-Edit", ids)
        self.assertNotIn("Qwen/Qwen-Image-Old", ids)
    def test_hermanos_por_prefijo_y_sin_ajenos(self):
        ids = [c["id"] for c in correr()[0]]
        self.assertEqual(ids.count("Qwen/Qwen-Image-2.1-Edit"), 1)
        self.assertNotIn("otro/Qwen-Image-Edit", ids)

    def test_cuantizado_con_bytes_y_sha(self):
        gguf = next(c for c in correr()[0] if c["id"] == "unsloth/Qwen-Image-2.1-Turbo-GGUF")
        archivo = next(a for a in gguf["archivos"] if a["nombre"].endswith("Q2_K.gguf"))
        self.assertEqual((archivo["bytes"], archivo["sha256"], gguf["licencia_hf"]),
                         (2470000000, SHA, "qwen-research"))

    def test_detalle_blobs_del_safetensors(self):
        candidatos, http, _ = correr()
        turbo = next(c for c in candidatos if c["id"] == "Qwen/Qwen-Image-2.1-Turbo")
        self.assertEqual(turbo["archivos"], [{"nombre": "model.safetensors", "bytes": 2470000000, "sha256": SHA}])
        self.assertTrue(any("Qwen/Qwen-Image-2.1-Turbo?blobs=true" in c["url"] for c in http.llamadas))

    def test_lo_que_ya_esta_en_catalogo_no_se_repite(self):
        ids = [c["id"] for c in correr(catalogo={"Qwen/Qwen-Image-2.1", "Qwen/Qwen-Image-2.1-Turbo"})[0]]
        self.assertNotIn("Qwen/Qwen-Image-2.1-Turbo", ids)
        self.assertIn("unsloth/Qwen-Image-2.1-Turbo-GGUF", ids)

    def test_sin_duplicados_y_estructura(self):
        candidatos = correr()[0]
        ids = [c["id"] for c in candidatos]
        self.assertEqual(len(ids), len(set(ids)))
        campos = {"id", "autor", "creado", "modificado", "pipeline_tag", "likes", "trending",
                  "licencia_hf", "gated", "archivos"}
        for c in candidatos:
            self.assertEqual(set(c), campos)
            self.assertIsInstance(c["gated"], bool)
            self.assertIsInstance(c["archivos"], list)
            self.assertIsInstance(c["trending"], (int, float))

    def test_token_solo_si_esta_en_el_entorno(self):
        with mock.patch.dict(os.environ):
            os.environ.pop("HF_TOKEN", None)
            self.assertFalse(any("Authorization" in c["headers"] for c in correr()[1].llamadas))
            os.environ["HF_TOKEN"] = "token-de-prueba"
            _, http, _ = correr()
            self.assertTrue(all(c["headers"].get("Authorization", "").startswith("Bearer ") for c in http.llamadas))

    def test_fuente_caida_no_tumba_la_pasada(self):
        respuestas = [("pipeline_tag=text-to-image&sort=trendingScore", "{roto")] + RESPUESTAS[1:]
        self.assertIn("Qwen/Qwen-Image-2.1-Edit", [c["id"] for c in correr(http=HttpFalso(respuestas))[0]])

    def test_tope_120_y_pausa_de_un_segundo(self):
        inundacion = [_m(f"autor{i}/Modelo-{i}", "2026-10-10T00:00:00Z", 1) for i in range(100)]
        area = dict(AREA, autores=[], cuantizadores=[f"q{i}" for i in range(8)])
        http = HttpFalso([("pipeline_tag=text-to-image&sort=trendingScore", inundacion)])
        pausas = []
        V.descubrir(area, {f"cat/Familia-{i}" for i in range(40)}, http, AHORA, dormir=pausas.append)
        self.assertEqual(len(http.llamadas), V.MAX_PETICIONES)
        self.assertEqual(len(pausas), V.MAX_PETICIONES - 1)
        self.assertTrue(all(p == 1.0 for p in pausas))


if __name__ == "__main__":
    unittest.main(verbosity=2)
