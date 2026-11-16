# -*- coding: utf-8 -*-
"""Pruebas de la lectura de créditos y estado de abliteration.ai."""
import json
import os
import sys
import tempfile
import unittest
import urllib.error

# Forzar la carga del módulo local
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import abliteration as A

class Clave(unittest.TestCase):
    def test_busca_en_entorno_y_archivos(self):
        d = tempfile.mkdtemp()
        env_path = os.path.join(d, "env")
        with open(env_path, "w", encoding="utf-8") as f:
            f.write("ABLITERATION_API_KEY= abl_de_archivo_123 \n")
        
        antes_archivos = A.ENV_ARCHIVOS
        A.ENV_ARCHIVOS = (env_path,)
        os.environ.pop("ABLITERATION_API_KEY", None)
        try:
            self.assertEqual(A.clave(), "abl_de_archivo_123")
            os.environ["ABLITERATION_API_KEY"] = " abl_de_entorno_456 "
            self.assertEqual(A.clave(), "abl_de_entorno_456")
        finally:
            A.ENV_ARCHIVOS = antes_archivos
            os.environ.pop("ABLITERATION_API_KEY", None)

    def test_sin_clave_devuelve_none(self):
        antes_archivos = A.ENV_ARCHIVOS
        A.ENV_ARCHIVOS = ("/ruta/que/no/existe/env",)
        os.environ.pop("ABLITERATION_API_KEY", None)
        try:
            self.assertIsNone(A.clave())
        finally:
            A.ENV_ARCHIVOS = antes_archivos


class LeerCreditos(unittest.TestCase):
    def test_lectura_buena(self):
        def abrir_falso(req, timeout=20):
            class Resp:
                def read(self):
                    return json.dumps({"data": {"total_credits": 15.50, "total_usage": 3.25}}).encode("utf-8")
                def __enter__(self):
                    return self
                def __exit__(self, *args):
                    pass
            return Resp()

        res, motivo = A.leer_creditos("abl_test", abrir=abrir_falso)
        self.assertIsNotNone(res)
        if res:
            data = res.get("data") or {}
            self.assertEqual(data.get("total_credits"), 15.50)
            self.assertEqual(data.get("total_usage"), 3.25)
        self.assertIsNone(motivo)

    def test_error_http_devuelve_none_sin_cuerpo(self):
        def abrir_falso(req, timeout=20):
            # Simulando error HTTP
            raise urllib.error.HTTPError(req.full_url, 401, "Unauthorized", {}, None)  # type: ignore

        res, motivo = A.leer_creditos("abl_mal", abrir=abrir_falso)
        self.assertIsNone(res)
        m = motivo or ""
        self.assertIn("401", m)
        self.assertNotIn("abl_mal", m)


class ActualizarYEstado(unittest.TestCase):
    def test_actualizar_escribe_atomico_con_permisos_0600(self):
        d = tempfile.mkdtemp()
        estado_path = os.path.join(d, "abliteration-uso.json")
        antes_estado = A.ESTADO
        A.ESTADO = estado_path

        def abrir_falso(req, timeout=20):
            class Resp:
                def read(self):
                    return json.dumps({"data": {"total_credits": 20.0, "total_usage": 5.0}}).encode("utf-8")
                def __enter__(self):
                    return self
                def __exit__(self, *args):
                    pass
            return Resp()

        try:
            res = A.actualizar(ahora=1700000000.0, abrir=abrir_falso, ruta=estado_path, clave_fn=lambda: "abl_valida")
            self.assertTrue(res["hecho"])
            self.assertTrue(os.path.exists(estado_path))
            self.assertEqual(oct(os.stat(estado_path).st_mode & 0o777), "0o600")

            with open(estado_path, encoding="utf-8") as f:
                data = json.load(f)
            self.assertEqual(data["total_credits"], 20.0)
            self.assertEqual(data["total_usage"], 5.0)
            self.assertEqual(data["t"], 1700000000.0)
        finally:
            A.ESTADO = antes_estado

    def test_main_sin_clave(self):
        # Capturar salida estándar
        import io
        captura = io.StringIO()
        
        antes_clave = A.clave
        A.clave = lambda: None
        sys.stdout = captura
        try:
            codigo = A.main(["", "ver"])
            self.assertEqual(codigo, 0)
            self.assertIn("sin clave", captura.getvalue())
        finally:
            A.clave = antes_clave
            sys.stdout = sys.__stdout__

