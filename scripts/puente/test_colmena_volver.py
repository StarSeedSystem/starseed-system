# -*- coding: utf-8 -*-
"""Pruebas de «al volver» (COL1012H): el aparato suelta lo que otro siguió mientras estaba fuera.

Disco y bus falsos: un directorio temporal con `olas/latidos-<cola>.json` y un `nov` que imita
las asignaciones del bus. Nada toca la red, ni git, ni el A1 de verdad.
"""
import json
import os
import shutil
import sys
import tempfile
import types
import unittest
from unittest.mock import patch

DIR = os.path.dirname(os.path.abspath(__file__))
if DIR not in sys.path:
    sys.path.insert(0, DIR)

import nodo_metagenesis as N  # noqa: E402

AHORA = 1_800_000_000.0


def sembrar_latidos(raiz, cola, tareas):
    """Deja el latido de un orquestador falso y devuelve su carpeta `olas/`."""
    olas = os.path.join(raiz, "starseed_memory_root", "olas")
    os.makedirs(olas, exist_ok=True)
    with open(os.path.join(olas, "latidos-" + cola), "w", encoding="utf-8") as f:
        json.dump({"tareas": tareas}, f)
    return olas


def nov_con_asignaciones(*pares):
    """`nov` del bus con una asignación por (id, destino, ts)."""
    return {"asignaciones": [{"ids": [tid], "nodo": destino, "a": destino, "ts": ts}
                             for tid, destino, ts in pares]}


class PuntosFalso:
    """Registra qué se pidió enviar y qué había en el control EN ESE MOMENTO."""

    def __init__(self, archivo=None, falla=False):
        self.archivo = archivo
        self.falla = falla
        self.llamadas = []
        self.control_al_enviar = None

    def __call__(self, tids, raiz):
        if self.archivo and os.path.exists(self.archivo):
            with open(self.archivo, encoding="utf-8") as f:
                self.control_al_enviar = json.load(f)
        self.llamadas.append((list(tids), raiz))
        if self.falla:
            raise RuntimeError("sin red")
        return {"ok": True}


def nodo_volver(raiz, colas, enviar):
    n = N.Nodo(seco=False, sin_red=True, memoria={"hecho": {}, "nonces": {}, "decisiones": []},
               persistir=False, huella="huella-volver", colas=lambda: list(colas),
               enviar_puntos=enviar, cerrojos=os.path.join(raiz, "cerrojos"))
    n.yo, n.modo = "mac-1", "real"
    return n


class TestTocaAlVolver(unittest.TestCase):
    def test_solo_tras_mas_de_silencio_max(self):
        # 300 s de periodo → silencio_max = max(3 × 300, 900) = 900 s.
        self.assertFalse(N.toca_al_volver(AHORA - 800, AHORA, 300))
        self.assertTrue(N.toca_al_volver(AHORA - 901, AHORA, 300))
        # 600 s de periodo → 1800 s; el freno de consumo no acorta la espera.
        self.assertFalse(N.toca_al_volver(AHORA - 1000, AHORA, 600))
        self.assertTrue(N.toca_al_volver(AHORA - 1801, AHORA, 600))
        # Sin latido guardado (arranque con memoria perdida) cuenta como vuelta.
        self.assertTrue(N.toca_al_volver(0, AHORA, 300))


class TestTareasEnCursoPorCola(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="volver-mapa-")
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)

    def test_mapea_cada_tarea_a_su_cola_y_ignora_las_hechas(self):
        sembrar_latidos(self.tmp, "cola-a.json", {"T1": {"fase": "escribiendo"}, "T2": {"fase": "hecho"}})
        sembrar_latidos(self.tmp, "cola-b.json", {"T3": {"fase": "tsc"}, "T1": {"fase": "completando"}})
        m = N.tareas_en_curso_por_cola(self.tmp, ["cola-a.json", "cola-b.json"])
        # T1 se queda con la primera cola donde apareció: una tarea no se suelta dos veces.
        self.assertEqual(m, {"T1": "cola-a.json", "T3": "cola-b.json"})

    def test_una_cola_ilegible_no_tumba_las_demas(self):
        olas = sembrar_latidos(self.tmp, "cola-a.json", {"T1": {"fase": "escribiendo"}})
        with open(os.path.join(olas, "latidos-cola-b.json"), "w", encoding="utf-8") as f:
            f.write("{")
        m = N.tareas_en_curso_por_cola(self.tmp, ["cola-a.json", "cola-b.json", "no-existe.json"])
        self.assertEqual(m, {"T1": "cola-a.json"})


