#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Módulo de alcance: registra, investiga y prepara contactos (pendientes de aprobación)."""
import hashlib
import json
import os
import re
import time
from pathlib import Path
from typing import Any

from peticiones_notebooklm import nb as nb_cliente

RAIZ_REPO = Path(__file__).parent.parent.parent
ALCANCE_DIR = RAIZ_REPO / "starseed_memory_root" / "alcance"
METODOS_DIR = ALCANCE_DIR / "metodos"
CANAL_YOUTUBE_MD = METODOS_DIR / "canal-youtube.md"
PENDIENTES_FILE = ALCANCE_DIR / "pendientes.json"
REGLAS_FILE = ALCANCE_DIR / "reglas_descarte.json"


def _leer_json(ruta: Path, defecto: Any = None) -> Any:
    try:
        with open(ruta, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return defecto


def _escribir_atomico(ruta: Path, datos: Any) -> None:
    ruta.parent.mkdir(parents=True, exist_ok=True)
    import tempfile
    fd, tmp = tempfile.mkstemp(dir=ruta.parent, prefix=".tmp_")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(datos, f, ensure_ascii=False, indent=1)
            f.write("\n")
        os.replace(tmp, ruta)
    except BaseException:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise


def _hash_id(texto: str) -> str:
    """Genera ID determinista corto (8 chars) para un alcance."""
    return hashlib.sha256(texto.encode()).hexdigest()[:8]


def _extraer_video_id(url: str) -> str | None:
    """Extrae el video ID de una URL de YouTube."""
    m = re.search(r"(?:youtube\.com/watch\?v=|youtu\.be/|youtube\.com/shorts/)([A-Za-z0-9_-]{11})", url)
    return m.group(1) if m else None


def _extraer_canal_id(url: str) -> str | None:
    """Extrae el canal ID o handle de una URL de YouTube."""
    m = re.search(r"youtube\.com/(?:c/|channel/|@|user/)([A-Za-z0-9_-]+)", url)
    return m.group(1) if m else None


def registrar_alcance(
    texto: str,
    destinatario: str,
    canal_url: str,
    origen: str = "peticiones-a1"
) -> str:
    """Registra una petición de alcance. Devuelve el hash_id."""
    METODOS_DIR.mkdir(parents=True, exist_ok=True)
    
    hash_id = _hash_id(canal_url)
    video_id = _extraer_video_id(canal_url)
    canal_id = _extraer_canal_id(canal_url)
    
    pendientes = _leer_json(PENDIENTES_FILE, [])
    
    # Verificar si ya existe
    for p in pendientes:
        if p.get("hash_id") == hash_id:
            return hash_id
    
    entrada = {
        "hash_id": hash_id,
        "texto_original": texto,
        "destinatario": destinatario,
        "canal_url": canal_url,
        "video_id": video_id,
        "canal_id": canal_id,
        "origen": origen,
        "creado": time.time(),
        "estado": "investigando",
        "informe": None,
        "ficha_contacto": None,
        "mensaje_borrador": None,
        "aprobado": False,
        "enviado": False,
    }
    
    pendientes.append(entrada)
    _escribir_atomico(PENDIENTES_FILE, pendientes)
    
    return hash_id


def obtener_pendientes() -> list[dict[str, Any]]:
    """Obtiene la lista de alcances pendientes de aprobación."""
    return _leer_json(PENDIENTES_FILE, [])


def obtener_por_id(hash_id: str) -> dict[str, Any] | None:
    """Obtiene un alcance por su hash_id."""
    pendientes = obtener_pendientes()
    for p in pendientes:
        if p.get("hash_id") == hash_id:
            return p
    return None


def actualizar_alcance(hash_id: str, **cambios: Any) -> bool:
    """Actualiza un alcance con los cambios dados. Devuelve True si existe."""
    pendientes = obtener_pendientes()
    for i, p in enumerate(pendientes):
        if p.get("hash_id") == hash_id:
            pendientes[i].update(cambios)
            _escribir_atomico(PENDIENTES_FILE, pendientes)
            return True
    return False


def aprobar_alcance(hash_id: str) -> bool:
    """Marca un alcance como aprobado."""
    return actualizar_alcance(hash_id, aprobado=True, estado="aprobado")


def rechazar_alcance(hash_id: str) -> bool:
    """Marca un alcance como rechazado."""
    return actualizar_alcance(hash_id, aprobado=False, estado="rechazado")


def marcar_enviado(hash_id: str) -> bool:
    """Marca un alcance como enviado."""
    return actualizar_alcance(hash_id, enviado=True, estado="enviado")


def _asegurar_metodo_canal_youtube() -> None:
    """Asegura que el método de investigación de canal exista (plantilla ALC-NICK-1116)."""
    if CANAL_YOUTUBE_MD.exists():
        return
    
    # Las vallas de esta plantilla llevan tres espacios delante: ninguna línea de un .py puede empezar por tres
    # comillas invertidas (scripts/enjambre/test_guiones_parsean.py), y en Markdown siguen siendo vallas.
    metodo = """# Método de investigación de un canal para alcance (ALC-NICK-1116)

Este documento define el procedimiento estándar para investigar un canal de YouTube
y preparar un mensaje de contacto para ofrecer StarSeed OS.

## 1. Fuentes a recopilar

### 1.1 Vídeo principal
- El vídeo que motivó la petición (URL proporcionada)
- Su transcripción completa (NotebookLM: `source add <url>`)

### 1.2 Otros vídeos del canal
- Los 10-15 vídeos más recientes del canal
- Vídeos con más visualizaciones
- Vídeos sobre temas afines a StarSeed (descentralización, soberanía digital, protocolos, IA local, etc.)

### 1.3 Investigación profunda (NotebookLM Deep Research)
- Búsqueda web: "canal + nombre + contacto + email + linkedin + twitter"
- Búsqueda web: "canal + nombre + biografía + proyectos"
- Búsqueda web: "StarSeed OS" + temas del canal (para encontrar resonancias)

### 1.4 Codex (análisis de código si aplica)
- Si el canal tiene repositorios GitHub: analizar README, issues, arquitectura
- Buscar patrones: protocolos abiertos, federación, p2p, local-first

### 1.5 Red de resonancia
- Buscar conexiones: invitados, colaboradores, menciones cruzadas
- Identificar nodos con alta alineación a valores StarSeed

## 2. Entregables

### 2.1 Informe de análisis (Markdown)
Estructura:
- **Resumen ejecutivo** (3-5 líneas)
- **Perfil del canal**: nombre, handle, suscriptores, temática principal, frecuencia
- **Alineación con StarSeed**: puntuación 0-100 + justificación por dimensión
  - Descentralización / soberanía digital
  - Protocolos abiertos / federación
  - Local-first / IA en el dispositivo
  - Ética / no vigilancia
  - Colaboración / commons
- **Vídeos clave**: tabla con título, fecha, visualizaciones, tema, resonancia
- **Métodos de contacto encontrados**: email, LinkedIn, Twitter/X, formulario web, GitHub
- **Puntos de entrada para StarSeed**: qué valor concreto aportaríamos

### 2.2 Ficha de contacto (JSON)
   ```json
{
  "canal": "Nombre del canal",
  "handle": "@handle",
  "url_canal": "https://youtube.com/@handle",
  "suscriptores": "123K",
  "email": "contacto@ejemplo.com",
  "linkedin": "https://linkedin.com/in/...",
  "twitter": "https://x.com/...",
  "github": "https://github.com/...",
  "formulario_web": "https://...",
  "notas_contacto": "Preferencias, horarios, idioma, etc.",
  "alineacion": 85,
  "puntos_entrada": ["protocolos", "IA local", "soberanía"]
}
   ```

### 2.3 Mensaje de contacto (borrador, pendiente de aprobación)
- Personalizado: referencia a vídeo/contenido específico
- Claro: qué es StarSeed OS en 2 líneas
- Concreto: qué ofrecemos (colaboración, integración, visibilidad)
- Llamada a acción suave: "¿Te interesa una charla de 15 min?"
- **NUNCA se envía sin aprobación explícita de Maggasukha**

## 3. Flujo de aprobación

1. Investigación completada → se genera informe, ficha y mensaje borrador
2. Todo queda **PENDIENTE DE APROBACIÓN** en `starseed_memory_root/alcance/pendientes.json`
3. Maggasukha revisa con `/alcance` y aprueba con `/approve <hash_id>`
4. Solo tras aprobación: se envía el mensaje (manual o automatizado según preferencia)
5. Se marca como `enviado` y se archiva

## 4. Regla de oro

**Nada se envía a terceros sin aprobación explícita de Maggasukha.**
El bot prepara, investiga, redacta — pero el envío lo decide la dirección.
"""
    CANAL_YOUTUBE_MD.parent.mkdir(parents=True, exist_ok=True)
    CANAL_YOUTUBE_MD.write_text(metodo, encoding="utf-8")


def investigar_canal_youtube(url_principal: str, texto_original: str) -> dict[str, Any]:
    """Ejecuta la investigación de un canal de YouTube según el método ALC-NICK-1116.
    
    Devuelve dict con: informe, ficha_contacto, mensaje_borrador.
    """
    _asegurar_metodo_canal_youtube()
    
    video_id = _extraer_video_id(url_principal)
    canal_id = _extraer_canal_id(url_principal)
    
    # Construir prompts para NotebookLM
    cuaderno_id = f"alcance-{video_id or canal_id or 'canal'}-{int(time.time())}"
    
    # 1. Añadir vídeo principal como fuente
    if video_id:
        nb_cliente(["source", "add", url_principal], 120)
    
    # 2. Investigación profunda (deep research) - consulta web
    query_investigacion = (
        f"Investiga el canal de YouTube {url_principal}. "
        f"Encuentra: nombre del canal, handle, suscriptores, temática principal, "
        f"frecuencia de publicación, métodos de contacto (email, LinkedIn, Twitter, GitHub, web), "
        f"biografía del creador, proyectos relacionados, colaboraciones. "
        f"Tema original de la petición: {texto_original[:500]}"
    )
    
    # Usar deep research de NotebookLM
    try:
        resultado_investigacion = nb_cliente(["deep-research", query_investigacion], 300)
    except Exception:
        resultado_investigacion = "Investigación profunda no disponible."
    
    # 3. Buscar otros vídeos del canal
    try:
        if canal_id:
            nb_cliente(["source", "add", f"https://youtube.com/@{canal_id}"], 120)
    except Exception:
        pass
    
    # 4. Generar informe
    prompt_informe = f"""Genera un informe de análisis del canal {url_principal} para oferta de StarSeed OS.

Estructura obligatoria:
1. Resumen ejecutivo (3-5 líneas)
2. Perfil del canal: nombre, handle, suscriptores, temática, frecuencia
3. Alineación con StarSeed (puntuación 0-100 + justificación por dimensión):
   - Descentralización / soberanía digital
   - Protocolos abiertos / federación
   - Local-first / IA en el dispositivo
   - Ética / no vigilancia
   - Colaboración / commons
4. Vídeos clave (tabla: título, fecha, visualizaciones, tema, resonancia)
5. Métodos de contacto encontrados
6. Puntos de entrada para StarSeed OS

Texto original de la petición: {texto_original[:1000]}
Resultado de investigación profunda: {resultado_investigacion[:3000]}"""
    
    try:
        informe = nb_cliente(["generate", "report", "--prompt", prompt_informe], 180)
    except Exception as e:
        informe = f"Error generando informe: {e}"
    
    # 5. Generar ficha de contacto
    prompt_ficha = f"""Genera una ficha de contacto en JSON para el canal {url_principal}.

Campos obligatorios:
- canal, handle, url_canal, suscriptores
- email, linkedin, twitter, github, formulario_web
- notas_contacto
- alineacion (0-100)
- puntos_entrada (lista)

Texto original: {texto_original[:500]}
Informe: {informe[:2000]}"""
    
    try:
        ficha_json = nb_cliente(["generate", "data-table", "--prompt", prompt_ficha], 120)
        import json as _json
        try:
            ficha_contacto = _json.loads(ficha_json)
        except _json.JSONDecodeError:
            ficha_contacto = {"error": "No se pudo parsear ficha", "raw": ficha_json}
    except Exception as e:
        ficha_contacto = {"error": str(e)}
    
    # 6. Generar mensaje borrador
    prompt_mensaje = f"""Redacta un mensaje de contacto personalizado para el creador del canal {url_principal}.

Requisitos:
- Referencia concreta a su contenido (menciona título/tema de vídeo específico)
- Qué es StarSeed OS en 2 líneas (OS social descentralizado, soberanía digital, protocolos abiertos)
- Qué ofrecemos concretamente (colaboración, integración, visibilidad en red resonante)
- Llamada a acción suave: "¿Te interesa una charla de 15 min?"
- Tono profesional, respetuoso, no comercial
- Máximo 300 palabras
- En español

NO incluir saludos genéricos ni firmas automatizadas.
Texto original de la petición: {texto_original[:500]}
Ficha de contacto: {_json.dumps(ficha_contacto, ensure_ascii=False)[:1000]}"""
    
    try:
        mensaje_borrador = nb_cliente(["generate", "report", "--prompt", prompt_mensaje], 120)
    except Exception as e:
        mensaje_borrador = f"Error generando mensaje: {e}"
    
    return {
        "informe": informe,
        "ficha_contacto": ficha_contacto,
        "mensaje_borrador": mensaje_borrador,
    }


# ── Descartar ──────────────────────────────────────────────────────────────

def _leer_reglas_descarte() -> dict[str, Any]:
    return _leer_json(REGLAS_FILE, {"reglas": []})


def _guardar_regla_descarte(tema: str, palabras_clave: list[str], cuadernos_afectados: list[str]) -> None:
    reglas = _leer_reglas_descarte()
    reglas["reglas"].append({
        "tema": tema,
        "palabras_clave": palabras_clave,
        "cuadernos_afectados": cuadernos_afectados,
        "creada": time.time(),
    })
    _escribir_atomico(REGLAS_FILE, reglas)


def _extraer_palabras_clave_descarte(texto: str) -> list[str]:
    """Extrae palabras clave del texto de descarte."""
    # Quitar "descartar", "descarta", "elimina", "quita", "borra", "limpia"
    t = re.sub(r"\b(descartar?|elimina|quita|borra|limpia)\b", "", texto, flags=re.IGNORECASE)
    # Quitar "tema", "fuente", "cuaderno", "del", "de", "la", "el", "los", "las"
    t = re.sub(r"\b(tema|fuente|cuaderno|del?|de|la|el|los|las)\b", "", t, flags=re.IGNORECASE)
    # Extraer palabras significativas (3+ chars)
    palabras = [p.strip() for p in t.split() if len(p.strip()) >= 3]
    return palabras[:10]


def _buscar_fuentes_cuaderno(cuaderno: str, palabras: list[str]) -> list[str]:
    """Busca fuentes en un cuaderno que contengan las palabras clave. Devuelve source_ids."""
    if not palabras:
        return []
    
    query = " OR ".join(f'"{p}"' for p in palabras)
    try:
        # source search en NotebookLM
        resultado = nb_cliente(["source", "search", cuaderno, "--query", query, "--format", "json"], 60)
        # Parsear resultado para obtener source_ids
        import json as _json
        try:
            data = _json.loads(resultado)
            return [s.get("id") for s in data.get("sources", []) if s.get("id")]
        except _json.JSONDecodeError:
            return []
    except Exception:
        return []


def _eliminar_fuentes_cuaderno(cuaderno: str, source_ids: list[str]) -> int:
    """Elimina fuentes de un cuaderno. Devuelve número de eliminadas."""
    eliminadas = 0
    for sid in source_ids:
        try:
            nb_cliente(["source", "delete", cuaderno, "--source-id", sid], 30)
            eliminadas += 1
        except Exception:
            pass
    return eliminadas


def _regenerar_formatos_cuaderno(cuaderno: str) -> bool:
    """Regenera los formatos afectados en un cuaderno."""
    try:
        # Lanzar regeneración de formatos estándar
        formatos = ["informe", "audio", "video", "infographic", "slide-deck", "mind-map", "quiz", "flashcards", "data-table"]
        for fmt in formatos:
            try:
                nb_cliente(["generate", fmt, "--notebook", cuaderno], 180)
            except Exception:
                pass
        return True
    except Exception:
        return False


def procesar_descarte(texto: str, cuadernos: list[str] | None = None) -> dict[str, Any]:
    """Procesa una petición de descarte: busca y elimina fuentes, guarda regla, regenera formatos.
    
    Args:
        texto: Texto completo de la petición (ej. "Descarta el tema del rallador del cuaderno de producción")
        cuadernos: Lista de IDs de cuadernos a afectar. Si None, usa síntesis y producción.
    
    Returns:
        Dict con resultados: fuentes_eliminadas, regla_guardada, formatos_regenerados
    """
    palabras = _extraer_palabras_clave_descarte(texto)
    
    if cuadernos is None:
        cuadernos = ["sintesis", "produccion"]  # Nombres lógicos, se resuelven a IDs reales
    
    total_eliminadas = 0
    cuadernos_procesados = []
    
    for cuaderno in cuadernos:
        # Resolver nombre lógico a ID real de cuaderno
        cuaderno_id = _resolver_cuaderno_id(cuaderno)
        if not cuaderno_id:
            continue
        
        source_ids = _buscar_fuentes_cuaderno(cuaderno_id, palabras)
        if source_ids:
            eliminadas = _eliminar_fuentes_cuaderno(cuaderno_id, source_ids)
            total_eliminadas += eliminadas
            cuadernos_procesados.append({"cuaderno": cuaderno, "eliminadas": eliminadas, "source_ids": source_ids})
            
            # Regenerar formatos
            _regenerar_formatos_cuaderno(cuaderno_id)
    
    # Guardar regla de descarte
    _guardar_regla_descarte(texto, palabras, cuadernos)
    
    return {
        "palabras_clave": palabras,
        "cuadernos_procesados": cuadernos_procesados,
        "total_fuentes_eliminadas": total_eliminadas,
        "regla_guardada": True,
    }


def _resolver_cuaderno_id(nombre_logico: str) -> str | None:
    """Resuelve nombre lógico a ID real de cuaderno NotebookLM."""
    # Estos IDs deberían venir de configuración o descubrimiento
    mapa = {
        "sintesis": "STARSEED_CUADERNO_SINTESIS",
        "produccion": "STARSEED_CUADERNO_PRODUCCION",
        "produccion_audiovisual": "STARSEED_CUADERNO_PRODUCCION_AUDIOVISUAL",
    }
    env_var = mapa.get(nombre_logico.lower())
    if env_var:
        return os.environ.get(env_var)
    # Fallback: intentar usar el nombre directamente
    return nombre_logico


__all__ = [
    "registrar_alcance",
    "obtener_pendientes",
    "obtener_por_id",
    "actualizar_alcance",
    "aprobar_alcance",
    "rechazar_alcance",
    "marcar_enviado",
    "investigar_canal_youtube",
    "procesar_descarte",
    "_asegurar_metodo_canal_youtube",
    "CANAL_YOUTUBE_MD",
]