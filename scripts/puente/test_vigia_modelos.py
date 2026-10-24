# -*- coding: utf-8 -*-
"""Pruebas del vigía de modelos (VGM1016D) · SIN red: el getter HTTP va inyectado y las respuestas
de ejemplo viven dentro de esta prueba (architecture/vigia-modelos.md §2-§3, §6). El disco real
solo se sustituye por carpetas temporales (novedades, colas, catálogo y estado)."""
import copy
import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import vigia_areas
import vigia_modelos as V

TURBO = {"id": "Qwen/Qwen-Image-2.1-Turbo", "tags": ["license:qwen-research", "text-to-image"],
         "createdAt": "2026-10-09T00:00:00Z",
         "siblings": [{"rfilename": "turbo-bf16.safetensors", "size": 14200000000},
                      {"rfilename": "turbo-q4_k_m.gguf", "size": 4200000000}]}
ZIMAGE = {"id": "Tongyi-MAI/Z-Image-Turbo", "tags": ["license:apache-2.0", "text-to-image"],
          "createdAt": "2025-11-25T00:00:00Z",
          "siblings": [{"rfilename": "z-image-turbo-bf16.safetensors", "size": 14200000000},
                       {"rfilename": "z-image-turbo-q4_k_m.gguf", "size": 4200000000}]}
GGUF = {"id": "unsloth/Qwen-Image-2.1-Turbo-GGUF", "tags": ["license:qwen-research", "gguf"],
        "createdAt": "2026-10-10T00:00:00Z",
        "siblings": [{"rfilename": "Q2_K Meets.gguf", "size": 2470000000}]}
SUJA = {"id": "Raro/modelo-uncensored-XL", "tags": ["license:other"], "createdAt": "2026-10-20T00:00:00Z",
        "siblings": []}

AREAS = {"esquema": 1, "cuantizadores": ["unsloth"],
         "licencias_conocidas": {"apache-2.0": "libre", "qwen-research": "personal", "mit": "libre",
                                 "other": "desconocida"},
         "areas": [{"id": "imagen", "nombre": "Imagen", "pipeline_tags": ["text-to-image"],
                    "autores": ["Qwen"], "cuantizadores": ["unsloth"],
                    "repos_github": ["Comfy-Org/ComfyUI"], "catalogo": "cat/modelos.ts"}]}


def getter(url):
    """El cliente HTTP inyectado: respuestas de ejemplo según la petición; nada sale a la red."""
    if "sort=trendingScore" in url:
        return [ZIMAGE, SUJA]
    if "sort=createdAt" in url:
        return [TURBO, ZIMAGE, GGUF]  # Z-Image se repite entre fuentes: `descubrir` debe igualar
    if url.endswith("/releases/latest"):
        return {"published_at": "2026-10-24T10:00:00Z", "target_commitish": "abc1234"}
    if url.startswith("https://api.github.com/repos/"):
        return {"license": {"spdx_id": "MIT"}}
    raise AssertionError("URL inesperada: %s" % url)


