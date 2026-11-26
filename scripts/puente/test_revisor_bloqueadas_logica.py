# -*- coding: utf-8 -*-
"""Escalada automática (AUT1121): a la tercera reescritura se reasigna al mejor motor vivo.

Solo se pregunta a Alex cuando no queda ningún motor o cuando la publicación ya está en ``main``.
"""
import os
import sys
import time
import unittest

DIR = os.path.dirname(os.path.abspath(__file__))
if DIR not in sys.path:
    sys.path.insert(0, DIR)

import revisor_bloqueadas_logica as L  # noqa: E402

AHORA = time.mktime(time.strptime("2026-11-21 12:00:00", "%Y-%m-%d %H:%M:%S"))
NOTA = "no toco NINGUNO de los 1 archivos que declaraba"


def _t(minutos_antes):
    return time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(AHORA - minutos_antes * 60))


def hist(tid, veces=2):
    return [{"t": _t(300 - 100 * i), "tid": tid, "accion": "reescribir",
             "clase": "tarea:alcance", "motivo": "rechazo mecánico de las puertas"}
            for i in range(veces)]


def decidir(tid, disponibilidad=None, presupuesto=None, historial=None, asuntos=(),
            titulo=None, archivos=("src/x.ts",)):
    tarea = {"id": tid, "titulo": titulo or "tarea " + tid, "archivos": list(archivos),
             "depende": [], "prompt": "haz " + tid}
    prog = {tid: {"estado": "rechazada", "nota": NOTA, "t": _t(10)}}
    mem = {"historial": hist(tid) if historial is None else historial}
    foto = {"tareas": {tid: tarea}, "colas": {"cola-x.json": [tid]}, "cola_viva": None,
            "progreso": prog, "asuntos": list(asuntos), "fallos": {}, "memoria": mem,
            "ahora": AHORA, "head": "abc1234", "disponibilidad": disponibilidad or {},
            "presupuesto": presupuesto or {}}
    return L.decidir(foto)


def accion_de(dec, tid):
    return [a for a in dec["acciones"] if a["tid"] == tid]


class EscaladaAutomatica(unittest.TestCase):
    """La tercera reescritura ya no pregunta: reasigna al motor vivo de la escalera."""

    def test_modelo_gratuito_con_contexto_del_fallo(self):
        dec = decidir("MT1", disponibilidad={"modelos_libres": ["openrouter/free/gemma"]},
                      presupuesto={"fecha": "2026-11-21", "libre": 0})
        a = accion_de(dec, "MT1")[0]
        self.assertEqual(a["accion"], "reasignar")
        self.assertEqual(a["datos"]["modelo_siguiente"], "openrouter/free/gemma")
        self.assertTrue(a["datos"]["no_cuenta"])
        self.assertIn("3ª vez", a["motivo"])
        self.assertIn(NOTA, a["datos"]["mensaje"])
        self.assertIn("Reescritura automática por rechazo mecánico", a["datos"]["mensaje"])

    def test_agy_cuando_no_hay_gratuitos(self):
        dec = decidir("MT2", disponibilidad={"modelos_libres": [], "agy": True},
                      presupuesto={"fecha": "2026-11-21", "agy_mecanicos": 0,
                                   "agy_complejos": 0, "agy_fallback": 0})
        a = accion_de(dec, "MT2")[0]
        self.assertEqual(a["accion"], "reasignar")
        self.assertIn("agy/", a["datos"]["modelo_siguiente"])

    def test_opus_para_diseno_y_arquitectura(self):
        for tid, titulo in (("DIS1", "Diseñar interfaz nueva"),
                            ("ARQ1", "Arquitectura del motor nuevo")):
            dec = decidir(tid, titulo=titulo,
                          disponibilidad={"modelos_libres": [], "agy": True,
                                          "claude_mac": True},
                          presupuesto={"fecha": "2026-11-21", "agy_mecanicos": 40,
                                       "agy_complejos": 16, "agy_fallback": 30,
                                       "claude_mac_opus": 0})
            a = accion_de(dec, tid)[0]
            self.assertEqual(a["accion"], "reasignar", titulo)
            self.assertEqual(a["datos"]["modelo_siguiente"], "claude-opus-5-5", titulo)

    def test_hasta_la_tercera_no_se_gasta_un_motor_fuerte(self):
        dec = decidir("MT3", historial=hist("MT3", 1),
                      disponibilidad={"modelos_libres": ["openrouter/free/gemma"]})
        self.assertEqual(accion_de(dec, "MT3")[0]["accion"], "reescribir")


