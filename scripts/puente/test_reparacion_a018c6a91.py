# -*- coding: utf-8 -*-
"""Reparación de la objeción literal de A018C6A91 (publicación 70f48b3c2, 22-11).

Cada prueba cubre uno de los cuatro eventos del canal que motivaron la reapertura:
el título real con el SHA entre paréntesis, los dos rechazos mecánicos («no tocó
NINGUNO de sus 1 archivo(s)») y el cierre por otra ola («rechazada según
progreso.json»). Sin red: solo la foto que recibe el revisor de bloqueadas y el
registro de cerradas del orquestador.
"""
import importlib.util
import json
import os
import sys
import tempfile
import time
import unittest
from unittest import mock

DIR = os.path.dirname(os.path.abspath(__file__))
if DIR not in sys.path:
    sys.path.insert(0, DIR)

import escalada_motores as EM  # noqa: E402
import revisor_bloqueadas_logica as L  # noqa: E402

_RUTA_ENJAMBRE = os.path.join(os.path.dirname(DIR), "enjambre", "starseed-enjambre.py")
_ESPEC = importlib.util.spec_from_file_location("enjambre_a018c6a91", _RUTA_ENJAMBRE)
if _ESPEC is None or _ESPEC.loader is None:
    raise RuntimeError("no se pudo cargar el orquestador: %s" % _RUTA_ENJAMBRE)
E = importlib.util.module_from_spec(_ESPEC)
sys.modules["enjambre_a018c6a91"] = E
_ESPEC.loader.exec_module(E)

AHORA = time.mktime(time.strptime("2026-11-22 12:00:00", "%Y-%m-%d %H:%M:%S"))
TITULO = "URGENTE · Desbloquear la publicación (70f48b3c2)"
SHA = "70f48b3c2"
NOTA = "revisor: rechazo mecánico de las puertas (no tocó NINGUNO de sus 1 archivo(s)): se reescribe como tarea:alcance"
TID = "A018C6A91"


def _t(minutos_antes):
    return time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(AHORA - minutos_antes * 60))


def _decidir(veces=0, asuntos=()):
    """Foto del revisor con `veces` reescrituras previas en la cadena."""
    tarea = {"id": TID, "titulo": TITULO, "archivos": ["scripts/puente/x.py"],
             "depende": [], "prompt": "desbloquea la publicación"}
    prog = {TID: {"estado": "rechazada", "nota": NOTA, "t": _t(5)}}
    hist = [{"t": _t(300 - 60 * i), "tid": TID, "accion": "reescribir",
             "clase": "tarea:alcance", "motivo": "rechazo mecánico de las puertas"}
            for i in range(veces)]
    foto = {"tareas": {TID: tarea}, "colas": {"cola-a.json": [TID]},
            "cola_viva": None, "progreso": prog, "asuntos": list(asuntos),
            "fallos": {}, "memoria": {"historial": hist}, "ahora": AHORA,
            "head": SHA,
            "disponibilidad": {"modelos_libres": ["openrouter/free/gemma"]},
            "presupuesto": {"fecha": "2026-11-22", "libre": 0}}
    return L.decidir(foto)


class ObjecionA018C6A91(unittest.TestCase):
    """Un evento del canal, una prueba: ninguno se queda sin reparación."""

    def _accion(self, veces=0, asuntos=()):
        return [a for a in _decidir(veces, asuntos)["acciones"] if a["tid"] == TID][0]

    def test_1_titulo_real_extrae_el_sha_entre_parentesis(self):
        """Punto 1: «Desbloquear la publicación (70f48b3c2)» lleva el SHA entre paréntesis."""
        self.assertEqual(L._sha_publicacion(TITULO), SHA)
        self.assertEqual(L._sha_publicacion("Desbloquear la publicación " + SHA), SHA)
        self.assertTrue(EM.es_tarea_publicacion(
            {"titulo": TITULO, "archivos": []}, ["Ola 22 · publicó " + SHA]))
        self.assertFalse(EM.es_tarea_publicacion(
            {"titulo": TITULO, "archivos": []}, ["Ola 22 · otro commit"]))

    def test_2_primer_rechazo_cierra_si_ya_esta_publicado(self):
        """Punto 2: el primer rechazo mecánico cierra la tarea si el SHA ya está en main."""
        a = self._accion(veces=0, asuntos=["Ola 22 · publicó " + SHA])
        self.assertEqual(a["accion"], "ya_hecha")
        self.assertEqual(a["datos"]["estado"], "commit")
        self.assertIn(SHA, a["motivo"])

    def test_3_segundo_rechazo_tambien_cierra_sin_reescribir(self):
        """Punto 3: la segunda reapertura no vuelve a reescribirla como tarea:alcance."""
        a = self._accion(veces=1, asuntos=["Ola 22 · publicó " + SHA])
        self.assertEqual(a["accion"], "ya_hecha")
        self.assertNotEqual(a["accion"], "reescribir")

    def test_4_el_orquestador_no_la_da_por_cerrada_si_es_rechazo_mecanico(self):
        """Punto 4: «otra ola ya la cerró (rechazada)» no puede pasar con un rechazo
        mecánico: el orquestador NO lo trata como estado irreversible en disco."""
        self.assertTrue(E.es_rechazo_mecanico({"estado": "rechazada", "nota": NOTA}))
        self.assertFalse(E.es_rechazo_mecanico(
            {"estado": "rechazada", "nota": "Alex prefiere otro enfoque"}))
        with tempfile.TemporaryDirectory() as carpeta:
            ruta = os.path.join(carpeta, "progreso.json")
            with open(ruta, "w", encoding="utf-8") as f:
                json.dump({TID: {"estado": "rechazada", "nota": NOTA},
                           "DEC1": {"estado": "rechazada", "nota": "decisión de Alex"}}, f)
            with mock.patch.dict(E._CERRADAS_DISCO, {"t": 0.0, "ids": frozenset()}):
                cerradas = E.cerradas_en_disco(cada_s=0, ruta=ruta)
        self.assertEqual(cerradas, frozenset({"DEC1"}))

    def test_guardia_sin_sha_en_main_sigue_reescribiendo(self):
        """Si la publicación no pasó, el primer fallo sí se reescribe (no se cierra de más)."""
        a = self._accion(veces=0, asuntos=["Ola 22 · otro commit"])
        self.assertEqual(a["accion"], "reescribir")
        self.assertEqual(a["clase"], "tarea:alcance")


if __name__ == "__main__":
    unittest.main()
