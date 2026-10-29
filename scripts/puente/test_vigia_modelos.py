#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas de vigia_modelos (VGM1016D-d2): una pasada completa, sin red.

Todo lo que toca el mundo va inyectado: la red (clase Simulador con las
respuestas grabadas de Hugging Face), el reloj, la pausa, la raíz (un
directorio temporal con starseed_memory_root), la ruta del estado (en el
temporal, nunca ~/.starseed) y la publicación del Chat Director (una función
espía). Verifica:
  · evaluar_candidato → clase de licencia, marcas fuera, terceros cuantizadores
  · _archivo_por_medio → el archivo elegido por medio con SHA256 y motor
  · pasada → novedades dejadas de forma atómica, cola de fichas (≤ 5 al día,
    sin repetir catálogo ni colas), resumen único en el Chat Director, --seco
    y el estado de la última pasada (vistos y aviso)
  · toca_pasada → hace falta una nueva pasada cuando la última tiene > 20 h
Licencia: nunca «no comercial» como opción por defecto ni en uso comercial.
"""
import json
import os
import shutil
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import unquote

sys.path.insert(0, str(Path(__file__).parent))
import vigia_modelos as VM  # noqa: E402

AHORA = datetime(2026, 10, 28, 9, 0, tzinfo=timezone.utc)
FECHA = "2026-10-28"
SHA_TURBO = "a" * 64
SHA_LIBRE = "b" * 64
SHA_GGUF = "c" * 64
QWEN_TURBO = "Qwen/Qwen-Image-2.1-Turbo"
LICENCIAS = {"apache-2.0": "libre", "qwen-research": "personal", "other": "desconocida"}
REGLA_PERSONAL = ("Licencia NO comercial (investigación o uso personal): NUNCA como opción por defecto, "
                  "nunca en uso comercial ni comunidad; con la etiqueta visible.")
AREA = {
    "id": "imagen", "nombre": "Imagen", "catalogo": "src/lib/imagenes/modelos.ts",
    "pipeline_tags": ["text-to-image"], "autores": [],
    "licencias_conocidas": LICENCIAS, "cuantizadores": ("unsloth",),
}
AREAS = [AREA]


def _modelo(id_m, licencia, created="2026-10-20T00:00:00.000Z", autores=""):
    """Un modelo como lo devuelve la API pública de Hugging Face."""
    return {"id": id_m, "author": autores or id_m.rpartition("/")[0],
            "created_at": created, "last_modified": created,
            "pipeline_tag": "other" if "-GGUF" in id_m else "text-to-image",
            "likes": 100, "trending_score": 5.0, "license": licencia, "gated": False}


def _blobs(archivos):
    return {"siblings": [{"rfilename": n, "size": int(gb * 1e9), "lfs": {"sha256": sha}}
                         for n, gb, sha in archivos]}


TURBO_BLOBS = _blobs([("qwen-turbo-bf16.safetensors", 14.0, SHA_TURBO),
                      ("Qwen-Turbo-Q2_K.gguf", 2.4, SHA_TURBO)])
ZIMAGE_BLOBS = _blobs([("z-bf16.safetensors", 15.0, SHA_LIBRE),
                       ("z-int8.onnx", 1.2, SHA_LIBRE)])
GGUF_BLOBS = _blobs([("Z-Image-Turbo-Q4_K_M.gguf", 2.47, SHA_GGUF),
                     ("Z-Image-Turbo-Q3_K_S.gguf", 2.72, SHA_GGUF)])

TENDENCIA = [
    _modelo("Qwen/Qwen-Image-2.1-Turbo", "other", "2026-10-09T14:55:00.000Z", "Qwen"),
    _modelo("Tongyi-MAI/Z-Image-Turbo", "apache-2.0", "2025-11-25T00:00:00.000Z", "Tongyi-MAI"),
    _modelo("Tongyi-MAI/Z-Image-Rara", "other", "2026-10-25T00:00:00.000Z", "Tongyi-MAI"),
]
GGUF_UNSLOTH = [_modelo("unsloth/Z-Image-Turbo-GGUF", "other", "2026-10-10T08:30:00.000Z")]

BLOBS = {"Qwen/Qwen-Image-2.1-Turbo": TURBO_BLOBS,
         "Tongyi-MAI/Z-Image-Turbo": ZIMAGE_BLOBS,
         "Tongyi-MAI/Z-Image-Rara": _blobs([]),
         "unsloth/Z-Image-Turbo-GGUF": GGUF_BLOBS}
TAGS_DETALLE = {"Qwen/Qwen-Image-2.1-Turbo": {"tags": ["license:qwen-research"]}}
FALSAS = {
    "sort=trendingScore": TENDENCIA,
    "search=Z-Image-Turbo&author=unsloth": GGUF_UNSLOTH,
}


class Simulador:
    """Hace de red: responde lo grabado según la URL y apunta cada petición."""

    def __init__(self, falsas=None):
        self.peticiones = []
        self.falsas = dict(FALSAS, **(falsas or {}))
        self.blobs_extra = {}

    def http_get(self, url, headers=None, timeout=30):
        self.peticiones.append(url)
        for clave, cuerpo in self.falsas.items():
            if clave in url:
                return json.dumps(cuerpo)
        if "blobs=true" in url:
            iid = unquote(url.rsplit("api/models/", 1)[1].split("?blobs=true")[0])
            return json.dumps(self.blobs_extra.get(iid) or BLOBS.get(iid, {}))
        if "/api/models/" in url:
            iid = unquote(url.split("/api/models/", 1)[1])
            return json.dumps(TAGS_DETALLE.get(iid, {"tags": []}))
        return json.dumps([])

    def dormir(self, segundos=None):
        pass


class TestVigiaModelos(unittest.TestCase):
    """Comprueba el director diario del vigía, todo sin red y sobre una raíz temporal."""

    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="vigia-test-")
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)
        os.makedirs(os.path.join(self.tmp, "starseed_memory_root", "olas"))
        self.publicadas = []

    def escribir_catalogo(self, ids=(), con_prueba=False):
        """Crea el catálogo del área en la raíz temporal (+ su prueba si aplica)."""
        ruta = os.path.join(self.tmp, AREA["catalogo"])
        os.makedirs(os.path.dirname(ruta), exist_ok=True)
        with open(ruta, "w", encoding="utf-8") as f:
            for cid in ids:
                f.write(f'  "{cid}": {{}},\n')
        if con_prueba:
            prueba = os.path.join(self.tmp, "src/lib/imagenes/__tests__", "modelos.test.ts")
            os.makedirs(os.path.dirname(prueba), exist_ok=True)
            open(prueba, "a", encoding="utf-8").close()

    def pasar(self, sim, seco=False, colas_existentes=None, publicar=None):
        """Una pasada completa con reloj, pausa, estado y raíz inyectados."""
        publicar = publicar if publicar is not None else self.publicadas.append
        ruta_estado = os.path.join(self.tmp, "estado-vigia.json")
        return VM.pasada(AREAS, sim.http_get, raiz=self.tmp, ahora=AHORA, seco=seco,
                         dormir=sim.dormir, estado_ruta=ruta_estado,
                         publicar=publicar, colas_existentes=colas_existentes)

    def test_evaluar_clase_y_marcas_fuera(self):
        """Libre entra por defecto; personal nunca por defecto; desconocida y marcas fuera, no."""
        libre = VM.evaluar_candidato(
            {"id": "nucleo/Libre-1", "licencia_hf": "apache-2.0", "gated": True,
             "archivos": [{"nombre": "peso.gguf", "bytes": 200000000, "sha256": SHA_LIBRE}]},
            LICENCIAS)
        self.assertEqual(libre["decision"], "aceptado")
        self.assertEqual(libre["clase"], "libre")
        self.assertTrue(libre["aceptado"] and libre["por_defecto"] and not libre["personal"])
        self.assertTrue(libre["gated"])
        self.assertEqual(libre["tamanio_gb"], 0.2)
        personal = VM.evaluar_candidato({"id": "Qwen/Pesado", "licencia_hf": "qwen-research"}, LICENCIAS)
        self.assertEqual(personal["clase"], "personal")
        self.assertTrue(personal["personal"])
        self.assertFalse(personal["por_defecto"])
        rara = VM.evaluar_candidato({"id": "tercero/Rara", "licencia_hf": "otra-rara"}, LICENCIAS)
        self.assertEqual(rara["decision"], "descartado")
        self.assertEqual(rara["clase"], "desconocida")
        for marca in ("uncensored", "abliterated", "nsfw", "lewd"):
            d = VM.evaluar_candidato(
                {"id": f"tercero/Qwen-1-{marca.capitalize()}", "licencia_hf": "apache-2.0"}, LICENCIAS)
            self.assertEqual(d["decision"], "descartado", marca)
            self.assertIn(marca, d["motivo"])

    def test_evaluar_terceros_cuantizadores(self):
        """Un cuantizador entra solo si cuantiza un id ya aceptado, heredando su clase."""
        gguf = {"id": "unsloth/Z-Image-Turbo-GGUF", "licencia_hf": "other", "gated": False,
                "autor": "unsloth",
                "archivos": [{"nombre": "Z-Image-Turbo-Q4_K_M.gguf", "bytes": 2470000000,
                              "sha256": SHA_GGUF}]}
        ok = VM.evaluar_candidato(gguf, LICENCIAS, ("unsloth",),
                                  ["Tongyi-MAI/Z-Image-Turbo"],
                                  {"Tongyi-MAI/Z-Image-Turbo": "libre"})
        self.assertEqual(ok["decision"], "aceptado")
        self.assertEqual(ok["clase"], "libre")
        self.assertIn("ya aceptado", ok["motivo"])
        solito = VM.evaluar_candidato(gguf, LICENCIAS, ("unsloth",))
        self.assertEqual(solito["decision"], "descartado")
        self.assertIn("no cuantiza", solito["motivo"])
        # Refinado por la pasada: «other» sin tags que lo aclaren se pide al detalle; sin respuesta, fuera.
        otro = VM.evaluar_candidato({"id": "tercero/Sin-Base", "licencia_hf": "other"}, LICENCIAS)
        self.assertEqual(otro["decision"], "descartado")

    def test_archivo_por_medio(self):
        """Elegir por medio el cuantizado más grande que cabe; si ninguno, el más pequeño."""
        archivos = [{"nombre": "z-int8.onnx", "bytes": 1200000000, "sha256": SHA_LIBRE},
                    {"nombre": "peso-Q4_K_M.gguf", "bytes": 2400000000, "sha256": SHA_GGUF},
                    {"nombre": "peso-bf16.safetensors", "bytes": 15000000000, "sha256": SHA_LIBRE},
                    {"nombre": "README.md", "bytes": 500}]
        medios = VM._archivo_por_medio(archivos)
        self.assertEqual([m["medio"] for m in medios], ["navegador", "mac", "a1"])
        self.assertFalse(medios[0]["cabe"])  # nada ≤ 1 GB: el más pequeño con SHA
        self.assertEqual(medios[0]["archivo"], "z-int8.onnx")
        self.assertEqual(medios[0]["motor"], "onnx")
        self.assertTrue(medios[1]["cabe"] and medios[2]["cabe"])
        self.assertEqual(medios[1]["archivo"], "peso-Q4_K_M.gguf")  # el mayor que cabe (4,5 / 8 GB)
        self.assertEqual(medios[1]["motor"], "sdcpp")
        self.assertEqual(medios[1]["sha256"], SHA_GGUF)
        vacios = VM._archivo_por_medio([])
        self.assertIsNone(vacios[0]["archivo"])
        self.assertIsNone(vacios[0]["motor"])
        self.assertEqual(len(vacios), 3)

    def test_archivo_por_medio_elige_el_mayor_que_cabe(self):
        """Por medio se elige el mayor que cabe: navegador ≤ 1 GB, Mac ≤ 4,5 GB y A1 ≤ 8 GB."""
        archivos = [{"nombre": "q4-ligero.gguf", "bytes": 800000000, "sha256": SHA_GGUF},
                    {"nombre": "q4_k_m.gguf", "bytes": 4200000000, "sha256": SHA_GGUF},
                    {"nombre": "f16.gguf", "bytes": 14200000000, "sha256": SHA_GGUF}]
        medios = {m["medio"]: m for m in VM._archivo_por_medio(archivos)}
        self.assertEqual(set(medios), {"navegador", "mac", "a1"})
        self.assertEqual(medios["navegador"]["archivo"], "q4-ligero.gguf")
        self.assertTrue(medios["navegador"]["cabe"])  # ≤ 1 GB en el navegador
        self.assertEqual(medios["mac"]["archivo"], "q4_k_m.gguf")  # ≤ 4,5 GB en la Mac de 8
        self.assertEqual(medios["a1"]["archivo"], "q4_k_m.gguf")
        self.assertEqual(medios["a1"]["sha256"], SHA_GGUF)
        self.assertTrue(medios["a1"]["cabe"])  # 4,2 GB sí caben en la A1 de 8 GB

    def test_ids_en_catalogo(self):
        """Del catálogo se sacan los ids «autor/repo» citados; desaparecido → None."""
        texto = 'export const M = { "Qwen/Qwen-Image-2.1", "Tongyi-MAI/Z-Image-Turbo" }'
        ids = VM.ids_en_catalogo("cat.ts", leer_texto=lambda _r: texto)
        self.assertEqual(ids, {"Qwen/Qwen-Image-2.1", "Tongyi-MAI/Z-Image-Turbo"})
        self.assertIsNone(VM.ids_en_catalogo("falta.ts", raiz=self.tmp))

    def test_prueba_de_elige_la_que_existe(self):
        """La prueba es la que ya vive junto al catálogo; nunca se inventa una ruta."""
        self.escribir_catalogo(con_prueba=False)
        self.assertIsNone(VM._prueba_de(AREA["catalogo"], self.tmp))
        self.escribir_catalogo(con_prueba=True)
        self.assertEqual(VM._prueba_de(AREA["catalogo"], self.tmp),
                         "src/lib/imagenes/__tests__/modelos.test.ts")

    def test_pasada_escribe_novedades_atomicas(self):
        """La pasada deja por área aceptados (con medio y SHA) y descartados con su motivo."""
        sim = Simulador()
        res = self.pasar(sim)
        ruta_nov = os.path.join(self.tmp, "starseed_memory_root", "vigia", f"novedades-{FECHA}.json")
        self.assertEqual(res["novedades"], ruta_nov)
        self.assertTrue(os.path.isfile(ruta_nov))
        with open(ruta_nov, encoding="utf-8") as f:
            datos = json.load(f)
        self.assertEqual(datos["fecha"], FECHA)
        self.assertEqual([a["area"] for a in datos["areas"]], ["imagen"])
        area = datos["areas"][0]
        ids_ok = [d["id"] for d in area["aceptados"]]
        self.assertEqual(ids_ok, ["Qwen/Qwen-Image-2.1-Turbo",
                                  "Tongyi-MAI/Z-Image-Turbo",
                                  "unsloth/Z-Image-Turbo-GGUF"])
        turbo = area["aceptados"][0]
        self.assertEqual(turbo["clase"], "personal")  # «other» refinado con el detalle → qwen-research
        self.assertEqual(turbo["licencia"], "qwen-research")
        self.assertGreater(turbo["tamanio_gb"], 0)
        medios_turbo = {m["medio"]: m for m in turbo["medios"]}
        self.assertEqual(medios_turbo["navegador"]["archivo"], "Qwen-Turbo-Q2_K.gguf")
        self.assertFalse(medios_turbo["navegador"]["cabe"])  # 2,4 GB no caben en el navegador
        self.assertEqual(medios_turbo["mac"]["archivo"], "Qwen-Turbo-Q2_K.gguf")
        self.assertEqual(medios_turbo["mac"]["sha256"], SHA_TURBO)
        self.assertEqual(medios_turbo["mac"]["motor"], "sdcpp")
        gguf = area["aceptados"][2]
        self.assertEqual(gguf["clase"], "personal")  # hereda la clase de la base Qwen (≥ 2 piezas)
        self.assertIn("ya aceptado", gguf["motivo"])
        rara = area["descartados"]
        self.assertEqual([d["id"] for d in rara], ["Tongyi-MAI/Z-Image-Rara"])
        self.assertEqual(rara[0]["motivo"], "licencia desconocida: no entra")
        self.assertNotIn("archivos", rara[0])
        # Escritura atómica: no queda ningún tmp a medias
        self.assertEqual([n for n in os.listdir(os.path.dirname(ruta_nov)) if n.endswith(".tmp")], [])

    def test_pasada_no_repite_catalogo_ni_colas(self):
        """Lo que ya está en el catálogo del área o viaja en una cola no vuelve como ficha."""
        self.escribir_catalogo(ids=("Qwen/Qwen-Image-2.1-Turbo",))
        ruta_previa = os.path.join(self.tmp, "starseed_memory_root", "olas", "cola-anterior.json")
        with open(ruta_previa, "w", encoding="utf-8") as f:
            f.write('Cola anterior: ficha de `unsloth/Z-Image-Turbo-GGUF` para mañana.\n')
        sim = Simulador()
        res = self.pasar(sim)
        ruta_nov = os.path.join(self.tmp, "starseed_memory_root", "vigia", f"novedades-{FECHA}.json")
        with open(ruta_nov, encoding="utf-8") as f:
            datos = json.load(f)
        motivos = {d["id"]: d["motivo"] for d in datos["areas"][0]["descartados"]}
        # Lo del catálogo no vuelve ni como candidato (el descubridor lo excluye).
        self.assertNotIn(QWEN_TURBO, motivos)
        self.assertNotIn(QWEN_TURBO, [d["id"] for d in datos["areas"][0]["aceptados"]])
        # Lo que ya viaja en una cola sí llega como candidato y se descarta escrito.
        self.assertIn("unsloth/Z-Image-Turbo-GGUF", motivos)
        self.assertIn("ya está", motivos["unsloth/Z-Image-Turbo-GGUF"])
        self.assertEqual([d["id"] for d in datos["areas"][0]["aceptados"]],
                         ["Tongyi-MAI/Z-Image-Turbo"])
        self.assertEqual(res["fichas"], 1)  # solo la ficha de Z-Image-Turbo libera

    def test_pasada_tope_de_cinco_y_libres_primero(self):
        """≤ 5 fichas al día y los libres por delante de los personales (§4)."""
        candidatos = ([_modelo(f"nucleo/Libre-{i}", "apache-2.0") for i in range(1, 5)] +
                      [_modelo(f"estudio/Personal-{i}", "qwen-research") for i in range(1, 4)])
        sim = Simulador()
        for m in candidatos:
            nombre = m["id"].rpartition("/")[2]
            sim.blobs_extra[m["id"]] = {"siblings": [
                {"rfilename": nombre + ".gguf", "size": 200000000, "lfs": {"sha256": SHA_LIBRE}}]}
        sim.falsas["sort=trendingScore"] = candidatos
        res = self.pasar(sim, colas_existentes=("nucleo/Libre-1",))
        self.assertEqual(res["fichas"], 5)  # 6 aceptados (Libre-1 ya viajaba), tope de 5
        ruta_cola = os.path.join(self.tmp, "starseed_memory_root", "olas", f"cola-vigia-{FECHA}.json")
        with open(ruta_cola, encoding="utf-8") as f:
            tareas = json.load(f)
        self.assertEqual([t["id"] for t in tareas],
                         [f"VIG261028-{n}" for n in range(1, 6)])
        titulos = [t["titulo"] for t in tareas]
        self.assertTrue(all(f"Libre-{i + 2}" in titulos[i] for i in range(3)))
        self.assertIn("Personal-1", titulos[3])
        self.assertIn("Personal-2", titulos[4])  # la última ficha es la primera personal

    def test_pasada_seco_no_escribe_ni_avisa(self):
        """--seco deja novedades, pero sin cola, sin aviso y sin marcar vistos."""
        sim = Simulador()
        res = self.pasar(sim, seco=True)
        ruta_cola = os.path.join(self.tmp, "starseed_memory_root", "olas", f"cola-vigia-{FECHA}.json")
        self.assertIsNone(res["cola"])
        self.assertEqual(res["fichas"], 0)
        self.assertIsNone(res["resumen"])
        self.assertFalse(os.path.isfile(ruta_cola))
        self.assertFalse(os.path.isfile(os.path.join(self.tmp, "estado-vigia.json")))
        self.assertTrue(os.path.isfile(os.path.join(self.tmp, "starseed_memory_root", "vigia",
                                                    f"novedades-{FECHA}.json")))

    def test_pasada_publica_una_vez_al_dia(self):
        """UN resumen; con aviso ya puesto no vuelve a publicar aunque el día siga."""
        sim = Simulador()
        primera = self.pasar(sim)
        self.assertEqual(primera["estado"]["aviso"], FECHA)
        segundos = self.pasar(sim)  # candidatos ya vistos: sin novedad, sin publicar
        self.assertEqual(len(self.publicadas), 1)
        self.assertIsNone(segundos["resumen"])
        self.assertIn("*Vigía de modelos", self.publicadas[0])
        self.assertIn("`Tongyi-MAI/Z-Image-Turbo`", self.publicadas[0])

    def test_aviso_fallido_no_tumba_la_pasada(self):
        """Si el Chat Director falla, la pasada sigue y lo deja anotado en el resumen."""
        sim = Simulador()
        res = self.pasar(sim, publicar=self.__class__.chispa)
        self.assertIn("(aviso no publicado: ZeroDivisionError)", res["resumen"])
        self.assertEqual(res["estado"]["aviso"], None)

    @staticmethod
    def chispa(_texto):
        """Publicador que revienta (para probar el aviso fallido)."""
        raise ZeroDivisionError("Chat Director caído (simulado)")

    def test_estado_guarda_ultima_pasada_y_vistos(self):
        """El estado lleva ultima, aviso y la lista de vistos ordenada, en la ruta inyectada."""
        ruta_estado = os.path.join(self.tmp, "estado-vigia.json")
        sim = Simulador()
        self.pasar(sim)
        with open(ruta_estado, encoding="utf-8") as f:
            estado = json.load(f)
        self.assertEqual(estado["aviso"], FECHA)
        self.assertIn("Tongyi-MAI/Z-Image-Turbo", estado["vistos"])
        self.assertEqual(estado["vistos"], sorted(estado["vistos"]))

    def test_ficha_con_datos_verificados_y_regla_de_licencia(self):
        """Cada tarea lleva id VIG-<fecha>, el catálogo (+ su prueba), la regla y solo HF_TOKEN."""
        self.escribir_catalogo(con_prueba=True)
        sim = Simulador()
        self.pasar(sim)
        ruta_cola = os.path.join(self.tmp, "starseed_memory_root", "olas", f"cola-vigia-{FECHA}.json")
        with open(ruta_cola, encoding="utf-8") as f:
            tareas = json.load(f)
        personal = next(t for t in tareas if "Qwen" in t["titulo"])
        libre = next(t for t in tareas if "Z-Image-Turbo" in t["titulo"]
                     and "GGUF" not in t["titulo"])
        self.assertTrue(personal["id"].startswith(f"VIG{FECHA[2:].replace('-', '')}-"))
        self.assertEqual(personal["area"], "vigia-imagen")
        self.assertIn("src/lib/imagenes/modelos.ts", personal["archivos"])
        self.assertIn("src/lib/imagenes/__tests__/modelos.test.ts", personal["archivos"])
        self.assertIn(REGLA_PERSONAL, personal["prompt"])
        self.assertIn("qwen-research", personal["prompt"])
        self.assertIn("SHA256 del archivo elegido (Hugging Face, lfs.oid)", personal["prompt"])
        self.assertIn("HF_TOKEN", personal["prompt"])
        self.assertNotIn("Bearer", personal["prompt"])
        self.assertNotIn(self.tmp, personal["prompt"])  # nunca rutas del disco
        self.assertNotIn(REGLA_PERSONAL, libre["prompt"])  # cada clase su regla
        self.assertIn("SHA256 del archivo elegido", libre["prompt"])
        self.assertIn(SHA_TURBO, json.dumps(tareas))  # el SHA viene en los datos de la ficha

    def test_toca_pasada(self):
        """Sin estado previo o > 20 h toca; más reciente, no; fecha rota, sí (§6)."""
        self.assertTrue(VM.toca_pasada(None))
        self.assertTrue(VM.toca_pasada({}, ahora=AHORA))
        self.assertFalse(VM.toca_pasada({"ultima": "2026-10-28T06:00:00+00:00"}, ahora=AHORA))
        self.assertTrue(VM.toca_pasada({"ultima": "2026-10-27T06:00:00+00:00"}, ahora=AHORA))
        self.assertTrue(VM.toca_pasada({"ultima": "fecha-rota"}, ahora=AHORA))


if __name__ == "__main__":
    unittest.main()
