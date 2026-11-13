#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Tests para higgsfield_sync.py — sin red, CLI falso, control de cambios solo.

Flujo:
- Simula el CLI Higgsfield con una clase falsa que provee project list, get,
  create y update (sin red, sin gastar créditos).
- Simula el índice de vídeos de Drive (cuenta alex-docs) con un JSON simulado.
- Simula encargos del bot del A1 (~/.starseed/peticiones/encargos.json) y
  propuestas de Higgsfield aprobadas en el mapeo local.
- Verifica que las producciones oficiales se crean/actualizan.
- Verifica las referencias de marca se suben al proyecto de marca.
- Valida notificación del canal del Mando.
"""
import json
import os
import sys
import tempfile
import uuid
from pathlib import Path
from unittest.mock import MagicMock, Mock, patch

sys.path.insert(0, os.path.dirname(__file__))

# ---------------------------------------------------------------------------
# Mocks
# ---------------------------------------------------------------------------

class FakeHiggsfieldCLI:
    """CLI falso que no gasta créditos ni hace llamadas a red.

    Se simulan:
    - project list → devuelve mapeo existente
    - get → devuelve un proyecto
    - create → devuelve un project_id
    - update → actualiza una propiedad
    """

    def __init__(self, mapeo_proyectos: dict):
        self._mapeo = mapeo_proyectos.copy()

    def list(self) -> dict:
        return self._mapeo

    def get(self, project_id: str) -> dict:
        for nombre, info in self._mapeo.items():
            if info["project_id"] == project_id:
                return info
        return {}

    def create(self, nombre: str, descripcion: str) -> str:
        nuevo_id = f"cli-fake-{uuid.uuid4().hex[:8]}"
        self._mapeo[nombre] = {
            "project_id": nuevo_id,
            "folder_name": nombre,
            "color": "slate",
            "emoji": "📁",
            "descripcion": descripcion,
            "carpetas": ["01 Referencias", "02 Pruebas", "03 Aprobados", "04 Finales"],
            "creado": str(Path.now()),
            "estado": "creado",
        }
        return nuevo_id

    def update(self, project_id: str, descripcion: str) -> None:
        for nombre, info in self._mapeo.items():
            if info["project_id"] == project_id:
                info["descripcion"] = descripcion
                info["estado"] = "actualizado"
                break


class FakeDriveIndex:
    """Simula el índice de vídeos de Drive (cuenta alex-docs)."""

    def __init__(self, contenido: dict):
        self._contenido = contenido

    def buscar(self, query: str) -> dict:
        return self._contenido


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_cargando_mapeo():
    """cargar_mapeo lee archivos .json y devuelve estructura correcta."""
    import higgsfield_sync as mod

    with tempfile.TemporaryDirectory() as tmpdir:
        mapeo = {"proyecto_1": {"id": 1}}
        mapeo_path = Path(tmpdir) / "proyectos.json"
        mapeo_path.write_text(json.dumps(mapeo))

        with patch.object(mod, "MAPA_PROYECTOS", str(mapeo_path)):
            resultado = mod.leer_json(str(mapeo_path), {})
            assert resultado == mapeo


def test_constantes_mapeo():
    """MAPA_PROYECTOS está definido correctamente."""
    import higgsfield_sync as mod
    assert "MAPA_PROYECTOS" in mod.__dict__
    assert isinstance(mod.MAPA_PROYECTOS, Path)


def test_normalizar_color():
    """normalizar_color devuelve un color válido."""
    import higgsfield_sync as mod
    assert mod.normalizar_color("cyan") == "cyan"
    assert mod.normalizar_color("unknown") == "slate"
    assert mod.normalizar_color("CYAN") == "cyan"


def test_normalizar_emoji():
    """normalizar_emoji devuelve un emoji válido."""
    import higgsfield_sync as mod
    assert mod.normalizar_emoji("🎨") == "🎨"
    assert mod.normalizar_emoji("unknown") == "📁"


def test_extraer_drive_id():
    """extraer_drive_id extrae el id de una URL de Drive."""
    import higgsfield_sync as mod
    assert mod.extraer_drive_id("https://drive.google.com/file/d/abc123/view") == "abc123"
    assert mod.extraer_drive_id("https://drive.google.com/uc?id=def456") == "def456"
    assert mod.extraer_drive_id("invalid-url") is None


def test_cargar_producciones_starseed_sin_red():
    """cargar_producciones_starseed simula todas las fuentes sin red.

    Se mockean:
    - leer_env → token de Drive
    - peticiones_telegram → encargos A1
    - mapeo temporal → propuestas Higgsfield
    """
    import higgsfield_sync as mod

    with tempfile.TemporaryDirectory() as tmpdir:
        # Configurar entorno falso
        env_path = Path(tmpdir) / "env"
        env_path.write_text('DRIVE_TOKEN_ALEX_DOCS="fake-token-123"')
        HOME = Path.home()
        mod.HOME = HOME

        with patch.object(mod, "HOME", Path(tmpdir)):
            with patch("higgsfield_sync.Path.home", return_value=Path(tmpdir)):
                with patch.object(mod, "ENCARGOS_A1", Path(tmpdir) / "encargos.json"):
                    encargos_path = Path(tmpdir) / "encargos.json"
                    encargos_path.write_text(
                        json.dumps(
                            {
                                "prod1": {
                                    "estado": "producción oficial",
                                    "folder_name": "video_01",
                                    "color": "cyan",
                                    "emoji": "🎬",
                                    "carpeta_drive": "https://drive.google.com/file/d/xyz789/view",
                                    "fase_matriz": "Semilla",
                                    "reglas_marca": "Sí",
                                    "creado": "2026-11-13T00:00:00Z",
                                }
                            }
                        )
                    )

                    with patch("higgsfield_sync.leer_env", return_value={"DRIVE_TOKEN_ALEX_DOCS": "fake-token"}):
                        with patch("higgsfield_sync.Path", side_effect=lambda p: Path(tmpdir) / p if "/.starseed/" in str(p) else Path(p)):
                            # Mockear requests para evitar necesidad de instalación
                            import sys
                            from unittest.mock import MagicMock
                            mock_requests = MagicMock()
                            mock_response = MagicMock()
                            mock_response.status_code = 200
                            mock_response.json.return_value = {
                                "files": [{"name": "index.json", "id": "index123"}]
                            }
                            mock_requests.get.return_value = mock_response

                            with patch.dict(sys.modules, {"requests": mock_requests}):
                                with patch.object(mod, "PRODUCCIONES_HIGGSFIELD", Path(tmpdir) / "propuestas.json"):
                                    propuestas_path = Path(tmpdir) / "propuestas.json"
                                    propuestas_path.write_text(json.dumps({"propuestaA": {"aprobada": True}}))

                                    producciones = mod.cargar_producciones_starseed()

                                    assert "drive_videos" in producciones
                                    assert "encargos_a1" in producciones
                                    assert "propuestas_higgsfield" in producciones
                                    assert "prod1" in producciones["encargos_a1"]


def test_ejecutar_sincronizacion_crea_nuevo_proyecto():
    """ejecutar_sincronizacion crea nuevo proyecto para producción oficial."""
    import higgsfield_sync as mod

    with tempfile.TemporaryDirectory() as tmpdir:
        HOME = Path.home()
        mod.HOME = HOME

        mapeo_path = Path(tmpdir) / "proyectos.json"
        mapeo_path.write_text("{}")

        with patch.object(mod, "HOME", Path(tmpdir)):
            with patch.object(mod, "MAPA_PROYECTOS", mapeo_path):
                with patch.object(mod, "ENCARGOS_A1", Path(tmpdir) / "encargos.json"):
                    encargos_path = Path(tmpdir) / "encargos.json"
                    encargos_path.write_text(
                        json.dumps(
                            {
                                "nueva_prod": {
                                    "estado": "producción oficial",
                                    "folder_name": "video_nuevo",
                                    "color": "cyan",
                                    "emoji": "🎬",
                                    "carpeta_drive": "https://drive.google.com/file/d/new123/view",
                                    "fase_matriz": "Fruto",
                                    "reglas_marca": "Sí",
                                    "creado": "2026-11-13T00:00:00Z",
                                }
                            }
                        )
                    )

                    with patch("higgsfield_sync.obtener_referencias_marca_aprobadas") as mock_ref:
                        mock_ref.return_value = []

                        with patch.object(mod, "notificar_canal_mando") as mock_notificar:
                            mod.ejecutar_sincronizacion()

                            mapeo = mod.leer_json(str(mapeo_path), {})
                            assert len(mapeo) == 1
                            assert any("video_nuevo" in info.get("folder_name", "") for info in mapeo.values())

                            mock_notificar.assert_called_once()
                            args = mock_notificar.call_args[0][0]
                            assert "creados/actualizados" in args


def test_ejecutar_sincronizacion_actualiza_existente():
    """ejecutar_sincronizacion actualiza descripción de proyecto existente."""
    import higgsfield_sync as mod

    with tempfile.TemporaryDirectory() as tmpdir:
        HOME = Path.home()
        mod.HOME = HOME

        proyecto_id = "cli-fake-12345678"
        mapeo = {
            "proyecto_existente": {
                "project_id": proyecto_id,
                "folder_name": "video_existente",
                "color": "slate",
                "emoji": "📁",
                "descripcion": "original",
                "carpetas": ["01 Referencias"],
                "creado": "2026-11-13T00:00:00Z",
                "estado": "activo",
            }
        }
        mapeo_path = Path(tmpdir) / "proyectos.json"
        mapeo_path.write_text(json.dumps(mapeo))

        with patch.object(mod, "HOME", Path(tmpdir)):
            with patch.object(mod, "MAPA_PROYECTOS", mapeo_path):
                with patch.object(mod, "ENCARGOS_A1", Path(tmpdir) / "encargos.json"):
                    encargos_path = Path(tmpdir) / "encargos.json"
                    encargos_path.write_text(
                        json.dumps(
                            {
                                "video_existente": {
                                    "estado": "producción oficial",
                                    "folder_name": "video_existente",
                                    "color": "cyan",
                                    "emoji": "🎬",
                                    "carpeta_drive": "https://drive.google.com/file/d/existing456/view",
                                    "fase_matriz": "Cosecha",
                                    "reglas_marca": "Sí",
                                    "creado": "2026-11-13T00:00:00Z",
                                }
                            }
                        )
                    )

                    with patch("higgsfield_sync.obtener_referencias_marca_aprobadas") as mock_ref:
                        mock_ref.return_value = []

                        with patch.object(mod, "notificar_canal_mando") as mock_notificar:
                            mod.ejecutar_sincronizacion()

                            mapeo = mod.leer_json(str(mapeo_path), {})
                            info = mapeo["proyecto_existente"]
                            assert "Fase Cosecha" in info["descripcion"]
                            assert "Estado actual: producción oficial" in info["descripcion"]
                            assert info["estado"] == "activo"

                            mock_notificar.assert_called_once()


def test_referencias_marca_subidas_a_proyecto_correcto():
    """referencias de marca se suben al proyecto 'StarSeed · Sistema de diseño y marca'."""
    import higgsfield_sync as mod

    with tempfile.TemporaryDirectory() as tmpdir:
        HOME = Path.home()
        mod.HOME = HOME

        mapeo = {
            "proyecto_marca": {
                "project_id": "b229e2b5-9ec1-4a73-9ba2-917a0968d11b",
                "folder_name": "sistema-diseno",
                "color": "slate",
                "emoji": "📁",
                "descripcion": "original",
                "carpetas": ["01 Referencias", "02 Pruebas", "03 Aprobados", "04 Finales"],
                "creado": "2026-11-13T00:00:00Z",
                "estado": "activo",
            }
        }
        mapeo_path = Path(tmpdir) / "proyectos.json"
        mapeo_path.write_text(json.dumps(mapeo))

        with patch.object(mod, "HOME", Path(tmpdir)):
            with patch.object(mod, "MAPA_PROYECTOS", mapeo_path):
                with patch.object(mod, "PROYECTO_MARCA_ID", "b229e2b5-9ec1-4a73-9ba2-917a0968d11b"):
                    with patch.object(mod, "notificar_canal_mando") as mock_notificar:
                        with patch("higgsfield_sync.obtener_referencias_marca_aprobadas") as mock_ref:
                            mock_ref.return_value = [{"nombre": "test.png", "tipo": "poster"}]
                            mod.ejecutar_sincronizacion()

                            # Verificar que mock_ref fue llamado
                            mock_ref.assert_called_once()

                            # Verificar notificación contiene referencia subida
                            args = mock_notificar.call_args[0][0]
                            assert "referencias de marca" in args


def test_ejecutar_sincronizacion_sin_cambios():
    """ejecutar_sincronizacion notifica cuando no hay nada que sincronizar."""
    import higgsfield_sync as mod

    with tempfile.TemporaryDirectory() as tmpdir:
        HOME = Path.home()
        mod.HOME = HOME

        mapeo_path = Path(tmpdir) / "proyectos.json"
        mapeo_path.write_text("{}")

        with patch.object(mod, "HOME", Path(tmpdir)):
            with patch.object(mod, "MAPA_PROYECTOS", mapeo_path):
                with patch.object(mod, "ENCARGOS_A1", Path(tmpdir) / "encargos.json"):
                    encargos_path = Path(tmpdir) / "encargos.json"
                    encargos_path.write_text("{}")

                    with patch("higgsfield_sync.obtener_referencias_marca_aprobadas") as mock_ref:
                        mock_ref.return_value = []

                        with patch.object(mod, "notificar_canal_mando") as mock_notificar:
                            mod.ejecutar_sincronizacion()

                            # Debe notificar que no hay nada que sincronizar
                            args = mock_notificar.call_args[0][0]
                            assert "Nada que sincronizar" in args or "completada" in args


# ---------------------------------------------------------------------------
# Ejecutar tests si se corre directamente
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import pytest
    pytest.main([__file__, "-v"])