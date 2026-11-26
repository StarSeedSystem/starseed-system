# -*- coding: utf-8 -*-
"""RST06-d2c: el rechazo mecánico reabierto no se deshace ni se repite en bucle.

Objeciones literales cubiertas:
- «reabierta por el director: revisor: rechazo mecánico de las puertas (no tocó
  NINGUNO de sus 1 archivo(s)): se reescribe como tarea:alcance»
- «otra ola ya la cerró (rechazada según progreso.json) → no la repito»
"""
import importlib.util
import os
import sys
import time
import unittest

DIR = os.path.dirname(os.path.abspath(__file__))
RUTA_ENJAMBRE = os.path.join(DIR, "starseed-enjambre.py")
spec = importlib.util.spec_from_file_location("starseed_enjambre", RUTA_ENJAMBRE)
enjambre = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = enjambre
spec.loader.exec_module(enjambre)

DIR_PUENTE = os.path.join(os.path.dirname(DIR), "puente")
if DIR_PUENTE not in sys.path:
    sys.path.insert(0, DIR_PUENTE)

import revisor_bloqueadas_logica as L  # noqa: E402

AHORA = time.mktime(time.strptime("2026-11-21 08:10:02", "%Y-%m-%d %H:%M:%S"))
NOTA = "no toco NINGUNO de los 1 archivos que declaraba"


def _t(minutos_antes=0):
    return time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(AHORA - minutos_antes * 60))


class ReaperturaMecanicaNoSePisa(unittest.TestCase):
    """La fusión de progreso respeta la reapertura explícita de esta tanda."""

    def test_rechazada_en_disco_no_pisa_pendiente_reabierta_de_la_misma_tanda(self):
        memoria = {"RST06-d2b": {"estado": "pendiente", "nota": "revisor: se reescribe como tarea:alcance", "t": _t(0)}}
        disco = {"RST06-d2b": {"estado": "rechazada", "nota": NOTA, "t": _t(5)}}
        fundido = enjambre.fusionar_progreso(memoria, disco, {"RST06-d2b"})
        self.assertEqual(fundido["RST06-d2b"]["estado"], "pendiente")
        self.assertIn("tarea:alcance", fundido["RST06-d2b"]["nota"])

    def test_rechazada_en_disco_si_gana_si_no_es_propia(self):
        # «Ajena» es una tanda con tareas propias que NO incluyen esta: con `propias` vacío
        # no se sabe qué gobierna este orquestador y manda la regla de siempre (la memoria
        # conserva el avance reversible). Aquí la tanda es dueña de otra tarea, no de esta.
        memoria = {"RST06-d2b": {"estado": "pendiente", "nota": "revisor", "t": _t(0)}}
        disco = {"RST06-d2b": {"estado": "rechazada", "nota": NOTA, "t": _t(5)}}
        fundido = enjambre.fusionar_progreso(memoria, disco, {"OTRA"})
        self.assertEqual(fundido["RST06-d2b"]["estado"], "rechazada")

    def test_memoria_vieja_no_resucita_un_rechazo_posterior(self):
        # La reapertura solo gana si su marca es MÁS NUEVA: una copia vieja en memoria no
        # puede borrar la decisión que otro medio acaba de escribir en el disco.
        memoria = {"RST06-d2b": {"estado": "pendiente", "nota": "copia vieja", "t": _t(5)}}
        disco = {"RST06-d2b": {"estado": "rechazada", "nota": "Alex prefiere otro enfoque", "t": _t(0)}}
        fundido = enjambre.fusionar_progreso(memoria, disco, {"RST06-d2b"})
        self.assertEqual(fundido["RST06-d2b"]["estado"], "rechazada")

    def test_reapertura_mas_nueva_gana_aunque_el_rechazo_no_sea_mecanico(self):
        # El director reabrió después del rechazo: su reapertura manda, sea cual sea la nota.
        memoria = {"RST06-d2b": {"estado": "pendiente", "nota": "reabierta por el director", "t": _t(0)}}
        disco = {"RST06-d2b": {"estado": "rechazada", "nota": "Alex prefiere otro enfoque", "t": _t(5)}}
        fundido = enjambre.fusionar_progreso(memoria, disco, {"RST06-d2b"})
        self.assertEqual(fundido["RST06-d2b"]["estado"], "pendiente")

    def test_cierre_real_sigue_ganando(self):
        memoria = {"T1": {"estado": "pendiente", "nota": "x", "t": _t(0)}}
        disco = {"T1": {"estado": "commit", "sha": "abc", "t": _t(1)}}
        fundido = enjambre.fusionar_progreso(memoria, disco, {"T1"})
        self.assertEqual(fundido["T1"]["estado"], "commit")


