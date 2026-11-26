# -*- coding: utf-8 -*-
"""Reparación AF44EE5BF: cerrar la publicación superada y no perder la reapertura del director."""
import contextlib
import importlib.util
import json
import os
import sys
import tempfile
import time
import unittest
from unittest import mock

DIR = os.path.dirname(os.path.abspath(__file__))
PUENTE = os.path.normpath(os.path.join(DIR, "..", "puente"))
for _carpeta in (DIR, PUENTE):
    if _carpeta not in sys.path:
        sys.path.insert(0, _carpeta)

def _cargar(nombre, ruta):
    """Carga el módulo DEL WORKTREE: el repo padre ya tiene otros en sys.modules."""
    espec = importlib.util.spec_from_file_location(nombre, ruta)
    modulo = importlib.util.module_from_spec(espec)
    sys.modules[nombre] = modulo
    espec.loader.exec_module(modulo)
    return modulo


# `escalada_motores` va primero: el revisor lo importa dentro de `decidir`.
EM = _cargar("escalada_motores", os.path.join(PUENTE, "escalada_motores.py"))
L = _cargar("revisor_bloqueadas_logica", os.path.join(PUENTE, "revisor_bloqueadas_logica.py"))
enjambre = _cargar("enjambre_af44", os.path.join(DIR, "starseed-enjambre.py"))

TITULO = "Desbloquear la publicación (e02479ebc)"
ASUNTO = "Ola 1120 · publicado e02479ebce49"
NOTA = "no toco NINGUNO de los 1 archivos que declaraba"
AHORA = time.mktime(time.strptime("2026-11-20 12:16:02", "%Y-%m-%d %H:%M:%S"))


def _t(minutos=10):
    return time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(AHORA - minutos * 60))


def decision_revisor(veces=0, titulo=TITULO):
    """Foto del revisor para la tarea AF44EE5B con el SHA ya publicado en main."""
    tid = "AF44EE5B"
    tarea = {"id": tid, "titulo": titulo, "archivos": ["scripts/puente/x.py"],
             "depende": [], "prompt": "desbloquea la publicación"}
    prog = {tid: {"estado": "rechazada", "nota": NOTA, "t": _t()}}
    historial = [{"t": _t(90 * (i + 1)), "tid": tid, "accion": "reescribir",
                  "clase": "tarea:alcance", "motivo": "rechazo mecánico de las puertas"}
                 for i in range(veces)]
    foto = {"tareas": {tid: tarea}, "colas": {"cola-x.json": [tid]}, "cola_viva": None,
            "progreso": prog, "asuntos": [ASUNTO], "fallos": {}, "memoria": {"historial": historial},
            "ahora": AHORA, "head": "e02479ebce49", "disponibilidad": {}, "presupuesto": {}}
    return L.decidir(foto)


class TituloPublicacionTest(unittest.TestCase):
    def test_reconoce_el_sha_entre_parentesis(self):
        self.assertTrue(EM.es_tarea_publicacion({"titulo": TITULO}, [ASUNTO]))
        self.assertTrue(EM.es_tarea_publicacion({"titulo": TITULO}, [ASUNTO.lower()]))
        self.assertFalse(EM.es_tarea_publicacion({"titulo": TITULO}, ["Ola 21 · otro commit"]))

    def test_el_motivo_del_revisor_incluye_el_sha(self):
        self.assertIn("e02479ebc", L._sha_publicacion(TITULO))


class CierreInmediatoTest(unittest.TestCase):
    def test_primera_revision_cierra_la_publicacion_superada(self):
        acciones = [a for a in decision_revisor(0)["acciones"] if a["tid"] == "AF44EE5B"]
        self.assertEqual(len(acciones), 1)
        self.assertEqual(acciones[0]["accion"], "ya_hecha")
        self.assertIn("e02479ebc", acciones[0]["motivo"])

    def test_tras_dos_reescrituras_sigue_cerrada_sin_escalar(self):
        for veces in (1, 2):
            acciones = [a for a in decision_revisor(veces)["acciones"] if a["tid"] == "AF44EE5B"]
            self.assertEqual("ya_hecha", acciones[0]["accion"], veces)
            self.assertNotIn("reescribir", [a["accion"] for a in acciones])

    def test_otra_tarea_no_publicacion_sigue_reescribiendose(self):
        dec = decision_revisor(0, titulo="Ajustar el panel")
        acciones = [a for a in dec["acciones"] if a["tid"] == "AF44EE5B"]
        self.assertEqual("reescribir", acciones[0]["accion"])


class ReaperturaDelDirectorTest(unittest.TestCase):
    def test_reabrir_vence_al_rechazo_persistido_y_sale_de_los_cierres(self):
        tid = "AF44EE5B"
        with tempfile.TemporaryDirectory() as temporal:
            ruta_json = os.path.join(temporal, "progreso.json")
            ruta_md = os.path.join(temporal, "progreso.md")
            with open(ruta_json, "w", encoding="utf-8") as f:
                json.dump({tid: {"estado": "rechazada", "nota": NOTA}}, f)
            parches = [
                mock.patch.object(enjambre, "PROG_JSON", ruta_json),
                mock.patch.object(enjambre, "PROG_MD", ruta_md),
                mock.patch.object(enjambre, "PROG", {}),
                mock.patch.object(enjambre, "MIAS", {tid}),
                mock.patch.object(enjambre, "REABRIR", set()),
                mock.patch.object(enjambre, "_CERRADAS_DISCO", {"t": 0.0, "ids": frozenset()}),
                mock.patch.object(enjambre, "cerrojo", lambda *_a, **_k: contextlib.nullcontext()),
                mock.patch.object(enjambre, "entregar_mensajes"),
                mock.patch.object(enjambre, "evento"),
                mock.patch.object(enjambre, "consumir_control", return_value={
                    tid: {"accion": "reabrir", "motivo": "se reescribe como tarea:alcance"}}),
            ]
            for parche in parches:
                parche.start()
                self.addCleanup(parche.stop)
            self.assertIn(tid, enjambre.cerradas_en_disco())
            enjambre.atender_control()
            with open(ruta_json, encoding="utf-8") as f:
                guardado = json.load(f)[tid]
            self.assertEqual("pendiente", guardado["estado"])
            self.assertNotIn(enjambre.REAPERTURA_AUTORIZADA, guardado)
            self.assertNotIn(enjambre.REAPERTURA_AUTORIZADA, enjambre.PROG[tid])
            self.assertNotIn(tid, enjambre.cerradas_en_disco())
            self.assertEqual("pendiente", enjambre.PROG[tid]["estado"])


if __name__ == "__main__":
    unittest.main()
