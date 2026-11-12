#!/usr/bin/env python3
"""Pruebas de navegador_cliente sin red: Playwright mockeado, sin contenedor real."""
import json
import os
import sys
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch, mock_open

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import navegador_cliente as NC


class TestCerrojo(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        NC.CERROJOS = os.path.join(self.tmp, "cerrojos")
        NC._tomado = False
        NC._page = None
        NC._browser = None
        os.makedirs(NC.CERROJOS, exist_ok=True)

    def tearDown(self):
        lock_file = os.path.join(NC.CERROJOS, "navegador.lock")
        try:
            os.unlink(lock_file)
        except FileNotFoundError:
            pass

    def test_cerrojo_impide_sesiones_simultaneas(self):
        """Una sesión a la vez, con cerrojo en ~/.starseed/cerrojos/."""
        lock_file = os.path.join(NC.CERROJOS, "navegador.lock")
        pid_actual = os.getpid()
        with open(lock_file, "w") as f:
            f.write(str(pid_actual))
        self.assertFalse(NC._tomar_cerrojo())
        Path(lock_file).unlink()

    def test_cerrojo_se_recupera_si_pid_anterior_muerto(self):
        """Si el PID del lock es inexistente, se puede tomar."""
        lock_file = os.path.join(NC.CERROJOS, "navegador.lock")
        with open(lock_file, "w") as f:
            f.write("99999999")  # PID inexistente
        result = NC._tomar_cerrojo()
        self.assertTrue(result)

    def test_cerrojo_permitido_incluye_pid(self):
        """El cerrojo contiene el PID del proceso que lo tomó."""
        lock_file = os.path.join(NC.CERROJOS, "navegador.lock")
        result = NC._tomar_cerrojo()
        self.assertTrue(result)
        with open(lock_file, "r") as f:
            contenido = f.read().strip()
        self.assertEqual(int(contenido), os.getpid())
        Path(lock_file).unlink()


class TestAbrir(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        NC.CERROJOS = os.path.join(self.tmp, "cerrojos")
        NC.ESTADO = os.path.join(self.tmp, "estado.json")
        NC.CONTENEDOR = os.path.join(self.tmp, "compose.yml")
        NC._tomado = False
        NC._page = None
        NC._browser = None
        NC._contenedor_activo = False
        os.makedirs(NC.CERROJOS, exist_ok=True)

        estado = {"viva": True, "puerto_debug": 9222}
        with open(NC.ESTADO, "w") as f:
            json.dump(estado, f)

    def tearDown(self):
        lock_file = os.path.join(NC.CERROJOS, "navegador.lock")
        Path(lock_file).unlink(missing_ok=True)

    def test_abrir_lanza_error_si_url_no_permitida(self):
        """Pasa por navegador_reglas.permitida; si no, lanza."""
        with patch.object(NC, '_iniciar_sesion'):
            with patch('os.unlink'):
                with self.assertRaises(ValueError) as ctx:
                    NC.abrir("https://ejemplo.com/pagina")
                self.assertIn("no permitida", str(ctx.exception))

    def test_abrir_paga_por_reglas_permitida(self):
        """Solo dominios de la lista pueden abrirse."""
        mock_page = MagicMock()
        mock_browser = MagicMock()
        mock_browser.new_page.return_value = mock_page

        with patch.object(NC, 'PLAYWRIGHT_AVAILABLE', True):
            with patch.object(NC, '_browser', mock_browser):
                NC._page = mock_page
                NC._iniciar_sesion()
                NC._page = mock_page
                NC.abrir("https://www.youtube.com")
                NC._page.goto.assert_called_once_with("https://www.youtube.com")


class TestExtraer(unittest.TestCase):
    def setUp(self):
        NC.ESTADO = tempfile.mktemp()
        NC._page = MagicMock()

    def test_extraer_devuelve_texto_y_enlaces(self):
        """extraer(selector, campos) devuelve texto y enlaces."""
        NC._page.content.return_value = (
            '<html><body><a href="/video1" class="yt-video">Título 1</a></body></html>'
        )
        NC._iniciar_sesion = lambda: None
        resultado = NC.extraer(selector=".yt-video", campos=["href", "text"])
        self.assertGreater(len(resultado), 0)
        self.assertIn("href", resultado[0])
        self.assertEqual(resultado[0]["href"], "/video1")

    def test_extraer_devuelve_lista_vacia_sin_resultados(self):
        """Si no hay coincidencias, devuelve lista vacía."""
        NC._page.content.return_value = '<html><body><p>No hay links</p></body></html>'
        NC._iniciar_sesion = lambda: None
        resultado = NC.extraer(selector=".noexiste", campos=["text"])
        self.assertEqual(resultado, [])


class TestEsqueleto(unittest.TestCase):
    def setUp(self):
        NC._page = MagicMock()
        NC._browser = MagicMock()

    def test_esqueleto_mantiene_estructura_valida(self):
        """La estructura HTML básica se mantiene."""
        NC._page.body.inner_html.return_value = '<html><body><div class="container"><span></span></div></body></html>'
        NC._iniciar_sesion = lambda: None
        resultado = NC.esqueleto()
        self.assertIn("<div", resultado)
        self.assertIn("</div>", resultado)

    def test_esqueleto_elimina_textos_visibles(self):
        """esqueleto() reduce texto a vacío o lo elimina."""
        NC._page.body.inner_html.return_value = (
            '<html><body><h1>Test</h1><a href="/link">Enlace</a></body></html>'
        )
        NC._iniciar_sesion = lambda: None
        resultado = NC.esqueleto()
        self.assertNotIn("Test", resultado)
        self.assertNotIn("Enlace", resultado)
        self.assertIn("href", resultado)


class TestEsperarDesplazar(unittest.TestCase):
    def test_esperar_espera_el_tiempo_requerido(self):
        """esperar() espera el tiempo requerido."""
        NC._page = MagicMock()
        with patch('time.sleep') as mock_sleep:
            NC.esperar(0.1)
            NC._page.wait_for_timeout.assert_called_once_with(100)

    def test_esperar_sin_page_usa_sleep(self):
        """Sin _page, espera usa time.sleep."""
        NC._page = None
        with patch('time.sleep') as mock_sleep:
            NC.esperar(0.5)
            mock_sleep.assert_called_once_with(0.5)

    def test_desplazar_scrollea(self):
        """desplazar(n) scrollea n veces hacia abajo."""
        NC._page = MagicMock()
        NC.desplazar(3)
        self.assertEqual(NC._page.evaluate.call_count, 3)

    def test_desplazar_sin_page_levanta_error(self):
        """Sin page, desplazar levanta error."""
        NC._page = None
        with self.assertRaises(RuntimeError):
            NC.desplazar(1)


class TestCerrar(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        NC.CERROJOS = os.path.join(self.tmp, "cerrojos")
        NC._tomado = False
        os.makedirs(NC.CERROJOS, exist_ok=True)

    def test_cerrar_libera_cerrojo_y_detiene_contenedor(self):
        """cerrar() libera el cerrojo y detiene el contenedor."""
        lock_file = os.path.join(NC.CERROJOS, "navegador.lock")
        with open(lock_file, "w") as f:
            f.write(str(os.getpid()))

        NC._browser = MagicMock()
        NC._page = MagicMock()
        NC._contenedor_activo = True

        NC._detener_contenedor = lambda: None

        NC.cerrar()

        self.assertFalse(os.path.exists(lock_file))
        self.assertIsNone(NC._page)
        self.assertIsNone(NC._browser)

    def test_cerrar_sin_page_no_falla(self):
        """cerrar() sin page previamente trabajado no falla."""
        NC._page = None
        NC._browser = None
        NC._contenedor_activo = False
        NC.cerrar()  # No debe elevar excepción


if __name__ == "__main__":
    unittest.main()