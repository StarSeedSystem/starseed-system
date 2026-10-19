# -*- coding: utf-8 -*-
"""Pruebas para medio_alimentable y repartir con modo alimentar (CAP1018A)."""
import json
import os
import sys
import tempfile
import time
import unittest

DIR = os.path.dirname(os.path.abspath(__file__))
if DIR not in sys.path:
    sys.path.insert(0, DIR)

import nodo_metagenesis_logica as L
import nodo_metagenesis_medio as M

T0 = 1_791_640_000.0  # 2026-10-10 ~11:46 UTC


def salud_base(orquestadores=None, cola_viva=None, modo="real", repo=True, orquestador=True, autoritativo=False, trabajo=None):
    """Construye un diccionario de salud base para pruebas."""
    s = {
        "repo": repo,
        "orquestador": orquestador,
        "autoritativo": autoritativo,
        "orquestadores": orquestadores or [],
        "disco_gb": 50.0,
        "ram_libre_mb": 2048,
        "servicios_caidos": [],
        "guardianes_caidos": [],
    }
    if cola_viva is not None:
        s["cola_viva"] = cola_viva
    if trabajo is not None:
        s["trabajo"] = trabajo
    return s


def nodo_latido(nodo_id, medio, salud, modo="real", puntos=1000):
    """Construye un latido de nodo para pruebas."""
    return {
        "nodo": nodo_id,
        "medio": medio,
        "modo": modo,
        "puntos": puntos,
        "ts": T0,
        "salud": salud,
        "secreto": True,
    }


class TestMedioAlimentable(unittest.TestCase):
    """Pruebas para la función pura medio_alimentable."""

    def test_libre_con_orquestador_vivo_y_libres(self):
        """Medio con orquestador vivo, libres >= 1 y sin tareas nuevas en 10 min → alimentable."""
        salud = salud_base(
            orquestadores=[{"pid": 123, "cola": "cola-test"}],
            cola_viva={"trabajando": 1, "esperando": 2, "libres": 2, "ultima_tarea_ts": T0 - 7200}
        )
        nodo = nodo_latido("oracle-a1-abc123", "oracle-a1", salud)
        ok, motivo = L.medio_alimentable(nodo["nodo"], {"salud": salud, "modo": "real"}, T0)
        self.assertTrue(ok, f"Debería ser alimentable: {motivo}")
        self.assertEqual(motivo, "")

    def test_ocupado_sin_libres(self):
        """Medio con orquestador vivo pero libres = 0 → NO alimentable."""
        salud = salud_base(
            orquestadores=[{"pid": 123, "cola": "cola-test"}],
            cola_viva={"trabajando": 4, "esperando": 0, "libres": 0, "ultima_tarea_ts": T0 - 7200}
        )
        nodo = nodo_latido("oracle-a1-abc123", "oracle-a1", salud)
        ok, motivo = L.medio_alimentable(nodo["nodo"], {"salud": salud, "modo": "real"}, T0)
        self.assertFalse(ok)
        self.assertIn("sin trabajadores libres", motivo)

    def test_sin_orquestador_vivo(self):
        """Medio sin orquestador vivo → NO alimentable."""
        salud = salud_base(
            orquestadores=[],
            cola_viva={"trabajando": 0, "esperando": 5, "libres": 4, "ultima_tarea_ts": T0 - 7200}
        )
        nodo = nodo_latido("oracle-a1-abc123", "oracle-a1", salud)
        ok, motivo = L.medio_alimentable(nodo["nodo"], {"salud": salud, "modo": "real"}, T0)
        self.assertFalse(ok)
        self.assertIn("sin orquestador vivo", motivo)

    def test_modo_seco(self):
        """Medio en modo seco → NO alimentable."""
        salud = salud_base(
            orquestadores=[{"pid": 123, "cola": "cola-test"}],
            cola_viva={"trabajando": 1, "esperando": 2, "libres": 2, "ultima_tarea_ts": T0 - 7200}
        )
        nodo = nodo_latido("oracle-a1-abc123", "oracle-a1", salud, modo="seco")
        ok, motivo = L.medio_alimentable(nodo["nodo"], {"salud": salud, "modo": "seco"}, T0)
        self.assertFalse(ok)
        self.assertEqual(motivo, "seco")

    def test_tarea_nueva_hace_menos_de_10_min(self):
        """Cola con tarea nueva hace menos de 10 min → NO alimentable."""
        salud = salud_base(
            orquestadores=[{"pid": 123, "cola": "cola-test"}],
            cola_viva={"trabajando": 1, "esperando": 2, "libres": 2, "ultima_tarea_ts": T0 - 300}
        )
        nodo = nodo_latido("oracle-a1-abc123", "oracle-a1", salud)
        ok, motivo = L.medio_alimentable(nodo["nodo"], {"salud": salud, "modo": "real"}, T0)
        self.assertFalse(ok)
        self.assertIn("cola con tareas nuevas hace menos de 10 min", motivo)

    def test_sin_campo_cola_viva_compatibilidad(self):
        """Compatibilidad: si no existe el campo cola_viva en salud → NO alimentable (seguro)."""
        salud = salud_base(
            orquestadores=[{"pid": 123, "cola": "cola-test"}],
            cola_viva=None  # Campo no presente
        )
        nodo = nodo_latido("oracle-a1-abc123", "oracle-a1", salud)
        ok, motivo = L.medio_alimentable(nodo["nodo"], {"salud": salud, "modo": "real"}, T0)
        self.assertFalse(ok)
        self.assertIn("sin resumen de cola viva", motivo)

    def test_sin_repo_ni_orquestador(self):
        """Medio sin repo u orquestador → NO alimentable."""
        salud = salud_base(
            orquestadores=[{"pid": 123, "cola": "cola-test"}],
            cola_viva={"trabajando": 1, "esperando": 2, "libres": 2, "ultima_tarea_ts": T0 - 7200},
            repo=False,
            orquestador=False
        )
        nodo = nodo_latido("oracle-a1-abc123", "oracle-a1", salud)
        ok, motivo = L.medio_alimentable(nodo["nodo"], {"salud": salud, "modo": "real"}, T0)
        self.assertFalse(ok)
        self.assertIn("sin repo u orquestador", motivo)


