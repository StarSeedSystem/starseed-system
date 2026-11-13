#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Tests para peticiones_encargos.py — reglas puras de encargos, sin red."""
import json
import os
import sys
sys.path.insert(0, os.path.dirname(__file__))

from peticiones_encargos import (
    ENTREGABLES_VALIDOS,
    DESTINOS,
    validar_plan,
    texto_panel,
    fusionar_encargo_guardado,
    por_reglas_encargo,
    por_reglas_ajuste,
    por_reglas_preferencia,
    planificar_base,
)


def test_entregables_validos_incluye_tipos_esperados():
    """ENTREGABLES_VALIDOS incluye informe, documento y todos los TIPOS de notebooklm."""
    esperados = {"informe", "documento", "infographic", "audio", "video", "slide-deck", "mind-map", "quiz", "flashcards", "data-table", "report"}
    assert set(ENTREGABLES_VALIDOS) == esperados


def test_destinos_tiene_claves_esperadas():
    """DESTINOS tiene las carpetas de Drive esperadas."""
    esperadas = {"fuentes", "fundamentos", "videos", "eventos", "herramientas", "produccion"}
    assert set(DESTINOS.keys()) == esperadas


def test_validar_plan_normaliza_frentes_validos():
    """Plan con frentes válidos se normaliza correctamente (≤10 frentes, ≤3 investigaciones, ≤8 entregables)."""
    plan = {
        "frentes": [
            {
                "nombre": "Investigación",
                "destino": "fuentes",
                "investigacion": ["consulta 1", "consulta 2", "consulta 3", "consulta 4"],
                "entregables": [
                    {"tipo": "informe", "titulo": "Informe 1", "prompt": "prompt 1"},
                    {"tipo": "mind-map", "titulo": "Mapa 1", "prompt": "prompt 2"},
                    {"tipo": "slide-deck", "titulo": "Slides 1", "prompt": "prompt 3"},
                    {"tipo": "report", "titulo": "Report 1", "prompt": "prompt 4"},
                    {"tipo": "data-table", "titulo": "Tabla 1", "prompt": "prompt 5"},
                    {"tipo": "audio", "titulo": "Audio 1", "prompt": "prompt 6"},
                    {"tipo": "video", "titulo": "Video 1", "prompt": "prompt 7"},
                    {"tipo": "infographic", "titulo": "Info 1", "prompt": "prompt 8"},
                    {"tipo": "documento", "titulo": "Doc 1", "prompt": "prompt 9"},
                ],
            },
            {
                "nombre": "Desarrollo",
                "destino": "produccion",
                "investigacion": [],
                "entregables": [
                    {"tipo": "informe", "titulo": "Informe 2", "prompt": "prompt"},
                ],
            },
        ]
    }
    frentes = validar_plan(plan)
    assert len(frentes) == 2
    # Primer frente: investigaciones limitadas a 3, entregables limitados a 8
    assert len(frentes[0]["investigacion"]) == 3
    assert len(frentes[0]["entregables"]) == 8
    # Segundo frente: sin cambios
    assert len(frentes[1]["investigacion"]) == 0
    assert len(frentes[1]["entregables"]) == 1
    # IDs asignados
    assert frentes[0]["id"] == "F1"
    assert frentes[1]["id"] == "F2"
    # Estado inicial
    assert frentes[0]["estado"] == "pendiente"
    assert frentes[1]["estado"] == "pendiente"
    # Destino válido mantenido
    assert frentes[0]["destino"] == "fuentes"
    assert frentes[1]["destino"] == "produccion"


def test_validar_plan_limite_10_frentes():
    """Más de 10 frentes → se toman solo los primeros 10."""
    plan = {"frentes": [{"nombre": f"Frente {i}", "entregables": [{"tipo": "informe", "titulo": f"T{i}", "prompt": "p"}]} for i in range(15)]}
    frentes = validar_plan(plan)
    assert len(frentes) == 10
    assert frentes[-1]["id"] == "F10"


def test_validar_plan_rechaza_sin_frentes_validos():
    """Plan sin frentes con entregables válidos → ValueError."""
    try:
        validar_plan({"frentes": [{"nombre": "Vacio", "entregables": []}]})
        assert False, "Debería haber lanzado ValueError"
    except ValueError as e:
        assert "no tiene frentes con entregables válidos" in str(e)


