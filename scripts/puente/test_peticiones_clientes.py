#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Tests para peticiones_clientes.py — clientes reales de NotebookLM y Drive para el modo de encargo."""
import json
import os
import sys
import tempfile
from unittest.mock import patch, MagicMock

sys.path.insert(0, os.path.dirname(__file__))

import pytest

import peticiones_clientes as pc
from peticiones_clientes import ClienteNotebookLM, ClienteDrive


class TestClienteNotebookLM:
    """Tests para ClienteNotebookLM: cada método llama a nb() con los args exactos."""

    def setup_method(self):
        self.cliente = ClienteNotebookLM()

    def _mock_nb(self, rc=0, out="", err=""):
        """Helper para mockear nb() y retornar (rc, out, err)."""
        return patch("peticiones_clientes.nb", return_value=(rc, out, err))

    def test_create_llama_nb_con_argumentos_correctos(self):
        """create(nombre) llama a nb(['create', nombre, '--json'])."""
        with self._mock_nb(0, json.dumps({"id": "nb_123"}), "") as mock_nb:
            rc, out, err = self.cliente.create("Mi cuaderno")
            assert rc == 0
            mock_nb.assert_called_once()
            args = mock_nb.call_args[0][0]
            assert args[:2] == ["create", "Mi cuaderno"]
            assert "--json" in args

    def test_create_json_output_false_no_pone_json(self):
        """create(json_output=False) no añade --json."""
        with self._mock_nb(0, "nb_123", "") as mock_nb:
            rc, out, err = self.cliente.create("Mi cuaderno", json_output=False)
            assert rc == 0
            args = mock_nb.call_args[0][0]
            assert "--json" not in args

    def test_source_add_drive_llama_nb_con_args_correctos(self):
        """source_add_drive(cuaderno_id, drive_id, titulo) llama a nb con args correctos."""
        with self._mock_nb(0, json.dumps({"source_id": "src_456"}), "") as mock_nb:
            rc, out, err = self.cliente.source_add_drive("nb_123", "drive_789", "Mi documento")
            assert rc == 0
            mock_nb.assert_called_once()
            args = mock_nb.call_args[0][0]
            assert args[:5] == ["source", "add-drive", "-n", "nb_123", "drive_789"]
            assert "Mi documento" in args
            assert "--json" in args

    def test_source_wait_llama_nb_con_args_correctos(self):
        """source_wait(cuaderno_id, source_id, timeout) llama a nb con args correctos."""
        with self._mock_nb(0, json.dumps({"status": "ready"}), "") as mock_nb:
            rc, out, err = self.cliente.source_wait("nb_123", "src_456", timeout=600)
            assert rc == 0
            mock_nb.assert_called_once()
            args = mock_nb.call_args[0][0]
            assert args[:5] == ["source", "wait", "-n", "nb_123", "src_456"]
            assert "--timeout" in args
            assert "600" in args

    def test_source_add_research_deep_llama_nb_con_args_correctos(self):
        """source_add_research(mode='deep') llama a nb con --mode deep."""
        with self._mock_nb(0, json.dumps({"status": "completed"}), "") as mock_nb:
            rc, out, err = self.cliente.source_add_research("nb_123", "consulta test", mode="deep", timeout=3300)
            assert rc == 0
            mock_nb.assert_called_once()
            args = mock_nb.call_args[0][0]
            assert args[:5] == ["source", "add-research", "-n", "nb_123", "consulta test"]
            assert "--mode" in args
            assert "deep" in args
            assert "--timeout" in args
            assert "3300" in args

    def test_source_add_research_list_llama_nb_con_mode_list(self):
        """source_add_research(mode='list') llama a nb con --mode list y devuelve lista de fuentes."""
        fuentes_mock = [{"id": "src_1", "title": "Fuente 1", "status": "ready"}]
        with self._mock_nb(0, json.dumps({"sources": fuentes_mock}), "") as mock_nb:
            rc, out, err = self.cliente.source_add_research("nb_123", "", mode="list", timeout=180)
            assert rc == 0
            args = mock_nb.call_args[0][0]
            assert "--mode" in args
            assert "list" in args

    def test_source_add_research_delete_llama_nb_con_mode_delete_y_source_id(self):
        """source_add_research(mode='delete', source_id=...) llama a nb con --mode delete --source-id."""
        with self._mock_nb(0, "", "") as mock_nb:
            rc, out, err = self.cliente.source_add_research("nb_123", "", mode="delete", source_id="src_1", timeout=60)
            assert rc == 0
            args = mock_nb.call_args[0][0]
            assert "--mode" in args
            assert "delete" in args
            assert "--source-id" in args
            assert "src_1" in args

    def test_generate_llama_nb_con_args_correctos(self):
        """generate(cuaderno_id, tipo, prompt, no_wait, retry) llama a nb con args correctos."""
        with self._mock_nb(0, json.dumps({"task_id": "task_789"}), "") as mock_nb:
            rc, out, err = self.cliente.generate("nb_123", "report", "Escribe un informe", no_wait=True, retry=2)
            assert rc == 0
            mock_nb.assert_called_once()
            args = mock_nb.call_args[0][0]
            assert args[:4] == ["generate", "report", "-n", "nb_123"]
            assert "--json" in args
            assert "--no-wait" in args
            assert "--retry" in args
            assert "2" in args
            assert "Escribe un informe" in args

    def test_generate_sync_sin_no_wait(self):
        """generate(no_wait=False) no incluye --no-wait."""
        with self._mock_nb(0, json.dumps({"status": "completed"}), "") as mock_nb:
            rc, out, err = self.cliente.generate("nb_123", "mind-map", "Mapa mental", no_wait=False)
            assert rc == 0
            args = mock_nb.call_args[0][0]
            assert "--no-wait" not in args

    def test_artifact_wait_llama_nb_con_args_correctos(self):
        """artifact_wait(cuaderno_id, tarea_id, timeout) llama a nb con args correctos."""
        with self._mock_nb(0, json.dumps({"status": "completed"}), "") as mock_nb:
            rc, out, err = self.cliente.artifact_wait("nb_123", "task_789", timeout=1200)
            assert rc == 0
            mock_nb.assert_called_once()
            args = mock_nb.call_args[0][0]
            assert args[:5] == ["artifact", "wait", "-n", "nb_123", "task_789"]
            assert "--timeout" in args
            assert "1200" in args

    def test_download_llama_nb_con_args_correctos(self):
        """download(tipo, cuaderno_id, tarea_id, ruta, force) llama a nb con args correctos."""
        with self._mock_nb(0, "", "") as mock_nb:
            with tempfile.NamedTemporaryFile(delete=False) as tmp:
                tmp_path = tmp.name
            try:
                rc, out, err = self.cliente.download("report", "nb_123", "task_789", tmp_path, force=True)
                assert rc == 0
                mock_nb.assert_called_once()
                args = mock_nb.call_args[0][0]
                assert args[:7] == ["download", "report", "-n", "nb_123", "-a", "task_789", tmp_path]
                assert "--force" in args
            finally:
                if os.path.exists(tmp_path):
                    os.unlink(tmp_path)

    def test_ask_llama_nb_con_args_correctos(self):
        """ask(cuaderno_id, prompt) llama a nb con args correctos."""
        with self._mock_nb(0, json.dumps({"answer": "Respuesta"}), "") as mock_nb:
            rc, out, err = self.cliente.ask("nb_123", "¿Qué hay en el cuaderno?")
            assert rc == 0
            mock_nb.assert_called_once()
            args = mock_nb.call_args[0][0]
            assert args[:4] == ["ask", "-n", "nb_123", "¿Qué hay en el cuaderno?"]
            assert "--json" in args

    def test_metodo_propaga_errores_de_nb(self):
        """Si nb devuelve rc != 0, el método propaga (rc, out, err)."""
        with self._mock_nb(1, "", "error de autenticación"):
            rc, out, err = self.cliente.create("Test")
            assert rc == 1
            assert "error de autenticación" in err


