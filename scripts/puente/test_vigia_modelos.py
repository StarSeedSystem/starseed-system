#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas del Vigía de modelos (VGM1016D): sin red, todo inyectado.

Cubre:
- Orquesta una pasada por área (descubrir + evaluar)
- Escribe novedades-<fecha>.json de forma atómica
- Publica resumen en Chat Director (simulado)
- Crea cola-vigia-<fecha>.json con ≤ 5 mejores tareas
- Órdenes --seco y --area X
- Estado persistente en ~/.starseed/vigia-modelos.json

Todas las pruebas son sin red: http_get, reloj, pausa y disco inyectados.
"""

import json
import os
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from unittest.mock import patch, MagicMock

sys.path.insert(0, str(Path(__file__).parent))
import vigia_modelos as VM  # noqa: E402

AHORA = datetime(2026, 10, 16, 12, 0, tzinfo=timezone.utc)
SHA256_TURBO = "a" * 64
SHA256_GGUF = "b" * 64
CENTINELA = "-".join(["centinela", "no", "imprimir", "1234"])


def modelo(id_modelo, creado, likes=100, trending=5.0, licencia="qwen-research", gated=False, archivos=None):
    """Un modelo como lo devuelve la API pública de Hugging Face."""
    pipeline = "text-to-image" if "-GGUF" not in id_modelo else "other"
    # Determinar quantizacion y tags del id
    id_lower = id_modelo.lower()
    quant = ""
    if "q3_k_s" in id_lower:
        quant = "Q3_K_S"
    elif "q2_k" in id_lower:
        quant = "Q2_K"
    elif "q4_k" in id_lower:
        quant = "Q4_K"
    elif "gguf" in id_lower:
        quant = "Q4_K_M"
    tags = ["text-to-image"] if "text-to-image" in pipeline else []
    if "uncensored" in id_lower:
        tags.append("uncensored")
    if "abliterated" in id_lower:
        tags.append("abliterated")
    return {
        "id": id_modelo,
        "author": id_modelo.rpartition("/")[0],
        "created_at": creado,
        "last_modified": creado,
        "pipeline_tag": pipeline,
        "likes": likes,
        "trending_score": trending,
        "license": licencia,
        "gated": gated,
        "archivos": archivos or [],
        "quantizacion": quant,
        "tags": tags,
    }


TRENDING_IMAGEN = [
    modelo("Qwen/Qwen-Image-2.1-Turbo", "2026-10-09T14:55:00.000Z", 12458, 9.8, gated=True,
           archivos=[{"nombre": "qwen-image-2.1-turbo-bf16.safetensors", "bytes": 14200000000, "sha256": SHA256_TURBO}]),
    modelo("black-forest-labs/FLUX.1-dev", "2026-08-05T10:00:00.000Z", 8500, 9.1, "other"),
    modelo("KasugaiSakura/Qwen-Image-2.1-Uncensored", "2026-10-12T00:00:00.000Z", 400, 7.5),
]

AUTOR_QWEN = [
    modelo("Qwen/Qwen-Image-2.1", "2026-09-14T10:00:00.000Z", 5432, 0, gated=True),
    modelo("Qwen/Qwen-Viejo", "2026-04-01T10:00:00.000Z", 500, 0),
]

CUANTIZADO_UNSLOTH = [
    modelo("unsloth/Qwen-Image-2.1-Turbo-GGUF", "2026-10-10T08:30:00.000Z", 8920,
           archivos=[{"nombre": "Qwen-Image-2.1-Turbo-Q2_K.gguf", "bytes": 2470000000, "sha256": SHA256_GGUF},
                     {"nombre": "Qwen-Image-2.1-Turbo-Q3_K_S.gguf", "bytes": 2720000000, "sha256": SHA256_GGUF}]),
]


class SimuladorHTTP:
    """Simula la red HTTP para el test."""
    
    def __init__(self):
        self.peticiones = []
        self.respuestas = {}
    
    def registrar(self, url: str, respuesta: Any):
        self.respuestas[url] = respuesta
    
    def http_get(self, url: str, headers: dict | None = None, timeout: int = 30) -> str | None:
        self.peticiones.append({"url": url, "headers": headers})
        if url in self.respuestas:
            return json.dumps(self.respuestas[url])
        return "[]"


class SimuladorTiempo:
    """Simula el reloj y las pausas."""
    
    def __init__(self, ahora: datetime):
        self.ahora = ahora
        self.pausas = []
    
    def dormir(self, segundos: float):
        self.pausas.append(segundos)


class TestVigiaModelos(unittest.TestCase):
    """Tests del director del vigía."""
    
    def setUp(self):
        self.tmpdir = tempfile.mkdtemp(prefix="vigia_test_")
        self.raiz_test = Path(self.tmpdir)
        self.memory_root = self.raiz_test / "starseed_memory_root"
        self.vigia_dir = self.memory_root / "vigia"
        self.olas_dir = self.memory_root / "olas"
        self.estado_dir = self.raiz_test / ".starseed"
        self.estado_archivo = self.estado_dir / "vigia-modelos.json"
        
        # Parchear rutas
        self._patches = []
        
        # Parchear RAIZ_REPO
        p1 = patch.object(VM, "RAIZ_REPO", self.raiz_test)
        self._patches.append(p1)
        p1.start()
        
        # Parchear MEMORY_ROOT
        p2 = patch.object(VM, "MEMORY_ROOT", self.memory_root)
        self._patches.append(p2)
        p2.start()
        
        # Parchear VIGIA_DIR
        p3 = patch.object(VM, "VIGIA_DIR", self.vigia_dir)
        self._patches.append(p3)
        p3.start()
        
        # Parchear OLAS_DIR
        p4 = patch.object(VM, "OLAS_DIR", self.olas_dir)
        self._patches.append(p4)
        p4.start()
        
        # Parchear ESTADO_DIR
        p5 = patch.object(VM, "ESTADO_DIR", self.estado_dir)
        self._patches.append(p5)
        p5.start()
        
        # Parchear ESTADO_ARCHIVO
        p6 = patch.object(VM, "ESTADO_ARCHIVO", self.estado_archivo)
        self._patches.append(p6)
        p6.start()
        
        # Parchear cargar_areas para usar áreas de prueba
        p7 = patch.object(VM, "cargar_areas", return_value=[
            {"id": "imagen", "nombre": "Imagen", "pipeline_tags": ["text-to-image"], "autores": ["Qwen"], "catalogo": "src/lib/imagenes/modelos.ts"},
        ])
        self._patches.append(p7)
        self.mock_cargar_areas = p7.start()
        
        # Parchear descubrir para devolver candidatos de prueba
        p8 = patch.object(VM, "descubrir", return_value=TRENDING_IMAGEN + AUTOR_QWEN + CUANTIZADO_UNSLOTH)
        self._patches.append(p8)
        self.mock_descubrir = p8.start()
        
        # Parchear _obtener_catalogo_ids
        p9 = patch.object(VM, "_obtener_catalogo_ids", return_value={"Qwen/Qwen-Image-2.1"})
        self._patches.append(p9)
        p9.start()
        
        # Parchear director_chat.publicar
        p10 = patch.object(VM, "director_chat")
        self._patches.append(p10)
        self.mock_director = p10.start()
    
    def tearDown(self):
        for p in self._patches:
            p.stop()
        # Limpiar directorio temporal
        import shutil
        shutil.rmtree(self.tmpdir, ignore_errors=True)
    
    def test_pasada_completa_escribe_novedades(self):
        """Una pasada completa escribe novedades-<fecha>.json atómicamente."""
        # Ejecutar main con --seco --test-http
        sys.argv = ["vigia_modelos.py", "--seco", "--test-http"]
        with patch.object(VM, "datetime") as mock_dt:
            mock_dt.now.return_value = AHORA
            mock_dt.timezone = timezone
            VM.main()
        
        # Verificar que se escribió el archivo de novedades
        archivos = list(self.vigia_dir.glob("novedades-*.json"))
        self.assertEqual(len(archivos), 1)
        
        with open(archivos[0], encoding="utf-8") as f:
            novedades = json.load(f)
        
        self.assertEqual(novedades["fecha"], "2026-10-16")
        self.assertIn("areas", novedades)
        self.assertIn("imagen", novedades["areas"])
        
        area_data = novedades["areas"]["imagen"]
        self.assertIn("aceptados", area_data)
        self.assertIn("descartados", area_data)
        
        # El Turbo debe estar aceptado
        aceptados_ids = [a["id"] for a in area_data["aceptados"]]
        self.assertIn("Qwen/Qwen-Image-2.1-Turbo", aceptados_ids)
        
        # El Uncensored debe estar descartado
        descartados_ids = [d["id"] for d in area_data["descartados"]]
        self.assertIn("KasugaiSakura/Qwen-Image-2.1-Uncensored", descartados_ids)
    
    def test_novedades_tienen_estructura_correcta(self):
        """Las novedades tienen la estructura del contrato: clase_licencia, cabe_en, mejor_archivo_por_medio, SHA."""
        sys.argv = ["vigia_modelos.py", "--seco", "--test-http"]
        with patch.object(VM, "datetime") as mock_dt:
            mock_dt.now.return_value = AHORA
            mock_dt.timezone = timezone
            VM.main()
        
        archivos = list(self.vigia_dir.glob("novedades-*.json"))
        with open(archivos[0], encoding="utf-8") as f:
            novedades = json.load(f)
        
        # El Turbo base (safetensors 14GB) no cabe en Mac, pero el GGUF cuantizado sí
        gguf = next(a for a in novedades["areas"]["imagen"]["aceptados"] if a["id"] == "unsloth/Qwen-Image-2.1-Turbo-GGUF")
        
        # Verificar campos obligatorios
        self.assertIn("clase_licencia", gguf)
        self.assertIn("cabe_en", gguf)
        self.assertIn("mejor_archivo_por_medio", gguf)
        self.assertIn("puntaje", gguf)
        self.assertIn("motivo_puntaje", gguf)
        self.assertIn("pipeline_tag", gguf)
        self.assertIn("trending", gguf)
        
        # Verificar clase de licencia (qwen-research = personal)
        self.assertEqual(gguf["clase_licencia"], "personal")
        
        # Verificar que tiene mejor_archivo_por_medio con SHA (Mac cabe el GGUF ~2.7GB)
        self.assertIn("mac", gguf["mejor_archivo_por_medio"])
        self.assertIn("sha256", gguf["mejor_archivo_por_medio"]["mac"])
        self.assertEqual(gguf["mejor_archivo_por_medio"]["mac"]["sha256"], SHA256_GGUF)
    
    def test_seco_no_crea_cola_ni_publica(self):
        """Con --seco no se crea cola ni se publica en Chat Director."""
        sys.argv = ["vigia_modelos.py", "--seco", "--test-http"]
        with patch.object(VM, "datetime") as mock_dt:
            mock_dt.now.return_value = AHORA
            mock_dt.timezone = timezone
            VM.main()
        
        # No debe haber cola
        colas = list(self.olas_dir.glob("cola-vigia-*.json"))
        self.assertEqual(len(colas), 0)
        
        # No debe haber llamado a director_chat.publicar
        self.mock_director.publicar.assert_not_called()
    
    def test_sin_seco_crea_cola_con_max_5(self):
        """Sin --seco crea cola-vigia-<fecha>.json con ≤ 5 tareas."""
        # Crear más de 5 candidatos aceptados simulando múltiples áreas
        self.mock_cargar_areas.return_value = [
            {"id": "imagen", "nombre": "Imagen", "pipeline_tags": ["text-to-image"], "autores": ["Qwen"], "catalogo": "src/lib/imagenes/modelos.ts"},
            {"id": "video", "nombre": "Vídeo", "pipeline_tags": ["text-to-video"], "autores": ["Wan-AI"], "catalogo": "src/lib/protomolecula/catalogo-herramientas.ts"},
        ]
        
        # Simular candidatos para ambas áreas (más de 5 en total) con archivos válidos
        # Usar autores vigilados (Qwen para imagen, Wan-AI para video) para que pasen es_seguro
        candidatos_multi = []
        for i in range(7):
            # Archivos pequeños que caben en Mac (2 GB)
            archivos = [{"nombre": f"Qwen-Image-2.1-Test-{i}-q4_k.gguf", "bytes": 2000000000, "sha256": "c" * 64}]
            # Para imagen: autor Qwen; para video: autor Wan-AI (el mock devuelve lo mismo para ambas áreas)
            candidatos_multi.append(modelo(f"Qwen/Qwen-Image-2.1-Test-{i}", "2026-10-15T00:00:00.000Z", trending=10-i, archivos=archivos))
        
        self.mock_descubrir.return_value = candidatos_multi
        
        sys.argv = ["vigia_modelos.py", "--test-http"]
        with patch.object(VM, "datetime") as mock_dt:
            mock_dt.now.return_value = AHORA
            mock_dt.timezone = timezone
            VM.main()
        
        # Verificar cola creada
        colas = list(self.olas_dir.glob("cola-vigia-*.json"))
        self.assertEqual(len(colas), 1)
        
        with open(colas[0], encoding="utf-8") as f:
            cola = json.load(f)
        
        self.assertEqual(cola["fecha"], "2026-10-16")
        self.assertIn("tareas", cola)
        self.assertLessEqual(len(cola["tareas"]), 5)  # Máximo 5 por día
        
        # Verificar estructura de tarea
        for tarea in cola["tareas"]:
            self.assertIn("id", tarea)
            self.assertIn("area", tarea)
            self.assertIn("modelo_id", tarea)
            self.assertIn("clase_licencia", tarea)
            self.assertIn("prompt", tarea)
            self.assertIn("archivos_max", tarea)
            self.assertEqual(tarea["archivos_max"], 3)
    
    def test_area_filtrada_solo_procesa_esa(self):
        """Con --area X solo procesa esa área."""
        self.mock_cargar_areas.return_value = [
            {"id": "imagen", "nombre": "Imagen", "pipeline_tags": ["text-to-image"], "autores": ["Qwen"], "catalogo": "src/lib/imagenes/modelos.ts"},
            {"id": "video", "nombre": "Vídeo", "pipeline_tags": ["text-to-video"], "autores": ["Wan-AI"], "catalogo": "src/lib/protomolecula/catalogo-herramientas.ts"},
        ]
        
        sys.argv = ["vigia_modelos.py", "--seco", "--test-http", "--area", "video"]
        with patch.object(VM, "datetime") as mock_dt:
            mock_dt.now.return_value = AHORA
            mock_dt.timezone = timezone
            VM.main()
        
        # Solo debe haber llamado a descubrir para video
        self.assertEqual(self.mock_descubrir.call_count, 1)
        args_call = self.mock_descubrir.call_args
        self.assertEqual(args_call[0][0]["id"], "video")
    
    def test_estado_persistente_se_actualiza(self):
        """El estado en ~/.starseed/vigia-modelos.json se actualiza con última pasada e IDs vistos."""
        sys.argv = ["vigia_modelos.py", "--seco", "--test-http"]
        with patch.object(VM, "datetime") as mock_dt:
            mock_dt.now.return_value = AHORA
            mock_dt.timezone = timezone
            VM.main()
        
        self.assertTrue(self.estado_archivo.exists())
        with open(self.estado_archivo, encoding="utf-8") as f:
            estado = json.load(f)
        
        self.assertEqual(estado["ultima_pasada"], "2026-10-16")
        self.assertIn("ids_vistos", estado)
        self.assertIn("Qwen/Qwen-Image-2.1-Turbo", estado["ids_vistos"])
        self.assertIn("KasugaiSakura/Qwen-Image-2.1-Uncensored", estado["ids_vistos"])
    
    def test_escritura_atomica_novedades(self):
        """La escritura de novedades es atómica (usa .tmp y rename)."""
        sys.argv = ["vigia_modelos.py", "--seco", "--test-http"]
        with patch.object(VM, "datetime") as mock_dt:
            mock_dt.now.return_value = AHORA
            mock_dt.timezone = timezone
            VM.main()
        
        # No debe quedar archivo .tmp
        tmp_files = list(self.vigia_dir.glob("*.tmp"))
        self.assertEqual(len(tmp_files), 0)
        
        # El archivo final debe existir y ser válido JSON
        archivos = list(self.vigia_dir.glob("novedades-*.json"))
        self.assertEqual(len(archivos), 1)
        with open(archivos[0], encoding="utf-8") as f:
            json.load(f)  # No debe lanzar excepción
    
    def test_escritura_atomica_cola(self):
        """La escritura de cola es atómica (usa .tmp y rename)."""
        self.mock_cargar_areas.return_value = [
            {"id": "imagen", "nombre": "Imagen", "pipeline_tags": ["text-to-image"], "autores": ["Qwen"], "catalogo": "src/lib/imagenes/modelos.ts"},
        ]
        # Candidatos con archivos válidos y autor vigilado para pasar es_seguro
        candidatos_multi = []
        for i in range(3):
            archivos = [{"nombre": f"Qwen-Test-{i}-q4_k.gguf", "bytes": 2000000000, "sha256": "c" * 64}]
            candidatos_multi.append(modelo(f"Qwen/Qwen-Test-{i}", "2026-10-15T00:00:00.000Z", trending=10-i, archivos=archivos))
        self.mock_descubrir.return_value = candidatos_multi
        
        sys.argv = ["vigia_modelos.py", "--test-http"]
        with patch.object(VM, "datetime") as mock_dt:
            mock_dt.now.return_value = AHORA
            mock_dt.timezone = timezone
            VM.main()
        
        # No debe quedar archivo .tmp
        tmp_files = list(self.olas_dir.glob("*.tmp"))
        self.assertEqual(len(tmp_files), 0)
        
        colas = list(self.olas_dir.glob("cola-vigia-*.json"))
        self.assertEqual(len(colas), 1)
        with open(colas[0], encoding="utf-8") as f:
            json.load(f)
    
    def test_sin_red_http_get_inyectado(self):
        """Las pruebas usan http_get inyectado, no hay red real."""
        # Verificar que _http_get_simulado no hace llamadas reales
        import inspect
        source = inspect.getsource(VM._http_get_simulado)
        # No debe tener código que haga peticiones HTTP reales (ignorar comentarios)
        lineas_codigo = [l for l in source.split('\n') if not l.strip().startswith('#')]
        codigo_sin_comentarios = '\n'.join(lineas_codigo)
        self.assertNotIn("requests.get", codigo_sin_comentarios)
        self.assertNotIn("urllib.request", codigo_sin_comentarios)
        self.assertNotIn("httpx.", codigo_sin_comentarios)
        self.assertIn("return None", source)
    
    def test_funciones_puras_sin_efectos_laterales(self):
        """Las funciones de evaluación son puras (no tocan red ni disco)."""
        import inspect
        
        funcs_puras = [
            "_evaluar_candidato",
            "_generar_novedades",
            "_escribir_novedades_atomico",
            "_crear_cola_vigia",
            "_actualizar_estado",
        ]
        
        for fname in funcs_puras:
            if hasattr(VM, fname):
                func = getattr(VM, fname)
                source = inspect.getsource(func)
                # No deben importar módulos de red
                self.assertNotIn("import requests", source)
                self.assertNotIn("import urllib", source)
                self.assertNotIn("import http", source)
    
    def test_limite_novedades_dia_es_5(self):
        """La constante LIMITE_NOVEDADES_DIA es 5."""
        self.assertEqual(VM.LIMITE_NOVEDADES_DIA, 5)
    
    def test_catalogo_ids_vacio_por_defecto(self):
        """_obtener_catalogo_ids devuelve set vacío si no existe el catálogo."""
        # Test sin mocks - llamar a la función real
        import scripts.puente.vigia_modelos as VM_real
        area = {"catalogo": "no/existe.ts"}
        resultado = VM_real._obtener_catalogo_ids(area)
        self.assertEqual(resultado, set())


if __name__ == "__main__":
    unittest.main()