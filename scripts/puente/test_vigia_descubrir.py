# -*- coding: utf-8 -*-
"""Pruebas del descubridor de modelos (Ola 1016M · VGM1016B), sin red.

Las respuestas son las grabadas de la API pública de Hugging Face del 2026-10-16
(con el caso real de `Qwen/Qwen-Image-2.1-Turbo` y `unsloth/Qwen-Image-2.1-Turbo-GGUF`).
El cliente HTTP, el reloj y la pausa se inyectan: ninguna prueba abre un socket.
"""

import json
import os
import sys
import unittest
from datetime import datetime, timezone
from unittest import mock
from urllib.parse import parse_qs, unquote, urlsplit

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import vigia_descubrir as V

AHORA = datetime(2026, 10, 16, 12, 0, tzinfo=timezone.utc)
AREA = {
    "id": "imagen",
    "pipeline_tags": ["text-to-image"],
    "autores": ["Qwen"],
    "cuantizadores": ["unsloth", "city96"],
}
CATALOGO = {"Qwen/Qwen-Image-2.1"}


def modelo(id_, autor, creado="2026-10-09T14:55:00Z", tag="text-to-image", **extra):
    datos = {"id": id_, "author": autor, "created_at": creado, "last_modified": creado,
             "pipeline_tag": tag, "likes": 100, "gated": False,
             "tags": ["license:qwen-research"]}
    datos.update(extra)
    return datos


# Fuente 1: `models?pipeline_tag=text-to-image&sort=trendingScore&direction=-1&limit=30`
TENDENCIA = [
    modelo("Qwen/Qwen-Image-2.1-Turbo", "Qwen", likes=12458, gated="auto",
           cardData={"license": "qwen-research"}),
    modelo("AtomicChat/Qwen-Image-2.1-Turbo-Uncensored-GGUF", "AtomicChat"),
    modelo("KasugaiSakura/Qwen-Image-2.1-Turbo-Abliterated", "KasugaiSakura"),
    modelo("stabilityai/stable-diffusion-xl-base-1.0", "stabilityai", creado="2026-09-15T08:00:00Z"),
]

# Fuente 2: `models?author=Qwen&sort=createdAt&direction=-1&limit=20`
AUTOR = [
    modelo("Qwen/Qwen-Image-2.1", "Qwen", creado="2026-09-14T10:00:00Z"),
    modelo("Qwen/Qwen-Image-2.1-Edit", "Qwen", creado="2026-10-01T06:00:00Z"),
    modelo("Qwen/Qwen-Image-2.2", "Qwen", creado="2026-10-05T06:00:00Z"),
    modelo("Qwen/Qwen-Image-2.1-Viejo", "Qwen", creado="2026-08-01T00:00:00Z"),
    modelo("Qwen/Qwen3-8B", "Qwen", creado="2026-10-02T00:00:00Z", tag="text-generation"),
]

# Fuente 3: `models?search=Qwen-Image-2.1&limit=50`
HERMANOS = [
    modelo("Qwen/Qwen-Image-2.1", "Qwen", creado="2026-09-14T10:00:00Z"),
    modelo("Qwen/Qwen-Image-2.1-Edit", "Qwen", creado="2026-10-01T06:00:00Z"),
    modelo("Qwen/Qwen-Image-2.10", "Qwen"),
]

# Fuente 4: `models?search=Qwen-Image-2.1-Turbo&author=unsloth&limit=10`
CUANTIZADOS = [
    modelo("unsloth/Qwen-Image-2.1-Turbo-GGUF", "unsloth", creado="2026-10-10T08:30:00Z"),
]

# Detalle: `models/<id>?blobs=true`
DETALLES = {
    "Qwen/Qwen-Image-2.1-Turbo": {
        "id": "Qwen/Qwen-Image-2.1-Turbo",
        "last_modified": "2026-10-09T14:55:00Z",
        "pipeline_tag": "text-to-image",
        "gated": "auto",
        "cardData": {"license": "qwen-research"},
        "siblings": [
            {"rfilename": "model.safetensors", "size": 14200000000,
             "lfs": {"sha256": "sha-turbo", "size": 14200000000}},
            {"rfilename": "config.json", "size": 1234},
        ],
    },
    "unsloth/Qwen-Image-2.1-Turbo-GGUF": {
        "id": "unsloth/Qwen-Image-2.1-Turbo-GGUF",
        "cardData": {"license": "qwen-research"},
        "siblings": [
            {"rfilename": "Qwen-Image-2.1-Turbo-Q2_K.gguf", "size": 2470000000,
             "lfs": {"sha256": "sha-q2k", "size": 2470000000}},
            {"rfilename": "Qwen-Image-2.1-Turbo-Q4_K_M.gguf", "size": 4200000000,
             "lfs": {"sha256": "sha-q4km", "size": 4200000000}},
        ],
    },
}


