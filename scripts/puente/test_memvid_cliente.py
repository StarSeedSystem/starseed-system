#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""test_memvid_cliente · pruebas del cliente Memvid con servidor HTTP falso."""

import json
import os
import tempfile
import threading
import time
from http.server import HTTPServer, BaseHTTPRequestHandler
from typing import Any, Dict
from urllib.parse import urlparse, parse_qs

import pytest

# Importar el módulo a testear
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import memvid_cliente as mc


class FalsoServidorHandler(BaseHTTPRequestHandler):
    """Handler para el servidor Memvid falso."""
    
    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/salud":
            self._responder(200, {"ok": True, "capsules": 2, "version": "2.0.140"})
        elif parsed.path.startswith("/capsulas/") and parsed.path.endswith("/estado"):
            self._responder(200, {"frames": 5, "size_bytes": 1024, "capacity_bytes": 52428800, "remaining": 52427776})
        elif parsed.path.startswith("/capsulas/") and parsed.path.endswith("/linea"):
            self._responder(200, [{"frame_id": 1, "timestamp": 1000, "preview": "test"}])
        else:
            self._responder(404, {"error": "no encontrado"})
    
    def do_POST(self):
        parsed = urlparse(self.path)
        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length).decode("utf-8") if content_length else "{}"
        try:
            data = json.loads(body)
        except json.JSONDecodeError:
            data = {}
        
        if parsed.path.startswith("/capsulas/") and parsed.path.endswith("/poner"):
            self._responder(200, {"frame": 42})
        elif parsed.path.startswith("/capsulas/") and parsed.path.endswith("/buscar"):
            consulta = data.get("consulta", "")
            k = data.get("k", 3)
            aciertos = [
                {"frame_id": 1, "titulo": "Recuerdo 1", "texto": f"Texto sobre {consulta}", "uri": "mv2://agente/test/sesion/1/1", "ts": 1000, "score": 0.9},
                {"frame_id": 2, "titulo": "Recuerdo 2", "texto": f"Otro texto {consulta}", "uri": "mv2://agente/test/sesion/1/2", "ts": 2000, "score": 0.8},
            ][:k]
            self._responder(200, {"aciertos": aciertos})
        else:
            self._responder(404, {"error": "no encontrado"})
    
    def _responder(self, codigo: int, datos: Any):
        self.send_response(codigo)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(datos).encode("utf-8"))
    
    def log_message(self, format, *args):
        pass


class TestMemvidCliente:
    """Pruebas del cliente Memvid."""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Configura token temporal y servidor falso."""
        self.token_dir = tempfile.mkdtemp()
        self.token_path = os.path.join(self.token_dir, "memvid.token")
        with open(self.token_path, "w") as f:
            f.write("token-test-123")
        
        # Parchear rutas
        self._token_original = mc.TOKEN_PATH
        self._server_original = mc.SERVER_URL
        mc.TOKEN_PATH = self.token_path
        mc.SERVER_URL = "http://127.0.0.1:4491"
        
        # Iniciar servidor falso
        self.server = HTTPServer(("127.0.0.1", 4491), FalsoServidorHandler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        time.sleep(0.1)  # Esperar a que arranque
        
        yield
        
        # Limpiar
        self.server.shutdown()
        self.server.server_close()
        mc.TOKEN_PATH = self._token_original
        mc.SERVER_URL = self._server_original
        try:
            os.remove(self.token_path)
            os.rmdir(self.token_dir)
        except OSError:
            pass
    
    def test_salud_ok(self):
        """salud() devuelve Salud cuando el servidor responde."""
        s = mc.salud()
        assert s is not None
        assert s.ok is True
        assert s.capsules == 2
        assert s.version == "2.0.140"
    
    def test_salud_sin_servidor(self):
        """salud() devuelve None si el servidor no está."""
        mc.SERVER_URL = "http://127.0.0.1:9999"
        s = mc.salud()
        assert s is None
    
    def test_poner_ok(self):
        """poner() devuelve frame_id cuando el servidor responde."""
        fid = mc.poner("test.mv2", "Hola mundo", titulo="Saludo")
        assert fid == 42
    
    def test_poner_sin_servidor(self):
        """poner() devuelve None si el servidor no está."""
        mc.SERVER_URL = "http://127.0.0.1:9999"
        fid = mc.poner("test.mv2", "Hola mundo")
        assert fid is None
    
    def test_buscar_ok(self):
        """buscar() devuelve lista de Frame cuando el servidor responde."""
        frames = mc.buscar("test.mv2", "prueba", k=2)
        assert len(frames) == 2
        assert frames[0].frame_id == 1
        assert frames[0].title == "Recuerdo 1"
        assert "prueba" in frames[0].text
        assert frames[0].score == 0.9
    
    def test_buscar_sin_servidor(self):
        """buscar() devuelve lista vacía si el servidor no está."""
        mc.SERVER_URL = "http://127.0.0.1:9999"
        frames = mc.buscar("test.mv2", "prueba")
        assert frames == []
    
    def test_anotar_paso_crea_uri_correcta(self):
        """anotar_paso() genera URI con formato mv2://agente/<agente>/sesion/<sesion>/<paso>."""
        fid = mc.anotar_paso("aurora", "chat-1", "Primer mensaje")
        assert fid == 42
    
    def test_anotar_paso_numera_pasos(self):
        """anotar_paso() numera los pasos de una sesión."""
        mc.anotar_paso("aurora", "chat-2", "Paso 1")
        fid2 = mc.anotar_paso("aurora", "chat-2", "Paso 2")
        assert fid2 == 42
    
    def test_nombre_capsula_agente_formato(self):
        """El nombre de cápsula sigue el formato agente-<agente>-<AAAA>T<n>.mv2."""
        nombre = mc._nombre_capsula_agente("test")
        assert nombre.startswith("agente-test-")
        assert nombre.endswith(".mv2")
        # Verificar año y trimestre
        partes = nombre.split("-")
        assert len(partes) == 3
        assert partes[0] == "agente"
        assert partes[1] == "test"
        assert "T" in partes[2]
    
    def test_buscar_recuerdos_delega_a_buscar(self):
        """buscar_recuerdos() busca en la cápsula del agente."""
        frames = mc.buscar_recuerdos("aurora", "planes", k=3)
        assert len(frames) <= 3
        for f in frames:
            assert isinstance(f, mc.Frame)


if __name__ == "__main__":
    pytest.main([__file__, "-v"])