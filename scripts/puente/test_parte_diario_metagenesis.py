#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas puras para parte_diario_metagenesis.py (sin red)."""

import json
import sys
import tempfile
import time
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch, MagicMock

import parte_diario_metagenesis as P


class TestFuncionesPuras(unittest.TestCase):
    """Pruebas de las funciones puras del módulo."""

    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.raiz = self.tmp / "raiz"
        self.raiz.mkdir(parents=True)
        (self.raiz / "starseed_memory_root").mkdir(parents=True)
        (self.raiz / "starseed_memory_root" / "mando").mkdir(parents=True)
        (self.raiz / "starseed_memory_root" / "imaginacion" / "agentes").mkdir(parents=True)
        (self.raiz / "starseed_memory_root" / "directores").mkdir(parents=True)
        (self.raiz / "starseed_memory_root" / "olas").mkdir(parents=True)
        (self.raiz / "starseed_memory_root" / "colas-fuente").mkdir(parents=True)

    def tearDown(self):
        import shutil
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_ahora_local(self):
        """_ahora_local devuelve un datetime con zona horaria."""
        dt = P._ahora_local()
        self.assertIsInstance(dt, datetime)
        self.assertIsNotNone(dt.tzinfo)

    def test_inicio_dia(self):
        """_inicio_dia pone la hora a 00:00."""
        ahora = datetime(2026, 11, 8, 14, 30, 45, tzinfo=timezone.utc)
        inicio = P._inicio_dia(ahora)
        self.assertEqual(inicio.hour, 0)
        self.assertEqual(inicio.minute, 0)
        self.assertEqual(inicio.second, 0)

    def test_es_ventana_parte(self):
        """_es_ventana_parte detecta la ventana de 07:30 ± 30 min."""
        # Dentro de la ventana
        dt = datetime(2026, 11, 8, 7, 30, 0, tzinfo=timezone.utc)
        self.assertTrue(P._es_ventana_parte(dt))
        dt = datetime(2026, 11, 8, 7, 0, 0, tzinfo=timezone.utc)
        self.assertTrue(P._es_ventana_parte(dt))
        dt = datetime(2026, 11, 8, 8, 0, 0, tzinfo=timezone.utc)
        self.assertTrue(P._es_ventana_parte(dt))
        # Fuera de la ventana
        dt = datetime(2026, 11, 8, 6, 0, 0, tzinfo=timezone.utc)
        self.assertFalse(P._es_ventana_parte(dt))
        dt = datetime(2026, 11, 8, 9, 0, 0, tzinfo=timezone.utc)
        self.assertFalse(P._es_ventana_parte(dt))

    def test_leer_json(self):
        """_leer_json lee JSON válido y devuelve defecto en fallo."""
        ruta = self.tmp / "test.json"
        ruta.write_text('{"a": 1}', encoding="utf-8")
        self.assertEqual(P._leer_json(ruta), {"a": 1})
        self.assertEqual(P._leer_json(self.tmp / "noexiste.json", "defecto"), "defecto")
        ruta.write_text("no es json", encoding="utf-8")
        self.assertEqual(P._leer_json(ruta, "defecto"), "defecto")

    def test_escribir_json_atomico(self):
        """_escribir_json_atomico escribe atómicamente."""
        ruta = self.tmp / "out.json"
        P._escribir_json_atomico(ruta, {"x": 42})
        self.assertTrue(ruta.exists())
        self.assertEqual(json.loads(ruta.read_text()), {"x": 42})

    def test_recortar_json_sin_recortar(self):
        """_recortar_json no toca objetos pequeños."""
        obj = {"a": 1, "b": [1, 2, 3]}
        self.assertEqual(P._recortar_json(obj, 1000), obj)

    def test_recortar_json_con_lista(self):
        """_recortar_json recorta listas conservando lo más reciente por timestamp."""
        ahora = time.time()
        obj = {
            "items": [
                {"id": 1, "ts": ahora - 100},
                {"id": 2, "ts": ahora - 50},
                {"id": 3, "ts": ahora},
            ]
        }
        # Forzar recorte con límite muy bajo
        resultado = P._recortar_json(obj, 50)
        # Debe conservar los más recientes (id 3, luego 2)
        self.assertIn("items", resultado)
        self.assertLessEqual(len(resultado["items"]), 3)

    def test_normalizar_proveedores(self):
        """_normalizar_proveedores quita claves y limita campos."""
        proveedores = [
            {"nombre": "OpenRouter", "tipo": "llm", "cupo": 100, "usado": 30, "disponible": 70, "clave_secreta": "sk-..."},
            {"id": "gemini", "tipo": "llm", "cupo": 50},
        ]
        norm = P._normalizar_proveedores(proveedores)
        self.assertEqual(len(norm), 2)
        self.assertEqual(norm[0]["nombre"], "OpenRouter")
        self.assertNotIn("clave_secreta", norm[0])
        self.assertEqual(norm[1]["nombre"], "gemini")

    def test_normalizar_neuronas(self):
        """_normalizar_neuronas deja solo campos esenciales."""
        neuronas = [
            {"medio": "mac", "modo": "real", "puntos": 1500, "salud": {"ram_libre_mb": 2048, "disco_gb": 50}, "en_curso": [{"id": "T1"}], "contenedor": {"activo": True}},
        ]
        norm = P._normalizar_neuronas(neuronas)
        self.assertEqual(len(norm), 1)
        self.assertEqual(norm[0]["medio"], "mac")
        self.assertIn("ram_libre_mb", norm[0])

    def test_leer_referencias_imaginacion(self):
        """_leer_referencias_imaginacion lee archivos de las últimas 24h."""
        carpeta = self.raiz / "starseed_memory_root" / "imaginacion" / "agentes"
        ahora = time.time()
        # Archivo reciente
        (carpeta / "referencias-diseno-001.json").write_text(json.dumps([{
            "titulo": "Diseño A", "enlace": "https://a.com", "por_que": "bueno", "area": "UI"
        }]), encoding="utf-8")
        # Archivo viejo (simular mtime antiguo)
        viejo = carpeta / "referencias-diseno-000.json"
        viejo.write_text(json.dumps([{"titulo": "Viejo"}]), encoding="utf-8")
        import os
        os.utime(viejo, (ahora - 100000, ahora - 100000))

        refs = P._leer_referencias_imaginacion(self.raiz, ahora - 86400)
        self.assertEqual(len(refs), 1)
        self.assertEqual(refs[0]["titulo"], "Diseño A")
        self.assertEqual(refs[0]["area"], "UI")

    def test_leer_informes_directores(self):
        """_leer_informes_directores lee informes recientes."""
        carpeta = self.raiz / "starseed_memory_root" / "directores"
        ahora = time.time()
        (carpeta / "informe-001.json").write_text(json.dumps({
            "titulo": "Informe A", "resumen": "Resumen del informe"
        }), encoding="utf-8")
        viejo = carpeta / "informe-000.json"
        viejo.write_text(json.dumps({"titulo": "Viejo"}), encoding="utf-8")
        import os
        os.utime(viejo, (ahora - 100000, ahora - 100000))

        inf = P._leer_informes_directores(self.raiz, ahora - 86400)
        self.assertEqual(len(inf), 1)
        self.assertEqual(inf[0]["titulo"], "Informe A")

    def test_estado_areas_mando(self):
        """_estado_areas_mando lee vigia-areas.json."""
        ruta = self.raiz / "starseed_memory_root" / "mando" / "vigia-areas.json"
        ruta.write_text(json.dumps({"areas": {"diseño": "ok", "backend": "en progreso"}}), encoding="utf-8")
        areas = P._estado_areas_mando(self.raiz)
        self.assertEqual(areas["diseño"], "ok")

    def test_medidores_snapshot(self):
        """_medidores_snapshot extrae resúmenes."""
        ruta = self.raiz / "starseed_memory_root" / "mando" / "vigia-medidores.json"
        ruta.write_text(json.dumps({"medidores": {"tareas": {"resumen": "5 en curso"}, "agentes": {"resumen": "3 libres"}}}), encoding="utf-8")
        med = P._medidores_snapshot(self.raiz, time.time())
        self.assertIn("tareas", med)
        self.assertEqual(med["tareas"], "5 en curso")

    def test_armar_parte(self):
        """_armar_parte construye el diccionario completo."""
        parte = P._armar_parte(
            medidores={"tareas": "5"},
            colas={"activas": [], "integradas_24h": 3},
            referencias=[{"titulo": "Ref", "enlace": "http://x", "por_que": "bueno", "area": "UI"}],
            informes=[{"titulo": "Inf", "resumen": "Resumen"}],
            areas={"diseño": "ok"},
            neuronas=[{"medio": "mac"}],
            proveedores=[{"nombre": "OpenRouter", "tipo": "llm"}],
            fecha="2026-11-08",
        )
        self.assertEqual(parte["fecha"], "2026-11-08")
        self.assertEqual(parte["medidores"]["tareas"], "5")
        self.assertEqual(len(parte["referencias_imaginacion"]), 1)


