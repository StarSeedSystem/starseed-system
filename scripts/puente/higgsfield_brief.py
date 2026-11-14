"""
Higgsfield Brief Builder — briefs desde el sistema de diseño que aprenden de cada aprobación.

Dado un proyecto del mapa, una pieza y una fase de la Matriz (Semilla, Fruto y Cosecha, Mente Digital),
construye el prompt y el brief con:
- Paleta de los tokens
- Luz, cámara y movimiento de esa fase
- Referentes de la Matriz
- Restricciones (sin el símbolo ni logotipos; el símbolo se compone en posproducción)

El resultado es la propuesta para higgsfield_aprobado, con coste estimado por higgsfield_catalogo.
Aprendizaje: guarda en ~/.starseed/produccion/higgsfield/biblioteca.json cada prompt con su resultado
(aprobado o rechazado por Maggasukha, nota y créditos) y prioriza los patrones aprobados por proyecto y fase.
"""

from __future__ import annotations

import json
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Any


# ──────────────────────────────────────────────────────────────────────────────
# TIPOS DE DATOS BÁSICOS
# ──────────────────────────────────────────────────────────────────────────────

class FaseMatriz(str, Enum):
    """Fases de la Matriz de StarSeed."""
    SEMILLA = "semilla"
    FRUTO_COSECHA = "fruto_y_cosecha"
    MENTE_DIGITAL = "mente_digital"

    def configuracion(self) -> dict[str, Any]:
        """Configuración de luz, cámara, movimiento y referentes para cada fase."""
        configs = {
            FaseMatriz.SEMILLA: {
                "luz": "Punto de luz único desde arriba-derecha (zenital + 45°), intensidad creciente, temperatura 5600K → 6500K. Inversión de polaridad a los 2.6s.",
                "camara": "Orbital lenta alrededor del centro (radio 3m, 0.1 rad/s), zoom progresivo 1.0x → 1.3x. Enfoque en el punto de luz, profundidad de campo f/1.8.",
                "movimiento": "Emergencia orgánica: punto → mitosis (dos esferas) → órbita líquida → fusión en yin-yang áureo (crecimiento φ por cuarto de vuelta). Brotes con retraso 1/φ.",
                "referentes": "Punto de luz, inversión, mitosis, órbita, fusión yin-yang áureo, brotes φ, vesica piscis inicial, semilla de la vida.",
                "paleta_fase": "zenith_horizonte",  # Trinity: zenith + horizonte
            },
            FaseMatriz.FRUTO_COSECHA: {
                "luz": "Luz dorada cálida (3200K) desde ángulo bajo (15°), lateral, con halo volumétrico. Reflejos especulares en superficies líquidas. Pulso áureo cada 1.618s.",
                "camara": "Dolly suave hacia adelante (0.5m/s), ligero tilt-up revelando capas. Profundidad de campo variable f/2.8 → f/5.6. Composición en tercios áureos (φ).",
                "movimiento": "Crecimiento radial Fibonacci: vesica piscis → flor de la vida (7+19 círculos) → metatrón → espiral áurea guiando la mirada al centro. Expansión φ^n.",
                "referentes": "Vesica piscis, flor de la vida, semilla de la vida, metatrón, cubo de metatrón, espiral áurea, proporción φ, crecimiento radial.",
                "paleta_fase": "horizonte_logica_anchor",  # Trinity: horizonte + lógica + anchor
            },
            FaseMatriz.MENTE_DIGITAL: {
                "luz": "Iluminación técnica fría (7000K), múltiples fuentes direccionales tipo study lighting. Grid de luz cian/violeta. Aberración cromática controlada.",
                "camara": "Cámara fija isométrica (30° elevación, 45° azimut) + micro-movimientos procedurales (ruido Perlin 0.02). Orthographic projection. Sin distorsión de perspectiva.",
                "movimiento": "Geometría sagrada técnica: metatrón animado (conexiones pulsando), sólidos platónicos rotando (icosaedro, dodecaedro), árbol de la vida (10 sefirot, 22 caminos), merkaba counter-rotating. Redes de dependencias.",
                "referentes": "Metatrón, cubo de Metatrón, sólidos platónicos (icosaedro, dodecaedro, tetraedro), merkaba, árbol de la vida, equilibrio vectorial, red hexagonal, toroide.",
                "paleta_fase": "zenith_cian_astraura",  # Trinity: zenith + cian astraura
            },
        }
        return configs[self]

    @property
    def nombre_legible(self) -> str:
        nombres = {
            FaseMatriz.SEMILLA: "Semilla",
            FaseMatriz.FRUTO_COSECHA: "Fruto y Cosecha",
            FaseMatriz.MENTE_DIGITAL: "Mente Digital",
        }
        return nombres[self]


