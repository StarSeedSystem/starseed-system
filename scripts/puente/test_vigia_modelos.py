#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas del vigía director diario (VGM1016D): TODO inyectado, SIN red.

Respuestas de ejemplo imitando la API pública de Hugging Face (2026-10-16):
sort=trendingScore con text-to-image da primero Qwen/Qwen-Image-2.1-Turbo
(licencia qwen-research → PERSONAL) y existe su cuantizado unsloth/
Qwen-Image-2.1-Turbo-GGUF; hay además uno con licencia «other» (desconocida).
La raíz del repo es un tmpdir; la escritura atómica real se ejercita igual.
"""
import json
import os
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import vigia_modelos as VM  # noqa: E402

AHORA = datetime(2026, 10, 27, 9, 0, tzinfo=timezone.utc)
FECHA = "2026-10-27"
MODEL = lambda id_, lic, creado="2026-10-01", likes=10: {  # noqa: E731
    "id": id_, "author": id_.rpartition("/")[0], "created_at": creado,
    "last_modified": creado, "pipeline_tag": "text-to-image", "likes": likes,
    "trending_score": 5.0, "license": lic, "gated": False}


def _http(url, headers=None, timeout=30):
    """API falsa: responde lo que toca según la URL, sin tocar la red."""
    if "author=unsloth" in url:
        return json.dumps([MODEL("unsloth/Qwen-Image-2.1-Turbo-GGUF", "other", "2026-10-10")])
    if "api/models/Refinable/" in url:
        return json.dumps({"id": "Refinable/Faltante", "tags": ["license:apache-2.0"]})
    if "blobs=true" in url:
        repo = url.rpartition("/")[-1].split("?")[0]
        return json.dumps({"siblings": [
            {"rfilename": "modelo.safetensors", "size": int(20e9), "lfs": {"sha256": "a" * 64}},
            {"rfilename": "gguf/Q4_K_S.gguf", "size": int(2.7e9), "lfs": {"sha256": "b" * 64}}]})
    if "sort=trendingScore" in url:
        return json.dumps([MODEL("Qwen/Qwen-Image-2.1-Turbo", "qwen-research", "2026-10-09"),
                           MODEL("Refinable/Faltante", "other", "2026-10-06"),
                           MODEL("Otros/Misterioso-Escaneado", "other", "2026-10-05")])
    return json.dumps([])  # autor y búsquedas: vacío


def _raiz(tmp):
    os.mkdir(os.path.join(tmp, "cat"))
    with open(os.path.join(tmp, "cat", "modelos.ts"), "w") as f:
        f.write('// Catálogo de ejemplo: ya hay Qwen/Qwen-Image viejo.\n'
                'export const MODELOS = [{ id: "Qwen/Qwen-Image", hf: "Qwen/Qwen-Image" }]\n')
    return tmp


def _area():
    return {"id": "imagen", "nombre": "Imagen",
            "catalogo": "cat/modelos.ts",
            "pipeline_tags": ["text-to-image"], "autores": ["Qwen"],
            "cuantizadores": ["unsloth"],
            "licencias_conocidas": {"qwen-research": "personal", "apache-2.0": "libre"},
            "filtros": {}}


class PasadaTest(unittest.TestCase):
    """Una pasada entera sobre tmpdir: novedades, resumen y fichas."""

    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        _raiz(self.tmp)
        self.area = _area()
        self.estado = os.path.join(self.tmp, "estado-vigia.json")
        self.publicados = []

    # helpers -----------------------------------------------------------------
    def pasada(self, **kw):
        return VM.pasada([self.area], _http, raiz=self.tmp, ahora=AHORA,
                         dormir=lambda s: None, estado_ruta=self.estado,
                         publicar=(lambda t: self.publicados.append(t)), **kw)

    def novedades(self, r):
        with open(r["novedades"]) as f:
            return json.load(f)

    # pruebas ------------------------------------------------------------------
    def test_novedades_con_aceptados_descartados_y_sha(self):
        r = self.pasada(seco=True)
        doc = self.novedades(r)
        self.assertEqual(doc["fecha"], FECHA)
        imagen = doc["areas"][0]
        ids_a = [d["id"] for d in imagen["aceptados"]]
        self.assertIn("Qwen/Qwen-Image-2.1-Turbo", ids_a)
        self.assertIn("unsloth/Qwen-Image-2.1-Turbo-GGUF", ids_a)  # cuantizado de aceptado
        turb = imagen["aceptados"][0]
        self.assertEqual(turb["clase"], "personal")
        self.assertTrue(turb["personal"])
        medios = {m["medio"]: m for m in turb["medios"]}
        self.assertEqual(medios["a1"]["archivo"], "gguf/Q4_K_S.gguf")  # el que cabe ≤ 8 GB
        self.assertEqual(medios["a1"]["sha256"], "b" * 64)
        self.assertFalse(medios["navegador"]["cabe"])  # 2,7 GB > 1 GB
        self.assertEqual(medios["mac"]["sha256"], "b" * 64)  # fallback al más pequeño
        self.assertIn("licencia desconocida", " | ".join(d["motivo"] for d in imagen["descartados"]))

    def test_refina_la_licencia_con_el_detalle_de_hugging_face(self):
        r = self.pasada(seco=True)
        imagen = self.novedades(r)["areas"][0]
        refinable = next(d for d in imagen["aceptados"] if d["id"] == "Refinable/Faltante")
        self.assertEqual(refinable["clase"], "libre")       # la API trae license:apache-2.0
        self.assertFalse(refinable["personal"])

    def test_seco_no_escribe_cola_ni_avisa(self):
        r = self.pasada(seco=True)
        self.assertIsNone(r["cola"])
        self.assertEqual(r["fichas"], 0)
        self.assertEqual(self.publicados, [])
        self.assertFalse(os.path.exists(os.path.join(self.tmp, "starseed_memory_root", "olas")))

    def test_publica_un_resumen_quien_vigia_modelos_y_una_vez_al_dia(self):
        r = self.pasada()
        self.assertEqual(len(self.publicados), 1)
        texto = self.publicados[0]
        self.assertIn("Vigía de modelos", texto)
        self.assertIn("Qwen-Image-2.1-Turbo", texto)
        r2 = self.pasada()  # segunda pasada el mismo día: ya avisó
        self.assertEqual(len(self.publicados), 1)
        self.assertEqual(r2["estado"]["aviso"], FECHA)

    def test_cola_maximo_cinco_y_sin_repetir(self):
        r = self.pasada()
        with open(r["cola"]) as f:
            tareas = json.load(f)
        self.assertEqual(len(tareas), r["fichas"])
        self.assertLessEqual(len(tareas), VM.MAX_FICHAS)
        r2 = self.pasada()  # misma pasada: lo visto no vuelve
        self.assertEqual(r2["fichas"], 0)
        self.assertIsNone(r2["cola"])

    def test_ficha_lleva_datos_verificados_y_regla_de_licencia(self):
        r = self.pasada()
        with open(r["cola"]) as f:
            tareas = json.load(f)
        turb = next(t for t in tareas if t["prompt"].find("Turbo") >= 0
                    and t["prompt"].find("Qwen/Qwen-Image-2.1-Turbo") >= 0)
        self.assertIn("qwen-research", turb["prompt"])
        self.assertIn("PERSONAL", turb["prompt"])
        self.assertIn("NUNCA como opción por defecto", turb["prompt"])
        self.assertIn(FECHA, turb["prompt"])
        self.assertIn("HF_TOKEN", turb["prompt"])  # solo el NOMBRE de la variable
        self.assertEqual(turb["archivos"], ["cat/modelos.ts"])
        self.assertNotIn("sin declarar", "\n".join(t["prompt"] for t in [turb]))  # este viene con licencia declarada

    def test_estado_ultima_pasada_y_ids_vistos(self):
        self.pasada()
        with open(self.estado) as f:
            estado = json.load(f)
        self.assertEqual(estado["vistos"], sorted(estado["vistos"]))
        self.assertTrue(estado["vistos"])
        self.assertIn("Qwen/Qwen-Image-2.1-Turbo", estado["vistos"])
        self.assertIn("ultima", estado)

    def test_ids_de_cola_son_los_aceptados_sin_el_del_catalogo(self):
        r = self.pasada()
        with open(r["cola"]) as f:
            ids = [t["prompt"].split("`")[1] for t in json.load(f)]
        self.assertNotIn("Qwen/Qwen-Image", ids)  # ya está en el catálogo del área
        self.assertIn("Qwen/Qwen-Image-2.1-Turbo", ids)


class EvaluacionTest(unittest.TestCase):
    """evaluar_candidato y _archivo_por_medio, unitarias y puras."""

    LIC = {"qwen-research": "personal", "apache-2.0": "libre"}

    def test_licencia_desconocida_descarta(self):
        d = VM.evaluar_candidato({"id": "X/Y-otro", "licencia_hf": "other"}, self.LIC)
        self.assertEqual(d["decision"], "descartado")
        self.assertIn("licencia", d["motivo"])

    def test_re_subidas_dan_igual_lo_matadas(self):
        for nombre in ("Node/Algo-Uncensored", "A/B.abliterated-GGUF"):
            d = VM.evaluar_candidato({"id": nombre, "licencia_hf": "apache-2.0"}, self.LIC)
            self.assertEqual(d["decision"], "descartado", nombre)
            self.assertIsNone(d.get("personal"))

    def test_cuantizador_tercero_solo_con_base_aceptada(self):
        base = {"id": "Qwen/Qwen-Image-2.1-Turbo", "licencia_hf": "qwen-research"}
        cuant = {"id": "unsloth/Qwen-Image-2.1-Turbo-GGUF", "licencia_hf": "other",
                 "autor": "unsloth"}
        fuera = VM.evaluar_candidato({**cuant, "autor": "unsloth"}, self.LIC, ["unsloth"], ())
        self.assertEqual(fuera["decision"], "descartado")
        ok = VM.evaluar_candidato({**cuant, "autor": "unsloth"}, self.LIC,
                                  ["unsloth"], ["Qwen/Qwen-Image-2.1-Turbo"],
                                  {"Qwen/Qwen-Image-2.1-Turbo": "personal"})
        self.assertEqual(ok["decision"], "aceptado")
        self.assertEqual(ok["clase"], "personal")  # hereda la clase de su base
        self.assertIn("cuantizado", ok["motivo"])

    def test_archivo_por_medio_elige_el_mayor_que_cabe(self):
        archivos = [{"nombre": "F16.master", "bytes": int(14e9), "sha256": "f" * 64},
                    {"nombre": "Q4.gguf", "bytes": int(4.2e9), "sha256": "4" * 64},
                    {"nombre": "Q2.gguf", "bytes": int(2.4e9), "sha256": "2" * 64}]
        m = {x["medio"]: x for x in VM._archivo_por_medio(archivos)}
        self.assertEqual(m["navegador"]["archivo"], "Q2.gguf")     # primero que cabe ≤ 1 GB
        self.assertEqual(m["mac"]["archivo"], "Q4.gguf")            # cabe ≤ 4,5 GB
        self.assertEqual(m["a1"]["archivo"], "Q4.gguf")             # el mayor que cabe ≤ 8 GB
        self.assertEqual(m["a1"]["sha256"], "4" * 64)
        sin = VM._archivo_por_medio([])
        self.assertEqual([x["cabe"] for x in sin], [False, False, False])


if __name__ == "__main__":
    unittest.main()
