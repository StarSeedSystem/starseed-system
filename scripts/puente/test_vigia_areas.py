# -*- coding: utf-8 -*-
"""Pruebas de las áreas del vigía de modelos (VGM1016A): sin red; el disco solo en carpetas temporales y el repo."""
import copy
import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import vigia_areas as V

AREAS_DEL_CONTRATO = ["imagen", "video", "3d", "voz", "oido", "palabra", "reflejo", "vision", "incrustaciones", "audio", "motores", "habilidades"]
MOTORES = {"ggml-org/llama.cpp", "leejet/stable-diffusion.cpp", "ggml-org/whisper.cpp", "Comfy-Org/ComfyUI",
           "fermionresearch/phonon", "microsoft/onnxruntime", "anomalyco/opencode"}
BASE = {"cuantizadores": ["unsloth", "city96", "QuantStack"],
        "licencias_conocidas": {"apache-2.0": "libre", "qwen-research": "personal"},
        "areas": [{"id": "imagen", "nombre": "Imagen", "pipeline_tags": ["text-to-image"], "autores": ["Qwen"],
                   "cuantizadores": ["unsloth"], "catalogo": "src/lib/imagenes/modelos.ts"},
                  {"id": "motores", "nombre": "Motores", "pipeline_tags": [], "autores": [],
                   "repos_github": ["ggml-org/llama.cpp"], "alias_github": {"ggerganov/llama.cpp": "ggml-org/llama.cpp"},
                   "catalogo": "src/lib/library/packages.ts"}]}


def con(cambio):
    datos = copy.deepcopy(BASE)
    cambio(datos)
    return datos


def errores(datos, existe=None):
    try:
        V.validar_areas(datos, existe)
    except V.AreasInvalidas as e:
        return "\n".join(e.errores)
    raise AssertionError("tenía que fallar y lo dio por bueno")


