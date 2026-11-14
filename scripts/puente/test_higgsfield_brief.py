"""
Tests para higgsfield_brief.py - briefs desde el sistema de diseño que aprenden de cada aprobación.
"""

import json
import tempfile
from pathlib import Path
from unittest.mock import Mock, patch

import pytest

from scripts.puente.higgsfield_brief import (
    FaseMatriz,
    ProyectoHiggsfield,
    PiezaVideo,
    BriefHiggsfield,
    HiggsfieldBriefBuilder,
    BibliotecaAprendizaje,
    TokensDiseno,
    estimar_creditos,
    cargar_tokens_desde_archivo,
)


class TestTokensDiseno:
    """Tests para la carga y uso de tokens de diseño."""

    def test_tokens_tienen_paleta_trinity(self):
        tokens = TokensDiseno.por_defecto()
        assert tokens.zenith == "#007FFF"
        assert tokens.horizonte == "#10B981"
        assert tokens.logica == "#FFBF00"
        assert tokens.anchor == "#DC143C"

    def test_tokens_tienen_colores_base(self):
        tokens = TokensDiseno.por_defecto()
        assert tokens.noche == "#0A0F1D"
        assert tokens.nieve == "#F8F9FA"

    def test_tokens_tienen_tipografias(self):
        tokens = TokensDiseno.por_defecto()
        assert "Satoshi" in tokens.font_display
        assert "Rajdhani" in tokens.font_titular
        assert "Inter" in tokens.font_cuerpo
        assert "JetBrains Mono" in tokens.font_codigo

    def test_tokens_tienen_geometria_sagrada(self):
        tokens = TokensDiseno.por_defecto()
        assert tokens.aureo == 1.618
        assert tokens.radio_sm == "4px"
        assert tokens.radio_md == "12px"
        assert tokens.radio_lg == "24px"
        assert tokens.radio_xl == "42px"

    def test_cargar_tokens_desde_archivo(self, tmp_path):
        tokens_json = {
            "tokens": {
                "--ss-zenith": "#007FFF",
                "--ss-horizonte": "#10B981",
                "--ss-logica": "#FFBF00",
                "--ss-anchor": "#DC143C",
                "--ss-nieve": "#F8F9FA",
                "--ss-noche": "#0A0F1D",
                "--ss-font-display": "'Satoshi', 'Rajdhani', 'Inter', system-ui, sans-serif",
                "--ss-font-titular": "'Rajdhani', 'Inter', system-ui, sans-serif",
                "--ss-font-organica": "'Quicksand', 'Inter', system-ui, sans-serif",
                "--ss-font-cuerpo": "'Inter', system-ui, sans-serif",
                "--ss-font-codigo": "'JetBrains Mono', ui-monospace, monospace",
                "--ss-radio-sm": "4px",
                "--ss-radio-md": "12px",
                "--ss-radio-lg": "24px",
                "--ss-radio-xl": "42px",
                "--ss-aureo": "1.618",
            }
        }
        tokens_file = tmp_path / "tokens.json"
        tokens_file.write_text(json.dumps(tokens_json))

        tokens = cargar_tokens_desde_archivo(tokens_file)
        assert tokens.zenith == "#007FFF"
        assert tokens.aureo == 1.618


class TestFaseMatriz:
    """Tests para las fases de la Matriz."""

    def test_fases_existen(self):
        assert FaseMatriz.SEMILLA.value == "semilla"
        assert FaseMatriz.FRUTO_COSECHA.value == "fruto_y_cosecha"
        assert FaseMatriz.MENTE_DIGITAL.value == "mente_digital"

    def test_fase_semilla_tiene_configuracion(self):
        config = FaseMatriz.SEMILLA.configuracion()
        assert "luz" in config
        assert "camara" in config
        assert "movimiento" in config
        assert "referentes" in config
        # Semilla: punto de luz, inversión, mitosis
        assert "punto de luz" in config["referentes"].lower()
        assert "mitosis" in config["referentes"].lower()

    def test_fase_fruto_cosecha_tiene_configuracion(self):
        config = FaseMatriz.FRUTO_COSECHA.configuracion()
        assert "luz" in config
        assert "camara" in config
        assert "movimiento" in config
        assert "referentes" in config
        # Fruto y Cosecha: vesica piscis, flor de la vida, crecimiento φ
        assert "vesica" in config["referentes"].lower()
        assert "flor de la vida" in config["referentes"].lower()

    def test_fase_mente_digital_tiene_configuracion(self):
        config = FaseMatriz.MENTE_DIGITAL.configuracion()
        assert "luz" in config
        assert "camara" in config
        assert "movimiento" in config
        assert "referentes" in config
        # Mente Digital: metatrón, sólidos platónicos, red
        assert "metatrón" in config["referentes"].lower() or "metatron" in config["referentes"].lower()
        assert "platónicos" in config["referentes"].lower() or "platonicos" in config["referentes"].lower()


