#!/usr/bin/env python3
"""Pruebas para cuentas_actividad.py y actividad_instagram.py (SDP1111Qb)."""
import inspect
import json
import os
import tempfile
import urllib.error
import zipfile
from unittest.mock import MagicMock, patch

import pytest

import cuentas_actividad as CA
import actividad_instagram as AI


class TestCuentasActividad:
    """Pruebas del módulo puro cuentas_actividad.py."""

    def test_cuentas_definidas(self):
        assert len(CA.CUENTAS) == 2
        alias = {c.alias for c in CA.CUENTAS}
        assert alias == {"alex", "fundacion"}

    def test_papel_de_alex(self):
        papel = CA.papel_de("alex")
        assert papel.alias == "alex"
        assert papel.correo == "alexbordongarrigos@gmail.com"
        assert papel.prioridad == 1

    def test_papel_de_fundacion(self):
        papel = CA.papel_de("fundacion")
        assert papel.alias == "fundacion"
        assert papel.correo == "fundacionstarseed@gmail.com"
        assert papel.prioridad == 2

    def test_papel_desconocido_lanza(self):
        with pytest.raises(ValueError, match="Alias desconocido"):
            CA.papel_de("otro")

    def test_cuentas_para_gmail_enviados_orden(self):
        """Gmail enviados: fundacion primero, alex después."""
        assert CA.cuentas_para_gmail_enviados() == ("fundacion", "alex")

    def test_cuentas_para_drive_docs_youtube_notebooklm_takeout_orden(self):
        """Drive, Docs, YouTube, NotebookLM, Takeout: alex primero, fundacion después."""
        assert CA.cuentas_para_drive_docs_youtube_notebooklm_takeout() == ("alex", "fundacion")

    def test_instagram_cuentas_definidas(self):
        assert len(CA.INSTAGRAM_CUENTAS) == 2
        cuentas = {ic["cuenta"] for ic in CA.INSTAGRAM_CUENTAS}
        assert cuentas == {"sociedadstarseed", "maggasukha"}

    def test_cuenta_instagram_para_maggasukha(self):
        assert CA.cuenta_instagram_para("maggasukha") == "alex"

    def test_cuenta_instagram_para_sociedadstarseed(self):
        assert CA.cuenta_instagram_para("sociedadstarseed") == "fundacion"

    def test_cuenta_instagram_desconocida_lanza(self):
        with pytest.raises(ValueError, match="Cuenta Instagram desconocida"):
            CA.cuenta_instagram_para("otra")

    def test_subcarpeta_instagram_drive_ids(self):
        assert CA.subcarpeta_instagram_drive("maggasukha") == "19_ymNnvy4iDpVuCLDiC47GyG2j2DVQ5U"
        assert CA.subcarpeta_instagram_drive("sociedadstarseed") == "1YWcHxOXG_zbE_Ea9ehuHCcVBGQcf0Z3U"