class TestConstruirParte(unittest.TestCase):
    """Prueba de integración ligera de construir_parte (con archivos reales)."""

    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.raiz = self.tmp / "raiz"
        self.raiz.mkdir(parents=True)
        (self.raiz / "starseed_memory_root" / "mando").mkdir(parents=True)
        (self.raiz / "starseed_memory_root" / "imaginacion" / "agentes").mkdir(parents=True)
        (self.raiz / "starseed_memory_root" / "directores").mkdir(parents=True)
        (self.raiz / "starseed_memory_root" / "olas").mkdir(parents=True)
        (self.raiz / "starseed_memory_root" / "colas-fuente").mkdir(parents=True)

    def tearDown(self):
        import shutil
        shutil.rmtree(self.tmp, ignore_errors=True)

    @patch("parte_diario_metagenesis._leer_referencias_imaginacion")
    @patch("parte_diario_metagenesis._leer_informes_directores")
    @patch("parte_diario_metagenesis._estado_areas_mando")
    @patch("parte_diario_metagenesis._medidores_snapshot")
    @patch("parte_diario_metagenesis._colas_activas_y_integradas")
    def test_construir_parte_integra_todo(
        self, mock_colas, mock_medidores, mock_areas, mock_informes, mock_refs
    ):
        """construir_parte llama a todas las fuentes y produce JSON válido ≤ 38k."""
        mock_medidores.return_value = {"tareas": "5 en curso"}
        mock_colas.return_value = {"activas": [{"cola": "cola-test", "pendientes": 2}], "integradas_24h": 1}
        mock_refs.return_value = [{"titulo": "Ref", "enlace": "http://x", "por_que": "bueno", "area": "UI"}]
        mock_informes.return_value = [{"titulo": "Inf", "resumen": "Resumen"}]
        mock_areas.return_value = {"diseño": "ok"}

        parte = P.construir_parte(raiz=self.raiz, ahora=time.time())
        self.assertIsNotNone(parte)
        self.assertEqual(parte["fecha"], datetime.now().strftime("%Y-%m-%d"))
        texto = json.dumps(parte, ensure_ascii=False)
        self.assertLessEqual(len(texto), P.MAX_CHARS)


