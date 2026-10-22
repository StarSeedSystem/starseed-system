# -*- coding: utf-8 -*-
"""Pruebas del líder de colmena (COL1012G): relevo de las tareas de un aparato que se fue.

Bus y reloj falsos: el enlace apunta en memoria las órdenes firmadas, las asignaciones y las
decisiones; el líder es un `Nodo` real con las colas inyectadas. Nada toca la red ni el disco.
"""
import os
import sys
import unittest

DIR = os.path.dirname(os.path.abspath(__file__))
if DIR not in sys.path:
    sys.path.insert(0, DIR)

import nodo_metagenesis as N  # noqa: E402

AHORA = 1_800_000_000.0
SECRETO = "s" * 48


class EnlaceFalso:
    """Lo justo del bus para el relevo: órdenes, asignaciones, decisiones y colas portables."""

    modo = "bus"

    def __init__(self):
        self.ordenes = []
        self.asignaciones = []
        self.decisiones = []
        self.colas = []

    def asignar(self, ids, nodo, ts):
        self.asignaciones.append({"ids": list(ids), "nodo": nodo, "a": nodo, "ts": ts})
        return True

    def decision(self, d):
        self.decisiones.append(dict(d))
        return True

    def orden(self, o):
        self.ordenes.append(o)
        return True

    def ultimas_colas(self):
        return list(self.colas)


def nodo_lider(enlace, tareas=()):
    n = N.Nodo(seco=False, sin_red=True, env={"STARSEED_LANZADOR_SECRETO": SECRETO},
               medir=lambda modo, t: {}, ejecutar=lambda *a: ("hecha", "ok"),
               reloj=lambda: AHORA, memoria={"hecho": {}, "nonces": {}, "decisiones": [],
                                             "autonomia": True},
               persistir=False, huella="huella-lider", candidatos=lambda raiz: list(tareas))
    n.yo, n.modo, n.secreto, n.enlace = "mac-1", "real", SECRETO, enlace
    return n


def latido(nodo, ts, medio, en_curso=(), agentes=2, periodo=300):
    return {"nodo": nodo, "ts": ts, "medio": medio, "modo": "real",
            "salud": {"periodo_s": periodo, "en_curso": list(en_curso),
                      "contenedor": {"activo": True, "agentes": agentes},
                      "trabajo": {"en_curso": len(en_curso)}}}


def punto(rama, sha="abc1234", t=AHORA - 400):
    return {"rama": rama, "sha": sha, "t": t}


def tarea(tid="T1", privado=False):
    t = {"id": tid, "titulo": "Tarea %s" % tid, "prompt": "Haz %s con cuidado." % tid,
         "archivos": ["scripts/puente/nodo_metagenesis.py"]}
    if privado:
        t["privado"] = True
    return t


class EntradasDelBus(unittest.TestCase):
    def test_lee_en_curso_y_periodo_dentro_de_salud_y_expande_asignaciones(self):
        nov = {"latidos": [latido("mac-1", AHORA - 30, "mac", [{"id": "A1", "fase": "escribiendo"}]),
                           {"nodo": "a1", "ts": AHORA - 20, "medio": "oracle-a1", "modo": "real",
                            "salud": {"periodo_s": 600}}],
               "bajas": [{"nodo": "mac-1", "ts": AHORA - 5, "traspaso": True}],
               "asignaciones": [{"nodo": "a1", "ids": ["A1b", "A1"], "ts": AHORA - 10}]}
        vivos = {n["nodo"]: n for n in nov["latidos"]}
        d = N.entradas_de_relevo(nov, vivos)
        self.assertEqual(d["latidos"]["mac-1"]["en_curso"][0]["id"], "A1")
        self.assertEqual(d["latidos"]["a1"]["periodo_s"], 600.0)
        self.assertEqual(set(d["asignadas"]), {"A1", "A1b"})
        self.assertEqual(d["asignadas"]["A1"]["a"], "a1")
        self.assertTrue(d["bajas"]["mac-1"]["traspaso"])
        self.assertEqual(d["ocupados"]["mac-1"], 1)


