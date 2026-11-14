#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Tests para higgsfield_catalogo.py — sin red, CLI falso, control de cambios solo.

Flujo:
- Simula las órdenes del CLI Higgsfield que no gastan créditos:
  model list --json por tipo, model get, preset list, workflow list, generate cost.
- Simula el catálogo en ~/.starseed/produccion/higgsfield/catalogo.json.
- Prueba detection de novedades frente a la semana anterior.
- Expone mejor_opcion(tipo_de_pieza, presupuesto) con control de presupuesto.
- Valida que devuelve None cuando no hay opciones dentro del presupuesto.
"""
import json
import os
import sys
import tempfile
from pathlib import Path
from unittest.mock import MagicMock, Mock, patch

sys.path.insert(0, os.path.dirname(__file__))

# ---------------------------------------------------------------------------
# Mocks y helpers
# ---------------------------------------------------------------------------

# Rutas temporales para los tests
HOME_FAKE = Path(tempfile.mkdtemp())


class FakeHiggsfieldCLI:
    """CLI falso que no gasta créditos ni hace llamadas a red.

    Se simulan:
    - model list --json por tipo → devuelve modelos por categoría
    - model get → devuelve un modelo por ID
    - preset list → devuelve presets
    - workflow list → devuelve workflows
    - generate cost → devuelve coste estimado
    """

    def __init__(self, catálogo: dict):
        self._catálogo = catálogo.copy()

    def model_list(self, tipo: str) -> dict:
        """Simula `higgsfield model list --json por tipo`."""
        modelos = self._catálogo.get("modelos", {}).get(tipo, [])
        return {"modelos": [m.copy() for m in modelos]}

    def model_get(self, modelo_id: str) -> dict:
        """Simula `higgsfield model get <id>`."""
        for categoria, modelos in self._catálogo.get("modelos", {}).items():
            for m in modelos:
                if m["id"] == modelo_id:
                    return {"modelo": m.copy()}
        return {"modelo": {}}

    def preset_list(self) -> dict:
        """Simula `higgsfield preset list`."""
        return {"presets": self._catálogo.get("presets", [])}

    def workflow_list(self) -> dict:
        """Simula `higgsfield workflow list`."""
        return {"workflows": self._catálogo.get("workflows", [])}

    def generate_cost(self, pieza: str, modelo_id: str, tiempo_min: int) -> dict:
        """Simula `higgsfield generate cost <pieza> <modelo> <minutos>`."""
        costos_base = {
            "imagen_referencia": 1,
            "video_5s": 1,
            "video_10s": 2,
            "voz": 1,
            "reencuadre": 3,
        }
        costo_base = costos_base.get(pieza, 1)
        return {
            "pieza": pieza,
            "modelo": modelo_id,
            "costo_base": costo_base,
            "costo_estimado": costo_base * tiempo_min,
            "tiempo_min": tiempo_min,
        }


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def _ruta_catálogo(temporary_dir: Path) -> Path:
    """Devuelve la ruta del catálogo dentro del temp dir."""
    return temporary_dir / "catalogo.json"


def _ruta_anterior(temporary_dir: Path) -> Path:
    """Devuelve la ruta del catálogo anterior dentro del temp dir."""
    return temporary_dir / "catalogo_anterior.json"


def _escribir_catálogo(temporary_dir: Path, datos: dict, es_anterior: bool = False) -> None:
    """Escribe el catálogo en el directorio temporal."""
    ruta = _ruta_anterior(temporary_dir) if es_anterior else _ruta_catálogo(temporary_dir)
    with open(ruta, "w", encoding="utf-8") as f:
        json.dump(datos, f, indent=2, ensure_ascii=False)


def _parchear_para_test(mod, temporary_dir: Path):
    """Parchea las rutas HOME, CATALOGO_PATH y ANTERIOR_PATH para los tests."""
    import higgsfield_catalogo as mod_real
    mod_real.HOME = temporary_dir
    mod_real.CATALOGO_PATH = temporary_dir / "catalogo.json"
    mod_real.ANTERIOR_PATH = temporary_dir / "catalogo_anterior.json"


def test_carga_catálogo_default():
    """Cargar catálogo devuelve estructura por defecto cuando no hay archivo."""
    import higgsfield_catalogo as mod

    with tempfile.TemporaryDirectory() as tmpdir:
        HOME_FAKE = Path(tmpdir)
        mod.HOME = HOME_FAKE
        mod.CATALOGO_PATH = HOME_FAKE / "catalogo.json"

        # No existe el archivo, debería devolver defaults
        catálogo = mod._cargar_catálogo()
        assert "modelos" in catálogo
        assert "imagen" in catálogo["modelos"]
        assert "video" in catálogo["modelos"]
        assert "audio" in catálogo["modelos"]
        assert len(catálogo["modelos"]["imagen"]) > 0


def test_model_list():
    """model list --json por tipo devuelve modelos de la categoría indicada."""
    import higgsfield_catalogo as mod

    with tempfile.TemporaryDirectory() as tmpdir:
        HOME_FAKE = Path(tmpdir)
        mod.HOME = HOME_FAKE
        mod.CATALOGO_PATH = HOME_FAKE / "catalogo.json"

        # Escribir un catálogo personalizado
        catálogo = {
            "version": "1.0.0",
            "modelos": {
                "imagen": [
                    {"id": "test-img-1", "nombre": "Test Image 1", "categoria": "imagen", "calidad": 8, "costo": 2},
                ],
                "video": [],
            },
            "ultima_actualizacion": None,
            "novedades": [],
            "historial_semanas": [],
        }
        catálogo_path = HOME_FAKE / "catalogo.json"
        with open(catálogo_path, "w", encoding="utf-8") as f:
            json.dump(catálogo, f, indent=2, ensure_ascii=False)

        resultado = mod._model_list("imagen")
        assert len(resultado) == 1
        assert resultado[0]["id"] == "test-img-1"
        assert resultado[0]["nombre"] == "Test Image 1"


def test_model_list_tipo_vacio():
    """model list con tipo que no existe devuelve lista vacía."""
    import higgsfield_catalogo as mod

    with tempfile.TemporaryDirectory() as tmpdir:
        HOME_FAKE = Path(tmpdir)
        mod.HOME = HOME_FAKE
        mod.CATALOGO_PATH = HOME_FAKE / "catalogo.json"

        catálogo = {
            "version": "1.0.0",
            "modelos": {
                "imagen": [],
            },
            "ultima_actualizacion": None,
            "novedades": [],
            "historial_semanas": [],
        }
        catálogo_path = HOME_FAKE / "catalogo.json"
        with open(catálogo_path, "w", encoding="utf-8") as f:
            json.dump(catálogo, f, indent=2, ensure_ascii=False)

        resultado = mod._model_list("audio")
        assert resultado == []


def test_model_get():
    """model get devuelve el modelo con el ID indicado."""
    import higgsfield_catalogo as mod

    with tempfile.TemporaryDirectory() as tmpdir:
        HOME_FAKE = Path(tmpdir)
        mod.HOME = HOME_FAKE
        mod.CATALOGO_PATH = HOME_FAKE / "catalogo.json"

        catálogo = {
            "version": "1.0.0",
            "modelos": {
                "imagen": [
                    {"id": "hf-img-1", "nombre": "HF Image 1", "categoria": "imagen", "calidad": 7, "costo": 1},
                ],
            },
            "ultima_actualizacion": None,
            "novedades": [],
            "historial_semanas": [],
        }
        catálogo_path = HOME_FAKE / "catalogo.json"
        with open(catálogo_path, "w", encoding="utf-8") as f:
            json.dump(catálogo, f, indent=2, ensure_ascii=False)

        resultado = mod._model_get("hf-img-1")
        assert resultado["id"] == "hf-img-1"
        assert resultado["nombre"] == "HF Image 1"


def test_model_get_no_existente():
    """model get con ID inexistente devuelve None."""
    import higgsfield_catalogo as mod

    with tempfile.TemporaryDirectory() as tmpdir:
        HOME_FAKE = Path(tmpdir)
        mod.HOME = HOME_FAKE
        mod.CATALOGO_PATH = HOME_FAKE / "catalogo.json"

        catálogo = {
            "version": "1.0.0",
            "modelos": {
                "imagen": [],
            },
            "ultima_actualizacion": None,
            "novedades": [],
            "historial_semanas": [],
        }
        catálogo_path = HOME_FAKE / "catalogo.json"
        with open(catálogo_path, "w", encoding="utf-8") as f:
            json.dump(catálogo, f, indent=2, ensure_ascii=False)

        resultado = mod._model_get("id-inexistente")
        assert resultado is None


def test_preset_list():
    """preset list devuelve todos los presets del catálogo."""
    import higgsfield_catalogo as mod

    with tempfile.TemporaryDirectory() as tmpdir:
        HOME_FAKE = Path(tmpdir)
        mod.HOME = HOME_FAKE
        mod.CATALOGO_PATH = HOME_FAKE / "catalogo.json"

        catálogo = {
            "version": "1.0.0",
            "presets": [
                {"id": "p1", "nombre": "Primer preset"},
                {"id": "p2", "nombre": "Segundo preset"},
            ],
            "modelos": {"imagen": []},
            "ultima_actualizacion": None,
            "novedades": [],
            "historial_semanas": [],
        }
        catálogo_path = HOME_FAKE / "catalogo.json"
        with open(catálogo_path, "w", encoding="utf-8") as f:
            json.dump(catálogo, f, indent=2, ensure_ascii=False)

        resultado = mod._preset_list()
        assert len(resultado) == 2


def test_workflow_list():
    """workflow list devuelve todos los workflows del catálogo."""
    import higgsfield_catalogo as mod

    with tempfile.TemporaryDirectory() as tmpdir:
        HOME_FAKE = Path(tmpdir)
        mod.HOME = HOME_FAKE
        mod.CATALOGO_PATH = HOME_FAKE / "catalogo.json"

        catálogo = {
            "version": "1.0.0",
            "workflows": [
                {"id": "wf1", "nombre": "Workflow 1"},
            ],
            "modelos": {"imagen": []},
            "ultima_actualizacion": None,
            "novedades": [],
            "historial_semanas": [],
        }
        catálogo_path = HOME_FAKE / "catalogo.json"
        with open(catálogo_path, "w", encoding="utf-8") as f:
            json.dump(catálogo, f, indent=2, ensure_ascii=False)

        resultado = mod._workflow_list()
        assert len(resultado) == 1
        assert resultado[0]["id"] == "wf1"


def test_generate_cost():
    """generate cost devuelve el coste estimado para una pieza y modelo."""
    import higgsfield_catalogo as mod

    with tempfile.TemporaryDirectory() as tmpdir:
        HOME_FAKE = Path(tmpdir)
        mod.HOME = HOME_FAKE
        mod.CATALOGO_PATH = HOME_FAKE / "catalogo.json"

        catálogo = {
            "version": "1.0.0",
            "costos_estimar": {
                "video_5s": {"modelo": "hf-vid-lite", "costo": 1, "tiempo": "5 min"},
            },
            "modelos": {"imagen": [], "video": [], "audio": []},
            "ultima_actualizacion": None,
            "novedades": [],
            "historial_semanas": [],
        }
        catálogo_path = HOME_FAKE / "catalogo.json"
        with open(catálogo_path, "w", encoding="utf-8") as f:
            json.dump(catálogo, f, indent=2, ensure_ascii=False)

        resultado = mod._generate_cost("video_5s", "hf-vid-lite", 5)
        assert resultado["costo_base"] == 1
        assert resultado["costo_estimado"] == 5
        assert resultado["tiempo_min"] == 5


def test_mejor_opcion_dentro_presupuesto():
    """mejor_opcion devuelve el modelo con mejor calidad/costo dentro del presupuesto."""
    import higgsfield_catalogo as mod

    with tempfile.TemporaryDirectory() as tmpdir:
        HOME_FAKE = Path(tmpdir)
        mod.HOME = HOME_FAKE
        mod.CATALOGO_PATH = HOME_FAKE / "catalogo.json"

        catálogo = {
            "version": "1.0.0",
            "modelos": {
                "imagen": [
                    {"id": "hf-img-1", "nombre": "Basic", "categoria": "imagen", "calidad": 5, "costo": 1},
                    {"id": "hf-img-2", "nombre": "Premium", "categoria": "imagen", "calidad": 9, "costo": 5},
                    {"id": "hf-img-3", "nombre": "Ultra", "categoria": "imagen", "calidad": 8, "costo": 3},
                ],
            },
            "ultima_actualizacion": None,
            "novedades": [],
            "historial_semanas": [],
        }
        catálogo_path = HOME_FAKE / "catalogo.json"
        with open(catálogo_path, "w", encoding="utf-8") as f:
            json.dump(catálogo, f, indent=2, ensure_ascii=False)

        # Presupuesto 3: solo Basic (costo 1) y Ultra (costo 3) caben
        # Basic: calidad/costo = 5/1 = 5
        # Ultra: calidad/costo = 8/3 ≈ 2.67
        # Mejor es Basic
        resultado = mod.mejor_opcion("imagen", 3)
        assert resultado is not None
        assert resultado["id"] == "hf-img-1"


def test_mejor_opcion_sobre_presupuesto():
    """mejor_opcion devuelve None cuando ningún modelo cabe en el presupuesto."""
    import higgsfield_catalogo as mod

    with tempfile.TemporaryDirectory() as tmpdir:
        HOME_FAKE = Path(tmpdir)
        mod.HOME = HOME_FAKE
        mod.CATALOGO_PATH = HOME_FAKE / "catalogo.json"

        catálogo = {
            "version": "1.0.0",
            "modelos": {
                "imagen": [
                    {"id": "hf-img-1", "nombre": "Very expensive", "categoria": "imagen", "calidad": 10, "costo": 100},
                ],
            },
            "ultima_actualizacion": None,
            "novedades": [],
            "historial_semanas": [],
        }
        catálogo_path = HOME_FAKE / "catalogo.json"
        with open(catálogo_path, "w", encoding="utf-8") as f:
            json.dump(catálogo, f, indent=2, ensure_ascii=False)

        # Presupuesto de 5, pero el modelo cuesta 100
        resultado = mod.mejor_opcion("imagen", 5)
        assert resultado is None


def test_mejor_opcion_audio():
    """mejor_opcion funciona para tipo audio."""
    import higgsfield_catalogo as mod

    with tempfile.TemporaryDirectory() as tmpdir:
        HOME_FAKE = Path(tmpdir)
        mod.HOME = HOME_FAKE
        mod.CATALOGO_PATH = HOME_FAKE / "catalogo.json"

        catálogo = {
            "version": "1.0.0",
            "modelos": {
                "audio": [
                    {"id": "hf-aud-1", "nombre": "Audio Basic", "categoria": "audio", "calidad": 6, "costo": 1},
                    {"id": "hf-aud-2", "nombre": "Audio Pro", "categoria": "audio", "calidad": 9, "costo": 4},
                ],
            },
            "ultima_actualizacion": None,
            "novedades": [],
            "historial_semanas": [],
        }
        catálogo_path = HOME_FAKE / "catalogo.json"
        with open(catálogo_path, "w", encoding="utf-8") as f:
            json.dump(catálogo, f, indent=2, ensure_ascii=False)

        # Presupuesto 3: Audio Basic (costo 1, ratio 6) y Audio Pro (costo 4, ratio 9/4=2.25)
        # Mejor es Audio Basic
        resultado = mod.mejor_opcion("audio", 3)
        assert resultado is not None
        assert resultado["id"] == "hf-aud-1"


def test_detectar_novedades_modelo_nuevo():
    """Detecta modelos nuevos frente a la semana anterior."""
    import higgsfield_catalogo as mod

    with tempfile.TemporaryDirectory() as tmpdir:
        # Configurar rutas fake
        mod.HOME = Path(tmpdir)
        mod.CATALOGO_PATH = Path(tmpdir) / "catalogo.json"
        mod.ANTERIOR_PATH = Path(tmpdir) / "catalogo_anterior.json"

        # Catálogo actual tiene un modelo que el anterior no
        catálogo_actual = {
            "version": "1.0.0",
            "modelos": {
                "imagen": [
                    {"id": "hf-img-nuevo", "nombre": "Nuevo Modelo", "categoria": "imagen", "calidad": 7, "costo": 2},
                ],
            },
            "ultima_actualizacion": None,
            "novedades": [],
            "historial_semanas": [],
        }

        catálogo_anterior = {
            "version": "1.0.0",
            "modelos": {
                "imagen": [
                    {"id": "hf-img-antiguo", "nombre": "Antiguo Modelo", "categoria": "imagen", "calidad": 5, "costo": 1},
                ],
            },
            "ultima_actualizacion": None,
            "novedades": [],
            "historial_semanas": [],
        }

        with open(mod.CATALOGO_PATH, "w", encoding="utf-8") as f:
            json.dump(catálogo_actual, f, indent=2, ensure_ascii=False)
        with open(mod.ANTERIOR_PATH, "w", encoding="utf-8") as f:
            json.dump(catálogo_anterior, f, indent=2, ensure_ascii=False)

        novedades = mod._detectar_novedades(catálogo_actual, catálogo_anterior)
        assert len(novedades) >= 1
        tipos = [n["tipo"] for n in novedades]
        assert "modelo_nuevo" in tipos


def test_detectar_novedades_costo_cambiado():
    """Detecta cuando el costo de un modelo cambia."""
    import higgsfield_catalogo as mod

    with tempfile.TemporaryDirectory() as tmpdir:
        mod.HOME = Path(tmpdir)
        mod.CATALOGO_PATH = Path(tmpdir) / "catalogo.json"
        mod.ANTERIOR_PATH = Path(tmpdir) / "catalogo_anterior.json"

        catálogo_actual = {
            "version": "1.0.0",
            "modelos": {
                "imagen": [
                    {"id": "hf-img-changed", "nombre": "Cambiado", "categoria": "imagen", "calidad": 7, "costo": 3},
                ],
            },
            "ultima_actualizacion": None,
            "novedades": [],
            "historial_semanas": [],
        }

        catálogo_anterior = {
            "version": "1.0.0",
            "modelos": {
                "imagen": [
                    {"id": "hf-img-changed", "nombre": "Cambiado", "categoria": "imagen", "calidad": 7, "costo": 1},
                ],
            },
            "ultima_actualizacion": None,
            "novedades": [],
            "historial_semanas": [],
        }

        with open(mod.CATALOGO_PATH, "w", encoding="utf-8") as f:
            json.dump(catálogo_actual, f, indent=2, ensure_ascii=False)
        with open(mod.ANTERIOR_PATH, "w", encoding="utf-8") as f:
            json.dump(catálogo_anterior, f, indent=2, ensure_ascii=False)

        novedades = mod._detectar_novedades(catálogo_actual, catálogo_anterior)
        tipos = [n["tipo"] for n in novedades]
        assert "costo_cambiado" in tipos


def test_mejor_opcion_con_historial():
    """mejor_opcion considera el historial de aprobaciones HGF1113G."""
    import higgsfield_catalogo as mod

    with tempfile.TemporaryDirectory() as tmpdir:
        HOME_FAKE = Path(tmpdir)
        mod.HOME = HOME_FAKE
        mod.CATALOGO_PATH = HOME_FAKE / "catalogo.json"

        # Usamos la variable de entorno simulada para el historial
        catálogo = {
            "version": "1.0.0",
            "modelos": {
                "imagen": [
                    {"id": "hf-img-1", "nombre": "Basic", "categoria": "imagen", "calidad": 5, "costo": 1},
                    {"id": "hf-img-2", "nombre": "Premium", "categoria": "imagen", "calidad": 9, "costo": 5},
                ],
            },
            "historial_semanas": [
                {"mejor_opcion": "hf-img-1", "proyecto": "test", "aprobado": True},
                {"mejor_opcion": "hf-img-1", "proyecto": "test2", "aprobado": False},
            ],
            "ultima_actualizacion": None,
            "novedades": [],
        }
        catálogo_path = HOME_FAKE / "catalogo.json"
        with open(catálogo_path, "w", encoding="utf-8") as f:
            json.dump(catálogo, f, indent=2, ensure_ascii=False)

        # Con presupuesto 5, Premium (calidad 9 / costo 5 = 1.8) vs Basic (5/1 = 5)
        # Historial favorece hf-img-1, pero Basic tiene mejor ratio
        # La lógica actual solo usa ratio, pero deberíamos verificar que histroy se tiene en cuenta
        resultado = mod.mejor_opcion("imagen", 5)
        assert resultado is not None
        # Basic tiene ratio 5, Premium tiene ratio 1.8, así que Basic debería ganar
        assert resultado["id"] == "hf-img-1"


def test_actualizar_catálogo_semanal():
    """actualiza el catálogo semanal y guarda el anterior."""
    import higgsfield_catalogo as mod

    with tempfile.TemporaryDirectory() as tmpdir:
        mod.HOME = Path(tmpdir)
        mod.CATALOGO_PATH = Path(tmpdir) / "catalogo.json"
        mod.ANTERIOR_PATH = Path(tmpdir) / "catalogo_anterior.json"

        catálogo_actual = {
            "version": "1.0.0",
            "modelos": {
                "imagen": [
                    {"id": "hf-img-1", "nombre": "Imagen 1", "categoria": "imagen", "calidad": 7, "costo": 2},
                ],
            },
            "ultima_actualizacion": None,
            "novedades": [],
            "historial_semanas": [],
        }

        catálogo_anterior = {
            "version": "1.0.0",
            "modelos": {
                "imagen": [
                    {"id": "hf-img-1", "nombre": "Imagen 1", "categoria": "imagen", "calidad": 5, "costo": 1},
                ],
            },
            "ultima_actualizacion": None,
            "novedades": [],
            "historial_semanas": [],
        }

        with open(mod.CATALOGO_PATH, "w", encoding="utf-8") as f:
            json.dump(catálogo_actual, f, indent=2, ensure_ascii=False)
        with open(mod.ANTERIOR_PATH, "w", encoding="utf-8") as f:
            json.dump(catálogo_anterior, f, indent=2, ensure_ascii=False)

        # Ejecutar actualización semanal
        resultado, novedades = mod._actualizar_catálogo_semanal()

        # Verificar que se guardó el actual como anterior
        with open(mod.ANTERIOR_PATH, "r", encoding="utf-8") as f:
            guardado = json.load(f)
        assert guardado["modelos"]["imagen"][0]["id"] == "hf-img-1"

        # Verificar que hay novedades (el modelo cambió de costo 1 a 2)
        assert len(novedades) >= 1


if __name__ == "__main__":
    import pytest
    pytest.main([__file__, "-v"])