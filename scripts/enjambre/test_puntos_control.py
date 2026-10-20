"""Puntos de control del orquestador (COL1012D) — sin git ni disco reales:
`revisar` recibe `sh` y un `guardar` falsos; `anotar`/`quitar` escriben en tmp.
Además: el vigilante solo guarda cada PUNTO_CONTROL_S por tarea (la decisión la
da colmena_logica.debe_guardar_punto a partir del último punto anotado).
"""

import importlib.util
import json
import os
import tempfile
import unittest
from pathlib import Path


def _importar():
    ruta = Path(__file__).with_name("puntos_control.py")
    spec = importlib.util.spec_from_file_location("puntos_control", ruta)
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


pc = _importar()


class RevisarTest(unittest.TestCase):
    def setUp(self):
        self.guardados = []
        self.guardar = lambda tid: self.guardados.append(tid)

    def test_guarda_si_escribiendo_con_cambios_y_sin_punto_previo(self):
        tareas = [{"id": "A1", "fase": "escribiendo", "cambios": True}]
        self.assertEqual(pc.revisar(tareas, ahora=1000.0, guardar=self.guardar), ["A1"])

    def test_no_guarda_si_no_hay_cambios(self):
        tareas = [{"id": "A2", "fase": "escribiendo", "cambios": False}]
        self.assertEqual(pc.revisar(tareas, ahora=1000.0, guardar=self.guardar), [])

    def test_no_guarda_fuera_de_fase_de_trabajo(self):
        for fase in ("revisando", "test", "hecho", None):
            tareas = [{"id": "A3", "fase": fase, "cambios": True}]
            self.assertEqual(pc.revisar(tareas, 1000.0, self.guardar), [], fase)

    def test_completando_tambien_es_fase_con_trabajo(self):
        """«completando» es la segunda pasada de escritura del orquestador (existe); «reparando» nunca se emite."""
        tareas = [{"id": "A4", "fase": "completando", "cambios": True}]
        self.assertEqual(pc.revisar(tareas, 50.0, self.guardar), ["A4"])
        for fase in ("reparando", "corrigiendo"):
            self.assertEqual(pc.revisar([{"id": "A6", "fase": fase, "cambios": True}], 50.0, self.guardar), [], fase)

    def test_vigilante_solo_cada_300s_por_tarea(self):
        # Con punto reciente no toca; con punto viejo sí.
        reciente = [{"id": "A5", "fase": "escribiendo", "cambios": True, "punto": {"t": 1000.0}}]
        viejo = [{"id": "A5", "fase": "escribiendo", "cambios": True, "punto": {"t": 100.0}}]
        self.assertEqual(pc.revisar(reciente, 1299.0, self.guardar), [])
        self.assertEqual(pc.revisar(reciente, 1300.0, self.guardar), ["A5"])
        self.assertEqual(pc.revisar(viejo, 401.0, self.guardar), ["A5"])

    def test_sh_inyectado_mide_cambios_del_worktree(self):
        llamadas = []

        def sh_falso(args, cwd=None, timeout=30):
            llamadas.append((args, cwd))
            return 0, " M src/a.ts"

        tareas = [{"id": "A6", "fase": "escribiendo", "worktree": "/tmp/wt-a6"}]
        self.assertEqual(pc.revisar(tareas, 10.0, self.guardar, sh=sh_falso), ["A6"])
        self.assertEqual(llamadas[0][0][:2], ["git", "status"])
        # Sin cambios según git: no se guarda aunque esté escribiendo y sin punto previo.
        llamadas.clear()
        sh_limpio = lambda args, cwd=None, timeout=30: (0, "")
        self.assertEqual(pc.revisar(tareas, 9000.0, self.guardar, sh=sh_limpio), [])

    def test_error_en_guardar_no_tumba_el_barrido(self):
        def guardar_roto(tid):
            raise RuntimeError("git caído")

        tareas = [{"id": "A7", "fase": "escribiendo", "cambios": True}]
        self.assertEqual(pc.revisar(tareas, 10.0, guardar_roto), [])


class AnotarQuitarTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.ruta = os.path.join(self.tmp.name, "olas", "puntos-control.json")

    def test_anotar_escribe_rama_sha_t(self):
        pc.anotar(self.ruta, "B1", "ola/B1", "abc123", 777.0)
        with open(self.ruta, encoding="utf-8") as f:
            datos = json.load(f)
        self.assertEqual(datos, {"B1": {"rama": "ola/B1", "sha": "abc123", "t": 777.0}})

    def test_anotar_es_atomica_y_pisa(self):
        pc.anotar(self.ruta, "B2", "ola/B2", "s1", 1.0)
        pc.anotar(self.ruta, "B2", "ola/B2", "s2", 2.0)
        datos = pc.cargar(self.ruta)
        self.assertEqual(datos["B2"]["sha"], "s2")

    def test_quitar(self):
        pc.anotar(self.ruta, "B3", "ola/B3", "x", 3.0)
        self.assertTrue(pc.quitar(self.ruta, "B3"))
        self.assertEqual(pc.cargar(self.ruta), {})
        self.assertFalse(pc.quitar(self.ruta, "B3"))
        self.assertFalse(os.path.exists(self.ruta + ".tmp"))

    def test_cargar_roto_devuelve_vacio(self):
        os.makedirs(os.path.dirname(self.ruta), exist_ok=True)
        with open(self.ruta, "w", encoding="utf-8") as f:
            f.write("{roto")
        self.assertEqual(pc.cargar(self.ruta), {})


if __name__ == "__main__":
    unittest.main()
