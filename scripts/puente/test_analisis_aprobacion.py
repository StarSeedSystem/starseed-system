import pytest
from analisis_aprobacion import construir_prompt, leer_veredicto, puede_aprobar_solo


def test_construir_prompt():
    ficha = {
        "id": "123",
        "titulo": "Test Task",
        "rama": "test-branch",
        "sha": "abc123",
        "estado": "pendiente",
        "modelo": "test-model",
        "dificultad": "alta",
        "revisor": "test-revisor",
        "faltan": [],
        "motivo_vb": "test-motivo",
    }
    diff = "Test diff"
    contexto = "Test contexto"
    prompt = construir_prompt(ficha, diff, contexto)
    assert "Test Task" in prompt
    assert "Test diff" in prompt
    assert "Test contexto" in prompt


def test_leer_veredicto():
    # JSON limpio
    salida = '{"veredicto": "aprobar", "confianza": "alta", "razones": [], "riesgos": [], "que_revisar": []}'
    veredicto = leer_veredicto(salida)
    assert veredicto["veredicto"] == "aprobar"
    assert veredicto["confianza"] == "alta"

    # JSON envuelto en prosa
    salida = 'El veredicto es: {"veredicto": "rechazar", "confianza": "media", "razones": [], "riesgos": [], "que_revisar": []}'
    veredicto = leer_veredicto(salida)
    assert veredicto["veredicto"] == "rechazar"
    assert veredicto["confianza"] == "media"

    # JSON en ```json
    salida = '```json\n{"veredicto": "dudoso", "confianza": "baja", "razones": [], "riesgos": [], "que_revisar": []}\n```'
    veredicto = leer_veredicto(salida)
    assert veredicto["veredicto"] == "dudoso"
    assert veredicto["confianza"] == "baja"

    # Salida vacía
    salida = ""
    veredicto = leer_veredicto(salida)
    assert veredicto["veredicto"] == "dudoso"
    assert veredicto["confianza"] == "baja"

    # Veredicto inventado
    salida = '{"veredicto": "inventado", "confianza": "inventada", "razones": [], "riesgos": [], "que_revisar": []}'
    veredicto = leer_veredicto(salida)
    assert veredicto["veredicto"] == "dudoso"
    assert veredicto["confianza"] == "baja"


def test_puede_aprobar_solo():
    # Veredicto de aprobar con confianza alta y ficha verde
    veredicto = {
        "veredicto": "aprobar",
        "confianza": "alta",
        "razones": [],
        "riesgos": [],
        "que_revisar": [],
    }
    assert puede_aprobar_solo(veredicto, True)

    # Veredicto de aprobar con confianza alta pero ficha no verde
    assert not puede_aprobar_solo(veredicto, False)

    # Veredicto de aprobar con confianza media y ficha verde
    veredicto["confianza"] = "media"
    assert not puede_aprobar_solo(veredicto, True)

    # Veredicto de aprobar con confianza baja y ficha verde
    veredicto["confianza"] = "baja"
    assert not puede_aprobar_solo(veredicto, True)

    # Veredicto de rechazar con confianza alta y ficha verde
    veredicto["veredicto"] = "rechazar"
    veredicto["confianza"] = "alta"
    assert not puede_aprobar_solo(veredicto, True)

    # Veredicto de dudoso con confianza alta y ficha verde
    veredicto["veredicto"] = "dudoso"
    veredicto["confianza"] = "alta"
    assert not puede_aprobar_solo(veredicto, True)

    # Veredicto de aprobar con confianza alta y ficha verde pero con razones
    veredicto["veredicto"] = "aprobar"
    veredicto["confianza"] = "alta"
    veredicto["razones"] = ["Test reason"]
    assert puede_aprobar_solo(veredicto, True)

    # Veredicto de aprobar con confianza alta y ficha verde pero con riesgos
    veredicto["riesgos"] = ["Test risk"]
    assert puede_aprobar_solo(veredicto, True)

    # Veredicto de aprobar con confianza alta y ficha verde pero con que_revisar
    veredicto["que_revisar"] = ["Test to review"]
    assert puede_aprobar_solo(veredicto, True)
