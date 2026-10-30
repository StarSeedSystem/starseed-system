# -*- coding: utf-8 -*-
"""Pruebas de IND1029C: la autopublicación y la autocuración solo tocan lo compartido si son
líderes de dirección. El líder se inyecta; nada sale a la red ni toca `~/.starseed`.
"""
import os
import shutil
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import autocuracion_mando as AC  # noqa: E402
import autopublicar as AP  # noqa: E402
from test_autopublicar import Falso, SHA, T0, run  # noqa: E402


def no_lider(dueno="mac-2"):
    return lambda: {"soy": False, "motivo": "dueño: %s" % dueno,
                    "arriendo": {"dueno": dueno}}


def lider(dueno="a1"):
    return lambda: {"soy": True, "motivo": "líder vigente", "arriendo": {"dueno": dueno}}


class AutopublicarSoloLider(unittest.TestCase):
    def test_sin_lider_no_publica_ni_sube_el_candidato_y_lo_dice(self):
        m = Falso()
        e = AP.pasada(m, {}, T0, lider_fn=no_lider("mac-2"))
        self.assertEqual((e["fase"], e["detalle"]), ("esperando", "espera: dirige mac-2"))
        self.assertFalse(e["es_lider"])
        self.assertEqual(m.pushes, [])

    def test_sin_lider_tampoco_empuja_main_desde_el_ci(self):
        m = Falso(runs=[run("completed", "success")])
        base = {"fase": "ci", "sha": SHA, "desde": T0}
        e = AP.pasada(m, base, T0 + 60, lider_fn=no_lider())
        self.assertEqual(e["fase"], "esperando")
        self.assertEqual(m.pushes, [])

    def test_el_lider_publica_como_siempre(self):
        m = Falso()
        e = AP.pasada(m, {}, T0, lider_fn=lider())
        self.assertEqual(e["fase"], "ci")
        self.assertEqual(m.pushes[-1][-1], "%s:refs/heads/produccion/candidato" % SHA)

    def test_sin_arriendo_dice_el_motivo_del_liderazgo(self):
        r = {"soy": False, "motivo": "dueño: oracle-a1-7", "arriendo": None}
        self.assertEqual(AP.quien_dirige(r), "dueño: oracle-a1-7")


class AutocuracionSoloLider(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="lider-serv-")
        self._estado, self._pub = AC.ESTADO, AC.PUBLICACION
        AC.ESTADO = os.path.join(self.tmp, "autocuracion.json")
        AC.PUBLICACION = os.path.join(self.tmp, "publicacion.json")
        self.avisos, self.reinicios, self.limpiezas = [], [], []
        self.aplicadas, self.busquedas, self.traidas = [], [], []
        self.levantados = []

    def tearDown(self):
        AC.ESTADO, AC.PUBLICACION = self._estado, self._pub
        shutil.rmtree(self.tmp, True)

    def _revisar(self, sondas, libre, lider_fn, decision=None, ahora=100_000):
        it = iter(sondas)
        decision = decision or {"puede": False}
        return AC.revisar(
            asignar_fn=lambda: (decision, lambda: self.aplicadas.append(1) or ["cola viva actualizada"]),
            buscar_fn=lambda: self.busquedas.append(ahora) or {"sumados": 1, "hechas": ["lanzando 1 job"]},
            traer_fn=lambda: self.traidas.append(ahora) or True,
            ahora=ahora, sondear_fn=lambda: next(it), reiniciar_fn=lambda: self.reinicios.append(1),
            limpiar_fn=lambda ids: (self.limpiezas.append(ids) or {"ok": True, "limpiados": list(ids)}),
            libre_fn=lambda: libre, avisar_fn=self.avisos.append, dormir=lambda s: None,
            curar_fn=lambda estado, ahora, forzar: "orden al enjambre",
            servicios_fn=lambda: {"estado": "ok", "detalle": ""},
            medidores_fn=lambda ahora: self.levantados, lider_fn=lider_fn)

    def test_sin_lider_sigue_reparando_su_propia_maquina(self):
        e = self._revisar([False, False, False], 4.0, no_lider("mac-2"))
        self.assertEqual(len(self.reinicios), 1)
        self.assertEqual(len(self.limpiezas), 1)
        self.assertEqual(e["espera"], "espera: dirige mac-2")
        self.assertFalse(e["es_lider"])

    def test_sin_lider_no_llena_busca_trae_medidores_ni_ordena_al_enjambre(self):
        self.levantados = ["codex"]
        e = self._revisar([True], 20.0, no_lider("mac-2"),
                          decision={"puede": True, "huecos": 2, "meter": ["PA1005D"]})
        self.assertEqual((self.aplicadas, self.busquedas, self.traidas), ([], [], []))
        self.assertFalse(any("medidor" in h or "orden al enjambre" in h for h in e["hechos"]))
        self.assertIn("espera: dirige mac-2", e["hechos"])

    def test_el_lider_hace_todo_como_antes(self):
        e = self._revisar([True], 20.0, lider(),
                          decision={"puede": True, "huecos": 2, "meter": ["PA1005D"]})
        self.assertEqual(self.aplicadas, [1])
        self.assertEqual((self.busquedas, self.traidas), ([100_000], [100_000]))
        self.assertTrue(e["es_lider"])
        self.assertNotIn("espera", e)
