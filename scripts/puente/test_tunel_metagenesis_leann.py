# -*- coding: utf-8 -*-
"""Reenvío LEANN al A1 por el túnel de MetaGenesis (LNN1028E): la lista REENVIOS es la única
fuente, la orden de ssh lleva un -L por reenvío (los dos si la lista trae dos), la IP del A1
no sale nunca ni en el registro ni en `--estado`, y el ssh muerto se relanza."""
import contextlib
import io
import os
import sys
import threading
import time
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tunel_metagenesis as T  # noqa: E402

IP_FALSA = "203.0.113.5"          # TEST-NET-2: no es nadie real
DESTINO_FALSO = "ubuntu@" + IP_FALSA
BASE_FALSA = ["ssh", "-i", "/llaves/de-prueba", "-o", "BatchMode=yes"]


class Lista(unittest.TestCase):
    def test_reenvio_de_leann_esta_en_la_lista(self):
        self.assertIn((4495, 4495), T.REENVIOS)
        self.assertEqual(T.argumentos_reenvio(T.REENVIOS),
                         ["-L", "127.0.0.1:4495:127.0.0.1:4495"])


class Piezas(unittest.TestCase):
    def test_la_orden_lleva_un_l_por_reenvio(self):
        self.assertEqual(T.argumentos_reenvio(((4495, 4495),)),
                         ["-L", "127.0.0.1:4495:127.0.0.1:4495"])

    def test_puertos_que_no_valen(self):
        for mal in ((0, 4495), (4495, 70000), (4495, 0), (99999, 4495)):
            with self.assertRaises(ValueError):
                T.argumentos_reenvio((mal,))

    def test_tachar_ip(self):
        self.assertEqual(T.tachar_ip("ssh: connect to host %s port 22" % IP_FALSA, IP_FALSA),
                         "ssh: connect to host [a1] port 22")
        self.assertEqual(T.tachar_ip("otra cosa", ""), "otra cosa")

    def test_texto_reenvios_sin_ip(self):
        texto = T.texto_reenvios(((4495, 4495),))
        self.assertIn(":4495 del A1", texto)
        self.assertNotIn(IP_FALSA, texto)


class Orden(unittest.TestCase):
    def test_la_orden_de_ssh_lleva_los_reenvios_y_su_ip_solo_al_final(self):
        dos = ((4495, 4495), (5100, 5000))
        orden = T.orden_reenvio_a1(BASE_FALSA, DESTINO_FALSO, dos)
        self.assertEqual(orden[:len(BASE_FALSA)], BASE_FALSA)
        self.assertIn("-N", orden)
        self.assertIn("ExitOnForwardFailure=yes", orden)
        self.assertEqual(orden.count("-L"), 2)
        self.assertIn("127.0.0.1:4495:127.0.0.1:4495", orden)
        self.assertIn("127.0.0.1:5100:127.0.0.1:5000", orden)
        self.assertEqual(orden[-1], DESTINO_FALSO)
        sin_destino = orden[:-1]
        self.assertNotIn(IP_FALSA, " ".join(sin_destino))     # la IP solo vive en el destino

class ProcesoFalso:
    """Un ssh de mentira: su stdout trae líneas de error con la IP del A1 delante."""

    idx = 0

    def __init__(self, vive=True):
        self.terminado = False
        self._vive = vive
        self.lineas = ["Warning: Identity file not accessible: %s" % IP_FALSA,
                       "ssh: connect to host %s port 22: Operation timed out" % IP_FALSA]

    def poll(self):
        return 0 if not self._vive or self.terminado else None

    def terminate(self):
        self.terminado = True

    kill = terminate

    def wait(self, timeout=0):
        return 0


class PopenFalso:
    def __init__(self, vive=True):
        self.vive, self.orden_recibida = vive, None

    def __call__(self, orden, **_k):
        self.orden_recibida = list(orden)
        proc = ProcesoFalso(self.vive)
        proc.stdout = list(proc.lineas)
        return proc


