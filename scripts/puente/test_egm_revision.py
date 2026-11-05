# -*- coding: utf-8 -*-
"""test_egm_revision.py · pruebas para egm_revision.py (TDD rojo-verde)."""

import pytest

import egm_revision as E


RESPUESTA_REAL = """Claro, aquí tienes mi revisión.

- bloquea: La respuesta afirma que el despliegue está publicado, pero no hay ninguna evidencia ni fecha.
- **Importa:** No explica qué hacer si falla la migración.
* menor: Hay dos comas de más en la introducción.
Esto es una línea de ruido sin gravedad.
bloquea: La respuesta afirma que el despliegue está publicado, pero no hay ninguna evidencia ni fecha.
---
Sin objeciones.
"""

CON_RUIDO = """Gravedad: BLOQUEA — La app no declara permisos.
2) [importa] La página tarda en cargar.
- _menor_: Título con mayúsculas de más.
**bloquea** sin dos puntos y con texto
Importa
bloquea:
> cita de un documento que no es una objeción
"""


class TestPromptDePez:
    def test_incluye_el_artefacto_y_el_tipo(self):
        prompt = E.prompt_de_pez("La propuesta dice hola.", "plan")
        assert "La propuesta dice hola." in prompt
        assert "(plan)" in prompt

    def test_prohíbe_usar_contextoexterno(self):
        prompt = E.prompt_de_pez("Artefacto de prueba", "respuesta")
        assert "no tienes contexto" in prompt.lower()

    def test_pide_objecion_por_linea_con_las_tres_gravidades(self):
        prompt = E.prompt_de_pez("Artefacto de prueba", "olla")
        assert "bloquea:" in prompt
        assert "importa:" in prompt
        assert "menor:" in prompt
        assert "sin objeciones" in prompt

    def test_cada_tipo_tiene_su_nombre(self):
        tipos = ["respuesta", "plan", "ola", "pagina", "app"]
        for tipo in tipos:
            prompt = E.prompt_de_pez("mismo artefacto", tipo)
            assert f"({tipo})" in prompt


class TestLeerObjeciones:
    def test_lee_las_tres_gravidades_y_quita_duplicados(self):
        result = E.leer_objeciones(RESPUESTA_REAL)
        assert len(result) == 3
        assert result[0]["gravedad"] == "bloquea"
        assert "despliegue" in result[0]["texto"]
        assert result[1]["gravedad"] == "importa"
        assert result[2]["gravedad"] == "menor"

    def test_acepta_negritas_corchetes_numeracion_mayusculas(self):
        result = E.leer_objeciones(CON_RUIDO)
        gravidades = [o["gravedad"] for o in result]
        assert "bloquea" in gravidades
        assert "importa" in gravidades
        assert "menor" in gravidades
        assert result[0]["texto"] == "La app no declara permisos."

    def test_sin_gravedad_o_sin_texto_no_crea_objeciones(self):
        assert E.leer_objeciones("No hay objeciones, todo correcto.") == []
        assert E.leer_objeciones("") == []
        assert E.leer_objeciones("bloquea:   ") == []


class TestOlaPasa:
    def test_sin_objeciones_pasa(self):
        assert E.ola_pasa([]) == {"pasa": True, "bloqueantes": []}

    def test_con_importa_y_menor_pasa(self):
        objeciones = [E.leer_objeciones(CON_RUIDO)[1], E.leer_objeciones(CON_RUIDO)[2]]
        result = E.ola_pasa(objeciones)
        assert result["pasa"] is True
        assert result["bloqueantes"] == []

    def test_con_bloquea_no_pasa_y_devuelve_bloqueantes(self):
        objeciones = E.leer_objeciones(RESPUESTA_REAL)
        result = E.ola_pasa(objeciones)
        assert result["pasa"] is False
        assert len(result["bloqueantes"]) == 1
        assert result["bloqueantes"][0]["gravedad"] == "bloquea"


class TestRevisar:
    def test_llama_a_n_modelos_y_fundir_objeciones(self):
        llamadas = []

        def llamar_falso(prompt, modelo):
            llamadas.append((prompt, modelo))
            if llamadas[-1][1].endswith(":free"):
                return "bloquea: falta contexto\nsin objeciones."
            return "sin objeciones."

        result = E.revisar("test artefacto", "ola", llamar_falso, n=2)
        assert len(llamadas) == 2
        assert "pasa" in result
        assert "bloqueantes" in result
        assert "objeciones" in result

    