#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas de la CLI del carril de alta capacidad (ola 1022B).

Sin red y sin `claude` real: se inyectan el lanzador y `git ls-remote`.
"""
import importlib.util
import json
import os
import sys
import tempfile
import time
import unittest
from datetime import datetime, timedelta, timezone

DIR = os.path.dirname(os.path.abspath(__file__))
if DIR not in sys.path:
    sys.path.insert(0, DIR)

import alta_capacidad_nube_logica as L  # noqa: E402

_RUTA = os.path.join(DIR, "alta-capacidad-nube.py")
_spec = importlib.util.spec_from_file_location("alta_capacidad_nube", _RUTA)
A = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(A)

VENCE = datetime(2026, 11, 5, 1, 59, tzinfo=timezone(timedelta(hours=-6)))
AHORA = VENCE.timestamp() - 13 * 86400.0
SALIDA = ("\x1b[>4m Created cloud session: Carril 1022B\r\n"
          "View: https://claude.ai/code/session_01HW1xkHMRPYXUF5bjHiWxyd?from=cli&m=0")
PLANTILLA = "Ola {ID} · {TITULO} · {FECHA}\nArchivos: {ARCHIVOS}\n\n{PROMPT}"
TAREA = {"id": "ALT1022B", "titulo": "CLI del carril", "archivos": ["a.py", "b.py"],
         "prompt": "Haz la CLI de {ID}."}


class FalsoTraer:
    """El trozo de `traer_nube` que usa la CLI: progreso y su actualización con cerrojo."""

    def __init__(self, progreso=None):
        self.progreso = progreso or {}
        self.cambios = []

    def _progreso(self):
        return self.progreso

    def _actualizar_progreso(self, cambios):
        self.cambios.append(cambios)
        for tid, campos in cambios.items():
            self.progreso.setdefault(tid, {}).update(campos)


def _handle():
    return type("Handle", (), {"terminar": lambda self: None})()


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.raiz = self.tmp.name
        self.olas = os.path.join(self.raiz, "olas")
        os.makedirs(self.olas)
        with open(os.path.join(self.olas, "cola-20261022.json"), "w", encoding="utf-8") as f:
            json.dump({"ola": "1022", "tareas": [TAREA]}, f, ensure_ascii=False)
        self.credito = os.path.join(self.raiz, "credito.json")
        self._escribir_credito(250.0)
        self.registro = os.path.join(self.raiz, "registro.json")
        self.briefs = os.path.join(self.raiz, "briefs")
        self.plantilla = os.path.join(self.raiz, "plantilla.md")
        with open(self.plantilla, "w", encoding="utf-8") as f:
            f.write(PLANTILLA)
        self.traer = FalsoTraer()

    def tearDown(self):
        self.tmp.cleanup()

    def _escribir_credito(self, restante):
        with open(self.credito, "w", encoding="utf-8") as f:
            json.dump({"total_usd": 250, "restante_usd": restante, "vence": VENCE.isoformat()}, f)

    def _lanzar(self, launcher, seco=False, ids=("ALT1022B",)):
        return A.lanzar(list(ids), seco=seco, ahora=AHORA, olas=self.olas, credito_ruta=self.credito,
                        registro_ruta=self.registro, briefs=self.briefs,
                        plantilla_ruta=self.plantilla, traer=self.traer, launcher=launcher,
                        espera_s=0, dormir=lambda _s: None, reloj=lambda: AHORA,
                        decir=lambda _m: None)

    def test_cupo_agotado_no_lanza_ni_marca(self):
        self._escribir_credito(5.0)
        llamadas = []
        resumen = self._lanzar(lambda *a: llamadas.append(a) or _handle())
        self.assertEqual(resumen["saltadas"], ["ALT1022B"])
        self.assertEqual(llamadas, [])
        self.assertEqual(self.traer.cambios, [])
        self.assertFalse(os.path.exists(self.registro))

    def test_lanzamiento_feliz_anota_y_marca(self):
        llamadas = []

        def launcher(orden, log, teclas):
            llamadas.append(orden)
            with open(log, "w", encoding="utf-8") as f:
                f.write(SALIDA)
            return _handle()

        resumen = self._lanzar(launcher)
        self.assertEqual(resumen["lanzadas"], ["ALT1022B"])
        self.assertEqual(llamadas[0][:4], ["claude", "--model", A.MODELO, "--cloud"])
        self.assertEqual(self.traer.cambios,
                         [{"ALT1022B": {"estado": "reasignada", "medio": L.MEDIO_NUBE}}])
        with open(self.registro, encoding="utf-8") as f:
            sesiones = json.load(f)["sesiones"]
        self.assertEqual(sesiones[0]["sesion"], "session_01HW1xkHMRPYXUF5bjHiWxyd")
        fecha = time.strftime("%Y%m%d", time.localtime(AHORA))
        self.assertEqual(sesiones[0]["rama_pedida"], "nube/cc-%s/ola/ALT1022B" % fecha)
        self.assertTrue(os.path.exists(os.path.join(self.briefs, "ALT1022B.md")))

    def test_salida_sin_sesion_devuelve_a_pendiente(self):
        def launcher(orden, log, teclas):
            with open(log, "w", encoding="utf-8") as f:
                f.write("Created cloud session: sin enlace\n")
            return _handle()

        resumen = self._lanzar(launcher)
        self.assertEqual(resumen["fallidas"], ["ALT1022B"])
        self.assertEqual(self.traer.cambios[-1], {"ALT1022B": {"estado": "pendiente"}})
        self.assertFalse(os.path.exists(self.registro))

    def test_seco_no_lanza_ni_marca(self):
        def launcher(*_a):
            raise AssertionError("en seco no se lanza")

        resumen = self._lanzar(launcher, seco=True)
        self.assertEqual(resumen["saltadas"], ["ALT1022B"])
        self.assertEqual(self.traer.cambios, [])
        self.assertFalse(os.path.exists(self.registro))
        self.assertTrue(os.path.exists(os.path.join(self.briefs, "ALT1022B.md")))

    def test_id_inexistente_se_informa(self):
        resumen = self._lanzar(lambda *a: _handle(), ids=("NOEXISTE",))
        self.assertEqual(resumen["fallidas"], ["NOEXISTE"])
        self.assertEqual(self.traer.cambios, [])

    def _rama(self):
        return "nube/cc-%s/ola/ALT1022B" % time.strftime("%Y%m%d", time.localtime(AHORA))

    def _registro(self, t, rama=None):
        rama = rama or "nube/cc-%s/ola/ALT1022B" % time.strftime("%Y%m%d", time.localtime(AHORA))
        with open(self.registro, "w", encoding="utf-8") as f:
            json.dump({"sesiones": [{"tarea": "ALT1022B", "sesion": "session_x",
                                     "url": "https://claude.ai/code/session_x",
                                     "rama_pedida": rama, "modelo": A.MODELO, "t": t}]}, f)

    def _seguir(self, aplicar, ls_remote, runner):
        return A.seguir(aplicar, ahora=AHORA, registro_ruta=self.registro, traer=self.traer,
                        ls_remote=ls_remote, runner=runner, decir=lambda _m: None)

    def test_seguir_trae_y_corre_traer_una_vez(self):
        self.traer.progreso = {"ALT1022B": {"estado": "reasignada", "medio": L.MEDIO_NUBE}}
        self._registro(AHORA - 60)
        corridas = []
        acciones = self._seguir(
            True, lambda: "abc\trefs/heads/%s\n" % self._rama(),
            lambda: corridas.append(1))
        self.assertEqual(acciones["ALT1022B"], "traer")
        self.assertEqual(self.traer.cambios[-1]["ALT1022B"], {"estado": "pendiente"})
        self.assertEqual(corridas, [1])

    def test_seguir_devuelve_sin_rama_tras_la_gracia(self):
        self.traer.progreso = {"ALT1022B": {"estado": "reasignada", "medio": L.MEDIO_NUBE}}
        self._registro(AHORA - 9 * 3600)
        corridas = []
        acciones = self._seguir(True, lambda: "", lambda: corridas.append(1))
        self.assertEqual(acciones["ALT1022B"], "devolver")
        cambio = self.traer.cambios[-1]["ALT1022B"]
        self.assertEqual(cambio["estado"], "pendiente")
        self.assertIn("sin rama tras 8 h", cambio["nota"])
        self.assertIn("session_x", cambio["nota"])
        self.assertEqual(corridas, [])
        with open(self.registro, encoding="utf-8") as f:
            self.assertEqual(json.load(f)["sesiones"], [])

    def test_seguir_olvida_lo_que_dejo_de_estar_prestado(self):
        self.traer.progreso = {"ALT1022B": {"estado": "hecho"}}
        self._registro(AHORA - 60)
        acciones = self._seguir(True, lambda: "", lambda: None)
        self.assertEqual(acciones["ALT1022B"], "olvidar")
        self.assertEqual(self.traer.cambios, [])

    def test_seguir_sin_aplicar_solo_informa(self):
        self.traer.progreso = {"ALT1022B": {"estado": "reasignada", "medio": L.MEDIO_NUBE}}
        self._registro(AHORA - 60)
        corridas = []
        with open(self.registro, encoding="utf-8") as f:
            antes = f.read()
        acciones = self._seguir(
            False, lambda: "abc\trefs/heads/%s\n" % self._rama(),
            lambda: corridas.append(1))
        self.assertEqual(acciones["ALT1022B"], "traer")
        self.assertEqual(self.traer.cambios, [])
        self.assertEqual(corridas, [])
        with open(self.registro, encoding="utf-8") as f:
            self.assertEqual(f.read(), antes)

    def test_ver_json_da_credito_presupuesto_y_sesiones(self):
        self.traer.progreso = {"ALT1022B": {"estado": "reasignada", "medio": L.MEDIO_NUBE}}
        self._registro(AHORA - 60)
        d = A.ver(True, ahora=AHORA, credito_ruta=self.credito, registro_ruta=self.registro,
                  traer=self.traer, decir=lambda _m: None)
        self.assertEqual(d["credito_restante_usd"], 250.0)
        self.assertEqual(d["sesiones_vivas"], 1)
        self.assertAlmostEqual(d["presupuesto_hoy_usd"], round(240.0 / 13.0, 2))
        self.assertTrue(d["cupo"])
        self.assertEqual(d["sesiones"][0]["estado"], "viva")
        self.assertEqual(d["sesiones"][0]["url"], "https://claude.ai/code/session_x")


class Purezas(unittest.TestCase):
    def test_normalizar_ids(self):
        self.assertEqual(A.normalizar_ids(" A, B ,,C "), ["A", "B", "C"])
        self.assertEqual(A.normalizar_ids(""), [])

    def test_ramas_de_ls_remote(self):
        texto = ("abc\trefs/heads/nube/cc-20261022/ola/ALT1022B\n"
                 "def\trefs/heads/main\n")
        self.assertEqual(A.ramas_de_ls_remote(texto),
                         {"nube/cc-20261022/ola/ALT1022B", "main"})
        self.assertEqual(A.ramas_de_ls_remote(""), set())

    def test_registrar_sesion_reemplaza_la_misma_tarea(self):
        reg = A.registrar_sesion({"sesiones": []}, {"tarea": "X", "sesion": "uno"})
        reg = A.registrar_sesion(reg, {"tarea": "X", "sesion": "dos"})
        reg = A.registrar_sesion(reg, {"tarea": "Y", "sesion": "tres"})
        self.assertEqual([e["sesion"] for e in reg["sesiones"]], ["tres", "dos"])

    def test_buscar_tarea_en_la_cola_mas_reciente(self):
        with tempfile.TemporaryDirectory() as tmp:
            vieja = os.path.join(tmp, "cola-20261021.json")
            nueva = os.path.join(tmp, "cola-20261022.json")
            with open(vieja, "w", encoding="utf-8") as f:
                json.dump({"tareas": [dict(TAREA, titulo="vieja")]}, f)
            with open(nueva, "w", encoding="utf-8") as f:
                json.dump({"tareas": [dict(TAREA, titulo="nueva")]}, f)
            os.utime(vieja, (1000, 1000))
            os.utime(nueva, (2000, 2000))
            tarea, ruta = A.buscar_tarea("ALT1022B", A.rutas_de_cola(tmp))
            self.assertEqual(tarea["titulo"], "nueva")
            self.assertEqual(ruta, nueva)
            self.assertEqual(A.buscar_tarea("NOEXISTE", A.rutas_de_cola(tmp)), (None, None))

    def test_nota_devolucion_con_horas_enteras(self):
        nota = A.nota_devolucion(8.0, "https://claude.ai/code/session_x")
        self.assertEqual(nota, "devuelta del carril en la nube: sin rama tras 8 h "
                               "(sesión https://claude.ai/code/session_x)")


if __name__ == "__main__":
    unittest.main()
