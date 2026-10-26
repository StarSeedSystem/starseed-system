#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas de vigia_descubrir (VGM1016B): sin red, respuestas grabadas.

Las respuestas imitan las que dio la API pública de Hugging Face el 2026-10-16:
con sort=trendingScore sale primero Qwen/Qwen-Image-2.1-Turbo (publicado el
2026-10-09) y existe su cuantizado unsloth/Qwen-Image-2.1-Turbo-GGUF (2026-10-10);
con sort=likes no salía ninguno. Aparecen re-subidas «Uncensored» de terceros que
NO deben entrar. Todo con la función http_get y el reloj inyectados.
"""
import json
import os
import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import unquote

sys.path.insert(0, str(Path(__file__).parent))
import vigia_descubrir as VD  # noqa: E402

AHORA = datetime(2026, 10, 16, 12, 0, tzinfo=timezone.utc)
SHA256_TURBO = "a" * 64
SHA256_GGUF = "b" * 64
# Centinela sin forma de clave real (la protección de secretos de GitHub lo rechaza).
CENTINELA = "-".join(["centinela", "no", "imprimir", "1234"])


def modelo(id_modelo, creado, likes=100, trending=5.0, licencia="qwen-research", gated=False):
    """Un modelo como lo devuelve la API pública de Hugging Face."""
    pipeline = "text-to-image" if "-GGUF" not in id_modelo else "other"
    return {
        "id": id_modelo,
        "author": id_modelo.rpartition("/")[0],
        "created_at": creado,
        "last_modified": creado,
        "pipeline_tag": pipeline,
        "likes": likes,
        "trending_score": trending,
        "license": licencia,
        "gated": gated,
    }


TRENDING = [
    modelo("Qwen/Qwen-Image-2.1-Turbo", "2026-10-09T14:55:00.000Z", 12458, 9.8, gated=True),
    modelo("black-forest-labs/FLUX.1-dev", "2026-08-05T10:00:00.000Z", 8500, 9.1, "other"),
    modelo("stabilityai/stable-diffusion-xl-base-1.0", "2026-07-22T10:00:00.000Z", 9000, 8.9, "openrail"),
    modelo("KasugaiSakura/Qwen-Image-2.1-Uncensored", "2026-10-12T00:00:00.000Z", 400, 7.5),
]

AUTOR_QWEN = [
    modelo("Qwen/Qwen-Image-2.1", "2026-09-14T10:00:00.000Z", 5432, 0, gated=True),
    modelo("Qwen/Qwen-Viejo", "2026-04-01T10:00:00.000Z", 500, 0),
    modelo("Qwen/Qwen-Sin-Fecha", None),
]

HERMANOS = [modelo("Qwen/Qwen-Image-2.1", "2026-09-14T10:00:00.000Z", 5432, gated=True),
            modelo("Qwen/Qwen-Image-2.1-Turbo", "2026-10-09T14:55:00.000Z", 12458, 9.8, gated=True)]

CUANTIZADO_UNSLOTH = [modelo("unsloth/Qwen-Image-2.1-Turbo-GGUF", "2026-10-10T08:30:00.000Z", 8920)]

BLOBS = {
    "Qwen/Qwen-Image-2.1-Turbo": {"siblings": [
        {"rfilename": "qwen-image-2.1-turbo-bf16.safetensors", "size": 14200000000,
         "lfs": {"sha256": SHA256_TURBO}},
        {"rfilename": "config.json"},
    ]},
    "unsloth/Qwen-Image-2.1-Turbo-GGUF": {"siblings": [
        {"rfilename": "Qwen-Image-2.1-Turbo-Q2_K.gguf", "size": 2470000000,
         "lfs": {"sha256": SHA256_GGUF}},
        {"rfilename": "Qwen-Image-2.1-Turbo-Q3_K_S.gguf", "size": 2720000000,
         "lfs": {"sha256": SHA256_GGUF}},
    ]},
}

# Respuesta que inunda: 30 modelos distintos para cualquier consulta (prueba de presupuesto).
INUNDACION = [modelo(f"autor-mas/modelo-{i}", "2026-10-15T00:00:00.000Z") for i in range(30)]


class Simulador:
    """Hace de red: responde lo grabado según la URL y apunta cada petición."""

    def __init__(self, inundar=False, fallar=False):
        self.peticiones = []
        self.pausas = []
        self.inundar = inundar
        self.fallar = fallar

    def dormir(self, segundos):
        self.pausas.append(segundos)

    def http_get(self, url, headers=None, timeout=30):
        self.peticiones.append({"url": url, "cabeceras": dict(headers or {})})
        if self.fallar:
            raise RuntimeError("Red caída (simulada)")
        cuerpo = self._cuerpo(url)
        if cuerpo is None:
            raise RuntimeError(f"Petición sin respuesta grabada: {url}")
        return json.dumps(cuerpo)

    def _cuerpo(self, url):
        if self.inundar:
            return INUNDACION
        if "blobs=true" in url:
            id_modelo = unquote(url.rsplit("/api/models/", 1)[1].split("?blobs=true")[0])
            return BLOBS.get(id_modelo)
        if "author=" in url:
            if "author=Qwen&sort=createdAt" in url:
                return AUTOR_QWEN
            if "author=unsloth&" in url:
                return CUANTIZADO_UNSLOTH
            return []
        if "search=Qwen-Image-2.1" in url:
            return HERMANOS
        if "sort=trendingScore" in url:
            return TRENDING
        if self.inundar:
            return INUNDACION
        return None

    def urls(self):
        return [p["url"] for p in self.peticiones]

    def cabeceras(self):
        return [p["cabeceras"] for p in self.peticiones]


AREA_IMAGEN = {
    "id": "imagen",
    "nombre": "Imagen",
    "pipeline_tags": ["text-to-image"],
    "autores": ["Qwen"],
}


class TestVigiaDescubrir(unittest.TestCase):
    """Comprueba las cuatro fuentes, el presupuesto y el token, todo sin red."""

    @staticmethod
    def descubrir(area=AREA_IMAGEN, catalogo=frozenset(), red=None):
        red = red or Simulador()
        return VD.descubrir(area, set(catalogo), red.http_get, ahora=AHORA, dormir=red.dormir), red

    def test_tendencia_trae_el_turbo_primero(self):
        """La fuente 1 trae el Turbo (caso real del 2026-10-09) al frente, no a sort=likes."""
        candidatos, _ = self.descubrir()
        ids = [c["id"] for c in candidatos]
        self.assertEqual(ids[0], "Qwen/Qwen-Image-2.1-Turbo")
        self.assertIn("black-forest-labs/FLUX.1-dev", ids)
        self.assertIn("stabilityai/stable-diffusion-xl-base-1.0", ids)

    def test_resubidas_uncensored_fuera(self):
        """Las re-subidas «Uncensored» de terceros que se vieron en tendencia NO entran."""
        candidatos, _ = self.descubrir()
        ids = [c["id"].lower() for c in candidatos]
        self.assertNotIn("kasugaisakura/qwen-image-2.1-uncensored", ids)
        self.assertFalse(any("uncensored" in i for i in ids))

    def test_familias_solo_ultimos_60_dias(self):
        """La fuente 2 por autor guarda lo creado en los últimos 60 días; lo viejo no."""
        candidatos, _ = self.descubrir()
        ids = [c["id"] for c in candidatos]
        self.assertIn("Qwen/Qwen-Image-2.1", ids)
        self.assertNotIn("Qwen/Qwen-Viejo", ids)

    def test_hermanos_del_catalogo(self):
        """La fuente 3 descubre repos cuyo nombre empieza por el del catálogo (Turbo)."""
        area = {"id": "imagen", "nombre": "Imagen", "pipeline_tags": [], "autores": []}
        candidatos, red = self.descubrir(area, catalogo={"Qwen/Qwen-Image-2.1"})
        ids = [c["id"] for c in candidatos]
        self.assertIn("Qwen/Qwen-Image-2.1-Turbo", ids)
        self.assertNotIn("Qwen/Qwen-Image-2.1", ids)  # lo del catálogo no vuelve
        self.assertTrue(any("search=Qwen-Image-2.1" in u for u in red.urls()))

    def test_cuantizados_con_unsloth(self):
        """La fuente 4 trae el cuantizado real unsloth/Qwen-Image-2.1-Turbo-GGUF."""
        candidatos, red = self.descubrir()
        ids = [c["id"] for c in candidatos]
        self.assertIn("unsloth/Qwen-Image-2.1-Turbo-GGUF", ids)
        self.assertTrue(any("author=unsloth&" in u for u in red.urls()))

    def test_detalle_archivos_con_blobs(self):
        """El detalle de archivos sale de ?blobs=true: siblings con size y lfs.sha256."""
        candidatos, red = self.descubrir()
        por_id = {c["id"]: c for c in candidatos}
        archivos = por_id["unsloth/Qwen-Image-2.1-Turbo-GGUF"]["archivos"]
        self.assertEqual(archivos[0]["nombre"], "Qwen-Image-2.1-Turbo-Q2_K.gguf")
        self.assertEqual(archivos[0]["bytes"], 2470000000)
        self.assertEqual(archivos[0]["sha256"], SHA256_GGUF)
        # archivado sin lfs: solo el nombre
        turbo = por_id["Qwen/Qwen-Image-2.1-Turbo"]["archivos"][1]
        self.assertEqual(turbo, {"nombre": "config.json"})
        self.assertTrue(any(u.endswith("?blobs=true") for u in red.urls()))

    def test_estructura_candidato(self):
        """Cada candidato lleva los campos del contrato con sus tipos."""
        candidatos, _ = self.descubrir()
        self.assertTrue(candidatos)
        for candidato in candidatos:
            for campo in ("id", "autor", "creado", "modificado", "pipeline_tag", "likes",
                          "trending", "licencia_hf", "gated", "archivos"):
                self.assertIn(campo, candidato)
            self.assertIsInstance(candidato["likes"], (int, float))
            self.assertIsInstance(candidato["trending"], (int, float))
            self.assertIsInstance(candidato["gated"], bool)
            self.assertIsInstance(candidato["archivos"], list)

    def test_sin_duplicados(self):
        """Ninguna fuente trae dos veces el mismo id."""
        candidatos, _ = self.descubrir()
        ids = [c["id"] for c in candidatos]
        self.assertEqual(len(ids), len(set(ids)))

    def test_respeto_del_presupuesto_de_peticiones(self):
        """Con una red que inunda, la pasada hace como mucho 120 peticiones."""
        red = Simulador(inundar=True)
        self.descubrir(AREA_IMAGEN, red=red)
        self.assertEqual(len(red.peticiones), VD.LIMITE_PETICIONES)

    def test_pausa_de_un_segundo_entre_peticiones(self):
        """Hay una pausa de 1 s entre peticiones y ninguna antes de la primera."""
        red = Simulador()
        area = {"id": "x", "nombre": "X",
                "pipeline_tags": ["text-to-image", "image-to-image"], "autores": []}
        self.descubrir(area, red=red)
        esperadas = [VD.PAUSA_SEGUNDOS] * (len(red.peticiones) - 1)
        self.assertEqual(red.pausas, esperadas)

    def test_token_solo_si_existe(self):
        """HF_TOKEN va en la cabecera solo si existe en el entorno (nunca su valor aquí)."""
        entorno_original = dict(os.environ)
        try:
            os.environ.pop("HF_TOKEN", None)
            _, red_sin = self.descubrir()
            self.assertFalse(any("Authorization" in cab for cab in red_sin.cabeceras()))
            os.environ["HF_TOKEN"] = CENTINELA
            _, red_con = self.descubrir()
            cabeceras = [cab.get("Authorization") for cab in red_con.cabeceras() if "Authorization" in cab]
            self.assertTrue(cabeceras)
            self.assertTrue(all(cab == f"Bearer {CENTINELA}" for cab in cabeceras))
        finally:
            os.environ.clear()
            os.environ.update(entorno_original)

    def test_red_que_falla_no_rompe(self):
        """Una red que falla en todo deja una lista vacía, sin lanzar excepción."""
        candidatos, _ = self.descubrir(area={"id": "x", "nombre": "X",
                                             "pipeline_tags": ["otro-tag"], "autores": []},
                                       red=Simulador(fallar=True))
        self.assertEqual(candidatos, [])

    def test_funcion_pura_de_archivos(self):
        """_archivos_de_siblings extrae nombre, bytes y sha256 de los siblings."""
        resultado = VD._archivos_de_siblings(BLOBS["Qwen/Qwen-Image-2.1-Turbo"]["siblings"])
        self.assertEqual(resultado[0]["bytes"], 14200000000)
        self.assertEqual(resultado[0]["sha256"], SHA256_TURBO)
        self.assertEqual(resultado[1], {"nombre": "config.json"})
        self.assertEqual(VD._archivos_de_siblings([]), [])
        self.assertEqual(VD._archivos_de_siblings(None), [])

    def test_parse_fecha_tolerante(self):
        """_parse_fecha entiende ISO con Z y milisegundos; None con lo que no entiende."""
        fecha = VD._parse_fecha("2026-10-09T14:55:00.000Z")
        self.assertEqual(fecha.tzinfo, timezone.utc)
        self.assertEqual(fecha.year, 2026)
        self.assertIsNone(VD._parse_fecha("no-es-fecha"))
        self.assertIsNone(VD._parse_fecha(None))


if __name__ == "__main__":
    unittest.main()
