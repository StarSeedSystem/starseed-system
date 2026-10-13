#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Tests para el explorador de modelos de imagen.
Utiliza respuestas grabadas (mock) para simular las llamadas a Hugging Face y GitHub.
"""

import json
import sys
import unittest
from unittest.mock import patch, MagicMock
from pathlib import Path

# Añadir el directorio raíz al path para poder importar el explorador
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from scripts.imagenes.explorador_modelos import (
    leer_modelos_existentes,
    obtener_modelos_tendencia,
    obtener_info_modelo_hf,
    obtener_ultima_release_github,
    obtener_licencia_github,
    extraer_info_modelo_hf,
    extraer_info_modelo_existente,
    merece_entrar_al_catalogo,
    escribir_propuestas,
    crear_cola_catalogo,
    # notificar_director,  # Esto requiere el director_chat, lo mockearemos en las pruebas que lo necesiten
    main,
)


class TestExploradorModelos(unittest.TestCase):
    def setUp(self):
        """Configuración común para las pruebas."""
        # Ruta al archivo modelos.ts de prueba
        self.modelos_ts_path = Path(__file__).resolve().parents[2] / "src" / "lib" / "imagenes" / "modelos.ts"
        # Aseguramos que el archivo exista
        if not self.modelos_ts_path.exists():
            self.skipTest("El archivo modelos.ts no existe")

    @patch("scripts.imagenes.explorador_modelos._json")
    def test_obtener_modelos_tendencia(self, mock_json):
        """Prueba que obtener_modelos_tendencia devuelve una lista de modelos."""
        # Simular respuesta de HF
        mock_json.return_value = (200, {}, [
            {"modelId": "test/modelo-1", "author": "test", "likes": 100, "downloads": 50},
            {"modelId": "test/modelo-2", "author": "test", "likes": 200, "downloads": 100},
        ])
        modelos = obtener_modelos_tendencia(limite=2)
        self.assertEqual(len(modelos), 2)
        self.assertEqual(modelos[0]["modelId"], "test/modelo-1")
        self.assertEqual(modelos[1]["likes"], 200)

    @patch("scripts.imagenes.explorador_modelos._json")
    def test_obtener_info_modelo_hf(self, mock_json):
        """Prueba que obtener_info_modelo_hf devuelve la información de un modelo."""
        mock_json.return_value = (200, {}, {"modelId": "test/modelo", "likes": 50, "gated": False})
        info = obtener_info_modelo_hf("test/modelo")
        self.assertIsNotNone(info)
        self.assertEqual(info["modelId"], "test/modelo")
        self.assertEqual(info["likes"], 50)
        self.assertFalse(info["gated"])

    @patch("scripts.imagenes.explorador_modelos._gh")
    def test_obtener_ultima_release_github(self, mock_gh):
        """Prueba que obtener_ultima_release_github devuelve la última release."""
        mock_gh.return_value = (200, {
            "tag_name": "v1.0.0",
            "published_at": "2026-10-01T00:00:00Z",
            "body": "Release inicial"
        })
        release = obtener_ultima_release_github("owner", "repo")
        self.assertIsNotNone(release)
        self.assertEqual(release["tag_name"], "v1.0.0")
        self.assertEqual(release["published_at"], "2026-10-01T00:00:00Z")

    @patch("scripts.imagenes.explorador_modelos._gh")
    def test_obtener_licencia_github(self, mock_gh):
        """Prueba que obtener_licencia_github devuelve la licencia SPDX."""
        mock_gh.return_value = (200, {
            "license": {
                "spdx_id": "MIT"
            }
        })
        licencia = obtener_licencia_github("owner", "repo")
        self.assertEqual(licencia, "MIT")

    def test_extraer_info_modelo_hf(self):
        """Prueba que extraer_info_modelo_hf extrae los campos esperados."""
        datos_hf = {
            "license": "apache-2.0",
            "gated": True,
            "downloads": 1000,
            "likes": 500,
            "lastModified": "2026-10-01T00:00:00Z",
            "tags": ["texto-a-imagen", "diffusers"]
        }
        info = extraer_info_modelo_hf(datos_hf)
        self.assertEqual(info["licencia"], "apache-2.0")
        self.assertTrue(info["gated"])
        self.assertIsNone(info["tamaño_gb"])  # Porque no lo implementamos todavía
        self.assertEqual(info["descarga"], 1000)
        self.assertEqual(info["me_gusta"], 500)
        self.assertEqual(info["última_modificación"], "2026-10-01T00:00:00Z")
        self.assertEqual(info["étiquetas"], ["texto-a-imagen", "diffusers"])

    def test_extraer_info_modelo_existente(self):
        """Prueba que extraer_info_modelo_existente devuelve la información actualizada."""
        modelo_existente = {
            "id": "test-id",
            "nombre": "Test Modelo",
            "licencia": "apache-2.0",
            "gated": False,
            "repoGB": 5.5,
            "motores": ["sdcpp", "diffusers"]
        }
        info_hf = {
            "lastModified": "2026-10-02T00:00:00Z"
        }
        info = extraer_info_modelo_existente(modelo_existente, info_hf)
        self.assertEqual(info["id"], "test-id")
        self.assertEqual(info["nombre"], "Test Modelo")
        self.assertEqual(info["licencia"], "apache-2.0")
        self.assertFalse(info["gated"])
        self.assertEqual(info["tamaño_gb"], 5.5)
        self.assertEqual(info["última_modificación"], "2026-10-02T00:00:00Z")
        self.assertEqual(info["motores"], ["sdcpp", "diffusers"])

        # Caso sin info_hf
        info_sin_hf = extraer_info_modelo_existente(modelo_existente, None)
        self.assertIsNone(info_sin_hf["última_modificación"])

    def test_merece_entrar_al_catalogo(self):
        """Prueba la lógica para determinar si un modelo merece entrar al catálogo."""
        # Caso: licencia comercial, no gated -> debería entrar
        self.assertTrue(merece_entrar_al_catalogo({
            "licencia": "Apache-2.0",
            "gated": False,
            "tamaño_gb": 5.0
        }))
        # Caso: licencia no comercial -> no debería entrar
        self.assertFalse(merece_entrar_al_catalogo({
            "licencia": "Non-Commercial License",
            "gated": False,
            "tamaño_gb": 5.0
        }))
        # Caso: gated pero licencia comercial -> debería entrar (el usuario decide si acepta los términos)
        self.assertTrue(merece_entrar_al_catalogo({
            "licencia": "Apache-2.0",
            "gated": True,
            "tamaño_gb": 5.0
        }))
        # Caso: licencia desconocida -> no debería entrar (por ser conservador)
        self.assertFalse(merece_entrar_al_catalogo({
            "licencia": "Licencia Desconocida",
            "gated": False,
            "tamaño_gb": 5.0
        }))

    @patch("scripts.imagenes.explorador_modelos.asegurar_directorio_olas")
    @patch("builtins.open", new_callable=unittest.mock.mock_open)
    @patch("pathlib.Path.replace")
    def test_escribir_propuestas(self, mock_replace, mock_open, mock_asegurar):
        """Prueba que escribir_propuestas escribe el archivo JSON correctamente."""
        propuestas = [
            {"tipo": "test", "nombre": "modelo1"},
            {"tipo": "test", "nombre": "modelo2"}
        ]
        escribir_propuestas(propuestas)
        mock_asegurar.assert_called_once()
        # Verificar que se abrió el archivo en modo write
        mock_open.assert_called_once()
        # Verificar que se escribió algo en el archivo
        handle = mock_open()
        self.assertTrue(handle.write.called)
        mock_replace.assert_called_once()

    @patch("scripts.imagenes.explorador_modelos.asegurar_directorio_olas")
    @patch("builtins.open", new_callable=unittest.mock.mock_open)
    @patch("pathlib.Path.replace")
    def test_crear_cola_catalogo(self, mock_replace, mock_open, mock_asegurar):
        """Prueba que crear_cola_catalogo crea el archivo de cola correctamente."""
        modelos = [
            {"id": "modelo1", "nombre": "Modelo 1"},
            {"id": "modelo2", "nombre": "Modelo 2"}
        ]
        fecha = "2026-10-13"
        cola_file = crear_cola_catalogo(modelos, fecha)
        mock_asegurar.assert_called_once()
        mock_open.assert_called_once()
        handle = mock_open()
        self.assertTrue(handle.write.called)
        mock_replace.assert_called_once()
        # Verificar que el nombre del archivo contiene la fecha
        self.assertIn("cola-imagenes-catalogo-2026-10-13.json", str(cola_file))

    @patch("scripts.imagenes.explorador_modelos.director_chat.publicar")
    def test_notificar_director(self, mock_publicar):
        """Prueba que notificar_director llama a director_chat.publicar."""
        from scripts.imagenes.explorador_modelos import notificar_director
        notificar_director("Mensaje de prueba")
        mock_publicar.assert_called_once()
        args, kwargs = mock_publicar.call_args
        self.assertEqual(kwargs["texto"], "Mensaje de prueba")
        self.assertEqual(kwargs["de"], "explorador-imagenes")
        self.assertEqual(kwargs["rol"], "sistema")
        self.assertEqual(kwargs["tipo"], "aviso")
        self.assertEqual(kwargs["canal"], "mando")

    @patch("scripts.imagenes.explorador_modelos.obtener_modelos_tendencia")
    @patch("scripts.imagenes.explorador_modelos.obtener_info_modelo_hf")
    @patch("scripts.imagenes.explorador_modelos.obtener_ultima_release_github")
    @patch("scripts.imagenes.explorador_modelos.obtener_licencia_github")
    @patch("scripts.imagenes.explorador_modelos.escribir_propuestas")
    @patch("scripts.imagenes.explorador_modelos.crear_cola_catalogo")
    @patch("scripts.imagenes.explorador_modelos.notificar_director")
    def test_main(self, mock_notificar, mock_crear_cola, mock_escribir, mock_licencia, mock_release, mock_info_hf, mock_tendencia):
        """Prueba la función principal mockeando todas las dependencias externas."""
        # Configurar los valores de retorno de los mocks
        mock_tendencia.return_value = [
            {"modelId": "test/modelo-1", "author": "test", "likes": 100},
            {"modelId": "test/modelo-2", "author": "test", "likes": 200}
        ]
        # Mock para obtener_info_modelo_hf: devolver un valor fijo para cualquier llamada
        mock_info_hf.return_value = {"likes": 100, "gated": False, "lastModified": "2026-10-01"}
        mock_release.return_value = {"tag_name": "v1.0", "published_at": "2026-10-01", "body": "test"}
        mock_licencia.return_value = "MIT"

        # Ejecutar la función principal
        main()

        # Verificar que se llamaron las funciones esperadas
        mock_tendencia.assert_called()
        # Se llama a obtener_info_modelo_hf para cada modelo existente (12 veces)
        self.assertGreaterEqual(mock_info_hf.call_count, 12)
        mock_release.assert_any_call("leejet", "stable-diffusion.cpp")
        mock_release.assert_any_call("comfyanonymous", "ComfyUI")
        mock_licencia.assert_any_call("leejet", "stable-diffusion.cpp")
        mock_licencia.assert_any_call("comfyanonymous", "ComfyUI")
        mock_escribir.assert_called_once()
        # mock_crear_cola podría o no haberse llamado dependiendo de si hay modelos nuevos
        # mock_notificar debería haberse llamado
        mock_notificar.assert_called_once()


if __name__ == "__main__":
    unittest.main()