class TestProyectoHiggsfield:
    """Tests para proyectos de Higgsfield."""

    def test_proyectos_conocidos(self):
        proyectos = list(ProyectoHiggsfield)
        assert len(proyectos) >= 8
        ids = [p.value for p in proyectos]
        assert "sistema-diseno" in ids
        assert "recorrido-os" in ids
        assert "paz" in ids
        assert "manifiesto" in ids
        assert "fase-semilla" in ids
        assert "videos-4-5" in ids
        assert "personajes" in ids
        assert "redes" in ids

    def test_proyecto_tiene_project_id(self):
        proyecto = ProyectoHiggsfield.SISTEMA_DISENO
        assert proyecto.project_id == "b229e2b5-9ec1-4a73-9ba2-917a0968d11b"

    def test_proyecto_tiene_nombre_legible(self):
        proyecto = ProyectoHiggsfield.RECORRIDO_OS
        assert "StarSeed OS" in proyecto.nombre


class TestPiezaVideo:
    """Tests para tipos de pieza de video."""

    def test_piezas_existen(self):
        piezas = list(PiezaVideo)
        assert len(piezas) >= 5
        valores = [p.value for p in piezas]
        assert "imagen_referencia" in valores
        assert "plano_5s" in valores
        assert "plano_10s" in valores
        assert "voz" in valores
        assert "reencuadre" in valores


