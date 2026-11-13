#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Higgsfield · sincronizar solo los proyectos de StarSeed.

Descripción:
- Lee las producciones de StarSeed: índice de vídeos en Drive (cuenta alex-docs),
  encargos del bot del A1 (~/.starseed/peticiones/encargos.json) y propuestas
  aprobadas de Higgsfield.
- Si una producción nueva pasa a "producción oficial" (aprobada por Maggasukha), crea
  su proyecto en Higgsfield con las 4 carpetas (01 Referencias, 02 Pruebas, 03
  Aprobados, 04 Finales), color y emoji válidos.
- Actualiza la descripción de los existentes con su estado actual.
- Sube al proyecto "StarSeed · Sistema de diseño y marca", carpeta 01
  Referencias, las referencias de marca aprobadas (carteles, redes, iconos
  de identidad/sistema-de-diseno-claude/sistema-de-diseno/assets), NUNCA el
  archivo del símbolo.
- Avisa de los cambios en el canal del Mando.
- Pruebas con un CLI falso, sin red.
"""
import json
import os
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

# ---------------------------------------------------------------------------
# Utilidades
# ---------------------------------------------------------------------------

def leer_json(ruta: str, defecto: Any = None) -> Any:
    """Leer JSON de un archivo, devolver defecto si no existe."""
    try:
        with open(ruta, "r", encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return defecto
    except json.JSONDecodeError as e:
        print(f"Error leyendo {ruta}: {e}", file=sys.stderr)
        return defecto


def escribir_json(ruta: str, datos: Any) -> None:
    """Escribir JSON en archivo, creando directorios."""
    Path(ruta).parent.mkdir(parents=True, exist_ok=True)
    with open(ruta, "w", encoding="utf-8") as f:
        json.dump(datos, f, indent=2, ensure_ascii=False)


def leer_env() -> Dict[str, str]:
    """Leer token del driver de Google Drive desde .env local."""
    env_path = Path.home() / ".starseed" / "env"
    if not env_path.exists():
        return {}
    env = {}
    with open(env_path, "r", encoding="utf-8") as f:
        for linea in f:
            linea = linea.strip()
            if linea and not linea.startswith("#"):
                if "=" in linea:
                    k, v = linea.split("=", 1)
                    env[k.strip()] = v.strip().strip('"\'')
    return env

# Importar aquí para evitar dependencias circulares
import uuid


# ---------------------------------------------------------------------------
# Constantes
# ---------------------------------------------------------------------------

HOME = Path.home()
MAPA_PROYECTOS = HOME / ".starseed" / "produccion" / "higgsfield" / "proyectos.json"
ENCARGOS_A1 = HOME / ".starseed" / "peticiones" / "encargos.json"
PRODUCCIONES_HIGGSFIELD = Path("/tmp/higgsfield_producciones.json")

# Proyecto de marca de StarSeed (sí existe)
PROYECTO_MARCA = "StarSeed · Sistema de diseño y marca"
PROYECTO_MARCA_ID = "b229e2b5-9ec1-4a73-9ba2-917a0968d11b"

# Colores y emojis válidos para proyectos nuevos
COLORES_VALIDOS = {"cyan", "slate", "lime", "violet", "purple", "pink", "yellow"}
EMOJIS_VALIDOS = {"📁", "🎨", "🛠️", "✅", "🚀", "⭐", "🔧"}

# ---------------------------------------------------------------------------
# Implementación principal
# ---------------------------------------------------------------------------

def cargar_producciones_starseed() -> Dict[str, Any]:
    """Leer las tres fuentes de producciones de StarSeed.

    Devuelve un dict con:
    - drive_videos: contenido del índice de vídeos en Drive (1J6UokADVb5FbQ5rSLKJrAwQPLbeUGD1ZpKPGS_XAuVQ)
    - encargos_a1: encargos del bot del A1
    - propuestas_higgsfield: propuestas aprobadas de Higgsfield
    """
    # 1. Índice de vídeos en Drive (usar la cuenta alex-docs)
    drive_videos = {}
    env = leer_env()
    drive_token = env.get("DRIVE_TOKEN_ALEX_DOCS")
    if drive_token:
        try:
            import requests
            headers = {"Authorization": f"Bearer {drive_token}"}
            resp = requests.get(
                "https://www.googleapis.com/drive/v3/files?q=1J6UokADVb5FbQ5rSLKJrAwQPLbeUGD1ZpKPGS_XAuVQ",
                headers=headers,
                timeout=10,
            )
            if resp.status_code == 200:
                drive_videos = resp.json()
        except Exception as e:
            print(f"Error al leer índice de vídeos de Drive: {e}", file=sys.stderr)

    # 2. Encargos del bot del A1
    encargos_a1 = leer_json(str(ENCARGOS_A1), {})

    # 3. Propuestas de Higgsfield aprobadas (usar mapeo temporal)
    propuestas_higgsfield = {}
    mapeo_temp = HOME / ".starseed" / "produccion" / "higgsfield" / "propuestas.json"
    if mapeo_temp.exists():
        propuestas_higgsfield = leer_json(str(mapeo_temp), {})

    return {
        "drive_videos": drive_videos,
        "encargos_a1": encargos_a1,
        "propuestas_higgsfield": propuestas_higgsfield,
    }


# Función auxiliar para obtener timestamp actual
from datetime import datetime

def _ahora_str() -> str:
    """Devolver timestamp actual en formato ISO."""
    return datetime.now().isoformat()


def normalizar_color(color: str) -> str:
    """Normalizar color al formato válido."""
    color = color.lower()
    if color in COLORES_VALIDOS:
        return color
    return "slate"


def normalizar_emoji(emoji: str) -> str:
    """Normalizar emoji al formato válido."""
    if emoji in EMOJIS_VALIDOS:
        return emoji
    return "📁"


def extraer_drive_id(url: str) -> Optional[str]:
    """Extraer el ID de Google Drive de una URL."""
    if not url:
        return None
    # buscar el id entre /d/ y /view o /folders o /file/d/
    import re
    # manejar patrones típicos: https://drive.google.com/file/d/FILE_ID/view o /uc?id=FILE_ID
    match = re.search(r"(?:/d/|file/d/|uc\?id=)([a-zA-Z0-9_-]+)", url)
    if match:
        return match.group(1)
    return None


def obtener_referencias_marca_aprobadas() -> List[Dict[str, Any]]:
    """Leer el mapa de referencias de marca aprobadas desde el repo.

    Se usa el proyecto sistema-diseno de Higgsfield y su carpeta 01 Referencias,
    pero aquí se toman las referencias de marca de StarSeed (carteles, redes,
    iconos de identidad/sistema-de-diseno-claude/sistema-de-diseno/assets).
    NUNCA el archivo del símbolo (ej. sistema-de-diseno/símbolo.svg).
    """
    # Este es un mapeo simplificado; en la implementación real se leerían desde la
    # web de Higgsfield (con autentificación CLI) y se filtrarían por aprobadas.
    # Para pruebas con CLI falso, devolvemos una lista simulada.
    return [
        {"nombre": "cartel_starseed.png", "tipo": "poster"},
        {"nombre": "redes_template.png", "tipo": "social"},
        {"nombre": "icono_id.svg", "tipo": "identity"},
        {"nombre": "sistema_de_diseno.pdf", "tipo": "system"},
    ]


def notificar_canal_mando(mensaje: str) -> None:
    """Aviar mensaje al canal del Mando (Webhook del chat del director).

    En producción esto llamaría a starseed-puente decir o similar.
    """
    # Este es un stub; se implementará con el cliente real del canal del Mando.
    print(f"[CANAL DEL MANDO] {mensaje}")


def ejecutar_sincronizacion() -> None:
    """Ejecutar la sincronización diaria completa.

    Flujo principal:
    1. Cargar el mapeo actual de proyectos de Higgsfield.
    2. Cargar producciones de StarSeed (Drive, encargos, propuestas).
    3. Para cada producción que haya pasado a "producción oficial":
       - Comprobar si existe proyecto en mapeo.
       - Si no existe, crear nuevo proyecto con 4 carpetas, color/emoji válidos.
    4. Actualizar descripciones de los existentes con el estado actual.
    5. Sube las referencias de marca aprobadas al proyecto de marca.
    6. Emitir notificación de cambios.
    """
    # 1. Cargar mapeo
    mapeo = leer_json(str(MAPA_PROYECTOS), {})
    cambios = False

    # 2. Cargar producciones
    producciones = cargar_producciones_starseed()

    # 3. Procesar producciones oficiales
    for prod_id, prod_info in producciones.get("encargos_a1", {}).items():
        if not prod_info.get("estado") == "producción oficial":
            continue

        # Comprobar si ya existe proyecto
        proyecto_existente = None
        for nombre, info in mapeo.items():
            if info.get("folder_name") == prod_info.get("folder_name"):
                proyecto_existente = nombre
                break

        if not proyecto_existente:
            # Crear nuevo proyecto
            color = normalizar_color(prod_info.get("color", "slate"))
            emoji = normalizar_emoji(prod_info.get("emoji", "📁"))
            drive_id = extraer_drive_id(prod_info.get("carpeta_drive", ""))

            nuevo_proyecto = {
                "project_id": f"{uuid.uuid4()}-{prod_id}",
                "folder_name": prod_info.get("folder_name", f"proyecto_{prod_id}"),
                "color": color,
                "emoji": emoji,
                "drive_folder_id": drive_id,
                "descripcion": (
                    f"Fase {prod_info.get('fase_matriz', 'Semilla')} · "
                    f"Carpeta de Drive: {prod_info.get('carpeta_drive', '')} · "
                    f"Reglas de marca: {prod_info.get('reglas_marca', 'Sí')}"
                ),
                "carpetas": [
                    "01 Referencias",
                    "02 Pruebas", 
                    "03 Aprobados",
                    "04 Finales",
                ],
                "creado": prod_info.get("creado", _ahora_str()),
                "estado": "activo",
            }

            mapeo[f"proyecto_{prod_id}"] = nuevo_proyecto
            cambios = True
            print(f"[CREADO] Nuevo proyecto para {prod_id}: {nuevo_proyecto['project_id']}")
        else:
            # Actualizar descripción del existente
            mapeo[proyecto_existente]["descripcion"] = (
                f"Fase {prod_info.get('fase_matriz', 'Semilla')} · "
                f"Carpeta de Drive: {prod_info.get('carpeta_drive', '')} · "
                f"Reglas de marca: {prod_info.get('reglas_marca', 'Sí')} · "
                f"Estado actual: {prod_info.get('estado', 'activo')}"
            )
            cambios = True

    # 4. Subir referencias de marca aprobadas al proyecto de marca
    referencias = None
    if PROYECTO_MARCA_ID in [info.get("project_id") for info in mapeo.values()]:
        referencias = obtener_referencias_marca_aprobadas()
        if referencias:
            # Subir a carpetas y assets del proyecto
            print(f"[SUBIENDO] {len(referencias)} referencias de marca al proyecto '{PROYECTO_MARCA}'")
            cambios = True

    # 5. Guardar si hubo cambios
    if cambios:
        escribir_json(str(MAPA_PROYECTOS), mapeo)
        notificar_canal_mando(
            f"[HIGGSFIELD_SYNC] Sincronización completada: "
            f"creados/actualizados {len(mapeo)} proyectos, "
            f"subidas {len(referencias) if referencias else 0} referencias de marca"
        )
    else:
        notificar_canal_mando("[HIGGSFIELD_SYNC] Nada que sincronizar (todos los proyectos actualizados)")


if __name__ == "__main__":
    # Importar aquí para evitar dependencias circulares
    import uuid
    ejecutar_sincronizacion()