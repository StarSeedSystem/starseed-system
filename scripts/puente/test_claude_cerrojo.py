#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas para claude_cerrojo.py (CLA1126A)."""

import os
import sys
import tempfile
import time
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import claude_cerrojo as C
import motores_director as M


class TestLeerEntornoClaudeToken(unittest.TestCase):
    def setUp(self):
        self.tmpdir = tempfile.mkdtemp()
        self.env_file = Path(self.tmpdir) / "env"

    def test_lee_desde_archivo_env(self):
        self.env_file.write_text('export CLAUDE_CODE_OAUTH_TOKEN="sk-ant-xxxx"\n')
        token = C.leer_entorno_claude_token(self.env_file)
        self.assertEqual(token, "sk-ant-xxxx")

    def test_lee_sin_export(self):
        self.env_file.write_text('CLAUDE_CODE_OAUTH_TOKEN="sk-ant-xxxx"\n')
        token = C.leer_entorno_claude_token(self.env_file)
        self.assertEqual(token, "sk-ant-xxxx")

    def test_quita_comillas(self):
        self.env_file.write_text('CLAUDE_CODE_OAUTH_TOKEN=sk-ant-xxxx\n')
        token = C.leer_entorno_claude_token(self.env_file)
        self.assertEqual(token, "sk-ant-xxxx")

    def test_no_existe_devuelve_none(self):
        token = C.leer_entorno_claude_token(Path("/no/existe/env"))
        self.assertIsNone(token)

    def test_clave_no_presente_devuelve_none(self):
        self.env_file.write_text('OTRA_CLAVE="valor"\n')
        token = C.leer_entorno_claude_token(self.env_file)
        self.assertIsNone(token)

    def test_valor_vacio_devuelve_none(self):
        self.env_file.write_text('CLAUDE_CODE_OAUTH_TOKEN=""\n')
        token = C.leer_entorno_claude_token(self.env_file)
        self.assertIsNone(token)

    def test_prioridad_variable_entorno(self):
        self.env_file.write_text('CLAUDE_CODE_OAUTH_TOKEN="del-archivo"\n')
        with mock.patch.dict(os.environ, {"CLAUDE_CODE_OAUTH_TOKEN": "del-entorno"}):
            token = C.leer_entorno_claude_token(self.env_file)
            self.assertEqual(token, "del-entorno")


class TestPrepararEnvClaude(unittest.TestCase):
    def test_quita_claves_api(self):
        env = {"ANTHROPIC_API_KEY": "xxx", "ANTHROPIC_AUTH_TOKEN": "yyy", "PATH": "/bin"}
        resultado = C.preparar_env_claude(env)
        self.assertNotIn("ANTHROPIC_API_KEY", resultado)
        self.assertNotIn("ANTHROPIC_AUTH_TOKEN", resultado)
        self.assertEqual(resultado["PATH"], "/bin")

    def test_anade_token_si_existe(self):
        with mock.patch.object(C, "leer_entorno_claude_token", return_value="mi-token"):
            env = {"PATH": "/bin"}
            resultado = C.preparar_env_claude(env)
            self.assertEqual(resultado["CLAUDE_CODE_OAUTH_TOKEN"], "mi-token")

    def test_no_anade_token_si_no_existe(self):
        with mock.patch.object(C, "leer_entorno_claude_token", return_value=None):
            env = {"PATH": "/bin"}
            resultado = C.preparar_env_claude(env)
            self.assertNotIn("CLAUDE_CODE_OAUTH_TOKEN", resultado)

    def test_no_modifica_original(self):
        env = {"ANTHROPIC_API_KEY": "xxx", "PATH": "/bin"}
        C.preparar_env_claude(env)
        self.assertIn("ANTHROPIC_API_KEY", env)


class TestDetectarNoLogueado(unittest.TestCase):
    def test_detecta_not_logged_in(self):
        self.assertTrue(C.detectar_no_logueado("Not logged in · Please run /login"))
        self.assertTrue(C.detectar_no_logueado("Error: Not logged in"))
        self.assertTrue(C.detectar_no_logueado("please run /login to continue"))

    def test_no_detecta_otras_cosas(self):
        self.assertFalse(C.detectar_no_logueado("Usage: 23%"))
        self.assertFalse(C.detectar_no_logueado(""))
        self.assertFalse(C.detectar_no_logueado(None))
        self.assertFalse(C.detectar_no_logueado("logged in successfully"))