class TestRepartirModoAlimentar(unittest.TestCase):
    """Pruebas para la acción repartir con modo alimentar."""

    def setUp(self):
        self.tmpdir = tempfile.mkdtemp()
        self.olas = os.path.join(self.tmpdir, "starseed_memory_root", "olas")
        os.makedirs(self.olas, exist_ok=True)
        self.progreso_path = os.path.join(self.olas, "progreso.json")
        with open(self.progreso_path, "w") as f:
            json.dump({}, f)

    def tearDown(self):
        import shutil
        shutil.rmtree(self.tmpdir, ignore_errors=True)

    def _crear_cola_viva(self, nombre_cola, tareas, latidos_tareas=None):
        """Crea archivos de cola viva y latidos para pruebas."""
        cola_path = os.path.join(self.olas, f"{nombre_cola}.json")
        with open(cola_path, "w") as f:
            json.dump(tareas, f)
        if latidos_tareas is not None:
            latidos_path = os.path.join(self.olas, f"latidos-{nombre_cola}.json")
            with open(latidos_path, "w") as f:
                json.dump({"tareas": latidos_tareas}, f)

    def test_alimentar_añade_tareas_sin_duplicados(self):
        """Modo alimentar añade tareas nuevas sin duplicar IDs existentes."""
        nombre_cola = "cola-test-001"
        # Cola viva existente con 2 tareas
        tareas_existentes = [
            {"id": "T1", "titulo": "Tarea 1", "archivos": ["a.ts"], "prompt": "haz a"},
            {"id": "T2", "titulo": "Tarea 2", "archivos": ["b.ts"], "prompt": "haz b"},
        ]
        self._crear_cola_viva(nombre_cola, tareas_existentes)

        # Simular que hay un orquestador vivo
        # Parchear cola_viva() para que devuelva nuestra cola
        original_cola_viva = M.cola_viva
        M.cola_viva = lambda lineas=None: f"{nombre_cola}.json"

        try:
            args = {
                "modo": "alimentar",
                "destino": "oracle-a1-abc123",
                "tope": 4,
                "_tareas": [
                    {"id": "T2", "titulo": "Tarea 2 duplicada", "archivos": ["b.ts"], "prompt": "haz b"},  # duplicada
                    {"id": "T3", "titulo": "Tarea 3 nueva", "archivos": ["c.ts"], "prompt": "haz c"},
                    {"id": "T4", "titulo": "Tarea 4 nueva", "archivos": ["d.ts"], "prompt": "haz d"},
                ]
            }
            estado, texto = M.repartir_tareas(args, "oracle-a1", self.tmpdir)
            self.assertEqual(estado, "hecha")
            self.assertIn("2 tarea(s) añadidas", texto)

            # Verificar que solo se añadieron T3 y T4
            with open(os.path.join(self.olas, f"{nombre_cola}.json")) as f:
                cola_final = json.load(f)
            ids_finales = {t["id"] for t in cola_final}
            self.assertEqual(ids_finales, {"T1", "T2", "T3", "T4"})
        finally:
            M.cola_viva = original_cola_viva

    def test_alimentar_respeta_tope_libres_por_dos(self):
        """El tope máximo es libres * 2 (se pasa en args.tope desde el plan)."""
        nombre_cola = "cola-test-002"
        tareas_existentes = [
            {"id": "T1", "titulo": "Tarea 1", "archivos": ["a.ts"], "prompt": "haz a"},
        ]
        self._crear_cola_viva(nombre_cola, tareas_existentes)

        original_cola_viva = M.cola_viva
        M.cola_viva = lambda lineas=None: f"{nombre_cola}.json"

        try:
            # tope = 3 (simulando libres=1 * 2 = 2, pero el plan pasa tope=3)
            args = {
                "modo": "alimentar",
                "destino": "oracle-a1-abc123",
                "tope": 3,
                "_tareas": [
                    {"id": "T2", "titulo": "Tarea 2", "archivos": ["b.ts"], "prompt": "haz b"},
                    {"id": "T3", "titulo": "Tarea 3", "archivos": ["c.ts"], "prompt": "haz c"},
                    {"id": "T4", "titulo": "Tarea 4", "archivos": ["d.ts"], "prompt": "haz d"},
                    {"id": "T5", "titulo": "Tarea 5", "archivos": ["e.ts"], "prompt": "haz e"},
                ]
            }
            estado, texto = M.repartir_tareas(args, "oracle-a1", self.tmpdir)
            self.assertEqual(estado, "hecha")
            self.assertIn("3 tarea(s) añadidas", texto)

            with open(os.path.join(self.olas, f"{nombre_cola}.json")) as f:
                cola_final = json.load(f)
            self.assertEqual(len(cola_final), 4)  # T1 + 3 nuevas
        finally:
            M.cola_viva = original_cola_viva

    def test_alimentar_no_ejecuta_si_no_hay_orquestador_vivo(self):
        """Si no hay orquestador vivo (cola_viva() devuelve None) → no hace nada."""
        original_cola_viva = M.cola_viva
        M.cola_viva = lambda lineas=None: None

        try:
            args = {
                "modo": "alimentar",
                "destino": "oracle-a1-abc123",
                "tope": 4,
                "_tareas": [{"id": "T1", "titulo": "Tarea 1", "archivos": ["a.ts"], "prompt": "haz a"}]
            }
            estado, texto = M.repartir_tareas(args, "oracle-a1", self.tmpdir)
            self.assertEqual(estado, "nada")
            self.assertIn("no hay orquestador vivo", texto)
        finally:
            M.cola_viva = original_cola_viva

    def test_alimentar_no_duplica_con_progreso(self):
        """No duplica tareas que ya están en progreso.json."""
        nombre_cola = "cola-test-003"
        tareas_existentes = [
            {"id": "T1", "titulo": "Tarea 1", "archivos": ["a.ts"], "prompt": "haz a"},
        ]
        self._crear_cola_viva(nombre_cola, tareas_existentes)

        # Progreso con T2 ya integrado
        with open(self.progreso_path, "w") as f:
            json.dump({"T2": {"estado": "commit"}}, f)

        original_cola_viva = M.cola_viva
        M.cola_viva = lambda lineas=None: f"{nombre_cola}.json"

        try:
            args = {
                "modo": "alimentar",
                "destino": "oracle-a1-abc123",
                "tope": 4,
                "_tareas": [
                    {"id": "T2", "titulo": "Tarea 2 en progreso", "archivos": ["b.ts"], "prompt": "haz b"},
                    {"id": "T3", "titulo": "Tarea 3 nueva", "archivos": ["c.ts"], "prompt": "haz c"},
                ]
            }
            estado, texto = M.repartir_tareas(args, "oracle-a1", self.tmpdir)
            self.assertEqual(estado, "hecha")
            self.assertIn("1 tarea(s) añadidas", texto)

            with open(os.path.join(self.olas, f"{nombre_cola}.json")) as f:
                cola_final = json.load(f)
            ids_finales = {t["id"] for t in cola_final}
            self.assertEqual(ids_finales, {"T1", "T3"})  # T2 excluida por estar en progreso
        finally:
            M.cola_viva = original_cola_viva

    def test_alimentar_actualiza_latidos(self):
        """Verifica que también actualiza el archivo de latidos."""
        nombre_cola = "cola-test-004"
        tareas_existentes = [
            {"id": "T1", "titulo": "Tarea 1", "archivos": ["a.ts"], "prompt": "haz a"},
        ]
        latidos_existentes = [
            {"id": "T1", "fase": "escribiendo", "ts": T0 - 100}
        ]
        self._crear_cola_viva(nombre_cola, tareas_existentes, latidos_existentes)

        original_cola_viva = M.cola_viva
        M.cola_viva = lambda lineas=None: f"{nombre_cola}.json"

        try:
            args = {
                "modo": "alimentar",
                "destino": "oracle-a1-abc123",
                "tope": 2,
                "_tareas": [
                    {"id": "T2", "titulo": "Tarea 2", "archivos": ["b.ts"], "prompt": "haz b"},
                ]
            }
            estado, texto = M.repartir_tareas(args, "oracle-a1", self.tmpdir)
            self.assertEqual(estado, "hecha")

            # Verificar latidos actualizado
            with open(os.path.join(self.olas, f"latidos-{nombre_cola}.json")) as f:
                latidos = json.load(f)
            tareas_latidos = latidos.get("tareas", [])
            self.assertEqual(len(tareas_latidos), 2)
            # La nueva tarea debe tener fase "pendiente"
            nueva = next(t for t in tareas_latidos if t["id"] == "T2")
            self.assertEqual(nueva["fase"], "pendiente")
            self.assertIn("ts", nueva)
        finally:
            M.cola_viva = original_cola_viva


