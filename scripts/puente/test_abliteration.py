# -*- coding: utf-8 -*-
"""Pruebas de abliteration.py: lectura de créditos, 401, sin clave, escritura atómica, permisos 0600, clave nunca en salida ni archivo."""
import json
import os
import sys
import tempfile
import unittest
from unittest.mock import MagicMock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import abliteration as A  # noqa: E402


# Respuesta válida de la API
RESPUESTA_OK = {"data": {"total_credits": 10.50, "total_usage": 2.25}}


class Clave(unittest.TestCase):
    def test_desde_entorno(self):
        os.environ["ABLITERATION_API_KEY"] = "sk-entorno-123"
        try:
            self.assertEqual(A.clave(), "sk-entorno-123")
        finally:
            os.environ.pop("ABLITERATION_API_KEY", None)

    def test_desde_archivo_starseed(self):
        d = tempfile.mkdtemp()
        ruta = os.path.join(d, "env")
        with open(ruta, "w") as f:
            f.write("ABLITERATION_API_KEY=sk-prueba-falsa-1\n")
        antes = A.ARCHIVOS_DE_CLAVES
        A.ARCHIVOS_DE_CLAVES = (ruta,)
        try:
            os.environ.pop("ABLITERATION_API_KEY", None)
            self.assertEqual(A.clave(), "sk-prueba-falsa-1")
        finally:
            A.ARCHIVOS_DE_CLAVES = antes

    def test_desde_archivo_hermes(self):
        d = tempfile.mkdtemp()
        ruta = os.path.join(d, "env")
        with open(ruta, "w") as f:
            f.write('export ABLITERATION_API_KEY="sk-hermes-789"\n')
        antes = A.ARCHIVOS_DE_CLAVES
        A.ARCHIVOS_DE_CLAVES = (ruta,)
        try:
            os.environ.pop("ABLITERATION_API_KEY", None)
            self.assertEqual(A.clave(), "sk-hermes-789")
        finally:
            A.ARCHIVOS_DE_CLAVES = antes

    def test_sin_clave_devuelve_none(self):
        os.environ.pop("ABLITERATION_API_KEY", None)
        antes = A.ARCHIVOS_DE_CLAVES
        A.ARCHIVOS_DE_CLAVES = ("/ruta/que/no/existe",)
        try:
            self.assertIsNone(A.clave())
        finally:
            A.ARCHIVOS_DE_CLAVES = antes


class LeerCreditos(unittest.TestCase):
    def test_lectura_buena(self):
        mock_resp = MagicMock()
        mock_resp.read.return_value = json.dumps(RESPUESTA_OK).encode("utf-8")
        mock_resp.__enter__ = lambda s: mock_resp
        mock_resp.__exit__ = lambda s, *a: None

        def abrir_ok(req, timeout=20):
            self.assertEqual(req.get_header("Authorization"), "Bearer sk-test-123")
            return mock_resp

        datos, motivo = A.leer_creditos("sk-test-123", abrir=abrir_ok)
        self.assertIsNone(motivo)
        self.assertEqual(datos, RESPUESTA_OK)

    def test_401_devuelve_none_y_motivo(self):
        def abrir_401(req, timeout=20):
            raise urllib.error.HTTPError("url", 401, "Unauthorized", {}, None)  # type: ignore[arg-type]

        import urllib.error
        datos, motivo = A.leer_creditos("sk-bad", abrir=abrir_401)
        self.assertIsNone(datos)
        self.assertEqual(motivo, "http_401")

    def test_403_devuelve_none_y_motivo(self):
        def abrir_403(req, timeout=20):
            raise urllib.error.HTTPError("url", 403, "Forbidden", {}, None)  # type: ignore[arg-type]

        import urllib.error
        datos, motivo = A.leer_creditos("sk-bad", abrir=abrir_403)
        self.assertIsNone(datos)
        self.assertEqual(motivo, "http_403")

    def test_429_devuelve_none_y_motivo(self):
        def abrir_429(req, timeout=20):
            raise urllib.error.HTTPError("url", 429, "Rate Limited", {}, None)  # type: ignore[arg-type]

        import urllib.error
        datos, motivo = A.leer_creditos("sk-bad", abrir=abrir_429)
        self.assertIsNone(datos)
        self.assertEqual(motivo, "http_429")

    def test_otro_http_devuelve_none_y_motivo(self):
        def abrir_500(req, timeout=20):
            raise urllib.error.HTTPError("url", 500, "Server Error", {}, None)  # type: ignore[arg-type]

        import urllib.error
        datos, motivo = A.leer_creditos("sk-test", abrir=abrir_500)
        self.assertIsNone(datos)
        self.assertEqual(motivo, "http_500")

    def test_error_red_devuelve_none_y_motivo(self):
        def abrir_red(req, timeout=20):
            raise urllib.error.URLError("conexión rechazada")

        import urllib.error
        datos, motivo = A.leer_creditos("sk-test", abrir=abrir_red)
        self.assertIsNone(datos)
        self.assertEqual(motivo, "URLError")

    def test_json_invalido_devuelve_none_y_motivo(self):
        mock_resp = MagicMock()
        mock_resp.read.return_value = b"no es json"
        mock_resp.__enter__ = lambda s: mock_resp
        mock_resp.__exit__ = lambda s, *a: None

        def abrir_json(req, timeout=20):
            return mock_resp

        datos, motivo = A.leer_creditos("sk-test", abrir=abrir_json)
        self.assertIsNone(datos)
        self.assertEqual(motivo, "JSONDecodeError")