class ProyectoHiggsfield(str, Enum):
    """Proyectos oficiales de StarSeed en Higgsfield (architecture/higgsfield-aprobado-1113.md §5)."""
    SISTEMA_DISENO = "sistema-diseno"
    RECORRIDO_OS = "recorrido-os"
    PAZ = "paz"
    MANIFIESTO = "manifiesto"
    FASE_SEMILLA = "fase-semilla"
    VIDEOS_4_5 = "videos-4-5"
    PERSONAJES = "personajes"
    REDES = "redes"

    @property
    def project_id(self) -> str:
        ids = {
            ProyectoHiggsfield.SISTEMA_DISENO: "b229e2b5-9ec1-4a73-9ba2-917a0968d11b",
            ProyectoHiggsfield.RECORRIDO_OS: "bdabaeff-723a-473a-932d-1582b0a15130",
            ProyectoHiggsfield.PAZ: "c7cc3bfb-9e4a-4c2e-acdf-d96e5603bdec",
            ProyectoHiggsfield.MANIFIESTO: "c2cd4e9f-92a5-477a-a873-6a57d4e703ed",
            ProyectoHiggsfield.FASE_SEMILLA: "51a10c6a-1a19-405f-a930-41e7e3b20a25",
            ProyectoHiggsfield.VIDEOS_4_5: "ddb86707-1f80-49d2-9a0b-d3f42d17eceb",
            ProyectoHiggsfield.PERSONAJES: "7405688e-8491-4c88-be9c-cc3422cea04c",
            ProyectoHiggsfield.REDES: "ac48b50d-5877-4430-9ceb-45571dd08c8a",
        }
        return ids[self]

    @property
    def nombre(self) -> str:
        nombres = {
            ProyectoHiggsfield.SISTEMA_DISENO: "StarSeed · Sistema de diseño y marca",
            ProyectoHiggsfield.RECORRIDO_OS: "StarSeed OS · Recorrido real",
            ProyectoHiggsfield.PAZ: "Una solución para la paz",
            ProyectoHiggsfield.MANIFIESTO: "Manifiesto · La Revolución del Diseño",
            ProyectoHiggsfield.FASE_SEMILLA: "Fase Semilla · Centro social piloto",
            ProyectoHiggsfield.VIDEOS_4_5: "Vídeos 4 y 5 · Valor, IA y sobreproducción",
            ProyectoHiggsfield.PERSONAJES: "Personajes icono de StarSeed",
            ProyectoHiggsfield.REDES: "Redes · shorts, reels y carruseles",
        }
        return nombres[self]

    @property
    def descripcion_contexto(self) -> str:
        contextos = {
            ProyectoHiggsfield.SISTEMA_DISENO: "Identidad visual transversal: Trinity (zenith, horizonte, lógica, anchor), cristal líquido, geometría sagrada, 12 presets curados.",
            ProyectoHiggsfield.RECORRIDO_OS: "Demo real del OS: Nexus, Astraura, Genesis, Café, Audiomorphic, Materia Viva. Interfaz viva, avatares, mundo 3D.",
            ProyectoHiggsfield.PAZ: "Narrativa de paz: geometría sagrada como lenguaje universal, vesica piscis (humano/IA), flor de la vida (red de consciencia).",
            ProyectoHiggsfield.MANIFIESTO: "Declaración visual: tipografía Satoshi/Rajdhani, oro brunido, noche profunda, movimiento intencional, sin ruido decorativo.",
            ProyectoHiggsfield.FASE_SEMILLA: "Centro social piloto: calidez orgánica, terracota, materia viva, comunidad, crecimiento desde la semilla.",
            ProyectoHiggsfield.VIDEOS_4_5: "Crítica visual: valor vs IA, sobreproducción. Estética cyberdelica (Synthwave/Tokyo) contrastada con solarpunk.",
            ProyectoHiggsfield.PERSONAJES: "Avatares Aurora: orbes cristal líquido, paleta por rasgos (calidez→ámbar, serenidad→azul, creatividad→violeta). Kimodo: texto→movimiento.",
            ProyectoHiggsfield.REDES: "Formato vertical 9:16, hooks visuales 3s, loops perfectos, presets por mood, marca sutil en esquina.",
        }
        return contextos[self]

    @property
    def carpeta_drive(self) -> str:
        """Carpeta de Drive asociada al proyecto (para referencias)."""
        carpetas = {
            ProyectoHiggsfield.SISTEMA_DISENO: "identidad/sistema-de-diseno-claude/sistema-de-diseno/assets",
            ProyectoHiggsfield.RECORRIDO_OS: "produccion/recorrido-os",
            ProyectoHiggsfield.PAZ: "produccion/paz",
            ProyectoHiggsfield.MANIFIESTO: "produccion/manifiesto",
            ProyectoHiggsfield.FASE_SEMILLA: "produccion/fase-semilla",
            ProyectoHiggsfield.VIDEOS_4_5: "produccion/videos-4-5",
            ProyectoHiggsfield.PERSONAJES: "produccion/personajes",
            ProyectoHiggsfield.REDES: "produccion/redes",
        }
        return carpetas.get(self, "produccion/general")


class PiezaVideo(str, Enum):
    """Tipos de pieza de video típicos de StarSeed."""
    IMAGEN_REFERENCIA = "imagen_referencia"
    PLANO_5S = "plano_5s"
    PLANO_10S = "plano_10s"
    VOZ = "voz"
    REENCUADRE = "reencuadre"

    @property
    def duracion_segundos(self) -> int | None:
        duraciones = {
            PiezaVideo.IMAGEN_REFERENCIA: 0,  # Imagen estática
            PiezaVideo.PLANO_5S: 5,
            PiezaVideo.PLANO_10S: 10,
            PiezaVideo.VOZ: 0,  # Duración variable
            PiezaVideo.REENCUADRE: 0,  # Procesamiento
        }
        return duraciones[self]

    @property
    def descripcion(self) -> str:
        descripciones = {
            PiezaVideo.IMAGEN_REFERENCIA: "Imagen de referencia estática (1920x1080 o 1080x1920) para moodboard, estilo, composición",
            PiezaVideo.PLANO_5S: "Plano de vídeo de 5 segundos, loopable, para fondo, transición o elemento visual",
            PiezaVideo.PLANO_10S: "Plano de vídeo de 10 segundos, narrativa breve, intro/outro de sección",
            PiezaVideo.VOZ: "Generación de voz (TTS) con timbre StarSeed, entonación justa Mi lidio",
            PiezaVideo.REENCUADRE: "Reencuadre inteligente (crop/pan/zoom) de material existente a 9:16 o 16:9",
        }
        return descripciones[self]


