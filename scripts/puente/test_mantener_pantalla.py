"""Pruebas de mantener_pantalla: lógica pura, órdenes por plataforma y ciclo."""

import json
import os
import sys
import unittest
from unittest.mock import MagicMock

import mantener_pantalla as mp


def ajuste(activa: bool, modo: str = "pantalla") -> str:
    return json.dumps({"activa": activa, "modo": modo, "quien": "prueba"})


class LeerAjusteTests(unittest.TestCase):
    def test_activa_true_modo_pantalla(self):
        self.assertEqual(mp.leer_ajuste(ajuste(True)),
                         {"activa": True, "modo": "pantalla"})

    def test_modo_sistema(self):
        self.assertEqual(mp.leer_ajuste(ajuste(True, "sistema")),
                         {"activa": True, "modo": "sistema"})

    def test_json_roto_activa_por_defecto(self):
        self.assertTrue(mp.leer_ajuste("{roto")["activa"])
        self.assertEqual(mp.leer_ajuste("{roto")["modo"], "pantalla")

    def test_vacio_y_no_dict_por_defecto(self):
        self.assertEqual(mp.leer_ajuste(""),
                         {"activa": True, "modo": "pantalla"})
        self.assertEqual(mp.leer_ajuste("[1]"),
                         {"activa": True, "modo": "pantalla"})

    def test_modo_desconocido_cae_a_pantalla(self):
        leido = mp.leer_ajuste(json.dumps({"activa": False, "modo": "raro"}))
        self.assertEqual(leido, {"activa": False, "modo": "pantalla"})


class ElegirHerramientaTests(unittest.TestCase):
    def test_keepalive_gana_en_cualquier_so(self):
        self.assertEqual(mp.elegir_herramienta(
            "darwin", {"keepalive", "caffeinate"}), "keepalive")
        self.assertEqual(mp.elegir_herramienta(
            "linux", {"keepalive", "systemd-inhibit"}), "keepalive")

    def test_macos_cae_a_caffeinate(self):
        self.assertEqual(mp.elegir_herramienta(
            "darwin", {"caffeinate"}), "caffeinate")

    def test_linux_cae_a_systemd_inhibit(self):
        self.assertEqual(mp.elegir_herramienta(
            "linux", {"systemd-inhibit"}), "systemd-inhibit")

    def test_sin_ninguna(self):
        self.assertEqual(mp.elegir_herramienta("win32", set()), "ninguna")
        self.assertEqual(mp.elegir_herramienta("linux", set()), "ninguna")


PID = 4242


class ConstruirOrdenTests(unittest.TestCase):
    def test_keepalive_pantalla(self):
        orden = mp.construir_orden("keepalive", "pantalla", PID)
        self.assertEqual(orden, ["keepalive", "--plain", "--keep-display=true",
                                 "--pid", "4242", "-b", "15"])

    def test_keepalive_sistema(self):
        orden = mp.construir_orden("keepalive", "sistema", PID)
        self.assertIn("--keep-display=false", orden)
        self.assertNotIn("--keep-display=true", orden)
        self.assertIn("--pid", orden)
        self.assertIn(str(PID), orden)

    def test_keepalive_umbral_propio(self):
        orden = mp.construir_orden("keepalive", "pantalla", PID, umbral=40)
        self.assertEqual(orden[-2:], ["-b", "40"])

    def test_caffeinate_pantalla_y_sistema(self):
        self.assertEqual(mp.construir_orden("caffeinate", "pantalla", PID),
                         ["caffeinate", "-dim", "-w", "4242"])
        self.assertEqual(mp.construir_orden("caffeinate", "sistema", PID),
                         ["caffeinate", "-im", "-w", "4242"])

    def test_systemd_inhibit_duerme_solo_el_sistema(self):
        orden = mp.construir_orden("systemd-inhibit", "sistema", PID)
        for esperada in ("--what=sleep:idle", "--mode=block",
                         "sleep", "infinity"):
            self.assertIn(esperada, orden)

    def test_ninguna_vacia_y_desconocida_error(self):
        self.assertEqual(mp.construir_orden("ninguna", "pantalla", PID), [])
        with self.assertRaises(ValueError):
            mp.construir_orden("misterio", "pantalla", PID)