class RelevoDelLider(unittest.TestCase):
    def test_mac_se_desconecta_avisando_y_su_tarea_sigue_en_el_a1(self):
        enlace = EnlaceFalso()
        n = nodo_lider(enlace, [tarea("T1")])
        nov = {"latidos": [latido("mac-1", AHORA - 3600, "mac",
                                  [{"id": "T1", "fase": "escribiendo",
                                    "punto": punto("relevo/mac-1/T1")}]),
                           latido("a1", AHORA - 30, "oracle-a1")],
               "bajas": [{"nodo": "mac-1", "ts": AHORA - 5, "traspaso": True}],
               "asignaciones": []}
        vivos = {n["nodo"]: n for n in nov["latidos"]}
        informe = {"acciones": [], "ordenes": [], "avisos": []}
        n._relevar(nov, vivos, "/no/existe", informe, AHORA)
        self.assertEqual(len(enlace.ordenes), 1)
        orden = enlace.ordenes[0]
        self.assertEqual(orden["accion"], "lanzar_cola")
        self.assertEqual(orden["para"], "a1")
        sucesora = orden["tareas"][0]
        self.assertEqual(sucesora["id"], "T1b")
        self.assertEqual(sucesora["rama_nube"], "relevo/mac-1/T1")
        self.assertIn("Haz T1", sucesora["prompt"])
        self.assertIn("abc1234", sucesora["prompt"])
        ids = {i for a in enlace.asignaciones for i in a["ids"]}
        self.assertEqual(ids, {"T1", "T1b"})
        d = informe["relevo"][0]
        self.assertEqual((d["de"], d["a"], d["id"]), ("mac-1", "a1", "T1"))
        self.assertIn("min perdidos", d["motivo"])
        self.assertTrue(enlace.decisiones)
        # La segunda vuelta no repite la orden mientras la asignación siga vigente.
        n._relevar(nov, vivos, "/no/existe", informe, AHORA + 120)
        self.assertEqual(len(enlace.ordenes), 1)

    def test_un_a1_que_calla_20_min_se_releva_sin_baja(self):
        enlace = EnlaceFalso()
        n = nodo_lider(enlace, [tarea("T2")])
        a1 = latido("a1", AHORA - 1200, "oracle-a1",
                    [{"id": "T2", "fase": "tsc", "punto": punto("relevo/a1/T2", "def5678")}])
        nov = {"latidos": [a1, latido("mac-1", AHORA - 30, "mac")], "bajas": [], "asignaciones": []}
        vivos = {x["nodo"]: x for x in nov["latidos"]}
        informe = {"acciones": [], "ordenes": [], "avisos": []}
        n._relevar(nov, vivos, "/no/existe", informe, AHORA)
        self.assertEqual(enlace.ordenes[0]["para"], "mac-1")
        self.assertEqual(enlace.ordenes[0]["tareas"][0]["rama_nube"], "relevo/a1/T2")
        self.assertEqual(informe["relevo"][0]["de"], "a1")

    def test_tarea_privada_no_va_a_la_nube_compartida(self):
        enlace = EnlaceFalso()
        n = nodo_lider(enlace, [tarea("P1", privado=True)])
        nov = {"latidos": [latido("mac-1", AHORA - 3600, "mac",
                                  [{"id": "P1", "fase": "escribiendo", "punto": punto("relevo/mac-1/P1")}]),
                           latido("gh", AHORA - 30, "gh-actions", agentes=4)],
               "bajas": [{"nodo": "mac-1", "ts": AHORA - 5, "traspaso": True}],
               "asignaciones": []}
        vivos = {x["nodo"]: x for x in nov["latidos"]}
        informe = {"acciones": [], "ordenes": [], "avisos": []}
        n._relevar(nov, vivos, "/no/existe", informe, AHORA)
        self.assertEqual(enlace.ordenes, [])
        self.assertIsNone(informe["relevo"][0]["a"])
        self.assertIn("espera", informe["relevo"][0]["resultado"])
        # La misma espera no se anota dos veces (una decisión por tarea).
        n._relevar(nov, vivos, "/no/existe", informe, AHORA + 120)
        self.assertEqual(len(informe["relevo"]), 1)

    def test_sin_metadatos_tampoco_adivina_y_espera(self):
        enlace = EnlaceFalso()
        n = nodo_lider(enlace, [])
        nov = {"latidos": [latido("mac-1", AHORA - 3600, "mac",
                                  [{"id": "X1", "fase": "escribiendo", "punto": punto("relevo/mac-1/X1")}]),
                           latido("gh", AHORA - 30, "gh-actions", agentes=4)],
               "bajas": [{"nodo": "mac-1", "ts": AHORA - 5, "traspaso": True}],
               "asignaciones": []}
        vivos = {x["nodo"]: x for x in nov["latidos"]}
        informe = {"acciones": [], "ordenes": [], "avisos": []}
        n._relevar(nov, vivos, "/no/existe", informe, AHORA)
        self.assertEqual(enlace.ordenes, [])

    def test_si_la_orden_no_sale_no_se_marca_como_seguida(self):
        enlace = EnlaceFalso()
        n = nodo_lider(enlace, [tarea("T4")])
        n.secreto = ""  # sin secreto no se puede firmar la orden
        nov = {"latidos": [latido("mac-1", AHORA - 3600, "mac",
                                  [{"id": "T4", "fase": "escribiendo", "punto": punto("relevo/mac-1/T4")}]),
                           latido("a1", AHORA - 30, "oracle-a1")],
               "bajas": [{"nodo": "mac-1", "ts": AHORA - 5, "traspaso": True}],
               "asignaciones": []}
        vivos = {x["nodo"]: x for x in nov["latidos"]}
        informe = {"acciones": [], "ordenes": [], "avisos": []}
        n._relevar(nov, vivos, "/no/existe", informe, AHORA)
        self.assertEqual(enlace.asignaciones, [])
        self.assertNotIn("T4", n.mem.get("relevo") or {})
        self.assertIn("se reintenta", informe["relevo"][0]["resultado"])

    def test_sin_punto_de_control_la_tarea_vuelve_a_la_cola_tal_cual(self):
        enlace = EnlaceFalso()
        original = tarea("T3")
        n = nodo_lider(enlace, [original])
        nov = {"latidos": [latido("mac-1", AHORA - 3600, "mac", [{"id": "T3", "fase": "escribiendo"}]),
                           latido("a1", AHORA - 30, "oracle-a1")],
               "bajas": [{"nodo": "mac-1", "ts": AHORA - 5, "traspaso": True}],
               "asignaciones": []}
        vivos = {x["nodo"]: x for x in nov["latidos"]}
        informe = {"acciones": [], "ordenes": [], "avisos": []}
        n._relevar(nov, vivos, "/no/existe", informe, AHORA)
        enviada = enlace.ordenes[0]["tareas"][0]
        self.assertEqual(enviada["id"], "T3")
        self.assertEqual(enviada["prompt"], original["prompt"])
        self.assertNotIn("rama_nube", enviada)
        self.assertIn("vuelve a la cola", informe["relevo"][0]["resultado"])