@dataclass
class TokensDiseno:
    """Tokens de diseño del sistema StarSeed (memory/diseno/estudio-audiovisual/assets/tokens.json)."""
    # Paleta Trinity
    zenith: str = "#007FFF"
    horizonte: str = "#10B981"
    logica: str = "#FFBF00"
    anchor: str = "#DC143C"
    nieve: str = "#F8F9FA"
    noche: str = "#0A0F1D"
    noche_alta: str = "#141B2E"
    nieve_honda: str = "#EDF0F4"
    pizarra: str = "#46506A"
    bruma: str = "#AEB6C8"
    zenith_texto: str = "#0057B0"
    horizonte_texto: str = "#047857"
    cian_astraura: str = "#00F0FF"
    mundo_sociedad: str = "#CD77F8"
    mundo_os: str = "#25D1F4"
    mundo_cafe: str = "#F5B91A"
    mundo_estudio: str = "#F471F4"
    mundo_fundacion: str = "#34D77F"
    mundo_audiomorphic: str = "#2DD29B"
    neon_lima: str = "#39FF14"
    oro_brunido: str = "#D4AF37"
    vacio_profundo: str = "#001F3F"

    # Tipografías
    font_display: str = "'Satoshi', 'Rajdhani', 'Inter', system-ui, sans-serif"
    font_titular: str = "'Rajdhani', 'Inter', system-ui, sans-serif"
    font_organica: str = "'Quicksand', 'Inter', system-ui, sans-serif"
    font_cuerpo: str = "'Inter', system-ui, sans-serif"
    font_codigo: str = "'JetBrains Mono', ui-monospace, monospace"

    # Geometría
    radio_sm: str = "4px"
    radio_md: str = "12px"
    radio_lg: str = "24px"
    radio_xl: str = "42px"
    radio_pildora: str = "9999px"
    blur_cristal: str = "16px"
    opacidad_cristal: str = "0.6"
    ease_organic: str = "cubic-bezier(0.22, 1, 0.36, 1)"
    ease_glide: str = "cubic-bezier(0.16, 1, 0.3, 1)"
    ease_genesis: str = "cubic-bezier(0.22, 0.9, 0.3, 1)"
    dur_rapido: str = "140ms"
    dur_organico: str = "220ms"
    dur_normal: str = "240ms"
    aureo: float = 1.618

    # Fondos
    fondo_claridad: str = "radial-gradient(ellipse 100% 80% at 15% 0%, #f0ebff 0%, #fafafa 45%, #eff6ff 100%)"
    fondo_profundidad: str = "linear-gradient(135deg, #0a0118 0%, #0f0a2e 45%, #04091e 75%, #000810 100%)"
    fondo_natural: str = "radial-gradient(ellipse 80% 60% at 25% 80%, #0a2210 0%, #0d1a0e 50%, #050c06 100%)"
    fondo_cristal: str = "linear-gradient(135deg, #020618 0%, #0a1628 35%, #080420 65%, #060220 100%)"

    # Sombras y bordes
    sombra_md: str = "0 4px 6px rgba(0,0,0,0.1)"
    sombra_lg: str = "0 10px 15px rgba(0,0,0,0.1)"
    sombra_brillo: str = "0 0 32px rgba(0,127,255,0.35), 0 12px 24px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.15)"
    borde_luz: str = "inset 0 1px 0 rgba(255,255,255,0.15)"

    # Medidas
    medida_lectura: str = "65ch"
    ancho_ventana: str = "min(100% - 32px, 1186px)"
    diana_min: str = "44px"

    @classmethod
    def por_defecto(cls) -> TokensDiseno:
        """Crea una instancia con los tokens por defecto del sistema."""
        return cls()

    def paleta_para_fase(self, fase: FaseMatriz) -> list[str]:
        """Devuelve los colores clave para una fase de la Matriz."""
        paletas = {
            FaseMatriz.SEMILLA: [self.zenith, self.horizonte, self.noche, self.cian_astraura],
            FaseMatriz.FRUTO_COSECHA: [self.horizonte, self.logica, self.anchor, self.oro_brunido, self.noche],
            FaseMatriz.MENTE_DIGITAL: [self.zenith, self.cian_astraura, self.mundo_os, self.mundo_sociedad, self.vacio_profundo],
        }
        return paletas.get(fase, [self.zenith, self.horizonte, self.logica, self.anchor])

    def to_dict(self) -> dict[str, Any]:
        """Convierte a diccionario para serialización."""
        return {
            "zenith": self.zenith,
            "horizonte": self.horizonte,
            "logica": self.logica,
            "anchor": self.anchor,
            "nieve": self.nieve,
            "noche": self.noche,
            "cian_astraura": self.cian_astraura,
            "oro_brunido": self.oro_brunido,
            "vacio_profundo": self.vacio_profundo,
            "font_display": self.font_display,
            "font_titular": self.font_titular,
            "font_organica": self.font_organica,
            "font_cuerpo": self.font_cuerpo,
            "font_codigo": self.font_codigo,
            "aureo": self.aureo,
            "radio_sm": self.radio_sm,
            "radio_md": self.radio_md,
            "radio_lg": self.radio_lg,
            "radio_xl": self.radio_xl,
            "blur_cristal": self.blur_cristal,
            "opacidad_cristal": self.opacidad_cristal,
        }


@dataclass
class BriefHiggsfield:
    """Brief completo para una generación de Higgsfield."""
    id: str
    proyecto: ProyectoHiggsfield
    pieza: PiezaVideo
    fase: FaseMatriz
    prompt: str
    brief_tecnico: dict[str, Any]
    creditos_estimados: int
    restricciones: list[str]
    timestamp: str = field(default_factory=lambda: datetime.now().isoformat())
    tokens_usados: dict[str, Any] = field(default_factory=dict)
    patrones_aplicados: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "proyecto": self.proyecto.value,
            "pieza": self.pieza.value,
            "fase": self.fase.value,
            "prompt": self.prompt,
            "brief_tecnico": self.brief_tecnico,
            "creditos_estimados": self.creditos_estimados,
            "restricciones": self.restricciones,
            "timestamp": self.timestamp,
            "tokens_usados": self.tokens_usados,
            "patrones_aplicados": self.patrones_aplicados,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> BriefHiggsfield:
        return cls(
            id=data["id"],
            proyecto=ProyectoHiggsfield(data["proyecto"]),
            pieza=PiezaVideo(data["pieza"]),
            fase=FaseMatriz(data["fase"]),
            prompt=data["prompt"],
            brief_tecnico=data["brief_tecnico"],
            creditos_estimados=data["creditos_estimados"],
            restricciones=data["restricciones"],
            timestamp=data.get("timestamp", datetime.now().isoformat()),
            tokens_usados=data.get("tokens_usados", {}),
            patrones_aplicados=data.get("patrones_aplicados", []),
        )


# ──────────────────────────────────────────────────────────────────────────────
# FUNCIONES DE UTILIDAD
# ──────────────────────────────────────────────────────────────────────────────