class TestHiggsfieldBriefBuilder:
    """Tests para el constructor de briefs."""

    def setup_method(self):
        self.builder = HiggsfieldBriefBuilder()
        self.tokens = TokensDiseno.por_defecto()

    def test_construir_brief_semilla_basico(self):
        brief = self.builder.construir_brief(
            proyecto=ProyectoHiggsfield.SISTEMA_DISENO,
            pieza=PiezaVideo.PLANO_5S,
            fase=FaseMatriz.SEMILLA,
            tokens=self.tokens,
        )

        assert isinstance(brief, BriefHiggsfield)
        assert brief.proyecto == ProyectoHiggsfield.SISTEMA_DISENO
        assert brief.pieza == PiezaVideo.PLANO_5S
        assert brief.fase == FaseMatriz.SEMILLA
        assert brief.prompt  # prompt no vacío
        assert brief.brief_tecnico  # brief técnico no vacío
        assert brief.creditos_estimados > 0
        assert brief.restricciones  # restricciones presentes

    def test_prompt_incluye_paleta_tokens(self):
        brief = self.builder.construir_brief(
            proyecto=ProyectoHiggsfield.SISTEMA_DISENO,
            pieza=PiezaVideo.PLANO_5S,
            fase=FaseMatriz.SEMILLA,
            tokens=self.tokens,
        )

        prompt = brief.prompt.lower()
        assert "#007fff" in prompt or "007fff" in prompt  # zenith
        assert "#10b981" in prompt or "10b981" in prompt  # horizonte
        assert "#ffbf00" in prompt or "ffbf00" in prompt  # logica
        assert "#dc143c" in prompt or "dc143c" in prompt  # anchor

    def test_prompt_incluye_configuracion_fase(self):
        brief = self.builder.construir_brief(
            proyecto=ProyectoHiggsfield.SISTEMA_DISENO,
            pieza=PiezaVideo.PLANO_5S,
            fase=FaseMatriz.SEMILLA,
            tokens=self.tokens,
        )

        prompt = brief.prompt.lower()
        # Configuración de luz de Semilla
        assert "punto de luz" in prompt or "point of light" in prompt
        # Configuración de cámara
        assert "cámara" in prompt or "camera" in prompt
        # Configuración de movimiento (sección MOVEMENT en inglés)
        assert "movement" in prompt

    def test_prompt_incluye_restricciones_marca(self):
        brief = self.builder.construir_brief(
            proyecto=ProyectoHiggsfield.SISTEMA_DISENO,
            pieza=PiezaVideo.PLANO_5S,
            fase=FaseMatriz.SEMILLA,
            tokens=self.tokens,
        )

        prompt = brief.prompt.lower()
        # Sin símbolo ni logotipos
        assert "símbolo" in prompt or "symbol" in prompt or "logo" in prompt
        assert "no" in prompt or "sin" in prompt or "without" in prompt
        # Posproducción
        assert "posproducción" in prompt or "postproducción" in prompt or "post-production" in prompt

    def test_brief_tecnico_tiene_estructura(self):
        brief = self.builder.construir_brief(
            proyecto=ProyectoHiggsfield.SISTEMA_DISENO,
            pieza=PiezaVideo.PLANO_5S,
            fase=FaseMatriz.SEMILLA,
            tokens=self.tokens,
        )

        tecnico = brief.brief_tecnico
        assert "paleta" in tecnico
        assert "luz" in tecnico
        assert "camara" in tecnico
        assert "movimiento" in tecnico
        assert "referentes_geometricos" in tecnico
        assert "restricciones" in tecnico
        assert "creditos_estimados" in tecnico

    def test_diferentes_fases_producen_diferentes_briefs(self):
        brief_semilla = self.builder.construir_brief(
            proyecto=ProyectoHiggsfield.SISTEMA_DISENO,
            pieza=PiezaVideo.PLANO_5S,
            fase=FaseMatriz.SEMILLA,
            tokens=self.tokens,
        )

        brief_fruto = self.builder.construir_brief(
            proyecto=ProyectoHiggsfield.SISTEMA_DISENO,
            pieza=PiezaVideo.PLANO_5S,
            fase=FaseMatriz.FRUTO_COSECHA,
            tokens=self.tokens,
        )

        brief_mente = self.builder.construir_brief(
            proyecto=ProyectoHiggsfield.SISTEMA_DISENO,
            pieza=PiezaVideo.PLANO_5S,
            fase=FaseMatriz.MENTE_DIGITAL,
            tokens=self.tokens,
        )

        # Los prompts deben ser diferentes
        assert brief_semilla.prompt != brief_fruto.prompt
        assert brief_fruto.prompt != brief_mente.prompt
        assert brief_semilla.prompt != brief_mente.prompt

    def test_diferentes_proyectos_producen_diferentes_briefs(self):
        brief_sistema = self.builder.construir_brief(
            proyecto=ProyectoHiggsfield.SISTEMA_DISENO,
            pieza=PiezaVideo.PLANO_5S,
            fase=FaseMatriz.SEMILLA,
            tokens=self.tokens,
        )

        brief_paz = self.builder.construir_brief(
            proyecto=ProyectoHiggsfield.PAZ,
            pieza=PiezaVideo.PLANO_5S,
            fase=FaseMatriz.SEMILLA,
            tokens=self.tokens,
        )

        assert brief_sistema.prompt != brief_paz.prompt
        assert brief_sistema.brief_tecnico != brief_paz.brief_tecnico

    def test_diferentes_piezas_producen_diferentes_briefs(self):
        brief_5s = self.builder.construir_brief(
            proyecto=ProyectoHiggsfield.SISTEMA_DISENO,
            pieza=PiezaVideo.PLANO_5S,
            fase=FaseMatriz.SEMILLA,
            tokens=self.tokens,
        )

        brief_10s = self.builder.construir_brief(
            proyecto=ProyectoHiggsfield.SISTEMA_DISENO,
            pieza=PiezaVideo.PLANO_10S,
            fase=FaseMatriz.SEMILLA,
            tokens=self.tokens,
        )

        assert brief_5s.prompt != brief_10s.prompt
        assert brief_5s.creditos_estimados != brief_10s.creditos_estimados


class TestEstimarCreditos:
    """Tests para estimación de créditos."""

    def test_estimar_creditos_imagen_referencia(self):
        creditos = estimar_creditos(PiezaVideo.IMAGEN_REFERENCIA)
        assert creditos > 0
        assert creditos < 50  # Imagen debe ser barata

    def test_estimar_creditos_plano_5s(self):
        creditos = estimar_creditos(PiezaVideo.PLANO_5S)
        assert creditos > 0
        assert creditos < 200

    def test_estimar_creditos_plano_10s(self):
        creditos_5s = estimar_creditos(PiezaVideo.PLANO_5S)
        creditos_10s = estimar_creditos(PiezaVideo.PLANO_10S)
        assert creditos_10s > creditos_5s  # 10s cuesta más que 5s

    def test_estimar_creditos_voz(self):
        creditos = estimar_creditos(PiezaVideo.VOZ)
        assert creditos > 0
        assert creditos < 100

    def test_estimar_creditos_reencuadre(self):
        creditos = estimar_creditos(PiezaVideo.REENCUADRE)
        assert creditos > 0
        assert creditos < 100