class TestActividadInstagramLocal:
    """Pruebas de lectura local (sin Drive)."""

    def _zip_muestra(self, tmpdir: str, cuenta: str = "maggasukha") -> str:
        """Crea un zip de muestra con saved_posts.json."""
        zip_path = os.path.join(tmpdir, f"instagram-{cuenta}-2026-11-11-abc123.zip")
        posts = [{
            "title": "Post guardado",
            "media_list_data": [{"media": {"author": "usuario_test", "href": "https://instagram.com/p/ABC123/"}}],
            "saved_date": 1731379200,  # 2026-11-11
        }]
        with zipfile.ZipFile(zip_path, "w") as z:
            z.writestr("saved_posts.json", json.dumps({"saved_saved_post": posts}))
        return zip_path

    def test_leer_local_zip_crea_fichas(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            zip_path = self._zip_muestra(tmpdir)
            entrada = os.path.join(tmpdir, "entrada")
            os.makedirs(entrada)
            os.rename(zip_path, os.path.join(entrada, os.path.basename(zip_path)))

            resultado = AI.leer(dirs=[entrada], dir_actividad=tmpdir)
            assert resultado["ok"] is True
            assert len(resultado["fichas"]) == 1
            ficha = resultado["fichas"][0]
            assert ficha["fuente"] == "instagram"
            assert ficha["cuenta"] == "maggasukha"
            assert ficha["tipo"] == "guardado"
            assert ficha["enlace"] == "https://instagram.com/p/ABC123/"
            assert ficha["autor"] == "usuario_test"
            assert ficha["privado"] is True

    def test_leer_local_incremental_por_enlace(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            zip_path = self._zip_muestra(tmpdir)
            entrada = os.path.join(tmpdir, "entrada")
            os.makedirs(entrada)
            os.rename(zip_path, os.path.join(entrada, os.path.basename(zip_path)))

            r1 = AI.leer(dirs=[entrada], dir_actividad=tmpdir)
            assert len(r1["fichas"]) == 1

            r2 = AI.leer(dirs=[entrada], dir_actividad=tmpdir, estado=r1["estado"])
            assert len(r2["fichas"]) == 0
            assert r2["estado"] == r1["estado"]

    def test_sanitizar_cuenta_elimina_peligrosos(self):
        assert AI._sanitizar_cuenta("cuenta.normal") == "cuenta.normal"
        assert AI._sanitizar_cuenta("cuenta/../traversal") == "cuenta_._traversal"
        assert AI._sanitizar_cuenta("") == "desconocida"
        assert AI._sanitizar_cuenta(".") == "desconocida"
        assert AI._sanitizar_cuenta("..") == "desconocida"
        assert AI._sanitizar_cuenta(".oculto") == "desconocida"
        assert len(AI._sanitizar_cuenta("a" * 100)) == 64


class TestActividadInstagramDrive:
    """Pruebas de lectura desde Drive (mock)."""

    def _mock_pedir_drive(self, archivos_subcarpeta, contenido_archivo):
        """Crea un mock para pedir que simula Drive."""
        def pedir(url, datos=None, cabeceras=None):
            if "q=" in url and "parents" in url:
                return {"files": archivos_subcarpeta}
            elif "alt=media" in url:
                file_id = url.split("/")[-2]
                for arch in archivos_subcarpeta:
                    if arch["id"] == file_id:
                        return contenido_archivo.get(file_id, b"")
                return b""
            return {}
        return pedir

    def test_leer_desde_drive_zip(self):
        """Prueba _leer_desde_drive con un zip en Drive."""
        with tempfile.TemporaryDirectory() as tmpdir:
            posts = [{
                "title": "Post desde Drive",
                "media_list_data": [{"media": {"author": "drive_user", "href": "https://instagram.com/p/DRIVE1/"}}],
                "saved_date": 1731379200,
            }]
            import io
            zip_buffer = io.BytesIO()
            with zipfile.ZipFile(zip_buffer, "w") as z:
                z.writestr("saved_posts.json", json.dumps({"saved_saved_post": posts}))
            zip_bytes = zip_buffer.getvalue()

            archivos = [{
                "id": "file1",
                "name": "instagram-maggasukha-2026-11-11-xyz.zip",
                "mimeType": "application/zip",
            }]
            contenido = {"file1": zip_bytes}

            pedir = self._mock_pedir_drive(archivos, contenido)

            with patch("cuentas_google.token", return_value="token-falso"), \
                 patch("urllib.request.urlopen") as mock_urlopen:
                mock_resp = MagicMock()
                mock_resp.read.return_value = zip_bytes
                mock_resp.__enter__ = lambda self: self
                mock_resp.__exit__ = lambda self, *a: None
                mock_urlopen.return_value = mock_resp

                fichas, errores = AI._leer_desde_drive(pedir, None, "alex", "maggasukha", tmpdir)

            assert len(errores) == 0, f"Errores: {errores}"
            assert len(fichas) == 1
            assert fichas[0]["enlace"] == "https://instagram.com/p/DRIVE1/"
            assert fichas[0]["cuenta"] == "maggasukha"

    def test_leer_desde_drive_sin_token(self):
        """Prueba _leer_desde_drive sin token (cuenta no autorizada)."""
        with tempfile.TemporaryDirectory() as tmpdir:
            def token_none(nombre): return None
            fichas, errores = AI._leer_desde_drive(lambda *a, **k: {}, token_none, "alex", "maggasukha", tmpdir)
            assert len(fichas) == 0
            assert any("sin token" in e for e in errores)

    def test_leer_con_desde_drive_true(self):
        """Prueba leer() con desde_drive=True (integración)."""
        with tempfile.TemporaryDirectory() as tmpdir:
            posts = [{
                "title": "Post Drive",
                "media_list_data": [{"media": {"author": "drive_user", "href": "https://instagram.com/p/DRIVE2/"}}],
                "saved_date": 1731379200,
            }]
            archivos = [{
                "id": "f1",
                "name": "instagram-maggasukha-2026-11-11.zip",
                "mimeType": "application/zip",
            }]
            import io
            zip_buffer = io.BytesIO()
            with zipfile.ZipFile(zip_buffer, "w") as z:
                z.writestr("saved_posts.json", json.dumps({"saved_saved_post": posts}))
            zip_bytes = zip_buffer.getvalue()
            contenido = {"f1": zip_bytes}

            pedir = self._mock_pedir_drive(archivos, contenido)

            with patch("cuentas_google.token", return_value="token-falso"), \
                 patch("urllib.request.urlopen") as mock_urlopen:
                mock_resp = MagicMock()
                mock_resp.read.return_value = zip_bytes
                mock_resp.__enter__ = lambda self: self
                mock_resp.__exit__ = lambda self, *a: None
                mock_urlopen.return_value = mock_resp

                resultado = AI.leer(
                    dirs=[],
                    dir_actividad=tmpdir,
                    pedir=pedir,
                    desde_drive=True,
                    alias=["alex"],
                )

            assert resultado["ok"] is True
            assert len(resultado["fichas"]) == 1
            assert resultado["fichas"][0]["enlace"] == "https://instagram.com/p/DRIVE2/"

    def test_leer_drive_filtra_por_alias(self):
        """Prueba que leer() con alias filtra las cuentas de Drive."""
        with tempfile.TemporaryDirectory() as tmpdir:
            posts_fundacion = [{
                "title": "Post Fundacion",
                "media_list_data": [{"media": {"author": "fundacion_user", "href": "https://instagram.com/p/FUND/"}}],
                "saved_date": 1731379200,
            }]
            posts_alex = [{
                "title": "Post Alex",
                "media_list_data": [{"media": {"author": "alex_user", "href": "https://instagram.com/p/ALEX/"}}],
                "saved_date": 1731379200,
            }]
            import io
            zip_fundacion = io.BytesIO()
            with zipfile.ZipFile(zip_fundacion, "w") as z:
                z.writestr("saved_posts.json", json.dumps({"saved_saved_post": posts_fundacion}))
            zip_fundacion_bytes = zip_fundacion.getvalue()
            zip_alex = io.BytesIO()
            with zipfile.ZipFile(zip_alex, "w") as z:
                z.writestr("saved_posts.json", json.dumps({"saved_saved_post": posts_alex}))
            zip_alex_bytes = zip_alex.getvalue()

            def pedir_selectivo(url, datos=None, cabeceras=None):
                if "q=" in url and "parents" in url:
                    if "19_ymNnvy4iDpVuCLDiC47GyG2j2DVQ5U" in url:  # maggasukha
                        return {"files": [{"id": "f_alex", "name": "instagram-maggasukha.zip", "mimeType": "application/zip"}]}
                    elif "1YWcHxOXG_zbE_Ea9ehuHCcVBGQcf0Z3U" in url:  # sociedadstarseed
                        return {"files": [{"id": "f_fund", "name": "instagram-sociedadstarseed.zip", "mimeType": "application/zip"}]}
                    return {"files": []}
                elif "alt=media" in url:
                    file_id = url.split("/")[-2]
                    if file_id == "f_alex":
                        return zip_alex_bytes
                    elif file_id == "f_fund":
                        return zip_fundacion_bytes
                return {}

            with patch("cuentas_google.token", return_value="token-falso"), \
                 patch("urllib.request.urlopen") as mock_urlopen:
                def urlopen_side_effect(req, timeout=60):
                    url = req.full_url if hasattr(req, 'full_url') else str(req)
                    mock_resp = MagicMock()
                    if "f_alex" in url:
                        mock_resp.read.return_value = zip_alex_bytes
                    elif "f_fund" in url:
                        mock_resp.read.return_value = zip_fundacion_bytes
                    else:
                        mock_resp.read.return_value = b""
                    mock_resp.__enter__ = lambda self: self
                    mock_resp.__exit__ = lambda self, *a: None
                    return mock_resp
                mock_urlopen.side_effect = urlopen_side_effect

                # Solo alex: debe leer maggasukha (suya), NO sociedadstarseed (fundacion)
                resultado = AI.leer(
                    dirs=[], dir_actividad=tmpdir, pedir=pedir_selectivo, desde_drive=True, alias=["alex"])
                assert len(resultado["fichas"]) == 1
                assert resultado["fichas"][0]["cuenta"] == "maggasukha"
                assert resultado["fichas"][0]["autor"] == "alex_user"

                # Solo fundacion: debe leer sociedadstarseed (suya), NO maggasukha (alex)
                resultado2 = AI.leer(
                    dirs=[], dir_actividad=tmpdir, pedir=pedir_selectivo, desde_drive=True, alias=["fundacion"])
                assert len(resultado2["fichas"]) == 1
                assert resultado2["fichas"][0]["cuenta"] == "sociedadstarseed"
                assert resultado2["fichas"][0]["autor"] == "fundacion_user"


class TestBugsCorregidos:
    """Pruebas que verifican la corrección de los bugs reportados."""

    def test_dir_actividad_definido_y_usado(self):
        """DIR_ACTIVIDAD está definido y se usa en _leer_desde_drive y leer."""
        assert hasattr(AI, "DIR_ACTIVIDAD")
        assert AI.DIR_ACTIVIDAD == os.path.expanduser("~/.starseed/actividad")
        sig = inspect.signature(AI._leer_desde_drive)
        assert "dir_actividad" in sig.parameters

    def test_dir_descargas_definido_y_usado(self):
        """DIR_DESCARGAS está definido y se usa en cargas_disponibles."""
        assert hasattr(AI, "DIR_DESCARGAS")
        assert AI.DIR_DESCARGAS == os.path.expanduser("~/Downloads")
        src = inspect.getsource(AI.leer)
        assert "DIR_DESCARGAS" in src

    def test_urllib_error_http_error_importado(self):
        """urllib.error.HTTPError está importado y se usa en except."""
        import actividad_instagram as AI_mod
        src = inspect.getsource(AI_mod)
        assert "urllib.error" in src
        assert "HTTPError" in src

    def test_drive_descargar_maneja_404(self):
        """_drive_descargar maneja HTTPError 404 sin lanzar."""
        with patch("urllib.request.urlopen") as mock_urlopen:
            mock_urlopen.side_effect = urllib.error.HTTPError("url", 404, "Not Found", {}, None)
            resultado = AI._drive_descargar(lambda *a, **k: {}, {}, "archivo_inexistente")
            assert resultado == b""

    def test_drive_descargar_lanza_otros_http_error(self):
        """_drive_descargar lanza HTTPError para códigos distintos de 404."""
        with patch("urllib.request.urlopen") as mock_urlopen:
            mock_urlopen.side_effect = urllib.error.HTTPError("url", 500, "Server Error", {}, None)
            with pytest.raises(urllib.error.HTTPError):
                AI._drive_descargar(lambda *a, **k: {}, {}, "archivo_error")

    def test_guardar_usa_dir_actividad_por_defecto(self):
        """guardar() usa DIR_ACTIVIDAD por defecto."""
        sig = inspect.signature(AI.guardar)
        param = sig.parameters["dir_actividad"]
        assert param.default == AI.DIR_ACTIVIDAD

    def test_leer_estado_usa_dir_actividad_por_defecto(self):
        """leer_estado() usa DIR_ACTIVIDAD por defecto."""
        sig = inspect.signature(AI.leer_estado)
        param = sig.parameters["dir_actividad"]
        assert param.default == AI.DIR_ACTIVIDAD


if __name__ == "__main__":
    pytest.main([__file__, "-v"])