class AreasDelVigia(unittest.TestCase):
    def test_el_dato_real_es_valido_y_sus_catalogos_existen(self):
        areas = V.cargar_areas()  # valida también que cada `catalogo` existe en el repo
        self.assertEqual([a["id"] for a in areas], AREAS_DEL_CONTRATO)
        for a in areas:
            self.assertTrue(os.path.isfile(os.path.join(V.RAIZ_REPO, a["catalogo"])), a["catalogo"])
            self.assertEqual(a["licencias_conocidas"]["qwen-research"], "personal")
            self.assertEqual(a["licencias_conocidas"]["apache-2.0"], "libre")
            self.assertEqual(bool(a["repos_github"]), a["id"] in ("voz", "motores", "habilidades"))
        motores = next(a for a in areas if a["id"] == "motores")
        self.assertEqual(areas[-1]["id"], "habilidades")
        self.assertEqual(set(motores["repos_github"]), MOTORES)
        self.assertEqual(motores["alias_github"]["comfyanonymous/ComfyUI"], "Comfy-Org/ComfyUI")
        self.assertTrue({"Qwen", "Tongyi-MAI"} <= set(areas[0]["autores"]) and "text-to-image" in areas[0]["pipeline_tags"])
        self.assertTrue({"unsloth", "city96", "QuantStack"} <= set(areas[0]["cuantizadores"]))

    def test_resuelve_herencias(self):
        imagen, motores = V.validar_areas(con(lambda d: d["areas"][0].pop("cuantizadores")))
        self.assertEqual(imagen["cuantizadores"], ["unsloth", "city96", "QuantStack"])  # hereda la lista común
        self.assertEqual((imagen["filtros"], imagen["repos_github"]), ({"etiquetas": []}, []))
        self.assertEqual(motores["licencias_conocidas"], BASE["licencias_conocidas"])

    def test_campo_obligatorio_que_falta(self):
        self.assertIn("área «motores»: falta el campo «catalogo»", errores(con(lambda d: d["areas"][1].pop("catalogo"))))
        self.assertIn("falta «licencias_conocidas»", errores(con(lambda d: d.pop("licencias_conocidas"))))

    def test_duplicados(self):
        self.assertIn("«imagen» está repetido", errores(con(lambda d: d["areas"].append(copy.deepcopy(d["areas"][0])))))
        self.assertIn("«QWEN» está repetido", errores(con(lambda d: d["areas"][0]["autores"].append("QWEN"))))
        texto = errores(con(lambda d: (d["areas"][0].update(repos_github=["ggml-org/llama.cpp"]),
                                       d["areas"][1].update(repos_github=["GGML-org/llama.cpp"]))))
        self.assertIn("repos_github: «GGML-org/llama.cpp» está repetido", texto)  # un repo, un solo área

    def test_rutas_relativas_al_repo_sin_ensenar_la_absoluta(self):
        for mala in ("/Users/alguien/repo/x.ts", "~/x.ts", "../fuera.ts", "src/../x.ts", "src\\x.ts", "C:/x.ts", ""):
            texto = errores(con(lambda d: d["areas"][0].update(catalogo=mala)))
            self.assertIn("tiene que ser relativa al repo", texto, mala)
            self.assertNotIn("alguien", texto)
        texto = errores(BASE, existe=lambda r: r != "src/lib/library/packages.ts")
        self.assertIn("el catálogo «src/lib/library/packages.ts» no existe en el repo", texto)
        self.assertEqual(len(V.validar_areas(BASE, existe=None)), 2)  # sin `existe` no se mira el disco

    def test_licencias(self):
        self.assertIn("«gratis» no existe", errores(con(lambda d: d["licencias_conocidas"].update(mit="gratis"))))
        texto = errores(con(lambda d: d["licencias_conocidas"].update({"cc-by-nc-4.0": "libre", "qwen-research": "libre"})))
        self.assertIn("licencia «cc-by-nc-4.0»: no comercial", texto)
        self.assertIn("licencia «qwen-research»: no comercial", texto)
        self.assertIn("en minúsculas", errores(con(lambda d: d["licencias_conocidas"].update({"MIT": "libre"}))))

    def test_erratas_y_formatos(self):
        texto = errores(con(lambda d: d["areas"][0].update(pipeline_tag=["x"], filtros={"max_b": 3})))
        self.assertTrue("campo desconocido «pipeline_tag»" in texto and "filtros: solo valen" in texto, texto)
        self.assertIn("no está en la lista común", errores(con(lambda d: d["areas"][0].update(cuantizadores=["Quantstak"]))))
        self.assertIn("> 0", errores(con(lambda d: d["areas"][0].update(filtros={"max_parametros_b": "9"}))))
        self.assertIn("formato válido", errores(con(lambda d: d["areas"][1].update(repos_github=["llama.cpp"]))))
        self.assertIn("id (minúsculas", errores(con(lambda d: d["areas"][0].update(id="Oído"))))
        self.assertIn("alias_github", errores(con(lambda d: d["areas"][1].update(alias_github={"a/b": "c/d"}))))
        self.assertIn("no vigila nada", errores(con(lambda d: d["areas"][0].update(pipeline_tags=[], autores=[]))))

    def test_junta_todos_los_problemas(self):
        with self.assertRaises(V.AreasInvalidas) as ctx:
            V.validar_areas(con(lambda d: (d["areas"][0].pop("autores"), d["areas"][1].update(catalogo="/x"))))
        self.assertEqual(len(ctx.exception.errores), 2)
        self.assertTrue(str(ctx.exception).startswith("config/vigia-areas.json no es válido:"))

    def test_archivo_ausente_o_roto_con_nombre_relativo_y_valido(self):
        with tempfile.TemporaryDirectory() as raiz:
            ruta = os.path.join(raiz, "config", "vigia-areas.json")
            for rel in ("config/x", "src/lib/imagenes/modelos.ts", "src/lib/library/packages.ts"):
                os.makedirs(os.path.dirname(os.path.join(raiz, rel)), exist_ok=True)
                open(os.path.join(raiz, rel), "w").close()
            with self.assertRaises(V.AreasInvalidas) as ctx:
                V.cargar_areas(ruta, raiz)
            self.assertEqual(str(ctx.exception), "config/vigia-areas.json no es válido:\n  · no existe el archivo")
            with open(ruta, "w", encoding="utf-8") as f:
                f.write('{"areas": [\n  {"id": "imagen",}\n]}')
            with self.assertRaises(V.AreasInvalidas) as ctx:
                V.cargar_areas(ruta, raiz)
            self.assertIn("JSON roto en la línea 2", str(ctx.exception))
            self.assertNotIn(raiz, str(ctx.exception))
            with open(ruta, "w", encoding="utf-8") as f:
                json.dump(BASE, f)
            self.assertEqual([a["id"] for a in V.cargar_areas(ruta, raiz)], ["imagen", "motores"])