class RevisorNoRepiteRechazoMecanicoReabierto(unittest.TestCase):
    """Si el revisor ya la reabrió, no debe volver a reescribirla en bucle."""

    def _foto(self, nota_prog="revisor: se reescribe como tarea:alcance", historial=None):
        tid = "RST06-d2b"
        tarea = {"id": tid, "titulo": "", "archivos": ["src/lib/x.ts"], "depende": [], "prompt": "x"}
        prog = {tid: {"estado": "pendiente", "nota": nota_prog, "t": _t(0)}}
        mem = {"historial": list(historial or [])}
        return {
            "tareas": {tid: tarea},
            "colas": {"cola-viva.json": [tid]},
            "cola_viva": "cola-viva.json",
            "progreso": prog,
            "asuntos": [],
            "fallos": {},
            "memoria": mem,
            "ahora": AHORA,
            "head": "abc1234",
        }

    def test_reapertura_reciente_no_genera_otra_reescritura(self):
        hist = [
            {"t": _t(1), "tid": "RST06-d2b", "accion": "reescribir",
             "clase": "tarea:alcance", "motivo": "rechazo mecánico de las puertas: se reescribe como tarea:alcance"},
        ]
        dec = L.decidir(self._foto(historial=hist))
        self.assertEqual([a for a in dec["acciones"] if a["tid"] == "RST06-d2b"], [])

    def test_rechazo_mecanico_rechazado_sigue_reescribiendose(self):
        foto = self._foto()
        foto["progreso"]["RST06-d2b"] = {"estado": "rechazada", "nota": NOTA, "t": _t(1)}
        dec = L.decidir(foto)
        acciones = [a for a in dec["acciones"] if a["tid"] == "RST06-d2b"]
        self.assertEqual(len(acciones), 1)
        self.assertEqual(acciones[0]["accion"], "reescribir")
        self.assertEqual(acciones[0]["clase"], "tarea:alcance")


class CerradasEnDiscoNoApartaElRechazoMecanico(unittest.TestCase):
    """Objeción «otra ola ya la cerró (rechazada según progreso.json) → no la repito»:
    un rechazo mecánico NO cierra la tarea, así que la tanda no la aparta."""

    def test_rechazo_mecanico_no_entra_en_las_cerradas_del_disco(self):
        import json
        import tempfile
        from unittest import mock

        with tempfile.TemporaryDirectory() as temporal:
            ruta = os.path.join(temporal, "progreso.json")
            with open(ruta, "w", encoding="utf-8") as f:
                json.dump(
                    {
                        "RST06-d2b": {"estado": "rechazada", "nota": NOTA},
                        "DEC1": {"estado": "rechazada", "nota": "Alex prefiere otro enfoque"},
                    },
                    f,
                )
            with mock.patch.dict(enjambre._CERRADAS_DISCO, {"t": 0.0, "ids": frozenset()}):
                cerradas = enjambre.cerradas_en_disco(cada_s=0, ruta=ruta)
        self.assertNotIn("RST06-d2b", cerradas)
        self.assertIn("DEC1", cerradas)


if __name__ == "__main__":
    unittest.main()
