#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas de terminal_neuronas.py (TRM1125E).

Herméticas: no tocan la red, ~/.ssh ni el disco real. Todo va con dobles (ssh simulado,
canal de control simulado y `publicar` inyectado). Ejecuta órdenes tipadas por el canal de
control o, mientras no exista, por el ssh de respaldo con las opciones de respaldo_maggabox.
"""
import os
import sys
import unittest
from typing import Any, Dict, List

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import terminal_neuronas as T  # noqa: E402


def sesion(clave="secreto-de-prueba", token="tok-1", de="aparato-A", seq=0):
    return {"token": token, "de": de, "clave": clave, "seq": seq}


class SimuladorSSH:
    """Doble de subprocess.run: apunta argv y entrada, devuelve un código fijo."""

    def __init__(self, codigo=0, salida="ok", error=""):
        self.codigo = codigo
        self.salida = salida
        self.error = error
        self.llamadas: List[Dict[str, Any]] = []

    def __call__(self, argv, **kw):
        self.llamadas.append({"argv": list(argv), "input": kw.get("input")})
        return type("R", (), {"returncode": self.codigo, "stdout": self.salida,
                              "stderr": self.error})()


class TestNiveles(unittest.TestCase):
    def test_es_nivel(self):
        self.assertTrue(T.es_nivel("usuario"))
        self.assertTrue(T.es_nivel("administrador"))
        self.assertFalse(T.es_nivel("root"))
        self.assertFalse(T.es_nivel(None))

    def test_nivel_minimo(self):
        self.assertEqual(T.nivel_minimo("usuario", "administrador"), "usuario")
        self.assertEqual(T.nivel_minimo("administrador", "usuario"), "usuario")
        self.assertEqual(T.nivel_minimo("administrador", "administrador"), "administrador")

    def test_es_modo_admin(self):
        self.assertTrue(T.es_modo_admin("tipado"))
        self.assertTrue(T.es_modo_admin("completo"))
        self.assertFalse(T.es_modo_admin("otro"))


class TestValidarOrden(unittest.TestCase):
    def test_orden_vacia(self):
        self.assertIsNotNone(T.validar_orden(""))
        self.assertIsNotNone(T.validar_orden("   "))

    def test_orden_demasiado_larga(self):
        self.assertIsNotNone(T.validar_orden("x" * (T.ORDEN_MAX_CHARS + 1)))

    def test_orden_valida(self):
        self.assertIsNone(T.validar_orden("ls -la"))


class TestSellado(unittest.TestCase):
    def test_sellar_lleva_campos_del_contrato(self):
        s = sesion()
        sobre = T.sellar_orden("ls -la", s, ahora_ms=1_000_000)
        for campo in ("v", "token", "de", "orden", "seq", "nonce", "t", "caduca", "firma"):
            self.assertIn(campo, sobre)
        self.assertEqual(sobre["v"], 1)
        self.assertEqual(sobre["seq"], 1)
        self.assertNotIn("clave", sobre)

    def test_sellar_rechaza_orden_invalida(self):
        with self.assertRaises(T.ErrorTerminal) as ctx:
            T.sellar_orden("", sesion())
        self.assertEqual(ctx.exception.motivo, "argumentos")

    def test_verificar_acepta_orden_recien_sellada(self):
        s = sesion()
        sobre = T.sellar_orden("ls -la", s, ahora_ms=1_000_000)
        self.assertIsNone(T.verificar_orden(sobre, s, ahora_ms=1_000_000))

    def test_verificar_rechaza_firma_alterada(self):
        s = sesion()
        sobre = T.sellar_orden("ls -la", s, ahora_ms=1_000_000)
        sobre["firma"] = "0" * 64
        self.assertEqual(T.verificar_orden(sobre, s, ahora_ms=1_000_000), "firma")

    def test_verificar_rechaza_fuera_de_ventana(self):
        s = sesion()
        sobre = T.sellar_orden("ls -la", s, ahora_ms=1_000_000)
        self.assertEqual(T.verificar_orden(sobre, s, ahora_ms=1_000_000 + 10 * T.TOLERANCIA_MS),
                         "caducada")

    def test_verificar_rechaza_repetida(self):
        s = sesion()
        sobre = T.sellar_orden("ls -la", s, ahora_ms=1_000_000)
        self.assertIsNone(T.verificar_orden(sobre, s, ahora_ms=1_000_000))
        # Reintento legítimo: mismo sobre, mismo seq → el lado controlado lo rechaza.
        self.assertEqual(T.verificar_orden(sobre, s, ahora_ms=1_000_000), "repetida")

    def test_verificar_rechaza_otro_origen(self):
        s = sesion()
        sobre = T.sellar_orden("ls -la", s, ahora_ms=1_000_000)
        sobre["de"] = "aparato-B"
        self.assertEqual(T.verificar_orden(sobre, s, ahora_ms=1_000_000), "origen")


class TestClasificacion(unittest.TestCase):
    def test_lectura_es_sola(self):
        self.assertEqual(T.clasificar_orden("ls -la"), "sola")
        self.assertFalse(T.requiere_confirmacion("cat fichero.txt"))

    def test_borrar_es_confirmar(self):
        self.assertEqual(T.clasificar_orden("rm -rf /tmp/x"), "confirmar")
        self.assertTrue(T.requiere_confirmacion("borrar todo"))

    def test_privilegios_es_confirmar(self):
        self.assertEqual(T.clasificar_orden("sudo apt-get install x"), "confirmar")

    def test_redireccion_es_opaca(self):
        self.assertEqual(T.clasificar_orden("echo x > /tmp/y"), "opaca")
        self.assertTrue(T.requiere_confirmacion("ls | grep x"))


class TestSSHRespaldo(unittest.TestCase):
    def test_ssh_orden_usa_opciones_de_respaldo(self):
        argv = T.ssh_orden("ls -la")
        self.assertEqual(argv[0], "ssh")
        self.assertIn("BatchMode=yes", argv)
        self.assertIn("AddressFamily=inet", argv)
        self.assertIn("IdentitiesOnly=yes", argv)
        self.assertTrue(any("UserKnownHostsFile=" in a for a in argv))

    def test_ssh_orden_lleva_la_orden_por_stdin_no_por_argv(self):
        # La orden no debe aparecer en el argv (no queda en el listado de procesos).
        argv = T.ssh_orden("ls -la")
        self.assertNotIn("ls -la", argv)
        self.assertEqual(argv[-2:], ["bash", "-s"])


class TestEjecutarPorSSH(unittest.TestCase):
    def test_ejecuta_por_ssh_de_respaldo_y_registra(self):
        sim = SimuladorSSH(codigo=0, salida="total 0")
        publicaciones: List[str] = []
        res = T.ejecutar_orden(
            "maggabox", "ls -la", sesion(),
            ejecutar=sim, publicar=publicaciones.append, ahora_ms=1_000_000,
        )
        self.assertTrue(res["resultado"]["ok"])
        self.assertEqual(res["resultado"]["via"], "ssh")
        # La orden viajó por stdin, no por argv.
        self.assertEqual(sim.llamadas[0]["input"], "ls -la")
        self.assertNotIn("ls -la", sim.llamadas[0]["argv"])
        self.assertTrue(publicaciones and "maggabox" in publicaciones[0])

    def test_fallo_de_ssh_se_refleja_sin_lanzar(self):
        sim = SimuladorSSH(codigo=255, error="Connection refused")
        res = T.ejecutar_orden("maggabox", "ls", sesion(), ejecutar=sim,
                               publicar=lambda _t: None, ahora_ms=1_000_000)
        self.assertFalse(res["resultado"]["ok"])
        self.assertEqual(res["resultado"]["codigo"], 255)


class TestEjecutarPorCanal(unittest.TestCase):
    def test_usa_el_canal_de_control_si_existe(self):
        sim = SimuladorSSH()  # no debe usarse
        vistos: List[Dict[str, Any]] = []

        def canal(neurona, sobre):
            vistos.append({"neurona": neurona, "sobre": sobre})
            return {"ok": True, "salida": "hecho"}

        res = T.ejecutar_orden("tableta", "almacen-estado", sesion(),
                               ejecutar=sim, canal=canal, publicar=lambda _t: None,
                               ahora_ms=1_000_000)
        self.assertTrue(res["resultado"]["ok"])
        self.assertEqual(res["resultado"]["via"], "canal")
        self.assertEqual(len(vistos), 1)
        self.assertEqual(sim.llamadas, [])  # el ssh de respaldo no se tocó

    def test_orden_ilegal_no_llega_al_canal(self):
        def canal(neurona, sobre):  # no debe llamarse
            raise AssertionError("el canal no debe recibir una orden rechazada")

        with self.assertRaises(T.ErrorTerminal):
            T.ejecutar_orden("t", "", sesion(), canal=canal, publicar=lambda _t: None)


class TestEstado(unittest.TestCase):
    def test_estado_neurona_no_ejecuta_nada_delicado(self):
        sim = SimuladorSSH(codigo=0, salida="activo")
        res = T.estado_neurona("maggabox", ejecutar=sim)
        self.assertEqual(res["codigo"], 0)
        self.assertEqual(res["salida"], "activo")
        self.assertNotIn("starseed-ayudante estado", sim.llamadas[0]["argv"])


if __name__ == "__main__":
    unittest.main()