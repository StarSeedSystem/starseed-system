# -*- coding: utf-8 -*-
"""Reparación de la objeción literal de A900E21C0 (20-11).

Cada prueba cubre uno de los cuatro eventos del canal que motivaron la reapertura:
el título real con el SHA entre paréntesis, los dos rechazos mecánicos y el cierre
por otra ola. Sin red, sin disco: solo la foto que recibe el revisor de bloqueadas.
"""
import os
import sys
import time
import unittest

DIR = os.path.dirname(os.path.abspath(__file__))
if DIR not in sys.path:
    sys.path.insert(0, DIR)

import escalada_motores as EM  # noqa: E402
import revisor_bloqueadas_logica as L  # noqa: E402

AHORA = time.mktime(time.strptime("2026-11-20 12:00:00", "%Y-%m-%d %H:%M:%S"))
TITULO = "URGENTE · Desbloquear la publicación (dbbf0ff6e)"
SHA = "dbbf0ff6e"
NOTA = "no toco NINGUNO de los 1 archivos que declaraba"
TID = "A900E21C0"


def _t(minutos_antes):
    return time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(AHORA - minutos_antes * 60))


def _decidir(veces=0, asuntos=()):
    """Foto del revisor con `veces` reescrituras previas en la cadena."""
    tarea = {"id": TID, "titulo": TITULO, "archivos": ["src/lib/x.ts"],
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
            "presupuesto": {"fecha": "2026-11-20", "libre": 0}}
    return L.decidir(foto)


class ObjecionA900E21C0(unittest.TestCase):
    """Un evento del canal, una prueba: ninguno se queda sin reparación."""

    def _accion(self, veces=0, asuntos=()):
        return [a for a in _decidir(veces, asuntos)["acciones"] if a["tid"] == TID][0]

    def test_1_titulo_real_extrae_el_sha_entre_parentesis(self):
        """Punto 1: el título que genera prioridad_desbloqueo lleva el SHA entre paréntesis."""
        self.assertEqual(L._sha_publicacion(TITULO), SHA)
        self.assertTrue(EM.es_tarea_publicacion(
            {"titulo": TITULO, "archivos": []}, ["Ola 21 · publicó " + SHA]))
        self.assertFalse(EM.es_tarea_publicacion(
            {"titulo": TITULO, "archivos": []}, ["Ola 21 · otro commit"]))

    def test_2_primer_rechazo_cierra_si_ya_esta_publicado(self):
        """Punto 2: el primer rechazo mecánico cierra la tarea si el SHA ya está en main."""
        a = self._accion(veces=0, asuntos=["Ola 21 · publicó " + SHA])
        self.assertEqual(a["accion"], "ya_hecha")
        self.assertEqual(a["datos"]["estado"], "commit")
        self.assertIn(SHA, a["motivo"])

    def test_3_segundo_rechazo_tambien_cierra_sin_reescribir(self):
        """Punto 3: la segunda reapertura no vuelve a reescribirla como tarea:alcance."""
        a = self._accion(veces=1, asuntos=["Ola 21 · publicó " + SHA])
        self.assertEqual(a["accion"], "ya_hecha")
        self.assertNotIn("reescribir", a["motivo"])

    def test_4_tercer_rechazo_cierra_en_lugar_de_escalar(self):
        """Punto 4: agotadas las reescrituras se cierra; otra ola no la ve «rechazada»."""
        a = self._accion(veces=2, asuntos=["Ola 21 · publicó " + SHA])
        self.assertEqual(a["accion"], "ya_hecha")
        self.assertEqual(a["datos"]["estado"], "commit")
        self.assertNotIn("pedir_a_alex", a["accion"])

    def test_guardia_sin_sha_en_main_sigue_reescribiendo(self):
        """Si la publicación no pasó, el primer fallo sí se reescribe (no se cierra de más)."""
        a = self._accion(veces=0, asuntos=["Ola 21 · otro commit"])
        self.assertEqual(a["accion"], "reescribir")
        self.assertEqual(a["clase"], "tarea:alcance")


if __name__ == "__main__":
    unittest.main()
