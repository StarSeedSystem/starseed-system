# -*- coding: utf-8 -*-
"""Pruebas de «Al volver» (COL1012H): aparato que regresa y suelta lo que otro siguió.

Disco falso (carpeta temporal con `olas/`) y bus falso (asignaciones inyectadas). Comentarios
en español con acentos, como pide el contrato de diseño."""
import json
import os
import sys
import tempfile
import shutil
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import nodo_metagenesis as NM  # noqa: E402


class DiscoFalso(unittest.TestCase):
    """La base de las pruebas: raiz de repo falsa con `olas/` y Nodo sin red ni disco real."""

    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="colmena-volver-")
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)
        self.raiz = self.tmp
        self.olas = os.path.join(self.raiz, "starseed_memory_root", "olas")
        os.makedirs(self.olas)
        self.enviados = []  # lo que viajaría a `oracle_nodo.enviar_puntos` (ids en plano)
        self.nodo = NM.Nodo(env={}, enviar_puntos=lambda ids: self.enviados.extend(ids),
                            memoria={"ultimo_latido": 0.0})
        self.nodo.yo = "neurona-test"

    def dejar_latidos(self, cola: str, en_curso) -> None:
        """El `latidos-<cola>.json` como lo escribe el orquestador: {tareas: {id: {fase…}}}."""
        with open(os.path.join(self.olas, "latidos-%s.json" % cola), "w") as f:
            json.dump({"tareas": en_curso}, f)

    def control(self, cola: str):
        ruta = os.path.join(self.olas, "control-%s.json" % cola)
        if not os.path.exists(ruta):
            return None
        with open(ruta) as f:
            return json.load(f)

    def medir(self, en_curso):
        """La medida del medio que la vuelta ya deja en `_medida_salud` (latidos reales del aparato)."""
        self.nodo._medida_salud = {"en_curso": en_curso, "orquestadores": [{"cola": "colmena-1012"}]}

    def volver(self, asignaciones, t):
        """Una vuelta de `_al_volver` con el bus falso entregando sus asignaciones."""
        informe = {"avisos": []}
        self.nodo._al_volver({"asignaciones": list(asignaciones)} if asignaciones else {}, self.raiz, informe, t)
        return informe