class Reenvio(unittest.TestCase):
    def achieve(self, cond, tope=2.0):
        """El lector de la salida es un hilo: espera un rato a que se cumpla la condición."""
        fin = time.monotonic() + tope
        while time.monotonic() < fin and not cond():
            time.sleep(0.01)
        return cond()

    def test_arranca_y_tacha_la_ip_de_su_salida(self):
        falso = PopenFalso()
        r = T.Reenvio(BASE_FALSA + ["-N"], ip=IP_FALSA, popen=falso)
        r.arrancar()
        self.assertTrue(r.vivo())
        self.assertEqual(falso.orden_recibida, r.orden)
        esperadas = [T.tachar_ip(l, IP_FALSA) for l in ProcesoFalso().lineas]
        self.assertTrue(self.achieve(lambda: list(r.ultimas) == esperadas),
                        "la salida no se leyó: %r" % list(r.ultimas))
        self.assertNotIn(IP_FALSA, " ".join(r.ultimas))
        r.parar()

    def test_popen_roto_es_un_reenvio_muerto_que_se_puede_parar(self):
        class PopenRoto:
            def __call__(self, orden, **_k):
                raise OSError("sin ssh")

        r = T.Reenvio(BASE_FALSA, ip=IP_FALSA, popen=PopenRoto())
        r.arrancar()
        self.assertFalse(r.vivo())
        r.parar()


class ReenvioFalso:
    """Para el bucle: cuenta lo que le hacen y vive lo que le digan."""

    def __init__(self):
        self.arrancadas, self.paradas = 0, 0
        self.vivo_ahora = lambda: True
        self.ultimas = []
        self.ip = ""

    def arrancar(self):
        self.arrancadas += 1

    def vivo(self):
        return self.vivo_ahora()

    def parar(self):
        self.paradas += 1


class TunelFalso:
    def __init__(self, url):
        self.url, self.ultimas, self.paradas = url, [], 0

    def arrancar(self):
        pass

    def esperar_url(self, _tope, _parar):
        return self.url

    def vivo(self):
        return True

    def parar(self):
        self.paradas += 1


class Bucle(unittest.TestCase):
    def _correr(self, crear_reenvio, vueltas=4):
        escrito, registro = [], []
        parar = threading.Event()
        cuenta = {"n": 0}
        real_wait = parar.wait

        def esperar(_s=None):
            cuenta["n"] += 1
            if cuenta["n"] >= vueltas:
                parar.set()
            return real_wait(0)

        parar.wait = esperar
        salida = io.StringIO()
        with contextlib.redirect_stdout(salida):
            T.ejecutar({
                "crear_tunel": lambda: TunelFalso("https://tunel-de-prueba.trycloudflare.com"),
                "crear_reenvio": crear_reenvio,
                "contesta": lambda u: True,
                "contesta_local": lambda: True,
                "escribir": lambda d: escrito.append(d) or True,
                "parar": parar,
                "log": lambda t: registro.append(t),
                "ahora": lambda: "2026-10-28T10:00:00+00:00",
                "maquina": "Mac",
            })
        return registro

    def test_abre_y_dice_que_reenvios_sin_ni_una_ip(self):
        registro = self._correr(lambda: ReenvioFalso())
        self.assertTrue(any("reenvío al A1 abierto: " + T.texto_reenvios() in r for r in registro))
        self.assertFalse(any(IP_FALSA in r for r in registro))

    def test_ssh_muerto_se_relanza_con_su_motivo_tachado(self):
        estados = iter([True, False, True])

        class falso_vivo(ReenvioFalso):
            def __init__(self):
                super().__init__()
                self.vivo_ahora = lambda: bool(next(estados, False))
                # lo que `_leer` del Reenvio real deja: la salida SSH YA tachada (la IP=«[a1]»)
                self.ultimas = ["ssh: connect to host [a1] port 22"]

        vueltos = []

        def crear():
            if len(vueltos) < 2:
                vueltos.append(1)
                return falso_vivo()
            return ReenvioFalso()

        registro = self._correr(crear)
        self.assertEqual(len(vueltos), 2)            # el primero murió y pidió otro
        self.assertTrue(any("el ssh del reenvío al A1 terminó (ssh: connect to host [a1] port 22)"
                            in r for r in registro))
        self.assertFalse(any(IP_FALSA in r for r in registro))

    def test_sin_a1_avisa_una_vez_y_sigue_con_el_tunel(self):
        cuenta = {"creaciones": 0}

        def crear():
            cuenta["creaciones"] += 1
            return None  # sin A1 al que llegar

        registro = self._correr(crear)
        aviso = [r for r in registro if "sin A1 para el reenvío" in r]
        self.assertEqual(len(aviso), 1)              # UNA vez, no una por latido
        self.assertEqual(cuenta["creaciones"], 1)    # y no insiste cada minuto
        self.assertFalse(any(IP_FALSA in r for r in registro))


if __name__ == "__main__":
    unittest.main()