def cargar_tokens_desde_archivo(ruta: Path) -> TokensDiseno:
    """Carga tokens desde un archivo JSON (formato tokens.json del sistema de diseño)."""
    with open(ruta, "r", encoding="utf-8") as f:
        data = json.load(f)

    tokens_data = data.get("tokens", {})

    def get_token(key: str, default: str) -> str:
        return tokens_data.get(key, default)

    return TokensDiseno(
        zenith=get_token("--ss-zenith", "#007FFF"),
        horizonte=get_token("--ss-horizonte", "#10B981"),
        logica=get_token("--ss-logica", "#FFBF00"),
        anchor=get_token("--ss-anchor", "#DC143C"),
        nieve=get_token("--ss-nieve", "#F8F9FA"),
        noche=get_token("--ss-noche", "#0A0F1D"),
        noche_alta=get_token("--ss-noche-alta", "#141B2E"),
        nieve_honda=get_token("--ss-nieve-honda", "#EDF0F4"),
        pizarra=get_token("--ss-pizarra", "#46506A"),
        bruma=get_token("--ss-bruma", "#AEB6C8"),
        zenith_texto=get_token("--ss-zenith-texto", "#0057B0"),
        horizonte_texto=get_token("--ss-horizonte-texto", "#047857"),
        cian_astraura=get_token("--ss-cian-astraura", "#00F0FF"),
        mundo_sociedad=get_token("--ss-mundo-sociedad", "#CD77F8"),
        mundo_os=get_token("--ss-mundo-os", "#25D1F4"),
        mundo_cafe=get_token("--ss-mundo-cafe", "#F5B91A"),
        mundo_estudio=get_token("--ss-mundo-estudio", "#F471F4"),
        mundo_fundacion=get_token("--ss-mundo-fundacion", "#34D77F"),
        mundo_audiomorphic=get_token("--ss-mundo-audiomorphic", "#2DD29B"),
        neon_lima=get_token("--ss-neon-lima", "#39FF14"),
        oro_brunido=get_token("--ss-oro-brunido", "#D4AF37"),
        vacio_profundo=get_token("--ss-vacio-profundo", "#001F3F"),
        font_display=get_token("--ss-font-display", "'Satoshi', 'Rajdhani', 'Inter', system-ui, sans-serif"),
        font_titular=get_token("--ss-font-titular", "'Rajdhani', 'Inter', system-ui, sans-serif"),
        font_organica=get_token("--ss-font-organica", "'Quicksand', 'Inter', system-ui, sans-serif"),
        font_cuerpo=get_token("--ss-font-cuerpo", "'Inter', system-ui, sans-serif"),
        font_codigo=get_token("--ss-font-codigo", "'JetBrains Mono', ui-monospace, monospace"),
        radio_sm=get_token("--ss-radio-sm", "4px"),
        radio_md=get_token("--ss-radio-md", "12px"),
        radio_lg=get_token("--ss-radio-lg", "24px"),
        radio_xl=get_token("--ss-radio-xl", "42px"),
        blur_cristal=get_token("--ss-blur-cristal", "16px"),
        opacidad_cristal=get_token("--ss-opacidad-cristal", "0.6"),
        ease_organic=get_token("--ss-ease-organic", "cubic-bezier(0.22, 1, 0.36, 1)"),
        ease_glide=get_token("--ss-ease-glide", "cubic-bezier(0.16, 1, 0.3, 1)"),
        ease_genesis=get_token("--ss-ease-genesis", "cubic-bezier(0.22, 0.9, 0.3, 1)"),
        dur_rapido=get_token("--ss-dur-rapido", "140ms"),
        dur_organico=get_token("--ss-dur-organico", "220ms"),
        dur_normal=get_token("--ss-dur-normal", "240ms"),
        aureo=float(get_token("--ss-aureo", "1.618")),
        sombra_md=get_token("--ss-sombra-md", "0 4px 6px rgba(0,0,0,0.1)"),
        sombra_lg=get_token("--ss-sombra-lg", "0 10px 15px rgba(0,0,0,0.1)"),
        sombra_brillo=get_token("--ss-sombra-brillo", "0 0 32px rgba(0,127,255,0.35), 0 12px 24px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.15)"),
        borde_luz=get_token("--ss-borde-luz", "inset 0 1px 0 rgba(255,255,255,0.15)"),
        fondo_claridad=get_token("--ss-fondo-claridad", "radial-gradient(ellipse 100% 80% at 15% 0%, #f0ebff 0%, #fafafa 45%, #eff6ff 100%)"),
        fondo_profundidad=get_token("--ss-fondo-profundidad", "linear-gradient(135deg, #0a0118 0%, #0f0a2e 45%, #04091e 75%, #000810 100%)"),
        fondo_natural=get_token("--ss-fondo-natural", "radial-gradient(ellipse 80% 60% at 25% 80%, #0a2210 0%, #0d1a0e 50%, #050c06 100%)"),
        fondo_cristal=get_token("--ss-fondo-cristal", "linear-gradient(135deg, #020618 0%, #0a1628 35%, #080420 65%, #060220 100%)"),
        medida_lectura=get_token("--ss-medida-lectura", "65ch"),
        ancho_ventana=get_token("--ss-ancho-ventana", "min(100% - 32px, 1186px)"),
        diana_min=get_token("--ss-diana-min", "44px"),
    )


def estimar_creditos(pieza: PiezaVideo) -> int:
    """
    Estima créditos Higgsfield para una pieza típica.
    Basado en catálogo público de Higgsfield (modelos de vídeo ~10-50 créditos/segundo).
    """
    base_por_segundo = {
        PiezaVideo.IMAGEN_REFERENCIA: 15,  # Imagen: ~15 créditos
        PiezaVideo.PLANO_5S: 25,  # Vídeo 5s: ~25 créditos/seg
        PiezaVideo.PLANO_10S: 25,  # Vídeo 10s: ~25 créditos/seg
        PiezaVideo.VOZ: 5,  # TTS: ~5 créditos/min
        PiezaVideo.REENCUADRE: 8,  # Procesamiento: ~8 créditos
    }

    base = base_por_segundo.get(pieza, 20)

    if pieza in (PiezaVideo.PLANO_5S, PiezaVideo.PLANO_10S):
        duracion = pieza.duracion_segundos or 5
        return base * duracion

    return base


def obtener_coste_catalogo(pieza: PiezaVideo, modelo: str | None = None) -> int:
    """
    Obtiene coste real del catálogo vivo (higgsfield_catalogo.py).
    Esta función será inyectada/overrideada en producción.
    """
    # Fallback a estimación local
    return estimar_creditos(pieza)


# ──────────────────────────────────────────────────────────────────────────────
# CONSTRUCTOR DE BRIEFS
# ──────────────────────────────────────────────────────────────────────────────

