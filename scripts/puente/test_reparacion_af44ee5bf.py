# -*- coding: utf-8 -*-
"""Reparación de la objeción literal de AF44EE5BF (20-11).

Cada evento del canal tiene su prueba: el SHA del título, los dos rechazos
mecánicos y las dos veces que la tanda dijo «otra ola ya la cerró». Sin red,
sin disco real y sin git: solo las fotos que reciben el revisor y el enjambre.
"""
import importlib.util
import json
import os
import sys
import tempfile
import time
import unittest

DIR = os.path.dirname(os.path.abspath(__file__))
if DIR not in sys.path:
    sys.path.insert(0, DIR)

import escalada_motores as EM  # noqa: E402
import revisor_bloqueadas_logica as L  # noqa: E402

RUTA_ENJAMBRE = os.path.join(os.path.dirname(DIR), "enjambre", "starseed-enjambre.py")
ESPEC = importlib.util.spec_from_file_location("enjambre_af44", RUTA_ENJAMBRE)
assert ESPEC is not None and ESPEC.loader is not None
enjambre = importlib.util.module_from_spec(ESPEC)
sys.modules["enjambre_af44"] = enjambre
ESPEC.loader.exec_module(enjambre)

AHORA = time.mktime(time.strptime("2026-11-20 12:30:00", "%Y-%m-%d %H:%M:%S"))
TID = "AF44EE5BF"
TITULO = "URGENTE · Desbloquear la publicación (e02479ebc)"
SHA = "e02479ebc"
NOTA = ("revisor: rechazo mecánico de las puertas (no tocó NINGUNO de sus 1 "
        "archivo(s)): se reescribe como tarea:alcance")
CIERRE = "otra ola ya la cerró (rechazada según progreso.json) → no la repito"
ASUNTOS = ["Ola 1119 · publicado " + SHA + "ce49", "Ola 1120 · MGP1119-4A64DC"]


def _t(minutos_antes):
    return time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(AHORA - minutos_antes * 60))


def _decidir(veces=0, asuntos=ASUNTOS, nota=NOTA):
    """Foto del revisor con `veces` reescrituras previas en la cadena."""
    tarea = {"id": TID, "titulo": TITULO, "archivos": ["src/lib/x.ts"],
             "depende": [], "prompt": "desbloquea la publicación"}
    prog = {TID: {"estado": "rechazada", "nota": nota, "t": _t(5)}}
    hist = [{"t": _t(300 - 60 * i), "tid": TID, "accion": "reescribir",
             "clase": "tarea:alcance", "motivo": "rechazo mecánico de las puertas"}
            for i in range(veces)]
    foto = {"tareas": {TID: tarea}, "colas": {"cola-a.json": [TID]},
            "cola_viva": None, "progreso": prog, "asuntos": list(asuntos),
            "fallos": {}, "memoria": {"historial": hist}, "ahora": AHORA,
            "head": SHA, "disponibilidad": {"modelos_libres": ["openrouter/free/gemma"]},
            "presupuesto": {"fecha": "2026-11-20", "libre": 0}}
    return L.decidir(foto)


class ObjecionAF44EE5BF(unittest.TestCase):
    """Un evento del canal, una prueba: ninguno se queda sin reparación."""

    def _accion(self, veces=0, asuntos=ASUNTOS, nota=NOTA):
        return [a for a in _decidir(veces, asuntos, nota)["acciones"] if a["tid"] == TID][0]

    def test_1_inicio_reconoce_el_sha_entre_parentesis(self):
        self.assertEqual(L._sha_publicacion(TITULO), SHA)
        self.assertTrue(EM.es_tarea_publicacion({"titulo": TITULO}, ASUNTOS))
        self.assertFalse(EM.es_tarea_publicacion({"titulo": TITULO}, ["Ola 1120 · otro commit"]))

    def test_2_primer_rechazo_cierra_si_ya_esta_publicado(self):
        a = self._accion()
        self.assertEqual(a["accion"], "ya_hecha")
        self.assertEqual(a["datos"]["estado"], "commit")
        self.assertIn(SHA, a["motivo"])

    def test_3_primera_ola_no_la_aparta_como_cerrada(self):
        with tempfile.TemporaryDirectory() as temporal:
            ruta = os.path.join(temporal, "progreso.json")
            with open(ruta, "w", encoding="utf-8") as f:
                json.dump({TID: {"estado": "rechazada", "nota": NOTA + " | " + CIERRE}}, f)
            self.assertNotIn(TID, enjambre.cerradas_en_disco(cada_s=0, ruta=ruta))

    def test_4_segundo_rechazo_tambien_cierra_sin_reescribir(self):
        a = self._accion(veces=1)
        self.assertEqual(a["accion"], "ya_hecha")
        self.assertNotIn("reescribir", a["motivo"])

    def test_5_segunda_ola_no_le_pisa_la_reapertura(self):
        memoria = {TID: {"estado": "pendiente", "nota": "revisor: rechazo mecánico de las puertas"}}
        disco = {TID: {"estado": "rechazada", "nota": NOTA + " | " + CIERRE}}
        self.assertEqual(memoria[TID], enjambre.fusionar_progreso(memoria, disco, {TID})[TID])

    def test_6_sin_el_sha_no_cierra_de_mas(self):
        a = self._accion(asuntos=["Ola 1120 · otro commit"])
        self.assertEqual(a["accion"], "reescribir")