class TestResumenColaViva(unittest.TestCase):
    """Pruebas para la función pura resumen_cola_viva."""

    def test_cuenta_trabajando_y_esperando(self):
        """Cuenta correctamente tareas en fases de trabajo vs pendientes."""
        latidos_data = {
            "tareas": [
                {"id": "T1", "fase": "escribiendo"},
                {"id": "T2", "fase": "tsc"},
                {"id": "T3", "fase": "pruebas"},
                {"id": "T4", "fase": "revisión"},
                {"id": "T5", "fase": "integración"},
                {"id": "T6", "fase": "pendiente"},
                {"id": "T7", "fase": "pendiente"},
            ]
        }
        resumen = L.resumen_cola_viva(latidos_data, trabajadores=4)
        self.assertEqual(resumen["trabajando"], 5)
        self.assertEqual(resumen["esperando"], 2)
        self.assertEqual(resumen["libres"], 0)  # 4 trabajadores - 5 trabajando = 0 (mínimo 0)

    def test_libres_nunca_negativo(self):
        """libres nunca es negativo (mínimo 0)."""
        latidos_data = {"tareas": [{"id": f"T{i}", "fase": "escribiendo"} for i in range(10)]}
        resumen = L.resumen_cola_viva(latidos_data, trabajadores=3)
        self.assertEqual(resumen["trabajando"], 10)
        self.assertEqual(resumen["libres"], 0)

    def test_sin_tareas(self):
        """Cola vacía → todo en cero."""
        latidos_data = {"tareas": []}
        resumen = L.resumen_cola_viva(latidos_data, trabajadores=4)
        self.assertEqual(resumen["trabajando"], 0)
        self.assertEqual(resumen["esperando"], 0)
        self.assertEqual(resumen["libres"], 4)

    def test_datos_invalidos(self):
        """Datos inválidos → valores por defecto seguros."""
        resumen = L.resumen_cola_viva(None, trabajadores=2)
        self.assertEqual(resumen["trabajando"], 0)
        self.assertEqual(resumen["esperando"], 0)
        self.assertEqual(resumen["libres"], 2)
        resumen = L.resumen_cola_viva({"tareas": "no es lista"}, trabajadores=2)
        self.assertEqual(resumen["trabajando"], 0)
        self.assertEqual(resumen["esperando"], 0)
        self.assertEqual(resumen["libres"], 2)