class TestAlVolver(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="volver-")
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)
        self.olas = sembrar_latidos(self.tmp, "cola-a.json", {
            "T1": {"fase": "escribiendo"}, "T2": {"fase": "escribiendo"}, "T3": {"fase": "hecho"}})
        self.ruta = os.path.join(self.olas, "control-cola-a.json")

    def test_suelta_lo_que_otro_siguio_y_sube_el_punto_antes(self):
        puntos = PuntosFalso(self.ruta)
        n = nodo_volver(self.tmp, ["cola-a.json"], puntos)
        nov = nov_con_asignaciones(("T1", "a1", AHORA - 10), ("T2", "mac-1", AHORA - 10),
                                   ("T3", "a1", AHORA - 10))
        informe = {"acciones": [], "ordenes": [], "avisos": []}
        n._al_volver(nov, self.tmp, informe, AHORA, AHORA - 1000)
        self.assertEqual(puntos.llamadas, [(["T1"], self.tmp)])
        # El punto salió ANTES de escribir la orden: la sucesora puede combinarlo.
        self.assertIsNone(puntos.control_al_enviar)
        with open(self.ruta, encoding="utf-8") as f:
            control = json.load(f)
        self.assertEqual(set(control), {"T1"})
        self.assertEqual(control["T1"]["accion"], "soltar")
        self.assertEqual(control["T1"]["donde"], "otro contenedor")
        self.assertEqual(informe["al_volver"],
                         {"soltar": ["T1"], "seguir": 1, "donde": "otro contenedor"})

    def test_si_el_punto_no_sale_no_se_suelta(self):
        puntos = PuntosFalso(self.ruta, falla=True)
        n = nodo_volver(self.tmp, ["cola-a.json"], puntos)
        nov = nov_con_asignaciones(("T1", "a1", AHORA - 10))
        informe = {"acciones": [], "ordenes": [], "avisos": []}
        n._al_volver(nov, self.tmp, informe, AHORA, AHORA - 1000)
        self.assertEqual(puntos.llamadas, [(["T1"], self.tmp)])
        self.assertFalse(os.path.exists(self.ruta))
        self.assertEqual(informe["al_volver"]["pendiente"], ["T1"])
        self.assertIn("al volver", informe["avisos"][0])

    def test_asignacion_anterior_a_mi_ultimo_latido_se_sigue(self):
        puntos = PuntosFalso(self.ruta)
        n = nodo_volver(self.tmp, ["cola-a.json"], puntos)
        nov = nov_con_asignaciones(("T1", "a1", AHORA - 2000))
        informe = {"acciones": [], "ordenes": [], "avisos": []}
        n._al_volver(nov, self.tmp, informe, AHORA, AHORA - 1000)
        self.assertEqual(puntos.llamadas, [])
        self.assertFalse(os.path.exists(self.ruta))
        # T1 y T2 siguen siendo de este aparato (T3 ya está hecho y no cuenta).
        self.assertEqual(informe["al_volver"], {"soltar": [], "seguir": 2})

    def test_modo_seco_lee_pero_no_escribe_ni_manda_puntos(self):
        puntos = PuntosFalso(self.ruta)
        n = nodo_volver(self.tmp, ["cola-a.json"], puntos)
        n.modo = "seco"
        nov = nov_con_asignaciones(("T1", "a1", AHORA - 10))
        informe = {"acciones": [], "ordenes": [], "avisos": []}
        n._al_volver(nov, self.tmp, informe, AHORA, AHORA - 1000)
        self.assertEqual(puntos.llamadas, [])
        self.assertFalse(os.path.exists(self.ruta))
        self.assertNotIn("al_volver", informe)

    def test_sin_asignaciones_no_lee_colas_ni_envia_nada(self):
        puntos = PuntosFalso(self.ruta)

        def colas_que_no_deben_leerse():
            raise AssertionError("sin asignaciones no hace falta leer las colas")

        n = N.Nodo(seco=False, sin_red=True, memoria={}, persistir=False, huella="huella-volver",
                   colas=colas_que_no_deben_leerse, enviar_puntos=puntos,
                   cerrojos=os.path.join(self.tmp, "cerrojos"))
        n.yo, n.modo = "mac-1", "real"
        informe = {"acciones": [], "ordenes": [], "avisos": []}
        n._al_volver({"asignaciones": []}, self.tmp, informe, AHORA, AHORA - 1000)
        self.assertEqual(puntos.llamadas, [])
        self.assertNotIn("al_volver", informe)


