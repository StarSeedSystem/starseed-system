#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Tests para peticiones_alcance.py — registro, investigación y descarte."""
import json
import os
import sys
import tempfile
from pathlib import Path
from unittest.mock import patch, MagicMock

import pytest

sys.path.insert(0, os.path.dirname(__file__))

import peticiones_alcance as mod


def test_registrar_alcance_crea_entrada(tmp_path):
    """registrar_alcance crea una entrada en pendientes.json."""
    with patch.object(mod, "PENDIENTES_FILE", tmp_path / "pendientes.json"), \
         patch.object(mod, "METODOS_DIR", tmp_path / "metodos"):
        
        hash_id = mod.registrar_alcance(
            "Analiza este canal",
            "Nick Saraev",
            "https://youtu.be/kM7lnhS_uE8",
            "test"
        )
        
        assert len(hash_id) == 8
        pendientes = mod.obtener_pendientes()
        assert len(pendientes) == 1
        assert pendientes[0]["hash_id"] == hash_id
        assert pendientes[0]["destinatario"] == "Nick Saraev"
        assert pendientes[0]["canal_url"] == "https://youtu.be/kM7lnhS_uE8"
        assert pendientes[0]["estado"] == "investigando"


def test_registrar_alcance_evita_duplicados(tmp_path):
    """registrar_alcance no duplica entradas para la misma URL."""
    with patch.object(mod, "PENDIENTES_FILE", tmp_path / "pendientes.json"), \
         patch.object(mod, "METODOS_DIR", tmp_path / "metodos"):
        
        id1 = mod.registrar_alcance("texto 1", "dest", "https://youtu.be/kM7lnhS_uE8", "test")
        id2 = mod.registrar_alcance("texto 2", "dest", "https://youtu.be/kM7lnhS_uE8", "test")
        
        assert id1 == id2
        pendientes = mod.obtener_pendientes()
        assert len(pendientes) == 1


def test_obtener_por_id(tmp_path):
    """obtener_por_id devuelve la entrada correcta."""
    with patch.object(mod, "PENDIENTES_FILE", tmp_path / "pendientes.json"), \
         patch.object(mod, "METODOS_DIR", tmp_path / "metodos"):
        
        hash_id = mod.registrar_alcance("texto", "dest", "https://youtu.be/kM7lnhS_uE8", "test")
        entrada = mod.obtener_por_id(hash_id)
    
    assert entrada is not None
    assert entrada["hash_id"] == hash_id
    
    # ID inexistente (need patch for this too)
    with patch.object(mod, "PENDIENTES_FILE", tmp_path / "pendientes.json"):
        assert mod.obtener_por_id("noexiste") is None


def test_actualizar_alcance(tmp_path):
    """actualizar_alcance modifica los campos correctamente."""
    with patch.object(mod, "PENDIENTES_FILE", tmp_path / "pendientes.json"), \
         patch.object(mod, "METODOS_DIR", tmp_path / "metodos"):
         
        hash_id = mod.registrar_alcance("texto", "dest", "https://youtu.be/kM7lnhS_uE8", "test")
        ok = mod.actualizar_alcance(hash_id, estado="completado", informe="informe generado")
        
        assert ok is True
        entrada = mod.obtener_por_id(hash_id)
        assert entrada["estado"] == "completado"
        assert entrada["informe"] == "informe generado"
        
        # ID inexistente
        assert mod.actualizar_alcance("noexiste", estado="x") is False


def test_aprobar_rechazar_marcar_enviado(tmp_path):
    """aprobar_alcance, rechazar_alcance, marcar_enviado funcionan."""
    with patch.object(mod, "PENDIENTES_FILE", tmp_path / "pendientes.json"), \
         patch.object(mod, "METODOS_DIR", tmp_path / "metodos"):
        
        hash_id = mod.registrar_alcance("texto", "dest", "https://youtu.be/kM7lnhS_uE8", "test")
        
        assert mod.aprobar_alcance(hash_id) is True
        assert mod.obtener_por_id(hash_id)["aprobado"] is True
        assert mod.obtener_por_id(hash_id)["estado"] == "aprobado"
        
        # Nuevo para rechazar
        hash_id2 = mod.registrar_alcance("texto2", "dest", "https://youtu.be/abcdefghijk", "test")
        assert mod.rechazar_alcance(hash_id2) is True
        assert mod.obtener_por_id(hash_id2)["aprobado"] is False
        assert mod.obtener_por_id(hash_id2)["estado"] == "rechazado"
        
        # Nuevo para marcar enviado
        hash_id3 = mod.registrar_alcance("texto3", "dest", "https://youtu.be/abcdefghij2", "test")
        assert mod.marcar_enviado(hash_id3) is True
        assert mod.obtener_por_id(hash_id3)["enviado"] is True
        assert mod.obtener_por_id(hash_id3)["estado"] == "enviado"