class Registrar(unittest.TestCase):
    def test_extrae_campos_correctos(self):
        ahora = 1_700_000_000.0  # 2023-11-14 aprox
        r = A.registrar(RESPUESTA_OK, ahora=ahora)
        self.assertEqual(r["saldo_usd"], 10.50)
        self.assertEqual(r["gastado_total_usd"], 2.25)
        self.assertIn("actualizado", r)
        self.assertTrue(r["actualizado"].startswith("2023-"))

    def test_datos_faltantes_usa_cero(self):
        r = A.registrar({"data": {}}, ahora=1_700_000_000.0)
        self.assertEqual(r["saldo_usd"], 0.0)
        self.assertEqual(r["gastado_total_usd"], 0.0)

    def test_sin_data_usa_cero(self):
        r = A.registrar({}, ahora=1_700_000_000.0)
        self.assertEqual(r["saldo_usd"], 0.0)
        self.assertEqual(r["gastado_total_usd"], 0.0)


class Actualizar(unittest.TestCase):
    def test_escritura_atomica_y_permisos_0600(self):
        d = tempfile.mkdtemp()
        ruta_estado = os.path.join(d, "abliteration-uso.json")

        antes_estado = A.ESTADO
        A.ESTADO = ruta_estado
        os.environ["ABLITERATION_API_KEY"] = "sk-test-123"
        try:
            mock_resp = MagicMock()
            mock_resp.read.return_value = json.dumps(RESPUESTA_OK).encode("utf-8")
            mock_resp.__enter__ = lambda s: mock_resp
            mock_resp.__exit__ = lambda s, *a: None

            def abrir_ok(req, timeout=20):
                return mock_resp

            r = A.actualizar(abrir=abrir_ok, ruta=ruta_estado)
            self.assertTrue(r["hecho"])
            self.assertEqual(r["saldo_usd"], 10.50)
            self.assertEqual(r["gastado_total_usd"], 2.25)

            # Verificar archivo existe y tiene permisos 0600
            self.assertTrue(os.path.exists(ruta_estado))
            modo = os.stat(ruta_estado).st_mode & 0o777
            self.assertEqual(oct(modo), "0o600")

            # Verificar contenido
            with open(ruta_estado, encoding="utf-8") as f:
                guardado = json.load(f)
            self.assertEqual(guardado["saldo_usd"], 10.50)
            self.assertEqual(guardado["gastado_total_usd"], 2.25)

            # Verificar que la clave NO está en el archivo
            with open(ruta_estado, encoding="utf-8") as f:
                texto = f.read()
            self.assertNotIn("sk-test-123", texto)
            self.assertNotIn("sk-", texto)
        finally:
            A.ESTADO = antes_estado
            os.environ.pop("ABLITERATION_API_KEY", None)

    def test_sin_clave_no_escribe_y_devuelve_motivo(self):
        d = tempfile.mkdtemp()
        ruta_estado = os.path.join(d, "abliteration-uso.json")
        antes_estado = A.ESTADO
        A.ESTADO = ruta_estado
        antes_archivos = A.ARCHIVOS_DE_CLAVES
        A.ARCHIVOS_DE_CLAVES = ("/ruta/que/no/existe",)
        os.environ.pop("ABLITERATION_API_KEY", None)
        try:
            r = A.actualizar(ruta=ruta_estado)
            self.assertFalse(r["hecho"])
            self.assertEqual(r["motivo"], "sin clave")
            self.assertFalse(os.path.exists(ruta_estado))
        finally:
            A.ESTADO = antes_estado
            A.ARCHIVOS_DE_CLAVES = antes_archivos
            os.environ.pop("ABLITERATION_API_KEY", None)

    def test_error_api_no_escribe_y_devuelve_motivo(self):
        d = tempfile.mkdtemp()
        ruta_estado = os.path.join(d, "abliteration-uso.json")
        antes_estado = A.ESTADO
        A.ESTADO = ruta_estado
        os.environ["ABLITERATION_API_KEY"] = "sk-test"
        try:
            def abrir_401(req, timeout=20):
                import urllib.error
                raise urllib.error.HTTPError("url", 401, "Unauthorized", {}, None)  # type: ignore[arg-type]

            r = A.actualizar(abrir=abrir_401, ruta=ruta_estado)
            self.assertFalse(r["hecho"])
            self.assertEqual(r["motivo"], "http_401")
            self.assertFalse(os.path.exists(ruta_estado))
        finally:
            A.ESTADO = antes_estado
            os.environ.pop("ABLITERATION_API_KEY", None)