def test_validar_plan_filtra_entregables_invalidos():
    """Entregables con tipo inválido o sin título se descartan."""
    plan = {
        "frentes": [{
            "nombre": "Test",
            "entregables": [
                {"tipo": "informe", "titulo": "Válido", "prompt": "p"},
                {"tipo": "inexistente", "titulo": "Inválido", "prompt": "p"},
                {"tipo": "audio", "titulo": "", "prompt": "p"},
                {"tipo": "video", "prompt": "p"},  # sin titulo
            ],
        }]
    }
    frentes = validar_plan(plan)
    assert len(frentes[0]["entregables"]) == 1
    assert frentes[0]["entregables"][0]["tipo"] == "informe"
    assert frentes[0]["entregables"][0]["titulo"] == "Válido"


def test_validar_plan_normaliza_campos_entregable():
    """Campos de entregable se normalizan (enviar bool, prompt recortado, título recortado)."""
    plan = {
        "frentes": [{
            "nombre": "Test",
            "entregables": [{
                "tipo": "informe",
                "titulo": "T" * 200,
                "prompt": "P" * 7000,
                "enviar": "sí",
            }],
        }]
    }
    frentes = validar_plan(plan)
    e = frentes[0]["entregables"][0]
    assert len(e["titulo"]) <= 150
    assert len(e["prompt"]) <= 6000
    assert e["enviar"] is True


def test_texto_panel_genera_formato_correcto():
    """texto_panel produce markdown con título, estado, texto, ajustes y frentes."""
    enc = {
        "id": "ENC-1112-1430",
        "titulo": "Desarrollo de síntesis",
        "texto": "Se aprueban las recomendaciones...",
        "estado": "activo",
        "notas": ["Priorizar vídeo sobre audio", "Usar tono formal"],
        "frentes": [
            {
                "id": "F1",
                "nombre": "Investigación",
                "destino": "fuentes",
                "estado": "hecho",
                "carpeta_enlace": "https://drive.google.com/drive/folders/abc",
                "cuaderno": "nb123",
                "investigacion": ["consulta 1", "consulta 2"],
                "investigado": ["consulta 1"],
                "entregables": [
                    {"tipo": "informe", "titulo": "Informe investigación", "enlace": "https://docs.google.com/...", "fallo": None},
                    {"tipo": "mind-map", "titulo": "Mapa mental", "enlace": None, "fallo": "timeout"},
                ],
            },
            {
                "id": "F2",
                "nombre": "Desarrollo",
                "destino": "produccion",
                "estado": "en_curso",
                "carpeta_enlace": "https://drive.google.com/drive/folders/def",
                "entregables": [
                    {"tipo": "documento", "titulo": "Guion", "enlace": None, "fallo": None},
                ],
            },
        ],
    }
    panel = texto_panel(enc)
    assert "# Panel · Desarrollo de síntesis" in panel
    assert "ENC-1112-1430" in panel
    assert "**activo**" in panel
    assert "Se aprueban las recomendaciones" in panel
    assert "## Ajustes de Maggasukha" in panel
    assert "Priorizar vídeo sobre audio" in panel
    assert "Usar tono formal" in panel
    assert "✅ F1 · Investigación" in panel
    assert "https://drive.google.com/drive/folders/abc" in panel
    assert "https://notebooklm.google.com/notebook/nb123" in panel
    assert "✅ Investigación: consulta 1" in panel
    assert "⬜ Investigación: consulta 2" in panel
    assert "✅ informe · Informe investigación" in panel
    assert "⚠️ mind-map · Mapa mental" in panel
    assert "timeout" in panel
    assert "⏳ F2 · Desarrollo" in panel
    assert "⬜ documento · Guion" in panel


def test_texto_panel_sin_ajustes():
    """Panel sin notas no muestra sección de ajustes."""
    enc = {"id": "ENC-1", "titulo": "Test", "texto": "texto", "estado": "activo", "notas": [], "frentes": []}
    panel = texto_panel(enc)
    assert "## Ajustes de Maggasukha" not in panel