class HiggsfieldBriefBuilder:
    """
    Constructor de briefs para Higgsfield desde el sistema de diseño StarSeed.

    Dado un proyecto, pieza y fase de la Matriz, genera:
    - Prompt optimizado para Higgsfield (inglés, técnico)
    - Brief técnico estructurado (luz, cámara, movimiento, referentes, paleta, restricciones)
    - Estimación de créditos via catálogo
    """

    # Restricciones de marca universales (architecture/higgsfield-aprobado-1113.md §3.5)
    RESTRICCIONES_MARCA = [
        "NO generar el símbolo oficial de StarSeed (taijitu áureo / vesica piscis / flor de la vida central). El símbolo se compone EN POSPRODUCCIÓN.",
        "NO incluir logotipos, wordmarks, ni el nombre 'StarSeed' en la generación. Solo lenguaje visual puro.",
        "Usar EXCLUSIVAMENTE la paleta de tokens proporcionada. No inventar colores hexadecimales.",
        "Mantener la geometría sagrada como estructura subyacente (φ, Fibonacci, vesica piscis, flor de la vida, metatrón, sólidos platónicos, espiral áurea).",
        "Cristal líquido / liquid glass como material principal: translúcida, refracción, blur 16px, opacidad 0.6.",
        "Composición centrada: foco óptico en el centro, elementos orbitando o emanando desde el centro.",
        "Luz principal desde arriba-derecha (zenital + 45°), salvo que la fase indique lo contrario.",
        "Respetar prefers-reduced-motion: ofrecer versión estática o micro-movimiento CSS only.",
        "Aspect ratio según pieza: 16:9 (planos), 9:16 (redes), 1:1 (avatares/iconos), φ:1 (hero).",
        "Calidad cinematográfica: 30fps, H.264, color grading Mi lidio (entonaición justa) si hay audio.",
    ]

    def __init__(self, proveedor_coste: callable | None = None):
        """
        Inicializa el builder.

        Args:
            proveedor_coste: Función (pieza: PiezaVideo) -> int para obtener coste real del catálogo.
                           Si None, usa estimar_creditos local.
        """
        self._proveedor_coste = proveedor_coste or obtener_coste_catalogo

    def construir_brief(
        self,
        proyecto: ProyectoHiggsfield,
        pieza: PiezaVideo,
        fase: FaseMatriz,
        tokens: TokensDiseno | None = None,
        contexto_extra: str | None = None,
    ) -> BriefHiggsfield:
        """
        Construye un brief completo para Higgsfield.

        Args:
            proyecto: Proyecto oficial de StarSeed en Higgsfield
            pieza: Tipo de pieza de vídeo a generar
            fase: Fase de la Matriz (Semilla, Fruto y Cosecha, Mente Digital)
            tokens: Tokens de diseño (usa por_defecto() si None)
            contexto_extra: Contexto adicional específico para esta generación

        Returns:
            BriefHiggsfield con prompt, brief técnico, créditos estimados y restricciones
        """
        tokens = tokens or TokensDiseno.por_defecto()
        config_fase = fase.configuracion()
        paleta_fase = tokens.paleta_para_fase(fase)

        # Estimar créditos (una sola llamada)
        creditos = self._proveedor_coste(pieza)

        # Construir prompt en inglés para Higgsfield
        prompt = self._construir_prompt(proyecto, pieza, fase, tokens, config_fase, paleta_fase, contexto_extra)

        # Construir brief técnico estructurado
        brief_tecnico = self._construir_brief_tecnico(proyecto, pieza, fase, tokens, config_fase, paleta_fase, creditos)

        # Restricciones combinadas
        restricciones = self.RESTRICCIONES_MARCA + self._restricciones_proyecto(proyecto) + self._restricciones_pieza(pieza)

        # Patrones aplicados (para aprendizaje)
        patrones = self._identificar_patrones(fase, pieza, proyecto)

        brief_id = f"{proyecto.value}-{pieza.value}-{fase.value}-{uuid.uuid4().hex[:8]}"

        return BriefHiggsfield(
            id=brief_id,
            proyecto=proyecto,
            pieza=pieza,
            fase=fase,
            prompt=prompt,
            brief_tecnico=brief_tecnico,
            creditos_estimados=creditos,
            restricciones=restricciones,
            tokens_usados=tokens.to_dict(),
            patrones_aplicados=patrones,
        )

    def _construir_prompt(
        self,
        proyecto: ProyectoHiggsfield,
        pieza: PiezaVideo,
        fase: FaseMatriz,
        tokens: TokensDiseno,
        config_fase: dict[str, Any],
        paleta_fase: list[str],
        contexto_extra: str | None,
    ) -> str:
        """Construye el prompt en inglés optimizado para Higgsfield."""

        # Paleta formateada
        paleta_str = ", ".join(paleta_fase)

        # Configuración de pieza
        pieza_specs = {
            PiezaVideo.IMAGEN_REFERENCIA: "Static reference image, 1920x1080, cinematic composition, centered focal point",
            PiezaVideo.PLANO_5S: "5-second looping video clip, 30fps, 1920x1080, seamless loop, cinematic quality",
            PiezaVideo.PLANO_10S: "10-second narrative video clip, 30fps, 1920x1080, cinematic storytelling, smooth transitions",
            PiezaVideo.VOZ: "Voice generation not applicable for video model - use TTS separately",
            PiezaVideo.REENCUADRE: "Smart reframe/crop of existing footage to 9:16 or 16:9, preserve focal center",
        }

        # Aspect ratio
        aspect_ratios = {
            PiezaVideo.IMAGEN_REFERENCIA: "16:9",
            PiezaVideo.PLANO_5S: "16:9",
            PiezaVideo.PLANO_10S: "16:9",
            PiezaVideo.VOZ: "N/A",
            PiezaVideo.REENCUADRE: "9:16 or 16:9",
        }

        partes = [
            f"StarSeed OS — {proyecto.nombre} — {fase.nombre_legible} phase",
            f"Piece: {pieza.descripcion}",
            f"Aspect ratio: {aspect_ratios[pieza]}",
            f"Duration: {pieza.duracion_segundos}s" if pieza.duracion_segundos else "Duration: N/A (static/image)",
            "",
            "=== COLOR PALETTE (MANDATORY - only these colors) ===",
            f"Primary palette: {paleta_str}",
            f"Trinity system: Zenith {tokens.zenith}, Horizonte {tokens.horizonte}, Logica {tokens.logica}, Anchor {tokens.anchor}",
            f"Background base: Noche {tokens.noche} / Nieve {tokens.nieve}",
            f"Accent: Cian Astraura {tokens.cian_astraura}, Oro Brunido {tokens.oro_brunido}",
            "",
            "=== LIGHTING ===",
            config_fase["luz"],
            "",
            "=== CAMERA ===",
            config_fase["camara"],
            "",
            "=== MOVEMENT ===",
            config_fase["movimiento"],
            "",
            "=== SACRED GEOMETRY REFERENTS ===",
            config_fase["referentes"],
            "",
            "=== MATERIAL & AESTHETIC ===",
            "Liquid crystal glass: translucent, refractive, backdrop-blur 16px, opacity 0.6",
            "Organic fluidity with golden ratio (φ=1.618) proportions",
            f"Typography reference: {tokens.font_display} (display), {tokens.font_titular} (headlines)",
            "Micro-interactions: ease-organic (cubic-bezier 0.22, 1, 0.36, 1), 220ms",
            "",
            "=== BRAND CONSTRAINTS (CRITICAL) ===",
            "DO NOT generate the official StarSeed symbol (golden taijitu / vesica piscis / central flower of life). Symbol is composed in POST-PRODUCTION.",
            "DO NOT include logos, wordmarks, or 'StarSeed' text. Pure visual language only.",
            "Use ONLY the provided color palette. No arbitrary hex colors.",
            "Centered composition: optical center is sacred, elements orbit/emanate from center.",
            "Key light from top-right (zenith +45°) unless phase specifies otherwise.",
            "Cinematic quality: 30fps, H.264, color grading in Mi Lydian just intonation if audio.",
        ]

        if contexto_extra:
            partes.extend(["", "=== ADDITIONAL CONTEXT ===", contexto_extra])

        return "\n".join(partes)

    def _construir_brief_tecnico(
        self,
        proyecto: ProyectoHiggsfield,
        pieza: PiezaVideo,
        fase: FaseMatriz,
        tokens: TokensDiseno,
        config_fase: dict[str, Any],
        paleta_fase: list[str],
        creditos_estimados: int,
    ) -> dict[str, Any]:
        """Construye el brief técnico estructurado."""
        return {
            "proyecto": {
                "clave": proyecto.value,
                "nombre": proyecto.nombre,
                "project_id": proyecto.project_id,
                "contexto": proyecto.descripcion_contexto,
                "carpeta_drive": proyecto.carpeta_drive,
            },
            "pieza": {
                "tipo": pieza.value,
                "descripcion": pieza.descripcion,
                "duracion_segundos": pieza.duracion_segundos,
                "aspect_ratio": "16:9" if pieza != PiezaVideo.REENCUADRE else "9:16/16:9",
            },
            "fase": {
                "clave": fase.value,
                "nombre": fase.nombre_legible,
                "paleta_fase": config_fase["paleta_fase"],
            },
            "paleta": {
                "colores_principales": paleta_fase,
                "trinity": {
                    "zenith": tokens.zenith,
                    "horizonte": tokens.horizonte,
                    "logica": tokens.logica,
                    "anchor": tokens.anchor,
                },
                "accent": {
                    "cian_astraura": tokens.cian_astraura,
                    "oro_brunido": tokens.oro_brunido,
                },
                "fondos": {
                    "noche": tokens.noche,
                    "nieve": tokens.nieve,
                    "profundidad": tokens.fondo_profundidad,
                    "cristal": tokens.fondo_cristal,
                    "natural": tokens.fondo_natural,
                    "claridad": tokens.fondo_claridad,
                },
            },
            "luz": config_fase["luz"],
            "camara": config_fase["camara"],
            "movimiento": config_fase["movimiento"],
            "referentes_geometricos": config_fase["referentes"],
            "material_estetica": {
                "material_principal": "Liquid crystal glass",
                "propiedades": "Translucent, refractive, backdrop-blur 16px, opacity 0.6",
                "proporcion_aurea": tokens.aureo,
                "escalas_fibonacci": [1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144],
                "tipografia": {
                    "display": tokens.font_display,
                    "titular": tokens.font_titular,
                    "organica": tokens.font_organica,
                    "cuerpo": tokens.font_cuerpo,
                    "codigo": tokens.font_codigo,
                },
                "motion": {
                    "ease_organic": tokens.ease_organic,
                    "ease_glide": tokens.ease_glide,
                    "ease_genesis": tokens.ease_genesis,
                    "duracion_rapida": tokens.dur_rapido,
                    "duracion_organica": tokens.dur_organico,
                    "duracion_normal": tokens.dur_normal,
                },
            },
            "restricciones": self.RESTRICCIONES_MARCA + self._restricciones_proyecto(proyecto) + self._restricciones_pieza(pieza),
            "creditos_estimados": creditos_estimados,
            "metadatos": {
                "generado_en": datetime.now().isoformat(),
                "version_builder": "1.0",
                "tokens_version": "2026-11-13",
            },
        }

    def _restricciones_proyecto(self, proyecto: ProyectoHiggsfield) -> list[str]:
        """Restricciones específicas por proyecto."""
        restricciones = {
            ProyectoHiggsfield.SISTEMA_DISENO: [
                "Mostrar los 12 presets curados como variaciones de una misma estructura",
                "Trinity (4 colores) debe ser legible en cada frame",
            ],
            ProyectoHiggsfield.RECORRIDO_OS: [
                "Mostrar interfaz real del OS: paneles cardinales, dock, avatares, mundo 3D",
                "Transiciones entre identidades (Nexus→Astraura→Genesis→Café→Audiomorphic→Materia Viva)",
            ],
            ProyectoHiggsfield.PAZ: [
                "Vesica piscis como metáfora visual central (humano/IA, local/nube)",
                "Flor de la vida creciendo desde centro → red de consciencia",
                "Tono esperanzador, no naïf: oro brunido + verde horizonte sobre noche",
            ],
            ProyectoHiggsfield.MANIFIESTO: [
                "Tipografía Satoshi/Rajdhani como protagonista visual",
                "Oro brunido (#D4AF37) como único acento sobre noche profunda",
                "Movimiento intencional: cada frame tiene propósito, cero ruido decorativo",
            ],
            ProyectoHiggsfield.FASE_SEMILLA: [
                "Paleta terracota/pergamino (Café tokens) + materia viva verde",
                "Crecimiento orgánico radial desde semilla central",
                "Calidez comunitaria: texturas de papel, cerámica, madera",
            ],
            ProyectoHiggsfield.VIDEOS_4_5: [
                "Contraste cyberdelico (Synthwave/Tokyo) vs solarpunk optimista",
                "Crítica visual: sobreproducción IA = ruido, valor humano = señal",
                "Glitch controlado como recurso narrativo, no estético",
            ],
            ProyectoHiggsfield.PERSONAJES: [
                "Orbes cristal líquido (proceduralAvatarSvg estética)",
                "Paleta por rasgos: calidez→ámbar, serenidad→azul, creatividad→violeta, análisis→cian",
                "Kimodo movement: gesto orgánico 30 joints SOMA, mismo carácter en 4 niveles",
            ],
            ProyectoHiggsfield.REDES: [
                "Formato 9:16 vertical, hook visual <3s, loop perfecto",
                "Marca sutil en esquina (solo órbita/cristal, sin wordmark)",
                "Presets por mood: cyberdelico, solarpunk, minimal, brutalist, futurista, organico, luxury",
            ],
        }
        return restricciones.get(proyecto, [])

    def _restricciones_pieza(self, pieza: PiezaVideo) -> list[str]:
        """Restricciones específicas por tipo de pieza."""
        restricciones = {
            PiezaVideo.IMAGEN_REFERENCIA: [
                "Alta resolución (mín 1920x1080), composición rule-of-thirds-φ",
                "Negativo space para overlays de texto posterior",
            ],
            PiezaVideo.PLANO_5S: [
                "Loop perfecto: frame 1 == frame 150 (30fps × 5s)",
                "Sin saltos de luz/color en el punto de loop",
            ],
            PiezaVideo.PLANO_10S: [
                "Arco narrativo claro: inicio → desarrollo → clímax → resolución",
                "Transiciones suaves entre beats áureos (0, 0.55, 1.44, 2.88s)",
            ],
            PiezaVideo.VOZ: [
                "No aplica a modelo de vídeo - usar TTS separado con entonación Mi lidio",
            ],
            PiezaVideo.REENCUADRE: [
                "Preservar centro óptico (foco sagrado) en todo recorte",
                "Pan/zoom suave con ease-organic, sin saltos bruscos",
            ],
        }
        return restricciones.get(pieza, [])

    def _identificar_patrones(self, fase: FaseMatriz, pieza: PiezaVideo, proyecto: ProyectoHiggsfield) -> list[str]:
        """Identifica patrones aplicados para el sistema de aprendizaje."""
        patrones = [
            f"fase:{fase.value}",
            f"pieza:{pieza.value}",
            f"proyecto:{proyecto.value}",
        ]

        # Patrones geométricos por fase
        if fase == FaseMatriz.SEMILLA:
            patrones.extend(["geometria:punto_luz", "geometria:mitosis", "geometria:yin_yang_aureo", "crecimiento:phi"])
        elif fase == FaseMatriz.FRUTO_COSECHA:
            patrones.extend(["geometria:vesica_piscis", "geometria:flor_vida", "geometria:metatron", "crecimiento:fibonacci"])
        elif fase == FaseMatriz.MENTE_DIGITAL:
            patrones.extend(["geometria:metatron", "geometria:solidos_platonicos", "geometria:arbol_vida", "geometria:merkaba", "red:hexagonal"])

        # Patrones de material
        patrones.extend(["material:cristal_liquido", "blur:16px", "opacity:0.6", "composicion:centrada"])

        return patrones


