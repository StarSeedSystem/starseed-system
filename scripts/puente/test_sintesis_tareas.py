#!/usr/bin/env python3
"""Pruebas para sintesis_tareas.py — módulo puro, sin red, con directorios temporales."""
import json
import os
import tempfile
import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__)))
import sintesis_tareas as st


def _crear_estructura(raiz):
    dirs = [os.path.join(raiz, "starseed_memory_root", "imaginacion", "agentes")]
    for d in dirs:
        os.makedirs(d, exist_ok=True)
    return raiz


def _contexto_ejemplo(fecha="2026-11-11"):
    return {
        "fecha": fecha,
        "sintesis_previas": [
            {"fecha": "2026-11-10", "texto": "# Síntesis\n## Mañana\n- Vídeos: Vídeo 1, Vídeo 2\n- Contactos: Cole Hastings, Sunseed\n- Categorías: Diseño"},
            {"fecha": "2026-11-09", "texto": "# Síntesis\n## Mañana\n- Vídeos: Vídeo 3, Vídeo 4\n- Contactos: Damanhur\n- Categorías: Código"},
        ],
        "mananas": [
            {"videos": ["Vídeo 1", "Vídeo 2"], "contactos": ["Cole Hastings", "Sunseed"], "categorias": ["Diseño"]},
            {"videos": ["Vídeo 3", "Vídeo 4"], "contactos": ["Damanhur"], "categorias": ["Código"]},
        ],
        "rotacion": {"videos": ["Vídeo 5", "Vídeo 6"], "contactos": ["Nuevo1", "Nuevo2"], "categorias": ["IA"]},
        "imaginacion": [{"agente": "ref-diseño", "datos": {"tema": "diseño"}}],
        "informes": [{"ruta": "informes/dir.md", "fecha": "2026-11-10", "texto": "Informe director"}],
        "resumen_actividad": {"temas": {"mesh": ["enlace1"], "IA": ["enlace2"]}},
    }


def test_generar_tareas_analisis_siete_ramas():
    with tempfile.TemporaryDirectory() as tmp:
        _crear_estructura(tmp)
        ctx = _contexto_ejemplo()
        tareas = st.generar_tareas_analisis(ctx, raiz=tmp, ahora="2026-11-11T10:00:00")
        assert len(tareas) == 7
        ramas = [t["rama"] for t in tareas]
        assert set(ramas) == {"contactos", "noticias", "referencias", "actividad", "ideas", "guiones", "youtube"}


def test_tarea_analisis_estructura_comun():
    with tempfile.TemporaryDirectory() as tmp:
        _crear_estructura(tmp)
        ctx = _contexto_ejemplo()
        tareas = st.generar_tareas_analisis(ctx, raiz=tmp, ahora="2026-11-11T10:00:00")
        for t in tareas:
            assert t["tipo"] == "analisis"
            assert t["modo"] == "libre"
            assert t["capacidad"] == "alta"
            assert t["id"].startswith("SIN1111")
            assert "salida" in t
            assert "starseed_memory_root/imaginacion/agentes/sintesis-2026-11-11-" in t["salida"]
            assert t["salida"].endswith(".json")
            assert "prompt" in t
            assert "todo dato con fuente y fecha" in t["prompt"].lower()
            assert "nada inventado" in t["prompt"].lower()
            assert "no se investiga a particulares" in t["prompt"].lower()


def test_tarea_actividad_es_privada():
    with tempfile.TemporaryDirectory() as tmp:
        _crear_estructura(tmp)
        ctx = _contexto_ejemplo()
        tareas = st.generar_tareas_analisis(ctx, raiz=tmp, ahora="2026-11-11T10:00:00")
        for t in tareas:
            if t["rama"] == "actividad":
                assert t["privado"] is True
            else:
                assert t["privado"] is False


def test_tarea_contactos_incluye_rotacion_y_protocolo():
    with tempfile.TemporaryDirectory() as tmp:
        _crear_estructura(tmp)
        ctx = _contexto_ejemplo()
        tareas = st.generar_tareas_analisis(ctx, raiz=tmp, ahora="2026-11-11T10:00:00")
        t_contactos = next(t for t in tareas if t["rama"] == "contactos")
        assert "Nuevo1" in t_contactos["prompt"] or "Nuevo2" in t_contactos["prompt"]
        assert "contactos" in t_contactos["prompt"].lower()