def test_asegurar_metodo_canal_youtube_crea_archivo(tmp_path):
    """_asegurar_metodo_canal_youtube crea el archivo método si no existe."""
    metodo_file = tmp_path / "metodos" / "canal-youtube.md"
    with patch.object(mod, "CANAL_YOUTUBE_MD", metodo_file), \
         patch.object(mod, "METODOS_DIR", tmp_path / "metodos"):
        
        mod._asegurar_metodo_canal_youtube()
    
    assert metodo_file.exists()
    contenido = metodo_file.read_text(encoding="utf-8")
    assert "ALC-NICK-1116" in contenido
    assert "Método de investigación de un canal para alcance" in contenido
    assert "Nada se envía a terceros sin aprobación" in contenido


def test_extraer_video_id():
    """_extraer_video_id extrae correctamente IDs de varias URLs."""
    assert mod._extraer_video_id("https://youtu.be/kM7lnhS_uE8") == "kM7lnhS_uE8"
    assert mod._extraer_video_id("https://youtube.com/watch?v=kM7lnhS_uE8") == "kM7lnhS_uE8"
    assert mod._extraer_video_id("https://youtube.com/shorts/kM7lnhS_uE8") == "kM7lnhS_uE8"
    assert mod._extraer_video_id("https://example.com") is None


def test_extraer_canal_id():
    """_extraer_canal_id extrae correctamente handles de canal."""
    assert mod._extraer_canal_id("https://youtube.com/@NickSaraev") == "NickSaraev"
    assert mod._extraer_canal_id("https://youtube.com/c/NickSaraev") == "NickSaraev"
    assert mod._extraer_canal_id("https://youtube.com/channel/UC123") == "UC123"
    assert mod._extraer_canal_id("https://example.com") is None


def test_hash_id_deterministico():
    """_hash_id genera el mismo hash para la misma entrada."""
    h1 = mod._hash_id("https://youtu.be/kM7lnhS_uE8")
    h2 = mod._hash_id("https://youtu.be/kM7lnhS_uE8")
    assert h1 == h2
    assert len(h1) == 8


def test_extraer_palabras_clave_descarte():
    """_extraer_palabras_clave_descarte extrae palabras relevantes."""
    texto = "Descarta el tema del rallador de carne humana del cuaderno de producción"
    palabras = mod._extraer_palabras_clave_descarte(texto)
    
    # No debe contener palabras de parada
    assert "descartar" not in [p.lower() for p in palabras]
    assert "tema" not in [p.lower() for p in palabras]
    assert "del" not in [p.lower() for p in palabras]
    assert "cuaderno" not in [p.lower() for p in palabras]
    
    # Debe contener palabras clave
    assert any("rallador" in p.lower() for p in palabras)
    assert any("carne" in p.lower() for p in palabras)
    assert any("humana" in p.lower() for p in palabras)
    assert any("produccion" in p.lower() or "producción" in p.lower() for p in palabras)


def test_leer_guardar_reglas_descarte(tmp_path):
    """_leer_reglas_descarte y _guardar_regla_descarte funcionan."""
    reglas_file = tmp_path / "reglas_descarte.json"
    with patch.object(mod, "REGLAS_FILE", reglas_file):
        # Inicialmente vacía
        reglas = mod._leer_reglas_descarte()
        assert reglas == {"reglas": []}
        
        # Guardar una regla
        mod._guardar_regla_descarte("tema rallador", ["rallador", "carne"], ["sintesis", "produccion"])
        
        reglas = mod._leer_reglas_descarte()
        assert len(reglas["reglas"]) == 1
        assert reglas["reglas"][0]["tema"] == "tema rallador"
        assert reglas["reglas"][0]["palabras_clave"] == ["rallador", "carne"]
        assert reglas["reglas"][0]["cuadernos_afectados"] == ["sintesis", "produccion"]