# ──────────────────────────────────────────────────────────────────────────────
# BIBLIOTECA DE APRENDIZAJE
# ──────────────────────────────────────────────────────────────────────────────

@dataclass
class EntradaBiblioteca:
    """Una entrada en la biblioteca de aprendizaje."""
    brief_id: str
    timestamp: str
    proyecto: str
    pieza: str
    fase: str
    prompt: str
    brief_tecnico: dict[str, Any]
    creditos_estimados: int
    aprobado: bool
    nota: str
    creditos_reales: int | None = None
    patrones_aplicados: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "brief_id": self.brief_id,
            "timestamp": self.timestamp,
            "proyecto": self.proyecto,
            "pieza": self.pieza,
            "fase": self.fase,
            "prompt": self.prompt,
            "brief_tecnico": self.brief_tecnico,
            "creditos_estimados": self.creditos_estimados,
            "aprobado": self.aprobado,
            "nota": self.nota,
            "creditos_reales": self.creditos_reales,
            "patrones_aplicados": self.patrones_aplicados,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> EntradaBiblioteca:
        return cls(
            brief_id=data["brief_id"],
            timestamp=data["timestamp"],
            proyecto=data["proyecto"],
            pieza=data["pieza"],
            fase=data["fase"],
            prompt=data["prompt"],
            brief_tecnico=data["brief_tecnico"],
            creditos_estimados=data["creditos_estimados"],
            aprobado=data["aprobado"],
            nota=data["nota"],
            creditos_reales=data.get("creditos_reales"),
            patrones_aplicados=data.get("patrones_aplicados", []),
        )


