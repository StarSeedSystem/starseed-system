"""Pruebas de mantener_pantalla: lógica pura y ciclo con lanzadores inyectados."""

import json
import unittest
from unittest.mock import MagicMock

import mantener_pantalla as mp
from pantalla_logica import construir_orden, estado_despierto, leer_modo


def ajuste(modo):
    return json.dumps({"modo": modo, "desde": None, "quien": "prueba"})


class LeerModoTests(unittest.TestCase):
    def test_modos_validos(self):
        self.assertEqual(leer_modo(ajuste("pantalla")), "pantalla")
        self.assertEqual(leer_modo(ajuste("sistema")), "sistema")

    def test_modo_desconocido_apaga(self):
        self.assertIsNone(leer_modo(ajuste("otro")))

    def test_roto_o_vacio_enciende_pantalla(self):
        self.assertEqual(leer_modo("{roto"), "pantalla")
        self.assertEqual(leer_modo(""), "pantalla")

    def test_json_valido_que_no_es_objeto_enciende_pantalla(self):
        self.assertEqual(leer_modo("[1]"), "pantalla")

    def test_compatibilidad_activa(self):
        self.assertIsNone(leer_modo(json.dumps({"activa": False})))
        self.assertEqual(leer_modo(json.dumps({"activa": True})), "pantalla")


class ConstruirOrdenTests(unittest.TestCase):
    def test_keepalive_pantalla_y_sistema(self):
        self.assertEqual(
            construir_orden("darwin", "pantalla", 42, True),
            ["keepalive", "--plain", "--keep-display=true", "--pid", "42", "-b", "15"],
        )
        self.assertEqual(
            construir_orden("linux", "sistema", 7, True, 30),
            ["keepalive", "--plain", "--keep-display=false", "--pid", "7", "-b", "30"],
        )

    def test_macos_sin_keepalive(self):
        self.assertEqual(
            construir_orden("darwin", "pantalla", 42, False),
            ["/usr/bin/caffeinate", "-dim", "-w", "42"],
        )
        self.assertEqual(
            construir_orden("darwin", "sistema", 42, False),
            ["/usr/bin/caffeinate", "-i", "-w", "42"],
        )

    def test_linux_sin_keepalive_inhibe_sueno(self):
        orden = construir_orden("linux", "sistema", 42, False) or []
        self.assertEqual(orden[0], "systemd-inhibit")
        self.assertIn("--what=sleep:idle", orden)

    def test_keepalive_manda_aunque_el_so_no_lo_conozca(self):
        orden = construir_orden("win32", "pantalla", 42, True) or []
        self.assertEqual(orden[0], "keepalive")
        self.assertIn("--keep-display=true", orden)

    def test_systemd_inhibit_bloquea_sueno_e_idle_sin_fin(self):
        orden = construir_orden("linux", "sistema", 42, False) or []
        for esperada in ("--what=sleep:idle", "--mode=block", "sleep", "infinity"):
            self.assertIn(esperada, orden)

    def test_sin_herramienta_o_apagado(self):
        self.assertIsNone(construir_orden("win32", "sistema", 42, False))
        self.assertIsNone(construir_orden("darwin", None, 42, True))


class EstadoTests(unittest.TestCase):
    def test_estado_activo_y_apagado(self):
        self.assertEqual(
            estado_despierto("sistema", ["keepalive"], 42),
            {"modo": "sistema", "herramienta": "keepalive", "pid": 42},
        )
        self.assertEqual(
            estado_despierto(None, None, 42),
            {"modo": None, "herramienta": None, "pid": 42},
        )


def servicio_simulado(plataforma="darwin", keepalive=False):
    popen = MagicMock()
    popen.return_value.poll.return_value = None
    escritos = []
    servicio = mp.ServicioPantalla(
        lanzador=popen,
        plataforma=plataforma,
        hay_keepalive=keepalive,
        pid=42,
        escritor=escritos.append,
    )
    return servicio, popen, escritos


class CicloTests(unittest.TestCase):
    def test_pantalla_lanza_caffeinate_y_escribe_estado(self):
        servicio, popen, escritos = servicio_simulado()
        servicio.ciclo(ajuste("pantalla"))
        self.assertEqual(popen.call_args[0][0], ["/usr/bin/caffeinate", "-dim", "-w", "42"])
        self.assertEqual(
            escritos,
            [{"modo": "pantalla", "herramienta": "/usr/bin/caffeinate", "pid": 42}],
        )

    def test_sistema_con_keepalive_no_duerme_pantalla(self):
        servicio, popen, _ = servicio_simulado(keepalive=True)
        servicio.ciclo(ajuste("sistema"))
        self.assertIn("--keep-display=false", popen.call_args[0][0])

    def test_mismo_modo_vivo_no_relanza(self):
        servicio, popen, escritos = servicio_simulado()
        servicio.ciclo(ajuste("pantalla"))
        servicio.ciclo(ajuste("pantalla"))
        self.assertEqual(popen.call_count, 1)
        self.assertEqual(len(escritos), 1)

    def test_sin_herramienta_no_lanza_y_declara_una_sola_vez(self):
        servicio, popen, escritos = servicio_simulado(
            plataforma="win32", keepalive=False)
        servicio.ciclo(ajuste("pantalla"))
        servicio.ciclo(ajuste("pantalla"))
        popen.assert_not_called()
        self.assertEqual(
            escritos,
            [{"modo": None, "herramienta": None, "pid": 42}],
        )

    def test_apagado_termina_solo_su_hijo(self):
        servicio, popen, escritos = servicio_simulado()
        servicio.ciclo(ajuste("pantalla"))
        hijo = popen.return_value
        servicio.ciclo(json.dumps({"activa": False}))
        hijo.terminate.assert_called_once()
        self.assertFalse(servicio.hijo_vivo())
        self.assertIsNone(escritos[-1]["modo"])


if __name__ == "__main__": unittest.main()