class TestForzarYEnviarPuntos(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="volver-puntos-")
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)
        self.n = N.Nodo(seco=False, sin_red=True, memoria={}, persistir=False, huella="huella-volver")

    def modulo(self, puntos=None, estado=None):
        mod = types.ModuleType("oracle_nodo")
        if puntos is not None:
            mod.enviar_puntos = puntos
        if estado is not None:
            mod.enviar_estado = estado
        return mod

    def test_prefiere_enviar_puntos_cuando_existe(self):
        llamadas = []
        mod = self.modulo(puntos=lambda: llamadas.append("puntos") or {"ok": True},
                          estado=lambda: llamadas.append("estado") or {"ok": True})
        with patch.dict(sys.modules, {"oracle_nodo": mod}):
            ok, motivo = self.n._forzar_y_enviar_puntos(["T1"], self.tmp)
        self.assertTrue(ok)
        self.assertEqual(motivo, "")
        self.assertEqual(llamadas, ["puntos"])

    def test_sin_enviar_puntos_cae_al_espejo_del_estado(self):
        llamadas = []
        mod = self.modulo(estado=lambda: llamadas.append("estado") or {"ok": True})
        with patch.dict(sys.modules, {"oracle_nodo": mod}):
            ok, motivo = self.n._forzar_y_enviar_puntos(["T1"], self.tmp)
        self.assertTrue(ok)
        self.assertEqual(motivo, "")
        self.assertEqual(llamadas, ["estado"])

    def test_espejo_que_falla_no_se_toma_por_enviado(self):
        mod = self.modulo(estado=lambda: {"ok": False, "motivo": "sin red"})
        with patch.dict(sys.modules, {"oracle_nodo": mod}):
            ok, motivo = self.n._forzar_y_enviar_puntos(["T1"], self.tmp)
        self.assertFalse(ok)
        self.assertIn("sin red", motivo)


class TestVueltaAlVolver(unittest.TestCase):
    """La condición se mide en `vuelta` con el ÚLTIMO latido guardado, no con el que se envía."""

    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="volver-vuelta-")
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)

    def medir(self, modo, t):
        return {"medio": "mac", "raiz": self.tmp,
                "salud": {"periodo_s": 300, "autoritativo": True, "orquestador": True,
                          "trabajo": {"listas": 0, "en_curso": 0}, "orquestadores": [],
                          "disco_gb": 50, "servicios_caidos": [], "guardianes_caidos": []},
                "cap": {"medio": "mac", "modo": "real", "autoritativo": True,
                        "orquestador": True, "repo": True, "disco_gb": 50}}

    def nodo(self, ultimo_latido):
        n = N.Nodo(seco=False, sin_red=True, medir=self.medir, ejecutar=lambda *a: ("nada", ""),
                   reloj=lambda: AHORA,
                   memoria={"ultimo_latido": ultimo_latido, "hecho": {}, "nonces": {},
                            "decisiones": [], "autonomia": True},
                   persistir=False, huella="huella-vuelta")
        n.yo, n.modo = "mac-1", "real"
        llamadas = []
        n._al_volver = lambda *a, **k: llamadas.append(a)
        return n, llamadas

    def test_vuelta_tras_silencio_calcula_al_volver(self):
        n, llamadas = self.nodo(AHORA - 1000)
        n.vuelta()
        self.assertEqual(len(llamadas), 1)
        self.assertEqual(len(llamadas[0]), 5)

    def test_vuelta_sin_silencio_no_calcula_al_volver(self):
        n, llamadas = self.nodo(AHORA - 100)
        n.vuelta()
        self.assertEqual(llamadas, [])


if __name__ == "__main__":
    unittest.main()