class SoloPideAAlexComoUltimoRecurso(unittest.TestCase):
    def test_pide_a_alex_solo_sin_motor(self):
        agotado = decidir("MT5", disponibilidad={"modelos_libres": [], "agy": False,
                                                 "claude_mac": False, "codex_ok": False},
                          presupuesto={"fecha": "2026-11-21", "a1": 1})
        a = accion_de(agotado, "MT5")[0]
        self.assertEqual(a["accion"], "pedir_a_alex")
        self.assertIn("escalar_a_codex", a["datos"]["opciones"])
        self.assertEqual(accion_de(decidir("MT6"), "MT6")[0]["accion"], "pedir_a_alex")


class PublicacionesSuperadas(unittest.TestCase):
    """«Desbloquear la publicación <sha>» se cierra sola si ese sha ya está en main."""

    SHA = "a1b2c3d4"

    def _decidir(self, asuntos):
        return decidir("PUB1", titulo="Desbloquear la publicación " + self.SHA, archivos=(),
                       asuntos=asuntos,
                       disponibilidad={"modelos_libres": ["openrouter/free/gemma"]})

    def test_superada_se_cierra_sola(self):
        a = accion_de(self._decidir(["Ola 21 · se publicó " + self.SHA]), "PUB1")[0]
        self.assertEqual(a["accion"], "ya_hecha")
        self.assertIn(self.SHA, a["motivo"])

    def test_viva_sigue_escalando(self):
        a = accion_de(self._decidir(["Ola 21 · otro commit"]), "PUB1")[0]
        self.assertEqual(a["accion"], "reasignar")


class PublicacionSuperadaAlPrimerRechazo(unittest.TestCase):
    """AF26FCCD1: el título REAL (con paréntesis) se cierra al PRIMER rechazo mecánico.

    El bucle de la objeción salía de dos fallos juntos: el patrón no reconocía los
    paréntesis de «Desbloquear la publicación (60dc6e227)», y la comprobación de
    publicación solo se hacía a la tercera reescritura. Así la tarea se reescribía
    dos veces y la tanda la apartaba con «otra ola ya la cerró».
    """

    SHA = "60dc6e227"

    def _decidir(self, asuntos):
        return decidir("AF26FCCD1",
                       titulo="URGENTE · Desbloquear la publicación (%s)" % self.SHA,
                       archivos=("scripts/puente/x.py",), historial=[], asuntos=asuntos,
                       disponibilidad={"modelos_libres": ["openrouter/free/gemma"]})

    def test_primer_rechazo_con_sha_en_main_cierra_sin_reescribir(self):
        a = accion_de(self._decidir(["relevo: integrar %s en main" % self.SHA]),
                      "AF26FCCD1")[0]
        self.assertEqual(a["accion"], "ya_hecha")
        self.assertIn(self.SHA, a["motivo"])

    def test_primer_rechazo_sin_sha_en_main_sigue_su_curso(self):
        a = accion_de(self._decidir(["otro commit sin el sha"]), "AF26FCCD1")[0]
        self.assertNotEqual(a["accion"], "ya_hecha")


class PublicacionRechazadaMecanicamente(unittest.TestCase):
    """A018C6A91: una «Desbloquear la publicación <sha>» rechazada mecánicamente (no tocó
    archivos) se cierra en el PRIMER rechazo si el sha ya está en main, sin reescribirla."""

    SHA = "70f48b3c2"

    def _decidir(self, historial, asuntos=None):
        return decidir("A018C6A91", titulo="URGENTE · Desbloquear la publicación (%s)" % self.SHA,
                       archivos=("scripts/x.ts",),
                       asuntos=["Ola 22 · publicada " + self.SHA] if asuntos is None else asuntos,
                       historial=historial,
                       disponibilidad={"modelos_libres": ["openrouter/free/gemma"]})

    def test_primer_rechazo_cierra_sola(self):
        a = accion_de(self._decidir([]), "A018C6A91")[0]
        self.assertEqual(a["accion"], "ya_hecha")
        self.assertIn(self.SHA, a["motivo"])

    def test_primer_rechazo_no_se_reescribe(self):
        a = accion_de(self._decidir([]), "A018C6A91")[0]
        self.assertNotEqual(a["accion"], "reescribir")

    def test_sin_sha_en_main_sigue_reescribiendo(self):
        a = accion_de(self._decidir([], asuntos=["Ola 22 · otro commit"]), "A018C6A91")[0]
        self.assertEqual(a["accion"], "reescribir")


if __name__ == "__main__":
    unittest.main()
