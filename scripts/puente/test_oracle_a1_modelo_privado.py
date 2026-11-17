# -*- coding: utf-8 -*-
"""Pruebas del modelo privado del A1 en el estado del nodo (MQB4, MOD1116)."""
import os
import sys
import tempfile
import shutil
import json
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import oracle_a1 as A  # noqa: E402


class ModeloPrivadoEnEstado(unittest.TestCase):
    """El servicio del modelo privado se ve como una fila más del nodo y su memoria se cuenta."""

    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.tmp, True)
        self.estado_dir = os.path.join(self.tmp, "estado")
        os.makedirs(self.estado_dir)
        self.raiz = os.path.join(self.tmp, "repo")
        os.makedirs(os.path.join(self.raiz, ".git"))
        for nombre, valor in (("ESTADO_DIR", self.estado_dir), ("RAIZ", self.raiz),
                              ("LOGS", os.path.join(self.tmp, "logs"))):
            p = mock.patch.object(A, nombre, valor)
            p.start()
            self.addCleanup(p.stop)

    def _configurar_mocks(self, ollama_habilitado, version_ok, tags_con_etiqueta, cgroup_mem_mb=None):
        """Configura los mocks para simular el estado de Ollama."""
        # Mock os.path.exists para /etc/systemd/system/ollama.service
        original_exists = os.path.exists
        def mock_exists(path):
            if path == "/etc/systemd/system/ollama.service":
                return ollama_habilitado
            return original_exists(path)
        
        # Mock _http para /api/version
        def mock_http(self, url, extra=()):
            if "api/version" in url:
                return ("200" if version_ok else "000", 10)
            return ("000", 10)
        
        # Mock urllib.request.urlopen
        if version_ok:
            def make_response(body_bytes):
                """Crea un objeto respuesta con read() que devuelve bytes."""
                class MockResponse:
                    def __init__(self, body):
                        self._body = body
                    def read(self):
                        return self._body
                    def __enter__(self):
                        return self
                    def __exit__(self, *args):
                        pass
                return MockResponse(body_bytes)
            
            def mock_urlopen(url_or_req, timeout=8):
                url = str(url_or_req)
                if hasattr(url_or_req, 'get_full_url'):
                    url = url_or_req.get_full_url()
                if "api/tags" in url:
                    if tags_con_etiqueta:
                        return make_response(b'{"models": [{"name": "huihui_ai/qwen3.5-abliterated:4b", "size": 3338000000}]}')
                    else:
                        return make_response(b'{"models": [{"name": "otro:1b", "size": 950000000}]}')
                elif "api/version" in url:
                    return make_response(b'{"version": "0.1.0"}')
                return make_response(b'{}')
            self.mock_urlopen = mock.patch("urllib.request.urlopen", mock_urlopen)
            self.mock_urlopen.start()
            self.addCleanup(self.mock_urlopen.stop)
        
        # Aplicar todos los mocks
        self.mock_exists = mock.patch("os.path.exists", mock_exists)
        self.mock_exists.start()
        self.addCleanup(self.mock_exists.stop)
        
        self.mock_habilitado = mock.patch.object(A.Nodo, "_habilitado", lambda self, u: ollama_habilitado and u == "ollama.service")
        self.mock_habilitado.start()
        self.addCleanup(self.mock_habilitado.stop)
        
        self.mock_activo = mock.patch.object(A.Nodo, "_activo", lambda self, u: "active" if u == "ollama.service" else "inactive")
        self.mock_activo.start()
        self.addCleanup(self.mock_activo.stop)
        
        self.mock_leer = mock.patch.object(A, "_leer", lambda ruta, defecto: defecto)
        self.mock_leer.start()
        self.addCleanup(self.mock_leer.stop)
        
        self.mock_http = mock.patch.object(A.Nodo, "_http", mock_http)
        self.mock_http.start()
        self.addCleanup(self.mock_http.stop)
        
        if cgroup_mem_mb is not None:
            self.mock_mem = mock.patch.object(A.Nodo, "_memoria_servicio_mb", lambda self, u: cgroup_mem_mb)
            self.mock_mem.start()
            self.addCleanup(self.mock_mem.stop)

    def test_apagado_no_aparece_en_servicios(self):
        """Si Ollama no está habilitado, no aparece en la lista de servicios."""
        self._configurar_mocks(ollama_habilitado=False, version_ok=True, tags_con_etiqueta=True)
        nodo = A.Nodo()
        filas = nodo.servicios()
        nombres = [f["nombre"] for f in filas]
        self.assertNotIn("ollama", nombres)

    def test_encendido_sin_etiqueta_dice_instalado_no(self):
        """Si Ollama está encendido pero sin la etiqueta esperada, modelo_privado.instalado=False y motivo=etiqueta_no_instalada."""
        self._configurar_mocks(ollama_habilitado=True, version_ok=True, tags_con_etiqueta=False)
        nodo = A.Nodo()
        nodo.escribir_estado(forzar=True)
        with open(os.path.join(self.estado_dir, "estado.json"), encoding="utf-8") as f:
            estado = json.load(f)
        self.assertIn("modelo_privado", estado)
        mp = estado["modelo_privado"]
        self.assertFalse(mp["vivo"])
        self.assertFalse(mp["instalado"])
        self.assertEqual(mp["motivo"], "etiqueta_no_instalada")
        # El ok del servicio Ollama refleja el estado del modelo privado
        filas = nodo.servicios()
        fila = next((f for f in filas if f["nombre"] == "ollama"), None)
        self.assertIsNotNone(fila)
        self.assertFalse(fila["ok"])

    def test_encendido_con_etiqueta_da_vivo_true(self):
        """Si Ollama está encendido y con la etiqueta, vivo=True."""
        self._configurar_mocks(ollama_habilitado=True, version_ok=True, tags_con_etiqueta=True)
        nodo = A.Nodo()
        filas = nodo.servicios()
        fila = next((f for f in filas if f["nombre"] == "ollama"), None)
        self.assertIsNotNone(fila)
        self.assertTrue(fila["ok"])

    def test_modelo_privado_en_estado_json(self):
        """El estado.json incluye la clave modelo_privado con vivo, etiqueta, desde, motivo y servicio_memoria_mb en la raíz."""
        self._configurar_mocks(ollama_habilitado=True, version_ok=True, tags_con_etiqueta=True, cgroup_mem_mb=1500)
        nodo = A.Nodo()
        nodo.escribir_estado(forzar=True)
        with open(os.path.join(self.estado_dir, "estado.json"), encoding="utf-8") as f:
            estado = json.load(f)
        self.assertIn("modelo_privado", estado)
        mp = estado["modelo_privado"]
        self.assertTrue(mp["vivo"])
        self.assertEqual(mp["etiqueta"], "huihui_ai/qwen3.5-abliterated:4b")
        self.assertIsNotNone(mp["desde"])
        self.assertEqual(mp["motivo"], "ok")
        self.assertIn("servicio_memoria_mb", estado)
        self.assertEqual(estado["servicio_memoria_mb"], 1500)

    def test_modelo_privado_sin_memoria_si_no_se_puede_leer(self):
        """Si no se puede leer el cgroup, servicio_memoria_mb es null."""
        self._configurar_mocks(ollama_habilitado=True, version_ok=True, tags_con_etiqueta=True, cgroup_mem_mb=None)
        nodo = A.Nodo()
        nodo.escribir_estado(forzar=True)
        with open(os.path.join(self.estado_dir, "estado.json"), encoding="utf-8") as f:
            estado = json.load(f)
        self.assertIn("modelo_privado", estado)
        self.assertIsNone(estado["servicio_memoria_mb"])

    def test_modelo_privado_apagado_no_aparece(self):
        """Si Ollama no está habilitado, modelo_privado no aparece en el estado."""
        self._configurar_mocks(ollama_habilitado=False, version_ok=True, tags_con_etiqueta=True)
        nodo = A.Nodo()
        nodo.escribir_estado(forzar=True)
        with open(os.path.join(self.estado_dir, "estado.json"), encoding="utf-8") as f:
            estado = json.load(f)
        self.assertNotIn("modelo_privado", estado)
        self.assertNotIn("servicio_memoria_mb", estado)

    def test_carga_por_hora_sigue_funcionando(self):
        """La función carga_por_hora sigue funcionando (compatibilidad)."""
        base = 1_800_000_000 - (1_800_000_000 % 3600)
        muestras = [(base + 60 * i, 10.0, 30.0) for i in range(30)] + \
                   [(base + 3600 + 60 * i, 50.0, 40.0) for i in range(30)]
        filas, p95 = A.carga_por_hora(muestras, base + 2 * 3600, horas=24)
        self.assertEqual(len(filas), 2)
        self.assertIn("mem", filas[0])
        self.assertEqual(filas[0]["mem"], 30.0)
        self.assertEqual(filas[1]["mem"], 40.0)

if __name__ == "__main__":
    unittest.main()