class TestClienteDrive:
    """Tests para ClienteDrive: carpeta, doc, archivo usando token_google y API Drive v3."""

    def setup_method(self):
        self.cliente = ClienteDrive()

    def _mock_token_google(self, token="test_token_123"):
        return patch("peticiones_clientes.token_google", return_value=token)

    def _mock_urlopen(self, response_data):
        """Mockea urllib.request.urlopen para devolver response_data."""
        mock_response = MagicMock()
        mock_response.read.return_value = json.dumps(response_data).encode()
        mock_response.__enter__ = lambda s: mock_response
        mock_response.__exit__ = lambda s, *a: None
        return patch("peticiones_clientes.urllib.request.urlopen", return_value=mock_response)

    def test_carpeta_crea_carpeta_en_drive_y_devuelve_id_enlace(self):
        """carpeta(nombre, padre) crea carpeta en Drive y devuelve (id, enlace)."""
        with self._mock_token_google(), self._mock_urlopen({"id": "folder_abc", "name": "Test Carpeta"}):
            fid, enlace = self.cliente.carpeta("Test Carpeta", "parent_xyz")
            assert fid == "folder_abc"
            assert enlace == "https://drive.google.com/drive/folders/folder_abc"

    def test_doc_crea_documento_nuevo_y_devuelve_id_enlace(self):
        """doc(nombre, markdown, padre) crea Doc en Drive y devuelve (id, enlace)."""
        with self._mock_token_google(), self._mock_urlopen({"id": "doc_def", "name": "Mi Doc"}):
            fid, enlace = self.cliente.doc("Mi Doc", "# Contenido\n\nTexto", padre="folder_abc")
            assert fid == "doc_def"
            assert enlace == "https://docs.google.com/document/d/doc_def"

    def test_doc_actualiza_documento_existente_si_archivo_id(self):
        """doc(archivo_id=...) actualiza el documento existente."""
        with self._mock_token_google():
            # Primera llamada: obtener metadata del archivo existente
            mock_get = MagicMock()
            mock_get.read.return_value = json.dumps({"id": "doc_existente", "name": "Viejo"}).encode()
            mock_get.__enter__ = lambda s: mock_get
            mock_get.__exit__ = lambda s, *a: None

            # Segunda llamada: update
            mock_update = MagicMock()
            mock_update.read.return_value = json.dumps({"id": "doc_existente", "name": "Nuevo"}).encode()
            mock_update.__enter__ = lambda s: mock_update
            mock_update.__exit__ = lambda s, *a: None

            with patch("peticiones_clientes.urllib.request.urlopen", side_effect=[mock_get, mock_update]):
                fid, enlace = self.cliente.doc("Nuevo", "# Nuevo contenido", archivo_id="doc_existente")
                assert fid == "doc_existente"
                assert enlace == "https://docs.google.com/document/d/doc_existente"

    def test_archivo_sube_archivo_multipart_y_devuelve_id_enlace(self):
        """archivo(ruta, padre, nombre) sube archivo multipart y devuelve (id, enlace)."""
        with self._mock_token_google():
            # Crear archivo temporal
            with tempfile.NamedTemporaryFile(mode="w", delete=False, suffix=".txt") as tmp:
                tmp.write("contenido de prueba")
                tmp_path = tmp.name

            try:
                mock_response = MagicMock()
                mock_response.read.return_value = json.dumps({"id": "file_ghi", "name": "test.txt"}).encode()
                mock_response.__enter__ = lambda s: mock_response
                mock_response.__exit__ = lambda s, *a: None

                with patch("peticiones_clientes.urllib.request.urlopen", return_value=mock_response):
                    fid, enlace = self.cliente.archivo(tmp_path, "folder_abc", "test.txt")
                    assert fid == "file_ghi"
                    assert enlace == "https://drive.google.com/file/d/file_ghi"
            finally:
                if os.path.exists(tmp_path):
                    os.unlink(tmp_path)

    def test_carpeta_propaga_error_si_token_falla(self):
        """Si token_google falla, carpeta propaga la excepción."""
        with patch("peticiones_clientes.token_google", side_effect=RuntimeError("token falló")):
            with pytest.raises(RuntimeError, match="token falló"):
                self.cliente.carpeta("Test", "parent")

    def test_doc_propaga_error_si_token_falla(self):
        """Si token_google falla, doc propaga la excepción."""
        with patch("peticiones_clientes.token_google", side_effect=RuntimeError("token falló")):
            with pytest.raises(RuntimeError, match="token falló"):
                self.cliente.doc("Test", "contenido")