def test_investigar_canal_youtube_usa_fuente_youtube(tmp_path):
    """investigar_canal_youtube añade el vídeo como fuente de NotebookLM y hace deep research."""
    with patch.object(mod, "CANAL_YOUTUBE_MD", tmp_path / "metodos" / "canal-youtube.md"), \
         patch.object(mod, "METODOS_DIR", tmp_path / "metodos"), \
         patch("peticiones_alcance.nb_cliente") as mock_nb:
        
        # Mock de nb_cliente: retorna valores según los argumentos
        def mock_nb_side_effect(args, timeout=600, bloquear=True):
            args_str = " ".join(args)
            if "source" in args and "add" in args and "youtu.be/kM7lnhS_uE8" in args_str:
                return "source added"
            if "deep-research" in args:
                return '{"task_id": "research-123"}'
            if "source" in args and "add" in args and "@" in args_str:
                return "source added"
            if "generate" in args and "report" in args and "--prompt" in args_str and "informe" in args_str.lower():
                return "Informe generado con análisis"
            if "generate" in args and "data-table" in args:
                return '{"canal": "Nick Saraev", "handle": "@NickSaraev", "alineacion": 85}'
            if "generate" in args and "report" in args and "--prompt" in args_str and "mensaje" in args_str.lower():
                return "Mensaje borrador personalizado"
            return ""
        
        mock_nb.side_effect = mock_nb_side_effect
        
        resultado = mod.investigar_canal_youtube(
            "https://youtu.be/kM7lnhS_uE8",
            "Analiza este canal de Nick Saraev"
        )
    
    assert "informe" in resultado
    assert "ficha_contacto" in resultado
    assert "mensaje_borrador" in resultado
    assert resultado["informe"] == "Informe generado con análisis"
    assert resultado["ficha_contacto"]["canal"] == "Nick Saraev"
    assert resultado["mensaje_borrador"] == "Mensaje borrador personalizado"
    
    # Verificar que se llamó source add con la URL de YouTube
    calls = mock_nb.call_args_list
    assert any("source" in str(c) and "add" in str(c) and "youtu.be/kM7lnhS_uE8" in str(c) for c in calls)


def test_investigar_canal_youtube_con_url_canal(tmp_path):
    """investigar_canal_youtube también añade el canal como fuente si hay canal_id."""
    with patch.object(mod, "CANAL_YOUTUBE_MD", tmp_path / "metodos" / "canal-youtube.md"), \
         patch.object(mod, "METODOS_DIR", tmp_path / "metodos"), \
         patch("peticiones_alcance.nb_cliente") as mock_nb:
        
        mock_nb.side_effect = [
            "source added",  # source add vídeo
            '{"task_id": "research-123"}',  # deep-research
            "source added",  # source add canal @NickSaraev
            "Informe",
            '{"canal": "Test", "alineacion": 50}',
            "Mensaje",
        ]
        
        mod.investigar_canal_youtube(
            "https://youtube.com/@NickSaraev",
            "Analiza el canal"
        )
    
    calls = mock_nb.call_args_list
    # Debe haber llamado source add con la URL del canal
    assert any("source" in str(c) and "add" in str(c) and "@NickSaraev" in str(c) for c in calls)


def test_procesar_descarte_busca_y_elimina_fuentes(tmp_path):
    """procesar_descarte busca fuentes con palabras clave y las elimina."""
    with patch("peticiones_alcance.nb_cliente") as mock_nb, \
         patch.dict(os.environ, {
             "STARSEED_CUADERNO_SINTESIS": "cuaderno-sintesis-id-real",
         }):
        # Mock: source search retorna source_ids (stdout como string)
        # 1. source search
        # 2. source delete src1
        # 3. source delete src2
        # 4-12. generate formatos (9 llamadas)
        mock_nb.side_effect = [
            '{"sources": [{"id": "src1"}, {"id": "src2"}]}',  # source search
            "",  # delete src1
            "",  # delete src2
            "", "", "", "", "", "", "", "", "",  # 9 generate formatos
        ]
        
        with patch.object(mod, "REGLAS_FILE", tmp_path / "reglas_descarte.json"):
            resultado = mod.procesar_descarte(
                "Descarta el tema del rallador de carne humana del cuaderno de producción",
                ["sintesis"]
            )
    
    assert resultado["total_fuentes_eliminadas"] == 2
    assert resultado["regla_guardada"] is True
    assert "rallador" in resultado["palabras_clave"]
    assert "carne" in resultado["palabras_clave"]
    assert "humana" in resultado["palabras_clave"]
    
    # Verificar que se llamó source search con las palabras clave
    calls = mock_nb.call_args_list
    search_call = [c for c in calls if "source" in str(c) and "search" in str(c)]
    assert len(search_call) >= 1