def test_tarea_noticias_incluye_rotacion_y_protocolo():
    with tempfile.TemporaryDirectory() as tmp:
        _crear_estructura(tmp)
        ctx = _contexto_ejemplo()
        tareas = st.generar_tareas_analisis(ctx, raiz=tmp, ahora="2026-11-11T10:00:00")
        t_noticias = next(t for t in tareas if t["rama"] == "noticias")
        assert "videos" in t_noticias["prompt"].lower() or "vídeo" in t_noticias["prompt"].lower()


def test_tarea_referencias_reutiliza_agente_referencias():
    with tempfile.TemporaryDirectory() as tmp:
        _crear_estructura(tmp)
        ctx = _contexto_ejemplo()
        tareas = st.generar_tareas_analisis(ctx, raiz=tmp, ahora="2026-11-11T10:00:00")
        t_ref = next(t for t in tareas if t["rama"] == "referencias")
        assert "referencias de diseño" in t_ref["prompt"].lower() or "agente_referencias" in t_ref["prompt"].lower()


def test_tarea_actividad_incluye_resumen_y_temas():
    with tempfile.TemporaryDirectory() as tmp:
        _crear_estructura(tmp)
        ctx = _contexto_ejemplo()
        tareas = st.generar_tareas_analisis(ctx, raiz=tmp, ahora="2026-11-11T10:00:00")
        t_act = next(t for t in tareas if t["rama"] == "actividad")
        assert "mesh" in t_act["prompt"] or "IA" in t_act["prompt"]
        assert "resumen" in t_act["prompt"].lower() or "actividad" in t_act["prompt"].lower()


def test_tarea_ideas_incluye_imaginacion_e_informes():
    with tempfile.TemporaryDirectory() as tmp:
        _crear_estructura(tmp)
        ctx = _contexto_ejemplo()
        tareas = st.generar_tareas_analisis(ctx, raiz=tmp, ahora="2026-11-11T10:00:00")
        t_ideas = next(t for t in tareas if t["rama"] == "ideas")
        assert "imaginación" in t_ideas["prompt"].lower() or "imaginacion" in t_ideas["prompt"].lower()
        assert "informe" in t_ideas["prompt"].lower()


def test_tarea_guiones_incluye_rotacion_videos():
    with tempfile.TemporaryDirectory() as tmp:
        _crear_estructura(tmp)
        ctx = _contexto_ejemplo()
        tareas = st.generar_tareas_analisis(ctx, raiz=tmp, ahora="2026-11-11T10:00:00")
        t_guiones = next(t for t in tareas if t["rama"] == "guiones")
        assert "vídeo 5" in t_guiones["prompt"].lower() or "video 5" in t_guiones["prompt"].lower()
        assert "vídeo 6" in t_guiones["prompt"].lower() or "video 6" in t_guiones["prompt"].lower()


def test_salida_en_ruta_correcta():
    with tempfile.TemporaryDirectory() as tmp:
        _crear_estructura(tmp)
        ctx = _contexto_ejemplo("2026-11-11")
        tareas = st.generar_tareas_analisis(ctx, raiz=tmp, ahora="2026-11-11T10:00:00")
        for t in tareas:
            esperada = f"starseed_memory_root/imaginacion/agentes/sintesis-2026-11-11-{t['rama']}.json"
            assert t["salida"] == esperada


def test_tarea_youtube_incluye_rotacion_videos():
    with tempfile.TemporaryDirectory() as tmp:
        _crear_estructura(tmp)
        ctx = _contexto_ejemplo()
        tareas = st.generar_tareas_analisis(ctx, raiz=tmp, ahora="2026-11-11T10:00:00")
        t_youtube = next(t for t in tareas if t["rama"] == "youtube")
        prompt_lower = t_youtube["prompt"].lower()
        assert "vídeo 5" in prompt_lower
        assert "vídeo 6" in prompt_lower


def test_ids_unicos_con_prefijo_sin_mmdd_n():
    with tempfile.TemporaryDirectory() as tmp:
        _crear_estructura(tmp)
        ctx = _contexto_ejemplo()
        tareas = st.generar_tareas_analisis(ctx, raiz=tmp, ahora="2026-11-11T10:00:00")
        ids = [t["id"] for t in tareas]
        for id_ in ids:
            assert id_.startswith("SIN1111")
        assert len(set(ids)) == len(ids)


if __name__ == "__main__":
    import pytest
    pytest.main([__file__, "-v"])