class BibliotecaAprendizaje:
    """
    Biblioteca de aprendizaje para briefs de Higgsfield.

    Guarda en ~/.starseed/produccion/higgsfield/biblioteca.json cada prompt con su resultado
    (aprobado o rechazado por Maggasukha, nota y créditos) y prioriza los patrones aprobados
    por proyecto y fase.
    """

    def __init__(self, ruta_archivo: Path | None = None):
        """
        Inicializa la biblioteca.

        Args:
            ruta_archivo: Ruta al archivo JSON. Por defecto: ~/.starseed/produccion/higgsfield/biblioteca.json
        """
        if ruta_archivo is None:
            home = Path.home()
            self.ruta_archivo = home / ".starseed" / "produccion" / "higgsfield" / "biblioteca.json"
        else:
            self.ruta_archivo = ruta_archivo

        self.ruta_archivo.parent.mkdir(parents=True, exist_ok=True)
        self._entradas: list[EntradaBiblioteca] = []
        self._cargar()

    def _cargar(self) -> None:
        """Carga la biblioteca desde disco."""
        if self.ruta_archivo.exists():
            try:
                with open(self.ruta_archivo, "r", encoding="utf-8") as f:
                    data = json.load(f)
                self._entradas = [EntradaBiblioteca.from_dict(e) for e in data]
            except (json.JSONDecodeError, KeyError):
                self._entradas = []
        else:
            self._entradas = []

    def _guardar(self) -> None:
        """Guarda la biblioteca en disco."""
        data = [e.to_dict() for e in self._entradas]
        with open(self.ruta_archivo, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

    def guardar_resultado(
        self,
        brief: BriefHiggsfield,
        aprobado: bool,
        nota: str,
        creditos_reales: int | None = None,
    ) -> EntradaBiblioteca:
        """
        Guarda el resultado de una generación (aprobada/rechazada por Maggasukha).

        Args:
            brief: El brief que se generó
            aprobado: True si Maggasukha aprobó, False si rechazó
            nota: Nota de Maggasukha (feedback cualitativo)
            creditos_reales: Créditos realmente consumidos (si se ejecutó)

        Returns:
            La entrada creada
        """
        entrada = EntradaBiblioteca(
            brief_id=brief.id,
            timestamp=datetime.now().isoformat(),
            proyecto=brief.proyecto.value,
            pieza=brief.pieza.value,
            fase=brief.fase.value,
            prompt=brief.prompt,
            brief_tecnico=brief.brief_tecnico,
            creditos_estimados=brief.creditos_estimados,
            aprobado=aprobado,
            nota=nota,
            creditos_reales=creditos_reales,
            patrones_aplicados=brief.patrones_aplicados,
        )

        self._entradas.append(entrada)
        self._guardar()
        return entrada

    def obtener_entradas(
        self,
        proyecto: ProyectoHiggsfield | None = None,
        fase: FaseMatriz | None = None,
        pieza: PiezaVideo | None = None,
        solo_aprobados: bool = False,
    ) -> list[dict[str, Any]]:
        """
        Obtiene entradas filtradas.

        Args:
            proyecto: Filtrar por proyecto
            fase: Filtrar por fase
            pieza: Filtrar por tipo de pieza
            solo_aprobados: Solo entradas aprobadas

        Returns:
            Lista de entradas como diccionarios
        """
        entradas = self._entradas

        if proyecto:
            entradas = [e for e in entradas if e.proyecto == proyecto.value]
        if fase:
            entradas = [e for e in entradas if e.fase == fase.value]
        if pieza:
            entradas = [e for e in entradas if e.pieza == pieza.value]
        if solo_aprobados:
            entradas = [e for e in entradas if e.aprobado]

        # Más recientes primero
        entradas = sorted(entradas, key=lambda e: e.timestamp, reverse=True)

        return [e.to_dict() for e in entradas]

    def patrones_aprobados_por_proyecto_fase(
        self,
        proyecto: ProyectoHiggsfield,
        fase: FaseMatriz,
        min_apariciones: int = 1,
    ) -> list[dict[str, Any]]:
        """
        Obtiene patrones que aparecen en entradas aprobadas para un proyecto+fase,
        ordenados por frecuencia y éxito.

        Args:
            proyecto: Proyecto a analizar
            fase: Fase a analizar
            min_apariciones: Mínimo de apariciones para incluir el patrón

        Returns:
            Lista de patrones con estadísticas
        """
        entradas = [
            e for e in self._entradas
            if e.proyecto == proyecto.value and e.fase == fase.value and e.aprobado
        ]

        # Contar patrones
        contador: dict[str, dict[str, Any]] = {}
        for entrada in entradas:
            for patron in entrada.patrones_aplicados:
                if patron not in contador:
                    contador[patron] = {"patron": patron, "apariciones": 0, "creditos_promedio": 0, "total_creditos": 0}
                contador[patron]["apariciones"] += 1
                if entrada.creditos_reales is not None:
                    contador[patron]["total_creditos"] += entrada.creditos_reales

        # Calcular promedios y filtrar
        resultados = []
        for patron, stats in contador.items():
            if stats["apariciones"] >= min_apariciones:
                if stats["total_creditos"] > 0:
                    stats["creditos_promedio"] = stats["total_creditos"] / stats["apariciones"]
                resultados.append(stats)

        # Ordenar: más apariciones primero, luego menor coste promedio
        resultados.sort(key=lambda x: (-x["apariciones"], x["creditos_promedio"] or 999999))

        return resultados

    def estadisticas(
        self,
        proyecto: ProyectoHiggsfield | None = None,
        fase: FaseMatriz | None = None,
    ) -> dict[str, Any]:
        """
        Calcula estadísticas de la biblioteca.

        Args:
            proyecto: Filtrar por proyecto (opcional)
            fase: Filtrar por fase (opcional)

        Returns:
            Diccionario con estadísticas
        """
        entradas = self._entradas

        if proyecto:
            entradas = [e for e in entradas if e.proyecto == proyecto.value]
        if fase:
            entradas = [e for e in entradas if e.fase == fase.value]

        if not entradas:
            return {
                "total": 0,
                "aprobados": 0,
                "rechazados": 0,
                "tasa_aprobacion": 0.0,
                "creditos_promedio_estimados": 0,
                "creditos_promedio_reales": 0,
                "precision_estimacion": 0.0,
            }

        aprobados = [e for e in entradas if e.aprobado]
        rechazados = [e for e in entradas if not e.aprobado]

        creditos_est = [e.creditos_estimados for e in entradas]
        creditos_reales = [e.creditos_reales for e in entradas if e.creditos_reales is not None]

        precision = 0.0
        if creditos_reales and len(creditos_reales) == len(creditos_est):
            # MAPE (Mean Absolute Percentage Error)
            errores = [abs(e - r) / r for e, r in zip(creditos_est, creditos_reales) if r > 0]
            if errores:
                precision = 1.0 - (sum(errores) / len(errores))

        return {
            "total": len(entradas),
            "aprobados": len(aprobados),
            "rechazados": len(rechazados),
            "tasa_aprobacion": len(aprobados) / len(entradas) if entradas else 0.0,
            "creditos_promedio_estimados": sum(creditos_est) / len(creditos_est) if creditos_est else 0,
            "creditos_promedio_reales": sum(creditos_reales) / len(creditos_reales) if creditos_reales else 0,
            "precision_estimacion": round(precision, 3),
        }

    def sugerir_mejores_patrones(
        self,
        proyecto: ProyectoHiggsfield,
        fase: FaseMatriz,
        pieza: PiezaVideo,
        top_k: int = 5,
    ) -> list[str]:
        """
        Sugiere los mejores patrones para una nueva generación basándose en el historial.

        Args:
            proyecto: Proyecto objetivo
            fase: Fase objetivo
            pieza: Tipo de pieza
            top_k: Número de patrones a devolver

        Returns:
            Lista de patrones recomendados
        """
        patrones = self.patrones_aprobados_por_proyecto_fase(proyecto, fase)

        # Filtrar por pieza si hay suficientes datos
        entradas_pieza = [
            e for e in self._entradas
            if e.proyecto == proyecto.value and e.fase == fase.value and e.pieza == pieza.value and e.aprobado
        ]

        if len(entradas_pieza) >= 3:
            # Contar patrones solo en esta pieza
            contador_pieza: dict[str, int] = {}
            for e in entradas_pieza:
                for p in e.patrones_aplicados:
                    contador_pieza[p] = contador_pieza.get(p, 0) + 1
            patrones_pieza = sorted(contador_pieza.items(), key=lambda x: -x[1])
            return [p for p, _ in patrones_pieza[:top_k]]

        # Fallback: patrones generales de la fase
        return [p["patron"] for p in patrones[:top_k]]