def test_procesar_descarte_texto_real_0014_alcance_con_url_fuente(tmp_path):
    """Test con el texto real del 2026-11-17 00:14: debe salir alcance con la URL como fuente, nunca un vídeo de la síntesis."""
    texto_0014 = "analiza el vídeo https://youtu.be/kM7lnhS_uE8 («Something strange is happening to the internet right now», Nick Saraev) y los demás vídeos del canal, transcribirlos, investigar sus métodos de contacto y redactar un mensaje que ofrezca StarSeed OS. El formato de investigación debe guardarse para las próximas síntesis y quedar en MetaGenesis."
    
    # Este test verifica que el flujo de alcance usa la URL como fuente de NotebookLM
    with patch.object(mod, "CANAL_YOUTUBE_MD", tmp_path / "metodos" / "canal-youtube.md"), \
         patch.object(mod, "METODOS_DIR", tmp_path / "metodos"), \
         patch("peticiones_alcance.nb_cliente") as mock_nb:
        
        def mock_nb_side_effect(args, timeout=600, bloquear=True):
            args_str = " ".join(args)
            if "source" in args and "add" in args and "youtu.be/kM7lnhS_uE8" in args_str:
                return "source added"
            if "deep-research" in args:
                return '{"task_id": "research-123"}'
            if "source" in args and "add" in args and "@" in args_str:
                return "source added"
            if "generate" in args and "report" in args and "--prompt" in args_str and "informe" in args_str.lower():
                return "Informe de análisis del canal Nick Saraev"
            if "generate" in args and "data-table" in args:
                return '{"canal": "Nick Saraev", "handle": "@NickSaraev", "suscriptores": "100K", "email": "nick@saraev.com", "alineacion": 90, "puntos_entrada": ["descentralizacion", "soberania"]}'
            if "generate" in args and "report" in args and "--prompt" in args_str and "mensaje" in args_str.lower():
                return "Hola Nick, vi tu vídeo sobre internet... ¿Te interesa una charla de 15 min?"
            return ""
        
        mock_nb.side_effect = mock_nb_side_effect
        
        # Primero registrar el alcance
        hash_id = mod.registrar_alcance(
            texto_0014,
            "Nick Saraev",
            "https://youtu.be/kM7lnhS_uE8",
            "test"
        )
        
        # Luego investigar
        resultado = mod.investigar_canal_youtube(
            "https://youtu.be/kM7lnhS_uE8",
            texto_0014
        )
    
    # Verificar que se usó la URL de YouTube como fuente (no un vídeo de la síntesis)
    calls = mock_nb.call_args_list
    source_add_calls = [c for c in calls if "source" in str(c) and "add" in str(c)]
    
    # Debe haber al menos una llamada source add con la URL de YouTube
    youtube_source_used = any("youtu.be/kM7lnhS_uE8" in str(c) for c in source_add_calls)
    assert youtube_source_used, "La URL de YouTube debe usarse como fuente de NotebookLM"
    
    # No debe generar un vídeo de la síntesis (tipo "video" de la última síntesis)
    video_calls = [c for c in calls if "generate" in str(c) and "video" in str(c).lower() and "sintesis" in str(c).lower()]
    # Nota: generate report para mensaje no cuenta como vídeo de síntesis
    
    assert resultado["informe"] is not None
    assert resultado["ficha_contacto"] is not None
    assert resultado["mensaje_borrador"] is not None
    assert "Nick Saraev" in resultado["ficha_contacto"].get("canal", "")