class HfFalso:
    """Cliente HTTP grabado: enruta por la ruta y los parámetros, como la API real."""

    def __init__(self, responder=None, detalles=None):
        self.responder = responder if responder is not None else self._grabado
        self.detalles = DETALLES if detalles is None else detalles
        self.llamadas = []

    @staticmethod
    def _grabado(consulta):
        if consulta.get("pipeline_tag") == "text-to-image" and consulta.get("sort") == "trendingScore":
            return TENDENCIA
        if consulta.get("author") == "Qwen" and consulta.get("sort") == "createdAt":
            return AUTOR
        if consulta.get("search") == "Qwen-Image-2.1" and not consulta.get("author"):
            return HERMANOS
        if consulta.get("search") == "Qwen-Image-2.1-Turbo" and consulta.get("author") == "unsloth":
            return CUANTIZADOS
        return []

    def __call__(self, url, headers=None, timeout=30):
        del timeout
        self.llamadas.append({"url": url, "headers": dict(headers or {})})
        partes = urlsplit(url)
        prefijo = "/api/models/"
        if partes.path.startswith(prefijo):
            id_ = unquote(partes.path[len(prefijo):])
            return json.dumps(self.detalles.get(id_, {}))
        consulta = {clave: valores[0] for clave, valores in parse_qs(partes.query).items()}
        datos = self.responder(consulta)
        return None if datos is None else json.dumps(datos)

    @property
    def urls(self):
        return [llamada["url"] for llamada in self.llamadas]


def ejecutar(falso, catalogo=CATALOGO, ahora=AHORA, area=None, limite=V.LIMITE_PETICIONES):
    """Llama a descubrir con pausa grabada (nunca duerme de verdad)."""
    dormidas = []
    candidatos = V.descubrir(area or AREA, catalogo, falso, ahora,
                             dormir=dormidas.append, limite_peticiones=limite)
    return candidatos, dormidas


def por_id(candidatos):
    return {c["id"]: c for c in candidatos}


class DescubrirPorFuentes(unittest.TestCase):
    def setUp(self):
        self.falso = HfFalso()
        self.candidatos, self.dormidas = ejecutar(self.falso)
        self.ids = [c["id"] for c in self.candidatos]

    def test_tendencia_ordenada_por_trending_score_y_no_por_likes(self):
        self.assertEqual(self.ids[0], "Qwen/Qwen-Image-2.1-Turbo")
        self.assertTrue(any("sort=trendingScore" in url for url in self.falso.urls))
        self.assertFalse(any("sort=likes" in url for url in self.falso.urls))

    def test_caso_real_turbo_con_su_gguf_y_sus_sha(self):
        turbo = por_id(self.candidatos)["Qwen/Qwen-Image-2.1-Turbo"]
        self.assertEqual((turbo["autor"], turbo["licencia_hf"], turbo["gated"]),
                         ("Qwen", "qwen-research", True))
        safetensors = {a["nombre"]: a for a in turbo["archivos"]}["model.safetensors"]
        self.assertEqual((safetensors["bytes"], safetensors["sha256"]), (14200000000, "sha-turbo"))

        gguf = por_id(self.candidatos)["unsloth/Qwen-Image-2.1-Turbo-GGUF"]
        self.assertEqual(gguf["autor"], "unsloth")
        self.assertEqual({a["nombre"] for a in gguf["archivos"]},
                         {"Qwen-Image-2.1-Turbo-Q2_K.gguf", "Qwen-Image-2.1-Turbo-Q4_K_M.gguf"})
        self.assertTrue(all(a.get("sha256") for a in gguf["archivos"]))

    def test_detalle_pide_blobs_para_los_archivos(self):
        self.assertIn("https://huggingface.co/api/models/Qwen/Qwen-Image-2.1-Turbo?blobs=true",
                      self.falso.urls)

    def test_familia_por_autor_solo_ultimos_60_dias_y_del_area(self):
        self.assertIn("Qwen/Qwen-Image-2.1-Edit", self.ids)
        self.assertIn("Qwen/Qwen-Image-2.2", self.ids)
        self.assertNotIn("Qwen/Qwen-Image-2.1-Viejo", self.ids)
        self.assertNotIn("Qwen/Qwen3-8B", self.ids)

    def test_hermanos_por_prefijo_de_nombre(self):
        self.assertIn("Qwen/Qwen-Image-2.1-Edit", self.ids)
        self.assertNotIn("Qwen/Qwen-Image-2.10", self.ids)
        self.assertNotIn("Qwen/Qwen-Image-2.1", self.ids)  # ya está en el catálogo

    def test_fuera_re_subidas_uncensored_y_abliterated(self):
        for id_ in self.ids:
            self.assertNotRegex(id_.lower(), r"uncensored|abliterated|nsfw")

    def test_sin_duplicados(self):
        self.assertEqual(len(self.ids), len(set(self.ids)))

    def test_estructura_del_candidato(self):
        campos = {"id", "autor", "creado", "modificado", "pipeline_tag", "likes",
                  "trending", "licencia_hf", "gated", "archivos"}
        for candidato in self.candidatos:
            self.assertEqual(set(candidato), campos)
            self.assertIsInstance(candidato["likes"], int)
            self.assertIsInstance(candidato["trending"], float)
            self.assertIsInstance(candidato["gated"], bool)

    def test_reloj_inyectado_mueve_la_ventana_de_60_dias(self):
        self.assertNotIn("Qwen/Qwen-Image-2.1-Viejo", self.ids)
        antiguo, _ = ejecutar(HfFalso(), ahora=datetime(2026, 8, 15, tzinfo=timezone.utc))
        self.assertIn("Qwen/Qwen-Image-2.1-Viejo", [c["id"] for c in antiguo])