class QueHacerTests(unittest.TestCase):
    def test_activa_sin_hijo_lanza_y_declara(self):
        acciones = mp.que_hacer(True, False, 999)
        self.assertEqual(acciones, ["lanzar_dim", "declarar_usuario"])

    def test_activa_con_hijo_y_55s_declara(self):
        self.assertEqual(mp.que_hacer(True, True, 55), ["declarar_usuario"])

    def test_activa_con_hijo_reciente_nada(self):
        self.assertEqual(mp.que_hacer(True, True, 5), ["nada"])

    def test_inactiva_con_hijo_para(self):
        self.assertEqual(mp.que_hacer(False, True, 0), ["parar_dim"])

    def test_inactiva_sin_hijo_nada(self):
        self.assertEqual(mp.que_hacer(False, False, 0), ["nada"])


def servicio_simulado(escrituras, herramienta):
    popen = MagicMock()
    run = MagicMock()
    reloj = [1000.0]
    popen.return_value.poll.return_value = None

    def escribidor(modo, herramientas, pid):
        escrituras.append({"modo": modo, "herramienta": herramientas,
                           "pid": pid})

    servicio = mp.ServicioPantalla(
        popen, run, ahora=lambda: reloj[0], escribidor=escribidor
    )
    servicio.herramienta = herramienta
    return servicio, popen, run, reloj


class CicloTests(unittest.TestCase):
    def test_caffeinate_lanza_y_declara_usuario(self):
        escrituras: list[dict] = []
        servicio, popen, run, _ = servicio_simulado(escrituras, "caffeinate")
        servicio.ciclo(ajuste(True))
        self.assertEqual(popen.call_args[0][0],
                         ["caffeinate", "-dim", "-w", str(os.getpid())])
        run.assert_called_once_with(
            [mp.CAFFEINATE, "-u", "-t", "60"], timeout=10)
        self.assertIn({"modo": "pantalla", "herramienta": "caffeinate",
                       "pid": os.getpid()}, escrituras)

    def test_keepalive_no_declara_usuario_y_obedece_modo(self):
        escrituras: list[dict] = []
        servicio, popen, run, reloj = servicio_simulado(
            escrituras, "keepalive")
        servicio.ciclo(ajuste(True, "sistema"))
        reloj[0] += 500
        servicio.ciclo(ajuste(True, "sistema"))
        run.assert_not_called()
        orden = popen.call_args[0][0]
        self.assertEqual(orden[0], "keepalive")
        self.assertIn("--keep-display=false", orden)

    def test_inactiva_termina_hijo_y_registra_pid_none(self):
        escrituras: list[dict] = []
        servicio, popen, _, _ = servicio_simulado(escrituras, "keepalive")
        servicio.ciclo(ajuste(True))
        hijo = popen.return_value
        servicio.ciclo(ajuste(False))
        hijo.terminate.assert_called_once()
        self.assertEqual(escrituras[-1]["pid"], None)

    def test_sin_herramienta_avisa_una_vez_y_no_lanza_nada(self):
        escrituras: list[dict] = []
        servicio, popen, run, _ = servicio_simulado(escrituras, "ninguna")
        servicio.ciclo(ajuste(True))
        servicio.ciclo(ajuste(True))
        popen.assert_not_called()
        run.assert_not_called()
        self.assertEqual(escrituras, [{"modo": "pantalla",
                                       "herramienta": "ninguna",
                                       "pid": None}])

    def test_nunca_usa_pkill(self):
        escrituras: list[dict] = []
        servicio, popen, run, reloj = servicio_simulado(
            escrituras, "caffeinate")
        servicio.ciclo(ajuste(True))
        reloj[0] += 60
        servicio.ciclo(ajuste(True))
        servicio.ciclo(ajuste(False))
        for llamada in popen.call_args_list + run.call_args_list:
            self.assertNotIn("pkill", " ".join(llamada[0][0]))


if __name__ == "__main__":
    unittest.main()
