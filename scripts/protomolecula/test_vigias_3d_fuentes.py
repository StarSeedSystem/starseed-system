#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas de vigias_3d_fuentes.py con respuestas GRABADAS (ver falso_vigias_3d.py: qué es real y qué sintético).
Ejecutar: python3 -m pytest -q scripts/protomolecula/test_vigias_3d_fuentes.py
"""
import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import vigias_3d_fuentes as fu  # noqa: E402
from falso_vigias_3d import ARXIV, HF, RAW, Falso, grabacion, ok  # noqa: E402


def fuentes(falso, pausas=None):
    return fu.Fuentes(get=falso, dormir=(pausas.append if pausas is not None else (lambda s: None)), pausa=0.4)


class Red(unittest.TestCase):
    def test_raw_200_es_ok_y_devuelve_el_texto_y_la_rama(self):
        f = Falso({f"{RAW}/a/b/main/README.md": ok("hola")})
        self.assertEqual(fuentes(f).texto_raw("a/b", "README.md"), (fu.OK, "hola", "main"))

    def test_sin_rama_prueba_main_y_luego_master(self):
        f = Falso({f"{RAW}/a/b/main/README.md": (404, {}, ""), f"{RAW}/a/b/master/README.md": ok("viejo")})
        self.assertEqual(fuentes(f).texto_raw("a/b", "README.md"), (fu.OK, "viejo", "master"))
        self.assertEqual(f.urls(), [f"{RAW}/a/b/main/README.md", f"{RAW}/a/b/master/README.md"])

    def test_404_en_las_dos_ramas_es_no_existe_y_con_rama_fija_solo_mira_esa(self):
        f = Falso({}, defecto=(404, {}, ""))
        self.assertEqual(fuentes(f).texto_raw("a/b", "x.py")[0], fu.NO_EXISTE)
        self.assertEqual(len(f.vistas), 2)
        f2 = Falso({}, defecto=(404, {}, ""))
        self.assertEqual(fuentes(f2).texto_raw("a/b", "x.py", rama="dev")[0], fu.NO_EXISTE)
        self.assertEqual(len(f2.vistas), 1)

    def test_un_fallo_de_red_es_sin_datos_y_no_sigue_probando_ramas(self):
        for codigo in (0, 403, 429, 500, 503):
            f = Falso({}, defecto=(codigo, {}, ""))
            self.assertEqual(fuentes(f).texto_raw("a/b", "README.md"), (fu.SIN_DATOS, None, ""), codigo)
            self.assertEqual(len(f.vistas), 1, codigo)

    def test_la_sonda_manda_range_y_206_cuenta_como_existe(self):
        f = Falso({f"{RAW}/a/b/main/x.py": ok("#", 206)})
        self.assertEqual(fuentes(f).texto_raw("a/b", "x.py", rama="main", rango=True)[0], fu.OK)
        self.assertEqual(f.vistas[0][1].get("Range"), "bytes=0-0")

    def test_un_get_que_lanza_no_tumba_la_pasada(self):
        def explota(url, cabeceras=None, plazo=30):
            raise OSError("sin ruta")

        self.assertEqual(fu.Fuentes(get=explota, dormir=lambda s: None).texto_raw("a/b", "x")[0], fu.SIN_DATOS)

    def test_hay_pausa_entre_llamadas_pero_no_antes_de_la_primera(self):
        pausas: list[float] = []
        f = Falso({}, defecto=(404, {}, ""))
        c = fuentes(f, pausas)
        c.modelo_hf("a/b")
        self.assertEqual(pausas, [])
        c.modelo_hf("a/c")
        c.articulo_hf("2609.1")
        self.assertEqual(pausas, [0.4, 0.4])

    def test_articulo_no_indexado_en_hf_es_no_existe_no_un_fallo(self):
        f = Falso({f"{HF}/api/papers/2609.34900": (404, {}, grabacion("hf-papers-no-encontrado.json"))})
        self.assertEqual(fuentes(f).articulo_hf("2609.34900"), (fu.NO_EXISTE, None))

    def test_articulo_real_de_unimate_trae_repo_y_modelos(self):
        f = Falso({f"{HF}/api/papers/2609.05415": ok(grabacion("hf-papers-unimate.json"))})
        estado, art = fuentes(f).articulo_hf("2609.05415")
        self.assertEqual(estado, fu.OK)
        self.assertEqual(fu.repo_de_url(art["githubRepo"]), "Friedrich-M/UniMate")
        self.assertIn("Linzhan/UniMate", [m["id"] for m in art["linkedModels"]])

    def test_json_ilegible_es_sin_datos(self):
        f = Falso({f"{HF}/api/models/a/b": ok("<html>mantenimiento</html>")})
        self.assertEqual(fuentes(f).modelo_hf("a/b"), (fu.SIN_DATOS, None))

    def test_modelos_de_arxiv_lista_vacia_es_ok_y_algo_que_no_es_lista_es_sin_datos(self):
        f = Falso({f"{HF}/api/models?filter=arxiv:1": ok(grabacion("hf-modelos-arxiv-vacio.json")), f"{HF}/api/models?filter=arxiv:2": ok('{"error": "x"}')})
        self.assertEqual(fuentes(f).modelos_de_arxiv("1"), (fu.OK, []))
        self.assertEqual(fuentes(f).modelos_de_arxiv("2"), (fu.SIN_DATOS, []))

    def test_modelos_de_arxiv_real_trae_tres_modelos(self):
        f = Falso({f"{HF}/api/models?filter=arxiv:2609.05415": ok(grabacion("hf-modelos-arxiv-unimate.json"))})
        estado, lista = fuentes(f).modelos_de_arxiv("2609.05415")
        self.assertEqual((estado, len(lista)), (fu.OK, 3))

    def test_atom_real_se_lee_y_el_429_real_de_arxiv_es_sin_datos(self):
        url = f"{ARXIV}?id_list=2609.34900,2609.39709"
        estado, arts = fuentes(Falso({url: ok(grabacion("arxiv-atom.xml"))})).atom(["2609.34900", "2609.39709"])
        self.assertEqual(estado, fu.OK)
        self.assertEqual(sorted(arts), ["2609.34900", "2609.39709"])
        self.assertTrue(arts["2609.39709"]["titulo"].startswith("BTC3D"))
        self.assertEqual(arts["2609.34900"]["actualizado"], "2026-09-28")
        self.assertEqual(fuentes(Falso({url: (429, {}, grabacion("arxiv-429.txt"))})).atom(["2609.34900", "2609.39709"]), (fu.SIN_DATOS, {}))

    def test_atom_con_dtd_no_se_lee(self):
        url = f"{ARXIV}?id_list=1"
        malo = '<?xml version="1.0"?><!DOCTYPE feed [<!ENTITY a "aaaa">]><feed xmlns="http://www.w3.org/2005/Atom"></feed>'
        self.assertEqual(fuentes(Falso({url: ok(malo)})).atom(["1"]), (fu.SIN_DATOS, {}))

    def test_atom_roto_es_sin_datos_y_la_entrada_de_error_no_es_un_articulo(self):
        url = f"{ARXIV}?id_list=1"
        self.assertEqual(fuentes(Falso({url: ok("<feed")})).atom(["1"]), (fu.SIN_DATOS, {}))
        error = ('<feed xmlns="http://www.w3.org/2005/Atom"><entry><id>http://arxiv.org/api/errors#incorrect_id_format_for_1</id>'
                 "<title>Error</title><summary>incorrect id format</summary></entry></feed>")
        self.assertEqual(fuentes(Falso({url: ok(error)})).atom(["1"]), (fu.OK, {}))

    def test_atom_saca_los_repos_de_github_del_resumen_y_del_comentario(self):
        xml = ('<feed xmlns="http://www.w3.org/2005/Atom" xmlns:arxiv="http://arxiv.org/schemas/atom"><entry>'
               "<id>http://arxiv.org/abs/2609.11111v2</id><title>T</title><updated>2026-10-01T00:00:00Z</updated>"
               "<summary>Code at https://github.com/foo/bar.git and more.</summary>"
               "<arxiv:comment>Project: https://github.com/foo/bar and https://github.com/baz/qux/tree/main</arxiv:comment></entry></feed>")
        self.assertEqual(fu.parsear_atom(xml)["2609.11111"]["repos"], ["foo/bar", "baz/qux"])


class Lectores(unittest.TestCase):
    def test_licencia_del_codigo_real_de_unimate_es_mit(self):
        self.assertEqual(fu.clasificar_licencia(grabacion("unimate-license-codigo.txt")), "MIT")

    def test_licencias_conocidas_por_su_texto(self):
        casos = {
            "Apache License\nVersion 2.0, January 2004": "Apache-2.0",
            "GNU GENERAL PUBLIC LICENSE\nVersion 3, 29 June 2007": "GPL-3.0",
            "GNU AFFERO GENERAL PUBLIC LICENSE Version 3": "AGPL-3.0",
            "Attribution-NonCommercial 4.0 International\nCreative Commons Corporation": "CC-BY-NC-4.0",
            "Creative Commons Attribution-NonCommercial-ShareAlike 4.0": "CC-BY-NC-SA-4.0",
            "Redistribution and use in source and binary forms, with or without modification. Neither the name of": "BSD-3-Clause",
            "Redistribution and use in source and binary forms, with or without modification.": "BSD-2-Clause",
            "Licencia propia de la casa, todos los derechos reservados": "otra",
        }
        for texto, esperado in casos.items():
            self.assertEqual(fu.clasificar_licencia(texto), esperado, texto)
        self.assertIsNone(fu.clasificar_licencia(""))
        self.assertIsNone(fu.clasificar_licencia(None))

    def test_licencia_de_los_pesos_real_es_cc_by_nc(self):
        modelo = json.loads(grabacion("hf-unimate-modelo.json"))
        self.assertEqual(fu.licencia_hf(modelo), "cc-by-nc-4.0")
        self.assertEqual(fu.uso_de_licencia(fu.licencia_hf(modelo)), "no-comercial")

    def test_licencia_hf_cae_a_la_etiqueta_y_tolera_basura(self):
        self.assertEqual(fu.licencia_hf({"tags": ["pytorch", "license:Apache-2.0"]}), "apache-2.0")
        self.assertEqual(fu.licencia_hf({"cardData": {"license": ["mit", "gpl-3.0"]}}), "mit")
        self.assertIsNone(fu.licencia_hf({"cardData": {}, "tags": []}))
        self.assertIsNone(fu.licencia_hf(None))
        self.assertIsNone(fu.licencia_hf({"cardData": "no es un dict"}))

    def test_uso_de_licencia_usa_el_vocabulario_del_nucleo_y_no_adivina(self):
        casos = {"mit": "libre", "apache-2.0": "libre", "cc0-1.0": "libre", "cc-by-4.0": "atribucion", "cc-by-nc-4.0": "no-comercial",
                 "cc-by-nc-sa-4.0": "no-comercial", "research-only": "no-comercial", "cc-by-sa-4.0": "condicionado", "gpl-3.0": "condicionado",
                 "openrail": "condicionado", "other": "condicionado", None: None, "": None}
        for lic, uso in casos.items():
            self.assertEqual(fu.uso_de_licencia(lic), uso, lic)
        ts = (Path(__file__).resolve().parents[2] / "src" / "lib" / "avatares" / "adn" / "adn.ts").read_text("utf-8")
        for uso in set(casos.values()) - {None}:
            self.assertIn(f'"{uso}"', ts, f"«{uso}» no está en USOS_LICENCIA del núcleo")

    def test_readme_real_de_unimate_comando_fecha_y_nada_pendiente(self):
        s = fu.senales_readme(grabacion("unimate-readme.md"))
        self.assertTrue(s["comando_inferencia"].startswith("python -m unimate.inference.sample --exp_dir"))
        self.assertEqual(s["fecha_codigo"], "2026-09-06")  # «The training and inference code is released.»
        self.assertFalse(s["anuncia_pendiente"])

    def test_readme_sintetico_con_codigo_pendiente(self):
        s = fu.senales_readme("# X\n- **[2026-10-01]** Code coming soon!\n- [ ] Release code and weights\n")
        self.assertEqual(s, {"comando_inferencia": None, "fecha_codigo": None, "anuncia_pendiente": True,
                             "pendiente": "- **[2026-10-01]** Code coming soon!", "inferencia_marcada": False})

    def test_readme_sin_texto(self):
        self.assertEqual(fu.senales_readme(None), {"comando_inferencia": None, "fecha_codigo": None, "anuncia_pendiente": False,
                                                   "pendiente": None, "inferencia_marcada": False})

    # Los README más habituales que el revisor reprodujo: el vigía fallaba justo en avisar cuando publican la inferencia.
    def test_casilla_marcada_de_inferencia_con_entrenamiento_pendiente_cuenta_como_publicado(self):
        s = fu.senales_readme("# F\n- [x] Release inference code\n- [ ] Release training code\n\n```bash\npython infer.py --image a.png --out m.glb\n```\n")
        self.assertEqual((s["comando_inferencia"], s["inferencia_marcada"], s["anuncia_pendiente"], s["pendiente"]),
                         ("python infer.py --image a.png --out m.glb", True, False, None))

    def test_todo_suelto_y_training_code_will_be_released_no_anulan_un_comando_real(self):
        s = fu.senales_readme("# F\nTODO\nTraining code will be released.\nTODO: add citation\n\n    python infer.py --in x.png\n")
        self.assertEqual((s["comando_inferencia"], s["anuncia_pendiente"]), ("python infer.py --in x.png", False))

    def test_lo_pendiente_de_inferencia_o_de_codigo_en_general_si_cuenta(self):
        for linea in ("Inference code coming soon", "- [ ] Release inference code", "TODO: write the inference script", "Code will be released.",
                      "- [ ] Release training and inference code", "The demo is coming soon."):
            s = fu.senales_readme(f"# X\n{linea}\n")
            self.assertTrue(s["anuncia_pendiente"], linea)
            self.assertIn(linea.strip(), s["pendiente"])

    def test_lo_pendiente_de_entrenamiento_datos_o_pesos_no_cuenta(self):
        for linea in ("Training code will be released.", "- [ ] Release training code", "- [ ] Release the dataset", "Evaluation scripts coming soon",
                      "- [ ] Release pretrained weights", "Fine-tuning recipes: coming soon", "TODO: add citation", "TODO"):
            self.assertFalse(fu.senales_readme(f"# X\n{linea}\n")["anuncia_pendiente"], linea)

    def test_un_pendiente_dentro_de_un_bloque_de_codigo_no_cuenta(self):
        s = fu.senales_readme("# X\n```bash\n# TODO: code coming soon\npython infer.py\n```\n")
        self.assertEqual((s["anuncia_pendiente"], s["comando_inferencia"]), (False, "python infer.py"))

    def test_comandos_que_no_son_de_inferencia(self):
        for linea in ("python -m pytest tests/", "python run_training.py --cfg a", "python generate_data.py", "python train.py", "python eval.py --split test",
                      "python setup.py install", "python -m unittest discover", "python scripts/rig_preprocess.py in.glb", "pip install -r requirements.txt",
                      "python run.py", "python -m build"):
            self.assertIsNone(fu.senales_readme(f"{linea}\n")["comando_inferencia"], linea)

    def test_comandos_de_inferencia_variados(self):
        casos = {
            "python infer.py --image foto.png": "python infer.py --image foto.png",
            "$ python3 demo.py --prompt 'a cat'": "python3 demo.py --prompt 'a cat'",
            "CUDA_VISIBLE_DEVICES=0 python sample.py --steps 50": "python sample.py --steps 50",
            "torchrun --nproc 2 predict.py": None,  # el lanzador lleva flags antes del script: no se adivina
            "python -m unimate.inference.sample --exp_dir x": "python -m unimate.inference.sample --exp_dir x",
            "python scripts/data_tools/infer.py in.glb": "python scripts/data_tools/infer.py in.glb",
            "python generate.py --prompt hola \\": "python generate.py --prompt hola",
        }
        for linea, esperado in casos.items():
            self.assertEqual(fu.senales_readme(f"{linea}\n")["comando_inferencia"], esperado, linea)

    def test_una_noticia_de_pesos_o_datos_no_cuenta_como_codigo_publicado(self):
        s = fu.senales_readme("- **[2026-09-27]** Preview checkpoints are released.\n- **[2026-08-30]** The dataset is released.\n")
        self.assertIsNone(s["fecha_codigo"])

    def test_repo_de_url(self):
        self.assertEqual(fu.repo_de_url("https://github.com/Friedrich-M/UniMate"), "Friedrich-M/UniMate")
        self.assertEqual(fu.repo_de_url("https://github.com/a/b.git"), "a/b")
        self.assertEqual(fu.repo_de_url("http://www.github.com/a/b/tree/main/x"), "a/b")
        self.assertIsNone(fu.repo_de_url("https://gitlab.com/a/b"))
        self.assertIsNone(fu.repo_de_url(None))
        self.assertEqual(fu.enlaces_github("https://github.com/a/b y otra vez https://github.com/a/b.git y https://github.com/c/d"), ["a/b", "c/d"])



class DemoAlojada(unittest.TestCase):
    def test_una_demo_web_pendiente_no_anula_el_codigo_publicado(self):
        r = fu.senales_readme("# X\n- [x] Release inference code\n- [ ] Hugging Face demo\n\n```bash\npython infer.py --image a.png\n```\n")
        self.assertFalse(r["anuncia_pendiente"])
        self.assertTrue(r["inferencia_marcada"])

    def test_la_demo_de_inferencia_pendiente_si_cuenta(self):
        self.assertTrue(fu.pendiente_de_codigo("- [ ] Release inference demo code"))
        self.assertTrue(fu.pendiente_de_codigo("Demo coming soon"))


if __name__ == "__main__":
    unittest.main()