def responder_infinito(_consulta):
    """30 modelos distintos para cualquier consulta: fuerza a agotar el presupuesto."""
    return [{"id": f"cuenta{i}/modelo-{i}", "author": f"cuenta{i}",
             "created_at": "2026-10-10T00:00:00Z", "pipeline_tag": "text-to-image",
             "likes": 1} for i in range(30)]


class LimitesYProtocolo(unittest.TestCase):
    def test_como_mucho_120_peticiones_por_pasada(self):
        area = {"pipeline_tags": [f"tag-{i}" for i in range(20)],
                "autores": [f"autor-{i}" for i in range(20)],
                "cuantizadores": ["unsloth", "city96"]}
        falso = HfFalso(responder=responder_infinito)
        candidatos, _ = ejecutar(falso, area=area)
        self.assertLessEqual(len(falso.llamadas), V.LIMITE_PETICIONES)  # 120
        self.assertGreater(len(falso.llamadas), 100, "no llegó ni a acercarse al tope")
        self.assertTrue(candidatos)

    def test_pausa_de_un_segundo_entre_peticiones(self):
        falso = HfFalso()
        _, dormidas = ejecutar(falso)
        self.assertEqual(len(dormidas), len(falso.llamadas) - 1)
        self.assertTrue(all(pausa == 1.0 for pausa in dormidas), dormidas)

    def test_el_token_solo_viaja_si_existe_en_el_entorno(self):
        con_token = HfFalso()
        with mock.patch.dict(os.environ, {"HF_TOKEN": "token-de-prueba"}, clear=False):
            ejecutar(con_token)
        self.assertEqual(con_token.llamadas[0]["headers"],
                         {"Authorization": "Bearer token-de-prueba"})

        sin_token = HfFalso()
        with mock.patch.dict(os.environ, {}, clear=True):
            ejecutar(sin_token)
        self.assertEqual(sin_token.llamadas[0]["headers"], {})
        self.assertFalse(any("token-de-prueba" in llamada["url"] for llamada in sin_token.llamadas))

    def test_http_caido_no_tumba_la_pasada(self):
        falso = HfFalso(responder=lambda _consulta: None)
        candidatos, _ = ejecutar(falso)
        self.assertEqual(candidatos, [])

    def test_tope_cero_no_pide_nada(self):
        falso = HfFalso()
        candidatos, dormidas = ejecutar(falso, limite=0)
        self.assertEqual((candidatos, falso.llamadas, dormidas), ([], [], []))

    def test_url_del_detalle_conserva_la_barra_del_id(self):
        self.assertEqual(V._detalle("Qwen/Qwen-Image-2.1-Turbo"),
                         "/models/Qwen/Qwen-Image-2.1-Turbo?blobs=true")


class PiezasPuras(unittest.TestCase):
    def test_archivos_toma_tamano_y_sha_de_lfs(self):
        archivos = V._archivos([
            {"rfilename": "a.gguf", "size": 10, "lfs": {"sha256": "s1"}},
            {"rfilename": "b.json", "lfs": {"size": 20}},
            {"rfilename": "c.txt"},
            "no-es-un-archivo",
        ])
        self.assertEqual(archivos, [
            {"nombre": "a.gguf", "bytes": 10, "sha256": "s1"},
            {"nombre": "b.json", "bytes": 20},
            {"nombre": "c.txt"},
        ])

    def test_gated_y_licencia_se_normalizan(self):
        self.assertTrue(V._gated("auto"))
        self.assertTrue(V._gated(True))
        self.assertFalse(V._gated("false"))
        self.assertFalse(V._gated(""))
        self.assertEqual(V._licencia({"cardData": {"license": "apache-2.0"}}), "apache-2.0")
        self.assertEqual(V._licencia({"tags": ["otra", "license:mit"]}), "mit")
        self.assertEqual(V._licencia({}), "")

    def test_hermano_y_tronco(self):
        self.assertTrue(V._es_hermano("Qwen/Qwen-Image-2.1-Turbo", "Qwen-Image-2.1"))
        self.assertTrue(V._es_hermano("Qwen/Qwen-Image-2.1_Edit", "Qwen-Image-2.1"))
        self.assertFalse(V._es_hermano("Qwen/Qwen-Image-2.10", "Qwen-Image-2.1"))
        self.assertFalse(V._es_hermano("Qwen/Qwen-Image-2.1", "Qwen-Image-2.1"))
        self.assertTrue(V._mismo_tronco("unsloth/Qwen-Image-2.1-Turbo-GGUF",
                                        "Qwen-Image-2.1-Turbo"))
        self.assertFalse(V._mismo_tronco("unsloth/Qwen-Image-3-GGUF", "Qwen-Image-2.1-Turbo"))


if __name__ == "__main__":
    unittest.main()