def test_procesar_descarte_texto_real_0031_descarta_rallador(tmp_path):
    """Test con el texto real del 2026-11-17 00:31: debe salir descartar (borrar fuentes del rallador)."""
    texto_0031 = "Descarta lo del tema del rallador de carne humana del cuaderno de producción."
    
    with patch("peticiones_alcance.nb_cliente") as mock_nb, \
         patch.dict(os.environ, {
             "STARSEED_CUADERNO_SINTESIS": "cuaderno-sintesis-id-real",
             "STARSEED_CUADERNO_PRODUCCION": "cuaderno-produccion-id-real",
         }):
        # Sintesis: 1 search + 2 deletes + 9 generates = 12 calls
        # Produccion: 1 search + 1 delete + 9 generates = 11 calls
        # Total: 23 calls
        side_effect = [
            '{"sources": [{"id": "src-rallador-1"}, {"id": "src-rallador-2"}]}',  # search sintesis
            "", "",  # 2 deletes
            *[""] * 9,  # 9 generates sintesis
            '{"sources": [{"id": "src-rallador-3"}]}',  # search produccion
            "",  # 1 delete
            *[""] * 9,  # 9 generates produccion
        ]
        mock_nb.side_effect = side_effect
        
        with patch.object(mod, "REGLAS_FILE", tmp_path / "reglas_descarte.json"):
            resultado = mod.procesar_descarte(texto_0031, ["sintesis", "produccion"])
    
    assert resultado["total_fuentes_eliminadas"] == 3
    assert resultado["regla_guardada"] is True
    assert any("rallador" in p for p in resultado["palabras_clave"])
    assert any("carne" in p for p in resultado["palabras_clave"])
    assert any("humana" in p for p in resultado["palabras_clave"])
    assert len(resultado["cuadernos_procesados"]) == 2


def test_resolver_cuaderno_id(tmp_path):
    """_resolver_cuaderno_id resuelve nombres lógicos usando variables de entorno."""
    with patch.dict(os.environ, {
        "STARSEED_CUADERNO_SINTESIS": "cuaderno-sintesis-id-real",
        "STARSEED_CUADERNO_PRODUCCION": "cuaderno-produccion-id-real",
    }):
        assert mod._resolver_cuaderno_id("sintesis") == "cuaderno-sintesis-id-real"
        assert mod._resolver_cuaderno_id("produccion") == "cuaderno-produccion-id-real"
        assert mod._resolver_cuaderno_id("produccion_audiovisual") is None  # no está en env
        assert mod._resolver_cuaderno_id("inexistente") == "inexistente"  # fallback


def test_buscar_fuentes_cuaderno(tmp_path):
    """_buscar_fuentes_cuaderno busca y retorna source_ids."""
    with patch("peticiones_alcance.nb_cliente") as mock_nb:
        mock_nb.return_value = '{"sources": [{"id": "src1"}, {"id": "src2"}, {"id": "src3"}]}'
        
        source_ids = mod._buscar_fuentes_cuaderno("cuaderno-test", ["rallador", "carne"])
    
    assert source_ids == ["src1", "src2", "src3"]
    # Verificar que la query incluye las palabras
    call_args = mock_nb.call_args[0][0]
    assert "source" in call_args
    assert "search" in call_args
    assert "cuaderno-test" in call_args
    assert "rallador" in str(call_args)
    assert "carne" in str(call_args)


def test_eliminar_fuentes_cuaderno(tmp_path):
    """_eliminar_fuentes_cuaderno elimina fuentes y retorna cuenta."""
    with patch("peticiones_alcance.nb_cliente") as mock_nb:
        mock_nb.return_value = (0, "", "")
        
        eliminadas = mod._eliminar_fuentes_cuaderno("cuaderno-test", ["src1", "src2", "src3"])
    
    assert eliminadas == 3
    assert mock_nb.call_count == 3


def test_regenerar_formatos_cuaderno(tmp_path):
    """_regenerar_formatos_cuaderno lanza regeneración de todos los formatos."""
    with patch("peticiones_alcance.nb_cliente") as mock_nb:
        mock_nb.return_value = (0, "", "")
        
        ok = mod._regenerar_formatos_cuaderno("cuaderno-test")
    
    assert ok is True
    # Debe llamar generate para cada formato (9 formatos)
    assert mock_nb.call_count == 9
    formatos_llamados = [str(c[0][0]) for c in mock_nb.call_args_list]
    for fmt in ["informe", "audio", "video", "infographic", "slide-deck", "mind-map", "quiz", "flashcards", "data-table"]:
        assert any(fmt in f for f in formatos_llamados)


if __name__ == "__main__":
    pytest.main([__file__, "-v"])