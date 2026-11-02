"""Pruebas de mantener_pantalla: ajuste, orden por plataforma y ciclo."""

import json
import unittest
from unittest.mock import MagicMock

import mantener_pantalla as mp

def ajuste(activa=True, modo="pantalla", bateria=None) -> str:
    datos = {"activa": activa, "desde": None, "quien": "prueba", "modo": modo}
    if bateria is not None:
        datos["bateria"] = bateria
    return json.dumps(datos)

class LeerAjusteTests(unittest.TestCase):
    def test_por_defecto_activa_modo_pantalla_y_bateria(self):
        a = mp.leer_ajuste("")
        self.assertTrue(a.activa)
        self.assertEqual(a.modo, "pantalla")
        self.assertEqual(a.bateria, mp.BATERIA_POR_DEFECTO)

    def test_activa_false(self):
        self.assertFalse(mp.leer_ajuste(ajuste(False)).activa)
        self.assertFalse(mp.leer_ajuste(ajuste(False)))

    def test_modo_sistema(self):
        self.assertEqual(mp.leer_ajuste(ajuste(modo="sistema")).modo, "sistema")

    def test_modo_y_bateria_invalidos_caen_por_defecto(self):
        a = mp.leer_ajuste(ajuste(modo="otro", bateria=999))
        self.assertEqual(a.modo, "pantalla")
        self.assertEqual(a.bateria, 15)

    def test_json_roto_activa_por_defecto(self):
        self.assertTrue(mp.leer_ajuste("{roto").activa)

class ConstruirOrdenTests(unittest.TestCase):
    def test_keepalive_modo_pantalla_con_pid_y_umbral(self):
        orden = mp.construir_orden("darwin", mp.leer_ajuste(ajuste(bateria=30)), 42, True)
        self.assertEqual(orden.herramienta, "keepalive")
        self.assertIn("--plain", orden.argv)
        self.assertIn("--keep-display=true", orden.argv)
        self.assertEqual(orden.argv[orden.argv.index("--pid") + 1], "42")
        self.assertEqual(orden.argv[orden.argv.index("-b") + 1], "30")

    def test_keepalive_modo_sistema_apaga_pantalla(self):
        orden = mp.construir_orden("linux", mp.leer_ajuste(ajuste(modo="sistema")), 7, True)
        self.assertIn("--keep-display=false", orden.argv)

    def test_darwin_sin_keepalive_pantalla_usa_caffeinate_con_display(self):
        orden = mp.construir_orden("darwin", mp.leer_ajuste(ajuste()), 9, False)
        self.assertEqual(orden.herramienta, "caffeinate")
        self.assertIn("-d", orden.argv)
        self.assertIn("-w", orden.argv)

    def test_darwin_sin_keepalive_sistema_no_fuerza_display(self):
        orden = mp.construir_orden("darwin", mp.leer_ajuste(ajuste(modo="sistema")), 9, False)
        self.assertNotIn("-d", orden.argv)

    def test_linux_sin_keepalive_usa_systemd_inhibit(self):
        orden = mp.construir_orden("linux", mp.leer_ajuste(ajuste()), 9, False)
        self.assertEqual(orden.herramienta, "systemd-inhibit")
        self.assertIn("--what=sleep:idle", orden.argv)

    def test_otros_sin_keepalive_no_hace_nada_y_avisa(self):
        orden = mp.construir_orden("win32", mp.leer_ajuste(ajuste()), 9, False)
        self.assertEqual(orden.herramienta, "ninguna")
        self.assertTrue(orden.aviso)

    def test_inactiva_no_construye_orden(self):
        orden = mp.construir_orden("linux", mp.leer_ajuste(ajuste(False)), 9, True)
        self.assertEqual(orden.herramienta, "ninguna")

def servicio_simulado(keepalive=True, plataforma="darwin"):
    popen = MagicMock()
    popen.return_value.poll.return_value = None
    guardar = MagicMock()
    return mp.ServicioDespierto(popen, plataforma, keepalive, guardar), popen, guardar

class CicloTests(unittest.TestCase):
    def test_activa_lanza_una_vez_y_escribe_estado(self):
        servicio, popen, guardar = servicio_simulado()
        servicio.ciclo(ajuste())
        servicio.ciclo(ajuste())
        self.assertEqual(popen.call_count, 1)
        estado = json.loads(guardar.call_args[0][0])
        self.assertEqual(estado["herramienta"], "keepalive")
        self.assertTrue(estado["activo"])

    def test_inactiva_termina_solo_su_hijo(self):
        servicio, popen, guardar = servicio_simulado()
        servicio.ciclo(ajuste())
        hijo = popen.return_value
        servicio.ciclo(ajuste(False))
        hijo.terminate.assert_called_once()
        self.assertFalse(servicio.hijo_vivo())
        self.assertFalse(json.loads(guardar.call_args[0][0])["activo"])

    def test_cambio_de_modo_reinicia_con_la_orden_nueva(self):
        servicio, popen, _ = servicio_simulado()
        servicio.ciclo(ajuste())
        servicio.ciclo(ajuste(modo="sistema"))
        self.assertEqual(popen.call_count, 2)
        self.assertIn("--keep-display=false", popen.call_args[0][0])

    def test_json_roto_mantiene_activo(self):
        servicio, popen, _ = servicio_simulado()
        servicio.ciclo("{roto")
        popen.assert_called_once()

    def test_nunca_usa_pkill(self):
        servicio, popen, _ = servicio_simulado()
        servicio.ciclo(ajuste())
        servicio.ciclo(ajuste(False))
        for llamada in popen.call_args_list:
            self.assertNotIn("pkill", llamada[0][0])

if __name__ == "__main__":
    unittest.main()