class PruebaVigiaModelos(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.areas = vigia_areas.validar_areas(copy.deepcopy(AREAS))
        originales = ("RAIZ", "MEMORIA", "VIGIA", "COLAS", "director_chat")
        self.aplazados = {n: getattr(V, n) for n in originales}
        for nombre in originales:
            setattr(V, nombre, os.path.join(self.tmp, nombre))
        self.pub = []
        V.director_chat = type("Chat", (), {"publicar": lambda self_, texto, **kw:
                                            self.pub.append(texto) or {"id": "md-prueba"}})()
        os.makedirs(os.path.join(V.VIGIA), exist_ok=True)
        os.makedirs(os.path.join(V.COLAS), exist_ok=True)

    def tearDown(self):
        if os.path.exists(V.MEMORIA):
            os.remove(V.MEMORIA)
        for n, v in self.aplazados.items():
            setattr(V, n, v)

    def _orden(self, ids):
        return [c["id"] for c in ids]

    def test_descubrir_iguala_fuentes_y_trae_github(self):
        hallados = V.descubrir(self.areas[0], getter)
        ids = set(self._orden(hallados))
        self.assertEqual(ids, {"Qwen/Qwen-Image-2.1-Turbo", "Tongyi-MAI/Z-Image-Turbo",
                               "unsloth/Qwen-Image-2.1-Turbo-GGUF", "Raro/modelo-uncensored-XL",
                               "Comfy-Org/ComfyUI"}, "tendencia + familia + releases, sin repetir")
        turbo = next(c for c in hallados if c["id"] == "Qwen/Qwen-Image-2.1-Turbo")
        self.assertEqual(turbo["licencia"], "qwen-research")
        self.assertEqual(turbo["origen"], "familia", "de la fuente vigilada por autor")
        comfy = next(c for c in hallados if c["id"] == "Comfy-Org/ComfyUI")
        self.assertEqual(comfy["licencia"], "mit")
        self.assertEqual(comfy["sha"], "abc1234")
        self.assertEqual(comfy["creado"], "2026-10-24T10:00:00Z")

    def test_candidatos_con_tamanio_y_hermanos(self):
        turbo = next(c for c in V.descubrir(self.areas[0], getter)
                     if c["id"] == "Qwen/Qwen-Image-2.1-Turbo")
        self.assertAlmostEqual(turbo["tamanio_gb"], 4.2)  # en §3 se elige la cuantización que cabe
        self.assertEqual([h["nombre"] for h in turbo["hermanos"]], ["turbo-bf16.safetensors", "turbo-q4_k_m.gguf"])

    def test_evaluar_licencias_seguridad_y_vistos(self):
        area = self.areas[0]
        candidatos = V.descubrir(area, getter)
        aceptados, descartados = V.evaluar(candidatos, area, set(), [])
        ids_ok = set(self._orden(aceptados))
        # Z-Image entra libre; el Turbo como OPCIÓN personal; el GGUF por su base aceptada (la
        # misma pasada habilita a sus cuantizadores) y ComfyUI por su licencia MIT.
        self.assertEqual(ids_ok, {"Qwen/Qwen-Image-2.1-Turbo", "Tongyi-MAI/Z-Image-Turbo",
                                  "unsloth/Qwen-Image-2.1-Turbo-GGUF", "Comfy-Org/ComfyUI"})
        motivos = {d["id"]: d["motivo"] for d in descartados}
        self.assertEqual(motivos["Raro/modelo-uncensored-XL"], "licencia desconocida: no entra (§3)")
        # el cuantizador SIN su base aceptada no entra nunca (§3)
        solo = [c for c in candidatos if c["id"] == "unsloth/Qwen-Image-2.1-Turbo-GGUF"]
        aceptados, descartados = V.evaluar(solo, area, set(), [])
        self.assertEqual(aceptados, [])
        self.assertEqual(descartados[0]["motivo"], "tercero sin modelo base aceptado")
        # … pero un id ya visto en otra pasada no se repite
        vistos = {"Qwen/Qwen-Image-2.1-Turbo"}
        aceptados, descartados = V.evaluar(candidatos, area, vistos, [])
        self.assertNotIn("Qwen/Qwen-Image-2.1-Turbo", self._orden(aceptados))
        self.assertEqual([d["motivo"] for d in descartados if d["id"] == "Qwen/Qwen-Image-2.1-Turbo"],
                         ["ya visto en otra pasada"])

    def test_evaluar_clase_personal_va_con_regla_y_nunca_como_defecto(self):
        area = self.areas[0]
        aceptados, _ = V.evaluar(V.descubrir(area, getter), area, set(), [])
        personal = next(c for c in aceptados if c["clase"] == "personal")
        self.assertEqual(personal["id"], "Qwen/Qwen-Image-2.1-Turbo")
        tarea = V._tarea(personal, "2026-10-24", area, 1)
        self.assertIn("NUNCA por defecto del sistema ni en uso comercial", tarea["prompt"])

    def test_evaluar_mejora_con_mejor_actual(self):
        area = self.areas[0]
        candidatos = V.descubrir(area, getter)
        mejor = {"id": "viejo", "pasos": 20, "tamanio_gb": 10.0}  # más pasos; más peso que el nuevo
        aceptados, descartados = V.evaluar(candidatos, area, set(), [], mejor_actual=mejor)
        self.assertIn("Tongyi-MAI/Z-Image-Turbo", self._orden(aceptados))
        peor = {"id": "nuevo", "pasos": 2, "tamanio_gb": 12.0, "origen": "familia",
                "licencia": "apache-2.0", "etiquetas": []}  # menos pasos y más peso que el actual
        aceptados, descartados = V.evaluar([peor], area, set(), [], mejor_actual=mejor)
        self.assertEqual(aceptados, [])
        raro = next(d for d in descartados if d["id"] == "nuevo")
        self.assertEqual(raro["motivo"], "no supera al mejor actual")

    def test_archivo_por_medio_elige_el_mayor_que_cabe(self):
        turbo = {"hermanos": [{"nombre": "q4-ligero.gguf", "tamano_gb": 0.8},
                              {"nombre": "q4_k_m.gguf", "tamano_gb": 4.2},
                              {"nombre": "f16.gguf", "tamano_gb": 14.2}]}
        elegido = V.archivo_por_medio(turbo)
        self.assertEqual(set(elegido), {"navegador", "pwa", "mac", "a1"})
        self.assertEqual(elegido["navegador"]["nombre"], "q4-ligero.gguf", "≤ 1 GB en el navegador")
        self.assertEqual(elegido["pwa"]["gb"], 0.8)
        self.assertEqual(elegido["mac"]["nombre"], "q4_k_m.gguf", "≤ 4,5 GB en la Mac de 8")
        self.assertEqual(elegido["a1"]["gb"], 4.2)
        self.assertEqual(V.archivo_por_medio({"hermanos": []}), {})

    def test_tarea_de_cola_con_datos_que_fueron_verificados(self):
        area = self.areas[0]
        candidatos = V.descubrir(area, getter)
        aceptados, _ = V.evaluar(candidatos, area, set(), [])
        turbo = next(c for c in aceptados if c["id"] == "Qwen/Qwen-Image-2.1-Turbo")
        tarea = V._tarea(turbo, "2026-10-24", area, 1)
        self.assertEqual(tarea["id"], "vg20261024-imagen-1")
        self.assertEqual(tarea["ola"], "vigia-2026-10-24")
        self.assertEqual(len(tarea["archivos"]), 2, "≤ 3 archivos: el catálogo del área y su prueba")
        self.assertEqual(tarea["archivos"], ["cat/modelos.ts", "cat/__tests__/modelos.test.ts"])
        self.assertFalse(tarea["aprobacion"])
        self.assertIn("Qwen/Qwen-Image-2.1-Turbo", tarea["prompt"])
        self.assertIn("«qwen-research» → clase «personal»", tarea["prompt"])  # licencia verificada
        self.assertIn("origen familia", tarea["prompt"])
        self.assertIn("Archivo elegido por medio", tarea["prompt"])
        self.assertIn("turbo-q4_k_m.gguf", tarea["prompt"])  # la cuantización que cabe en la Mac
        otra = V._tarea(turbo, "2026-10-24", area, 2)
        self.assertNotEqual(tarea["id"], otra["id"], "ids únicos en todo el histórico")

    def test_pasada_todo_en_memoria_y_cola_segun_puntuado(self):
        novedades, cola = V.pasada(self.areas, getter, fecha="2026-10-24")
        self.assertEqual(novedades["fecha"], "2026-10-24")
        datos = novedades["areas"]["imagen"]
        self.assertEqual(set(self._orden(datos["aceptados"])),
                         {"Qwen/Qwen-Image-2.1-Turbo", "Tongyi-MAI/Z-Image-Turbo", "Comfy-Org/ComfyUI",
                          "unsloth/Qwen-Image-2.1-Turbo-GGUF"})
        self.assertEqual({d["id"] for d in datos["descartados"]}, {"Raro/modelo-uncensored-XL"})
        self.assertEqual(os.listdir(V.VIGIA), [], "nada escrito en disco: escribir es de `main`")
        self.assertEqual(os.listdir(V.COLAS), [], "tampoco colas aquí")
        self.assertLessEqual(len(cola), 5, "≤ 5 fichas al día")
        ids = [t["id"] for t in cola]
        self.assertEqual(len(ids), len(set(ids)), "sin ids repetidos dentro de la cola")
        self.assertTrue(all(t["prompt"] and t["archivos"] for t in cola))

    def test_pasada_no_repite_catalogo_ni_cola(self):
        cat = os.path.join(V.RAIZ, "cat/modelos.ts")
        os.makedirs(os.path.dirname(cat), exist_ok=True)
        with open(cat, "w", encoding="utf-8") as f:
            f.write("// Tongyi-MAI/Z-Image-Turbo ya está aquí\nZ-Image-Turbo\n")
        with open(os.path.join(V.COLAS, "cola-vigia-2026-10-23.json"), "w", encoding="utf-8") as f:
            f.write('{"ola": "vigia-2026-10-23", "tareas": []}\nQwen/Qwen-Image-2.1-Turbo\n')
        _, cola = V.pasada(self.areas, getter, fecha="2026-10-24")
        titulos = " ".join(t["titulo"] for t in cola)
        self.assertNotIn("Z-Image-Turbo", titulos, "ya está en el catálogo")
        self.assertNotIn("Qwen/Qwen-Image-2.1-Turbo ", titulos, "ya está en una cola anterior")
        self.assertTrue(all("Qwen-Image-2.1-Turbo-GGUF" in t["titulo"] or "ComfyUI" in t["titulo"]
                            for t in cola), "solo quedan el GGUF con base y la release de ComfyUI")

    def test_main_seco_deja_novedades_y_estado_sin_colas_ni_aviso(self):
        import io
        import contextlib
        salida = io.StringIO()
        with contextlib.redirect_stdout(salida):
            novedades, fichas = V.main(["--seco"], getter, areas=self.areas)
        self.assertIn("Vigía de modelos", salida.getvalue(), "el resumen también se imprime en seco")
        hoy = novedades["fecha"]
        archivo_nov = os.path.join(V.VIGIA, "novedades-%s.json" % hoy)
        with open(archivo_nov, encoding="utf-8") as f:
            grabada = json.load(f)
        self.assertEqual(grabada["areas"]["imagen"]["catalogo"], "cat/modelos.ts")
        with open(V.MEMORIA, encoding="utf-8") as f:
            estado = json.load(f)
        self.assertEqual(estado["ultima_pasada"], hoy)
        self.assertIn("Tongyi-MAI/Z-Image-Turbo", estado["vistos"], "ids de los aceptados, para no repetir")
        self.assertEqual(os.listdir(V.COLAS), [], "en seco: sin colas")
        self.assertEqual(self.pub, [], "en seco: sin aviso al Chat Director")

    def test_main_avisa_una_vez_y_deja_cola(self):
        import io
        import contextlib
        hoy = "2026-10-24"  # fecha fija para leer los archivos que deja
        self.congelar_fecha(hoy)
        with contextlib.redirect_stdout(io.StringIO()):
            _, fichas = V.main([], getter, areas=self.areas)
        self.assertEqual(len(self.pub), 1, "UN resumen en el Chat Director")
        self.assertIn("Imagen", self.pub[0], "el resumen enseña lo nuevo por área")
        self.assertEqual(os.listdir(V.COLAS), ["cola-vigia-%s.json" % hoy] if fichas else [],
                         "cola con una tarea por ficha")
        with open(os.path.join(V.COLAS, "cola-vigia-%s.json" % hoy), encoding="utf-8") as f:
            grabada = json.load(f)
        self.assertEqual([t["id"] for t in grabada["tareas"]], [t["id"] for t in fichas])
        # segunda pasada el mismo día: ya avisó, no repite el aviso
        with contextlib.redirect_stdout(io.StringIO()):
            V.main([], getter, areas=self.areas)
        self.assertEqual(len(self.pub), 1, "avisa UNA vez al día (§6)")

    def congelar_fecha(self, hoy):
        class FechaFija:
            @staticmethod
            def today():
                return type("D", (), {"isoformat": lambda self_: hoy})()
        self._fecha_real = V.date
        V.date = FechaFija

    def tearDown(self):
        if os.path.exists(V.MEMORIA):
            os.remove(V.MEMORIA)
        if hasattr(self, "_fecha_real"):
            V.date = self._fecha_real
        for n, v in self.aplazados.items():
            setattr(V, n, v)
