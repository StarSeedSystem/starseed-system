# -*- coding: utf-8 -*-
"""Pruebas de la lógica pura de antigravity_a1.py (GEM1119E).

Ninguna prueba ejecuta `agy` ni abre ssh: solo se comprueba la elección de
máquina para el reparto de GEM1119C, la lectura de errores de `agy`, la
arquitectura, la verificación de la fuente oficial y el conteo de tokens.
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import antigravity_a1 as A


class TestElegirMaquina(unittest.TestCase):
    def test_a1_vivo_gana_aunque_la_mac_este_lista(self):
        a1 = {"alcanzable": True, "agy": True, "sesion": True}
        mac = {"agy": True, "sesion": True}
        r = A.elegir_maquina(a1, mac)
        self.assertEqual(r["maquina"], "agy-A1")
        self.assertIn("A1", r["motivo"])

    def test_a1_caido_usa_la_mac(self):
        a1 = {"alcanzable": False, "agy": True, "sesion": True}
        mac = {"agy": True, "sesion": True}
        self.assertEqual(A.elegir_maquina(a1, mac)["maquina"], "agy-Mac")

    def test_a1_sin_sesion_usa_la_mac_y_lo_dice(self):
        a1 = {"alcanzable": True, "agy": True, "sesion": False}
        mac = {"agy": True, "sesion": True}
        r = A.elegir_maquina(a1, mac)
        self.assertEqual(r["maquina"], "agy-Mac")
        self.assertIn("sesión", r["motivo"])

    def test_sin_maquinas_listas_no_hay_eleccion(self):
        a1 = {"alcanzable": True, "agy": False, "sesion": False}
        mac = {"agy": False, "sesion": False}
        r = A.elegir_maquina(a1, mac)
        self.assertIsNone(r["maquina"])
        self.assertIn("instalar", r["motivo"])

    def test_entradas_vacias_no_revientan(self):
        self.assertIsNone(A.elegir_maquina(None, None)["maquina"])
        self.assertIsNone(A.elegir_maquina({}, {})["maquina"])


class TestLeerError(unittest.TestCase):
    def test_salida_correcta_es_ok(self):
        self.assertEqual(A.leer_error("Listo, hecho.", 0)["clase"], "ok")

    def test_salida_vacia_es_error(self):
        self.assertEqual(A.leer_error("", 0)["clase"], "otro")

    def test_agy_ausente(self):
        self.assertEqual(A.leer_error("bash: agy: command not found", 127)["clase"], "sin_agy")

    def test_sesion_caida(self):
        self.assertEqual(A.leer_error("Error: not logged in. Run agy login.", 1)["clase"], "sin_sesion")

    def test_cuota(self):
        self.assertEqual(A.leer_error("Quota exceeded for this model", 1)["clase"], "cuota")
        self.assertEqual(A.leer_error("429 Too Many Requests", 1)["clase"], "cuota")

    def test_tiempo_agotado(self):
        self.assertEqual(A.leer_error("[tiempo agotado]", -9)["clase"], "tiempo")
        self.assertEqual(A.leer_error("request timed out", 1)["clase"], "tiempo")

    def test_red(self):
        self.assertEqual(A.leer_error("Could not resolve host: antigravity.google", 6)["clase"], "red")

    def test_codigo_desconocido(self):
        r = A.leer_error("algo raro", 3)
        self.assertEqual(r["clase"], "otro")
        self.assertIn("3", r["detalle"])

    def test_respuesta_larga_con_palabra_cuota_no_es_fallo(self):
        largo = "La cuota es un concepto económico. " * 40
        self.assertEqual(A.leer_error(largo, 0)["clase"], "ok")


class TestArquitectura(unittest.TestCase):
    def test_arm64(self):
        for m in ("aarch64", "arm64", "ARMv8"):
            self.assertEqual(A.normalizar_arquitectura(m), "arm64", m)

    def test_x86(self):
        for m in ("x86_64", "amd64"):
            self.assertEqual(A.normalizar_arquitectura(m), "x86_64", m)

    def test_desconocida(self):
        self.assertEqual(A.normalizar_arquitectura(""), "desconocida")


class TestFuenteOficial(unittest.TestCase):
    BUENO = ("#!/bin/sh\n# antigravity installer\nARCH=$(uname -m)\n"
             "case $ARCH in aarch64|arm64) BIN=agy-linux-arm64 ;;\n"
             "esac\nmkdir -p \"$HOME/.local/bin\"\n")

    def test_instalador_valido(self):
        r = A.verificar_fuente_oficial(self.BUENO, "arm64")
        self.assertTrue(r["ok"], r["motivo"])

    def test_sin_arm64_no_sirve(self):
        r = A.verificar_fuente_oficial("# antigravity\nmkdir -p $HOME/.local/bin\n", "arm64")
        self.assertFalse(r["ok"])
        self.assertIn("ARM64", r["motivo"])

    def test_sin_destino_de_usuario_no_sirve(self):
        r = A.verificar_fuente_oficial("# antigravity aarch64\nsudo cp agy /usr/bin/agy\n", "arm64")
        self.assertFalse(r["ok"])

    def test_vacio_no_sirve(self):
        self.assertFalse(A.verificar_fuente_oficial("", "arm64")["ok"])

    def test_texto_ajeno_no_sirve(self):
        self.assertFalse(A.verificar_fuente_oficial("hola aarch64 .local/bin", "arm64")["ok"])


class TestTokens(unittest.TestCase):
    def test_usage_estandar(self):
        salida = '{"response":"OK","usage":{"input_tokens":12,"output_tokens":7}}'
        self.assertEqual(A.parsear_tokens(salida), {"entrada": 12, "salida": 7})

    def test_usage_alternativo(self):
        salida = '{"usage":{"prompt_tokens":9,"completion_tokens":4}}'
        self.assertEqual(A.parsear_tokens(salida), {"entrada": 9, "salida": 4})

    def test_sin_json_da_ceros(self):
        self.assertEqual(A.parsear_tokens("solo texto"), {"entrada": 0, "salida": 0})

    def test_json_con_lineas_delante(self):
        salida = 'aviso: algo\n{"response":"OK","usage":{"input_tokens":3,"output_tokens":2}}'
        self.assertEqual(A.parsear_tokens(salida), {"entrada": 3, "salida": 2})


class TestInterpretarSonda(unittest.TestCase):
    def test_sonda_completa(self):
        salida = ("aarch64\nAGY=si\nVERSION=agy 1.5.12\nSESION=si\nREMOTE=si\n")
        r = A.interpretar_sonda(salida, 0)
        self.assertEqual(r["arquitectura"], "arm64")
        self.assertTrue(r["agy"])
        self.assertEqual(r["version"], "agy 1.5.12")
        self.assertTrue(r["sesion"])
        self.assertTrue(r["control_remoto"])

    def test_sonda_sin_agy(self):
        r = A.interpretar_sonda("aarch64\nAGY=no\nSESION=no\nREMOTE=no\n", 0)
        self.assertFalse(r["agy"])
        self.assertFalse(r["sesion"])
        self.assertFalse(r["control_remoto"])

    def test_sonda_con_aviso_delante(self):
        salida = "sudo: unable to resolve host\n\naarch64\nAGY=si\nSESION=si\nREMOTE=no\n"
        r = A.interpretar_sonda(salida, 0)
        self.assertEqual(r["arquitectura"], "arm64")
        self.assertTrue(r["agy"])

    def test_sonda_que_falla_no_es_alcanzable(self):
        r = A.interpretar_sonda("ssh: connect to host port 22: Connection timed out", 255)
        self.assertFalse(r["alcanzable"])