class ResumenEstado(unittest.TestCase):
    def test_con_datos_muestra_formato_correcto(self):
        d = tempfile.mkdtemp()
        ruta_estado = os.path.join(d, "abliteration-uso.json")
        with open(ruta_estado, "w") as f:
            json.dump({"saldo_usd": 10.50, "gastado_total_usd": 2.25, "actualizado": "2023-11-14T10:00:00"}, f)

        os.environ.pop("STARSEED_ABLITERATION_DIA_USD", None)
        try:
            texto = A.resumen_estado(ruta_estado)
            self.assertIn("abliteration.ai: saldo 10.50 USD", texto)
            self.assertIn("gastado hoy 2.25 USD", texto)
            self.assertIn("de 0.50", texto)  # valor por defecto
        finally:
            os.environ.pop("STARSEED_ABLITERATION_DIA_USD", None)

    def test_sin_archivo_dice_sin_datos(self):
        texto = A.resumen_estado("/ruta/que/no/existe.json")
        self.assertEqual(texto, "abliteration.ai: sin datos")

    def test_variable_dia_personalizada(self):
        d = tempfile.mkdtemp()
        ruta_estado = os.path.join(d, "abliteration-uso.json")
        with open(ruta_estado, "w") as f:
            json.dump({"saldo_usd": 5.0, "gastado_total_usd": 1.0, "actualizado": "2023-11-14T10:00:00"}, f)

        os.environ["STARSEED_ABLITERATION_DIA_USD"] = "1.00"
        try:
            texto = A.resumen_estado(ruta_estado)
            self.assertIn("de 1.00", texto)
        finally:
            os.environ.pop("STARSEED_ABLITERATION_DIA_USD", None)


class Main(unittest.TestCase):
    def test_sin_clave_dice_sin_clave_y_sale_0(self):
        os.environ.pop("ABLITERATION_API_KEY", None)
        antes = A.ARCHIVOS_DE_CLAVES
        A.ARCHIVOS_DE_CLAVES = ("/no/existe",)
        try:
            # Capturar stdout
            import io
            from contextlib import redirect_stdout
            buf = io.StringIO()
            with redirect_stdout(buf):
                codigo = A.main(["abliteration.py"])
            self.assertEqual(codigo, 0)
            self.assertIn("sin clave", buf.getvalue())
        finally:
            A.ARCHIVOS_DE_CLAVES = antes

    def test_ver_muestra_resumen(self):
        d = tempfile.mkdtemp()
        ruta_estado = os.path.join(d, "abliteration-uso.json")
        with open(ruta_estado, "w") as f:
            json.dump({"saldo_usd": 7.25, "gastado_total_usd": 1.50, "actualizado": "2023-11-14T10:00:00"}, f)

        antes_estado = A.ESTADO
        A.ESTADO = ruta_estado
        try:
            import io
            from contextlib import redirect_stdout
            buf = io.StringIO()
            # resumen_estado usa ESTADO por defecto, que ahora apunta a nuestra ruta temporal
            with redirect_stdout(buf):
                codigo = A.main(["abliteration.py", "ver"])
            self.assertEqual(codigo, 0)
            self.assertIn("abliteration.ai: saldo 7.25 USD", buf.getvalue())
            self.assertIn("gastado hoy 1.50 USD", buf.getvalue())
        finally:
            A.ESTADO = antes_estado

    def test_actualizar_exitoso_imprime_resumen(self):
        d = tempfile.mkdtemp()
        ruta_estado = os.path.join(d, "abliteration-uso.json")

        antes_estado = A.ESTADO
        A.ESTADO = ruta_estado
        os.environ["ABLITERATION_API_KEY"] = "sk-test-123"
        try:
            mock_resp = MagicMock()
            mock_resp.read.return_value = json.dumps(RESPUESTA_OK).encode("utf-8")
            mock_resp.__enter__ = lambda s: mock_resp
            mock_resp.__exit__ = lambda s, *a: None

            def abrir_ok(req, timeout=20):
                return mock_resp

            import io
            from contextlib import redirect_stdout
            buf = io.StringIO()
            with redirect_stdout(buf):
                codigo = A.main(["abliteration.py"], abrir=abrir_ok)
            self.assertEqual(codigo, 0)
            salida = buf.getvalue()
            self.assertIn("abliteration.ai: saldo 10.50 USD", salida)
            self.assertNotIn("sk-test-123", salida)
            self.assertNotIn("sk-", salida)
        finally:
            A.ESTADO = antes_estado
            os.environ.pop("ABLITERATION_API_KEY", None)


if __name__ == "__main__":
    unittest.main()