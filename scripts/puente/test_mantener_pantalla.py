"""Pruebas de mantener_pantalla: lógica pura y ciclo con lanzadores inyectados."""

import json
import unittest
from unittest.mock import MagicMock

import mantener_pantalla as mp


def config(activa, modo="pantalla"):
    return json.dumps({"activa": activa, "modo": modo, "desde": None, "quien": "prueba"})


class PurezasTests(unittest.TestCase):
    def test_ajuste_y_modo(self):
        casos = [
            (config(True), True, "pantalla"),
            (config(False, "sistema"), False, "sistema"),
            (config(True, "otro"), True, "pantalla"),
            ("{roto", True, "pantalla"),
        ]
        for texto, activa, modo in casos:
            with self.subTest(texto=texto):
                self.assertIs(mp.leer_ajuste(texto), activa)
                self.assertEqual(mp.leer_modo(texto), modo)

    def test_elegir_herramienta(self):
        casos = [
            (("Linux", "/bin/keepalive", None, "/bin/systemd-inhibit"), "/bin/keepalive"),
            (("Darwin", None, "/usr/bin/caffeinate", None), "/usr/bin/caffeinate"),
            (("Linux", None, None, "/bin/systemd-inhibit"), "/bin/systemd-inhibit"),
            (("Windows", None, None, None), None),
        ]
        for argumentos, esperado in casos:
            with self.subTest(argumentos=argumentos):
                self.assertEqual(mp.elegir_herramienta(*argumentos), esperado)

    def test_construir_orden(self):
        ka = ["/bin/keepalive", "--plain", "--keep-display=true", "--pid", "4321", "-b", "15"]
        ks = ["/bin/keepalive", "--plain", "--keep-display=false", "--pid", "1", "-b", "30"]
        casos = [
            (("/bin/keepalive", "pantalla", 4321), ka),
            (("/bin/keepalive", "sistema", 1, 30), ks),
            (("/usr/bin/caffeinate", "pantalla", 7), ["/usr/bin/caffeinate", "-dim", "-w", "7"]),
            (("/usr/bin/caffeinate", "sistema", 7), ["/usr/bin/caffeinate", "-i", "-m", "-s", "-w", "7"]),
        ]
        for argumentos, esperado in casos:
            with self.subTest(argumentos=argumentos):
                self.assertEqual(mp.construir_orden(*argumentos), esperado)
        orden = mp.construir_orden("/bin/systemd-inhibit", "sistema", 7)
        self.assertIn("--what=sleep:idle", orden)
        self.assertEqual(orden[-2:], ["sleep", "infinity"])
        self.assertEqual(mp.construir_orden("/bin/otra", "pantalla", 7), [])

    def test_que_hacer(self):
        casos = [
            ((True, False, 999), ["lanzar_dim", "declarar_usuario"]),
            ((True, True, 55), ["declarar_usuario"]),
            ((True, True, 5), ["nada"]), ((True, True, 999, False), ["nada"]),
            ((False, True, 0), ["parar_dim"]), ((False, False, 0), ["nada"]),
        ]
        for argumentos, esperado in casos:
            with self.subTest(argumentos=argumentos):
                self.assertEqual(mp.que_hacer(*argumentos), esperado)


def servicio_simulado(plataforma="Darwin", con_keepalive=False):
    popen, run, reloj, estados = MagicMock(), MagicMock(), [1000.0], []
    rutas = {
        "keepalive": "/bin/keepalive" if con_keepalive else None,
        "caffeinate": "/usr/bin/caffeinate" if plataforma == "Darwin" else None,
        "systemd-inhibit": "/bin/systemd-inhibit" if plataforma == "Linux" else None,
    }
    popen.return_value.poll.return_value = None
    servicio = mp.ServicioPantalla(
        popen, run, ahora=lambda: reloj[0], plataforma=plataforma,
        en_path=rutas.get, escritor=lambda datos, ruta=None: estados.append(datos),
    )
    return servicio, popen, run, reloj, estados


class CicloTests(unittest.TestCase):
    def test_pantalla_lanza_caffeinate_dim_y_declara(self):
        servicio, popen, run, _, estados = servicio_simulado()
        servicio.ciclo(config(True, "pantalla"))
        self.assertIn("-dim", popen.call_args[0][0])
        run.assert_called_once_with(["/usr/bin/caffeinate", "-u", "-t", "60"], timeout=10)
        self.assertEqual((estados[-1]["modo"], estados[-1]["herramienta"]), ("pantalla", "caffeinate"))
        servicio.ciclo(config(True, "sistema"))
        self.assertIn("-i", popen.call_args[0][0])

    def test_sistema_y_keepalive_no_renuevan(self):
        servicio, popen, run, reloj, _ = servicio_simulado()
        servicio.ciclo(config(True, "sistema"))
        self.assertIn("-i", popen.call_args[0][0])
        reloj[0] += 55
        servicio.ciclo(config(True, "sistema"))
        run.assert_not_called()
        otro, popen2, run2, reloj2, estados = servicio_simulado(con_keepalive=True)
        otro.ciclo(config(True, "sistema"))
        self.assertEqual(popen2.call_args[0][0][0], "/bin/keepalive")
        reloj2[0] += 55
        otro.ciclo(config(True, "sistema"))
        run2.assert_not_called()
        self.assertEqual(estados[-1]["herramienta"], "keepalive")

    def test_inactiva_termina_y_no_usa_pkill(self):
        servicio, popen, run, _, estados = servicio_simulado()
        servicio.ciclo(config(True))
        hijo = popen.return_value
        servicio.ciclo(config(False))
        hijo.terminate.assert_called_once()
        self.assertFalse(servicio.hijo_vivo())
        self.assertFalse(estados[-1]["activo"])
        for llamada in popen.call_args_list + run.call_args_list:
            self.assertFalse(any("pkill" in c for c in (llamada[0][0] if llamada[0] else [])))


if __name__ == "__main__":
    unittest.main()
