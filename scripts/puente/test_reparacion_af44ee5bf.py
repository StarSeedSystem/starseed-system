# -*- coding: utf-8 -*-
"""Reparación AF44EE5BF: reabrir tras rechazo mecánico y publicación ya en main."""
import contextlib
import importlib.util
import json
import os
import sys
import tempfile
import time
import unittest
from unittest import mock

RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SCRIPTS = os.path.join(RAIZ, "scripts")
for ruta in (SCRIPTS, os.path.join(SCRIPTS, "enjambre"), os.path.join(SCRIPTS, "puente")):
    if ruta not in sys.path:
        sys.path.insert(0, ruta)

import revisor_bloqueadas_logica as L  # noqa: E402

ESPEC = importlib.util.spec_from_file_location(
    "enjambre_reparacion", os.path.join(SCRIPTS, "enjambre", "starseed-enjambre.py"))
enjambre = importlib.util.module_from_spec(ESPEC)
sys.modules["enjambre_reparacion"] = enjambre
ESPEC.loader.exec_module(enjambre)

AHORA = time.mktime(time.strptime("2026-11-21 12:00:00", "%Y-%m-%d %H:%M:%S"))
NOTA = "no toco NINGUNO de los 1 archivos que declaraba"
TID = "AF44EE5BF"
SHA = "e02479ebc"


def decidir(titulo, asuntos, historial=()):
    tarea = {"id": TID, "titulo": titulo, "archivos": ["src/lib/x.ts"],
             "depende": [], "prompt": "desbloquea la publicación"}
    prog = {TID: {"estado": "rechazada", "nota": NOTA}}
    foto = {"tareas": {TID: tarea}, "colas": {"cola-x.json": [TID]}, "cola_viva": None,
            "progreso": prog, "asuntos": list(asuntos), "fallos": {},
            "memoria": {"historial": list(historial)}, "ahora": AHORA,
            "head": "abc1234", "disponibilidad": {}, "presupuesto": {}}
    return L.decidir(foto)


def accion_de(dec):
    return [a for a in dec["acciones"] if a["tid"] == TID]


class ReaperturaDelDirector(unittest.TestCase):
    def test_reabierta_no_salta_por_cerrada_en_disco(self):
        with tempfile.TemporaryDirectory() as temporal:
            ruta = os.path.join(temporal, "progreso.json")
            with open(ruta, "w", encoding="utf-8") as f:
                json.dump({TID: {"estado": "rechazada", "nota": NOTA}}, f)
            with open(ruta, encoding="utf-8") as f:
                prog = json.load(f)
            parches = [
                mock.patch.object(enjambre, "PROG", prog),
                mock.patch.object(enjambre, "PROG_JSON", ruta),
                mock.patch.object(enjambre, "PROG_MD", os.path.join(temporal, "progreso.md")),
                mock.patch.object(enjambre, "MIAS", {TID}),
                mock.patch.object(enjambre, "REABRIR", set()),
                mock.patch.object(enjambre, "_CERRADAS_DISCO", {"t": 0.0, "ids": frozenset()}),
                mock.patch.object(enjambre, "cerrojo", lambda *_a, **_k: contextlib.nullcontext()),
                mock.patch.object(enjambre, "consumir_control", return_value={
                    TID: {"accion": "reabrir", "motivo": "revisor: rechazo mecánico"}}),
                mock.patch.object(enjambre, "entregar_mensajes"),
                mock.patch.object(enjambre, "evento"),
            ]
            for parche in parches:
                parche.start()
                self.addCleanup(parche.stop)
            enjambre.cerradas_en_disco(cada_s=0, ruta=ruta)
            enjambre.atender_control()
            with open(ruta, encoding="utf-8") as f:
                estado = json.load(f)[TID]["estado"]
            self.assertEqual("pendiente", estado)
            self.assertNotIn(TID, enjambre.cerradas_en_disco(cada_s=3600, ruta=ruta))


class PublicacionYaEnMain(unittest.TestCase):
    def test_publicacion_entre_parentesis_se_cierra_sola(self):
        titulo = "URGENTE · Desbloquear la publicación (%s)" % SHA
        dec = decidir(titulo, ["Ola 1119 · publicado %s" % SHA])
        acciones = accion_de(dec)
        self.assertEqual(["ya_hecha"], [a["accion"] for a in acciones])
        self.assertIn(SHA, acciones[0]["motivo"])
        self.assertEqual("no_aplica", acciones[0]["datos"]["estado"])

    def test_publicacion_ausente_sigue_el_camino_normal(self):
        titulo = "URGENTE · Desbloquear la publicación (%s)" % SHA
        dec = decidir(titulo, ["Ola 1119 · publicado otra-cosa"])
        self.assertEqual(["reescribir"], [a["accion"] for a in accion_de(dec)])


if __name__ == "__main__":
    unittest.main()