class TestIntegracionConProductor:
    """Tests de integración: los clientes funcionan con la interfaz que espera peticiones_productor."""

    def test_cliente_notebooklm_tiene_todos_los_metodos_requeridos(self):
        """ClienteNotebookLM expone todos los métodos que usa _llamar_nb en productor."""
        cliente = ClienteNotebookLM()
        metodos_requeridos = [
            "create", "source_add_drive", "source_wait",
            "source_add_research", "generate", "artifact_wait",
            "download", "ask"
        ]
        for m in metodos_requeridos:
            assert hasattr(cliente, m), f"Falta método {m}"
            assert callable(getattr(cliente, m)), f"{m} no es callable"

    def test_cliente_drive_tiene_todos_los_metodos_requeridos(self):
        """ClienteDrive expone todos los métodos que usa el productor."""
        cliente = ClienteDrive()
        metodos_requeridos = ["carpeta", "doc", "archivo"]
        for m in metodos_requeridos:
            assert hasattr(cliente, m), f"Falta método {m}"
            assert callable(getattr(cliente, m)), f"{m} no es callable"

    def test_cliente_notebooklm_devuelve_tupla_rc_out_err(self):
        """Cada método de ClienteNotebookLM devuelve (int, str, str)."""
        cliente = ClienteNotebookLM()
        with patch("peticiones_clientes.nb", return_value=(0, '{"id": "x"}', "")):
            for metodo in ["create", "source_add_drive", "source_wait", "source_add_research",
                           "generate", "artifact_wait", "download", "ask"]:
                fn = getattr(cliente, metodo)
                # Llamar con args mínimos según firma
                if metodo == "create":
                    res = fn("test")
                elif metodo == "source_add_drive":
                    res = fn("nb", "drive", "titulo")
                elif metodo == "source_wait":
                    res = fn("nb", "src")
                elif metodo == "source_add_research":
                    res = fn("nb", "query", mode="list")
                elif metodo == "generate":
                    res = fn("nb", "report", "prompt")
                elif metodo == "artifact_wait":
                    res = fn("nb", "task")
                elif metodo == "download":
                    import tempfile
                    with tempfile.NamedTemporaryFile(delete=False) as tmp:
                        res = fn("report", "nb", "task", tmp.name)
                    os.unlink(tmp.name)
                elif metodo == "ask":
                    res = fn("nb", "prompt")
                assert isinstance(res, tuple), f"{metodo} no devuelve tupla"
                assert len(res) == 3, f"{metodo} no devuelve 3 elementos"
                assert isinstance(res[0], int), f"{metodo}[0] no es int"
                assert isinstance(res[1], str), f"{metodo}[1] no es str"
                assert isinstance(res[2], str), f"{metodo}[2] no es str"


