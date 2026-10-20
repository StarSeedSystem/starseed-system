#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas de vigias_3d.py: observar, comparar con el contrato, avisar UNA vez y dejar la tarea.
Todo con el servidor falso de falso_vigias_3d.py (respuestas reales grabadas + variantes marcadas SINTÉTICO).
Ejecutar: python3 -m pytest -q scripts/protomolecula/test_vigias_3d.py
"""
import contextlib
import io
import json
import os
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "puente"))
import vigias_3d as vg  # noqa: E402
import vigias_3d_cola as co  # noqa: E402
import vigias_3d_fuentes as fu  # noqa: E402
from falso_vigias_3d import ARXIV, HF, IDS_ARXIV, RAW, Falso, grabacion, mundo_filigree_con_codigo, mundo_linea_base, mundo_real, ok, red_caida  # noqa: E402
from vigias_3d_datos import LINEA_BASE, VIGIAS  # noqa: E402

T0 = datetime(2026, 10, 20, 12, 0, tzinfo=timezone.utc).timestamp()
HORA = 3600.0
UNI = "Friedrich-M/UniMate"


class Base(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.dir = Path(self._tmp.name)
        self.estado = self.dir / "estado" / "vigia-3d.json"
        self.olas = self.dir / "starseed_memory_root" / "olas"
        self.avisos: list[str] = []

    def avisar(self, texto):
        self.avisos.append(texto)
        return "avisado"

    def pasada(self, mundo=None, t=T0, falso=None, avisar=None, **kw):
        falso = falso or Falso(mundo if mundo is not None else mundo_real())
        self.falso = falso
        return vg.ejecutar(fu.Fuentes(get=falso, dormir=lambda s: None), self.estado, self.olas, ahora=lambda: t, avisar=avisar or self.avisar, **kw)

    def guardado(self):
        return json.loads(self.estado.read_text("utf-8"))

    def colas(self):
        """Colas vivas y, con el prefijo «propuestas/», las que esperan a Alex (fuera del enjambre)."""
        if not self.olas.exists():
            return []
        vivas = [p.name for p in self.olas.iterdir() if p.is_file()]
        prop = self.olas / "propuestas"
        return sorted(vivas + ([f"propuestas/{p.name}" for p in prop.iterdir()] if prop.is_dir() else []))


class LineaBase(Base):
    def test_el_mundo_del_contrato_no_da_novedades_ni_avisos_ni_cola(self):
        inf = self.pasada(mundo_linea_base())
        uni = inf["vigias"]["unimate"]
        self.assertEqual(uni["novedades"], [])
        self.assertEqual(self.avisos, [])
        self.assertEqual(self.colas(), [])
        o = uni["observado"]
        self.assertEqual((o["codigo_publicado"], o["licencia_pesos"], o["comando_inferencia"], o["anuncia_pendiente"]), (False, None, None, True))
        self.assertEqual(o["sondas"], {"unimate/inference/sample.py": False})
        self.assertEqual(self.guardado()["avisados"], {})  # la pasada cuenta, aunque no haya nada que avisar

    def test_la_linea_base_cubre_a_cada_vigia_y_dice_lo_que_el_contrato_dice(self):
        self.assertEqual(set(LINEA_BASE), {v.id for v in VIGIAS})
        self.assertEqual(set(co.CODIGOS), {v.id for v in VIGIAS})
        u = LINEA_BASE["unimate"]
        self.assertEqual((u["repo"], u["codigo_publicado"], u["licencia_codigo"], u["licencia_pesos"], u["modelos_hf"]), (UNI, False, "MIT", None, ["Linzhan/UniMate"]))
        for id_ in ("filigree3d", "btc3d"):
            self.assertEqual(LINEA_BASE[id_]["repo"], None)
            self.assertFalse(LINEA_BASE[id_]["codigo_publicado"])
        for v in VIGIAS:
            self.assertTrue(v.adaptador.startswith("servicios/taller-3d/motores/"))
            self.assertRegex(v.arxiv, r"^\d{4}\.\d{5}$")
        self.assertEqual(",".join(v.arxiv for v in VIGIAS), IDS_ARXIV)


class UniMateHoy(Base):
    def test_las_novedades_reales_son_el_codigo_y_la_licencia_de_los_pesos(self):
        inf = self.pasada()
        self.assertEqual([n["llave"] for n in inf["vigias"]["unimate"]["novedades"]], ["unimate:codigo=publicado", "unimate:licencia-pesos=cc-by-nc-4.0"])

    def test_lo_observado_coincide_con_las_respuestas_grabadas(self):
        o = self.pasada()["vigias"]["unimate"]["observado"]
        self.assertEqual((o["repo"], o["repo_origen"], o["repo_existe"], o["codigo_publicado"]), (UNI, "contrato", True, True))
        self.assertEqual(o["sondas"], {"unimate/inference/sample.py": True})
        self.assertEqual((o["licencia_codigo"], o["fecha_codigo"], o["licencia_pesos"], o["uso_pesos"]), ("MIT", "2026-09-06", "cc-by-nc-4.0", "no-comercial"))
        self.assertTrue(o["comando_inferencia"].startswith("python -m unimate.inference.sample"))
        self.assertEqual(o["modelos_oficiales"], ["Linzhan/UniMate"])
        self.assertEqual(o["modelos_otros"], ["tarn59/UniMate-Weights", "BasinShapers/unimate-webgpu", "mlx-community/unimate-uniml3d-f60-v3-bf16"])
        self.assertEqual((o["hf_indexado"], o["sin_datos"]), (True, []))

    def test_avisa_una_sola_vez_y_deja_la_tarea_reservada_para_alex(self):
        inf = self.pasada()
        self.assertEqual(len(self.avisos), 1)
        a = self.avisos[0]
        for trozo in ("UniMate", "código de inferencia está publicado", "python -m unimate.inference.sample", "cc-by-nc-4.0", "no-comercial",
                      "mlx-community/unimate-uniml3d-f60-v3-bf16", "VGUNIA", "PROPUESTA, sin encolar", "Para encolarla", "decide Alex", "motores.ts"):
            self.assertIn(trozo, a)
        self.assertNotIn("Lleva visto bueno humano antes de integrarse", a)  # la frase vieja prometía lo que `aprobacion: true` solo no cumple
        self.assertEqual(self.colas(), ["propuestas/cola-1020-vigia-3d-unimate.json"])  # pesos NC: no entra al enjambre sin Alex
        tarea = json.loads((self.olas / self.colas()[0]).read_text("utf-8"))[0]
        self.assertEqual((tarea["id"], tarea["aprobacion"], len(tarea["archivos"])), ("VGUNIA", True, 3))
        self.assertIn("cc-by-nc-4.0", tarea["reservada"])  # el motivo viaja con la propuesta
        self.assertEqual(co.errores_de_forma([tarea]), [])
        self.assertEqual(inf["vigias"]["unimate"]["cola"]["estado"], "propuesta")
        g = self.guardado()
        self.assertEqual(set(g["avisados"]), {"unimate:codigo=publicado", "unimate:licencia-pesos=cc-by-nc-4.0"})
        self.assertEqual(g["tareas"]["VGUNIA"]["cola"], "1020-vigia-3d-unimate")

    def test_otra_pasada_no_repite_ni_el_aviso_ni_la_tarea(self):
        self.pasada()
        self.pasada(t=T0 + 30 * HORA)
        self.pasada(t=T0 + 60 * HORA, forzar=True)
        self.assertEqual(len(self.avisos), 1)
        self.assertEqual(self.colas(), ["propuestas/cola-1020-vigia-3d-unimate.json"])

    def test_el_derivado_nuevo_no_es_una_novedad_pero_se_cita(self):
        inf = self.pasada()
        self.assertFalse([n for n in inf["vigias"]["unimate"]["novedades"] if n["clave"] in ("derivados", "pesos")])
        self.assertIn("Derivados de terceros", self.avisos[0])

    def test_la_sonda_pide_un_solo_byte_y_los_pesos_se_leen_del_modelo_oficial(self):
        self.pasada()
        sondas = [(u, c) for u, c in self.falso.vistas if u.endswith("inference/sample.py")]
        self.assertEqual(len(sondas), 1)
        self.assertEqual(sondas[0][1].get("Range"), "bytes=0-0")
        self.assertIn(f"{HF}/api/models/Linzhan/UniMate", self.falso.urls())
        self.assertFalse([u for u in self.falso.urls() if "api.github.com" in u], "la API REST de GitHub da 403: no se usa")

    def test_filigree3d_y_btc3d_sin_codigo_no_avisan_ni_crean_tarea(self):
        inf = self.pasada()
        for id_ in ("filigree3d", "btc3d"):
            fila = inf["vigias"][id_]
            o = fila["observado"]
            self.assertEqual((o["repo"], o["codigo_publicado"], o["hf_indexado"], o["sin_datos"]), (None, None, False, []))
            self.assertEqual((fila["novedades"], fila["cola"], fila["aviso"]), ([], None, None))
        self.assertFalse([a for a in self.avisos if "Filigree3D" in a or "BTC3D" in a])
        self.assertFalse([n for n in self.colas() if "filigree" in n or "btc3d" in n])

    def test_el_404_de_papers_es_no_indexado_y_no_un_fallo(self):
        o = self.pasada()["vigias"]["filigree3d"]["observado"]
        self.assertIs(o["hf_indexado"], False)
        self.assertNotIn("hf-articulo", o["sin_datos"])

    def test_el_atom_grabado_se_tolera_aunque_no_traiga_a_unimate(self):
        inf = self.pasada()
        self.assertEqual(inf["arxiv"], fu.OK)
        self.assertIsNone(inf["vigias"]["unimate"]["observado"]["articulo"])
        self.assertTrue(inf["vigias"]["filigree3d"]["observado"]["articulo"]["titulo"].startswith("FILIGREE3D"))
        self.assertEqual(inf["vigias"]["btc3d"]["observado"]["articulo"]["actualizado"], "2026-09-30")

    def test_el_429_real_de_arxiv_se_anota_y_no_cambia_el_resto(self):
        mundo = mundo_real()
        mundo[f"{ARXIV}?id_list={IDS_ARXIV}"] = (429, {}, grabacion("arxiv-429.txt"))
        inf = self.pasada(mundo)
        self.assertEqual(inf["arxiv"], fu.SIN_DATOS)
        for v in inf["vigias"].values():
            self.assertIn("arxiv", v["observado"]["sin_datos"])
        self.assertEqual(len(inf["vigias"]["unimate"]["novedades"]), 2)
        self.assertEqual(len(self.avisos), 1)

    def test_solo_observa_a_quien_se_pide(self):
        mundo = mundo_real()
        mundo[f"{ARXIV}?id_list=2609.39709"] = ok(grabacion("arxiv-atom.xml"))
        inf = self.pasada(mundo, solo={"btc3d"})
        self.assertEqual(list(inf["vigias"]), ["btc3d"])
        self.assertFalse([u for u in self.falso.urls() if "UniMate" in u or "2609.05415" in u])


class SinDatos(Base):
    def test_con_la_red_caida_no_se_inventa_nada(self):
        inf = self.pasada(falso=red_caida())
        for id_, fila in inf["vigias"].items():
            o = fila["observado"]
            self.assertEqual((fila["novedades"], fila["cola"], fila["aviso"]), ([], None, None), id_)
            self.assertIsNone(o["hf_indexado"], id_)
            self.assertIsNone(o["codigo_publicado"], id_)
            self.assertIsNone(o["licencia_pesos"], id_)
            self.assertIn("hf-articulo", o["sin_datos"], id_)
        self.assertEqual(self.avisos, [])
        self.assertEqual(self.colas(), [])
        self.assertFalse(self.estado.exists(), "una pasada sin ningún dato no cuenta: se reintenta pronto")
        self.assertIn("sin datos", vg.resumen(inf))

    def test_la_red_caida_no_borra_lo_ya_avisado_ni_cierra_la_guarda(self):
        self.pasada()
        antes = self.guardado()
        self.pasada(falso=red_caida(), t=T0 + 25 * HORA)
        self.assertEqual(self.guardado(), antes)
        self.pasada(t=T0 + 26 * HORA)  # vuelve la red: no repite
        self.assertEqual(len(self.avisos), 1)

    def test_una_pasada_sin_datos_no_impide_la_siguiente(self):
        self.pasada(falso=red_caida())
        inf = self.pasada(t=T0 + 1 * HORA)
        self.assertNotIn("omitida", inf)
        self.assertEqual(len(self.avisos), 1)

    def test_un_dato_sin_leer_no_es_una_diferencia(self):
        mundo = mundo_real()
        mundo[f"{RAW}/{UNI}/main/LICENSE"] = (503, {}, "")
        inf = self.pasada(mundo)
        o = inf["vigias"]["unimate"]["observado"]
        self.assertIsNone(o["licencia_codigo"])
        self.assertIn("licencia", o["sin_datos"])
        self.assertNotIn("licencia-codigo", [n["clave"] for n in inf["vigias"]["unimate"]["novedades"]])

    def test_una_sonda_sin_respuesta_no_es_un_no_es_un_no_se(self):
        mundo = mundo_real()
        mundo[f"{RAW}/{UNI}/main/README.md"] = ok("# UniMate\n\nSolo una descripcion.\n")
        mundo[f"{RAW}/{UNI}/main/unimate/inference/sample.py"] = (503, {}, "")
        o = self.pasada(mundo)["vigias"]["unimate"]["observado"]
        self.assertIsNone(o["codigo_publicado"])
        self.assertEqual(o["sondas"], {"unimate/inference/sample.py": None})
        self.assertNotIn("unimate:codigo=publicado", self.guardado()["avisados"])

    def test_el_repo_sin_readme_ni_sonda_dice_que_no_hay_codigo(self):
        mundo = mundo_real()
        for ruta in ("README.md", "unimate/inference/sample.py"):
            mundo[f"{RAW}/{UNI}/main/{ruta}"] = (404, {}, "")
            mundo[f"{RAW}/{UNI}/master/{ruta}"] = (404, {}, "")
        o = self.pasada(mundo)["vigias"]["unimate"]["observado"]
        self.assertEqual((o["repo_existe"], o["codigo_publicado"]), (False, False))


class Guarda(Base):
    def test_una_pasada_cada_veinte_horas_con_reloj_inyectado(self):
        self.pasada()
        self.assertGreater(len(self.falso.vistas), 0)
        inf = self.pasada(t=T0 + 3 * HORA)  # `pasada` prepara un servidor falso nuevo: si lo llamaran, tendría vistas
        self.assertIn("omitida", inf)
        self.assertEqual(self.falso.vistas, [], "una pasada omitida no toca la red")
        self.assertIn("Vigía 3D: ya se vigiló", vg.resumen(inf))
        inf = self.pasada(t=T0 + 21 * HORA)
        self.assertNotIn("omitida", inf)
        self.assertGreater(len(self.falso.vistas), 0)

    def test_forzar_ignora_la_guarda(self):
        self.pasada()
        self.assertNotIn("omitida", self.pasada(t=T0 + HORA, forzar=True))

    def test_el_estado_dice_cuando_fue_la_ultima_pasada(self):
        self.pasada()
        self.assertEqual(self.guardado()["ultima_pasada"], "2026-10-20T12:00:00Z")


class EnSeco(Base):
    def test_en_seco_mira_la_red_y_no_escribe_nada(self):
        inf = self.pasada(en_seco=True)
        self.assertFalse(self.estado.parent.exists())
        self.assertFalse(self.dir.joinpath("starseed_memory_root").exists())
        self.assertEqual(self.avisos, [])
        uni = inf["vigias"]["unimate"]
        self.assertEqual((uni["cola"]["estado"], uni["cola"]["escrita"]), ("propuesta", False))  # lo que HARÍA, sin escribir
        self.assertTrue(uni["aviso"].startswith("en seco:"))
        self.assertEqual(len(uni["novedades"]), 2)
        self.assertGreater(len(self.falso.vistas), 0)
        self.assertFalse(inf["escrito"])

    def test_en_seco_ignora_la_guarda_y_no_la_mueve(self):
        self.pasada()
        antes = self.guardado()
        inf = self.pasada(t=T0 + HORA, en_seco=True)
        self.assertNotIn("omitida", inf)
        self.assertEqual(self.guardado(), antes)


class AvisoQueFalla(Base):
    def test_si_el_chat_falla_no_se_marca_nada_y_se_reintenta_sin_duplicar_la_tarea(self):
        inf = self.pasada(avisar=lambda t: "no pude avisar (OSError)")
        self.assertEqual(inf["vigias"]["unimate"]["aviso"], "no pude avisar (OSError)")
        self.assertEqual(self.guardado()["avisados"], {})
        self.assertEqual(self.colas(), ["propuestas/cola-1020-vigia-3d-unimate.json"])
        self.pasada(t=T0 + 25 * HORA)
        self.assertEqual(len(self.avisos), 1)
        # El aviso que llega trae la orden de encolar: si no, Alex nunca sabría que la propuesta existe.
        self.assertIn("sigue PROPUESTA", self.avisos[0])
        self.assertIn("Para encolarla: mv -n ", self.avisos[0])
        self.assertEqual(self.colas(), ["propuestas/cola-1020-vigia-3d-unimate.json"])
        self.assertEqual(len(self.guardado()["avisados"]), 2)

    def test_una_cola_invalida_avisa_con_su_causa_y_no_da_la_novedad_por_avisada(self):
        """El gancho diario no imprime el informe en ningún sitio: sin este aviso el fallo se repetiría cada día en silencio."""
        invalida = {"estado": "invalida", "cola": None, "tarea": "VGUNIA", "motivo": "id duplicado en otra cola"}
        with mock.patch.object(vg, "crear_cola", return_value=invalida):
            inf = self.pasada()
            self.assertEqual(inf["vigias"]["unimate"]["aviso"], "avisado")
            self.assertEqual(len(self.avisos), 1)
            self.assertIn("No se pudo crear la tarea: id duplicado en otra cola", self.avisos[0])
            self.assertIn("próxima pasada", self.avisos[0])
            self.assertEqual(self.guardado()["avisados"], {})  # sin marcar: la causa sigue a la vista
            self.assertEqual(self.guardado()["tareas"], {})
            self.assertEqual(self.colas(), [])
            self.pasada(t=T0 + 25 * HORA)  # sigue inválida: se vuelve a avisar, no se calla
            self.assertEqual(len(self.avisos), 2)
        self.pasada(t=T0 + 50 * HORA)  # arreglada la causa: la tarea se crea y ahora sí queda avisado
        self.assertEqual(self.colas(), ["propuestas/cola-1022-vigia-3d-unimate.json"])  # la cola se nombra por el día de la pasada que la crea
        self.assertNotIn("No se pudo crear", self.avisos[-1])
        self.assertEqual(len(self.guardado()["avisados"]), 2)

    def test_una_cola_invalida_en_seco_no_escribe_ni_avisa(self):
        invalida = {"estado": "invalida", "cola": None, "tarea": "VGUNIA", "motivo": "x"}
        with mock.patch.object(vg, "crear_cola", return_value=invalida):
            inf = self.pasada(en_seco=True)
        self.assertTrue(inf["vigias"]["unimate"]["aviso"].startswith("en seco:"))
        self.assertEqual((self.avisos, self.colas()), ([], []))
        self.assertFalse(self.estado.exists())

    def test_una_tarea_ya_recordada_no_se_recrea_aunque_se_retire_su_cola(self):
        self.pasada()
        (self.olas / "propuestas" / "cola-1020-vigia-3d-unimate.json").unlink()
        self.estado.write_text(json.dumps({**self.guardado(), "avisados": {}}), "utf-8")
        self.pasada(t=T0 + 25 * HORA)
        self.assertEqual(self.colas(), [])
        self.assertIn("ya constaba", self.avisos[-1])


class Sinteticos(Base):
    """SINTÉTICO: el día que Filigree3D publique código (ver mundo_filigree_con_codigo)."""

    def test_filigree_con_codigo_y_pesos_apache_crea_tarea_sin_visto_bueno(self):
        mundo = mundo_filigree_con_codigo("apache-2.0")
        mundo[f"{ARXIV}?id_list=2609.34900"] = ok(grabacion("arxiv-atom.xml"))
        inf = self.pasada(mundo, solo={"filigree3d"})
        o = inf["vigias"]["filigree3d"]["observado"]
        self.assertEqual((o["repo"], o["repo_origen"], o["codigo_publicado"], o["licencia_codigo"], o["uso_pesos"]), ("ejemplo/filigree3d", "huggingface", True, "Apache-2.0", "libre"))
        self.assertEqual(o["modelos_oficiales"], ["ejemplo/filigree3d-pesos"])
        self.assertEqual([n["clave"] for n in inf["vigias"]["filigree3d"]["novedades"]], ["repo", "codigo", "licencia-codigo", "pesos", "licencia-pesos"])
        tarea = json.loads((self.olas / "cola-1020-vigia-3d-filigree3d.json").read_text("utf-8"))[0]
        self.assertEqual(tarea["id"], "VGFILA")
        self.assertNotIn("aprobacion", tarea)
        self.assertNotIn("reservada", tarea)  # pesos Apache: nada que reservar, la decide el aprobador como cualquier otra
        self.assertIn("python infer.py --image foto.png", tarea["prompt"])
        self.assertEqual(len(self.avisos), 1)

    def test_filigree_con_codigo_y_sin_pesos_pide_visto_bueno(self):
        mundo = mundo_filigree_con_codigo(None)
        mundo[f"{ARXIV}?id_list=2609.34900"] = ok(grabacion("arxiv-atom.xml"))
        self.pasada(mundo, solo={"filigree3d"})
        self.assertEqual(self.colas(), ["propuestas/cola-1020-vigia-3d-filigree3d.json"])  # sin licencia leída: propuesta
        tarea = json.loads((self.olas / "propuestas" / "cola-1020-vigia-3d-filigree3d.json").read_text("utf-8"))[0]
        self.assertTrue(tarea["aprobacion"])
        self.assertIn("no se pudo leer la licencia", tarea["reservada"])
        self.assertIn("licencia_pesos: null", tarea["prompt"])

    # README reales del revisor: el vigía debe avisar y crear la tarea justo cuando publican la inferencia.
    def _filigree_con_readme(self, readme, licencia="apache-2.0", t=T0):
        mundo = mundo_filigree_con_codigo(licencia)
        mundo[f"{RAW}/ejemplo/filigree3d/main/README.md"] = ok(readme)
        mundo[f"{ARXIV}?id_list=2609.34900"] = ok(grabacion("arxiv-atom.xml"))
        return self.pasada(mundo, solo={"filigree3d"}, t=t)["vigias"]["filigree3d"]

    def test_readme_con_inferencia_marcada_y_entrenamiento_pendiente_crea_la_tarea(self):
        fila = self._filigree_con_readme("# Filigree3D\n- [x] Release inference code\n- [ ] Release training code\n\n```bash\npython infer.py --image foto.png\n```\n")
        o = fila["observado"]
        self.assertEqual((o["codigo_publicado"], o["contradiccion"], o["inferencia_marcada"], o["anuncia_pendiente"]), (True, False, True, False))
        self.assertIn("codigo", [n["clave"] for n in fila["novedades"]])
        self.assertEqual(fila["cola"]["estado"], "creada")
        self.assertIn("python infer.py --image foto.png", self.avisos[0])

    def test_todo_suelto_y_training_code_will_be_released_junto_a_un_comando_real_crea_la_tarea(self):
        fila = self._filigree_con_readme("# Filigree3D\nTODO\nTraining code will be released.\n\n    python infer.py --image foto.png\n")
        self.assertEqual((fila["observado"]["codigo_publicado"], fila["cola"]["estado"]), (True, "creada"))

    def test_si_las_senales_se_contradicen_se_dice_con_el_comando_y_no_se_crea_la_tarea(self):
        fila = self._filigree_con_readme("# Filigree3D\nInference code coming soon.\n\n```bash\npython infer.py --image foto.png\n```\n")
        o = fila["observado"]
        self.assertEqual((o["codigo_publicado"], o["contradiccion"]), (None, True))
        self.assertEqual([n["clave"] for n in fila["novedades"]], ["repo", "codigo-dudoso", "licencia-codigo", "pesos", "licencia-pesos"])
        self.assertIsNone(fila["cola"])
        self.assertEqual(self.colas(), [])
        self.assertEqual(len(self.avisos), 1)
        for trozo in ("señales contradictorias", "python infer.py --image foto.png", "Inference code coming soon", "No se crea la tarea"):
            self.assertIn(trozo, self.avisos[0])
        # y no se repite cada día
        mundo = mundo_filigree_con_codigo("apache-2.0")
        mundo[f"{RAW}/ejemplo/filigree3d/main/README.md"] = ok("# Filigree3D\nInference code coming soon.\n\n```bash\npython infer.py --image foto.png\n```\n")
        mundo[f"{ARXIV}?id_list=2609.34900"] = ok(grabacion("arxiv-atom.xml"))
        self.pasada(mundo, solo={"filigree3d"}, t=T0 + 30 * HORA)
        self.assertEqual(len(self.avisos), 1)

    def test_aclarada_la_contradiccion_crea_la_tarea_en_la_pasada_siguiente(self):
        self._filigree_con_readme("# Filigree3D\nInference code coming soon.\n\n```bash\npython infer.py --image foto.png\n```\n")
        fila = self._filigree_con_readme("# Filigree3D\n\n```bash\npython infer.py --image foto.png\n```\n", t=T0 + 30 * HORA)
        self.assertEqual(len(self.avisos), 2)
        self.assertEqual(fila["cola"]["estado"], "creada")

    def test_un_comando_que_no_es_de_inferencia_no_crea_una_tarea_falsa(self):
        fila = self._filigree_con_readme("# Filigree3D\n\n```bash\npython -m pytest tests/\npython run_training.py\npython generate_data.py\n```\n")
        o = fila["observado"]
        self.assertEqual((o["comando_inferencia"], o["codigo_publicado"]), (None, False))
        self.assertIsNone(fila["cola"])

    def test_un_repo_nuevo_sin_codigo_avisa_pero_no_crea_tarea(self):
        mundo = mundo_filigree_con_codigo(None)
        mundo[f"{RAW}/ejemplo/filigree3d/main/README.md"] = ok("# Filigree3D\n\nCode coming soon.\n")
        mundo[f"{ARXIV}?id_list=2609.34900"] = ok(grabacion("arxiv-atom.xml"))
        inf = self.pasada(mundo, solo={"filigree3d"})
        fila = inf["vigias"]["filigree3d"]
        self.assertEqual([n["clave"] for n in fila["novedades"]], ["repo", "licencia-codigo"])
        self.assertIsNone(fila["cola"])
        self.assertEqual(len(self.avisos), 1)
        self.assertEqual(self.colas(), [])
        self.assertIn("ya tiene repositorio", self.avisos[0])

    def test_un_repo_citado_en_el_resumen_de_arxiv_se_usa_si_hf_no_lo_conoce(self):
        atom = ('<feed xmlns="http://www.w3.org/2005/Atom"><entry><id>http://arxiv.org/abs/2609.34900v1</id><title>FILIGREE3D</title>'
                "<updated>2026-10-01T00:00:00Z</updated><summary>Code: https://github.com/ejemplo/filigree3d</summary></entry></feed>")
        mundo = mundo_real()
        mundo[f"{ARXIV}?id_list=2609.34900"] = ok(atom)
        mundo[f"{RAW}/ejemplo/filigree3d/main/README.md"] = ok("# Filigree3D\n")
        mundo[f"{RAW}/ejemplo/filigree3d/main/LICENSE"] = (404, {}, "")
        mundo[f"{RAW}/ejemplo/filigree3d/master/LICENSE"] = (404, {}, "")
        inf = self.pasada(mundo, solo={"filigree3d"})
        fila = inf["vigias"]["filigree3d"]
        o = fila["observado"]
        self.assertEqual((o["repo"], o["repo_origen"], o["repo_existe"], o["codigo_publicado"]), ("ejemplo/filigree3d", "arxiv", True, False))
        self.assertEqual([n["clave"] for n in fila["novedades"]], ["repo"])
        self.assertIsNone(fila["cola"])


class AvisoAlChat(unittest.TestCase):
    def test_publica_en_el_chat_director_como_aviso_del_vigia(self):
        import director_chat

        with tempfile.TemporaryDirectory() as tmp, mock.patch.dict(os.environ, {"STARSEED_ROOT": tmp}):
            self.assertEqual(vg.avisar_al_chat("Vigía 3D · prueba"), "avisado")
            mensajes = director_chat.leer(raiz=tmp)
        self.assertEqual(len(mensajes), 1)
        self.assertEqual((mensajes[0]["de"], mensajes[0]["rol"], mensajes[0]["tipo"], mensajes[0]["texto"]), ("vigia-3d", "director", "aviso", "Vigía 3D · prueba"))

    def test_si_el_chat_falla_devuelve_el_motivo_y_no_lanza(self):
        import director_chat

        with mock.patch.object(director_chat, "publicar", side_effect=RuntimeError("chat caído")):
            self.assertEqual(vg.avisar_al_chat("x"), "no pude avisar (RuntimeError)")


class Linea(Base):
    def correr(self, *args, mundo=None):
        falso = Falso(mundo if mundo is not None else mundo_real())
        salida = io.StringIO()
        with mock.patch.object(vg, "Fuentes", lambda pausa=0.4: fu.Fuentes(get=falso, dormir=lambda s: None, pausa=pausa)), contextlib.redirect_stdout(salida):
            rc = vg.main([*args, "--estado", str(self.estado), "--olas", str(self.olas)], ahora=lambda: T0)  # reloj fijo: el nombre de la cola sale de la fecha
        return rc, salida.getvalue()

    def test_en_seco_imprime_el_resumen_y_no_escribe(self):
        rc, texto = self.correr("--en-seco")
        self.assertEqual(rc, 0)
        self.assertIn("unimate: código publicado", texto)
        self.assertIn("filigree3d: sin repositorio público", texto)
        self.assertIn("cola: propuesta 1020-vigia-3d-unimate", texto)
        self.assertFalse(self.estado.exists())
        self.assertEqual(self.colas(), [])

    def test_el_nombre_de_la_cola_sale_del_reloj_que_se_le_pasa_y_no_de_hoy(self):
        """Antes la prueba dependía de que fuese 20 de octubre: de otro día el nombre cambia."""
        otro_dia = datetime(2026, 12, 3, 8, 0, tzinfo=timezone.utc).timestamp()
        falso = Falso(mundo_real())
        salida = io.StringIO()
        with mock.patch.object(vg, "Fuentes", lambda pausa=0.4: fu.Fuentes(get=falso, dormir=lambda s: None, pausa=pausa)), contextlib.redirect_stdout(salida):
            vg.main(["--en-seco", "--estado", str(self.estado), "--olas", str(self.olas)], ahora=lambda: otro_dia)
        self.assertIn("cola: propuesta 1203-vigia-3d-unimate", salida.getvalue())

    def test_json_imprime_el_informe_entero(self):
        rc, texto = self.correr("--en-seco", "--json", "--solo", "unimate", mundo={**mundo_real(), f"{ARXIV}?id_list=2609.05415": ok(grabacion("arxiv-atom.xml"))})
        self.assertEqual(rc, 0)
        informe = json.loads(texto)
        self.assertEqual(list(informe["vigias"]), ["unimate"])
        self.assertEqual(informe["vigias"]["unimate"]["observado"]["licencia_pesos"], "cc-by-nc-4.0")


if __name__ == "__main__":
    unittest.main()