class TestAlVolver(DiscoFalso):
    """El aparato que regresa deja caer lo que la colmena ya repartió mientras estuvo fuera."""

    def test_al_arrancar_suelta_lo_que_otro_siguio(self):
        """Primera vuelta (arranque): la T1 estaba en mi orquestador y la bus la asignó a otro → soltar."""
        self.dejar_latidos("colmena-1012", {"T1": {"fase": "escribiendo"}})
        self.medir([{"id": "T1", "fase": "escribiendo", "punto": {"rama": "r", "sha": "abc", "t": 5.0}}])
        informe = self.volver([{"ids": ["T1"], "a": "oracle-a1", "ts": 100.0}], t=1000.0)
        self.assertEqual(informe["al_volver"]["soltar"], ["T1"])
        orden = self.control("colmena-1012")
        self.assertEqual(orden.get("T1", {}).get("accion"), "soltar")
        self.assertEqual(orden.get("T1", {}).get("donde"), "oracle-a1")
        # El punto final salió ANTES de la orden: la sucesora puede combinarlo.
        self.assertEqual(self.enviados, ["T1"])

    def test_lo_que_nadie_siguio_lo_sigue_el(self):
        """Sin asignación externa, la tarea en curso SIGUE siendo mía: no se suelta."""
        self.dejar_latidos("colmena-1012", {"T2": {"fase": "completando"}})
        self.medir([{"id": "T2", "fase": "completando", "punto": None}])
        informe = self.volver([], t=1000.0)
        self.assertEqual(informe["al_volver"], {"soltar": [], "seguir": ["T2"]})
        self.assertIsNone(self.control("colmena-1012"))

    def test_una_tarea_asignada_a_mi_mismo_no_se_suelta(self):
        """Lo que MI propio lanzador entregó a este nodo no es de otro: se sigue."""
        self.dejar_latidos("colmena-1012", {"T3": {"fase": "escribiendo"}})
        self.medir([{"id": "T3", "fase": "escribiendo", "punto": None}])
        informe = self.volver([{"ids": ["T3"], "a": "neurona-test", "ts": 999.0}], t=1000.0)
        self.assertEqual(informe["al_volver"]["seguir"], ["T3"])
        self.assertIsNone(self.control("colmena-1012"))

    def test_el_disparo_es_uno_por_silencio(self):
        """Vuelta 2 (sin silencio, sin punto pendiente): NO hay segunda ronda; soltar no se repite."""
        self.dejar_latidos("colmena-1012", {"T1": {"fase": "escribiendo"}})
        self.medir([{"id": "T1", "fase": "escribiendo", "punto": None}])
        self.volver([{"ids": ["T1"], "a": "oracle-a1", "ts": 100.0}], t=1000.0)
        self.volver([{"ids": ["T1"], "a": "oracle-a1", "ts": 100.0}], t=1120.0)
        self.assertEqual(self.enviados, ["T1"])  # el punto solo salió UNA vez

    def test_reintenta_mientras_la_orden_no_se_escribe(self):
        """Vuelta 1: la tarea NO está en ningún latidos (el medio aún no listó a su orquestador);
        queda pendiente y la VUELTA 2 (t=1120, sin nuevo silencio) la suelta ya."""

        self.medir([{"id": "T4", "fase": "escribiendo", "punto": None}])
        informe = self.volver([{"ids": ["T4"], "a": "oracle-a1", "ts": 100.0}], t=1000.0)
        self.assertEqual(informe["al_volver"]["soltar"], ["T4"])
        self.assertIn("pendiente", informe["al_volver"])

        self.dejar_latidos("colmena-1012", {"T4": {"fase": "escribiendo"}})
        informe = self.volver([{"ids": ["T4"], "a": "oracle-a1", "ts": 100.0}], t=1120.0)
        self.assertEqual(informe["al_volver"].get("pendiente"), None)
        self.assertEqual(self.control("colmena-1012").get("T4", {}).get("accion"), "soltar")
        # ...y con la orden escrita ya no hay punto ni nuevo intento.
        self.assertEqual(self.enviados, ["T4"])

    def test_el_reintento_se_agota_y_no_sondea_para_siempre(self):
        self.medir([{"id": "T5", "fase": "escribiendo", "punto": None}])
        self.volver([{"ids": ["T5"], "a": "oracle-a1", "ts": 100.0}], t=1000.0)
        self.assertEqual(self.enviados, ["T5"])  # el punto salió en el PRIMER intento
        # El latidos- sigue sin existir en disco (la cola no está en este aparato): falta la orden.
        self.volver([{"ids": ["T5"], "a": "oracle-a1", "ts": 100.0}], t=1120.0)
        self.assertEqual(self.nodo.mem.get("volver_pendiente_t"), 1000.0)
        # Vuelta dentro del MISMO regreso (≤ silencio) pero DENTRO ya del tope de reintentos:
        # se da por atendida y se para (no sondea cada vuelta para siempre).
        self.volver([{"ids": ["T5"], "a": "oracle-a1", "ts": 100.0}], t=1700.0)
        self.assertIsNone(self.nodo.mem.get("volver_pendiente_t"))
        self.assertNotIn("al_volver", self.control("colmena-1012") or {})

    def test_en_modo_seco_no_se_escribe_ninguna_orden(self):
        self.nodo.modo = "seco"
        self.assertTrue(self.nodo._enviar_puntos is not None)
        self.dejar_latidos("colmena-1012", {"T6": {"fase": "escribiendo"}})
        self.medir([{"id": "T6", "fase": "escribiendo", "punto": None}])
        informe = self.volver([{"ids": ["T6"], "a": "oracle-a1", "ts": 100.0}], t=1000.0)
        self.assertEqual(self.enviados, [])  # seco: ni orden ni envío
        self.assertIsNone(self.control("colmena-1012"))


class TestAsignadasDelBus(unittest.TestCase):
    """El puente entre el bus (que lleva `ids`) y el núcleo puro (que quiere tid → destino)."""
    def test_expande_los_ids_y_gana_la_mas_reciente(self):
        salidas = NM.asignadas_del_bus([
            {"ids": ["A", "B"], "a": "oracle-a1", "ts": 100.0},
            {"ids": ["A"], "a": "mac", "ts": 200.0},
            {"id": "C", "nodo": "neurona-test", "ts": 150.0},
            "basura",
            {"ids": ["A"], "a": "gh-actions", "ts": 90.0},  # vieja: no se impone
        ])
        self.assertEqual(salidas["A"], {"a": "mac", "t": 200.0})
        self.assertEqual(salidas["B"], {"a": "oracle-a1", "t": 100.0})
        self.assertEqual(salidas["C"], {"a": "neurona-test", "t": 150.0})
        self.assertEqual(len(salidas), 3)


class TestEntradasDeRelevo(unittest.TestCase):
    """Las asignaciones del bus, expandidas con el mismo helper que usa «al volver»."""

    def test_entradas_de_relevo_trae_las_asignadas_expandidas(self):
        datos = NM.entradas_de_relevo(
            {"latidos": [], "bajas": [], "asignaciones": [{"ids": ["K1", "K2"], "a": "mac", "ts": 50.0}]}, {})
        self.assertEqual(datos["asignadas"]["K1"]["a"], "mac")
        self.assertEqual(datos["asignadas"]["K2"]["a"], "mac")


if __name__ == "__main__":
    unittest.main()