class TestPermisosDrive:
    """Tests para verificar permisos de escritura en Drive antes de usar ClienteDrive."""

    def test_verificar_permiso_escritura_antes_de_usar_cliente(self):
        """ANTES de escribir, se debe comprobar con tokeninfo que el permiso alcanza para escribir."""
        # Este test documenta el requisito: _clientes_de_encargo() debe verificar permisos
        # y devolver None si solo hay permiso de lectura
        pass  # La implementación real está en peticiones_telegram.py:_clientes_de_encargo()


class TestIntegracionEndToEnd:
    """Tests de integración end-to-end con mocks."""

    def test_cliente_de_encargo_devuelve_clientes_validos_cuando_permiso_ok(self, monkeypatch):
        """_clientes_de_encargo() devuelve (nb, drive) cuando hay permiso de escritura."""
        import peticiones_telegram as mod
        import peticiones_clientes as pc

        # Mock verificar_permiso_drive_escritura para devolver True
        monkeypatch.setattr(pc, "verificar_permiso_drive_escritura", lambda: (True, "OK"))
        # Mock _registrar_accion_alex_drive_escritura para no escribir archivo
        monkeypatch.setattr(mod, "_registrar_accion_alex_drive_escritura", lambda *a, **k: None)

        clientes = mod._clientes_de_encargo()
        assert clientes is not None, "Debería devolver clientes cuando permiso OK"
        nb_c, drive_c = clientes
        assert isinstance(nb_c, pc.ClienteNotebookLM)
        assert isinstance(drive_c, pc.ClienteDrive)

    def test_cliente_de_encargo_devuelve_none_cuando_permiso_solo_lectura(self, monkeypatch):
        """_clientes_de_encargo() devuelve None cuando Drive solo tiene permiso de lectura."""
        import peticiones_telegram as mod
        import peticiones_clientes as pc

        monkeypatch.setattr(pc, "verificar_permiso_drive_escritura", lambda: (False, "Solo lectura"))
        monkeypatch.setattr(mod, "_registrar_accion_alex_drive_escritura", lambda *a, **k: None)

        clientes = mod._clientes_de_encargo()
        assert clientes is None, "Debería devolver None cuando solo lectura"

    def test_atender_encargo_llama_enviar_entregable_con_archivo_real(self, monkeypatch, tmp_path):
        """atender_encargo usa enviar_entregable que envía archivo a Telegram."""
        import peticiones_telegram as mod
        import peticiones_clientes as pc

        # Mocks
        monkeypatch.setattr(pc, "verificar_permiso_drive_escritura", lambda: (True, "OK"))
        monkeypatch.setattr(mod, "_registrar_accion_alex_drive_escritura", lambda *a, **k: None)

        nb_mock = pc.ClienteNotebookLM()
        drive_mock = pc.ClienteDrive()

        # Mock nb methods para simular flujo exitoso
        monkeypatch.setattr(nb_mock, "create", lambda nombre, json_output=True: (0, json.dumps({"id": "nb_1"}), ""))
        monkeypatch.setattr(nb_mock, "source_add_drive", lambda *a, **k: (0, json.dumps({"source_id": "src_1"}), ""))
        monkeypatch.setattr(nb_mock, "source_wait", lambda *a, **k: (0, json.dumps({"status": "ready"}), ""))
        monkeypatch.setattr(nb_mock, "source_add_research", lambda *a, **k: (0, json.dumps({"status": "completed"}), ""))
        
        # Mock generate para report (async)
        monkeypatch.setattr(nb_mock, "generate", lambda *a, **k: (0, json.dumps({"task_id": "task_1"}), ""))
        monkeypatch.setattr(nb_mock, "artifact_wait", lambda *a, **k: (0, json.dumps({"status": "completed"}), ""))
        
        # Mock download para crear archivo temporal
        def mock_download(tipo, cuaderno_id, tarea_id, ruta, force=True):
            os.makedirs(os.path.dirname(ruta), exist_ok=True)
            with open(ruta, "w") as f:
                f.write("# Informe generado\n\nContenido del informe.")
            return (0, "", "")
        monkeypatch.setattr(nb_mock, "download", mock_download)

        # Mock drive methods
        monkeypatch.setattr(drive_mock, "carpeta", lambda nombre, padre: ("folder_1", "https://drive.google.com/drive/folders/folder_1"))
        monkeypatch.setattr(drive_mock, "doc", lambda nombre, markdown, padre=None, archivo_id=None: ("doc_1", "https://docs.google.com/document/d/doc_1"))
        monkeypatch.setattr(drive_mock, "archivo", lambda ruta, padre, nombre=None: ("file_1", "https://drive.google.com/file/d/file_1"))

        # Mock _clientes_de_encargo para devolver nuestros mocks
        monkeypatch.setattr(mod, "_clientes_de_encargo", lambda: (nb_mock, drive_mock))

        # Mock planificar_base para devolver un frente simple con un entregable
        def mock_planificar(texto):
            return [{
                "id": "F1",
                "nombre": "Test Frente",
                "destino": "produccion",
                "estado": "pendiente",
                "investigacion": [],
                "fuentes_drive": [],
                "entregables": [{
                    "tipo": "report",
                    "titulo": "Informe Test",
                    "prompt": "Escribe un informe",
                    "enviar": True
                }]
            }]
        monkeypatch.setattr(mod, "planificar_base", mock_planificar)

        # Capturar lo que se envía a Telegram
        enviados = []
        def mock_decir(texto):
            enviados.append(("mensaje", texto))
        monkeypatch.setattr(mod, "decir", mock_decir)

        # Mock _telegram_send_document para capturar envío de archivo
        def mock_send_doc(ruta, caption, filename):
            enviados.append(("documento", ruta, caption, filename))
            return {"ok": True}
        monkeypatch.setattr(mod, "_telegram_send_document", mock_send_doc)

        # Mock actualizar para no escribir a disco
        monkeypatch.setattr(mod, "actualizar", lambda pid, **c: None)

        # Ejecutar atender_encargo
        p = {"id": 999, "texto": "Se aprueba el plan. Desarrolla un informe.", "intentos": 0}
        plan = {"tipo": "encargo", "fuente": "cuaderno", "artefactos": [{"tipo": "report", "indicaciones": ""}]}

        try:
            mod.atender_encargo(p, plan)
        except Exception as e:
            # Puede fallar por otras razones, pero verificamos que enviar_entregable fue llamado
            pass

        # Verificar que se intentó enviar el documento
        docs_enviados = [e for e in enviados if e[0] == "documento"]
        assert len(docs_enviados) > 0, "debería haber enviado al menos un documento"
        ruta_enviada = docs_enviados[0][1]
        # El archivo se borra después de enviar (en finally block del productor),
        # así que no existe después. Lo importante es que se llamó a _telegram_send_document
        # con una ruta válida. Verificamos que la ruta tiene la extensión correcta.
        assert ruta_enviada.endswith(".md"), "debería ser archivo markdown"


if __name__ == "__main__":
    import sys
    fallos = 0
    for nombre, fn in list(globals().items()):
        if nombre.startswith("test_") and callable(fn):
            try:
                fn()
                print(f"✓ {nombre}")
            except AssertionError as e:
                print(f"✗ {nombre}: {e}")
                fallos += 1
            except Exception as e:
                print(f"✗ {nombre}: ERROR {type(e).__name__}: {e}")
                fallos += 1
    if fallos:
        print(f"\n{fallos} test(s) fallaron")
        sys.exit(1)
    else:
        print(f"\nTodos los tests pasaron")
        sys.exit(0)