class TestCerrojoClaudeAuto(unittest.TestCase):
    def test_adquiere_y_libera(self):
        with tempfile.TemporaryDirectory() as tmp:
            ruta = Path(tmp) / "test.lock"
            with C.cerrojo_claude_auto(ruta=ruta, espera_maxima=1, sondeo=0.01):
                pass  # adquirido y liberado al salir
            # Segunda adquisición debe funcionar
            with C.cerrojo_claude_auto(ruta=ruta, espera_maxima=1, sondeo=0.01):
                pass

    def test_excluye_otro_proceso(self):
        with tempfile.TemporaryDirectory() as tmp:
            ruta = Path(tmp) / "test.lock"
            # Simular otro proceso sosteniendo el cerrojo
            import fcntl
            fd_otro = open(ruta, "a")
            fcntl.flock(fd_otro, fcntl.LOCK_EX)

            try:
                with self.assertRaises(TimeoutError):
                    with C.cerrojo_claude_auto(ruta=ruta, espera_maxima=0.5, sondeo=0.01):
                        pass
            finally:
                fcntl.flock(fd_otro, fcntl.LOCK_UN)
                fd_otro.close()

    def test_esta_ocupado_true_cuando_otro_lo_tiene(self):
        with tempfile.TemporaryDirectory() as tmp:
            ruta = Path(tmp) / "test.lock"
            import fcntl
            fd_otro = open(ruta, "a")
            fcntl.flock(fd_otro, fcntl.LOCK_EX)
            try:
                self.assertTrue(C.esta_ocupado(ruta=ruta))
            finally:
                fcntl.flock(fd_otro, fcntl.LOCK_UN)
                fd_otro.close()

    def test_esta_ocupado_false_si_libre(self):
        with tempfile.TemporaryDirectory() as tmp:
            ruta = Path(tmp) / "test.lock"
            self.assertFalse(C.esta_ocupado(ruta=ruta))

    def test_esta_ocupado_false_si_no_existe(self):
        self.assertFalse(C.esta_ocupado(ruta=Path("/no/existe/lock")))


class TestAvisoNoLogueado(unittest.TestCase):
    def test_envia_aviso(self):
        avisos = []
        def fake_decir(texto, quien, tipo, tarea):
            avisos.append({"texto": texto, "quien": quien, "tipo": tipo, "tarea": tarea})
        C.avisar_no_logueado(fake_decir, "tarea-123")
        self.assertEqual(len(avisos), 1)
        self.assertIn("Not logged in", avisos[0]["texto"])
        self.assertEqual(avisos[0]["quien"], "claude-cerrojo")
        self.assertEqual(avisos[0]["tipo"], "aviso")
        self.assertEqual(avisos[0]["tarea"], "tarea-123")

    def test_sin_tarea(self):
        avisos = []
        def fake_decir(texto, quien, tipo, tarea):
            avisos.append(tarea)
        C.avisar_no_logueado(fake_decir, None)
        self.assertIsNone(avisos[0])


class TestResetAviso(unittest.TestCase):
    def test_reset_funciona(self):
        M._marcar_aviso_no_logueado_enviado()
        self.assertTrue(M._aviso_no_logueado_ya_enviado())
        M._reset_aviso_no_logueado()
        self.assertFalse(M._aviso_no_logueado_ya_enviado())


class TestEsClaudeAutomatico(unittest.TestCase):
    def test_detecta_claude_con_p(self):
        self.assertTrue(M._es_claude_automatico(["claude", "-p", "hola"]))
        self.assertTrue(M._es_claude_automatico(["claude", "--model", "opus", "-p", "hola"]))

    def test_no_detecta_otras_ordenes(self):
        self.assertFalse(M._es_claude_automatico(["hermes", "-z", "hola"]))
        self.assertFalse(M._es_claude_automatico(["claude"]))  # sin -p
        self.assertFalse(M._es_claude_automatico([]))
        self.assertFalse(M._es_claude_automatico(None))
        self.assertFalse(M._es_claude_automatico("claude -p hola"))  # string, no lista


if __name__ == "__main__":
    unittest.main()