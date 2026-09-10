# -*- coding: utf-8 -*-
"""Pruebas sin procesos ni red para el registro, arriendos y reparto de medios."""
import os
import sys
import unittest


DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
if DIRECTORIO not in sys.path:
    sys.path.insert(0, DIRECTORIO)

from medios import (  # noqa: E402
    area_de_tarea,
    estado_medio,
    registrar_resultado,
    repartir,
    vencer_arriendos,
)


def medio(medio_id, ahora=1_000, capacidad=1, carga=0, avance=None, areas=None):
    return {
        "id": medio_id,
        "activo": True,
        "latido": ahora,
        "avance": ahora if avance is None else avance,
        "bytes": 40,
        "capacidad": capacidad,
        "carga": carga,
        "areas": areas or ["*"],
    }


class SaludMediosTest(unittest.TestCase):
    def test_latido_vencido_desconecta_aunque_el_proceso_conste_activo(self):
        dato = medio("codex", ahora=800)
        self.assertEqual(estado_medio(dato, ahora=1_000, latido_max_s=90), "desconectado")

    def test_sin_crecer_en_bytes_durante_300_segundos_es_colgado(self):
        dato = medio("opencode", carga=1, avance=699)
        self.assertEqual(estado_medio(dato, ahora=1_000, avance_max_s=300), "colgado")

    def test_un_medio_ocioso_no_es_colgado_por_no_generar_bytes(self):
        dato = medio("ide", carga=0, avance=1)
        self.assertEqual(estado_medio(dato, ahora=1_000), "disponible")


class ArriendosTest(unittest.TestCase):
    def test_plazo_vencido_devuelve_la_tarea_a_la_cola(self):
        medios = {"codex": medio("codex")}
        vigentes, vencidos = vencer_arriendos(
            {"T1": {"medio": "codex", "vence": 999}}, medios, ahora=1_000)
        self.assertEqual(vigentes, {})
        self.assertEqual(vencidos, ["T1"])

    def test_caida_del_medio_vence_el_arriendo_antes_del_plazo(self):
        medios = {"codex": medio("codex", ahora=700)}
        arriendos = {"T1": {"medio": "codex", "vence": 2_000}}
        vigentes, vencidos = vencer_arriendos(arriendos, medios, ahora=1_000)
        self.assertEqual(vigentes, {})
        self.assertEqual(vencidos, ["T1"])

    def test_medio_colgado_pierde_el_arriendo_aunque_siga_latiendo(self):
        medios = {"opencode": medio("opencode", carga=1, avance=699)}
        arriendos = {"T1": {"medio": "opencode", "vence": 2_000}}
        vigentes, vencidos = vencer_arriendos(arriendos, medios, ahora=1_000)
        self.assertEqual(vigentes, {})
        self.assertEqual(vencidos, ["T1"])

    def test_arriendo_sano_impide_repartir_la_tarea_dos_veces(self):
        medios = {"codex": medio("codex", capacidad=2)}
        arriendos = {"T1": {"medio": "codex", "vence": 1_100}}
        plan = repartir([{"id": "T1"}], medios, arriendos, ahora=1_000)
        self.assertEqual(plan["asignaciones"], [])

    def test_tarea_recuperada_conserva_worktree_y_se_marca_para_reanudar(self):
        medios = {
            "codex": medio("codex", ahora=700),
            "opencode": medio("opencode", ahora=1_000),
        }
        arriendos = {"T1": {"medio": "codex", "vence": 2_000,
                              "worktree": "/w/T1"}}
        tarea = {"id": "T1", "worktree": "/w/T1", "archivos": ["scripts/a.py"]}
        plan = repartir([tarea], medios, arriendos, ahora=1_000)
        nueva = plan["asignaciones"][0]
        self.assertEqual(nueva["medio"], "opencode")
        self.assertEqual(nueva["worktree"], "/w/T1")
        self.assertTrue(nueva["reanudar"])


class ReorganizacionTest(unittest.TestCase):
    def test_prefiere_historial_de_exito_en_el_area(self):
        medios = {
            "codex": medio("codex", areas=["automatización"]),
            "opencode": medio("opencode", areas=["*"]),
        }
        medios["codex"]["perfil"] = "codex:local:terminal"
        historial = {
            "codex:local:terminal": {"automatización": {"exitos": 7, "fallos": 0}},
            "opencode": {"automatización": {"exitos": 1, "fallos": 4}},
        }
        tarea = {"id": "T1", "archivos": ["scripts/enjambre/a.py"]}
        plan = repartir([tarea], medios, historial=historial, ahora=1_000)
        self.assertEqual(plan["asignaciones"][0]["medio"], "codex")

    def test_respeta_capacidad_y_usa_el_siguiente_medio(self):
        medios = {
            "codex": medio("codex", capacidad=1),
            "opencode": medio("opencode", capacidad=1),
        }
        tareas = [{"id": "T1"}, {"id": "T2"}, {"id": "T3"}]
        plan = repartir(tareas, medios, ahora=1_000)
        self.assertEqual(len(plan["asignaciones"]), 2)
        self.assertEqual({a["medio"] for a in plan["asignaciones"]}, {"codex", "opencode"})

    def test_registro_malformado_no_tumba_a_los_demas_medios(self):
        medios = {"roto": medio("roto"), "codex": medio("codex")}
        medios["roto"]["capacidad"] = "ilegible"
        plan = repartir([{"id": "T1"}], medios, ahora=1_000)
        self.assertEqual(plan["asignaciones"][0]["medio"], "codex")

    def test_area_y_aprendizaje_son_estables_y_no_mutan_el_original(self):
        historial = {}
        nuevo = registrar_resultado(historial, "codex", "api", True, 120)
        self.assertEqual(area_de_tarea({"archivos": ["src/app/api/x/route.ts"]}), "api")
        self.assertEqual(historial, {})
        self.assertEqual(nuevo["codex"]["api"]["exitos"], 1)


if __name__ == "__main__":
    unittest.main()