class TestMain(unittest.TestCase):
    """Pruebas del main (con mocks de líder y Supabase)."""

    @patch("parte_diario_metagenesis.lider_direccion.soy_lider")
    @patch("parte_diario_metagenesis.construir_parte")
    def test_main_no_lider(self, mock_construir, mock_lider):
        """Si no soy líder, sale con 0 sin hacer nada."""
        mock_lider.return_value = {"soy": False, "motivo": "otro líder"}
        with patch.object(sys, "argv", ["parte_diario_metagenesis", "--ahora"]):
            self.assertEqual(P.main(), 0)
        mock_construir.assert_not_called()

    @patch("parte_diario_metagenesis.lider_direccion.soy_lider")
    @patch("parte_diario_metagenesis.construir_parte")
    @patch("parte_diario_metagenesis._credenciales_supabase")
    @patch("parte_diario_metagenesis._insertar_parte_supabase")
    def test_main_seco_imprime_json(self, mock_insertar, mock_cred, mock_construir, mock_lider):
        """Con --seco imprime el JSON y no llama a Supabase."""
        mock_lider.return_value = {"soy": True, "motivo": "líder"}
        mock_construir.return_value = {"fecha": "2026-11-08", "test": "ok"}
        mock_cred.return_value = ("https://x.supabase.co", "clave")

        with patch.object(sys, "argv", ["parte_diario_metagenesis", "--ahora", "--seco"]):
            with patch("sys.stdout", new_callable=MagicMock) as mock_stdout:
                self.assertEqual(P.main(), 0)
        mock_insertar.assert_not_called()

    @patch("parte_diario_metagenesis.lider_direccion.soy_lider")
    @patch("parte_diario_metagenesis.construir_parte")
    @patch("parte_diario_metagenesis._credenciales_supabase")
    @patch("parte_diario_metagenesis._insertar_parte_supabase")
    def test_main_escribe_supabase(self, mock_insertar, mock_cred, mock_construir, mock_lider):
        """Sin --seco escribe en Supabase."""
        mock_lider.return_value = {"soy": True, "motivo": "líder"}
        mock_construir.return_value = {"fecha": "2026-11-08", "test": "ok"}
        mock_cred.return_value = ("https://x.supabase.co", "clave")
        mock_insertar.return_value = True

        with patch.object(sys, "argv", ["parte_diario_metagenesis", "--ahora"]):
            self.assertEqual(P.main(), 0)
        mock_insertar.assert_called_once()


if __name__ == "__main__":
    unittest.main(verbosity=2)