class TestBibliotecaAprendizaje:
    """Tests para la biblioteca de aprendizaje."""

    def setup_method(self):
        self.temp_dir = tempfile.mkdtemp()
        self.biblioteca_path = Path(self.temp_dir) / "biblioteca.json"
        self.biblioteca = BibliotecaAprendizaje(ruta_archivo=self.biblioteca_path)
        self.builder = HiggsfieldBriefBuilder()
        self.tokens = TokensDiseno.por_defecto()

    def teardown_method(self):
        import shutil
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_guardar_y_cargar_entrada(self):
        brief = self.builder.construir_brief(
            proyecto=ProyectoHiggsfield.SISTEMA_DISENO,
            pieza=PiezaVideo.PLANO_5S,
            fase=FaseMatriz.SEMILLA,
            tokens=self.tokens,
        )
        brief.id = "test-001"

        self.biblioteca.guardar_resultado(
            brief=brief,
            aprobado=True,
            nota="Buena composición, luz correcta",
            creditos_reales=48,
        )

        # Recargar biblioteca
        biblioteca2 = BibliotecaAprendizaje(ruta_archivo=self.biblioteca_path)
        entradas = biblioteca2.obtener_entradas(
            proyecto=ProyectoHiggsfield.SISTEMA_DISENO,
            fase=FaseMatriz.SEMILLA,
        )

        assert len(entradas) == 1
        entrada = entradas[0]
        assert entrada["aprobado"] is True
        assert entrada["nota"] == "Buena composición, luz correcta"
        assert entrada["creditos_reales"] == 48
        assert entrada["creditos_estimados"] == brief.creditos_estimados

    def test_priorizar_patrones_aprobados(self):
        # Guardar varios resultados usando el builder para que incluyan patrones
        for i, aprobado in enumerate([True, False, True, True, False]):
            brief = self.builder.construir_brief(
                proyecto=ProyectoHiggsfield.SISTEMA_DISENO,
                pieza=PiezaVideo.PLANO_5S,
                fase=FaseMatriz.SEMILLA,
                tokens=self.tokens,
            )
            # Sobrescribir ID para que sea predecible
            brief.id = f"test-{i:03d}"
            self.biblioteca.guardar_resultado(
                brief=brief,
                aprobado=aprobado,
                nota=f"Nota {i}",
                creditos_reales=50,
            )

        patrones = self.biblioteca.patrones_aprobados_por_proyecto_fase(
            ProyectoHiggsfield.SISTEMA_DISENO, FaseMatriz.SEMILLA
        )

        # Debe haber patrones de las 3 entradas aprobadas
        assert len(patrones) > 0
        # Cada patrón debe tener apariciones > 0
        assert all(p["apariciones"] > 0 for p in patrones)

    def test_estadisticas_proyecto_fase(self):
        for i in range(5):
            brief = self.builder.construir_brief(
                proyecto=ProyectoHiggsfield.RECORRIDO_OS,
                pieza=PiezaVideo.PLANO_10S,
                fase=FaseMatriz.FRUTO_COSECHA,
                tokens=self.tokens,
            )
            brief.id = f"stat-{i:03d}"
            self.biblioteca.guardar_resultado(
                brief=brief,
                aprobado=i % 2 == 0,
                nota=f"Nota {i}",
                creditos_reales=95 + i,
            )

        stats = self.biblioteca.estadisticas(ProyectoHiggsfield.RECORRIDO_OS, FaseMatriz.FRUTO_COSECHA)
        assert stats["total"] == 5
        assert stats["aprobados"] == 3
        assert stats["rechazados"] == 2
        assert stats["tasa_aprobacion"] == 0.6
        assert "creditos_promedio_estimados" in stats
        assert "creditos_promedio_reales" in stats


class TestIntegracionCatalogo:
    """Tests de integración con catálogo de costes (mock)."""

    def test_brief_usa_catalogo_para_estimar(self):
        tokens = TokensDiseno.por_defecto()

        with patch("scripts.puente.higgsfield_brief.obtener_coste_catalogo") as mock_catalogo:
            mock_catalogo.return_value = 75
            builder = HiggsfieldBriefBuilder()

            brief = builder.construir_brief(
                proyecto=ProyectoHiggsfield.SISTEMA_DISENO,
                pieza=PiezaVideo.PLANO_5S,
                fase=FaseMatriz.SEMILLA,
                tokens=tokens,
            )

            assert brief.creditos_estimados == 75
            assert mock_catalogo.called
            assert mock_catalogo.call_count == 1


if __name__ == "__main__":
    pytest.main([__file__, "-v"])