class TestPlanificadorAlimentar(unittest.TestCase):
    """Pruebas de integración: el planificador propone repartir con modo alimentar."""

    def test_planificador_propone_alimentar_cuando_no_hay_ocioso_pero_si_alimentable(self):
        """Cuando no hay medio ocioso (medio_ocioso=False) pero hay alimentable, propone repartir con modo alimentar."""
        # Configurar mundo con:
        # - Mac autoritativa con listas
        # - A1 con orquestador vivo, libres=2, sin tareas nuevas en 10 min
        # - Ningún medio ocioso (A1 tiene orquestador vivo)
        mac_salud = salud_base(
            autoritativo=True,
            orquestadores=[{"pid": 100, "cola": "cola-mac"}],
            trabajo={"listas": 10, "en_curso": 2, "bloqueadas": 0},
            cola_viva={"trabajando": 2, "esperando": 8, "libres": 1, "ultima_tarea_ts": T0 - 7200}
        )
        a1_salud = salud_base(
            orquestadores=[{"pid": 200, "cola": "cola-a1"}],
            cola_viva={"trabajando": 1, "esperando": 3, "libres": 2, "ultima_tarea_ts": T0 - 7200}
        )
        nodos = {
            "mac-aaaaaa": nodo_latido("mac-aaaaaa", "mac", mac_salud, puntos=1500),
            "oracle-a1-bbbbbb": nodo_latido("oracle-a1-bbbbbb", "oracle-a1", a1_salud, puntos=1250),
        }
        mundo = {
            "nodos": nodos,
            "yo": "mac-aaaaaa",
            "autonomia": True,
            "colas_portables": [
                {"id": "P1", "titulo": "Portable 1", "archivos": ["x.ts"], "prompt": "haz x"},
                {"id": "P2", "titulo": "Portable 2", "archivos": ["y.ts"], "prompt": "haz y"},
            ],
            "asignaciones": [],
        }
        plan = L.planificar(mundo, {"hecho": {}}, T0)
        # Buscar acción repartir con modo alimentar
        acciones_repartir = [a for a in plan if a["accion"] == "repartir" and a.get("args", {}).get("modo") == "alimentar"]
        self.assertEqual(len(acciones_repartir), 1, "Debería proponer un repartir con modo alimentar")
        accion = acciones_repartir[0]
        self.assertEqual(accion["args"]["destino"], "oracle-a1-bbbbbb")
        self.assertEqual(accion["args"]["modo"], "alimentar")
        self.assertEqual(accion["args"]["tope"], 4)  # libres=2 * 2 = 4

    def test_planificador_no_propone_alimentar_si_hay_ocioso(self):
        """Si hay medio ocioso (medio_ocioso=True), propone repartir normal, no alimentar."""
        # A1 sin orquestador vivo → medio_ocioso=True
        mac_salud = salud_base(
            autoritativo=True,
            orquestadores=[{"pid": 100, "cola": "cola-mac"}],
            trabajo={"listas": 10, "en_curso": 2, "bloqueadas": 0},
        )
        a1_salud = salud_base(
            orquestadores=[],  # Sin orquestador vivo → ocioso
            cola_viva={"trabajando": 0, "esperando": 0, "libres": 4, "ultima_tarea_ts": T0 - 7200}
        )
        nodos = {
            "mac-aaaaaa": nodo_latido("mac-aaaaaa", "mac", mac_salud, puntos=1500),
            "oracle-a1-bbbbbb": nodo_latido("oracle-a1-bbbbbb", "oracle-a1", a1_salud, puntos=1250),
        }
        mundo = {
            "nodos": nodos,
            "yo": "mac-aaaaaa",
            "autonomia": True,
            "colas_portables": [
                {"id": "P1", "titulo": "Portable 1", "archivos": ["x.ts"], "prompt": "haz x"},
            ],
            "asignaciones": [],
        }
        plan = L.planificar(mundo, {"hecho": {}}, T0)
        # Debería proponer repartir normal (sin modo alimentar) porque hay medio ocioso
        acciones_repartir = [a for a in plan if a["accion"] == "repartir"]
        self.assertEqual(len(acciones_repartir), 1)
        accion = acciones_repartir[0]
        self.assertNotIn("modo", accion["args"])  # Sin modo alimentar
        self.assertEqual(accion["args"]["destino"], "oracle-a1-bbbbbb")


if __name__ == "__main__":
    unittest.main()