def test_fusionar_encargo_guardado_conserva_notas_y_estado():
    """fusionar_encargo_guardado combina notas nuevas con viejas y respeta estado pausado/cancelado."""
    viejo = {
        "id": "ENC-1",
        "notas": ["nota vieja 1", "nota vieja 2"],
        "estado": "pausado",
        "frentes": [{"id": "F1", "estado": "hecho"}],
    }
    nuevo = {
        "id": "ENC-1",
        "notas": ["nota nueva"],
        "estado": "activo",
        "frentes": [{"id": "F1", "estado": "pendiente"}],
    }
    fusionado = fusionar_encargo_guardado(nuevo, viejo)
    # Notas: nuevas + viejas no duplicadas
    assert fusionado["notas"] == ["nota nueva", "nota vieja 1", "nota vieja 2"]
    # Estado: si viejo era pausado/cancelado y nuevo activo, se mantiene el viejo
    assert fusionado["estado"] == "pausado"
    # Frentes no se tocan aquí (se manejan por separado)


def test_fusionar_encargo_guardado_estado_activo_sin_conflicto():
    """Si viejo no está pausado/cancelado, se usa el estado del nuevo."""
    viejo = {"id": "ENC-1", "notas": [], "estado": "activo"}
    nuevo = {"id": "ENC-1", "notas": ["nueva"], "estado": "activo"}
    fusionado = fusionar_encargo_guardado(nuevo, viejo)
    assert fusionado["estado"] == "activo"
    assert fusionado["notas"] == ["nueva"]


def test_por_reglas_encargo_detecta_mensaje_largo():
    """Mensaje largo con palabras clave de aprobación → encargo (no audio)."""
    msg = "Se aprueban las recomendaciones de la síntesis del 11-11. Desarrolla los 8 frentes del plan: investigación de referencias, guiones para vídeos, storyboards, personajes, referencias de diseño, listas de tareas por tipo de contenido, próximas pasos de producción y calendario. Guarda todo en Drive y mándame avances."
    tipo = por_reglas_encargo(msg, hay_encargo=False)
    assert tipo == "encargo"
    # Aunque mencione audio/vídeo, un mensaje largo con aprobación SIEMPRE es encargo


def test_por_reglas_encargo_no_clasifica_como_audio():
    """Un encargo largo NUNCA se clasifica como audio, aunque nombre audio."""
    msg = "Apruebo el plan y quiero que desarrolles todo: investigación, guiones, storyboards, personajes, referencias, listas de tareas, próximos pasos. Incluye también un resumen en audio tipo podcast de cada frente."
    tipo = por_reglas_encargo(msg, hay_encargo=False)
    assert tipo == "encargo"
    assert tipo != "audio"


def test_por_reglas_ajuste_corto_con_encargo_activo():
    """Mensaje corto con palabras de ajuste y encargo activo → ajuste."""
    msg = "Prioriza el vídeo sobre el audio en el frente 2"
    tipo = por_reglas_ajuste(msg, hay_encargo=True)
    assert tipo == "ajuste"


def test_por_reglas_ajuste_sin_encargo_activo_es_respuesta():
    """Ajuste sin encargo activo → respuesta (no ajuste)."""
    msg = "Prioriza el vídeo sobre el audio"
    tipo = por_reglas_ajuste(msg, hay_encargo=False)
    assert tipo == "respuesta"


def test_por_reglas_preferencia_detecta_regla_permanente():
    """Mensaje con 'recuerda', 'mi nombre es', 'llámame' → preferencia."""
    for msg in ["Recuerda que me llamo Maggasukha", "Mi nombre es Maggasukha", "Llámame Maggasukha"]:
        tipo = por_reglas_preferencia(msg)
        assert tipo == "preferencia", f"Fallo con: {msg}"


def test_planificar_base_devuelve_plan_minimo():
    """planificar_base produce un plan válido cuando el modelo falla."""
    frentes = planificar_base("Desarrolla la síntesis aprobada")
    assert len(frentes) >= 3
    assert any(f["nombre"] == "Plan y listas de tareas" for f in frentes)
    # Todos los frentes tienen entregables válidos
    for f in frentes:
        assert len(f["entregables"]) >= 1
        for e in f["entregables"]:
            assert e["tipo"] in ENTREGABLES_VALIDOS
            assert e["titulo"]


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